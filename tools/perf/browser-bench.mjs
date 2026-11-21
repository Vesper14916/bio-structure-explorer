#!/usr/bin/env node
// R3-Q2 browser benchmark: per-chapter draw calls, triangles, instances, GPU memory and frame times.
//
// Serves the repository root on 127.0.0.1, opens the translation lab page (docs/evidence/r3/S4/tl-lab.html), which runs
// the real StoryScene with the twelve assets and the full story (maxTime lifted), and seeks to the middle of
// each of the 16 chapters of the Step by step story. Software GL (SwiftShader) in headless Chromium:
// the frame times are NOT hardware numbers. Hardware results are recorded by hand in docs/PERF.md.
//
// What is measured, without changing repository source:
// - draw calls, triangles, points, lines, instanced draws and instances: counted by wrapping the WebGL2
//   draw methods in an init script (renderer.info is owned by the renderer instance, which the viewer
//   API does not expose). Counts are summed over every draw of one animation frame, so multi-pass rendering is included.
// - geometries and textures: `viewer.getState().memory`, which reports renderer.info.memory.
// - frame time: the interval between consecutive viewer 'frame' events (one per animation frame, paced by rAF).
//   The first WARMUP frames of each chapter are discarded.
//
// Failure rule: the process exits 1 only on page errors (uncaught exceptions, console errors, or text in the lab's
// error box). Slow frames never fail the run. Exit 2 means Playwright is not available.
// Output: a table on stdout and docs/evidence/r3/Q2/browser-bench.json.
// Usage: node tools/perf/browser-bench.mjs [--frames=20] [--quality=low|medium|high] [--chapters=1,2]   (or `npm run perf`)
// Default quality is `low`: at `medium` a software-GL frame takes 4-10 s from chapter 2 on, too slow for the time budget.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

let chromium;
try {
  ({ chromium } = createRequire(import.meta.url)('playwright'));
} catch (err) {
  console.log(`BROWSER-BENCH BLOCKED: playwright not available (${err && err.message ? err.message.split('\n')[0] : err})`);
  process.exit(2);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_FILE = path.join(root, 'docs', 'evidence', 'r3', 'Q2', 'browser-bench.json');
const PAGE_PATH = '/docs/evidence/r3/S4/tl-lab.html';
const VIEWPORT = { width: 1280, height: 720 };
const LAUNCH_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'];
const WARMUP_FRAMES = 2;
// Wall-clock budget for the whole measurement loop (the task budgets about six minutes in total).
const TIME_BUDGET_MS = 300000;
const PAGE_READY_TIMEOUT_MS = 180000;

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const m = /^--([\w-]+)=(.*)$/.exec(a);
  return m ? [m[1], m[2]] : [a.replace(/^--/, ''), 'true'];
}));
const FRAMES = Math.max(3, parseInt(args.frames || '20', 10) || 20);
const MIN_FRAMES = 3;
const QUALITY = args.quality || 'low';
const ONLY = args.chapters ? new Set(args.chapters.split(',').map(n => parseInt(n, 10))) : null;

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});

// Runs before any page script. Counts WebGL2 draws; three.js calls these methods on the context prototype.
function initScript() {
  const G = window.__perfGL = { calls: 0, triangles: 0, lines: 0, points: 0, instancedCalls: 0, instances: 0 };
  const record = (mode, count, instances, instanced) => {
    G.calls++;
    // WebGL primitive modes: POINTS 0, LINES 1, LINE_LOOP 2, LINE_STRIP 3, TRIANGLES 4, TRIANGLE_STRIP 5, TRIANGLE_FAN 6.
    if (mode === 0) G.points += count * instances;
    else if (mode === 1) G.lines += Math.floor(count / 2) * instances;
    else if (mode === 2) G.lines += count * instances;
    else if (mode === 3) G.lines += Math.max(0, count - 1) * instances;
    else if (mode === 4) G.triangles += Math.floor(count / 3) * instances;
    else if (mode === 5 || mode === 6) G.triangles += Math.max(0, count - 2) * instances;
    if (instanced) { G.instancedCalls++; G.instances += instances; }
  };
  if (typeof WebGL2RenderingContext === 'undefined') return;
  const P = WebGL2RenderingContext.prototype;
  const wrap = (name, pick) => {
    const orig = P[name];
    if (typeof orig !== 'function') return;
    P[name] = function (...a) { const r = pick(a); record(r[0], r[1], r[2], r[3]); return orig.apply(this, a); };
  };
  wrap('drawArrays', a => [a[0], a[2], 1, false]);
  wrap('drawElements', a => [a[0], a[1], 1, false]);
  wrap('drawRangeElements', a => [a[0], a[3], 1, false]);
  wrap('drawArraysInstanced', a => [a[0], a[2], a[3], true]);
  wrap('drawElementsInstanced', a => [a[0], a[1], a[4], true]);
}

// Runs in the page: seek to t, discard warm-up frames, then collect per-frame records. Stops after `frames`
// measured frames, or after `budgetMs` once `minFrames` are measured.
function measureChapter({ t, warm, frames, minFrames, budgetMs }) {
  const L = window.__tlLab;
  const G = window.__perfGL;
  L.seek(t);
  return new Promise(resolve => {
    const out = [];
    let index = 0;
    let prev = null;
    let off = null;
    const started = performance.now();
    const finish = () => {
      if (off) off();
      const state = L.viewer.getState();
      resolve({
        frames: out,
        memory: { geometries: state.memory.geometries, textures: state.memory.textures },
        quality: state.quality,
        chapterIndex: L.scene.world.chapter.index,
        shot: L.scene.world.shot.id,
        t: L.scene.world.t,
      });
    };
    // Safety net for a stalled animation loop: finish with whatever has been collected.
    const timer = setTimeout(finish, budgetMs * 3 + 60000);
    off = L.viewer.on('frame', () => {
      const now = performance.now();
      const cur = { calls: G.calls, triangles: G.triangles, lines: G.lines, points: G.points, instancedCalls: G.instancedCalls, instances: G.instances };
      if (prev) {
        if (index >= warm) {
          const d = k => cur[k] - prev.c[k];
          out.push({ intervalMs: now - prev.now, calls: d('calls'), triangles: d('triangles'), lines: d('lines'), points: d('points'), instancedCalls: d('instancedCalls'), instances: d('instances') });
        }
        index++;
        const done = out.length >= frames || (out.length >= minFrames && now - started > budgetMs);
        if (done) { clearTimeout(timer); finish(); return; }
      }
      prev = { now, c: cur };
    });
  });
}

const quantile = (sorted, q) => {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};
const med = values => quantile(Float64Array.from(values).sort(), 0.5);
const stats = values => {
  const s = Float64Array.from(values).sort();
  return { median: quantile(s, 0.5), p95: quantile(s, 0.95), max: s[s.length - 1] };
};

const errors = [];
let browser = null;
const startedAt = Date.now();

try {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}${PAGE_PATH}`;
  browser = await chromium.launch({ args: LAUNCH_ARGS });
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  await context.addInitScript(initScript);
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

  const loadStart = Date.now();
  await page.goto(`${base}?chapter=1&frac=0.5&quality=${encodeURIComponent(QUALITY)}`);
  await page.waitForFunction(() => window.tlLabReady === true || document.getElementById('err').textContent, null, { timeout: PAGE_READY_TIMEOUT_MS });
  const labErr = (await page.textContent('#err')).trim();
  if (labErr) errors.push(`lab: ${labErr}`);
  const loadMs = Date.now() - loadStart;
  if (labErr) throw new Error(`lab page failed to start: ${labErr.split('\n')[0]}`);

  const all = await page.evaluate(() => window.__tlLab.story.chapters.map((c, i) => ({ index: i, title: c.title, t0: c.t0, t1: c.t1 })));
  const chapters = ONLY ? all.filter(c => ONLY.has(c.index + 1)) : all;
  const rows = [];
  const measureStart = Date.now();
  for (const ch of chapters) {
    // Time-bounded: each chapter may use an equal share of what is left of the budget (at least MIN_FRAMES frames).
    const remaining = chapters.length - rows.length;
    const shareMs = Math.max(1000, (TIME_BUDGET_MS - (Date.now() - measureStart)) / remaining);
    const frames = FRAMES;
    const t = ch.t0 + 0.5 * (ch.t1 - ch.t0);
    const m = await page.evaluate(measureChapter, { t, warm: WARMUP_FRAMES, frames, minFrames: MIN_FRAMES, budgetMs: shareMs });
    const ft = m.frames.map(f => f.intervalMs);
    const fs_ = stats(ft);
    rows.push({
      chapter: ch.index + 1,
      title: ch.title,
      t: +t.toFixed(3),
      shot: m.shot,
      framesRequested: frames,
      budgetShareMs: Math.round(shareMs),
      framesMeasured: m.frames.length,
      frameMs: { median: +fs_.median.toFixed(2), p95: +fs_.p95.toFixed(2), max: +fs_.max.toFixed(2) },
      drawCalls: med(m.frames.map(f => f.calls)),
      triangles: med(m.frames.map(f => f.triangles)),
      lines: med(m.frames.map(f => f.lines)),
      points: med(m.frames.map(f => f.points)),
      instancedDrawCalls: med(m.frames.map(f => f.instancedCalls)),
      instances: med(m.frames.map(f => f.instances)),
      geometries: m.memory.geometries,
      textures: m.memory.textures,
      quality: m.quality,
      chapterIndexCheck: m.chapterIndex === ch.index,
    });
    if (m.chapterIndex !== ch.index) errors.push(`chapter ${ch.index + 1}: scene reports chapter index ${m.chapterIndex}`);
    const r = rows[rows.length - 1];
    console.log(`ch${String(r.chapter).padStart(2, '0')} ${r.title.slice(0, 22).padEnd(22)} frames ${String(r.framesMeasured).padStart(2)}  ` +
      `frame ms med ${r.frameMs.median.toFixed(1).padStart(8)} p95 ${r.frameMs.p95.toFixed(1).padStart(8)}  ` +
      `calls ${String(r.drawCalls).padStart(5)}  tris ${String(r.triangles).padStart(8)}  inst ${String(r.instances).padStart(6)}  ` +
      `geom ${String(r.geometries).padStart(4)}  tex ${String(r.textures).padStart(3)}`);
  }

  const labErrEnd = (await page.textContent('#err')).trim();
  if (labErrEnd) errors.push(`lab (end): ${labErrEnd}`);
  const version = browser.version();
  const json = {
    task: 'R3-Q2',
    generatedAt: new Date().toISOString(),
    page: PAGE_PATH,
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    quality: QUALITY,
    renderer: 'SwiftShader (software WebGL2) in headless Chromium; not hardware GPU',
    launchArgs: LAUNCH_ARGS,
    chromium: version,
    framesRequested: FRAMES,
    minFrames: MIN_FRAMES,
    warmupFrames: WARMUP_FRAMES,
    timeBudgetMs: TIME_BUDGET_MS,
    chaptersMeasured: rows.length,
    loadMs,
    totalMs: Date.now() - startedAt,
    chapters: rows,
    errors,
    result: errors.length ? 'FAIL' : 'PASS',
  };
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, `${JSON.stringify(json, null, 2)}\n`);
  console.log(`page load ${(loadMs / 1000).toFixed(1)} s, total ${((Date.now() - startedAt) / 1000).toFixed(1)} s, chromium ${version}`);
  console.log(`wrote ${path.relative(root, OUT_FILE)}`);
  if (errors.length) {
    console.log(`BROWSER-BENCH FAIL: ${errors.length} page error(s)`);
    for (const e of errors) console.log(`  ${e.split('\n')[0]}`);
    process.exitCode = 1;
  } else {
    console.log(`BROWSER-BENCH PASS: ${rows.length} chapters measured, 0 page errors`);
    process.exitCode = 0;
  }
} catch (err) {
  console.log(`BROWSER-BENCH FAIL: ${err && err.stack ? err.stack.split('\n').slice(0, 3).join(' | ') : err}`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server.listening) await new Promise(r => server.close(r));
}
