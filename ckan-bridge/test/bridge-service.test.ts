import { describe, it, expect } from '@jest/globals';
import { InMemoryDisclosureLedger } from '../src/bridge-service.js';
import type { PublicationJob, CorrectionPropagationJob } from '../src/types.js';

describe('CKAN-11: Integration — InMemoryDisclosureLedger', () => {
  it('records publication events', async () => {
    const ledger = new InMemoryDisclosureLedger();
    const job: PublicationJob = {
      idempotencyKey: 'key-001',
      podResourceIri: 'https://pod.example.org/r1',
      contentDigest: 'digest-001',
      ckanOrganizationId: 'gov-agency',
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
    };
    await ledger.recordPublication(job);
    expect(ledger.publications).toHaveLength(1);
    expect(ledger.publications[0].ckanDatasetId).toBe('ckan-001');
  });

  it('records correction events', async () => {
    const ledger = new InMemoryDisclosureLedger();
    const job: CorrectionPropagationJob = {
      podRecordIri: 'https://pod.example.org/r1',
      ckanDatasetId: 'ckan-001',
      disposition: 'corrected',
      recipientDuties: [
        { recipientId: 'recipient-001', state: 'accepted', updatedAt: '2026-07-25T00:00:01Z' },
      ],
      dispositionAt: '2026-07-25T00:00:00Z',
    };
    await ledger.recordCorrection(job);
    expect(ledger.corrections).toHaveLength(1);
    expect(ledger.corrections[0].disposition).toBe('corrected');
  });

  it('records anonymisation decisions', async () => {
    const ledger = new InMemoryDisclosureLedger();
    const decisions = [
      { field: 'https://example.org/def/name', action: 'hashed', reason: 'PII' },
    ];
    await ledger.recordAnonymisation('https://pod.example.org/r1', decisions);
    expect(ledger.anonymisations).toHaveLength(1);
    expect(ledger.anonymisations[0].podResourceIri).toBe('https://pod.example.org/r1');
    expect(ledger.anonymisations[0].decisions).toHaveLength(1);
  });
});
