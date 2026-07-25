import { describe, it, expect } from '@jest/globals';
import { createHash } from 'node:crypto';
import { InMemoryPublicationPipeline, PublicationError } from '../src/publication-pipeline.js';
import { InMemoryDisclosureLedger } from '../src/bridge-service.js';
import type { BridgeConfig, PublicationJob } from '../src/types.js';
import type { CkanActionClient, CkanPackage, ShaclValidator, RdfTranslator, DisclosureLedger } from '../src/interfaces.js';
import type { ShaclValidationResult, TranslationResult, CkanActionResponse } from '../src/types.js';
import type { SolidOidcClient, CachedToken } from '../src/solid-oidc-client.js';

const MOCK_CONFIG: BridgeConfig = {
  ckanBaseUrl: 'https://ckan.example.org/',
  ckanApiTokenFile: '/dev/null',
  dpopKeyFile: '/dev/null',
  shaclShapesFile: '/dev/null',
  programProfileFile: '/dev/null',
  webhookSecretFile: '/dev/null',
  maxRetries: 3,
  reconciliationIntervalSeconds: 300,
  serviceIdentity: {
    organisation: 'gov-agency',
    program: 'open-data',
    serviceIdentity: 'https://databox.example.org/agents/ckan-bridge',
    issuer: 'https://databox.example.org/',
  },
};

class MockCkanClient implements CkanActionClient {
  async call<T = unknown>(request: { action: string; data: unknown }): Promise<CkanActionResponse<T>> {
    return { action: request.action, success: true, result: { id: 'ckan-001', name: 'test', title: 'Test' } as unknown as T };
  }
  async packageShow(id: string): Promise<CkanActionResponse<CkanPackage>> {
    return { action: 'package_show', success: true, result: { id, name: 'test', title: 'Test' } };
  }
  async packageCreate(data: Readonly<Record<string, unknown>>): Promise<CkanActionResponse<CkanPackage>> {
    return { action: 'package_create', success: true, result: { id: 'ckan-new', name: data.name as string, title: data.title as string } };
  }
  async packageUpdate(id: string, data: Readonly<Record<string, unknown>>): Promise<CkanActionResponse<CkanPackage>> {
    return { action: 'package_update', success: true, result: { id, name: 'test', title: 'Test' } };
  }
  async datastoreCreate(resourceId: string, fields: unknown[], records: unknown[]): Promise<CkanActionResponse> {
    return { action: 'datastore_create', success: true };
  }
  async datastoreUpsert(resourceId: string, records: unknown[], method?: string): Promise<CkanActionResponse> {
    return { action: 'datastore_upsert', success: true };
  }
}

class MockShaclValidator implements ShaclValidator {
  async validate(podResourceIri: string): Promise<ShaclValidationResult> {
    return { conforms: true, violations: [], shapeIri: 'mock', validatedAt: new Date().toISOString() };
  }
  async validateContent(rdfContent: string, contentType: string, shapeIri: string): Promise<ShaclValidationResult> {
    return { conforms: true, violations: [], shapeIri, validatedAt: new Date().toISOString() };
  }
}

class MockTranslator implements RdfTranslator {
  async translate(podResourceIri: string): Promise<TranslationResult> {
    return { records: [{ a: 1 }], fields: [{ id: 'a', type: 'numeric' }], anonymised: false, anonymisationDecisions: [] };
  }
}

class MockOidcClient {
  async getAccessToken(podIri: string): Promise<CachedToken> {
    return { token: 'mock-token', expiresAt: Date.now() + 300000, dpopProof: 'mock-proof', audience: podIri };
  }
  generateRequestProof(method: string, url: string, accessToken: string): string {
    return 'mock-request-proof';
  }
}

describe('CKAN-10: Publication pipeline', () => {
  describe('idempotencyKey', () => {
    it('computes SHA-256 of podResourceIri:contentDigest', () => {
      const key = InMemoryPublicationPipeline.idempotencyKey('https://pod.example.org/r1', 'abc123');
      expect(key).toHaveLength(64);
      expect(key).toMatch(/^[0-9a-f]+$/);
    });

    it('produces different keys for different inputs', () => {
      const k1 = InMemoryPublicationPipeline.idempotencyKey('https://pod.example.org/r1', 'abc');
      const k2 = InMemoryPublicationPipeline.idempotencyKey('https://pod.example.org/r2', 'abc');
      const k3 = InMemoryPublicationPipeline.idempotencyKey('https://pod.example.org/r1', 'def');
      expect(k1).not.toBe(k2);
      expect(k1).not.toBe(k3);
    });
  });

  describe('publish', () => {
    it('publishes a Pod resource to CKAN end-to-end', async () => {
      const ledger = new InMemoryDisclosureLedger();
      const pipeline = new InMemoryPublicationPipeline({
        config: MOCK_CONFIG,
        ckanClient: new MockCkanClient(),
        shaclValidator: new MockShaclValidator(),
        translator: new MockTranslator(),
        oidcClient: new MockOidcClient() as unknown as SolidOidcClient,
        ledger,
      });

      // Mock fetch for Pod read
      const originalFetch = global.fetch;
      global.fetch = (async (): Promise<Response> => new Response('<a> <b> <c> .', {
        status: 200, headers: { 'Content-Type': 'text/turtle' },
      })) as typeof fetch;

      const job = await pipeline.publish('https://pod.example.org/r1');
      expect(job.status).toBe('published');
      expect(job.ckanDatasetId).toBe('ckan-new');
      expect(job.podResourceIri).toBe('https://pod.example.org/r1');

      global.fetch = originalFetch;

      // Ledger should have recorded the publication
      expect(ledger.publications).toHaveLength(1);
      expect(ledger.publications[0].podResourceIri).toBe('https://pod.example.org/r1');
    });

    it('quarantines on SHACL validation failure', async () => {
      const ledger = new InMemoryDisclosureLedger();
      const failingValidator: ShaclValidator = {
        validate: async () => ({ conforms: false, violations: [{ focusNode: 'x', path: 'y', message: 'fail', severity: 'sh:Violation', sourceShape: 's' }], shapeIri: 'mock', validatedAt: new Date().toISOString() }),
        validateContent: async () => ({ conforms: false, violations: [{ focusNode: 'x', path: 'y', message: 'fail', severity: 'sh:Violation', sourceShape: 's' }], shapeIri: 'mock', validatedAt: new Date().toISOString() }),
      };

      const pipeline = new InMemoryPublicationPipeline({
        config: MOCK_CONFIG,
        ckanClient: new MockCkanClient(),
        shaclValidator: failingValidator,
        translator: new MockTranslator(),
        oidcClient: new MockOidcClient() as unknown as SolidOidcClient,
        ledger,
      });

      const originalFetch = global.fetch;
      global.fetch = (async (): Promise<Response> => new Response('<a> <b> <c> .', {
        status: 200, headers: { 'Content-Type': 'text/turtle' },
      })) as typeof fetch;

      const job = await pipeline.publish('https://pod.example.org/r1');
      expect(job.status).toBe('quarantined');
      expect(job.reason).toBe('shacl-validation-failed');

      global.fetch = originalFetch;
    });

    it('fails on Pod HTTP error', async () => {
      const ledger = new InMemoryDisclosureLedger();
      const pipeline = new InMemoryPublicationPipeline({
        config: MOCK_CONFIG,
        ckanClient: new MockCkanClient(),
        shaclValidator: new MockShaclValidator(),
        translator: new MockTranslator(),
        oidcClient: new MockOidcClient() as unknown as SolidOidcClient,
        ledger,
      });

      const originalFetch = global.fetch;
      global.fetch = (async (): Promise<Response> => new Response('Not found', { status: 404 })) as typeof fetch;

      await expect(pipeline.publish('https://pod.example.org/r1')).rejects.toThrow(PublicationError);

      global.fetch = originalFetch;
    });
  });

  describe('getJobStatus', () => {
    it('returns undefined for unknown job', async () => {
      const ledger = new InMemoryDisclosureLedger();
      const pipeline = new InMemoryPublicationPipeline({
        config: MOCK_CONFIG,
        ckanClient: new MockCkanClient(),
        shaclValidator: new MockShaclValidator(),
        translator: new MockTranslator(),
        oidcClient: new MockOidcClient() as unknown as SolidOidcClient,
        ledger,
      });
      const job = await pipeline.getJobStatus('nonexistent');
      expect(job).toBeUndefined();
    });
  });
});
