#!/usr/bin/env node
// Browser verification & visual evidence suite for R3-R2 (ActorLayer extensions, crowders, and FxLayer).
// Verifies in headless Chromium:
//   1. dev/actor-card.html loads every committed Wave 1 asset (rnap-ec, rnap-holo, ribosome-70s,
//      trna-init, trna-aa, fixture-machine) with zero errors and draws v2 paths (tunnel, channel) when tracks=1.
//   2. DEC-019 L3 chainColor guard, per-part transform & opacity (sigma release on rnap-holo),
//      pickable: false suppression, multi-site L2 (ribosome-70s decoding + ptc with cutaway), and viewer.setFar.
//   3. FxLayer real-time frame-timestamp timing (bond pulse peak ~200 ms / end ~400 ms +/- 1 frame;
//      GTP -> GDP fade-in 250 ms / steady hold / fade-out 250 ms over 1400 ms +/- 1 frame) + visual rendering.
//   4. 200 crowder instances render in 1 draw call per asset part (renderer.info.render.calls delta = parts count,
//      plus drawElementsInstanced verification in full Viewer), pickable: false, and clean GPU disposal on setCrowd([]).
// Captures 2x 1440x900 JPEG q90 evidence screenshots under docs/evidence/r3/R2/.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

let chromium;
try {
  ({ chromium } = createRequire(import.meta.url)('playwright'));
} catch {
  console.log('RENDER ACTORS SKIPPED: playwright not available');
  process.exit(2);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const evidenceDir = path.join(root, 'docs', 'evidence', 'r3', 'R2');
fs.mkdirSync(evidenceDir, { recursive: true });

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

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

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function attachErrorCollector(page, tag, errors) {
  page.on('pageerror', err => errors.push(`[${tag}] pageerror: ${err?.message || err}`));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(`[${tag}] console.error: ${msg.text()}`);
  });
  page.on('response', res => {
    if (res.status() >= 400) errors.push(`[${tag}] HTTP ${res.status()} for ${res.url()}`);
  });
}

const PAUSEABLE_RAF_INIT = () => {
  const origRaf = window.requestAnimationFrame.bind(window);
  let paused = false;
  let pending = [];
  window.__setRafPaused = p => {
    paused = !!p;
    if (!paused && pending.length > 0) {
      const list = pending;
      pending = [];
      for (const cb of list) origRaf(cb);
    }
  };
  window.requestAnimationFrame = cb => {
    if (paused) {
      pending.push(cb);
      return pending.length;
    }
    return origRaf(cb);
  };
};

async function waitFrames(page, n = 3) {
  await page.evaluate(count => new Promise(resolve => {
    if (window.__setRafPaused) window.__setRafPaused(false);
    let rem = count;
    const step = () => { if (--rem <= 0) resolve(); else requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }), n);
}

async function captureReadPixels(page, settleFrames = 2, pauseAfter = false) {
  return page.evaluate(({ nFrames, pause }) => new Promise((resolve, reject) => {
    if (window.__setRafPaused) window.__setRafPaused(false);
    let rem = nFrames;
    const step = () => {
      if (rem-- > 0) { requestAnimationFrame(step); return; }
      try {
        const canvas = document.querySelector('canvas');
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        if (!gl) { reject(new Error('No WebGL context')); return; }
        const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
        const buf = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        const gx = 64, gy = 40;
        const grid = new Uint8Array(gx * gy * 3);
        let nonBg = 0, bright = 0;
        for (let j = 0; j < gy; j++) {
          const y = Math.min(h - 1, Math.floor(((j + 0.5) / gy) * h));
          for (let i = 0; i < gx; i++) {
            const x = Math.min(w - 1, Math.floor(((i + 0.5) / gx) * w));
            const o = (y * w + x) * 4;
            const r = buf[o], g = buf[o + 1], b = buf[o + 2];
            const dst = (j * gx + i) * 3;
            grid[dst] = r; grid[dst + 1] = g; grid[dst + 2] = b;
            const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            if (lum > 40) nonBg++;
            if (lum > 95) bright++;
          }
        }
        if (pause && window.__setRafPaused) window.__setRafPaused(true);
        resolve({ w, h, gx, gy, nonBg, bright, grid: Array.from(grid) });
      } catch (e) {
        reject(e);
      }
    };
    requestAnimationFrame(step);
  }), { nFrames: settleFrames, pause: pauseAfter });
}

function gridDiffPct(a, b, threshold = 8) {
  const n = a.gx * a.gy;
  let diff = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    if (
      Math.abs(a.grid[o] - b.grid[o]) > threshold ||
      Math.abs(a.grid[o + 1] - b.grid[o + 1]) > threshold ||
      Math.abs(a.grid[o + 2] - b.grid[o + 2]) > threshold
    ) diff++;
  }
  return (diff / n) * 100;
}

async function takeEvidence(page, filename) {
  const outPath = path.join(evidenceDir, filename);
  await page.screenshot({ path: outPath, type: 'jpeg', quality: 90, animations: 'allow', timeout: 60000 });
  return outPath;
}

const server = await startServer();
const { port } = server.address();
const baseUrl = `http://127.0.0.1:${port}`;
const browser = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

const errors = [];
const summary = {};

try {
  // ============================================================================
  // TEST 1: Actor card loads all Wave 1 assets + v2 paths (tunnel & channel)
  // ============================================================================
  console.log('\n[Test 1] Actor card — all Wave 1 assets & v2 paths...');
  {
    const ctxFast = await browser.newContext({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
    await ctxFast.addInitScript(PAUSEABLE_RAF_INIT);
    const page = await ctxFast.newPage();
    attachErrorCollector(page, 'test1-assets', errors);

    const wave1Assets = ['rnap-ec', 'rnap-holo', 'ribosome-70s', 'trna-init', 'trna-aa', 'fixture-machine'];
    summary.assetsLoaded = [];

    for (const id of wave1Assets) {
      await page.goto(`${baseUrl}/dev/actor-card.html?asset=${id}&quality=low`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => Boolean(window.viewer && window.asset), null, { polling: 100, timeout: 90000 });
      const snap = await captureReadPixels(page, 2, true);
      const info = await page.evaluate(() => ({
        id: window.asset.id,
        version: window.asset.version,
        state: window.viewer.getActorState()[0],
      }));
      assert(info.id === id, `Expected asset id ${id}, got ${info.id}`);
      assert(snap.nonBg > 20, `Asset ${id} rendered too few non-bg pixels (${snap.nonBg})`);
      summary.assetsLoaded.push({ id, version: info.version, nonBg: snap.nonBg, level: info.state?.level });
      console.log(`  loaded ${id} (v${info.version}): level=${info.state?.level}, nonBg=${snap.nonBg}`);
      await page.evaluate(() => window.viewer?.dispose?.());
    }

    // Verify v2 path rendering on fixture-machine (tracks=0 vs tracks=1)
    await page.goto(`${baseUrl}/dev/actor-card.html?asset=fixture-machine&lod=l1&tracks=0&quality=low`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.viewer && window.asset), null, { polling: 100, timeout: 90000 });
    const fixNoTracks = await captureReadPixels(page, 2, true);
    await page.evaluate(() => window.viewer?.dispose?.());

    await page.goto(`${baseUrl}/dev/actor-card.html?asset=fixture-machine&lod=l1&tracks=1&quality=low`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.viewer && window.asset), null, { polling: 100, timeout: 90000 });
    const fixWithTracks = await captureReadPixels(page, 2, true);
    const fixPathInfo = await page.evaluate(() => ({
      pathGroups: (window.pathGroups || []).map(g => ({ id: g.id, count: g.count })),
      labels: [...document.querySelectorAll('.hx-tag')].map(el => el.textContent),
    }));
    assert(fixPathInfo.pathGroups.some(g => g.id === 'path:channel' && g.count >= 2), 'fixture-machine path:channel missing');
    assert(fixPathInfo.labels.includes('channel start') && fixPathInfo.labels.includes('channel end'), 'channel endpoint labels missing');
    assert(gridDiffPct(fixNoTracks, fixWithTracks) > 0.5, 'tracks=1 did not change rendered pixels on fixture-machine');
    console.log(`  fixture-machine tracks=1: pathGroups=${JSON.stringify(fixPathInfo.pathGroups)}, diff=${gridDiffPct(fixNoTracks, fixWithTracks).toFixed(2)}%`);
    await ctxFast.close();

    // Verify ribosome-70s v2 paths.tunnel with tracks=1&anchors=1&cutaway=ptc and capture Evidence 1 (2x 1440x900)
    const ctxEv1 = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    await ctxEv1.addInitScript(PAUSEABLE_RAF_INIT);
    const pageEv1 = await ctxEv1.newPage();
    attachErrorCollector(pageEv1, 'test1-ribosome', errors);

    await pageEv1.goto(`${baseUrl}/dev/actor-card.html?asset=ribosome-70s&lod=l2&tracks=1&anchors=1&cutaway=ptc&zoom=0.72&quality=medium`, { waitUntil: 'domcontentloaded' });
    await pageEv1.waitForFunction(() => Boolean(window.viewer && window.asset), null, { polling: 100, timeout: 90000 });
    const riboSnap = await captureReadPixels(pageEv1, 1, true);
    const riboPathInfo = await pageEv1.evaluate(() => ({
      pathGroups: (window.pathGroups || []).map(g => ({ id: g.id, count: g.count })),
      labels: [...document.querySelectorAll('.hx-tag')].map(el => el.textContent),
      actorState: window.viewer.getActorState()[0],
    }));
    assert(riboPathInfo.pathGroups.some(g => g.id === 'path:tunnel' && g.count >= 50), 'ribosome-70s path:tunnel missing');
    assert(riboPathInfo.labels.includes('tunnel start') && riboPathInfo.labels.includes('tunnel end'), 'tunnel endpoint labels missing');
    assert(riboSnap.nonBg > 100, `ribosome-70s nonBg too low (${riboSnap.nonBg})`);
    await takeEvidence(pageEv1, 'actor-card-ribosome-tunnel.jpg');
    console.log(`  ribosome-70s tunnel: count=${riboPathInfo.pathGroups[0].count}, level=${riboPathInfo.actorState.level}, evidence saved`);

    await ctxEv1.close();
  }

  // ============================================================================
  // TEST 2: DEC-019 chainColor, per-part transform/opacity, pickable:false,
  //         multi-site L2 (decoding + ptc), and viewer.setFar
  // ============================================================================
  console.log('\n[Test 2] chainColor (DEC-019), per-part transform/opacity, pickable:false, multi-site L2, setFar...');
  {
    // 2a-2e functional checks at fast 1x viewport
    const ctxFast = await browser.newContext({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
    await ctxFast.addInitScript(PAUSEABLE_RAF_INIT);
    const page = await ctxFast.newPage();
    attachErrorCollector(page, 'test2-func', errors);

    await page.goto(`${baseUrl}/dev/actor-card.html?asset=rnap-holo&lod=l1&zoom=1.08&quality=low`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.viewer && window.asset), null, { polling: 100, timeout: 90000 });

    // 2a. DEC-019 L3 chainColor guard check
    const colorCheck = await page.evaluate(async () => {
      const { chainColor, ACTOR_TOKENS } = await import('../js/render/actors.js');
      return {
        rf1Alpha: chainColor({ name: 'Peptide chain release factor 1 alpha-helix domain', class: 'protein' }, 'body', 'rf1'),
        rf1Expected: ACTOR_TOKENS.actorColor.rf1,
        eftuBeta: chainColor({ name: 'Elongation factor Tu beta-barrel', class: 'protein' }, 'body', 'ef-tu'),
        eftuExpected: ACTOR_TOKENS.actorColor['ef-tu'],
        efgAlpha: chainColor({ name: 'Elongation factor G alpha/beta domain', class: 'protein' }, 'body', 'ef-g'),
        efgExpected: ACTOR_TOKENS.actorColor['ef-g'],
        if2Sigma: chainColor({ name: 'Translation initiation factor IF-2 sigma-like', class: 'protein' }, 'body', 'if2'),
        if2Expected: ACTOR_TOKENS.actorColor.if2,
        nusgOmega: chainColor({ name: 'Transcription termination factor NusG omega loop', class: 'protein' }, 'body', 'nusg'),
        nusgExpected: ACTOR_TOKENS.actorColor.nusg,
        rnapBetaPrime: chainColor({ name: 'DNA-directed RNA polymerase subunit beta prime', class: 'protein' }, 'core', 'rnap-ec'),
        rnapBetaPrimeExpected: ACTOR_TOKENS.chainTint.betaPrime,
        rnapAlpha: chainColor({ name: 'DNA-directed RNA polymerase subunit alpha', class: 'protein' }, 'core', 'rnap-holo'),
        rnapAlphaExpected: ACTOR_TOKENS.chainTint.alpha,
      };
    });
    assert(colorCheck.rf1Alpha === colorCheck.rf1Expected, `DEC-019 fail: rf1 got 0x${colorCheck.rf1Alpha.toString(16)}`);
    assert(colorCheck.eftuBeta === colorCheck.eftuExpected, `DEC-019 fail: ef-tu got 0x${colorCheck.eftuBeta.toString(16)}`);
    assert(colorCheck.efgAlpha === colorCheck.efgExpected, `DEC-019 fail: ef-g got 0x${colorCheck.efgAlpha.toString(16)}`);
    assert(colorCheck.if2Sigma === colorCheck.if2Expected, `DEC-019 fail: if2 got 0x${colorCheck.if2Sigma.toString(16)}`);
    assert(colorCheck.nusgOmega === colorCheck.nusgExpected, `DEC-019 fail: nusg got 0x${colorCheck.nusgOmega.toString(16)}`);
    assert(colorCheck.rnapBetaPrime === colorCheck.rnapBetaPrimeExpected, 'RNAP betaPrime tint regression');
    assert(colorCheck.rnapAlpha === colorCheck.rnapAlphaExpected, 'RNAP alpha tint regression');
    console.log('  DEC-019 L3 chainColor guard verified for rf1/ef-tu/ef-g/if2/nusg & RNAP');

    // 2b. Per-part transform + opacity + visible:false on rnap-holo sigma
    const holoBase = await captureReadPixels(page, 2, true);
    await page.evaluate(() => {
      const a = window.asset;
      window.viewer.setActors([{
        id: a.id,
        asset: a,
        transform: { o: [0, 0, 0], R: [1, 0, 0, 0, 1, 0, 0, 0, 1] },
        lod: 'l1',
        label: a.name,
        pickable: true,
        parts: {
          core: { visible: true, opacity: 1 },
          sigma: {
            visible: true,
            opacity: 0.65,
            transform: { o: [42, 32, 18], R: [1, 0, 0, 0, 1, 0, 0, 0, 1] },
          },
        },
      }]);
    });
    const holoShifted = await captureReadPixels(page, 2, true);
    const shiftDiff = gridDiffPct(holoBase, holoShifted);
    assert(shiftDiff > 1.5, `Per-part sigma transform did not change pixels enough (${shiftDiff.toFixed(2)}%)`);

    await page.evaluate(() => {
      const a = window.asset;
      window.viewer.setActors([{
        id: a.id,
        asset: a,
        transform: { o: [0, 0, 0], R: [1, 0, 0, 0, 1, 0, 0, 0, 1] },
        lod: 'l1',
        label: a.name,
        pickable: true,
        parts: { core: { visible: true, opacity: 1 }, sigma: { visible: false } },
      }]);
    });
    const holoHidden = await captureReadPixels(page, 2, true);
    const hideDiff = gridDiffPct(holoShifted, holoHidden);
    assert(hideDiff > 0.5, `Per-part sigma visible:false did not change pixels (${hideDiff.toFixed(2)}%)`);
    console.log(`  per-part sigma transform diff=${shiftDiff.toFixed(2)}%, hide diff=${hideDiff.toFixed(2)}%`);

    // 2c. pickable: true vs pickable: false
    await page.evaluate(() => {
      const a = window.asset;
      window.viewer.setActors([{
        id: a.id, asset: a, transform: { o: [0, 0, 0], R: [1, 0, 0, 0, 1, 0, 0, 0, 1] },
        lod: 'l1', label: a.name, pickable: true,
      }]);
      window.lastPick = undefined;
    });
    await captureReadPixels(page, 2, true);
    await page.mouse.click(480, 300);
    await page.waitForTimeout(50);
    const pickTrue = await page.evaluate(() => window.lastPick);
    assert(pickTrue && pickTrue.actor === 'rnap-holo', `Expected pick on rnap-holo when pickable:true, got ${JSON.stringify(pickTrue)}`);

    await page.evaluate(() => {
      const a = window.asset;
      window.viewer.setActors([{
        id: a.id, asset: a, transform: { o: [0, 0, 0], R: [1, 0, 0, 0, 1, 0, 0, 0, 1] },
        lod: 'l1', label: a.name, pickable: false,
      }]);
      window.lastPick = undefined;
    });
    await captureReadPixels(page, 2, true);
    await page.mouse.click(480, 300);
    await page.waitForTimeout(50);
    const pickFalse = await page.evaluate(() => window.lastPick);
    assert(pickFalse === null, `Expected null pick when pickable:false, got ${JSON.stringify(pickFalse)}`);
    console.log(`  pickable:true -> ${JSON.stringify(pickTrue)}, pickable:false -> ${JSON.stringify(pickFalse)}`);

    // 2d. viewer.setFar
    const farCheck = await page.evaluate(() => {
      const f0 = window.viewer.camera.far;
      const p0 = window.viewer.camera.projectionMatrix.elements[10];
      window.viewer.setFar(20000);
      const f1 = window.viewer.camera.far;
      const p1 = window.viewer.camera.projectionMatrix.elements[10];
      window.viewer.setFar(12000);
      const f2 = window.viewer.camera.far;
      return { f0, f1, f2, projChanged: p0 !== p1 };
    });
    assert(farCheck.f0 === 12000 && farCheck.f1 === 20000 && farCheck.f2 === 12000 && farCheck.projChanged,
      `setFar check failed: ${JSON.stringify(farCheck)}`);
    console.log(`  setFar verified: ${farCheck.f0} -> ${farCheck.f1} -> ${farCheck.f2} (projChanged=${farCheck.projChanged})`);
    await page.evaluate(() => window.viewer?.dispose?.());

    // 2e. Multi-site L2 on ribosome-70s (decoding + ptc) with cutaway (medium tier so auto selects L2)
    await page.goto(`${baseUrl}/dev/actor-card.html?asset=ribosome-70s&lod=auto&cutaway=decoding&focus=decoding&focusRadius=22&quality=medium`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.viewer && window.asset), null, { polling: 100, timeout: 90000 });
    const decSnap = await captureReadPixels(page, 2, true);
    const decState = await page.evaluate(() => window.viewer.getActorState()[0]);
    assert(decState.level === 'l2', `Expected L2 at decoding site, got ${JSON.stringify(decState)}`);
    assert(decSnap.nonBg > 80, `decoding L2 render too empty (${decSnap.nonBg})`);

    await page.evaluate(() => {
      const a = window.asset;
      window.viewer.setActors([{
        id: a.id, asset: a, transform: { o: [0, 0, 0], R: [1, 0, 0, 0, 1, 0, 0, 0, 1] },
        lod: 'auto', cutaway: 'ptc', label: a.name,
      }]);
      window.viewer.focus({ center: a.anchors.ptc.o, radius: 22 }, { duration: 0 });
    });
    const ptcSnap = await captureReadPixels(page, 2, true);
    const ptcState = await page.evaluate(() => window.viewer.getActorState()[0]);
    assert(ptcState.level === 'l2', `Expected L2 at ptc site, got ${JSON.stringify(ptcState)}`);
    assert(ptcSnap.nonBg > 80, `ptc L2 render too empty (${ptcSnap.nonBg})`);
    assert(gridDiffPct(decSnap, ptcSnap) > 5, 'decoding and ptc L2 views unexpectedly identical');
    console.log(`  ribosome-70s multi-site L2: decoding level=${decState.level} (ratio=${decState.ratio.toFixed(2)}), ptc level=${ptcState.level} (ratio=${ptcState.ratio.toFixed(2)})`);
    await ctxFast.close();

    // Evidence 2 (2x 1440x900 quality=high): rnap-holo sigma release
    const ctxEv2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    await ctxEv2.addInitScript(PAUSEABLE_RAF_INIT);
    const pageEv2 = await ctxEv2.newPage();
    attachErrorCollector(pageEv2, 'test2-evidence', errors);

    await pageEv2.goto(`${baseUrl}/dev/actor-card.html?asset=rnap-holo&lod=l1&zoom=1.18&quality=high`, { waitUntil: 'domcontentloaded' });
    await pageEv2.waitForFunction(() => Boolean(window.viewer && window.asset), null, { polling: 100, timeout: 90000 });
    await pageEv2.evaluate(() => {
      const a = window.asset;
      window.viewer.setActors([{
        id: a.id,
        asset: a,
        transform: { o: [0, 0, 0], R: [1, 0, 0, 0, 1, 0, 0, 0, 1] },
        lod: 'l1',
        label: a.name,
        pickable: true,
        parts: {
          core: { visible: true, opacity: 1 },
          sigma: {
            visible: true,
            opacity: 0.65,
            transform: { o: [42, 32, 18], R: [1, 0, 0, 0, 1, 0, 0, 0, 1] },
          },
        },
      }]);
    });
    await captureReadPixels(pageEv2, 2, true);
    await takeEvidence(pageEv2, 'part-release-sigma.jpg');
    await ctxEv2.close();

    summary.partReleaseDiffPct = Number(shiftDiff.toFixed(2));
  }

  // ============================================================================
  // TEST 3: FxLayer real-time frame-timestamp timing + visual evidence
  // ============================================================================
  console.log('\n[Test 3] FxLayer real-time timing (pulse 400 ms, GTP 1400 ms) & visual evidence...');
  {
    // 3a. Real-time rAF timing measurement on lightweight low-tier scene for high frame rate (~16-30 ms frames)
    const ctxFast = await browser.newContext({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
    const pageFast = await ctxFast.newPage();
    attachErrorCollector(pageFast, 'test3-timing', errors);

    await pageFast.goto(`${baseUrl}/dev/actor-card.html?asset=fixture-machine&lod=l0&tracks=1&quality=low`, { waitUntil: 'domcontentloaded' });
    await pageFast.waitForFunction(() => Boolean(window.viewer && window.asset), null, { polling: 100, timeout: 90000 });
    await waitFrames(pageFast, 4);

    // Measure FxLayer directly inside a real rAF loop driving performance.now() timestamps
    const timing = await pageFast.evaluate(async () => {
      const { FxLayer, FX_PULSE_DURATION_MS, FX_GTP_DURATION_MS, FX_GTP_FADE_MS } = await import('../js/render/fx.js');
      // Test with real viewer.setFx in real-time mode (f omitted -> driven by viewer's rAF `now`)
      const a = window.asset;
      const gtpAnchor = { machineId: a.id, name: 'activeSite' };
      const pulseAtoms = window.asm && window.asm.bonds.length >= 2
        ? [window.asm.bonds[0], window.asm.bonds[1]]
        : null;
      const pulseAnchor = pulseAtoms
        ? { atomGroup: 'assembly', atoms: pulseAtoms }
        : { positions: [a.anchors.activeSite.o, [a.anchors.activeSite.o[0] + 1.6, a.anchors.activeSite.o[1], a.anchors.activeSite.o[2]]] };

      // Also attach a mirrored FxLayer instance bound to the same rAF clock so we can inspect exact scale/whiteMix/opacity
      // alongside the real DOM element rendered by viewer.setFx!
      const t0 = performance.now();
      window.viewer.setFx([
        { type: 'pulse', anchor: pulseAnchor, startTime: t0 },
        { type: 'gtp', anchor: gtpAnchor, startTime: t0 },
      ]);

      // Sample on every rAF for 1650 ms
      const samples = [];
      await new Promise(resolve => {
        const sample = now => {
          const dtMs = now - t0;
          const gtpEl = document.querySelector('[data-fx-type="gtp"]');
          const gtpText = gtpEl ? gtpEl.textContent : null;
          const gtpClass = gtpEl ? gtpEl.className : null;
          const gtpVisible = gtpEl ? gtpEl.style.display !== 'none' : false;
          const gtpOp = gtpEl ? parseFloat(gtpEl.style.opacity || '0') : 0;
          samples.push({ dtMs, gtpText, gtpClass, gtpVisible, gtpOp });
          if (dtMs < 1650) requestAnimationFrame(sample);
          else resolve();
        };
        requestAnimationFrame(sample);
      });

      // Also run a standalone FxLayer timing pass on real rAF timestamps to inspect exact pulseMesh matrix scale & color
      const THREE = await import('three');
      const scratchGroup = new THREE.Group();
      const overlay = document.createElement('div');
      document.body.appendChild(overlay);
      const fx = new FxLayer({
        parent: scratchGroup,
        overlayEl: overlay,
        project: (x, y, z, out) => { out.x = 400; out.y = 300; out.z = 50; out.ok = true; return out; },
        tier: 'low',
      });
      const basePos = [0, 0, 0];
      const basePos2 = [1.5, 0, 0];
      const baseR = 0.54;
      const t1 = performance.now();
      fx.setFx([
        { type: 'pulse', anchor: { positions: [basePos, basePos2], radii: [baseR, baseR], colors: [0x2fd9b9, 0xff9f38] }, startTime: t1 },
        { type: 'gtp', anchor: { position: [0, 5, 0] }, startTime: t1 },
      ]);
      const pulseSamples = [];
      await new Promise(resolve => {
        const step = now => {
          const dtMs = now - t1;
          fx.update(null, 800, 600, {}, now);
          const st = fx.getState();
          const pSt = st[0];
          const matScale = fx.pulseMesh.visible ? fx.pulseMesh.instanceMatrix.array[0] / baseR : 1;
          pulseSamples.push({
            dtMs,
            scale: pSt.scale,
            matScale,
            whiteMix: pSt.whiteMix,
            visible: pSt.visible,
            gtpOp: st[1].opacity,
            gtpVisible: st[1].visible,
          });
          if (dtMs < 550) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      });
      fx.dispose();
      overlay.remove();
      window.viewer.setFx([]);

      return {
        constants: { FX_PULSE_DURATION_MS, FX_GTP_DURATION_MS, FX_GTP_FADE_MS },
        samples,
        pulseSamples,
      };
    });

    // Compute median frame step for +/- 1 frame tolerance
    const frameSteps = (arr) => {
      const ds = [];
      for (let i = 1; i < arr.length; i++) ds.push(arr[i].dtMs - arr[i - 1].dtMs);
      ds.sort((a, b) => a - b);
      return ds[Math.floor(ds.length / 2)] || 20;
    };
    const maxStep = (arr, tTarget) => {
      // Actual frame interval bracketing tTarget
      for (let i = 1; i < arr.length; i++) {
        if (arr[i].dtMs >= tTarget) return Math.max(17, arr[i].dtMs - arr[i - 1].dtMs);
      }
      return frameSteps(arr);
    };

    // Analyze pulse samples
    const pSamples = timing.pulseSamples;
    let peakSample = pSamples[0];
    for (const s of pSamples) if (s.scale > peakSample.scale) peakSample = s;
    const firstDone = pSamples.find(s => s.dtMs > 250 && !s.visible);
    const lastActive = [...pSamples].reverse().find(s => s.visible);
    const pulseStepAtPeak = maxStep(pSamples, 200);
    const pulseStepAtEnd = maxStep(pSamples, 400);

    assert(peakSample.scale >= 1.32 && peakSample.scale <= 1.351, `Pulse peak scale out of range: ${peakSample.scale}`);
    assert(Math.abs(peakSample.matScale - peakSample.scale) < 1e-3, `Pulse GPU matrix scale mismatch: ${peakSample.matScale} vs ${peakSample.scale}`);
    assert(peakSample.whiteMix >= 0.36 && peakSample.whiteMix <= 0.401, `Pulse whiteMix out of range: ${peakSample.whiteMix}`);
    assert(Math.abs(peakSample.dtMs - 200) <= pulseStepAtPeak + 5, `Pulse peak time ${peakSample.dtMs.toFixed(1)} ms not within +/- 1 frame (${pulseStepAtPeak.toFixed(1)} ms) of 200 ms`);
    assert(firstDone && firstDone.dtMs >= 395 && firstDone.dtMs <= 400 + pulseStepAtEnd + 5, `Pulse end time ${firstDone?.dtMs?.toFixed(1)} ms not within +/- 1 frame (${pulseStepAtEnd.toFixed(1)} ms) of 400 ms`);
    assert(lastActive && lastActive.dtMs <= 400 + 2, `Pulse stayed visible past 400 ms (${lastActive.dtMs.toFixed(1)} ms)`);

    // Analyze GTP DOM samples from full Viewer
    const gSamples = timing.samples;
    const gtpLabelSample = gSamples.find(s => s.gtpText);
    assert(gtpLabelSample && gtpLabelSample.gtpText === 'GTP → GDP', `Unexpected GTP label text: ${gtpLabelSample?.gtpText}`);
    assert(gtpLabelSample.gtpClass.includes('hx-tag') && gtpLabelSample.gtpClass.includes('hx-sm'), `GTP class must include hx-tag hx-sm: ${gtpLabelSample.gtpClass}`);

    const firstFull = gSamples.find(s => s.gtpOp >= 0.995);
    const midHold = gSamples.filter(s => s.dtMs >= 300 && s.dtMs <= 1100);
    const firstFadeOut = gSamples.find(s => s.dtMs > 1100 && s.gtpOp < 0.995);
    const firstGtpDone = gSamples.find(s => s.dtMs > 1200 && !s.gtpVisible);
    const gStepIn = maxStep(gSamples, 250);
    const gStepOutStart = maxStep(gSamples, 1150);
    const gStepEnd = maxStep(gSamples, 1400);

    assert(firstFull && firstFull.dtMs >= 220 && firstFull.dtMs <= 250 + gStepIn + 5,
      `GTP fade-in completed at ${firstFull?.dtMs?.toFixed(1)} ms (expected 223..${(250 + gStepIn + 5).toFixed(1)} ms)`);
    assert(midHold.length >= 1 && midHold.every(s => s.gtpVisible && s.gtpOp >= 0.995),
      `GTP did not hold steady at opacity 1 across 300..1100 ms: ${JSON.stringify(midHold)}`);
    assert(firstFadeOut && firstFadeOut.dtMs >= 1145 && firstFadeOut.dtMs <= 1180 + gStepOutStart + 5,
      `GTP fade-out started at ${firstFadeOut?.dtMs?.toFixed(1)} ms (expected 1150..${(1180 + gStepOutStart + 5).toFixed(1)} ms)`);
    assert(firstGtpDone && firstGtpDone.dtMs >= 1395 && firstGtpDone.dtMs <= 1400 + gStepEnd + 5,
      `GTP completed at ${firstGtpDone?.dtMs?.toFixed(1)} ms (expected 1400 ms +/- ${gStepEnd.toFixed(1)} ms)`);

    console.log(`  pulse timing: peak=${peakSample.dtMs.toFixed(1)} ms (scale=${peakSample.scale.toFixed(3)}, whiteMix=${peakSample.whiteMix.toFixed(3)}), end=${firstDone.dtMs.toFixed(1)} ms (frame=${pulseStepAtEnd.toFixed(1)} ms)`);
    console.log(`  GTP timing: fade-in=${firstFull.dtMs.toFixed(1)} ms, hold=${midHold.length} frames @ 1.0, fade-out=${firstFadeOut.dtMs.toFixed(1)} ms, end=${firstGtpDone.dtMs.toFixed(1)} ms (frame=${gStepEnd.toFixed(1)} ms)`);
    summary.fxTiming = {
      pulsePeakMs: Number(peakSample.dtMs.toFixed(1)),
      pulseEndMs: Number(firstDone.dtMs.toFixed(1)),
      pulsePeakScale: Number(peakSample.scale.toFixed(3)),
      gtpFadeInMs: Number(firstFull.dtMs.toFixed(1)),
      gtpFadeOutStartMs: Number(firstFadeOut.dtMs.toFixed(1)),
      gtpEndMs: Number(firstGtpDone.dtMs.toFixed(1)),
    };
    await ctxFast.close();

    // 3b. Visual check + Evidence 3 (bond pulse peak + GTP -> GDP cue on rnap-ec activeSite)
    const ctxVis = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    await ctxVis.addInitScript(PAUSEABLE_RAF_INIT);
    const pageVis = await ctxVis.newPage();
    attachErrorCollector(pageVis, 'test3-visual', errors);

    await pageVis.goto(`${baseUrl}/dev/actor-card.html?asset=rnap-ec&lod=l2&cutaway=1&tracks=1&focus=activeSite&focusRadius=32&quality=medium`, { waitUntil: 'domcontentloaded' });
    await pageVis.waitForFunction(() => Boolean(window.viewer && window.asset && window.asm), null, { polling: 100, timeout: 90000 });
    const fxBefore = await captureReadPixels(pageVis, 1, true);

    // Find two bonded atoms closest to activeSite on the RNA strand (or any bonded pair closest to activeSite)
    await pageVis.evaluate(() => {
      const a = window.asset, asm = window.asm, site = a.anchors.activeSite.o;
      let bestPair = [asm.bonds[0], asm.bonds[1]], bestD = Infinity;
      const pos = asm.atoms.pos;
      for (let i = 0; i < asm.bonds.length; i += 2) {
        const u = asm.bonds[i], v = asm.bonds[i + 1];
        const mx = (pos[u * 3] + pos[v * 3]) * 0.5 - site[0];
        const my = (pos[u * 3 + 1] + pos[v * 3 + 1]) * 0.5 - site[1];
        const mz = (pos[u * 3 + 2] + pos[v * 3 + 2]) * 0.5 - site[2];
        const d = mx * mx + my * my + mz * mz;
        if (d < bestD) { bestD = d; bestPair = [u, v]; }
      }
      window.viewer.setFx([
        { type: 'pulse', anchor: { atomGroup: 'assembly', atoms: bestPair }, f: 0.5 },
        { type: 'gtp', anchor: { machineId: a.id, name: 'activeSite' }, f: 0.5 },
      ]);
    });
    const fxPeak = await captureReadPixels(pageVis, 1, true);
    const pulseDiff = gridDiffPct(fxBefore, fxPeak, 4);
    const gtpVisInfo = await pageVis.evaluate(() => {
      const el = document.querySelector('[data-fx-type="gtp"]');
      return el ? { text: el.textContent, display: el.style.display, opacity: el.style.opacity } : null;
    });
    assert(gtpVisInfo && gtpVisInfo.text === 'GTP → GDP' && gtpVisInfo.display !== 'none' && parseFloat(gtpVisInfo.opacity) >= 0.99,
      `GTP cue not visible at f=0.5: ${JSON.stringify(gtpVisInfo)}`);
    assert(pulseDiff > 0, `Bond pulse at f=0.5 produced zero pixel difference`);
    await takeEvidence(pageVis, 'fx-pulse-gtp.jpg');
    console.log(`  FX visual evidence saved (pulse pixel diff=${pulseDiff.toFixed(2)}%, GTP label=${gtpVisInfo.text} @ opacity ${gtpVisInfo.opacity})`);
    await ctxVis.close();
  }

  // ============================================================================
  // TEST 4: 200 crowder instances — 1 draw call per asset part + clean disposal
  // ============================================================================
  console.log('\n[Test 4] 200 crowder instances — draw calls & GPU disposal...');
  {
    // 4a. Direct THREE.WebGLRenderer + ActorLayer exact renderer.info.render.calls test & pickable/disposal check (1x fast context)
    const ctxFast = await browser.newContext({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
    await ctxFast.addInitScript(PAUSEABLE_RAF_INIT);
    const page = await ctxFast.newPage();
    attachErrorCollector(page, 'test4-crowd-func', errors);

    await page.goto(`${baseUrl}/dev/actor-card.html?asset=ribosome-70s&lod=l1&zoom=2.2&quality=low`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.viewer && window.asset), null, { polling: 100, timeout: 90000 });
    const baseState = await page.evaluate(() => window.viewer.getState());
    const viewerBefore = await captureReadPixels(page, 2, true);

    const drawCallCheck = await page.evaluate(async () => {
      const THREE = await import('three');
      const { ActorLayer, crowdColor, partColor, ACTOR_TOKENS } = await import('../js/render/actors.js');
      const { loadAssets } = await import('../js/assets/registry.js');
      const assets = await loadAssets(['rnap-ec', 'ribosome-70s', 'trna-aa']);

      const canvas = document.createElement('canvas');
      canvas.width = 256; canvas.height = 256;
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(40, 1, 1, 12000);
      camera.position.set(0, 0, 1400);
      camera.lookAt(0, 0, 0);

      const layer = new ActorLayer(scene, 'high');
      renderer.render(scene, camera);
      const baseCalls = renderer.info.render.calls;
      const baseGeos = renderer.info.memory.geometries;

      // Deterministic 200-instance Float32Array (16 floats per instance, Three.js column-major Matrix4)
      const makeTransforms = (n, seed = 19) => {
        let s = seed >>> 0;
        const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
        const buf = new Float32Array(n * 16);
        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const pos = new THREE.Vector3();
        const sc = new THREE.Vector3(1, 1, 1);
        for (let i = 0; i < n; i++) {
          const theta = rand() * Math.PI * 2;
          const phi = Math.acos(2 * rand() - 1);
          const rad = 260 + rand() * 520;
          pos.set(rad * Math.sin(phi) * Math.cos(theta), rad * Math.sin(phi) * Math.sin(theta), rad * Math.cos(phi));
          q.setFromEuler(new THREE.Euler(rand() * Math.PI * 2, rand() * Math.PI * 2, rand() * Math.PI * 2));
          m.compose(pos, q, sc);
          m.toArray(buf, i * 16);
        }
        return buf;
      };
      const t200 = makeTransforms(200, 19);

      // 200 rnap-ec instances (1 L0 part) -> +1 draw call
      layer.setCrowd([{ assetId: 'rnap-ec', asset: assets['rnap-ec'], transforms: t200 }]);
      renderer.render(scene, camera);
      const rnapCalls = renderer.info.render.calls - baseCalls;
      const rnapParts = assets['rnap-ec'].lod0.length;
      const rnapCrowdRec = layer.crowdRecords.get('rnap-ec');
      const rnapMat = rnapCrowdRec.mats[0];
      const matCheck = {
        opacity: rnapMat.opacity,
        transparent: rnapMat.transparent,
        depthWrite: rnapMat.depthWrite,
        roughness: rnapMat.roughness,
        metalness: rnapMat.metalness,
        colorHex: rnapMat.color.getHex(),
        expectedHex: crowdColor(partColor('core', 'rnap-ec')),
        expectedOpacity: ACTOR_TOKENS.crowd.opacity,
      };

      // 200 ribosome-70s instances (2 L0 parts: small + large) -> +2 draw calls
      layer.setCrowd([{ assetId: 'ribosome-70s', asset: assets['ribosome-70s'], transforms: t200 }]);
      renderer.render(scene, camera);
      const riboCalls = renderer.info.render.calls - baseCalls;
      const riboParts = assets['ribosome-70s'].lod0.length;

      // 200 trna-aa instances (2 L0 parts: body + anticodon) -> +2 draw calls
      layer.setCrowd([{ assetId: 'trna-aa', asset: assets['trna-aa'], transforms: t200 }]);
      renderer.render(scene, camera);
      const trnaCalls = renderer.info.render.calls - baseCalls;
      const trnaParts = assets['trna-aa'].lod0.length;

      // Clear crowders -> restore baseline calls and geometries
      layer.setCrowd([]);
      renderer.render(scene, camera);
      const clearedCalls = renderer.info.render.calls;
      const clearedGeos = renderer.info.memory.geometries;

      layer.dispose();
      renderer.dispose();
      renderer.forceContextLoss?.();

      return {
        baseCalls, baseGeos,
        rnapCalls, rnapParts,
        riboCalls, riboParts,
        trnaCalls, trnaParts,
        clearedCalls, clearedGeos,
        matCheck,
      };
    });

    assert(drawCallCheck.rnapCalls === drawCallCheck.rnapParts && drawCallCheck.rnapParts === 1,
      `200 rnap-ec crowders expected 1 draw call, got ${drawCallCheck.rnapCalls}`);
    assert(drawCallCheck.riboCalls === drawCallCheck.riboParts && drawCallCheck.riboParts === 2,
      `200 ribosome-70s crowders expected 2 draw calls, got ${drawCallCheck.riboCalls}`);
    assert(drawCallCheck.trnaCalls === drawCallCheck.trnaParts,
      `200 trna-aa crowders expected ${drawCallCheck.trnaParts} draw calls, got ${drawCallCheck.trnaCalls}`);
    assert(drawCallCheck.clearedCalls === drawCallCheck.baseCalls,
      `setCrowd([]) did not restore draw calls: ${drawCallCheck.clearedCalls} vs ${drawCallCheck.baseCalls}`);
    assert(drawCallCheck.clearedGeos === drawCallCheck.baseGeos,
      `setCrowd([]) leaked GPU geometries: ${drawCallCheck.clearedGeos} vs ${drawCallCheck.baseGeos}`);
    assert(
      Math.abs(drawCallCheck.matCheck.opacity - drawCallCheck.matCheck.expectedOpacity) < 1e-6 &&
      drawCallCheck.matCheck.transparent === true &&
      drawCallCheck.matCheck.depthWrite === false &&
      Math.abs(drawCallCheck.matCheck.roughness - 0.65) < 1e-6 &&
      drawCallCheck.matCheck.metalness === 0 &&
      drawCallCheck.matCheck.colorHex === drawCallCheck.matCheck.expectedHex,
      `Crowder material token mismatch: ${JSON.stringify(drawCallCheck.matCheck)}`,
    );
    console.log(`  renderer.info.render.calls delta: 200 rnap-ec = +${drawCallCheck.rnapCalls} (1 part), 200 ribosome-70s = +${drawCallCheck.riboCalls} (2 parts), 200 trna-aa = +${drawCallCheck.trnaCalls} (${drawCallCheck.trnaParts} parts); cleared geos=${drawCallCheck.clearedGeos}`);

    // 4b. Full Viewer drawElementsInstanced(200) + visual diff + pickable:false + GPU geometry restoration
    const instancedStats = await page.evaluate(async () => {
      const THREE = await import('three');
      const { loadAssets } = await import('../js/assets/registry.js');
      const assets = await loadAssets(['rnap-ec', 'ribosome-70s', 'trna-aa']);

      const makeShell = (n, rMin, rMax, seed) => {
        let s = seed >>> 0;
        const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
        const buf = new Float32Array(n * 16);
        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
        for (let i = 0; i < n; i++) {
          const theta = rand() * Math.PI * 2;
          const phi = Math.acos(2 * rand() - 1);
          const r = rMin + rand() * (rMax - rMin);
          p.set(
            48 + r * Math.sin(phi) * Math.cos(theta) * 1.25,
            r * Math.sin(phi) * Math.sin(theta) * 0.9,
            r * Math.cos(phi) * 0.95,
          );
          q.setFromEuler(new THREE.Euler(rand() * Math.PI * 2, rand() * Math.PI * 2, rand() * Math.PI * 2));
          m.compose(p, q, sc);
          m.toArray(buf, i * 16);
        }
        return buf;
      };

      const gl = window.viewer.canvas.getContext('webgl2');
      const origInstanced = gl.drawElementsInstanced.bind(gl);
      const counts = [];
      gl.drawElementsInstanced = function(mode, count, type, offset, instanceCount) {
        counts.push(instanceCount);
        return origInstanced(mode, count, type, offset, instanceCount);
      };

      window.viewer.setCrowd([{ assetId: 'rnap-ec', asset: assets['rnap-ec'], transforms: makeShell(200, 260, 720, 77) }]);
      if (window.__setRafPaused) window.__setRafPaused(false);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      if (window.__setRafPaused) window.__setRafPaused(true);
      gl.drawElementsInstanced = origInstanced;
      const calls200 = counts.filter(c => c === 200).length;
      return { calls200 };
    });

    assert(instancedStats.calls200 >= 1, `Expected WebGL drawElementsInstanced(..., 200), observed ${instancedStats.calls200}`);
    const viewerCrowd = await captureReadPixels(page, 2, true);
    const crowdDiff = gridDiffPct(viewerBefore, viewerCrowd, 4);
    assert(crowdDiff > 5, `200 crowders produced too little visual change (${crowdDiff.toFixed(2)}%)`);

    // Verify crowders are not pickable (hide main actor, click center where crowders sit)
    await page.evaluate(() => {
      const a = window.asset;
      window.viewer.setActors([{ id: a.id, asset: a, transform: { o: [0, 0, 0], R: [1, 0, 0, 0, 1, 0, 0, 0, 1] }, visible: false }]);
      window.lastPick = undefined;
    });
    await captureReadPixels(page, 2, true);
    await page.mouse.click(480, 300);
    await page.waitForTimeout(50);
    const crowdPick = await page.evaluate(() => window.lastPick);
    assert(crowdPick === null, `Crowders must not be pickable, got ${JSON.stringify(crowdPick)}`);

    // Clear crowders in Viewer and verify GPU geometry count returns to baseline
    await page.evaluate(() => { window.viewer.setCrowd([]); });
    await captureReadPixels(page, 2, true);
    const afterClearState = await page.evaluate(() => window.viewer.getState());
    assert(afterClearState.memory.geometries === baseState.memory.geometries,
      `Viewer setCrowd([]) leaked geometries: ${afterClearState.memory.geometries} vs ${baseState.memory.geometries}`);
    console.log(`  Viewer setCrowd verified: 200-instance GL calls=${instancedStats.calls200}, crowd visual diff=${crowdDiff.toFixed(2)}%, crowd pick=null, geometries restored=${afterClearState.memory.geometries}`);
    await ctxFast.close();

    // 4c. Evidence 4 (2x 1440x900 quality=high): 200 crowders around central ribosome-70s
    const ctxEv4 = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    await ctxEv4.addInitScript(PAUSEABLE_RAF_INIT);
    const pageEv4 = await ctxEv4.newPage();
    attachErrorCollector(pageEv4, 'test4-evidence', errors);

    await pageEv4.goto(`${baseUrl}/dev/actor-card.html?asset=ribosome-70s&lod=l1&zoom=2.2&quality=low`, { waitUntil: 'domcontentloaded' });
    await pageEv4.waitForFunction(() => Boolean(window.viewer && window.asset), null, { polling: 100, timeout: 90000 });
    await pageEv4.evaluate(async () => {
      const THREE = await import('three');
      const { loadAssets } = await import('../js/assets/registry.js');
      const assets = await loadAssets(['rnap-ec', 'ribosome-70s', 'trna-aa']);
      const makeShell = (n, rMin, rMax, seed) => {
        let s = seed >>> 0;
        const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
        const buf = new Float32Array(n * 16);
        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
        for (let i = 0; i < n; i++) {
          const theta = rand() * Math.PI * 2;
          const phi = Math.acos(2 * rand() - 1);
          const r = rMin + rand() * (rMax - rMin);
          p.set(
            48 + r * Math.sin(phi) * Math.cos(theta) * 1.25,
            r * Math.sin(phi) * Math.sin(theta) * 0.9,
            r * Math.cos(phi) * 0.95,
          );
          q.setFromEuler(new THREE.Euler(rand() * Math.PI * 2, rand() * Math.PI * 2, rand() * Math.PI * 2));
          m.compose(p, q, sc);
          m.toArray(buf, i * 16);
        }
        return buf;
      };
      window.viewer.setCrowd([
        { assetId: 'ribosome-70s', asset: assets['ribosome-70s'], transforms: makeShell(40, 340, 780, 101) },
        { assetId: 'trna-aa', asset: assets['trna-aa'], transforms: makeShell(140, 230, 680, 202) },
        { assetId: 'rnap-ec', asset: assets['rnap-ec'], transforms: makeShell(20, 300, 740, 303) },
      ]);
    });
    await captureReadPixels(pageEv4, 1, true);
    await takeEvidence(pageEv4, 'crowd-200-instances.jpg');
    console.log('  crowd-200-instances.jpg evidence saved');
    await ctxEv4.close();

    summary.crowd = {
      rnap200DrawCalls: drawCallCheck.rnapCalls,
      ribo200DrawCalls: drawCallCheck.riboCalls,
      trna200DrawCalls: drawCallCheck.trnaCalls,
      geometriesRestored: afterClearState.memory.geometries === baseState.memory.geometries,
    };
  }

  assert(errors.length === 0, `Browser errors recorded:\n${errors.join('\n')}`);
  console.log('\nRENDER ACTORS PASSED');
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await browser.close();
  server.close();
}
