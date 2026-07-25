# CKAN Bridge

> **This is an opt-in deployment profile.** It does not change the default Community Solid Server
> install path and is not required for non-CKAN Databox deployments. A provider opts in by deploying
> this bridge microservice alongside a CKAN instance and the thin Python plugin.

## What this is

A decoupled microservice that sits between the Solid Databox (Community Solid Server) and a CKAN
data portal. It enables government agencies and other CKAN users to publish data from Solid Pods to
CKAN while preserving the agency of the natural person over their personal information.

See the [CKAN Bridge Specification](../databox/devdocs/dbx-06-ckan-bridge-specification.md) and the
[Implementation Plan](../databox/devdocs/ckan-bridge-implementation-plan.md) for full details.

## Architecture

```text
┌──────────────────────┐      ┌──────────────────────┐      ┌──────────────────────┐
│  Solid Pod Layer     │      │  CKAN Bridge         │      │  CKAN Registry Layer │
│  (CSS + Databox)     │      │  (this service)      │      │  (Python + Postgres  │
│                      │      │                      │      │   + Solr)            │
│  - RDF Linked Data   │◀────▶│  - Solid-OIDC auth   │◀────▶│  - Action API        │
│  - ACP/WAC access    │      │  - SHACL validation  │      │  - DataStore API     │
│  - Append-only       │      │  - RDF→tabular xlate │      │  - Dataset catalogue │
│  - Signed receipts   │      │  - Webhook handling  │      │  - Search index      │
│  - ODRL policies     │      │  - Anonymisation     │      │  - Org structure     │
└──────────────────────┘      └──────────────────────┘      └──────────────────────┘
```

## Implementation language

TypeScript / Node.js — chosen to maximise reuse of existing Databox bridge patterns
(`src/databox/bridge/`) and the repository's existing test infrastructure.

## Build

```sh
cd ckan-bridge
npm install
npm run build
```

## Test

```sh
npm test
npm run test:coverage
```

## Configuration

The bridge reads configuration from environment variables and Kubernetes Secret/ConfigMap mounts:

| Config | Source | Description |
|---|---|---|
| `CKAN_BASE_URL` | env | CKAN base URL |
| `CKAN_API_TOKEN_FILE` | Secret mount | Filesystem path to CKAN API token |
| `BRIDGE_DPOP_KEY_FILE` | Secret mount | Filesystem path to DPoP private key |
| `BRIDGE_SHACL_SHAPES_FILE` | ConfigMap mount | Filesystem path to SHACL shapes |
| `BRIDGE_PROGRAM_PROFILE_FILE` | ConfigMap mount | Filesystem path to program profile |
| `BRIDGE_WEBHOOK_SECRET_FILE` | Secret mount | Filesystem path to webhook HMAC secret |
| `BRIDGE_MAX_RETRIES` | env | Max retry attempts (default: 5) |
| `BRIDGE_RECONCILIATION_INTERVAL` | env | Reconciliation sweep interval in seconds (default: 300) |

## Status

**CKAN-01: scaffold and shared types — complete.**

Implementation progress is tracked in the
[Implementation Plan](../databox/devdocs/ckan-bridge-implementation-plan.md) master status table.
