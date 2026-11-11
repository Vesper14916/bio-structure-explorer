// Semi-conservative DNA replication at a single fork.
//
// The whole configuration is a PURE FUNCTION of the timeline time t (plus smooth noise that is itself
// a function of t), so seek() works in both directions and is exactly reproducible.
//
// Layout (science z axis = helix axis, strand I runs 5'->3' toward +z)
//   * The fork STARTS AT THE +z END (pair n-1) and moves toward -z. The parental duplex is the stem
//     of the "Y" (low z), the two daughter arms diverge behind the fork (high z) tilted +-28°.
//   * Strand I (5'->3' toward +z) therefore runs 3'->5' in the direction of fork movement: it is the
//     LEADING-strand template. Strand II runs 5'->3' in that direction: LAGGING-strand template.
//   * Strands: 0 = parental I, 1 = parental II, 2 = leading daughter (5'->3' toward -z, i.e. it follows
//     the helicase), 3 = lagging daughter (5'->3' toward +z, i.e. away from the fork, in Okazaki fragments).
//   * Ids: pair k -> strand I id 2k, strand II id 2k+1 (as buildDuplex); leading daughter strand index j
//     (pair n-1-j) has id 2n+j; lagging daughter strand index k (pair k) has id 3n+k.
//     Pair ids: parental 0..n-1; leading template-daughter n+k; lagging template-daughter 2n+k (pair k).
//
// Geometry
//   * Every nucleotide is placed from the rotated ideal helix W_k = Rz(Φ) · F_k (Φ = one helical twist
//     per pair unwound: the duplex ahead spins, so strands genuinely unwind). Behind the fork the
//     frames are blended from W_k to "W_k hinged about the fork point by ±28° and shifted laterally"
//     through a smooth 4-pair zone (a slerp from identity to the hinge rotation, scaled by a
//     smoothstep): the single-stranded template. Beyond the zone each arm is a rigid copy of an ideal
//     B helix, so template-daughter pairs have exact Watson-Crick geometry once the daughter docks.
//   * Daughter dNTPs fly in from ~28 Å away along a curved path while tumbling, dock into the partner
//     frame of their template, H-bonds then form (pair.strength 0->1) and finally the phosphodiester
//     link to the previous nucleotide becomes active.
//   * At the end the two arms swing parallel and drift apart: two separate daughter duplexes.
import { Assembly, idealPairFrame, cleanSequence } from '../science/assembly.js';
import { COMPLEMENT } from '../science/bases.js';
import { HELIX_B } from '../science/templates.js';
import {
  mulberry32, clamp, smoothstep, smootherstep, createNoise, DEG,
  mulMM, axisAngle, expMap, rotZInto,
} from './util.js';

// ----------------------------------------------------------------------------------------- constants
const RISE = HELIX_B.rise, OMEGA = HELIX_B.twistDeg * DEG;
const SEC_PER_PAIR = 0.7;      // helicase pace at cruise (s per base pair unwound)
const INTRO = 3.0;             // s: helicase loads before it starts to move
const RAMP = 0.06;             // fraction of the unwinding spent accelerating / braking
const LAG_LEAD = 4.5;          // pairs between fork and leading polymerase
const ZONE = 4.0;              // pairs of single-stranded template (hinge transition)
const PRIME_OFFSET = 4.5;      // pairs behind the fork where primase starts a fragment
const FLIGHT = 1.8;            // s a dNTP takes from appearing to docking
const T_HB = 0.6;              // s for H-bonds to form after docking
const T_LINK = 0.15;           // s between H-bond completion and the phosphodiester bond
const T_PRIMER = 0.45;         // s between primase additions
const T_EXT = 0.5;             // s between lagging polymerase additions
const TILT = 28 * DEG;         // arm tilt away from the parental axis
const SHIFT = 5;               // Å lateral offset of each arm's axis at the hinge
const SEP = 14;                // Å final lateral offset of each daughter duplex
const T_SEP = 3.2;             // s separation of the daughter duplexes
const T_HOLD = 1.0;            // s final hold
const NOISE_POS = 0.12, NOISE_ROT = 0.015;
const FRAG_TARGET = 9;         // pairs per Okazaki fragment (compressed)

const smooth01 = smoothstep;

/** Enzyme bodies shown as translucent blobs (colours are used by the Copy-mode legend too). */
export const BLOB_DEF = {
  helicase: { label: 'Helicase', radius: 13, color: 0x8b6cff },
  'pol-leading': { label: 'DNA polymerase', radius: 12, color: 0x4fb6ff },
  'pol-lagging': { label: 'DNA polymerase', radius: 12, color: 0x4fb6ff },
  primase: { label: 'Primase', radius: 7.5, color: 0xf472b6 },
  ligase: { label: 'DNA ligase', radius: 8.5, color: 0xffd84a },
};

export function createReplicationSim(sequence, opts = {}) {
  const { seed = 1, speed: speed0 = 1 } = opts;
  let speedV = Number.isFinite(speed0) && speed0 > 0 ? speed0 : 1;
  const seq = cleanSequence(sequence);
  const n = seq.length;
  if (n < 4) throw new Error('createReplicationSim: sequence needs at least 4 bases');
  const rng = mulberry32(seed);
  const z0 = -((n - 1) * RISE) / 2;
  const zOf = k => z0 + k * RISE;

  // ============================================================================ assembly (built once)
  const asm = new Assembly();
  const I = [], II = [], LD = new Array(n), LG = new Array(n);
  for (let k = 0; k < n; k++) {
    const f = idealPairFrame(k, n);
    const R = f.R.slice(), Rp = f.R.slice();
    Rp[1] = -Rp[1]; Rp[2] = -Rp[2]; Rp[4] = -Rp[4]; Rp[5] = -Rp[5]; Rp[7] = -Rp[7]; Rp[8] = -Rp[8];
    I.push(asm.addNucleotide({ base: seq[k], strand: 0, frame: { o: f.o.slice(), R } }));
    II.push(asm.addNucleotide({ base: COMPLEMENT[seq[k]], strand: 1, frame: { o: f.o.slice(), R: Rp } }));
    asm.addPair(I[k], II[k]);                                         // parental pair id = k
  }
  asm.strands[1].reverse();                                            // strand II stored 5'->3'
  II.forEach((nuc, k) => { nuc.index = n - 1 - k; });
  for (let k = 0; k + 1 < n; k++) { asm.addLink(I[k], I[k + 1]); asm.addLink(II[k + 1], II[k]); }
  const blank = () => ({ o: [0, 0, 0], R: [1, 0, 0, 0, 1, 0, 0, 0, 1] });
  for (let j = 0; j < n; j++) { const k = n - 1 - j; LD[k] = asm.addNucleotide({ base: COMPLEMENT[seq[k]], strand: 2, frame: blank() }); }
  for (let k = 0; k < n; k++) LG[k] = asm.addNucleotide({ base: seq[k], strand: 3, frame: blank() });
  const leadLink0 = asm.links.length;
  for (let j = 0; j + 1 < n; j++) asm.addLink(LD[n - 1 - j], LD[n - 2 - j], false);
  const lagLink0 = asm.links.length;
  for (let k = 0; k + 1 < n; k++) asm.addLink(LG[k], LG[k + 1], false);
  for (let k = 0; k < n; k++) asm.addPair(I[k], LD[k], 0);             // id n + k
  for (let k = 0; k < n; k++) asm.addPair(II[k], LG[k], 0);            // id 2n + k
  for (let k = 0; k < n; k++) { I[k].pair = k; II[k].pair = k; }
  asm.meta = { kind: 'replication', sequence: seq, length: n, helix: HELIX_B,
    axis: [[0, 0, z0], [0, 0, -z0]] };
  asm.finalize();
  const nuc = asm.nucleotides;
  const nucId = (strand, k) => (strand === 0 ? 2 * k : strand === 1 ? 2 * k + 1 : strand === 2 ? 2 * n + (n - 1 - k) : 3 * n + k);
  const pairOfNuc = id => (id < 2 * n ? id >> 1 : id < 3 * n ? n + (n - 1 - (id - 2 * n)) : 2 * n + (id - 3 * n));

  // ============================================================================ schedule (pure arithmetic)
  const F0 = n + 0.5, F_END = -LAG_LEAD - 1.5;
  const T_U = (F0 - F_END) * SEC_PER_PAIR / (1 - RAMP);
  const T_UNWIND_END = INTRO + T_U;
  const forkAtTime = t => {                      // pairs: F0 -> F_END with eased ends
    const u = clamp((t - INTRO) / T_U, 0, 1), a = RAMP, c = 1 / (1 - a);
    const E = u < a ? c * u * u / (2 * a) : u <= 1 - a ? c * (u - a / 2) : 1 - c * (1 - u) * (1 - u) / (2 * a);
    return F0 - (F0 - F_END) * E;
  };
  const timeOfFork = fv => {                     // inverse of forkAtTime (monotone)
    if (fv >= F0) return INTRO;
    if (fv <= F_END) return T_UNWIND_END;
    let lo = INTRO, hi = T_UNWIND_END;
    for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (forkAtTime(m) > fv) lo = m; else hi = m; }
    return (lo + hi) / 2;
  };

  // Okazaki fragments on the lagging strand: fragment 0 is the first made, nearest the origin (+z end).
  const nFrag = Math.max(2, Math.round(n / FRAG_TARGET));
  const frags = [];
  {
    const base = Math.floor(n / nFrag), rem = n % nFrag;
    let hi = n - 1;
    for (let f = 0; f < nFrag; f++) {
      const size = base + (f < rem ? 1 : 0), lo = hi - size + 1;
      const pl = size >= 6 ? 3 : size >= 4 ? 2 : 1;
      frags.push({ lo, hi, size, pl });
      hi = lo - 1;
    }
  }
  const fragOf = new Int32Array(n);
  frags.forEach((fr, f) => { for (let k = fr.lo; k <= fr.hi; k++) fragOf[k] = f; });
  const leadPl = n >= 8 ? 3 : 2;                 // leading strand: primer of leadPl nucleotides at its 5' end

  // dock / flight / link times
  const tDock = new Float64Array(4 * n).fill(NaN);       // by nucleotide id (daughters only)
  const tStart = new Float64Array(4 * n).fill(NaN);
  for (let j = 0; j < n; j++) {
    const k = n - 1 - j, id = nucId(2, k);
    tDock[id] = timeOfFork(k - LAG_LEAD); tStart[id] = tDock[id] - FLIGHT;
  }
  for (const [f, fr] of frags.entries()) {
    fr.tFirst = timeOfFork(fr.lo - PRIME_OFFSET);
    let t = fr.tFirst;
    for (let i = 0; i < fr.size; i++) {
      const id = nucId(3, fr.lo + i);
      tDock[id] = t; tStart[id] = t - FLIGHT;
      t += i < fr.pl - 1 ? T_PRIMER : T_EXT;
    }
    fr.tDone = tDock[nucId(3, fr.hi)] + T_HB + T_LINK;      // last nucleotide joined
    fr.f = f;
  }
  // primer replacement + ligation: fragment f (f>=1) reaches the primer of fragment f-1
  for (const fr of frags) {
    if (fr.f === 0) { fr.tSwap = NaN; fr.tLig = NaN; continue; }
    fr.tSwap = fr.tDone + 0.4;                              // dip starts
    fr.tLig = fr.tSwap + 1.7;                               // nick sealed
  }
  const lastLead = nucId(2, 0);
  const tLeadDone = tDock[lastLead] + T_HB + T_LINK;
  let tLastLig = Math.max(tLeadDone, ...frags.map(fr => (Number.isFinite(fr.tLig) ? fr.tLig : 0)), frags[0].tDone);
  const tTerm = tLastLig + 0.9;                              // terminal primers replaced (dip start)
  const tFin = tTerm + 1.9;                                  // arms start to separate
  const DURATION = tFin + T_SEP + T_HOLD;
  const linkTime = new Float64Array(asm.links.length).fill(0);   // active when t >= linkTime (parental: 0)
  for (let j = 0; j + 1 < n; j++) linkTime[leadLink0 + j] = tDock[nucId(2, n - 2 - j)] + T_HB + T_LINK;
  for (let k = 0; k + 1 < n; k++) {
    const l = lagLink0 + k;
    linkTime[l] = fragOf[k] !== fragOf[k + 1] ? frags[fragOf[k]].tLig : tDock[nucId(3, k + 1)] + T_HB + T_LINK;
  }
  // primer bookkeeping
  const primerOf = new Int8Array(4 * n).fill(-1);            // nucleotide id -> fragment index owning this primer (-1 none; 100 leading)
  const tClear = new Float64Array(4 * n).fill(NaN);          // time the tag is cleared (centre of the dip)
  const tDip0 = new Float64Array(4 * n).fill(NaN);
  for (let j = 0; j < leadPl; j++) { const id = nucId(2, n - 1 - j); primerOf[id] = 100; tDip0[id] = tTerm; tClear[id] = tTerm + 0.7; }
  for (const fr of frags) for (let i = 0; i < fr.pl; i++) {
    const id = nucId(3, fr.lo + i);
    primerOf[id] = fr.f;
    const owner = fr.f + 1 < nFrag ? frags[fr.f + 1] : null;     // fragment whose completion removes this primer
    tDip0[id] = owner ? owner.tSwap : tTerm;
    tClear[id] = tDip0[id] + 0.7;
  }

  // ============================================================================ noise
  const noise = createNoise(rng, 12, { fMin: 0.35, fMax: 1.1, gMax: 1 / 14, waves: 2 });
  // per-daughter flight randomisation (fixed at construction)
  const flight = new Array(4 * n).fill(null);
  for (let id = 2 * n; id < 4 * n; id++) {
    const d = [rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1], dl = Math.hypot(...d) || 1;
    const ax = [rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1], al = Math.hypot(...ax) || 1;
    const bd = [rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1];
    flight[id] = {
      rnd: d.map(v => v / dl), dist: 25 + 5 * rng(),
      axis: ax.map(v => v / al), spin: (rng() < 0.5 ? -1 : 1) * (3 + 2 * rng()),
      bd, bulge: 6 + 4 * rng(), start: [0, 0, 0],
    };
  }

  // ============================================================================ geometry helpers
  const aTw = (n - 1) * OMEGA;                                 // phase of the pair sitting at the fork
  const dI = [-Math.sin(aTw), Math.cos(aTw), 0];               // lab direction of strand I's backbone at the fork
  const eAx = [-dI[1], dI[0], 0];                              // hinge axis = z × dI  (|e| = 1)
  const q = new Array(9), qm = new Array(9), Rz = new Array(9), Rt = new Array(9), Rn = new Array(9), tumble = new Array(9);
  const P = { t: 0, f: F0, Phi: 0, alpha: TILT, delta: SHIFT, zH: 0, env: 0, sep: 0 };

  function params(t) {
    P.t = t;
    P.f = forkAtTime(t);
    P.Phi = OMEGA * Math.max(0, n - 1 - P.f);
    const s = smooth01((t - tFin) / T_SEP);
    P.sep = s;
    P.alpha = TILT * (1 - s);
    P.delta = SHIFT + s * (SEP - SHIFT);
    P.zH = (P.f - (n - 1) / 2) * RISE;
    P.env = smooth01(t / 1.5) * (1 - smooth01((t - (DURATION - 2.5)) / 2));
    return P;
  }

  /** Template nucleotide frame (strand 0 or 1, pair k) under params P, into `out` {o, R}. */
  function templateInto(out, s, k, withNoise) {
    const x = k - P.f;
    const th = x <= 0 ? 0 : x >= ZONE ? 1 : smooth01(x / ZONE);
    rotZInto(Rz, k * OMEGA + P.Phi);
    if (s === 1) { Rz[1] = -Rz[1]; Rz[2] = -Rz[2]; Rz[4] = -Rz[4]; Rz[5] = -Rz[5]; Rz[7] = -Rz[7]; Rz[8] = -Rz[8]; }
    const zk = zOf(k);
    let ox = 0, oy = 0, oz = zk;
    if (th > 0) {
      const sg = s === 0 ? 1 : -1;
      axisAngle(q, eAx[0], eAx[1], 0, sg * P.alpha * th);
      const vz = zk - P.zH, ds = sg * P.delta * th;
      ox = q[2] * vz + ds * dI[0]; oy = q[5] * vz + ds * dI[1]; oz = P.zH + q[8] * vz;
      mulMM(Rt, q, Rz);
      for (let i = 0; i < 9; i++) Rz[i] = Rt[i];
    }
    if (withNoise && P.env > 0) {
      const c0 = s * 6, e = P.env;
      ox += e * NOISE_POS * noise.at(c0, P.t, k); oy += e * NOISE_POS * noise.at(c0 + 1, P.t, k); oz += e * NOISE_POS * noise.at(c0 + 2, P.t, k);
      expMap(Rn, e * NOISE_ROT * noise.at(c0 + 3, P.t, k), e * NOISE_ROT * noise.at(c0 + 4, P.t, k), e * NOISE_ROT * noise.at(c0 + 5, P.t, k));
      mulMM(Rt, Rn, Rz);
      for (let i = 0; i < 9; i++) Rz[i] = Rt[i];
    }
    out.o[0] = ox; out.o[1] = oy; out.o[2] = oz;
    for (let i = 0; i < 9; i++) out.R[i] = Rz[i];
    return out;
  }
  // partner frame (180° about local x) written into dst from a template frame
  function partnerInto(dst, src) {
    dst.o[0] = src.o[0]; dst.o[1] = src.o[1]; dst.o[2] = src.o[2];
    const R = src.R, D = dst.R;
    D[0] = R[0]; D[1] = -R[1]; D[2] = -R[2]; D[3] = R[3]; D[4] = -R[4]; D[5] = -R[5]; D[6] = R[6]; D[7] = -R[7]; D[8] = -R[8];
    return dst;
  }

  // flight start positions: dNTP appears ~25-30 Å from its docking site, on the side of its own backbone
  {
    const tf = blank(), df = blank();
    for (let id = 2 * n; id < 4 * n; id++) {
      const k = pairOfNuc(id) % n, ts = id < 3 * n ? 0 : 1;
      params(Math.max(0, tStart[id]));
      templateInto(tf, ts, k, false); partnerInto(df, tf);
      const yL = [df.R[1], df.R[4], df.R[7]], fl = flight[id];
      const d = [yL[0] * 0.8 + fl.rnd[0] * 0.5, yL[1] * 0.8 + fl.rnd[1] * 0.5, yL[2] * 0.8 + fl.rnd[2] * 0.5];
      const dl = Math.hypot(d[0], d[1], d[2]);
      fl.start = [df.o[0] + d[0] / dl * fl.dist, df.o[1] + d[1] / dl * fl.dist, df.o[2] + d[2] / dl * fl.dist];
    }
  }

  // ============================================================================ blobs & captions
  const blobObjs = {};
  for (const [id, d] of Object.entries(BLOB_DEF)) blobObjs[id] = { id, pos: [0, 0, 0], radius: d.radius, color: d.color, label: d.label, opacity: 0 };
  const blobs = [];
  const BLOB_ALPHA = 0.4;
  const win = (t, a, b, tin = 0.8, tout = 0.8) => smooth01((t - a) / tin) * (1 - smooth01((t - b) / tout));

  // arm axis point at (float) pair index p, plus an outward offset; sg = +1 arm I (leading), -1 arm II (lagging)
  function armPoint(out, sg, p, off) {
    axisAngle(q, eAx[0], eAx[1], 0, sg * P.alpha);
    const vz = (p - P.f) * RISE;
    out[0] = q[2] * vz + sg * P.delta * dI[0]; out[1] = q[5] * vz + sg * P.delta * dI[1]; out[2] = P.zH + q[8] * vz;
    // outward = q (sg dI) ⟂ arm axis
    const ox = sg * dI[0], oy = sg * dI[1];
    out[0] += off * (q[0] * ox + q[1] * oy); out[1] += off * (q[3] * ox + q[4] * oy); out[2] += off * (q[6] * ox + q[7] * oy);
    return out;
  }
  const posA = [0, 0, 0], posB = [0, 0, 0];

  function setBlob(id, x, y, z, op) {
    const b = blobObjs[id];
    b.pos[0] = x; b.pos[1] = y; b.pos[2] = z; b.opacity = op;
    if (op > 0.004) blobs.push(b);
  }
  const dntp = b => ({ A: 'dATP', T: 'dTTP', G: 'dGTP', C: 'dCTP' })[b] || 'dNTP';

  function updateBlobs(t) {
    blobs.length = 0;
    // helicase: rides the fork
    const hOp = win(t, 0.3, T_UNWIND_END + 0.3, 1.6, 1.8) * BLOB_ALPHA;
    setBlob('helicase', 0, 0, P.zH - 2.5, hOp);
    // leading polymerase: follows the helicase on arm I
    {
      const tA = tStart[nucId(2, n - 1)] - 0.5, tB = tLeadDone + 0.6;
      const p = clamp(P.f + LAG_LEAD, 0, n - 1);
      armPoint(posA, 1, p, 5);
      setBlob('pol-leading', posA[0], posA[1], posA[2], win(t, tA, tB, 1.2, 1.2) * BLOB_ALPHA);
    }
    // lagging polymerase: parks near the fork on arm II, travels to each fragment, walks away from the fork
    {
      armPoint(posB, -1, clamp(P.f + 7.5, 0, n - 1), 5);
      let wgt = 0, px = posB[0], py = posB[1], pz = posB[2];
      for (const fr of frags) {
        const tA = fr.tFirst - FLIGHT * 0.5, tB = fr.tDone + 0.2;
        const w = smooth01((t - (tA - 1.0)) / 1.0) * (1 - smooth01((t - tB) / 1.4));
        if (w <= 0) continue;
        // walking position: the pair being added (float), eased between docks
        let p = fr.lo;
        for (let i = 0; i < fr.size; i++) {
          const a = tDock[nucId(3, fr.lo + i)];
          if (t >= a) p = fr.lo + i + (i + 1 < fr.size ? smooth01((t - a) / (tDock[nucId(3, fr.lo + i + 1)] - a)) : 0);
        }
        armPoint(posA, -1, p, 5);
        wgt = w; px = posB[0] + (posA[0] - posB[0]) * w; py = posB[1] + (posA[1] - posB[1]) * w; pz = posB[2] + (posA[2] - posB[2]) * w;
        break;
      }
      const tA = frags[0].tFirst - FLIGHT - 0.5, tB = frags[nFrag - 1].tDone + 0.8;
      setBlob('pol-lagging', px, py, pz, win(t, tA, tB, 1.2, 1.2) * BLOB_ALPHA);
    }
    // primase: leading primer, then each lagging fragment's primer
    {
      let op = 0;
      const lj0 = tStart[nucId(2, n - 1)], lj1 = tDock[nucId(2, n - leadPl)] + 0.8;
      let pos = null;
      if (t > lj0 - 1 && t < lj1 + 1) { armPoint(posA, 1, n - 1 - (leadPl - 1) / 2, 6); pos = posA; op = win(t, lj0, lj1, 0.8, 0.8); }
      for (const fr of frags) {
        const a = fr.tFirst - FLIGHT * 0.7, b = tDock[nucId(3, fr.lo + fr.pl - 1)] + 0.7;
        if (t > a - 1 && t < b + 1) { armPoint(posB, -1, fr.lo + (fr.pl - 1) / 2, 6.5); pos = posB; op = Math.max(op, win(t, a, b, 0.8, 0.8)); }
      }
      if (pos) setBlob('primase', pos[0], pos[1], pos[2], op * BLOB_ALPHA);
    }
    // ligase at each nick
    for (const fr of frags) {
      if (!Number.isFinite(fr.tLig)) continue;
      const a = fr.tSwap + 0.5, b = fr.tLig + 0.9;
      if (t > a - 1 && t < b + 1) {
        armPoint(posA, -1, fr.hi + 0.5, 6);
        setBlob('ligase', posA[0], posA[1], posA[2], win(t, a, b, 0.7, 0.8) * BLOB_ALPHA);
        break;
      }
    }
  }

  // episodes drive phase + caption (the episode that started last among those active wins)
  const episodes = [];
  const ep = (t0, t1, phase, text) => episodes.push({ t0, t1, phase, text });
  // Captions describe what is on screen: the helix axis is vertical, the fork starts at the TOP end
  // and helicase moves DOWN the helix.
  ep(0, INTRO, 'initiation', 'Replication starts at an origin: helicase, a ring-shaped motor protein, loads onto the top end of the parent duplex. Powered by ATP, it will move down the helix.');
  const unwindText = 'Helicase moves down the helix, breaking the hydrogen bonds one base pair at a time and opening a Y-shaped fork. The duplex below must turn 34.3° per pair opened; topoisomerase relieves the strain.';
  ep(INTRO, T_UNWIND_END, 'unwinding', unwindText);
  ep(T_UNWIND_END, tTerm, 'termination', 'Helicase has reached the bottom end and the parental strands are fully apart; the polymerases add the last nucleotides.');
  ep(tStart[nucId(2, n - 1)], tLeadDone, 'leading', null);            // text built dynamically
  ep(tStart[nucId(2, n - 1)] - 0.2, tDock[nucId(2, n - leadPl)] + T_HB + 0.5, 'priming',
    `Primase starts the leading strand with a short RNA primer (${leadPl} nucleotides, shown in pink): DNA polymerase can only extend an existing 3′ end, it cannot start a chain.`);
  for (const fr of frags) {
    ep(fr.tFirst - FLIGHT, tDock[nucId(3, fr.lo + fr.pl - 1)] + T_HB + 0.3, 'priming',
      `The lagging template runs 5′→3′ toward the fork, so it is copied backwards in short pieces: primase lays an RNA primer (${fr.pl} nucleotides, pink) to start Okazaki fragment ${fr.f + 1}.`);
    ep(tDock[nucId(3, fr.lo + fr.pl - 1)] + 0.2, fr.tDone, 'lagging', null);
    if (Number.isFinite(fr.tSwap)) {
      ep(fr.tSwap - 0.1, fr.tSwap + 0.95, 'primer-removal',
        `Okazaki fragment ${fr.f + 1} has reached the primer of fragment ${fr.f}: the RNA primer is removed (RNase H and DNA polymerase I in bacteria, FEN1 in eukaryotes) and the gap filled with DNA.`);
      ep(fr.tSwap + 0.95, fr.tLig + 1.2, 'ligation',
        `DNA ligase seals the nick between Okazaki fragments ${fr.f + 1} and ${fr.f} with a new phosphodiester bond, using ATP (NAD⁺ in bacteria).`);
    }
  }
  ep(tTerm, tFin, 'termination', 'The last RNA primers, at the 5′ ends of the new strands, are replaced with DNA so every new strand is continuous. (Real chromosome ends need telomerase.)');
  ep(tFin, DURATION - T_HOLD, 'separation', 'Two identical daughter duplexes move apart. Each keeps one old (parental) strand and one new strand: semi-conservative replication (Meselson & Stahl, 1958).');
  ep(DURATION - T_HOLD, Infinity, 'complete', 'Replication complete: both daughter duplexes are fully paired and every backbone bond is sealed. Each is half old, half new.');

  const activeIn = (strand, t) => {              // dNTP currently arriving on a daughter strand
    let best = -1, bt = -Infinity;
    for (let k = 0; k < n; k++) {
      const id = nucId(strand, k);
      if (t >= tStart[id] && t <= tDock[id] + T_HB && tStart[id] > bt) { bt = tStart[id]; best = id; }
    }
    return best;
  };
  function describeArrival(id, t) {
    const nu = nuc[id], k = pairOfNuc(id) % n, tmpl = nuc[id < 3 * n ? 2 * k : 2 * k + 1];
    const hb = tmpl.base === 'G' || tmpl.base === 'C' ? 3 : 2;
    const stage = t < tDock[id] ? 'approaches' : t < tDock[id] + T_HB ? 'forms' : 'is joined';
    if (t < tDock[id]) return `${dntp(nu.base)} diffuses in and ${stage} template ${tmpl.base}.`;
    return `${dntp(nu.base)} pairs with template ${tmpl.base} (${hb} H-bonds) and is joined to the chain, releasing pyrophosphate.`;
  }
  function captionAt(t) {
    let best = null;
    for (const e of episodes) if (t >= e.t0 && t < e.t1 && (!best || e.t0 >= best.t0)) best = e;
    if (!best) return { phase: 'complete', text: episodes[episodes.length - 1].text };
    if (best.text) return { phase: best.phase, text: best.text };
    if (best.phase === 'leading') {
      if (t < T_UNWIND_END && (t - INTRO) % 9 < 2.6) return { phase: 'unwinding', text: unwindText };
      const id = activeIn(2, t);
      return { phase: 'leading', text: 'Leading strand: its template runs 3′→5′ toward the fork, so polymerase follows helicase down and copies it continuously, 5′→3′. ' + (id >= 0 ? describeArrival(id, t) : 'Each new nucleotide is added to the 3′ end of the chain.') };
    }
    const id = activeIn(3, t);
    const fr = frags.find(f => t >= f.tFirst - FLIGHT && t <= f.tDone + 0.5) || frags[id >= 0 ? fragOf[pairOfNuc(id) % n] : 0];
    return { phase: 'lagging', text: `Lagging strand: polymerase extends Okazaki fragment ${fr.f + 1} in the 5′→3′ direction, away from the fork (upward). ` + (id >= 0 ? describeArrival(id, t) : '') };
  }

  // ============================================================================ state
  const state = {
    t: 0, progress: 0, playing: false, finished: false,
    forkPair: n - 1, unwound: 0, leadingCount: 0, laggingCount: 0,
    fragments: frags.map(fr => ({ start: fr.lo, end: fr.hi, primed: false, complete: false, ligated: false })),
    phase: 'initiation', caption: '', jitter: 0.2, speed: speedV,
    legend: { leadingTemplate: 0, laggingTemplate: 1, leadingDaughter: 2, laggingDaughter: 3, forkDirection: '-z', origin: '+z end (pair n-1)', primerLength: { leading: leadPl, lagging: frags.map(f => f.pl) } },
  };

  // ============================================================================ apply(t): the pure function
  const df = blank();
  let tNow = 0, dirty = true, disposed = false;
  function apply(t) {
    params(t);
    // template (parental) strands, daughters
    for (let k = 0; k < n; k++) {
      for (let s = 0; s < 2; s++) {
        const nu = nuc[2 * k + s];
        templateInto(nu.frame, s, k, true);
        // daughter partner of this template
        const did = s === 0 ? nucId(2, k) : nucId(3, k), dn = nuc[did];
        partnerInto(df, nu.frame);
        placeDaughter(dn, did, df, t);
      }
    }
    // parental pair strengths, template<->daughter pair strengths, links, tags
    for (let k = 0; k < n; k++) {
      const x = k - P.f;
      asm.pairs[k].strength = 1 - smooth01((x + 1.2) / 1.4);
      for (let s = 0; s < 2; s++) {
        const did = s === 0 ? nucId(2, k) : nucId(3, k);
        const pr = asm.pairs[(s === 0 ? n : 2 * n) + k];
        pr.strength = t >= tDock[did] ? smooth01((t - tDock[did]) / T_HB) : 0;
        const tn = nuc[2 * k + s];
        tn.pair = asm.pairs[k].strength > 0 ? k : pr.strength > 0 || t >= tDock[did] ? pr.id : -1;
      }
    }
    for (let l = 0; l < asm.links.length; l++) asm.links[l].active = t >= linkTime[l];
    asm.updatePositions();

    // state
    state.t = t; state.progress = clamp(t / DURATION, 0, 1);
    state.finished = t >= DURATION - 1e-9;
    state.forkPair = clamp(P.f, 0, n - 1);
    let unw = 0;
    for (let k = 0; k < n; k++) if (asm.pairs[k].strength < 0.01) unw++;
    state.unwound = unw;
    let lc = 0, gc = 0;
    for (let k = 0; k < n; k++) { if (t >= tDock[nucId(2, k)]) lc++; if (t >= tDock[nucId(3, k)]) gc++; }
    state.leadingCount = lc; state.laggingCount = gc;
    for (const fr of frags) {
      const so = state.fragments[fr.f];
      so.primed = t >= tDock[nucId(3, fr.lo)];
      so.complete = t >= fr.tDone;
      so.ligated = fr.f === 0 ? t >= fr.tDone : t >= fr.tLig;
    }
    const c = captionAt(t);
    state.phase = c.phase; state.caption = c.text;
    state.jitter = 0.2 * P.env;
    updateBlobs(t);
    tNow = t; dirty = false;
  }

  function placeDaughter(dn, id, target, t) {
    const ts = tStart[id], td = tDock[id];
    const F = dn.frame;
    // primer tag + replacement dip
    let dip = 0;
    if (primerOf[id] >= 0) {
      dn.tag = t < tClear[id] ? 'primer' : '';
      const u = (t - tDip0[id]) / 1.4;
      if (u > 0 && u < 1) dip = 0.45 * Math.sin(Math.PI * u) ** 2;
    } else dn.tag = '';
    if (t < ts) {
      dn.visible = false; dn.opacity = 0;
      F.o[0] = target.o[0]; F.o[1] = target.o[1]; F.o[2] = target.o[2];
      for (let i = 0; i < 9; i++) F.R[i] = target.R[i];
      return;
    }
    dn.visible = true;
    const u = clamp((t - ts) / (td - ts), 0, 1);
    if (u >= 1) {
      F.o[0] = target.o[0]; F.o[1] = target.o[1]; F.o[2] = target.o[2];
      for (let i = 0; i < 9; i++) F.R[i] = target.R[i];
      dn.opacity = 1 - dip;
      return;
    }
    const fl = flight[id], e = smootherstep(u), s0 = fl.start;
    // curved path: straight blend + sideways bulge perpendicular to the approach direction
    const dx = target.o[0] - s0[0], dy = target.o[1] - s0[1], dz = target.o[2] - s0[2];
    const dl = Math.hypot(dx, dy, dz) || 1, ux = dx / dl, uy = dy / dl, uz = dz / dl;
    let bx = fl.bd[0], by = fl.bd[1], bz = fl.bd[2];
    const bp = bx * ux + by * uy + bz * uz; bx -= bp * ux; by -= bp * uy; bz -= bp * uz;
    const bl = Math.hypot(bx, by, bz) || 1;
    const bulge = fl.bulge * Math.sin(Math.PI * e) / bl;
    F.o[0] = s0[0] + dx * e + bx * bulge; F.o[1] = s0[1] + dy * e + by * bulge; F.o[2] = s0[2] + dz * e + bz * bulge;
    const rem = (1 - e) * (1 - e);
    axisAngle(tumble, fl.axis[0], fl.axis[1], fl.axis[2], fl.spin * rem);
    mulMM(Rt, tumble, target.R);
    for (let i = 0; i < 9; i++) F.R[i] = Rt[i];
    dn.opacity = smooth01(u / 0.25) * (1 - dip);
  }

  // ============================================================================ public API
  const sim = {
    assembly: asm, state, blobs, duration: DURATION,
    get speed() { return speedV; },
    set speed(v) { if (Number.isFinite(v) && v > 0) { speedV = v; state.speed = v; } },
    get playing() { return state.playing; },
    layout: { forkPlane: { inPlane: dI.slice(), normal: eAx.slice() }, n, sequence: seq, leadingTemplate: 0, laggingTemplate: 1, leadingDaughter: 2, laggingDaughter: 3, fork: '+z end -> -z', fragments: frags.map(f => ({ start: f.lo, end: f.hi, primerLength: f.pl })) },
    /** nucleotide id of the nucleotide of `strand` (0..3) that belongs to pair index k (0 = -z end). */
    nucleotideAt: nucId,
    /** pair index k (0..n-1, 0 at the -z end) of any nucleotide id */
    pairIndexOf: id => pairOfNuc(id) % n,
    /** id of the parental base pair k (equal to k). */
    parentalPairOf: k => k,
    /** id of the template-daughter pair containing nucleotide `nucId` (template or daughter), -1 if none. */
    daughterPairOf(id) {
      if (id < 0 || id >= nuc.length) return -1;
      if (id < 2 * n) return (id & 1 ? 2 * n : n) + (id >> 1);
      return pairOfNuc(id);
    },
    seek(progress) {
      if (disposed) return;
      const p = clamp(Number.isFinite(progress) ? progress : 0, 0, 1);
      apply(p * DURATION);
    },
    play() {
      if (disposed) return;
      if (state.finished) apply(0);
      state.playing = true; state.finished = false;
    },
    pause() { state.playing = false; },
    update(dt) {
      if (disposed) return;
      if (state.playing && dt > 0) {
        const t = Math.min(DURATION, tNow + dt * speedV);
        apply(t);
        if (t >= DURATION) { state.playing = false; state.finished = true; }
      } else if (dirty) apply(tNow);
    },
    dispose() { disposed = true; blobs.length = 0; },
  };
  apply(0);
  return sim;
}
