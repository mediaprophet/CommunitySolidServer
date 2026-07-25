import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileShaclValidator, ShaclEngineError, mapShaclReport } from '../src/shacl-validator.js';

const TMP_SHAPES = join(tmpdir(), `test-shacl-shapes-${Date.now()}.ttl`);

describe('CKAN-07: SHACL validation engine', () => {
  beforeEach(() => {
    writeFileSync(TMP_SHAPES, '@prefix sh: <http://www.w3.org/ns/shacl#> .\n', 'utf8');
  });

  afterEach(() => {
    if (existsSync(TMP_SHAPES)) {
      unlinkSync(TMP_SHAPES);
    }
  });

  describe('FileShaclValidator', () => {
    it('constructs with valid config', () => {
      const validator = new FileShaclValidator({ shaclShapesFile: TMP_SHAPES });
      expect(validator).toBeDefined();
    });

    it('fails closed when shapes file is missing', async () => {
      unlinkSync(TMP_SHAPES);
      const validator = new FileShaclValidator({ shaclShapesFile: TMP_SHAPES });
      await expect(validator.validate('https://pod.example.org/resource'))
        .rejects.toThrow(ShaclEngineError);
    });

    it('validate returns conforming result for reference implementation', async () => {
      const validator = new FileShaclValidator({ shaclShapesFile: TMP_SHAPES });
      const result = await validator.validate('https://pod.example.org/resource');
      expect(result.conforms).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.shapeIri).toContain('test-shacl-shapes');
      expect(result.validatedAt).toBeDefined();
    });

    it('validateContent returns conforming result', async () => {
      const validator = new FileShaclValidator({ shaclShapesFile: TMP_SHAPES });
      const result = await validator.validateContent(
        '<a> <b> <c> .',
        'text/turtle',
        'https://example.org/shape',
      );
      expect(result.conforms).toBe(true);
      expect(result.shapeIri).toBe('https://example.org/shape');
    });
  });

  describe('contentDigest', () => {
    it('computes a SHA-256 digest', () => {
      const digest = FileShaclValidator.contentDigest('test content');
      expect(digest).toHaveLength(64); // SHA-256 hex
      expect(digest).toMatch(/^[0-9a-f]+$/);
    });

    it('produces different digests for different content', () => {
      const d1 = FileShaclValidator.contentDigest('content A');
      const d2 = FileShaclValidator.contentDigest('content B');
      expect(d1).not.toBe(d2);
    });
  });

  describe('mapShaclReport', () => {
    it('maps a conforming report', () => {
      const result = mapShaclReport(true, [], 'https://example.org/shape');
      expect(result.conforms).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('maps a non-conforming report with violations', () => {
      const violations = [{
        focusNode: 'https://pod.example.org/resource',
        path: 'https://example.org/required',
        message: 'Value is required',
        severity: 'sh:Violation',
        sourceShape: 'https://example.org/RequiredShape',
      }];
      const result = mapShaclReport(false, violations, 'https://example.org/shape');
      expect(result.conforms).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].severity).toBe('sh:Violation');
    });
  });
});
