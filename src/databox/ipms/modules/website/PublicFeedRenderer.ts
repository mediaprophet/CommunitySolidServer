/* eslint-disable max-len */
import type { Quad, Term } from '@rdfjs/types';
import { DataFactory, Parser } from 'n3';
import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';
import { IPMS, RDF } from '../../../../util/Vocabularies';
import type { SolidModuleManifest } from '../../SolidModuleManifest';

// JSON-LD keywords as constants so they can be used as computed keys (the linter's naming
// convention forbids `@`-prefixed object-literal property names).
const LD_CONTEXT = '@context';
const LD_TYPE = '@type';
const LD_ID = '@id';
const LD_VOCAB = '@vocab';
const SCHEMA = 'https://schema.org/';
const HTML_CONTENT_TYPE = 'text/html; charset=utf-8';
const JSON_LD_CONTENT_TYPE = 'application/ld+json; charset=utf-8';
const DEFAULT_PUBLIC_PATH = '/';
const CONTROL_PLANE_PATH = '/.databox/ipms';
const HEADER_CONTENT_TYPE = 'content-type';
const HEADER_CACHE_CONTROL = 'cache-control';
const HEADER_VARY = 'vary';

export const WEBSITE_SEO_MODULE_MANIFEST: SolidModuleManifest = {
  id: 'website-seo',
  name: 'Website SEO and Public Feed',
  version: '0.1.0',
  description:
    'Public schema.org HTML and JSON-LD rendering from ordinary Solid RDF business, catalogue, and menu state.',
  capabilities: [
    'ipms:website-seo',
    'ipms:public-feed-render',
    'ipms:portable-core-schema-org-rdf',
    'ipms:standard-solid-rdf-input',
    'ipms:css-enhanced-public-preview-route',
    'ipms:css-enhanced-public-publish-route',
  ],
  routes: [
    'POST /.databox/ipms/website/preview',
    'POST /.databox/ipms/website/publish',
  ],
  configShape: `${IPMS.namespace}WebsiteSeoConfigShape`,
};

const TERMS = {
  localBusiness: namedNode(`${SCHEMA}LocalBusiness`),
  product: namedNode(`${SCHEMA}Product`),
  menu: namedNode(`${SCHEMA}Menu`),
  name: namedNode(`${SCHEMA}name`),
  url: namedNode(`${SCHEMA}url`),
  description: namedNode(`${SCHEMA}description`),
  telephone: namedNode(`${SCHEMA}telephone`),
  address: namedNode(`${SCHEMA}address`),
  openingHours: namedNode(`${SCHEMA}openingHours`),
  sku: namedNode(`${SCHEMA}sku`),
  image: namedNode(`${SCHEMA}image`),
  offers: namedNode(`${SCHEMA}offers`),
  price: namedNode(`${SCHEMA}price`),
  priceCurrency: namedNode(`${SCHEMA}priceCurrency`),
  availability: namedNode(`${SCHEMA}availability`),
  hasMenuSection: namedNode(`${SCHEMA}hasMenuSection`),
  hasMenuItem: namedNode(`${SCHEMA}hasMenuItem`),
};

export interface PublicLocalBusinessInput {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly description?: string;
  readonly telephone?: string;
  readonly address?: string;
  readonly openingHours?: readonly string[];
}

export interface PublicCatalogueItemInput {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly sku?: string;
  readonly image?: string;
  readonly price?: number;
  readonly currency?: string;
  readonly availability?: string;
}

export interface PublicMenuItemInput {
  readonly name: string;
  readonly description?: string;
  readonly price: number;
  readonly currency: string;
}

export interface PublicMenuSectionInput {
  readonly name: string;
  readonly items: readonly PublicMenuItemInput[];
}

export interface PublicMenuInput {
  readonly id: string;
  readonly name: string;
  readonly sections: readonly PublicMenuSectionInput[];
}

export interface PublicWebsiteFeedInput {
  readonly business: PublicLocalBusinessInput;
  readonly catalogue?: readonly PublicCatalogueItemInput[];
  readonly menus?: readonly PublicMenuInput[];
  readonly generatedAt?: string;
  /** Public route this render is intended for. Must not live under the IPMS control plane. */
  readonly publicPath?: string;
  readonly cacheMaxAgeSeconds?: number;
  readonly themeCss?: PublicWebsiteFeedThemeCssInput;
}

export interface PublicWebsiteFeedRdfInput {
  readonly turtle: string;
  readonly baseIri?: string;
  readonly generatedAt?: string;
  readonly publicPath?: string;
  readonly cacheMaxAgeSeconds?: number;
  readonly themeCss?: PublicWebsiteFeedThemeCssInput;
}

export interface PublicWebsiteFeedPreviewInput {
  readonly state: {
    readonly contentType: 'text/turtle';
    readonly turtle: string;
    readonly baseIri?: string;
  };
  readonly generatedAt?: string;
  readonly publicPath?: string;
  readonly cacheMaxAgeSeconds?: number;
  readonly themeCss?: PublicWebsiteFeedThemeCssInput;
}

export type PublicFeedHeaders = Readonly<
  Record<typeof HEADER_CONTENT_TYPE | typeof HEADER_CACHE_CONTROL | typeof HEADER_VARY, string>
>;

export interface PublicWebsiteFeedThemeCssInput {
  readonly css: string;
  /** Public CSS route to link from the generated HTML. Must not live under the IPMS control plane. */
  readonly publicPath?: string;
  readonly cacheMaxAgeSeconds?: number;
}

export interface PublicWebsiteFeedThemeCssAsset {
  readonly publicPath: string;
  readonly css: string;
  readonly headers: PublicFeedHeaders;
}

export interface PublicWebsiteFeedRender {
  readonly publicPath: string;
  readonly controlPlanePath: typeof CONTROL_PLANE_PATH;
  readonly requiresControlToken: false;
  readonly jsonLd: Record<string, unknown>;
  readonly html: string;
  readonly headers: PublicFeedHeaders;
  readonly jsonLdHeaders: PublicFeedHeaders;
  readonly themeCss?: PublicWebsiteFeedThemeCssAsset;
}

/**
 * Render cacheable public website/feed output from typed IPMS module state.
 *
 * The render is intentionally pure: it emits schema.org JSON-LD and semantic HTML only. It does not depend on
 * CSS control-plane tokens, design tokens, or any Databox-only protocol surface, so it can be wrapped by a
 * public route on CSS or by a standard Solid client reading the same RDF state.
 */
export function renderPublicWebsiteFeed(input: PublicWebsiteFeedInput): PublicWebsiteFeedRender {
  const checked = validateInput(input);
  const jsonLd = buildPublicJsonLd(checked);
  return {
    publicPath: checked.publicPath,
    controlPlanePath: CONTROL_PLANE_PATH,
    requiresControlToken: false,
    jsonLd,
    html: renderHtml(checked, jsonLd),
    headers: htmlHeaders(checked.cacheMaxAgeSeconds),
    jsonLdHeaders: jsonLdHeaders(checked.cacheMaxAgeSeconds),
    ...checked.themeCss === undefined ? {} : { themeCss: checked.themeCss },
  };
}

/**
 * Render the same public output from portable schema.org Turtle stored in ordinary Solid resources.
 */
export function renderPublicWebsiteFeedFromRdf(input: PublicWebsiteFeedRdfInput): PublicWebsiteFeedRender {
  let quads: Quad[];
  try {
    quads = new Parser({ baseIRI: input.baseIri }).parse(input.turtle);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new BadRequestHttpError(`Public website feed RDF could not be parsed: ${message}`);
  }

  return renderPublicWebsiteFeed({
    business: parseBusiness(quads),
    catalogue: parseCatalogue(quads),
    menus: parseMenus(quads),
    generatedAt: input.generatedAt,
    publicPath: input.publicPath,
    cacheMaxAgeSeconds: input.cacheMaxAgeSeconds,
    themeCss: input.themeCss,
  });
}

/**
 * CSS-enhanced preview wrapper for the portable renderer.
 *
 * The request shape mirrors Solid resource state: a Turtle document plus its optional base IRI. The output is still
 * pure public HTML/JSON-LD, so a standard Solid client can get the same result by reading the Turtle resource and
 * calling {@link renderPublicWebsiteFeedFromRdf} directly.
 */
export function renderPublicWebsiteFeedPreview(input: unknown): PublicWebsiteFeedRender {
  const request = requireRecord(input, 'A public website feed preview request');
  const state = requireRecord(request.state, 'A public website feed preview state');
  const contentType = requireString(state.contentType, 'A public website feed preview state contentType');
  if (contentType !== 'text/turtle') {
    throw new BadRequestHttpError('A public website feed preview state contentType must be text/turtle.');
  }
  return renderPublicWebsiteFeedFromRdf({
    turtle: requireString(state.turtle, 'A public website feed preview state turtle'),
    ...optionalString(state.baseIri, 'baseIri', 'A public website feed preview state baseIri'),
    ...optionalString(request.generatedAt, 'generatedAt', 'A public website feed preview generatedAt'),
    ...optionalString(request.publicPath, 'publicPath', 'A public website feed preview publicPath'),
    ...optionalNumber(
      request.cacheMaxAgeSeconds,
      'cacheMaxAgeSeconds',
      'A public website feed preview cacheMaxAgeSeconds',
    ),
    ...optionalThemeCss(request.themeCss),
  });
}

function validateInput(input: PublicWebsiteFeedInput): Required<
  Pick<PublicWebsiteFeedInput, 'business' | 'catalogue' | 'menus' | 'publicPath' | 'cacheMaxAgeSeconds'>
> & Pick<PublicWebsiteFeedInput, 'generatedAt'> & { readonly themeCss?: PublicWebsiteFeedThemeCssAsset } {
  const publicPath = validatePublicPath(input.publicPath ?? DEFAULT_PUBLIC_PATH);
  const cacheMaxAgeSeconds = validateCacheMaxAge(input.cacheMaxAgeSeconds ?? 300);
  const checked = {
    business: validateBusiness(input.business),
    catalogue: (input.catalogue ?? []).map(validateCatalogueItem),
    menus: (input.menus ?? []).map(validateMenu),
    publicPath,
    cacheMaxAgeSeconds,
    ...input.generatedAt === undefined ? {} : { generatedAt: requireIsoDate(input.generatedAt, 'generatedAt') },
    ...input.themeCss === undefined ? {} : { themeCss: validateThemeCss(input.themeCss) },
  };
  if (checked.catalogue.length === 0 && checked.menus.length === 0) {
    throw new BadRequestHttpError('A public website feed needs catalogue or menu content.');
  }
  return checked;
}

function buildPublicJsonLd(
  input: ReturnType<typeof validateInput>,
): Record<string, unknown> {
  const catalogue = buildCatalogueJsonLd(input.catalogue);
  const menus = input.menus.map(buildMenuJsonLd);
  const business = buildBusinessJsonLd(input.business, menus, input.catalogue);
  const hasPart = [
    ...catalogue === undefined ? [] : [ catalogue ],
    ...menus,
  ];
  return {
    [LD_CONTEXT]: {
      [LD_VOCAB]: SCHEMA,
      odrl: 'http://www.w3.org/ns/odrl/2/',
    },
    [LD_TYPE]: 'WebPage',
    [LD_ID]: input.business.url,
    url: input.business.url,
    name: input.business.name,
    ...input.generatedAt === undefined ? {} : { dateModified: input.generatedAt },
    'odrl:hasPolicy': {
      '@type': 'odrl:Set',
      'odrl:permission': [{
        'odrl:action': 'odrl:read',
        'odrl:assigner': { '@id': input.business.id },
      }],
      'odrl:prohibition': [{
        'odrl:action': 'odrl:commercialize',
        'odrl:assigner': { '@id': input.business.id },
      }],
    },
    mainEntity: business,
    hasPart,
  };
}

function buildBusinessJsonLd(
  business: PublicLocalBusinessInput,
  menus: readonly Record<string, unknown>[],
  catalogue: readonly PublicCatalogueItemInput[],
): Record<string, unknown> {
  const catalogueOffers = catalogue
    .filter((item): boolean => item.price !== undefined)
    .map((item): Record<string, unknown> => ({
      [LD_TYPE]: 'Offer',
      price: item.price?.toFixed(2),
      priceCurrency: item.currency,
      itemOffered: { [LD_ID]: item.id },
    }));
  return {
    [LD_TYPE]: 'LocalBusiness',
    [LD_ID]: business.id,
    name: business.name,
    url: business.url,
    ...business.description === undefined ? {} : { description: business.description },
    ...business.telephone === undefined ? {} : { telephone: business.telephone },
    ...business.address === undefined ? {} : { address: business.address },
    ...business.openingHours === undefined ? {} : { openingHours: business.openingHours },
    ...menus.length === 0 ? {} : { hasMenu: menus.map((menu): Record<string, unknown> => ({ [LD_ID]: menu[LD_ID] })) },
    ...catalogueOffers.length === 0 ? {} : { makesOffer: catalogueOffers },
  };
}

function buildCatalogueJsonLd(catalogue: readonly PublicCatalogueItemInput[]): Record<string, unknown> | undefined {
  if (catalogue.length === 0) {
    return;
  }
  return {
    [LD_TYPE]: 'ItemList',
    name: 'Catalogue',
    itemListElement: catalogue.map((item, index): Record<string, unknown> => ({
      [LD_TYPE]: 'ListItem',
      position: index + 1,
      item: buildProductJsonLd(item),
    })),
  };
}

function buildProductJsonLd(item: PublicCatalogueItemInput): Record<string, unknown> {
  return {
    [LD_TYPE]: 'Product',
    [LD_ID]: item.id,
    name: item.name,
    ...item.description === undefined ? {} : { description: item.description },
    ...item.sku === undefined ? {} : { sku: item.sku },
    ...item.image === undefined ? {} : { image: item.image },
    ...item.price === undefined ?
        {} :
        {
          offers: {
            [LD_TYPE]: 'Offer',
            price: item.price.toFixed(2),
            priceCurrency: item.currency,
            ...item.availability === undefined ? {} : { availability: item.availability },
          },
        },
  };
}

function buildMenuJsonLd(menu: PublicMenuInput): Record<string, unknown> {
  return {
    [LD_TYPE]: 'Menu',
    [LD_ID]: menu.id,
    name: menu.name,
    hasMenuSection: menu.sections.map((section): Record<string, unknown> => ({
      [LD_TYPE]: 'MenuSection',
      name: section.name,
      hasMenuItem: section.items.map((item): Record<string, unknown> => ({
        [LD_TYPE]: 'MenuItem',
        name: item.name,
        ...item.description === undefined ? {} : { description: item.description },
        offers: {
          [LD_TYPE]: 'Offer',
          price: item.price.toFixed(2),
          priceCurrency: item.currency,
        },
      })),
    })),
  };
}

function renderHtml(input: ReturnType<typeof validateInput>, jsonLd: Record<string, unknown>): string {
  const catalogue = input.catalogue.map((item): string => {
    let price = '';
    if (item.price !== undefined) {
      price = `<data class="price" value="${item.price.toFixed(2)}">${
        escapeHtml(item.currency ?? '')
      } ${item.price.toFixed(2)}</data>`;
    }
    return `<li class="card">
      <div class="card-header">
        <h3>${escapeHtml(item.name)}</h3>
        ${price}
      </div>
      ${item.description ? `<p class="desc">${escapeHtml(item.description)}</p>` : ''}
    </li>`;
  }).join('');

  const menus = input.menus.map((menu): string => `<section class="section"><h2>${escapeHtml(menu.name)}</h2>${
    menu.sections.map((section): string => `<section class="subsection"><h3>${escapeHtml(section.name)}</h3><ul class="grid">${
      section.items.map((item): string => `<li class="card">
        <div class="card-header">
          <h3>${escapeHtml(item.name)}</h3>
          <data class="price" value="${item.price.toFixed(2)}">${escapeHtml(item.currency)} ${item.price.toFixed(2)}</data>
        </div>
        ${item.description ? `<p class="desc">${escapeHtml(item.description)}</p>` : ''}
      </li>`).join('')
    }</ul></section>`).join('')
  }</section>`).join('');

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(input.business.name)}</title>`,
    `<link rel="canonical" href="${escapeHtml(input.business.url)}">`,
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    '<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">',
    '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>',
    ...input.themeCss === undefined ?
        [] :
        [ `<link rel="stylesheet" href="${escapeHtml(input.themeCss.publicPath)}">` ],
    '<style>',
    ':root {',
    '  --bg-base: #090d16;',
    '  --bg-surface: rgba(17, 24, 39, 0.75);',
    '  --text-primary: #f8fafc;',
    '  --text-secondary: #94a3b8;',
    '  --accent: #fbbf24;',
    '  --accent-glow: rgba(251, 191, 36, 0.4);',
    '  --border: rgba(255, 255, 255, 0.1);',
    '}',
    '* { box-sizing: border-box; margin: 0; padding: 0; }',
    'body { font-family: "Outfit", sans-serif; background: var(--bg-base); color: var(--text-primary); min-height: 100vh; line-height: 1.6; position: relative; overflow-x: hidden; }',
    '#webgl-canvas { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 0; pointer-events: none; }',
    'main { position: relative; z-index: 1; max-width: 1000px; margin: 0 auto; padding: 4rem 2rem; }',
    'header { text-align: center; margin-bottom: 3.5rem; background: var(--bg-surface); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); border: 1px solid var(--border); border-radius: 24px; padding: 3.5rem 2rem; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.6); position: relative; overflow: hidden; }',
    'header::before { content: ""; position: absolute; top: 0; left: 0; right: 0; height: 2px; background: linear-gradient(90deg, transparent, var(--accent), transparent); }',
    'h1 { font-size: 3.25rem; font-weight: 800; letter-spacing: -0.03em; margin-bottom: 0.75rem; background: linear-gradient(to right, #ffffff, #fcd34d); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }',
    'header p { font-size: 1.35rem; color: var(--text-secondary); max-width: 700px; margin: 0 auto; font-weight: 300; }',
    'section h2 { font-size: 2rem; font-weight: 700; color: var(--accent); margin-bottom: 1.75rem; letter-spacing: -0.02em; }',
    'section h3 { font-size: 1.4rem; font-weight: 600; color: var(--text-primary); margin-bottom: 1rem; }',
    'ul { list-style: none; display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.75rem; margin-bottom: 3rem; }',
    '.card { background: var(--bg-surface); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border: 1px solid var(--border); border-radius: 18px; padding: 1.75rem 2rem; transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); box-shadow: 0 10px 30px rgba(0,0,0,0.4); }',
    '.card:hover { transform: translateY(-6px) scale(1.02); border-color: rgba(251, 191, 36, 0.4); box-shadow: 0 20px 40px rgba(0,0,0,0.6), 0 0 25px var(--accent-glow); }',
    '.card-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.5rem; }',
    '.card h3 { font-size: 1.35rem; font-weight: 700; color: var(--text-primary); margin: 0; }',
    '.price { font-size: 1.25rem; font-weight: 800; color: var(--accent); font-family: "JetBrains Mono", monospace; }',
    '.desc { color: var(--text-secondary); font-size: 0.98rem; line-height: 1.5; }',
    'footer { text-align: center; margin-top: 4rem; padding-top: 2rem; border-top: 1px solid var(--border); color: var(--text-secondary); font-size: 0.95rem; }',
    '</style>',
    `<script type="application/ld+json">${escapeJsonForScript(jsonLd)}</script>`,
    '</head>',
    '<body>',
    '<canvas id="webgl-canvas"></canvas>',
    '<main>',
    '<header>',
    `<h1>${escapeHtml(input.business.name)}</h1>`,
    ...input.business.description === undefined ? [] : [ `<p>${escapeHtml(input.business.description)}</p>` ],
    '</header>',
    ...catalogue.length === 0 ? [] : [ `<section><h2>Catalogue</h2><ul>${catalogue}</ul></section>` ],
    menus,
    '<footer><p>Powered by <strong>Solid Databox IPMS</strong> — Decentralised & Secure</p></footer>',
    '</main>',
    '<script>',
    '(function() {',
    '  const canvas = document.getElementById("webgl-canvas");',
    '  if (!canvas || typeof THREE === "undefined") return;',
    '  const scene = new THREE.Scene();',
    '  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);',
    '  const renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });',
    '  renderer.setSize(window.innerWidth, window.innerHeight);',
    '  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));',
    '  const count = 160;',
    '  const geometry = new THREE.BufferGeometry();',
    '  const positions = new Float32Array(count * 3);',
    '  for (let i = 0; i < count * 3; i += 3) {',
    '    positions[i] = (Math.random() - 0.5) * 16;',
    '    positions[i + 1] = (Math.random() - 0.5) * 16;',
    '    positions[i + 2] = (Math.random() - 0.5) * 16;',
    '  }',
    '  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));',
    '  const material = new THREE.PointsMaterial({ color: 0xfbbf24, size: 0.1, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending });',
    '  const particles = new THREE.Points(geometry, material);',
    '  scene.add(particles);',
    '  const geoMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(2.5, 1), new THREE.MeshBasicMaterial({ color: 0xd97706, wireframe: true, transparent: true, opacity: 0.12 }));',
    '  scene.add(geoMesh);',
    '  camera.position.z = 6;',
    '  let mouseX = 0, mouseY = 0;',
    '  window.addEventListener("mousemove", (e) => { mouseX = (e.clientX / window.innerWidth - 0.5) * 0.5; mouseY = (e.clientY / window.innerHeight - 0.5) * 0.5; });',
    '  window.addEventListener("resize", () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });',
    '  function animate() { requestAnimationFrame(animate); particles.rotation.y += 0.0012; particles.rotation.x += 0.0006; geoMesh.rotation.y += 0.0025; camera.position.x += (mouseX - camera.position.x) * 0.05; camera.position.y += (-mouseY - camera.position.y) * 0.05; camera.lookAt(scene.position); renderer.render(scene, camera); }',
    '  animate();',
    '})();',
    '</script>',
    '</body>',
    '</html>',
  ].join('');
}

function htmlHeaders(maxAge: number): PublicFeedHeaders {
  return {
    [HEADER_CONTENT_TYPE]: HTML_CONTENT_TYPE,
    [HEADER_CACHE_CONTROL]: `public, max-age=${maxAge}, stale-while-revalidate=86400`,
    [HEADER_VARY]: 'accept',
  };
}

function jsonLdHeaders(maxAge: number): PublicFeedHeaders {
  return {
    [HEADER_CONTENT_TYPE]: JSON_LD_CONTENT_TYPE,
    [HEADER_CACHE_CONTROL]: `public, max-age=${maxAge}, stale-while-revalidate=86400`,
    [HEADER_VARY]: 'accept',
  };
}

function validateThemeCss(input: PublicWebsiteFeedThemeCssInput): PublicWebsiteFeedThemeCssAsset {
  return {
    publicPath: validatePublicPath(input.publicPath ?? '/theme.css'),
    css: requireNonBlank(input.css, 'A public website feed theme CSS asset'),
    headers: cssHeaders(validateCacheMaxAge(input.cacheMaxAgeSeconds ?? 3_600)),
  };
}

function cssHeaders(maxAge: number): PublicFeedHeaders {
  return {
    [HEADER_CONTENT_TYPE]: 'text/css; charset=utf-8',
    [HEADER_CACHE_CONTROL]: `public, max-age=${maxAge}, stale-while-revalidate=86400`,
    [HEADER_VARY]: 'accept',
  };
}

function parseBusiness(quads: readonly Quad[]): PublicLocalBusinessInput {
  const subjects = subjectsWithType(quads, TERMS.localBusiness);
  if (subjects.length === 0) {
    throw new BadRequestHttpError('Public website feed RDF needs one schema:LocalBusiness.');
  }
  if (subjects.length > 1) {
    throw new BadRequestHttpError('Public website feed RDF must contain exactly one schema:LocalBusiness.');
  }
  const subject = subjects[0];
  return {
    id: subject.value,
    name: requiredLiteral(quads, subject, TERMS.name, 'local business name'),
    url: requiredIriOrLiteral(quads, subject, TERMS.url, 'local business url'),
    ...optionalLiteral(quads, subject, TERMS.description, 'description', 'local business description'),
    ...optionalLiteral(quads, subject, TERMS.telephone, 'telephone', 'local business telephone'),
    ...optionalLiteral(quads, subject, TERMS.address, 'address', 'local business address'),
    ...optionalLiteralList(quads, subject, TERMS.openingHours, 'openingHours'),
  };
}

function parseCatalogue(quads: readonly Quad[]): PublicCatalogueItemInput[] {
  return subjectsWithType(quads, TERMS.product)
    .map((subject): PublicCatalogueItemInput => {
      const offer = firstObject(quads, subject, TERMS.offers);
      return {
        id: subject.value,
        name: requiredLiteral(quads, subject, TERMS.name, 'product name'),
        ...optionalLiteral(quads, subject, TERMS.description, 'description', 'product description'),
        ...optionalLiteral(quads, subject, TERMS.sku, 'sku', 'sku'),
        ...optionalIriOrLiteral(quads, subject, TERMS.image, 'image', 'image'),
        ...offer === undefined ? {} : parseOffer(quads, offer),
      };
    })
    .sort((left, right): number => left.id.localeCompare(right.id));
}

function parseMenus(quads: readonly Quad[]): PublicMenuInput[] {
  return subjectsWithType(quads, TERMS.menu)
    .map((subject): PublicMenuInput => ({
      id: subject.value,
      name: requiredLiteral(quads, subject, TERMS.name, 'menu name'),
      sections: objects(quads, subject, TERMS.hasMenuSection).map((section): PublicMenuSectionInput => ({
        name: requiredLiteral(quads, section, TERMS.name, 'menu section name'),
        items: objects(quads, section, TERMS.hasMenuItem).map((item): PublicMenuItemInput => ({
          name: requiredLiteral(quads, item, TERMS.name, 'menu item name'),
          ...optionalLiteral(quads, item, TERMS.description, 'description', 'menu item description'),
          ...parseOffer(quads, requiredObject(quads, item, TERMS.offers, 'menu item offer')),
        })),
      })),
    }))
    .sort((left, right): number => left.id.localeCompare(right.id));
}

function parseOffer(
  quads: readonly Quad[],
  subject: Term,
): { readonly price: number; readonly currency: string; readonly availability?: string } {
  return {
    price: Number(requiredLiteral(quads, subject, TERMS.price, 'offer price')),
    currency: requiredLiteral(quads, subject, TERMS.priceCurrency, 'offer price currency'),
    ...optionalIriOrLiteral(quads, subject, TERMS.availability, 'availability', 'availability'),
  };
}

function validateBusiness(input: PublicLocalBusinessInput): PublicLocalBusinessInput {
  return {
    id: requireAbsoluteUri(input.id, 'A public local business id'),
    name: requireTrimmed(input.name, 'A public local business name'),
    url: requireAbsoluteUri(input.url, 'A public local business url'),
    ...input.description === undefined ?
        {} :
        { description: requireTrimmed(input.description, 'A public local business description') },
    ...input.telephone === undefined ?
        {} :
        { telephone: requireTrimmed(input.telephone, 'A public local business telephone') },
    ...input.address === undefined ?
        {} :
        { address: requireTrimmed(input.address, 'A public local business address') },
    ...input.openingHours === undefined ?
        {} :
        {
          openingHours: input.openingHours.map((value): string =>
            requireTrimmed(value, 'A public local business openingHours value')),
        },
  };
}

function validateCatalogueItem(input: PublicCatalogueItemInput): PublicCatalogueItemInput {
  const hasPrice = input.price !== undefined;
  if (hasPrice !== (input.currency !== undefined)) {
    throw new BadRequestHttpError('A public catalogue item price and currency must be supplied together.');
  }
  return {
    id: requireAbsoluteUri(input.id, 'A public catalogue item id'),
    name: requireTrimmed(input.name, 'A public catalogue item name'),
    ...input.description === undefined ?
        {} :
        { description: requireTrimmed(input.description, 'A public catalogue item description') },
    ...input.sku === undefined ? {} : { sku: requireTrimmed(input.sku, 'A public catalogue item sku') },
    ...input.image === undefined ?
        {} :
        { image: requireAbsoluteUri(input.image, 'A public catalogue item image') },
    ...input.price === undefined ?
        {} :
        {
          price: requireMoney(input.price, 'A public catalogue item price'),
          currency: requireCurrency(input.currency, 'A public catalogue item currency'),
        },
    ...input.availability === undefined ?
        {} :
        { availability: requireAbsoluteUri(input.availability, 'A public catalogue item availability') },
  };
}

function validateMenu(input: PublicMenuInput): PublicMenuInput {
  if (input.sections.length === 0) {
    throw new BadRequestHttpError('A public menu needs at least one section.');
  }
  return {
    id: requireAbsoluteUri(input.id, 'A public menu id'),
    name: requireTrimmed(input.name, 'A public menu name'),
    sections: input.sections.map((section): PublicMenuSectionInput => {
      if (section.items.length === 0) {
        throw new BadRequestHttpError('A public menu section needs at least one item.');
      }
      return {
        name: requireTrimmed(section.name, 'A public menu section name'),
        items: section.items.map(validateMenuItem),
      };
    }),
  };
}

function validateMenuItem(input: PublicMenuItemInput): PublicMenuItemInput {
  return {
    name: requireTrimmed(input.name, 'A public menu item name'),
    ...input.description === undefined ?
        {} :
        { description: requireTrimmed(input.description, 'A public menu item description') },
    price: requireMoney(input.price, 'A public menu item price'),
    currency: requireCurrency(input.currency, 'A public menu item currency'),
  };
}

function validatePublicPath(value: string): string {
  if (!value.startsWith('/')) {
    throw new BadRequestHttpError('A public website feed path must start with /.');
  }
  if (value === CONTROL_PLANE_PATH || value.startsWith(`${CONTROL_PLANE_PATH}/`)) {
    throw new BadRequestHttpError('A public website feed path must not be under the protected IPMS control plane.');
  }
  return value;
}

function validateCacheMaxAge(value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new BadRequestHttpError('A public website feed cache max-age must be a non-negative integer.');
  }
  return value;
}

function requireAbsoluteUri(value: unknown, field: string): string {
  const checked = requireTrimmed(value, field);
  if (!URL.canParse(checked)) {
    throw new BadRequestHttpError(`${field} must be an absolute URI.`);
  }
  return new URL(checked).href;
}

function requireTrimmed(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestHttpError(`${field} must be a non-empty string.`);
  }
  return value.trim();
}

function requireNonBlank(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestHttpError(`${field} must be a non-empty string.`);
  }
  return value;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new BadRequestHttpError(`${field} must be a non-empty string.`);
  }
  return value;
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new BadRequestHttpError(`${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function optionalString<T extends string>(
  value: unknown,
  property: T,
  field: string,
): Record<T, string> | Record<string, never> {
  if (value === undefined) {
    return {};
  }
  return { [property]: requireString(value, field) } as Record<T, string>;
}

function optionalNumber<T extends string>(
  value: unknown,
  property: T,
  field: string,
): Record<T, number> | Record<string, never> {
  if (value === undefined) {
    return {};
  }
  if (typeof value !== 'number') {
    throw new BadRequestHttpError(`${field} must be a number.`);
  }
  return { [property]: value } as Record<T, number>;
}

function optionalThemeCss(value: unknown): Pick<PublicWebsiteFeedRdfInput, 'themeCss'> | Record<string, never> {
  if (value === undefined) {
    return {};
  }
  const themeCss = requireRecord(value, 'A public website feed preview themeCss');
  return {
    themeCss: {
      css: requireString(themeCss.css, 'A public website feed preview themeCss css'),
      ...optionalString(themeCss.publicPath, 'publicPath', 'A public website feed preview themeCss publicPath'),
      ...optionalNumber(
        themeCss.cacheMaxAgeSeconds,
        'cacheMaxAgeSeconds',
        'A public website feed preview themeCss cacheMaxAgeSeconds',
      ),
    },
  };
}

function requireMoney(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new BadRequestHttpError(`${field} must be a non-negative number.`);
  }
  return value;
}

function requireCurrency(value: unknown, field: string): string {
  const checked = requireTrimmed(value, field);
  if (!/^[A-Z]{3}$/u.test(checked)) {
    throw new BadRequestHttpError(`${field} must be an ISO 4217 currency code.`);
  }
  return checked;
}

function requireIsoDate(value: unknown, field: string): string {
  const checked = requireTrimmed(value, `A public website feed ${field}`);
  if (Number.isNaN(Date.parse(checked))) {
    throw new BadRequestHttpError(`A public website feed ${field} must be an ISO date/time.`);
  }
  return checked;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;');
}

function escapeJsonForScript(value: Record<string, unknown>): string {
  return JSON.stringify(value).replaceAll('<', '\\u003C');
}

function subjectsWithType(quads: readonly Quad[], type: Term): Term[] {
  const seen = new Set<string>();
  return quads
    .filter((quad): boolean => termEquals(quad.predicate, RDF.terms.type) && termEquals(quad.object, type))
    .map((quad): Term => quad.subject)
    .filter((subject): boolean => {
      const key = termKey(subject);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

function requiredLiteral(quads: readonly Quad[], subject: Term, predicate: Term, field: string): string {
  const value = requiredObject(quads, subject, predicate, field);
  if (value.termType !== 'Literal') {
    throw new BadRequestHttpError(`Public website feed RDF ${field} must be a literal.`);
  }
  return value.value;
}

function requiredIriOrLiteral(quads: readonly Quad[], subject: Term, predicate: Term, field: string): string {
  const value = requiredObject(quads, subject, predicate, field);
  if (value.termType !== 'NamedNode' && value.termType !== 'Literal') {
    throw new BadRequestHttpError(`Public website feed RDF ${field} must be an IRI or literal.`);
  }
  return value.value;
}

function requiredObject(quads: readonly Quad[], subject: Term, predicate: Term, field: string): Term {
  const values = objects(quads, subject, predicate);
  if (values.length === 0) {
    throw new BadRequestHttpError(`Public website feed RDF ${field} is required.`);
  }
  if (values.length > 1) {
    throw new BadRequestHttpError(`Public website feed RDF ${field} must have exactly one value.`);
  }
  return values[0];
}

function optionalLiteral(
  quads: readonly Quad[],
  subject: Term,
  predicate: Term,
  field: keyof PublicLocalBusinessInput | keyof PublicCatalogueItemInput | keyof PublicMenuItemInput,
  label: string,
): Record<string, string> {
  const value = optionalObject(quads, subject, predicate, label);
  if (value === undefined) {
    return {};
  }
  if (value.termType !== 'Literal') {
    throw new BadRequestHttpError(`Public website feed RDF ${label} must be a literal.`);
  }
  return { [field]: value.value };
}

function optionalIriOrLiteral(
  quads: readonly Quad[],
  subject: Term,
  predicate: Term,
  field: keyof PublicCatalogueItemInput,
  label: string,
): Record<string, string> {
  const value = optionalObject(quads, subject, predicate, label);
  if (value === undefined) {
    return {};
  }
  if (value.termType !== 'NamedNode' && value.termType !== 'Literal') {
    throw new BadRequestHttpError(`Public website feed RDF ${label} must be an IRI or literal.`);
  }
  return { [field]: value.value };
}

function optionalLiteralList(
  quads: readonly Quad[],
  subject: Term,
  predicate: Term,
  field: 'openingHours',
): Pick<PublicLocalBusinessInput, 'openingHours'> | Record<string, never> {
  const values = objects(quads, subject, predicate);
  if (values.length === 0) {
    return {};
  }
  return {
    [field]: values.map((value): string => {
      if (value.termType !== 'Literal') {
        throw new BadRequestHttpError(`Public website feed RDF ${field} values must be literals.`);
      }
      return value.value;
    }),
  };
}

function optionalObject(quads: readonly Quad[], subject: Term, predicate: Term, field: string): Term | undefined {
  const values = objects(quads, subject, predicate);
  if (values.length > 1) {
    throw new BadRequestHttpError(`Public website feed RDF ${field} must have at most one value.`);
  }
  return values[0];
}

function firstObject(quads: readonly Quad[], subject: Term, predicate: Term): Term | undefined {
  return objects(quads, subject, predicate)[0];
}

function objects(quads: readonly Quad[], subject: Term, predicate: Term): Term[] {
  return quads
    .filter((quad): boolean => termEquals(quad.subject, subject) && termEquals(quad.predicate, predicate))
    .map((quad): Term => quad.object);
}

function termEquals(left: Term, right: Term): boolean {
  return left.termType === right.termType && left.value === right.value;
}

function termKey(term: Term): string {
  return `${term.termType}:${term.value}`;
}

function namedNode(value: string): ReturnType<typeof DataFactory.namedNode> {
  return DataFactory.namedNode(value);
}
