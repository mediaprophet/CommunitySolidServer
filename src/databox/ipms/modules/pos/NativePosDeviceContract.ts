/* eslint-disable sort-imports */
import type { Literal, NamedNode, Quad, Term } from '@rdfjs/types';
import { DataFactory, Parser, Writer } from 'n3';
import type { SolidModuleManifest } from '../../SolidModuleManifest';
import { DC, IPMS, RDF } from '../../../../util/Vocabularies';

const SCHEMA = 'https://schema.org/';
const XSD = 'http://www.w3.org/2001/XMLSchema#';

const TERMS = {
  posDeviceDescriptor: namedNode(`${IPMS.namespace}NativePosDeviceDescriptor`),
  posDeviceJob: namedNode(`${IPMS.namespace}NativePosDeviceJob`),
  identifier: namedNode(`${SCHEMA}identifier`),
  deviceKind: namedNode(`${IPMS.namespace}deviceKind`),
  deviceWebId: namedNode(`${IPMS.namespace}deviceWebId`),
  endpoint: namedNode(`${IPMS.namespace}endpoint`),
  endpointUrl: namedNode(`${IPMS.namespace}endpointUrl`),
  transport: namedNode(`${IPMS.namespace}transport`),
  tlsMode: namedNode(`${IPMS.namespace}tlsMode`),
  mtlsDeviceWebId: namedNode(`${IPMS.namespace}mtlsDeviceWebId`),
  privateNetworkAccess: namedNode(`${IPMS.namespace}privateNetworkAccess`),
  capability: namedNode(`${IPMS.namespace}capability`),
  roleConstraint: namedNode(`${IPMS.namespace}roleConstraint`),
  allowedRole: namedNode(`${IPMS.namespace}allowedRole`),
  allowedAgent: namedNode(`${IPMS.namespace}allowedAgent`),
  sessionMode: namedNode(`${IPMS.namespace}sessionMode`),
  requireActiveSession: namedNode(`${IPMS.namespace}requireActiveSession`),
  maxSessionAgeSeconds: namedNode(`${IPMS.namespace}maxSessionAgeSeconds`),
  deviceId: namedNode(`${IPMS.namespace}deviceId`),
  command: namedNode(`${IPMS.namespace}command`),
  status: namedNode(`${IPMS.namespace}status`),
  createdAt: namedNode(`${IPMS.namespace}createdAt`),
  requestedBy: namedNode(`${IPMS.namespace}requestedBy`),
  operatorSession: namedNode(`${IPMS.namespace}operatorSession`),
  sessionId: namedNode(`${IPMS.namespace}sessionId`),
  sessionWebId: namedNode(`${IPMS.namespace}sessionWebId`),
  roleIri: namedNode(`${IPMS.namespace}roleIri`),
  startedAt: namedNode(`${IPMS.namespace}startedAt`),
  expiresAt: namedNode(`${IPMS.namespace}expiresAt`),
  executionTier: namedNode(`${IPMS.namespace}executionTier`),
  noBrowserHardwareIo: namedNode(`${IPMS.namespace}noBrowserHardwareIo`),
  parameter: namedNode(`${IPMS.namespace}parameter`),
  reason: namedNode(`${IPMS.namespace}reason`),
  registerId: namedNode(`${IPMS.namespace}registerId`),
  pulseMs: namedNode(`${IPMS.namespace}pulseMs`),
};

const DEVICE_KINDS = [ 'cash-drawer', 'receipt-printer', 'customer-display', 'pos-terminal' ] as const;
const CAPABILITIES = [
  'cash-drawer.open',
  'receipt-printer.print-receipt',
  'receipt-printer.cut-paper',
  'customer-display.show-text',
  'customer-display.show-total',
  'pos-terminal.request-payment',
  'pos-terminal.cancel-payment',
] as const;
const JOB_STATUSES = [ 'queued', 'claimed', 'completed', 'failed', 'cancelled' ] as const;
const RUNTIME_IMPLEMENTATIONS = [
  'rust-native-edge',
  'os-service',
  'container-sidecar',
  'managed-native-edge',
] as const;
const SECRET_KEY_PATTERN = /password|passwd|pwd|secret|token|credential|certificate|privatekey/iu;
const SECRET_VALUE_PATTERN = /password\s*=|passwd\s*=|pwd\s*=|secret\s*=|token\s*=|-----BEGIN/iu;

export type NativePosDeviceKind = typeof DEVICE_KINDS[number];
export type NativePosCapability = typeof CAPABILITIES[number];
export type NativePosJobCommand = NativePosCapability;
export type NativePosJobStatus = typeof JOB_STATUSES[number];
export type NativePosRuntimeImplementation = typeof RUNTIME_IMPLEMENTATIONS[number];

export interface NativePosCapabilityDescriptor {
  readonly id: NativePosCapability;
  readonly name: string;
  readonly deviceKinds: readonly NativePosDeviceKind[];
  readonly enhancedExecution: 'native-edge';
  readonly portableCore: 'Solid RDF descriptor and queued command job';
  readonly standardSolidDegradation: string;
}

export interface NativePosEndpointDescriptor {
  readonly url: string;
  readonly transport: 'https';
  readonly tlsMode: 'direct-mtls';
  readonly mtlsDeviceWebId: string;
  readonly privateNetworkAccess?: boolean;
}

export interface NativePosRoleConstraints {
  readonly allowedRoleIris: readonly string[];
  readonly allowedAgentWebIds?: readonly string[];
  readonly sessionMode: 'solid-oidc-bound';
  readonly requireActiveSession: boolean;
  readonly maxSessionAgeSeconds?: number;
}

export interface NativePosExecutionConstraints {
  readonly tier: 'native-edge';
  readonly browserHardwareAccess: false;
  readonly transportSecurity: 'mutual-tls-direct';
}

export interface NativePosDeviceDescriptor {
  readonly id: string;
  readonly label: string;
  readonly kind: NativePosDeviceKind;
  readonly deviceWebId: string;
  readonly endpoint: NativePosEndpointDescriptor;
  readonly capabilities: readonly NativePosCapability[];
  readonly roleConstraints: NativePosRoleConstraints;
  readonly execution: NativePosExecutionConstraints;
}

export interface NativePosOperatorSession {
  readonly sessionId: string;
  readonly webId: string;
  readonly roleIri: string;
  readonly startedAt: string;
  readonly expiresAt?: string;
}

export interface NativePosJobParameters {
  readonly reason?: string;
  readonly registerId?: string;
  readonly pulseMs?: number;
}

export interface NativePosDeviceJob {
  readonly id: string;
  readonly deviceId: string;
  readonly deviceWebId: string;
  readonly command: NativePosJobCommand;
  readonly createdAt: string;
  readonly requestedBy: string;
  readonly operatorSession: NativePosOperatorSession;
  readonly status: NativePosJobStatus;
  readonly parameters?: NativePosJobParameters;
  readonly execution: NativePosExecutionConstraints;
}

export interface OpenCashDrawerJobInput {
  readonly id: string;
  readonly descriptor: NativePosDeviceDescriptor;
  readonly requestedBy: string;
  readonly operatorSession: NativePosOperatorSession;
  readonly createdAt: string;
  readonly reason: string;
  readonly registerId?: string;
  readonly pulseMs?: number;
}

export interface NativePosRuntimeDescriptor {
  readonly deviceId: string;
  readonly engineId: string;
  readonly implementation: NativePosRuntimeImplementation;
  readonly version?: string;
  readonly secretRefs: readonly string[];
  readonly runtimeHints?: Record<string, string>;
}

export interface NativePosRuntimeWorkDescriptor {
  readonly kind: 'native-pos-runtime-descriptor';
  readonly deviceId: string;
  readonly portability: 'non-portable';
  readonly engineId: string;
  readonly implementation: NativePosRuntimeImplementation;
  readonly secretRefCount: number;
  readonly runtimeHintKeys: readonly string[];
}

export interface NativePosRdfOptions {
  readonly subjectIri?: string;
  readonly baseIri?: string;
}

export const NATIVE_EDGE_POS_CAPABILITIES: readonly NativePosCapabilityDescriptor[] = [
  {
    id: 'cash-drawer.open',
    name: 'Open cash drawer',
    deviceKinds: [ 'cash-drawer' ],
    enhancedExecution: 'native-edge',
    portableCore: 'Solid RDF descriptor and queued command job',
    standardSolidDegradation: 'Queue the job as RDF for a native edge process; browsers must not drive the drawer.',
  },
  {
    id: 'receipt-printer.print-receipt',
    name: 'Print receipt',
    deviceKinds: [ 'receipt-printer' ],
    enhancedExecution: 'native-edge',
    portableCore: 'Solid RDF descriptor and queued command job',
    standardSolidDegradation: 'Build and store the receipt document/QR payload; native edge performs ESC/POS I/O.',
  },
  {
    id: 'receipt-printer.cut-paper',
    name: 'Cut receipt paper',
    deviceKinds: [ 'receipt-printer' ],
    enhancedExecution: 'native-edge',
    portableCore: 'Solid RDF descriptor and queued command job',
    standardSolidDegradation: 'Record the cut request as RDF; no browser printer command is emitted.',
  },
  {
    id: 'customer-display.show-text',
    name: 'Show customer-facing text',
    deviceKinds: [ 'customer-display' ],
    enhancedExecution: 'native-edge',
    portableCore: 'Solid RDF descriptor and queued command job',
    standardSolidDegradation: 'Persist the requested display state; a native edge display adapter renders it.',
  },
  {
    id: 'customer-display.show-total',
    name: 'Show transaction total',
    deviceKinds: [ 'customer-display' ],
    enhancedExecution: 'native-edge',
    portableCore: 'Solid RDF descriptor and queued command job',
    standardSolidDegradation: 'Persist the requested display state; a native edge display adapter renders it.',
  },
  {
    id: 'pos-terminal.request-payment',
    name: 'Request terminal payment',
    deviceKinds: [ 'pos-terminal' ],
    enhancedExecution: 'native-edge',
    portableCore: 'Solid RDF descriptor and queued command job',
    standardSolidDegradation: 'Queue a payment-intent handoff; PCI-sensitive terminal I/O stays outside the browser.',
  },
  {
    id: 'pos-terminal.cancel-payment',
    name: 'Cancel terminal payment',
    deviceKinds: [ 'pos-terminal' ],
    enhancedExecution: 'native-edge',
    portableCore: 'Solid RDF descriptor and queued command job',
    standardSolidDegradation: 'Queue a cancellation handoff; terminal I/O stays outside the browser.',
  },
];

export const NATIVE_POS_DEVICE_MODULE_MANIFEST: SolidModuleManifest = {
  id: 'pos.native-edge-devices',
  name: 'Native-edge POS devices',
  version: '0.1.0',
  description: 'Portable POS descriptors and native-edge jobs for drawers, printers, displays, and terminals.',
  capabilities: [
    'pos.devices.describe',
    'pos.jobs.queue',
    ...CAPABILITIES,
  ],
  routes: [
    '/pos/devices',
    '/pos/jobs',
  ],
  configShape: `${IPMS.namespace}NativePosDeviceConfigShape`,
  adminUi: {
    navLabel: 'POS devices',
    path: '/pos/devices',
  },
};

export function capabilitiesForNativePosDevice(kind: NativePosDeviceKind): readonly NativePosCapabilityDescriptor[] {
  const checkedKind = requireOneOf(kind, DEVICE_KINDS, 'native POS device kind');
  return NATIVE_EDGE_POS_CAPABILITIES.filter((capability): boolean =>
    capability.deviceKinds.includes(checkedKind));
}

export function validateNativePosDeviceDescriptor(
  descriptor: NativePosDeviceDescriptor,
): NativePosDeviceDescriptor {
  const checked: NativePosDeviceDescriptor = {
    id: requireSafeId(descriptor.id, 'native POS device id'),
    label: requireString(descriptor.label, 'native POS device label'),
    kind: requireOneOf(descriptor.kind, DEVICE_KINDS, 'native POS device kind'),
    deviceWebId: requireHttpsIri(descriptor.deviceWebId, 'native POS device WebID'),
    endpoint: validateEndpoint(descriptor.endpoint, descriptor.deviceWebId),
    capabilities: validateCapabilities(descriptor.capabilities, descriptor.kind),
    roleConstraints: validateRoleConstraints(descriptor.roleConstraints),
    execution: requireNativeEdgeExecution(descriptor.execution, 'native POS device execution'),
  };
  return checked;
}

export function buildOpenCashDrawerJob(input: OpenCashDrawerJobInput): NativePosDeviceJob {
  const descriptor = validateNativePosDeviceDescriptor(input.descriptor);
  if (descriptor.kind !== 'cash-drawer') {
    throw new Error(`Cash drawer jobs require a cash-drawer device, got ${descriptor.kind}.`);
  }
  if (!descriptor.capabilities.includes('cash-drawer.open')) {
    throw new Error(`Native POS device ${descriptor.id} does not advertise cash-drawer.open.`);
  }
  const parameters: NativePosJobParameters = validateJobParameters({
    reason: input.reason,
    ...input.registerId === undefined ? {} : { registerId: input.registerId },
    ...input.pulseMs === undefined ? {} : { pulseMs: input.pulseMs },
  });
  return validateNativePosDeviceJob({
    id: input.id,
    deviceId: descriptor.id,
    deviceWebId: descriptor.deviceWebId,
    command: 'cash-drawer.open',
    createdAt: input.createdAt,
    requestedBy: input.requestedBy,
    operatorSession: input.operatorSession,
    status: 'queued',
    parameters,
    execution: nativeEdgeExecution(),
  }, descriptor);
}

export function validateNativePosDeviceJob(
  job: NativePosDeviceJob,
  descriptor?: NativePosDeviceDescriptor,
): NativePosDeviceJob {
  const checked: NativePosDeviceJob = {
    id: requireSafeId(job.id, 'native POS job id'),
    deviceId: requireSafeId(job.deviceId, 'native POS job deviceId'),
    deviceWebId: requireHttpsIri(job.deviceWebId, 'native POS job deviceWebId'),
    command: requireOneOf(job.command, CAPABILITIES, 'native POS job command'),
    createdAt: requireTimestamp(job.createdAt, 'native POS job createdAt'),
    requestedBy: requireHttpsIri(job.requestedBy, 'native POS job requestedBy'),
    operatorSession: validateOperatorSession(job.operatorSession),
    status: requireOneOf(job.status, JOB_STATUSES, 'native POS job status'),
    execution: requireNativeEdgeExecution(job.execution, 'native POS job execution'),
    ...job.parameters === undefined ? {} : { parameters: validateJobParameters(job.parameters) },
  };

  if (checked.requestedBy !== checked.operatorSession.webId) {
    throw new Error('native POS job requestedBy must match the operator session WebID.');
  }
  if (descriptor) {
    validateJobAgainstDescriptor(checked, validateNativePosDeviceDescriptor(descriptor));
  }
  return checked;
}

export function validateNativePosRuntimeDescriptor(
  descriptor: NativePosRuntimeDescriptor,
): NativePosRuntimeDescriptor {
  return {
    deviceId: requireSafeId(descriptor.deviceId, 'native POS runtime deviceId'),
    engineId: requireSafeId(descriptor.engineId, 'native POS runtime engineId'),
    implementation: requireOneOf(
      descriptor.implementation,
      RUNTIME_IMPLEMENTATIONS,
      'native POS runtime implementation',
    ),
    secretRefs: requireStringArray(descriptor.secretRefs, 'native POS runtime secretRefs'),
    ...descriptor.version === undefined ?
        {} :
        { version: requireString(descriptor.version, 'native POS runtime version') },
    ...descriptor.runtimeHints === undefined ?
        {} :
        { runtimeHints: validateRuntimeHints(descriptor.runtimeHints) },
  };
}

export function toNativePosRuntimeWorkDescriptor(
  descriptor: NativePosRuntimeDescriptor,
): NativePosRuntimeWorkDescriptor {
  const checked = validateNativePosRuntimeDescriptor(descriptor);
  return {
    kind: 'native-pos-runtime-descriptor',
    deviceId: checked.deviceId,
    portability: 'non-portable',
    engineId: checked.engineId,
    implementation: checked.implementation,
    secretRefCount: checked.secretRefs.length,
    runtimeHintKeys: Object.keys(checked.runtimeHints ?? {}).sort(),
  };
}

export async function serializeNativePosDeviceDescriptorToTurtle(
  descriptor: NativePosDeviceDescriptor,
  options: NativePosRdfOptions = {},
): Promise<string> {
  const checked = validateNativePosDeviceDescriptor(descriptor);
  const subject = namedNode(options.subjectIri ?? defaultDeviceSubject(checked.id));
  const endpoint = DataFactory.blankNode();
  const roleConstraint = DataFactory.blankNode();
  const quads: Quad[] = [
    rdfQuad(subject, RDF.terms.type, TERMS.posDeviceDescriptor),
    rdfQuad(subject, TERMS.identifier, literal(checked.id)),
    rdfQuad(subject, DC.terms.title, literal(checked.label)),
    rdfQuad(subject, TERMS.deviceKind, literal(checked.kind)),
    rdfQuad(subject, TERMS.deviceWebId, namedNode(checked.deviceWebId)),
    rdfQuad(subject, TERMS.endpoint, endpoint),
    rdfQuad(endpoint, TERMS.endpointUrl, namedNode(checked.endpoint.url)),
    rdfQuad(endpoint, TERMS.transport, literal(checked.endpoint.transport)),
    rdfQuad(endpoint, TERMS.tlsMode, literal(checked.endpoint.tlsMode)),
    rdfQuad(endpoint, TERMS.mtlsDeviceWebId, namedNode(checked.endpoint.mtlsDeviceWebId)),
    rdfQuad(subject, TERMS.roleConstraint, roleConstraint),
    rdfQuad(roleConstraint, TERMS.sessionMode, literal(checked.roleConstraints.sessionMode)),
    rdfQuad(roleConstraint, TERMS.requireActiveSession, booleanLiteral(checked.roleConstraints.requireActiveSession)),
    rdfQuad(subject, TERMS.executionTier, literal(checked.execution.tier)),
    rdfQuad(subject, TERMS.noBrowserHardwareIo, booleanLiteral(!checked.execution.browserHardwareAccess)),
  ];
  for (const capability of checked.capabilities) {
    quads.push(rdfQuad(subject, TERMS.capability, literal(capability)));
  }
  for (const role of checked.roleConstraints.allowedRoleIris) {
    quads.push(rdfQuad(roleConstraint, TERMS.allowedRole, namedNode(role)));
  }
  for (const agent of checked.roleConstraints.allowedAgentWebIds ?? []) {
    quads.push(rdfQuad(roleConstraint, TERMS.allowedAgent, namedNode(agent)));
  }
  if (checked.endpoint.privateNetworkAccess !== undefined) {
    quads.push(rdfQuad(
      endpoint,
      TERMS.privateNetworkAccess,
      booleanLiteral(checked.endpoint.privateNetworkAccess),
    ));
  }
  if (checked.roleConstraints.maxSessionAgeSeconds !== undefined) {
    quads.push(rdfQuad(
      roleConstraint,
      TERMS.maxSessionAgeSeconds,
      integerLiteral(checked.roleConstraints.maxSessionAgeSeconds),
    ));
  }
  return serializeTurtle(quads);
}

export function parseNativePosDeviceDescriptorRdf(
  turtle: string,
  options: NativePosRdfOptions = {},
): NativePosDeviceDescriptor {
  const quads = parseTurtle(turtle, options.baseIri, 'native POS device descriptor RDF');
  let subject: NamedNode;
  if (options.subjectIri === undefined) {
    subject = findTypedSubject(quads, TERMS.posDeviceDescriptor);
  } else {
    subject = namedNode(options.subjectIri);
  }
  if (!hasQuad(quads, subject, RDF.terms.type, TERMS.posDeviceDescriptor)) {
    throw new Error(
      `Native POS device descriptor ${subject.value} must declare rdf:type ipms:NativePosDeviceDescriptor.`,
    );
  }
  const endpoint = requiredSingleNode(quads, subject, TERMS.endpoint, 'native POS device endpoint');
  const roleConstraint = requiredSingleNode(quads, subject, TERMS.roleConstraint, 'native POS device roleConstraint');
  return validateNativePosDeviceDescriptor({
    id: requiredLiteral(quads, subject, TERMS.identifier, 'native POS device id'),
    label: requiredLiteral(quads, subject, DC.terms.title, 'native POS device label'),
    kind: requiredLiteral(quads, subject, TERMS.deviceKind, 'native POS device kind') as NativePosDeviceKind,
    deviceWebId: requiredNamedNode(quads, subject, TERMS.deviceWebId, 'native POS device WebID'),
    endpoint: {
      url: requiredNamedNode(quads, endpoint, TERMS.endpointUrl, 'native POS device endpointUrl'),
      transport: requiredLiteral(
        quads,
        endpoint,
        TERMS.transport,
        'native POS device endpoint transport',
      ) as 'https',
      tlsMode: requiredLiteral(
        quads,
        endpoint,
        TERMS.tlsMode,
        'native POS device endpoint tlsMode',
      ) as 'direct-mtls',
      mtlsDeviceWebId: requiredNamedNode(
        quads,
        endpoint,
        TERMS.mtlsDeviceWebId,
        'native POS device endpoint mtlsDeviceWebId',
      ),
      ...optionalBoolean(
        quads,
        endpoint,
        TERMS.privateNetworkAccess,
        'native POS device endpoint privateNetworkAccess',
      ),
    },
    capabilities: literalObjects(quads, subject, TERMS.capability) as NativePosCapability[],
    roleConstraints: {
      allowedRoleIris: namedNodeObjects(quads, roleConstraint, TERMS.allowedRole),
      ...optionalAllowedAgents(quads, roleConstraint),
      sessionMode: requiredLiteral(
        quads,
        roleConstraint,
        TERMS.sessionMode,
        'native POS device roleConstraint sessionMode',
      ) as 'solid-oidc-bound',
      requireActiveSession: requiredBoolean(
        quads,
        roleConstraint,
        TERMS.requireActiveSession,
        'native POS device roleConstraint requireActiveSession',
      ),
      ...optionalInteger(
        quads,
        roleConstraint,
        TERMS.maxSessionAgeSeconds,
        'native POS device roleConstraint maxSessionAgeSeconds',
      ),
    },
    execution: nativeEdgeExecution(),
  });
}

export async function serializeNativePosDeviceJobToTurtle(
  job: NativePosDeviceJob,
  options: NativePosRdfOptions = {},
): Promise<string> {
  const checked = validateNativePosDeviceJob(job);
  const subject = namedNode(options.subjectIri ?? defaultJobSubject(checked.id));
  const session = DataFactory.blankNode();
  const quads: Quad[] = [
    rdfQuad(subject, RDF.terms.type, TERMS.posDeviceJob),
    rdfQuad(subject, TERMS.identifier, literal(checked.id)),
    rdfQuad(subject, TERMS.deviceId, literal(checked.deviceId)),
    rdfQuad(subject, TERMS.deviceWebId, namedNode(checked.deviceWebId)),
    rdfQuad(subject, TERMS.command, literal(checked.command)),
    rdfQuad(subject, TERMS.status, literal(checked.status)),
    rdfQuad(subject, TERMS.createdAt, dateTimeLiteral(checked.createdAt)),
    rdfQuad(subject, TERMS.requestedBy, namedNode(checked.requestedBy)),
    rdfQuad(subject, TERMS.operatorSession, session),
    rdfQuad(session, TERMS.sessionId, literal(checked.operatorSession.sessionId)),
    rdfQuad(session, TERMS.sessionWebId, namedNode(checked.operatorSession.webId)),
    rdfQuad(session, TERMS.roleIri, namedNode(checked.operatorSession.roleIri)),
    rdfQuad(session, TERMS.startedAt, dateTimeLiteral(checked.operatorSession.startedAt)),
    rdfQuad(subject, TERMS.executionTier, literal(checked.execution.tier)),
    rdfQuad(subject, TERMS.noBrowserHardwareIo, booleanLiteral(!checked.execution.browserHardwareAccess)),
  ];
  if (checked.operatorSession.expiresAt) {
    quads.push(rdfQuad(session, TERMS.expiresAt, dateTimeLiteral(checked.operatorSession.expiresAt)));
  }
  if (checked.parameters) {
    const parameter = DataFactory.blankNode();
    quads.push(rdfQuad(subject, TERMS.parameter, parameter));
    if (checked.parameters.reason) {
      quads.push(rdfQuad(parameter, TERMS.reason, literal(checked.parameters.reason)));
    }
    if (checked.parameters.registerId) {
      quads.push(rdfQuad(parameter, TERMS.registerId, literal(checked.parameters.registerId)));
    }
    if (checked.parameters.pulseMs !== undefined) {
      quads.push(rdfQuad(parameter, TERMS.pulseMs, integerLiteral(checked.parameters.pulseMs)));
    }
  }
  return serializeTurtle(quads);
}

export function parseNativePosDeviceJobRdf(
  turtle: string,
  options: NativePosRdfOptions = {},
): NativePosDeviceJob {
  const quads = parseTurtle(turtle, options.baseIri, 'native POS device job RDF');
  const subject = options.subjectIri ? namedNode(options.subjectIri) : findTypedSubject(quads, TERMS.posDeviceJob);
  if (!hasQuad(quads, subject, RDF.terms.type, TERMS.posDeviceJob)) {
    throw new Error(`Native POS device job ${subject.value} must declare rdf:type ipms:NativePosDeviceJob.`);
  }
  const session = requiredSingleNode(quads, subject, TERMS.operatorSession, 'native POS job operatorSession');
  return validateNativePosDeviceJob({
    id: requiredLiteral(quads, subject, TERMS.identifier, 'native POS job id'),
    deviceId: requiredLiteral(quads, subject, TERMS.deviceId, 'native POS job deviceId'),
    deviceWebId: requiredNamedNode(quads, subject, TERMS.deviceWebId, 'native POS job deviceWebId'),
    command: requiredLiteral(quads, subject, TERMS.command, 'native POS job command') as NativePosJobCommand,
    status: requiredLiteral(quads, subject, TERMS.status, 'native POS job status') as NativePosJobStatus,
    createdAt: requiredLiteral(quads, subject, TERMS.createdAt, 'native POS job createdAt'),
    requestedBy: requiredNamedNode(quads, subject, TERMS.requestedBy, 'native POS job requestedBy'),
    operatorSession: {
      sessionId: requiredLiteral(quads, session, TERMS.sessionId, 'native POS job sessionId'),
      webId: requiredNamedNode(quads, session, TERMS.sessionWebId, 'native POS job sessionWebId'),
      roleIri: requiredNamedNode(quads, session, TERMS.roleIri, 'native POS job roleIri'),
      startedAt: requiredLiteral(quads, session, TERMS.startedAt, 'native POS job startedAt'),
      ...optionalNamedNodeLiteral(quads, session, TERMS.expiresAt, 'native POS job expiresAt'),
    },
    ...optionalJobParameters(quads, subject),
    execution: nativeEdgeExecution(),
  });
}

function validateEndpoint(
  endpoint: NativePosEndpointDescriptor,
  deviceWebId: string,
): NativePosEndpointDescriptor {
  const checked: NativePosEndpointDescriptor = {
    url: requireHttpsIri(endpoint.url, 'native POS endpoint url'),
    transport: requireExact(endpoint.transport, 'https', 'native POS endpoint transport'),
    tlsMode: requireExact(endpoint.tlsMode, 'direct-mtls', 'native POS endpoint tlsMode'),
    mtlsDeviceWebId: requireHttpsIri(endpoint.mtlsDeviceWebId, 'native POS endpoint mtlsDeviceWebId'),
    ...endpoint.privateNetworkAccess === undefined ?
        {} :
        { privateNetworkAccess: requireBooleanValue(endpoint.privateNetworkAccess, 'native POS privateNetworkAccess') },
  };
  if (checked.mtlsDeviceWebId !== deviceWebId) {
    throw new Error('native POS endpoint mTLS device WebID must match the descriptor device WebID.');
  }
  return checked;
}

function validateCapabilities(
  capabilities: readonly NativePosCapability[],
  kind: NativePosDeviceKind,
): NativePosCapability[] {
  const allowed = new Set(
    capabilitiesForNativePosDevice(kind).map((capability): NativePosCapability => capability.id),
  );
  const seen = new Set<string>();
  const checked = requireArray(capabilities, 'native POS capabilities')
    .map((capability, index): NativePosCapability => {
      const value = requireOneOf(capability, CAPABILITIES, `native POS capabilities[${index}]`);
      if (!allowed.has(value)) {
        throw new Error(`native POS capability ${value} is not valid for ${kind}.`);
      }
      if (seen.has(value)) {
        throw new Error(`native POS capability ${value} must not be duplicated.`);
      }
      seen.add(value);
      return value;
    });
  if (checked.length === 0) {
    throw new Error('native POS capabilities must include at least one capability.');
  }
  return checked;
}

function validateRoleConstraints(constraints: NativePosRoleConstraints): NativePosRoleConstraints {
  const checked: NativePosRoleConstraints = {
    allowedRoleIris: uniqueAbsoluteIris(constraints.allowedRoleIris, 'native POS allowedRoleIris'),
    ...constraints.allowedAgentWebIds === undefined ?
        {} :
        { allowedAgentWebIds: uniqueWebIds(constraints.allowedAgentWebIds, 'native POS allowedAgentWebIds') },
    sessionMode: requireExact(constraints.sessionMode, 'solid-oidc-bound', 'native POS sessionMode'),
    requireActiveSession: requireBooleanValue(constraints.requireActiveSession, 'native POS requireActiveSession'),
    ...constraints.maxSessionAgeSeconds === undefined ?
        {} :
        {
          maxSessionAgeSeconds: requirePositiveInteger(
            constraints.maxSessionAgeSeconds,
            'native POS maxSessionAgeSeconds',
          ),
        },
  };
  if (checked.allowedRoleIris.length === 0) {
    throw new Error('native POS allowedRoleIris must include at least one role.');
  }
  return checked;
}

function validateOperatorSession(session: NativePosOperatorSession): NativePosOperatorSession {
  return {
    sessionId: requireSafeId(session.sessionId, 'native POS operator sessionId'),
    webId: requireHttpsIri(session.webId, 'native POS operator session WebID'),
    roleIri: requireAbsoluteIri(session.roleIri, 'native POS operator session roleIri'),
    startedAt: requireTimestamp(session.startedAt, 'native POS operator session startedAt'),
    ...session.expiresAt === undefined ?
        {} :
        { expiresAt: requireTimestamp(session.expiresAt, 'native POS operator session expiresAt') },
  };
}

function validateJobParameters(parameters: NativePosJobParameters): NativePosJobParameters {
  return {
    ...parameters.reason === undefined ?
        {} :
        { reason: requireString(parameters.reason, 'native POS job reason') },
    ...parameters.registerId === undefined ?
        {} :
        { registerId: requireSafeId(parameters.registerId, 'native POS job registerId') },
    ...parameters.pulseMs === undefined ?
        {} :
        { pulseMs: requirePositiveInteger(parameters.pulseMs, 'native POS job pulseMs') },
  };
}

function validateJobAgainstDescriptor(job: NativePosDeviceJob, descriptor: NativePosDeviceDescriptor): void {
  if (job.deviceId !== descriptor.id) {
    throw new Error(`native POS job ${job.id} targets ${job.deviceId}, not descriptor ${descriptor.id}.`);
  }
  if (job.deviceWebId !== descriptor.deviceWebId) {
    throw new Error(`native POS job ${job.id} targets a different device WebID.`);
  }
  if (!descriptor.capabilities.includes(job.command)) {
    throw new Error(`native POS device ${descriptor.id} does not advertise ${job.command}.`);
  }
  if (!descriptor.roleConstraints.allowedRoleIris.includes(job.operatorSession.roleIri)) {
    throw new Error(`native POS job ${job.id} role is not allowed to use device ${descriptor.id}.`);
  }
  if (descriptor.roleConstraints.allowedAgentWebIds &&
    !descriptor.roleConstraints.allowedAgentWebIds.includes(job.operatorSession.webId)) {
    throw new Error(`native POS job ${job.id} operator is not allowed to use device ${descriptor.id}.`);
  }
  validateSessionWindow(job, descriptor.roleConstraints);
}

function validateSessionWindow(job: NativePosDeviceJob, constraints: NativePosRoleConstraints): void {
  const createdAt = new Date(job.createdAt).getTime();
  const startedAt = new Date(job.operatorSession.startedAt).getTime();
  if (startedAt > createdAt) {
    throw new Error('native POS operator session must start before the job is created.');
  }
  if (constraints.requireActiveSession) {
    if (!job.operatorSession.expiresAt) {
      throw new Error('native POS operator session must have an expiry for active-session-constrained devices.');
    }
    if (new Date(job.operatorSession.expiresAt).getTime() <= createdAt) {
      throw new Error('native POS operator session is expired for this native POS job.');
    }
  }
  if (constraints.maxSessionAgeSeconds !== undefined &&
    createdAt - startedAt > constraints.maxSessionAgeSeconds * 1000) {
    throw new Error('native POS operator session is too old for this device.');
  }
}

function requireNativeEdgeExecution(
  execution: NativePosExecutionConstraints,
  field: string,
): NativePosExecutionConstraints {
  return {
    tier: requireExact(execution.tier, 'native-edge', `${field} tier`),
    browserHardwareAccess: requireExact(
      execution.browserHardwareAccess,
      false,
      `${field} browserHardwareAccess`,
    ),
    transportSecurity: requireExact(
      execution.transportSecurity,
      'mutual-tls-direct',
      `${field} transportSecurity`,
    ),
  };
}

function nativeEdgeExecution(): NativePosExecutionConstraints {
  return {
    tier: 'native-edge',
    browserHardwareAccess: false,
    transportSecurity: 'mutual-tls-direct',
  };
}

function validateRuntimeHints(value: Record<string, string>): Record<string, string> {
  const hints: Record<string, string> = {};
  for (const [ key, entry ] of Object.entries(value)) {
    if (SECRET_KEY_PATTERN.test(key) || SECRET_VALUE_PATTERN.test(entry)) {
      throw new Error('native POS runtime hints must not inline secrets; use secretRefs.');
    }
    hints[requireSafeId(key, 'native POS runtime hint key')] =
      requireString(entry, `native POS runtime hint ${key}`);
  }
  return hints;
}

function parseTurtle(turtle: string, baseIri: string | undefined, label: string): Quad[] {
  try {
    return new Parser({ baseIRI: baseIri }).parse(turtle);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} could not be parsed: ${message}`);
  }
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

function requiredBoolean(quads: readonly Quad[], subject: Term, predicate: NamedNode, field: string): boolean {
  const value = requiredLiteral(quads, subject, predicate, field);
  if (value !== 'true' && value !== 'false') {
    throw new Error(`${field} must be a boolean literal.`);
  }
  return value === 'true';
}

function literalObjects(quads: readonly Quad[], subject: Term, predicate: NamedNode): string[] {
  return objects(quads, subject, predicate).map((object): string => {
    if (object.termType !== 'Literal') {
      throw new Error(`${predicate.value} values must be literals.`);
    }
    return object.value;
  });
}

function namedNodeObjects(quads: readonly Quad[], subject: Term, predicate: NamedNode): string[] {
  return objects(quads, subject, predicate).map((object): string => {
    if (object.termType !== 'NamedNode') {
      throw new Error(`${predicate.value} values must be IRIs.`);
    }
    return object.value;
  });
}

function optionalAllowedAgents(
  quads: readonly Quad[],
  subject: Term,
): Partial<Record<'allowedAgentWebIds', string[]>> {
  const agents = namedNodeObjects(quads, subject, TERMS.allowedAgent);
  return agents.length === 0 ? {} : { allowedAgentWebIds: agents };
}

function optionalBoolean(
  quads: readonly Quad[],
  subject: Term,
  predicate: NamedNode,
  field: 'native POS device endpoint privateNetworkAccess',
): Partial<Record<'privateNetworkAccess', boolean>> {
  const values = objects(quads, subject, predicate);
  if (values.length === 0) {
    return {};
  }
  if (values.length > 1 || values[0].termType !== 'Literal') {
    throw new Error(`${field} must have exactly one boolean literal value.`);
  }
  if (values[0].value !== 'true' && values[0].value !== 'false') {
    throw new Error(`${field} must be a boolean literal.`);
  }
  return { privateNetworkAccess: values[0].value === 'true' };
}

function optionalInteger(
  quads: readonly Quad[],
  subject: Term,
  predicate: NamedNode,
  field: 'native POS device roleConstraint maxSessionAgeSeconds',
): Partial<Record<'maxSessionAgeSeconds', number>> {
  const values = objects(quads, subject, predicate);
  if (values.length === 0) {
    return {};
  }
  if (values.length > 1 || values[0].termType !== 'Literal') {
    throw new Error(`${field} must have exactly one integer literal value.`);
  }
  return { maxSessionAgeSeconds: requirePositiveInteger(Number(values[0].value), field) };
}

function optionalNamedNodeLiteral(
  quads: readonly Quad[],
  subject: Term,
  predicate: NamedNode,
  field: 'native POS job expiresAt',
): Partial<Record<'expiresAt', string>> {
  const values = objects(quads, subject, predicate);
  if (values.length === 0) {
    return {};
  }
  if (values.length > 1 || values[0].termType !== 'Literal') {
    throw new Error(`${field} must have exactly one literal value.`);
  }
  return { expiresAt: values[0].value };
}

function optionalJobParameters(
  quads: readonly Quad[],
  subject: Term,
): Partial<Record<'parameters', NativePosJobParameters>> {
  const values = objects(quads, subject, TERMS.parameter);
  if (values.length === 0) {
    return {};
  }
  if (values.length > 1) {
    throw new Error('native POS job parameters must have exactly one value.');
  }
  const node = values[0];
  return {
    parameters: validateJobParameters({
      ...optionalLiteralField(quads, node, TERMS.reason, 'reason'),
      ...optionalLiteralField(quads, node, TERMS.registerId, 'registerId'),
      ...optionalPulseMs(quads, node),
    }),
  };
}

function optionalLiteralField(
  quads: readonly Quad[],
  subject: Term,
  predicate: NamedNode,
  field: 'reason' | 'registerId',
): Partial<Record<'reason' | 'registerId', string>> {
  const values = objects(quads, subject, predicate);
  if (values.length === 0) {
    return {};
  }
  if (values.length > 1 || values[0].termType !== 'Literal') {
    throw new Error(`native POS job parameter ${field} must have exactly one literal value.`);
  }
  return { [field]: values[0].value };
}

function optionalPulseMs(
  quads: readonly Quad[],
  subject: Term,
): Partial<Record<'pulseMs', number>> {
  const values = objects(quads, subject, TERMS.pulseMs);
  if (values.length === 0) {
    return {};
  }
  if (values.length > 1 || values[0].termType !== 'Literal') {
    throw new Error('native POS job parameter pulseMs must have exactly one integer literal value.');
  }
  return { pulseMs: Number(values[0].value) };
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
    const key = `${term.termType}:${term.value}`;
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

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${field} must be a non-empty string.`);
  }
  return value;
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

function requireHttpsIri(value: unknown, field: string): string {
  const iri = requireAbsoluteIri(value, field);
  const url = new URL(iri);
  if (url.protocol !== 'https:') {
    throw new Error(`${field} must be an HTTPS IRI.`);
  }
  return url.href;
}

function requireTimestamp(value: unknown, field: string): string {
  const timestamp = requireString(value, field);
  if (Number.isNaN(Date.parse(timestamp))) {
    throw new TypeError(`${field} must be an ISO timestamp.`);
  }
  return timestamp;
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

function uniqueAbsoluteIris(value: readonly string[], field: string): string[] {
  return uniqueStrings(value.map((entry, index): string => requireAbsoluteIri(entry, `${field}[${index}]`)), field);
}

function uniqueWebIds(value: readonly string[], field: string): string[] {
  return uniqueStrings(value.map((entry, index): string => requireHttpsIri(entry, `${field}[${index}]`)), field);
}

function uniqueStrings(value: readonly string[], field: string): string[] {
  const seen = new Set<string>();
  for (const entry of value) {
    if (seen.has(entry)) {
      throw new Error(`${field} must not contain duplicate values.`);
    }
    seen.add(entry);
  }
  return [ ...value ];
}

function requireBooleanValue(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new TypeError(`${field} must be a boolean.`);
  }
  return value;
}

function requirePositiveInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || Number(value) <= 0) {
    throw new TypeError(`${field} must be a positive integer.`);
  }
  return Number(value);
}

function requireOneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  const entry = requireString(value, field);
  if (!(allowed as readonly string[]).includes(entry)) {
    throw new Error(`${field} must be one of: ${allowed.join(', ')}.`);
  }
  return entry as T;
}

function requireExact<T extends string | boolean>(value: unknown, expected: T, field: string): T {
  if (value !== expected) {
    throw new Error(`${field} must be ${expected}.`);
  }
  return expected;
}

function namedNode(value: string): NamedNode {
  return DataFactory.namedNode(value);
}

function literal(value: string): Literal {
  return DataFactory.literal(value);
}

function dateTimeLiteral(value: string): Literal {
  return DataFactory.literal(value, namedNode(`${XSD}dateTime`));
}

function integerLiteral(value: number): Literal {
  return DataFactory.literal(String(value), namedNode(`${XSD}integer`));
}

function booleanLiteral(value: boolean): Literal {
  return DataFactory.literal(value ? 'true' : 'false', namedNode(`${XSD}boolean`));
}

function rdfQuad(subject: Quad['subject'], predicate: Quad['predicate'], object: Quad['object']): Quad {
  return DataFactory.quad(subject, predicate, object);
}

function defaultDeviceSubject(id: string): string {
  return `urn:solid-server:databox:ipms:pos-device:${encodeURIComponent(id)}`;
}

function defaultJobSubject(id: string): string {
  return `urn:solid-server:databox:ipms:pos-job:${encodeURIComponent(id)}`;
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
