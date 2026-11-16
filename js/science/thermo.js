// Nucleic acid duplex thermodynamics:
// - DNA: unified nearest-neighbour model (SantaLucia 1998, PNAS 95, 1460)
// - RNA: Turner / Xia et al. (1998) nearest-neighbour model (Biochemistry 37, 14719)
// Plus a nearest-neighbour helix-coil (zipper/Ising transfer-matrix) model for per-base-pair opening.
const R = 1.98720425e-3;                       // gas constant, kcal mol^-1 K^-1

// DNA Stack 5'-XY-3' / 3'-X'Y'-5': [ΔH° kcal/mol, ΔS° cal/(mol·K)] at 1 M NaCl (SantaLucia 1998).
export const DNA_NN = {
  AA: [-7.9, -22.2], TT: [-7.9, -22.2], AT: [-7.2, -20.4], TA: [-7.2, -21.3],
  CA: [-8.5, -22.7], TG: [-8.5, -22.7], GT: [-8.4, -22.4], AC: [-8.4, -22.4],
  CT: [-7.8, -21.0], AG: [-7.8, -21.0], GA: [-8.2, -22.2], TC: [-8.2, -22.2],
  CG: [-10.6, -27.2], GC: [-9.8, -24.4], GG: [-8.0, -19.9], CC: [-8.0, -19.9],
};
const NN = DNA_NN;
const INIT_GC = [0.1, -2.8], INIT_AT = [2.3, 4.1], SYMMETRY_DS = -1.4;

// RNA Stack 5'-XY-3' / 3'-X'Y'-5': [ΔH° kcal/mol, ΔS° cal/(mol·K)] at 1 M NaCl (Xia et al. 1998, Table 2).
export const RNA_NN = {
  AA: [-6.82, -19.0], UU: [-6.82, -19.0], AU: [-9.38, -26.7], UA: [-7.69, -20.5],
  CA: [-10.44, -26.9], UG: [-10.44, -26.9], GU: [-11.40, -29.5], AC: [-11.40, -29.5],
  CU: [-10.48, -27.1], AG: [-10.48, -27.1], GA: [-12.44, -32.5], UC: [-12.44, -32.5],
  CG: [-10.64, -26.7], GC: [-14.88, -36.9], GG: [-13.39, -32.7], CC: [-13.39, -32.7],
};
// Xia et al. (1998) initiation [3.61, -1.5] split across two ends + terminal AU penalty [3.72, 10.5].
const RNA_INIT_GC = [1.805, -0.75], RNA_INIT_AU = [5.525, 9.75];

const compDna = { A: 'T', T: 'A', G: 'C', C: 'G' };
const compRna = { A: 'U', U: 'A', G: 'C', C: 'G' };
const isRnaMode = (seq, nucleicAcid) => nucleicAcid === 'rna' || (!nucleicAcid && seq.includes('U') && !seq.includes('T'));
const normSeq = (seq, rna) => (seq || '').toUpperCase().replace(rna ? /T/g : /U/g, rna ? 'U' : 'T').replace(rna ? /[^ACGU]/g : /[^ACGT]/g, '');
const isSelfComplementary = (s, rna) => {
  const c = rna ? compRna : compDna;
  return [...s].reverse().map(b => c[b]).join('') === s;
};

/** ΔH (kcal/mol) and ΔS (cal/mol/K, salt-corrected) of the stack between pairs k and k+1. */
export function stackThermo(seq, k, Na = 1, nucleicAcid) {
  const rna = isRnaMode(seq, nucleicAcid);
  const sNorm = normSeq(seq, rna);
  const table = rna ? RNA_NN : NN;
  const [h, s] = table[sNorm[k] + sNorm[k + 1]];
  return { dH: h, dS: s + 0.368 * Math.log(Na) };
}

/**
 * Two-state duplex thermodynamics. seq: one strand 5'->3'. Na: monovalent cation (M).
 * Ct: total strand concentration (M). nucleicAcid: 'dna' | 'rna'.
 * Returns ΔH° (kcal/mol), ΔS° (cal/mol/K), ΔG°37 (kcal/mol), Tm (°C), plus GC fraction.
 */
export function duplexThermo(seq, { Na = 1, Ct = 1e-6, nucleicAcid } = {}) {
  const rna = isRnaMode(seq, nucleicAcid);
  const sNorm = normSeq(seq, rna);
  const n = sNorm.length;
  if (n < 2) return { dH: 0, dS: 0, dG37: 0, Tm: NaN, gc: NaN, selfComplementary: false, length: n, nucleicAcid: rna ? 'rna' : 'dna' };
  const table = rna ? RNA_NN : NN;
  const initGC = rna ? RNA_INIT_GC : INIT_GC;
  const initAT = rna ? RNA_INIT_AU : INIT_AT;
  let dH = 0, dS = 0;
  for (let k = 0; k + 1 < n; k++) { dH += table[sNorm[k] + sNorm[k + 1]][0]; dS += table[sNorm[k] + sNorm[k + 1]][1]; }
  for (const end of [sNorm[0], sNorm[n - 1]]) { const t = 'GC'.includes(end) ? initGC : initAT; dH += t[0]; dS += t[1]; }
  const self = isSelfComplementary(sNorm, rna);
  if (self) dS += SYMMETRY_DS;
  dS += 0.368 * (n - 1) * Math.log(Na);        // monovalent cation entropic correction
  const x = self ? Ct : Ct / 4;
  const Tm = (dH * 1000) / (dS + R * 1000 * Math.log(x)) - 273.15;
  const gc = [...sNorm].filter(b => b === 'G' || b === 'C').length / n;
  return { dH, dS, dG37: dH - 310.15 * dS / 1000, Tm, gc, selfComplementary: self, length: n, nucleicAcid: rna ? 'rna' : 'dna' };
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
export function helixCoil(seq, T, { Na = 1, Ct = 1e-6, sigma = 1e-4, nucleicAcid } = {}) {
  const rna = isRnaMode(seq, nucleicAcid);
  const sNorm = normSeq(seq, rna);
  const n = sNorm.length, TK = T + 273.15, RT = R * TK;
  const s = new Float64Array(Math.max(n - 1, 0));
  for (let k = 0; k + 1 < n; k++) { const { dH, dS } = stackThermo(sNorm, k, Na, rna ? 'rna' : 'dna'); s[k] = Math.exp(-(dH - TK * dS / 1000) / RT); }
  const initGC = rna ? RNA_INIT_GC : INIT_GC;
  const initAT = rna ? RNA_INIT_AU : INIT_AT;
  const gcEnds = 'GC'.includes(sNorm[0]) + 'GC'.includes(sNorm[n - 1]);
  const iH = gcEnds * initGC[0] + (2 - gcEnds) * initAT[0], iS = gcEnds * initGC[1] + (2 - gcEnds) * initAT[1];
  const self = isSelfComplementary(sNorm, rna);
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
