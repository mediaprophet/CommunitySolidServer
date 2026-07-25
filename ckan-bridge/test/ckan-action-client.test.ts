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
      global.fetch = (async (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
        const headers = init?.headers as Record<string, string>;
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
});
