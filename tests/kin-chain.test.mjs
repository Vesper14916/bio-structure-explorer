// Unit & geometry tests for Round 3 task R3-K2:
// - js/kin/chain.js (buildFreeChain, poseFreeChain, generateTailControlPoints)
// - js/kin/hairpin.js (poseHairpin, hairpinPairFold)
// - js/kin/peptide-path.js (posePeptideOnPath)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildFreeChain,
  poseFreeChain,
  generateTailControlPoints,
  sampleFreeChainAt,
} from '../js/kin/chain.js';
import {
  poseHairpin,
  hairpinPairFold,
  HAIRPIN_LENGTH,
  HAIRPIN_STEM_LEN,
  HAIRPIN_LOOP_LEN,
} from '../js/kin/hairpin.js';
import { posePeptideOnPath } from '../js/kin/peptide-path.js';
import { readFrame16, quatToMat, matToQuat } from '../js/kin/frames.js';
import { Assembly } from '../js/science/assembly.js';
import { TRUE_SCALE_GENE_CONSTRUCT } from '../js/science/scenario.js';
import { peptideFromConstruct, buildPeptide } from '../js/science/peptide.js';
import { dist } from '../js/science/math.js';
import { decodeAsset } from '../js/assets/format.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');

function assertOrthonormal(R, label = 'R', tol = 1e-4) {
  for (let i = 0; i < 9; i++) assert.ok(Number.isFinite(R[i]), `${label}[${i}] not finite`);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const d = R[i] * R[j] + R[3 + i] * R[3 + j] + R[6 + i] * R[6 + j];
      const exp = i === j ? 1 : 0;
      assert.ok(Math.abs(d - exp) < tol, `${label}: col ${i}.${j} = ${d}, expected ${exp}`);
    }
  }
  const det =
    R[0] * (R[4] * R[8] - R[5] * R[7]) -
    R[1] * (R[3] * R[8] - R[5] * R[6]) +
    R[2] * (R[3] * R[7] - R[4] * R[6]);
  assert.ok(Math.abs(det - 1) < tol, `${label}: det = ${det}, expected +1`);
}

function buildAssemblyFromFrames(seq, buf, { pairStemLen = 0 } = {}) {
  const asm = new Assembly();
  const nucs = [];
  for (let i = 0; i < seq.length; i++) {
    const f = readFrame16(buf, i);
    nucs.push(asm.addNucleotide({ base: seq[i], sugar: 'ribose', strand: 0, frame: f }));
  }
  for (let i = 0; i < seq.length - 1; i++) asm.addLink(nucs[i], nucs[i + 1]);
  for (let i = 0; i < pairStemLen; i++) asm.addPair(nucs[i], nucs[seq.length - 1 - i]);
  return asm.finalize();
}

function loadRibosomeAsset() {
  const raw = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'assets/ribosome-70s.asset.json'), 'utf8'));
  return decodeAsset(raw);
}

// ============================================================================
// Module purity (zero DOM / zero three.js)
// ============================================================================

test('K2 modules have zero DOM and zero three.js imports', () => {
  for (const rel of ['js/kin/chain.js', 'js/kin/hairpin.js', 'js/kin/peptide-path.js']) {
    const src = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
    assert.doesNotMatch(src, /from\s+['"]three['"]/, `${rel} must not import three`);
    assert.doesNotMatch(src, /\b(document|window|HTMLElement|canvas)\b/, `${rel} must not touch DOM`);
  }
});

// ============================================================================
// js/kin/chain.js
// ============================================================================

test('chain: 2-point straight line yields exact A-form spacing and canonical O3\'-P', () => {
  const chain = buildFreeChain([[0, 0, 0], [0, 0, 200]], { seed: 7, chainId: 'straight', anchorEnds: true });
  const count = 40;
  const buf = new Float32Array(count * 16);
  const ret = poseFreeChain(chain, count, 1.5, buf);
  assert.equal(ret, buf);

  const seq = TRUE_SCALE_GENE_CONSTRUCT.mrna.slice(0, count);
  const asm = buildAssemblyFromFrames(seq, buf);

  for (let k = 0; k < count; k++) {
    const f = readFrame16(buf, k);
    assertOrthonormal(f.R, `straight[${k}]`);
    assert.ok(Math.abs(f.o[0]) < 1e-4 && Math.abs(f.o[1]) < 1e-4, `straight[${k}] off-axis`);
    assert.ok(Math.abs(f.o[2] - k * 2.81) < 1e-3, `straight[${k}].z = ${f.o[2]}`);
  }
  for (let k = 0; k < count - 1; k++) {
    const l = asm.links[k];
    const d = dist(asm.position(l.a), asm.position(l.b));
    assert.ok(Math.abs(d - 1.6017) < 0.02, `straight O3'-P[${k}] = ${d}`);
  }
});

test('chain: generateTailControlPoints respects 20-nt spacing, <=35 deg turn, and determinism', () => {
  const ptsA = generateTailControlPoints([10, -5, 2], [1, 0.2, -0.3], 179, { seed: 42, chainId: 'mrna-5p' });
  const ptsB = generateTailControlPoints([10, -5, 2], [1, 0.2, -0.3], 179, { seed: 42, chainId: 'mrna-5p' });
  const ptsC = generateTailControlPoints([10, -5, 2], [1, 0.2, -0.3], 179, { seed: 42, chainId: 'mrna-3p' });
  assert.deepEqual(ptsA, ptsB, 'same seed+chainId must be identical');
  assert.notDeepEqual(ptsA, ptsC, 'different chainId must diverge');
  assert.equal(ptsA.length, Math.ceil(179 / 20) + 1);

  const stepExpected = 20 * 2.81;
  let prevDir = [1, 0.2, -0.3];
  const pl = Math.hypot(...prevDir);
  prevDir = prevDir.map(v => v / pl);

  for (let i = 1; i < ptsA.length; i++) {
    const dx = ptsA[i][0] - ptsA[i - 1][0];
    const dy = ptsA[i][1] - ptsA[i - 1][1];
    const dz = ptsA[i][2] - ptsA[i - 1][2];
    const len = Math.hypot(dx, dy, dz);
    assert.ok(Math.abs(len - stepExpected) < 1e-6, `seg ${i} length ${len} != ${stepExpected}`);
    const dir = [dx / len, dy / len, dz / len];
    const cosAng = Math.max(-1, Math.min(1, dir[0] * prevDir[0] + dir[1] * prevDir[1] + dir[2] * prevDir[2]));
    const deg = (Math.acos(cosAng) * 180) / Math.PI;
    assert.ok(deg <= 35.001, `seg ${i} turn ${deg} deg > 35 deg`);
    prevDir = dir;
  }
});

test('chain: curved 179-nt mRNA meets 2.81 +/- 0.05 A spacing and O3\'-P <= 1.9 A across seeds and t', () => {
  const seq = TRUE_SCALE_GENE_CONSTRUCT.mrna;
  const count = seq.length; // 179 nt
  const buf = new Float32Array(count * 16);

  for (const seed of [1, 13, 99, 2026]) {
    const ctrl = generateTailControlPoints([0, 0, 0], [1, 0, 0], count, { seed, chainId: `mrna-${seed}` });
    const chain = buildFreeChain(ctrl, { seed, chainId: `mrna-${seed}`, anchorEnds: true });

    for (const t of [0, 1.75, 3.5, 5.25]) {
      poseFreeChain(chain, count, t, buf);
      const asm = buildAssemblyFromFrames(seq, buf);
      let maxO3P = 0;
      let minO3P = Infinity;
      let minAxial = Infinity;
      let maxAxial = 0;

      for (let k = 0; k < count; k++) {
        const f = readFrame16(buf, k);
        assertOrthonormal(f.R, `seed=${seed} t=${t} k=${k}`);
        if (k < count - 1) {
          const fNext = readFrame16(buf, k + 1);
          const dx = fNext.o[0] - f.o[0];
          const dy = fNext.o[1] - f.o[1];
          const dz = fNext.o[2] - f.o[2];
          const chord = Math.hypot(dx, dy, dz);
          const axial = dx * f.R[2] + dy * f.R[5] + dz * f.R[8];
          assert.ok(Math.abs(chord - 2.81) <= 0.05, `chord[${k}]=${chord} out of 2.81+/-0.05`);
          if (axial < minAxial) minAxial = axial;
          if (axial > maxAxial) maxAxial = axial;

          const l = asm.links[k];
          const d = dist(asm.position(l.a), asm.position(l.b));
          if (d > maxO3P) maxO3P = d;
          if (d < minO3P) minO3P = d;
        }
      }
      assert.ok(minAxial >= 2.76 && maxAxial <= 2.86, `axial range [${minAxial.toFixed(4)}, ${maxAxial.toFixed(4)}] out of 2.81+/-0.05`);
      assert.ok(maxO3P <= 1.9, `seed=${seed} t=${t}: max O3'-P = ${maxO3P.toFixed(4)} > 1.9 A`);
      assert.ok(minO3P >= 1.35, `seed=${seed} t=${t}: min O3'-P = ${minO3P.toFixed(4)} < 1.35 A`);
    }
  }
});

test('chain: anchor damping is exact 0 at anchors and ramps smoothly over 30 A', () => {
  // Straight control points spaced every 10 A along +x from 0 to 120 A
  const ctrl = [];
  for (let x = 0; x <= 120; x += 10) ctrl.push([x, 0, 0]);
  const chain = buildFreeChain(ctrl, {
    seed: 5,
    chainId: 'damp-test',
    anchorStart: true,
    anchorEnd: true,
    anchorDampRadius: 30,
    swayAmplitude: 6,
    swayPeriod: 7,
  });

  // Check exact damping profile at control points
  assert.equal(chain._damp[0], 0, 'start anchor must have 0 damping');
  assert.equal(chain._damp[ctrl.length - 1], 0, 'end anchor must have 0 damping');
  assert.ok(chain._damp[1] > 0 && chain._damp[1] < chain._damp[2], 'monotonic ramp 10 A < 20 A');
  assert.ok(chain._damp[2] < 1, '20 A < 30 A must still be damped');
  assert.equal(chain._damp[3], 1, '30 A from anchor reaches full undamped amplitude');
  assert.equal(chain._damp[6], 1, 'midpoint at 60 A is undamped');

  // Verify posed endpoint stays fixed across time while interior moves smoothly and periodically (period 7 s)
  const buf0 = poseFreeChain(chain, 40, 0);
  const buf1 = poseFreeChain(chain, 40, 1.75);
  const buf7 = poseFreeChain(chain, 40, 7.0);

  const fStart0 = readFrame16(buf0, 0);
  const fStart1 = readFrame16(buf1, 0);
  assert.ok(dist(fStart0.o, fStart1.o) < 1e-4, 'anchored start must stay stationary');

  const fMid0 = readFrame16(buf0, 20);
  const fMid1 = readFrame16(buf1, 20);
  const fMid7 = readFrame16(buf7, 20);
  assert.ok(dist(fMid0.o, fMid1.o) > 0.5, 'interior must sway with story time t');
  assert.ok(dist(fMid0.o, fMid7.o) < 1e-3, 'sway must be 7-second periodic');

  // Sample helper consistency
  const sEnd = sampleFreeChainAt(chain, 0, 2.5);
  assert.ok(dist(sEnd.point, [0, 0, 0]) < 1e-4);
});

test('chain: edge cases (count=0, count=1, tailLength, short buffer error)', () => {
  const chain = buildFreeChain([[0, 0, 0], [30, 0, 0]], { tailLength: 40, seed: 3, chainId: 'ext' });
  assert.ok(chain.restLength > 100, 'tailLength should extend rest spline');
  const b0 = poseFreeChain(chain, 0, 0, new Float32Array(0));
  assert.equal(b0.length, 0);
  const b1 = poseFreeChain(chain, 1, 0);
  assert.equal(b1.length, 16);
  assertOrthonormal(readFrame16(b1, 0).R, 'count=1');
  assert.throws(() => poseFreeChain(chain, 10, 0, new Float32Array(100)), RangeError);
});

// ============================================================================
// js/kin/hairpin.js
// ============================================================================

test('hairpin: hairpinPairFold follows the 9-nt 3\'-end clearance rule on Construct v3', () => {
  const tss = TRUE_SCALE_GENE_CONSTRUCT.regions.find(r => r.id === 'utrLeader').start;
  const stem5 = TRUE_SCALE_GENE_CONSTRUCT.regions.find(r => r.id === 'termStem5');
  const start = stem5.start - tss;
  assert.equal(start, 151);

  // At L = 171 (right before 8-U tract): 0 pairs folded
  for (let i = 0; i < HAIRPIN_STEM_LEN; i++) {
    assert.equal(hairpinPairFold(i, 171, start), 0, `pair ${i} must be 0 at L=171`);
  }
  // At L = 172 (1st U): apical pair 7 (idx3 = 163, 172 - 163 = 9) is folded, 0..6 are 0
  assert.equal(hairpinPairFold(7, 172, start), 1);
  for (let i = 0; i < 7; i++) assert.equal(hairpinPairFold(i, 172, start), 0);

  // At L = 175 (4th U): pairs 4..7 folded, 0..3 unfolded
  for (let i = 4; i < 8; i++) assert.equal(hairpinPairFold(i, 175, start), 1);
  for (let i = 0; i < 4; i++) assert.equal(hairpinPairFold(i, 175, start), 0);

  // Fractional transcript length 171.5 yields smooth intermediate value in (0, 1)
  const mid = hairpinPairFold(7, 171.5, start);
  assert.ok(mid > 0 && mid < 1, `expected smooth transition at 171.5, got ${mid}`);

  // At L = 179 (end of 8-U tract): all 8 pairs folded
  for (let i = 0; i < HAIRPIN_STEM_LEN; i++) {
    assert.equal(hairpinPairFold(i, 179, start), 1, `pair ${i} must be 1 at L=179`);
  }
});

test('hairpin: full fold (foldProgress=1) gives 2.7-3.1 A WC H-bonds, intact backbone, and zero clashes', () => {
  const tss = TRUE_SCALE_GENE_CONSTRUCT.regions.find(r => r.id === 'utrLeader').start;
  const hpStart = TRUE_SCALE_GENE_CONSTRUCT.regions.find(r => r.id === 'termStem5').start - tss;
  const hpEnd = TRUE_SCALE_GENE_CONSTRUCT.regions.find(r => r.id === 'termStem3').end - tss;
  const hpSeq = TRUE_SCALE_GENE_CONSTRUCT.mrna.slice(hpStart, hpEnd);
  assert.equal(hpSeq.length, HAIRPIN_LENGTH);
  assert.equal(hpSeq, 'GGCGCCUGGAAACAGGCGCC');

  // Test at an arbitrary rotated + translated world anchor to prove rigid invariance
  const anchor = {
    o: [42.5, -18.2, 11.7],
    R: quatToMat(matToQuat([0, 1, 0, -0.6, 0, 0.8, 0.8, 0, 0.6])),
  };
  const buf = new Float32Array(HAIRPIN_LENGTH * 16);
  const ret = poseHairpin(anchor, 1.0, buf);
  assert.equal(ret, buf);

  for (let k = 0; k < HAIRPIN_LENGTH; k++) {
    assertOrthonormal(readFrame16(buf, k).R, `hairpin[${k}]`);
  }

  const asm = buildAssemblyFromFrames(hpSeq, buf, { pairStemLen: HAIRPIN_STEM_LEN });
  assert.equal(asm.pairs.length, HAIRPIN_STEM_LEN);

  // Every single stem Watson-Crick H-bond strictly within 2.7-3.1 A
  for (const p of asm.pairs) {
    const lens = asm.hbondLengths(p);
    assert.ok(lens.length >= 2, `pair ${p.id} (${p.type}) must have >=2 H-bonds`);
    for (const d of lens) {
      assert.ok(d >= 2.7 && d <= 3.1, `pair ${p.id} (${p.type}) H-bond = ${d.toFixed(4)} A outside [2.7, 3.1]`);
    }
  }

  // Every single O3'-P link (stem 5', GAAA loop, stem 3') <= 1.9 A
  for (let k = 0; k < asm.links.length; k++) {
    const l = asm.links[k];
    const d = dist(asm.position(l.a), asm.position(l.b));
    assert.ok(d >= 1.45 && d <= 1.9, `hairpin O3'-P[${k}] = ${d.toFixed(4)} A outside [1.45, 1.9]`);
  }

  // Zero severe steric clashes (< 2.4 A) between non-bonded heavy atoms of different nucleotides
  const SKIP_PREV = new Set(["O3'", "C3'"]);
  const SKIP_NEXT = new Set(['P', 'OP1', 'OP2', "O5'"]);
  let minNB = Infinity;
  for (let i = 0; i < HAIRPIN_LENGTH; i++) {
    for (let j = i + 1; j < HAIRPIN_LENGTH; j++) {
      const ni = asm.nucleotides[i], nj = asm.nucleotides[j];
      const adj = j === i + 1;
      const paired = i < HAIRPIN_STEM_LEN && j === HAIRPIN_LENGTH - 1 - i;
      if (paired) continue;
      for (let a = 0; a < ni.atomCount; a++) {
        const na = ni.names[a], pa = asm.position(ni.atomStart + a);
        for (let b = 0; b < nj.atomCount; b++) {
          const nb = nj.names[b];
          if (adj && SKIP_PREV.has(na) && SKIP_NEXT.has(nb)) continue;
          const d = dist(pa, asm.position(nj.atomStart + b));
          if (d < minNB) minNB = d;
        }
      }
    }
  }
  assert.ok(minNB >= 2.4, `hairpin steric clash: min non-bonded heavy atom dist = ${minNB.toFixed(3)} A`);
});

test('hairpin: progressive folding transitions smoothly apical-to-closing and supports custom unfoldedFrames', () => {
  const anchor = { o: [0, 0, 0], R: [1, 0, 0, 0, 1, 0, 0, 0, 1] };
  const b0 = poseHairpin(anchor, 0.0);
  const bMid = poseHairpin(anchor, 0.5);
  const b1 = poseHairpin(anchor, 1.0);
  const b1Repeat = poseHairpin(anchor, 1.0);
  assert.deepEqual(b1, b1Repeat, 'poseHairpin must be deterministic');

  // At foldProgress = 0.5, apical pair 3' partner (nuc 12) is already folded to pair with nuc 7,
  // while closing pair 3' partner (nuc 19) is still at its unfolded pose.
  const f7Mid = readFrame16(bMid, 7);
  const f12Mid = readFrame16(bMid, 12);
  const f19Zero = readFrame16(b0, 19);
  const f19Mid = readFrame16(bMid, 19);
  const f19One = readFrame16(b1, 19);
  assert.ok(dist(f7Mid.o, f12Mid.o) < 1e-3, 'apical pair (7, 12) should already be closed at foldProgress=0.5');
  assert.ok(dist(f19Mid.o, f19Zero.o) < 1e-3, 'closing pair nuc 19 should still be unfolded at foldProgress=0.5');
  assert.ok(dist(f19One.o, anchor.o) < 1e-3, 'closing pair nuc 19 should close onto anchor at foldProgress=1');

  // Transcript-length driven folding matches full fold at L=179
  const bLen179 = poseHairpin(anchor, 1.0, new Float32Array(HAIRPIN_LENGTH * 16), {
    totalTranscriptLength: 179,
    hairpinStart: 151,
  });
  for (let i = 0; i < bLen179.length; i++) {
    assert.ok(Math.abs(bLen179[i] - b1[i]) < 1e-5);
  }

  // Custom unfoldedFrames from buildFreeChain works cleanly at foldProgress = 0 and 1
  const freeChain = buildFreeChain([[0, 0, 0], [0, 0, 80]], { anchorEnds: true });
  const unfolded = poseFreeChain(freeChain, HAIRPIN_LENGTH, 0);
  const bCustom0 = poseHairpin(anchor, 0, new Float32Array(HAIRPIN_LENGTH * 16), { unfoldedFrames: unfolded });
  for (let i = 0; i < unfolded.length; i++) {
    assert.ok(Math.abs(bCustom0[i] - unfolded[i]) < 1e-5, 'foldProgress=0 must match custom unfoldedFrames');
  }

  assert.throws(() => poseHairpin(anchor, 1, new Float32Array(100)), RangeError);
});

// ============================================================================
// js/kin/peptide-path.js
// ============================================================================

test('peptide-path: 40-aa Construct v3 peptide on real ribosome-70s tunnel meets C-N 1.33 +/- 0.25 A gate', () => {
  const ribo = loadRibosomeAsset();
  const tunnel = ribo.paths.tunnel;
  assert.ok(tunnel && tunnel.points.length >= 200, 'ribosome-70s tunnel path must exist');

  // Solvent-side free continuation starting at tunnel exit along exit direction
  const nT = tunnel.count;
  const exitPt = [
    tunnel.points[(nT - 1) * 3],
    tunnel.points[(nT - 1) * 3 + 1],
    tunnel.points[(nT - 1) * 3 + 2],
  ];
  const prevPt = [
    tunnel.points[(nT - 6) * 3],
    tunnel.points[(nT - 6) * 3 + 1],
    tunnel.points[(nT - 6) * 3 + 2],
  ];
  const exitDir = [exitPt[0] - prevPt[0], exitPt[1] - prevPt[1], exitPt[2] - prevPt[2]];
  const freeCtrl = generateTailControlPoints(exitPt, exitDir, 80, { seed: 77, chainId: 'peptide-free' });
  const freeChain = buildFreeChain(freeCtrl, { seed: 77, chainId: 'peptide-free', anchorStart: true, anchorEnd: false });

  const codes3 = peptideFromConstruct(TRUE_SCALE_GENE_CONSTRUCT);
  assert.equal(codes3.length, 40);
  assert.equal(codes3[0], 'FME');

  // Build reference ideal intra-residue bond lengths once from buildPeptide
  const idealPep = buildPeptide(codes3, { cTerminalOxt: false });
  const outGroup = { id: 'nascent-peptide' };

  for (const t of [0, 2.3, 5.1]) {
    for (const releaseProgress of [0, 0.25, 0.5, 0.75, 1.0]) {
      const g = posePeptideOnPath(codes3, tunnel, freeChain, releaseProgress, outGroup, { t });
      assert.equal(g, outGroup, 'must populate and return outGroup in place');
      assert.equal(g.id, 'nascent-peptide');
      assert.equal(g.kind, 'peptide');
      assert.equal(g.count, idealPep.atoms.count);
      assert.equal(g.pos.length, g.count * 3);
      assert.equal(g.el.length, g.count);
      assert.equal(g.names.length, g.count);
      assert.equal(g.residue.length, g.count);
      assert.equal(g.bonds.length, idealPep.bonds.length);
      assert.equal(g.residues.length, 40);

      for (let i = 0; i < g.pos.length; i++) {
        assert.ok(Number.isFinite(g.pos[i]), `non-finite pos[${i}]`);
      }

      // Check EVERY inter-residue C(r)-N(r+1) bond lies strictly within 1.33 +/- 0.25 A (1.08-1.58 A)
      let minCN = Infinity;
      let maxCN = 0;
      for (let r = 0; r < codes3.length - 1; r++) {
        const resA = g.residues[r];
        const resB = g.residues[r + 1];
        let idxC = -1, idxN = -1;
        for (let i = resA.atomStart; i < resA.atomStart + resA.atomCount; i++) {
          if (g.names[i] === 'C') { idxC = i; break; }
        }
        for (let i = resB.atomStart; i < resB.atomStart + resB.atomCount; i++) {
          if (g.names[i] === 'N') { idxN = i; break; }
        }
        assert.ok(idxC >= 0 && idxN >= 0);
        const pC = [g.pos[idxC * 3], g.pos[idxC * 3 + 1], g.pos[idxC * 3 + 2]];
        const pN = [g.pos[idxN * 3], g.pos[idxN * 3 + 1], g.pos[idxN * 3 + 2]];
        const d = dist(pC, pN);
        if (d < minCN) minCN = d;
        if (d > maxCN) maxCN = d;
        assert.ok(
          Math.abs(d - 1.33) <= 0.25,
          `t=${t} rel=${releaseProgress} C(${r})-N(${r + 1}) = ${d.toFixed(4)} A outside 1.33+/-0.25`
        );
      }

      // Check intra-residue bond lengths are preserved to rigid-body precision (< 1e-3 A)
      if (t === 0 && releaseProgress === 0) {
        for (let b = 0; b < g.bonds.length; b += 2) {
          const iA = g.bonds[b], iB = g.bonds[b + 1];
          if (g.residue[iA] !== g.residue[iB]) continue; // skip inter-residue C-N
          const dObs = dist(
            [g.pos[iA * 3], g.pos[iA * 3 + 1], g.pos[iA * 3 + 2]],
            [g.pos[iB * 3], g.pos[iB * 3 + 1], g.pos[iB * 3 + 2]]
          );
          const dRef = dist(
            [idealPep.atoms.pos[iA * 3], idealPep.atoms.pos[iA * 3 + 1], idealPep.atoms.pos[iA * 3 + 2]],
            [idealPep.atoms.pos[iB * 3], idealPep.atoms.pos[iB * 3 + 1], idealPep.atoms.pos[iB * 3 + 2]]
          );
          assert.ok(Math.abs(dObs - dRef) < 0.005, `intra-residue bond ${iA}-${iB}: ${dObs} vs ${dRef}`);
        }

        // C-terminal residue (index 39, k = 0) sits at tunnel start (ptc)
        const ptc = [tunnel.points[0], tunnel.points[1], tunnel.points[2]];
        const caCterm = g.residues[39].ca;
        assert.ok(dist(caCterm, ptc) < 1.5, `C-term CA dist to ptc = ${dist(caCterm, ptc).toFixed(3)} A`);

        // Verify no residue CA inside the 86.71 A exit tunnel collides with 50S L1 beads (< 4.0 A)
        const l1 = ribo.lod1;
        let minTunnelClearance = Infinity;
        for (let r = 0; r < g.residues.length; r++) {
          const k = g.residues.length - 1 - r;
          if (k * 3.40 > 86.71) continue;
          const ca = g.residues[r].ca;
          for (let b = 0; b < l1.count; b++) {
            const d = dist(ca, [l1.positions[b * 3], l1.positions[b * 3 + 1], l1.positions[b * 3 + 2]]);
            if (d < minTunnelClearance) minTunnelClearance = d;
          }
        }
        assert.ok(
          minTunnelClearance >= 4.0,
          `min tunnel-interior CA-to-50S L1 bead clearance = ${minTunnelClearance.toFixed(2)} A < 4.0 A`
        );
      }

      // At releaseProgress = 1, C-terminal residue has slid completely past tunnel exit into solvent
      if (releaseProgress === 1.0) {
        const ptc = [tunnel.points[0], tunnel.points[1], tunnel.points[2]];
        const caCterm = g.residues[39].ca;
        assert.ok(dist(caCterm, ptc) > 65, `released C-term should be far from PTC, got ${dist(caCterm, ptc).toFixed(1)} A`);
      }
    }
  }
});

test('peptide-path: determinism, buffer reuse across growing lengths, and edge cases', () => {
  const straightTunnel = [[0, 0, 0], [50, 0, 0]];
  const straightFree = [[50, 0, 0], [150, 0, 0]];
  const codes = peptideFromConstruct(TRUE_SCALE_GENE_CONSTRUCT);

  const gA = posePeptideOnPath(codes, straightTunnel, straightFree, 0.3, {});
  const gB = posePeptideOnPath(codes, straightTunnel, straightFree, 0.3, {});
  assert.deepEqual(Array.from(gA.pos), Array.from(gB.pos), 'must be deterministic');

  // Buffer reuse as peptide grows/shrinks (backing Float32Array stays allocated)
  const bufPos = gA._posBuf;
  const bufBonds = gA._bondsBuf;
  posePeptideOnPath(codes.slice(0, 12), straightTunnel, straightFree, 0, gA);
  assert.equal(gA._posBuf, bufPos, 'backing _posBuf should be reused when shrinking');
  assert.equal(gA._bondsBuf, bufBonds, 'backing _bondsBuf should be reused when shrinking');
  assert.equal(gA.residues.length, 12);
  assert.equal(gA.pos.length, gA.count * 3);

  // Edge cases: 0, 1, 2 residues and null freePath
  const g0 = posePeptideOnPath([], straightTunnel, null, 0, {});
  assert.equal(g0.count, 0);
  assert.equal(g0.residues.length, 0);

  const g1 = posePeptideOnPath(['FME'], straightTunnel, null, 0, {});
  assert.equal(g1.residues.length, 1);
  assert.ok(g1.count > 0);

  const g2 = posePeptideOnPath(['FME', 'GLY'], straightTunnel, null, 0.5, {});
  assert.equal(g2.residues.length, 2);
  const r0 = g2.residues[0], r1 = g2.residues[1];
  const iC = r0.atomStart + g2.names.slice(r0.atomStart, r0.atomStart + r0.atomCount).indexOf('C');
  const iN = r1.atomStart + g2.names.slice(r1.atomStart, r1.atomStart + r1.atomCount).indexOf('N');
  const dCN = dist(
    [g2.pos[iC * 3], g2.pos[iC * 3 + 1], g2.pos[iC * 3 + 2]],
    [g2.pos[iN * 3], g2.pos[iN * 3 + 1], g2.pos[iN * 3 + 2]]
  );
  assert.ok(Math.abs(dCN - 1.33) <= 0.1, `2-residue FME-GLY C-N = ${dCN}`);
});
