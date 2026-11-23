#!/usr/bin/env node
// Copies the runtime files of the static site into `public/` for Vercel.
// The app needs no bundling: index.html loads ./css, ./js (ES modules with an
// import map) and fetches ./assets over same-origin HTTP. docs/, tests/, tools/
// and dev/ are left out so the deployment stays small.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'public');

const ENTRIES = ['index.html', 'css', 'js', 'assets', 'dist/helix-standalone.html'];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const rel of ENTRIES) {
  const src = path.join(root, rel);
  if (!fs.existsSync(src)) throw new Error(`build-vercel: missing ${rel}`);
  fs.cpSync(src, path.join(out, rel), { recursive: true });
}

let bytes = 0, files = 0;
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p); else { bytes += fs.statSync(p).size; files++; }
  }
})(out);
console.log(`build-vercel: ${files} files, ${(bytes / 1048576).toFixed(1)} MB in public/`);
