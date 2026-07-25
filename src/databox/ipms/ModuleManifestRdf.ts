import type { BlankNode, Literal, NamedNode, Quad, Term } from '@rdfjs/types';
import { DataFactory, Parser, Writer } from 'n3';
import { DC, IPMS, RDF } from '../../util/Vocabularies';
import type { SolidModuleAdminUi, SolidModuleManifest } from './SolidModuleManifest';

const SCHEMA = 'https://schema.org/';
const RDF_FIRST = namedNode(`${RDF.namespace}first`);
const RDF_REST = namedNode(`${RDF.namespace}rest`);
const RDF_NIL = namedNode(`${RDF.namespace}nil`);

const TERMS = {
  module: IPMS.terms.Module,
  identifier: namedNode(`${SCHEMA}identifier`),
  softwareVersion: namedNode(`${SCHEMA}softwareVersion`),
  capabilityList: namedNode(`${IPMS.namespace}capabilityList`),
  routeList: namedNode(`${IPMS.namespace}routeList`),
  configShape: namedNode(`${IPMS.namespace}configShape`),
  adminUi: namedNode(`${IPMS.namespace}adminUi`),
  adminNavLabel: namedNode(`${IPMS.namespace}adminNavLabel`),
  adminPath: namedNode(`${IPMS.namespace}adminPath`),
};

export interface ModuleManifestRdfOptions {
  /**
   * The RDF subject to use for the manifest. Discovery mechanisms such as a Type Index or `.well-known`
   * resource can point at this content later; the content itself remains ordinary RDF.
   */
  readonly subjectIri?: string;
  /** Base IRI used when parsing relative terms in discovered Turtle. */
  readonly baseIri?: string;
}

/**
 * Serialize a declarative IPMS module manifest as portable Turtle.
 *
 * The representation uses standard RDF/Dublin Core/schema.org terms where they fit, plus `ipms:` terms for
 * Databox-specific module contract fields. Capability and route arrays are RDF lists so empty arrays and
 * ordering survive a round trip.
 */
export async function serializeModuleManifestToTurtle(
  manifest: SolidModuleManifest,
  options: ModuleManifestRdfOptions = {},
): Promise<string> {
  const checked = validateManifest(manifest);
  const subject = namedNode(options.subjectIri ?? defaultManifestSubject(checked.id));
  const quads: Quad[] = [
    rdfQuad(subject, RDF.terms.type, TERMS.module),
    rdfQuad(subject, TERMS.identifier, literal(checked.id)),
    rdfQuad(subject, DC.terms.title, literal(checked.name)),
    rdfQuad(subject, TERMS.softwareVersion, literal(checked.version)),
    rdfQuad(subject, DC.terms.description, literal(checked.description)),
  ];

  addStringList(quads, subject, TERMS.capabilityList, checked.capabilities);
  addStringList(quads, subject, TERMS.routeList, checked.routes);

  if (checked.configShape) {
    quads.push(rdfQuad(subject, TERMS.configShape, namedNode(checked.configShape)));
  }
  if (checked.adminUi) {
    const adminUi = blankNode();
    quads.push(
      rdfQuad(subject, TERMS.adminUi, adminUi),
      rdfQuad(adminUi, TERMS.adminNavLabel, literal(checked.adminUi.navLabel)),
      rdfQuad(adminUi, TERMS.adminPath, literal(checked.adminUi.path)),
    );
  }

  return serializeTurtle(quads);
}

/**
 * Parse a portable RDF module manifest back into the in-process manifest contract.
 */
export function parseModuleManifestRdf(turtle: string, options: ModuleManifestRdfOptions = {}): SolidModuleManifest {
  let quads: Quad[];
  try {
    quads = new Parser({ baseIRI: options.baseIri }).parse(turtle);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`IPMS module manifest RDF could not be parsed: ${message}`);
  }

  const subject = options.subjectIri ? namedNode(options.subjectIri) : findManifestSubject(quads);
  if (!hasQuad(quads, subject, RDF.terms.type, TERMS.module)) {
    throw new Error(`IPMS module manifest ${subject.value} must declare rdf:type ipms:Module.`);
  }

  const adminUi = parseAdminUi(quads, subject);
  const manifest: SolidModuleManifest = {
    id: requiredLiteral(quads, subject, TERMS.identifier, 'id'),
    name: requiredLiteral(quads, subject, DC.terms.title, 'name'),
    version: requiredLiteral(quads, subject, TERMS.softwareVersion, 'version'),
    description: requiredLiteral(quads, subject, DC.terms.description, 'description'),
    capabilities: requiredStringList(quads, subject, TERMS.capabilityList, 'capabilities'),
    routes: requiredStringList(quads, subject, TERMS.routeList, 'routes'),
    ...optionalIri(quads, subject, TERMS.configShape, 'configShape'),
  };
  return validateManifest(adminUi === undefined ? manifest : { ...manifest, adminUi });
}

function blankNode(): BlankNode {
  return DataFactory.blankNode();
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

function defaultManifestSubject(id: string): string {
  return `urn:solid-server:databox:ipms:module:${encodeURIComponent(id)}`;
}

function validateManifest(manifest: SolidModuleManifest): SolidModuleManifest {
  let checked: SolidModuleManifest = {
    id: requireModuleId(manifest.id, 'IPMS module manifest id'),
    name: requireString(manifest.name, 'IPMS module manifest name'),
    version: requireString(manifest.version, 'IPMS module manifest version'),
    description: requireString(manifest.description, 'IPMS module manifest description'),
    capabilities: requireStringArray(manifest.capabilities, 'IPMS module manifest capabilities'),
    routes: requireStringArray(manifest.routes, 'IPMS module manifest routes'),
  };
  if (manifest.configShape !== undefined) {
    checked = {
      ...checked,
      configShape: requireAbsoluteIri(manifest.configShape, 'IPMS module manifest configShape'),
    };
  }
  if (manifest.adminUi !== undefined) {
    checked = {
      ...checked,
      adminUi: validateAdminUi(manifest.adminUi),
    };
  }
  return checked;
}

function validateAdminUi(adminUi: SolidModuleAdminUi): SolidModuleAdminUi {
  return {
    navLabel: requireString(adminUi.navLabel, 'IPMS module manifest adminUi navLabel'),
    path: requireString(adminUi.path, 'IPMS module manifest adminUi path'),
  };
}

function addStringList(
  quads: Quad[],
  subject: NamedNode,
  predicate: NamedNode,
  values: readonly string[],
): void {
  if (values.length === 0) {
    quads.push(rdfQuad(subject, predicate, RDF_NIL));
    return;
  }

  const head = blankNode();
  quads.push(rdfQuad(subject, predicate, head));

  let current: BlankNode = head;
  for (const [ index, value ] of values.entries()) {
    quads.push(rdfQuad(current, RDF_FIRST, literal(value)));
    if (index === values.length - 1) {
      quads.push(rdfQuad(current, RDF_REST, RDF_NIL));
    } else {
      const next = blankNode();
      quads.push(rdfQuad(current, RDF_REST, next));
      current = next;
    }
  }
}

function findManifestSubject(quads: readonly Quad[]): NamedNode {
  const subjects = quads
    .filter((candidate): boolean => termEquals(candidate.predicate, RDF.terms.type) &&
      termEquals(candidate.object, TERMS.module))
    .map((candidate): Term => candidate.subject);
  const unique = uniqueTerms(subjects);
  if (unique.length === 0) {
    throw new Error('IPMS module manifest RDF must contain one rdf:type ipms:Module subject.');
  }
  if (unique.length > 1) {
    throw new Error('IPMS module manifest RDF must contain exactly one rdf:type ipms:Module subject.');
  }
  if (unique[0].termType !== 'NamedNode') {
    throw new Error('IPMS module manifest subject must be a named node.');
  }
  return unique[0];
}

function parseAdminUi(quads: readonly Quad[], subject: NamedNode): SolidModuleAdminUi | undefined {
  const adminNodes = objects(quads, subject, TERMS.adminUi);
  if (adminNodes.length === 0) {
    return undefined;
  }
  if (adminNodes.length > 1) {
    throw new Error('IPMS module manifest adminUi must have exactly one value.');
  }
  const node = adminNodes[0];
  return validateAdminUi({
    navLabel: requiredLiteral(quads, node, TERMS.adminNavLabel, 'adminUi navLabel'),
    path: requiredLiteral(quads, node, TERMS.adminPath, 'adminUi path'),
  });
}

function requiredLiteral(quads: readonly Quad[], subject: Term, predicate: NamedNode, field: string): string {
  const values = objects(quads, subject, predicate);
  if (values.length === 0) {
    throw new Error(`IPMS module manifest ${field} is required.`);
  }
  if (values.length > 1) {
    throw new Error(`IPMS module manifest ${field} must have exactly one value.`);
  }
  if (values[0].termType !== 'Literal') {
    throw new Error(`IPMS module manifest ${field} must be a literal.`);
  }
  return values[0].value;
}

function requiredStringList(quads: readonly Quad[], subject: NamedNode, predicate: NamedNode, field: string): string[] {
  const values = objects(quads, subject, predicate);
  if (values.length === 0) {
    throw new Error(`IPMS module manifest ${field} list is required.`);
  }
  if (values.length > 1) {
    throw new Error(`IPMS module manifest ${field} list must have exactly one value.`);
  }
  return parseStringList(quads, values[0], field);
}

function parseStringList(quads: readonly Quad[], head: Term, field: string): string[] {
  const values: string[] = [];
  const seen = new Set<string>();
  let current = head;

  while (!termEquals(current, RDF_NIL)) {
    const key = termKey(current);
    if (seen.has(key)) {
      throw new Error(`IPMS module manifest ${field} list must not contain a cycle.`);
    }
    seen.add(key);

    const first = objects(quads, current, RDF_FIRST);
    const rest = objects(quads, current, RDF_REST);
    if (first.length !== 1 || rest.length !== 1) {
      throw new Error(`IPMS module manifest ${field} list must be a well-formed RDF list.`);
    }
    if (first[0].termType !== 'Literal') {
      throw new Error(`IPMS module manifest ${field} list entries must be literals.`);
    }
    values.push(requireString(first[0].value, `IPMS module manifest ${field} list entry`));
    current = rest[0];
  }

  return values;
}

function optionalIri(
  quads: readonly Quad[],
  subject: NamedNode,
  predicate: NamedNode,
  field: 'configShape',
): Pick<SolidModuleManifest, 'configShape'> {
  const values = objects(quads, subject, predicate);
  if (values.length === 0) {
    return {};
  }
  if (values.length > 1) {
    throw new Error(`IPMS module manifest ${field} must have exactly one value.`);
  }
  if (values[0].termType !== 'NamedNode') {
    throw new Error(`IPMS module manifest ${field} must be an IRI.`);
  }
  return { [field]: requireAbsoluteIri(values[0].value, `IPMS module manifest ${field}`) };
}

function hasQuad(quads: readonly Quad[], subject: Term, predicate: NamedNode, object: Term): boolean {
  return quads.some((candidate): boolean => termEquals(candidate.subject, subject) &&
    termEquals(candidate.predicate, predicate) &&
    termEquals(candidate.object, object));
}

function objects(quads: readonly Quad[], subject: Term, predicate: NamedNode): Term[] {
  return quads
    .filter((candidate): boolean =>
      termEquals(candidate.subject, subject) && termEquals(candidate.predicate, predicate))
    .map((candidate): Term => candidate.object);
}

function uniqueTerms(terms: Term[]): Term[] {
  const seen = new Set<string>();
  return terms.filter((term): boolean => {
    const key = termKey(term);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function termEquals(left: Term, right: Term): boolean {
  return left.termType === right.termType && left.value === right.value;
}

function termKey(term: Term): string {
  return `${term.termType}:${term.value}`;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${field} must be a non-empty string.`);
  }
  return value;
}

function requireModuleId(value: unknown, field: string): string {
  const id = requireString(value, field);
  if (!/^[\w.:-]+$/u.test(id)) {
    throw new Error(`${field} must be a safe module id.`);
  }
  return id;
}

function requireStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${field} must be an array.`);
  }
  return value.map((entry, index): string => requireString(entry, `${field}[${index}]`));
}

function requireAbsoluteIri(value: unknown, field: string): string {
  const iri = requireString(value, field);
  if (!URL.canParse(iri)) {
    throw new Error(`${field} must be an absolute IRI.`);
  }
  return iri;
}

async function serializeTurtle(quads: Quad[]): Promise<string> {
  const writer = new Writer({
    prefixes: {
      ipms: namedNode(IPMS.namespace),
      dcterms: namedNode(DC.namespace),
      rdf: namedNode(RDF.namespace),
      schema: namedNode(SCHEMA),
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
