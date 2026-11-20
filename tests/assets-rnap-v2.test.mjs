// Round 3 task R3-A4 tests: RNAP v2 extensions (rnap-ec, rnap-holo) and NusG (nusg).
// Runs against committed assets in assets/ without requiring tools/sources/ on CI.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validateAsset, decodeAsset } from '../js/assets/format.js';
import { dist, dot, sub, add, scale, norm, mulMV, mulMM, applyFrame, rotZ, DEG, HELIX_A, nucleotideTemplate, TRUE_SCALE_GENE_CONSTRUCT } from '../js/science/index.js';
import { poseDuplex, machinePoseForRegister } from '../js/kin/duplex.js';
import { readFrame16 } from '../js/kin/frames.js';
import { buildTimeline } from '../js/sim/gene/timeline.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = path.join(root, 'assets');
const loadRaw = id => JSON.parse(fs.readFileSync(path.join(assetsDir, `${id}.asset.json`), 'utf8'));
const sha16 = s => crypto.createHash('sha256').update(typeof s === 'string' ? s : JSON.stringify(s)).digest('hex').slice(0, 16);
const col = (R, k) => [R[k], R[3 + k], R[6 + k]];
const angleDeg = (u, v) => Math.acos(Math.max(-1, Math.min(1, dot(norm(u), norm(v))))) * 180 / Math.PI;

function assertOrthonormal(f, label) {
  assert.ok(f && Array.isArray(f.o) && f.o.length === 3 && Array.isArray(f.R) && f.R.length === 9, `${label}: bad shape`);
  const R = f.R;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let d = 0;
      for (let k = 0; k < 3; k++) d += R[k * 3 + i] * R[k * 3 + j];
      assert.ok(Math.abs(d - (i === j ? 1 : 0)) < 1e-4, `${label}: R^T R[${i},${j}] = ${d}`);
    }
  }
  const det = R[0] * (R[4] * R[8] - R[5] * R[7]) - R[1] * (R[3] * R[8] - R[5] * R[6]) + R[2] * (R[3] * R[7] - R[4] * R[6]);
  assert.ok(Math.abs(det - 1) < 1e-4, `${label}: det(R) = ${det}`);
}

function minDistToL1(p, positions, tf = x => x) {
  let minD2 = Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const q = tf([positions[i], positions[i + 1], positions[i + 2]]);
    const dx = p[0] - q[0], dy = p[1] - q[1], dz = p[2] - q[2];
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < minD2) minD2 = d2;
  }
  return Math.sqrt(minD2);
}

const rawEc = loadRaw('rnap-ec');
const rawHolo = loadRaw('rnap-holo');
const rawNusg = loadRaw('nusg');
const rawRibo = loadRaw('ribosome-70s');

const ec = decodeAsset(rawEc);
const holo = decodeAsset(rawHolo);
const nusg = decodeAsset(rawNusg);
const ribo = decodeAsset(rawRibo);

test('R3-A4: all three assets are registered in manifest.json and validate as Format v2', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(assetsDir, 'manifest.json'), 'utf8'));
  const ids = new Set(manifest.assets.map(a => a.id));
  for (const id of ['rnap-ec', 'rnap-holo', 'nusg']) {
    assert.ok(ids.has(id), `${id} missing from assets/manifest.json`);
  }
  for (const [id, raw] of [['rnap-ec', rawEc], ['rnap-holo', rawHolo], ['nusg', rawNusg]]) {
    assert.equal(raw.version, 2, `${id}: expected Format v2`);
    assert.deepEqual(validateAsset(raw), [], `${id}: validateAsset errors`);
  }
  assert.equal(rawEc.parts[0].role, 'body');
  assert.equal(rawHolo.parts.find(p => p.id === 'core').role, 'body');
  assert.equal(rawHolo.parts.find(p => p.id === 'sigma').role, 'release');
  assert.equal(rawNusg.parts[0].role, 'body');
});

test('R3-A4: rnap-ec and rnap-holo preserve pre-ST5 L0, L1, and L2 geometry/buffers byte-for-byte', () => {
  // Pre-ST5 (commit 50716d1) SHA-256 prefixes of raw base64 buffers.
  assert.deepEqual(
    rawEc.lod0.parts.map(p => ({ part: p.part, pos: sha16(p.positions), idx: sha16(p.indices), vc: p.vertexCount, tc: p.triangleCount })),
    [{ part: 'core', pos: 'f2aebf2e216e000d', idx: 'a52e499f41d25cfb', vc: 3792, tc: 7596 }],
  );
  assert.deepEqual(
    { count: rawEc.lod1.count, pos: sha16(rawEc.lod1.positions), chain: sha16(rawEc.lod1.chain), kind: sha16(rawEc.lod1.kind) },
    { count: 3174, pos: 'a0f411d4b8a5a561', chain: '901020923a405ea3', kind: 'b2a6b144235f2a55' },
  );
  assert.deepEqual(
    {
      count: rawEc.lod2.count, bondCount: rawEc.lod2.bondCount,
      pos: sha16(rawEc.lod2.positions), el: sha16(rawEc.lod2.element), chain: sha16(rawEc.lod2.chain), bonds: sha16(rawEc.lod2.bonds),
    },
    {
      count: 314, bondCount: 299,
      pos: 'b4fdbad381b470b6', el: '38116e9ee153acb3', chain: '054cb5d4cfb24e7c', bonds: 'fdf343643bba8bf6',
    },
  );
  assert.deepEqual(rawEc.lod2.sites, [{ anchor: 'activeSite', radius: 12 }]);

  assert.deepEqual(
    rawHolo.lod0.parts.map(p => ({ part: p.part, pos: sha16(p.positions), idx: sha16(p.indices), vc: p.vertexCount, tc: p.triangleCount })),
    [
      { part: 'core', pos: '2248b06ff50f4c7e', idx: '7653fdd30f86fc77', vc: 4024, tc: 8068 },
      { part: 'sigma', pos: '8a479a39bc1ee656', idx: '0e221ff3846cc983', vc: 956, tc: 1896 },
    ],
  );
  assert.deepEqual(
    { count: rawHolo.lod1.count, pos: sha16(rawHolo.lod1.positions), chain: sha16(rawHolo.lod1.chain), kind: sha16(rawHolo.lod1.kind) },
    { count: 3685, pos: '7dfcfb484d8be1fa', chain: '1f60ab044bff8df0', kind: 'b21682789e49b616' },
  );
  assert.deepEqual(
    {
      count: rawHolo.lod2.count, bondCount: rawHolo.lod2.bondCount,
      pos: sha16(rawHolo.lod2.positions), el: sha16(rawHolo.lod2.element), chain: sha16(rawHolo.lod2.chain), bonds: sha16(rawHolo.lod2.bonds),
    },
    {
      count: 291, bondCount: 276,
      pos: '2b8df0e9f97e45e4', el: '23bd7aef95397510', chain: 'cd9d97332440adf4', bonds: '37bb1d1cfd0d1235',
    },
  );
  assert.deepEqual(rawHolo.lod2.sites, [{ anchor: 'activeSite', radius: 12 }]);
});

test('R3-A4: rnap-holo RPo tracks from 6CA0 cover -45..+11 with open bubble -11..+2 and <= 1.0 A L1 penetration', () => {
  const sup = rawHolo.source.superpositions.find(s => s.mobile === '6CA0');
  assert.ok(sup, 'missing 6CA0 superposition record');
  assert.ok(sup.rmsdAfterA <= 2.5, `6CA0 RMSD ${sup.rmsdAfterA} > 2.5 A`);
  assert.ok(sup.keptFraction >= 0.5, `6CA0 keptFraction ${sup.keptFraction} < 0.5`);

  const tpl = holo.tracks.template;
  const nt = holo.tracks.nontemplate;
  assert.ok(tpl && nt, 'rnap-holo must define template and nontemplate tracks');
  assert.equal(tpl.registers[0], -45);
  assert.equal(tpl.registers[tpl.registers.length - 1], 11);
  assert.deepEqual(nt.registers, tpl.registers);

  // -10 TATAAT element at registers -12..-7 on nontemplate
  const iM12 = -12 - nt.registers[0];
  assert.equal(nt.bases.slice(iM12, iM12 + 6), 'TATAAT');

  // Strict 0|1 synthetic flags (DEC-008) matching sources[]
  for (const [name, tr] of [['template', tpl], ['nontemplate', nt]]) {
    assert.equal(tr.sources.length, tr.registers.length, `${name}: sources length mismatch`);
    for (let i = 0; i < tr.registers.length; i++) {
      assert.ok(tr.synthetic[i] === 0 || tr.synthetic[i] === 1, `${name}[${i}]: non-binary synthetic`);
      assert.equal(tr.sources[i], tr.synthetic[i] === 0 ? '6CA0' : 'synthetic');
    }
  }
  assert.equal(nt.synthetic.reduce((a, b) => a + b, 0), 1, 'nontemplate has 1 synthetic register (0)');
  assert.equal(tpl.synthetic.reduce((a, b) => a + b, 0), 11, 'template has 11 synthetic registers (-10..0)');

  // Bubble registers -11..+2 visibly unpaired (> 2.5 A between template and nontemplate origins)
  for (let r = -11; r <= 2; r++) {
    const idx = r - tpl.registers[0];
    const d = dist(tpl.frames[idx].o, nt.frames[idx].o);
    assert.ok(d > 2.5, `rnap-holo bubble register ${r} origin distance ${d.toFixed(2)} A <= 2.5 A`);
  }

  // Upstream paired registers -45..-12 remain Watson-Crick paired (<= 2.5 A)
  for (let r = -45; r <= -12; r++) {
    const idx = r - tpl.registers[0];
    const d = dist(tpl.frames[idx].o, nt.frames[idx].o);
    assert.ok(d <= 2.5, `rnap-holo upstream register ${r} origin distance ${d.toFixed(2)} A > 2.5 A`);
  }

  // Full poseDuplex check at open complex (register 45, bend 1, bubble [-11, 2], trackBlend 0)
  const N = TRUE_SCALE_GENE_CONSTRUCT.length;
  const outBuf = new Float32Array(32 * N);
  const M = machinePoseForRegister(ec, 45);
  poseDuplex(
    TRUE_SCALE_GENE_CONSTRUCT,
    { machineId: 'rnap', register: 45, bend: 1, bubble: [-11, 2], relax: 0, trackBlend: 0 },
    { 'rnap-ec': ec, 'rnap-holo': holo },
    outBuf,
    { machine: { assetId: 'rnap-holo', transform: M } },
  );
  // Check PLAN.md §5.3 item 8 penetration into rnap-holo L1 beads (radius 1.9 A for Calpha)
  const holoL1World = new Float64Array(3 * holo.lod1.count);
  for (let i = 0; i < holo.lod1.count; i++) {
    const p = applyFrame(M, [holo.lod1.positions[3 * i], holo.lod1.positions[3 * i + 1], holo.lod1.positions[3 * i + 2]]);
    holoL1World.set(p, 3 * i);
  }
  let maxPen = -Infinity;
  for (let r = -45; r <= 11; r++) {
    const g = 45 + r;
    for (const [idx, base] of [[g, TRUE_SCALE_GENE_CONSTRUCT.codingDna[g]], [N + g, TRUE_SCALE_GENE_CONSTRUCT.templateDna[g]]]) {
      const f = readFrame16(outBuf, idx);
      const tmpl = nucleotideTemplate(base, 'deoxyribose');
      for (let a = 0; a < tmpl.el.length; a++) {
        const p = applyFrame(f, [tmpl.local[3 * a], tmpl.local[3 * a + 1], tmpl.local[3 * a + 2]]);
        const dBead = minDistToL1(p, holoL1World);
        const pen = 1.9 - dBead;
        if (pen > maxPen) maxPen = pen;
      }
    }
  }
  assert.ok(maxPen <= 1.0, `rnap-holo RPo track max L1 penetration ${maxPen.toFixed(2)} A > 1.0 A`);
});

test('R3-A4: ntpEntry anchors on rnap-ec and rnap-holo satisfy PLAN.md §7.4 ray-cast geometry and clearance', () => {
  const rnaExit = ec.anchors.rnaExit.o;
  for (const [id, asset] of [['rnap-ec', ec], ['rnap-holo', holo]]) {
    const a = asset.anchors.ntpEntry;
    assert.ok(a, `${id}: missing ntpEntry anchor`);
    assert.equal(a.synthetic, 1, `${id}: ntpEntry must be marked synthetic: 1`);
    assertOrthonormal(a, `${id}.anchors.ntpEntry`);

    const active = asset.anchors.activeSite.o;
    const v = sub(a.o, active);
    const d = dist(a.o, active);
    assert.ok(Math.abs(d - 30) <= 0.05, `${id}: ntpEntry distance from activeSite ${d.toFixed(3)} != 30 A`);

    const ray = norm(v);
    const zAxis = col(a.R, 2);
    assert.ok(dot(zAxis, scale(ray, -1)) > 0.999, `${id}: ntpEntry +z must point inward (-ray)`);

    // Exclusion cones >= 35 deg from +z, -z, and activeSite -> rnaExit
    const toExit = norm(sub(rnaExit, active));
    assert.ok(angleDeg(ray, [0, 0, 1]) >= 35, `${id}: ntpEntry ray too close to +z`);
    assert.ok(angleDeg(ray, [0, 0, -1]) >= 35, `${id}: ntpEntry ray too close to -z`);
    assert.ok(angleDeg(ray, toExit) >= 35, `${id}: ntpEntry ray too close to rnaExit`);

    // Verify minimum L1 bead clearance over [5, 35] A matches recorded value and is >= 6.0 A
    let minD = Infinity;
    for (let j = 0; j < asset.lod1.count; j++) {
      const q = [asset.lod1.positions[3 * j], asset.lod1.positions[3 * j + 1], asset.lod1.positions[3 * j + 2]];
      const rel = sub(q, active);
      const t = Math.max(5, Math.min(35, dot(rel, ray)));
      const dSeg = dist(q, add(active, scale(ray, t)));
      if (dSeg < minD) minD = dSeg;
    }
    assert.ok(minD >= 6.0, `${id}: ntpEntry min clearance ${minD.toFixed(2)} A < 6.0 A`);
    assert.ok(Math.abs(minD - asset.source.ntpEntryCheck.minClearanceA) < 0.1, `${id}: ntpEntryCheck mismatch`);
  }
});

test('R3-A4: hairpin anchor on rnap-ec from 7YPA passes superposition gate and clears RNAP L1 for an 8-bp A-form stem', () => {
  const sup = rawEc.source.superpositions.find(s => s.mobile === '7YPA');
  assert.ok(sup, 'missing 7YPA superposition record');
  assert.ok(sup.rmsdAfterA <= 2.5, `7YPA RMSD ${sup.rmsdAfterA} > 2.5 A`);
  assert.ok(sup.keptFraction >= 0.5, `7YPA keptFraction ${sup.keptFraction} < 0.5`);

  const h = ec.anchors.hairpin;
  assert.ok(h, 'rnap-ec missing hairpin anchor');
  assertOrthonormal(h, 'rnap-ec.anchors.hairpin');
  assert.ok(dist(h.o, ec.anchors.rnaExit.o) < 15, 'hairpin anchor should sit near rnaExit');

  // Build an 8-bp ideal HELIX_A stem anchored at bp 0 = h.o along hairpin +z and check PLAN.md §5.3 item 8 L1 bead penetration
  const rise = HELIX_A.rise;
  const twistRad = HELIX_A.twistDeg * DEG;
  const xDisp = HELIX_A.xDisp;
  const R_partner = [1, 0, 0, 0, -1, 0, 0, 0, -1];
  const tmplG = nucleotideTemplate('G', 'ribose');
  const tmplC = nucleotideTemplate('C', 'ribose');
  let maxPen = -Infinity;
  for (let i = 0; i < 8; i++) {
    const rz = rotZ(i * twistRad);
    const localO = [xDisp * (Math.cos(i * twistRad) - 1), xDisp * Math.sin(i * twistRad), i * rise];
    const f5 = { o: applyFrame(h, localO), R: mulMM(h.R, rz) };
    const f3 = { o: f5.o, R: mulMM(f5.R, R_partner) };
    for (const [f, tmpl] of [[f5, tmplG], [f3, tmplC]]) {
      for (let a = 0; a < tmpl.el.length; a++) {
        const p = applyFrame(f, [tmpl.local[3 * a], tmpl.local[3 * a + 1], tmpl.local[3 * a + 2]]);
        const dBead = minDistToL1(p, ec.lod1.positions);
        const pen = 1.9 - dBead;
        if (pen > maxPen) maxPen = pen;
      }
    }
  }
  assert.ok(maxPen <= 1.05, `8-bp A-form stem on hairpin anchor penetrates RNAP L1 by ${maxPen.toFixed(2)} A`);
});

test('R3-A4: 6ZTJ expressome anchor, coupledMrna path, and coupling distance D = 38 pass gates and timeline integration', () => {
  const supRnap = rawEc.source.superpositions.find(s => s.mobile === '6ZTJ' && s.reference === '6ALF');
  const supRibo = rawEc.source.superpositions.find(s => s.mobile === '6ZTJ' && s.reference === '7K00');
  assert.ok(supRnap && supRibo, 'missing 6ZTJ superposition records');
  assert.ok(supRnap.rmsdAfterA <= 2.5 && supRnap.keptFraction >= 0.5, '6ZTJ RNAP superposition gate failed');
  assert.ok(supRibo.rmsdAfterA <= 1.5 && supRibo.keptFraction >= 0.5, '6ZTJ ribosome superposition gate failed');

  const exp = ec.anchors.expressome;
  assert.ok(exp, 'rnap-ec missing expressome anchor');
  assertOrthonormal(exp, 'rnap-ec.anchors.expressome');
  const dOrigins = dist([0, 0, 0], exp.o);
  assert.ok(dOrigins >= 100 && dOrigins <= 180, `expressome origin distance ${dOrigins.toFixed(1)} A out of [100, 180]`);

  const tfE = p => add(mulMV(exp.R, p), exp.o);
  const riboCenterInRnap = tfE(ribo.anchors.center.o);
  const dCenters = dist(ec.anchors.center.o, riboCenterInRnap);
  assert.ok(dCenters >= 150 && dCenters <= 220, `expressome center-to-center ${dCenters.toFixed(1)} A out of [150, 220]`);

  // Zero clash between ribosome-70s L1 (at expressome) and rnap-ec L1
  let minRiboRnap = Infinity;
  for (let i = 0; i < ribo.lod1.count; i++) {
    const q = tfE([ribo.lod1.positions[3 * i], ribo.lod1.positions[3 * i + 1], ribo.lod1.positions[3 * i + 2]]);
    const d = minDistToL1(q, ec.lod1.positions);
    if (d < minRiboRnap) minRiboRnap = d;
  }
  assert.ok(minRiboRnap >= 5.0, `ribosome-RNAP L1 clash: min distance ${minRiboRnap.toFixed(2)} A < 5.0 A`);

  // coupledMrna path
  const p = ec.paths.coupledMrna;
  assert.ok(p, 'rnap-ec missing paths.coupledMrna');
  assert.equal(p.count, 25);
  assert.ok(Array.isArray(p.synthetic) && p.synthetic.length === p.count);
  assert.equal(p.synthetic.filter(v => v === 0).length, 19, '19 observed 6ZTJ mRNA AV:41..23 points');
  assert.equal(p.synthetic.filter(v => v === 1).length, 6, '6 synthetic connector/bridge points');

  const pStart = [p.points[0], p.points[1], p.points[2]];
  const pEnd = [p.points[3 * (p.count - 1)], p.points[3 * (p.count - 1) + 1], p.points[3 * (p.count - 1) + 2]];
  const mrnaEntryInRnap = tfE(ribo.anchors.mrnaEntry.o);
  assert.ok(dist(pStart, ec.anchors.rnaExit.o) <= 0.1, 'coupledMrna must start at rnaExit');
  assert.ok(dist(pEnd, mrnaEntryInRnap) <= 0.1, 'coupledMrna must end at ribosome mrnaEntry in rnap frame');

  let pathLen = 0;
  for (let i = 1; i < p.count; i++) {
    const a = [p.points[3 * (i - 1)], p.points[3 * (i - 1) + 1], p.points[3 * (i - 1) + 2]];
    const b = [p.points[3 * i], p.points[3 * i + 1], p.points[3 * i + 2]];
    pathLen += dist(a, b);
    assert.ok(minDistToL1(b, ribo.lod1.positions, tfE) >= 3.0, `coupledMrna point ${i} clashes with ribosome L1`);
    assert.ok(minDistToL1(b, ec.lod1.positions) >= 3.0, `coupledMrna point ${i} clashes with RNAP L1`);
  }
  assert.ok(pathLen >= 100 && pathLen <= 180, `coupledMrna length ${pathLen.toFixed(1)} A out of [100, 180]`);

  // Coupling distance D = 38 and timeline integration
  const c = rawEc.source.coupling;
  assert.equal(c.D, 38);
  assert.equal(c.unmodelledNucleotidesInSpan, 0);
  assert.ok(typeof c.countingMethod === 'string' && c.countingMethod.length > 40);
  const tl = buildTimeline(TRUE_SCALE_GENE_CONSTRUCT, { 'rnap-ec': ec, 'ribosome-70s': ribo }, { mode: 'coupled' });
  assert.equal(tl.meta.D, 38, 'coupled timeline must resolve D = 38 from rnap-ec.source.coupling.D');
});

test('R3-A4: nusg asset in rnap frame has center/ntd/ctd anchors, safe tint metadata, and meets budgets', () => {
  assert.equal(nusg.lod2, null, 'nusg should not define lod2');
  const bytes = fs.statSync(path.join(assetsDir, 'nusg.asset.json')).size;
  assert.ok(bytes <= 120_000, `nusg size ${bytes} > 120000`);
  const triCount = rawNusg.lod0.parts.reduce((s, p) => s + p.triangleCount, 0);
  assert.ok(triCount <= 8000, `nusg L0 triangles ${triCount} > 8000`);
  assert.ok(rawNusg.lod0.parts[0].beadsInside >= 0.95, `nusg L0 containment ${rawNusg.lod0.parts[0].beadsInside} < 0.95`);
  assert.ok(nusg.lod1.count === 161 && nusg.lod1.count <= 900, `nusg L1 beads ${nusg.lod1.count}`);

  // DEC-019 L3: safe subunit/name so chainColor resolves to ACTOR_TOKENS.actorColor.nusg (0x15aabf)
  assert.equal(nusg.chains.length, 1);
  assert.equal(nusg.chains[0].id, 'CF');
  assert.equal(nusg.chains[0].subunit, 'nusg');
  const lowerName = nusg.chains[0].name.toLowerCase();
  for (const trap of ['alpha', 'beta', 'omega', 'sigma']) {
    assert.ok(!lowerName.includes(trap), `nusg chain name "${nusg.chains[0].name}" triggers RNAP tint trap "${trap}"`);
  }

  for (const name of ['center', 'ntd', 'ctd']) {
    assert.ok(nusg.anchors[name], `nusg missing anchor ${name}`);
    assertOrthonormal(nusg.anchors[name], `nusg.anchors.${name}`);
  }
  const ntdCtd = dist(nusg.anchors.ntd.o, nusg.anchors.ctd.o);
  assert.ok(ntdCtd >= 35 && ntdCtd <= 55, `nusg NTD-CTD separation ${ntdCtd.toFixed(1)} A out of [35, 55]`);

  // Spatial docking check: NTD near RNAP core, CTD near 30S subunit at expressome pose
  const exp = ec.anchors.expressome;
  const tfE = p => add(mulMV(exp.R, p), exp.o);
  assert.ok(minDistToL1(nusg.anchors.ntd.o, ec.lod1.positions) < 15, 'nusg.ntd should lie near RNAP core');
  assert.ok(minDistToL1(nusg.anchors.ctd.o, ribo.lod1.positions, tfE) < 25, 'nusg.ctd should lie near 30S at expressome');
});
