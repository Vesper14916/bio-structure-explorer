// R3-K3: tRNA anticodons, aminoacyl ends and codon pairing (PLAN.md §2 D7, §5.1, §5.3 item 6, §7.4, §10 R3-K3).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeAsset } from '../js/assets/format.js';
import { Assembly, nucleotideTemplate, TRUE_SCALE_GENE_CONSTRUCT, codonTable } from '../js/science/index.js';
import { composeFrame, readFrame16 } from '../js/kin/frames.js';
import { sampleTrack } from '../js/kin/track.js';
import {
  anticodonOf, pairedCodonPosition, trnaSiteFrame, poseTrnaAnticodon, poseAminoacylEnd,
  poseAminoacylResidue, peptidylAttachPoint, pairC1Distances, ESTER_BOND,
} from '../js/kin/trna.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const loadAsset = id => decodeAsset(JSON.parse(fs.readFileSync(path.join(root, 'assets', `${id}.asset.json`), 'utf8')));
const ribo = loadAsset('ribosome-70s');
const TRNA = { init: loadAsset('trna-init'), aa: loadAsset('trna-aa') };

const newFrame = () => ({ o: [0, 0, 0], R: [1, 0, 0, 0, 1, 0, 0, 0, 1] });
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const apply = (f, p) => [0, 1, 2].map(i => f.R[3 * i] * p[0] + f.R[3 * i + 1] * p[1] + f.R[3 * i + 2] * p[2] + f.o[i]);
const C1 = (() => { const t = nucleotideTemplate('A', 'ribose'); const i = t.index["C1'"]; return [t.local[3 * i], t.local[3 * i + 1], t.local[3 * i + 2]]; })();

// §5.1 codon table anticodons, 5'->3' (codons 1..40).
const TABLE_ANTICODONS = [
  'CAU', 'AGC', 'UUC', 'AAA', 'UUU', 'ACC', 'AGA', 'GUC', 'GUA', 'UUG', 'AGC', 'GGU', 'CAG', 'AAC',
  'ACG', 'GUU', 'GAU', 'GUG', 'CCA', 'UUC', 'CAG', 'AGU', 'UUU', 'AAC', 'CAU', 'GUC', 'GCG', 'GCA',
  'GGU', 'GUU', 'CAG', 'CGC', 'UUC', 'CUU', 'GAU', 'GUG', 'GCC', 'AGA', 'GUA', 'CAG',
];

/** World codon frames (5'->3') at mRNA track registers r0..r0+2 for a ribosome at `M`. */
function codonFrames(M, r0) {
  return [0, 1, 2].map(q => composeFrame(M, sampleTrack(ribo.tracks.mrna, r0 + q, newFrame()), newFrame()));
}

const RIBO_WORLD = { o: [12.5, -40.25, 300.0], R: [0, -1, 0, 0, 0, 1, -1, 0, 0] }; // arbitrary rigid pose

function placeTrna(site, from = site, blend = 1) {
  return composeFrame(RIBO_WORLD, trnaSiteFrame(ribo, from, site, blend, newFrame()), newFrame());
}

test('K3: anticodons are the exact 5′→3′ Watson–Crick complements of all 40 sense codons (§5.1, D7)', () => {
  const codons = codonTable(TRUE_SCALE_GENE_CONSTRUCT);
  for (let k = 1; k <= 40; k++) {
    assert.equal(anticodonOf(codons[k - 1].triplet), TABLE_ANTICODONS[k - 1], `codon ${k}`);
  }
  assert.equal(anticodonOf('AUG'), 'CAU');
  assert.deepEqual([0, 1, 2].map(pairedCodonPosition), [2, 1, 0], '34↔3rd, 35↔2nd, 36↔1st codon base');
  assert.throws(() => anticodonOf('AU'));
});

test('K3: trnaSiteFrame returns the site anchors exactly and interpolates continuously; hybrid sites fall back to classic sites', () => {
  for (const [site, name] of [['AT', 'siteAT'], ['A', 'siteA'], ['P', 'siteP'], ['E', 'siteE']]) {
    const f = trnaSiteFrame(ribo, site, site, 1);
    assert.deepEqual(f.o, ribo.anchors[name].o);
  }
  // 'out' keeps the start site; hybrid anchors absent in the asset resolve between classic sites.
  assert.deepEqual(trnaSiteFrame(ribo, 'E', 'out', 1).o, ribo.anchors.siteE.o);
  assert.equal(ribo.anchors.siteAP, undefined);
  const ap = trnaSiteFrame(ribo, 'AP', 'AP', 1);
  const mid = [0, 1, 2].map(i => 0.5 * (ribo.anchors.siteA.o[i] + ribo.anchors.siteP.o[i]));
  assert.ok(dist(ap.o, mid) < 1e-6);
  let prev = trnaSiteFrame(ribo, 'A', 'P', 0).o.slice();
  for (let i = 1; i <= 50; i++) {
    const o = trnaSiteFrame(ribo, 'A', 'P', i / 50).o;
    assert.ok(dist(o, prev) < 1.0, 'A→P path is continuous');
    prev = o.slice();
  }
});

test('K3 acceptance: codon–anticodon C1′–C1′ within 10.5 ± 0.3 Å in A and P, with H-bonds closed, for every codon', () => {
  const codons = codonTable(TRUE_SCALE_GENE_CONSTRUCT);
  const ac = new Float32Array(48);
  for (const [site, r0] of [['P', 0], ['A', 3]]) {
    for (const kind of ['init', 'aa']) {
      const transform = placeTrna(site);
      const cf = codonFrames(RIBO_WORLD, r0);
      poseTrnaAnticodon({ transform, pair: 1, codonFrames: cf }, TRNA[kind], ac);
      const d = pairC1Distances(ac, cf, C1);
      for (const x of d) assert.ok(Math.abs(x - 10.5) <= 0.3, `${kind} in ${site}: C1′–C1′ ${x.toFixed(3)} Å`);

      // Build the paired triplet as an Assembly for every codon of the ORF and check the drawn H-bonds.
      for (let k = (kind === 'init' ? 1 : 2); k <= (kind === 'init' ? 1 : 40); k++) {
        const codon = codons[k - 1].triplet;
        const anti = anticodonOf(codon);
        const asm = new Assembly();
        const cn = [0, 1, 2].map(q => asm.addNucleotide({ base: codon[q], sugar: 'ribose', strand: 0, frame: cf[q] }));
        const an = [0, 1, 2].map(q => asm.addNucleotide({ base: anti[q], sugar: 'ribose', strand: 1, frame: readFrame16(ac, q) }));
        for (let q = 0; q < 3; q++) asm.addPair(cn[pairedCodonPosition(q)], an[q]);
        asm.finalize();
        for (const p of asm.pairs) {
          for (const h of asm.hbondLengths(p)) assert.ok(h > 2.5 && h < 3.3, `${kind} codon ${k} ${p.type} H-bond ${h.toFixed(2)} Å`);
        }
      }
    }
  }
});

test('K3 acceptance: unpaired anticodons (E site, A/T before recognition) keep the asset track geometry, no pairing', () => {
  const ac = new Float32Array(48);
  const C1dist = [];
  for (const [site, r0] of [['E', -3], ['AT', 3]]) {
    const transform = placeTrna(site);
    const cf = codonFrames(RIBO_WORLD, r0);
    poseTrnaAnticodon({ transform, pair: 0, codonFrames: cf }, TRNA.aa, ac);
    for (let q = 0; q < 3; q++) {
      const expect = composeFrame(transform, sampleTrack(TRNA.aa.tracks.anticodon, 34 + q, newFrame()), newFrame());
      const got = readFrame16(ac, q);
      assert.ok(dist(got.o, expect.o) < 1e-3, `${site} nt ${34 + q} on its track`);
    }
    C1dist.push(...pairC1Distances(ac, cf, C1));
  }
  // At least one of these unpaired geometries is far from Watson–Crick pairing (E: 8.4 Å, A/T: 14.3 Å in the assets).
  assert.ok(C1dist.some(d => Math.abs(d - 10.5) > 1.0));
});

test('K3: pair blend moves the anticodon continuously from its track to the paired frame', () => {
  const transform = placeTrna('A');
  const cf = codonFrames(RIBO_WORLD, 3);
  const a = new Float32Array(48), b = new Float32Array(48);
  let prev = null;
  for (let i = 0; i <= 20; i++) {
    poseTrnaAnticodon({ transform, pair: i / 20, codonFrames: cf }, TRNA.aa, a);
    const o = readFrame16(a, 1).o.slice();
    if (prev) assert.ok(dist(o, prev) < 0.2);
    prev = o;
  }
  poseTrnaAnticodon({ transform, pair: 1, codonFrames: new Float32Array(cf.flatMap(f => [f.R[0], f.R[3], f.R[6], 0, f.R[1], f.R[4], f.R[7], 0, f.R[2], f.R[5], f.R[8], 0, f.o[0], f.o[1], f.o[2], 1])) }, TRNA.aa, b);
  poseTrnaAnticodon({ transform, pair: 1, codonFrames: cf }, TRNA.aa, a);
  for (let i = 0; i < 48; i++) assert.ok(Math.abs(a[i] - b[i]) < 1e-4, 'typed-array codon frames match object frames');
});

test('K3: aminoacyl ester carbon 1.33 Å along acceptor z; residue C on it; peptidyl attachment at the residue Cα', () => {
  for (const kind of ['init', 'aa']) {
    const asset = TRNA[kind];
    const transform = placeTrna('P');
    const spec = { transform };
    const F = poseAminoacylEnd(spec, asset);
    const o3 = apply(transform, asset.anchors.acceptor.o);
    assert.ok(Math.abs(dist(F.o, o3) - ESTER_BOND) < 1e-6);
    const zw = apply({ o: [0, 0, 0], R: transform.R }, [asset.anchors.acceptor.R[2], asset.anchors.acceptor.R[5], asset.anchors.acceptor.R[8]]);
    const along = (F.o[0] - o3[0]) * zw[0] + (F.o[1] - o3[1]) * zw[1] + (F.o[2] - o3[2]) * zw[2];
    assert.ok(Math.abs(along - ESTER_BOND) < 1e-6, 'ester carbon lies on acceptor +z');

    for (const aa of kind === 'init' ? ['fMet'] : ['Ala', 'Trp', 'Gly', 'Cys']) {
      const g = poseAminoacylResidue(spec, asset, aa, {});
      const idx = n => g.names.indexOf(n);
      const at = i => [g.pos[3 * i], g.pos[3 * i + 1], g.pos[3 * i + 2]];
      assert.ok(dist(at(idx('C')), F.o) < 1e-4, `${aa}: carbonyl C at the ester carbon`);
      assert.ok(dist(at(idx('C')), o3) > 1.2, `${aa}: no overlap with O3′`);
      const ca = at(idx('CA'));
      assert.ok(Math.abs(dist(ca, F.o) - 1.525) < 0.03, `${aa}: C–Cα bond`);
      const pa = peptidylAttachPoint(spec, asset);
      if (aa !== 'fMet') assert.ok(dist(pa, ca) < 0.05, `${aa}: peptidyl attach point is the residue Cα`);
      for (let k = 0; k < g.bonds.length; k += 2) {
        const d = dist(at(g.bonds[k]), at(g.bonds[k + 1]));
        assert.ok(d > 1.15 && d < 1.95, `${aa}: bond ${g.names[g.bonds[k]]}-${g.names[g.bonds[k + 1]]} ${d.toFixed(2)} Å`);
      }
      assert.equal(g.kind, 'peptide');
      assert.equal(g.residues.length, 1);
    }
  }
});
