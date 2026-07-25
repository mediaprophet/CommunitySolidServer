# CKAN Bridge Implementation Plan

## Purpose

This plan turns the [CKAN Bridge Specification](dbx-06-ckan-bridge-specification.md) into an ordered set of implementation prompts. Progress is measured by completed prompts and passed gates, not weeks. Each prompt produces reviewable artifacts and tests that become the inputs to later prompts.

**The CKAN bridge is an opt-in deployment profile, not a universal requirement.** It does not change the default Community Solid Server install path and is not required for non-CKAN Databox deployments. A provider opts in by deploying the bridge microservice, the CKAN instance, and the thin Python plugin. This follows the same opt-in pattern as the IPMS deployment profile (`databox/deployment/ipms/`). The universal Databox invariants apply unchanged; the CKAN profile supplies program-specific facts and integration configuration on top of them.

CKAN-01 through CKAN-18 is the primary execution path to a production-quality, independently assessed CKAN bridge deployment. The plan assumes DBX-01 through DBX-24 of the [Databox prompt implementation plan](prompt-implementation-plan.md) are complete (extension map, ADRs, threat model, reference architecture, conformance matrix, schemas, policy engine, provisioning, identity, authorization, exchange, evidence, integration endpoints).

Do not send the entire plan to one coding agent with an instruction to "implement everything". Run prompts in order within each dependency chain, retain their outputs in the repository, and use the indicated agent capability.

## Agent capability levels

| Level | Suitable work | Required behavior |
|---|---|---|
| Easy | Mechanical scaffolding, config files, Dockerfiles, Kubernetes manifests, fixtures, documentation and bounded tests. | Follow established decisions; do not create architecture. |
| Medium | Multi-file implementation using known interfaces and existing repository patterns. Inspect code, implement tests, explain trade-offs and stop on unresolved security decisions. | Inspect code, implement tests, explain trade-offs and stop on unresolved security decisions. |
| Hard | Architecture, identity, cryptography, policy semantics, gov ID integration, SHACL validation, tenant isolation, evidence and adversarial security. | Use the strongest reasoning agent available; document assumptions, attack cases and alternatives. |

An Easy agent must not make a Hard decision merely because a prompt is underspecified. Escalate the missing decision and leave the dependent implementation blocked. Hard outputs involving identity, cryptography, legal policy or production security also require human review by the relevant domain owner.

## Agent assignment rules

- **Easy prompts:** one Easy or stronger implementation agent; ordinary code review.
- **Medium prompts:** one Medium or stronger implementation agent; a separate Medium reviewer.
- **Hard prompts:** one Hard lead agent; at least one independent Hard reviewer for security-sensitive changes.
- **Cryptographic and identity prompts (CKAN-04, CKAN-05, CKAN-11):** Hard agent plus human security/identity review.
- **SHACL and legal-policy prompts (CKAN-07, CKAN-08):** Hard agent plus human policy/domain review.
- **Tenant-isolation prompts (CKAN-03, CKAN-14):** Hard agent plus adversarial review by an agent that did not implement the change.
- **Release gate (CKAN-18):** a Hard integrator reviews the collected evidence; no agent self-certifies its own subsystem.

Agent level describes the reasoning and review requirement, not the number of files changed. A ten-line authorization change can be Hard; a large generated fixture can be Easy.

## Global prompt preamble

Prepend this text to every implementation prompt:

> You are working on the CKAN Bridge implementation for the organisation-hosted Solid Databox. The CKAN bridge is an **opt-in deployment profile** — it does not change the default CSS install path and is not required for non-CKAN Databox deployments. Do not modify CSS core code or the existing Databox extension's core invariants. Read the [CKAN Bridge Specification](dbx-06-ckan-bridge-specification.md) and all Markdown files in `databox/` relevant to your prompt, plus any accepted decision records or handoff documents produced by prerequisite prompts, before acting. Preserve program isolation, pairwise identity, assurance-aware access, explicit consumer submission, append-only evidence and the separation between WAC/ACP and ODRL. Inspect the current repository and reuse its extension patterns. Do not weaken a Databox invariant to make a test pass. Do not invent an unresolved security or protocol decision: record the blocker and stop that dependent part. Implement the requested artifacts and tests, run relevant validation, and finish with changed files, decisions used, tests run, residual risks and inputs needed by the next prompt.

## Handoff contract

Every prompt creates or updates a handoff record in `databox/devdocs/handoffs/` named `CKAN-NN.md` containing:

- prompt identifier and status;
- commits or changed files;
- decisions consumed and created;
- commands and test results;
- security assumptions;
- unresolved questions;
- exact artifacts available to dependent prompts;
- **progress checklist** (see §Progress tracking below).

Use stable prompt identifiers such as `CKAN-01`. A prompt is complete only when its acceptance gate passes. Partial code without the gate evidence remains incomplete.

## Progress tracking

### Per-prompt checklist

Every handoff MUST include this checklist, updated as work progresses:

```markdown
## Progress checklist

- [ ] P1: Prompt context read (spec, ADRs, prerequisite handoffs)
- [ ] P2: Design notes written and reviewed
- [ ] P3: Implementation files created/edited
- [ ] P4: Unit tests written and passing
- [ ] P5: Integration tests written and passing (where applicable)
- [ ] P6: Lint and type-check clean
- [ ] P7: Security review completed (Hard prompts) or noted (Easy/Medium)
- [ ] P8: Handoff document written with all required fields
- [ ] P9: Acceptance gate evidence recorded
- [ ] P10: Status updated in the execution board
```

### Execution board

Track each prompt with these states:

```text
not-ready --> ready --> running --> review --> accepted
                    |          |          |
                    v          v          v
                 blocked    changes     rejected
```

A prompt becomes `ready` only when all dependencies are `accepted`. A rejected prompt returns to `ready` with review findings included in its next context. A blocked prompt records the missing decision or artifact; it does not fill the gap with an assumption.

### Master status table

Maintain this table at the bottom of this plan file. Update it after every prompt state change. The table is the single source of truth for auditable progress.

| Prompt | Status | Agent level | Dependencies | Handoff | Last updated |
|---|---|---|---|---|---|
| CKAN-01 | not-ready | Medium | DBX-24 | — | — |
| CKAN-02 | not-ready | Easy | CKAN-01 | — | — |
| CKAN-03 | not-ready | Hard | CKAN-01 | — | — |
| CKAN-04 | not-ready | Hard | CKAN-01, CKAN-03 | — | — |
| CKAN-05 | not-ready | Hard | CKAN-04 | — | — |
| CKAN-06 | not-ready | Medium | CKAN-02, CKAN-03 | — | — |
| CKAN-07 | not-ready | Hard | CKAN-06 | — | — |
| CKAN-08 | not-ready | Hard | CKAN-07 | — | — |
| CKAN-09 | not-ready | Medium | CKAN-06 | — | — |
| CKAN-10 | not-ready | Medium | CKAN-06, CKAN-09 | — | — |
| CKAN-11 | not-ready | Hard | CKAN-04, CKAN-05, CKAN-10 | — | — |
| CKAN-12 | not-ready | Medium | CKAN-10, CKAN-11 | — | — |
| CKAN-13 | not-ready | Medium | CKAN-12 | — | — |
| CKAN-14 | not-ready | Hard | CKAN-03, CKAN-13 | — | — |
| CKAN-15 | not-ready | Medium | CKAN-13 | — | — |
| CKAN-16 | not-ready | Hard | CKAN-14, CKAN-15 | — | — |
| CKAN-17 | not-ready | Hard | CKAN-16 | — | — |
| CKAN-18 | not-ready | Hard | CKAN-16, CKAN-17 | — | — |

### Auditable status checks

Every status transition MUST be backed by evidence in the handoff:

1. **`not-ready` → `ready`:** all dependency prompts are `accepted`; their handoff IDs are cited.
2. **`ready` → `running`:** the agent records its start time, the prompt text it received, and the git commit hash it started from.
3. **`running` → `review`:** the agent records all changed files, test commands run, test output summary, and the git commit hash of the completed work.
4. **`review` → `accepted`:** the reviewer records their identity, the review findings, and explicit confirmation that the acceptance gate passed. For Hard prompts, the reviewer MUST be an independent agent that did not implement the change.
5. **`review` → `changes`:** the reviewer records specific findings; the prompt returns to `ready` with findings included.
6. **`review` → `rejected`:** the reviewer records why the work is fundamentally unsound; the prompt returns to `ready` with a clean slate.
7. **`running` → `blocked` or `ready` → `blocked`:** the agent records the exact missing input, which prompt owns that input, and what unblocks it. A blocked prompt MUST NOT proceed with assumptions.

No prompt may skip a state. No agent may self-certify its own work. The `accepted` state requires a separate reviewer's evidence.

---

## Dependency overview

```text
DBX-24 (prerequisite)
  |
  v
CKAN-01 (bridge scaffold + types)
  |-- CKAN-02 (CKAN Python plugin scaffold)
  |-- CKAN-03 (Kubernetes network isolation)
  |-- CKAN-04 (Solid-OIDC auth for bridge)
  |     |-- CKAN-05 (Gov ID IdP integration)
  |-- CKAN-06 (CKAN Action API client)
  |     |-- CKAN-07 (SHACL validation engine)
  |     |     |-- CKAN-08 (RDF→tabular translation + anonymisation)
  |     |-- CKAN-09 (webhook event handler)
  |     |     |-- CKAN-10 (publication pipeline: Pod→CKAN)
  |     |           |-- CKAN-11 (full auth + publication integration)
  |     |                 |-- CKAN-12 (correction propagation)
  |     |                       |-- CKAN-13 (reconciliation + drift detection)
  |     |                             |-- CKAN-14 (adversarial security tests)
  |     |                             |-- CKAN-15 (CKAN metadata feedback)
  |     |                                   |-- CKAN-16 (end-to-end integration)
  |     |                                         |-- CKAN-17 (conformance + interop)
  |     |                                               |-- CKAN-18 (release readiness)
```

Parallel execution is allowed only where prompts do not modify the same contracts. Contract-producing prompts must be accepted before their consumers begin.

---

## Wave A: scaffold and isolation

### CKAN-01 — Bridge scaffold and shared types

**Agent level:** Medium
**Depends on:** DBX-24

**Prompt:**

> Create the CKAN bridge service scaffold. The bridge is a **separate, opt-in service** — it MUST NOT modify CSS core code or the existing Databox extension's core invariants. Establish the directory structure under `ckan-bridge/` (or `rust/ckan-bridge/` if Rust is chosen — decide and record in the handoff). Define the shared types that mirror the specification's contracts: `CkanDatasetMetadata` (provenance IRI, ODRL policy IRI, SHACL shape IRI, consent receipt IRI), `CkanActionRequest` / `CkanActionResponse` (RPC-style envelope), `PublicationJob` (Pod resource IRI → CKAN dataset id, status, idempotency key), `BridgeConfig` (CKAN base URL, API token ref, DPoP key ref, SHACL shapes path, program profile ref). Reuse the existing `src/databox/bridge/BridgeTypes.ts` patterns for provenance and idempotency. No runtime logic — pure types and interfaces only. Include a `README.md` with build and run instructions for the scaffold, and a clear statement that this is an opt-in profile that does not affect the default CSS install.

**Artifacts:** bridge directory structure, shared type definitions, interface stubs, build configuration, README.

**Acceptance gate:** another Medium agent can read the types and interfaces and understand exactly what the bridge does and does not do; the scaffold compiles/builds clean; no runtime logic exists yet.

### CKAN-02 — Thin Python CKAN plugin

**Agent level:** Easy
**Depends on:** CKAN-01

**Prompt:**

> Create the minimal Python CKAN plugin under `ckan-bridge/ckan-plugin/`. Implement a `SingletonPlugin` class that implements `IRoutes`/`IActions` (expose `/api/3/action/ckan_bridge_status` and `/api/3/action/ckan_bridge_sync` endpoints), `IAuthFunctions` (restrict write to the bridge service token; public read-only), and optionally `IDatasetForm` (add Databox metadata fields: `databox_provenance_iri`, `databox_policy_iri`, `databox_shacl_shape_iri`, `databox_consent_receipt_iri`). Implement the webhook emitter: on `dataset_created`, `dataset_updated`, `dataset_deleted`, `datastore_created`, `datastore_upserted`, emit a POST to the configured bridge webhook URL with opaque ids and a callback URL only — no sensitive content. Include a `setup.py` / `pyproject.toml`. Write unit tests for the plugin using CKAN's test framework. Do NOT implement business logic, RDF parsing, SHACL validation, or Solid authentication in Python.

**Artifacts:** Python plugin package, setup configuration, unit tests.

**Acceptance gate:** the plugin installs in a CKAN dev environment, the custom actions respond correctly, the webhook emitter fires on dataset lifecycle events with opaque payloads only, and the auth functions reject non-token write attempts.

### CKAN-03 — Kubernetes network isolation

**Agent level:** Hard
**Depends on:** CKAN-01

**Prompt:**

> Define the Kubernetes network policies and deployment manifests for the CKAN bridge. Create manifests for: a `ckan-bridge` Deployment, Service, ConfigMap, Secrets (placeholders), and two NetworkPolicies: `bridge-only-ckan-writes` (only the bridge namespace can reach CKAN API write endpoints) and `bridge-only-pod-reads` (only the bridge can reach CSS internal IPs beyond the public ingress). CSS and CKAN MUST NOT be able to talk to each other directly. Consumer agents reach CSS via the public ingress only. Follow the pattern in `databox/deployment/ipms/kubernetes/`. Include a `kustomization.yaml`. Document the required secrets: `ckan-api-token`, `bridge-dpop-key`, `bridge-shacl-shapes`. Write a validation script that checks the manifests are well-formed and the network policies enforce the intended isolation (no missing ingress/egress rules). Include an adversarial review: can CSS reach CKAN directly? Can CKAN reach Pod internal IPs? Can a consumer agent reach the bridge?

**Artifacts:** Kubernetes manifests, kustomization, validation script, adversarial network isolation review.

**Acceptance gate:** an independent Hard agent confirms CSS cannot reach CKAN, CKAN cannot reach Pod internal IPs, the bridge is the sole writer to CKAN and sole reader of Pod internal IPs, and consumer agents cannot reach the bridge or CKAN directly. The validation script passes.

---

## Wave B: authentication and identity

### CKAN-04 — Solid-OIDC authentication for the bridge

**Agent level:** Hard
**Depends on:** CKAN-01, CKAN-03

**Prompt:**

> Implement the Solid-OIDC client for the bridge service. The bridge authenticates as its own program-specific service agent (ADR-0018) and requests scoped, short-lived, DPoP-bound access tokens to read from Pods. Implement: DPoP key pair generation and loading from Kubernetes Secret; Solid-OIDC discovery and token request; DPoP proof generation per request; token caching with expiry; token refresh with re-proof of the holder key. Reuse the patterns from `src/authentication/DPoPWebIdExtractor.ts` and `src/authentication/BearerWebIdExtractor.ts` for reference, but the bridge is a client, not a server. The bridge MUST NOT store long-lived credentials. The bridge MUST NOT have write access to Pods (read-only for publication). Fail closed on: token expiry without refresh, DPoP key load failure, issuer mismatch, audience mismatch. Write unit tests with a mock OIDC provider and integration tests against a local CSS instance.

**Artifacts:** Solid-OIDC client module, DPoP proof module, token cache, tests.

**Acceptance gate:** the bridge obtains a scoped, DPoP-bound token from a CSS instance, uses it to read a Pod resource, and fails closed on expired/invalid/audience-mismatched tokens. An independent Hard reviewer confirms no long-lived credentials are stored and the key never leaves the Kubernetes Secret.

### CKAN-05 — Government ID IdP integration

**Agent level:** Hard
**Depends on:** CKAN-04

**Prompt:**

> Implement the gov ID IdP integration path through the existing Databox authorization server / broker (ADR-0005). The gov ID system (e.g. myID, national digital identity) acts as an external IdP. The broker validates the complete issuer, subject, audience, client, time, signature and assurance claim contract before producing a Databox security context. Implement: a per-program profile configuration that declares the trusted gov ID issuer(s), protocol (OIDC or SAML), claim contract, assurance crosswalk (ADR-0010), and failure behavior. Implement the mapping from verified gov ID auth to a program-specific pairwise WebID (ADR-0004). Implement the customer-linking ceremony integration (ADR-0008): gov ID assurance alone never selects the customer record; the linking ceremony combines external auth + program-specific claims + holder-key proof + audited confirmation. **If the gov ID API documentation has not been supplied (BLOCKED per spec §15), implement the interface and a mock IdP that exercises the full claim contract, and record the blocker.** The interface MUST be designed so the real gov ID API plugs in without bridge changes. Write tests for: valid auth → pairwise WebID issuance; invalid issuer → fail closed; insufficient assurance → step-up route; ambiguous customer match → fail closed to governed review.

**Artifacts:** gov ID IdP integration module, per-program profile configuration, mock IdP, tests.

**Acceptance gate:** the broker maps a verified mock gov ID authentication to a pairwise WebID; unknown issuers, mismatched claims, and ambiguous customer matches all fail closed. If the real gov ID API is not yet identified, the blocker is recorded with the exact unblocking input needed. An independent Hard reviewer confirms the pairwise WebID is non-correlatable across programs and the raw customer ID never leaves the integration plane.

---

## Wave C: data pipeline

### CKAN-06 — CKAN Action API client

**Agent level:** Medium
**Depends on:** CKAN-02, CKAN-03

**Prompt:**

> Implement a typed CKAN Action API client in the bridge. The client communicates with CKAN exclusively over HTTP via `POST /api/3/action/{action}`. Implement the actions listed in spec §5.2: `package_create`, `package_update`, `package_show`, `datastore_create`, `datastore_upsert`, `datastore_search`, `organization_show`, `organization_create`, `group_create`, `group_member_create`, `user_show`, `activity_data_list`. Handle the RPC-style response: always HTTP 200; parse `"success": true/false`. Authenticate with a CKAN API token loaded from Kubernetes Secret. Implement retry with exponential backoff (bounded) on `"success": false` or transport errors. Pin the CKAN API version (record in handoff). The client MUST NOT use direct database access (no ODBC, no SQL). Write unit tests with a mock CKAN server and integration tests against a local CKAN instance.

**Artifacts:** CKAN Action API client module, retry logic, tests.

**Acceptance gate:** the client successfully calls all listed actions against a local CKAN instance, correctly parses success/failure, retries on transient failures, and fails closed on token expiry. No direct database access exists anywhere in the code.

### CKAN-07 — SHACL validation engine

**Agent level:** Hard
**Depends on:** CKAN-06

**Prompt:**

> Implement the SHACL validation engine for the bridge. Before data moves from a Pod to CKAN, the bridge reads the RDF Linked Data from the Pod and validates it against the SHACL shapes defined in `databox/compliance/compliance.ttl` and the Web Civics namespace. Load shapes from the `bridge-shacl-shapes` ConfigMap. Implement: RDF graph loading from Pod resource (via the Solid-OIDC client from CKAN-04); SHACL validation against the loaded shapes; fail-closed behavior: if validation fails, the transaction is blocked and logged in the Databox evidence ledger (reuse `src/databox/evidence/` patterns). The validation MUST check: the data conforms to the declared record class; the ODRL policy permits publication; the consent receipt is valid and not expired; the assurance level meets the record class minimum. Unknown or unsupported shapes fail closed. Write tests for: valid data passes; invalid data is blocked; missing policy is blocked; expired consent is blocked; unknown shape fails closed.

**Artifacts:** SHACL validation module, shape loader, evidence logging integration, tests.

**Acceptance gate:** an independent Hard reviewer confirms non-compliant data never reaches CKAN; the validation covers record class, ODRL policy, consent receipt, and assurance; all failure paths log to the evidence ledger. Human policy/domain review required for the shape selection.

### CKAN-08 — RDF→tabular translation and anonymisation

**Agent level:** Hard
**Depends on:** CKAN-07

**Prompt:**

> Implement the RDF→tabular translation and anonymisation pipeline. The bridge reads the validated RDF graph from the Pod (preserving the complex relationships defined by `dbx:` terms and nquins) and translates it into the tabular JSON payload expected by CKAN's `datastore_create` / `datastore_upsert`. Implement: field mapping from `dbx:` record classes to CKAN dataset schemas (configurable per program profile); anonymisation/filtering that strips PII per the program profile before the payload reaches CKAN; provenance preservation — the CKAN dataset metadata includes `databox_provenance_iri`, `databox_policy_iri`, `databox_shacl_shape_iri`, `databox_consent_receipt_iri` (IRIs only, not copies of the signed artifacts); supersession link mapping to CKAN dataset versions or `datastore_upsert` records with a `supersedes` field. The anonymisation decision MUST be logged as evidence (ADR-0011). Personal information that cannot be lawfully published MUST be stripped at the bridge, not at CKAN. Write tests for: correct field mapping; PII stripping; provenance IRI preservation; supersession mapping; empty/invalid graph handling.

**Artifacts:** translation module, anonymisation module, field mapping configuration, evidence logging, tests.

**Acceptance gate:** an independent Hard reviewer confirms no PII reaches CKAN for records marked non-publishable; provenance IRIs are preserved; supersession links are correct; anonymisation decisions are logged. Human privacy review required.

---

## Wave D: event handling and publication

### CKAN-09 — Webhook event handler

**Agent level:** Medium
**Depends on:** CKAN-06

**Prompt:**

> Implement the webhook event handler in the bridge. The bridge receives webhooks from the CKAN plugin (CKAN-02) on `dataset_created`, `dataset_updated`, `dataset_deleted`, `datastore_created`, `datastore_upserted`. Each webhook carries opaque ids and a callback URL. The handler: verifies the webhook signature (HMAC or mTLS — decide and record); fetches details via the CKAN Action API client (CKAN-06) using the bridge service token; determines whether the change originated from the bridge or from a CKAN UI editor; routes the event to the appropriate downstream handler (publication pipeline, metadata feedback, correction propagation). Implement webhook authentication (HMAC signature with shared secret from Kubernetes Secret, or mTLS). Write tests for: valid webhook → correct routing; invalid signature → rejected; bridge-originated change → no echo loop; editor-originated change → metadata feedback queued.

**Artifacts:** webhook handler module, signature verification, event router, tests.

**Acceptance gate:** the handler correctly routes all webhook types, rejects invalid signatures, and prevents echo loops for bridge-originated changes.

### CKAN-10 — Publication pipeline (Pod→CKAN)

**Agent level:** Medium
**Depends on:** CKAN-06, CKAN-09

**Prompt:**

> Implement the publication pipeline: Pod → CKAN. The pipeline: (1) detects a new/updated record in a Databox via the durable cursor feed (DBX-21) or webhook; (2) authenticates via Solid-OIDC (CKAN-04) and reads the RDF from the Pod; (3) runs SHACL validation (CKAN-07) — fail closed on validation failure; (4) runs anonymisation/translation (CKAN-08); (5) calls `package_create` or `package_update` + `datastore_upsert` on CKAN (CKAN-06); (6) records the publication event in the Databox disclosure ledger (ADR-0023 disclosure-view) with a signed receipt. Implement idempotency: a publication job is keyed by the Pod resource IRI + content digest; a retry reuses the same key and MUST NOT create a duplicate CKAN dataset. Implement a job queue with status tracking: `pending`, `reading-pod`, `validating`, `translating`, `publishing`, `published`, `failed`, `quarantined`. Failed jobs are quarantined for review, never silently dropped. Write integration tests with a local CSS + CKAN stack.

**Artifacts:** publication pipeline module, job queue, disclosure ledger integration, integration tests.

**Acceptance gate:** a record deposited in a Databox appears in CKAN as a dataset with correct metadata and DataStore rows; a retry does not duplicate; a validation failure quarantines the job; the disclosure ledger records the publication with a signed receipt.

### CKAN-11 — Full authentication + publication integration

**Agent level:** Hard
**Depends on:** CKAN-04, CKAN-05, CKAN-10

**Prompt:**

> Integrate the full authenticated publication flow end-to-end. Combine: gov ID authentication (CKAN-05) → Solid-OIDC token acquisition (CKAN-04) → Pod read → SHACL validation (CKAN-07) → anonymisation/translation (CKAN-08) → CKAN publication (CKAN-10) → disclosure ledger. Test the full flow with: a mock gov ID IdP, a local CSS instance with the Databox extension, and a local CKAN instance. Verify: the pairwise WebID is used for Pod access (not the gov ID subject); the assurance level is checked against the record class minimum; step-up is triggered for insufficient assurance without revealing record existence (ADR-0023); the publication is idempotent; the disclosure ledger entry is signed and append-only. Write an adversarial test: a compromised bridge identity attempting to publish a non-publishable record is blocked at the SHACL/anonymisation stage. Human security/identity review required.

**Artifacts:** integrated publication flow, end-to-end test suite, adversarial test, evidence.

**Acceptance gate:** an independent Hard reviewer confirms the full flow works with mock gov ID, the pairwise WebID is non-correlatable, step-up does not leak existence, and the adversarial test is blocked. Human security review sign-off required.

---

## Wave E: correction, reconciliation and feedback

### CKAN-12 — Correction propagation (ADR-0023)

**Agent level:** Medium
**Depends on:** CKAN-10, CKAN-11

**Prompt:**

> Implement correction propagation from Databox to CKAN. When a consumer submits a correction request via the Databox submission gateway and a reviewer issues a disposition (`corrected`, `statement-associated`, `partially-corrected`, `no-change`, `more-information-required`, `redirected`), the bridge: (1) detects the disposition via the durable cursor feed; (2) checks whether the corrected record was previously published to CKAN; (3) if so, updates or supersedes the CKAN dataset via `package_update` + `datastore_upsert` with the `supersedes` field; (4) creates a per-recipient notification duty (`dbx:notifyPriorRecipient`) for any downstream CKAN consumer that fetched the data, with distinct `queued`/`attempted`/`accepted`/`failed` states and lawful exceptions applied. A notification hint is never proof the recipient's copy was corrected (ADR-0023). Write tests for: corrected record → CKAN dataset updated; `no-change` disposition → no CKAN change but duty logged; per-recipient duties tracked independently.

**Artifacts:** correction propagation module, per-recipient duty tracker, tests.

**Acceptance gate:** a corrected record propagates to CKAN; `no-change` does not alter CKAN; per-recipient duties are independently tracked with correct states; a notification hint is not treated as proof of correction.

### CKAN-13 — Reconciliation and drift detection

**Agent level:** Medium
**Depends on:** CKAN-12

**Prompt:**

> Implement reconciliation and drift detection between Pods and CKAN. The bridge runs a periodic reconciliation sweep: for each published dataset, fetch the current CKAN state via `package_show` and compare against the Pod resource. Detect: CKAN metadata that drifted from the Pod (e.g. an editor changed a field in CKAN); Pod records that were superseded but the CKAN dataset was not updated; Pod records that were deleted/tombstoned but the CKAN dataset remains. On drift: log the discrepancy in the Databox evidence ledger; queue a metadata feedback event (CKAN-15) for editor-originated changes; queue a republish event for Pod-originated changes. Implement a configurable sweep interval. Write tests for: drift detected and correctly classified; no false positives on matching state; sweep interval respected.

**Artifacts:** reconciliation module, drift detector, evidence logging, tests.

**Acceptance gate:** drift is detected and correctly classified (editor-originated vs Pod-originated vs orphaned CKAN dataset); no false positives; the sweep is configurable and does not overload CKAN or CSS.

### CKAN-14 — Adversarial security tests

**Agent level:** Hard
**Depends on:** CKAN-03, CKAN-13

**Prompt:**

> Produce an adversarial test suite for the CKAN bridge. Test the threats identified in the spec and the Databox threat model (DBX-03) as they apply to the bridge: a compromised bridge identity attempting cross-program publication; a CKAN API token theft attempt reaching Pod internal IPs; a gov ID replay attack; a SHACL bypass attempt with malformed RDF; an anonymisation bypass with crafted graph data; a webhook spoofing attempt; a direct database access attempt (ODBC/SQL); a DPoP key compromise; a CKAN editor escalating to Pod write access; a consumer agent reaching the bridge or CKAN directly. Each test MUST fail closed. Add newly discovered threats and fixes without weakening expected controls. An independent Hard agent (not the implementer) reviews and reproduces critical negative tests.

**Artifacts:** adversarial test suite, findings, fixes, residual-risk register.

**Acceptance gate:** an independent Hard security agent reviews results and reproduces critical negative tests; no critical or high unresolved tenant, identity, cryptographic or evidence finding remains.

### CKAN-15 — CKAN metadata feedback (CKAN→Pod)

**Agent level:** Medium
**Depends on:** CKAN-13

**Prompt:**

> Implement the CKAN→Pod metadata feedback path. When a CKAN editor updates dataset metadata (detected via webhook or reconciliation), the bridge: (1) fetches the updated metadata via `package_show`; (2) determines whether the change affects a Databox-linked field; (3) if so, writes a **metadata annotation** back to the Pod's disclosure-view (append-only, ADR-0011). The bridge MUST NOT modify the original Pod record. The annotation is a new resource in the disclosure-view container, linked to the original record, carrying the CKAN field change, the editor identity (minimised per exchange-and-evidence.md Audit), and a timestamp. Write tests for: editor changes a Databox-linked field → annotation created; editor changes a non-linked field → no annotation; bridge fails to write annotation → logged, retried, never silently dropped.

**Artifacts:** metadata feedback module, disclosure-view annotation writer, tests.

**Acceptance gate:** Databox-linked field changes produce append-only annotations in the Pod disclosure-view; non-linked changes do not; the original record is never modified; annotation failures are retried and logged.

---

## Wave F: integration, conformance and release

### CKAN-16 — End-to-end integration

**Agent level:** Hard
**Depends on:** CKAN-14, CKAN-15

**Prompt:**

> Assemble the full end-to-end integration test stack: a local CSS instance with the Databox extension, a local CKAN instance with the thin Python plugin, the bridge microservice, a mock gov ID IdP, and a synthetic consumer agent. Run the full lifecycle: (1) citizen authenticates via mock gov ID; (2) broker issues pairwise WebID; (3) org deposits a record to the Databox; (4) bridge detects the record, validates, translates, publishes to CKAN; (5) citizen searches CKAN and finds the dataset; (6) citizen submits a correction request; (7) reviewer issues a disposition; (8) bridge propagates the correction to CKAN; (9) reconciliation sweep confirms no drift. Verify the full evidence chain: every step has a signed receipt or evidence ledger entry. Verify network isolation: CSS cannot reach CKAN, CKAN cannot reach Pods, consumer cannot reach the bridge. Document the deployment topology and run instructions.

**Artifacts:** end-to-end integration test suite, deployment documentation, evidence chain verification.

**Acceptance gate:** the full lifecycle runs without manual intervention; every step has verifiable evidence; network isolation holds; an independent Hard reviewer confirms the integration is not a mock-up of the security boundaries.

### CKAN-17 — Conformance and interoperability assessment

**Agent level:** Hard
**Depends on:** CKAN-16

**Prompt:**

> Run conformance and interoperability checks against the integrated CKAN bridge. Validate: the CKAN Action API surface used by the bridge matches the pinned CKAN version; the Solid-OIDC flow works with an independent Solid client (not just the bridge); the SHACL shapes correctly enforce the Web Civics compliance model; the anonymisation pipeline produces no PII leaks (verified by data inspection); the correction propagation respects ADR-0023 timing and state requirements; the disclosure ledger is append-only and tamper-evident; the CKAN plugin does not bypass CKAN's authorization model. Produce a machine-readable compatibility manifest and human-readable results with evidence links and explicit non-conformance. Test with at least two independent non-Databox Solid client stacks for the Pod access side. Validate that the CKAN dataset search works correctly (Solr indexing is triggered by the application layer, not bypassed).

**Artifacts:** compatibility manifest, conformance report, independent-client evidence, exception register.

**Acceptance gate:** every requirement is passed, failed or explicitly not applicable with evidence; a consumer using an independent client and accepted external Solid-OIDC issuer can discover, authenticate, read permitted resources, and find the published data in CKAN; no requirement is marked passed solely because code or configuration exists.

### CKAN-18 — Operational and release readiness

**Agent level:** Hard, with Easy documentation subtasks
**Depends on:** CKAN-16, CKAN-17

**Prompt:**

> Assemble deployment, key ceremony, tenant onboarding, backup/restore, audit verification, incident response, gov ID integration, CKAN API token rotation, DPoP key rotation, SHACL shape updates, policy publication, reconciliation monitoring and upgrade runbooks. Generate an SBOM for the bridge, dependency and secret scan, configuration hardening checklist and rollback plan. Have a Hard integrator review all CKAN prompt handoffs, decisions, residual risks and conformance evidence. Include a standards-watch and migration process for CKAN API version changes and gov ID API changes, with security, privacy, accessibility and internationalization review gates. Document the gov ID API identification status: if still BLOCKED, the release is labelled "pre-gov-ID-integration" and the exact unblocking input is recorded.

**Artifacts:** runbooks, deployment profiles, security artifacts, release checklist, signed readiness decision.

**Acceptance gate:** restore and key-rotation rehearsals pass; operators can detect failed publication jobs and reconciliation drift; accepted residual risks have named owners; release approval is independent of subsystem implementers; the gov ID integration status is explicitly recorded.

---

## Completion definition

The CKAN bridge implementation plan is complete when CKAN-01 through CKAN-18 are accepted and the release record links to:

- all binding decisions (existing ADRs + any CKAN-specific ADRs);
- the threat and residual-risk registers (DBX-03 + CKAN-14);
- validated program profiles and SHACL shapes;
- build and test evidence;
- cryptographic, identity, policy and tenant-isolation reviews;
- CKAN API conformance results;
- gov ID integration status (integrated or explicitly BLOCKED with unblocking input);
- interoperability and conformance results (CKAN-17);
- operational rehearsal results (CKAN-18);
- named owners for every accepted residual risk.

Completion is an evidence-backed state, not the exhaustion of a prompt count. New findings create a new numbered prompt with dependencies and acceptance criteria rather than being hidden inside an existing completion claim.

---

## Master status table

| Prompt | Status | Agent level | Dependencies | Handoff | Last updated |
|---|---|---|---|---|---|
| CKAN-01 | accepted | Medium | DBX-24 | CKAN-01.md | 2026-07-25 |
| CKAN-02 | ready | Easy | CKAN-01 | - | - |
| CKAN-03 | ready | Hard | CKAN-01 | - | - |
| CKAN-04 | not-ready | Hard | CKAN-01, CKAN-03 | — | — |
| CKAN-05 | not-ready | Hard | CKAN-04 | — | — |
| CKAN-06 | not-ready | Medium | CKAN-02, CKAN-03 | — | — |
| CKAN-07 | not-ready | Hard | CKAN-06 | — | — |
| CKAN-08 | not-ready | Hard | CKAN-07 | — | — |
| CKAN-09 | not-ready | Medium | CKAN-06 | — | — |
| CKAN-10 | not-ready | Medium | CKAN-06, CKAN-09 | — | — |
| CKAN-11 | not-ready | Hard | CKAN-04, CKAN-05, CKAN-10 | — | — |
| CKAN-12 | not-ready | Medium | CKAN-10, CKAN-11 | — | — |
| CKAN-13 | not-ready | Medium | CKAN-12 | — | — |
| CKAN-14 | not-ready | Hard | CKAN-03, CKAN-13 | — | — |
| CKAN-15 | not-ready | Medium | CKAN-13 | — | — |
| CKAN-16 | not-ready | Hard | CKAN-14, CKAN-15 | — | — |
| CKAN-17 | not-ready | Hard | CKAN-16 | — | — |
| CKAN-18 | not-ready | Hard | CKAN-16, CKAN-17 | — | — |
