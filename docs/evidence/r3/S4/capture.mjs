// Evidence capture for task R3-S4: serves the repository root, opens tl-lab.html and saves chapter 8–16
// screenshots (desktop 1440×900 @2x, iPhone 13). Usage: node docs/evidence/r3/S4/capture.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const { chromium, devices } = createRequire(import.meta.url)('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };

const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/docs/evidence/r3/S4/tl-lab.html`;

const SHOTS = [
  ['ch08-30s-binds-sd', 8, 0.6], ['ch09-start-codon', 9, 0.8], ['ch10-70s-assembly', 10, 0.6], ['ch11-decoding', 11, 0.6],
  ['ch12-peptide-bond', 12, 0.5], ['ch13-translocation', 13, 0.5], ['ch14-elongation', 14, 0.5], ['ch15-stop-codon', 15, 0.6], ['ch16-finished', 16, 0.5],
];
const errors = [];
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  for (const [label, ctxOpts] of [
    ['desktop', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }],
    ['phone', { ...devices['iPhone 13'] }],
  ]) {
    const ctx = await browser.newContext(ctxOpts);
    const page = await ctx.newPage();
    page.on('console', m => { if (m.type() === 'error') errors.push(`${label}: ${m.text()}`); });
    page.on('pageerror', e => errors.push(`${label}: ${e.message}`));
    for (const [name, ch, frac] of SHOTS) {
      await page.goto(`${base}?chapter=${ch}&frac=${frac}&quality=medium`);
      await page.waitForFunction(() => window.tlLabReady === true || document.getElementById('err').textContent, null, { timeout: 60000 });
      await page.waitForTimeout(600);
      const file = label === 'desktop' ? `${name}.jpg` : `${name}-phone.jpg`;
      await page.screenshot({ path: path.join(here, file), type: 'jpeg', quality: 82, timeout: 180000 });
      const hud = await page.textContent('#hud');
      console.log(`${file}: ${hud.split('\n')[0]}`);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}
if (errors.length) { console.error('CONSOLE ERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log('CAPTURE OK, no console errors');
