// Asset pipeline (tools/lib/*) and committed structure-derived assets (assets/manifest.json).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAsset, decodeAsset, trackFrame } from '../js/assets/format.js';
import { BASE_ATOMS } from '../js/science/bases.js';
import { applyFrame, dist, dot, sub } from '../js/science/math.js';
import { orthoError } from '../js/sim/util.js';
import { parseMmcif, polymerChains, parseCategories, categoryRows } from '../tools/lib/mmcif.mjs';
import { fitBaseFrame, residueBase, interpolateFrames, fitLine } from '../tools/lib/frames.mjs';
import { gaussianDensity, marchingCubes, meshStats, insideMesh, envelope, MC_TABLE } from '../tools/lib/surface.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const bna = parseMmcif(read('tools/1bna.cif'));
const bnaChains = polymerChains(bna);

// ---------------------------------------------------------------- step 1: mmCIF reader

test('mmCIF: 1BNA has two DNA chains of 12 residues, waters excluded', () => {
  assert.equal(bna.method, 'X-RAY DIFFRACTION');
  assert.equal(bna.resolutionA, 1.9);
  assert.deepEqual(bna.entities.filter(e => e.class).map(e => e.class), ['dna']);
  assert.deepEqual([...bnaChains.keys()], ['A', 'B']);
  for (const c of bnaChains.values()) {
    assert.equal(c.residues.length, 12);
    for (const r of c.residues) assert.ok(['DA', 'DC', 'DG', 'DT'].includes(r.comp), r.comp);
  }
  assert.ok(bna.atoms.every(a => a.element !== 'H' && a.element !== 'D'));
});

test('mmCIF: quoted values, text fields, single-row and loop categories, model and altloc filters', () => {
  const cif = [
    'data_TEST', '#',
    "_struct.title 'A title with spaces and an apostrophe's inside'",
    '_exptl.method "ELECTRON MICROSCOPY"',
    '_em_3d_reconstruction.resolution 3.5',
    'loop_', '_entity.id', '_entity.type', '_entity.pdbx_description',
    "1 polymer 'DNA (5'-D(*GP*C)-3')'",
    '2 polymer', ';Multi-line', 'description', ';',
    '#', 'loop_', '_entity_poly.entity_id', '_entity_poly.type', '_entity_poly.pdbx_strand_id',
    '1 polydeoxyribonucleotide A', "2 'polypeptide(L)' B",
    '#', '_entity_src_gen.entity_id 2', "_entity_src_gen.pdbx_gene_src_scientific_name 'Escherichia coli'",
    'loop_',
    ...['group_PDB', 'id', 'type_symbol', 'label_atom_id', 'label_alt_id', 'label_comp_id', 'label_asym_id', 'label_entity_id',
      'label_seq_id', 'Cartn_x', 'Cartn_y', 'Cartn_z', 'auth_seq_id', 'auth_asym_id', 'pdbx_PDB_model_num'].map(c => '_atom_site.' + c),
    'ATOM 1 O "O5\'" . DG A 1 1 1.0 2.0 3.0 1 A 1',
    'ATOM 2 H "H5\'" . DG A 1 1 1.0 2.0 3.0 1 A 1',
    'ATOM 3 C CA A ALA B 2 1 4.0 5.0 6.0 1 B 1',
    'ATOM 4 C CA B ALA B 2 1 9.0 9.0 9.0 1 B 1',
    'ATOM 5 C CA . ALA B 2 1 7.0 7.0 7.0 1 B 2',
    '#',
  ].join('\n');
  const p = parseMmcif(cif);
  assert.equal(p.title, "A title with spaces and an apostrophe's inside");
  assert.equal(p.method, 'ELECTRON MICROSCOPY');
  assert.equal(p.resolutionA, 3.5);
  assert.equal(p.entities[0].description, "DNA (5'-D(*GP*C)-3')");
  assert.equal(p.entities[1].description, 'Multi-line description');
  assert.equal(p.entities[1].class, 'protein');
  assert.equal(p.entities[1].organism, 'Escherichia coli');
  assert.equal(p.atoms.length, 2);
  assert.equal(p.atoms[0].name, "O5'");
  assert.deepEqual([p.atoms[1].x, p.atoms[1].y, p.atoms[1].z], [4, 5, 6]);
  assert.equal(categoryRows(parseCategories(cif), 'entity_poly').length, 2);
  assert.throws(() => parseMmcif(cif.replace('polydeoxyribonucleotide', "'polydeoxyribonucleotide/polyribonucleotide hybrid'")), /unsupported polymer type/);
});

// ---------------------------------------------------------------- step 2: base frames

// The task brief asked for consecutive origins 3.0-4.6 A apart. Observed in 1BNA: 22 of 22 steps lie in
// 3.11-4.09 A except strand A step 3-4 at 2.95 A (2.93-2.98 A with any choice of fitted atoms), so the lower
// bound is 2.9 A. Deviation recorded in docs/handoffs/R2-W1-A.md.
test('base frames: all 24 1BNA bases fit with rmsd < 0.3 A; strand spacing 2.9-4.6 A; round trip < 0.5 A', () => {
  let fitted = 0;
  for (const c of bnaChains.values()) {
    let prev = null;
    for (const r of c.residues) {
      const base = residueBase(r.comp);
      const f = fitBaseFrame(r.atoms, base);
      assert.ok(f.usable && f.matched >= 6 && f.rmsd < 0.3, `${c.id}${r.seq} rmsd ${f.rmsd}`);
      assert.ok(orthoError(f.R) < 1e-9);
      for (const [name, , x, y] of BASE_ATOMS[base]) if (r.atoms[name]) assert.ok(dist(applyFrame(f, [x, y, 0]), r.atoms[name]) < 0.5, name);
      if (prev) { const d = dist(prev.o, f.o); assert.ok(d >= 2.9 && d <= 4.6, `step ${d}`); }
      prev = f; fitted++;
    }
  }
  assert.equal(fitted, 24);
});

test('base frames: too few atoms is not usable; residue name mapping', () => {
  const r = bnaChains.get('A').residues[0];
  const few = Object.fromEntries(Object.entries(r.atoms).filter(([k]) => ["C1'", 'N1', 'C2', 'O2'].includes(k)));
  assert.equal(fitBaseFrame(few, 'C').usable, false);
  assert.deepEqual(['DA', 'DC', 'DG', 'DT', 'A', 'C', 'G', 'U', 'HOH'].map(residueBase), ['A', 'C', 'G', 'T', 'A', 'C', 'G', 'U', null]);
});

test('interpolateFrames: fills interior gaps as synthetic, drops ends', () => {
  const I = [1, 0, 0, 0, 1, 0, 0, 0, 1], Rz = [0, -1, 0, 1, 0, 0, 0, 0, 1];
  const out = interpolateFrames([null, { o: [0, 0, 0], R: I }, null, { o: [0, 0, 2], R: Rz }, null]);
  assert.equal(out.start, 1);
  assert.deepEqual(out.synthetic, [0, 1, 0]);
  assert.deepEqual(out.frames[1].o, [0, 0, 1]);
  assert.ok(orthoError(out.frames[1].R) < 1e-9);
  assert.ok(Math.abs(out.frames[1].R[0] - Math.cos(Math.PI / 4)) < 1e-9);
  assert.equal(interpolateFrames([null, null]), null);
});

test('fitLine: recovers a known axis and orients it first-to-last', () => {
  const pts = Array.from({ length: 10 }, (_, i) => [1 + 2 * i + (i % 2 ? 0.1 : -0.1), 3 - i, 5 + 0.5 * i]);
  const { dir } = fitLine(pts);
  const ref = [2, -1, 0.5].map(v => v / Math.hypot(2, 1, 0.5));
  assert.ok(dot(dir, ref) > 0.999);
});

// ---------------------------------------------------------------- step 3: surfaces

test('marching cubes: every case has <= 5 triangles; meshes are closed with outward winding', () => {
  assert.ok(MC_TABLE.every(t => t.length % 3 === 0 && t.length <= 15));
  const g = gaussianDensity([0, 0, 0], 5, 1);
  const m = marchingCubes(g, 0.5);
  const s = meshStats(m.positions, m.indices);
  const rIso = 5 * Math.sqrt(2 * Math.log(2));
  assert.ok(s.closed);
  assert.ok(Math.abs(s.signedVolume / (4 / 3 * Math.PI * rIso ** 3) - 1) < 0.05, `volume ${s.signedVolume}`);
  assert.ok(insideMesh(m.positions, m.indices, [0.1, 0.2, 0.3]));
  assert.ok(!insideMesh(m.positions, m.indices, [rIso + 1, 0, 0]));
  // Deterministic pseudo-random field: still closed (exercises ambiguous faces).
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const n = 14, values = new Float64Array(n * n * n);
  for (let z = 1; z < n - 1; z++) for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) values[(z * n + y) * n + x] = rnd();
  const noise = marchingCubes({ origin: [0, 0, 0], spacing: 1, dims: [n, n, n], values }, 0.5);
  assert.ok(meshStats(noise.positions, noise.indices).closed);
});

test('envelope: >= 95 % of beads inside, triangle cap respected', () => {
  const pts = [];
  for (const c of bnaChains.values()) for (const r of c.residues) if (r.atoms.P) pts.push(...r.atoms.P);
  const env = envelope(pts, { maxTriangles: 12000 });
  assert.ok(env.insideByRay >= 0.95);
  assert.ok(env.triangles <= 12000);
  const capped = envelope(pts, { maxTriangles: 150 });
  assert.ok(capped.triangles <= 150 && capped.spacing > 5);
});

// ---------------------------------------------------------------- committed assets

const manifest = JSON.parse(read('assets/manifest.json'));
const load = id => JSON.parse(read('assets/' + manifest.assets.find(a => a.id === id).file));

test('manifest: every asset validates and decodes', () => {
  assert.ok(manifest.assets.some(a => a.id === 'fixture-machine'));
  for (const entry of manifest.assets) {
    const a = JSON.parse(read('assets/' + entry.file));
    assert.deepEqual(validateAsset(a), [], entry.id);
    assert.equal(a.id, entry.id);
    assert.equal(a.source.type === 'synthetic', entry.synthetic);
    decodeAsset(a);
  }
});

test('rnap-ec: provenance, true-scale bounds, LOD budgets', () => {
  const a = load('rnap-ec');
  assert.equal(a.source.type, 'pdb');
  assert.match(a.source.organism, /Escherichia coli/);
  assert.ok(fs.statSync(path.join(root, 'assets', 'rnap-ec.asset.json')).size <= 400 * 1024);
  for (const s of a.bounds.size) assert.ok(s >= 80 && s <= 200, `size ${s}`);
  assert.ok(a.lod1.count >= 2500 && a.lod1.count <= 3700, `L1 ${a.lod1.count}`);
  for (const m of a.lod0.parts) assert.ok(m.triangleCount <= 12000, `L0 ${m.triangleCount}`);
  assert.ok(a.lod2.count <= 3000);
  for (const k of ['center', 'activeSite', 'dnaEntry', 'dnaExit', 'rnaExit']) assert.ok(a.anchors[k], k);
  assert.deepEqual(a.parts.map(p => p.id), ['core']);
  const d = decodeAsset(a);
  const s = meshStats(d.lod0[0].positions, d.lod0[0].indices);
  assert.ok(s.closed && s.signedVolume > 0);
});

test('rnap-ec: tracks, hybrid pairing, register origin, and downstream axis', () => {
  const a = load('rnap-ec');
  const { rna, template: tpl, nontemplate: nt } = a.tracks;
  assert.equal(rna.kind, 'rna'); assert.equal(tpl.kind, 'dna'); assert.equal(nt.kind, 'dna');
  for (let r = -8; r <= -1; r++) {
    const fr = trackFrame(rna, r), ft = trackFrame(tpl, r);
    assert.ok(fr && ft, `register ${r}`);
    assert.ok(dist(fr.o, ft.o) < 3, `hybrid register ${r}: ${dist(fr.o, ft.o)}`);
    // Partner relation: base normals antiparallel.
    assert.ok(dot([fr.R[2], fr.R[5], fr.R[8]], [ft.R[2], ft.R[5], ft.R[8]]) < 0);
  }
  assert.equal(rna.registers[rna.registers.length - 1], -1);
  // Origin = midpoint of rna(-1) and template(-1) frame origins.
  const m = [0, 1, 2].map(k => (trackFrame(rna, -1).o[k] + trackFrame(tpl, -1).o[k]) / 2);
  assert.ok(Math.hypot(...m) < 0.01);
  // Downstream axis through base-pair centres of observed registers >= +2.
  const centres = [];
  for (const r of tpl.registers) {
    if (r < 2) continue;
    const i = r - tpl.registers[0], j = r - nt.registers[0];
    if (tpl.synthetic[i] || j < 0 || j >= nt.registers.length || nt.synthetic[j]) continue;
    centres.push([0, 1, 2].map(k => (tpl.frames[i].o[k] + nt.frames[j].o[k]) / 2));
  }
  assert.ok(centres.length >= 4);
  const { dir } = fitLine(centres);
  assert.ok(Math.acos(Math.min(1, dir[2])) * 180 / Math.PI < 1, `axis ${dir}`);
  // Downstream DNA lies on +z, upstream behind; protein centroid on +x.
  assert.ok(a.anchors.dnaEntry.o[2] > 20 && a.anchors.dnaExit.o[2] < a.anchors.dnaEntry.o[2]);
  assert.ok(a.anchors.center.o[0] > 0 && Math.abs(a.anchors.center.o[1]) < 1e-3);
  // Synthetic frames are only allowed where documented: the non-template bubble.
  assert.ok(tpl.synthetic.every(s => s === 0) && rna.synthetic.every(s => s === 0));
  // Non-template paired registers sit on their template partner.
  for (const r of [-12, 5, 10]) assert.ok(dist(trackFrame(nt, r).o, trackFrame(tpl, r).o) < 3, `duplex register ${r}`);
  assert.ok(dist(sub(a.anchors.activeSite.o, [0, 0, 0]), [0, 0, 0]) < 15);
});

test('rnap-holo: core and sigma parts in the rnap-ec frame', () => {
  const h = load('rnap-holo'), ec = load('rnap-ec');
  assert.match(h.source.organism, /Escherichia coli/);
  assert.deepEqual(h.parts.map(p => p.id), ['core', 'sigma']);
  assert.deepEqual(h.lod0.parts.map(p => p.part), ['core', 'sigma']);
  for (const m of h.lod0.parts) assert.ok(m.triangleCount <= 12000);
  assert.ok(h.chains.some(c => c.part === 'sigma' && c.subunit === 'sigma70'));
  assert.ok(h.source.superposition.rmsdA <= 6 && h.source.superposition.atoms > 1000);
  for (const s of h.bounds.size) assert.ok(s >= 80 && s <= 200, `size ${s}`);
  assert.ok(dist(h.anchors.activeSite.o, ec.anchors.activeSite.o) < 5);
  assert.ok(h.lod2.count <= 3000);
  assert.equal(h.tracks, undefined);
});
