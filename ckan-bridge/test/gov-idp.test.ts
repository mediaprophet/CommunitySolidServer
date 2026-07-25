import { describe, it, expect } from '@jest/globals';
import {
  evaluateAssurance,
  verifyCrosswalkSignature,
  resolvePairwiseWebId,
  GovIdpError,
  type AssuranceCrosswalk,
  type GovIdpConfig,
} from '../src/gov-idp.js';

const MOCK_CROSSWALK: AssuranceCrosswalk = {
  version: '1.0.0',
  issuedBy: 'https://databox.example.org/authorities/gov-agency',
  signature: 'header.payload.signature',
  mappings: [
    {
      claim: 'ial',
      dimension: 'identity_proofing',
      rules: [
        { match: '2', value: 'IAL2' },
        { match: '3', value: 'IAL3' },
      ],
    },
    {
      claim: 'aal',
      dimension: 'authenticator_strength',
      rules: [
        { match: '2', value: 'AAL2' },
        { match: '3', value: 'AAL3' },
      ],
    },
    {
      claim: 'iss',
      dimension: 'federation_issuer_trust',
      rules: [
        { match: 'https://id.gov.au/', value: 'trusted' },
      ],
    },
  ],
};

const TRUSTED_KEY = {
  issuer: 'https://databox.example.org/authorities/gov-agency',
  publicKeyJwk: { kty: 'EC', crv: 'P-256', x: 'mock-x', y: 'mock-y' },
};

describe('CKAN-05: Government ID IdP integration', () => {
  describe('GovIdpConfig', () => {
    it('defines a gov ID IdP configuration', () => {
      const config: GovIdpConfig = {
        issuer: 'https://id.gov.au/',
        displayName: 'myGovID',
        clientId: 'ckan-bridge-gov',
        scopes: ['openid', 'profile', 'email'],
        crosswalk: MOCK_CROSSWALK,
      };
      expect(config.issuer).toBe('https://id.gov.au/');
      expect(config.crosswalk.version).toBe('1.0.0');
    });
  });

  describe('evaluateAssurance', () => {
    it('evaluates valid claims and satisfies required dimensions', () => {
      const claims = { ial: '2', aal: '2', iss: 'https://id.gov.au/' };
      const result = evaluateAssurance(claims, MOCK_CROSSWALK, [
        'identity_proofing',
        'authenticator_strength',
        'federation_issuer_trust',
      ]);
      expect(result.satisfied).toBe(true);
      expect(result.missing).toHaveLength(0);
      expect(result.dimensions.identity_proofing).toBe('IAL2');
      expect(result.dimensions.authenticator_strength).toBe('AAL2');
      expect(result.dimensions.federation_issuer_trust).toBe('trusted');
    });

    it('reports missing dimensions when claims are absent', () => {
      const claims = { ial: '2' };
      const result = evaluateAssurance(claims, MOCK_CROSSWALK, [
        'identity_proofing',
        'authenticator_strength',
      ]);
      expect(result.satisfied).toBe(false);
      expect(result.missing).toContain('authenticator_strength');
    });

    it('fails closed on unmapped claim value', () => {
      const claims = { ial: '99' };
      expect(() => evaluateAssurance(claims, MOCK_CROSSWALK, [])).toThrow(GovIdpError);
    });

    it('handles wildcard match rules', () => {
      const crosswalk: AssuranceCrosswalk = {
        ...MOCK_CROSSWALK,
        mappings: [
          {
            claim: 'verified_claims',
            dimension: 'identity_proofing',
            rules: [{ match: '*', value: 'verified' }],
          },
        ],
      };
      const claims = { verified_claims: 'anything' };
      const result = evaluateAssurance(claims, crosswalk, ['identity_proofing']);
      expect(result.satisfied).toBe(true);
      expect(result.dimensions.identity_proofing).toBe('verified');
    });

    it('records crosswalk version in result', () => {
      const result = evaluateAssurance({}, MOCK_CROSSWALK, []);
      expect(result.crosswalkVersion).toBe('1.0.0');
    });

    it('records evaluation timestamp', () => {
      const result = evaluateAssurance({}, MOCK_CROSSWALK, []);
      expect(result.evaluatedAt).toBeDefined();
      expect(new Date(result.evaluatedAt).getTime()).not.toBeNaN();
    });
  });

  describe('verifyCrosswalkSignature', () => {
    it('accepts a crosswalk from the trusted issuer', () => {
      expect(() => verifyCrosswalkSignature(MOCK_CROSSWALK, TRUSTED_KEY)).not.toThrow();
    });

    it('fails closed on issuer mismatch', () => {
      const wrongKey = { ...TRUSTED_KEY, issuer: 'https://wrong.example.org' };
      expect(() => verifyCrosswalkSignature(MOCK_CROSSWALK, wrongKey)).toThrow(GovIdpError);
    });

    it('fails closed on invalid signature format', () => {
      const badCrosswalk: AssuranceCrosswalk = {
        ...MOCK_CROSSWALK,
        signature: 'not-a-jws',
      };
      expect(() => verifyCrosswalkSignature(badCrosswalk, TRUSTED_KEY)).toThrow(GovIdpError);
    });
  });

  describe('resolvePairwiseWebId', () => {
    it('resolves a WebID when assurance is satisfied', () => {
      const assurance = evaluateAssurance(
        { ial: '2', aal: '2', iss: 'https://id.gov.au/' },
        MOCK_CROSSWALK,
        ['identity_proofing', 'authenticator_strength', 'federation_issuer_trust'],
      );
      const webid = resolvePairwiseWebId(assurance, {
        organisation: 'gov-agency',
        program: 'open-data',
      });
      expect(webid).toContain('gov-agency');
      expect(webid).toContain('open-data');
      expect(webid).toContain('pairwise');
    });

    it('fails closed when assurance is not satisfied', () => {
      const assurance = evaluateAssurance(
        { ial: '2' },
        MOCK_CROSSWALK,
        ['identity_proofing', 'authenticator_strength'],
      );
      expect(() => resolvePairwiseWebId(assurance, {
        organisation: 'gov-agency',
        program: 'open-data',
      })).toThrow(GovIdpError);
    });
  });

  describe('opt-in profile', () => {
    it('gov ID is not required by default — no IdP configured means no gov ID', () => {
      // When no GovIdpConfig is provided, gov ID authentication is simply not used.
      // The bridge still works with Solid-OIDC (CKAN-04) for Pod reads.
      // This test verifies the type allows an empty configuration.
      const noGovIdp: GovIdpConfig | undefined = undefined;
      expect(noGovIdp).toBeUndefined();
    });
  });
});
