/**
 * Barrel export for the CKAN Bridge.
 *
 * The CKAN bridge is an **opt-in deployment profile** — it does not change the default CSS install
 * path and is not required for non-CKAN Databox deployments.
 */

// Pure value types — the contracts that cannot drift between components.
export * from './types.js';

// Interface stubs — the contracts each CKAN-NN prompt implements.
export * from './interfaces.js';
