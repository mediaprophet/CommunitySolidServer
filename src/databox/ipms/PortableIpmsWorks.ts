/* eslint-disable max-len */
import type { Quad, Term } from '@rdfjs/types';
import { DataFactory, Parser, Writer } from 'n3';
import { BasicRepresentation } from '../../http/representation/BasicRepresentation';
import type { ResourceStore } from '../../storage/ResourceStore';
import { ensureTrailingSlash } from '../../util/PathUtil';
import { readableToString } from '../../util/StreamUtil';
import { DC, IPMS, RDF } from '../../util/Vocabularies';
import type { DataboxModuleRegistry } from './DataboxModuleRegistry';
import type { ModuleConfigStore } from './ModuleConfigStore';
import { setModuleEnabledFlag } from './ModuleConfigStore';
import { parseModuleManifestRdf, serializeModuleManifestToTurtle } from './ModuleManifestRdf';
import type { SolidModuleManifest } from './SolidModuleManifest';
import type {
  PortableConnectorJob,
  PortableConnectorManifest,
} from './modules/integration/ConnectorContract';
import {
  parseConnectorJobRdf,
  parseConnectorManifestRdf,
  serializeConnectorJobToTurtle,
  serializeConnectorManifestToTurtle,
  validatePortableConnectorJob,
  validatePortableConnectorManifest,
} from './modules/integration/ConnectorContract';
import type { VerticalProfileManifest } from './VerticalProfile';
import {
  parseVerticalProfileRdf,
  serializeVerticalProfileToTurtle,
  validateVerticalProfileBundle,
} from './VerticalProfile';

const TURTLE = 'text/turtle';
const SOLID = 'http://www.w3.org/ns/solid/terms#';
const TYPE_INDEX = DataFactory.namedNode(`${SOLID}TypeIndex`);
const LISTED_DOCUMENT = DataFactory.namedNode(`${SOLID}ListedDocument`);
const TYPE_REGISTRATION = DataFactory.namedNode(`${SOLID}TypeRegistration`);
const FOR_CLASS = DataFactory.namedNode(`${SOLID}forClass`);
const INSTANCE = DataFactory.namedNode(`${SOLID}instance`);
const REFERENCES = DataFactory.namedNode(`${DC.namespace}references`);

export interface PortableIpmsModuleState {
  readonly manifest: SolidModuleManifest;
  readonly enabled: boolean;
  readonly state?: {
    readonly contentType: 'text/turtle';
    readonly turtle: string;
  };
}

export interface PortableIpmsWorksBundle {
  readonly '@context': Record<string, string>;
  readonly type: 'DataboxIpmsWorks';
  readonly generatedAt: string;
  readonly portability: {
    readonly canonicalStore: 'Solid LDP/RDF resources';
    readonly cssEnhanced: 'IPMS control plane is an optional interpreter, not the canonical store';
    readonly backendTargets: readonly string[];
    readonly nonPortableRuntimeWork: readonly string[];
  };
  readonly modules: readonly PortableIpmsModuleState[];
  readonly verticalProfiles: readonly VerticalProfileManifest[];
  readonly connectorManifests: readonly PortableConnectorManifest[];
  readonly connectorJobs: readonly PortableConnectorJob[];
}

export interface StandardSolidIpmsWorksOptions {
  /** Root Solid storage URL where the IPMS works resources are published. */
  readonly baseUrl: string;
  /** Type Index resource that points standard Solid clients at module manifest resources. */
  readonly typeIndexPath?: string;
  /** Container used for serialized module manifest Turtle resources. */
  readonly manifestContainerPath?: string;
  /** Container used for serialized vertical profile bundle Turtle resources. */
  readonly verticalProfileContainerPath?: string;
  /** Container used for serialized enterprise connector manifest Turtle resources. */
  readonly connectorManifestContainerPath?: string;
  /** Container used for serialized connector job Turtle resources. */
  readonly connectorJobContainerPath?: string;
  /** Container used for ordinary RDF module state resources. */
  readonly moduleStateContainerPath?: string;
  /** Timestamp to use for the reconstructed works bundle during discovery. */
  readonly generatedAt?: string;
}

export interface StandardSolidIpmsWorksResource {
  readonly kind: 'type-index' | 'module-manifest' | 'module-state' | 'vertical-profile' |
    'connector-manifest' | 'connector-job';
  readonly moduleId?: string;
  readonly verticalProfileId?: string;
  readonly connectorId?: string;
  readonly connectorJobId?: string;
  readonly path: string;
  readonly contentType: 'text/turtle';
  readonly turtle: string;
}

export interface StandardSolidIpmsWorksResources {
  readonly typeIndex: StandardSolidIpmsWorksResource;
  readonly manifests: readonly StandardSolidIpmsWorksResource[];
  readonly verticalProfiles: readonly StandardSolidIpmsWorksResource[];
  readonly connectorManifests: readonly StandardSolidIpmsWorksResource[];
  readonly connectorJobs: readonly StandardSolidIpmsWorksResource[];
  readonly states: readonly StandardSolidIpmsWorksResource[];
}

/**
 * Exports the declarative IPMS "works": installed module manifests plus pod-backed RDF state.
 *
 * This deliberately excludes runtime-only process details such as bearer control tokens, OIDC client
 * registrations, notification subscriptions, and external service secrets. Those are re-established by
 * the target runtime; the portable unit is the Solid/RDF operating definition.
 */
export async function exportPortableIpmsWorks(
  registry: DataboxModuleRegistry,
  configStore?: ModuleConfigStore,
  generatedAt = new Date().toISOString(),
  verticalProfiles: readonly VerticalProfileManifest[] = [],
  connectorManifests: readonly PortableConnectorManifest[] = [],
  connectorJobs: readonly PortableConnectorJob[] = [],
): Promise<PortableIpmsWorksBundle> {
  const modules = await Promise.all(registry.list().map(async(manifest): Promise<PortableIpmsModuleState> => {
    const turtle = await configStore?.load(manifest.id);
    return {
      manifest,
      enabled: turtle === undefined ? registry.isEnabled(manifest.id) : await configStore!.isEnabled(manifest.id),
      ...turtle === undefined ?
          {} :
          {
            state: {
              contentType: 'text/turtle' as const,
              turtle,
            },
          },
    };
  }));

  const connectors = validateConnectorWorks(connectorManifests, connectorJobs);
  return {
    '@context': {
      ipms: 'urn:solid-server:databox:ipms#',
      schema: 'https://schema.org/',
      ldp: 'http://www.w3.org/ns/ldp#',
    },
    type: 'DataboxIpmsWorks',
    generatedAt,
    portability: {
      canonicalStore: 'Solid LDP/RDF resources',
      cssEnhanced: 'IPMS control plane is an optional interpreter, not the canonical store',
      backendTargets: [
        'vanilla Solid server',
        'Community Solid Server file backend',
        'Community Solid Server SPARQL backend',
        'Oxigraph SPARQL 1.1 backend',
        'OpenLink Virtuoso',
        'QualiaDB-compatible Solid backend',
      ],
      nonPortableRuntimeWork: [
        'OIDC client registrations',
        'live notification subscriptions',
        'control-plane bearer tokens',
        'external service secrets',
        'connector sidecar runtime descriptors and secret references',
        'runtime-specific interpreters and adapters',
      ],
    },
    modules,
    verticalProfiles: verticalProfiles.map((profile): VerticalProfileManifest => {
      const validation = validateVerticalProfileBundle(profile, registry);
      if (validation.missingModules.length > 0) {
        throw new Error(`Cannot export vertical profile ${profile.id}; missing modules: ${
          validation.missingModules.join(', ')
        }.`);
      }
      return validation.profile;
    }),
    connectorManifests: connectors.manifests,
    connectorJobs: connectors.jobs,
  };
}

/**
 * Imports a portable IPMS works bundle into a registry and optional Solid/RDF config store.
 *
 * Existing manifests are accepted only when they match exactly. This keeps the import path from silently
 * replacing executable module contracts while still allowing a target runtime to have built-ins preloaded.
 */
export async function importPortableIpmsWorks(
  bundle: unknown,
  registry: DataboxModuleRegistry,
  configStore?: ModuleConfigStore,
): Promise<PortableIpmsWorksBundle> {
  const parsed = parsePortableIpmsWorks(bundle);
  for (const module of parsed.modules) {
    const existing = registry.get(module.manifest.id);
    if (existing) {
      if (!sameManifest(existing, module.manifest)) {
        throw new Error(`Cannot import module ${module.manifest.id}; a different manifest is already registered.`);
      }
    } else {
      registry.register(module.manifest);
    }

    registry.setEnabled(module.manifest.id, module.enabled);
    if (configStore) {
      if (module.state) {
        await configStore.save(module.manifest.id, module.state.turtle);
      }
      await configStore.setEnabled(module.manifest.id, module.enabled);
    } else if (module.state) {
      throw new Error(`Cannot import RDF state for module ${module.manifest.id} without a ModuleConfigStore.`);
    }
  }
  for (const profile of parsed.verticalProfiles) {
    const validation = validateVerticalProfileBundle(profile, registry);
    if (validation.missingModules.length > 0) {
      throw new Error(`Cannot import vertical profile ${profile.id}; missing modules: ${
        validation.missingModules.join(', ')
      }.`);
    }
  }
  validateConnectorWorks(parsed.connectorManifests, parsed.connectorJobs);
  return exportPortableIpmsWorks(
    registry,
    configStore,
    new Date().toISOString(),
    parsed.verticalProfiles,
    parsed.connectorManifests,
    parsed.connectorJobs,
  );
}

/**
 * Project a portable works bundle into ordinary Solid/RDF resources for fallback runtimes.
 *
 * The manifest resources are discoverable through a Solid Type Index using `solid:TypeRegistration` entries
 * for `ipms:Module`, and module state is stored as Turtle at the same deterministic paths used by
 * `ModuleConfigStore`. No CSS control-plane endpoint or SPARQL server is required to read these resources.
 */
export async function createStandardSolidIpmsWorksResources(
  bundle: unknown,
  options: StandardSolidIpmsWorksOptions,
): Promise<StandardSolidIpmsWorksResources> {
  const parsed = parsePortableIpmsWorks(bundle);
  const paths = standardSolidPaths(options);
  const manifests = await Promise.all(parsed.modules.map(async(module): Promise<StandardSolidIpmsWorksResource> => {
    const path = moduleManifestPath(paths.manifestContainerPath, module.manifest.id);
    return {
      kind: 'module-manifest',
      moduleId: module.manifest.id,
      path,
      contentType: TURTLE,
      turtle: await serializeModuleManifestToTurtle(module.manifest, {
        subjectIri: moduleManifestSubject(path),
      }),
    };
  }));
  const verticalProfiles = await Promise.all(parsed.verticalProfiles.map(async(profile):
  Promise<StandardSolidIpmsWorksResource> => {
    const path = verticalProfilePath(paths.verticalProfileContainerPath, profile.id);
    return {
      kind: 'vertical-profile',
      verticalProfileId: profile.id,
      path,
      contentType: TURTLE,
      turtle: await serializeVerticalProfileToTurtle(profile, {
        subjectIri: verticalProfileSubject(path),
      }),
    };
  }));
  const connectorManifests = await Promise.all(parsed.connectorManifests.map(async(connector):
  Promise<StandardSolidIpmsWorksResource> => {
    const path = connectorManifestPath(paths.connectorManifestContainerPath, connector.id);
    return {
      kind: 'connector-manifest',
      connectorId: connector.id,
      path,
      contentType: TURTLE,
      turtle: await serializeConnectorManifestToTurtle(connector, {
        subjectIri: connectorManifestSubject(path),
      }),
    };
  }));
  const connectorJobs = await Promise.all(parsed.connectorJobs.map(async(job):
  Promise<StandardSolidIpmsWorksResource> => {
    const path = connectorJobPath(paths.connectorJobContainerPath, job.id);
    return {
      kind: 'connector-job',
      connectorJobId: job.id,
      connectorId: job.connectorId,
      path,
      contentType: TURTLE,
      turtle: await serializeConnectorJobToTurtle(job, {
        subjectIri: connectorJobSubject(path),
      }),
    };
  }));
  const states = await Promise.all(parsed.modules.map(async(module): Promise<StandardSolidIpmsWorksResource> => {
    const path = moduleStatePath(paths.moduleStateContainerPath, module.manifest.id);
    return {
      kind: 'module-state',
      moduleId: module.manifest.id,
      path,
      contentType: TURTLE,
      turtle: await setModuleEnabledFlag(path, module.state?.turtle ?? '', module.enabled),
    };
  }));

  return {
    typeIndex: {
      kind: 'type-index',
      path: paths.typeIndexPath,
      contentType: TURTLE,
      turtle: await serializeTypeIndex(
        paths.typeIndexPath,
        manifests,
        verticalProfiles,
        connectorManifests,
        connectorJobs,
      ),
    },
    manifests,
    verticalProfiles,
    connectorManifests,
    connectorJobs,
    states,
  };
}

/**
 * Write the standard-Solid projection of a works bundle to a ResourceStore.
 */
export async function publishPortableIpmsWorksToStandardSolidStore(
  bundle: unknown,
  store: ResourceStore,
  options: StandardSolidIpmsWorksOptions,
): Promise<StandardSolidIpmsWorksResources> {
  const resources = await createStandardSolidIpmsWorksResources(bundle, options);
  for (const resource of [
    resources.typeIndex,
    ...resources.manifests,
    ...resources.verticalProfiles,
    ...resources.connectorManifests,
    ...resources.connectorJobs,
    ...resources.states,
  ]) {
    await store.setRepresentation(
      { path: resource.path },
      new BasicRepresentation([ Buffer.from(resource.turtle, 'utf-8') ], resource.contentType),
    );
  }
  return resources;
}

/**
 * Rebuild a registry/config store from standard Solid RDF resources only.
 *
 * This is the vanilla-Solid degradation proof: discovery starts at a Type Index, parses each manifest Turtle
 * resource with ModuleManifestRdf, reads Turtle state resources, and imports the result without calling the
 * CSS-enhanced IPMS control plane.
 */
export async function importPortableIpmsWorksFromStandardSolidStore(
  store: ResourceStore,
  registry: DataboxModuleRegistry,
  configStore: ModuleConfigStore,
  options: StandardSolidIpmsWorksOptions,
): Promise<PortableIpmsWorksBundle> {
  const paths = standardSolidPaths(options);
  const typeIndexTurtle = await loadTurtleResource(store, paths.typeIndexPath);
  const manifestPaths = parseTypeIndexResourcePaths(
    typeIndexTurtle,
    paths.typeIndexPath,
    IPMS.terms.Module,
    'module',
    true,
  );
  const verticalProfilePaths = parseTypeIndexResourcePaths(
    typeIndexTurtle,
    paths.typeIndexPath,
    namedNode(`${IPMS.namespace}VerticalProfile`),
    'vertical profile',
    false,
  );
  const connectorManifestPaths = parseTypeIndexResourcePaths(
    typeIndexTurtle,
    paths.typeIndexPath,
    namedNode(`${IPMS.namespace}ConnectorManifest`),
    'connector manifest',
    false,
  );
  const connectorJobPaths = parseTypeIndexResourcePaths(
    typeIndexTurtle,
    paths.typeIndexPath,
    namedNode(`${IPMS.namespace}ConnectorJob`),
    'connector job',
    false,
  );
  const modules = await Promise.all(manifestPaths.map(async(path): Promise<PortableIpmsModuleState> => {
    const manifest = parseModuleManifestRdf(await loadTurtleResource(store, path), {
      baseIri: path,
      subjectIri: moduleManifestSubject(path),
    });
    const statePath = moduleStatePath(paths.moduleStateContainerPath, manifest.id);
    const stateTurtle = await loadOptionalTurtleResource(store, statePath);
    return {
      manifest,
      enabled: stateTurtle === undefined ? false : moduleStateEnabled(stateTurtle, statePath),
      ...stateTurtle === undefined ?
          {} :
          {
            state: {
              contentType: TURTLE,
              turtle: stateTurtle,
            },
          },
    };
  }));
  const verticalProfiles = await Promise.all(verticalProfilePaths.map(async(path): Promise<VerticalProfileManifest> =>
    parseVerticalProfileRdf(await loadTurtleResource(store, path), {
      baseIri: path,
      subjectIri: verticalProfileSubject(path),
    })));
  const connectorManifests = await Promise.all(connectorManifestPaths.map(async(path):
  Promise<PortableConnectorManifest> =>
    parseConnectorManifestRdf(await loadTurtleResource(store, path), {
      baseIri: path,
      subjectIri: connectorManifestSubject(path),
    })));
  const connectorJobs = await Promise.all(connectorJobPaths.map(async(path): Promise<PortableConnectorJob> =>
    parseConnectorJobRdf(await loadTurtleResource(store, path), {
      baseIri: path,
      subjectIri: connectorJobSubject(path),
    })));

  return importPortableIpmsWorks({
    '@context': {
      ipms: IPMS.namespace,
      solid: SOLID,
      ldp: 'http://www.w3.org/ns/ldp#',
    },
    type: 'DataboxIpmsWorks',
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    portability: portableIpmsWorksPortability(),
    modules,
    verticalProfiles,
    connectorManifests,
    connectorJobs,
  }, registry, configStore);
}

function parsePortableIpmsWorks(bundle: unknown): PortableIpmsWorksBundle {
  const record = requireRecord(bundle, 'IPMS works bundle');
  if (record.type !== 'DataboxIpmsWorks') {
    throw new Error('IPMS works bundle type must be DataboxIpmsWorks.');
  }
  const modules = requireArray(record.modules, 'IPMS works modules')
    .map((module, index): PortableIpmsModuleState => parseModuleState(module, index));
  const verticalProfiles = record.verticalProfiles === undefined ?
      [] :
      requireArray(record.verticalProfiles, 'IPMS works verticalProfiles')
        .map((profile, index): VerticalProfileManifest => parseVerticalProfile(profile, index));
  const connectorManifests = record.connectorManifests === undefined ?
      [] :
      requireArray(record.connectorManifests, 'IPMS works connectorManifests')
        .map((manifest, index): PortableConnectorManifest => parseConnectorManifest(manifest, index));
  const connectorJobs = record.connectorJobs === undefined ?
      [] :
      requireArray(record.connectorJobs, 'IPMS works connectorJobs')
        .map((job, index): PortableConnectorJob => parseConnectorJob(job, index));
  const connectors = validateConnectorWorks(connectorManifests, connectorJobs);
  return {
    '@context': requireRecord(record['@context'], 'IPMS works @context') as Record<string, string>,
    type: 'DataboxIpmsWorks',
    generatedAt: requireString(record.generatedAt, 'IPMS works generatedAt'),
    portability: parsePortability(record.portability),
    modules,
    verticalProfiles,
    connectorManifests: connectors.manifests,
    connectorJobs: connectors.jobs,
  };
}

function portableIpmsWorksPortability(): PortableIpmsWorksBundle['portability'] {
  return {
    canonicalStore: 'Solid LDP/RDF resources',
    cssEnhanced: 'IPMS control plane is an optional interpreter, not the canonical store',
    backendTargets: [
      'vanilla Solid server',
      'Community Solid Server file backend',
      'Community Solid Server SPARQL backend',
      'Oxigraph SPARQL 1.1 backend',
      'OpenLink Virtuoso',
      'QualiaDB-compatible Solid backend',
    ],
    nonPortableRuntimeWork: [
      'OIDC client registrations',
      'live notification subscriptions',
      'control-plane bearer tokens',
      'external service secrets',
      'connector sidecar runtime descriptors and secret references',
      'runtime-specific interpreters and adapters',
    ],
  };
}

function parsePortability(value: unknown): PortableIpmsWorksBundle['portability'] {
  const portability = requireRecord(value, 'IPMS works portability');
  return {
    canonicalStore: requireExact(
      portability.canonicalStore,
      'Solid LDP/RDF resources',
      'IPMS works portability canonicalStore',
    ),
    cssEnhanced: requireExact(
      portability.cssEnhanced,
      'IPMS control plane is an optional interpreter, not the canonical store',
      'IPMS works portability cssEnhanced',
    ),
    backendTargets: requireStringArray(portability.backendTargets, 'IPMS works portability backendTargets'),
    nonPortableRuntimeWork: requireStringArray(
      portability.nonPortableRuntimeWork,
      'IPMS works portability nonPortableRuntimeWork',
    ),
  };
}

function parseModuleState(value: unknown, index: number): PortableIpmsModuleState {
  const module = requireRecord(value, `IPMS works module ${index}`);
  const state = module.state === undefined ? undefined : parseState(module.state, index);
  return {
    manifest: parseManifest(module.manifest, index),
    enabled: requireBoolean(module.enabled, `IPMS works module ${index} enabled`),
    ...state === undefined ? {} : { state },
  };
}

function parseManifest(value: unknown, index: number): SolidModuleManifest {
  const manifest = requireRecord(value, `IPMS works module ${index} manifest`);
  const adminUi = manifest.adminUi === undefined ? undefined : parseAdminUi(manifest.adminUi, index);
  return {
    id: requireModuleId(manifest.id, `IPMS works module ${index} manifest id`),
    name: requireString(manifest.name, `IPMS works module ${index} manifest name`),
    version: requireString(manifest.version, `IPMS works module ${index} manifest version`),
    description: requireString(manifest.description, `IPMS works module ${index} manifest description`),
    capabilities: requireStringArray(manifest.capabilities, `IPMS works module ${index} manifest capabilities`),
    routes: requireStringArray(manifest.routes, `IPMS works module ${index} manifest routes`),
    ...manifest.configShape === undefined ?
        {} :
        {
          configShape: requireString(manifest.configShape, `IPMS works module ${index} manifest configShape`),
        },
    ...adminUi === undefined ? {} : { adminUi },
  };
}

function parseAdminUi(value: unknown, index: number): SolidModuleManifest['adminUi'] {
  const adminUi = requireRecord(value, `IPMS works module ${index} manifest adminUi`);
  return {
    navLabel: requireString(adminUi.navLabel, `IPMS works module ${index} manifest adminUi navLabel`),
    path: requireString(adminUi.path, `IPMS works module ${index} manifest adminUi path`),
  };
}

function parseState(value: unknown, index: number): PortableIpmsModuleState['state'] {
  const state = requireRecord(value, `IPMS works module ${index} state`);
  return {
    contentType: requireExact(state.contentType, 'text/turtle', `IPMS works module ${index} state contentType`),
    turtle: requireString(state.turtle, `IPMS works module ${index} state turtle`),
  };
}

function parseVerticalProfile(value: unknown, index: number): VerticalProfileManifest {
  const profile = requireRecord(value, `IPMS works vertical profile ${index}`);
  return validateVerticalProfileBundle({
    id: requireModuleId(profile.id, `IPMS works vertical profile ${index} id`),
    name: requireString(profile.name, `IPMS works vertical profile ${index} name`),
    version: requireString(profile.version, `IPMS works vertical profile ${index} version`),
    description: requireString(profile.description, `IPMS works vertical profile ${index} description`),
    useCases: requireStringArray(profile.useCases, `IPMS works vertical profile ${index} useCases`),
    modules: requireArray(profile.modules, `IPMS works vertical profile ${index} modules`)
      .map((module, moduleIndex): VerticalProfileManifest['modules'][number] =>
        parseVerticalProfileModule(module, index, moduleIndex)),
  }, { get: (): undefined => undefined } as unknown as DataboxModuleRegistry).profile;
}

function parseVerticalProfileModule(
  value: unknown,
  profileIndex: number,
  moduleIndex: number,
): VerticalProfileManifest['modules'][number] {
  const module = requireRecord(value, `IPMS works vertical profile ${profileIndex} module ${moduleIndex}`);
  let defaultConfig: VerticalProfileManifest['modules'][number]['defaultConfig'];
  if (module.defaultConfig !== undefined) {
    defaultConfig = parseVerticalProfileDefaultConfig(module.defaultConfig, profileIndex, moduleIndex);
  }
  return {
    moduleId: requireModuleId(
      module.moduleId,
      `IPMS works vertical profile ${profileIndex} module ${moduleIndex} moduleId`,
    ),
    required: requireBoolean(
      module.required,
      `IPMS works vertical profile ${profileIndex} module ${moduleIndex} required`,
    ),
    enabledByDefault: requireBoolean(
      module.enabledByDefault,
      `IPMS works vertical profile ${profileIndex} module ${moduleIndex} enabledByDefault`,
    ),
    rationale: requireString(
      module.rationale,
      `IPMS works vertical profile ${profileIndex} module ${moduleIndex} rationale`,
    ),
    ...defaultConfig === undefined ? {} : { defaultConfig },
  };
}

function parseVerticalProfileDefaultConfig(
  value: unknown,
  profileIndex: number,
  moduleIndex: number,
): VerticalProfileManifest['modules'][number]['defaultConfig'] {
  const config = requireRecord(
    value,
    `IPMS works vertical profile ${profileIndex} module ${moduleIndex} defaultConfig`,
  );
  return {
    contentType: requireExact(
      config.contentType,
      'text/turtle',
      `IPMS works vertical profile ${profileIndex} module ${moduleIndex} defaultConfig contentType`,
    ),
    turtle: requireString(
      config.turtle,
      `IPMS works vertical profile ${profileIndex} module ${moduleIndex} defaultConfig turtle`,
    ),
  };
}

function parseConnectorManifest(value: unknown, index: number): PortableConnectorManifest {
  const connector = requireRecord(value, `IPMS works connector manifest ${index}`);
  const source = requireRecord(connector.source, `IPMS works connector manifest ${index} source`);
  const mapping = requireRecord(connector.mapping, `IPMS works connector manifest ${index} mapping`);
  const target = requireRecord(connector.target, `IPMS works connector manifest ${index} target`);
  return validatePortableConnectorManifest({
    id: requireModuleId(connector.id, `IPMS works connector manifest ${index} id`),
    name: requireString(connector.name, `IPMS works connector manifest ${index} name`),
    version: requireString(connector.version, `IPMS works connector manifest ${index} version`),
    description: requireString(connector.description, `IPMS works connector manifest ${index} description`),
    source: {
      kind: requireString(source.kind, `IPMS works connector manifest ${index} source kind`) as
        PortableConnectorManifest['source']['kind'],
      sourceRef: requireString(source.sourceRef, `IPMS works connector manifest ${index} source sourceRef`),
      ...source.label === undefined ?
          {} :
          { label: requireString(source.label, `IPMS works connector manifest ${index} source label`) },
    },
    modes: requireStringArray(
      connector.modes,
      `IPMS works connector manifest ${index} modes`,
    ) as PortableConnectorManifest['modes'],
    mapping: {
      language: requireString(
        mapping.language,
        `IPMS works connector manifest ${index} mapping language`,
      ) as PortableConnectorManifest['mapping']['language'],
      contentType: requireExact(
        mapping.contentType,
        'text/turtle',
        `IPMS works connector manifest ${index} mapping contentType`,
      ),
      turtle: requireString(mapping.turtle, `IPMS works connector manifest ${index} mapping turtle`),
      ...mapping.rootIri === undefined ?
          {} :
          { rootIri: requireString(mapping.rootIri, `IPMS works connector manifest ${index} mapping rootIri`) },
    },
    target: {
      podBaseIri: requireString(target.podBaseIri, `IPMS works connector manifest ${index} target podBaseIri`),
      ...target.resourceContainer === undefined ?
          {} :
          {
            resourceContainer: requireString(
              target.resourceContainer,
              `IPMS works connector manifest ${index} target resourceContainer`,
            ),
          },
      ...target.graphIri === undefined ?
          {} :
          { graphIri: requireString(target.graphIri, `IPMS works connector manifest ${index} target graphIri`) },
    },
    ...connector.capabilities === undefined ?
        {} :
        {
          capabilities: requireStringArray(
            connector.capabilities,
            `IPMS works connector manifest ${index} capabilities`,
          ),
        },
  });
}

function parseConnectorJob(value: unknown, index: number): PortableConnectorJob {
  const job = requireRecord(value, `IPMS works connector job ${index}`);
  return validatePortableConnectorJob({
    id: requireModuleId(job.id, `IPMS works connector job ${index} id`),
    connectorId: requireModuleId(job.connectorId, `IPMS works connector job ${index} connectorId`),
    mode: requireString(job.mode, `IPMS works connector job ${index} mode`) as PortableConnectorJob['mode'],
    createdAt: requireString(job.createdAt, `IPMS works connector job ${index} createdAt`),
    ...job.conflictPolicy === undefined ?
        {} :
        {
          conflictPolicy: requireString(
            job.conflictPolicy,
            `IPMS works connector job ${index} conflictPolicy`,
          ) as PortableConnectorJob['conflictPolicy'],
        },
    ...job.cursorResource === undefined ?
        {} :
        { cursorResource: requireString(job.cursorResource, `IPMS works connector job ${index} cursorResource`) },
    ...job.dryRun === undefined ?
        {} :
        { dryRun: requireBoolean(job.dryRun, `IPMS works connector job ${index} dryRun`) },
  });
}

function validateConnectorWorks(
  manifests: readonly PortableConnectorManifest[],
  jobs: readonly PortableConnectorJob[],
): { manifests: readonly PortableConnectorManifest[]; jobs: readonly PortableConnectorJob[] } {
  const checkedManifests = manifests.map((manifest): PortableConnectorManifest =>
    validatePortableConnectorManifest(manifest));
  const connectors = new Map<string, PortableConnectorManifest>();
  for (const manifest of checkedManifests) {
    if (connectors.has(manifest.id)) {
      throw new Error(`IPMS works connector manifest ${manifest.id} must be declared only once.`);
    }
    connectors.set(manifest.id, manifest);
  }
  const seenJobs = new Set<string>();
  const checkedJobs = jobs.map((job): PortableConnectorJob => {
    if (seenJobs.has(job.id)) {
      throw new Error(`IPMS works connector job ${job.id} must be declared only once.`);
    }
    seenJobs.add(job.id);
    const manifest = connectors.get(job.connectorId);
    if (!manifest) {
      throw new Error(`IPMS works connector job ${job.id} references missing connector ${job.connectorId}.`);
    }
    return validatePortableConnectorJob(job, manifest);
  });
  return {
    manifests: checkedManifests,
    jobs: checkedJobs,
  };
}

function sameManifest(left: SolidModuleManifest, right: SolidModuleManifest): boolean {
  return left.id === right.id &&
    left.name === right.name &&
    left.version === right.version &&
    left.description === right.description &&
    left.configShape === right.configShape &&
    sameStringList(left.capabilities, right.capabilities) &&
    sameStringList(left.routes, right.routes) &&
    left.adminUi?.navLabel === right.adminUi?.navLabel &&
    left.adminUi?.path === right.adminUi?.path;
}

function sameStringList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index): boolean => value === right[index]);
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${field} must be an array.`);
  }
  return value;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${field} must be a non-empty string.`);
  }
  return value;
}

function requireModuleId(value: unknown, field: string): string {
  const id = requireString(value, field);
  if (!/^[\w.:-]+$/u.test(id)) {
    throw new Error(`${field} must be a safe module id.`);
  }
  return id;
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new TypeError(`${field} must be a boolean.`);
  }
  return value;
}

function requireStringArray(value: unknown, field: string): string[] {
  return requireArray(value, field).map((entry, index): string => requireString(entry, `${field}[${index}]`));
}

function requireExact<T extends string>(value: unknown, expected: T, field: string): T {
  if (value !== expected) {
    throw new Error(`${field} must be ${expected}.`);
  }
  return expected;
}

type RequiredStandardSolidIpmsWorksOptions = Required<
  Pick<
    StandardSolidIpmsWorksOptions,
    'baseUrl' | 'typeIndexPath' | 'manifestContainerPath' | 'moduleStateContainerPath' |
    'verticalProfileContainerPath' | 'connectorManifestContainerPath' | 'connectorJobContainerPath'
  >
>;

function standardSolidPaths(options: StandardSolidIpmsWorksOptions): RequiredStandardSolidIpmsWorksOptions {
  return {
    baseUrl: ensureTrailingSlash(new URL(options.baseUrl).href),
    typeIndexPath: resolveSolidPath(options.baseUrl, options.typeIndexPath ?? '.well-known/databox-ipms/type-index.ttl'),
    manifestContainerPath: ensureTrailingSlash(resolveSolidPath(
      options.baseUrl,
      options.manifestContainerPath ?? '.well-known/databox-ipms/modules/',
    )),
    verticalProfileContainerPath: ensureTrailingSlash(resolveSolidPath(
      options.baseUrl,
      options.verticalProfileContainerPath ?? '.well-known/databox-ipms/vertical-profiles/',
    )),
    connectorManifestContainerPath: ensureTrailingSlash(resolveSolidPath(
      options.baseUrl,
      options.connectorManifestContainerPath ?? '.well-known/databox-ipms/connectors/',
    )),
    connectorJobContainerPath: ensureTrailingSlash(resolveSolidPath(
      options.baseUrl,
      options.connectorJobContainerPath ?? '.well-known/databox-ipms/connector-jobs/',
    )),
    moduleStateContainerPath: ensureTrailingSlash(resolveSolidPath(
      options.baseUrl,
      options.moduleStateContainerPath ?? '.databox/ipms/modules/',
    )),
  };
}

function resolveSolidPath(baseUrl: string, path: string): string {
  if (URL.canParse(path)) {
    return new URL(path).href;
  }
  return new URL(path, ensureTrailingSlash(new URL(baseUrl).href)).href;
}

function moduleManifestPath(containerPath: string, id: string): string {
  return new URL(`${encodeURIComponent(id)}.ttl`, containerPath).href;
}

function moduleStatePath(containerPath: string, id: string): string {
  return new URL(encodeURIComponent(id), containerPath).href;
}

function moduleManifestSubject(path: string): string {
  return `${path}#manifest`;
}

function verticalProfilePath(containerPath: string, id: string): string {
  return new URL(`${encodeURIComponent(id)}.ttl`, containerPath).href;
}

function verticalProfileSubject(path: string): string {
  return `${path}#profile`;
}

function connectorManifestPath(containerPath: string, id: string): string {
  return new URL(`${encodeURIComponent(id)}.ttl`, containerPath).href;
}

function connectorManifestSubject(path: string): string {
  return `${path}#connector`;
}

function connectorJobPath(containerPath: string, id: string): string {
  return new URL(`${encodeURIComponent(id)}.ttl`, containerPath).href;
}

function connectorJobSubject(path: string): string {
  return `${path}#job`;
}

async function serializeTypeIndex(
  typeIndexPath: string,
  manifests: readonly StandardSolidIpmsWorksResource[],
  verticalProfiles: readonly StandardSolidIpmsWorksResource[],
  connectorManifests: readonly StandardSolidIpmsWorksResource[],
  connectorJobs: readonly StandardSolidIpmsWorksResource[],
): Promise<string> {
  const quads: Quad[] = [
    rdfQuad(namedNode(typeIndexPath), RDF.terms.type, TYPE_INDEX),
    rdfQuad(namedNode(typeIndexPath), RDF.terms.type, LISTED_DOCUMENT),
  ];
  for (const manifest of manifests) {
    const registration = namedNode(`${typeIndexPath}#module-${encodeURIComponent(manifest.moduleId ?? manifest.path)}`);
    quads.push(
      rdfQuad(namedNode(typeIndexPath), REFERENCES, registration),
      rdfQuad(registration, RDF.terms.type, TYPE_REGISTRATION),
      rdfQuad(registration, FOR_CLASS, IPMS.terms.Module),
      rdfQuad(registration, INSTANCE, namedNode(manifest.path)),
    );
  }
  for (const profile of verticalProfiles) {
    const registration = namedNode(
      `${typeIndexPath}#vertical-profile-${encodeURIComponent(profile.verticalProfileId ?? profile.path)}`,
    );
    quads.push(
      rdfQuad(namedNode(typeIndexPath), REFERENCES, registration),
      rdfQuad(registration, RDF.terms.type, TYPE_REGISTRATION),
      rdfQuad(registration, FOR_CLASS, namedNode(`${IPMS.namespace}VerticalProfile`)),
      rdfQuad(registration, INSTANCE, namedNode(profile.path)),
    );
  }
  for (const connector of connectorManifests) {
    const registration = namedNode(
      `${typeIndexPath}#connector-${encodeURIComponent(connector.connectorId ?? connector.path)}`,
    );
    quads.push(
      rdfQuad(namedNode(typeIndexPath), REFERENCES, registration),
      rdfQuad(registration, RDF.terms.type, TYPE_REGISTRATION),
      rdfQuad(registration, FOR_CLASS, namedNode(`${IPMS.namespace}ConnectorManifest`)),
      rdfQuad(registration, INSTANCE, namedNode(connector.path)),
    );
  }
  for (const job of connectorJobs) {
    const registration = namedNode(
      `${typeIndexPath}#connector-job-${encodeURIComponent(job.connectorJobId ?? job.path)}`,
    );
    quads.push(
      rdfQuad(namedNode(typeIndexPath), REFERENCES, registration),
      rdfQuad(registration, RDF.terms.type, TYPE_REGISTRATION),
      rdfQuad(registration, FOR_CLASS, namedNode(`${IPMS.namespace}ConnectorJob`)),
      rdfQuad(registration, INSTANCE, namedNode(job.path)),
    );
  }
  return serializeTurtle(quads, {
    ipms: IPMS.namespace,
    dcterms: DC.namespace,
    rdf: RDF.namespace,
    solid: SOLID,
  });
}

function parseTypeIndexResourcePaths(
  turtle: string,
  baseIri: string,
  classTerm: Term,
  label: string,
  requireAny: boolean,
): string[] {
  const quads = new Parser({ baseIRI: baseIri }).parse(turtle);
  const seen = new Set<string>();
  const paths: string[] = [];
  for (const registration of subjects(quads, RDF.terms.type, TYPE_REGISTRATION)) {
    if (!hasQuad(quads, registration, FOR_CLASS, classTerm)) {
      continue;
    }
    const instances = objects(quads, registration, INSTANCE);
    if (instances.length !== 1) {
      throw new Error(`IPMS Type Index ${label} registrations must have exactly one solid:instance.`);
    }
    if (instances[0].termType !== 'NamedNode') {
      throw new Error(`IPMS Type Index ${label} registrations must point to named resources.`);
    }
    if (!seen.has(instances[0].value)) {
      seen.add(instances[0].value);
      paths.push(instances[0].value);
    }
  }
  if (requireAny && paths.length === 0) {
    throw new Error(`IPMS Type Index must register at least one ipms:${label === 'module' ? 'Module' : label} resource.`);
  }
  return paths;
}

function moduleStateEnabled(turtle: string, baseIri: string): boolean {
  return new Parser({ baseIRI: baseIri }).parse(turtle)
    .some((quad): boolean => quad.predicate.value === IPMS.enabled && quad.object.value === 'true');
}

async function loadTurtleResource(store: ResourceStore, path: string): Promise<string> {
  return readableToString((await store.getRepresentation({ path }, { type: { [TURTLE]: 1 }})).data);
}

async function loadOptionalTurtleResource(store: ResourceStore, path: string): Promise<string | undefined> {
  if (!await store.hasResource({ path })) {
    return;
  }
  return loadTurtleResource(store, path);
}

function rdfQuad(subject: Quad['subject'], predicate: Quad['predicate'], object: Quad['object']): Quad {
  return DataFactory.quad(subject, predicate, object);
}

function namedNode(value: string): ReturnType<typeof DataFactory.namedNode> {
  return DataFactory.namedNode(value);
}

function hasQuad(quads: readonly Quad[], subject: Term, predicate: Term, object?: Term): boolean {
  return quads.some((candidate): boolean => termEquals(candidate.subject, subject) &&
    termEquals(candidate.predicate, predicate) &&
    (object === undefined || termEquals(candidate.object, object)));
}

function subjects(quads: readonly Quad[], predicate: Term, object: Term): Term[] {
  const seen = new Set<string>();
  return quads
    .filter((candidate): boolean => termEquals(candidate.predicate, predicate) && termEquals(candidate.object, object))
    .map((candidate): Term => candidate.subject)
    .filter((subject): boolean => {
      const key = `${subject.termType}:${subject.value}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

function objects(quads: readonly Quad[], subject: Term, predicate: Term): Term[] {
  return quads
    .filter((candidate): boolean =>
      termEquals(candidate.subject, subject) && termEquals(candidate.predicate, predicate))
    .map((candidate): Term => candidate.object);
}

function termEquals(left: Term, right: Term): boolean {
  return left.termType === right.termType && left.value === right.value;
}

async function serializeTurtle(quads: Quad[], prefixes: Record<string, string>): Promise<string> {
  const writer = new Writer({ prefixes });
  writer.addQuads(quads);
  return new Promise((resolve, reject): void => {
    writer.end((error, result): void => {
      if (error) {
        reject(error);
      } else {
        resolve(typeof result === 'string' ? result : '');
      }
    });
  });
}
