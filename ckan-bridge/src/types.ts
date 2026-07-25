/**
 * Shared types for the CKAN Bridge (CKAN-01).
 *
 * The CKAN bridge is an **opt-in deployment profile** — it does not change the default CSS install
 * path and is not required for non-CKAN Databox deployments. These types mirror the contracts defined
 * in the CKAN Bridge Specification (databox/devdocs/dbx-06-ckan-bridge-specification.md).
 *
 * Conventions follow the existing Databox bridge patterns (src/databox/bridge/BridgeTypes.ts):
 * - All identifiers are opaque — no raw customer IDs (invariant 2).
 * - Pure value types — no runtime logic — so contracts are stated once and cannot drift.
 * - Fail-closed semantics throughout.
 */

/**
 * Databox-specific metadata fields attached to CKAN datasets. These are IRI references back to the
 * Solid Pod — the Pod retains the authoritative signed artifacts; CKAN stores only the link.
 */
export interface CkanDatasetMetadata {
  /** The Pod resource IRI this dataset was published from. */
  readonly databoxProvenanceIri: string;
  /** The ODRL policy IRI governing the source record. */
  readonly databoxPolicyIri: string;
  /** The SHACL shape IRI used to validate the data before publication. */
  readonly databoxShaclShapeIri: string;
  /** The signed consent receipt IRI authorising the publication. */
  readonly databoxConsentReceiptIri: string;
}

/**
 * The RPC-style envelope for a CKAN Action API request (CKAN uses RPC, not REST).
 * Endpoint: POST /api/3/action/{action}
 * Reference: https://docs.ckan.org/en/latest/api/
 */
export interface CkanActionRequest {
  /** The action name, e.g. 'package_show', 'datastore_create'. */
  readonly action: string;
  /** The JSON dictionary of parameters for the action. */
  readonly data: Readonly<Record<string, unknown>>;
}

/**
 * The RPC-style response from a CKAN Action API call. CKAN always returns HTTP 200;
 * success/failure is determined by parsing the 'success' key in the JSON body.
 */
export interface CkanActionResponse<T = unknown> {
  /** The action that was called. */
  readonly action: string;
  /** Whether the action succeeded. CKAN returns 200 even on failure — check this field. */
  readonly success: boolean;
  /** The result payload on success. */
  readonly result?: T;
  /** The error payload on failure. */
  readonly error?: CkanActionError;
}

/** A CKAN API error payload. */
export interface CkanActionError {
  /** A short error message. */
  readonly message?: string;
  /** The error type (e.g. 'Validation Error', 'Not Found', 'Authorization Error'). */
  readonly __type?: string;
  /** Field-level validation errors. */
  readonly [key: string]: unknown;
}

/**
 * A publication job: the unit of work for publishing a Pod resource to CKAN.
 * Keyed by Pod resource IRI + content digest for idempotency — a retry reuses the same key
 * and MUST NOT create a duplicate CKAN dataset.
 */
export interface PublicationJob {
  /** Stable idempotency key: sha256(podResourceIri:contentDigest). */
  readonly idempotencyKey: string;
  /** The Pod resource IRI to publish from. */
  readonly podResourceIri: string;
  /** SHA-256 hex digest of the Pod resource content at the time of job creation. */
  readonly contentDigest: string;
  /** The CKAN dataset id (assigned on first publication, reused on updates). */
  readonly ckanDatasetId?: string;
  /** The CKAN organization id this dataset belongs to. */
  readonly ckanOrganizationId: string;
  /** The Databox metadata to attach to the CKAN dataset. */
  readonly metadata: CkanDatasetMetadata;
  /** Current job status. */
  readonly status: PublicationJobStatus;
  /** ISO-8601 timestamp of job creation. */
  readonly createdAt: string;
  /** ISO-8601 timestamp of last status change. */
  readonly updatedAt: string;
  /** Non-leaking reason token when status is 'failed' or 'quarantined'. */
  readonly reason?: string;
  /** Number of retry attempts (bounded). */
  readonly retryCount: number;
}

/** The lifecycle states of a publication job. */
export type PublicationJobStatus =
  | 'pending'
  | 'reading-pod'
  | 'validating'
  | 'translating'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'quarantined';

/**
 * Bridge configuration loaded from environment / Kubernetes ConfigMap + Secrets.
 * Secrets are referenced by path, never inlined.
 */
export interface BridgeConfig {
  /** The CKAN base URL, e.g. 'https://ckan.example.org/'. */
  readonly ckanBaseUrl: string;
  /** Filesystem path to the CKAN API token (Kubernetes Secret mount). */
  readonly ckanApiTokenFile: string;
  /** Filesystem path to the DPoP private key (Kubernetes Secret mount). */
  readonly dpopKeyFile: string;
  /** Filesystem path to the SHACL shapes file (ConfigMap mount). */
  readonly shaclShapesFile: string;
  /** Filesystem path to the program profile configuration. */
  readonly programProfileFile: string;
  /** The bridge's program-specific service identity (ADR-0018). */
  readonly serviceIdentity: BridgeServiceIdentity;
  /** Webhook shared secret file path for HMAC verification (CKAN plugin → bridge). */
  readonly webhookSecretFile: string;
  /** Maximum retry attempts for failed publication jobs. */
  readonly maxRetries: number;
  /** Reconciliation sweep interval in seconds. */
  readonly reconciliationIntervalSeconds: number;
}

/**
 * The bridge's own program-specific service identity (ADR-0018; mirrors
 * ProgramServiceIdentity from src/databox/bridge/BridgeTypes.ts but scoped to the CKAN bridge).
 */
export interface BridgeServiceIdentity {
  /** Opaque accountable-organisation identifier (tenant scoping). */
  readonly organisation: string;
  /** Opaque program identifier within the organisation. */
  readonly program: string;
  /** The bridge's own software service identity (a distinct service WebID, HD-02). */
  readonly serviceIdentity: string;
  /** The trusted institutional signer identifier. */
  readonly issuer: string;
}

/**
 * A webhook event received from the CKAN plugin. Carries only opaque ids and a callback URL —
 * no sensitive content. The bridge fetches details via the Action API using its service token.
 */
export interface CkanWebhookEvent {
  /** The webhook event type. */
  readonly type: CkanWebhookEventType;
  /** The opaque CKAN dataset id (or resource id for datastore events). */
  readonly datasetId?: string;
  /** The opaque CKAN resource id (for datastore events). */
  readonly resourceId?: string;
  /** Callback URL for fetching details via the Action API. */
  readonly callbackUrl: string;
  /** ISO-8601 timestamp of the event. */
  readonly timestamp: string;
}

/** The webhook event types emitted by the CKAN plugin. */
export type CkanWebhookEventType =
  | 'dataset_created'
  | 'dataset_updated'
  | 'dataset_deleted'
  | 'datastore_created'
  | 'datastore_upserted';

/** The result of a SHACL validation check. */
export interface ShaclValidationResult {
  /** Whether the data conforms to the SHACL shapes. */
  readonly conforms: boolean;
  /** Violation details when conformance fails. */
  readonly violations: readonly ShaclViolation[];
  /** The SHACL shape IRI used for validation. */
  readonly shapeIri: string;
  /** ISO-8601 timestamp of the validation. */
  readonly validatedAt: string;
}

/** A single SHACL violation. */
export interface ShaclViolation {
  /** The focus node that violated the shape. */
  readonly focusNode: string;
  /** The SHACL path (property) that was violated. */
  readonly path: string;
  /** The human-readable violation message. */
  readonly message: string;
  /** The severity (sh:Info, sh:Warning, sh:Violation). */
  readonly severity: string;
  /** The source shape IRI. */
  readonly sourceShape: string;
}

/** The result of RDF→tabular translation + anonymisation. */
export interface TranslationResult {
  /** The translated tabular records (rows for datastore_upsert). */
  readonly records: Readonly<Record<string, unknown>>[];
  /** The CKAN datastore field definitions. */
  readonly fields: readonly CkanDatastoreField[];
  /** Whether any fields were anonymised/filtered. */
  readonly anonymised: boolean;
  /** The anonymisation decisions logged as evidence (ADR-0011). */
  readonly anonymisationDecisions: readonly AnonymisationDecision[];
}

/** A CKAN datastore field definition. */
export interface CkanDatastoreField {
  /** The field id (column name). */
  readonly id: string;
  /** The field type ('text', 'numeric', 'timestamp', etc.). */
  readonly type: string;
}

/** An anonymisation decision recorded as evidence. */
export interface AnonymisationDecision {
  /** The original field/property that was anonymised or stripped. */
  readonly field: string;
  /** The anonymisation action taken ('stripped', 'hashed', 'generalised'). */
  readonly action: 'stripped' | 'hashed' | 'generalised';
  /** The reason for anonymisation (program profile rule). */
  readonly reason: string;
}

/** A correction disposition from the Databox review workflow (ADR-0023). */
export type CorrectionDisposition =
  | 'corrected'
  | 'statement-associated'
  | 'partially-corrected'
  | 'no-change'
  | 'more-information-required'
  | 'redirected';

/** A correction propagation job: updating CKAN after a Databox disposition. */
export interface CorrectionPropagationJob {
  /** The Pod record IRI that was corrected. */
  readonly podRecordIri: string;
  /** The CKAN dataset id that was published from this record. */
  readonly ckanDatasetId: string;
  /** The disposition issued by the reviewer. */
  readonly disposition: CorrectionDisposition;
  /** The supersession pointer (if corrected/statement-associated). */
  readonly supersedes?: string;
  /** Per-recipient notification duties (ADR-0023). */
  readonly recipientDuties: readonly RecipientNotificationDuty[];
  /** ISO-8601 timestamp of the disposition. */
  readonly dispositionAt: string;
}

/** A per-recipient notification duty for correction propagation (ADR-0023). */
export interface RecipientNotificationDuty {
  /** The recipient identifier (opaque). */
  readonly recipientId: string;
  /** The duty state. */
  readonly state: 'queued' | 'attempted' | 'accepted' | 'failed';
  /** ISO-8601 timestamp of the last state change. */
  readonly updatedAt: string;
  /** Whether a lawful exception was applied. */
  readonly exceptionApplied?: string;
}

/** Reconciliation drift between a Pod resource and its CKAN dataset. */
export interface ReconciliationDrift {
  /** The Pod resource IRI. */
  readonly podResourceIri: string;
  /** The CKAN dataset id. */
  readonly ckanDatasetId: string;
  /** The drift type. */
  readonly type: 'editor-originated' | 'pod-originated' | 'orphaned-ckan';
  /** The fields that drifted. */
  readonly driftedFields: readonly string[];
  /** ISO-8601 timestamp of detection. */
  readonly detectedAt: string;
}
