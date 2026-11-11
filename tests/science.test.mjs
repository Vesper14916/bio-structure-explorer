// Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../js/science/index.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} ± ${tol}`);

test('ideal B-DNA reproduces canonical helix dimensions', () => {
  const d = S.buildDuplex('CGCGAATTCGCGATATGGCCAATTCGCG'), m = S.measureDuplex(d);
  near(m.rise, 3.38, 0.01, 'rise');
  near(m.pitch, 35.5, 0.2, 'pitch');
  near(m.diameter, 20.5, 2, 'diameter');
  near(m.minorGrooveWidth, 6.0, 1.0, 'minor groove');
  near(m.majorGrooveWidth, 11.7, 1.0, 'major groove');
  assert.ok(m.hbondMin > 2.7 && m.hbondMax < 3.1, 'hydrogen-bond lengths');
});

test('covalent geometry: every bond and phosphodiester link has a sane length', () => {
  const d = S.buildDuplex('ACGTTGCAGGCT');
  for (let i = 0; i < d.bonds.length; i += 2) {
    const L = S.dist(d.position(d.bonds[i]), d.position(d.bonds[i + 1]));
    assert.ok(L > 1.2 && L < 1.65, `bond ${d.atoms.names[d.bonds[i]]}-${d.atoms.names[d.bonds[i + 1]]} = ${L}`);
  }
  for (const l of d.links) near(S.dist(d.position(l.a), d.position(l.b)), 1.607, 0.03, "O3'-P link");
});

test('no steric clashes between non-bonded atoms', () => {
  const d = S.buildDuplex('ACGTTGCAGGCT'), linked = new Set(d.links.map(l => l.a + ':' + l.b));
  for (let a = 0; a < d.atoms.count; a++) for (let b = a + 1; b < d.atoms.count; b++) {
    if (d.atoms.nuc[a] === d.atoms.nuc[b] || linked.has(a + ':' + b) || linked.has(b + ':' + a)) continue;
    const na = d.nucleotides[d.atoms.nuc[a]], nb = d.nucleotides[d.atoms.nuc[b]];
    const adjacent = na.strand === nb.strand && Math.abs(na.index - nb.index) === 1;
    assert.ok(S.dist(d.position(a), d.position(b)) > (adjacent ? 2.3 : 2.6), `${d.atoms.names[a]}(${na.id}) / ${d.atoms.names[b]}(${nb.id})`);
  }
});

test('strands are antiparallel and complementary; A·T has 2 and G·C 3 hydrogen bonds', () => {
  const d = S.buildDuplex('GATTACA');
  assert.equal(d.strands[1].map(id => d.nucleotides[id].base).join(''), S.reverseComplement('GATTACA'));
  const z = s => d.strands[s].map(id => d.position(d.atomOf(id, "C1'"))[2]);
  assert.ok(z(0)[6] > z(0)[0] && z(1)[6] < z(1)[0]);
  for (const p of d.pairs) assert.equal(p.hbonds.length, /[GC]/.test(p.type) ? 3 : 2);
});

test('right-handed helix', () => {
  const d = S.buildDuplex('AAAAAAAAAAAA');
  const p = k => d.position(d.atomOf(d.strands[0][k], 'P'));
  const a0 = Math.atan2(p(3)[1], p(3)[0]), a1 = Math.atan2(p(4)[1], p(4)[0]);
  near(((a1 - a0) / S.DEG + 540) % 360 - 180, 360 / 10.5, 0.01, 'twist about +z while rising along +z');
});

test('crystal structure 1BNA loads with correct sequence, pairing and geometry', () => {
  const c = S.buildCrystal();
  assert.equal(c.meta.sequence, 'CGCGAATTCGCG');
  assert.equal(c.atoms.count, 486);
  assert.equal(c.waters.count, 80);
  const hb = c.pairs.flatMap(p => c.hbondLengths(p));
  assert.ok(Math.min(...hb) > 2.5 && Math.max(...hb) < 3.4, 'crystal H-bond lengths');
  for (const l of c.links) near(S.dist(c.position(l.a), c.position(l.b)), 1.6, 0.12, 'crystal link');
});

test('nearest-neighbour thermodynamics (SantaLucia 1998)', () => {
  // Worked example from SantaLucia & Hicks 2004: 5'-CGTTGA-3' ΔG°37 = -5.35 kcal/mol
  near(S.duplexThermo('CGTTGA').dG37, -5.35, 0.06, 'ΔG37 CGTTGA');
  const at = S.duplexThermo('ATATATATATAT'), gc = S.duplexThermo('GCGCGCGCGCGC');
  assert.ok(gc.Tm > at.Tm + 25, 'GC-rich melts higher');
  assert.ok(S.duplexThermo('CGCGAATTCGCG').selfComplementary);
  assert.ok(S.duplexThermo('ACGTTGCAGGCT', { Na: 1 }).Tm > S.duplexThermo('ACGTTGCAGGCT', { Na: 0.05 }).Tm, 'salt stabilises');
});

test('helix-coil model: melts with temperature, AT-rich regions and ends open first', () => {
  const seq = 'GCGCGCGCATATATATGCGCGCGC', tm = S.duplexThermo(seq).Tm;
  const cold = S.helixCoil(seq, 10), hot = S.helixCoil(seq, 105), mid = S.helixCoil(seq, tm);
  assert.ok(cold.paired > 0.95 && hot.paired < 0.05);
  assert.ok(mid.duplex > 0.2 && mid.duplex < 0.8, `half-melted near two-state Tm (${mid.duplex})`);
  const partial = S.helixCoil(seq, tm - 3, { sigma: 1 });
  assert.ok(partial.closed[11] < partial.closed[4], 'AT island opens before GC arms');
  const fray = S.helixCoil('ATGCGCGCGCGCAT', S.duplexThermo('ATGCGCGCGCGCAT').Tm - 10);
  assert.ok(fray.closed[0] < fray.closed[6], 'ends fray');
});
