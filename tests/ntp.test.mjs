// Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../js/science/index.js';

const { dist, angle, dihedral } = S;
const NEW = ['O3A', 'PB', 'O1B', 'O2B', 'O3B', 'PG', 'O1G', 'O2G', 'O3G'];
const at = (t, n) => { const i = t.index[n]; return [t.local[i * 3], t.local[i * 3 + 1], t.local[i * 3 + 2]]; };

test('ntpTemplate appends nine named phosphate atoms to the ribonucleotide', () => {
  for (const b of 'AUGC') {
    const base = S.nucleotideTemplate(b, 'ribose'), t = S.ntpTemplate(b);
    assert.equal(t.names.length, base.names.length + 9);
    assert.deepEqual(t.names.slice(0, base.names.length), base.names);
    assert.deepEqual(t.names.slice(base.names.length), NEW);
    assert.equal(t.el.length, t.names.length);
    assert.equal(t.part.length, t.names.length);
    assert.equal(t.local.length, t.names.length * 3);
    assert.deepEqual(t.el.slice(base.names.length), ['O', 'P', 'O', 'O', 'O', 'P', 'O', 'O', 'O']);
    assert.ok(t.part.slice(base.names.length).every(p => p === 2));
    assert.deepEqual(Array.from(t.local.slice(0, base.local.length)), Array.from(base.local));
    assert.ok(t.names.every((n, i) => t.index[n] === i));
    assert.equal(t.bonds.length, base.bonds.length + 9);
    assert.equal(S.ntpTemplate(b), t, 'cached');
  }
});

test('P-O lengths and P-O-P angles', () => {
  for (const b of 'AUGC') {
    const t = S.ntpTemplate(b), d = (x, y) => dist(at(t, x), at(t, y));
    for (const [x, y] of [['P', 'O3A'], ['O3A', 'PB'], ['PB', 'O3B'], ['O3B', 'PG']])
      assert.ok(Math.abs(d(x, y) - 1.61) <= 0.02, `${b} ${x}-${y} ${d(x, y)}`);
    for (const [x, y] of [['PB', 'O1B'], ['PB', 'O2B'], ['PG', 'O1G'], ['PG', 'O2G'], ['PG', 'O3G']])
      assert.ok(Math.abs(d(x, y) - 1.49) <= 0.02, `${b} ${x}-${y} ${d(x, y)}`);
    assert.ok(Math.abs(angle(at(t, 'P'), at(t, 'O3A'), at(t, 'PB')) - 130) <= 1);
    assert.ok(Math.abs(angle(at(t, 'PB'), at(t, 'O3B'), at(t, 'PG')) - 130) <= 1);
    for (const [x, c, y] of [["O5'", 'P', 'O3A'], ['O3A', 'PB', 'O1B'], ['O1B', 'PB', 'O2B'], ['O3B', 'PB', 'O1B'], ['O1G', 'PG', 'O2G'], ['O2G', 'PG', 'O3G']])
      assert.ok(Math.abs(angle(at(t, x), at(t, c), at(t, y)) - 109.5) <= 1, `${b} ${x}-${c}-${y}`);
    // extended chain: torsions of 180 deg along the backbone
    const tor = dihedral(at(t, "O5'"), at(t, 'P'), at(t, 'O3A'), at(t, 'PB'));
    assert.ok(180 - Math.abs(tor) < 0.01, `torsion O5'-P-O3A-PB ${tor}`);
  }
});

test('O3A occupies the fourth tetrahedral position on P', () => {
  const t = S.ntpTemplate('A'), P = at(t, 'P');
  const vs = ['OP1', 'OP2', "O5'"].map(n => S.norm(S.sub(at(t, n), P)));
  const o3a = S.norm(S.sub(at(t, 'O3A'), P));
  // opposite to the mean direction of the other three substituents
  const mean = S.norm(S.add(S.add(vs[0], vs[1]), vs[2]));
  assert.ok(S.dot(o3a, mean) < -0.9, `cos to opposite direction ${S.dot(o3a, mean)}`);
});

test('no non-bonded contact below 2.2 A between new atoms and the rest of the nucleotide', () => {
  for (const b of 'AUGC') {
    const t = S.ntpTemplate(b), nb = new Set(t.bonds.flatMap(([i, j]) => [i + ':' + j, j + ':' + i]));
    const leaving = new Set(t.leavingGroup);
    for (const i of t.leavingGroup) for (let j = 0; j < t.names.length; j++) {
      if (leaving.has(j) || nb.has(i + ':' + j)) continue;
      const d = dist(at(t, t.names[i]), at(t, t.names[j]));
      assert.ok(d >= 2.2, `${b} ${t.names[i]}-${t.names[j]} ${d}`);
    }
  }
});

test('leavingGroup and PPI_TEMPLATE', () => {
  for (const b of 'AUGC') {
    const t = S.ntpTemplate(b);
    assert.equal(t.leavingGroup.length, 9);
    assert.deepEqual(t.leavingGroup.map(i => t.names[i]), NEW);
  }
  const p = S.PPI_TEMPLATE;
  assert.equal(p.names.length, 9);
  assert.deepEqual(p.names, NEW);
  assert.equal(p.local.length, 27);
  assert.equal(p.bonds.length, 8);
  const o3b = p.index.O3B;
  assert.deepEqual([p.local[o3b * 3], p.local[o3b * 3 + 1], p.local[o3b * 3 + 2]], [0, 0, 0]);
  const q = n => [p.local[p.index[n] * 3], p.local[p.index[n] * 3 + 1], p.local[p.index[n] * 3 + 2]];
  assert.ok(Math.abs(dist(q('PB'), q('O3B')) - 1.61) <= 0.02);
  assert.ok(Math.abs(angle(q('PB'), q('O3B'), q('PG')) - 130) <= 1);
});
