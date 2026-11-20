// Committed factor assets (rf1, ef-tu, ef-g, if1, if2, if3). Reads committed files only (no tools/sources/).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAsset, decodeAsset, trackFrame } from '../js/assets/format.js';
import { dist } from '../js/science/math.js';
import { meshStats, insideMesh } from '../tools/lib/surface.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const raw = id => JSON.parse(fs.readFileSync(path.join(root, 'assets', `${id}.asset.json`), 'utf8'));
const fileSize = id => fs.statSync(path.join(root, 'assets', `${id}.asset.json`)).size;
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets', 'manifest.json'), 'utf8'));

const riboRaw = raw('ribosome-70s');
const ribo = decodeAsset(riboRaw);
const pointOf = (arr, i) => [arr[3 * i], arr[3 * i + 1], arr[3 * i + 2]];
const centroid = pts => [0, 1, 2].map(k => pts.reduce((s, p) => s + p[k], 0) / pts.length);
const RNAP_TINT_RE = /alpha|beta|omega|sigma|[αβωσ]/i;

// Recompute siteA codon centroid (registers +3, +4, +5) directly from committed ribosome-70s.
const siteACodonCentroid = centroid([3, 4, 5].map(reg => trackFrame(ribo.tracks.mrna, reg).o));

// Ribosome L1 beads for clash cross-check.
const riboL1 = Array.from({ length: ribo.lod1.count }, (_, i) => pointOf(ribo.lod1.positions, i));

const CASES = [
  { id: 'rf1', pdbId: '8FZH', chain: 'w', scope: '23S', anchors: ['center', 'ggq', 'codonReader'], hasL2: true },
  { id: 'ef-tu', pdbId: '5WE4', chain: 'z', scope: '16S+23S', anchors: ['center', 'gDomain'], hasL2: false },
  { id: 'ef-g', pdbId: '7PJV', chain: 'x', scope: '23S', anchors: ['center', 'gDomain', 'domainIV'], hasL2: false },
  { id: 'if1', pdbId: '9ZN2', chain: 'y', scope: '16S+23S', anchors: ['center'], hasL2: false },
  { id: 'if2', pdbId: '9ZN2', chain: 'x', scope: '16S+23S', anchors: ['center', 'gDomain'], hasL2: false },
  { id: 'if3', pdbId: '9FDA', chain: 'J', scope: '16S', anchors: ['center'], hasL2: false },
];

for (const c of CASES) {
  const a = raw(c.id);
  const d = decodeAsset(a);

  test(`${c.id}: validates as version 2, registered in manifest, DEC-019 L3 safe`, () => {
    assert.deepEqual(validateAsset(a), []);
    assert.equal(a.version, 2);
    assert.equal(a.id, c.id);
    assert.equal(a.source.pdbId, c.pdbId);
    assert.ok(
      manifest.assets.some(e => e.id === c.id && e.file === `${c.id}.asset.json` && e.synthetic === false),
      `${c.id} missing from assets/manifest.json`,
    );
    assert.deepEqual(d.parts.map(p => [p.id, p.role]), [['body', 'body']]);
    assert.equal(d.chains.length, 1);
    assert.equal(d.chains[0].id, c.chain);
    assert.equal(d.chains[0].part, 'body');
    assert.equal(d.chains[0].class, 'protein');
    assert.equal(d.chains[0].subunit, c.id);
    assert.ok(
      !RNAP_TINT_RE.test(d.chains[0].name),
      `${c.id}: chain.name "${d.chains[0].name}" would trigger DEC-019 L3 RNAP tint`,
    );
  });

  test(`${c.id}: superposition metadata recorded and passes RMSD <= 1.5 A and kept >= 50% (DEC-010/011)`, () => {
    const sp = a.source.superposition;
    assert.ok(sp, `${c.id}: source.superposition missing`);
    for (const k of ['mobile', 'reference', 'scope', 'nBefore', 'nAfter', 'keptFraction', 'rmsdBeforeA', 'rmsdAfterA', 'mismatches']) {
      assert.notEqual(sp[k], undefined, `${c.id}: superposition.${k} missing`);
    }
    assert.equal(sp.mobile, c.pdbId);
    assert.equal(sp.reference, '7K00');
    assert.equal(sp.scope, c.scope);
    assert.ok(sp.nAfter <= sp.nBefore && sp.nAfter > 0);
    const ratio = sp.nAfter / sp.nBefore;
    assert.ok(ratio >= 0.50, `${c.id}: kept fraction ${(ratio * 100).toFixed(1)}% < 50%`);
    assert.ok(sp.keptFraction >= 0.50, `${c.id}: recorded keptFraction ${sp.keptFraction} < 0.50`);
    assert.ok(sp.rmsdAfterA <= 1.5, `${c.id}: RMSD ${sp.rmsdAfterA} A > 1.5 A`);
    assert.ok(sp.rmsdAfterA <= sp.rmsdBeforeA, `${c.id}: RMSD did not improve or stay equal after trimming`);
    assert.equal(sp.passesGate, true);
  });

  test(`${c.id}: required anchors present`, () => {
    for (const name of c.anchors) {
      assert.ok(d.anchors[name], `${c.id}: missing anchor ${name}`);
      assert.equal(d.anchors[name].o.length, 3);
      assert.equal(d.anchors[name].R.length, 9);
    }
    assert.ok(dist(d.anchors.center.o, d.bounds.center) < d.bounds.radius, `${c.id}: center outside bounds`);
  });

  test(`${c.id}: L0 closed, outward, >= 95% L1 containment, and §7.5 budgets met`, () => {
    assert.equal(d.lod0.length, 1);
    const m = d.lod0[0];
    assert.equal(m.part, 'body');
    const ms = meshStats(m.positions, m.indices);
    assert.ok(ms.closed && ms.signedVolume > 0, `${c.id} L0 mesh not closed/outward: ${JSON.stringify(ms)}`);
    const tris = m.indices.length / 3;
    assert.ok(tris <= 8000, `${c.id}: L0 ${tris} triangles > 8000`);

    assert.ok(d.lod1.count > 0 && d.lod1.count <= 900, `${c.id}: L1 ${d.lod1.count} beads > 900`);
    assert.equal(d.lod1.count, d.chains[0].residues);
    assert.ok(d.lod1.kind.every(k => k === 0), `${c.id}: all L1 beads must be CA (kind 0)`);
    assert.ok(d.lod1.chain.every(ch => ch === 0), `${c.id}: all L1 beads must belong to chain 0`);

    let inside = 0;
    for (let i = 0; i < d.lod1.count; i++) {
      if (insideMesh(m.positions, m.indices, pointOf(d.lod1.positions, i))) inside++;
    }
    const frac = inside / d.lod1.count;
    assert.ok(frac >= 0.95, `${c.id}: decoded L1 containment ${(frac * 100).toFixed(1)}% < 95%`);

    if (c.hasL2) {
      assert.ok(d.lod2 && d.lod2.count > 0 && d.lod2.count <= 400, `${c.id}: L2 count invalid`);
    } else {
      assert.equal(d.lod2, null, `${c.id}: unexpected lod2 block`);
    }

    const bytes = fileSize(c.id);
    assert.ok(bytes <= 120000, `${c.id}: file size ${bytes} B > 120000 B`);
  });

  test(`${c.id}: clash report recorded and consistent with committed ribosome-70s L1 beads`, () => {
    const cl = a.source.clashes;
    assert.ok(cl && typeof cl.count === 'number' && Array.isArray(cl.beads));
    assert.equal(cl.cutoffA, 3.0);
    assert.equal(cl.count, cl.beads.length);

    let strictCount = 0;
    let looseCount = 0;
    for (let i = 0; i < d.lod1.count; i++) {
      const p = pointOf(d.lod1.positions, i);
      let minD = Infinity;
      for (let j = 0; j < riboL1.length; j++) {
        const dd = dist(p, riboL1[j]);
        if (dd < minD) minD = dd;
      }
      if (minD < 3.0 - 0.1) strictCount++;
      if (minD < 3.0 + 0.1) looseCount++;
    }
    assert.ok(
      cl.count >= strictCount && cl.count <= looseCount,
      `${c.id}: recorded clash count ${cl.count} outside quantisation band [${strictCount}, ${looseCount}]`,
    );
  });
}

test('rf1: codonReader <= 10 A to siteA codon centroid, ggq near PTC, L2 ggq site valid', () => {
  const a = raw('rf1');
  const d = decodeAsset(a);

  const dSiteA = dist(d.anchors.codonReader.o, siteACodonCentroid);
  assert.ok(dSiteA <= 10.0, `rf1 codonReader to siteA codon centroid is ${dSiteA.toFixed(3)} A (> 10 A)`);
  assert.ok(
    Math.abs(dSiteA - a.source.geometryChecks.codonReaderToSiteACodonA) < 0.05,
    'recorded codonReader distance matches committed ribosome-70s mrna track',
  );

  const dPtc = dist(d.anchors.ggq.o, ribo.anchors.ptc.o);
  assert.ok(dPtc <= 10.0, `rf1 ggq to ribosome PTC is ${dPtc.toFixed(3)} A (> 10 A)`);

  // L2 site ggq (radius 8 A) + covalent/peptide bonds + Mg2+ within 8 A.
  assert.deepEqual(d.lod2.sites, [{ anchor: 'ggq', radius: 8 }]);
  const l2 = d.lod2;
  assert.ok(l2.count >= 50 && l2.count <= 400, `rf1 L2 atom count ${l2.count}`);
  assert.ok([...l2.element].every(z => [6, 7, 8, 12, 16].includes(z)), 'rf1 L2 elements must be C/N/O/S/Mg');
  assert.ok([...l2.chain].every(ci => ci === 0), 'rf1 L2 chain indices must be 0');
  assert.equal(l2.bonds.length, 2 * a.lod2.bondCount);
  assert.ok(a.lod2.bondCount >= 50, `rf1 L2 bond count ${a.lod2.bondCount}`);
  for (let i = 0; i < l2.bonds.length; i += 2) {
    const u = l2.bonds[i], v = l2.bonds[i + 1];
    assert.ok(u < l2.count && v < l2.count);
    assert.notEqual(l2.element[u], 12, 'Mg2+ ion must not carry covalent bonds');
    assert.notEqual(l2.element[v], 12, 'Mg2+ ion must not carry covalent bonds');
    const bl = dist(pointOf(l2.positions, u), pointOf(l2.positions, v));
    assert.ok(bl > 0.9 && bl < 2.3, `rf1 L2 bond ${u}-${v} length ${bl.toFixed(3)} A out of (0.9, 2.3)`);
  }
  let nearGgq = 0;
  for (let i = 0; i < l2.count; i++) {
    const dd = dist(pointOf(l2.positions, i), d.anchors.ggq.o);
    if (dd <= 8.05) nearGgq++;
    if (l2.element[i] === 12) {
      assert.ok(dd <= 8.05, `rf1 L2 Mg2+ at ${dd.toFixed(3)} A > 8.05 A from ggq`);
    }
  }
  assert.ok(nearGgq >= 20, `rf1 L2 should have >= 20 atoms within 8 A of ggq, got ${nearGgq}`);
});

test('ef-tu, ef-g, if2: gDomain within 25 A of 23S sarcin-ricin loop (2653-2667)', () => {
  const efTuRaw = raw('ef-tu');
  const srlCentroid = efTuRaw.source.geometryChecks.srlCentroidRiboA;
  assert.equal(efTuRaw.source.geometryChecks.srlSequence, 'UAGUACGAGAGGACC');
  assert.equal(srlCentroid.length, 3);

  for (const id of ['ef-tu', 'ef-g', 'if2']) {
    const a = raw(id);
    const d = decodeAsset(a);
    const dd = dist(d.anchors.gDomain.o, srlCentroid);
    assert.ok(dd <= 25.0, `${id} gDomain to 23S SRL centroid is ${dd.toFixed(3)} A (> 25 A)`);
    assert.ok(Math.abs(dd - a.source.geometryChecks.gDomainToSrlHeavyA) < 0.05);
  }

  // EF-G Domain IV check: distinct from gDomain (> 40 A) and closer to decoding center than gDomain is.
  const efg = decodeAsset(raw('ef-g'));
  assert.ok(dist(efg.anchors.domainIV.o, efg.anchors.gDomain.o) > 40, 'EF-G domainIV and gDomain must be well separated');
  assert.ok(
    dist(efg.anchors.domainIV.o, ribo.anchors.decoding.o) < dist(efg.anchors.gDomain.o, ribo.anchors.decoding.o),
    'EF-G domainIV should lie closer to the 30S decoding center than gDomain',
  );
});
