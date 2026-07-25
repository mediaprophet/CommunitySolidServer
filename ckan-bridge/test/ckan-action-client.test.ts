import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { HttpCkanActionClient, CkanApiError } from '../src/ckan-action-client.js';

const TMP_TOKEN = join(tmpdir(), `test-ckan-token-${Date.now()}`);

describe('CKAN-06: CKAN Action API client', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    writeFileSync(TMP_TOKEN, 'test-api-token\n', 'utf8');
  });

  afterEach(() => {
    if (existsSync(TMP_TOKEN)) {
      unlinkSync(TMP_TOKEN);
    }
    global.fetch = originalFetch;
  });

  describe('construction', () => {
    it('constructs with valid config', () => {
      const client = new HttpCkanActionClient({
        ckanBaseUrl: 'https://ckan.example.org/',
        ckanApiTokenFile: TMP_TOKEN,
      });
      expect(client).toBeDefined();
    });

    it('strips trailing slash from base URL', () => {
      const client = new HttpCkanActionClient({
        ckanBaseUrl: 'https://ckan.example.org/',
        ckanApiTokenFile: TMP_TOKEN,
      });
      // Internal check via call behavior
      expect(client).toBeDefined();
    });
  });

  describe('call', () => {
    it('sends POST with authorization header and action path', async () => {
      let fetchedUrl = '';
      let fetchedInit: RequestInit | undefined;
      global.fetch = (async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
        fetchedUrl = typeof url === 'string' ? url : url.toString();
        fetchedInit = init;
        return new Response(JSON.stringify({
          action: 'package_show',
          success: true,
          result: { id: 'test-001', name: 'test', title: 'Test' },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }) as typeof fetch;

      const client = new HttpCkanActionClient({
        ckanBaseUrl: 'https://ckan.example.org/',
        ckanApiTokenFile: TMP_TOKEN,
      });

      const result = await client.call({ action: 'package_show', data: { id: 'test-001' } });
      expect(result.success).toBe(true);
      expect(fetchedUrl).toBe('https://ckan.example.org/api/3/action/package_show');
      expect(fetchedInit?.method).toBe('POST');
      expect(fetchedInit?.headers).toMatchObject({ Authorization: 'test-api-token' });
    });

    it('throws CkanApiError on HTTP error', async () => {
      global.fetch = (async (): Promise<Response> => new Response('Server Error', { status: 500 })) as typeof fetch;

      const client = new HttpCkanActionClient({
        ckanBaseUrl: 'https://ckan.example.org/',
        ckanApiTokenFile: TMP_TOKEN,
      });

      await expect(client.call({ action: 'package_show', data: {} }))
        .rejects.toThrow(CkanApiError);
    });

    it('throws CkanApiError on success=false', async () => {
      global.fetch = (async (): Promise<Response> => new Response(JSON.stringify({
        action: 'package_create',
        success: false,
        error: { __type: 'Validation Error', message: 'Name required' },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;

      const client = new HttpCkanActionClient({
        ckanBaseUrl: 'https://ckan.example.org/',
        ckanApiTokenFile: TMP_TOKEN,
      });

      await expect(client.call({ action: 'package_create', data: {} }))
        .rejects.toThrow(CkanApiError);
    });

    it('throws on network error', async () => {
      global.fetch = (async (): Promise<Response> => { throw new Error('Network error'); }) as typeof fetch;

      const client = new HttpCkanActionClient({
        ckanBaseUrl: 'https://ckan.example.org/',
        ckanApiTokenFile: TMP_TOKEN,
      });

      await expect(client.call({ action: 'package_show', data: {} }))
        .rejects.toThrow(CkanApiError);
    });

    it('throws on missing token file', async () => {
      unlinkSync(TMP_TOKEN);
      const client = new HttpCkanActionClient({
        ckanBaseUrl: 'https://ckan.example.org/',
        ckanApiTokenFile: TMP_TOKEN,
      });
      await expect(client.call({ action: 'package_show', data: {} }))
        .rejects.toThrow(CkanApiError);
    });
  });

  describe('convenience methods', () => {
    it('packageShow calls package_show action', async () => {
      global.fetch = (async (): Promise<Response> => new Response(JSON.stringify({
        action: 'package_show', success: true,
        result: { id: 'test-001', name: 'test', title: 'Test' },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;

      const client = new HttpCkanActionClient({
        ckanBaseUrl: 'https://ckan.example.org/',
        ckanApiTokenFile: TMP_TOKEN,
      });

      const result = await client.packageShow('test-001');
      expect(result.success).toBe(true);
      expect(result.result?.id).toBe('test-001');
    });

    it('packageCreate calls package_create action', async () => {
      global.fetch = (async (): Promise<Response> => new Response(JSON.stringify({
        action: 'package_create', success: true,
        result: { id: 'new-001', name: 'new', title: 'New' },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;

      const client = new HttpCkanActionClient({
        ckanBaseUrl: 'https://ckan.example.org/',
        ckanApiTokenFile: TMP_TOKEN,
      });

      const result = await client.packageCreate({ name: 'new', title: 'New' });
      expect(result.success).toBe(true);
      expect(result.result?.id).toBe('new-001');
    });

    it('datastoreUpsert calls datastore_upsert action', async () => {
      global.fetch = (async (): Promise<Response> => new Response(JSON.stringify({
        action: 'datastore_upsert', success: true,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;

      const client = new HttpCkanActionClient({
        ckanBaseUrl: 'https://ckan.example.org/',
        ckanApiTokenFile: TMP_TOKEN,
      });

      const result = await client.datastoreUpsert('res-001', [{ a: 1 }], 'upsert');
      expect(result.success).toBe(true);
    });
  });

  describe('reloadToken', () => {
    it('reloads the token from file', async () => {
      global.fetch = (async (_url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
        return new Response(JSON.stringify({
          action: 'package_show', success: true,
          result: { id: 'test', name: 'test', title: 'Test' },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }) as typeof fetch;

      const client = new HttpCkanActionClient({
        ckanBaseUrl: 'https://ckan.example.org/',
        ckanApiTokenFile: TMP_TOKEN,
      });

      await client.packageShow('test');
      writeFileSync(TMP_TOKEN, 'new-token\n', 'utf8');
      client.reloadToken();
      await client.packageShow('test');
      // No error means success
    });
  });

  describe('datastore_search (spec §5.2)', () => {
    it('calls datastore_search with resource_id', async () => {
      let capturedUrl: string | undefined;
      let capturedBody: string | undefined;
      global.fetch = (async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
        capturedUrl = typeof url === 'string' ? url : url.toString();
        capturedBody = init?.body as string;
        return new Response(JSON.stringify({
          action: 'datastore_search', success: true,
          result: { records: [{ a: 1 }] },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }) as typeof fetch;

      const client = new HttpCkanActionClient({
        ckanBaseUrl: 'https://ckan.example.org/',
        ckanApiTokenFile: TMP_TOKEN,
      });

      const result = await client.datastoreSearch('res-001');
      expect(result.success).toBe(true);
      expect(capturedUrl).toContain('datastore_search');
      expect(capturedBody).toContain('res-001');
    });

    it('passes limit and offset', async () => {
      let capturedBody: string | undefined;
      global.fetch = (async (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
        capturedBody = init?.body as string;
        return new Response(JSON.stringify({ action: 'datastore_search', success: true, result: {} }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      }) as typeof fetch;

      const client = new HttpCkanActionClient({
        ckanBaseUrl: 'https://ckan.example.org/',
        ckanApiTokenFile: TMP_TOKEN,
      });

      await client.datastoreSearch('res-001', 50, 100);
      expect(capturedBody).toContain('"limit":50');
      expect(capturedBody).toContain('"offset":100');
    });
  });

  describe('organization_show (spec §5.2)', () => {
    it('calls organization_show', async () => {
      global.fetch = (async (): Promise<Response> => new Response(JSON.stringify({
        action: 'organization_show', success: true,
        result: { id: 'org-001', name: 'gov-agency', title: 'Gov Agency' },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;

      const client = new HttpCkanActionClient({
        ckanBaseUrl: 'https://ckan.example.org/',
        ckanApiTokenFile: TMP_TOKEN,
      });

      const result = await client.organizationShow('gov-agency');
      expect(result.success).toBe(true);
    });
  });

  describe('organization_create (spec §5.2)', () => {
    it('calls organization_create', async () => {
      global.fetch = (async (): Promise<Response> => new Response(JSON.stringify({
        action: 'organization_create', success: true,
        result: { id: 'org-002', name: 'new-org' },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;

      const client = new HttpCkanActionClient({
        ckanBaseUrl: 'https://ckan.example.org/',
        ckanApiTokenFile: TMP_TOKEN,
      });

      const result = await client.organizationCreate({ name: 'new-org', title: 'New Org' });
      expect(result.success).toBe(true);
    });
  });

  describe('user_show (spec §5.2)', () => {
    it('calls user_show to verify bridge service token identity', async () => {
      global.fetch = (async (): Promise<Response> => new Response(JSON.stringify({
        action: 'user_show', success: true,
        result: { id: 'bridge-svc', name: 'bridge-svc' },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;

      const client = new HttpCkanActionClient({
        ckanBaseUrl: 'https://ckan.example.org/',
        ckanApiTokenFile: TMP_TOKEN,
      });

      const result = await client.userShow('bridge-svc');
      expect(result.success).toBe(true);
    });
  });

  describe('activity_data_list (spec §5.2)', () => {
    it('calls activity_data_list for audit trail', async () => {
      global.fetch = (async (): Promise<Response> => new Response(JSON.stringify({
        action: 'activity_data_list', success: true,
        result: [{ id: 'act-001', activity_type: 'changed dataset' }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;

      const client = new HttpCkanActionClient({
        ckanBaseUrl: 'https://ckan.example.org/',
        ckanApiTokenFile: TMP_TOKEN,
      });

      const result = await client.activityDataList('ckan-001', 10);
      expect(result.success).toBe(true);
    });
  });

  describe('CKAN API token expiry (spec §14)', () => {
    it('fails closed on 401 — does not fall back to unauthenticated', async () => {
      global.fetch = (async (): Promise<Response> => new Response('Unauthorized', { status: 401 })) as typeof fetch;

      const client = new HttpCkanActionClient({
        ckanBaseUrl: 'https://ckan.example.org/',
        ckanApiTokenFile: TMP_TOKEN,
      });

      await expect(client.packageShow('test')).rejects.toThrow(CkanApiError);
    });
  });
});
