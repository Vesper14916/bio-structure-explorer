#!/usr/bin/env node
// Browser verification & visual regression suite for R3-R1 (detail sphere and AtomGroupLayer).
// 1. Detail sphere + 248-bp duplex + 40-residue peptide + NTP on dev/viewer-demo.html
//    (focus moves, radius=0 cartoon-only, colour schemes, readPixels checks, GPU leak check,
//    2x 1440x900 JPEG q90 evidence screenshots under docs/evidence/r3/R1/).
// 2. Performance / stability check: 248-bp duplex + 179-nt RNA + 40-aa peptide at quality=high.
// 3. Visual regression check: Explore, Pairs, Melt, Copy, X-ray against r3-st3 baseline
//    (asserts pixel diff <= 0.5% per mode at fixed seed, clock, and camera).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

let chromium;
try {
  ({ chromium } = createRequire(import.meta.url)('playwright'));
} catch {
  console.log('RENDER DETAIL SKIPPED: playwright not available');
  process.exit(2);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const evidenceDir = path.join(root, 'docs', 'evidence', 'r3', 'R1');
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

const BASELINE_REF = 'r3-st3';
const hasBaselineRef = (() => {
  try {
    execFileSync('git', ['rev-parse', '--verify', BASELINE_REF], { cwd: root, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const baselineCache = new Map();
function readBaselineFile(relPath) {
  if (baselineCache.has(relPath)) return baselineCache.get(relPath);
  try {
    const buf = execFileSync('git', ['show', `${BASELINE_REF}:${relPath}`], {
      cwd: root,
      maxBuffer: 25 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    baselineCache.set(relPath, buf);
    return buf;
  } catch {
    baselineCache.set(relPath, null);
    return null;
  }
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

    if (pathname.startsWith('/__baseline__/')) {
      let rel = pathname.slice('/__baseline__/'.length);
      if (!rel || rel.endsWith('/')) rel += 'index.html';
      rel = path.posix.normalize(rel).replace(/^\/+/, '');
      if (rel.startsWith('..')) {
        res.writeHead(403).end('Forbidden');
        return;
      }
      const data = hasBaselineRef ? readBaselineFile(rel) : null;
      if (data !== null) {
        const type = MIME[path.extname(rel)] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': type });
        res.end(data);
        return;
      }
      res.writeHead(404).end('Baseline not found');
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

// Minimal PNG decoder (supports 8-bit RGB/RGBA non-interlaced PNGs produced by Playwright).
function decodePng(buf) {
  const sig = '89504e470d0a1a0a';
  if (buf.subarray(0, 8).toString('hex') !== sig) throw new Error('Invalid PNG signature');
  let offset = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + len;
  }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`Unsupported PNG format: bitDepth=${bitDepth}, colorType=${colorType}`);
  }
  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = new Uint8Array(width * height * 4);
  const prev = new Uint8Array(stride);
  const cur = new Uint8Array(stride);

  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };

  let src = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[src++];
    for (let x = 0; x < stride; x++) {
      const v = raw[src++];
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let val;
      if (filter === 0) val = v;
      else if (filter === 1) val = (v + a) & 255;
      else if (filter === 2) val = (v + b) & 255;
      else if (filter === 3) val = (v + ((a + b) >> 1)) & 255;
      else if (filter === 4) val = (v + paeth(a, b, c)) & 255;
      else throw new Error(`Unknown PNG filter ${filter}`);
      cur[x] = val;
    }
    const rowDst = y * width * 4;
    if (bpp === 4) {
      out.set(cur, rowDst);
    } else {
      for (let x = 0; x < width; x++) {
        out[rowDst + x * 4] = cur[x * 3];
        out[rowDst + x * 4 + 1] = cur[x * 3 + 1];
        out[rowDst + x * 4 + 2] = cur[x * 3 + 2];
        out[rowDst + x * 4 + 3] = 255;
      }
    }
    prev.set(cur);
  }
  return { width, height, data: out };
}

function diffRgba(a, b, threshold = 2) {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(`Image size mismatch: ${a.width}x${a.height} vs ${b.width}x${b.height}`);
  }
  const total = a.width * a.height;
  let changed = 0;
  for (let i = 0; i < total * 4; i += 4) {
    if (
      Math.abs(a.data[i] - b.data[i]) > threshold ||
      Math.abs(a.data[i + 1] - b.data[i + 1]) > threshold ||
      Math.abs(a.data[i + 2] - b.data[i + 2]) > threshold
    ) {
      changed++;
    }
  }
  return { changed, total, pct: (changed / total) * 100 };
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

// Pauseable rAF wrapper for Test 1 so page.screenshot() never contends with continuous
// software-WebGL rendering at 2880x1800.
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

// Wait for N animation frames, then capture downsampled WebGL readPixels inside the same frame
// right after viewer.tick renders (before swap). Optionally pauses rAF right after readPixels
// so a subsequent Playwright screenshot completes immediately without SwiftShader contention.
async function captureReadPixels(page, settleFrames = 2, pauseAfter = false) {
  return page.evaluate(({ nFrames, pause }) => new Promise((resolve, reject) => {
    if (window.__setRafPaused) window.__setRafPaused(false);
    let rem = nFrames;
    const step = () => {
      if (rem-- > 0) {
        requestAnimationFrame(step);
        return;
      }
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

function gridDiffPct(a, b, yMin = 0, yMax = 1, threshold = 8) {
  const gx = a.gx, gy = a.gy;
  const j0 = Math.floor(yMin * gy), j1 = Math.ceil(yMax * gy);
  let diff = 0, total = 0;
  for (let j = j0; j < j1; j++) {
    for (let i = 0; i < gx; i++) {
      const o = (j * gx + i) * 3;
      total++;
      if (
        Math.abs(a.grid[o] - b.grid[o]) > threshold ||
        Math.abs(a.grid[o + 1] - b.grid[o + 1]) > threshold ||
        Math.abs(a.grid[o + 2] - b.grid[o + 2]) > threshold
      ) diff++;
    }
  }
  return total ? (diff / total) * 100 : 0;
}

async function runTest1DetailAndAtomGroups(browser, base, errors) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  await context.addInitScript(PAUSEABLE_RAF_INIT);
  const page = await context.newPage();
  attachErrorCollector(page, 'test1-detail', errors);

  try {
    await page.goto(`${base}/dev/viewer-demo.html?rotate=0&effects=on&quality=high`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.viewer);

    const setupInfo = await page.evaluate(async () => {
      const sci = await import('../js/science/index.js');
      const construct = sci.TRUE_SCALE_GENE_CONSTRUCT;
      const asm = sci.buildDuplex(construct.codingDna);
      asm.meta.kind = 'expression';
      for (const nu of asm.nucleotides) {
        nu.role = nu.strand === 0 ? 'coding' : 'template';
      }

      // Build 40-residue peptide and place it parallel to the duplex along +z, offset +20 A in x.
      const codes3 = sci.peptideFromConstruct(construct);
      const pep = sci.buildPeptide(codes3);
      const pPos = new Float32Array(pep.atoms.pos.length);
      let cx = 0, cy = 0, cz = 0;
      for (let i = 0; i < pep.atoms.count; i++) {
        cx += pep.atoms.pos[i * 3];
        cy += pep.atoms.pos[i * 3 + 1];
        cz += pep.atoms.pos[i * 3 + 2];
      }
      cx /= pep.atoms.count; cy /= pep.atoms.count; cz /= pep.atoms.count;
      // Rotate (x, y, z) -> (z + 20, y, x) so the ~135 A peptide spans z in [-68, +68] beside the duplex.
      for (let i = 0; i < pep.atoms.count; i++) {
        const x = pep.atoms.pos[i * 3] - cx;
        const y = pep.atoms.pos[i * 3 + 1] - cy;
        const z = pep.atoms.pos[i * 3 + 2] - cz;
        pPos[i * 3] = z + 20;
        pPos[i * 3 + 1] = y;
        pPos[i * 3 + 2] = x;
      }
      const residues = pep.residues.map(r => ({
        index: r.index,
        code3: r.code3,
        atomStart: r.atomStart,
        atomCount: r.atomCount,
        ca: [r.ca[2] - cz + 20, r.ca[1] - cy, r.ca[0] - cx],
      }));

      // Build an NTP (ATP) atom group placed near the center focus at x = -14, y = 2, z = 4.
      const atp = sci.ntpTemplate('A');
      const atpPos = new Float32Array(atp.local.length);
      for (let i = 0; i < atp.names.length; i++) {
        atpPos[i * 3] = atp.local[i * 3] - 14;
        atpPos[i * 3 + 1] = atp.local[i * 3 + 1] + 2;
        atpPos[i * 3 + 2] = atp.local[i * 3 + 2] + 4;
      }
      const atpBonds = new Uint16Array(atp.bonds.length * 2);
      for (let i = 0; i < atp.bonds.length; i++) {
        atpBonds[i * 2] = atp.bonds[i][0];
        atpBonds[i * 2 + 1] = atp.bonds[i][1];
      }

      const peptideGroup = {
        id: 'peptide',
        kind: 'peptide',
        count: pep.atoms.count,
        pos: pPos,
        el: pep.atoms.el,
        names: pep.atoms.name,
        residue: pep.atoms.residue,
        bonds: pep.bonds,
        residues,
        opacity: 1,
        detail: 'auto',
      };
      const ntpGroup = {
        id: 'ntp-atp',
        kind: 'ntp',
        count: atp.names.length,
        pos: atpPos,
        el: atp.el,
        names: atp.names,
        bonds: atpBonds,
        color: sci.BASE_INFO.A.color,
        opacity: 0.92,
        detail: 'auto',
      };

      window.__testGroups = [peptideGroup, ntpGroup];
      window.viewer.setStyle({ representation: 'ballstick', color: 'strand', hbonds: true, autoRotate: false });
      window.viewer.setAssembly(asm);
      window.viewer.setAtomGroups(window.__testGroups);
      // Frame the middle 160 A of the 248-bp duplex + 40-residue peptide clearly.
      window.viewer.focus({ center: [6, 0, 12], radius: 52, dir: [0.15, 0.96, 0.22] }, { duration: 0 });
      window.viewer.setDetailFocus({ center: [6, 0, 0], radius: 30 });

      return {
        bp: construct.length,
        nucCount: asm.nucleotides.length,
        dnaAtoms: asm.atoms.count,
        peptideResidues: residues.length,
        peptideAtoms: pep.atoms.count,
        ntpAtoms: atp.names.length,
      };
    });

    const pixCenter = await captureReadPixels(page, 2, true);
    await page.screenshot({ path: path.join(evidenceDir, 'detail-center-r30.jpg'), type: 'jpeg', quality: 90, timeout: 60000 });

    // Shift focus along +z by 55 A.
    await page.evaluate(() => {
      window.viewer.setDetailFocus({ center: [6, 0, 55], radius: 30 });
    });
    const pixShifted = await captureReadPixels(page, 2, true);
    await page.screenshot({ path: path.join(evidenceDir, 'detail-shifted-r30.jpg'), type: 'jpeg', quality: 90, timeout: 60000 });

    // Radius 0 -> cartoon-only mode.
    await page.evaluate(() => {
      window.viewer.setDetailFocus({ center: [6, 0, 0], radius: 0 });
    });
    const pixCartoon = await captureReadPixels(page, 2, true);
    await page.screenshot({ path: path.join(evidenceDir, 'detail-radius0-cartoon.jpg'), type: 'jpeg', quality: 90, timeout: 60000 });

    // Codon colour scheme with detail focus at center.
    await page.evaluate(() => {
      window.viewer.setStyle({ color: 'codon' });
      window.viewer.setDetailFocus({ center: [6, 0, 0], radius: 30 });
    });
    const pixCodon = await captureReadPixels(page, 2, true);
    await page.screenshot({ path: path.join(evidenceDir, 'detail-codon-scheme.jpg'), type: 'jpeg', quality: 90, timeout: 60000 });

    // Element colour scheme with detail focus at center.
    await page.evaluate(() => {
      window.viewer.setStyle({ color: 'element' });
      window.viewer.setDetailFocus({ center: [6, 0, 0], radius: 30 });
    });
    const pixElement = await captureReadPixels(page, 2, true);
    await page.screenshot({ path: path.join(evidenceDir, 'detail-element-scheme.jpg'), type: 'jpeg', quality: 90, timeout: 60000 });

    // GPU disposal check: cycle setAtomGroups + clear + restore and confirm geometry count does not grow.
    const memCheck = await page.evaluate(async () => {
      window.__setRafPaused(false);
      const waitFrame = () => new Promise(r => requestAnimationFrame(r));
      const g0 = window.viewer.getState().memory.geometries;
      for (let i = 0; i < 3; i++) {
        window.viewer.setAtomGroups([]);
        await waitFrame();
        window.viewer.setAtomGroups(window.__testGroups);
        await waitFrame();
      }
      const gAfter = window.viewer.getState().memory.geometries;
      window.viewer.setAtomGroups([]);
      window.viewer.setDetailFocus(null);
      await waitFrame();
      const gCleared = window.viewer.getState().memory.geometries;
      return { g0, gAfter, gCleared };
    });

    const diffCenterVsCartoon = gridDiffPct(pixCenter, pixCartoon);
    const diffCenterVsShifted = gridDiffPct(pixCenter, pixShifted);
    const diffStrandVsCodon = gridDiffPct(pixCenter, pixCodon);
    const diffStrandVsElement = gridDiffPct(pixCenter, pixElement);

    assert(pixCenter.nonBg > 40, `detail-center-r30 appears blank (nonBg=${pixCenter.nonBg})`);
    assert(pixCartoon.nonBg > 40, `detail-radius0-cartoon appears blank (nonBg=${pixCartoon.nonBg})`);
    assert(pixShifted.nonBg > 40, `detail-shifted-r30 appears blank (nonBg=${pixShifted.nonBg})`);
    assert(diffCenterVsCartoon > 1.0, `Expected detail focus (r=30) vs cartoon-only (r=0) to differ (got ${diffCenterVsCartoon.toFixed(2)}%)`);
    assert(diffCenterVsShifted > 1.0, `Expected shifted detail focus to change rendered pixels (got ${diffCenterVsShifted.toFixed(2)}%)`);
    assert(diffStrandVsCodon > 0.5, `Expected codon colour scheme to change rendered pixels (got ${diffStrandVsCodon.toFixed(2)}%)`);
    assert(diffStrandVsElement > 0.5, `Expected element colour scheme to change rendered pixels (got ${diffStrandVsElement.toFixed(2)}%)`);
    assert(memCheck.gAfter <= memCheck.g0, `Geometry leak detected across setAtomGroups cycles: before=${memCheck.g0}, after=${memCheck.gAfter}`);

    console.log(
      `TEST1 PASS: ${setupInfo.bp}-bp duplex (${setupInfo.dnaAtoms} atoms) + ${setupInfo.peptideResidues}-aa peptide (${setupInfo.peptideAtoms} atoms) + NTP (${setupInfo.ntpAtoms} atoms) | ` +
      `diffs: r30-vs-r0=${diffCenterVsCartoon.toFixed(2)}%, shifted=${diffCenterVsShifted.toFixed(2)}%, codon=${diffStrandVsCodon.toFixed(2)}%, element=${diffStrandVsElement.toFixed(2)}% | ` +
      `geometries: ${memCheck.g0}->${memCheck.gAfter} (cleared=${memCheck.gCleared})`,
    );
  } finally {
    await context.close();
  }
}

async function runTest2PerfDuplexAndRna(browser, base, errors) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  attachErrorCollector(page, 'test2-perf', errors);

  try {
    await page.goto(`${base}/dev/viewer-demo.html?rotate=0&effects=on&quality=high`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.viewer);

    const perf = await page.evaluate(async () => {
      const sci = await import('../js/science/index.js');
      const construct = sci.TRUE_SCALE_GENE_CONSTRUCT;
      const dnaSeq = construct.codingDna;
      const rnaSeq = construct.mrna;
      const asm = new sci.Assembly();

      // 248-bp B-DNA duplex (strands 0 and 1).
      const nDna = dnaSeq.length;
      const I = [], II = [];
      for (let k = 0; k < nDna; k++) {
        const f = sci.idealPairFrame(k, nDna, sci.HELIX_B);
        I.push(asm.addNucleotide({ base: dnaSeq[k], sugar: 'deoxyribose', strand: 0, frame: f, role: 'coding' }));
        II.push(asm.addNucleotide({ base: sci.COMPLEMENT[dnaSeq[k]], sugar: 'deoxyribose', strand: 1, frame: sci.partnerFrame(f), role: 'template' }));
        asm.addPair(I[k], II[k]);
      }
      if (asm.strands[1]) asm.strands[1].reverse();
      II.forEach((nuc, k) => { nuc.index = nDna - 1 - k; });
      for (let k = 0; k + 1 < nDna; k++) { asm.addLink(I[k], I[k + 1]); asm.addLink(II[k + 1], II[k]); }

      // 179-nt single-stranded mRNA (strand 2), offset +18 A in x.
      const nRna = rnaSeq.length;
      const R = [];
      for (let k = 0; k < nRna; k++) {
        const f = sci.idealPairFrame(k, nRna, sci.HELIX_A);
        f.o = [f.o[0] + 18, f.o[1], f.o[2]];
        R.push(asm.addNucleotide({ base: rnaSeq[k], sugar: 'ribose', strand: 2, frame: f, role: 'mrna' }));
      }
      for (let k = 0; k + 1 < nRna; k++) asm.addLink(R[k], R[k + 1]);

      asm.meta = { kind: 'expression', length: nDna, axis: [[0, 0, -(nDna - 1) * sci.HELIX_B.rise / 2], [0, 0, (nDna - 1) * sci.HELIX_B.rise / 2]] };
      asm.finalize();

      window.viewer.setQuality('high');
      window.viewer.setStyle({ representation: 'ballstick', color: 'strand', hbonds: true, autoRotate: false });
      window.viewer.setAssembly(asm);
      window.viewer.setDetailFocus({ center: [6, 0, 0], radius: 34 });
      window.viewer.focus({ center: [6, 0, 0], radius: 70, dir: [0.15, 0.96, 0.22] }, { duration: 0 });

      // Measure 10 consecutive rendered frames (forcing dirty sync each frame to exercise full update).
      const times = [];
      await new Promise(resolve => {
        let prev = 0;
        const off = window.viewer.on('frame', () => {
          const now = performance.now();
          if (prev > 0) times.push(now - prev);
          prev = now;
          window.viewer.sync();
          if (times.length >= 10) {
            off();
            resolve();
          }
        });
      });

      const sorted = [...times].sort((a, b) => a - b);
      const mean = times.reduce((s, v) => s + v, 0) / times.length;
      const median = sorted[Math.floor(sorted.length / 2)];
      const max = sorted[sorted.length - 1];
      return {
        nucleotides: asm.nucleotides.length,
        atoms: asm.atoms.count,
        quality: window.viewer.getState().quality,
        frames: times.length,
        medianMs: Math.round(median * 10) / 10,
        meanMs: Math.round(mean * 10) / 10,
        maxMs: Math.round(max * 10) / 10,
      };
    });

    const pix = await captureReadPixels(page, 2, false);
    assert(pix.nonBg > 40, `Test 2 scene appears blank (nonBg=${pix.nonBg})`);
    console.log(
      `TEST2 PASS (perf, software WebGL, quality=${perf.quality}): ${perf.nucleotides} nt (${perf.atoms} atoms) | ` +
      `${perf.frames} frames: median=${perf.medianMs} ms, mean=${perf.meanMs} ms, max=${perf.maxMs} ms`,
    );
  } finally {
    await context.close();
  }
}

// Deterministic init script for pixel-exact visual regression comparison (r3-st3 vs current).
const DETERMINISTIC_INIT = () => {
  // Mulberry32 PRNG for Math.random (stabilizes particle field and jitter phases).
  let seed = 0x2f6e2b1;
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // Deterministic rAF stepping: run exactly 8 fixed-16.6667ms frames, then freeze.
  const origRaf = window.requestAnimationFrame.bind(window);
  const origPerfNow = performance.now.bind(performance);
  let simNow = 1000;
  let frameCount = 0;
  const MAX_FRAMES = 8;
  performance.now = () => simNow;
  window.__detDone = false;
  window.__detOrigPerfNow = origPerfNow;
  let queue = [];
  let scheduled = false;
  const pump = () => {
    scheduled = false;
    if (frameCount >= MAX_FRAMES) {
      window.__detDone = true;
      return;
    }
    frameCount++;
    simNow = 1000 + frameCount * (1000 / 60);
    const batch = queue;
    queue = [];
    for (const cb of batch) cb(simNow);
    if (frameCount >= MAX_FRAMES) {
      window.__detDone = true;
    } else if (queue.length > 0 && !scheduled) {
      scheduled = true;
      origRaf(pump);
    }
  };
  window.requestAnimationFrame = cb => {
    queue.push(cb);
    if (!scheduled && frameCount < MAX_FRAMES) {
      scheduled = true;
      origRaf(pump);
    }
    return frameCount + queue.length;
  };
};

async function captureModePng(browser, url, tag, errors) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });
  await context.addInitScript(DETERMINISTIC_INIT);
  const page = await context.newPage();
  attachErrorCollector(page, tag, errors);
  try {
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__detDone === true, null, { polling: 100, timeout: 60000 });
    return await page.screenshot({ type: 'png', timeout: 60000 });
  } finally {
    await context.close();
  }
}

async function runTest3VisualRegression(browser, base, errors) {
  assert(hasBaselineRef, `Git baseline ref "${BASELINE_REF}" not found for visual regression`);
  const modes = [
    { id: 'structure', label: 'Explore' },
    { id: 'pair', label: 'Pairs' },
    { id: 'melt', label: 'Melt' },
    { id: 'replicate', label: 'Copy' },
    { id: 'crystal', label: 'X-ray' },
  ];
  const summary = [];
  for (const m of modes) {
    const basePng = await captureModePng(browser, `${base}/__baseline__/index.html?mode=${m.id}&quality=high`, `reg-base-${m.id}`, errors);
    const curPng = await captureModePng(browser, `${base}/index.html?mode=${m.id}&quality=high`, `reg-cur-${m.id}`, errors);
    const diff = diffRgba(decodePng(basePng), decodePng(curPng), 2);
    summary.push(`${m.label}=${diff.pct.toFixed(3)}%`);
    assert(diff.pct <= 0.5, `Visual regression in ${m.label} (${m.id}): ${diff.pct.toFixed(3)}% > 0.5%`);
  }
  console.log(`TEST3 PASS (visual regression vs ${BASELINE_REF}, <= 0.5%): ${summary.join(', ')}`);
}

async function main() {
  const server = await startServer();
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const errors = [];
  let browser;
  try {
    browser = await chromium.launch({
      args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    });
    await runTest1DetailAndAtomGroups(browser, base, errors);
    await runTest2PerfDuplexAndRna(browser, base, errors);
    await runTest3VisualRegression(browser, base, errors);
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }

  if (errors.length > 0) {
    for (const e of errors) console.error(e);
    console.log('RENDER DETAIL FAIL');
    process.exit(1);
  }
  console.log('RENDER DETAIL PASS');
}

try {
  await main();
} catch (err) {
  console.error(err && err.stack ? err.stack : err);
  console.log('RENDER DETAIL FAIL');
  process.exit(1);
}
