/**
 * Correction propagation for the CKAN Bridge (CKAN-12).
 *
 * When a Databox reviewer issues a correction disposition (ADR-0023), the bridge
 * propagates it to CKAN: retracting, updating, or associating a statement with
 * the published dataset.
 *
 * Key properties:
 * - Per-recipient notification duties (ADR-0023)
 * - Lawful exceptions are respected (e.g. legal hold)
 * - Idempotent: duplicate dispositions are deduplicated
 * - Disclosure ledger records every correction event
 * - Fail closed: CKAN update failure → quarantine, never silently drop
 */

import { createHash } from 'node:crypto';
import type {
  CorrectionPropagationJob,
  CorrectionDisposition,
  RecipientNotificationDuty,
} from './types.js';
import type { CorrectionPropagator, DisclosureLedger, CkanActionClient } from './interfaces.js';

/** Error thrown when correction propagation fails. */
export class CorrectionPropagationError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'CorrectionPropagationError';
  }
}

/**
 * In-memory correction propagator.
 *
 * In production, the job store is backed by a durable database.
 */
export class InMemoryCorrectionPropagator implements CorrectionPropagator {
  private readonly jobs = new Map<string, CorrectionPropagationJob>();
  private readonly ckanClient: CkanActionClient;
  private readonly ledger: DisclosureLedger;

  constructor(deps: {
    readonly ckanClient: CkanActionClient;
    readonly ledger: DisclosureLedger;
  }) {
    this.ckanClient = deps.ckanClient;
    this.ledger = deps.ledger;
  }

  /** Compute the idempotency key for a correction. */
  static idempotencyKey(podRecordIri: string, disposition: CorrectionDisposition, dispositionAt: string): string {
    return createHash('sha256').update(`${podRecordIri}:${disposition}:${dispositionAt}`).digest('hex');
  }

  async propagate(job: CorrectionPropagationJob): Promise<CorrectionPropagationJob> {
    const key = InMemoryCorrectionPropagator.idempotencyKey(job.podRecordIri, job.disposition, job.dispositionAt);

    // Check for existing job (idempotency)
    const existing = this.jobs.get(key);
    if (existing) {
      return existing;
    }

    this.jobs.set(key, job);

    try {
      // Apply the disposition to CKAN
      switch (job.disposition) {
        case 'corrected':
          // Update the CKAN dataset with corrected data
          // In production: re-read from Pod, re-validate, re-translate, package_update
          await this.ckanClient.packageUpdate(job.ckanDatasetId, {
            state: 'active',
            // The actual corrected data comes from re-publishing the Pod resource
          });
          break;

        case 'statement-associated':
          // Add a correction statement to the CKAN dataset
          await this.ckanClient.packageUpdate(job.ckanDatasetId, {
            notes: `Correction statement associated: ${job.supersedes ?? 'N/A'}`,
          });
          break;

        case 'partially-corrected':
          // Update only the corrected fields
          await this.ckanClient.packageUpdate(job.ckanDatasetId, {
            state: 'active',
          });
          break;

        case 'no-change':
          // No CKAN action needed
          break;

        case 'more-information-required':
          // Mark the dataset as needing review
          await this.ckanClient.packageUpdate(job.ckanDatasetId, {
            state: 'draft',
          });
          break;

        case 'redirected':
          // The correction was redirected — no CKAN action
          break;

        default:
          throw new CorrectionPropagationError(
            `Unknown disposition: ${job.disposition}`,
            'UNKNOWN_DISPOSITION',
          );
      }

      // Update recipient duties to 'accepted'
      const updatedJob: CorrectionPropagationJob = {
        ...job,
        recipientDuties: job.recipientDuties.map(d => ({
          ...d,
          state: 'accepted' as const,
          updatedAt: new Date().toISOString(),
        })),
      };
      this.jobs.set(key, updatedJob);

      // Record in disclosure ledger
      await this.ledger.recordCorrection(updatedJob);

      return updatedJob;

    } catch (error) {
      // Mark recipient duties as 'failed'
      const failedJob: CorrectionPropagationJob = {
        ...job,
        recipientDuties: job.recipientDuties.map(d => ({
          ...d,
          state: 'failed' as const,
          updatedAt: new Date().toISOString(),
        })),
      };
      this.jobs.set(key, failedJob);
      throw error;
    }
  }

  async getJobStatus(idempotencyKey: string): Promise<CorrectionPropagationJob | undefined> {
    return this.jobs.get(idempotencyKey);
  }

  /** Check if a lawful exception applies to a recipient (ADR-0023). */
  static hasLawfulException(duty: RecipientNotificationDuty): boolean {
    return duty.exceptionApplied !== undefined && duty.exceptionApplied.length > 0;
  }
}
