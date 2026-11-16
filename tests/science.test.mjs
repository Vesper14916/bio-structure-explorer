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

test('Uracil (U) base geometry and ribose 2\'-OH (O2\') covalent geometry', () => {
  assert.equal(S.BASE_ATOMS.U.length, 9, 'U has 9 heavy atoms (no C7 methyl)');
  assert.ok(!S.BASE_ATOMS.U.some(a => a[0] === 'C7'), 'U omits C7');
  for (const [name, el, x, y] of S.BASE_ATOMS.U) {
    const tAtom = S.BASE_ATOMS.T.find(a => a[0] === name);
    assert.ok(tAtom, `U atom ${name} exists in T`);
    assert.equal(el, tAtom[1]);
    near(x, tAtom[2], 1e-6, `U ${name} x`);
    near(y, tAtom[3], 1e-6, `U ${name} y`);
  }
  const tplU = S.nucleotideTemplate('U');
  assert.equal(tplU.sugar, 'ribose');
  assert.ok(tplU.names.includes("O2'"), "ribose template includes O2'");
  const iC2 = tplU.index["C2'"], iO2 = tplU.index["O2'"];
  const c2 = [tplU.local[iC2 * 3], tplU.local[iC2 * 3 + 1], tplU.local[iC2 * 3 + 2]];
  const o2 = [tplU.local[iO2 * 3], tplU.local[iO2 * 3 + 1], tplU.local[iO2 * 3 + 2]];
  near(S.dist(c2, o2), 1.413, 0.02, "C2'-O2' bond length");
});

test('ideal A-RNA duplex reproduces canonical dimensions, covalent links, and zero steric clashes', () => {
  const rna = S.buildRnaDuplex('CGCGAAUUCGCGAUAUGGCCAAUUCGCG');
  const m = S.measureDuplex(rna);
  assert.equal(rna.meta.nucleicAcid, 'rna');
  near(m.rise, 2.81, 0.01, 'A-RNA rise');
  near(m.twistDeg, 360 / 11.0, 0.01, 'A-RNA twist');
  near(m.pitch, 2.81 * 11.0, 0.2, 'A-RNA pitch');
  assert.ok(m.hbondMin > 2.7 && m.hbondMax < 3.1, 'A-RNA hydrogen-bond lengths');

  const d = S.buildDuplex('ACGUUGCAUGCU', S.HELIX_A, { nucleicAcid: 'rna' });
  for (let i = 0; i < d.bonds.length; i += 2) {
    const L = S.dist(d.position(d.bonds[i]), d.position(d.bonds[i + 1]));
    assert.ok(L > 1.2 && L < 1.65, `RNA bond ${d.atoms.names[d.bonds[i]]}-${d.atoms.names[d.bonds[i + 1]]} = ${L}`);
  }
  for (const l of d.links) near(S.dist(d.position(l.a), d.position(l.b)), 1.607, 0.03, "RNA O3'-P link");

  const linked = new Set(d.links.map(l => l.a + ':' + l.b));
  for (let a = 0; a < d.atoms.count; a++) for (let b = a + 1; b < d.atoms.count; b++) {
    if (d.atoms.nuc[a] === d.atoms.nuc[b] || linked.has(a + ':' + b) || linked.has(b + ':' + a)) continue;
    const na = d.nucleotides[d.atoms.nuc[a]], nb = d.nucleotides[d.atoms.nuc[b]];
    const adjacent = na.strand === nb.strand && Math.abs(na.index - nb.index) === 1;
    assert.ok(
      S.dist(d.position(a), d.position(b)) > (adjacent ? 2.3 : 2.6),
      `RNA clash ${d.atoms.names[a]}(${na.id}) / ${d.atoms.names[b]}(${nb.id})`
    );
  }

  const ss = S.buildSingleStrandedRna('AGGAGGUAAUGGCU');
  assert.equal(ss.meta.kind, 'ssrna');
  assert.equal(ss.strands.length, 1);
  assert.equal(ss.nucleotides.length, 14);
});

test('A·U canonical and G·U wobble base pairs and groove patterns', () => {
  assert.equal(S.WC_HBONDS.AU.length, 2);
  assert.equal(S.WC_HBONDS.UA.length, 2);
  assert.equal(S.WC_HBONDS.GU.length, 2);
  assert.equal(S.WC_HBONDS.UG.length, 2);
  assert.equal(S.GROOVE_PATTERN.major.AU, 'ADAH');
  assert.equal(S.GROOVE_PATTERN.major.GU, 'AADA');
  assert.equal(S.GROOVE_PATTERN.minor.GU, 'ADA');

  const asm = new S.Assembly();
  const f = S.helixFrame(0, S.HELIX_A.rise, S.HELIX_A.twistDeg);
  const g = asm.addNucleotide({ base: 'G', sugar: 'ribose', strand: 0, frame: f });
  const u = asm.addNucleotide({ base: 'U', sugar: 'ribose', strand: 1, frame: S.wobblePartnerFrame(f, 'GU') });
  const pair = asm.addPair(g, u);
  asm.finalize();
  const hb = asm.hbondLengths(pair);
  assert.equal(hb.length, 2);
  assert.ok(hb.every(len => len > 2.7 && len < 3.1), `G·U wobble H-bond lengths: ${hb.join(', ')}`);
});

test('RNA nearest-neighbour thermodynamics (Xia et al. 1998)', () => {
  const dna = S.duplexThermo('CGCGAATTCGCG', { nucleicAcid: 'dna' });
  const rna = S.duplexThermo('CGCGAAUUCGCG', { nucleicAcid: 'rna' });
  assert.equal(rna.nucleicAcid, 'rna');
  assert.ok(rna.selfComplementary, 'CGCGAAUUCGCG is self-complementary');
  assert.ok(rna.Tm > dna.Tm + 5, `A-RNA duplex melts higher than B-DNA (${rna.Tm.toFixed(1)} vs ${dna.Tm.toFixed(1)} °C)`);
  assert.ok(rna.dG37 < dna.dG37 - 3, 'A-RNA duplex has more favourable ΔG°37');
  const gcDna = S.duplexThermo('GGGGGGGGGGGG', { nucleicAcid: 'dna' });
  const gcRna = S.duplexThermo('GGGGGGGGGGGG', { nucleicAcid: 'rna' });
  assert.ok(gcRna.Tm > gcDna.Tm + 15, 'poly-G/C RNA duplex melts >15 °C higher than DNA');

  const hcCold = S.helixCoil('CGCGAAUUCGCG', 15, { nucleicAcid: 'rna' });
  const hcHot = S.helixCoil('CGCGAAUUCGCG', 105, { nucleicAcid: 'rna' });
  assert.ok(hcCold.paired > 0.98 && hcHot.paired < 0.05);
  const curve = S.meltingCurve('CGCGAAUUCGCG', { nucleicAcid: 'rna' }, 20, 100, 9);
  assert.equal(curve.length, 9);
});

test('bacterial gene construct transcription, reading frame alignment, fMet initiation, and UAA termination', () => {
  const c = S.DEFAULT_GENE_CONSTRUCT;
  assert.equal(c.length, 48, '48-bp bacterial construct');
  assert.equal(c.mrnaLength, 44, '44-nt mRNA transcript from +1 TSS (index 4)');
  assert.equal(c.promoter.sequence, 'TATA');
  assert.equal(c.utr5.sdSequence, 'AGGAGG');
  assert.equal(c.codons.length, 12, '11 sense codons + 1 stop codon');

  const tx = S.transcribeConstruct(c);
  assert.equal(tx.mrna, c.mrna);
  assert.equal(tx.mrna.slice(0, 8), 'AGGAGGUA');

  // Index conversion helpers
  assert.equal(S.dnaToMrnaIndex(3, c), -1, 'promoter is upstream of +1 TSS');
  assert.equal(S.dnaToMrnaIndex(4, c), 0, '+1 TSS maps to mRNA 0');
  assert.equal(S.mrnaToDnaIndex(8, c), 12, 'AUG start maps to DNA 12');
  assert.equal(S.mrnaToCodonIndex(7, c), -1, '5\' UTR is not a codon');
  assert.equal(S.mrnaToCodonIndex(8, c), 0, 'AUG is codon 0');
  assert.equal(S.mrnaToCodonIndex(41, c), 11, 'UAA stop is codon 11');
  const [mStart, mEnd] = S.codonToMrnaRange(0, c);
  assert.equal(mStart, 8);
  assert.equal(mEnd, 11);

  // Anticodon polarity
  const ac = S.anticodonOf('AUG');
  assert.equal(ac.anticodon5to3, 'CAU');
  assert.equal(ac.anticodon3to5, 'UAC');

  // Translation: initiator fMet vs internal Met, and UAA termination adding 0 residues
  const tl = S.translateMrna(c.mrna);
  assert.equal(tl.terminated, true);
  assert.equal(tl.stopCodon, 'UAA');
  assert.equal(tl.residues.length, 11, '11 amino acid residues (stop codon adds 0)');
  assert.equal(tl.residues[0].code3, 'fMet', 'codon 0 incorporates initiator fMet');
  assert.equal(tl.residues[0].kind, 'initiator');
  assert.equal(tl.peptideSequence1, 'MAEFKGSDYQA');
  assert.equal(tl.peptideSequence3, 'fMet-Ala-Glu-Phe-Lys-Gly-Ser-Asp-Tyr-Gln-Ala');

  const internalMet = S.translateMrna('AUGGCUAUGUAA', { startIndex: 0 });
  assert.equal(internalMet.residues.length, 3);
  assert.equal(internalMet.residues[0].code3, 'fMet', 'first AUG is fMet');
  assert.equal(internalMet.residues[2].code3, 'Met', 'internal AUG is standard Met');
});

