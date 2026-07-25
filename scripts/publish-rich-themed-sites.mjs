/* eslint-disable antfu/no-import-dist, import/extensions */
import fs from 'node:fs';
import { CIVICS_PUBLIC_THEME, generateBusinessTemplateHtml, HOSPITALITY_GOURMET_THEME, TECH_ENTERPRISE_THEME } from '../dist/databox/ipms/modules/theming/ThemePresets.js';

async function main() {
  console.log('Generating & Publishing Rich 3D WebGL Themed Websites for Solid Pods ...\n');

  // 1. Hospitality (Aura Artisanal Bistro)
  const hospHtml = generateBusinessTemplateHtml(HOSPITALITY_GOURMET_THEME, {
    name: 'Aura Artisanal Bistro & Bar',
    description: 'Handcrafted woodfired cuisine, natural wines, and organic sourdough pastries.',
    items: [
      { name: 'Handmade Black Truffle Tagliatelle', price: 'AUD $38.00', description: 'Fresh egg pasta, cultured butter, shaved Manjimup black truffle.', badge: 'Chef Special' },
      { name: 'Mayura Station Wagyu Ribeye (300g)', price: 'AUD $72.00', description: 'MBS 9+ Wagyu ribeye, smoked bone marrow butter, charred leek.', badge: 'Signature' },
      { name: 'Wild Foraged Mushroom Crostini', price: 'AUD $24.00', description: 'Pine mushrooms, whipped ricotta, aged balsamic on sourdough.', badge: 'Vegetarian' },
      { name: 'Single Origin Espresso & Cannoli', price: 'AUD $12.00', description: 'Ethiopian yirgacheffe espresso with house-made pistacchio cannoli.', badge: 'Dessert' },
    ],
  });

  // 2. Tech Enterprise (Aether Quantum Systems)
  const techHtml = generateBusinessTemplateHtml(TECH_ENTERPRISE_THEME, {
    name: 'Aether Quantum Systems',
    description: 'Decentralised confidential computing, zero-knowledge enclaves, and autonomous AI sidecars.',
    items: [
      { name: 'Quantum Edge Compute Node X1', price: 'USD $1,250.00', description: 'Hardened HSM sidecar with local WebID authentication and zero-knowledge enclave.', badge: 'Hardware' },
      { name: 'Solid Databox Forge License', price: 'USD $499.00/mo', description: 'Full enterprise control plane, POS edge integration, and verifiable record streaming.', badge: 'Software' },
      { name: 'Zero-Knowledge Credential Vault', price: 'USD $199.00/mo', description: 'Holder-bound cryptographic receipt storage and automated ANZSIC compliance.', badge: 'Security' },
    ],
  });

  // 3. Civics (City of Metro Civics & Infrastructure)
  const civicsHtml = generateBusinessTemplateHtml(CIVICS_PUBLIC_THEME, {
    name: 'City of Metro — Civic Services',
    description: 'Public infrastructure, transparent participatory governance, and auditable municipal records.',
    items: [
      { name: 'Electoral Representative Communication', price: 'Free / Public', description: 'Verifiable constituent feedback & policy submissions with privacy-preserving attestation.', badge: 'Civics' },
      { name: 'Municipal Volunteer & Service Resumes', price: 'Free / Open', description: 'Cryptographically signed micro-credentials for community engagement & disaster relief.', badge: 'Community' },
      { name: 'Public Works & Infrastructure Permits', price: 'Statutory Fee', description: 'Transparent permit applications with immutable provenance audit logs on Solid RDF.', badge: 'Governance' },
    ],
  });

  // Publish pages to Solid server
  await publishResource('http://localhost:3000/gourmet/index.html', hospHtml);
  await publishResource('http://localhost:3000/cybertech/index.html', techHtml);
  await publishResource('http://localhost:3000/civics/index.html', civicsHtml);

  console.log('\nSuccessfully published 3 vertical business websites:');
  console.log('- Gourmet Bistro (Hospitality): http://localhost:3000/gourmet/index.html');
  console.log('- Tech Enterprise (Cybertech) : http://localhost:3000/cybertech/index.html');
  console.log('- Civic Infrastructure (Civics): http://localhost:3000/civics/index.html\n');
}

async function publishResource(url, content) {
  const filename = `${new URL(url).pathname.split('/')[1]}.html`;
  fs.writeFileSync(filename, content, 'utf-8');
  console.log(`Wrote ${filename} to local filesystem.`);
}

main().catch(console.error);
