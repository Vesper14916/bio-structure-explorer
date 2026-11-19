// Unit tests for tools/lib/superpose.mjs and tools/lib/match.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFrame, dist, mulMM, rotX, rotY, rotZ } from '../js/science/math.js';
import { superpose, superposeIterative } from '../tools/lib/superpose.mjs';
import { matchResidueAtoms, matchChains } from '../tools/lib/match.mjs';

function makeRotation(ax, ay, az) {
  return mulMM(rotZ(az), mulMM(rotY(ay), rotX(ax)));
}

function det3(R) {
  return (
    R[0] * (R[4] * R[8] - R[5] * R[7]) -
    R[1] * (R[3] * R[8] - R[5] * R[6]) +
    R[2] * (R[3] * R[7] - R[4] * R[6])
  );
}

function makeHelixPoints(count) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    const theta = i * 0.65;
    pts.push([
      12.5 * Math.cos(theta) + (i % 3) * 1.4,
      12.5 * Math.sin(theta) - (i % 2) * 1.1,
      i * 3.1 + Math.sin(i * 1.3) * 2.0,
    ]);
  }
  return pts;
}

test('superpose recovers an exact rigid transform with near-zero RMSD', () => {
  const mobile = makeHelixPoints(12);
  const trueFrame = { o: [42.5, -18.25, 105.75], R: makeRotation(0.7, -1.1, 0.45) };
  const target = mobile.map(p => applyFrame(trueFrame, p));

  const res = superpose(mobile, target);
  assert.equal(res.n, mobile.length);
  assert.deepEqual(res.o, res.t);
  assert.ok(res.rmsd < 1e-10, `expected near-zero RMSD, got ${res.rmsd}`);
  assert.ok(Math.abs(det3(res.R) - 1) < 1e-10, `expected det(R) = 1, got ${det3(res.R)}`);

  for (let k = 0; k < 9; k++) {
    assert.ok(Math.abs(res.R[k] - trueFrame.R[k]) < 1e-10, `R[${k}] mismatch`);
  }
  for (let k = 0; k < 3; k++) {
    assert.ok(Math.abs(res.t[k] - trueFrame.o[k]) < 1e-10, `t[${k}] mismatch`);
  }
  for (let i = 0; i < mobile.length; i++) {
    assert.ok(dist(applyFrame(res, mobile[i]), target[i]) < 1e-10);
  }
});

test('superpose recovers a noisy rigid transform with accurate RMSD', () => {
  const mobile = makeHelixPoints(20);
  const trueFrame = { o: [-15.0, 27.3, 8.9], R: makeRotation(-0.4, 0.85, -1.3) };
  const target = mobile.map((p, i) => {
    const q = applyFrame(trueFrame, p);
    return [
      q[0] + 0.25 * Math.sin(i * 1.7),
      q[1] + 0.25 * Math.cos(i * 2.3),
      q[2] + 0.25 * Math.sin(i * 3.1 + 0.5),
    ];
  });

  const res = superpose(mobile, target);
  assert.equal(res.n, mobile.length);
  assert.ok(res.rmsd > 0.1 && res.rmsd < 0.45, `unexpected noisy RMSD ${res.rmsd}`);
  assert.ok(Math.abs(det3(res.R) - 1) < 1e-10);

  const directRmsd = Math.sqrt(
    mobile.reduce((acc, p, i) => acc + dist(applyFrame(res, p), target[i]) ** 2, 0) / mobile.length,
  );
  assert.ok(Math.abs(res.rmsd - directRmsd) < 1e-12);
});

test('superpose validates inputs', () => {
  const pts = [[0, 0, 0], [1, 0, 0], [0, 1, 0]];
  assert.throws(() => superpose(pts.slice(0, 2), pts.slice(0, 2)), /at least 3/);
  assert.throws(() => superpose(pts, pts.slice(0, 2)), /length mismatch/);
  assert.throws(() => superpose(null, pts), /must be arrays/);
});

test('superposeIterative trims >2.0 A outliers and recovers exact transform', () => {
  const mobile = makeHelixPoints(18);
  const trueFrame = { o: [120.0, -45.0, 33.5], R: makeRotation(0.95, -0.6, 1.25) };
  const outlierIndices = new Set([2, 9, 15]);
  const target = mobile.map((p, i) => {
    const q = applyFrame(trueFrame, p);
    if (outlierIndices.has(i)) {
      return [q[0] + 6.5, q[1] - 4.0, q[2] + 5.0];
    }
    return q;
  });

  const res = superposeIterative(mobile, target, { cutoff: 2.0, passes: 2 });
  assert.equal(res.nBefore, 18);
  assert.equal(res.n, 15);
  assert.equal(res.trimmed, 3);
  assert.ok(res.rmsdBefore > 2.0, `expected rmsdBefore > 2.0, got ${res.rmsdBefore}`);
  assert.ok(res.rmsd < 1e-10, `expected trimmed rmsd ~ 0, got ${res.rmsd}`);
  assert.deepEqual(
    res.keptIndices,
    Array.from({ length: 18 }, (_, i) => i).filter(i => !outlierIndices.has(i)),
  );
  for (let k = 0; k < 9; k++) {
    assert.ok(Math.abs(res.R[k] - trueFrame.R[k]) < 1e-10);
  }
  for (let k = 0; k < 3; k++) {
    assert.ok(Math.abs(res.t[k] - trueFrame.o[k]) < 1e-10);
  }
});

test('superposeIterative respects passes = 1 and rejects over-trimmed inputs', () => {
  const mobile = makeHelixPoints(10);
  const trueFrame = { o: [5, -3, 2], R: makeRotation(0.2, 0.3, 0.4) };
  const target = mobile.map((p, i) => {
    const q = applyFrame(trueFrame, p);
    return i === 0 ? [q[0] + 10, q[1], q[2]] : q;
  });

  const onePass = superposeIterative(mobile, target, { cutoff: 2.0, passes: 1 });
  assert.equal(onePass.trimmed, 0);
  assert.equal(onePass.n, onePass.nBefore);
  assert.equal(onePass.rmsd, onePass.rmsdBefore);
  assert.equal(onePass.keptIndices.length, 10);

  // If all points are perturbed far beyond cutoff, pass 2 keeps < 3 points and throws.
  const wildTarget = mobile.map((p, i) => [p[0] + (i % 2 ? 30 : -30), p[1] + i * 7, p[2] - i * 5]);
  assert.throws(() => superposeIterative(mobile, wildTarget, { cutoff: 0.1, passes: 2 }), /need >= 3/);
});

test('matchResidueAtoms matches by seq and atomName and skips missing atoms/residues', () => {
  const mobileChain = {
    id: 'A',
    residues: [
      { seq: 5, authSeq: 5, comp: 'GLY', atoms: { CA: [5, 0, 0] } },
      { seq: 1, authSeq: 1, comp: 'MET', atoms: { CA: [1, 0, 0], N: [0.5, 0, 0] } },
      { seq: 2, authSeq: 2, comp: 'ALA', atoms: { N: [2, 0, 0] } }, // missing CA
      { seq: 3, authSeq: 3, comp: 'GLU', atoms: { CA: [3, 0, 0] } },
      { seq: 4, authSeq: 4, comp: 'PHE', atoms: { CA: [4, 0, 0] } }, // absent in target
    ],
  };
  const targetChain = {
    id: 'a',
    residues: [
      { seq: 1, authSeq: 1, comp: 'MET', atoms: { CA: [11, 0, 0] } },
      { seq: 2, authSeq: 2, comp: 'ALA', atoms: { CA: [12, 0, 0] } },
      { seq: 3, authSeq: 3, comp: 'ASP', atoms: { CA: [13, 0, 0] } },
      { seq: 5, authSeq: 5, comp: 'GLY', atoms: { CA: [15, 0, 0] } },
      { seq: 6, authSeq: 6, comp: 'LYS', atoms: { CA: [16, 0, 0] } }, // absent in mobile
    ],
  };

  const res = matchResidueAtoms(mobileChain, targetChain);
  assert.equal(res.n, 3);
  assert.deepEqual(res.pairs.map(p => p.seq), [1, 3, 5]);
  assert.deepEqual(res.mobilePts, [[1, 0, 0], [3, 0, 0], [5, 0, 0]]);
  assert.deepEqual(res.targetPts, [[11, 0, 0], [13, 0, 0], [15, 0, 0]]);
  assert.deepEqual(res.pairs[1], {
    seq: 3,
    mobileComp: 'GLU',
    targetComp: 'ASP',
    mobileAtom: [3, 0, 0],
    targetAtom: [13, 0, 0],
  });

  // Also accepts raw residue arrays directly.
  const fromArrays = matchResidueAtoms(mobileChain.residues, targetChain.residues, 'CA');
  assert.deepEqual(fromArrays, res);
});

test('matchChains concatenates multiple chain pairs deterministically and feeds superposeIterative', () => {
  const trueFrame = { o: [-30.5, 14.2, 62.8], R: makeRotation(0.55, 0.9, -0.35) };
  const pts16S = makeHelixPoints(8);
  const pts23S = makeHelixPoints(10).map(([x, y, z]) => [x + 40, y - 20, z + 15]);

  const mobileChains = new Map([
    ['a', {
      id: 'a',
      residues: pts16S.map((p, i) => ({ seq: i + 1, authSeq: i + 1, comp: 'A', atoms: { P: p } })),
    }],
    ['A', {
      id: 'A',
      residues: pts23S.map((p, i) => ({
        seq: i + 10,
        authSeq: i + 10,
        comp: 'G',
        atoms: i === 4 ? { C1: p } : { P: p }, // residue 14 missing P
      })),
    }],
  ]);

  const targetChains = new Map([
    ['16S', {
      id: '16S',
      residues: pts16S.map((p, i) => {
        const q = applyFrame(trueFrame, p);
        // Inject one outlier at seq 3
        const atom = i === 2 ? [q[0] + 8, q[1] - 6, q[2]] : q;
        return { seq: i + 1, authSeq: i + 1, comp: 'A', atoms: { P: atom } };
      }),
    }],
    ['23S', {
      id: '23S',
      residues: pts23S.map((p, i) => ({
        seq: i + 10,
        authSeq: i + 10,
        comp: 'G',
        atoms: { P: applyFrame(trueFrame, p) },
      })),
    }],
  ]);

  const matched = matchChains(mobileChains, targetChains, [['a', '16S'], ['A', '23S']], 'P');
  assert.equal(matched.n, 8 + 9);
  assert.equal(matched.byChain.length, 2);
  assert.equal(matched.byChain[0].n, 8);
  assert.equal(matched.byChain[1].n, 9);
  assert.equal(matched.pairs[0].mobileChain, 'a');
  assert.equal(matched.pairs[0].targetChain, '16S');
  assert.equal(matched.pairs[8].mobileChain, 'A');
  assert.equal(matched.pairs[8].targetChain, '23S');

  const sup = superposeIterative(matched.mobilePts, matched.targetPts, { cutoff: 2.0, passes: 2 });
  assert.equal(sup.nBefore, 17);
  assert.equal(sup.n, 16);
  assert.equal(sup.trimmed, 1);
  assert.ok(sup.rmsd < 1e-10);

  assert.throws(() => matchChains(mobileChains, targetChains, [['NOPE', '16S']]), /not found/);
});
