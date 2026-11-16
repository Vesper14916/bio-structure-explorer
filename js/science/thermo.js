// DNA duplex thermodynamics: unified nearest-neighbour model (SantaLucia 1998, PNAS 95,
// 1460) and a nearest-neighbour helix-coil (zipper/Ising) model for per-base-pair opening.
const R = 1.98720425e-3;                       // gas constant, kcal mol^-1 K^-1
// Stack 5'-XY-3' / 3'-X'Y'-5': [ΔH° kcal/mol, ΔS° cal/(mol·K)] at 1 M NaCl.
const NN = {
  AA: [-7.9, -22.2], TT: [-7.9, -22.2], AT: [-7.2, -20.4], TA: [-7.2, -21.3],
  CA: [-8.5, -22.7], TG: [-8.5, -22.7], GT: [-8.4, -22.4], AC: [-8.4, -22.4],
  CT: [-7.8, -21.0], AG: [-7.8, -21.0], GA: [-8.2, -22.2], TC: [-8.2, -22.2],
  CG: [-10.6, -27.2], GC: [-9.8, -24.4], GG: [-8.0, -19.9], CC: [-8.0, -19.9],
};
const INIT_GC = [0.1, -2.8], INIT_AT = [2.3, 4.1], SYMMETRY_DS = -1.4;
const comp = { A: 'T', T: 'A', G: 'C', C: 'G' };
const isSelfComplementary = s => [...s].reverse().map(b => comp[b]).join('') === s;

/** ΔH (kcal/mol) and ΔS (cal/mol/K, salt-corrected) of the stack between pairs k and k+1. */
export function stackThermo(seq, k, Na = 1) {
  const [h, s] = NN[seq[k] + seq[k + 1]];
  return { dH: h, dS: s + 0.368 * Math.log(Na) };
}

/**
 * Two-state duplex thermodynamics. seq: one strand 5'->3'. Na: monovalent cation (M).
 * Ct: total strand concentration (M). Returns ΔH° (kcal/mol), ΔS° (cal/mol/K), ΔG°37
 * (kcal/mol), Tm (°C), plus GC fraction.
 */
export function duplexThermo(seq, { Na = 1, Ct = 1e-6 } = {}) {
  const n = seq.length;
  if (n < 2) return { dH: 0, dS: 0, dG37: 0, Tm: NaN, gc: NaN, selfComplementary: false, length: n };
  let dH = 0, dS = 0;
  for (let k = 0; k + 1 < n; k++) { dH += NN[seq[k] + seq[k + 1]][0]; dS += NN[seq[k] + seq[k + 1]][1]; }
  for (const end of [seq[0], seq[n - 1]]) { const t = 'GC'.includes(end) ? INIT_GC : INIT_AT; dH += t[0]; dS += t[1]; }
  const self = isSelfComplementary(seq);
  if (self) dS += SYMMETRY_DS;
  dS += 0.368 * (n - 1) * Math.log(Na);        // SantaLucia salt correction (entropic)
  const x = self ? Ct : Ct / 4;
  const Tm = (dH * 1000) / (dS + R * 1000 * Math.log(x)) - 273.15;
  const gc = [...seq].filter(b => b === 'G' || b === 'C').length / n;
  return { dH, dS, dG37: dH - 310.15 * dS / 1000, Tm, gc, selfComplementary: self, length: n };
}

/**
 * Helix-coil equilibrium at temperature T (°C). Each base pair is closed (helix) or open
 * (coil); adjacent closed pairs gain the nearest-neighbour stacking free energy; forming
 * the first helical segment costs the bimolecular initiation term (and depends on strand
 * concentration); every further helical segment (i.e. an internal bubble) costs the
 * cooperativity factor sigma. Ends fray freely. Solved exactly by transfer matrix
 * (forward-backward). Returns { closed: Float64Array per-pair probability of being paired,
 * duplex: fraction of molecules with at least one pair, paired: mean fraction of closed pairs }.
 */
export function helixCoil(seq, T, { Na = 1, Ct = 1e-6, sigma = 1e-4 } = {}) {
  const n = seq.length, TK = T + 273.15, RT = R * TK;
  const s = new Float64Array(Math.max(n - 1, 0));
  for (let k = 0; k + 1 < n; k++) { const { dH, dS } = stackThermo(seq, k, Na); s[k] = Math.exp(-(dH - TK * dS / 1000) / RT); }
  const gcEnds = 'GC'.includes(seq[0]) + 'GC'.includes(seq[n - 1]);
  const iH = gcEnds * INIT_GC[0] + (2 - gcEnds) * INIT_AT[0], iS = gcEnds * INIT_GC[1] + (2 - gcEnds) * INIT_AT[1];
  const self = isSelfComplementary(seq);
  const kappa = (self ? Ct : Ct / 4) * Math.exp(-(iH - TK * (iS + (self ? SYMMETRY_DS : 0)) / 1000) / RT);
  // States per pair: 0 = open, no helix yet; 1 = closed; 2 = open, after a helix.
  const f = Array.from({ length: n }, () => [0, 0, 0]), b = Array.from({ length: n }, () => [0, 0, 0]);
  const scaleF = new Float64Array(n), scaleB = new Float64Array(n);
  f[0] = [1, kappa, 0];
  let c = f[0][0] + f[0][1]; f[0] = f[0].map(v => v / c); scaleF[0] = Math.log(c);
  for (let k = 1; k < n; k++) {
    const p = f[k - 1];
    const v = [p[0], p[0] * kappa + p[1] * s[k - 1] + p[2] * sigma, p[1] + p[2]];
    c = v[0] + v[1] + v[2]; f[k] = v.map(x => x / c); scaleF[k] = scaleF[k - 1] + Math.log(c);
  }
  b[n - 1] = [1, 1, 1];
  for (let k = n - 2; k >= 0; k--) {
    const q = b[k + 1];
    const v = [q[0] + kappa * q[1], s[k] * q[1] + q[2], sigma * q[1] + q[2]];
    c = Math.max(v[0], v[1], v[2]); b[k] = v.map(x => x / c); scaleB[k] = scaleB[k + 1] + Math.log(c);
  }
  const lnZ = scaleF[n - 1] + Math.log(f[n - 1][0] + f[n - 1][1] + f[n - 1][2]);
  const closed = new Float64Array(n);
  let paired = 0;
  for (let k = 0; k < n; k++) {
    closed[k] = Math.min(1, f[k][1] * b[k][1] * Math.exp(scaleF[k] + scaleB[k] - lnZ));
    paired += closed[k] / n;
  }
  return { closed, duplex: 1 - Math.exp(-lnZ), paired };
}

/** Melting curve: fraction of closed base pairs vs temperature (°C). */
export function meltingCurve(seq, opts = {}, tMin = 0, tMax = 110, steps = 111) {
  const out = [];
  for (let i = 0; i < steps; i++) { const T = tMin + (tMax - tMin) * i / (steps - 1); const h = helixCoil(seq, T, opts); out.push({ T, paired: h.paired, duplex: h.duplex }); }
  return out;
}
