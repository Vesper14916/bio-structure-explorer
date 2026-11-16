// Optional helpers that turn science-layer objects into the payload shapes the UI setters expect.
// Pure functions of science data: no dependency on the viewer or the sims.
import { duplexThermo, helixCoil, meltingCurve } from '../science/index.js';

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** payload for ui.setPair() from an Assembly and a pair id (live H-bond lengths from current positions). */
export function pairPayload(asm, pairId) {
  const p = asm.pairs[pairId];
  if (!p) return null;
  const A = asm.nucleotides[p.a], B = asm.nucleotides[p.b];
  const hbonds = p.hbonds.map(hb => {
    const aDonates = hb.donor === 0;
    return {
      donor: aDonates ? hb.an : hb.bn, acceptor: aDonates ? hb.bn : hb.an,
      donorBase: aDonates ? A.base : B.base, acceptorBase: aDonates ? B.base : A.base,
      length: dist(asm.position(hb.a), asm.position(hb.b)),
    };
  });
  const ca = asm.atomOf(p.a, "C1'"), cb = asm.atomOf(p.b, "C1'");
  return { index: pairId, count: asm.pairs.length, type: p.type, hbonds, c1c1: ca >= 0 && cb >= 0 ? dist(asm.position(ca), asm.position(cb)) : NaN };
}

/** Phase label for a helix-coil result. */
export function meltPhase(hc) {
  if (hc.duplex < 0.5) return 'Single strands';
  if (hc.paired > 0.97) return 'Intact duplex';
  if (hc.paired > 0.8) return 'Fraying ends';
  if (hc.paired > 0.4) return 'Partly melted';
  return 'Mostly unpaired';
}

/** Slow-changing part of the melt state (recompute when the sequence or Na changes). */
export function meltStatic(seq, Na, Ct = 1e-6) {
  const t = duplexThermo(seq, { Na, Ct });
  return { Tm: t.Tm, dH: t.dH, dS: t.dS, dG37: t.dG37, gc: t.gc, curve: meltingCurve(seq, { Na, Ct }) };
}

/** Fast-changing part (every slider tick). */
export function meltDynamic(seq, T, Na, Ct = 1e-6) {
  const hc = helixCoil(seq, T, { Na, Ct });
  const openness = new Float32Array(hc.closed.length);
  for (let i = 0; i < openness.length; i++) openness[i] = 1 - hc.closed[i];
  return { T, Na, openness, fractionPaired: hc.paired, phase: meltPhase(hc) };
}
