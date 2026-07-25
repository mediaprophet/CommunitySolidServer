import type { BlankNode, Literal, NamedNode, Quad, Term } from '@rdfjs/types';
import { DataFactory, Parser, Writer } from 'n3';
import { DC, IPMS, RDF } from '../../../../util/Vocabularies';

const SCHEMA = 'https://schema.org/';
const RR = 'http://www.w3.org/ns/r2rml#';
const RML = 'http://semweb.mmlab.be/ns/rml#';
const XSD = 'http://www.w3.org/2001/XMLSchema#';
const RDF_FIRST = namedNode(`${RDF.namespace}first`);
const RDF_REST = namedNode(`${RDF.namespace}rest`);
const RDF_NIL = namedNode(`${RDF.namespace}nil`);
const RDF_VALUE = namedNode(`${RDF.namespace}value`);

const TERMS = {
  connectorManifest: namedNode(`${IPMS.namespace}ConnectorManifest`),
  connectorJob: namedNode(`${IPMS.namespace}ConnectorJob`),
  identifier: namedNode(`${SCHEMA}identifier`),
  softwareVersion: namedNode(`${SCHEMA}softwareVersion`),
  source: namedNode(`${IPMS.namespace}source`),
  sourceKind: namedNode(`${IPMS.namespace}sourceKind`),
  sourceRef: namedNode(`${IPMS.namespace}sourceRef`),
  modeList: namedNode(`${IPMS.namespace}connectorModeList`),
  mapping: namedNode(`${IPMS.namespace}mapping`),
  mappingLanguage: namedNode(`${IPMS.namespace}mappingLanguage`),
  contentType: namedNode(`${IPMS.namespace}contentType`),
  target: namedNode(`${IPMS.namespace}target`),
  targetPod: namedNode(`${IPMS.namespace}targetPod`),
  targetContainer: namedNode(`${IPMS.namespace}targetContainer`),
  targetGraph: namedNode(`${IPMS.namespace}targetGraph`),
  connectorId: namedNode(`${IPMS.namespace}connectorId`),
  jobMode: namedNode(`${IPMS.namespace}jobMode`),
  createdAt: namedNode(`${IPMS.namespace}createdAt`),
  conflictPolicy: namedNode(`${IPMS.namespace}conflictPolicy`),
  cursorResource: namedNode(`${IPMS.namespace}cursorResource`),
  dryRun: namedNode(`${IPMS.namespace}dryRun`),
};

const CONNECTOR_MODES = [
  'import-snapshot',
  'source-to-pod-sync',
  'virtual-federated-query',
] as const;
const SOURCE_KINDS = [ 'odbc', 'ldap' ] as const;
const MAPPING_LANGUAGES = [ 'r2rml', 'rml' ] as const;
const CONFLICT_POLICIES = [ 'source-wins', 'append-only', 'reject-on-conflict' ] as const;
const SECRET_KEY_PATTERN = /password|passwd|pwd|secret|token|credential|connectionstring|dsn|binddn/iu;
const SECRET_VALUE_PATTERN = /password\s*=|passwd\s*=|pwd\s*=|secret\s*=|token\s*=/iu;

export type ConnectorMode = typeof CONNECTOR_MODES[number];
export type ConnectorSourceKind = typeof SOURCE_KINDS[number];
export type ConnectorMappingLanguage = typeof MAPPING_LANGUAGES[number];
export type ConnectorConflictPolicy = typeof CONFLICT_POLICIES[number];

export interface PortableConnectorMapping {
  readonly language: ConnectorMappingLanguage;
  readonly contentType: 'text/turtle';
  readonly turtle: string;
  readonly rootIri?: string;
}

export interface PortableConnectorSource {
  readonly kind: ConnectorSourceKind;
  /**
   * Stable, non-secret source descriptor IRI. Runtime connection material belongs in a local sidecar descriptor.
   */
  readonly sourceRef: string;
  readonly label?: string;
}

export interface PortableConnectorTarget {
  readonly podBaseIri: string;
  readonly resourceContainer?: string;
  readonly graphIri?: string;
}

/**
 * Portable enterprise connector manifest. It names the source shape, supported modes, target pod, and RDF
 * mapping work. It deliberately does not carry ODBC DSNs, LDAP bind credentials, binaries, container images,
 * host paths, or hardware constraints.
 */
export interface PortableConnectorManifest {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly source: PortableConnectorSource;
  readonly modes: readonly ConnectorMode[];
  readonly mapping: PortableConnectorMapping;
  readonly target: PortableConnectorTarget;
  readonly capabilities?: readonly string[];
}

export interface PortableConnectorJob {
  readonly id: string;
  readonly connectorId: string;
  readonly mode: ConnectorMode;
  readonly createdAt: string;
  readonly conflictPolicy?: ConnectorConflictPolicy;
  readonly cursorResource?: string;
  readonly dryRun?: boolean;
}

export interface ConnectorRuntimeDescriptor {
  readonly connectorId: string;
  readonly engineId: string;
  readonly implementation: 'rust-sidecar' | 'native-binary' | 'container' | 'managed-adapter';
  readonly version?: string;
  readonly secretRefs: readonly string[];
  readonly runtimeHints?: Record<string, string>;
}

export interface ConnectorRuntimeWorkDescriptor {
  readonly kind: 'connector-runtime-descriptor';
  readonly connectorId: string;
  readonly portability: 'non-portable';
  readonly engineId: string;
  readonly implementation: ConnectorRuntimeDescriptor['implementation'];
  readonly secretRefCount: number;
  readonly runtimeHintKeys: readonly string[];
}

export interface ConnectorManifestRdfOptions {
  readonly subjectIri?: string;
  readonly baseIri?: string;
}

export interface ConnectorJobRdfOptions {
  readonly subjectIri?: string;
  readonly baseIri?: string;
}

export function validatePortableConnectorManifest(manifest: PortableConnectorManifest): PortableConnectorManifest {
  assertNoPortableSecrets(manifest, 'connector manifest');
  const checked: PortableConnectorManifest = {
    id: requireSafeId(manifest.id, 'connector manifest id'),
    name: requireString(manifest.name, 'connector manifest name'),
    version: requireString(manifest.version, 'connector manifest version'),
    description: requireString(manifest.description, 'connector manifest description'),
    source: validateSource(manifest.source),
    modes: validateModes(manifest.modes, 'connector manifest modes'),
    mapping: validateMapping(manifest.mapping),
    target: validateTarget(manifest.target),
  };
  if (manifest.capabilities === undefined) {
    return checked;
  }
  return {
    ...checked,
    capabilities: requireStringArray(manifest.capabilities, 'connector manifest capabilities'),
  };
}

export function validatePortableConnectorJob(
  job: PortableConnectorJob,
  manifest?: PortableConnectorManifest,
): PortableConnectorJob {
  assertNoPortableSecrets(job, 'connector job');
  const checked: PortableConnectorJob = {
    id: requireSafeId(job.id, 'connector job id'),
    connectorId: requireSafeId(job.connectorId, 'connector job connectorId'),
    mode: requireOneOf(job.mode, CONNECTOR_MODES, 'connector job mode'),
    createdAt: requireTimestamp(job.createdAt, 'connector job createdAt'),
  };
  if (manifest) {
    const connector = validatePortableConnectorManifest(manifest);
    if (checked.connectorId !== connector.id) {
      throw new Error(`Connector job ${checked.id} references ${checked.connectorId}, not ${connector.id}.`);
    }
    if (!connector.modes.includes(checked.mode)) {
      throw new Error(`Connector job ${checked.id} uses unsupported mode ${checked.mode}.`);
    }
  }
  return {
    ...checked,
    ...job.conflictPolicy === undefined ?
        {} :
        {
          conflictPolicy: requireOneOf(job.conflictPolicy, CONFLICT_POLICIES, 'connector job conflictPolicy'),
        },
    ...job.cursorResource === undefined ?
        {} :
        { cursorResource: requireAbsoluteIri(job.cursorResource, 'connector job cursorResource') },
    ...job.dryRun === undefined ? {} : { dryRun: requireBoolean(job.dryRun, 'connector job dryRun') },
  };
}

export function validateConnectorRuntimeDescriptor(
  descriptor: ConnectorRuntimeDescriptor,
): ConnectorRuntimeDescriptor {
  return {
    connectorId: requireSafeId(descriptor.connectorId, 'connector runtime connectorId'),
    engineId: requireSafeId(descriptor.engineId, 'connector runtime engineId'),
    implementation: requireOneOf(
      descriptor.implementation,
      [ 'rust-sidecar', 'native-binary', 'container', 'managed-adapter' ] as const,
      'connector runtime implementation',
    ),
    secretRefs: requireStringArray(descriptor.secretRefs, 'connector runtime secretRefs'),
    ...descriptor.version === undefined ?
        {} :
        { version: requireString(descriptor.version, 'connector runtime version') },
    ...descriptor.runtimeHints === undefined ?
        {} :
        { runtimeHints: validateRuntimeHints(descriptor.runtimeHints) },
  };
}

export function toConnectorRuntimeWorkDescriptor(
  descriptor: ConnectorRuntimeDescriptor,
): ConnectorRuntimeWorkDescriptor {
  const checked = validateConnectorRuntimeDescriptor(descriptor);
  return {
    kind: 'connector-runtime-descriptor',
    connectorId: checked.connectorId,
    portability: 'non-portable',
    engineId: checked.engineId,
    implementation: checked.implementation,
    secretRefCount: checked.secretRefs.length,
    runtimeHintKeys: Object.keys(checked.runtimeHints ?? {}).sort(),
  };
}

export async function serializeConnectorManifestToTurtle(
  manifest: PortableConnectorManifest,
  options: ConnectorManifestRdfOptions = {},
): Promise<string> {
  const checked = validatePortableConnectorManifest(manifest);
  const subject = namedNode(options.subjectIri ?? defaultManifestSubject(checked.id));
  const source = blankNode();
  const mapping = blankNode();
  const target = blankNode();
  const quads: Quad[] = [
    rdfQuad(subject, RDF.terms.type, TERMS.connectorManifest),
    rdfQuad(subject, TERMS.identifier, literal(checked.id)),
    rdfQuad(subject, DC.terms.title, literal(checked.name)),
    rdfQuad(subject, TERMS.softwareVersion, literal(checked.version)),
    rdfQuad(subject, DC.terms.description, literal(checked.description)),
    rdfQuad(subject, TERMS.source, source),
    rdfQuad(source, TERMS.sourceKind, literal(checked.source.kind)),
    rdfQuad(source, TERMS.sourceRef, namedNode(checked.source.sourceRef)),
    rdfQuad(subject, TERMS.mapping, mapping),
    rdfQuad(mapping, TERMS.mappingLanguage, literal(checked.mapping.language)),
    rdfQuad(mapping, TERMS.contentType, literal(checked.mapping.contentType)),
    rdfQuad(mapping, RDF_VALUE, literal(checked.mapping.turtle)),
    rdfQuad(subject, TERMS.target, target),
    rdfQuad(target, TERMS.targetPod, namedNode(checked.target.podBaseIri)),
  ];
  addStringList(quads, subject, TERMS.modeList, checked.modes);
  if (checked.source.label) {
    quads.push(rdfQuad(source, DC.terms.title, literal(checked.source.label)));
  }
  if (checked.mapping.rootIri) {
    quads.push(rdfQuad(mapping, TERMS.sourceRef, namedNode(checked.mapping.rootIri)));
  }
  if (checked.target.resourceContainer) {
    quads.push(rdfQuad(target, TERMS.targetContainer, namedNode(checked.target.resourceContainer)));
  }
  if (checked.target.graphIri) {
    quads.push(rdfQuad(target, TERMS.targetGraph, namedNode(checked.target.graphIri)));
  }
  return serializeTurtle(quads);
}

export function parseConnectorManifestRdf(
  turtle: string,
  options: ConnectorManifestRdfOptions = {},
): PortableConnectorManifest {
  const quads = parseTurtle(turtle, options.baseIri, 'connector manifest RDF');
  const subject = options.subjectIri ? namedNode(options.subjectIri) : findTypedSubject(quads, TERMS.connectorManifest);
  if (!hasQuad(quads, subject, RDF.terms.type, TERMS.connectorManifest)) {
    throw new Error(`Connector manifest ${subject.value} must declare rdf:type ipms:ConnectorManifest.`);
  }
  const source = requiredSingleNode(quads, subject, TERMS.source, 'connector manifest source');
  const mapping = requiredSingleNode(quads, subject, TERMS.mapping, 'connector manifest mapping');
  const target = requiredSingleNode(quads, subject, TERMS.target, 'connector manifest target');
  return validatePortableConnectorManifest({
    id: requiredLiteral(quads, subject, TERMS.identifier, 'connector manifest id'),
    name: requiredLiteral(quads, subject, DC.terms.title, 'connector manifest name'),
    version: requiredLiteral(quads, subject, TERMS.softwareVersion, 'connector manifest version'),
    description: requiredLiteral(quads, subject, DC.terms.description, 'connector manifest description'),
    source: {
      kind: requireOneOf(
        requiredLiteral(quads, source, TERMS.sourceKind, 'connector manifest source kind'),
        SOURCE_KINDS,
        'connector manifest source kind',
      ),
      sourceRef: requiredNamedNode(quads, source, TERMS.sourceRef, 'connector manifest sourceRef'),
      ...optionalLiteral(quads, source, DC.terms.title, 'connector manifest source label'),
    },
    modes: requiredStringList(quads, subject, TERMS.modeList, 'connector manifest modes')
      .map((mode): ConnectorMode => requireOneOf(mode, CONNECTOR_MODES, 'connector manifest mode')),
    mapping: {
      language: requireOneOf(
        requiredLiteral(quads, mapping, TERMS.mappingLanguage, 'connector manifest mapping language'),
        MAPPING_LANGUAGES,
        'connector manifest mapping language',
      ),
      contentType: requireExact(
        requiredLiteral(quads, mapping, TERMS.contentType, 'connector manifest mapping contentType'),
        'text/turtle',
        'connector manifest mapping contentType',
      ),
      turtle: requiredLiteral(quads, mapping, RDF_VALUE, 'connector manifest mapping turtle'),
      ...optionalNamedNode(quads, mapping, TERMS.sourceRef, 'connector manifest mapping rootIri'),
    },
    target: {
      podBaseIri: requiredNamedNode(quads, target, TERMS.targetPod, 'connector manifest target podBaseIri'),
      ...optionalNamedNode(quads, target, TERMS.targetContainer, 'connector manifest target resourceContainer'),
      ...optionalNamedNode(quads, target, TERMS.targetGraph, 'connector manifest target graphIri'),
    },
  });
}

export async function serializeConnectorJobToTurtle(
  job: PortableConnectorJob,
  options: ConnectorJobRdfOptions = {},
): Promise<string> {
  const checked = validatePortableConnectorJob(job);
  const subject = namedNode(options.subjectIri ?? defaultJobSubject(checked.id));
  const quads: Quad[] = [
    rdfQuad(subject, RDF.terms.type, TERMS.connectorJob),
    rdfQuad(subject, TERMS.identifier, literal(checked.id)),
    rdfQuad(subject, TERMS.connectorId, literal(checked.connectorId)),
    rdfQuad(subject, TERMS.jobMode, literal(checked.mode)),
    rdfQuad(subject, TERMS.createdAt, literal(checked.createdAt, `${XSD}dateTime`)),
  ];
  if (checked.conflictPolicy) {
    quads.push(rdfQuad(subject, TERMS.conflictPolicy, literal(checked.conflictPolicy)));
  }
  if (checked.cursorResource) {
    quads.push(rdfQuad(subject, TERMS.cursorResource, namedNode(checked.cursorResource)));
  }
  if (checked.dryRun !== undefined) {
    quads.push(rdfQuad(subject, TERMS.dryRun, literal(checked.dryRun ? 'true' : 'false', `${XSD}boolean`)));
  }
  return serializeTurtle(quads);
}

export function parseConnectorJobRdf(turtle: string, options: ConnectorJobRdfOptions = {}): PortableConnectorJob {
  const quads = parseTurtle(turtle, options.baseIri, 'connector job RDF');
  const subject = options.subjectIri ? namedNode(options.subjectIri) : findTypedSubject(quads, TERMS.connectorJob);
  if (!hasQuad(quads, subject, RDF.terms.type, TERMS.connectorJob)) {
    throw new Error(`Connector job ${subject.value} must declare rdf:type ipms:ConnectorJob.`);
  }
  return validatePortableConnectorJob({
    id: requiredLiteral(quads, subject, TERMS.identifier, 'connector job id'),
    connectorId: requiredLiteral(quads, subject, TERMS.connectorId, 'connector job connectorId'),
    mode: requireOneOf(
      requiredLiteral(quads, subject, TERMS.jobMode, 'connector job mode'),
      CONNECTOR_MODES,
      'connector job mode',
    ),
    createdAt: requiredLiteral(quads, subject, TERMS.createdAt, 'connector job createdAt'),
    ...optionalConflictPolicy(quads, subject),
    ...optionalNamedNode(quads, subject, TERMS.cursorResource, 'connector job cursorResource'),
    ...optionalBooleanLiteral(quads, subject, TERMS.dryRun, 'connector job dryRun'),
  });
}

function validateSource(source: PortableConnectorSource): PortableConnectorSource {
  return {
    kind: requireOneOf(source.kind, SOURCE_KINDS, 'connector manifest source kind'),
    sourceRef: requireAbsoluteIri(source.sourceRef, 'connector manifest sourceRef'),
    ...source.label === undefined ? {} : { label: requireString(source.label, 'connector manifest source label') },
  };
}

function validateModes(values: readonly ConnectorMode[], field: string): ConnectorMode[] {
  const modes = requireArray(values, field).map((value, index): ConnectorMode =>
    requireOneOf(value, CONNECTOR_MODES, `${field}[${index}]`));
  if (modes.length === 0) {
    throw new Error(`${field} must include at least one connector mode.`);
  }
  const duplicates = new Set<string>();
  for (const mode of modes) {
    if (duplicates.has(mode)) {
      throw new Error(`${field} must not contain duplicate modes.`);
    }
    duplicates.add(mode);
  }
  return modes;
}

function validateMapping(mapping: PortableConnectorMapping): PortableConnectorMapping {
  if (SECRET_VALUE_PATTERN.test(mapping.turtle)) {
    throw new Error('connector manifest mapping turtle must not contain secret-looking connection material.');
  }
  const checked = {
    language: requireOneOf(mapping.language, MAPPING_LANGUAGES, 'connector manifest mapping language'),
    contentType: requireExact(mapping.contentType, 'text/turtle', 'connector manifest mapping contentType'),
    turtle: requireString(mapping.turtle, 'connector manifest mapping turtle'),
    ...mapping.rootIri === undefined ?
        {} :
        { rootIri: requireAbsoluteIri(mapping.rootIri, 'connector manifest mapping rootIri') },
  };
  const quads = parseTurtle(checked.turtle, checked.rootIri, 'connector manifest mapping turtle');
  if (!usesMappingNamespace(quads, checked.language)) {
    throw new Error(`connector manifest mapping turtle must use ${checked.language.toUpperCase()} terms.`);
  }
  return checked;
}

function validateTarget(target: PortableConnectorTarget): PortableConnectorTarget {
  return {
    podBaseIri: requireAbsoluteIri(target.podBaseIri, 'connector manifest target podBaseIri'),
    ...target.resourceContainer === undefined ?
        {} :
        {
          resourceContainer: requireAbsoluteIri(
            target.resourceContainer,
            'connector manifest target resourceContainer',
          ),
        },
    ...target.graphIri === undefined ?
        {} :
        { graphIri: requireAbsoluteIri(target.graphIri, 'connector manifest target graphIri') },
  };
}

function validateRuntimeHints(value: Record<string, string>): Record<string, string> {
  const hints: Record<string, string> = {};
  for (const [ key, entry ] of Object.entries(value)) {
    if (SECRET_KEY_PATTERN.test(key) || SECRET_VALUE_PATTERN.test(entry)) {
      throw new Error('connector runtime hints must not inline secrets; use secretRefs.');
    }
    hints[requireSafeId(key, 'connector runtime hint key')] = requireString(entry, `connector runtime hint ${key}`);
  }
  return hints;
}

function usesMappingNamespace(quads: readonly Quad[], language: ConnectorMappingLanguage): boolean {
  const namespace = language === 'r2rml' ? RR : RML;
  return quads.some((quad): boolean =>
    termUsesNamespace(quad.subject, namespace) ||
    termUsesNamespace(quad.predicate, namespace) ||
    termUsesNamespace(quad.object, namespace));
}

function termUsesNamespace(term: Term, namespace: string): boolean {
  return term.termType === 'NamedNode' && term.value.startsWith(namespace);
}

function assertNoPortableSecrets(value: unknown, path: string): void {
  if (typeof value === 'string') {
    if (SECRET_VALUE_PATTERN.test(value)) {
      throw new Error(`${path} must not contain inline secrets or connection strings.`);
    }
    return;
  }
  if (typeof value !== 'object' || value === null) {
    return;
  }
  if (Array.isArray(value)) {
    for (const [ index, entry ] of value.entries()) {
      assertNoPortableSecrets(entry, `${path}[${index}]`);
    }
    return;
  }
  for (const [ key, entry ] of Object.entries(value)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      throw new Error(`${path} must not contain portable field ${key}; keep it in a runtime descriptor.`);
    }
    assertNoPortableSecrets(entry, `${path}.${key}`);
  }
}

function parseTurtle(turtle: string, baseIri: string | undefined, label: string): Quad[] {
  try {
    return new Parser({ baseIRI: baseIri }).parse(turtle);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} could not be parsed: ${message}`);
  }
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

function requiredStringList(quads: readonly Quad[], subject: NamedNode, predicate: NamedNode, field: string): string[] {
  const values = objects(quads, subject, predicate);
  if (values.length !== 1) {
    throw new Error(`${field} list must have exactly one value.`);
  }
  const result: string[] = [];
  const seen = new Set<string>();
  let current = values[0];
  while (!termEquals(current, RDF_NIL)) {
    const key = termKey(current);
    if (seen.has(key)) {
      throw new Error(`${field} list must not contain a cycle.`);
    }
    seen.add(key);
    const first = objects(quads, current, RDF_FIRST);
    const rest = objects(quads, current, RDF_REST);
    if (first.length !== 1 || rest.length !== 1 || first[0].termType !== 'Literal') {
      throw new Error(`${field} list must be a well-formed RDF literal list.`);
    }
    result.push(first[0].value);
    current = rest[0];
  }
  return result;
}

function findTypedSubject(quads: readonly Quad[], type: NamedNode): NamedNode {
  const subjects = uniqueTerms(quads
    .filter((candidate): boolean => termEquals(candidate.predicate, RDF.terms.type) &&
      termEquals(candidate.object, type))
    .map((candidate): Term => candidate.subject));
  if (subjects.length === 0) {
    throw new Error(`RDF must contain one rdf:type ${type.value} subject.`);
  }
  if (subjects.length > 1) {
    throw new Error(`RDF must contain exactly one rdf:type ${type.value} subject.`);
  }
  if (subjects[0].termType !== 'NamedNode') {
    throw new Error('RDF typed subject must be a named node.');
  }
  return subjects[0];
}

function requiredSingleNode(quads: readonly Quad[], subject: Term, predicate: NamedNode, field: string): Term {
  const values = objects(quads, subject, predicate);
  if (values.length === 0) {
    throw new Error(`${field} is required.`);
  }
  if (values.length > 1) {
    throw new Error(`${field} must have exactly one value.`);
  }
  return values[0];
}

function requiredLiteral(quads: readonly Quad[], subject: Term, predicate: NamedNode, field: string): string {
  const node = requiredSingleNode(quads, subject, predicate, field);
  if (node.termType !== 'Literal') {
    throw new Error(`${field} must be a literal.`);
  }
  return node.value;
}

function requiredNamedNode(quads: readonly Quad[], subject: Term, predicate: NamedNode, field: string): string {
  const node = requiredSingleNode(quads, subject, predicate, field);
  if (node.termType !== 'NamedNode') {
    throw new Error(`${field} must be an IRI.`);
  }
  return node.value;
}

function optionalLiteral(
  quads: readonly Quad[],
  subject: Term,
  predicate: NamedNode,
  field: 'connector manifest source label',
): Partial<Record<'label', string>> {
  const values = objects(quads, subject, predicate);
  if (values.length === 0) {
    return {};
  }
  if (values.length > 1 || values[0].termType !== 'Literal') {
    throw new Error(`${field} must have exactly one literal value.`);
  }
  return { label: values[0].value };
}

function optionalConflictPolicy(
  quads: readonly Quad[],
  subject: Term,
): Partial<Record<'conflictPolicy', ConnectorConflictPolicy>> {
  const values = objects(quads, subject, TERMS.conflictPolicy);
  if (values.length === 0) {
    return {};
  }
  if (values.length > 1 || values[0].termType !== 'Literal') {
    throw new Error('connector job conflictPolicy must have exactly one literal value.');
  }
  return {
    conflictPolicy: requireOneOf(values[0].value, CONFLICT_POLICIES, 'connector job conflictPolicy'),
  };
}

function optionalNamedNode(
  quads: readonly Quad[],
  subject: Term,
  predicate: NamedNode,
  field: 'connector manifest mapping rootIri' | 'connector manifest target resourceContainer' |
    'connector manifest target graphIri' | 'connector job cursorResource',
): Partial<Record<'rootIri' | 'resourceContainer' | 'graphIri' | 'cursorResource', string>> {
  const values = objects(quads, subject, predicate);
  if (values.length === 0) {
    return {};
  }
  if (values.length > 1 || values[0].termType !== 'NamedNode') {
    throw new Error(`${field} must have exactly one IRI value.`);
  }
  if (field === 'connector manifest mapping rootIri') {
    return { rootIri: values[0].value };
  }
  if (field === 'connector manifest target resourceContainer') {
    return { resourceContainer: values[0].value };
  }
  if (field === 'connector manifest target graphIri') {
    return { graphIri: values[0].value };
  }
  return { cursorResource: values[0].value };
}

function optionalBooleanLiteral(
  quads: readonly Quad[],
  subject: Term,
  predicate: NamedNode,
  field: 'connector job dryRun',
): Partial<Record<'dryRun', boolean>> {
  const values = objects(quads, subject, predicate);
  if (values.length === 0) {
    return {};
  }
  if (values.length > 1 || values[0].termType !== 'Literal') {
    throw new Error(`${field} must have exactly one boolean value.`);
  }
  if (values[0].value !== 'true' && values[0].value !== 'false') {
    throw new Error(`${field} must be a boolean literal.`);
  }
  return { dryRun: values[0].value === 'true' };
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${field} must be a non-empty string.`);
  }
  return value;
}

function requireTimestamp(value: unknown, field: string): string {
  const timestamp = requireString(value, field);
  if (Number.isNaN(Date.parse(timestamp))) {
    throw new TypeError(`${field} must be an ISO timestamp.`);
  }
  return timestamp;
}

function requireSafeId(value: unknown, field: string): string {
  const id = requireString(value, field);
  if (!/^[\w.:-]+$/u.test(id)) {
    throw new Error(`${field} must be a safe id.`);
  }
  return id;
}

function requireAbsoluteIri(value: unknown, field: string): string {
  const iri = requireString(value, field);
  if (!URL.canParse(iri)) {
    throw new Error(`${field} must be an absolute IRI.`);
  }
  return iri;
}

function requireArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${field} must be an array.`);
  }
  return value;
}

function requireStringArray(value: unknown, field: string): string[] {
  return requireArray(value, field).map((entry, index): string => requireString(entry, `${field}[${index}]`));
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new TypeError(`${field} must be a boolean.`);
  }
  return value;
}

function requireOneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  const entry = requireString(value, field);
  if (!(allowed as readonly string[]).includes(entry)) {
    throw new Error(`${field} must be one of: ${allowed.join(', ')}.`);
  }
  return entry as T;
}

function requireExact<T extends string>(value: unknown, expected: T, field: string): T {
  if (value !== expected) {
    throw new Error(`${field} must be ${expected}.`);
  }
  return expected;
}

function blankNode(): BlankNode {
  return DataFactory.blankNode();
}

function literal(value: string, datatype?: string): Literal {
  return datatype === undefined ? DataFactory.literal(value) : DataFactory.literal(value, namedNode(datatype));
}

function namedNode(value: string): NamedNode {
  return DataFactory.namedNode(value);
}

function rdfQuad(subject: Quad['subject'], predicate: Quad['predicate'], object: Quad['object']): Quad {
  return DataFactory.quad(subject, predicate, object);
}

function objects(quads: readonly Quad[], subject: Term, predicate: NamedNode): Term[] {
  return quads
    .filter((candidate): boolean =>
      termEquals(candidate.subject, subject) && termEquals(candidate.predicate, predicate))
    .map((candidate): Term => candidate.object);
}

function hasQuad(quads: readonly Quad[], subject: Term, predicate: NamedNode, object: Term): boolean {
  return quads.some((candidate): boolean => termEquals(candidate.subject, subject) &&
    termEquals(candidate.predicate, predicate) &&
    termEquals(candidate.object, object));
}

function uniqueTerms(terms: readonly Term[]): Term[] {
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

function defaultManifestSubject(id: string): string {
  return `urn:solid-server:databox:ipms:connector:${encodeURIComponent(id)}`;
}

function defaultJobSubject(id: string): string {
  return `urn:solid-server:databox:ipms:connector-job:${encodeURIComponent(id)}`;
}

async function serializeTurtle(quads: Quad[]): Promise<string> {
  const writer = new Writer({
    prefixes: {
      ipms: namedNode(IPMS.namespace),
      dcterms: namedNode(DC.namespace),
      rdf: namedNode(RDF.namespace),
      schema: namedNode(SCHEMA),
      xsd: namedNode(XSD),
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
