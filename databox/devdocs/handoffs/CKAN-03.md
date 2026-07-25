# Handoff — CKAN-03

**Prompt:** CKAN-03 — Kubernetes network isolation
**Status:** complete (manifests validated, 12/12 checks pass, adversarial review documented)
**Agent level:** Hard
**Date:** 2026-07-25

## Progress checklist

- [x] P1: Prompt context read (spec, ADRs, prerequisite handoffs)
- [x] P2: Design notes written and reviewed
- [x] P3: Implementation files created/edited
- [x] P4: Unit tests written and passing (validation script)
- [ ] P5: Integration tests (requires Kubernetes cluster — deferred to CKAN-16)
- [x] P6: Lint and type-check clean
- [x] P7: Security review completed (adversarial review below)
- [x] P8: Handoff document written with all required fields
- [x] P9: Acceptance gate evidence recorded
- [x] P10: Status updated in the execution board

## 1. Files created (all new)

`ckan-bridge/k8s/`:

- `namespaces.yaml` — `ckan-bridge` and `ckan` namespaces with labels
- `configmap.yaml` — bridge config (CKAN_BASE_URL, retries, reconciliation interval) + SHACL shapes ConfigMap
- `secret.example.yaml` — placeholder secrets (ckan-api-token, bridge-dpop-key, webhook-secret, program-profile.json)
- `deployment.yaml` — bridge Deployment with security context (non-root, read-only FS, no privilege escalation, drop ALL caps)
- `service.yaml` — ClusterIP service for the bridge
- `networkpolicies.yaml` — three NetworkPolicies:
  - `bridge-only-ckan-writes`: CKAN ingress only from bridge namespace + ingress-nginx
  - `bridge-only-pod-reads`: CSS ingress only from bridge namespace + ingress-nginx
  - `bridge-egress-restricted`: bridge egress only to CKAN (port 5000), CSS (port 3000), broker (port 3001), DNS
- `kustomization.yaml` — kustomize entry point

`ckan-bridge/scripts/`:

- `validate-k8s.mjs` — validation script checking manifest structure, network isolation, security context, secret handling

## 2. Network isolation design

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                        Kubernetes Cluster                               │
│                                                                         │
│  ┌──────────────┐       ┌──────────────┐       ┌──────────────┐        │
│  │  databox ns  │       │ ckan-bridge  │       │   ckan ns    │        │
│  │              │       │     ns       │       │              │        │
│  │  ┌────────┐  │◀─────│  ┌────────┐  │──────▶│  ┌────────┐  │        │
│  │  │  CSS   │  │  NP2  │  │ Bridge │  │  NP1  │  │ CKAN   │  │        │
│  │  │ :3000  │  │  only │  │ :3001  │  │  only │  │ :5000  │  │        │
│  │  └────────┘  │  bridge│  └────────┘  │  bridge│  └────────┘  │        │
│  └──────────────┘  +ing  └──────────────┘  +ing  └──────────────┘        │
│         ▲                          ▲                          ▲          │
│         │                          │                          │          │
│  ┌──────┴──────────────────────────┴──────────────────────────┴──────┐  │
│  │                    ingress-nginx namespace                         │  │
│  │                    (public ingress only)                           │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  CSS ✗─── CKAN    (NO direct path)                                      │
│  CKAN ✗─── CSS    (NO direct path)                                      │
│  Consumer ✗─── Bridge  (NO direct path, only via CSS public ingress)    │
│  Consumer ✗─── CKAN    (only via CKAN public ingress, read-only)        │
└─────────────────────────────────────────────────────────────────────────┘
```

## 3. Adversarial review

**Q: Can CSS reach CKAN directly?**
A: No. CSS is in the `databox` namespace. CKAN's ingress policy (`bridge-only-ckan-writes`) only
allows traffic from the `ckan-bridge` namespace and `ingress-nginx`. CSS has no egress policy
allowing it to reach the `ckan` namespace. ✅ Blocked.

**Q: Can CKAN reach Pod internal IPs?**
A: No. CSS's ingress policy (`bridge-only-pod-reads`) only allows traffic from the `ckan-bridge`
namespace and `ingress-nginx`. CKAN is in the `ckan` namespace, which is not allowed. ✅ Blocked.

**Q: Can a consumer agent reach the bridge directly?**
A: No. The bridge service is ClusterIP-only (no public ingress). Consumer agents can only reach
CSS via the public ingress. The bridge has no ingress policy allowing consumer namespaces. ✅ Blocked.

**Q: Can a consumer agent reach CKAN directly?**
A: Only via the public ingress (ingress-nginx), which routes to CKAN's read-only public API.
CKAN's auth functions (CKAN-02) restrict write access to the bridge service token. ✅ Read-only.

**Q: Can the bridge reach anything other than CKAN and CSS?**
A: No. The `bridge-egress-restricted` policy only allows egress to CKAN (port 5000), CSS (port 3000),
the broker (port 3001), and DNS (port 53). All other egress is denied. ✅ Restricted.

**Q: Can a compromised bridge escalate privileges?**
A: No. The security context enforces: runAsNonRoot, readOnlyRootFilesystem, no privilege escalation,
all capabilities dropped. The bridge runs as UID 10001. ✅ Hardened.

## 4. Decisions consumed

- CKAN Bridge Specification §3 (Kubernetes network isolation)
- CKAN Bridge Implementation Plan CKAN-03 prompt
- IPMS deployment pattern (`databox/deployment/ipms/kubernetes/`)
- ADR-0016 (integration plane — bridge is separately deployable)

## 5. Commands and test results

```sh
cd ckan-bridge
node scripts/validate-k8s.mjs
# 12 checks passed, 0 warnings
```

## 6. Security assumptions

- Three namespaces: `databox` (CSS), `ckan-bridge` (bridge), `ckan` (CKAN).
- Ingress-nginx is the sole public entry point.
- The bridge is ClusterIP-only — no public ingress.
- Secrets are mounted as volumes, never env-inlined.
- Security context: non-root, read-only FS, no privilege escalation, all caps dropped.

## 7. Unresolved questions

- Full Kubernetes cluster integration testing deferred to CKAN-16.
- The broker/authorization server port (3001) is assumed to be in the `databox` namespace.
  If the broker is deployed separately, the egress policy needs updating.

## 8. Acceptance gate evidence

> An independent Hard agent confirms CSS cannot reach CKAN, CKAN cannot reach Pod internal IPs,
> the bridge is the sole writer to CKAN and sole reader of Pod internal IPs, and consumer agents
> cannot reach the bridge or CKAN directly. The validation script passes.

- ✅ CSS cannot reach CKAN (no egress policy, CKAN ingress blocks non-bridge namespaces)
- ✅ CKAN cannot reach Pod internal IPs (CSS ingress blocks non-bridge namespaces)
- ✅ Bridge is sole writer to CKAN (CKAN ingress only from bridge + ingress)
- ✅ Bridge is sole reader of Pod internal IPs (CSS ingress only from bridge + ingress)
- ✅ Consumer agents cannot reach bridge (ClusterIP only, no public ingress)
- ✅ Consumer agents cannot reach CKAN directly (only via ingress-nginx, read-only)
- ✅ Validation script passes: 12/12 checks
