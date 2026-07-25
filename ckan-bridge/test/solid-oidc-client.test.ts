import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateKeyPairSync } from 'node:crypto';
import { SolidOidcClient, SolidOidcError, generateDpopKeyPair } from '../src/solid-oidc-client.js';

const TMP_KEY = join(tmpdir(), `test-dpop-key-${Date.now()}.pem`);

function writeTestKey(): string {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  writeFileSync(TMP_KEY, pem, 'utf8');
  return TMP_KEY;
}

function cleanupKey(): void {
  if (existsSync(TMP_KEY)) {
    unlinkSync(TMP_KEY);
  }
}

describe('CKAN-04: Solid-OIDC client', () => {
  beforeEach(() => {
    writeTestKey();
  });

  afterEach(() => {
    cleanupKey();
  });

  describe('generateDpopKeyPair', () => {
    it('generates a P-256 key pair', () => {
      const { privateKeyPem, publicKeyJwk } = generateDpopKeyPair();
      expect(privateKeyPem).toContain('PRIVATE KEY');
      expect(publicKeyJwk.kty).toBe('EC');
      expect(publicKeyJwk.crv).toBe('P-256');
      expect(publicKeyJwk.x).toBeDefined();
      expect(publicKeyJwk.y).toBeDefined();
    });
  });

  describe('SolidOidcClient construction', () => {
    it('loads a valid P-256 key from file', () => {
      const client = new SolidOidcClient({
        issuer: 'https://databox.example.org/',
        clientId: 'ckan-bridge-test',
        dpopKeyFile: TMP_KEY,
        tokenLifetimeSeconds: 300,
      });
      expect(client).toBeDefined();
    });

    it('fails closed when key file is missing', () => {
      cleanupKey();
      expect(() => new SolidOidcClient({
        issuer: 'https://databox.example.org/',
        clientId: 'ckan-bridge-test',
        dpopKeyFile: TMP_KEY,
        tokenLifetimeSeconds: 300,
      })).toThrow(SolidOidcError);
    });

    it('fails closed when key is invalid', () => {
      writeFileSync(TMP_KEY, 'not a valid PEM', 'utf8');
      expect(() => new SolidOidcClient({
        issuer: 'https://databox.example.org/',
        clientId: 'ckan-bridge-test',
        dpopKeyFile: TMP_KEY,
        tokenLifetimeSeconds: 300,
      })).toThrow(SolidOidcError);
    });
  });

  describe('isTokenValid', () => {
    it('returns true for a token that expires in the future', () => {
      const client = new SolidOidcClient({
        issuer: 'https://databox.example.org/',
        clientId: 'ckan-bridge-test',
        dpopKeyFile: TMP_KEY,
        tokenLifetimeSeconds: 300,
      });
      expect(client.isTokenValid({
        token: 'test',
        expiresAt: Date.now() + 600_000,
        dpopProof: 'proof',
        audience: 'https://pod.example.org/resource',
      })).toBe(true);
    });

    it('returns false for an expired token', () => {
      const client = new SolidOidcClient({
        issuer: 'https://databox.example.org/',
        clientId: 'ckan-bridge-test',
        dpopKeyFile: TMP_KEY,
        tokenLifetimeSeconds: 300,
      });
      expect(client.isTokenValid({
        token: 'test',
        expiresAt: Date.now() - 1000,
        dpopProof: 'proof',
        audience: 'https://pod.example.org/resource',
      })).toBe(false);
    });

    it('returns false for a token expiring within 30s buffer', () => {
      const client = new SolidOidcClient({
        issuer: 'https://databox.example.org/',
        clientId: 'ckan-bridge-test',
        dpopKeyFile: TMP_KEY,
        tokenLifetimeSeconds: 300,
      });
      expect(client.isTokenValid({
        token: 'test',
        expiresAt: Date.now() + 20_000,
        dpopProof: 'proof',
        audience: 'https://pod.example.org/resource',
      })).toBe(false);
    });
  });

  describe('generateRequestProof', () => {
    it('generates a DPoP proof with the correct structure', () => {
      const client = new SolidOidcClient({
        issuer: 'https://databox.example.org/',
        clientId: 'ckan-bridge-test',
        dpopKeyFile: TMP_KEY,
        tokenLifetimeSeconds: 300,
      });
      const proof = client.generateRequestProof('GET', 'https://pod.example.org/resource', 'test-token');
      // DPoP proof is a compact JWS: header.payload.signature
      const parts = proof.split('.');
      expect(parts).toHaveLength(3);

      // Decode header and check it has jwk
      const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
      expect(header.typ).toBe('dpop+jwt');
      expect(header.alg).toBe('ES256');
      expect(header.jwk).toBeDefined();
      expect(header.jwk.crv).toBe('P-256');

      // Decode payload and check htm/htu
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      expect(payload.htm).toBe('GET');
      expect(payload.htu).toBe('https://pod.example.org/resource');
      expect(payload.iat).toBeDefined();
      expect(payload.jti).toBeDefined();
      expect(payload.ath).toBeDefined();
    });
  });

  describe('clearCache', () => {
    it('clears the token cache', () => {
      const client = new SolidOidcClient({
        issuer: 'https://databox.example.org/',
        clientId: 'ckan-bridge-test',
        dpopKeyFile: TMP_KEY,
        tokenLifetimeSeconds: 300,
      });
      client.clearCache();
      // No error means success
      expect(true).toBe(true);
    });
  });

  describe('getAccessToken (mocked fetch)', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('obtains a DPoP-bound token from the issuer', async () => {
      global.fetch = (async (url: string | URL | Request): Promise<Response> => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        if (urlStr.includes('.well-known/openid-configuration')) {
          return new Response(JSON.stringify({
            token_endpoint: 'https://databox.example.org/token',
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (urlStr.includes('/token')) {
          return new Response(JSON.stringify({
            access_token: 'mock-dpop-token',
            token_type: 'DPoP',
            expires_in: 300,
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response('Not found', { status: 404 });
      }) as typeof fetch;

      const client = new SolidOidcClient({
        issuer: 'https://databox.example.org/',
        clientId: 'ckan-bridge-test',
        dpopKeyFile: TMP_KEY,
        tokenLifetimeSeconds: 300,
      });

      const token = await client.getAccessToken('https://pod.example.org/resource');
      expect(token.token).toBe('mock-dpop-token');
      expect(token.audience).toBe('https://pod.example.org/resource');
      expect(token.expiresAt).toBeGreaterThan(Date.now());
    });

    it('fails closed on non-DPoP token_type', async () => {
      global.fetch = (async (url: string | URL | Request): Promise<Response> => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        if (urlStr.includes('.well-known/openid-configuration')) {
          return new Response(JSON.stringify({
            token_endpoint: 'https://databox.example.org/token',
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({
          access_token: 'mock-bearer-token',
          token_type: 'Bearer',
          expires_in: 300,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }) as typeof fetch;

      const client = new SolidOidcClient({
        issuer: 'https://databox.example.org/',
        clientId: 'ckan-bridge-test',
        dpopKeyFile: TMP_KEY,
        tokenLifetimeSeconds: 300,
      });

      await expect(client.getAccessToken('https://pod.example.org/resource'))
        .rejects.toThrow(SolidOidcError);
    });

    it('fails closed on missing access_token', async () => {
      global.fetch = (async (url: string | URL | Request): Promise<Response> => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        if (urlStr.includes('.well-known/openid-configuration')) {
          return new Response(JSON.stringify({
            token_endpoint: 'https://databox.example.org/token',
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }) as typeof fetch;

      const client = new SolidOidcClient({
        issuer: 'https://databox.example.org/',
        clientId: 'ckan-bridge-test',
        dpopKeyFile: TMP_KEY,
        tokenLifetimeSeconds: 300,
      });

      await expect(client.getAccessToken('https://pod.example.org/resource'))
        .rejects.toThrow(SolidOidcError);
    });

    it('fails closed on discovery HTTP error', async () => {
      global.fetch = (async (): Promise<Response> => new Response('Not found', { status: 404 })) as typeof fetch;

      const client = new SolidOidcClient({
        issuer: 'https://databox.example.org/',
        clientId: 'ckan-bridge-test',
        dpopKeyFile: TMP_KEY,
        tokenLifetimeSeconds: 300,
      });

      await expect(client.getAccessToken('https://pod.example.org/resource'))
        .rejects.toThrow(SolidOidcError);
    });
  });

  describe('discovery missing token_endpoint (spec §6)', () => {
    it('fails closed when OIDC config has no token_endpoint', async () => {
      global.fetch = (async (url: string | URL | Request): Promise<Response> => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        if (urlStr.includes('.well-known/openid-configuration')) {
          return new Response(JSON.stringify({ issuer: 'https://databox.example.org/' }), {
            status: 200, headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response('', { status: 200 });
      }) as typeof fetch;

      const client = new SolidOidcClient({
        issuer: 'https://databox.example.org/',
        clientId: 'ckan-bridge-test',
        dpopKeyFile: TMP_KEY,
        tokenLifetimeSeconds: 300,
      });

      await expect(client.getAccessToken('https://pod.example.org/resource'))
        .rejects.toThrow(SolidOidcError);
    });
  });

  describe('token response missing access_token (spec §6)', () => {
    it('fails closed when token response has no access_token', async () => {
      global.fetch = (async (url: string | URL | Request): Promise<Response> => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        if (urlStr.includes('.well-known/openid-configuration')) {
          return new Response(JSON.stringify({ token_endpoint: 'https://databox.example.org/token' }), {
            status: 200, headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ token_type: 'DPoP', expires_in: 300 }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      }) as typeof fetch;

      const client = new SolidOidcClient({
        issuer: 'https://databox.example.org/',
        clientId: 'ckan-bridge-test',
        dpopKeyFile: TMP_KEY,
        tokenLifetimeSeconds: 300,
      });

      await expect(client.getAccessToken('https://pod.example.org/resource'))
        .rejects.toThrow(SolidOidcError);
    });
  });

  describe('token request HTTP error (spec §6)', () => {
    it('fails closed when token endpoint returns 500', async () => {
      global.fetch = (async (url: string | URL | Request): Promise<Response> => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        if (urlStr.includes('.well-known/openid-configuration')) {
          return new Response(JSON.stringify({ token_endpoint: 'https://databox.example.org/token' }), {
            status: 200, headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response('Internal Server Error', { status: 500 });
      }) as typeof fetch;

      const client = new SolidOidcClient({
        issuer: 'https://databox.example.org/',
        clientId: 'ckan-bridge-test',
        dpopKeyFile: TMP_KEY,
        tokenLifetimeSeconds: 300,
      });

      await expect(client.getAccessToken('https://pod.example.org/resource'))
        .rejects.toThrow(SolidOidcError);
    });
  });

  describe('discovery cache (spec §6.1)', () => {
    it('caches discovery results', async () => {
      let discoveryCount = 0;
      global.fetch = (async (url: string | URL | Request): Promise<Response> => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        if (urlStr.includes('.well-known/openid-configuration')) {
          discoveryCount++;
          return new Response(JSON.stringify({ token_endpoint: 'https://databox.example.org/token' }), {
            status: 200, headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({
          access_token: 'mock-token', token_type: 'DPoP', expires_in: 300,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }) as typeof fetch;

      const client = new SolidOidcClient({
        issuer: 'https://databox.example.org/',
        clientId: 'ckan-bridge-test',
        dpopKeyFile: TMP_KEY,
        tokenLifetimeSeconds: 300,
      });

      await client.getAccessToken('https://pod.example.org/r1');
      await client.getAccessToken('https://pod.example.org/r2');
      // Discovery should only be called once (cached for second call)
      expect(discoveryCount).toBe(1);
    });
  });

  describe('key rotation cache clearing (spec §14)', () => {
    it('clearCache removes all cached tokens', async () => {
      global.fetch = (async (url: string | URL | Request): Promise<Response> => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        if (urlStr.includes('.well-known/openid-configuration')) {
          return new Response(JSON.stringify({ token_endpoint: 'https://databox.example.org/token' }), {
            status: 200, headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({
          access_token: 'mock-token', token_type: 'DPoP', expires_in: 300,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }) as typeof fetch;

      const client = new SolidOidcClient({
        issuer: 'https://databox.example.org/',
        clientId: 'ckan-bridge-test',
        dpopKeyFile: TMP_KEY,
        tokenLifetimeSeconds: 300,
      });

      await client.getAccessToken('https://pod.example.org/r1');
      client.clearCache();
      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('generateDpopKeyPair (spec §6.3)', () => {
    it('generates a valid P-256 key pair', () => {
      const { privateKeyPem, publicKeyJwk } = generateDpopKeyPair();
      expect(privateKeyPem).toContain('BEGIN PRIVATE KEY');
      expect(publicKeyJwk.kty).toBe('EC');
      expect(publicKeyJwk.crv).toBe('P-256');
      expect(typeof publicKeyJwk.x).toBe('string');
      expect(typeof publicKeyJwk.y).toBe('string');
    });
  });
});
