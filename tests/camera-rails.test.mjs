// Unit and browser verification suite for R3-R3: Camera rails and 3D labels
// (PLAN.md §§4.6, 4.7, 6.3, 6.4, 8.4, 10 R3-R3; docs/CONTRACTS.md §7.5).
// Also captures 2x 1440x900 JPEG q90 visual evidence under docs/evidence/r3/R3/ (DEC-012).
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import {
  resolveShot,
  resolveCameraShotId,
  transitionDuration,
  createCameraRails,
} from '../js/scene/camera-rails.js';
import {
  selectLabels,
  MAX_VISIBLE_LABELS,
  LABEL_COLORS,
} from '../js/scene/labels.js';
import { SHOT_IDS, getShot } from '../js/sim/gene/shots.js';
import { buildStory, stateAt } from '../js/sim/gene/story.js';
import { TRUE_SCALE_GENE_CONSTRUCT } from '../js/science/scenario.js';
import { loadAssets } from '../js/assets/registry.js';
import { composeFrame } from '../js/kin/frames.js';
import { machinePoseForRegister } from '../js/kin/duplex.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const evidenceDir = path.join(root, 'docs', 'evidence', 'r3', 'R3');
fs.mkdirSync(evidenceDir, { recursive: true });

const assets = await loadAssets([
  'rnap-ec',
  'rnap-holo',
  'ribosome-70s',
  'trna-init',
  'trna-aa',
  'rf1',
  'ef-tu',
  'ef-g',
  'if1',
  'if2',
  'if3',
  'nusg',
]);

function applyFramePoint(frame, pt) {
  const R = frame.R;
  const o = frame.o;
  return [
    R[0] * pt[0] + R[1] * pt[1] + R[2] * pt[2] + o[0],
    R[3] * pt[0] + R[4] * pt[1] + R[5] * pt[2] + o[1],
    R[6] * pt[0] + R[7] * pt[1] + R[8] * pt[2] + o[2],
  ];
}

function makeRichWorldState() {
  const rnapPose = machinePoseForRegister(assets['rnap-ec'], 95);
  const riboPose = {
    o: [20, -15, -240],
    R: [0, 0, 1, 0, 1, 0, -1, 0, 0],
  };
  return {
    t: 45.0,
    chapter: {
      index: 5,
      id: 'elongate-tx',
      title: 'Elongation',
      group: 'T',
      t0: 32.4,
      t1: 53.1,
      shot: 'rnap-follow',
      caption: 'The polymerase reads the template 3′→5′ and builds RNA 5′→3′.',
    },
    chapterProgress: 0.5,
    caption: 'The polymerase reads the template 3′→5′ and builds RNA 5′→3′.',
    machines: [
      {
        id: 'rnap',
        assetId: 'rnap-ec',
        transform: rnapPose,
        opacity: 1,
        visible: true,
        parts: { core: { visible: true, opacity: 1 } },
        label: 'RNA polymerase',
        pickable: true,
      },
      {
        id: 'ribosome',
        assetId: 'ribosome-70s',
        transform: riboPose,
        opacity: 1,
        visible: true,
        parts: {
          small: { visible: true, opacity: 1 },
          large: { visible: true, opacity: 1 },
        },
        label: 'Ribosome',
        pickable: true,
      },
    ],
    dna: { machineId: 'rnap', register: 95, bend: 1, bubble: [-10, 2], relax: 0, trackBlend: 1 },
    rna: { length: 50, addProgress: 0, hairpin: 0, released: false, layout: 'rnap', layoutBlend: 0 },
    ribosome: { codon: 3, bound: true },
    trnas: [],
    peptide: { length: 3, attach: 'P', release: 0 },
    ntp: { base: null, path: 0, bonded: false },
    ppi: { path: 0, opacity: 0 },
    fx: [],
    counters: { mrna: 50, hybrid: 9, codon: 3, peptide: 3 },
    highlight: { codon: 3 },
    shot: { id: 'rnap-follow', from: 'rnap-side', blend: 1 },
  };
}

// =============================================================================
// 1. transitionDuration rule (PLAN.md §4.7)
// =============================================================================
test('transitionDuration obeys clamp(0.8 + travel / 600, 1.2, 3.0) s', () => {
  // Zero travel -> clamped to 1.2 s minimum
  assert.equal(transitionDuration([0, 0, 0], [0, 0, 0]), 1.2);
  // 180 A travel -> 0.8 + 0.3 = 1.1 -> clamped to 1.2 s
  assert.equal(transitionDuration([0, 0, 0], [180, 0, 0]), 1.2);
  // 240 A travel -> 0.8 + 0.4 = 1.2 s exact boundary
  assert.ok(Math.abs(transitionDuration([0, 0, 0], [240, 0, 0]) - 1.2) < 1e-9);
  // 600 A travel -> 0.8 + 1.0 = 1.8 s
  assert.ok(Math.abs(transitionDuration([10, -20, 30], [610, -20, 30]) - 1.8) < 1e-9);
  // 900 A travel -> 0.8 + 1.5 = 2.3 s
  assert.ok(Math.abs(transitionDuration([0, 0, 0], [0, 900, 0]) - 2.3) < 1e-9);
  // 1320 A travel -> 0.8 + 2.2 = 3.0 s exact upper boundary
  assert.ok(Math.abs(transitionDuration([0, 0, 0], [0, 0, 1320]) - 3.0) < 1e-9);
  // 3000 A travel -> clamped to 3.0 s maximum
  assert.equal(transitionDuration([0, 0, 0], [3000, 0, 0]), 3.0);
  // Missing / non-finite -> safe fallback 1.2 s
  assert.equal(transitionDuration(null, [0, 0, 0]), 1.2);
  assert.equal(transitionDuration([0, 0, 0], null), 1.2);
  assert.equal(transitionDuration([NaN, 0, 0], [0, 0, 0]), 1.2);
});

// =============================================================================
// 2. resolveCameraShotId (PLAN.md §6.3)
// =============================================================================
test('resolveCameraShotId maps UI camera options per PLAN.md §6.3', () => {
  const wsNoRna = { rna: { length: 0 }, counters: { mrna: 0 }, shot: { id: 'rnap-side' }, chapter: { shot: 'rnap-side' } };
  const wsWithRna = { rna: { length: 24 }, counters: { mrna: 24 }, shot: { id: 'ribo-decode' }, chapter: { shot: 'ribo-decode' } };

  assert.equal(resolveCameraShotId('overview', wsNoRna), 'wide');
  assert.equal(resolveCameraShotId('Overview', wsWithRna), 'wide');
  assert.equal(resolveCameraShotId('rnap', wsNoRna), 'rnap-side');
  assert.equal(resolveCameraShotId('rnap', wsWithRna), 'rnap-follow');
  assert.equal(resolveCameraShotId('RNAP', { counters: { mrna: 5 } }), 'rnap-follow');
  assert.equal(resolveCameraShotId('ribosome', wsNoRna), 'ribo-side');
  assert.equal(resolveCameraShotId('Ribosome', wsWithRna), 'ribo-side');
  assert.equal(resolveCameraShotId('auto', wsNoRna), 'rnap-side');
  assert.equal(resolveCameraShotId('Auto', wsWithRna), 'ribo-decode');
  assert.equal(resolveCameraShotId('auto', {}), 'wide');
  assert.equal(resolveCameraShotId('free', wsWithRna), null);
  assert.equal(resolveCameraShotId('Free', wsNoRna), null);
});

// =============================================================================
// 3. resolveShot across all 13 shots & every frame type (PLAN.md §§4.7, 6.3, 6.4)
// =============================================================================
test('resolveShot resolves all 13 shots in SHOT_IDS and each frame type accurately', () => {
  const ws = makeRichWorldState();
  const rnapTf = ws.machines[0].transform;
  const riboTf = ws.machines[1].transform;

  assert.equal(SHOT_IDS.length, 13);

  for (const id of SHOT_IDS) {
    const spec = getShot(id);
    const resById = resolveShot(id, ws, assets);
    const resByObj = resolveShot(spec, ws, assets);
    assert.deepEqual(resById, resByObj, `resolveShot(${id}) string vs object mismatch`);
    assert.equal(resById.id, id);
    assert.equal(resById.pos.length, 3);
    assert.equal(resById.target.length, 3);
    assert.equal(resById.dir.length, 3);
    assert.ok(resById.pos.every(Number.isFinite), `${id} pos non-finite`);
    assert.ok(resById.target.every(Number.isFinite), `${id} target non-finite`);
    assert.ok(resById.dir.every(Number.isFinite), `${id} dir non-finite`);

    // Unit direction vector check
    const dirLen = Math.hypot(...resById.dir);
    assert.ok(Math.abs(dirLen - 1.0) < 1e-6, `${id} dir not unit length: ${dirLen}`);

    // Pos = target + dir * distance
    for (let k = 0; k < 3; k++) {
      const expected = resById.target[k] + resById.dir[k] * resById.distance;
      assert.ok(Math.abs(resById.pos[k] - expected) < 1e-6, `${id} pos[${k}] mismatch`);
    }

    assert.equal(resById.detailRadius, spec.detailRadius);
    assert.equal(resById.follow, spec.follow);
  }

  // Frame 1: 'world' ('wide')
  const wide = resolveShot('wide', ws, assets);
  assert.deepEqual(wide.target, [0, 0, 0]);
  assert.equal(wide.cut, null);
  assert.equal(wide.follow, false);
  assert.ok(wide.distance >= 1200 && wide.distance <= 2600, `wide fit distance out of range: ${wide.distance}`);

  // Frame 2: 'rnap' ('rnap-active')
  const rnapActive = resolveShot('rnap-active', ws, assets);
  const expectedActiveSite = applyFramePoint(rnapTf, assets['rnap-ec'].anchors.activeSite.o);
  for (let k = 0; k < 3; k++) {
    assert.ok(Math.abs(rnapActive.target[k] - expectedActiveSite[k]) < 1e-5, `rnap-active target[${k}] mismatch`);
  }
  assert.equal(rnapActive.distance, 95);
  assert.equal(rnapActive.detailRadius, 28);
  assert.ok(rnapActive.cut && rnapActive.cut.kind === 'anchor' && rnapActive.cut.anchor === 'activeSite' && rnapActive.cut.machineId === 'rnap');
  for (let k = 0; k < 3; k++) {
    assert.ok(Math.abs(rnapActive.cut.at[k] - expectedActiveSite[k]) < 1e-5);
  }

  // Frame 3: 'ribo' anchor ('ribo-decode' -> target siteA, cut decoding)
  const riboDecode = resolveShot('ribo-decode', ws, assets);
  const expectedSiteA = applyFramePoint(riboTf, assets['ribosome-70s'].anchors.siteA.o);
  const expectedDecoding = applyFramePoint(riboTf, assets['ribosome-70s'].anchors.decoding.o);
  for (let k = 0; k < 3; k++) {
    assert.ok(Math.abs(riboDecode.target[k] - expectedSiteA[k]) < 1e-5, `ribo-decode target[${k}] mismatch`);
    assert.ok(Math.abs(riboDecode.cut.at[k] - expectedDecoding[k]) < 1e-5, `ribo-decode cut.at[${k}] mismatch`);
  }
  assert.equal(riboDecode.cut.anchor, 'decoding');
  assert.equal(riboDecode.cut.machineId, 'ribosome');

  // Frame 4: 'ribo' path 'tunnel' midpoint ('ribo-tunnel')
  const riboTunnel = resolveShot('ribo-tunnel', ws, assets);
  const tunnel = assets['ribosome-70s'].paths.tunnel;
  const midIdx = Math.floor(tunnel.count / 2);
  const localMid = [tunnel.points[midIdx * 3], tunnel.points[midIdx * 3 + 1], tunnel.points[midIdx * 3 + 2]];
  const expectedTunnelMid = applyFramePoint(riboTf, localMid);
  for (let k = 0; k < 3; k++) {
    assert.ok(Math.abs(riboTunnel.target[k] - expectedTunnelMid[k]) < 1e-5, `ribo-tunnel target[${k}] mismatch`);
  }
  assert.ok(riboTunnel.cut && riboTunnel.cut.kind === 'tunnel-axis' && riboTunnel.cut.machineId === 'ribosome');

  // Frame 5: 'world' midpoint ('coupled-wide' & 'coupled-follow')
  const coupledWide = resolveShot('coupled-wide', ws, assets);
  const coupledFollow = resolveShot('coupled-follow', ws, assets);
  const rnapCenterWorld = applyFramePoint(rnapTf, assets['rnap-ec'].anchors.center.o);
  const riboCenterWorld = applyFramePoint(riboTf, assets['ribosome-70s'].anchors.center.o);
  for (let k = 0; k < 3; k++) {
    const mid = 0.5 * (rnapCenterWorld[k] + riboCenterWorld[k]);
    assert.ok(Math.abs(coupledWide.target[k] - mid) < 1e-5, `coupled-wide midpoint[${k}] mismatch`);
    assert.ok(Math.abs(coupledFollow.target[k] - mid) < 1e-5, `coupled-follow midpoint[${k}] mismatch`);
  }
  assert.equal(coupledWide.follow, false);
  assert.equal(coupledFollow.follow, true);
  assert.ok(coupledWide.distance >= 280 && coupledWide.distance <= 2600);
});

// =============================================================================
// 4. selectLabels priority 1 -> 9, hard cap <= 6, overview vs close-up, chapters
// =============================================================================
test('selectLabels enforces priority 1..9, hard cap <= 6, and enabled:false', () => {
  const ws = makeRichWorldState();
  // When enabled: false -> []
  assert.deepEqual(selectLabels(ws, assets, { enabled: false }), []);

  // Populate a state where ALL 9 priority classes qualify simultaneously (> 12 labels total)
  const crowdedState = {
    ...ws,
    chapter: { index: 0, id: 'establish', title: 'A gene in the cytoplasm', group: 'O', t0: 0, t1: 6, shot: 'wide' },
    shot: { id: 'wide', from: null, blend: 1 },
    machines: [
      {
        id: 'rnap',
        assetId: 'rnap-holo',
        transform: ws.machines[0].transform,
        opacity: 1,
        visible: true,
        parts: {
          core: { visible: true, opacity: 1 },
          sigma: { visible: true, opacity: 0.85 },
        },
      },
      {
        id: 'ribosome',
        assetId: 'ribosome-70s',
        transform: ws.machines[1].transform,
        opacity: 1,
        visible: true,
        parts: {
          small: { visible: true, opacity: 1 },
          large: { visible: true, opacity: 1 },
        },
      },
      { id: 'ef-tu', assetId: 'ef-tu', transform: ws.machines[1].transform, opacity: 1, visible: true },
      { id: 'ef-g', assetId: 'ef-g', transform: ws.machines[1].transform, opacity: 1, visible: true },
    ],
    rna: { length: 48, addProgress: 0, hairpin: 0, released: false, layout: 'rnap', layoutBlend: 0 },
    trnas: [
      { slot: 0, kind: 'init', aa: 'fMet', site: 'P', from: 'P', blend: 1, codon: 1, opacity: 1, peptidyl: false },
      { slot: 1, kind: 'aa', aa: 'Ala', site: 'A', from: 'AT', blend: 1, codon: 2, opacity: 1, peptidyl: true },
    ],
    peptide: { length: 2, attach: 'A', release: 0 },
    counters: { mrna: 48, hybrid: 9, codon: 2, peptide: 2 },
  };

  // In overview shot ('wide'), priorities are:
  // 1: RNA polymerase
  // 2: σ⁷⁰
  // 3: Ribosome (overview shot!)
  // 4: mRNA 5′, mRNA 3′
  // 5: fMet-tRNA (6th label -> hits cap of 6!)
  const overviewLabels = selectLabels(crowdedState, assets, { shotId: 'wide' });
  assert.equal(overviewLabels.length, MAX_VISIBLE_LABELS);
  assert.deepEqual(
    overviewLabels.map(l => l.text),
    ['RNA polymerase', 'σ⁷⁰', 'Ribosome', 'mRNA 5′', 'mRNA 3′', 'fMet-tRNA'],
  );
  assert.equal(overviewLabels[0].borderColor, '#4fb6ffaa');
  assert.equal(overviewLabels[1].borderColor, '#b58cffaa');
  assert.equal(overviewLabels[2].borderColor, '#e4dcc4aa');
  assert.equal(overviewLabels[3].borderColor, '#2fd9b9aa');
  assert.equal(overviewLabels[5].borderColor, '#ffd43baa');

  // In close-up shot ('ribo-decode'), Ribosome splits into '30S subunit' and '50S subunit':
  // 1: RNA polymerase
  // 2: σ⁷⁰ (if opacity <= 0.5, σ⁷⁰ is hidden)
  const closeStateNoSigma = {
    ...crowdedState,
    shot: { id: 'ribo-decode', from: null, blend: 1 },
    machines: [
      {
        ...crowdedState.machines[0],
        parts: { core: { visible: true, opacity: 1 }, sigma: { visible: true, opacity: 0.45 } }, // <= 0.5 -> hidden!
      },
      crowdedState.machines[1],
      crowdedState.machines[2],
    ],
  };
  const closeLabels = selectLabels(closeStateNoSigma, assets, { shotId: 'ribo-decode' });
  assert.equal(closeLabels.length, MAX_VISIBLE_LABELS);
  assert.deepEqual(
    closeLabels.map(l => l.text),
    ['RNA polymerase', '30S subunit', '50S subunit', 'mRNA 5′', 'mRNA 3′', 'fMet-tRNA'],
  );
  assert.equal(closeLabels[1].borderColor, '#e4dcc4aa');
  assert.equal(closeLabels[2].borderColor, '#d2b183aa');

  // Check deacylated tRNA ('tRNA'), factor labels, Peptide N-terminus, DNA 5′/3′, and region tags
  const deacylatedAndFactorState = {
    ...ws,
    chapter: { index: 14, id: 'release', title: 'Stop codon', group: 'E', t0: 147.05, t1: 158.05, shot: 'ribo-decode' },
    shot: { id: 'ribo-decode', from: null, blend: 1 },
    machines: [
      { id: 'rf1', assetId: 'rf1', transform: ws.machines[1].transform, opacity: 1, visible: true },
    ],
    rna: { length: 5, addProgress: 0, hairpin: 0, released: true, layout: 'ribosome', layoutBlend: 1 }, // < 12 -> no mRNA tags
    ribosome: { codon: 41, bound: false },
    trnas: [
      { slot: 0, kind: 'aa', aa: null, site: 'E', from: 'P', blend: 1, codon: 39, opacity: 1, peptidyl: false },
    ],
    peptide: { length: 40, attach: 'free', release: 0.5 },
    counters: { mrna: 5, hybrid: 0, codon: 41, peptide: 40 },
  };
  const releaseLabels = selectLabels(deacylatedAndFactorState, assets);
  assert.deepEqual(
    releaseLabels.map(l => l.text),
    ['tRNA', 'RF1', 'Peptide N-terminus', 'UAA'],
  );
  assert.equal(releaseLabels[0].borderColor, '#ff922baa');
  assert.equal(releaseLabels[1].borderColor, '#ff6b6baa');
  assert.equal(releaseLabels[2].borderColor, '#ff7a45aa');
  assert.equal(releaseLabels[3].variant, 'sm');
});

test('selectLabels never exceeds 6 labels across every chapter in sequential (1..16) and coupled (1..12) modes', () => {
  for (const mode of ['sequential', 'coupled']) {
    const story = buildStory(TRUE_SCALE_GENE_CONSTRUCT, assets, { mode });
    for (const ch of story.chapters) {
      for (const frac of [0.05, 0.5, 0.95]) {
        const t = ch.t0 + (ch.t1 - ch.t0) * frac;
        const ws = stateAt(story, t);
        const labels = selectLabels(ws, assets, { mode });
        assert.ok(labels.length <= MAX_VISIBLE_LABELS, `${mode} chapter ${ch.index + 1} (${ch.id}) produced ${labels.length} labels`);
        for (let i = 1; i < labels.length; i++) {
          assert.ok(
            labels[i].priority >= labels[i - 1].priority,
            `${mode} chapter ${ch.id} labels out of priority order: ${labels.map(l => `${l.text}(p${l.priority})`).join(', ')}`,
          );
        }
        for (const l of labels) {
          assert.ok(Array.isArray(l.at) && l.at.length === 3 && l.at.every(Number.isFinite), `Non-finite label pos for ${l.text}`);
        }
      }
    }

    // Verify chapter 1 ('establish', 'wide') includes DNA 5′, DNA 3′ and promoter region tags (−35, −10, +1)
    const ch1State = stateAt(story, 1.0);
    const ch1Labels = selectLabels(ch1State, assets, { mode });
    const ch1Texts = ch1Labels.map(l => l.text);
    assert.ok(ch1Texts.includes('DNA 5′') && ch1Texts.includes('DNA 3′'), 'Chapter 1 wide shot must include DNA 5′ and DNA 3′');
    assert.ok(ch1Texts.includes('−35') && ch1Texts.includes('−10') && ch1Texts.includes('+1'), 'Chapter 1 must include promoter region tags');

    // Verify chapter 7 ('terminate-tx') includes 'Terminator' when room exists
    if (mode === 'sequential') {
      const ch7 = story.chapters[6];
      const ch7State = stateAt(story, ch7.t0 + 1.0);
      const ch7Labels = selectLabels(ch7State, assets, { mode });
      assert.ok(ch7Labels.some(l => l.text === 'Terminator'), 'Sequential chapter 7 must include Terminator tag');

      // Verify chapter 8 ('scan') includes 'SD' and 'AUG'
      const ch8 = story.chapters[7];
      const ch8State = stateAt(story, ch8.t0 + 1.0);
      const ch8Labels = selectLabels(ch8State, assets, { mode });
      assert.ok(ch8Labels.some(l => l.text === 'SD') && ch8Labels.some(l => l.text === 'AUG'), 'Sequential chapter 8 must include SD and AUG tags');
    }
  }
});

// =============================================================================
// 5. Browser verification & 2x 1440x900 JPEG q90 evidence capture (Playwright)
// =============================================================================
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

test('browser: CameraRails orbit Free interrupt, reducedMotion instant cut, 250 ms label fade & cap <= 6, plus evidence captures', async (t) => {
  let chromium;
  try {
    ({ chromium } = createRequire(import.meta.url)('playwright'));
  } catch {
    t.skip('Playwright not available');
    return;
  }

  const server = await startServer();
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch({
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const errors = [];

  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    });
    await context.addInitScript(PAUSEABLE_RAF_INIT);
    const page = await context.newPage();
    page.on('pageerror', err => errors.push(`pageerror: ${err?.message || err}`));
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
    });

    await page.goto(`${baseUrl}/dev/actor-card.html?asset=rnap-holo&lod=l1&tracks=1&cutaway=activeSite&quality=low`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.viewer && window.asset && window.asm), null, { timeout: 60000 });

    // 5a. Set up CameraRails + Story chapters in the live WebGL viewer and capture Evidence 1 (`shot-rnap-side-labels.jpg`)
    const rnapShotSetup = await page.evaluate(async () => {
      if (window.__setRafPaused) window.__setRafPaused(false);
      const { createCameraRails } = await import('../js/scene/camera-rails.js');
      const { selectLabels } = await import('../js/scene/labels.js');
      const { loadAssets } = await import('../js/assets/registry.js');

      const v = window.viewer;
      const allAssets = await loadAssets(['rnap-ec', 'rnap-holo', 'ribosome-70s', 'trna-init', 'trna-aa', 'nusg']);
      window.__r3Assets = allAssets;

      window.__optionChanges = [];
      const rails = createCameraRails(v, {
        initialOption: 'auto',
        onCameraOptionChange: opt => window.__optionChanges.push(opt),
      });
      window.__rails = rails;

      const identityPose = { o: [0, 0, 0], R: [1, 0, 0, 0, 1, 0, 0, 0, 1] };
      v.setActors([{
        id: 'rnap',
        asset: allAssets['rnap-holo'],
        transform: identityPose,
        visible: true,
        opacity: 1,
        cutaway: 'activeSite',
        lod: 'l1',
        parts: {
          core: { visible: true, opacity: 1 },
          sigma: { visible: true, opacity: 0.95 },
        },
      }]);

      const wsOpen = {
        t: 17.0,
        chapter: { index: 2, id: 'open', title: 'Opening the DNA', group: 'T', t0: 14, t1: 20, shot: 'rnap-side' },
        shot: { id: 'rnap-side', from: 'rnap-side', blend: 1 },
        machines: [{
          id: 'rnap',
          assetId: 'rnap-holo',
          transform: identityPose,
          visible: true,
          opacity: 1,
          parts: { core: { visible: true, opacity: 1 }, sigma: { visible: true, opacity: 0.95 } },
        }],
        dna: { machineId: 'rnap', register: 45, bend: 1, bubble: [-11, 2], relax: 0 },
        rna: { length: 0, released: false, layout: 'rnap' },
        counters: { mrna: 0, hybrid: 0, codon: 0, peptide: 0 },
      };
      window.__wsOpen = wsOpen;

      const resolved = rails.applyWorldState(wsOpen, allAssets, { instant: true });
      // Place promoter landmark overrides near the visible track ends in the local scene so all 5 tags are on-screen
      const labels = selectLabels(wsOpen, allAssets, {
        positions: {
          'region:minus35': [-42, -25, -55],
          'region:minus10': [-18, -12, -22],
          'region:tss': [4, -4, 4],
        },
      });
      v.setLabels(labels);

      // Wait for at least 300 ms and 2 rendered frames so 250 ms label fade-in completes, then pause rAF for instant screenshot
      await new Promise(r => setTimeout(r, 300));
      for (let i = 0; i < 2; i++) await new Promise(r => requestAnimationFrame(r));
      if (window.__setRafPaused) window.__setRafPaused(true);

      const domTags = [...document.querySelectorAll('.hx-overlay [data-label-id]')].map(el => ({
        id: el.dataset.labelId,
        text: el.textContent,
        className: el.className,
        opacity: parseFloat(el.style.opacity || '0'),
        borderColor: el.style.borderColor,
      }));
      return {
        option: rails.getOption(),
        resolved,
        selectedTexts: labels.map(l => l.text),
        domTags,
      };
    });

    assert.equal(rnapShotSetup.option, 'auto');
    assert.deepEqual(
      rnapShotSetup.selectedTexts,
      ['RNA polymerase', 'σ⁷⁰', '−35', '−10', '+1'],
    );
    assert.equal(rnapShotSetup.domTags.length, 5);
    assert.ok(
      rnapShotSetup.domTags.every(tag => tag.opacity >= 0.95),
      `Expected faded-in tags to reach opacity ~1, got ${JSON.stringify(rnapShotSetup.domTags)}`,
    );

    // Save Evidence 1: close-up RNAP side shot with labels
    await page.screenshot({
      path: path.join(evidenceDir, 'shot-rnap-side-labels.jpg'),
      type: 'jpeg',
      quality: 90,
      animations: 'allow',
      timeout: 60000,
    });

    // 5b. Test exact 250 ms fade-in & fade-out and hard cap of 6 in OverlayLayer.setLabels
    const fadeAndCapCheck = await page.evaluate(async () => {
      const v = window.viewer;
      const nineLabels = [
        { id: 'test:1', text: 'RNA polymerase', priority: 1, variant: 'blob', color: 0x4fb6ff, at: [0, 50, 0] },
        { id: 'test:2', text: 'σ⁷⁰', priority: 2, variant: 'blob', color: 0xb58cff, at: [-35, 45, 20] },
        { id: 'test:3', text: 'Ribosome', priority: 3, variant: 'blob', color: 0xe4dcc4, at: [45, 55, -20] },
        { id: 'test:4a', text: 'mRNA 5′', priority: 4, variant: 'label', color: 0x2fd9b9, at: [-50, -10, 25] },
        { id: 'test:4b', text: 'mRNA 3′', priority: 4, variant: 'label', color: 0x2fd9b9, at: [10, -15, -15] },
        { id: 'test:5', text: 'fMet-tRNA', priority: 5, variant: 'blob', color: 0xffd43b, at: [30, 15, 20] },
        { id: 'test:6', text: 'EF-Tu', priority: 6, variant: 'blob', color: 0xf783ac, at: [60, 20, 0] },
        { id: 'test:7', text: 'Peptide N-terminus', priority: 7, variant: 'label', color: 0xff7a45, at: [75, 10, 0] },
        { id: 'test:8', text: 'DNA 5′', priority: 8, variant: 'label', color: 0x7c93c3, at: [-75, 5, 0] },
      ];

      v.setLabels([]);
      const { OverlayLayer } = await import('../js/render/overlay.js');
      const THREE = await import('three');
      const box = document.createElement('div');
      Object.assign(box.style, { position: 'fixed', left: '0', top: '0', width: '1440px', height: '900px', pointerEvents: 'none' });
      document.body.appendChild(box);
      const parent3d = new THREE.Group();
      const ov = new OverlayLayer(box, parent3d, (x, y, z, out) => {
        out.x = 720 + x * 4;
        out.y = 450 - y * 4;
        out.z = 250;
        out.ok = true;
        return out;
      });
      const ctx = { width: 1440, height: 900, insets: { top: 0, right: 0, bottom: 0, left: 0 }, pxPerAAt: () => 4 };

      // Baseline t = 10.0 s
      ov._lastLabelTime = 10.0;
      ov._lastLabelPerf = performance.now() * 0.001;
      ov.setLabels(nineLabels);

      // Step +125 ms (half of 250 ms) -> fade = 0.5
      ov._lastLabelPerf = performance.now() * 0.001;
      ov.updateTags(ctx, 10.125);
      const midIn = [...box.querySelectorAll('[data-label-id]')].map(el => ({
        id: el.dataset.labelId,
        text: el.textContent,
        op: parseFloat(el.style.opacity || '0'),
      }));

      // Step another +125 ms (total 250 ms) -> fade = 1.0
      ov._lastLabelPerf = performance.now() * 0.001;
      ov.updateTags(ctx, 10.250);
      const fullIn = [...box.querySelectorAll('[data-label-id]')].map(el => ({
        id: el.dataset.labelId,
        text: el.textContent,
        op: parseFloat(el.style.opacity || '0'),
      }));

      // Remove all labels -> targetFade = 0
      ov.setLabels([]);
      // Step +125 ms -> fade = 0.5 (still alive in DOM!)
      ov._lastLabelPerf = performance.now() * 0.001;
      ov.updateTags(ctx, 10.375);
      const midOut = [...box.querySelectorAll('[data-label-id]')].map(el => ({
        id: el.dataset.labelId,
        op: parseFloat(el.style.opacity || '0'),
      }));

      // Step another +125 ms (total 250 ms fade-out) -> fade = 0 -> removed from DOM
      ov._lastLabelPerf = performance.now() * 0.001;
      ov.updateTags(ctx, 10.500);
      const fullOutCount = box.querySelectorAll('[data-label-id]').length;

      ov.dispose();
      box.remove();
      return { midIn, fullIn, midOut, fullOutCount };
    });

    assert.equal(fadeAndCapCheck.fullIn.length, 6, `Hard cap of 6 violated: got ${fadeAndCapCheck.fullIn.length}`);
    assert.deepEqual(
      fadeAndCapCheck.fullIn.map(x => x.text),
      ['RNA polymerase', 'σ⁷⁰', 'Ribosome', 'mRNA 5′', 'mRNA 3′', 'fMet-tRNA'],
    );
    assert.ok(
      fadeAndCapCheck.midIn.every(x => Math.abs(x.op - 0.5) < 0.05),
      `Expected fade-in opacity ~0.5 at 125 ms, got ${JSON.stringify(fadeAndCapCheck.midIn)}`,
    );
    assert.ok(
      fadeAndCapCheck.fullIn.every(x => Math.abs(x.op - 1.0) < 0.02),
      `Expected fade-in opacity ~1.0 at 250 ms, got ${JSON.stringify(fadeAndCapCheck.fullIn)}`,
    );
    assert.ok(
      fadeAndCapCheck.midOut.length === 6 && fadeAndCapCheck.midOut.every(x => Math.abs(x.op - 0.5) < 0.05),
      `Expected fade-out opacity ~0.5 at 125 ms, got ${JSON.stringify(fadeAndCapCheck.midOut)}`,
    );
    assert.equal(fadeAndCapCheck.fullOutCount, 0, 'Faded-out labels must be removed from DOM at 250 ms');

    // 5c. Switch to Overview ('coupled-wide') shot with RNAP + Ribosome + 6 labels and capture Evidence 2 (`shot-wide-overview-labels.jpg`)
    const wideSetup = await page.evaluate(async () => {
      if (window.__setRafPaused) window.__setRafPaused(false);
      const { selectLabels } = await import('../js/scene/labels.js');
      const v = window.viewer;
      const rails = window.__rails;
      const allAssets = window.__r3Assets;

      const rnapPose = { o: [-110, -10, 0], R: [1, 0, 0, 0, 1, 0, 0, 0, 1] };
      const riboPose = { o: [110, 10, 0], R: [1, 0, 0, 0, 1, 0, 0, 0, 1] };

      v.setActors([
        {
          id: 'rnap',
          asset: allAssets['rnap-ec'],
          transform: rnapPose,
          visible: true,
          opacity: 1,
          lod: 'l1',
          parts: { core: { visible: true, opacity: 1 } },
        },
        {
          id: 'ribosome',
          asset: allAssets['ribosome-70s'],
          transform: riboPose,
          visible: true,
          opacity: 1,
          lod: 'l1',
          parts: { small: { visible: true, opacity: 1 }, large: { visible: true, opacity: 1 } },
        },
      ]);

      const wsWide = {
        t: 55.0,
        chapter: { index: 7, id: 'couple-join', title: '70S assembly', group: 'I', t0: 50, t1: 57.5, shot: 'coupled-wide' },
        shot: { id: 'coupled-wide', from: 'ribo-30s', blend: 1 },
        machines: [
          { id: 'rnap', assetId: 'rnap-ec', transform: rnapPose, visible: true, opacity: 1 },
          { id: 'ribosome', assetId: 'ribosome-70s', transform: riboPose, visible: true, opacity: 1 },
        ],
        dna: { machineId: 'rnap', register: 110, bend: 1, bubble: [-10, 2], relax: 0 },
        rna: { length: 65, released: false, layout: 'coupled' },
        ribosome: { codon: 1, bound: true },
        trnas: [],
        peptide: { length: 0, attach: 'free', release: 0 },
        counters: { mrna: 65, hybrid: 9, codon: 1, peptide: 0 },
      };

      rails.setOption('auto', { instant: true });
      const resolved = rails.applyWorldState(wsWide, allAssets, { instant: true });
      const labels = selectLabels(wsWide, allAssets, {
        shotId: 'coupled-wide',
        positions: {
          'dna:5': [-230, -55, 25],
          'dna:3': [230, -55, -25],
        },
      });
      v.setLabels(labels);

      await new Promise(r => setTimeout(r, 300));
      for (let i = 0; i < 2; i++) await new Promise(r => requestAnimationFrame(r));
      if (window.__setRafPaused) window.__setRafPaused(true);

      const domTags = [...document.querySelectorAll('.hx-overlay [data-label-id]')].map(el => ({
        id: el.dataset.labelId,
        text: el.textContent,
        op: parseFloat(el.style.opacity || '0'),
      }));
      return {
        option: rails.getOption(),
        resolved,
        labels: labels.map(l => l.text),
        domTags,
      };
    });

    assert.equal(wideSetup.option, 'auto');
    assert.equal(wideSetup.labels.length, 6);
    assert.deepEqual(
      wideSetup.labels,
      ['RNA polymerase', 'Ribosome', 'mRNA 5′', 'mRNA 3′', 'DNA 5′', 'DNA 3′'],
    );
    assert.equal(wideSetup.domTags.length, 6);
    assert.ok(wideSetup.domTags.every(t => t.op >= 0.95), `Expected all 6 overview tags faded in: ${JSON.stringify(wideSetup.domTags)}`);

    await page.screenshot({
      path: path.join(evidenceDir, 'shot-wide-overview-labels.jpg'),
      type: 'jpeg',
      quality: 90,
      animations: 'allow',
      timeout: 60000,
    });

    // 5d. Verify user pointer orbit on canvas fires `controlstart` and switches CameraRails to `'free'`
    await page.mouse.move(720, 450);
    await page.mouse.down();
    await page.mouse.move(780, 420, { steps: 5 });
    await page.mouse.up();

    const afterOrbit = await page.evaluate(() => ({
      option: window.__rails.getOption(),
      changes: window.__optionChanges.slice(),
    }));
    assert.equal(afterOrbit.option, 'free', 'Orbiting on canvas must switch CameraRails option to free');
    assert.ok(afterOrbit.changes.includes('free'), 'onCameraOptionChange("free") callback must fire on orbit');

    // 5e. Verify reducedMotion produces instant camera cuts (duration = 0, camera snaps immediately)
    const reducedCheck = await page.evaluate(() => {
      const v = window.viewer;
      const rails = window.__rails;
      // Clear any residual damping velocity from the pointer drag in 5d
      const prevDamping = v.controls.enableDamping;
      v.controls.enableDamping = false;
      v.controls.update();

      // Compare non-instant call with reducedMotion=false (starts smooth animation, camera does NOT snap on frame 0)
      v.reducedMotion = false;
      v.moveCamera([0, 0, 0], 500, 0, [0, 0, 1]);
      rails.setOption('rnap'); // non-instant call while reducedMotion=false -> camera stays near [0, 0, 500] before tick!
      const posAnimatedStart = [v.camera.position.x, v.camera.position.y, v.camera.position.z];

      // Now enable reducedMotion=true and switch option without `{ instant: true }` -> must cut immediately (dur=0)!
      v.moveCamera([0, 0, 0], 500, 0, [0, 0, 1]);
      v.reducedMotion = true;
      rails.setOption('overview'); // non-instant call, but reducedMotion is true
      const resolved = rails.applyWorldState(window.__wsOpen, window.__r3Assets); // no { instant: true }
      const camPos = [v.camera.position.x, v.camera.position.y, v.camera.position.z];
      const err = Math.hypot(
        camPos[0] - resolved.pos[0],
        camPos[1] - resolved.pos[1],
        camPos[2] - resolved.pos[2],
      );
      const distAnimatedFromStart = Math.hypot(
        posAnimatedStart[0] - 0,
        posAnimatedStart[1] - 0,
        posAnimatedStart[2] - 500,
      );
      v.reducedMotion = false;
      v.controls.enableDamping = prevDamping;
      rails.dispose();
      return { err, distAnimatedFromStart, resolvedPos: resolved.pos, camPos };
    });
    assert.ok(
      reducedCheck.distAnimatedFromStart < 1e-3,
      `Expected non-reduced-motion transition to animate smoothly from start position (got ${reducedCheck.distAnimatedFromStart})`,
    );
    assert.ok(
      reducedCheck.err < 1e-3,
      `Expected reducedMotion instant camera cut to snap immediately (err=${reducedCheck.err})`,
    );

    assert.deepEqual(errors, [], `Browser console/page errors: ${errors.join('; ')}`);
    await context.close();
  } finally {
    await browser.close();
    server.close();
  }
});
