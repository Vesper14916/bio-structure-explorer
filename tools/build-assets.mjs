#!/usr/bin/env node
// Offline asset pipeline driver: runs recipes from tools/assets/<recipe>.mjs.
//
//   node tools/build-assets.mjs                 build every recipe and assets/manifest.json
//   node tools/build-assets.mjs --only <id>     build or check only the named asset id (comma-separated allowed)
//   node tools/build-assets.mjs --check         rebuild in memory and compare byte-for-byte with committed files
//   node tools/build-assets.mjs --dry-run       build a test asset from tools/1bna.cif into a temporary directory
//   node tools/build-assets.mjs --quiet         suppress verbose reports
//
// Inputs are the mmCIF files listed in tools/sources.lock.json, stored in tools/sources/ (ignored by Git).
// Run `npm run fetch-sources` to populate tools/sources/.
// The pipeline is deterministic: no clocks, no randomness, fixed iteration orders.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ASSET_FORMAT, ASSET_VERSION_V1, QUANT_STEP, encodeArray, encodePositions, validateAsset } from '../js/assets/format.js';
import { parseMmcif } from './lib/mmcif.mjs';
import { envelope, meshStats } from './lib/surface.mjs';
import { inventory, fitChain, buildTrack } from './assets/rnap.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LICENSE = 'CC0 1.0 Universal: wwPDB archive data are free of copyright restrictions (https://www.wwpdb.org/about/usage-policies)';
const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const r3 = x => Math.round(x * 1000) / 1000 + 0;
const r6 = x => Math.round(x * 1e6) / 1e6 + 0;
const frameOut = f => ({ o: f.o.map(r3), R: Array.from(f.R, r6) });

function readLock() {
  return JSON.parse(fs.readFileSync(path.join(root, 'tools', 'sources.lock.json'), 'utf8'));
}

function makeSourceLoader(lock) {
  const byId = new Map(lock.sources.map(s => [s.pdbId.toUpperCase(), s]));
  const parsedCache = new Map();
  return {
    lockEntry(pdbId) {
      const e = byId.get(String(pdbId).toUpperCase());
      if (!e) throw new Error(`PDB ${pdbId} is not in tools/sources.lock.json`);
      return e;
    },
    loadSource(entryOrId) {
      const entry = typeof entryOrId === 'string' ? this.lockEntry(entryOrId) : entryOrId;
      if (parsedCache.has(entry.pdbId)) return parsedCache.get(entry.pdbId);
      const file = path.join(root, entry.file);
      if (!fs.existsSync(file)) throw new Error(`missing ${entry.file}; run "npm run fetch-sources" to download ${entry.url}`);
      const buf = fs.readFileSync(file);
      const sha = crypto.createHash('sha256').update(buf).digest('hex');
      if (sha !== entry.sha256) throw new Error(`${entry.file}: sha256 ${sha} does not match the lock file (${entry.sha256})`);
      if (buf.length !== entry.bytes) throw new Error(`${entry.file}: ${buf.length} bytes, lock file says ${entry.bytes}`);
      const parsed = parseMmcif(buf.toString('utf8'));
      parsedCache.set(entry.pdbId, parsed);
      return parsed;
    },
  };
}

async function discoverRecipes() {
  const dir = path.join(root, 'tools', 'assets');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.mjs')).sort();
  const list = [];
  for (const file of files) {
    const mod = await import(pathToFileURL(path.join(dir, file)).href);
    if (Array.isArray(mod.recipes)) {
      list.push(...mod.recipes);
    } else if (mod.default && typeof mod.default.build === 'function') {
      list.push(mod.default);
    } else if (mod.id && typeof mod.build === 'function') {
      list.push({ id: mod.id, sources: mod.sources || [], dependsOn: mod.dependsOn || [], build: mod.build });
    }
  }
  return list;
}

function dryRun() {
  const parsed = parseMmcif(fs.readFileSync(path.join(root, 'tools', '1bna.cif'), 'utf8'));
  const rows = inventory(parsed);
  const l1Pos = [], l1Chain = [], l1Kind = [], chains = [], tracks = {};
  rows.forEach((r, ci) => {
    fitChain(r.chain);
    let n = 0;
    for (const res of r.chain.residues) if (res.atoms.P) { l1Pos.push(...res.atoms.P); l1Chain.push(ci); l1Kind.push(1); n++; }
    chains.push({ id: r.id, part: 'dna', class: r.class, name: `Strand ${r.id}`, residues: n });
    const t = buildTrack('dna', r.chain.residues, res => res.seq);
    tracks['strand' + r.id] = { kind: 'dna', registers: t.registers, frames: t.frames.map(frameOut), synthetic: t.synthetic, bases: t.basesRaw.join('') };
  });
  const env = envelope(l1Pos, { sigma: 5, spacing: 5, maxTriangles: 12000 });
  const ms = meshStats(env.positions, env.indices);
  const c = [0, 1, 2].map(k => l1Pos.filter((_, i) => i % 3 === k).reduce((s, v) => s + v, 0) / (l1Pos.length / 3));
  const asset = {
    format: ASSET_FORMAT, version: ASSET_VERSION_V1, id: 'dry-run-1bna', name: 'Dry run: 1BNA (pipeline test only)', kind: 'machine',
    units: 'angstrom', quantStep: QUANT_STEP,
    source: { type: 'pdb', pdbId: '1BNA', title: parsed.title, method: parsed.method, resolutionA: parsed.resolutionA, organism: 'synthetic construct',
      downloaded: 'bundled tools/1bna.cif', sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'tools', '1bna.cif'))).digest('hex'), license: LICENSE, chainsUsed: rows.map(r => r.id) },
    bounds: { center: c.map(r3), radius: 30, size: [40, 40, 50] },
    parts: [{ id: 'dna', name: 'DNA dodecamer' }], chains,
    lod0: { parts: [{ part: 'dna', positions: encodePositions(env.positions), indices: encodeArray(Uint16Array.from(env.indices)), indexType: 'u16', vertexCount: env.positions.length / 3, triangleCount: env.indices.length / 3 }] },
    lod1: { count: l1Chain.length, positions: encodePositions(l1Pos), chain: encodeArray(Uint8Array.from(l1Chain)), kind: encodeArray(Uint8Array.from(l1Kind)) },
    anchors: { center: { o: c.map(r3), R: I3 } }, tracks,
  };
  const problems = validateAsset(asset);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'helix-assets-dry-run-'));
  const out = path.join(dir, 'dry-run-1bna.asset.json');
  fs.writeFileSync(out, JSON.stringify(asset));
  console.log(`dry run: ${rows.length} chains, ${l1Chain.length} P beads, L0 ${env.indices.length / 3} triangles (closed ${ms.closed}, volume ${ms.signedVolume.toFixed(0)} A^3, ${(env.insideByRay * 100).toFixed(1)} % beads inside), wrote ${out}`);
  console.log(problems.length ? 'INVALID:\n' + problems.join('\n') : 'validateAsset: OK');
  return problems.length ? 1 : 0;
}

function parseOnly(args) {
  const idx = args.indexOf('--only');
  if (idx < 0) return null;
  const raw = args[idx + 1];
  if (!raw || raw.startsWith('--')) throw new Error('--only requires an asset id (or comma-separated list)');
  return new Set(raw.split(',').map(s => s.trim()).filter(Boolean));
}

function buildManifest(builtIds, existingManifest, { preserveExisting = false } = {}) {
  const base = existingManifest && Array.isArray(existingManifest.assets) ? existingManifest.assets : [];
  const entries = [];
  const seen = new Set();
  // Keep synthetic entries (e.g. fixture-machine) first, and preserve existing entries on --only runs.
  for (const e of base) {
    if ((preserveExisting || e.synthetic) && !seen.has(e.id)) { entries.push(e); seen.add(e.id); }
  }
  if (!seen.has('fixture-machine')) {
    entries.push({ id: 'fixture-machine', file: 'fixture-machine.asset.json', synthetic: true });
    seen.add('fixture-machine');
  }
  for (const id of builtIds) {
    if (!seen.has(id)) {
      entries.push({ id, file: `${id}.asset.json`, synthetic: false });
      seen.add(id);
    }
  }
  return JSON.stringify({ version: 1, assets: entries }, null, 2) + '\n';
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--dry-run')) return dryRun();
  const check = args.includes('--check');
  const quiet = args.includes('--quiet');
  const only = parseOnly(args);
  const log = (...a) => { if (!quiet) console.log(...a); };

  const allRecipes = await discoverRecipes();
  const byId = new Map(allRecipes.map(r => [r.id, r]));
  if (only) {
    for (const id of only) {
      if (!byId.has(id)) throw new Error(`unknown recipe id "${id}"; available: ${[...byId.keys()].join(', ')}`);
    }
  }

  const lock = readLock();
  const loader = makeSourceLoader(lock);
  const built = new Map();
  const visiting = new Set();
  const ctx = {
    root,
    sourcesDir: path.join(root, 'tools', 'sources'),
    lock,
    lockEntry: id => loader.lockEntry(id),
    loadSource: x => loader.loadSource(x),
    built,
    log,
    LICENSE,
  };

  async function runRecipe(recipe) {
    if (built.has(recipe.id)) return built.get(recipe.id);
    if (visiting.has(recipe.id)) throw new Error(`circular recipe dependency involving ${recipe.id}`);
    visiting.add(recipe.id);
    try {
      for (const dep of recipe.dependsOn || []) {
        const depRecipe = byId.get(dep);
        if (!depRecipe) throw new Error(`recipe ${recipe.id} depends on unknown recipe ${dep}`);
        await runRecipe(depRecipe);
      }
      const res = await recipe.build(ctx);
      const wrapped = res && res.asset ? res : { asset: res, report: null };
      const problems = validateAsset(wrapped.asset);
      if (problems.length) throw new Error(`${recipe.id} invalid:\n` + problems.join('\n'));
      built.set(recipe.id, wrapped);
      if (wrapped.report) log(`\n${recipe.id} report ` + JSON.stringify(wrapped.report, null, 1));
      return wrapped;
    } finally {
      visiting.delete(recipe.id);
    }
  }

  const targetRecipes = only ? allRecipes.filter(r => only.has(r.id)) : allRecipes;
  const outputs = {};
  for (const r of targetRecipes) {
    const res = await runRecipe(r);
    outputs[`assets/${r.id}.asset.json`] = JSON.stringify(res.asset);
  }
  if (!only || !check) {
    const manifestPath = path.join(root, 'assets', 'manifest.json');
    const existing = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : null;
    outputs['assets/manifest.json'] = buildManifest(targetRecipes.map(r => r.id), existing, { preserveExisting: Boolean(only) });
  }

  if (check) {
    let bad = 0;
    for (const [rel, text] of Object.entries(outputs)) {
      const cur = fs.existsSync(path.join(root, rel)) ? fs.readFileSync(path.join(root, rel), 'utf8') : null;
      const same = cur === text;
      console.log(`${same ? 'identical' : 'DIFFERS'}  ${rel}`);
      if (!same) bad++;
    }
    return bad ? 1 : 0;
  }
  for (const [rel, text] of Object.entries(outputs)) {
    fs.writeFileSync(path.join(root, rel), text);
    console.log(`wrote ${rel} (${Buffer.byteLength(text)} bytes)`);
  }
  return 0;
}

process.exitCode = await main();
