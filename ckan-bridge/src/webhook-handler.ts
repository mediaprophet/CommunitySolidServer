/**
 * Webhook event handler for the CKAN Bridge (CKAN-09).
 *
 * Receives webhooks from the CKAN plugin, verifies HMAC-SHA256 signatures,
 * and routes events to the appropriate handler.
 *
 * Key properties:
 * - HMAC-SHA256 signature verification (fail closed on mismatch)
 * - Shared secret loaded from Kubernetes Secret mount
 * - Idempotent: duplicate events are deduplicated by event id
 * - Routes: dataset_created → trigger reconciliation, dataset_updated → drift check,
 *   dataset_deleted → orphan cleanup, datastore_* → data sync
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { CkanWebhookEvent, CkanWebhookEventType } from './types.js';
import type { WebhookHandler } from './interfaces.js';

/** Error thrown when webhook handling fails. */
export class WebhookError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'WebhookError';
  }
}

/** Callback type for webhook event handlers. */
export type WebhookEventCallback = (event: CkanWebhookEvent) => Promise<void>;

/**
 * HMAC-SHA256 webhook handler with signature verification.
 */
export class HmacWebhookHandler implements WebhookHandler {
  private readonly secretFile: string;
  private secret: Buffer | null = null;
  private readonly seenEventIds = new Set<string>();
  private readonly callbacks = new Map<CkanWebhookEventType, WebhookEventCallback[]>();

  constructor(config: { readonly webhookSecretFile: string }) {
    this.secretFile = config.webhookSecretFile;
  }

  /** Load the webhook secret from file (lazy loading). */
  private getSecret(): Buffer {
    if (this.secret !== null) {
      return this.secret;
    }
    try {
      this.secret = Buffer.from(readFileSync(this.secretFile, 'utf8').trim(), 'utf8');
    } catch {
      throw new WebhookError(`Webhook secret file not found: ${this.secretFile}`, 'SECRET_NOT_FOUND');
    }
    return this.secret;
  }

  /** Register a callback for a specific event type. */
  on(eventType: CkanWebhookEventType, callback: WebhookEventCallback): void {
    if (!this.callbacks.has(eventType)) {
      this.callbacks.set(eventType, []);
    }
    const callbacks = this.callbacks.get(eventType);
    if (callbacks) {
      callbacks.push(callback);
    }
  }

  /** Compute the expected HMAC-SHA256 signature for a body. */
  computeSignature(body: string): string {
    const secret = this.getSecret();
    return createHash('sha256').update(secret).update(body).digest('hex');
  }

  /** Verify the HMAC-SHA256 signature (constant-time comparison). */
  verifySignature(body: string, signature: string): boolean {
    const expected = this.computeSignature(body);
    const expectedBuf = Buffer.from(expected, 'hex');
    const providedBuf = Buffer.from(signature, 'hex');

    if (expectedBuf.length !== providedBuf.length) {
      return false;
    }

    try {
      return timingSafeEqual(expectedBuf, providedBuf);
    } catch {
      return false;
    }
  }

  /** Check if an event has already been processed (idempotency). */
  isDuplicate(event: CkanWebhookEvent): boolean {
    const eventId = `${event.type}:${event.datasetId ?? event.resourceId}:${event.timestamp}`;
    if (this.seenEventIds.has(eventId)) {
      return true;
    }
    this.seenEventIds.add(eventId);
    return false;
  }

  async handle(event: CkanWebhookEvent, signature: string, rawBody: string): Promise<void> {
    // Verify signature (fail closed)
    if (!this.verifySignature(rawBody, signature)) {
      throw new WebhookError('Invalid webhook signature', 'SIGNATURE_INVALID');
    }

    // Check for duplicate (idempotency)
    if (this.isDuplicate(event)) {
      return; // Already processed — skip silently
    }

    // Route to registered callbacks
    const callbacks = this.callbacks.get(event.type) ?? [];
    for (const callback of callbacks) {
      await callback(event);
    }
  }

  /** Clear the seen events set (for testing or memory management). */
  clearSeenEvents(): void {
    this.seenEventIds.clear();
  }
}
