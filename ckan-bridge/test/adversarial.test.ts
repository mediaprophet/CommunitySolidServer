/**
 * Adversarial security tests for the CKAN Bridge (CKAN-14).
 *
 * These tests verify the security invariants of the bridge under attack scenarios:
 * 1. Forged webhook signature → rejected
 * 2. Replay attack (duplicate webhook) → deduplicated
 * 3. SHACL validation bypass → quarantined
 * 4. PII leakage (Civics data) → stripped
 * 5. Non-DPoP token → rejected
 * 6. Missing DPoP key → fail closed
 * 7. Direct CSS→CKAN path → blocked by network policy
 * 8. Privilege escalation → blocked by security context
 * 9. Token expiry → refresh required
 * 10. Unmapped assurance claim → fail closed
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { HmacWebhookHandler, WebhookError } from '../src/webhook-handler.js';
import { SolidOidcClient, SolidOidcError } from '../src/solid-oidc-client.js';
import { ProgramProfileRdfTranslator, isCivicsProperty } from '../src/rdf-translator.js';
import { evaluateAssurance, GovIdpError, type AssuranceCrosswalk } from '../src/gov-idp.js';
import type { CkanWebhookEvent } from '../src/types.js';
import { validateK8sManifests } from './adversarial-k8s-helper.js';

const TMP_SECRET = join(tmpdir(), `adv-webhook-secret-${Date.now()}`);
const TMP_KEY = join(tmpdir(), `adv-dpop-key-${Date.now()}.pem`);

function writeSecret(content: string): void {
  writeFileSync(TMP_SECRET, content, 'utf8');
}

function writeKey(): void {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  writeFileSync(TMP_KEY, privateKey.export({ type: 'pkcs8', format: 'pem' }) as string, 'utf8');
}

function cleanup(): void {
  if (existsSync(TMP_SECRET)) unlinkSync(TMP_SECRET);
  if (existsSync(TMP_KEY)) unlinkSync(TMP_KEY);
}

describe('CKAN-14: Adversarial security tests', () => {
  beforeEach(() => {
    writeSecret('adversarial-secret\n');
    writeKey();
  });

  afterEach(() => {
    cleanup();
  });

  describe('1. Forged webhook signature', () => {
    it('rejects a forged signature', async () => {
      const handler = new HmacWebhookHandler({ webhookSecretFile: TMP_SECRET });
      const event: CkanWebhookEvent = {
        type: 'dataset_created',
        datasetId: 'test-001',
        callbackUrl: '',
        timestamp: '2026-07-25T00:00:00Z',
      };
      const rawBody = JSON.stringify(event);
      const forgedSig = 'a'.repeat(64); // Wrong signature

      await expect(handler.handle(event, forgedSig, rawBody))
        .rejects.toThrow(WebhookError);
    });

    it('rejects a signature with wrong length', async () => {
      const handler = new HmacWebhookHandler({ webhookSecretFile: TMP_SECRET });
      expect(handler.verifySignature('body', 'short')).toBe(false);
    });
  });

  describe('2. Replay attack (duplicate webhook)', () => {
    it('deduplicates identical events', async () => {
      const handler = new HmacWebhookHandler({ webhookSecretFile: TMP_SECRET });
      let callCount = 0;
      handler.on('dataset_created', async () => { callCount++; });

      const event: CkanWebhookEvent = {
        type: 'dataset_created',
        datasetId: 'test-001',
        callbackUrl: '',
        timestamp: '2026-07-25T00:00:00Z',
      };
      const rawBody = JSON.stringify(event);
      const secret = 'adversarial-secret';
      const sig = createHash('sha256').update(secret).update(rawBody).digest('hex');

      // Send the same event 5 times
      for (let i = 0; i < 5; i++) {
        await handler.handle(event, sig, rawBody);
      }
      expect(callCount).toBe(1); // Only processed once
    });
  });

  describe('3. SHACL validation bypass', () => {
    it('non-compliant data is quarantined, never published', async () => {
      // This is tested in publication-pipeline.test.ts — here we verify the invariant
      // The pipeline MUST quarantine on SHACL failure, never silently publish
      const { InMemoryPublicationPipeline } = await import('../src/publication-pipeline.js');
      const { InMemoryDisclosureLedger } = await import('../src/bridge-service.js');

      const ledger = new InMemoryDisclosureLedger();
      const failingValidator = {
        validate: async () => ({ conforms: false, violations: [], shapeIri: 'mock', validatedAt: new Date().toISOString() }),
        validateContent: async () => ({ conforms: false, violations: [], shapeIri: 'mock', validatedAt: new Date().toISOString() }),
      };

      const mockCkan = {
        call: async (r: { action: string }) => ({ action: r.action, success: true, result: { id: 'should-not-reach' } }),
        packageShow: async (id: string) => ({ action: 'package_show', success: true, result: { id, name: 'test', title: 'Test' } }),
        packageCreate: async () => ({ action: 'package_create', success: true, result: { id: 'should-not-reach', name: 'x', title: 'x' } }),
        packageUpdate: async (id: string) => ({ action: 'package_update', success: true, result: { id, name: 'x', title: 'x' } }),
        datastoreCreate: async () => ({ action: 'datastore_create', success: true }),
        datastoreUpsert: async () => ({ action: 'datastore_upsert', success: true }),
        datastoreSearch: async () => ({ action: 'datastore_search', success: true }),
        organizationShow: async () => ({ action: 'organization_show', success: true }),
        organizationCreate: async () => ({ action: 'organization_create', success: true }),
        userShow: async () => ({ action: 'user_show', success: true }),
        activityDataList: async () => ({ action: 'activity_data_list', success: true }),
      };

      const mockTranslator = {
        translate: async () => ({ records: [], fields: [], anonymised: false, anonymisationDecisions: [] }),
      };

      const mockOidc = {
        getAccessToken: async (iri: string) => ({ token: 'mock', expiresAt: Date.now() + 300000, dpopProof: 'mock', audience: iri }),
        generateRequestProof: () => 'mock',
      };

      const pipeline = new InMemoryPublicationPipeline({
        config: {
          ckanBaseUrl: 'https://ckan.example.org/',
          ckanApiTokenFile: '/dev/null',
          dpopKeyFile: '/dev/null',
          shaclShapesFile: '/dev/null',
          programProfileFile: '/dev/null',
          webhookSecretFile: '/dev/null',
          maxRetries: 3,
          reconciliationIntervalSeconds: 300,
          serviceIdentity: { organisation: 'org', program: 'prog', serviceIdentity: 'si', issuer: 'iss' },
        },
        ckanClient: mockCkan as never,
        shaclValidator: failingValidator as never,
        translator: mockTranslator as never,
        oidcClient: mockOidc as never,
        ledger,
      });

      const originalFetch = global.fetch;
      global.fetch = (async (): Promise<Response> => new Response('<a> <b> <c> .', {
        status: 200, headers: { 'Content-Type': 'text/turtle' },
      })) as typeof fetch;

      const job = await pipeline.publish('https://pod.example.org/r1');
      expect(job.status).toBe('quarantined');
      expect(job.ckanDatasetId).toBeUndefined(); // Never published

      global.fetch = originalFetch;
    });
  });

  describe('4. PII leakage (Civics data)', () => {
    it('Civics (natural person) properties are stripped', () => {
      expect(isCivicsProperty('https://ns.webcivics.net/civics/customerName')).toBe(true);
      expect(isCivicsProperty('https://ns.webcivics.net/civic/agencyName')).toBe(false);
    });

    it('Civics data never appears in translated records', async () => {
      const translator = new ProgramProfileRdfTranslator({
        fieldMappings: [
          { propertyUri: 'https://ns.webcivics.net/civics/customerName', ckanFieldId: 'customer_name', ckanFieldType: 'text' },
          { propertyUri: 'https://example.org/def/price', ckanFieldId: 'price', ckanFieldType: 'numeric' },
        ],
        anonymisationRules: [],
      });

      const result = await translator.translateQuads([
        { subject: 's1', predicate: 'https://ns.webcivics.net/civics/customerName', object: 'John Doe' },
        { subject: 's1', predicate: 'https://example.org/def/price', object: '19.99' },
      ]);

      // customer_name must NOT be in the record
      expect(result.records[0].customer_name).toBeUndefined();
      // price should be present
      expect(result.records[0].price).toBe('19.99');
      // Anonymisation decision should record the stripping
      expect(result.anonymisationDecisions.some(d => d.action === 'stripped')).toBe(true);
    });
  });

  describe('5. Non-DPoP token rejection', () => {
    it('rejects a Bearer token (not DPoP-bound)', async () => {
      const originalFetch = global.fetch;
      global.fetch = (async (url: string | URL | Request): Promise<Response> => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        if (urlStr.includes('.well-known/openid-configuration')) {
          return new Response(JSON.stringify({ token_endpoint: 'https://databox.example.org/token' }), {
            status: 200, headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({
          access_token: 'bearer-token',
          token_type: 'Bearer',
          expires_in: 300,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }) as typeof fetch;

      const client = new SolidOidcClient({
        issuer: 'https://databox.example.org/',
        clientId: 'test',
        dpopKeyFile: TMP_KEY,
        tokenLifetimeSeconds: 300,
      });

      await expect(client.getAccessToken('https://pod.example.org/r1'))
        .rejects.toThrow(SolidOidcError);

      global.fetch = originalFetch;
    });
  });

  describe('6. Missing DPoP key', () => {
    it('fails closed when key file is missing', () => {
      unlinkSync(TMP_KEY);
      expect(() => new SolidOidcClient({
        issuer: 'https://databox.example.org/',
        clientId: 'test',
        dpopKeyFile: TMP_KEY,
        tokenLifetimeSeconds: 300,
      })).toThrow(SolidOidcError);
    });

    it('fails closed when key is invalid', () => {
      writeFileSync(TMP_KEY, 'not a valid key', 'utf8');
      expect(() => new SolidOidcClient({
        issuer: 'https://databox.example.org/',
        clientId: 'test',
        dpopKeyFile: TMP_KEY,
        tokenLifetimeSeconds: 300,
      })).toThrow(SolidOidcError);
    });
  });

  describe('7. Kubernetes network isolation', () => {
    it('validates all network policies are in place', () => {
      const result = validateK8sManifests();
      expect(result.errors).toHaveLength(0);
      expect(result.passed.length).toBeGreaterThanOrEqual(10);
    });
  });

  describe('8. Token expiry buffer', () => {
    it('tokens within 30s of expiry are treated as invalid', () => {
      const client = new SolidOidcClient({
        issuer: 'https://databox.example.org/',
        clientId: 'test',
        dpopKeyFile: TMP_KEY,
        tokenLifetimeSeconds: 300,
      });
      expect(client.isTokenValid({
        token: 'test',
        expiresAt: Date.now() + 15_000, // 15s — within 30s buffer
        dpopProof: 'proof',
        audience: 'test',
      })).toBe(false);
    });
  });

  describe('9. Unmapped assurance claim', () => {
    it('fails closed on unmapped claim value', () => {
      const crosswalk: AssuranceCrosswalk = {
        version: '1.0.0',
        issuedBy: 'test',
        signature: 'a.b.c',
        mappings: [{
          claim: 'ial',
          dimension: 'identity_proofing',
          rules: [{ match: '2', value: 'IAL2' }],
        }],
      };
      expect(() => evaluateAssurance({ ial: '99' }, crosswalk, [])).toThrow(GovIdpError);
    });
  });

  describe('10. Webhook secret file missing', () => {
    it('fails closed when secret file is missing', async () => {
      unlinkSync(TMP_SECRET);
      const handler = new HmacWebhookHandler({ webhookSecretFile: TMP_SECRET });
      const event: CkanWebhookEvent = {
        type: 'dataset_created',
        datasetId: 'test',
        callbackUrl: '',
        timestamp: '2026-07-25T00:00:00Z',
      };
      await expect(handler.handle(event, 'sig', JSON.stringify(event)))
        .rejects.toThrow(WebhookError);
    });
  });
});
