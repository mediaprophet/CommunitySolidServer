/**
 * CKAN Bridge service integration (CKAN-11).
 *
 * Wires all components together: Solid-OIDC client, CKAN Action API client,
 * SHACL validator, RDF translator, webhook handler, publication pipeline,
 * and disclosure ledger.
 *
 * This is the main entry point for the bridge service.
 */

import { readFileSync } from 'node:fs';
import type { BridgeConfig } from './types.js';
import type { CkanBridgeService, DisclosureLedger } from './interfaces.js';
import { SolidOidcClient } from './solid-oidc-client.js';
import { HttpCkanActionClient } from './ckan-action-client.js';
import { FileShaclValidator } from './shacl-validator.js';
import { ProgramProfileRdfTranslator, type RdfTranslatorConfig, type FieldMapping, type AnonymisationRule } from './rdf-translator.js';
import { HmacWebhookHandler } from './webhook-handler.js';
import { InMemoryPublicationPipeline } from './publication-pipeline.js';
import type { PublicationJob, CorrectionPropagationJob } from './types.js';

/** In-memory disclosure ledger for reference implementation. */
export class InMemoryDisclosureLedger implements DisclosureLedger {
  readonly publications: PublicationJob[] = [];
  readonly corrections: CorrectionPropagationJob[] = [];
  readonly anonymisations: { podResourceIri: string; decisions: unknown[] }[] = [];

  async recordPublication(job: PublicationJob): Promise<void> {
    this.publications.push(job);
  }

  async recordCorrection(job: CorrectionPropagationJob): Promise<void> {
    this.corrections.push(job);
  }

  async recordAnonymisation(podResourceIri: string, decisions: readonly unknown[]): Promise<void> {
    this.anonymisations.push({ podResourceIri, decisions: [...decisions] });
  }
}

/** Load bridge config from environment + file paths. */
export function loadBridgeConfig(): BridgeConfig {
  const ckanBaseUrl = process.env.CKAN_BASE_URL ?? 'https://ckan.example.org/';
  const ckanApiTokenFile = process.env.CKAN_API_TOKEN_FILE ?? '/run/secrets/ckan-api-token';
  const dpopKeyFile = process.env.BRIDGE_DPOP_KEY_FILE ?? '/run/secrets/bridge-dpop-key';
  const shaclShapesFile = process.env.BRIDGE_SHACL_SHAPES_FILE ?? '/config/shapes.ttl';
  const programProfileFile = process.env.BRIDGE_PROGRAM_PROFILE_FILE ?? '/run/secrets-profile/program-profile.json';
  const webhookSecretFile = process.env.BRIDGE_WEBHOOK_SECRET_FILE ?? '/run/secrets/webhook-secret';
  const maxRetries = parseInt(process.env.BRIDGE_MAX_RETRIES ?? '5', 10);
  const reconciliationIntervalSeconds = parseInt(process.env.BRIDGE_RECONCILIATION_INTERVAL ?? '300', 10);

  // Load program profile
  let profile: { organisation: string; program: string; serviceIdentity: string; issuer: string };
  try {
    profile = JSON.parse(readFileSync(programProfileFile, 'utf8'));
  } catch {
    // Default profile for development
    profile = {
      organisation: 'default',
      program: 'default',
      serviceIdentity: 'https://databox.example.org/agents/ckan-bridge-default',
      issuer: 'https://databox.example.org/issuers/default',
    };
  }

  return {
    ckanBaseUrl,
    ckanApiTokenFile,
    dpopKeyFile,
    shaclShapesFile,
    programProfileFile,
    webhookSecretFile,
    maxRetries,
    reconciliationIntervalSeconds,
    serviceIdentity: {
      organisation: profile.organisation,
      program: profile.program,
      serviceIdentity: profile.serviceIdentity,
      issuer: profile.issuer,
    },
  };
}

/** Load translator config from program profile. */
function loadTranslatorConfig(): RdfTranslatorConfig {
  // In production, this loads field mappings and anonymisation rules from the program profile.
  // For the reference implementation, we use empty configs.
  const fieldMappings: FieldMapping[] = [];
  const anonymisationRules: AnonymisationRule[] = [];
  return { fieldMappings, anonymisationRules };
}

/**
 * The main CKAN Bridge service.
 *
 * Wires all components and provides the HTTP server entry point.
 */
export class CkanBridgeServiceImpl implements CkanBridgeService {
  readonly config: BridgeConfig;
  readonly oidcClient: SolidOidcClient;
  readonly ckanClient: HttpCkanActionClient;
  readonly shaclValidator: FileShaclValidator;
  readonly translator: ProgramProfileRdfTranslator;
  readonly webhookHandler: HmacWebhookHandler;
  readonly pipeline: InMemoryPublicationPipeline;
  readonly ledger: InMemoryDisclosureLedger;
  private server: ReturnType<typeof import('node:http').createServer> | null = null;

  constructor(config?: BridgeConfig) {
    this.config = config ?? loadBridgeConfig();
    this.ledger = new InMemoryDisclosureLedger();
    this.oidcClient = new SolidOidcClient({
      issuer: this.config.serviceIdentity.issuer,
      clientId: `ckan-bridge-${this.config.serviceIdentity.organisation}`,
      dpopKeyFile: this.config.dpopKeyFile,
      tokenLifetimeSeconds: 300,
    });
    this.ckanClient = new HttpCkanActionClient({
      ckanBaseUrl: this.config.ckanBaseUrl,
      ckanApiTokenFile: this.config.ckanApiTokenFile,
    });
    this.shaclValidator = new FileShaclValidator({
      shaclShapesFile: this.config.shaclShapesFile,
    });
    this.translator = new ProgramProfileRdfTranslator(loadTranslatorConfig());
    this.webhookHandler = new HmacWebhookHandler({
      webhookSecretFile: this.config.webhookSecretFile,
    });
    this.pipeline = new InMemoryPublicationPipeline({
      config: this.config,
      ckanClient: this.ckanClient,
      shaclValidator: this.shaclValidator,
      translator: this.translator,
      oidcClient: this.oidcClient,
      ledger: this.ledger,
    });

    // Register webhook callbacks
    this.webhookHandler.on('dataset_created', async (_event) => {
      // Trigger reconciliation check for new CKAN datasets
      // Implemented in CKAN-13
    });
    this.webhookHandler.on('dataset_updated', async (_event) => {
      // Check for editor-originated drift
      // Implemented in CKAN-13
    });
    this.webhookHandler.on('dataset_deleted', async (_event) => {
      // Clean up orphaned references
      // Implemented in CKAN-13
    });
  }

  async start(): Promise<void> {
    const { createServer } = await import('node:http');
    this.server = createServer(async (req, res) => {
      if (req.url === '/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', service: 'ckan-bridge' }));
        return;
      }

      if (req.url === '/webhook' && req.method === 'POST') {
        // Collect body
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(chunk as Buffer);
        }
        const rawBody = Buffer.concat(chunks).toString('utf8');
        const signature = req.headers['x-databox-signature'] as string;

        try {
          const event = JSON.parse(rawBody);
          await this.webhookHandler.handle(event, signature, rawBody);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: (error as Error).message }));
        }
        return;
      }

      if (req.url === '/publish' && req.method === 'POST') {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(chunk as Buffer);
        }
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const podResourceIri = body.podResourceIri;

        if (!podResourceIri) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'podResourceIri is required' }));
          return;
        }

        try {
          const job = await this.pipeline.publish(podResourceIri);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, job }));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: (error as Error).message }));
        }
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    });

    const port = parseInt(process.env.BRIDGE_PORT ?? '3001', 10);
    this.server.listen(port);
  }

  async stop(): Promise<void> {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}
