/* eslint-disable max-len */
import type { Quad } from '@rdfjs/types';
import { DataFactory, Parser, Writer } from 'n3';
import { BasicRepresentation } from '../../http/representation/BasicRepresentation';
import type { ResourceIdentifier } from '../../http/representation/ResourceIdentifier';
import type { ResourceStore } from '../../storage/ResourceStore';
import { ensureTrailingSlash } from '../../util/PathUtil';
import { readableToString } from '../../util/StreamUtil';
import { IPMS } from '../../util/Vocabularies';

const TURTLE = 'text/turtle';

/**
 * Persists a IPMS module's state (its enabled flag and config graph) as an ordinary Solid resource
 * (see `databox/solid-ipms-plan.md`, §5.1 / §1.6). Module state lives in the pod as RDF — so it is
 * declarative, WAC-governed, backed up *with* the pod, and portable — rather than in a side store.
 * All reads and writes go through a CSS {@link ResourceStore}, keeping module state on the normal
 * Solid data path.
 */
export class ModuleConfigStore {
  private readonly container: string;

  public constructor(
    private readonly store: ResourceStore,
    baseUrl: string,
  ) {
    this.container = `${ensureTrailingSlash(new URL(baseUrl).href)}.databox/ipms/modules/`;
  }

  /** Write a module's state graph (Turtle) as its Solid resource. */
  public async save(id: string, turtle: string): Promise<void> {
    await this.store.setRepresentation(this.identifier(id), new BasicRepresentation([ Buffer.from(turtle, 'utf-8') ], TURTLE));
  }

  /** Read a module's state graph as Turtle, or `undefined` if it has none yet. */
  public async load(id: string): Promise<string | undefined> {
    const identifier = this.identifier(id);
    if (!await this.store.hasResource(identifier)) {
      return undefined;
    }
    const representation = await this.store.getRepresentation(identifier, { type: { [TURTLE]: 1 }});
    return readableToString(representation.data);
  }

  /** Set the enabled flag, persisting it as the module's state graph. */
  public async setEnabled(id: string, enabled: boolean): Promise<void> {
    const identifier = this.identifier(id);
    await this.store.setRepresentation(
      identifier,
      new BasicRepresentation([ Buffer.from(await setModuleEnabledFlag(identifier.path, await this.load(id) ?? '', enabled), 'utf-8') ], TURTLE),
    );
  }

  /** Whether the module is enabled (defaults to `false` when no state, or no flag, is stored). */
  public async isEnabled(id: string): Promise<boolean> {
    const turtle = await this.load(id);
    if (turtle === undefined) {
      return false;
    }
    return new Parser({ baseIRI: this.container }).parse(turtle)
      .some((quad): boolean => quad.predicate.value === IPMS.enabled && quad.object.value === 'true');
  }

  private identifier(id: string): ResourceIdentifier {
    assertSafeModuleId(id);
    return { path: `${this.container}${encodeURIComponent(id)}` };
  }
}

/**
 * Returns a module-state graph with exactly one ipms:enabled triple while preserving other config triples.
 */
export async function setModuleEnabledFlag(baseIRI: string, turtle: string, enabled: boolean): Promise<string> {
  const parser = new Parser({ baseIRI });
  const quads = parser.parse(turtle)
    .filter((quad): boolean => quad.predicate.value !== IPMS.enabled);
  quads.push(DataFactory.quad(
    DataFactory.namedNode(baseIRI),
    DataFactory.namedNode(IPMS.enabled),
    DataFactory.literal(enabled ? 'true' : 'false'),
  ));
  return serializeTurtle(quads);
}

function assertSafeModuleId(id: string): void {
  if (!/^[\w.:-]+$/u.test(id)) {
    throw new TypeError(`Unsafe IPMS module id ${id}.`);
  }
}

async function serializeTurtle(quads: Quad[]): Promise<string> {
  const writer = new Writer();
  writer.addQuads(quads);
  return new Promise((resolve, reject): void => {
    writer.end((error, result): void => {
      if (error) {
        reject(error);
      } else {
        resolve(typeof result === 'string' ? result : '');
      }
    });
  });
}
