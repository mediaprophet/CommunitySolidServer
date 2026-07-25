import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { HmacWebhookHandler, WebhookError } from '../src/webhook-handler.js';
import type { CkanWebhookEvent } from '../src/types.js';

const TMP_SECRET = join(tmpdir(), `test-webhook-secret-${Date.now()}`);

describe('CKAN-09: Webhook event handler', () => {
  beforeEach(() => {
    writeFileSync(TMP_SECRET, 'test-webhook-secret\n', 'utf8');
  });

  afterEach(() => {
    if (existsSync(TMP_SECRET)) {
      unlinkSync(TMP_SECRET);
    }
  });

  describe('signature verification', () => {
    it('verifies a correct HMAC-SHA256 signature', () => {
      const handler = new HmacWebhookHandler({ webhookSecretFile: TMP_SECRET });
      const body = '{"type":"dataset_created","dataset_id":"test-001"}';
      const secret = 'test-webhook-secret';
      const expectedSig = createHash('sha256').update(secret).update(body).digest('hex');
      expect(handler.verifySignature(body, expectedSig)).toBe(true);
    });

    it('rejects an incorrect signature', () => {
      const handler = new HmacWebhookHandler({ webhookSecretFile: TMP_SECRET });
      expect(handler.verifySignature('body', 'wrong-signature')).toBe(false);
    });

    it('rejects a signature of different length', () => {
      const handler = new HmacWebhookHandler({ webhookSecretFile: TMP_SECRET });
      expect(handler.verifySignature('body', 'short')).toBe(false);
    });
  });

  describe('handle', () => {
    it('processes a valid webhook and calls registered callbacks', async () => {
      const handler = new HmacWebhookHandler({ webhookSecretFile: TMP_SECRET });
      let callbackCalled = false;
      handler.on('dataset_created', async () => { callbackCalled = true; });

      const event: CkanWebhookEvent = {
        type: 'dataset_created',
        datasetId: 'test-001',
        callbackUrl: 'https://ckan.example.org/api/3/action/package_show?id=test-001',
        timestamp: '2026-07-25T00:00:00Z',
      };
      const rawBody = JSON.stringify(event);
      const secret = 'test-webhook-secret';
      const sig = createHash('sha256').update(secret).update(rawBody).digest('hex');

      await handler.handle(event, sig, rawBody);
      expect(callbackCalled).toBe(true);
    });

    it('fails closed on invalid signature', async () => {
      const handler = new HmacWebhookHandler({ webhookSecretFile: TMP_SECRET });
      const event: CkanWebhookEvent = {
        type: 'dataset_created',
        datasetId: 'test-001',
        callbackUrl: '',
        timestamp: '2026-07-25T00:00:00Z',
      };
      await expect(handler.handle(event, 'wrong-sig', JSON.stringify(event)))
        .rejects.toThrow(WebhookError);
    });

    it('deduplicates duplicate events (idempotency)', async () => {
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
      const secret = 'test-webhook-secret';
      const sig = createHash('sha256').update(secret).update(rawBody).digest('hex');

      await handler.handle(event, sig, rawBody);
      await handler.handle(event, sig, rawBody); // Duplicate
      expect(callCount).toBe(1);
    });

    it('fails closed when secret file is missing', async () => {
      unlinkSync(TMP_SECRET);
      const handler = new HmacWebhookHandler({ webhookSecretFile: TMP_SECRET });
      const event: CkanWebhookEvent = {
        type: 'dataset_created',
        datasetId: 'test-001',
        callbackUrl: '',
        timestamp: '2026-07-25T00:00:00Z',
      };
      await expect(handler.handle(event, 'sig', JSON.stringify(event)))
        .rejects.toThrow(WebhookError);
    });
  });

  describe('clearSeenEvents', () => {
    it('clears the deduplication set', async () => {
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
      const secret = 'test-webhook-secret';
      const sig = createHash('sha256').update(secret).update(rawBody).digest('hex');

      await handler.handle(event, sig, rawBody);
      handler.clearSeenEvents();
      await handler.handle(event, sig, rawBody);
      expect(callCount).toBe(2);
    });
  });
});
