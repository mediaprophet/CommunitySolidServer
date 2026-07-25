import { describe, it, expect } from '@jest/globals';
import type {
  CkanActionRequest,
  CkanActionResponse,
  CkanDatasetMetadata,
  CkanWebhookEvent,
  PublicationJob,
  BridgeConfig,
  ShaclValidationResult,
  TranslationResult,
  CorrectionPropagationJob,
  ReconciliationDrift,
  RecipientNotificationDuty,
} from '../src/types.js';

describe('CKAN-01: shared types', () => {
  describe('CkanDatasetMetadata', () => {
    it('holds IRI references to Pod artifacts', () => {
      const meta: CkanDatasetMetadata = {
        databoxProvenanceIri: 'https://databox.example/boxes/bx_123/records/receipt/r_456',
        databoxPolicyIri: 'https://databox.example/policies/member-v1',
        databoxShaclShapeIri: 'https://dev.linkeddata.au/def/solid-databox-compliance#ReceiptShape',
        databoxConsentReceiptIri: 'https://databox.example/boxes/bx_123/receipts/rt_789',
      };
      expect(meta.databoxProvenanceIri).toContain('databox.example');
      expect(meta.databoxPolicyIri).toContain('member-v1');
    });
  });

  describe('CkanActionRequest', () => {
    it('structures an RPC-style action call', () => {
      const req: CkanActionRequest = {
        action: 'package_show',
        data: { id: 'test-dataset-001' },
      };
      expect(req.action).toBe('package_show');
      expect(req.data.id).toBe('test-dataset-001');
    });
  });

  describe('CkanActionResponse', () => {
    it('represents a successful response', () => {
      const res: CkanActionResponse<{ id: string }> = {
        action: 'package_show',
        success: true,
        result: { id: 'test-dataset-001' },
      };
      expect(res.success).toBe(true);
      expect(res.result?.id).toBe('test-dataset-001');
      expect(res.error).toBeUndefined();
    });

    it('represents a failed response (HTTP 200 but success=false)', () => {
      const res: CkanActionResponse = {
        action: 'package_create',
        success: false,
        error: { __type: 'Validation Error', message: 'Name is required' },
      };
      expect(res.success).toBe(false);
      expect(res.error?.__type).toBe('Validation Error');
      expect(res.result).toBeUndefined();
    });
  });

  describe('PublicationJob', () => {
    it('tracks a publication lifecycle', () => {
      const job: PublicationJob = {
        idempotencyKey: 'sha256:abc123',
        podResourceIri: 'https://databox.example/boxes/bx_123/records/receipt/r_456',
        contentDigest: 'a1b2c3d4e5f6',
        ckanOrganizationId: 'org-gov-agency',
        metadata: {
          databoxProvenanceIri: 'https://databox.example/boxes/bx_123/records/receipt/r_456',
          databoxPolicyIri: 'https://databox.example/policies/member-v1',
          databoxShaclShapeIri: 'https://dev.linkeddata.au/def/solid-databox-compliance#ReceiptShape',
          databoxConsentReceiptIri: 'https://databox.example/boxes/bx_123/receipts/rt_789',
        },
        status: 'pending',
        createdAt: '2026-07-25T00:00:00Z',
        updatedAt: '2026-07-25T00:00:00Z',
        retryCount: 0,
      };
      expect(job.status).toBe('pending');
      expect(job.retryCount).toBe(0);
      expect(job.ckanDatasetId).toBeUndefined();
    });

    it('tracks a published job with ckan dataset id', () => {
      const job: PublicationJob = {
        idempotencyKey: 'sha256:abc123',
        podResourceIri: 'https://databox.example/boxes/bx_123/records/receipt/r_456',
        contentDigest: 'a1b2c3d4e5f6',
        ckanDatasetId: 'ckan-dataset-001',
        ckanOrganizationId: 'org-gov-agency',
        metadata: {
          databoxProvenanceIri: 'https://databox.example/boxes/bx_123/records/receipt/r_456',
          databoxPolicyIri: 'https://databox.example/policies/member-v1',
          databoxShaclShapeIri: 'https://dev.linkeddata.au/def/solid-databox-compliance#ReceiptShape',
          databoxConsentReceiptIri: 'https://databox.example/boxes/bx_123/receipts/rt_789',
        },
        status: 'published',
        createdAt: '2026-07-25T00:00:00Z',
        updatedAt: '2026-07-25T00:10:00Z',
        retryCount: 0,
      };
      expect(job.status).toBe('published');
      expect(job.ckanDatasetId).toBe('ckan-dataset-001');
    });

    it('tracks a quarantined job with reason', () => {
      const job: PublicationJob = {
        idempotencyKey: 'sha256:abc123',
        podResourceIri: 'https://databox.example/boxes/bx_123/records/receipt/r_456',
        contentDigest: 'a1b2c3d4e5f6',
        ckanOrganizationId: 'org-gov-agency',
        metadata: {
          databoxProvenanceIri: 'https://databox.example/boxes/bx_123/records/receipt/r_456',
          databoxPolicyIri: 'https://databox.example/policies/member-v1',
          databoxShaclShapeIri: 'https://dev.linkeddata.au/def/solid-databox-compliance#ReceiptShape',
          databoxConsentReceiptIri: 'https://databox.example/boxes/bx_123/receipts/rt_789',
        },
        status: 'quarantined',
        createdAt: '2026-07-25T00:00:00Z',
        updatedAt: '2026-07-25T00:05:00Z',
        retryCount: 3,
        reason: 'shacl-validation-failed',
      };
      expect(job.status).toBe('quarantined');
      expect(job.reason).toBe('shacl-validation-failed');
    });
  });

  describe('BridgeConfig', () => {
    it('references secrets by path, never inlines them', () => {
      const config: BridgeConfig = {
        ckanBaseUrl: 'https://ckan.example.org/',
        ckanApiTokenFile: '/run/secrets/ckan-api-token',
        dpopKeyFile: '/run/secrets/bridge-dpop-key',
        shaclShapesFile: '/config/bridge-shacl-shapes.ttl',
        programProfileFile: '/config/program-profile.json',
        webhookSecretFile: '/run/secrets/webhook-secret',
        serviceIdentity: {
          organisation: 'gov-agency',
          program: 'open-data',
          serviceIdentity: 'https://databox.example/agents/ckan-bridge-gov-open-data',
          issuer: 'https://databox.example/issuers/gov-agency',
        },
        maxRetries: 5,
        reconciliationIntervalSeconds: 300,
      };
      expect(config.ckanApiTokenFile).toContain('/run/secrets/');
      expect(config.serviceIdentity.organisation).toBe('gov-agency');
    });
  });

  describe('CkanWebhookEvent', () => {
    it('carries only opaque ids and a callback url', () => {
      const event: CkanWebhookEvent = {
        type: 'dataset_created',
        datasetId: 'ckan-dataset-001',
        callbackUrl: 'https://ckan.example.org/api/3/action/package_show?id=ckan-dataset-001',
        timestamp: '2026-07-25T00:00:00Z',
      };
      expect(event.type).toBe('dataset_created');
      expect(event.datasetId).toBe('ckan-dataset-001');
      expect(event.callbackUrl).toContain('package_show');
    });
  });

  describe('ShaclValidationResult', () => {
    it('represents a conforming validation', () => {
      const result: ShaclValidationResult = {
        conforms: true,
        violations: [],
        shapeIri: 'https://dev.linkeddata.au/def/solid-databox-compliance#ReceiptShape',
        validatedAt: '2026-07-25T00:00:00Z',
      };
      expect(result.conforms).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('represents a non-conforming validation with violations', () => {
      const result: ShaclValidationResult = {
        conforms: false,
        violations: [
          {
            focusNode: 'https://databox.example/boxes/bx_123/records/receipt/r_456',
            path: 'https://dev.linkeddata.au/def/solid-databox-compliance#consentReceipt',
            message: 'Consent receipt is required for publication',
            severity: 'sh:Violation',
            sourceShape: 'https://dev.linkeddata.au/def/solid-databox-compliance#PublicationShape',
          },
        ],
        shapeIri: 'https://dev.linkeddata.au/def/solid-databox-compliance#ReceiptShape',
        validatedAt: '2026-07-25T00:00:00Z',
      };
      expect(result.conforms).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].severity).toBe('sh:Violation');
    });
  });

  describe('TranslationResult', () => {
    it('represents translated records with anonymisation evidence', () => {
      const result: TranslationResult = {
        records: [
          { product: 'Widget A', price: 19.99 },
          { product: 'Widget B', price: 29.99 },
        ],
        fields: [
          { id: 'product', type: 'text' },
          { id: 'price', type: 'numeric' },
        ],
        anonymised: true,
        anonymisationDecisions: [
          { field: 'customerName', action: 'stripped', reason: 'PII per program profile' },
        ],
      };
      expect(result.records).toHaveLength(2);
      expect(result.anonymised).toBe(true);
      expect(result.anonymisationDecisions[0].action).toBe('stripped');
    });
  });

  describe('CorrectionPropagationJob', () => {
    it('tracks per-recipient notification duties', () => {
      const duties: RecipientNotificationDuty[] = [
        { recipientId: 'recipient-001', state: 'accepted', updatedAt: '2026-07-25T01:00:00Z' },
        { recipientId: 'recipient-002', state: 'queued', updatedAt: '2026-07-25T01:00:00Z' },
      ];
      const job: CorrectionPropagationJob = {
        podRecordIri: 'https://databox.example/boxes/bx_123/records/receipt/r_456',
        ckanDatasetId: 'ckan-dataset-001',
        disposition: 'corrected',
        supersedes: 'https://databox.example/boxes/bx_123/records/receipt/r_455',
        recipientDuties: duties,
        dispositionAt: '2026-07-25T00:30:00Z',
      };
      expect(job.disposition).toBe('corrected');
      expect(job.recipientDuties).toHaveLength(2);
      expect(job.recipientDuties[0].state).toBe('accepted');
      expect(job.recipientDuties[1].state).toBe('queued');
    });
  });

  describe('ReconciliationDrift', () => {
    it('classifies editor-originated drift', () => {
      const drift: ReconciliationDrift = {
        podResourceIri: 'https://databox.example/boxes/bx_123/records/receipt/r_456',
        ckanDatasetId: 'ckan-dataset-001',
        type: 'editor-originated',
        driftedFields: ['title', 'notes'],
        detectedAt: '2026-07-25T02:00:00Z',
      };
      expect(drift.type).toBe('editor-originated');
      expect(drift.driftedFields).toContain('title');
    });

    it('classifies orphaned CKAN datasets', () => {
      const drift: ReconciliationDrift = {
        podResourceIri: 'https://databox.example/boxes/bx_123/records/receipt/r_456',
        ckanDatasetId: 'ckan-dataset-001',
        type: 'orphaned-ckan',
        driftedFields: [],
        detectedAt: '2026-07-25T02:00:00Z',
      };
      expect(drift.type).toBe('orphaned-ckan');
    });
  });
});
