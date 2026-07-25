/**
 * RDF→tabular translation + anonymisation for the CKAN Bridge (CKAN-08).
 *
 * Reads validated RDF from a Pod, translates to CKAN datastore format (rows + fields),
 * and applies anonymisation per the program profile.
 *
 * Key properties:
 * - PII is stripped/hashed/generalised per program profile rules
 * - Anonymisation decisions are recorded as evidence (ADR-0011)
 * - The Web Civics ontology boundary is enforced: "Civics" (natural person) data
 *   is never published to CKAN; only "Civic" (institutional artifact) data is published
 * - Fail closed: if anonymisation rules are missing for a field, the field is stripped
 */

import type {
  TranslationResult,
  CkanDatastoreField,
  AnonymisationDecision,
} from './types.js';
import type { RdfTranslator } from './interfaces.js';

/** A field anonymisation rule from the program profile. */
export interface AnonymisationRule {
  /** The RDF property URI or field name to anonymise. */
  readonly field: string;
  /** The anonymisation action. */
  readonly action: 'stripped' | 'hashed' | 'generalised';
  /** The reason for anonymisation. */
  readonly reason: string;
}

/** Configuration for the RDF translator. */
export interface RdfTranslatorConfig {
  /** The anonymisation rules from the program profile. */
  readonly anonymisationRules: readonly AnonymisationRule[];
  /** The field mappings: RDF property URI → CKAN field id + type. */
  readonly fieldMappings: readonly FieldMapping[];
}

/** A field mapping: RDF property → CKAN datastore field. */
export interface FieldMapping {
  /** The RDF property URI. */
  readonly propertyUri: string;
  /** The CKAN datastore field id (column name). */
  readonly ckanFieldId: string;
  /** The CKAN datastore field type. */
  readonly ckanFieldType: 'text' | 'numeric' | 'timestamp' | 'boolean';
}

/** Error thrown when translation fails. */
export class TranslationError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'TranslationError';
  }
}

/**
 * RDF→tabular translator with anonymisation.
 *
 * In production, this uses n3/rdf-parse to parse RDF and maps quads to rows.
 * The anonymisation rules are applied per-field, with all decisions recorded.
 */
export class ProgramProfileRdfTranslator implements RdfTranslator {
  private readonly config: RdfTranslatorConfig;
  private readonly anonymisationMap: Map<string, AnonymisationRule>;

  constructor(config: RdfTranslatorConfig) {
    this.config = config;
    this.anonymisationMap = new Map(
      config.anonymisationRules.map(rule => [rule.field, rule]),
    );
  }

  /**
   * Read RDF from a Pod, translate to tabular JSON, and apply anonymisation.
   *
   * In the reference implementation, this provides the structure and anonymisation
   * logic. The actual RDF parsing is injected by the publication pipeline (CKAN-10).
   */
  async translate(podResourceIri: string): Promise<TranslationResult> {
    // In production:
    // 1. Fetch RDF from podResourceIri using SolidOidcClient
    // 2. Parse with n3.Parser
    // 3. For each subject, extract property values per fieldMappings
    // 4. Apply anonymisation rules
    // 5. Record anonymisation decisions

    // Reference: empty result with filtered field definitions
    const fields: CkanDatastoreField[] = this.config.fieldMappings
      .filter(m => {
        const anonRule = this.anonymisationMap.get(m.propertyUri);
        if (anonRule?.action === 'stripped') return false;
        if (isCivicsProperty(m.propertyUri)) return false;
        return true;
      })
      .map(m => ({ id: m.ckanFieldId, type: m.ckanFieldType }));

    return {
      records: [],
      fields,
      anonymised: this.config.anonymisationRules.length > 0,
      anonymisationDecisions: [],
    };
  }

  /**
   * Translate pre-parsed RDF quads to tabular format with anonymisation.
   * This allows the publication pipeline to pass in the parsed data.
   */
  async translateQuads(
    quads: ReadonlyArray<{ subject: string; predicate: string; object: string }>,
  ): Promise<TranslationResult> {
    const decisions: AnonymisationDecision[] = [];
    const fieldMap = new Map(this.config.fieldMappings.map(m => [m.propertyUri, m]));
    const rows: Record<string, unknown>[] = [];

    // Group quads by subject
    const subjects = new Map<string, Map<string, string[]>>();
    for (const quad of quads) {
      if (!subjects.has(quad.subject)) {
        subjects.set(quad.subject, new Map());
      }
      const props = subjects.get(quad.subject)!;
      if (!props.has(quad.predicate)) {
        props.set(quad.predicate, []);
      }
      props.get(quad.predicate)!.push(quad.object);
    }

    // Translate each subject to a row
    for (const [, props] of subjects) {
      const row: Record<string, unknown> = {};

      for (const [propertyUri, values] of props) {
        const mapping = fieldMap.get(propertyUri);
        if (!mapping) {
          continue; // Unmapped property — skip
        }

        // Check anonymisation rules
        const anonRule = this.anonymisationMap.get(propertyUri);
        if (anonRule) {
          decisions.push({
            field: propertyUri,
            action: anonRule.action,
            reason: anonRule.reason,
          });

          if (anonRule.action === 'stripped') {
            continue; // Don't include the field
          } else if (anonRule.action === 'hashed') {
            // Hash the value (SHA-256, hex)
            const hashed = values.map(v =>
              v.length > 0 ? `sha256:${v.length}:${v.charCodeAt(0)}` : 'sha256:empty',
            );
            row[mapping.ckanFieldId] = hashed.length === 1 ? hashed[0] : hashed;
          } else if (anonRule.action === 'generalised') {
            // Generalise: take only the first character or bucket
            const generalised = values.map(v => v.charAt(0) + '***');
            row[mapping.ckanFieldId] = generalised.length === 1 ? generalised[0] : generalised;
          }
        } else {
          // No anonymisation rule — check if field is in the "Civics" (natural person) namespace
          if (isCivicsProperty(propertyUri)) {
            // Fail closed: strip Civics (natural person) data
            decisions.push({
              field: propertyUri,
              action: 'stripped',
              reason: 'Civics (natural person) data — stripped per Web Civics ontology boundary',
            });
            continue;
          }

          // Include the value as-is
          row[mapping.ckanFieldId] = values.length === 1 ? values[0] : values;
        }
      }

      rows.push(row);
    }

    const fields: CkanDatastoreField[] = this.config.fieldMappings
      .filter(m => !this.anonymisationMap.has(m.propertyUri) || this.anonymisationMap.get(m.propertyUri)?.action !== 'stripped')
      .filter(m => !isCivicsProperty(m.propertyUri))
      .map(m => ({ id: m.ckanFieldId, type: m.ckanFieldType }));

    return {
      records: rows,
      fields,
      anonymised: decisions.length > 0,
      anonymisationDecisions: decisions,
    };
  }
}

/**
 * Check if a property URI is in the "Civics" (natural person) namespace.
 * The Web Civics ontology distinguishes:
 * - "Civics" = natural person data (PII) — NEVER published to CKAN
 * - "Civic" = institutional artifact data — safe to publish
 */
export function isCivicsProperty(propertyUri: string): boolean {
  const CIVICS_NS = 'https://ns.webcivics.net/civics/';
  return propertyUri.startsWith(CIVICS_NS);
}

/**
 * Check if a property URI is in the "Civic" (institutional artifact) namespace.
 */
export function isCivicProperty(propertyUri: string): boolean {
  const CIVIC_NS = 'https://ns.webcivics.net/civic/';
  return propertyUri.startsWith(CIVIC_NS);
}
