import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateKeyPairSync } from 'node:crypto';
import { PodMetadataFeedback } from '../src/metadata-feedback.js';
import { InMemoryDisclosureLedger } from '../src/bridge-service.js';
import { SolidOidcClient } from '../src/solid-oidc-client.js';
import type { ReconciliationDrift } from '../src/types.js';

const TMP_KEY = join(tmpdir(), `feedback-dpop-key-${Date.now()}.pem`);

describe('CKAN-15: CKAN metadata feedback (CKAN→Pod)', () => {
  beforeEach(() => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    writeFileSync(TMP_KEY, privateKey.export({ type: 'pkcs8', format: 'pem' }) as string, 'utf8');
  });

  afterEach(() => {
    if (existsSync(TMP_KEY)) unlinkSync(TMP_KEY);
  });

  describe('feedbackContainerIri', () => {
    it('computes the feedback container IRI', () => {
      const iri = PodMetadataFeedback.feedbackContainerIri('https://pod.example.org/data/r1');
      expect(iri).toBe('https://pod.example.org/data/r1/ckan-feedback/');
    });

    it('handles trailing slash', () => {
      const iri = PodMetadataFeedback.feedbackContainerIri('https://pod.example.org/data/r1/');
      expect(iri).toBe('https://pod.example.org/data/r1/ckan-feedback/');
    });
  });

  describe('signEntry', () => {
    it('produces a sha256 signature', () => {
      const ledger = new InMemoryDisclosureLedger();
      const oidcClient = new SolidOidcClient({
        issuer: 'https://databox.example.org/',
        clientId: 'test',
        dpopKeyFile: TMP_KEY,
        tokenLifetimeSeconds: 300,
      });
      const feedback = new PodMetadataFeedback({
        oidcClient,
        ledger,
        serviceIdentity: 'https://databox.example.org/agents/bridge',
      });

      const sig = feedback.signEntry({
        podResourceIri: 'https://pod.example.org/r1',
        ckanDatasetId: 'ckan-001',
        field: 'tags',
        newValue: '["open-data"]',
        changedBy: 'editor',
        changedAt: '2026-07-25T00:00:00Z',
      });
      expect(sig).toMatch(/^sha256:[0-9a-f]{64}$/);
    });
  });

  describe('writeFeedback', () => {
    it('writes a signed feedback entry', async () => {
      const originalFetch = global.fetch;
      global.fetch = (async (url: string | URL | Request): Promise<Response> => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        if (urlStr.includes('.well-known/openid-configuration')) {
          return new Response(JSON.stringify({ token_endpoint: 'https://databox.example.org/token' }), {
            status: 200, headers: { 'Content-Type': 'application/json' },
          });
        }
        if (urlStr.includes('/token')) {
          return new Response(JSON.stringify({
            access_token: 'mock-token', token_type: 'DPoP', expires_in: 300,
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response('ok', { status: 200 });
      }) as typeof fetch;

      const ledger = new InMemoryDisclosureLedger();
      const oidcClient = new SolidOidcClient({
        issuer: 'https://databox.example.org/',
        clientId: 'test',
        dpopKeyFile: TMP_KEY,
        tokenLifetimeSeconds: 300,
      });
      const feedback = new PodMetadataFeedback({
        oidcClient,
        ledger,
        serviceIdentity: 'https://databox.example.org/agents/bridge',
      });

      const entry = await feedback.writeFeedback({
        podResourceIri: 'https://pod.example.org/r1',
        ckanDatasetId: 'ckan-001',
        field: 'tags',
        previousValue: '[]',
        newValue: '["open-data"]',
        changedBy: 'editor-1',
        changedAt: '2026-07-25T00:00:00Z',
      });

      expect(entry.bridgeSignature).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(entry.field).toBe('tags');
      expect(entry.newValue).toBe('["open-data"]');

      global.fetch = originalFetch;
    });
  });

  describe('annotate', () => {
    it('annotates a drift event as metadata feedback', async () => {
      const originalFetch = global.fetch;
      global.fetch = (async (url: string | URL | Request): Promise<Response> => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        if (urlStr.includes('.well-known/openid-configuration')) {
          return new Response(JSON.stringify({ token_endpoint: 'https://databox.example.org/token' }), {
            status: 200, headers: { 'Content-Type': 'application/json' },
          });
        }
        if (urlStr.includes('/token')) {
          return new Response(JSON.stringify({
            access_token: 'mock-token', token_type: 'DPoP', expires_in: 300,
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response('ok', { status: 200 });
      }) as typeof fetch;

      const ledger = new InMemoryDisclosureLedger();
      const oidcClient = new SolidOidcClient({
        issuer: 'https://databox.example.org/',
        clientId: 'test',
        dpopKeyFile: TMP_KEY,
        tokenLifetimeSeconds: 300,
      });
      const feedback = new PodMetadataFeedback({
        oidcClient,
        ledger,
        serviceIdentity: 'https://databox.example.org/agents/bridge',
      });

      const drift: ReconciliationDrift = {
        podResourceIri: 'https://pod.example.org/r1',
        ckanDatasetId: 'ckan-001',
        type: 'editor-originated',
        driftedFields: ['tags', 'title'],
        detectedAt: '2026-07-25T00:00:00Z',
      };

      await feedback.annotate(drift);

      global.fetch = originalFetch;
    });
  });
});
