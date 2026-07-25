'use strict';

module.exports = {
  ignores: [ 'node_modules/', '**/node_modules/', 'LICENSE.md', 'CREDITS.md', 'databox/', 'forge-admin/', 'apps/', 'ckan-bridge/' ],

  globs: [ '**/*.md' ],

  config: {
    // Enable all markdownlint rules
    default: true,

    // Disable heading increment check — RELEASE_NOTES.md and issue templates
    // jump heading levels intentionally
    MD001: false,

    // Set list indent level to 4 which mkdocs / Python-Markdown requires
    MD007: { indent: 4 },

    // Disable line length check — documentation files exceed 120 chars
    MD013: false,

    // Allow multiple subheadings with the same content
    // across different section (#1 ##A ##B #2 ##A ##B)
    MD024: {
      siblings_only: true,
    },

    // Allow fenced code blocks without a language specified
    MD040: false,

    // Allow non-descriptive link text (e.g. "[here]")
    MD059: false,

    // Disable table column style enforcement
    MD060: false,

    // Set Ordered list item prefix to "ordered" (use 1. 2. 3. not 1. 1. 1.)
    MD029: { style: 'ordered' },

    // Allow inline HTML
    MD033: false,
  },
};
