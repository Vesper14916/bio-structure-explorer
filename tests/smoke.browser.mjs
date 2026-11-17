#!/usr/bin/env node
// Browser smoke gate: serves the repository root over a local static server, opens the app and
// the standalone bundle in Chromium, switches modes with the keys 1-6, and scrubs the Express
// progress slider. Prints SMOKE PASS or SMOKE FAIL. Not a node:test file.
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

const PAGES = ['/index.html', '/dist/helix-standalone.html'];
const KEYS = ['1', '2', '3', '4', '5', '6'];

async function checkPage(context, base, localHost, urlPath) {
  const page = await context.newPage();
  page.on('pageerror', err => {
    problems.push(`[${urlPath}] pageerror: ${err && err.message ? err.message : err}`);
  });
  page.on('console', msg => {
    if (msg.type() !== 'error') return;
    const loc = msg.location();
    const where = loc && loc.url ? ` (at ${loc.url})` : '';
    problems.push(`[${urlPath}] console.error: ${msg.text()}${where}`);
  });
  page.on('response', res => {
    if (res.status() >= 400) {
      problems.push(`[${urlPath}] HTTP ${res.status()} for ${res.url()}`);
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
      problems.push(`[${urlPath}] external request: ${req.url()}`);
    }
  });

  try {
    await page.goto(base + urlPath, { waitUntil: 'load' });
    await sleep(2000);

    const canvasCount = await page.evaluate(() => document.querySelectorAll('canvas').length);
    if (!(canvasCount >= 1)) {
      problems.push(`[${urlPath}] expected at least 1 canvas, found ${canvasCount}`);
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
    await page.close();
  }
}

async function main() {
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
      await checkPage(context, base, localHost, urlPath);
    }
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
