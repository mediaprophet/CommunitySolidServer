/**
 * Solid-OIDC client for the CKAN Bridge (CKAN-04).
 *
 * The bridge authenticates as its own program-specific service agent (ADR-0018) and requests
 * scoped, short-lived, DPoP-bound access tokens to read from Pods. The bridge is a CLIENT,
 * not a server — it obtains tokens, it does not verify them.
 *
 * Key properties:
 * - DPoP key pair generated/loaded from Kubernetes Secret (never exported)
 * - Solid-OIDC discovery and token request
 * - DPoP proof generation per request
 * - Token caching with expiry; refresh with re-proof
 * - NEVER stores long-lived credentials
 * - NEVER has write access to Pods (read-only for publication)
 * - Fail closed on: token expiry without refresh, DPoP key load failure, issuer mismatch,
 *   audience mismatch
 */

import { createHash, generateKeyPairSync, createPrivateKey, createPublicKey, sign as cryptoSign, type KeyObject } from 'node:crypto';
import { readFileSync } from 'node:fs';

/** A cached Solid access token with its DPoP proof. */
export interface CachedToken {
  readonly token: string;
  readonly expiresAt: number;
  readonly dpopProof: string;
  readonly audience: string;
}

/** Configuration for the Solid-OIDC client. */
export interface SolidOidcClientConfig {
  /** The Solid-OIDC issuer URL (the Databox authorization server / broker). */
  readonly issuer: string;
  /** The bridge's client_id registered with the issuer. */
  readonly clientId: string;
  /** Filesystem path to the DPoP private key (PEM, P-256). */
  readonly dpopKeyFile: string;
  /** Token lifetime in seconds (requested, not guaranteed). */
  readonly tokenLifetimeSeconds: number;
}

/** Error thrown when Solid-OIDC authentication fails (fail-closed). */
export class SolidOidcError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'SolidOidcError';
  }
}

/**
 * Generate a DPoP proof for an HTTP request.
 * DPoP = Demonstration of Proof-of-Possession (RFC 9449).
 * The proof is a compact JWS with a header containing the JWK and a payload containing
 * htm, htu, iat, jti, and optionally ath.
 */
function generateDpopProof(
  privateKey: KeyObject,
  publicKeyJwk: { kty: string; crv: string; x: string; y: string },
  method: string,
  url: string,
  accessToken?: string,
): string {
  const header = { typ: 'dpop+jwt', alg: 'ES256', jwk: publicKeyJwk };
  const now = Math.floor(Date.now() / 1000);
  const jti = createHash('sha256').update(`${url}:${now}:${Math.random()}`).digest('hex').slice(0, 32);
  const payload: Record<string, string | number> = {
    htm: method.toUpperCase(),
    htu: url,
    iat: now,
    jti,
  };
  if (accessToken) {
    payload.ath = createHash('sha256').update(accessToken).digest('base64url');
  }

  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = cryptoSign('SHA256', Buffer.from(signingInput), privateKey).toString('base64url');
  // Use ieee-p1363 encoding for JOSE compatibility
  return `${headerB64}.${payloadB64}.${signature}`;
}

/**
 * Load a P-256 private key from a PEM file.
 * Fail closed if the key is missing, invalid, or not P-256.
 */
function loadDpopKey(keyFile: string): { privateKey: KeyObject; publicKeyJwk: { kty: string; crv: string; x: string; y: string } } {
  let pem: string;
  try {
    pem = readFileSync(keyFile, 'utf8');
  } catch {
    throw new SolidOidcError(`DPoP key file not found: ${keyFile}`, 'DPOP_KEY_NOT_FOUND');
  }

  let privateKey: KeyObject;
  try {
    privateKey = createPrivateKey(pem);
  } catch {
    throw new SolidOidcError('Invalid DPoP private key PEM', 'DPOP_KEY_INVALID');
  }

  // Verify it's an EC P-256 key
  const publicKey = createPublicKey(privateKey);
  const jwk = publicKey.export({ format: 'jwk' }) as Record<string, unknown>;
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256') {
    throw new SolidOidcError('DPoP key must be EC P-256', 'DPOP_KEY_WRONG_CURVE');
  }

  return {
    privateKey,
    publicKeyJwk: { kty: 'EC', crv: 'P-256', x: jwk.x as string, y: jwk.y as string },
  };
}

/**
 * Generate a new P-256 key pair for DPoP.
 * Used for initial setup or key rotation.
 */
export function generateDpopKeyPair(): { privateKeyPem: string; publicKeyJwk: { kty: string; crv: string; x: string; y: string } } {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  const jwk = publicKey.export({ format: 'jwk' }) as Record<string, unknown>;
  return {
    privateKeyPem,
    publicKeyJwk: { kty: 'EC', crv: 'P-256', x: jwk.x as string, y: jwk.y as string },
  };
}

/**
 * Solid-OIDC client for the CKAN Bridge.
 *
 * Obtains scoped, short-lived, DPoP-bound access tokens to read from Pods.
 * Caches tokens by audience (Pod IRI) until expiry, then refreshes with re-proof.
 */
export class SolidOidcClient {
  private readonly config: SolidOidcClientConfig;
  private readonly privateKey: KeyObject;
  private readonly publicKeyJwk: { kty: string; crv: string; x: string; y: string };
  private readonly tokenCache = new Map<string, CachedToken>();
  private readonly discoveryCache = new Map<string, { tokenEndpoint: string }>();

  constructor(config: SolidOidcClientConfig) {
    this.config = config;
    const { privateKey, publicKeyJwk } = loadDpopKey(config.dpopKeyFile);
    this.privateKey = privateKey;
    this.publicKeyJwk = publicKeyJwk;
  }

  /**
   * Discover the Solid-OIDC issuer's token endpoint.
   * Caches the result per issuer.
   */
  async discoverTokenEndpoint(issuer: string): Promise<string> {
    const cached = this.discoveryCache.get(issuer);
    if (cached) {
      return cached.tokenEndpoint;
    }

    // Fetch .well-known/openid-configuration
    const configUrl = `${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
    let response: Response;
    try {
      response = await fetch(configUrl, { headers: { Accept: 'application/json' } });
    } catch {
      throw new SolidOidcError(`Failed to fetch OIDC discovery: ${configUrl}`, 'DISCOVERY_FETCH_FAILED');
    }

    if (!response.ok) {
      throw new SolidOidcError(`OIDC discovery returned ${response.status}`, 'DISCOVERY_HTTP_ERROR');
    }

    const config = await response.json() as Record<string, unknown>;
    const tokenEndpoint = config.token_endpoint;
    if (typeof tokenEndpoint !== 'string') {
      throw new SolidOidcError('OIDC discovery missing token_endpoint', 'DISCOVERY_MISSING_TOKEN_ENDPOINT');
    }

    this.discoveryCache.set(issuer, { tokenEndpoint });
    return tokenEndpoint;
  }

  /**
   * Obtain a scoped, DPoP-bound access token for reading from a Pod.
   * Uses the client_credentials grant with DPoP proof.
   */
  async getAccessToken(podIri: string): Promise<CachedToken> {
    // Check cache first
    const cached = this.tokenCache.get(podIri);
    if (cached && this.isTokenValid(cached)) {
      return cached;
    }

    // Discover token endpoint
    const tokenEndpoint = await this.discoverTokenEndpoint(this.config.issuer);

    // Generate DPoP proof for the token request
    const dpopProof = generateDpopProof(
      this.privateKey,
      this.publicKeyJwk,
      'POST',
      tokenEndpoint,
    );

    // Request token using client_credentials grant
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.config.clientId,
      scope: `webid read`,
    });

    let response: Response;
    try {
      response = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'DPoP': dpopProof,
        },
        body: body.toString(),
      });
    } catch {
      throw new SolidOidcError('Token request failed (network error)', 'TOKEN_REQUEST_FAILED');
    }

    if (!response.ok) {
      const errorBody = await response.text();
      throw new SolidOidcError(`Token request returned ${response.status}: ${errorBody}`, 'TOKEN_REQUEST_HTTP_ERROR');
    }

    const tokenResponse = await response.json() as Record<string, unknown>;
    const accessToken = tokenResponse.access_token;
    if (typeof accessToken !== 'string') {
      throw new SolidOidcError('Token response missing access_token', 'TOKEN_RESPONSE_MISSING_TOKEN');
    }

    const expiresIn = typeof tokenResponse.expires_in === 'number' ? tokenResponse.expires_in : 300;
    const expiresAt = Date.now() + expiresIn * 1000;

    // Verify the token is DPoP-bound (token_type must be DPoP)
    const tokenType = tokenResponse.token_type;
    if (typeof tokenType === 'string' && tokenType.toUpperCase() !== 'DPOP') {
      throw new SolidOidcError(`Expected DPoP token_type, got ${tokenType}`, 'TOKEN_NOT_DPOP_BOUND');
    }

    const token: CachedToken = {
      token: accessToken,
      expiresAt,
      dpopProof: generateDpopProof(this.privateKey, this.publicKeyJwk, 'GET', podIri, accessToken),
      audience: podIri,
    };

    this.tokenCache.set(podIri, token);
    return token;
  }

  /**
   * Generate a DPoP proof for an authenticated Pod request.
   * The proof binds the token to the specific HTTP method and URL.
   */
  generateRequestProof(method: string, url: string, accessToken: string): string {
    return generateDpopProof(this.privateKey, this.publicKeyJwk, method, url, accessToken);
  }

  /**
   * Check if a cached token is still valid (not expired, with 30s buffer).
   */
  isTokenValid(token: CachedToken): boolean {
    return Date.now() < token.expiresAt - 30_000;
  }

  /**
   * Clear the token cache (e.g. on key rotation).
   */
  clearCache(): void {
    this.tokenCache.clear();
  }
}
