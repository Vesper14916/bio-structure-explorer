#!/usr/bin/env node
// Fetch and verify pinned RCSB mmCIF source files listed in tools/sources.lock.json.
//
//   node tools/fetch-sources.mjs [--only <pdbId1,pdbId2,...>] [--check] [--quiet]
//
// Files are stored under tools/sources/ (gitignored). Compressed .cif.gz downloads are verified
// when gzSha256/gzBytes are recorded, decompressed with zlib, verified against sha256/bytes,
// and written atomically via temporary file + rename.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lockPath = path.join(root, 'tools', 'sources.lock.json');
const sourcesDir = path.join(root, 'tools', 'sources');
const MAX_RETRIES = 3;

function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function parseArgs(argv) {
  let check = false;
  let quiet = false;
  let only = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--check') {
      check = true;
    } else if (arg === '--quiet') {
      quiet = true;
    } else if (arg === '--only') {
      const next = argv[++i];
      if (!next) throw new Error('--only requires a comma-separated list of PDB IDs');
      only = next.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    } else if (arg.startsWith('--only=')) {
      only = arg.slice('--only='.length).split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return { check, quiet, only };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function downloadWithFetch(url) {
  let lastErr = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const ab = await res.arrayBuffer();
      return Buffer.from(ab);
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES) await sleep(500 * attempt);
    }
  }
  throw lastErr;
}

function downloadWithCurl(url, tmpPath) {
  try {
    execFileSync('curl', ['-fsSL', '--retry', String(MAX_RETRIES), '-o', tmpPath, url], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    return fs.readFileSync(tmpPath);
  } finally {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  }
}

async function downloadBytes(url, tmpDownloadPath) {
  try {
    return await downloadWithFetch(url);
  } catch (fetchErr) {
    try {
      return downloadWithCurl(url, tmpDownloadPath);
    } catch (curlErr) {
      throw new Error(`download failed for ${url} (fetch: ${fetchErr.message}; curl: ${curlErr.message})`);
    }
  }
}

function verifyFile(filePath, expectedSha256, expectedBytes) {
  if (!fs.existsSync(filePath)) return { ok: false, reason: 'missing' };
  const buf = fs.readFileSync(filePath);
  const actualBytes = buf.length;
  const actualSha256 = sha256Hex(buf);
  if (actualBytes !== expectedBytes) {
    return { ok: false, reason: `size mismatch (got ${actualBytes}, expected ${expectedBytes})` };
  }
  if (actualSha256 !== expectedSha256) {
    return { ok: false, reason: `sha256 mismatch (got ${actualSha256}, expected ${expectedSha256})` };
  }
  return { ok: true, bytes: actualBytes, sha256: actualSha256 };
}

async function processEntry(entry, { check, quiet }) {
  const dest = path.join(root, entry.file);
  const log = msg => { if (!quiet) console.log(msg); };

  const existing = verifyFile(dest, entry.sha256, entry.bytes);
  if (existing.ok) {
    log(`${entry.pdbId.padEnd(4)}  ok (cached)  ${entry.file} (${entry.bytes} bytes)`);
    return true;
  }

  if (check) {
    console.error(`${entry.pdbId.padEnd(4)}  FAIL  ${entry.file}: ${existing.reason}`);
    return false;
  }

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmpDownload = `${dest}.dl.${process.pid}.tmp`;
  const tmpOut = `${dest}.${process.pid}.tmp`;

  try {
    log(`${entry.pdbId.padEnd(4)}  downloading  ${entry.url}`);
    const rawBuf = await downloadBytes(entry.url, tmpDownload);

    if (entry.gzBytes != null && rawBuf.length !== entry.gzBytes) {
      throw new Error(`compressed size mismatch (got ${rawBuf.length}, expected ${entry.gzBytes})`);
    }
    if (entry.gzSha256) {
      const gzSha = sha256Hex(rawBuf);
      if (gzSha !== entry.gzSha256) {
        throw new Error(`compressed sha256 mismatch (got ${gzSha}, expected ${entry.gzSha256})`);
      }
    }

    const cifBuf = entry.url.endsWith('.gz') ? zlib.gunzipSync(rawBuf) : rawBuf;

    fs.writeFileSync(tmpOut, cifBuf);
    const verified = verifyFile(tmpOut, entry.sha256, entry.bytes);
    if (!verified.ok) {
      throw new Error(verified.reason);
    }
    fs.renameSync(tmpOut, dest);
    log(`${entry.pdbId.padEnd(4)}  ok (fetched) ${entry.file} (${entry.bytes} bytes)`);
    return true;
  } catch (err) {
    if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
    console.error(`${entry.pdbId.padEnd(4)}  FAIL  ${entry.file}: ${err.message}`);
    return false;
  } finally {
    if (fs.existsSync(tmpDownload)) fs.unlinkSync(tmpDownload);
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  const entries = lock.sources || [];

  let selected = entries;
  if (opts.only) {
    const byId = new Map(entries.map(e => [e.pdbId.toUpperCase(), e]));
    const unknown = opts.only.filter(id => !byId.has(id));
    if (unknown.length) {
      throw new Error(`unknown PDB ID(s) in --only: ${unknown.join(', ')}`);
    }
    const want = new Set(opts.only);
    selected = entries.filter(e => want.has(e.pdbId.toUpperCase()));
  }

  if (!opts.check) {
    fs.mkdirSync(sourcesDir, { recursive: true });
  }

  let okCount = 0;
  let failCount = 0;
  for (const entry of selected) {
    const ok = await processEntry(entry, opts);
    if (ok) okCount++;
    else failCount++;
  }

  if (!opts.quiet) {
    console.log(`sources: ${okCount} ok, ${failCount} failed (${selected.length} total)`);
  }
  return failCount === 0 ? 0 : 1;
}

main()
  .then(code => { process.exitCode = code; })
  .catch(err => {
    console.error(`fetch-sources: ${err.message}`);
    process.exitCode = 1;
  });
