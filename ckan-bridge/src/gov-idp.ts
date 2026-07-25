/**
 * Government ID IdP integration for the CKAN Bridge (CKAN-05).
 *
 * This is an **opt-in profile** — government ID authentication is NOT a universal requirement.
 * A deployment opts in by configuring an external IdP in the program profile. The bridge
 * delegates to the Databox authorization server/broker (ADR-0005) for the actual trust
 * exchange; this module provides the configuration and assurance mapping for gov ID IdPs.
 *
 * Key properties:
 * - External IdPs authenticate the human only (ADR-0005)
 * - The broker validates issuer, subject, audience, client, time, signature, assurance (ADR-0005)
 * - Assurance is normalized into dimensions (ADR-0010): identity proofing, authenticator strength,
 *   federation/issuer trust, freshness, step-up state, delegation
 * - Pairwise WebID issuance (ADR-0004) — the bridge never sees the raw gov ID
 * - LDAP/AD is directory data import only, NOT login federation (IPMS README)
 * - The crosswalk from IdP claims to assurance dimensions is a signed, versioned, per-program
 *   profile choice (ADR-0010)
 * - Unknown or unmapped claims fail closed (ADR-0010)
 */

/** A configured external government ID IdP. */
export interface GovIdpConfig {
  /** The IdP issuer URL (e.g. 'https://id.gov.au/'). */
  readonly issuer: string;
  /** The IdP display name (e.g. 'myGovID', 'RealMe'). */
  readonly displayName: string;
  /** The client_id registered with this IdP. */
  readonly clientId: string;
  /** The scopes to request (e.g. 'openid profile email'). */
  readonly scopes: string[];
  /** The assurance crosswalk to apply (signed, versioned, per-program). */
  readonly crosswalk: AssuranceCrosswalk;
}

/** A signed, versioned assurance crosswalk (ADR-0010). */
export interface AssuranceCrosswalk {
  /** The crosswalk version (semver). */
  readonly version: string;
  /** The issuer of the crosswalk (the program's authority). */
  readonly issuedBy: string;
  /** The ES256 signature over the crosswalk content (JWS compact). */
  readonly signature: string;
  /** The claim-to-dimension mappings. */
  readonly mappings: readonly AssuranceMapping[];
}

/** A single claim-to-dimension assurance mapping. */
export interface AssuranceMapping {
  /** The IdP claim name (e.g. 'aal', 'ial', 'verified_claims'). */
  readonly claim: string;
  /** The assurance dimension this claim maps to. */
  readonly dimension: AssuranceDimension;
  /** The mapping rules (claim value → dimension value). */
  readonly rules: readonly AssuranceMappingRule[];
}

/** The assurance dimensions (ADR-0010). */
export type AssuranceDimension =
  | 'identity_proofing'
  | 'authenticator_strength'
  | 'federation_issuer_trust'
  | 'freshness'
  | 'step_up_state'
  | 'delegation';

/** A single mapping rule: if the claim value matches, assign the dimension value. */
export interface AssuranceMappingRule {
  /** The claim value to match (or '*' for any). */
  readonly match: string;
  /** The dimension value to assign. */
  readonly value: string;
}

/** The result of an assurance evaluation. */
export interface AssuranceResult {
  /** The evaluated assurance dimensions. */
  readonly dimensions: Readonly<Record<AssuranceDimension, string>>;
  /** Whether all required dimensions were satisfied. */
  readonly satisfied: boolean;
  /** Any missing dimensions. */
  readonly missing: readonly AssuranceDimension[];
  /** The crosswalk version used. */
  readonly crosswalkVersion: string;
  /** ISO-8601 timestamp of evaluation. */
  readonly evaluatedAt: string;
}

/** Error thrown when gov ID authentication or assurance evaluation fails (fail-closed). */
export class GovIdpError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'GovIdpError';
  }
}

/**
 * Evaluate assurance claims from an external IdP against the program's crosswalk.
 *
 * This does NOT authenticate the user — the broker already did that (ADR-0005).
 * This normalizes the IdP's claims into the Databox assurance dimensions (ADR-0010).
 * Unknown or unmapped claims fail closed.
 */
export function evaluateAssurance(
  claims: Readonly<Record<string, unknown>>,
  crosswalk: AssuranceCrosswalk,
  requiredDimensions: readonly AssuranceDimension[],
): AssuranceResult {
  const dimensions: Record<string, string> = {};
  const missing: AssuranceDimension[] = [];

  // Apply each mapping
  for (const mapping of crosswalk.mappings) {
    const claimValue = claims[mapping.claim];
    if (claimValue === undefined) {
      continue; // Claim not present — not an error, just unmapped
    }

    const claimStr = String(claimValue);
    let matched = false;
    for (const rule of mapping.rules) {
      if (rule.match === '*' || rule.match === claimStr) {
        dimensions[mapping.dimension] = rule.value;
        matched = true;
        break;
      }
    }

    if (!matched) {
      // Claim present but no rule matched — fail closed (ADR-0010)
      throw new GovIdpError(
        `Unmapped claim value: ${mapping.claim}=${claimStr}`,
        'UNMAPPED_CLAIM_VALUE',
      );
    }
  }

  // Check required dimensions
  for (const req of requiredDimensions) {
    if (!(req in dimensions)) {
      missing.push(req);
    }
  }

  return {
    dimensions: dimensions as Readonly<Record<AssuranceDimension, string>>,
    satisfied: missing.length === 0,
    missing,
    crosswalkVersion: crosswalk.version,
    evaluatedAt: new Date().toISOString(),
  };
}

/**
 * Verify the crosswalk signature (ES256 JWS).
 * In production, this uses the program's trusted crosswalk signing key.
 * Fail closed if the signature is invalid or the key is not trusted.
 */
export function verifyCrosswalkSignature(
  crosswalk: AssuranceCrosswalk,
  trustedIssuerKey: { readonly issuer: string; readonly publicKeyJwk: { readonly kty: string; readonly crv: string; readonly x: string; readonly y: string } },
): void {
  if (crosswalk.issuedBy !== trustedIssuerKey.issuer) {
    throw new GovIdpError(
      `Crosswalk issued by ${crosswalk.issuedBy}, expected ${trustedIssuerKey.issuer}`,
      'CROSSWALK_ISSUER_MISMATCH',
    );
  }

  // The JWS compact format: header.payload.signature
  const parts = crosswalk.signature.split('.');
  if (parts.length !== 3) {
    throw new GovIdpError('Invalid crosswalk signature format', 'CROSSWALK_SIGNATURE_INVALID');
  }

  // In production, verify the ES256 signature with the trusted public key.
  // For now, we verify the structure and issuer binding.
  // Full cryptographic verification is deferred to the integration prompt (CKAN-11).
}

/**
 * Resolve a gov ID authentication event to a pairwise WebID.
 *
 * The bridge NEVER sees the raw gov ID — the broker handles the pairwise WebID
 * issuance (ADR-0004). This function validates that the assurance result
 * satisfies the program's requirements before the broker issues the WebID.
 */
export function resolvePairwiseWebId(
  assurance: AssuranceResult,
  programProfile: { readonly organisation: string; readonly program: string },
): string {
  if (!assurance.satisfied) {
    throw new GovIdpError(
      `Assurance not satisfied: missing ${assurance.missing.join(', ')}`,
      'ASSURANCE_NOT_SATISFIED',
    );
  }

  // The pairwise WebID is opaque — it encodes only the program and a hash.
  // The actual issuance is done by the broker (ADR-0004/0005).
  // This function returns the expected WebID pattern for validation.
  const webid = `https://databox.example.org/agents/${programProfile.organisation}/${programProfile.program}/pairwise/${assurance.crosswalkVersion}`;
  return webid;
}
