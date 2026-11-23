#!/usr/bin/env node
/**
 * Visual evidence sweep (PLAN.md R3-V2).
 *
 * Captures start, middle and end frames of every story chapter at a desktop and a phone profile,
 * with the camera on `Auto`, then builds one contact sheet per mode and device and an index.
 *
 * Usage:
 *   node tools/evidence/sweep.mjs [--mode sequential|coupled] [--chapters 1-16] [--dsf 1|2] [--out dir]
 *
 *   --mode      sequential (default) or coupled. Coupled choreography after chapter 5 is a stub
 *               (R3-S5, ST9), so coupled captures stop at chapter 5 unless --chapters asks otherwise.
 *   --chapters  1-based chapter numbers, e.g. "1-16" or "1,3,5-7". Default: all chapters (coupled: 1-5).
 *   --dsf       device scale factor, 1 (default) or 2. The default 1 deviates from PLAN §9.2 rule 6
 *               on purpose: a 2x software-GL capture takes about 45 s. Use --out for a 2x run so the
 *               1x files are not overwritten.
 *   --devices   comma list from desktop,iphone13 (default both)
 *   --shots     comma list from start,mid,end (default all three)
 *   --out       output directory (default docs/evidence/r3/sweep).
 *
 * Output (under --out):
 *   <mode>/<device>/chNN-<id>-<start|mid|end>.jpg  shots; <mode>/<device>/manifest.json records each one
 *   <mode>-<device>-contact.jpg                    contact sheet (rows = chapters, columns = start/mid/end)
 *   index.md                                       every shot with chapter, id, story time t and caption
 *
 * Exit status: 0 when every shot was taken and there were no console or page errors; 1 otherwise; 2 on usage errors.
 * Rerunnable: a later run with --chapters merges its shots into the existing manifests.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const DEFAULT_OUT = path.join(ROOT, 'docs', 'evidence', 'r3', 'sweep');
const MODES = ['sequential', 'coupled'];
const ALL_DEVICES = ['desktop', 'iphone13'];
const ALL_FRACTIONS = [['start', 0.02], ['mid', 0.5], ['end', 0.98]];
// --devices / --shots narrow these in place (see parseArgs).
const DEVICES = [...ALL_DEVICES];
const FRACTIONS = [...ALL_FRACTIONS];
const FRAME_PAIRS = 5; // at least five requestAnimationFrame pairs before each screenshot
const COUPLED_LAST_CHAPTER = 12; // R3-S5 (ST9) implemented coupled chapters 6-12; raised in R3-INT4
const LOAD_TIMEOUT = 180000;
const SHOT_TIMEOUT = 300000;
const LAUNCH_ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.bin': 'application/octet-stream',
};

function usage(msg) {
  if (msg) console.error(`sweep: ${msg}`);
  console.error('usage: node tools/evidence/sweep.mjs [--mode sequential|coupled] [--chapters 1-16] [--dsf 1|2] [--devices desktop,iphone13] [--shots start,mid,end] [--out dir]');
  process.exit(2);
}

function parseRange(text) {
  const out = new Set();
  for (const part of String(text).split(',')) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part.trim());
    if (!m) usage(`bad --chapters value "${text}"`);
    const a = Number(m[1]);
    const b = m[2] === undefined ? a : Number(m[2]);
    if (a < 1 || b < a) usage(`bad --chapters range "${part}"`);
    for (let n = a; n <= b; n++) out.add(n);
  }
  return [...out].sort((x, y) => x - y);
}

function parseArgs(argv) {
  const opts = { mode: 'sequential', chapters: null, dsf: 1, out: DEFAULT_OUT };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      const v = argv[++i];
      if (v === undefined) usage(`missing value for ${a}`);
      return v;
    };
    if (a === '--mode') opts.mode = val();
    else if (a === '--chapters') opts.chapters = parseRange(val());
    else if (a === '--dsf') opts.dsf = Number(val());
    else if (a === '--out') opts.out = path.resolve(val());
    else if (a === '--devices') opts.devices = val().split(',');
    else if (a === '--shots') opts.shots = val().split(',');
    else if (a === '-h' || a === '--help') {
      console.log('usage: node tools/evidence/sweep.mjs [--mode sequential|coupled] [--chapters 1-16] [--dsf 1|2] [--devices desktop,iphone13] [--shots start,mid,end] [--out dir]');
      process.exit(0);
    } else usage(`unknown argument ${a}`);
  }
  if (!MODES.includes(opts.mode)) usage(`--mode must be one of ${MODES.join(', ')}`);
  if (opts.dsf !== 1 && opts.dsf !== 2) usage('--dsf must be 1 or 2');
  if (opts.devices) {
    if (!opts.devices.every(d => ALL_DEVICES.includes(d))) usage(`--devices must be a subset of ${ALL_DEVICES.join(', ')}`);
    DEVICES.splice(0, DEVICES.length, ...ALL_DEVICES.filter(d => opts.devices.includes(d)));
  }
  if (opts.shots) {
    if (!opts.shots.every(n => ALL_FRACTIONS.some(f => f[0] === n))) usage('--shots must be a subset of start, mid, end');
    FRACTIONS.splice(0, FRACTIONS.length, ...ALL_FRACTIONS.filter(f => opts.shots.includes(f[0])));
  }
  return opts;
}

/** Load Playwright from the repo, else from a global install (PLAYWRIGHT_NODE_MODULES or NODE_PATH). */
function loadPlaywright() {
  const req = createRequire(path.join(ROOT, 'package.json'));
  const dirs = [
    process.env.PLAYWRIGHT_NODE_MODULES,
    ...(process.env.NODE_PATH || '').split(path.delimiter),
    '/opt/node-tools/node_modules',
  ].filter(Boolean);
  try {
    return req('playwright');
  } catch (err) {
    for (const d of dirs) {
      try {
        return req(path.join(d, 'playwright'));
      } catch {
        // try the next location
      }
    }
    throw new Error(`cannot load playwright (${err.message}); set PLAYWRIGHT_NODE_MODULES`);
  }
}

/** Tiny static server for the repo root (same pattern as the diagnostic scripts). */
function startServer(root) {
  const server = http.createServer((req, res) => {
    let p;
    try {
      const u = new URL(req.url, 'http://127.0.0.1');
      p = path.normalize(path.join(root, decodeURIComponent(u.pathname)));
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }
    if (!(p === root || p.startsWith(root + path.sep))) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
    if (!fs.existsSync(p) || !fs.statSync(p).isFile()) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(p).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function safeId(id) {
  return String(id).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'chapter';
}

function oneLine(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function escapeCell(text) {
  return oneLine(text).replace(/\|/g, '\\|');
}

function readManifest(file) {
  if (!fs.existsSync(file)) return { entries: {} };
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { entries: {} };
  }
}

function writeManifest(file, manifest) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const sorted = Object.keys(manifest.entries).sort().reduce((acc, k) => ((acc[k] = manifest.entries[k]), acc), {});
  fs.writeFileSync(file, JSON.stringify({ ...manifest, entries: sorted }, null, 2) + '\n');
}

/** Frame wait: five requestAnimationFrame pairs, with a fallback so the wait cannot hang forever. */
const FRAME_WAIT = `new Promise(resolve => {
  let pairs = 0;
  const timer = setTimeout(() => resolve(-1), 240000);
  const pair = () => requestAnimationFrame(() => requestAnimationFrame(() => {
    pairs++;
    if (pairs >= ${FRAME_PAIRS}) { clearTimeout(timer); resolve(pairs); } else pair();
  }));
  pair();
})`;

const READ_STATE = `(() => {
  const s = window.helix.storyScene.state();
  return { chapterIndex: s.chapterIndex, t: s.t, duration: s.duration, caption: s.caption,
           phase: s.phase, mode: s.mode, cameraOption: s.cameraOption };
})()`;

const READ_CHAPTERS = `window.helix.storyScene.state().chapters.map(c => ({ index: c.index, id: c.id, title: c.title, t0: c.t0, t1: c.t1 }))`;

async function captureDevice({ browser, devicesPreset, baseUrl, opts, device, log }) {
  const preset = device === 'desktop'
    ? { viewport: { width: 1280, height: 800 } }
    : (({ defaultBrowserType, ...rest }) => rest)(devicesPreset['iPhone 13']);
  const ctx = await browser.newContext({ ...preset, deviceScaleFactor: opts.dsf });
  const page = await ctx.newPage();
  const errors = [];
  let phase = 'load';
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push({ kind: 'console', phase, text: oneLine(msg.text()) });
  });
  page.on('pageerror', err => errors.push({ kind: 'pageerror', phase, text: oneLine(err.message) }));

  const modeDir = path.join(opts.out, opts.mode, device);
  const manifestFile = path.join(modeDir, 'manifest.json');
  const manifest = readManifest(manifestFile);
  manifest.mode = opts.mode;
  manifest.device = device;
  manifest.dsf = opts.dsf;
  manifest.viewport = preset.viewport;
  manifest.userAgent = preset.userAgent ?? null;
  const failures = [];
  let shots = 0;

  try {
    const url = `${baseUrl}/index.html?mode=express&chapter=1&frac=0.5&paused=1&quality=medium`;
    log(`[${device}] open ${url}`);
    await page.goto(url, { waitUntil: 'load', timeout: LOAD_TIMEOUT });
    await page.waitForFunction('window.helix && window.helix.storyScene', null, { timeout: LOAD_TIMEOUT });

    if (opts.mode === 'coupled') {
      phase = 'setMode';
      await page.evaluate(`window.helix.storyScene.setMode('coupled')`);
    }
    const chapters = await page.evaluate(READ_CHAPTERS);
    let wanted = opts.chapters;
    if (!wanted) {
      const last = opts.mode === 'coupled' ? Math.min(COUPLED_LAST_CHAPTER, chapters.length) : chapters.length;
      wanted = Array.from({ length: last }, (_, i) => i + 1);
    }
    log(`[${device}] ${opts.mode}: ${chapters.length} chapters in story`);

    let closed = false;
    for (const n of wanted) {
      if (closed) break;
      const ch = chapters[n - 1];
      if (!ch) {
        failures.push({ chapter: n, reason: `no chapter ${n} (story has ${chapters.length})` });
        log(`[${device}] ch${n}: SKIP, story has ${chapters.length} chapters`);
        continue;
      }
      if (opts.mode === 'coupled' && n > COUPLED_LAST_CHAPTER) {
        log(`[${device}] ch${n} ${ch.id}: SKIP, coupled choreography after chapter ${COUPLED_LAST_CHAPTER} is not implemented (R3-S5, ST9)`);
        continue;
      }
      const nn = String(n).padStart(2, '0');
      for (const [name, frac] of FRACTIONS) {
        const started = Date.now();
        const rel = `${opts.mode}/${device}/ch${nn}-${safeId(ch.id)}-${name}.jpg`;
        const file = path.join(opts.out, rel);
        try {
          phase = `ch${nn}-${name}`;
          await page.evaluate(`window.helix.storyScene.setChapter(${n - 1}, { frac: ${frac}, instantCamera: true }); true`);
          const frames = await page.evaluate(FRAME_WAIT);
          const st = await page.evaluate(READ_STATE);
          const ok = st.chapterIndex === n - 1;
          if (!ok) log(`[${device}] ch${nn} ${name}: WARNING state chapterIndex=${st.chapterIndex}, expected ${n - 1}`);
          fs.mkdirSync(path.dirname(file), { recursive: true });
          await page.screenshot({ path: file, type: 'jpeg', quality: 78, timeout: SHOT_TIMEOUT });
          shots++;
          manifest.entries[rel] = {
            file: rel,
            mode: opts.mode,
            device,
            dsf: opts.dsf,
            chapter: n,
            id: ch.id,
            title: ch.title,
            shot: name,
            targetFrac: frac,
            t: Number(st.t.toFixed(3)),
            chapterIndex: st.chapterIndex,
            stateMatches: ok,
            caption: oneLine(st.caption),
            phase: oneLine(st.phase),
            cameraOption: st.cameraOption ?? null,
            framePairs: frames,
            seconds: Number(((Date.now() - started) / 1000).toFixed(1)),
            capturedAt: new Date().toISOString(),
          };
          writeManifest(manifestFile, manifest);
          log(`[${device}] ch${nn} ${name} t=${st.t.toFixed(3)} idx=${st.chapterIndex} ${ok ? 'ok' : 'STALE'} ${((Date.now() - started) / 1000).toFixed(1)}s ${rel}`);
        } catch (err) {
          failures.push({ chapter: n, shot: name, reason: oneLine(err.message).slice(0, 300) });
          log(`[${device}] ch${nn} ${name}: FAILED ${oneLine(err.message).slice(0, 200)}`);
          if (page.isClosed()) {
            failures.push({ chapter: n, reason: 'browser or page closed; remaining shots of this device not taken' });
            closed = true;
            break;
          }
        }
      }
    }
  } catch (err) {
    failures.push({ chapter: null, reason: `device run aborted: ${oneLine(err.message).slice(0, 300)}` });
    log(`[${device}] ABORTED ${oneLine(err.message).slice(0, 300)}`);
  } finally {
    await ctx.close().catch(() => {});
  }
  return { device, shots, failures, errors };
}

function sheetHtml({ out, mode, device, dsf, entries }) {
  const byChapter = new Map();
  for (const e of entries) {
    if (!byChapter.has(e.chapter)) byChapter.set(e.chapter, { id: e.id, title: e.title, cells: {} });
    byChapter.get(e.chapter).cells[e.shot] = e;
  }
  const cellW = device === 'desktop' ? 360 : 150;
  const cellH = device === 'desktop' ? Math.round(360 * 800 / 1280) : Math.round(150 * 664 / 390);
  const rows = [...byChapter.keys()].sort((a, b) => a - b).map(n => {
    const row = byChapter.get(n);
    const cells = FRACTIONS.map(([name]) => {
      const e = row.cells[name];
      const label = `${String(n).padStart(2, '0')} ${escapeHtml(row.id)}`;
      if (!e) {
        return `<td><div class="miss" style="width:${cellW}px;height:${cellH}px">not captured</div><div class="lab">${label} ${name}</div></td>`;
      }
      const data = fs.readFileSync(path.join(out, e.file)).toString('base64');
      return `<td><img src="data:image/jpeg;base64,${data}" width="${cellW}" height="${cellH}" alt="${label} ${name}">` +
        `<div class="lab">${label} · ${name} · t=${e.t.toFixed(1)} s${e.stateMatches ? '' : ' · STALE'}</div></td>`;
    });
    return `<tr><th>${String(n).padStart(2, '0')}<br><span>${escapeHtml(row.id)}</span></th>${cells.join('')}</tr>`;
  });
  return `<!doctype html><html><head><meta charset="utf-8"><title>sweep ${mode} ${device}</title><style>
body{margin:0;padding:12px;background:#111;color:#eee;font:12px/1.3 sans-serif}
h1{font-size:15px;margin:0 0 8px;font-weight:600}
table{border-collapse:collapse}
td{padding:4px 6px;vertical-align:top}
th{padding:4px 8px 4px 0;text-align:left;white-space:nowrap;font-weight:600}
th span{font-weight:400;color:#aaa}
img{display:block;border:1px solid #333}
.lab{margin-top:3px;white-space:nowrap;color:#ccc}
.miss{display:flex;align-items:center;justify-content:center;background:#2a2a2a;color:#888;border:1px dashed #555}
</style></head><body><h1>${escapeHtml(mode)} · ${escapeHtml(device)} · dsf ${dsf} · Auto camera · start 0.02 / mid 0.5 / end 0.98</h1>
<table>${rows.join('')}</table></body></html>`;
}

async function buildContactSheet({ browser, opts, mode, device, log }) {
  const manifest = readManifest(path.join(opts.out, mode, device, 'manifest.json'));
  const entries = Object.values(manifest.entries).filter(e => e.file && fs.existsSync(path.join(opts.out, e.file)));
  if (!entries.length) return null;
  const html = sheetHtml({ out: opts.out, mode, device, dsf: manifest.dsf ?? opts.dsf, entries });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  try {
    await page.setContent(html, { waitUntil: 'load', timeout: 120000 });
    const out = path.join(opts.out, `${mode}-${device}-contact.jpg`);
    await page.screenshot({ path: out, type: 'jpeg', quality: 80, fullPage: true, timeout: 180000 });
    log(`contact sheet: ${path.relative(ROOT, out)} (${entries.length} shots)`);
    return out;
  } finally {
    await ctx.close().catch(() => {});
  }
}

function buildIndex(opts) {
  const lines = [
    '# R3-V2 visual evidence sweep: index',
    '',
    'Generated by `tools/evidence/sweep.mjs`. Story time `t` is in seconds at 1x. Caption is the on-screen caption at capture time.',
    'Shots are taken with the camera option `Auto`. Shot names: `start` = frac 0.02, `mid` = 0.5, `end` = 0.98 of each chapter.',
    '',
  ];
  const sheets = [];
  const sections = [];
  for (const mode of MODES) {
    for (const device of DEVICES) {
      const file = path.join(opts.out, mode, device, 'manifest.json');
      if (!fs.existsSync(file)) continue;
      const m = readManifest(file);
      const entries = Object.values(m.entries).sort((a, b) => a.chapter - b.chapter || FRACTIONS.findIndex(f => f[0] === a.shot) - FRACTIONS.findIndex(f => f[0] === b.shot));
      const sheet = `${mode}-${device}-contact.jpg`;
      if (fs.existsSync(path.join(opts.out, sheet))) sheets.push(`- [${sheet}](${sheet})`);
      sections.push(`## ${mode} / ${device} (dsf ${m.dsf ?? '?'}, ${entries.length} shots)`, '',
        '| ch | id | shot | t (s) | state matches | file | caption |', '| --- | --- | --- | --- | --- | --- | --- |');
      for (const e of entries) {
        sections.push(`| ${String(e.chapter).padStart(2, '0')} | ${escapeCell(e.id)} | ${e.shot} | ${e.t.toFixed(3)} | ${e.stateMatches ? 'yes' : 'NO'} | [${e.file}](${e.file}) | ${escapeCell(e.caption)} |`);
      }
      sections.push('');
    }
  }
  if (sheets.length) lines.push('## Contact sheets', '', ...sheets, '');
  lines.push(...sections);
  fs.mkdirSync(opts.out, { recursive: true });
  fs.writeFileSync(path.join(opts.out, 'index.md'), lines.join('\n') + '\n');
  return path.join(opts.out, 'index.md');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const log = msg => console.log(msg);
  const playwright = loadPlaywright();
  const { chromium, devices: devicesPreset } = playwright;
  const server = await startServer(ROOT);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  log(`sweep: mode=${opts.mode} dsf=${opts.dsf} chapters=${opts.chapters ? opts.chapters.join(',') : 'all'} out=${path.relative(ROOT, opts.out) || '.'}`);
  if (opts.dsf === 1) log('note: dsf 1 is a deliberate deviation from PLAN §9.2 rule 6 (2x software-GL capture takes about 45 s); use --dsf 2 --out <dir> for 2x');

  // One browser at a time: each device gets its own launch, so a browser crash cannot take the other device down.
  const results = [];
  let exitCode = 0;
  try {
    for (const device of DEVICES) {
      const browser = await chromium.launch({ args: LAUNCH_ARGS });
      try {
        results.push(await captureDevice({ browser, devicesPreset, baseUrl, opts, device, log }));
      } finally {
        await browser.close().catch(() => {});
      }
    }
    const browser = await chromium.launch({ args: LAUNCH_ARGS });
    try {
      for (const device of DEVICES) {
        await buildContactSheet({ browser, opts, mode: opts.mode, device, log }).catch(err => {
          log(`contact sheet ${opts.mode}/${device} FAILED: ${oneLine(err.message)}`);
          exitCode = 1;
        });
      }
    } finally {
      await browser.close().catch(() => {});
    }
  } finally {
    server.close();
  }

  const indexFile = buildIndex(opts);
  log(`index: ${path.relative(ROOT, indexFile)}`);

  let totalShots = 0;
  let totalFailed = 0;
  let totalConsole = 0;
  let totalPage = 0;
  for (const r of results) {
    const consoleErrs = r.errors.filter(e => e.kind === 'console');
    const pageErrs = r.errors.filter(e => e.kind === 'pageerror');
    totalShots += r.shots;
    totalFailed += r.failures.length;
    totalConsole += consoleErrs.length;
    totalPage += pageErrs.length;
    log(`[${r.device}] shots=${r.shots} failures=${r.failures.length} console_errors=${consoleErrs.length} page_errors=${pageErrs.length}`);
    for (const f of r.failures) log(`[${r.device}] failure: ${JSON.stringify(f)}`);
    for (const e of r.errors.slice(0, 20)) log(`[${r.device}] ${e.kind} (${e.phase}): ${e.text}`);
    if (r.errors.length > 20) log(`[${r.device}] ... ${r.errors.length - 20} more errors`);
  }
  if (totalFailed || totalConsole || totalPage) exitCode = 1;
  log(`sweep: mode=${opts.mode} dsf=${opts.dsf} shots=${totalShots} failed=${totalFailed} console_errors=${totalConsole} page_errors=${totalPage} exit=${exitCode}`);
  process.exitCode = exitCode;
}

main().catch(err => {
  console.error(`sweep: fatal: ${err && err.stack ? err.stack : err}`);
  process.exitCode = 1;
});
