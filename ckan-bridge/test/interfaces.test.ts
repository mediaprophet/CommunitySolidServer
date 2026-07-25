import { describe, it, expect } from '@jest/globals';
import type {
  CkanActionClient,
  CkanPackage,
  SolidOidcClient,
  SolidAccessToken,
  ShaclValidator,
  RdfTranslator,
  WebhookHandler,
  PublicationPipeline,
  CorrectionPropagator,
  ReconciliationService,
  MetadataFeedback,
  DisclosureLedger,
  CkanBridgeService,
} from '../src/interfaces.js';
import type {
  CkanActionResponse,
  PublicationJob,
  ShaclValidationResult,
  TranslationResult,
  ReconciliationDrift,
  CorrectionPropagationJob,
  CkanWebhookEvent,
  BridgeConfig,
} from '../src/types.js';

describe('CKAN-01: interface contracts', () => {
  describe('CkanActionClient', () => {
    it('defines the CKAN Action API client contract', () => {
      const mockClient: CkanActionClient = {
        call: async <T = unknown>(req: { action: string; data: Readonly<Record<string, unknown>> }): Promise<CkanActionResponse<T>> => {
          return { action: req.action, success: true, result: {} as T };
        },
        packageShow: async (id: string): Promise<CkanActionResponse<CkanPackage>> => {
          return { action: 'package_show', success: true, result: { id, name: 'test', title: 'Test' } };
        },
        packageCreate: async (data: Readonly<Record<string, unknown>>): Promise<CkanActionResponse<CkanPackage>> => {
          return { action: 'package_create', success: true, result: { id: 'new', name: 'test', title: 'Test', ...data } as CkanPackage };
        },
        packageUpdate: async (id: string, data: Readonly<Record<string, unknown>>): Promise<CkanActionResponse<CkanPackage>> => {
          return { action: 'package_update', success: true, result: { id, name: 'test', title: 'Test', ...data } as CkanPackage };
        },
        datastoreCreate: async (): Promise<CkanActionResponse> => {
          return { action: 'datastore_create', success: true };
        },
        datastoreUpsert: async (): Promise<CkanActionResponse> => {
          return { action: 'datastore_upsert', success: true };
        },
        datastoreSearch: async (): Promise<CkanActionResponse> => {
          return { action: 'datastore_search', success: true };
        },
        organizationShow: async (): Promise<CkanActionResponse> => {
          return { action: 'organization_show', success: true };
        },
        organizationCreate: async (): Promise<CkanActionResponse> => {
          return { action: 'organization_create', success: true };
        },
        userShow: async (): Promise<CkanActionResponse> => {
          return { action: 'user_show', success: true };
        },
        activityDataList: async (): Promise<CkanActionResponse> => {
          return { action: 'activity_data_list', success: true };
        },
      };
      expect(mockClient).toBeDefined();
    });
  });

  describe('SolidOidcClient', () => {
    it('defines the Solid-OIDC token acquisition contract', () => {
      const mockClient: SolidOidcClient = {
        getAccessToken: async (podIri: string): Promise<SolidAccessToken> => {
          return {
            token: 'mock-token',
            expiresAt: new Date(Date.now() + 300000).toISOString(),
            dpopProof: 'mock-proof',
            audience: podIri,
          };
        },
        isTokenValid: (token: SolidAccessToken): boolean => {
          return new Date(token.expiresAt) > new Date();
        },
      };
      expect(mockClient).toBeDefined();
    });
  });

  describe('ShaclValidator', () => {
    it('defines the SHACL validation contract', () => {
      const mockValidator: ShaclValidator = {
        validate: async (podResourceIri: string): Promise<ShaclValidationResult> => {
          return {
            conforms: true,
            violations: [],
            shapeIri: 'https://dev.linkeddata.au/def/solid-databox-compliance#PublicationShape',
            validatedAt: new Date().toISOString(),
          };
        },
        validateContent: async (rdfContent: string, contentType: string, shapeIri: string): Promise<ShaclValidationResult> => {
          return {
            conforms: true,
            violations: [],
            shapeIri,
            validatedAt: new Date().toISOString(),
          };
        },
      };
      expect(mockValidator).toBeDefined();
    });
  });

  describe('RdfTranslator', () => {
    it('defines the RDF→tabular translation contract', () => {
      const mockTranslator: RdfTranslator = {
        translate: async (podResourceIri: string): Promise<TranslationResult> => {
          return {
            records: [{ product: 'Test' }],
            fields: [{ id: 'product', type: 'text' }],
            anonymised: false,
            anonymisationDecisions: [],
          };
        },
      };
      expect(mockTranslator).toBeDefined();
    });
  });

  describe('WebhookHandler', () => {
    it('defines the webhook handler contract', () => {
      const mockHandler: WebhookHandler = {
        handle: async (event: CkanWebhookEvent, signature: string, rawBody: string): Promise<void> => {
          // Mock implementation
        },
      };
      expect(mockHandler).toBeDefined();
    });
  });

  describe('PublicationPipeline', () => {
    it('defines the publication pipeline contract', () => {
      const mockPipeline: PublicationPipeline = {
        publish: async (podResourceIri: string): Promise<PublicationJob> => {
          return {
            idempotencyKey: 'sha256:test',
            podResourceIri,
            contentDigest: 'abc123',
            ckanOrganizationId: 'org-test',
            metadata: {
              databoxProvenanceIri: podResourceIri,
              databoxPolicyIri: 'https://example.org/policy',
              databoxShaclShapeIri: 'https://example.org/shape',
              databoxConsentReceiptIri: 'https://example.org/receipt',
            },
            status: 'published',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            retryCount: 0,
          };
        },
        getJobStatus: async (key: string): Promise<PublicationJob | undefined> => undefined,
        retry: async (key: string): Promise<PublicationJob> => {
          return {
            idempotencyKey: key,
            podResourceIri: 'https://example.org/resource',
            contentDigest: 'abc123',
            ckanOrganizationId: 'org-test',
            metadata: {
              databoxProvenanceIri: 'https://example.org/resource',
              databoxPolicyIri: 'https://example.org/policy',
              databoxShaclShapeIri: 'https://example.org/shape',
              databoxConsentReceiptIri: 'https://example.org/receipt',
            },
            status: 'pending',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            retryCount: 1,
          };
        },
      };
      expect(mockPipeline).toBeDefined();
    });
  });

  describe('CorrectionPropagator', () => {
    it('defines the correction propagation contract', () => {
      const mockPropagator: CorrectionPropagator = {
        propagate: async (job: CorrectionPropagationJob): Promise<CorrectionPropagationJob> => {
          return job;
        },
        getJobStatus: async (idempotencyKey: string): Promise<CorrectionPropagationJob | undefined> => {
          return undefined;
        },
      };
      expect(mockPropagator).toBeDefined();
    });
  });

  describe('ReconciliationService', () => {
    it('defines the reconciliation contract', () => {
      const mockReconciliation: ReconciliationService = {
        sweep: async (): Promise<readonly ReconciliationDrift[]> => [],
        start: () => {},
        stop: () => {},
      };
      expect(mockReconciliation).toBeDefined();
    });
  });

  describe('MetadataFeedback', () => {
    it('defines the metadata feedback contract', () => {
      const mockFeedback: MetadataFeedback = {
        annotate: async (drift: ReconciliationDrift): Promise<void> => {
          // Mock implementation
        },
      };
      expect(mockFeedback).toBeDefined();
    });
  });

  describe('DisclosureLedger', () => {
    it('defines the disclosure ledger contract', () => {
      const mockLedger: DisclosureLedger = {
        recordPublication: async (job: PublicationJob): Promise<void> => {},
        recordCorrection: async (job: CorrectionPropagationJob): Promise<void> => {},
        recordAnonymisation: async (podResourceIri: string, decisions: readonly unknown[]): Promise<void> => {},
      };
      expect(mockLedger).toBeDefined();
    });
  });

  describe('CkanBridgeService', () => {
    it('defines the main bridge service contract', () => {
      const config: BridgeConfig = {
        ckanBaseUrl: 'https://ckan.example.org/',
        ckanApiTokenFile: '/run/secrets/ckan-api-token',
        dpopKeyFile: '/run/secrets/bridge-dpop-key',
        shaclShapesFile: '/config/shapes.ttl',
        programProfileFile: '/config/profile.json',
        webhookSecretFile: '/run/secrets/webhook',
        serviceIdentity: {
          organisation: 'test',
          program: 'test',
          serviceIdentity: 'https://example.org/agent',
          issuer: 'https://example.org/issuer',
        },
        maxRetries: 3,
        reconciliationIntervalSeconds: 60,
      };
      const mockService: CkanBridgeService = {
        config,
        start: async () => {},
        stop: async () => {},
      };
      expect(mockService.config.ckanBaseUrl).toBe('https://ckan.example.org/');
    });
  });
});
