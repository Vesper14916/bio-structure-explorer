// Asset registry: loads, validates, and decodes Helix machine assets (v1 and v2).
// Works in three environments with no external dependencies:
//   1. Standalone build: reads inlined JSON from globalThis.__HELIX_ASSETS__ (window.__HELIX_ASSETS__).
//   2. Browser: fetches assets/manifest.json and asset JSON files over same-origin HTTP.
//   3. Node: reads assets/manifest.json and asset JSON files directly from disk.
import { decodeAsset, validateAsset } from './format.js';

const decodedCache = new Map();

function isNodeRuntime() {
  return typeof process !== 'undefined' && !!(process.versions && process.versions.node) && typeof window === 'undefined';
}

function defaultBaseUrl() {
  try {
    if (import.meta.url && !import.meta.url.startsWith('data:')) {
      return new URL('../../assets/', import.meta.url).href;
    }
  } catch { /* fallback below */ }
  return './assets/';
}

function getInlinedStore(opts) {
  if (opts && opts.inlined && typeof opts.inlined === 'object') return opts.inlined;
  if (typeof globalThis !== 'undefined' && globalThis.__HELIX_ASSETS__ && typeof globalThis.__HELIX_ASSETS__ === 'object') {
    return globalThis.__HELIX_ASSETS__;
  }
  return null;
}

async function readJsonFromNode(relPath, opts) {
  const fs = await import('node:' + 'fs/promises');
  const path = await import('node:' + 'path');
  const { fileURLToPath } = await import('node:' + 'url');
  const dir = opts && opts.assetsDir
    ? (opts.assetsDir instanceof URL ? fileURLToPath(opts.assetsDir) : String(opts.assetsDir))
    : fileURLToPath(new URL('../../assets/', import.meta.url));
  const full = path.join(dir, relPath);
  const text = await fs.readFile(full, 'utf8');
  return JSON.parse(text);
}

async function readJsonFromBrowser(relPath, opts) {
  const fetchFn = (opts && opts.fetch) || globalThis.fetch;
  if (typeof fetchFn !== 'function') {
    throw new Error(`loadAssets: fetch is not available to load "${relPath}"`);
  }
  const base = (opts && opts.baseUrl) || defaultBaseUrl();
  const url = base.endsWith('/') ? base + relPath : `${base}/${relPath}`;
  const res = await fetchFn(url);
  if (!res || !res.ok) {
    const status = res ? res.status : 'unknown';
    throw new Error(`loadAssets: HTTP ${status} fetching ${url}`);
  }
  return res.json();
}

async function readJson(relPath, opts) {
  if (opts && opts.fetch) return readJsonFromBrowser(relPath, opts);
  if (isNodeRuntime()) return readJsonFromNode(relPath, opts);
  return readJsonFromBrowser(relPath, opts);
}

/**
 * Load the asset manifest (`{ version, assets: [{ id, file, synthetic }] }`).
 * If inlined assets are present and include a `__manifest__` entry (or asset entries), synthesizes
 * or returns the manifest without network I/O.
 */
export async function loadManifest(opts = {}) {
  const inlined = getInlinedStore(opts);
  if (inlined && !opts.fetch && !opts.assetsDir) {
    if (inlined.__manifest__) return inlined.__manifest__;
    const entries = Object.entries(inlined)
      .filter(([k, v]) => !k.startsWith('__') && v && typeof v === 'object' && v.id)
      .map(([id, a]) => ({
        id,
        file: `${id}.asset.json`,
        synthetic: Boolean(a.source && a.source.type === 'synthetic'),
      }));
    if (entries.length) return { version: 1, assets: entries };
  }
  return readJson('manifest.json', opts);
}

function finishAsset(raw, decode) {
  if (decode === false) {
    const problems = validateAsset(raw);
    if (problems.length) throw new Error(`invalid asset ${raw && raw.id}: ${problems.join('; ')}`);
    return raw;
  }
  return decodeAsset(raw);
}

/** Clear the in-memory decoded asset cache. */
export function clearAssetCache() {
  decodedCache.clear();
}

/**
 * Load and decode a single asset by id.
 * Resolution order: in-memory cache (unless `noCache` or custom source opts), inlined store
 * (`globalThis.__HELIX_ASSETS__` / `opts.inlined`), then manifest-guided Node disk or browser fetch.
 */
export async function loadAsset(id, opts = {}) {
  if (!id || typeof id !== 'string') throw new Error('loadAsset: id must be a non-empty string');
  const useCache = !opts.noCache && !opts.inlined && !opts.fetch && !opts.assetsDir && opts.decode !== false;
  if (useCache && decodedCache.has(id)) return decodedCache.get(id);

  const inlined = getInlinedStore(opts);
  if (inlined && (opts.inlined || (!opts.fetch && !opts.assetsDir)) && Object.prototype.hasOwnProperty.call(inlined, id)) {
    const asset = finishAsset(inlined[id], opts.decode);
    if (useCache) decodedCache.set(id, asset);
    return asset;
  }

  const manifest = opts._manifest || await loadManifest(opts);
  const entry = (manifest.assets || []).find(a => a.id === id);
  if (!entry) throw new Error(`loadAsset: unknown asset id "${id}" (not in manifest)`);
  const raw = await readJson(entry.file, opts);
  const asset = finishAsset(raw, opts.decode);
  if (useCache) decodedCache.set(id, asset);
  return asset;
}

/**
 * Load multiple assets by id and return a map `{ [id]: DecodedAsset }`.
 * When `ids` is omitted or null, loads all assets listed in `assets/manifest.json`.
 */
export async function loadAssets(ids = null, opts = {}) {
  const manifest = await loadManifest(opts);
  const list = ids == null ? (manifest.assets || []).map(a => a.id) : Array.from(ids);
  const innerOpts = { ...opts, _manifest: manifest };
  const entries = await Promise.all(list.map(async id => [id, await loadAsset(id, innerOpts)]));
  return Object.fromEntries(entries);
}
