# DBX-06 — CKAN Bridge Specification

**Status:** Specification (candidate). **Baseline:** Community Solid Server 7.1.9 with Databox extension (DBX-01…DBX-24).
**Depends on:** ADR-0016 (integration plane), ADR-0017 (data exchange), ADR-0023 (record awareness/correction), `databox/compliance/` (Web Civics corpus).
**Relates to:** `databox/deployment/ipms/` (Kubernetes skeleton), `src/databox/bridge/` (existing institutional bridge).

> **This is an opt-in deployment profile, not a universal requirement.** The CKAN bridge is a specialised integration profile for government and CKAN-using organisations. It does not change the default Community Solid Server install path, does not alter the Databox extension's core invariants, and is not required for non-CKAN Databox deployments. A Databox provider opts into this profile by deploying the bridge microservice, the CKAN instance, and the thin Python plugin. The universal Databox invariants (program isolation, pairwise identity, append-only evidence, explicit consumer submission, etc.) apply unchanged; the CKAN profile supplies program-specific facts and integration configuration on top of them, following the same pattern as the IPMS deployment profile (`databox/deployment/ipms/`).

---

## 1. Purpose

Governments and other CKAN users need a way to publish, catalogue, and share data with consumers and citizens while preserving the agency of the natural person over their personal information. This specification defines a **decoupled CKAN Bridge** that sits between the Databox (Community Solid Server) and a CKAN data portal, enabling:

- Government agencies to publish non-personal, anonymised, or consented datasets to CKAN from Solid Pods.
- Consumers/citizens to exercise access and correction rights (ADR-0023) with the resulting dispositions reflected in CKAN metadata.
- CKAN to act as the public-facing catalogue and search index (backed by PostgreSQL + Solr) while the Solid Pod layer retains the authoritative, consent-bound source records.
- Compliance with the Web Civics ontology boundary: "Civics" (natural-person activity) stays in the Pod; "Civic" (institutional artifact) stays in CKAN. The bridge is the enforced boundary between them.

This specification does **not** describe a monolithic Python extension. It describes a hybrid microservice architecture with a minimal Python CKAN plugin and a separately deployable bridge service, deployed as an **opt-in profile** by organisations that need CKAN integration.

---

## 2. Architectural principles

### 2.1 Decoupled bridge is mandatory

Tight coupling — embedding CKAN logic in CSS, or rewriting Solid in Python — is rejected. The bridge is a separately deployable, containerised microservice. This is functionally mandatory for the Web Civics compliance model (see §8) and is the industry-standard approach for "CKAN v3" / Next Gen architectures.

**Rationale:**

- **Security isolation:** A compromised output layer must not grant root access to Solid Pods or the CKAN database. Strict Kubernetes network policies confine the bridge.
- **Independent scaling:** CSS handles highly concurrent small-file read/writes; CKAN handles large dataset indexing and portal traffic. They scale independently.
- **Language freedom:** CSS is TypeScript/Node.js; CKAN is Python. The bridge may be written in a systems language (e.g. Rust) suited to secure, concurrent data processing without fighting either platform's native environment.
- **Civics/Civic boundary:** The bridge physically enforces the distinction between the natural person's Pod activity and the institution's CKAN artifact.

### 2.2 No direct database access

Direct ODBC / SQL access to CKAN's PostgreSQL databases is **prohibited**. The bridge communicates with CKAN exclusively over HTTP via the CKAN Action API (see §5). Direct database access:

- Breaks Solr search indexing (inserts bypass the application layer that notifies Solr).
- Bypasses CKAN's granular authorization system.
- Risks schema corruption (revision histories, activity streams, orphaned records).
- Violates least-privilege principles required for government deployment.

### 2.3 CSS remains unmodified at the core

The bridge does not alter CSS base source code. CSS natively allows plugging in custom modules via Components.js without altering its core. The bridge consumes the standard Solid/LWS HTTP surface and the Databox extension's existing integration-plane interfaces (`src/databox/bridge/`, `src/databox/integration/`).

### 2.4 CKAN runs headless

CKAN is configured to run purely as an API endpoint, decoupled from Solid authentication. A bespoke frontend MAY be built separately that reads/writes via CKAN's HTTP endpoints. The bridge does not wrestle with CKAN's Jinja2 templates.

---

## 3. Participants and layers

```text
┌──────────────────────┐      ┌──────────────────────┐      ┌──────────────────────┐
│  Solid Pod Layer     │      │  CKAN Bridge         │      │  CKAN Registry Layer │
│  (CSS + Databox)     │      │  (microservice)      │      │  (Python + Postgres  │
│                      │      │                      │      │   + Solr)            │
│  - RDF Linked Data   │◀────▶│  - Solid-OIDC auth   │◀────▶│  - Action API        │
│  - ACP/WAC access    │      │  - SHACL validation  │      │  - DataStore API     │
│  - Append-only       │      │  - RDF→tabular xlate │      │  - Dataset catalogue │
│  - Signed receipts   │      │  - Webhook handling  │      │  - Search index      │
│  - ODRL policies     │      │  - Anonymisation     │      │  - Org structure     │
└──────────────────────┘      └──────────────────────┘      └──────────────────────┘
        ▲                              ▲
        │                              │
   Consumer agent              Kubernetes NetworkPolicy
   (citizen wallet)            (bridge is sole writer to
                                CKAN API; sole reader of
                                Pod internal IPs)
```

### 3.1 Solid Pod Layer (CSS)

The Kubernetes-deployed CSS with Databox extension acts as the decentralised data store. It handles Access Control Policies (ACP) or Web Access Control (WAC) so data is released only to authorized agents. It serves Linked Data securely over HTTP. No CKAN logic is built into CSS.

### 3.2 CKAN Data Registry Layer

CKAN acts as the public-facing catalogue and metadata registry, backed by PostgreSQL (core metadata + DataStore) and Apache Solr (search). It indexes datasets and provides search for government users. It runs purely as an API endpoint, decoupled from Solid authentication.

### 3.3 Integration Bridge (Output Layer)

An independent, containerised microservice between CSS and CKAN. Its responsibilities are strictly bounded:

- **Authentication:** Uses Solid-OIDC to authenticate and request scoped access to Pods.
- **Data translation:** Reads RDF Linked Data from Pods and translates to tabular/JSON formats expected by CKAN's DataStore.
- **Event handling:** Listens for webhook events from CKAN or Pod change notifications and synchronises authorised data.
- **Compliance enforcement:** Validates Pod RDF against SHACL shapes before any data moves to CKAN.
- **Anonymisation:** Enforces strict anonymisation and filtering before payloads reach CKAN storage.

---

## 4. The thin Python CKAN plugin

A minimal Python plugin is required to hook into CKAN's internal event system. CKAN's extension architecture relies on the CKAN Plugins Toolkit, which expects plugins to be standard Python packages.

### 4.1 What the Python plugin does (minimal glue)

The plugin's only job is to catch core CKAN events and forward them via webhooks to the bridge. It implements only the interfaces strictly required:

- **`IRoutes` / `IActions`:** Expose a custom `/api/3/action/ckan_bridge_*` endpoint pair for the bridge to call back for dataset status synchronisation.
- **`IDatasetForm` (optional):** Add Databox-specific metadata fields (provenance IRI, ODRL policy IRI, SHACL shape IRI, consent receipt IRI) to dataset schemas.
- **`IAuthFunctions`:** Restrict write access to the bridge's service API token only; public users get read-only.
- **`ITemplateHelpers` (only if CKAN's default UI is used):** Inject Databox provenance links into dataset pages. If CKAN runs headless, this is omitted.
- **Bootstrapping:** The entry point is a Python class inheriting from `ckan.plugins.SingletonPlugin`.

### 4.2 What the Python plugin does NOT do

- No business logic, no heavy data processing, no external API routing.
- No Solid authentication, no RDF parsing, no SHACL validation.
- No direct database manipulation.

All heavy lifting is offloaded to the bridge microservice.

### 4.3 Webhook contract

The plugin emits webhooks to the bridge on:

- `dataset_created` — a new dataset was created in CKAN (bridge may need to link it back to a Pod resource).
- `dataset_updated` — metadata changed (bridge checks whether the change originated from the bridge or from a CKAN UI editor).
- `dataset_deleted` — bridge records the deletion and updates the Databox disclosure ledger.
- `datastore_created` / `datastore_upserted` — data rows changed.

Webhooks carry only opaque ids and a callback URL; no sensitive content. The bridge fetches details via the Action API using its service token.

---

## 5. CKAN API integration

### 5.1 The Action API (RPC-style)

CKAN uses an RPC-style API, not strict REST. Reference: <https://docs.ckan.org/en/latest/api/>.

- **Endpoint structure:** `POST /api/3/action/{action_name}` (e.g. `package_show`, `datastore_create`).
- **Payloads:** HTTP POST with JSON dictionary of parameters.
- **Responses:** Always HTTP 200; parse `"success": true/false` in the JSON body.

### 5.2 Actions used by the bridge

| Action | Direction | Purpose |
|---|---|---|
| `package_create` | Bridge → CKAN | Create a new dataset for a published Pod resource. |
| `package_update` | Bridge → CKAN | Update dataset metadata (provenance, policy, supersession). |
| `package_show` | Bridge → CKAN | Fetch current dataset state for reconciliation. |
| `datastore_create` | Bridge → CKAN | Create a DataStore table for tabular Pod data. |
| `datastore_upsert` | Bridge → CKAN | Insert/update rows from translated RDF. |
| `datastore_search` | Bridge → CKAN | Read back data for verification. |
| `organization_show` / `organization_create` | Bridge → CKAN | Map Databox program → CKAN organization. |
| `group_create` / `group_member_create` | Bridge → CKAN | Map ODRL policy class → CKAN group (optional). |
| `user_show` | Bridge → CKAN | Verify the bridge service token's identity. |
| `activity_data_list` | Bridge → CKAN | Audit trail synchronisation. |

### 5.3 Authentication to CKAN

The bridge authenticates to CKAN using a **CKAN API token** (created via `user_create` + `token_create` or CKAN's admin UI). The token is stored as a Kubernetes Secret, mounted into the bridge container, and rotated via the control plane. It is **never** shared with CSS or the consumer agent.

### 5.4 No OpenAPI spec — community alternatives

CKAN does not ship an official OpenAPI/Swagger specification because of its RPC-style design. For generating typed client libraries (e.g. Rust structs for the bridge), rely on:

- Community-maintained OpenAPI definitions (e.g. `mjanez/ckan-openapi`).
- The official docs at <https://docs.ckan.org/en/latest/api/> mapped into the bridge's typed structs manually.

The bridge MUST pin the CKAN API version it targets (e.g. CKAN 2.10.x / 2.11.x) and fail closed on unknown action responses.

---

## 6. Solid-OIDC authentication and Pod access

### 6.1 Ephemeral access tokens

The bridge never stores long-lived credentials for Pod access. It requests scoped access tokens via Solid-OIDC only when actively pulling data from a Pod. This follows ADR-0009 (token offline/stepup/revocation lifecycle) and ADR-0016 (per-bridge service authority).

### 6.2 Bridge service identity

Each bridge instance authenticates as its own program-specific service agent (a distinct stable HTTPS service identity, per ADR-0018). WAC/ACP permits it to **read only** the record containers assigned to that service for publication purposes. The bridge has:

- **No consumer-vault access** (invariant 5; ADR-0017).
- **No cross-program role** (ADR-0016 HD-13).
- **No write access to Pods** — publication is a read-and-translate operation. Submissions flow the other way (consumer → org) via the existing Databox submission gateway.

### 6.3 DPoP sender-constraint

Access tokens are DPoP-bound (delegated to `@solid/access-token-verifier`, `src/authentication/DPoPWebIdExtractor.ts`). The bridge holds its own signing key pair for DPoP proofs; the private key lives in a Kubernetes Secret and is never exported.

### 6.4 Government ID authentication and Solid-compatible WebID issuance

Government deployments require citizens to authenticate against a government-issued identity credential (e.g. myID in Australia, or equivalent national digital identity schemes). This is a **provider-side authentication requirement**: the government agency or contracted platform operator hosting the CKAN + Databox instances is responsible for integrating with the relevant gov ID API before a citizen can access their Databox or exercise data-sharing rights through CKAN.

The gov ID system acts as an **external Identity Provider (IdP)** in the architecture defined by ADR-0005. The existing Databox authorization server / broker already handles this pattern:

```text
Citizen
  │
  ▼
Gov ID system (external IdP: myID, national digital identity, etc.)
  │  authenticates the human at a verified assurance level
  ▼
Databox Authorization Server / Broker (ADR-0005)
  │  validates issuer, subject, audience, assurance claim contract
  │  maps verified external auth → program-specific pairwise WebID (ADR-0004)
  │  normalizes assurance per ADR-0010 crosswalk
  ▼
Solid-compatible WebID + short-lived DPoP-bound access token
  │
  ▼
CSS / Databox (resource server) + CKAN Bridge
```

**Key design points:**

- **The gov ID system is NOT a universal allowlist.** Per ADR-0005, IdP trust is a **per-program profile choice**. Each government program's profile declares its trusted gov ID issuer(s), the exact claim contract, the assurance mapping (ADR-0010), and failure behavior. The broker validates the complete issuer, subject, audience, client, time, signature and assurance claim contract before producing any Databox security context.

- **The broker issues the Solid-compatible WebID, not the gov ID system.** The gov ID system authenticates the human only; it never becomes the Databox storage server or the WAC authority (ADR-0005). The broker maps the verified external authentication to a **program-specific pairwise WebID** (ADR-0004) so the citizen's identity across government programs remains non-correlatable. This is the issuance mechanism — the WebID is derived from the broker's mapping registry, not from the gov ID system directly.

- **Customer linking is a separate ceremony (ADR-0008).** Gov ID assurance alone never selects which internal customer/relationship record the citizen maps to. The connection ceremony (ADR-0008) combines: (1) validated external gov ID authentication + assurance; (2) program-specific claims or an explicit account-linking challenge to resolve exactly one customer record; (3) vault proof of the pairwise holder key; and (4) audited confirmation. Ambiguous or duplicate matches fail closed into governed review.

- **Assurance is multi-dimensional (ADR-0010).** The gov ID authentication is normalized into separate dimensions (identity proofing strength, authenticator strength, federation/issuer trust, authentication freshness, step-up state, delegation). Record classes state their minimums per dimension. A citizen who authenticated at a low assurance grade is denied access to high-sensitivity records and offered a step-up route (ADR-0009), without revealing whether the record exists (ADR-0023 existence-vs-payload separation).

- **The gov ID API itself is not yet identified.** The specific API surface for the relevant government digital identity system (e.g. myID's machine-to-machine integration endpoint, SAML/OIDC federation metadata, or a dedicated gov ID API) has not been located at specification time. This is recorded as an open sub-question (see §15). The architecture is designed so that whichever API is identified, it plugs into the broker as another trusted external IdP — the broker's per-program profile declares the issuer, protocol, claim contract, and assurance crosswalk.

### 6.5 LDAP and directory services — what they are and what they are not

LDAP / Active Directory may be present in a government deployment's existing infrastructure. It is important to distinguish two completely separate uses:

- **Login federation (NOT LDAP):** Authenticating citizens or staff against a gov ID system or enterprise IdP is an **OIDC / SAML federation** concern, handled by the Databox authorization server / broker (ADR-0005). It MUST NOT be implemented as an LDAP connector job. The existing IPMS deployment README states this explicitly: "LDAP/AD connector jobs are directory data import jobs via the mapper. Login federation is a separate OIDC/SAML bridge and must not be implemented as an LDAP connector job."

- **Directory data import (LDAP, but not for auth):** LDAP/AD may be used as a **data source** for importing organisational directory information (staff directories, group memberships, organisational hierarchies) into Pods via the IPMS connector mapper. This is a one-way data import, not an authentication flow. The imported data becomes RDF resources in Pods; it does not grant LDAP-based login.

**If the government deployment has an existing LDAP/AD infrastructure**, the path is:

1. **For citizen authentication:** integrate the gov ID system (myID or equivalent) via the broker as an external OIDC/SAML IdP (ADR-0005). LDAP is not involved.
2. **For staff/reviewer authentication:** if the agency uses LDAP/AD for staff login, front it with an OIDC/SAML bridge (e.g. Keycloak, Entra ID, or a Shibboleth IdP) that federates LDAP directory authentication into OIDC. The Databox broker then trusts that OIDC IdP per the program profile. The bridge never speaks LDAP directly for authentication.
3. **For directory data:** LDAP/AD connector jobs import organisational structure data into Pods via the IPMS mapper, separately from authentication.

---

## 7. SHACL validation and data translation

### 7.1 Validation before transfer

Before data moves from a Pod to CKAN, the bridge reads the Linked Data and validates it against the SHACL shapes defined in the Web Civics namespace and the Databox compliance vocabulary (`databox/compliance/compliance.ttl`, `https://dev.linkeddata.au/def/solid-databox-compliance#`). If a requested transfer violates a defined modality of human agency or a governmental compliance requirement, the bridge **blocks the transaction**. Non-compliant data never touches the government's Postgres database.

### 7.2 RDF → tabular translation

The bridge reads the RDF graph from the Pod (preserving the complex relationships defined by `dbx:` terms and nquins) and translates it into the tabular JSON payload expected by CKAN's `datastore_create` / `datastore_upsert`:

```text
Pod RDF graph
  │
  ├─ SHACL validation (fail closed)
  │
  ├─ Anonymisation / filtering (strip PII per program profile)
  │
  ├─ Field mapping (dbx: record class → CKAN dataset schema)
  │
  └─ JSON payload → POST /api/3/action/datastore_upsert
```

### 7.3 Provenance preservation

The translation preserves the semantic context that makes the data legally compliant:

- The CKAN dataset metadata includes `databox_provenance_iri` (the Pod resource IRI), `databox_policy_iri` (the ODRL policy), `databox_shacl_shape_iri`, and `databox_consent_receipt_iri`.
- The cryptographic proof of the natural person's consent (signed receipt, ADR-0011) is referenced, not copied. CKAN stores the IRI; the Pod retains the authoritative signed artifact.
- Supersession links (ADR-0018) are mapped to CKAN dataset versions or `datastore_upsert` records with a `supersedes` field.

---

## 8. Web Civics compliance boundary

### 8.1 Civics vs. Civic

The Web Civics namespace (`https://ns.webcivics.net`) differentiates between:

- **Civics:** the grassroots activity of the natural person — lives in the Solid Pod.
- **Civic:** the resulting institutional infrastructure — lives in CKAN.

The bridge enforces this physically. Coupling the systems tightly, or bypassing the application layer with a direct ODBC database link, collapses this boundary and strips agency from the natural person by forcefully importing their data into an institutional structure without ongoing consent checks.

### 8.2 Australian legislation (machine-readable)

The Web Civics namespace provides machine-readable Australian legislation (Privacy Act 1988, Consumer Data Right Rules) as RDF/N3. The Databox compliance layer (`databox/compliance/`) pins these to Federal Register compilations and SHA-256 digests. The bridge uses these as the normative source for:

- Determining which records are personal information vs. CDR data.
- Enforcing the CDR 10-business-day correction clock (candidate, gated behind ADR-0015 human attestation).
- Applying APP 10/12/13 timing and exceptions (candidate, gated).
- Dashboard disclosure rules (CDR 7.9/7.10/7.14/7.15, candidate, gated).

**No compliance claim is made until the ADR-0015 legal-compliance gate clears** (ingested corpus manifest + human attestation of the applicability/exception mapping, per R-12). The bridge implements the *mechanism*; asserting compliance is gated.

### 8.3 Agent-centric context preservation

Direct SQL database drivers strip away the semantic context that makes data legally compliant. The bridge reads the RDF graph directly from the Pod, preserving the complex relationships defined by nquins. This ensures any data entering CKAN remains strictly bound to an enumerated state involving cryptography-supported identifiers and related datasets of an agent and entity-centric basis.

---

## 9. Security considerations

### 9.1 Zero-trust networking

Inside Kubernetes, network policies ensure:

- The bridge is the **only** service allowed to talk to CKAN API write endpoints.
- The bridge is the **only** service allowed to query Solid Pod internal IPs (beyond the public ingress).
- CSS and CKAN cannot talk to each other directly; all traffic flows through the bridge.
- Consumer agents reach CSS via the public ingress only; they cannot reach CKAN or the bridge directly.

### 9.2 Least-privilege model

- **Ephemeral access tokens:** scoped, short-lived, DPoP-bound.
- **CKAN API token:** scoped to the bridge's organization(s); no admin rights.
- **Bridge service identity:** per-program, no cross-program role (ADR-0016 HD-13).
- **Data boundary enforcement:** anonymisation and filtering happen in the bridge before the payload reaches CKAN.

### 9.3 Data boundary enforcement

If the output layer moves data from a Pod to a public CKAN portal, the bridge enforces strict anonymisation and filtering before the payload ever reaches the CKAN storage layer. Personal information that cannot be lawfully published is stripped at the bridge, not at CKAN. The bridge logs the anonymisation decision as evidence (ADR-0011 evidence ledger).

### 9.4 Hosting-provider threat model

Per invariant 10, hosting-provider administration is treated as a security threat and controlled below the RDF ACL layer. The bridge's secrets (CKAN token, DPoP private key) are never accessible to the CSS storage backend or the CKAN database operator.

---

## 10. Kubernetes deployment

### 10.1 Topology

The bridge deploys as a separate Deployment in the same Kubernetes cluster as CSS and CKAN, with its own Service, ConfigMap, and Secrets. The existing IPMS skeleton (`databox/deployment/ipms/kubernetes/`) provides the pattern.

```text
Namespace: databox-platform
├── Deployment: css-databox        (Community Solid Server + Databox extension)
├── Deployment: ckan               (CKAN + Postgres + Solr)
├── Deployment: ckan-bridge        (this bridge microservice)
├── NetworkPolicy: bridge-only-ckan-writes
├── NetworkPolicy: bridge-only-pod-reads
├── Secret: ckan-api-token
├── Secret: bridge-dpop-key
└── Ingress: public-css-ingress (CSS only; CKAN ingress is separate or internal)
```

### 10.2 Scaling

- `ckan-bridge` replicas scale based on webhook queue depth and active Pod-pull jobs.
- `css-databox` replicas scale based on Solid HTTP traffic (requires shared backend for HA — see `databox/deployment/ipms/README.md`).
- `ckan` replicas scale based on portal traffic.

### 10.3 Secrets

- `ckan-api-token`: CKAN API token for the bridge service user.
- `bridge-dpop-key`: DPoP private key for Solid-OIDC Pod access.
- `bridge-shacl-shapes`: mounted read-only from a ConfigMap; the SHACL shapes to validate against.

---

## 11. Event handling and synchronisation

### 11.1 Pod → CKAN (publication)

1. A record is deposited into a Databox (org → consumer, ADR-0017).
2. The bridge's webhook listener (or polling cursor, per DBX-21 durable feed) detects the new record.
3. The bridge authenticates via Solid-OIDC and reads the RDF from the Pod.
4. SHACL validation runs. If it fails, the transaction is blocked and logged.
5. Anonymisation/filtering runs per the program profile.
6. The bridge calls `package_create` or `package_update` + `datastore_upsert` on CKAN.
7. CKAN's application layer writes to Postgres, updates revision history, and triggers Solr indexing.
8. The bridge records the publication event in the Databox disclosure ledger (ADR-0023 disclosure-view).

### 11.2 CKAN → Pod (metadata feedback)

If a CKAN editor updates dataset metadata (e.g. adds a tag, corrects a description), the plugin emits a `dataset_updated` webhook. The bridge:

1. Fetches the updated metadata via `package_show`.
2. Determines whether the change affects a Databox-linked field.
3. If so, writes a **metadata annotation** back to the Pod's disclosure-view (append-only, ADR-0011). The bridge does NOT modify the original record.

### 11.3 Correction propagation (ADR-0023)

When a consumer submits a correction request via the Databox submission gateway:

1. The request is staged for review (ADR-0017).
2. A reviewer issues a disposition (`corrected`, `statement-associated`, etc.).
3. If the corrected record was previously published to CKAN, the bridge updates or supersedes the CKAN dataset via `package_update` + `datastore_upsert`.
4. The bridge creates a per-recipient notification duty (`dbx:notifyPriorRecipient`) for any downstream CKAN consumer that fetched the data, with distinct queued/attempted/accepted/failed states.

---

## 12. Relationship to existing Databox ADRs

| ADR | Relationship |
|---|---|
| ADR-0016 | The bridge is a specialised instance of the integration plane. It owns the protected mapping between Pod resources and CKAN datasets. The raw customerID never enters CKAN. |
| ADR-0017 | Publication is a one-way org→CKAN flow. The bridge does not enable CKAN to crawl Pods. Consumer submissions flow through the existing Databox submission gateway, not through CKAN. |
| ADR-0011 | All publication events are append-only evidence. The bridge logs every transfer in the Databox disclosure ledger with a signed receipt. |
| ADR-0018 | Supersession links in Pods map to CKAN dataset versions. |
| ADR-0023 | Correction dispositions propagate to CKAN. Record awareness index is the source of truth for what may be published. |
| ADR-0015 | No compliance claim is made until the legal-compliance gate clears. The bridge implements the mechanism; compliance assertion is gated. |
| ADR-0009 | Ephemeral, scoped, DPoP-bound tokens for Pod access. No long-lived credentials. |
| ADR-0005 | Gov ID systems are external IdPs; the broker maps verified auth to pairwise WebIDs. Per-program IdP trust, not a universal allowlist. |
| ADR-0004 | Gov ID auth produces a program-specific pairwise WebID, not a global citizen identifier. |
| ADR-0008 | Gov ID assurance alone never selects the customer record; a separate linking ceremony resolves exactly one relationship. |
| ADR-0010 | Gov ID assurance is normalized into multi-dimensional dimensions (proofing, authenticator, freshness, federation) per a signed per-program crosswalk. |

---

## 13. Implementation language

The bridge MAY be implemented in:

- **Rust** (preferred for a secure, highly concurrent systems-language implementation; aligns with the existing `native/` and `rust/` components in this repo).
- **TypeScript/Node.js** (if reusing the existing `src/databox/bridge/` infrastructure is prioritised over systems-language performance).

Either way, the bridge is a standalone container that does not run inside the CSS or CKAN process. The thin Python CKAN plugin is the only Python component.

---

## 14. Failure behavior

Fail closed, consistent with Databox invariants:

- A SHACL validation failure → the transaction is blocked; no data reaches CKAN; the failure is logged in the Databox evidence ledger.
- A CKAN API call that returns `"success": false` → the bridge retries with exponential backoff (bounded); if it exhausts retries, the publication job is quarantined for review, never silently dropped.
- A Pod read that returns 403/404 → the bridge records the failure and does not publish stale or partial data.
- A webhook delivery failure → the plugin retries; the bridge also runs a periodic reconciliation sweep via `package_show` to detect drift.
- An attempt to publish personal information that the program profile marks as non-publishable → blocked at the anonymisation stage; logged as evidence.
- A CKAN API token expiry → the bridge fails closed and alerts the control plane; it does not fall back to unauthenticated access.
- A DPoP key compromise → the key is rotated via the control plane; the old key is revoked; the bridge does not cache tokens across key rotations.

---

## 15. Open sub-questions / residual gates

- **CKAN API version pinning:** the bridge must pin to a specific CKAN version (2.10.x / 2.11.x / Next Gen). The pinned version and its Action API surface must be recorded in an ADR before implementation begins.
- **OpenAPI client generation:** whether to use `mjanez/ckan-openapi` or hand-map the Action API into the bridge's typed structs. Decision deferred to the implementation prompt.
- **Bridge implementation language (Rust vs TypeScript):** a profile choice. Rust aligns with `native/` and `rust/`; TypeScript reuses `src/databox/bridge/`. Decide based on whether the bridge needs to share types with the existing Databox bridge or run as an isolated systems component.
- **CKAN organization mapping:** how Databox programs map to CKAN organizations (1:1, many:1, or 1:many). A profile choice per deployment.
- **Compliance gate (ADR-0015):** the CDR/APP compliance profile remains a candidate. The bridge implements the mechanism; asserting compliance requires the legal-compliance gate to clear.
- **Webhook authentication:** the plugin-to-bridge webhook needs mutual authentication (HMAC signature or mTLS). Specification deferred to the implementation prompt.
- **CKAN Next Gen compatibility:** CKAN v3 / Next Gen may change the API surface. The bridge should abstract the Action API behind an interface so a future CKAN version swap is a provider change, not a rewrite.
- **Government ID API identification (BLOCKED):** the specific API surface for the relevant government digital identity system (e.g. myID's machine-to-machine integration, OIDC/SAML federation metadata, or a dedicated gov ID API) has not been located at specification time. This is a **provider-side dependency**: the government agency or contracted platform operator hosting the CKAN + Databox instances must identify and supply the gov ID API documentation, endpoints, and claim contract. Until this is supplied, the broker's per-program profile cannot be finalised for a government deployment. The architecture is designed so that whichever API is identified plugs into the broker as a trusted external IdP — no bridge rewrite is needed. **Unblocking input:** the gov ID API documentation + the program's declared issuer/claim contract. **Owning prompt:** the program profile configuration prompt (per ADR-0005 / ADR-0010).
- **Staff OIDC federation for LDAP/AD environments:** if the government agency uses LDAP/AD for staff login, an OIDC/SAML federation bridge (e.g. Keycloak, Entra ID) must be deployed to front LDAP as an OIDC IdP. The specific federation product and its integration with the Databox broker is a deployment profile choice. The bridge never speaks LDAP directly for authentication.
- **WebID issuance for gov ID subjects:** the broker's mapping from a verified gov ID subject to a Solid-compatible pairwise WebID (ADR-0004) must be tested with the actual gov ID claim contract once identified. The pairwise WebID derivation, the holder-key binding ceremony (ADR-0008), and the assurance crosswalk (ADR-0010) all depend on the gov ID system's actual claim shape.
