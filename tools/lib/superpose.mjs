// Rigid-body Kabsch superposition and iterative outlier-trimmed superposition (PLAN.md section 7.3).
import { kabsch, applyFrame, dist } from '../../js/science/math.js';

function validatePointLists(mobilePts, targetPts, label) {
  if (!Array.isArray(mobilePts) || !Array.isArray(targetPts)) {
    throw new Error(`${label}: mobilePts and targetPts must be arrays`);
  }
  if (mobilePts.length !== targetPts.length) {
    throw new Error(`${label}: length mismatch (${mobilePts.length} vs ${targetPts.length})`);
  }
  if (mobilePts.length < 3) {
    throw new Error(`${label}: need at least 3 point pairs, got ${mobilePts.length}`);
  }
}

/**
 * Least-squares rigid superposition of mobilePts onto targetPts.
 * Returns { R, t, o, rmsd, n } where applyFrame({ o: t, R }, mobilePts[i]) ~= targetPts[i].
 */
export function superpose(mobilePts, targetPts) {
  validatePointLists(mobilePts, targetPts, 'superpose');
  const n = mobilePts.length;
  const f = kabsch(mobilePts, targetPts);
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const d = dist(applyFrame(f, mobilePts[i]), targetPts[i]);
    sumSq += d * d;
  }
  const rmsd = Math.sqrt(sumSq / n);
  return { R: f.R, t: f.o, o: f.o, rmsd, n };
}

/**
 * Iterative outlier-trimmed superposition implementing PLAN.md section 7.3 (default: two passes, 2.0 A cutoff).
 * Pass 1 fits all pairs; each subsequent pass keeps pairs within `cutoff` A of the previous fit and refits.
 * Returns { R, t, o, rmsd, rmsdBefore, n, nBefore, trimmed, keptIndices }.
 */
export function superposeIterative(mobilePts, targetPts, { cutoff = 2.0, passes = 2 } = {}) {
  validatePointLists(mobilePts, targetPts, 'superposeIterative');
  if (!Number.isFinite(cutoff) || cutoff < 0) {
    throw new Error(`superposeIterative: invalid cutoff ${cutoff}`);
  }
  if (!Number.isInteger(passes) || passes < 1) {
    throw new Error(`superposeIterative: passes must be an integer >= 1, got ${passes}`);
  }

  const first = superpose(mobilePts, targetPts);
  const nBefore = first.n;
  const rmsdBefore = first.rmsd;
  let current = first;
  let keptIndices = Array.from({ length: nBefore }, (_, i) => i);

  for (let pass = 1; pass < passes; pass++) {
    const nextKept = [];
    for (let i = 0; i < nBefore; i++) {
      if (dist(applyFrame(current, mobilePts[i]), targetPts[i]) <= cutoff) {
        nextKept.push(i);
      }
    }
    if (nextKept.length < 3) {
      throw new Error(
        `superposeIterative: pass ${pass + 1} kept only ${nextKept.length} pairs within ${cutoff} A (need >= 3)`,
      );
    }
    const subMobile = nextKept.map(i => mobilePts[i]);
    const subTarget = nextKept.map(i => targetPts[i]);
    current = superpose(subMobile, subTarget);
    keptIndices = nextKept;
  }

  return {
    R: current.R,
    t: current.t,
    o: current.o,
    rmsd: current.rmsd,
    rmsdBefore,
    n: current.n,
    nBefore,
    trimmed: nBefore - current.n,
    keptIndices,
  };
}
