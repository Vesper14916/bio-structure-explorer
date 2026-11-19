// Committed ribosome asset (ribosome-70s), ST2 steps 2 and 3 (including the tunnel path and the ptc / tunnelExit anchors). Reads committed files only (no tools/sources/); reference values come from asset.source.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAsset, decodeAsset, trackFrame } from '../js/assets/format.js';
import { composeFrames, dist, dot } from '../js/science/math.js';
import { meshStats, insideMesh } from '../tools/lib/surface.mjs';
import { frameAtoms } from '../tools/assets/ribosome.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const raw = id => JSON.parse(fs.readFileSync(path.join(root, 'assets', `${id}.asset.json`), 'utf8'));
const fileSize = id => fs.statSync(path.join(root, 'assets', `${id}.asset.json`)).size;
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets', 'manifest.json'), 'utf8'));

const a = raw('ribosome-70s');
const d = decodeAsset(a);
const REQUIRED_ANCHORS = ['center', 'siteA', 'siteP', 'siteE', 'siteAT', 'decoding', 'mrnaEntry', 'mrnaExit', 'antiSD', 'smallCenter', 'largeCenter', 'ptc', 'tunnelExit'];
const COMPLEMENT = { A: 'U', U: 'A', G: 'C', C: 'G' };
const zOf = f => [f.R[2], f.R[5], f.R[8]];
const pointOf = (arr, i) => [arr[3 * i], arr[3 * i + 1], arr[3 * i + 2]];

test('ribosome-70s validates as version 2 and is registered in the manifest', () => {
  assert.deepEqual(validateAsset(a), []);
  assert.equal(a.version, 2);
  assert.equal(a.id, 'ribosome-70s');
  assert.equal(a.source.pdbId, '7K00');
  assert.deepEqual(a.source.additionalSources.map(s => s.pdbId), ['7ST2', '5WE4', '7PJV']);
  assert.ok(manifest.assets.some(e => e.id === 'ribosome-70s' && e.file === 'ribosome-70s.asset.json' && e.synthetic === false));
  assert.equal(typeof frameAtoms, 'function');
});

test('ribosome-70s parts, chain table and subunit tags', () => {
  assert.deepEqual(d.parts.map(p => [p.id, p.role]), [['small', 'body'], ['large', 'body']]);
  assert.deepEqual(d.lod0.map(m => m.part), ['small', 'large']);
  const count = (part, subunit) => d.chains.filter(c => c.part === part && c.subunit === subunit).length;
  assert.equal(d.chains.length, 52);
  assert.equal(count('small', 'rRNA16S'), 1);
  assert.equal(count('small', 'rprotein30S'), 20);
  assert.equal(count('large', 'rRNA23S'), 1);
  assert.equal(count('large', 'rRNA5S'), 1);
  assert.equal(count('large', 'rprotein50S'), 29);
  for (const c of d.chains) {
    assert.ok(['rRNA16S', 'rprotein30S', 'rRNA23S', 'rRNA5S', 'rprotein50S'].includes(c.subunit), `chain ${c.id} subunit`);
    assert.equal(c.class, c.subunit.startsWith('rRNA') ? 'rna' : 'protein');
    assert.equal(c.part, c.subunit.endsWith('30S') || c.subunit === 'rRNA16S' ? 'small' : 'large');
  }
  // L1: P beads (kind 1) for RNA, CA beads (kind 0) for protein; the bead count per chain equals chains[].residues.
  const perChain = new Array(d.chains.length).fill(0);
  for (let i = 0; i < d.lod1.count; i++) {
    perChain[d.lod1.chain[i]]++;
    assert.equal(d.lod1.kind[i], d.chains[d.lod1.chain[i]].class === 'rna' ? 1 : 0);
  }
  d.chains.forEach((c, i) => assert.equal(perChain[i], c.residues, `chain ${c.id} bead count`));
  for (const id of ['X', 'Y', 'Z', '5']) assert.ok(!d.chains.some(c => c.id === id), `chain ${id} must not be in the chain table`);
});

test('ribosome-70s required anchors, conditional hybrid anchors, L2 site', () => {
  for (const k of REQUIRED_ANCHORS) assert.ok(d.anchors[k], `anchor ${k}`);
  const dec = a.source.siteChecks.hybrid.decision;
  assert.equal(Boolean(d.anchors.siteAP), dec.siteAP === 'kept');
  assert.equal(Boolean(d.anchors.sitePE), dec.sitePE === 'kept');
  const fit = a.source.siteChecks.hybrid.fits.find(f => f.fit === '16S+23S');
  assert.equal(Boolean(d.anchors.siteAP), fit.wToSiteA <= 4.0);
  assert.equal(Boolean(d.anchors.sitePE), fit.vToSiteP <= 4.0);
  const site = d.lod2.sites.find(s => s.anchor === 'decoding');
  assert.ok(site && site.radius === 12, 'L2 site decoding at 12 A');
  assert.equal(d.anchors.mrnaEntry.synthetic, 1);
  assert.equal(d.anchors.mrnaExit.synthetic, 1);
  assert.equal(d.anchors.antiSD.synthetic, 0);
  assert.equal(a.source.antiSD.sequence, 'CCUCCU');
  // siteA and siteP are the trna frames of two tRNAs 3 nucleotides apart on the mRNA: their origins are about one codon apart.
  const sep = dist(d.anchors.siteA.o, d.anchors.siteP.o);
  assert.ok(sep > 15 && sep < 30, `siteA-siteP separation ${sep}`);
});

test('ribosome-70s codon pairing (stored record): Watson-Crick at all three positions, P and A sites', () => {
  const cp = a.source.codonPairing;
  for (const [site, codon, anticodon] of [['P', 'AUG', 'CAU'], ['A', 'GUA', 'UAC']]) {
    const s = cp[site];
    assert.equal(s.codon, codon);
    assert.equal(s.anticodon, anticodon);
    assert.equal(s.positions.length, 3);
    for (const p of s.positions) {
      assert.equal(COMPLEMENT[p.mrnaBase], p.trnaBase, `${site} position ${p.position} identities`);
      assert.ok(p.complementary && p.antiparallel);
      assert.ok(p.originDistanceA <= 2.5, `${site} position ${p.position} origin distance ${p.originDistanceA}`);
      assert.ok(p.normalAngleDeg < 90);
    }
    assert.ok(s.ok);
  }
});

test('ribosome-70s codon pairing recomputed from the committed assets (trna-* anticodon track placed at siteP / siteA)', () => {
  const mrna = d.tracks.mrna;
  for (const [id, anchor, first] of [['trna-init', 'siteP', 0], ['trna-aa', 'siteA', 3]]) {
    const t = decodeAsset(raw(id)).tracks.anticodon;
    for (let i = 0; i < 3; i++) {
      const codon = trackFrame(mrna, first + i);
      const anti = composeFrames(d.anchors[anchor], trackFrame(t, 36 - i));
      assert.equal(COMPLEMENT[mrna.bases[first + i - mrna.registers[0]]], t.bases[2 - i], `${id} base pair ${i + 1}`);
      assert.ok(dist(codon.o, anti.o) <= 2.5, `${id} position ${i + 1}: origin distance ${dist(codon.o, anti.o)}`);
      assert.ok(dot(zOf(codon), zOf(anti)) < 0, `${id} position ${i + 1}: normals antiparallel`);
    }
  }
});

test('ribosome-70s E-site check and 7ST2 register confirmation', () => {
  const e = a.source.siteChecks.eSite;
  assert.equal(e.chain, '6');
  assert.deepEqual(e.nucleotides, [75, 76]);
  assert.ok(e.atoms >= 40, `${e.atoms} atoms matched`);
  assert.ok(e.rmsdA <= 3.0, `E-site RMSD ${e.rmsdA}`);
  const other = e.candidates.find(c => c.chain !== e.chain);
  assert.ok(!other || other.rmsdA > 3.0, 'the other 7ST2 tRNA is not in the E site');
  const p = a.source.siteChecks.stSiteP;
  assert.ok(p.anticodonToSitePA <= 4.0);
  assert.equal(a.source.mrna.registerRule['7ST2'].startsWith(`register = author - ${p.codonStartAuth}`), true);
});

test('ribosome-70s superpositions recorded and within the gate', () => {
  const sp = a.source.superpositions;
  for (const s of sp) {
    for (const k of ['mobile', 'scope', 'nBefore', 'nAfter', 'rmsdBeforeA', 'rmsdAfterA', 'nameMismatchesExcluded', 'keptFraction']) assert.ok(s[k] !== undefined, `${s.mobile} ${s.scope}: ${k}`);
    assert.ok(s.nAfter <= s.nBefore && s.rmsdAfterA <= s.rmsdBeforeA);
    assert.equal(s.reference, '7K00');
  }
  for (const id of ['7ST2', '5WE4']) {
    const s = sp.find(x => x.mobile === id && x.role === 'primary');
    assert.equal(s.scope, '16S+23S');
    assert.ok(s.rmsdAfterA <= 1.5, `${id} RMSD ${s.rmsdAfterA}`);
    assert.ok(s.nAfter > 3000, `${id} atoms ${s.nAfter}`);
  }
  // 7PJV: the plan rule (16S+23S) is recorded together with the two single-subunit fits; the primary fit keeps only a small fraction.
  const pj = sp.filter(x => x.mobile === '7PJV');
  assert.deepEqual(pj.map(x => x.scope), ['16S+23S', '23S', '16S']);
  assert.equal(pj[0].role, 'primary');
  assert.ok(pj[0].keptFraction < 0.5, 'the 7PJV 16S+23S fit trims most atoms (hybrid-state ribosome)');
  assert.ok(pj[1].keptFraction > 0.9 && pj[2].keptFraction > 0.7);
});

test('ribosome-70s mrna track: registers -16..+15 with per-register sources', () => {
  const t = d.tracks.mrna;
  assert.equal(t.kind, 'rna');
  assert.equal(t.registers.length, 32);
  assert.equal(t.registers[0], -16);
  assert.equal(t.registers[31], 15);
  assert.equal(t.synthetic.length, 32);
  assert.equal(t.sources.length, 32);
  assert.equal(t.bases.length, 32);
  t.registers.forEach((k, i) => {
    assert.ok(['7K00', '7ST2', 'synthetic'].includes(t.sources[i]));
    assert.equal(t.synthetic[i], t.sources[i] === 'synthetic' ? 1 : 0, `register ${k}`);
    assert.equal(t.bases[i] === 'N', t.synthetic[i] === 1, `register ${k} base`);
    assert.equal(t.sources[i] === '7K00', k >= -3 && k <= 8, `register ${k} source`);
  });
  assert.deepEqual(t.registers.filter((k, i) => t.sources[i] === '7ST2'), [-14, -13, -12, -11, -10, -9, -8, -7, -6, -5, -4]);
  assert.deepEqual(t.registers.filter((k, i) => t.synthetic[i] === 1), [-16, -15, 9, 10, 11, 12, 13, 14, 15]);
  assert.equal(t.bases.slice(16, 19), 'AUG');                         // P-site codon, registers 0..2
  assert.equal(t.bases.slice(19, 22), 'GUA');                         // A-site codon, registers 3..5
  assert.deepEqual(d.anchors.mrnaEntry.o, trackFrame(t, 15).o);
  assert.deepEqual(d.anchors.mrnaExit.o, trackFrame(t, -16).o);
  // Synthetic extensions advance by the A-form rise (2.81 A) along the local z axis per register.
  for (const k of [-15, 9, 10, 15]) assert.ok(Math.abs(dist(trackFrame(t, k).o, trackFrame(t, k + (k < 0 ? 1 : -1)).o) - 2.81) < 0.02, `register ${k} step`);
  // Frames are orthonormal (validateAsset) and the ribo frame puts register 0 near the origin.
  assert.ok(dist(trackFrame(t, 0).o, [0, 0, 0]) < 8);
});

test('ribosome-70s L0 meshes are closed, outward, and contain at least 95 % of their L1 beads', () => {
  for (const m of d.lod0) {
    const ms = meshStats(m.positions, m.indices);
    assert.ok(ms.closed && ms.signedVolume > 0, `${m.part} mesh ${JSON.stringify(ms)}`);
    const beads = [];
    for (let i = 0; i < d.lod1.count; i++) if (d.chains[d.lod1.chain[i]].part === m.part) beads.push(pointOf(d.lod1.positions, i));
    // Test every 4th bead to keep the test fast; the recipe checks all of them.
    const sample = beads.filter((_, i) => i % 4 === 0);
    const inside = sample.filter(b => insideMesh(m.positions, m.indices, b)).length / sample.length;
    assert.ok(inside >= 0.94, `${m.part}: ${inside} of sampled beads inside`);
  }
  for (const p of a.lod0.parts) assert.ok(p.beadsInside >= 0.95, `${p.part} recorded containment ${p.beadsInside}`);
});

test('ribosome-70s L2: valid bonds, atoms near the site anchors (decoding, ptc)', () => {
  const l2 = d.lod2;
  assert.ok(l2.count > 100);
  for (let i = 0; i < l2.bonds.length; i += 2) {
    assert.ok(l2.bonds[i] < l2.count && l2.bonds[i + 1] < l2.count);
    const bl = dist(pointOf(l2.positions, l2.bonds[i]), pointOf(l2.positions, l2.bonds[i + 1]));
    assert.ok(bl > 0.9 && bl < 2.3, `bond length ${bl}`);
  }
  let near = 0, nearDec = 0;
  for (let i = 0; i < l2.count; i++) {
    const p = pointOf(l2.positions, i), dd = dist(p, d.anchors.decoding.o) <= 12.5;
    if (dd) nearDec++;
    if (dd || dist(p, d.anchors.ptc.o) <= 12.5) near++;
  }
  assert.ok(nearDec > 100, 'L2 holds atoms around the decoding anchor');
  assert.ok(near > 0.3 * l2.count, 'a large share of L2 atoms lies within a site radius (whole residues extend beyond it)');
  for (let i = 0; i < l2.count; i++) assert.ok(l2.chain[i] < d.chains.length);
});

test('ribosome-70s budgets (PLAN.md 7.5)', () => {
  const tri = a.lod0.parts.reduce((s, m) => s + m.triangleCount, 0);
  assert.ok(tri <= 70000, `L0 ${tri} triangles`);
  assert.ok(a.lod1.count <= 15000, `L1 ${a.lod1.count} beads`);
  assert.ok(a.lod2.count <= 4000, `L2 ${a.lod2.count} atoms`);
  assert.ok(fileSize('ribosome-70s') <= 1200000, `file ${fileSize('ribosome-70s')} bytes`);
  assert.ok(dist(d.anchors.largeCenter.o, d.anchors.smallCenter.o) > 40, 'subunit centres are separated');
});

test('ribosome-70s tunnel path, ptc and tunnelExit anchors, ptc L2 site (design 5.6)', () => {
  const t = d.paths.tunnel, st = a.source.tunnel;
  assert.ok(t && t.count >= 76, 'paths.tunnel present');
  assert.equal(t.points.length, t.count * 3);
  const pts = Array.from({ length: t.count }, (_, i) => pointOf(t.points, i));
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += dist(pts[i], pts[i - 1]);
  assert.ok(Math.abs(len - st.lengthA) < 0.25, `recorded (path points are quantised to 0.05 A) length ${st.lengthA} matches decoded ${len}`);
  assert.ok(dist(pts[0], d.anchors.ptc.o) <= 6, 'path starts within 6 A of the ptc origin');
  assert.ok(dist(pts[pts.length - 1], d.anchors.tunnelExit.o) < 0.1, 'path ends at tunnelExit (path points are quantised to 0.05 A)');
  assert.equal(t.synthetic, 0, 'tunnel is not synthetic');
  assert.equal(st.synthetic, 0);
  assert.ok(len >= 75 && len <= 110, `tunnel length ${len}`);
  assert.ok(st.minClearanceBeyondSkipA >= 3.0, `minimum clearance ${st.minClearanceBeyondSkipA} beyond ${st.skipA} A`);
  assert.equal(st.clearanceProfile.length, t.count, 'one clearance value per path point');
  let minBeyond = Infinity;
  st.clearanceProfile.forEach((c, i) => { if (i > st.skipA + 0.5) minBeyond = Math.min(minBeyond, c); });
  assert.ok(minBeyond >= 3.0 - 0.1, `profile minimum beyond ${st.skipA} A is ${minBeyond}`);
  assert.ok(st.fullRoute.lengthA > len && st.mouth.arcA >= 60, 'full route length and mouth arc recorded');
  for (let i = 1; i < pts.length - 1; i++) assert.ok(Math.abs(dist(pts[i], pts[i - 1]) - 1) < 0.1, 'resampled at 1 A');
  const first = [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]];
  const zp = zOf(d.anchors.ptc);
  assert.ok(dot(zp, first) / Math.hypot(...first) > 0.9999, 'ptc z = first segment');
  const n = pts.length, last = [pts[n - 1][0] - pts[n - 2][0], pts[n - 1][1] - pts[n - 2][1], pts[n - 1][2] - pts[n - 2][2]];
  assert.ok(dot(zOf(d.anchors.tunnelExit), last) / Math.hypot(...last) > 0.9999, 'tunnelExit z = last segment');
  for (const name of ['ptc', 'tunnelExit']) {
    const R = d.anchors[name].R;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const ci = [R[i], R[3 + i], R[6 + i]], cj = [R[j], R[3 + j], R[6 + j]];
      assert.ok(Math.abs(dot(ci, cj) - (i === j ? 1 : 0)) < 1e-4, `${name} orthonormal`);
    }
  }
  const site = d.lod2.sites.find(s => s.anchor === 'ptc');
  assert.ok(site && site.radius === 12, 'L2 site ptc at 12 A');
  assert.deepEqual(d.lod2.sites.map(s => s.anchor), ['decoding', 'ptc']);
  const l2 = d.lod2;
  let nearPtc = 0;
  for (let i = 0; i < l2.count; i++) if (dist(pointOf(l2.positions, i), d.anchors.ptc.o) <= 12) nearPtc++;
  assert.ok(nearPtc > 50, 'L2 holds atoms around the ptc origin');
});
