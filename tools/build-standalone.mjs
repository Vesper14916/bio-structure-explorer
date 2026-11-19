#!/usr/bin/env node
// Bundles the entire Helix application (CSS, vendored Three.js, science, sim, render, UI, and main.js)
// into a single self-contained HTML file (dist/helix-standalone.html) that works offline via file://
// or inside sandboxed preview iframes without requiring an HTTP server.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDist = path.join(root, 'dist', 'helix-standalone.html');

const css = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');

function walk(dir, list = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, list);
    else if (entry.name.endsWith('.js')) list.push(full);
  }
  return list;
}

const allFiles = walk(path.join(root, 'js'));
const toSpec = absPath => 'https://helix.local/' + path.relative(root, absPath).replace(/\\/g, '/');

const rawModules = {};
for (const f of allFiles) {
  rawModules[toSpec(f)] = fs.readFileSync(f, 'utf8');
}

function resolveSpec(fromSpec, imp) {
  if (imp === 'three') return 'https://helix.local/js/vendor/three.module.min.js';
  if (imp.startsWith('three/addons/')) {
    return 'https://helix.local/js/vendor/addons/' + imp.slice('three/addons/'.length);
  }
  if (imp.startsWith('.')) {
    const baseDir = path.posix.dirname(fromSpec.replace('https://helix.local/', ''));
    const joined = path.posix.normalize(path.posix.join(baseDir, imp));
    return 'https://helix.local/' + joined;
  }
  return imp;
}

const IMPORT_EXPORT_RE = /((?:^|[\r\n;])\s*(?:import|export)\s+(?:[\w*{}\s,$]+)\s+from\s+['"])([^'"]+)(['"])/g;

function rewriteImports(code, selfSpec) {
  if (selfSpec.endsWith('three.module.min.js')) return code;
  return code.replace(IMPORT_EXPORT_RE, (_, pre, spec, post) => {
    const target = resolveSpec(selfSpec, spec);
    if (!rawModules[target]) {
      throw new Error(`Unresolved module specifier "${spec}" -> "${target}" in ${selfSpec}`);
    }
    return `${pre}${target}${post}`;
  });
}

function safeInlineJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

const assetsDir = path.join(root, 'assets');
const manifestPath = path.join(assetsDir, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const inlinedAssets = { __manifest__: manifest };
const manifestEntries = Array.isArray(manifest.assets) ? manifest.assets : [];
for (const entry of manifestEntries) {
  const assetPath = path.join(assetsDir, entry.file);
  const raw = JSON.parse(fs.readFileSync(assetPath, 'utf8'));
  if (raw.id !== entry.id) {
    throw new Error(`Manifest id mismatch for ${entry.file}: manifest has "${entry.id}", asset has "${raw.id}"`);
  }
  inlinedAssets[entry.id] = raw;
}

const importsMap = {};
for (const [spec, code] of Object.entries(rawModules)) {
  const rewritten = rewriteImports(code, spec);
  importsMap[spec] = 'data:text/javascript;base64,' + Buffer.from(rewritten, 'utf8').toString('base64');
}
importsMap['three'] = importsMap['https://helix.local/js/vendor/three.module.min.js'];

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Helix — Interactive DNA, RNA &amp; Gene Expression Explorer</title>
  <meta name="description" content="Interactive 3D molecular explorer for B-DNA, A-DNA, Z-DNA, A-RNA, base pairing, thermal melting, semiconservative replication, and coupled bacterial transcription-translation.">
  <meta name="theme-color" content="#04070f">
  <meta name="color-scheme" content="dark">
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%2304070f'/%3E%3Cpath d='M10 4c0 7 12 7 12 12S10 21 10 28' fill='none' stroke='%238fd3ff' stroke-width='2.6' stroke-linecap='round'/%3E%3Cpath d='M22 4c0 7-12 7-12 12s12 5 12 12' fill='none' stroke='%23a99bff' stroke-width='2.6' stroke-linecap='round'/%3E%3Cpath d='M12.500 9h7M11 16h10M12.500 23h7' stroke='%23ffc233' stroke-width='1.8' stroke-linecap='round'/%3E%3C/svg%3E">
  <style>${css}</style>
  <script type="importmap">${safeInlineJson({ imports: importsMap })}</script>
  <script>window.__HELIX_ASSETS__=${safeInlineJson(inlinedAssets)};</script>
</head>
<body>
  <div id="stage" aria-label="3D view of DNA, RNA and bacterial gene expression" role="img"></div>
  <div id="ui"></div>
  <div id="fallback" class="fallback" role="alert" hidden>
    <div>
      <h1>Helix could not start</h1>
      <p data-fallback-message>This explorer needs WebGL and a recent browser.</p>
    </div>
  </div>
  <script type="module">import "https://helix.local/js/main.js";</script>
</body>
</html>
`;

fs.mkdirSync(path.dirname(outDist), { recursive: true });
fs.writeFileSync(outDist, html, 'utf8');
const bytes = Buffer.byteLength(html, 'utf8');
console.log(
  `Built standalone single-file explorer: ${outDist} (${bytes} bytes / ${(bytes / 1024).toFixed(1)} KB / ${(bytes / 1e6).toFixed(2)} MB; ${manifestEntries.length} assets inlined)`
);

