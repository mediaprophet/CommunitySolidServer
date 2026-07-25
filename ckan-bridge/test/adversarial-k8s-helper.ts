/**
 * Helper for adversarial K8s manifest validation (CKAN-14).
 * Reuses the validation logic from scripts/validate-k8s.mjs but in a test-friendly format.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const k8sDir = join(__dirname, '..', 'k8s');

export interface ValidationResult {
  errors: string[];
  warnings: string[];
  passed: string[];
}

export function validateK8sManifests(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const passed: string[] = [];

  if (!existsSync(k8sDir)) {
    errors.push('k8s directory not found');
    return { errors, warnings, passed };
  }

  const files = readdirSync(k8sDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

  for (const file of files) {
    const content = readFileSync(join(k8sDir, file), 'utf8');
    if (!content.trim()) {
      errors.push(`${file}: file is empty`);
      continue;
    }
    if (!content.includes('apiVersion:')) {
      errors.push(`${file}: missing apiVersion`);
    }
    if (!content.includes('kind:')) {
      errors.push(`${file}: missing kind`);
    }
  }

  const npContent = readFileSync(join(k8sDir, 'networkpolicies.yaml'), 'utf8');

  if (npContent.includes('bridge-only-ckan-writes')) {
    passed.push('bridge-only-ckan-writes: policy exists');
  } else {
    errors.push('missing bridge-only-ckan-writes');
  }

  if (npContent.includes('bridge-only-pod-reads')) {
    passed.push('bridge-only-pod-reads: policy exists');
  } else {
    errors.push('missing bridge-only-pod-reads');
  }

  if (npContent.includes('bridge-egress-restricted')) {
    passed.push('bridge-egress-restricted: policy exists');
  } else {
    errors.push('missing bridge-egress-restricted');
  }

  if (npContent.includes('ingress-nginx')) {
    passed.push('Ingress restricted to ingress-nginx');
  } else {
    errors.push('ingress-nginx restriction missing');
  }

  const depContent = readFileSync(join(k8sDir, 'deployment.yaml'), 'utf8');

  if (depContent.includes('runAsNonRoot: true')) passed.push('runAsNonRoot: true');
  else errors.push('missing runAsNonRoot');

  if (depContent.includes('readOnlyRootFilesystem: true')) passed.push('readOnlyRootFilesystem: true');
  else errors.push('missing readOnlyRootFilesystem');

  if (depContent.includes('allowPrivilegeEscalation: false')) passed.push('allowPrivilegeEscalation: false');
  else errors.push('missing allowPrivilegeEscalation: false');

  if (depContent.includes('drop:') && depContent.includes('- ALL')) passed.push('capabilities.drop: ALL');
  else errors.push('missing capabilities.drop: ALL');

  if (depContent.includes('mountPath: /run/secrets')) passed.push('Secrets mounted as volumes');
  else errors.push('secrets not mounted as volumes');

  const secretContent = readFileSync(join(k8sDir, 'secret.example.yaml'), 'utf8');
  if (secretContent.includes('REPLACE_WITH')) passed.push('Placeholder secrets present');
  else warnings.push('No REPLACE_WITH placeholders found');

  return { errors, warnings, passed };
}
