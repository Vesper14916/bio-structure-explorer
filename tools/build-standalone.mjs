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
  <style>${css}</style>
  <script type="importmap">${JSON.stringify({ imports: importsMap })}</script>
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
console.log('Built standalone single-file explorer:', outDist, `(${(Buffer.byteLength(html) / 1024).toFixed(1)} KB)`);
