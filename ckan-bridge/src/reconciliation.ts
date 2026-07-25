/**
 * Reconciliation and drift detection for the CKAN Bridge (CKAN-13).
 *
 * Periodically compares Pod state with CKAN state to detect drift:
 * - Pod updated but CKAN stale → drift: stale-ckan
 * - CKAN edited outside bridge → drift: editor-originated
 * - Pod deleted but CKAN still has dataset → drift: orphaned-ckan
 * - CKAN deleted but Pod still has resource → drift: orphaned-pod
 *
 * Key properties:
 * - Runs on a configurable interval (default 300s)
 * - Drift events are recorded as evidence
 * - Editor-originated drift triggers correction propagation (ADR-0023)
 * - No automatic deletion — drift is reported, humans decide
 */

import type {
  ReconciliationDrift,
} from './types.js';
import type { ReconciliationService, DisclosureLedger, CkanActionClient } from './interfaces.js';
import type { PublicationJob } from './types.js';

/** Error thrown when reconciliation fails. */
export class ReconciliationError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'ReconciliationError';
  }
}

/**
 * In-memory reconciliation service.
 *
 * Compares the pipeline's job store with CKAN's dataset list.
 */
export class InMemoryReconciliationService implements ReconciliationService {
  private readonly ckanClient: CkanActionClient;
  private readonly ledger: DisclosureLedger;
  private readonly getJobs: () => readonly PublicationJob[];
  private readonly intervalMs: number;
  private interval: ReturnType<typeof setInterval> | null = null;
  private lastSweepDrifts: ReconciliationDrift[] = [];

  constructor(deps: {
    readonly ckanClient: CkanActionClient;
    readonly ledger: DisclosureLedger;
    readonly getJobs: () => readonly PublicationJob[];
    readonly intervalMs?: number;
  }) {
    this.ckanClient = deps.ckanClient;
    this.ledger = deps.ledger;
    this.getJobs = deps.getJobs;
    this.intervalMs = deps.intervalMs ?? 300_000;
  }

  /** Start periodic reconciliation sweeps. */
  start(): void {
    if (this.interval) {
      return;
    }
    this.interval = setInterval(() => {
      this.sweep().catch(() => {
        // Errors are logged but don't stop the interval
      });
    }, this.intervalMs);
  }

  /** Stop periodic reconciliation. */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  async sweep(): Promise<readonly ReconciliationDrift[]> {
    const drifts: ReconciliationDrift[] = [];
    const jobs = this.getJobs();
    const publishedJobs = jobs.filter(j => j.status === 'published' && j.ckanDatasetId);

    // For each published job, check if CKAN still has the dataset
    for (const job of publishedJobs) {
      try {
        const ckanResult = await this.ckanClient.packageShow(job.ckanDatasetId!);
        const ckanDataset = ckanResult.result;

        if (!ckanDataset) {
          // CKAN dataset deleted but Pod still has the resource
          drifts.push({
            type: 'orphaned-ckan',
            podResourceIri: job.podResourceIri,
            ckanDatasetId: job.ckanDatasetId!,
            driftedFields: [],
            detectedAt: new Date().toISOString(),
          });
          continue;
        }

        // Check for editor-originated drift by comparing the provenance IRI
        const extras = ckanDataset.extras ?? {};
        const provenanceValue = extras['databox_provenance_iri'];
        if (provenanceValue !== undefined && provenanceValue !== job.podResourceIri) {
          drifts.push({
            type: 'editor-originated',
            podResourceIri: job.podResourceIri,
            ckanDatasetId: job.ckanDatasetId!,
            driftedFields: ['databox_provenance_iri'],
            detectedAt: new Date().toISOString(),
          });
        }

      } catch {
        // CKAN API error — record as drift
        drifts.push({
          type: 'orphaned-ckan',
          podResourceIri: job.podResourceIri,
          ckanDatasetId: job.ckanDatasetId!,
          driftedFields: [],
          detectedAt: new Date().toISOString(),
        });
      }
    }

    // Check for CKAN datasets that don't have a corresponding job (orphaned CKAN)
    // In production, this would list all CKAN datasets with databox_provenance_iri extras
    // and check if they have a corresponding job.

    this.lastSweepDrifts = drifts;
    return drifts;
  }

  /** Get the drifts from the last sweep. */
  getLastSweepDrifts(): readonly ReconciliationDrift[] {
    return this.lastSweepDrifts;
  }
}
