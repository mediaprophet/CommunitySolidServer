/* eslint-disable max-len */
import type { PortableThemePackage } from './Tokens';
import { themeToCss, validateThemePackage } from './Tokens';

export interface BusinessThemePreset {
  readonly id: string;
  readonly name: string;
  readonly category: 'hospitality' | 'tech' | 'civics';
  readonly description: string;
  readonly package: PortableThemePackage;
  readonly css: string;
  readonly templateHtml: (business: { name: string; description: string; items: { name: string; price: string; description?: string }[] }) => string;
}

export const HOSPITALITY_GOURMET_THEME: PortableThemePackage = validateThemePackage({
  type: 'DataboxTheme',
  id: 'hospitality.gourmet',
  name: 'Gourmet Artisanal Dark Gold',
  version: '1.0.0',
  description: 'Warm gold and obsidian glassmorphic theme for artisanal cafes, fine dining, and boutique bakeries.',
  tokens: {
    color: {
      bg: { $type: 'color', $value: '#0c0a09', $description: 'Deep obsidian base' },
      surface: { $type: 'color', $value: 'rgba(28, 25, 23, 0.75)', $description: 'Warm dark glass surface' },
      primary: { $type: 'color', $value: '#d97706', $description: 'Rich amber gold' },
      accent: { $type: 'color', $value: '#fbbf24', $description: 'Bright gold highlight' },
      text: { $type: 'color', $value: '#f5f5f4', $description: 'Primary warm text' },
      textMuted: { $type: 'color', $value: '#a8a29e', $description: 'Muted text' },
      border: { $type: 'color', $value: 'rgba(251, 191, 36, 0.2)', $description: 'Gold glass border' },
    },
    font: {
      heading: { $type: 'fontFamily', $value: '\'Outfit\', sans-serif' },
      body: { $type: 'fontFamily', $value: '\'Outfit\', sans-serif' },
    },
    radius: {
      card: { $type: 'dimension', $value: '20px' },
      btn: { $type: 'dimension', $value: '12px' },
    },
  },
});

export const TECH_ENTERPRISE_THEME: PortableThemePackage = validateThemePackage({
  type: 'DataboxTheme',
  id: 'tech.enterprise',
  name: 'Cybertech Electric Neon',
  version: '1.0.0',
  description: 'High-tech neon cyan and dark space theme for software, AI, and digital infrastructure enterprise.',
  tokens: {
    color: {
      bg: { $type: 'color', $value: '#030712', $description: 'Midnight abyss' },
      surface: { $type: 'color', $value: 'rgba(17, 24, 39, 0.75)', $description: 'Dark cyber surface' },
      primary: { $type: 'color', $value: '#06b6d4', $description: 'Electric cyan' },
      accent: { $type: 'color', $value: '#38bdf8', $description: 'Neon sky blue' },
      text: { $type: 'color', $value: '#f9fafb', $description: 'Primary text' },
      textMuted: { $type: 'color', $value: '#9ca3af', $description: 'Muted text' },
      border: { $type: 'color', $value: 'rgba(6, 182, 212, 0.25)', $description: 'Cyan glass border' },
    },
    font: {
      heading: { $type: 'fontFamily', $value: '\'Outfit\', sans-serif' },
      body: { $type: 'fontFamily', $value: '\'Outfit\', sans-serif' },
    },
    radius: {
      card: { $type: 'dimension', $value: '16px' },
      btn: { $type: 'dimension', $value: '8px' },
    },
  },
});

export const CIVICS_PUBLIC_THEME: PortableThemePackage = validateThemePackage({
  type: 'DataboxTheme',
  id: 'civics.public',
  name: 'Civic Trust Platinum & Navy',
  version: '1.0.0',
  description: 'Sleek platinum and deep royal navy theme for municipal programs, civic transparency, and institutions.',
  tokens: {
    color: {
      bg: { $type: 'color', $value: '#0f172a', $description: 'Royal slate navy' },
      surface: { $type: 'color', $value: 'rgba(30, 41, 59, 0.75)', $description: 'Navy glass panel' },
      primary: { $type: 'color', $value: '#3b82f6', $description: 'Trust royal blue' },
      accent: { $type: 'color', $value: '#93c5fd', $description: 'Platinum blue' },
      text: { $type: 'color', $value: '#f8fafc', $description: 'Bright text' },
      textMuted: { $type: 'color', $value: '#94a3b8', $description: 'Muted slate' },
      border: { $type: 'color', $value: 'rgba(147, 197, 253, 0.2)', $description: 'Platinum glass border' },
    },
    font: {
      heading: { $type: 'fontFamily', $value: '\'Outfit\', sans-serif' },
      body: { $type: 'fontFamily', $value: '\'Outfit\', sans-serif' },
    },
    radius: {
      card: { $type: 'dimension', $value: '18px' },
      btn: { $type: 'dimension', $value: '10px' },
    },
  },
});

export function generateBusinessTemplateHtml(
  theme: PortableThemePackage,
  business: {
    name: string;
    description: string;
    tagline?: string;
    items: { name: string; price: string; description?: string; badge?: string }[];
  },
): string {
  const css = themeToCss(theme);
  const isTech = theme.id.startsWith('tech');
  const isCivic = theme.id.startsWith('civics');
  const accentColor = isTech ? '#06b6d4' : isCivic ? '#3b82f6' : '#fbbf24';
  const primaryColor = isTech ? '#38bdf8' : isCivic ? '#93c5fd' : '#d97706';

  const itemsHtml = business.items
    .map(
      item => `
      <div class="card reveal">
        <div class="card-header">
          <h3>${escapeHtml(item.name)}</h3>
          <span class="price">${escapeHtml(item.price)}</span>
        </div>
        ${item.description ? `<p class="desc">${escapeHtml(item.description)}</p>` : ''}
        ${item.badge ? `<span class="badge">${escapeHtml(item.badge)}</span>` : ''}
      </div>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(business.name)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
  <style>
    ${css}

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--font-body);
      background-color: var(--color-bg);
      color: var(--color-text);
      min-height: 100vh;
      overflow-x: hidden;
      position: relative;
    }

    #webgl-canvas {
      position: fixed;
      top: 0; left: 0;
      width: 100vw; height: 100vh;
      z-index: 0;
      pointer-events: none;
    }

    .container {
      position: relative;
      z-index: 1;
      max-width: 1100px;
      margin: 0 auto;
      padding: 4rem 2rem;
    }

    header {
      text-align: center;
      margin-bottom: 4rem;
      background: var(--color-surface);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-card);
      padding: 3.5rem 2rem;
      box-shadow: 0 25px 50px -12px rgba(0,0,0,0.6);
      position: relative;
      overflow: hidden;
    }

    header::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0; height: 2px;
      background: linear-gradient(90deg, transparent, var(--color-accent), transparent);
    }

    h1 {
      font-size: 3.25rem;
      font-weight: 800;
      letter-spacing: -0.03em;
      margin-bottom: 1rem;
      background: linear-gradient(to right, #ffffff, var(--color-accent));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .tagline {
      font-size: 1.35rem;
      color: var(--color-textMuted);
      max-width: 700px;
      margin: 0 auto;
      font-weight: 300;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 2rem;
    }

    .card {
      background: var(--color-surface);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-card);
      padding: 2rem;
      transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      position: relative;
      box-shadow: 0 10px 30px rgba(0,0,0,0.4);
    }

    .card:hover {
      transform: translateY(-6px) scale(1.02);
      border-color: var(--color-accent);
      box-shadow: 0 20px 40px rgba(0,0,0,0.6), 0 0 20px rgba(255,255,255,0.1);
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 0.75rem;
    }

    .card h3 {
      font-size: 1.4rem;
      font-weight: 700;
      color: var(--color-text);
    }

    .price {
      font-size: 1.3rem;
      font-weight: 800;
      color: var(--color-accent);
      font-family: 'JetBrains Mono', monospace;
    }

    .desc {
      color: var(--color-textMuted);
      font-size: 1rem;
      line-height: 1.5;
    }

    .badge {
      display: inline-block;
      margin-top: 1rem;
      padding: 0.25rem 0.75rem;
      font-size: 0.8rem;
      font-weight: 700;
      border-radius: 999px;
      background: rgba(255,255,255,0.1);
      color: var(--color-accent);
      border: 1px solid var(--color-border);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    footer {
      text-align: center;
      margin-top: 4rem;
      color: var(--color-textMuted);
      font-size: 0.95rem;
    }
  </style>
</head>
<body>
  <canvas id="webgl-canvas"></canvas>

  <div class="container">
    <header>
      <h1>${escapeHtml(business.name)}</h1>
      <p class="tagline">${escapeHtml(business.description)}</p>
    </header>

    <div class="grid">
      ${itemsHtml}
    </div>

    <footer>
      <p>Powered by <strong>Solid Databox IPMS</strong> — Decentralised & Secure</p>
    </footer>
  </div>

  <script>
    // Three.js Animated Visual FX Canvas
    (function() {
      const canvas = document.getElementById('webgl-canvas');
      if (!canvas || typeof THREE === 'undefined') return;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
      const renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

      // Particle Geometry
      const count = 150;
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(count * 3);
      const scales = new Float32Array(count);

      for (let i = 0; i < count * 3; i += 3) {
        positions[i] = (Math.random() - 0.5) * 15;
        positions[i + 1] = (Math.random() - 0.5) * 15;
        positions[i + 2] = (Math.random() - 0.5) * 15;
        scales[i / 3] = Math.random() * 0.1 + 0.05;
      }

      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      const material = new THREE.PointsMaterial({
        color: '${accentColor}',
        size: 0.12,
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending
      });

      const particles = new THREE.Points(geometry, material);
      scene.add(particles);

      // Add central subtle geometric wireframe node
      const geoMesh = new THREE.Mesh(
        new THREE.IcosahedronGeometry(2.5, 1),
        new THREE.MeshBasicMaterial({ color: '${primaryColor}', wireframe: true, transparent: true, opacity: 0.15 })
      );
      scene.add(geoMesh);

      camera.position.z = 6;

      let mouseX = 0, mouseY = 0;
      window.addEventListener('mousemove', (e) => {
        mouseX = (e.clientX / window.innerWidth - 0.5) * 0.5;
        mouseY = (e.clientY / window.innerHeight - 0.5) * 0.5;
      });

      window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      });

      function animate() {
        requestAnimationFrame(animate);
        particles.rotation.y += 0.0015;
        particles.rotation.x += 0.0008;
        geoMesh.rotation.y += 0.003;
        geoMesh.rotation.x += 0.002;

        camera.position.x += (mouseX - camera.position.x) * 0.05;
        camera.position.y += (-mouseY - camera.position.y) * 0.05;
        camera.lookAt(scene.position);

        renderer.render(scene, camera);
      }
      animate();
    })();
  </script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;');
}
