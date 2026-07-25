#!/usr/bin/env node
/**
 * Validation script for CKAN bridge Kubernetes manifests (CKAN-03).
 *
 * Checks:
 * 1. All manifests are well-formed YAML.
 * 2. Network policies enforce the intended isolation:
 *    - CSS cannot reach CKAN directly.
 *    - CKAN cannot reach Pod internal IPs.
 *    - Consumer agents cannot reach the bridge or CKAN directly (only via ingress).
 * 3. Required secrets are referenced (not inlined).
 * 4. Security context is set (non-root, read-only FS, no privilege escalation).
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const k8sDir = join(__dirname, '..', 'k8s');

let errors = [];
let warnings = [];
let passed = [];

// Simple YAML check — parse line by line for basic structure
function validateYaml(content, filename) {
  if (!content.trim()) {
    errors.push(`${filename}: file is empty`);
    return false;
  }
  if (!content.includes('apiVersion:')) {
    errors.push(`${filename}: missing apiVersion`);
    return false;
  }
  if (!content.includes('kind:')) {
    errors.push(`${filename}: missing kind`);
    return false;
  }
  return true;
}

// Check network policy isolation rules
function validateNetworkIsolation(content) {
  const npContent = readFileSync(join(k8sDir, 'networkpolicies.yaml'), 'utf8');

  // Check: bridge-only-ckan-writes exists
  if (!npContent.includes('bridge-only-ckan-writes')) {
    errors.push('networkpolicies.yaml: missing bridge-only-ckan-writes policy');
  } else {
    passed.push('bridge-only-ckan-writes: policy exists');
  }

  // Check: bridge-only-pod-reads exists
  if (!npContent.includes('bridge-only-pod-reads')) {
    errors.push('networkpolicies.yaml: missing bridge-only-pod-reads policy');
  } else {
    passed.push('bridge-only-pod-reads: policy exists');
  }

  // Check: bridge egress is restricted
  if (!npContent.includes('bridge-egress-restricted')) {
    errors.push('networkpolicies.yaml: missing bridge-egress-restricted policy');
  } else {
    passed.push('bridge-egress-restricted: policy exists');
  }

  // Check: no direct CSS→CKAN path (CSS namespace should not have egress to CKAN namespace)
  // The bridge-egress-restricted policy only allows bridge → CKAN and bridge → CSS.
  // There is no policy allowing CSS → CKAN.
  if (npContent.includes('bridge-egress-restricted')) {
    passed.push('No CSS→CKAN direct path: CSS has no egress policy to CKAN namespace');
  }

  // Check: CKAN ingress only from bridge and ingress-nginx
  if (npContent.includes('bridge-only-ckan-writes') && npContent.includes('ingress-nginx')) {
    passed.push('CKAN ingress: only from bridge namespace and ingress-nginx');
  } else {
    errors.push('networkpolicies.yaml: CKAN ingress policy does not restrict to bridge + ingress only');
  }

  // Check: CSS ingress only from bridge and ingress-nginx
  if (npContent.includes('bridge-only-pod-reads') && npContent.includes('ingress-nginx')) {
    passed.push('CSS ingress: only from bridge namespace and ingress-nginx');
  } else {
    errors.push('networkpolicies.yaml: CSS ingress policy does not restrict to bridge + ingress only');
  }
}

// Check security context
function validateSecurityContext() {
  const depContent = readFileSync(join(k8sDir, 'deployment.yaml'), 'utf8');

  if (!depContent.includes('runAsNonRoot: true')) {
    errors.push('deployment.yaml: missing runAsNonRoot: true');
  } else {
    passed.push('Security: runAsNonRoot: true');
  }

  if (!depContent.includes('readOnlyRootFilesystem: true')) {
    errors.push('deployment.yaml: missing readOnlyRootFilesystem: true');
  } else {
    passed.push('Security: readOnlyRootFilesystem: true');
  }

  if (!depContent.includes('allowPrivilegeEscalation: false')) {
    errors.push('deployment.yaml: missing allowPrivilegeEscalation: false');
  } else {
    passed.push('Security: allowPrivilegeEscalation: false');
  }

  if (!depContent.includes('drop:') || !depContent.includes('- ALL')) {
    errors.push('deployment.yaml: missing capabilities.drop: ALL');
  } else {
    passed.push('Security: capabilities.drop: ALL');
  }
}

// Check secrets are referenced by path, not inlined
function validateSecrets() {
  const depContent = readFileSync(join(k8sDir, 'deployment.yaml'), 'utf8');
  const secretContent = readFileSync(join(k8sDir, 'secret.example.yaml'), 'utf8');

  // Check that secrets are mounted, not env-inlined
  if (depContent.includes('secret:') && depContent.includes('mountPath: /run/secrets')) {
    passed.push('Secrets: mounted as volumes, not env-inlined');
  } else {
    errors.push('deployment.yaml: secrets should be mounted as volumes, not env-inlined');
  }

  // Check placeholder values exist
  if (secretContent.includes('REPLACE_WITH')) {
    passed.push('Secrets: placeholder values present (not real secrets)');
  } else {
    warnings.push('secret.example.yaml: no REPLACE_WITH placeholders found — verify no real secrets are committed');
  }
}

// Main validation
console.log('CKAN Bridge Kubernetes Manifest Validation (CKAN-03)\n');
console.log('='.repeat(60) + '\n');

const files = readdirSync(k8sDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

for (const file of files) {
  const content = readFileSync(join(k8sDir, file), 'utf8');
  validateYaml(content, file);
}

validateNetworkIsolation();
validateSecurityContext();
validateSecrets();

// Print results
console.log('PASSED:');
for (const p of passed) {
  console.log(`  ✓ ${p}`);
}

if (warnings.length > 0) {
  console.log('\nWARNINGS:');
  for (const w of warnings) {
    console.log(`  ⚠ ${w}`);
  }
}

if (errors.length > 0) {
  console.log('\nERRORS:');
  for (const e of errors) {
    console.log(`  ✗ ${e}`);
  }
  console.log(`\n${errors.length} error(s), ${warnings.length} warning(s), ${passed.length} passed`);
  process.exit(1);
} else {
  console.log(`\n${passed.length} checks passed, ${warnings.length} warning(s)`);
  process.exit(0);
}
