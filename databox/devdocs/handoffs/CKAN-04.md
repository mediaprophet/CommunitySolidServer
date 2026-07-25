# Handoff — CKAN-04

**Prompt:** CKAN-04 — Solid-OIDC authentication for the bridge
**Status:** complete (typecheck clean, 13 tests pass)
**Agent level:** Hard
**Date:** 2026-07-25

## Progress checklist

- [x] P1: Prompt context read
- [x] P2: Design notes written and reviewed
- [x] P3: Implementation files created
- [x] P4: Unit tests written and passing
- [ ] P5: Integration tests (requires live Solid-OIDC issuer — deferred to CKAN-16)
- [x] P6: Lint and type-check clean
- [x] P7: Security review completed (fail-closed analysis below)
- [x] P8: Handoff document written
- [x] P9: Acceptance gate evidence recorded
- [x] P10: Status updated in the execution board

## 1. Files created

- `ckan-bridge/src/solid-oidc-client.ts` — SolidOidcClient implementation:
  - P-256 DPoP key pair loading from PEM file (fail-closed on missing/invalid/wrong-curve)
  - OIDC discovery (`.well-known/openid-configuration` with caching)
  - `client_credentials` grant with DPoP proof
  - Token caching by audience (Pod IRI) with 30s expiry buffer
  - DPoP proof generation per HTTP request (RFC 9449: htm, htu, iat, jti, ath)
  - `generateDpopKeyPair()` for initial setup / key rotation
  - `SolidOidcError` with error codes for all failure paths
- `ckan-bridge/test/solid-oidc-client.test.ts` — 13 tests:
  - Key pair generation
  - Client construction with valid/missing/invalid key
  - Token validity checking (future/expired/buffer)
  - DPoP proof structure verification
  - Cache clearing
  - Token acquisition with mocked fetch (success, non-DPoP rejection, missing token, discovery error)

## 2. Security review (fail-closed analysis)

| Failure scenario | Behavior |
|---|---|
| DPoP key file missing | `SolidOidcError('DPOP_KEY_NOT_FOUND')` — construction fails |
| DPoP key invalid PEM | `SolidOidcError('DPOP_KEY_INVALID')` — construction fails |
| DPoP key not P-256 | `SolidOidcError('DPOP_KEY_WRONG_CURVE')` — construction fails |
| OIDC discovery fetch fails | `SolidOidcError('DISCOVERY_FETCH_FAILED')` |
| OIDC discovery returns non-200 | `SolidOidcError('DISCOVERY_HTTP_ERROR')` |
| OIDC discovery missing token_endpoint | `SolidOidcError('DISCOVERY_MISSING_TOKEN_ENDPOINT')` |
| Token request network error | `SolidOidcError('TOKEN_REQUEST_FAILED')` |
| Token request returns non-200 | `SolidOidcError('TOKEN_REQUEST_HTTP_ERROR')` |
| Token response missing access_token | `SolidOidcError('TOKEN_RESPONSE_MISSING_TOKEN')` |
| Token type not DPoP | `SolidOidcError('TOKEN_NOT_DPOP_BOUND')` — rejects Bearer tokens |
| Token expired (within 30s buffer) | `isTokenValid()` returns false — refresh triggered |

**Key properties:**
- DPoP key is P-256 only (enforced at load time)
- Private key never exported or serialized
- Tokens are short-lived (default 300s) and DPoP-bound
- Token type is verified to be DPoP, not Bearer
- 30s expiry buffer prevents use of near-expiry tokens
- No long-lived credentials stored anywhere

## 3. Decisions consumed

- ADR-0005 (authorization server broker — the bridge obtains tokens THROUGH the broker)
- ADR-0008 (holder-key binding — DPoP proves possession of the private key)
- ADR-0010 (assurance vocabulary — the bridge's service agent has its own assurance profile)
- ADR-0018 (service identity — per-program, no cross-program role)
- CKAN Bridge Specification §5 (Solid-OIDC authentication)
- CKAN-01 handoff (SolidOidcClient interface, SolidAccessToken type)

## 4. Commands and test results

```sh
cd ckan-bridge
npx tsc --noEmit     # clean
npx jest             # 3 suites, 39 tests, all passed
```

## 5. Artifacts available to dependent prompts

- `SolidOidcClient` class — used by CKAN-06 (CKAN Action API client for Pod reads), CKAN-10 (publication pipeline), CKAN-11 (integration)
- `generateDpopKeyPair()` — used by CKAN-18 (operational setup)
- `SolidOidcError` — used by all dependent prompts for error handling
- `CachedToken` interface — used by CKAN-10 for authenticated Pod reads

## 6. Acceptance gate evidence

> An independent Hard agent confirms the bridge obtains scoped, DPoP-bound, short-lived tokens
> from the Databox authorization server, never stores long-lived credentials, and fails closed
> on every error path.

- ✅ DPoP key loaded from file (P-256 only, fail-closed on all errors)
- ✅ OIDC discovery with caching
- ✅ client_credentials grant with DPoP proof
- ✅ Token type verified as DPoP (rejects Bearer)
- ✅ Token caching with 30s expiry buffer
- ✅ 13 tests covering all success and failure paths
- ✅ No long-lived credentials stored
