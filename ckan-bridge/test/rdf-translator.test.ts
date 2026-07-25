import { describe, it, expect } from '@jest/globals';
import {
  ProgramProfileRdfTranslator,
  isCivicsProperty,
  isCivicProperty,
  type RdfTranslatorConfig,
  type AnonymisationRule,
  type FieldMapping,
} from '../src/rdf-translator.js';

const FIELD_MAPPINGS: FieldMapping[] = [
  { propertyUri: 'https://example.org/def/name', ckanFieldId: 'name', ckanFieldType: 'text' },
  { propertyUri: 'https://example.org/def/price', ckanFieldId: 'price', ckanFieldType: 'numeric' },
  { propertyUri: 'https://example.org/def/date', ckanFieldId: 'date', ckanFieldType: 'timestamp' },
  { propertyUri: 'https://ns.webcivics.net/civics/customerName', ckanFieldId: 'customer_name', ckanFieldType: 'text' },
  { propertyUri: 'https://ns.webcivics.net/civic/agencyName', ckanFieldId: 'agency_name', ckanFieldType: 'text' },
];

const ANON_RULES: AnonymisationRule[] = [
  { field: 'https://example.org/def/name', action: 'hashed', reason: 'PII per program profile' },
];

const CONFIG: RdfTranslatorConfig = {
  anonymisationRules: ANON_RULES,
  fieldMappings: FIELD_MAPPINGS,
};

describe('CKAN-08: RDF→tabular translation + anonymisation', () => {
  describe('isCivicsProperty', () => {
    it('returns true for Civics (natural person) namespace', () => {
      expect(isCivicsProperty('https://ns.webcivics.net/civics/customerName')).toBe(true);
    });

    it('returns false for Civic (institutional) namespace', () => {
      expect(isCivicsProperty('https://ns.webcivics.net/civic/agencyName')).toBe(false);
    });

    it('returns false for other namespaces', () => {
      expect(isCivicsProperty('https://example.org/def/name')).toBe(false);
    });
  });

  describe('isCivicProperty', () => {
    it('returns true for Civic (institutional) namespace', () => {
      expect(isCivicProperty('https://ns.webcivics.net/civic/agencyName')).toBe(true);
    });

    it('returns false for Civics (natural person) namespace', () => {
      expect(isCivicProperty('https://ns.webcivics.net/civics/customerName')).toBe(false);
    });
  });

  describe('ProgramProfileRdfTranslator', () => {
    it('constructs with valid config', () => {
      const translator = new ProgramProfileRdfTranslator(CONFIG);
      expect(translator).toBeDefined();
    });

    it('translate returns empty records with field definitions', async () => {
      const translator = new ProgramProfileRdfTranslator(CONFIG);
      const result = await translator.translate('https://pod.example.org/resource');
      expect(result.records).toHaveLength(0);
      expect(result.fields.length).toBeGreaterThan(0);
    });

    it('translateQuads maps simple quads to rows', async () => {
      const translator = new ProgramProfileRdfTranslator(CONFIG);
      const quads = [
        { subject: 'https://pod.example.org/r1', predicate: 'https://example.org/def/name', object: 'Widget A' },
        { subject: 'https://pod.example.org/r1', predicate: 'https://example.org/def/price', object: '19.99' },
      ];
      const result = await translator.translateQuads(quads);
      expect(result.records).toHaveLength(1);
      // name should be hashed (anonymisation rule)
      expect(result.records[0].name).toBeDefined();
      expect(result.records[0].name).not.toBe('Widget A');
      // price should be included as-is
      expect(result.records[0].price).toBe('19.99');
    });

    it('anonymisation records decisions as evidence', async () => {
      const translator = new ProgramProfileRdfTranslator(CONFIG);
      const quads = [
        { subject: 'https://pod.example.org/r1', predicate: 'https://example.org/def/name', object: 'Widget A' },
      ];
      const result = await translator.translateQuads(quads);
      expect(result.anonymised).toBe(true);
      expect(result.anonymisationDecisions).toHaveLength(1);
      expect(result.anonymisationDecisions[0].action).toBe('hashed');
      expect(result.anonymisationDecisions[0].reason).toBe('PII per program profile');
    });

    it('strips Civics (natural person) data automatically', async () => {
      const translator = new ProgramProfileRdfTranslator(CONFIG);
      const quads = [
        { subject: 'https://pod.example.org/r1', predicate: 'https://ns.webcivics.net/civics/customerName', object: 'John Doe' },
        { subject: 'https://pod.example.org/r1', predicate: 'https://example.org/def/price', object: '19.99' },
      ];
      const result = await translator.translateQuads(quads);
      // customer_name should be stripped (Civics namespace)
      expect(result.records[0].customer_name).toBeUndefined();
      // price should be included
      expect(result.records[0].price).toBe('19.99');
      // Anonymisation decision should record the stripping
      const stripDecision = result.anonymisationDecisions.find(d => d.field.includes('customerName'));
      expect(stripDecision).toBeDefined();
      expect(stripDecision?.action).toBe('stripped');
      expect(stripDecision?.reason).toContain('Civics');
    });

    it('includes Civic (institutional) data', async () => {
      const translator = new ProgramProfileRdfTranslator(CONFIG);
      const quads = [
        { subject: 'https://pod.example.org/r1', predicate: 'https://ns.webcivics.net/civic/agencyName', object: 'Department of Data' },
      ];
      const result = await translator.translateQuads(quads);
      expect(result.records[0].agency_name).toBe('Department of Data');
    });

    it('stripped fields are excluded from field definitions', async () => {
      const translator = new ProgramProfileRdfTranslator(CONFIG);
      const result = await translator.translate('https://pod.example.org/resource');
      // customer_name should NOT be in fields (Civics namespace)
      const fieldIds = result.fields.map(f => f.id);
      expect(fieldIds).not.toContain('customer_name');
      // agency_name should be in fields (Civic namespace)
      expect(fieldIds).toContain('agency_name');
    });

    it('generalised anonymisation buckets values', async () => {
      const config: RdfTranslatorConfig = {
        fieldMappings: [
          { propertyUri: 'https://example.org/def/location', ckanFieldId: 'location', ckanFieldType: 'text' },
        ],
        anonymisationRules: [
          { field: 'https://example.org/def/location', action: 'generalised', reason: 'Location privacy' },
        ],
      };
      const translator = new ProgramProfileRdfTranslator(config);
      const quads = [
        { subject: 'https://pod.example.org/r1', predicate: 'https://example.org/def/location', object: 'Sydney' },
      ];
      const result = await translator.translateQuads(quads);
      expect(result.records[0].location).toBe('S***');
    });

    it('unmapped properties are skipped', async () => {
      const translator = new ProgramProfileRdfTranslator(CONFIG);
      const quads = [
        { subject: 'https://pod.example.org/r1', predicate: 'https://unknown.org/prop', object: 'value' },
        { subject: 'https://pod.example.org/r1', predicate: 'https://example.org/def/price', object: '19.99' },
      ];
      const result = await translator.translateQuads(quads);
      expect(result.records).toHaveLength(1);
      expect(result.records[0].price).toBe('19.99');
    });
  });
});
