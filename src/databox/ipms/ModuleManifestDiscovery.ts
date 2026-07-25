import type { Literal, NamedNode, Quad, Term } from '@rdfjs/types';
import { DataFactory, Parser, Writer } from 'n3';
import { DC, IPMS, LDP, RDF } from '../../util/Vocabularies';
import type { SolidModuleManifest } from './SolidModuleManifest';
import { parseModuleManifestRdf, serializeModuleManifestToTurtle } from './ModuleManifestRdf';

export const DEFAULT_CMS_DISCOVERY_PATH = '/.well-known/databox-ipms';

const MODULE_PATH_SEGMENT = 'modules';

/**
 * Options shared by the public IPMS module-manifest discovery helpers.
 */
export interface ModuleManifestDiscoveryOptions {
  /** The server origin used to make `.well-known` and module resources absolute. */
  readonly baseUrl: string;
  /** The public discovery index path. Defaults to `/.well-known/databox-ipms`. */
  readonly discoveryPath?: string;
}

export interface ParsedModuleManifestIndex {
  /** The RDF subject of the discovered index resource. */
  readonly indexIri: string;
  /** Absolute URLs of per-module Turtle manifest resources. */
  readonly manifestUrls: readonly string[];
}

/**
 * A fetched per-module manifest resource keyed by the URL found in the discovery index.
 */
export interface ModuleManifestResource {
  readonly url: string;
  readonly turtle: string;
}

/**
 * Return the public `.well-known` index URL for a deployment.
 */
export function moduleManifestIndexUrl(options: ModuleManifestDiscoveryOptions): string {
  return absoluteDiscoveryUrl(options.baseUrl, normalizeDiscoveryPath(options.discoveryPath));
}

/**
 * Return the public per-module Turtle manifest URL for an installed module id.
 */
export function moduleManifestResourceUrl(id: string, options: ModuleManifestDiscoveryOptions): string {
  return absoluteDiscoveryUrl(options.baseUrl, moduleManifestResourcePath(id, options.discoveryPath));
}

/**
 * Return the public per-module Turtle manifest path for an installed module id.
 */
export function moduleManifestResourcePath(id: string, discoveryPath?: string): string {
  const safeId = validateModuleId(id);
  return `${normalizeDiscoveryPath(discoveryPath)}/${MODULE_PATH_SEGMENT}/${encodeURIComponent(safeId)}.ttl`;
}

/**
 * Serialize installed IPMS module manifests as a minimal standard-Solid discovery resource.
 *
 * The index is an ordinary LDP BasicContainer with `ldp:contains` links to Turtle resources. Those contained
 * resources are the actual manifest RDF, so a vanilla Solid client can discover the index, dereference each
 * member, and parse module manifests without calling the CSS-enhanced control plane.
 */
export async function serializeModuleManifestIndexToTurtle(
  manifests: readonly SolidModuleManifest[],
  options: ModuleManifestDiscoveryOptions,
): Promise<string> {
  const index = namedNode(moduleManifestIndexUrl(options));
  const moduleUrls = manifests.map((manifest): string => moduleManifestResourceUrl(manifest.id, options));
  const quads: Quad[] = [
    rdfQuad(index, RDF.terms.type, LDP.terms.BasicContainer),
    rdfQuad(index, RDF.terms.type, LDP.terms.Container),
    rdfQuad(index, RDF.terms.type, LDP.terms.Resource),
    rdfQuad(index, DC.terms.title, literal('Databox IPMS module manifests')),
    rdfQuad(
      index,
      DC.terms.description,
      literal('Installed IPMS module manifests published as ordinary Solid RDF resources.'),
    ),
  ];

  for (const url of moduleUrls) {
    quads.push(rdfQuad(index, LDP.terms.contains, namedNode(url)));
  }

  return serializeTurtle(quads);
}

/**
 * Serialize one installed module's public Turtle manifest resource.
 */
export async function serializeDiscoveredModuleManifestToTurtle(
  manifest: SolidModuleManifest,
  options: ModuleManifestDiscoveryOptions,
): Promise<string> {
  return serializeModuleManifestToTurtle(manifest, {
    subjectIri: moduleManifestResourceUrl(manifest.id, options),
  });
}

/**
 * Parse the public `.well-known` index and return the contained manifest resource URLs.
 */
export function parseModuleManifestIndexRdf(turtle: string, baseIri?: string): ParsedModuleManifestIndex {
  const quads = parseTurtle(turtle, baseIri, 'IPMS module manifest discovery index');
  const index = findIndexSubject(quads);
  const manifestUrls = objects(quads, index, LDP.terms.contains).map((term): string => {
    if (term.termType !== 'NamedNode') {
      throw new Error('IPMS module manifest discovery index members must be IRIs.');
    }
    return term.value;
  });
  return {
    indexIri: index.value,
    manifestUrls: uniqueStrings(manifestUrls),
  };
}

/**
 * Parse an index and its fetched per-module Turtle resources back into installed module manifests.
 */
export function parseDiscoveredModuleManifests(
  indexTurtle: string,
  resources: readonly ModuleManifestResource[],
  baseIri?: string,
): SolidModuleManifest[] {
  const index = parseModuleManifestIndexRdf(indexTurtle, baseIri);
  const byUrl = new Map(resources.map((resource): [string, string] => [ resource.url, resource.turtle ]));
  return index.manifestUrls.map((url): SolidModuleManifest => {
    const turtle = byUrl.get(url);
    if (turtle === undefined) {
      throw new Error(`IPMS module manifest resource ${url} is missing.`);
    }
    return parseModuleManifestRdf(turtle, { subjectIri: url, baseIri: url });
  });
}

/**
 * Decode a public per-module manifest path, returning `undefined` for non-manifest discovery paths.
 */
export function parseModuleManifestResourcePath(path: string, discoveryPath?: string): string | undefined {
  const prefix = `${normalizeDiscoveryPath(discoveryPath)}/${MODULE_PATH_SEGMENT}/`;
  if (!path.startsWith(prefix) || !path.endsWith('.ttl')) {
    return;
  }
  const encoded = path.slice(prefix.length, -'.ttl'.length);
  if (encoded.length === 0 || encoded.includes('/')) {
    return;
  }
  try {
    return validateModuleId(decodeURIComponent(encoded));
  } catch {}
}

export function isModuleManifestIndexPath(path: string, discoveryPath?: string): boolean {
  return path === normalizeDiscoveryPath(discoveryPath);
}

export function isModuleManifestDiscoveryPath(path: string, discoveryPath?: string): boolean {
  const indexPath = normalizeDiscoveryPath(discoveryPath);
  return path === indexPath || path.startsWith(`${indexPath}/`);
}

function normalizeDiscoveryPath(value = DEFAULT_CMS_DISCOVERY_PATH): string {
  const withSlash = value.startsWith('/') ? value : `/${value}`;
  return withSlash.endsWith('/') ? withSlash.slice(0, -1) : withSlash;
}

function absoluteDiscoveryUrl(baseUrl: string, path: string): string {
  return new URL(path, baseUrl).href;
}

function validateModuleId(value: string): string {
  if (!/^[\w.:-]+$/u.test(value)) {
    throw new Error('IPMS module manifest id must be a safe module id.');
  }
  return value;
}

function parseTurtle(turtle: string, baseIri: string | undefined, label: string): Quad[] {
  try {
    return new Parser({ baseIRI: baseIri }).parse(turtle);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} RDF could not be parsed: ${message}`);
  }
}

function findIndexSubject(quads: readonly Quad[]): NamedNode {
  const subjects = quads
    .filter((candidate): boolean => termEquals(candidate.predicate, RDF.terms.type) &&
      (termEquals(candidate.object, LDP.terms.BasicContainer) || termEquals(candidate.object, LDP.terms.Container)))
    .map((candidate): Term => candidate.subject);
  const unique = uniqueTerms(subjects);
  if (unique.length === 0) {
    throw new Error('IPMS module manifest discovery index must declare an LDP container subject.');
  }
  if (unique.length > 1) {
    throw new Error('IPMS module manifest discovery index must contain exactly one LDP container subject.');
  }
  if (unique[0].termType !== 'NamedNode') {
    throw new Error('IPMS module manifest discovery index subject must be a named node.');
  }
  return unique[0];
}

function blankNodeTerms(term: Term): string {
  return `${term.termType}:${term.value}`;
}

function uniqueTerms(terms: Term[]): Term[] {
  const seen = new Set<string>();
  return terms.filter((term): boolean => {
    const key = blankNodeTerms(term);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function uniqueStrings(values: readonly string[]): string[] {
  return [ ...new Set(values) ];
}

function objects(quads: readonly Quad[], subject: Term, predicate: NamedNode): Term[] {
  return quads
    .filter((candidate): boolean =>
      termEquals(candidate.subject, subject) && termEquals(candidate.predicate, predicate))
    .map((candidate): Term => candidate.object);
}

function termEquals(left: Term, right: Term): boolean {
  return left.termType === right.termType && left.value === right.value;
}

function literal(value: string): Literal {
  return DataFactory.literal(value);
}

function namedNode(value: string): NamedNode {
  return DataFactory.namedNode(value);
}

function rdfQuad(subject: Quad['subject'], predicate: Quad['predicate'], object: Quad['object']): Quad {
  return DataFactory.quad(subject, predicate, object);
}

async function serializeTurtle(quads: Quad[]): Promise<string> {
  const writer = new Writer({
    prefixes: {
      ipms: namedNode(IPMS.namespace),
      dcterms: namedNode(DC.namespace),
      ldp: namedNode(LDP.namespace),
      rdf: namedNode(RDF.namespace),
    },
  });
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
