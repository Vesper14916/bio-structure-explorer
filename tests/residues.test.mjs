// Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../js/science/index.js';

const { dist, angle, dihedral } = S;
const ALL = [
  'GLY', 'ALA', 'SER', 'ASP', 'GLU', 'GLN', 'LYS', 'PHE', 'TYR', 'MET', 'FME',
  'CYS', 'VAL', 'THR', 'ILE', 'LEU', 'ASN', 'ARG', 'HIS', 'TRP',
];
const EXPECTED = {
  GLY: 'N CA C O', ALA: 'N CA C O CB', SER: 'N CA C O CB OG', ASP: 'N CA C O CB CG OD1 OD2',
  GLU: 'N CA C O CB CG CD OE1 OE2', GLN: 'N CA C O CB CG CD OE1 NE2', LYS: 'N CA C O CB CG CD CE NZ',
  PHE: 'N CA C O CB CG CD1 CD2 CE1 CE2 CZ', TYR: 'N CA C O CB CG CD1 CD2 CE1 CE2 CZ OH',
  MET: 'N CA C O CB CG SD CE', FME: 'N CN O1 CA C O CB CG SD CE',
  CYS: 'N CA C O CB SG', VAL: 'N CA C O CB CG1 CG2', THR: 'N CA C O CB OG1 CG2',
  ILE: 'N CA C O CB CG1 CG2 CD1', LEU: 'N CA C O CB CG CD1 CD2', ASN: 'N CA C O CB CG OD1 ND2',
  ARG: 'N CA C O CB CG CD NE CZ NH1 NH2', HIS: 'N CA C O CB CG ND1 CD2 CE1 NE2',
  TRP: 'N CA C O CB CG CD1 CD2 NE1 CE2 CE3 CZ2 CZ3 CH2',
};
const COUNTS = {
  GLY: 4, ALA: 5, SER: 6, ASP: 8, GLU: 9, GLN: 9, LYS: 9, PHE: 11, TYR: 12, MET: 8, FME: 10,
  CYS: 6, VAL: 7, THR: 7, ILE: 8, LEU: 8, ASN: 8, ARG: 11, HIS: 10, TRP: 14,
};
const pt = (arr, i) => [arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]];
const sub = S.sub, cross = S.cross, dot = S.dot, norm = S.norm;

// Adjacency helper: graph distance (in bonds) between atoms for a bond list.
function graphDist(n, bonds) {
  const adj = Array.from({ length: n }, () => []);
  for (const [a, b] of bonds) { adj[a].push(b); adj[b].push(a); }
  return src => {
    const d = new Array(n).fill(Infinity); d[src] = 0; const q = [src];
    while (q.length) { const u = q.shift(); for (const v of adj[u]) if (d[v] === Infinity) { d[v] = d[u] + 1; q.push(v); } }
    return d;
  };
}

test('placeAtom reproduces the requested bond, angle and dihedral (math.js conventions)', () => {
  const a = [0, 0, 0], b = [1.5, 0.2, 0.1], c = [2.1, 1.4, -0.3];
  for (const t of [-170, -60, 0, 45, 135, 180]) for (const ang of [100, 111, 130]) {
    const d = S.placeAtom(a, b, c, 1.4, ang, t);
    assert.ok(Math.abs(dist(c, d) - 1.4) < 1e-9);
    assert.ok(Math.abs(angle(b, c, d) - ang) < 1e-6);
    let dt = dihedral(a, b, c, d) - t; dt = ((dt + 540) % 360) - 180;
    assert.ok(Math.abs(dt) < 1e-6, `torsion ${t}: ${dt}`);
  }
});

test('all 20 residue templates have the listed atoms and elements, in order', () => {
  assert.equal(S.RESIDUE_CODES.length, 20);
  assert.deepEqual([...S.RESIDUE_CODES].sort(), [...ALL].sort());
  const validEl = new Set(['C', 'N', 'O', 'S']);
  for (const c of ALL) {
    const t = S.residueTemplate(c);
    assert.equal(t.names.join(' '), EXPECTED[c], c);
    assert.equal(t.names.length, COUNTS[c]);
    assert.equal(t.local.length, COUNTS[c] * 3);
    assert.equal(t.el.length, COUNTS[c]);
    assert.ok(t.el.every(e => validEl.has(e)), `${c} valid elements`);
    assert.ok(t.names.every((n, i) => t.index[n] === i));
    assert.equal(S.residueTemplate(c), t, 'cached');
  }
  // Sulfur element mapping for both MET/FME (SD) and CYS (SG)
  const cys = S.residueTemplate('CYS');
  assert.equal(cys.el[cys.index.SG], 'S');
  const met = S.residueTemplate('MET');
  assert.equal(met.el[met.index.SD], 'S');
});

test('local frame: CA at the origin, N on -x, C in the xy plane', () => {
  for (const c of ALL) {
    const t = S.residueTemplate(c), ca = pt(t.local, t.index.CA), n = pt(t.local, t.index.N), cc = pt(t.local, t.index.C);
    assert.ok(dist(ca, [0, 0, 0]) < 1e-6);
    assert.ok(n[0] < -1.4 && Math.abs(n[1]) < 1e-6 && Math.abs(n[2]) < 1e-6);
    assert.ok(Math.abs(cc[2]) < 1e-6);
  }
});

test('every bond is within 0.02 A (<= 0.03 A) of its design value and within 1.20-1.85 A', () => {
  for (const c of ALL) {
    const t = S.residueTemplate(c);
    assert.equal(t.bonds.length, t.bondLengths.length);
    t.bonds.forEach(([i, j], k) => {
      const d = dist(pt(t.local, i), pt(t.local, j));
      assert.ok(Math.abs(d - t.bondLengths[k]) <= 0.02, `${c} ${t.names[i]}-${t.names[j]} ${d} vs ${t.bondLengths[k]}`);
      assert.ok(d >= 1.2 && d <= 1.85, `${c} ${t.names[i]}-${t.names[j]} = ${d}`);
    });
    assert.equal(S.RESIDUE_BONDS(c), t.bonds);
  }
});

test('backbone angles and CB torsion match Engh & Huber ideal values', () => {
  for (const c of ALL) {
    const t = S.residueTemplate(c), p = n => pt(t.local, t.index[n]);
    assert.ok(Math.abs(angle(p('N'), p('CA'), p('C')) - 111.0) < 0.05);
    assert.ok(Math.abs(angle(p('CA'), p('C'), p('O')) - 120.8) < 0.05);
    if (t.index.CB !== undefined) {
      assert.ok(Math.abs(angle(p('N'), p('CA'), p('CB')) - 110.5) < 0.05);
      const cbTors = dihedral(p('C'), p('N'), p('CA'), p('CB'));
      assert.ok(Math.abs(cbTors + 122.5) < 0.05, `${c} CB torsion ${cbTors}`);
    }
  }
});

test('no non-bonded contact below 2.2 A beyond 1-3 neighbours; 1-3 contacts sane', () => {
  // Strictly, ASP OD1...OD2 and GLU OE1...OE2 (1-3 pairs across the carboxylate) are 2.197 A with the
  // Engh & Huber O-C-O geometry, and HIS CD2...CE1 across NE2 in the 5-membered imidazole ring is
  // 2.144 A by covalent geometry. The 2.2 A rule applies to pairs separated by three or more bonds,
  // while 1-3 pairs keep their covalent floors (2.15 A except HIS imidazole 2.10 A).
  for (const c of ALL) {
    const t = S.residueTemplate(c), gd = graphDist(t.names.length, t.bonds);
    const floor13 = c === 'HIS' ? 2.10 : 2.15;
    for (let i = 0; i < t.names.length; i++) {
      const d = gd(i);
      for (let j = i + 1; j < t.names.length; j++) {
        const r = dist(pt(t.local, i), pt(t.local, j));
        if (d[j] >= 3) assert.ok(r >= 2.2, `${c} ${t.names[i]}-${t.names[j]} ${r}`);
        else if (d[j] === 2) assert.ok(r >= floor13, `${c} 1-3 ${t.names[i]}-${t.names[j]} ${r}`);
      }
    }
  }
});

test('chirality is L for all 19 residues with CB: chiral volume +2.0..+3.0 A^3 and CORN rule agrees', () => {
  for (const c of ALL) {
    const t = S.residueTemplate(c);
    if (t.index.CB === undefined) continue;
    const p = n => pt(t.local, t.index[n]);
    const V = S.chiralVolume(p('N'), p('CA'), p('C'), p('CB'));
    assert.ok(V > 2.0 && V < 3.0, `${c} chiral volume ${V}`);
    // CORN rule, independent of the volume formula: put the implicit H on the side opposite to the
    // three substituents; looking from H toward CA, CO -> R -> N must run clockwise for L.
    // Seen from +h, a counter-clockwise sequence a->b->c has (a x b + b x c + c x a) . h > 0.
    const ca = p('CA'), co = sub(p('C'), ca), r = sub(p('CB'), ca), n = sub(p('N'), ca);
    const h = S.scale(norm(S.add(S.add(norm(co), norm(r)), norm(n))), -1);
    const s = dot(S.add(S.add(cross(co, r), cross(r, n)), cross(n, co)), h);
    assert.ok(s < 0, `${c} CORN rule gives D (s=${s})`);
  }
});

test('branched side-chain stereochemistry: THR (3R), ILE (3S), VAL CG1 pro-R, LEU CD1 pro-R', () => {
  const pOf = (code, atom) => { const t = S.residueTemplate(code); return pt(t.local, t.index[atom]); };
  // (p1 - c) . ((p2 - c) x (p3 - c)) > 0 for (S), < 0 for (R)
  const cip = (p1, c, p2, p3) => dot(sub(p1, c), cross(sub(p2, c), sub(p3, c)));
  assert.ok(cip(pOf('THR', 'OG1'), pOf('THR', 'CB'), pOf('THR', 'CA'), pOf('THR', 'CG2')) < 0, 'THR CB is 3R');
  assert.ok(cip(pOf('ILE', 'CA'), pOf('ILE', 'CB'), pOf('ILE', 'CG1'), pOf('ILE', 'CG2')) > 0, 'ILE CB is 3S');
  assert.ok(cip(pOf('VAL', 'CA'), pOf('VAL', 'CB'), pOf('VAL', 'CG1'), pOf('VAL', 'CG2')) < 0, 'VAL CG1 is pro-R');
  assert.ok(cip(pOf('LEU', 'CB'), pOf('LEU', 'CG'), pOf('LEU', 'CD1'), pOf('LEU', 'CD2')) < 0, 'LEU CD1 is pro-R');
});

test('PHE, TYR, HIS, and TRP rings are planar and have aromatic bond lengths', () => {
  for (const c of ['PHE', 'TYR']) {
    const t = S.residueTemplate(c);
    const ring = ['CG', 'CD1', 'CD2', 'CE1', 'CE2', 'CZ'].map(n => pt(t.local, t.index[n]));
    const cen = ring.reduce((a, p) => S.add(a, p), [0, 0, 0]).map(x => x / 6);
    const nrm = norm(cross(sub(ring[3], ring[0]), sub(ring[4], ring[0])));
    for (const p of ring) assert.ok(Math.abs(dot(sub(p, cen), nrm)) <= 0.02, `${c} ring planarity`);
    const pairs = [['CG', 'CD1'], ['CG', 'CD2'], ['CD1', 'CE1'], ['CD2', 'CE2'], ['CE1', 'CZ'], ['CE2', 'CZ']];
    for (const [a, b] of pairs) {
      const d = dist(pt(t.local, t.index[a]), pt(t.local, t.index[b]));
      assert.ok(d >= 1.37 && d <= 1.41, `${c} ${a}-${b} ${d}`);
    }
    const chi2 = dihedral(pt(t.local, t.index.CA), pt(t.local, t.index.CB), pt(t.local, t.index.CG), pt(t.local, t.index.CD1));
    assert.ok(Math.abs(chi2 - 90) < 0.01, `chi2 ${chi2}`);
  }

  // HIS 5-membered imidazole ring (planar, closure CD2-NE2)
  {
    const t = S.residueTemplate('HIS');
    const ring = ['CG', 'ND1', 'CE1', 'NE2', 'CD2'].map(n => pt(t.local, t.index[n]));
    const cen = ring.reduce((a, p) => S.add(a, p), [0, 0, 0]).map(x => x / 5);
    const nrm = norm(cross(sub(ring[1], ring[0]), sub(ring[4], ring[0])));
    for (const p of ring) assert.ok(Math.abs(dot(sub(p, cen), nrm)) <= 0.02, 'HIS ring planarity');
    const dClose = dist(pt(t.local, t.index.CD2), pt(t.local, t.index.NE2));
    assert.ok(Math.abs(dClose - 1.374) <= 0.02, `HIS CD2-NE2 closure ${dClose}`);
  }

  // TRP fused 9-atom indole ring (planar, closures CD2-CE2 and CZ3-CH2)
  {
    const t = S.residueTemplate('TRP');
    const ring = ['CG', 'CD1', 'NE1', 'CE2', 'CD2', 'CE3', 'CZ3', 'CH2', 'CZ2'].map(n => pt(t.local, t.index[n]));
    const cen = ring.reduce((a, p) => S.add(a, p), [0, 0, 0]).map(x => x / 9);
    const nrm = norm(cross(sub(ring[1], ring[0]), sub(ring[4], ring[0])));
    for (const p of ring) assert.ok(Math.abs(dot(sub(p, cen), nrm)) <= 0.02, 'TRP indole planarity');
    const d5 = dist(pt(t.local, t.index.CD2), pt(t.local, t.index.CE2));
    const d6 = dist(pt(t.local, t.index.CZ3), pt(t.local, t.index.CH2));
    assert.ok(Math.abs(d5 - 1.409) <= 0.02, `TRP CD2-CE2 closure ${d5}`);
    assert.ok(Math.abs(d6 - 1.400) <= 0.02, `TRP CZ3-CH2 closure ${d6}`);
  }
});

test('ONE_TO_THREE covers all 19 non-proline letters and fMet', () => {
  for (const k of 'ACDEFGHIKLMNQRSTVWY') {
    assert.ok(S.RESIDUE_CODES.includes(S.ONE_TO_THREE[k]), `missing ${k}`);
  }
  assert.equal(S.ONE_TO_THREE.fMet, 'FME');
  assert.equal(S.ONE_TO_THREE.P, undefined);
});

// ---------------- peptide ----------------
const FIXTURE = ['FME', 'ALA', 'GLU', 'PHE', 'LYS', 'GLY', 'SER', 'ASP', 'TYR', 'GLN', 'ALA'];

test('peptideFromConstruct gives the eleven fixture codes for DEFAULT_GENE_CONSTRUCT', () => {
  assert.deepEqual(S.peptideFromConstruct(S.DEFAULT_GENE_CONSTRUCT), FIXTURE);
});

test('buildPeptide: 89 atoms, atom layout and Calpha spacing', () => {
  const pep = S.buildPeptide(FIXTURE);
  assert.equal(pep.atoms.count, 89);
  assert.equal(pep.atoms.pos.length, 89 * 3);
  assert.equal(pep.atoms.el.length, 89);
  assert.equal(pep.atoms.name.length, 89);
  assert.equal(pep.atoms.residue.length, 89);
  assert.equal(pep.residues.length, 11);
  assert.equal(pep.atoms.name[88], 'OXT');
  assert.equal(S.buildPeptide(FIXTURE, { cTerminalOxt: false }).atoms.count, 88);
  let total = 0;
  pep.residues.forEach((r, i) => {
    assert.equal(r.atomStart, total); total += r.atomCount;
    assert.equal(r.code3, FIXTURE[i]);
    if (i) assert.ok(Math.abs(dist(pep.residues[i - 1].ca, r.ca) - 3.80) <= 0.03, `CA-CA ${i}`);
  });
  assert.equal(total, 89);
});

test('buildPeptide: omega, peptide bond, phi/psi, chirality in the chain', () => {
  const pep = S.buildPeptide(FIXTURE), P = pep.atoms.pos, name = pep.atoms.name;
  const at = (r, n) => { const rr = pep.residues[r]; for (let k = rr.atomStart; k < rr.atomStart + rr.atomCount; k++) if (name[k] === n) return pt(P, k); throw new Error(n); };
  for (let i = 0; i < 10; i++) {
    const w = dihedral(at(i, 'CA'), at(i, 'C'), at(i + 1, 'N'), at(i + 1, 'CA'));
    assert.ok(180 - Math.abs(w) <= 1, `omega ${i} = ${w}`);
    assert.ok(Math.abs(dist(at(i, 'C'), at(i + 1, 'N')) - 1.329) <= 0.005);
    const phi = dihedral(at(i, 'C'), at(i + 1, 'N'), at(i + 1, 'CA'), at(i + 1, 'C'));
    const psi = dihedral(at(i, 'N'), at(i, 'CA'), at(i, 'C'), at(i + 1, 'N'));
    assert.ok(Math.abs(phi + 139) < 0.01 && Math.abs(psi - 135) < 0.01, `phi/psi ${phi} ${psi}`);
  }
  for (let i = 0; i < 11; i++) {
    if (FIXTURE[i] === 'GLY') continue;
    const V = S.chiralVolume(at(i, 'N'), at(i, 'CA'), at(i, 'C'), at(i, 'CB'));
    assert.ok(V > 2.0 && V < 3.0, `residue ${i} chiral volume ${V}`);
  }
  // OXT: planar carboxylate, C-OXT 1.25
  const last = 10;
  assert.ok(Math.abs(dist(at(last, 'C'), at(last, 'OXT')) - 1.25) < 1e-4);
  assert.ok(Math.abs(dihedral(at(last, 'O'), at(last, 'CA'), at(last, 'C'), at(last, 'OXT'))) < 1e-3 ||
    Math.abs(Math.abs(dihedral(at(last, 'N'), at(last, 'CA'), at(last, 'C'), at(last, 'OXT')) - dihedral(at(last, 'N'), at(last, 'CA'), at(last, 'C'), at(last, 'O'))) - 180) < 1e-3);
});

test('buildPeptide: all bonds sane, no inter-residue contacts under 2.6 A beyond 1-3 neighbours', () => {
  const pep = S.buildPeptide(FIXTURE), P = pep.atoms.pos, n = pep.atoms.count;
  const bonds = []; for (let i = 0; i < pep.bonds.length; i += 2) bonds.push([pep.bonds[i], pep.bonds[i + 1]]);
  for (const [a, b] of bonds) {
    const d = dist(pt(P, a), pt(P, b));
    assert.ok(d >= 1.2 && d <= 1.85, `${pep.atoms.name[a]}-${pep.atoms.name[b]} ${d}`);
  }
  const gd = graphDist(n, bonds);
  // Across a peptide bond the 1-3 pairs (O(i)...N(i+1), CA(i)...N(i+1), C(i)...CA(i+1), O(i)...CA(i+1))
  // are 2.25-2.45 A by covalent geometry, so the 2.6 A rule applies to pairs three or more bonds apart.
  let minOther = 99;
  for (let i = 0; i < n; i++) {
    const d = gd(i);
    for (let j = i + 1; j < n; j++) {
      if (pep.atoms.residue[i] === pep.atoms.residue[j]) continue;
      const r = dist(pt(P, i), pt(P, j));
      if (d[j] >= 3) { minOther = Math.min(minOther, r); assert.ok(r >= 2.6, `${pep.atoms.name[i]}${pep.atoms.residue[i]}-${pep.atoms.name[j]}${pep.atoms.residue[j]} ${r}`); }
      else if (d[j] === 2) assert.ok(r >= 2.2, `1-3 ${r}`);
    }
  }
  assert.ok(minOther < 99);
});

test('buildPeptide: end-to-end C-alpha distance is 30-38 A', () => {
  const pep = S.buildPeptide(FIXTURE);
  const e = dist(pep.residues[0].ca, pep.residues[10].ca);
  assert.ok(e >= 30 && e <= 38, `end-to-end ${e}`);
});

test('buildPeptide (Construct v3, 40 residues): all 20 templates build cleanly with zero steric clashes (< 2.6 A)', () => {
  const codes = S.peptideFromConstruct(S.TRUE_SCALE_GENE_CONSTRUCT);
  assert.equal(codes.length, 40);
  assert.equal(codes[0], 'FME');
  assert.equal(codes[24], 'MET');
  assert.equal(new Set(codes).size, 20);

  const pep = S.buildPeptide(codes);
  const P = pep.atoms.pos;
  const n = pep.atoms.count;
  assert.equal(pep.residues.length, 40);
  assert.equal(pep.atoms.name[n - 1], 'OXT');

  // Verify CYS sulfur element in built peptide
  const sgIdx = pep.atoms.name.indexOf('SG');
  assert.ok(sgIdx >= 0);
  assert.equal(pep.atoms.el[sgIdx], 'S');

  // Every covalent bond within sane bounds
  const bonds = [];
  for (let i = 0; i < pep.bonds.length; i += 2) bonds.push([pep.bonds[i], pep.bonds[i + 1]]);
  for (const [a, b] of bonds) {
    const d = dist(pt(P, a), pt(P, b));
    assert.ok(d >= 1.2 && d <= 1.85, `${codes[pep.atoms.residue[a]]}${pep.atoms.residue[a]}.${pep.atoms.name[a]}-${codes[pep.atoms.residue[b]]}${pep.atoms.residue[b]}.${pep.atoms.name[b]} ${d}`);
  }

  // Zero inter-residue contacts < 2.6 A outside bonded, 1-3, and 1-4 pairs (and in fact >= 2.6 A even at 1-4!)
  const gd = graphDist(n, bonds);
  let minInter = 99;
  for (let i = 0; i < n; i++) {
    const d = gd(i);
    for (let j = i + 1; j < n; j++) {
      if (pep.atoms.residue[i] === pep.atoms.residue[j]) continue;
      const r = dist(pt(P, i), pt(P, j));
      if (d[j] >= 4) {
        minInter = Math.min(minInter, r);
        assert.ok(r >= 2.6, `clash ${codes[pep.atoms.residue[i]]}${pep.atoms.residue[i]}.${pep.atoms.name[i]}-${codes[pep.atoms.residue[j]]}${pep.atoms.residue[j]}.${pep.atoms.name[j]} d_bond=${d[j]} r=${r}`);
      } else if (d[j] === 3) {
        assert.ok(r >= 2.6, `1-4 clash ${codes[pep.atoms.residue[i]]}${pep.atoms.residue[i]}.${pep.atoms.name[i]}-${codes[pep.atoms.residue[j]]}${pep.atoms.residue[j]}.${pep.atoms.name[j]} r=${r}`);
      } else if (d[j] === 2) {
        assert.ok(r >= 2.2, `1-3 clash r=${r}`);
      }
    }
  }
  assert.ok(minInter >= 2.6 && minInter < 99);
});
