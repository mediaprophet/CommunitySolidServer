/**
 * CKAN Action API client (CKAN-06).
 *
 * Communicates with CKAN exclusively over HTTP via POST /api/3/action/{action}.
 * NEVER uses direct database access (no ODBC, no SQL).
 * The API token is loaded from a Kubernetes Secret mount (file path).
 */

import { readFileSync } from 'node:fs';
import type {
  CkanActionRequest,
  CkanActionResponse,
} from './types.js';
import type {
  CkanActionClient,
  CkanPackage,
  CkanResource,
} from './interfaces.js';

/** Error thrown when the CKAN API client fails. */
export class CkanApiError extends Error {
  constructor(message: string, readonly action: string, readonly ckanError?: unknown) {
    super(message);
    this.name = 'CkanApiError';
  }
}

/**
 * HTTP-based CKAN Action API client.
 *
 * All calls go through POST /api/3/action/{action} with JSON body.
 * The API token is sent in the Authorization header.
 */
export class HttpCkanActionClient implements CkanActionClient {
  private readonly baseUrl: string;
  private apiToken: string | null = null;
  private readonly apiTokenFile: string;

  constructor(config: { readonly ckanBaseUrl: string; readonly ckanApiTokenFile: string }) {
    this.baseUrl = config.ckanBaseUrl.replace(/\/$/, '');
    this.apiTokenFile = config.ckanApiTokenFile;
  }

  /** Load the API token from the secret file (lazy loading). */
  private getToken(): string {
    if (this.apiToken !== null) {
      return this.apiToken;
    }
    try {
      this.apiToken = readFileSync(this.apiTokenFile, 'utf8').trim();
    } catch {
      throw new CkanApiError(`API token file not found: ${this.apiTokenFile}`, 'init');
    }
    return this.apiToken;
  }

  /** Reload the API token (e.g. after token rotation). */
  reloadToken(): void {
    this.apiToken = null;
  }

  async call<T = unknown>(request: CkanActionRequest): Promise<CkanActionResponse<T>> {
    const url = `${this.baseUrl}/api/3/action/${request.action}`;
    const token = this.getToken();

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token,
        },
        body: JSON.stringify(request.data),
      });
    } catch {
      throw new CkanApiError(`Network error calling ${request.action}`, request.action);
    }

    if (!response.ok) {
      throw new CkanApiError(
        `HTTP ${response.status} calling ${request.action}`,
        request.action,
      );
    }

    const body = await response.json() as CkanActionResponse<T>;

    if (!body.success) {
      throw new CkanApiError(
        `CKAN action ${request.action} failed: ${JSON.stringify(body.error)}`,
        request.action,
        body.error,
      );
    }

    return body;
  }

  async packageShow(id: string): Promise<CkanActionResponse<CkanPackage>> {
    return this.call<CkanPackage>({ action: 'package_show', data: { id } });
  }

  async packageCreate(data: Readonly<Record<string, unknown>>): Promise<CkanActionResponse<CkanPackage>> {
    return this.call<CkanPackage>({ action: 'package_create', data });
  }

  async packageUpdate(id: string, data: Readonly<Record<string, unknown>>): Promise<CkanActionResponse<CkanPackage>> {
    return this.call<CkanPackage>({ action: 'package_update', data: { id, ...data } });
  }

  async datastoreCreate(resourceId: string, fields: unknown[], records: unknown[]): Promise<CkanActionResponse> {
    return this.call({ action: 'datastore_create', data: { resource_id: resourceId, fields, records } });
  }

  async datastoreUpsert(resourceId: string, records: unknown[], method: 'insert' | 'update' | 'upsert' = 'upsert'): Promise<CkanActionResponse> {
    return this.call({ action: 'datastore_upsert', data: { resource_id: resourceId, records, method } });
  }
}
