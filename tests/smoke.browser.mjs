#!/usr/bin/env node
// Browser smoke gate: serves the repository root over a local static server, opens the app and
// the standalone bundle in Chromium, switches modes with the keys 1-6, scrubs the Express v1
// progress slider, checks ?mode=express&scene=v2 on both pages, verifies offline asset loading
// from window.__HELIX_ASSETS__ in the standalone bundle with all network requests blocked, and
// checks module imports across js/ so broken modules print their path.
// Prints SMOKE PASS or SMOKE FAIL. Not a node:test file.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

let chromium;
try {
  ({ chromium } = createRequire(import.meta.url)('playwright'));
} catch {
  console.log('SMOKE SKIPPED: playwright not available');
  process.exit(2);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
};

const problems = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const REQUIRED_OFFLINE_ASSETS = ['ribosome-70s', 'trna-init', 'trna-aa', 'rnap-ec', 'rnap-holo'];
const PAGES = ['/index.html', '/dist/helix-standalone.html'];
const KEYS = ['1', '2', '3', '4', '5', '6'];

const STATIC_IMPORT_RE = /(?:^|[\r\n;])\s*(?:import|export)\s+(?:[\w*{}\s,$]+)\s+from\s+['"]([^'"]+)['"]/g;

function collectAppModules() {
  const jsRoot = path.join(root, 'js');
  const vendorRoot = path.join(jsRoot, 'vendor');
  const modules = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (full !== vendorRoot) walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        modules.push(path.relative(root, full).replace(/\\/g, '/'));
      }
    }
  }
  walk(jsRoot);
  modules.sort();

  // Lightweight static dependency graph for identifying root-cause module import failures.
  const deps = new Map();
  for (const rel of modules) {
    const code = fs.readFileSync(path.join(root, rel), 'utf8');
    const set = new Set();
    STATIC_IMPORT_RE.lastIndex = 0;
    let m;
    while ((m = STATIC_IMPORT_RE.exec(code)) !== null) {
      const spec = m[1];
      if (spec.startsWith('.')) {
        const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec));
        set.add(resolved);
      }
    }
    deps.set(rel, set);
  }
  return { modules, deps };
}

function extractModulePath(text, dataUrlToMod = null) {
  if (!text) return null;
  const str = String(text);
  if (dataUrlToMod && dataUrlToMod.has(str)) {
    return dataUrlToMod.get(str);
  }
  if (dataUrlToMod && str.includes('data:text/javascript;base64,')) {
    for (const [dataUrl, modPath] of dataUrlToMod.entries()) {
      if (str.includes(dataUrl)) return modPath;
    }
  }
  const helixMatch = str.match(/https?:\/\/helix\.local\/(js\/[^\s"'`():]+?\.js)/);
  if (helixMatch) return helixMatch[1];
  const jsMatch = str.match(/(?:^|[\s(/'"`])(js\/[\w./-]+\.js)(?=[:)\s'"`?]|$)/);
  if (jsMatch) return jsMatch[1];
  return null;
}

function startServer() {
  const server = http.createServer((req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      res.writeHead(400).end('Bad request');
      return;
    }
    if (pathname.endsWith('/')) pathname += 'index.html';
    const filePath = path.resolve(root, '.' + pathname);
    if (filePath !== root && !filePath.startsWith(root + path.sep)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    fs.stat(filePath, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404).end('Not found');
        return;
      }
      const type = MIME[path.extname(filePath)] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type });
      fs.createReadStream(filePath).pipe(res);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function attachErrorCollectors(context, page, localHost, label, state) {
  const dataUrlToMod = state.dataUrlToMod;

  page.on('pageerror', err => {
    const stackOrMsg = err && err.stack ? err.stack : (err && err.message ? err.message : String(err));
    const mod = extractModulePath(stackOrMsg, dataUrlToMod);
    const modTag = mod ? ` [module: ${mod}]` : '';
    problems.push(`[${label}] pageerror${modTag}: ${err && err.message ? err.message : err}`);
  });

  page.on('console', msg => {
    if (msg.type() !== 'error') return;
    const loc = msg.location();
    const locUrl = loc && loc.url ? loc.url : '';
    const mod = extractModulePath(locUrl, dataUrlToMod) || extractModulePath(msg.text(), dataUrlToMod);
    const where = locUrl ? ` (at ${mod || locUrl})` : '';
    const modTag = mod ? ` [module: ${mod}]` : '';
    problems.push(`[${label}] console.error${modTag}: ${msg.text()}${where}`);
  });

  page.on('requestfailed', req => {
    const url = req.url();
    // Ignore requests intentionally aborted by our own offline route handler (already recorded there).
    if (state.abortedByRoute && state.abortedByRoute.has(url)) return;
    const failure = req.failure();
    const reason = failure ? failure.errorText : 'failed';
    const mod = extractModulePath(url, dataUrlToMod);
    const modTag = mod ? ` [module: ${mod}]` : '';
    problems.push(`[${label}] requestfailed${modTag}: ${url} (${reason})`);
  });

  page.on('response', res => {
    if (res.status() >= 400) {
      const url = res.url();
      const mod = extractModulePath(url, dataUrlToMod);
      const modTag = mod ? ` [module: ${mod}]` : '';
      problems.push(`[${label}] HTTP ${res.status()}${modTag} for ${url}`);
    }
  });

  page.on('request', req => {
    let u;
    try {
      u = new URL(req.url());
    } catch {
      return;
    }
    // Only network schemes count; data: and blob: URLs have no host.
    if ((u.protocol === 'http:' || u.protocol === 'https:') && u.host !== localHost) {
      if (state.abortedByRoute && state.abortedByRoute.has(req.url())) return;
      problems.push(`[${label}] external request: ${req.url()}`);
    }
  });

  // CDP Runtime.exceptionThrown captures exact module URLs for static ES module syntax/link errors
  // where Chromium's pageerror stack often omits the file path.
  let cdp = null;
  try {
    cdp = await context.newCDPSession(page);
    await cdp.send('Runtime.enable');
    cdp.on('Runtime.exceptionThrown', evt => {
      const details = evt && evt.exceptionDetails;
      if (!details) return;
      const url = details.url || '';
      const mod = extractModulePath(url, dataUrlToMod);
      if (!mod) return;
      const desc = (details.exception && details.exception.description) || details.text || 'exception';
      const firstLine = String(desc).split('\n')[0];
      const lineInfo = Number.isInteger(details.lineNumber) ? `:${details.lineNumber + 1}` : '';
      problems.push(`[${label}] module exception in ${mod}${lineInfo}: ${firstLine}`);
    });
  } catch {
    cdp = null;
  }
  return cdp;
}

async function populateStandaloneImportMapIndex(page, dataUrlToMod) {
  const pairs = await page.evaluate(() => {
    const el = document.querySelector('script[type="importmap"]');
    if (!el) return [];
    try {
      const parsed = JSON.parse(el.textContent || '{}');
      return Object.entries(parsed.imports || {});
    } catch {
      return [];
    }
  });
  for (const [spec, target] of pairs) {
    const mod = extractModulePath(spec);
    if (mod && typeof target === 'string' && target.startsWith('data:')) {
      dataUrlToMod.set(target, mod);
    }
  }
}

async function checkModuleImports(page, label, { modules, deps }, { standalone = false } = {}) {
  const results = await page.evaluate(async ({ modList, isStandalone }) => {
    const failures = [];
    for (const relPath of modList) {
      const spec = isStandalone ? `https://helix.local/${relPath}` : `/${relPath}`;
      try {
        await import(spec);
      } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        failures.push({ relPath, msg });
      }
    }
    return failures;
  }, { modList: modules, isStandalone: standalone });

  if (results.length === 0) return;

  const failedSet = new Set(results.map(r => r.relPath));
  const rootCauses = results.filter(r => {
    const modDeps = deps.get(r.relPath);
    if (!modDeps) return true;
    for (const d of modDeps) {
      if (failedSet.has(d)) return false;
    }
    return true;
  });

  const toReport = rootCauses.length > 0 ? rootCauses : results;
  const cascadeCount = results.length - toReport.length;
  for (const f of toReport) {
    problems.push(`[${label}] module import failed: ${f.relPath}: ${f.msg}`);
  }
  if (cascadeCount > 0) {
    problems.push(`[${label}] (${cascadeCount} dependent module(s) also failed to import)`);
  }
}

async function checkPage(context, base, localHost, urlPath, modInfo) {
  const isStandalone = urlPath.includes('helix-standalone.html');
  const page = await context.newPage();
  const state = { dataUrlToMod: new Map(), abortedByRoute: new Set() };
  const cdp = await attachErrorCollectors(context, page, localHost, urlPath, state);

  try {
    await page.goto(base + urlPath, { waitUntil: 'load' });
    if (isStandalone) await populateStandaloneImportMapIndex(page, state.dataUrlToMod);
    await sleep(2000);

    await checkModuleImports(page, urlPath, modInfo, { standalone: isStandalone });

    const canvasCount = await page.evaluate(() => document.querySelectorAll('canvas').length);
    if (!(canvasCount >= 1)) {
      problems.push(`[${urlPath}] expected at least 1 canvas, found ${canvasCount}`);
      return;
    }

    for (const key of KEYS) {
      await page.keyboard.press(key);
      await sleep(800);
      if (key === '5') {
        const found = await page.evaluate(() => {
          const range = document.querySelector('input[type="range"][aria-label="Gene expression progress"]');
          if (!range) return false;
          range.value = '700';
          range.dispatchEvent(new Event('input', { bubbles: true }));
          return true;
        });
        if (!found) {
          problems.push(`[${urlPath}] range input "Gene expression progress" not found after key 5`);
        }
        await sleep(800);
        const hasTranslation = await page.evaluate(() => document.body.innerText.includes('Translation'));
        if (!hasTranslation) {
          problems.push(`[${urlPath}] page text does not contain "Translation" after scrubbing to 700`);
        }
      }
    }
  } finally {
    if (cdp) await cdp.detach().catch(() => {});
    await page.close();
  }
}

async function checkV2Page(context, base, localHost, urlPath, { offline = false } = {}) {
  const isStandalone = urlPath.includes('helix-standalone.html');
  const label = offline ? `${urlPath} (offline)` : urlPath;
  const page = await context.newPage();
  const state = { dataUrlToMod: new Map(), abortedByRoute: new Set() };
  const cdp = await attachErrorCollectors(context, page, localHost, label, state);

  let blockedNetworkRequests = 0;
  if (offline) {
    await page.route(/^https?:\/\//, route => {
      const req = route.request();
      let u;
      try {
        u = new URL(req.url());
      } catch {
        return route.abort('blockedbyclient');
      }
      // Allow only the initial HTML document navigation for the standalone file itself.
      // Block all other-origin requests and all subsequent HTTP/HTTPS subresource/fetch requests.
      if (req.isNavigationRequest() && u.host === localHost && u.pathname === '/dist/helix-standalone.html') {
        return route.continue();
      }
      blockedNetworkRequests++;
      state.abortedByRoute.add(req.url());
      problems.push(`[${label}] unexpected network request blocked: ${req.url()}`);
      return route.abort('blockedbyclient');
    });
  }

  try {
    await page.goto(base + urlPath, { waitUntil: 'load' });
    if (isStandalone) await populateStandaloneImportMapIndex(page, state.dataUrlToMod);
    await sleep(1500);

    const canvasCount = await page.evaluate(() => document.querySelectorAll('canvas').length);
    if (!(canvasCount >= 1)) {
      problems.push(`[${label}] expected at least 1 canvas, found ${canvasCount}`);
    }

    if (offline) {
      const assetCheck = await page.evaluate(async ({ ids }) => {
        const store = window.__HELIX_ASSETS__;
        if (!store || typeof store !== 'object') {
          return { ok: false, error: 'window.__HELIX_ASSETS__ is missing or not an object' };
        }
        const hasManifest = Boolean(store.__manifest__ && Array.isArray(store.__manifest__.assets));
        if (!hasManifest) {
          return { ok: false, error: 'window.__HELIX_ASSETS__.__manifest__ is missing' };
        }
        try {
          const reg = await import('https://helix.local/js/assets/registry.js');
          reg.clearAssetCache();
          const manifest = await reg.loadManifest();
          const loaded = await reg.loadAssets(ids);
          const missing = ids.filter(id => !loaded[id] || loaded[id].id !== id);
          if (missing.length) {
            return { ok: false, error: `failed to decode assets: ${missing.join(', ')}` };
          }
          return {
            ok: true,
            manifestCount: (manifest.assets || []).length,
            loadedIds: Object.keys(loaded).sort(),
          };
        } catch (err) {
          return { ok: false, error: err && err.message ? err.message : String(err) };
        }
      }, { ids: REQUIRED_OFFLINE_ASSETS });

      if (!assetCheck.ok) {
        problems.push(`[${label}] offline asset verification failed: ${assetCheck.error}`);
      }
      if (blockedNetworkRequests > 0) {
        problems.push(`[${label}] expected 0 network fetches after document load, saw ${blockedNetworkRequests}`);
      }
    }
  } finally {
    if (cdp) await cdp.detach().catch(() => {});
    await page.close();
  }
}

async function main() {
  const modInfo = collectAppModules();
  const server = await startServer();
  const { port } = server.address();
  const localHost = `127.0.0.1:${port}`;
  const base = `http://${localHost}`;
  let browser;
  try {
    browser = await chromium.launch({
      args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    for (const urlPath of PAGES) {
      await checkPage(context, base, localHost, urlPath, modInfo);
    }
    await checkV2Page(context, base, localHost, '/index.html?mode=express&scene=v2', { offline: false });
    await checkV2Page(context, base, localHost, '/dist/helix-standalone.html?mode=express&scene=v2', { offline: true });
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

try {
  await main();
} catch (err) {
  problems.push(`harness error: ${err && err.stack ? err.stack : err}`);
}

if (problems.length === 0) {
  console.log('SMOKE PASS');
  process.exit(0);
}
for (const line of problems) console.log(line);
console.log('SMOKE FAIL');
process.exit(1);
