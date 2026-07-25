import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { InMemoryReconciliationService } from '../src/reconciliation.js';
import { InMemoryDisclosureLedger } from '../src/bridge-service.js';
import type { PublicationJob } from '../src/types.js';
import type { CkanActionClient, CkanPackage } from '../src/interfaces.js';
import type { CkanActionResponse } from '../src/types.js';

class MockCkanClient implements CkanActionClient {
  private datasets: Map<string, CkanPackage>;
  private shouldFail: boolean;

  constructor(datasets: Map<string, CkanPackage>, shouldFail = false) {
    this.datasets = datasets;
    this.shouldFail = shouldFail;
  }

  async call<T = unknown>(request: { action: string; data: unknown }): Promise<CkanActionResponse<T>> {
    return { action: request.action, success: true, result: {} as T };
  }
  async packageShow(id: string): Promise<CkanActionResponse<CkanPackage>> {
    if (this.shouldFail) {
      throw new Error('CKAN API error');
    }
    const ds = this.datasets.get(id);
    if (!ds) {
      return { action: 'package_show', success: false, error: { __type: 'Not Found', message: 'Not found' } };
    }
    return { action: 'package_show', success: true, result: ds };
  }
  async packageCreate(data: Readonly<Record<string, unknown>>): Promise<CkanActionResponse<CkanPackage>> {
    return { action: 'package_create', success: true, result: { id: 'new', name: data.name as string, title: 'T' } };
  }
  async packageUpdate(id: string): Promise<CkanActionResponse<CkanPackage>> {
    return { action: 'package_update', success: true, result: { id, name: 't', title: 'T' } };
  }
  async datastoreCreate(): Promise<CkanActionResponse> {
    return { action: 'datastore_create', success: true };
  }
  async datastoreUpsert(): Promise<CkanActionResponse> {
    return { action: 'datastore_upsert', success: true };
  }
  async datastoreSearch(): Promise<CkanActionResponse> {
    return { action: 'datastore_search', success: true };
  }
  async organizationShow(): Promise<CkanActionResponse> {
    return { action: 'organization_show', success: true };
  }
  async organizationCreate(): Promise<CkanActionResponse> {
    return { action: 'organization_create', success: true };
  }
  async userShow(): Promise<CkanActionResponse> {
    return { action: 'user_show', success: true };
  }
  async activityDataList(): Promise<CkanActionResponse> {
    return { action: 'activity_data_list', success: true };
  }
}

function makeJob(overrides: Partial<PublicationJob> = {}): PublicationJob {
  return {
    idempotencyKey: 'key-001',
    podResourceIri: 'https://pod.example.org/r1',
    contentDigest: 'digest-001',
    ckanOrganizationId: 'org',
    metadata: {
      databoxProvenanceIri: 'https://pod.example.org/r1',
      databoxPolicyIri: '',
      databoxShaclShapeIri: '',
      databoxConsentReceiptIri: '',
    },
    status: 'published',
    createdAt: '2026-07-25T00:00:00Z',
    updatedAt: '2026-07-25T00:00:01Z',
    retryCount: 0,
    ckanDatasetId: 'ckan-001',
    ...overrides,
  };
}

describe('CKAN-13: Reconciliation + drift detection', () => {
  let ledger: InMemoryDisclosureLedger;
  let jobs: PublicationJob[];

  beforeEach(() => {
    ledger = new InMemoryDisclosureLedger();
    jobs = [];
  });

  describe('sweep', () => {
    it('returns no drifts when CKAN matches all jobs', async () => {
      const datasets = new Map([
        ['ckan-001', { id: 'ckan-001', name: 'test', title: 'Test', extras: { databox_provenance_iri: 'https://pod.example.org/r1' } }],
      ]);
      jobs = [makeJob()];

      const svc = new InMemoryReconciliationService({
        ckanClient: new MockCkanClient(datasets),
        ledger,
        getJobs: () => jobs,
      });

      const drifts = await svc.sweep();
      expect(drifts).toHaveLength(0);
    });

    it('detects orphaned-ckan when CKAN dataset is missing', async () => {
      const datasets = new Map();
      jobs = [makeJob()];

      const svc = new InMemoryReconciliationService({
        ckanClient: new MockCkanClient(datasets),
        ledger,
        getJobs: () => jobs,
      });

      const drifts = await svc.sweep();
      expect(drifts).toHaveLength(1);
      expect(drifts[0].type).toBe('orphaned-ckan');
      expect(drifts[0].ckanDatasetId).toBe('ckan-001');
    });

    it('detects editor-originated drift when provenance IRI is changed', async () => {
      const datasets = new Map([
        ['ckan-001', { id: 'ckan-001', name: 'test', title: 'Test', extras: { databox_provenance_iri: 'https://malicious.example.org/hacked' } }],
      ]);
      jobs = [makeJob()];

      const svc = new InMemoryReconciliationService({
        ckanClient: new MockCkanClient(datasets),
        ledger,
        getJobs: () => jobs,
      });

      const drifts = await svc.sweep();
      expect(drifts).toHaveLength(1);
      expect(drifts[0].type).toBe('editor-originated');
      expect(drifts[0].driftedFields).toContain('databox_provenance_iri');
    });

    it('detects orphaned-ckan on CKAN API error', async () => {
      jobs = [makeJob()];

      const svc = new InMemoryReconciliationService({
        ckanClient: new MockCkanClient(new Map(), true),
        ledger,
        getJobs: () => jobs,
      });

      const drifts = await svc.sweep();
      expect(drifts).toHaveLength(1);
      expect(drifts[0].type).toBe('orphaned-ckan');
    });

    it('skips non-published jobs', async () => {
      const datasets = new Map();
      jobs = [makeJob({ status: 'quarantined' })];

      const svc = new InMemoryReconciliationService({
        ckanClient: new MockCkanClient(datasets),
        ledger,
        getJobs: () => jobs,
      });

      const drifts = await svc.sweep();
      expect(drifts).toHaveLength(0);
    });

    it('skips jobs without ckanDatasetId', async () => {
      const datasets = new Map();
      jobs = [makeJob({ ckanDatasetId: undefined })];

      const svc = new InMemoryReconciliationService({
        ckanClient: new MockCkanClient(datasets),
        ledger,
        getJobs: () => jobs,
      });

      const drifts = await svc.sweep();
      expect(drifts).toHaveLength(0);
    });

    it('handles multiple jobs with mixed states', async () => {
      const datasets = new Map([
        ['ckan-001', { id: 'ckan-001', name: 't', title: 'T', extras: { databox_provenance_iri: 'https://pod.example.org/r1' } }],
      ]);
      jobs = [
        makeJob(),
        makeJob({ idempotencyKey: 'k2', podResourceIri: 'https://pod.example.org/r2', ckanDatasetId: 'ckan-002' }),
        makeJob({ idempotencyKey: 'k3', status: 'failed' }),
      ];

      const svc = new InMemoryReconciliationService({
        ckanClient: new MockCkanClient(datasets),
        ledger,
        getJobs: () => jobs,
      });

      const drifts = await svc.sweep();
      // ckan-001: OK, ckan-002: missing, k3: skipped (failed)
      expect(drifts).toHaveLength(1);
      expect(drifts[0].ckanDatasetId).toBe('ckan-002');
    });
  });

  describe('getLastSweepDrifts', () => {
    it('returns drifts from the last sweep', async () => {
      const datasets = new Map();
      jobs = [makeJob()];

      const svc = new InMemoryReconciliationService({
        ckanClient: new MockCkanClient(datasets),
        ledger,
        getJobs: () => jobs,
      });

      await svc.sweep();
      const drifts = svc.getLastSweepDrifts();
      expect(drifts).toHaveLength(1);
    });
  });

  describe('start/stop', () => {
    it('start does not throw', () => {
      const svc = new InMemoryReconciliationService({
        ckanClient: new MockCkanClient(new Map()),
        ledger,
        getJobs: () => jobs,
        intervalMs: 1000,
      });
      expect(() => svc.start()).not.toThrow();
      svc.stop();
    });

    it('stop is idempotent', () => {
      const svc = new InMemoryReconciliationService({
        ckanClient: new MockCkanClient(new Map()),
        ledger,
        getJobs: () => jobs,
      });
      svc.stop();
      svc.stop(); // Should not throw
    });

    it('start is idempotent (calling twice does not create two intervals)', () => {
      const svc = new InMemoryReconciliationService({
        ckanClient: new MockCkanClient(new Map()),
        ledger,
        getJobs: () => jobs,
        intervalMs: 1000,
      });
      svc.start();
      svc.start(); // Should not create a second interval
      svc.stop();
    });
  });
});
