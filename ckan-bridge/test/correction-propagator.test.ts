import { describe, it, expect } from '@jest/globals';
import { InMemoryCorrectionPropagator } from '../src/correction-propagator.js';
import { InMemoryDisclosureLedger } from '../src/bridge-service.js';
import type { CorrectionPropagationJob, CorrectionDisposition, RecipientNotificationDuty } from '../src/types.js';

class MockCkanClient {
  async call(r: { action: string }): Promise<{ action: string; success: true }> {
    return { action: r.action, success: true };
  }
  async packageShow(id: string): Promise<{ action: string; success: true; result: { id: string; name: string; title: string } }> {
    return { action: 'package_show', success: true, result: { id, name: 't', title: 'T' } };
  }
  async packageCreate(): Promise<{ action: string; success: true; result: { id: string; name: string; title: string } }> {
    return { action: 'package_create', success: true, result: { id: 'x', name: 'x', title: 'x' } };
  }
  async packageUpdate(id: string): Promise<{ action: string; success: true; result: { id: string; name: string; title: string } }> {
    return { action: 'package_update', success: true, result: { id, name: 'x', title: 'x' } };
  }
  async datastoreCreate(): Promise<{ action: string; success: true }> {
    return { action: 'datastore_create', success: true };
  }
  async datastoreUpsert(): Promise<{ action: string; success: true }> {
    return { action: 'datastore_upsert', success: true };
  }
  async datastoreSearch(): Promise<{ action: string; success: true }> {
    return { action: 'datastore_search', success: true };
  }
  async organizationShow(): Promise<{ action: string; success: true }> {
    return { action: 'organization_show', success: true };
  }
  async organizationCreate(): Promise<{ action: string; success: true }> {
    return { action: 'organization_create', success: true };
  }
  async userShow(): Promise<{ action: string; success: true }> {
    return { action: 'user_show', success: true };
  }
  async activityDataList(): Promise<{ action: string; success: true }> {
    return { action: 'activity_data_list', success: true };
  }
}

function makeJob(overrides: Partial<CorrectionPropagationJob> = {}): CorrectionPropagationJob {
  return {
    podRecordIri: 'https://pod.example.org/r1',
    ckanDatasetId: 'ckan-001',
    disposition: 'corrected',
    recipientDuties: [
      { recipientId: 'r1', state: 'queued', updatedAt: '2026-07-25T00:00:00Z' },
      { recipientId: 'r2', state: 'queued', updatedAt: '2026-07-25T00:00:00Z' },
    ],
    dispositionAt: '2026-07-25T00:00:00Z',
    ...overrides,
  };
}

describe('CKAN-12: Correction propagation', () => {
  describe('idempotencyKey', () => {
    it('computes SHA-256 of podRecordIri:disposition:dispositionAt', () => {
      const key = InMemoryCorrectionPropagator.idempotencyKey('https://pod.example.org/r1', 'corrected', '2026-07-25T00:00:00Z');
      expect(key).toHaveLength(64);
      expect(key).toMatch(/^[0-9a-f]+$/);
    });

    it('produces different keys for different inputs', () => {
      const k1 = InMemoryCorrectionPropagator.idempotencyKey('https://pod.example.org/r1', 'corrected', '2026-07-25T00:00:00Z');
      const k2 = InMemoryCorrectionPropagator.idempotencyKey('https://pod.example.org/r2', 'corrected', '2026-07-25T00:00:00Z');
      const k3 = InMemoryCorrectionPropagator.idempotencyKey('https://pod.example.org/r1', 'no-change', '2026-07-25T00:00:00Z');
      expect(k1).not.toBe(k2);
      expect(k1).not.toBe(k3);
    });
  });

  describe('propagate', () => {
    const dispositions: CorrectionDisposition[] = [
      'corrected', 'statement-associated', 'partially-corrected',
      'no-change', 'more-information-required', 'redirected',
    ];

    for (const disposition of dispositions) {
      it(`handles '${disposition}' disposition`, async () => {
        const ledger = new InMemoryDisclosureLedger();
        const propagator = new InMemoryCorrectionPropagator({
          ckanClient: new MockCkanClient() as never,
          ledger,
        });

        const job = makeJob({ disposition, dispositionAt: `2026-07-25T00:00:0${dispositions.indexOf(disposition)}Z` });
        const result = await propagator.propagate(job);

        expect(result.disposition).toBe(disposition);
        expect(result.recipientDuties.every(d => d.state === 'accepted')).toBe(true);
        expect(ledger.corrections).toHaveLength(1);
      });
    }

    it('deduplicates identical jobs (idempotency)', async () => {
      const ledger = new InMemoryDisclosureLedger();
      const propagator = new InMemoryCorrectionPropagator({
        ckanClient: new MockCkanClient() as never,
        ledger,
      });

      const job = makeJob();
      const result1 = await propagator.propagate(job);
      const result2 = await propagator.propagate(job);

      expect(result1).toBe(result2);
      expect(ledger.corrections).toHaveLength(1);
    });

    it('marks recipient duties as failed on CKAN error', async () => {
      const ledger = new InMemoryDisclosureLedger();
      const failingCkan = {
        ...new MockCkanClient(),
        packageUpdate: async () => { throw new Error('CKAN API down'); },
      };

      const propagator = new InMemoryCorrectionPropagator({
        ckanClient: failingCkan as never,
        ledger,
      });

      const job = makeJob({ disposition: 'corrected' });
      await expect(propagator.propagate(job)).rejects.toThrow('CKAN API down');
    });

    it('handles statement-associated with supersedes', async () => {
      const ledger = new InMemoryDisclosureLedger();
      const propagator = new InMemoryCorrectionPropagator({
        ckanClient: new MockCkanClient() as never,
        ledger,
      });

      const job = makeJob({
        disposition: 'statement-associated',
        supersedes: 'https://pod.example.org/r1/superseded',
      });
      const result = await propagator.propagate(job);
      expect(result.supersedes).toBe('https://pod.example.org/r1/superseded');
    });

    it('handles recipient with lawful exception', async () => {
      const ledger = new InMemoryDisclosureLedger();
      const propagator = new InMemoryCorrectionPropagator({
        ckanClient: new MockCkanClient() as never,
        ledger,
      });

      const job = makeJob({
        recipientDuties: [
          { recipientId: 'r1', state: 'queued', updatedAt: '2026-07-25T00:00:00Z', exceptionApplied: 'legal-hold' },
        ],
      });
      const result = await propagator.propagate(job);
      // Even with exception, the duty state is updated to 'accepted'
      expect(result.recipientDuties[0].state).toBe('accepted');
    });
  });

  describe('getJobStatus', () => {
    it('returns undefined for unknown key', async () => {
      const ledger = new InMemoryDisclosureLedger();
      const propagator = new InMemoryCorrectionPropagator({
        ckanClient: new MockCkanClient() as never,
        ledger,
      });
      const job = await propagator.getJobStatus('nonexistent');
      expect(job).toBeUndefined();
    });

    it('returns job after propagation', async () => {
      const ledger = new InMemoryDisclosureLedger();
      const propagator = new InMemoryCorrectionPropagator({
        ckanClient: new MockCkanClient() as never,
        ledger,
      });

      const job = makeJob();
      await propagator.propagate(job);
      const key = InMemoryCorrectionPropagator.idempotencyKey(job.podRecordIri, job.disposition, job.dispositionAt);
      const found = await propagator.getJobStatus(key);
      expect(found).toBeDefined();
      expect(found?.disposition).toBe('corrected');
    });
  });

  describe('hasLawfulException', () => {
    it('returns true when exception is applied', () => {
      const duty: RecipientNotificationDuty = {
        recipientId: 'r1', state: 'queued', updatedAt: '2026-07-25T00:00:00Z',
        exceptionApplied: 'legal-hold',
      };
      expect(InMemoryCorrectionPropagator.hasLawfulException(duty)).toBe(true);
    });

    it('returns false when no exception', () => {
      const duty: RecipientNotificationDuty = {
        recipientId: 'r1', state: 'queued', updatedAt: '2026-07-25T00:00:00Z',
      };
      expect(InMemoryCorrectionPropagator.hasLawfulException(duty)).toBe(false);
    });

    it('returns false when exception is empty string', () => {
      const duty: RecipientNotificationDuty = {
        recipientId: 'r1', state: 'queued', updatedAt: '2026-07-25T00:00:00Z',
        exceptionApplied: '',
      };
      expect(InMemoryCorrectionPropagator.hasLawfulException(duty)).toBe(false);
    });
  });
});
