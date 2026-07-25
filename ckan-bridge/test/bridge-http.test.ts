import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateKeyPairSync, createHash } from 'node:crypto';
import { CkanBridgeServiceImpl } from '../src/bridge-service.js';
import type { BridgeConfig } from '../src/types.js';
import type { CkanWebhookEvent } from '../src/types.js';

const TMP_DIR = join(tmpdir(), `bridge-http-${Date.now()}`);
const TMP_KEY = join(TMP_DIR, 'dpop-key.pem');
const TMP_TOKEN = join(TMP_DIR, 'ckan-token');
const TMP_SHAPES = join(TMP_DIR, 'shapes.ttl');
const TMP_SECRET = join(TMP_DIR, 'webhook-secret');
const TMP_PROFILE = join(TMP_DIR, 'program-profile.json');

function makeConfig(): BridgeConfig {
  return {
    ckanBaseUrl: 'https://ckan.example.org/',
    ckanApiTokenFile: TMP_TOKEN,
    dpopKeyFile: TMP_KEY,
    shaclShapesFile: TMP_SHAPES,
    programProfileFile: TMP_PROFILE,
    webhookSecretFile: TMP_SECRET,
    maxRetries: 3,
    reconciliationIntervalSeconds: 60,
    serviceIdentity: {
      organisation: 'org', program: 'prog',
      serviceIdentity: 'si', issuer: 'https://databox.example.org/',
    },
  };
}

describe('CKAN-11: Bridge HTTP server', () => {
  let service: CkanBridgeServiceImpl;

  beforeEach(() => {
    mkdirSync(TMP_DIR, { recursive: true });
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    writeFileSync(TMP_KEY, privateKey.export({ type: 'pkcs8', format: 'pem' }) as string, 'utf8');
    writeFileSync(TMP_TOKEN, 'token\n', 'utf8');
    writeFileSync(TMP_SHAPES, '@prefix sh: <http://www.w3.org/ns/shacl#> .\n', 'utf8');
    writeFileSync(TMP_SECRET, 'webhook-secret\n', 'utf8');
    writeFileSync(TMP_PROFILE, JSON.stringify({
      organisation: 'org', program: 'prog', serviceIdentity: 'si', issuer: 'https://databox.example.org/',
    }), 'utf8');

    process.env.BRIDGE_PORT = '0'; // Random port
  });

  afterEach(async () => {
    if (service) {
      await service.stop();
    }
    if (existsSync(TMP_DIR)) {
      for (const f of [TMP_KEY, TMP_TOKEN, TMP_SHAPES, TMP_SECRET, TMP_PROFILE]) {
        if (existsSync(f)) unlinkSync(f);
      }
    }
    delete process.env.BRIDGE_PORT;
  });

  describe('GET /health', () => {
    it('returns 200 with status ok', async () => {
      service = new CkanBridgeServiceImpl(makeConfig());
      await service.start();

      const address = (service as unknown as { server: { address(): { port: number } } }).server.address();
      const port = address.port;
      const res = await fetch(`http://localhost:${port}/health`);
      expect(res.status).toBe(200);
      const body = await res.json() as { status: string; service: string };
      expect(body.status).toBe('ok');
      expect(body.service).toBe('ckan-bridge');
    });
  });

  describe('POST /webhook', () => {
    it('returns 400 on invalid signature', async () => {
      service = new CkanBridgeServiceImpl(makeConfig());
      await service.start();

      const address = (service as unknown as { server: { address(): { port: number } } }).server.address();
      const port = address.port;
      const res = await fetch(`http://localhost:${port}/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-databox-signature': 'wrong' },
        body: JSON.stringify({ type: 'dataset_created', datasetId: 'x', timestamp: '2026-07-25T00:00:00Z' }),
      });
      expect(res.status).toBe(400);
      const body = await res.json() as { success: boolean };
      expect(body.success).toBe(false);
    });

    it('returns 200 on valid webhook', async () => {
      service = new CkanBridgeServiceImpl(makeConfig());
      await service.start();

      const address = (service as unknown as { server: { address(): { port: number } } }).server.address();
      const port = address.port;

      const event: CkanWebhookEvent = {
        type: 'dataset_created',
        datasetId: 'test-001',
        callbackUrl: '',
        timestamp: '2026-07-25T00:00:00Z',
      };
      const rawBody = JSON.stringify(event);
      const sig = createHash('sha256').update('webhook-secret').update(rawBody).digest('hex');

      const res = await fetch(`http://localhost:${port}/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-databox-signature': sig },
        body: rawBody,
      });
      expect(res.status).toBe(200);
      const body = await res.json() as { success: boolean };
      expect(body.success).toBe(true);
    });
  });

  describe('POST /publish', () => {
    it('returns 400 when podResourceIri is missing', async () => {
      service = new CkanBridgeServiceImpl(makeConfig());
      await service.start();

      const address = (service as unknown as { server: { address(): { port: number } } }).server.address();
      const port = address.port;
      const res = await fetch(`http://localhost:${port}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('404 handler', () => {
    it('returns 404 for unknown paths', async () => {
      service = new CkanBridgeServiceImpl(makeConfig());
      await service.start();

      const address = (service as unknown as { server: { address(): { port: number } } }).server.address();
      const port = address.port;
      const res = await fetch(`http://localhost:${port}/unknown`);
      expect(res.status).toBe(404);
    });
  });
});
