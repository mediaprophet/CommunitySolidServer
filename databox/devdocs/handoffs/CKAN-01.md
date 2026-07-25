# Handoff — CKAN-01

**Prompt:** CKAN-01 — Bridge scaffold and shared types
**Status:** complete (compiles, typecheck clean, 26 tests pass)
**Agent level:** Medium
**Date:** 2026-07-25
**Baseline:** Community Solid Server 7.1.9 with Databox extension (DBX-01…DBX-24)

## Progress checklist

- [x] P1: Prompt context read (spec, ADRs, prerequisite handoffs)
- [x] P2: Design notes written and reviewed
- [x] P3: Implementation files created/edited
- [x] P4: Unit tests written and passing
- [ ] P5: Integration tests written and passing (N/A for scaffold — no runtime logic)
- [x] P6: Lint and type-check clean
- [ ] P7: Security review completed (N/A — pure types, no runtime logic)
- [x] P8: Handoff document written with all required fields
- [x] P9: Acceptance gate evidence recorded
- [x] P10: Status updated in the execution board

## 1. Files created (all new)

`ckan-bridge/` (opt-in profile, separate from CSS core):

- `package.json` — Node.js package with TypeScript, Jest, RDF/SHACL dependencies
- `tsconfig.json` — TypeScript config (strict, nodenext, isolatedModules)
- `jest.config.js` — Jest config with ts-jest ESM preset
- `README.md` — documentation with opt-in profile statement, architecture diagram, config reference
- `src/types.ts` — shared value types: `CkanDatasetMetadata`, `CkanActionRequest`/`CkanActionResponse`,
  `PublicationJob` + `PublicationJobStatus`, `BridgeConfig` + `BridgeServiceIdentity`, `CkanWebhookEvent` +
  `CkanWebhookEventType`, `ShaclValidationResult` + `ShaclViolation`, `TranslationResult` +
  `CkanDatastoreField` + `AnonymisationDecision`, `CorrectionPropagationJob` + `CorrectionDisposition` +
  `RecipientNotificationDuty`, `ReconciliationDrift`
- `src/interfaces.ts` — interface stubs: `CkanActionClient`, `SolidOidcClient` + `SolidAccessToken`,
  `ShaclValidator`, `RdfTranslator`, `WebhookHandler`, `PublicationPipeline`, `CorrectionPropagator`,
  `ReconciliationService`, `MetadataFeedback`, `DisclosureLedger`, `CkanBridgeService`
- `src/index.ts` — barrel export
- `test/types.test.ts` — 15 tests covering all shared types
- `test/interfaces.test.ts` — 11 tests covering all interface contracts

## 2. Design decisions

- **Implementation language: TypeScript/Node.js.** Chosen to maximise reuse of existing Databox bridge
  patterns (`src/databox/bridge/BridgeTypes.ts`) and the repository's existing test infrastructure.
  Rust was considered but deferred — the bridge can share types with the existing Databox bridge more
  easily in TypeScript.
- **Separate package: `ckan-bridge/`.** The bridge is a standalone service that does not modify CSS
  core or the Databox extension. It has its own `package.json`, `tsconfig.json`, and test config.
- **Pure types and interfaces only.** No runtime logic — the acceptance gate requires another Medium
  agent to understand what the bridge does and does not do from the types alone.
- **Secrets referenced by path, never inlined.** `BridgeConfig` uses `*File` fields for all secrets,
  following the IPMS deployment pattern.

## 3. Decisions consumed

- CKAN Bridge Specification §1–§5 (architecture, API, types)
- CKAN Bridge Implementation Plan CKAN-01 prompt
- ADR-0016 (integration plane — bridge is a specialised instance)
- ADR-0017 (data exchange — publication is one-way org→CKAN)
- ADR-0018 (service identity — per-program, no cross-program role)
- ADR-0011 (evidence ledger — all publication events are append-only)
- ADR-0023 (correction propagation — per-recipient duties)
- DBX-22 handoff (existing bridge patterns: `BridgeTypes.ts`, `DataboxBridge.ts`)

## 4. Commands and test results

```sh
cd ckan-bridge
npm install          # 391 packages, 0 errors
npx tsc --noEmit     # clean, no errors
npx jest             # 2 suites, 26 tests, all passed
```

## 5. Security assumptions

- No runtime logic exists — security review is N/A for this prompt.
- Types enforce invariant 2 (no raw customerID) by design: no type in `types.ts` has a field that can
  hold a raw customer identifier. All identifiers are opaque IRIs or digests.

## 6. Unresolved questions

- None for CKAN-01. Open sub-questions from the spec (gov ID API, CKAN version pinning, bridge language
  choice) are addressed by later prompts.

## 7. Artifacts available to dependent prompts

- `ckan-bridge/src/types.ts` — all shared types for CKAN-02 through CKAN-18
- `ckan-bridge/src/interfaces.ts` — all interface contracts for CKAN-02 through CKAN-18
- `ckan-bridge/src/index.ts` — barrel export for importing
- `ckan-bridge/package.json` — dependency list (rdf-parse, rdf-validate-shacl, n3, @solid/access-token-verifier)
- `ckan-bridge/tsconfig.json` — TypeScript config for all subsequent prompts
- `ckan-bridge/jest.config.js` — test config for all subsequent prompts

## 8. Acceptance gate evidence

> Another Medium agent can read the types and interfaces and understand exactly what the bridge does
> and does not do; the scaffold compiles/builds clean; no runtime logic exists yet.

- ✅ Types and interfaces cover all specification contracts (CKAN API, Solid-OIDC, SHACL, translation,
  webhooks, publication, correction, reconciliation, feedback, disclosure ledger).
- ✅ `tsc --noEmit` passes with zero errors.
- ✅ 26 unit tests pass (15 type tests + 11 interface contract tests).
- ✅ No runtime logic — only type definitions and interface stubs.
