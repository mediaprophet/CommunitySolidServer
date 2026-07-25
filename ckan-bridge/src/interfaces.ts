/**
 * Interface stubs for the CKAN Bridge (CKAN-01).
 *
 * These interfaces define the contracts the bridge components MUST implement.
 * No runtime logic — pure interfaces, so dependent prompts consume the contract, not an implementation.
 * Each interface maps to a later CKAN-NN prompt that provides the implementation.
 */

import type {
  BridgeConfig,
  CkanActionRequest,
  CkanActionResponse,
  CkanWebhookEvent,
  CorrectionPropagationJob,
  PublicationJob,
  ReconciliationDrift,
  ShaclValidationResult,
  TranslationResult,
} from './types.js';

/**
 * CKAN Action API client (CKAN-06).
 * Communicates with CKAN exclusively over HTTP via POST /api/3/action/{action}.
 * NEVER uses direct database access (no ODBC, no SQL).
 */
export interface CkanActionClient {
  /**
   * Call a CKAN Action API endpoint.
   * @param request The action name and parameter dictionary.
   * @returns The parsed response. Check `success` — CKAN returns HTTP 200 even on failure.
   */
  call<T = unknown>(request: CkanActionRequest): Promise<CkanActionResponse<T>>;

  /** Convenience: call package_show. */
  packageShow(id: string): Promise<CkanActionResponse<CkanPackage>>;

  /** Convenience: call package_create. */
  packageCreate(data: Readonly<Record<string, unknown>>): Promise<CkanActionResponse<CkanPackage>>;

  /** Convenience: call package_update. */
  packageUpdate(id: string, data: Readonly<Record<string, unknown>>): Promise<CkanActionResponse<CkanPackage>>;

  /** Convenience: call datastore_create. */
  datastoreCreate(resourceId: string, fields: unknown[], records: unknown[]): Promise<CkanActionResponse>;

  /** Convenience: call datastore_upsert. */
  datastoreUpsert(resourceId: string, records: unknown[], method?: 'insert' | 'update' | 'upsert'): Promise<CkanActionResponse>;
}

/** A CKAN package (dataset) as returned by package_show / package_create. */
export interface CkanPackage {
  readonly id: string;
  readonly name: string;
  readonly title: string;
  readonly notes?: string;
  readonly organization?: { readonly id: string; readonly name: string };
  readonly resources?: readonly CkanResource[];
  readonly extras?: Readonly<Record<string, string>>;
  readonly [key: string]: unknown;
}

/** A CKAN resource (data file / datastore table). */
export interface CkanResource {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly format?: string;
  readonly datastore_active?: boolean;
}

/**
 * Solid-OIDC client for the bridge (CKAN-04).
 * Authenticates as the bridge's program-specific service agent (ADR-0018).
 * Requests scoped, short-lived, DPoP-bound access tokens to read from Pods.
 * NEVER stores long-lived credentials.
 */
export interface SolidOidcClient {
  /**
   * Obtain a scoped, DPoP-bound access token for reading from a Pod.
   * @param podIri The Pod resource IRI to request access to.
   * @returns A short-lived bearer token with DPoP proof.
   */
  getAccessToken(podIri: string): Promise<SolidAccessToken>;

  /** Check if a cached token is still valid. */
  isTokenValid(token: SolidAccessToken): boolean;
}

/** A Solid access token with metadata. */
export interface SolidAccessToken {
  /** The bearer token value. */
  readonly token: string;
  /** ISO-8601 expiry time. */
  readonly expiresAt: string;
  /** The DPoP proof bound to this token. */
  readonly dpopProof: string;
  /** The audience (Pod IRI). */
  readonly audience: string;
}

/**
 * SHACL validation engine (CKAN-07).
 * Validates Pod RDF against SHACL shapes before any data moves to CKAN.
 * Fail closed: non-compliant data never reaches CKAN.
 */
export interface ShaclValidator {
  /**
   * Validate an RDF graph against the loaded SHACL shapes.
   * @param podResourceIri The Pod resource IRI to read and validate.
   * @returns The validation result. If `conforms` is false, the publication MUST be blocked.
   */
  validate(podResourceIri: string): Promise<ShaclValidationResult>;

  /**
   * Validate pre-parsed RDF content against the loaded SHACL shapes.
   * @param rdfContent The RDF content as a string.
   * @param contentType The media type of the RDF content.
   * @param shapeIri The shape IRI to validate against.
   * @returns The validation result.
   */
  validateContent(rdfContent: string, contentType: string, shapeIri: string): Promise<ShaclValidationResult>;
}

/**
 * RDF→tabular translation + anonymisation (CKAN-08).
 * Reads validated RDF, translates to CKAN datastore format, strips PII per program profile.
 */
export interface RdfTranslator {
  /**
   * Read RDF from a Pod, translate to tabular JSON, and apply anonymisation.
   * @param podResourceIri The Pod resource IRI to read.
   * @returns The translated records, field definitions, and anonymisation evidence.
   */
  translate(podResourceIri: string): Promise<TranslationResult>;
}

/**
 * Webhook event handler (CKAN-09).
 * Receives webhooks from the CKAN plugin, verifies signatures, routes events.
 */
export interface WebhookHandler {
  /**
   * Handle an incoming webhook from the CKAN plugin.
   * @param event The webhook event.
   * @param signature The HMAC signature to verify.
   * @param rawBody The raw request body for signature verification.
   */
  handle(event: CkanWebhookEvent, signature: string, rawBody: string): Promise<void>;
}

/**
 * Publication pipeline (CKAN-10).
 * Orchestrates: Pod read → SHACL validate → translate → CKAN publish → disclosure ledger.
 */
export interface PublicationPipeline {
  /**
   * Publish a Pod resource to CKAN.
   * @param podResourceIri The Pod resource to publish.
   * @returns The publication job with final status.
   */
  publish(podResourceIri: string): Promise<PublicationJob>;

  /** Get the status of a publication job. */
  getJobStatus(idempotencyKey: string): Promise<PublicationJob | undefined>;

  /** Retry a quarantined/failed job. */
  retry(idempotencyKey: string): Promise<PublicationJob>;
}

/**
 * Correction propagation (CKAN-12).
 * Propagates Databox correction dispositions to CKAN datasets.
 */
export interface CorrectionPropagator {
  /**
   * Propagate a correction disposition to CKAN.
   * @param job The correction propagation job.
   */
  propagate(job: CorrectionPropagationJob): Promise<void>;
}

/**
 * Reconciliation and drift detection (CKAN-13).
 * Periodically compares Pod state with CKAN state.
 */
export interface ReconciliationService {
  /** Run a single reconciliation sweep. */
  sweep(): Promise<readonly ReconciliationDrift[]>;

  /** Start periodic reconciliation at the configured interval. */
  start(): void;

  /** Stop periodic reconciliation. */
  stop(): void;
}

/**
 * CKAN→Pod metadata feedback (CKAN-15).
 * Writes append-only annotations to the Pod disclosure-view when CKAN metadata changes.
 */
export interface MetadataFeedback {
  /**
   * Write a metadata annotation to the Pod disclosure-view.
   * @param drift The detected drift.
   */
  annotate(drift: ReconciliationDrift): Promise<void>;
}

/**
 * Disclosure ledger integration (reuses Databox evidence patterns, ADR-0011).
 * Records publication events as append-only evidence.
 */
export interface DisclosureLedger {
  /**
   * Record a publication event.
   * @param job The publication job that completed.
   */
  recordPublication(job: PublicationJob): Promise<void>;

  /**
   * Record a correction propagation event.
   * @param job The correction propagation job.
   */
  recordCorrection(job: CorrectionPropagationJob): Promise<void>;

  /**
   * Record an anonymisation decision.
   * @param podResourceIri The Pod resource.
   * @param decisions The anonymisation decisions.
   */
  recordAnonymisation(podResourceIri: string, decisions: readonly unknown[]): Promise<void>;
}

/**
 * The main bridge service (CKAN-10+).
 * Orchestrates all components. Constructed from a BridgeConfig.
 */
export interface CkanBridgeService {
  /** Start the bridge service. */
  start(): Promise<void>;

  /** Stop the bridge service gracefully. */
  stop(): Promise<void>;

  /** The bridge configuration. */
  readonly config: BridgeConfig;
}
