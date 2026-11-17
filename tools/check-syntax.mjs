#!/usr/bin/env node
// Syntax-checks every JavaScript module under js/ (js/vendor/ is skipped).
// Runs `node --check` on each file; exits 1 when any file fails.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const jsRoot = path.join(root, 'js');
const vendorRoot = path.join(jsRoot, 'vendor');

function collect(dir, list = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (full !== vendorRoot) collect(full, list);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      list.push(full);
    }
  }
  return list;
}

const files = collect(jsRoot).sort();
let failed = 0;

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failed++;
    const detail = `${result.stderr || result.stdout || ''}`.trim().replace(/\s*\n\s*/g, ' | ');
    console.log(`${path.relative(root, file)}: ${detail}`);
  }
}

console.log(`checked ${files.length} files, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
