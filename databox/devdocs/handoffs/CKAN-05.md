# Handoff — CKAN-05

**Prompt:** CKAN-05 — Government ID IdP integration
**Status:** complete (typecheck clean, 13 tests pass)
**Agent level:** Hard
**Date:** 2026-07-25

## Progress checklist

- [x] P1–P10: All checklist items complete

## 1. Files created

- `ckan-bridge/src/gov-idp.ts`:
  - `GovIdpConfig` — external IdP configuration (issuer, clientId, scopes, crosswalk)
  - `AssuranceCrosswalk` — signed, versioned, per-program claim-to-dimension mapping (ADR-0010)
  - `AssuranceMapping` / `AssuranceMappingRule` — individual claim mappings
  - `AssuranceDimension` — 6 dimensions (identity_proofing, authenticator_strength, federation_issuer_trust, freshness, step_up_state, delegation)
  - `AssuranceResult` — evaluation result with satisfied/missing dimensions
  - `evaluateAssurance()` — normalizes IdP claims into assurance dimensions; fails closed on unmapped values
  - `verifyCrosswalkSignature()` — verifies crosswalk issuer binding and signature format
  - `resolvePairwiseWebId()` — validates assurance before pairwise WebID resolution (ADR-0004)
  - `GovIdpError` — fail-closed error type with codes
- `ckan-bridge/test/gov-idp.test.ts` — 13 tests covering all functions and failure paths

## 2. Key design decisions

- **Opt-in profile.** Gov ID authentication is NOT a universal requirement. When no `GovIdpConfig`
  is provided, gov ID is simply not used. The bridge still works with Solid-OIDC (CKAN-04).
- **Broker delegation.** The bridge does NOT authenticate users directly. The Databox authorization
  server/broker (ADR-0005) handles the actual trust exchange. This module provides configuration
  and assurance mapping only.
- **LDAP clarification.** LDAP/AD is directory data import only, NOT login federation. This is
  consistent with the IPMS README: "Login federation is a separate OIDC/SAML bridge."
- **Fail closed.** Unmapped claim values, issuer mismatches, invalid signatures, and unsatisfied
  assurance all raise `GovIdpError` — never a silent pass.
- **Pairwise WebID.** The bridge never sees the raw gov ID. The broker issues a pairwise WebID
  (ADR-0004) only after assurance is satisfied.

## 3. Decisions consumed

- ADR-0004 (pairwise WebID issuance)
- ADR-0005 (authorization server broker, IdP trust as per-program profile choice)
- ADR-0010 (assurance vocabulary and crosswalk — signed, versioned, per-program)
- IPMS README (LDAP is data import, not login federation)
- CKAN Bridge Specification §6.4 (gov ID authentication, opt-in profile)

## 4. Commands and test results

```sh
npx tsc --noEmit     # clean
npx jest test/gov-idp.test.ts  # 13 tests, all passed
```

## 5. Acceptance gate evidence

- ✅ Gov ID is opt-in (no config = no gov ID, bridge still works)
- ✅ Assurance crosswalk is signed, versioned, per-program (ADR-0010)
- ✅ Unmapped claims fail closed
- ✅ Pairwise WebID only issued when assurance satisfied
- ✅ LDAP is NOT login federation (clarified in code comments)
- ✅ 13 tests covering all success and failure paths
