// Derives the sugar-phosphate backbone template and the embedded crystal structure
// from PDB entry 1BNA (Drew et al. 1981, PNAS 78, 2179; 1.9 Å; PDB data are CC0).
// Run: node tools/build-templates.mjs   -> writes js/science/templates.js
import fs from 'node:fs';
import { BASE_ATOMS } from '../js/science/bases.js';
import { kabsch, applyFrame, invApplyFrame, helixFrame, partnerFrame, dist, angle } from '../js/science/math.js';

const here = new URL('.', import.meta.url).pathname;
const lines = fs.readFileSync(here + '1bna.cif', 'utf8').split('\n').filter(l => l.startsWith('ATOM'));
const residues = new Map();
for (const l of lines) {
  const t = l.match(/"[^"]*"|\S+/g).map(s => s.replace(/"/g, ''));
  const [, , el, name, , comp, chain, , seq, , x, y, z, , b] = t;
  const key = chain + ':' + seq;
  if (!residues.has(key)) residues.set(key, { chain, seq: +seq, base: comp.replace('D', ''), atoms: {} , el: {}, b: {} });
  const r = residues.get(key);
  r.atoms[name] = [+x, +y, +z]; r.el[name] = el; r.b[name] = +b;
}
const all = [...residues.values()];
const BB = ['P', 'OP1', 'OP2', "O5'", "C5'", "C4'", "O4'", "C3'", "O3'", "C2'"];

// Fit the standard base onto every crystal base -> per-residue reference frame.
for (const r of all) {
  const std = BASE_ATOMS[r.base].filter(a => a[0] !== "C1'");
  const P = std.map(a => [a[2], a[3], 0]);
  const Q = std.map(a => r.atoms[a[0]]);
  r.frame = kabsch(P, Q);
  r.rmsd = Math.sqrt(P.reduce((s, p, i) => s + dist(applyFrame(r.frame, p), Q[i]) ** 2, 0) / P.length);
  r.local = {};
  for (const n of BB) if (r.atoms[n]) r.local[n] = invApplyFrame(r.frame, r.atoms[n]);
}
console.log('base fit rmsd (Å): max', Math.max(...all.map(r => r.rmsd)).toFixed(3));

// Candidate templates: interior residues with a complete backbone. Score each by how
// well it closes the O3'(i)-P(i+1) phosphodiester link in an ideal helix.
function score(local, rise, twistDeg) {
  const f0 = helixFrame(0, rise, twistDeg), f1 = helixFrame(1, rise, twistDeg);
  const c1 = [-2.479, 5.37, 0];
  const o3 = applyFrame(f0, local["O3'"]), c3 = applyFrame(f0, local["C3'"]);
  const p = applyFrame(f1, local.P), o5 = applyFrame(f1, local["O5'"]);
  const d = dist(o3, p), a1 = angle(c3, o3, p), a2 = angle(o3, p, o5);
  return { d, a1, a2, err: Math.abs(d - 1.607) / 0.05 + Math.abs(a1 - 119.7) / 5 + Math.abs(a2 - 104) / 5 };
}
const cands = all.filter(r => BB.every(n => r.local[n]));
const RISE = 3.38, TWIST = 360 / 10.5;
let best = null;
for (const r of cands) {
  const s = score(r.local, RISE, TWIST);
  console.log(r.chain, r.seq, r.base, 'O3-P', s.d.toFixed(2), 'C3-O3-P', s.a1.toFixed(1), 'O3-P-O5', s.a2.toFixed(1), 'err', s.err.toFixed(2));
  if (!best || s.err < best.s.err) best = { r, s };
}
// Mean template (for reference) and chosen template.
const mean = {};
for (const n of BB) mean[n] = [0, 1, 2].map(k => cands.reduce((s, r) => s + r.local[n][k], 0) / cands.length);
const sm = score(mean, RISE, TWIST);
console.log('mean template: O3-P', sm.d.toFixed(2), sm.a1.toFixed(1), sm.a2.toFixed(1), 'err', sm.err.toFixed(2));
console.log('best single residue:', best.r.chain, best.r.seq, best.r.base, best.s);
export { all, cands, mean, best, BB, score };

// ---------------------------------------------------------------------------------
// No single crystal residue closes the chain in a perfectly regular helix (the crystal
// helix is bent and sequence-dependent), so regularise: start from the crystal-averaged
// backbone and minimise deviations from ideal covalent geometry (Gelbin et al. 1996,
// JACS 118, 519; Parkinson et al. 1996, Acta Cryst. D52, 57) while enforcing the
// O3'(i)-P(i+1) link under the helical screw operation.
import { composeFrames, sub, dihedral } from '../js/science/math.js';
const C1 = [-2.479, 5.37, 0], NG = [-1.288, 4.52, 0];         // C1' and glycosidic N (mean over bases)
const BONDS = [['P', 'OP1', 1.485], ['P', 'OP2', 1.485], ['P', "O5'", 1.593], ["O5'", "C5'", 1.440],
  ["C5'", "C4'", 1.511], ["C4'", "O4'", 1.446], ["C4'", "C3'", 1.528], ["C3'", "O3'", 1.431],
  ["C3'", "C2'", 1.525], ["C2'", "C1'", 1.519], ["O4'", "C1'", 1.420], ["O3'", 'P+', 1.607]];
const ANGLES = [["O3'-", 'P', "O5'", 104.0], ['OP1', 'P', 'OP2', 119.6], ["O5'", 'P', 'OP1', 110.7],
  ["O5'", 'P', 'OP2', 105.7], ["O3'-", 'P', 'OP1', 105.2], ["O3'-", 'P', 'OP2', 110.5],
  ['P', "O5'", "C5'", 120.9], ["O5'", "C5'", "C4'", 111.0], ["C5'", "C4'", "C3'", 114.7],
  ["C5'", "C4'", "O4'", 109.4], ["O4'", "C4'", "C3'", 105.6], ["C4'", "C3'", "O3'", 109.4],
  ["C4'", "C3'", "C2'", 103.2], ["C2'", "C3'", "O3'", 110.6], ["C3'", "C2'", "C1'", 102.7],
  ["C2'", "C1'", "O4'", 105.8], ["C1'", "O4'", "C4'", 109.7], ["C3'", "O3'", 'P+', 119.7],
  ["O4'", "C1'", 'N', 108.0], ["C2'", "C1'", 'N', 113.7]];

// Mean BI-conformation backbone torsions of B-DNA crystal structures
// (Schneider, Neidle & Berman 1997, Biopolymers 42, 113).
const TORSIONS = [["O3'-", 'P', "O5'", "C5'", -62], ['P', "O5'", "C5'", "C4'", 176], ["O5'", "C5'", "C4'", "C3'", 48],
  ["C5'", "C4'", "C3'", "O3'", 128], ["C4'", "C3'", "O3'", 'P+', -176], ["C3'", "O3'", 'P+', "O5'+", -95]];
function regularise(start, rise, twistDeg, wRef = 0.005, pTarget = null) {
  const step = helixFrame(1, rise, twistDeg), back = helixFrame(-1, rise, twistDeg);
  const names = BB, x = names.flatMap(n => start[n]);
  const get = (v, n) => {
    if (n === "C1'") return C1; if (n === 'N') return NG;
    if (n === 'P+') return applyFrame(step, get(v, 'P'));
    if (n === "O5'+") return applyFrame(step, get(v, "O5'"));
    if (n === "O3'-") return applyFrame(back, get(v, "O3'"));
    const i = names.indexOf(n) * 3; return [v[i], v[i + 1], v[i + 2]];
  };
  const energy = v => {
    let e = 0;
    for (const [a, b, d] of BONDS) e += ((dist(get(v, a), get(v, b)) - d) / 0.02) ** 2;
    for (const [a, b, c, t] of ANGLES) e += ((angle(get(v, a), get(v, b), get(v, c)) - t) / 2) ** 2;
    for (const [a, b, c, d, t] of TORSIONS) {
      let dt = dihedral(get(v, a), get(v, b), get(v, c), get(v, d)) - t; dt -= 360 * Math.round(dt / 360);
      e += (dt / 12) ** 2;
    }
    if (pTarget) { const pp = get(v, 'P'); for (let k = 0; k < 3; k++) e += ((pp[k] - pTarget[k]) / 0.1) ** 2; }
    for (let i = 0; i < v.length; i++) e += wRef * ((v[i] - x0[i]) / 0.3) ** 2;
    return e;
  };
  const x0 = x.slice();
  let v = x.slice(), e = energy(v), lr = 1e-4;
  for (let it = 0; it < 60000; it++) {
    const g = v.map((_, i) => { const w = v.slice(); w[i] += 1e-5; return (energy(w) - e) / 1e-5; });
    const w = v.map((q, i) => q - lr * g[i]), e2 = energy(w);
    if (e2 < e) { if (e - e2 < 1e-12) break; v = w; e = e2; lr *= 1.1; } else lr *= 0.5;
  }
  const out = {}; names.forEach(n => out[n] = get(v, n).map(q => +q.toFixed(4)));
  return { tpl: out, energy: e, get: n => get(v, n) };
}

function report(tpl, rise, twistDeg) {
  const step = helixFrame(1, rise, twistDeg), back = helixFrame(-1, rise, twistDeg);
  const g = n => n === "C1'" ? C1 : n === 'N' ? NG : n === 'C' ? [-1.27, 3.14, 0] : n.endsWith('+') ? applyFrame(step, g(n.slice(0, -1))) : n.endsWith('-') && n !== "O3'-x" && n.length > 3 && n.slice(-1) === '-' ? applyFrame(back, g(n.slice(0, -1))) : tpl[n];
  const tor = (a, b, c, d) => dihedral(g(a), g(b), g(c), g(d)).toFixed(0);
  const nu = [["C4'", "O4'", "C1'", "C2'"], ["O4'", "C1'", "C2'", "C3'"], ["C1'", "C2'", "C3'", "C4'"], ["C2'", "C3'", "C4'", "O4'"], ["C3'", "C4'", "O4'", "C1'"]].map(t => dihedral(...t.map(g)));
  const Pps = Math.atan2((nu[4] + nu[1]) - (nu[3] + nu[0]), 2 * nu[2] * (Math.sin(36 * Math.PI / 180) + Math.sin(72 * Math.PI / 180))) * 180 / Math.PI;
  const worstBond = Math.max(...BONDS.map(([a, b, d]) => Math.abs(dist(g(a === 'P+' ? 'P+' : a), g(b)) - d)));
  const worstAng = Math.max(...ANGLES.map(([a, b, c, t]) => Math.abs(angle(g(a), g(b), g(c)) - t)));
  return {
    alpha: tor("O3'-", 'P', "O5'", "C5'"), beta: tor('P', "O5'", "C5'", "C4'"), gamma: tor("O5'", "C5'", "C4'", "C3'"),
    delta: tor("C5'", "C4'", "C3'", "O3'"), epsilon: tor("C4'", "C3'", "O3'", 'P+'), zeta: tor("C3'", "O3'", 'P+', "O5'+"),
    chi: tor("O4'", "C1'", 'N', 'C'), pucker_P: ((Pps + 360) % 360).toFixed(0),
    worstBond: worstBond.toFixed(3), worstAngle: worstAng.toFixed(1), P_radius: Math.hypot(tpl.P[0], tpl.P[1]).toFixed(2),
  };
}
// Phosphate position restrained to the crystal median in the base frame (see probe: x≈-0.2, y≈9.35, z≈-1.95),
// which reproduces the narrow-minor / wide-major groove asymmetry of B-DNA.
const med = k => { const a = cands.map(r => r.local.P[k]).sort((x, y) => x - y); return a[a.length >> 1]; };
const P_TARGET = process.env.PT ? process.env.PT.split(',').map(Number) : [med(0), med(1), med(2)];
console.log('P target', P_TARGET);
const reg = regularise(mean, RISE, TWIST, 0.005, P_TARGET);
console.log('regularised energy', reg.energy.toFixed(3));
console.log(report(reg.tpl, RISE, TWIST));
console.log(reg.tpl);
export { reg, report, regularise, RISE, TWIST };

// ---------------------------------------------------------------------------------
// Emit js/science/templates.js: regularised backbone + the axis-aligned crystal structure.
import { norm, cross, dot, mulMV } from '../js/science/math.js';
const hetLines = fs.readFileSync(here + '1bna.cif', 'utf8').split('\n').filter(l => l.startsWith('HETATM') && / HOH /.test(l));
const waters = hetLines.map(l => { const t = l.match(/"[^"]*"|\S+/g); return [+t[10], +t[11], +t[12], +t[14]]; });
// Helix axis: principal direction of the 12 base-pair origins (pair i of chain A with 13-i of chain B).
const A = all.filter(r => r.chain === 'A').sort((a, b) => a.seq - b.seq);
const B = all.filter(r => r.chain === 'B').sort((a, b) => a.seq - b.seq);
const origins = A.map((r, i) => r.frame.o.map((v, k) => (v + B[B.length - 1 - i].frame.o[k]) / 2));
const cen = [0, 1, 2].map(k => origins.reduce((s, o) => s + o[k], 0) / origins.length);
let ax = norm(sub(origins[origins.length - 1], origins[0]));
for (let it = 0; it < 50; it++) {                       // power iteration on the covariance
  const v = [0, 0, 0];
  for (const o of origins) { const d = sub(o, cen), p = dot(d, ax); for (let k = 0; k < 3; k++) v[k] += d[k] * p; }
  ax = norm(v);
}
if (dot(ax, sub(origins[origins.length - 1], origins[0])) < 0) ax = ax.map(v => -v);
let ex = norm(cross([0, 1, 0], ax)); const ey = cross(ax, ex);
const Rw = [...ex, ...ey, ...ax];                        // rows = new axes -> world-to-aligned
const align = p => mulMV(Rw, sub(p, cen)).map(v => +v.toFixed(3));
const crystal = {
  id: '1BNA', title: 'B-DNA dodecamer d(CGCGAATTCGCG)2 (Drew, Wing, Takano, Broka, Tanaka, Itakura & Dickerson 1981)',
  resolution: 1.9,
  chains: [A, B].map(ch => ch.map(r => ({ base: r.base, atoms: Object.keys(r.atoms).map(n => [n, r.el[n], ...align(r.atoms[n]), r.b[n]]) }))),
  waters: waters.map(w => [...align(w), w[3]]),
};
const out = `// GENERATED by tools/build-templates.mjs — do not edit by hand.
// BACKBONE: sugar-phosphate atoms of one B-DNA nucleotide in its own standard base frame (Å).
// Derived from the crystal-averaged backbone of PDB 1BNA, regularised to ideal covalent
// geometry and mean BI torsions under a ${RISE} Å / ${TWIST.toFixed(3)}° helical screw.
export const HELIX_B = { rise: ${RISE}, twistDeg: ${TWIST}, bpPerTurn: 10.5 };
export const BACKBONE = ${JSON.stringify(reg.tpl)};
export const BACKBONE_TORSIONS = ${JSON.stringify(report(reg.tpl, RISE, TWIST))};
// CRYSTAL_1BNA: experimental coordinates, re-oriented so the helix axis is +z. Atom rows: [name, element, x, y, z, B-factor].
export const CRYSTAL_1BNA = ${JSON.stringify(crystal)};
`;
fs.writeFileSync(here + '../js/science/templates.js', out);
console.log('wrote templates.js', out.length, 'bytes; waters', waters.length, 'chainB seq', B.map(r => r.seq).join(','));
