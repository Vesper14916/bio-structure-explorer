// Bacterial gene-expression simulation: transcription (DNA -> mRNA) and translation (mRNA -> polypeptide).
//
// The entire 3D configuration (parental DNA duplex frames & transcription bubble, mRNA ribonucleotide
// frames & RNA·DNA hybrid H-bonds, tRNA anticodon triplets & codon-anticodon H-bonds, nascent polypeptide
// Cα residue positions, and macromolecular envelopes for RNAP, 30S/50S ribosomal subunits, tRNAs, and RF1)
// is a PURE DETERMINISTIC FUNCTION of timeline time t (and progress = t / duration).
// Calling seek(progress) forward or backward to any progress in [0, 1] reproduces identical Float32Array
// atom coordinates, residue positions, blob transforms, and state metadata.

import * as Science from '../science/index.js';
import { Assembly, idealPairFrame, nucleotideTemplate } from '../science/assembly.js';
import { BASE_ATOMS, BASE_BONDS, BACKBONE_BONDS, WC_HBONDS } from '../science/bases.js';
import { HELIX_B, BACKBONE } from '../science/templates.js';
import {
  mulberry32, clamp, lerp, smoothstep, smootherstep, createNoise, DEG,
  mulMM, axisAngle, expMap, rotZInto, rotXInto, rotYInto, slerpMat, newFrame, copyFrame,
} from './util.js';

// ----------------------------------------------------------------------------------------- fallbacks & constants
const RISE_B = HELIX_B.rise;
const OMEGA_B = HELIX_B.twistDeg * DEG;

const HELIX_A = Science.HELIX_A || {
  rise: 2.81,
  twistDeg: 32.72727272727273,
  bpPerTurn: 11.0,
  xDisp: -4.4,
  inclinationDeg: 16.0,
};
const RISE_A = HELIX_A.rise || 2.81;
const OMEGA_A = (HELIX_A.twistDeg || 32.72727272727273) * DEG;

// Ensure Uracil (U) and RNA ribose (2'-OH) work even if js/science/* is still mid-flight:
const FALLBACK_U_ATOMS = [
  ["C1'", 'C', -2.481, 5.354], ['N1', 'N', -1.284, 4.500], ['C2', 'C', -1.462, 3.135],
  ['O2', 'O', -2.562, 2.608], ['N3', 'N', -0.298, 2.407], ['C4', 'C', 0.994, 2.897],
  ['O4', 'O', 1.944, 2.119], ['C5', 'C', 1.106, 4.338], ['C6', 'C', -0.024, 5.057],
];
const FALLBACK_U_BONDS = [
  ["C1'", 'N1'], ['N1', 'C2'], ['C2', 'O2'], ['C2', 'N3'], ['N3', 'C4'], ['C4', 'O4'],
  ['C4', 'C5'], ['C5', 'C6'], ['C6', 'N1'],
];
const FALLBACK_HBONDS = {
  AT: [['N6', 'O4', 0], ['N1', 'N3', 1]],
  TA: [['O4', 'N6', 1], ['N3', 'N1', 0]],
  AU: [['N6', 'O4', 0], ['N1', 'N3', 1]],
  UA: [['O4', 'N6', 1], ['N3', 'N1', 0]],
  GC: [['O6', 'N4', 1], ['N1', 'N3', 0], ['N2', 'O2', 0]],
  CG: [['N4', 'O6', 0], ['N3', 'N1', 1], ['O2', 'N2', 1]],
  GU: [['O6', 'N3', 1], ['N1', 'O2', 0]],
  UG: [['N3', 'O6', 0], ['O2', 'N1', 1]],
};

const BB_RNA_ORDER = ['P', 'OP1', 'OP2', "O5'", "C5'", "C4'", "O4'", "C3'", "O3'", "C2'", "O2'"];
const BB_ELEMENT = n => (n === 'P' ? 'P' : n[0]);
const partOf = n => (['P', 'OP1', 'OP2', "O5'"].includes(n) ? 2 : n.includes("'") ? 1 : 0);

const rnaTplCache = {};
function getRnaTemplate(base) {
  try {
    const t = nucleotideTemplate(base, 'ribose');
    if (t && t.names && t.names.includes("O2'")) return t;
  } catch (_) { /* fallback below */ }
  if (rnaTplCache[base]) return rnaTplCache[base];
  const bbRna = Science.BACKBONE_RNA || {
    ...BACKBONE,
    "O2'": [-1.252, 7.184, 1.488], // 1.413 Å from C2' in ribose pucker
  };
  const bAtoms = BASE_ATOMS[base] || (base === 'U' ? FALLBACK_U_ATOMS : BASE_ATOMS.T);
  const bBonds = BASE_BONDS[base] || (base === 'U' ? FALLBACK_U_BONDS : BASE_BONDS.T);
  const names = [], el = [], xyz = [];
  for (const n of BB_RNA_ORDER) {
    names.push(n); el.push(BB_ELEMENT(n)); xyz.push(...(bbRna[n] || [0, 0, 0]));
  }
  for (const [n, e, x, y] of bAtoms) {
    names.push(n); el.push(e); xyz.push(x, y, 0);
  }
  const index = Object.fromEntries(names.map((n, i) => [n, i]));
  const bbBonds = [...BACKBONE_BONDS, ["C2'", "O2'"]];
  const bonds = [...bbBonds, ...bBonds].map(([a, b]) => [index[a], index[b]]);
  return (rnaTplCache[base] = {
    base, sugar: 'ribose', names, el, part: names.map(partOf),
    local: Float32Array.from(xyz), bonds, index,
  });
}

function addNucSafe(asm, spec) {
  const isRna = spec.sugar === 'ribose' || spec.base === 'U';
  let extra = {};
  if (isRna) {
    const tpl = getRnaTemplate(spec.base);
    extra = { names: tpl.names, el: tpl.el, local: tpl.local, bonds: tpl.bonds };
  }
  const nuc = asm.addNucleotide({ ...spec, ...extra });
  nuc.sugar = isRna ? 'ribose' : (spec.sugar || 'deoxyribose');
  nuc.codon = spec.codon !== undefined ? spec.codon : -1;
  nuc.role = spec.role || '';
  return nuc;
}

function addPairSafe(asm, a, b, strength = 0) {
  const type = a.base + b.base;
  if (WC_HBONDS && WC_HBONDS[type]) {
    return asm.addPair(a, b, strength);
  }
  const hbDef = FALLBACK_HBONDS[type] || FALLBACK_HBONDS.AU;
  const p = {
    id: asm.pairs.length, a: a.id, b: b.id, type, strength,
    hbonds: hbDef.map(([x, y, d]) => ({ an: x, bn: y, donor: d })),
  };
  a.pair = b.pair = p.id;
  asm.pairs.push(p);
  return p;
}

// ----------------------------------------------------------------------------------------- genetic code & construct
const DNA_COMP = { A: 'T', T: 'A', G: 'C', C: 'G' };
const RNA_COMP = { A: 'U', T: 'A', U: 'A', G: 'C', C: 'G' };

const AA_META = {
  fMet: { code1: 'M', code3: 'fMet', name: 'N-Formylmethionine', kind: 'initiator', color: 0xffd43b },
  Met:  { code1: 'M', code3: 'Met',  name: 'Methionine',         kind: 'nonpolar',  color: 0xffd43b },
  Ala:  { code1: 'A', code3: 'Ala',  name: 'Alanine',            kind: 'nonpolar',  color: 0x74c0fc },
  Glu:  { code1: 'E', code3: 'Glu',  name: 'Glutamate',          kind: 'negative',  color: 0xff6b6b },
  Phe:  { code1: 'F', code3: 'Phe',  name: 'Phenylalanine',      kind: 'aromatic',  color: 0xb197fc },
  Lys:  { code1: 'K', code3: 'Lys',  name: 'Lysine',             kind: 'positive',  color: 0x4dabf7 },
  Gly:  { code1: 'G', code3: 'Gly',  name: 'Glycine',            kind: 'nonpolar',  color: 0x96f2d7 },
  Ser:  { code1: 'S', code3: 'Ser',  name: 'Serine',             kind: 'polar',     color: 0x63e6be },
  Asp:  { code1: 'D', code3: 'Asp',  name: 'Aspartate',          kind: 'negative',  color: 0xff8787 },
  Tyr:  { code1: 'Y', code3: 'Tyr',  name: 'Tyrosine',           kind: 'aromatic',  color: 0xda77f2 },
  Gln:  { code1: 'Q', code3: 'Gln',  name: 'Glutamine',          kind: 'polar',     color: 0x38d9a9 },
  Leu:  { code1: 'L', code3: 'Leu',  name: 'Leucine',            kind: 'nonpolar',  color: 0x74c0fc },
  Ile:  { code1: 'I', code3: 'Ile',  name: 'Isoleucine',         kind: 'nonpolar',  color: 0x74c0fc },
  Val:  { code1: 'V', code3: 'Val',  name: 'Valine',             kind: 'nonpolar',  color: 0x74c0fc },
  Pro:  { code1: 'P', code3: 'Pro',  name: 'Proline',            kind: 'nonpolar',  color: 0x74c0fc },
  Thr:  { code1: 'T', code3: 'Thr',  name: 'Threonine',          kind: 'polar',     color: 0x63e6be },
  Cys:  { code1: 'C', code3: 'Cys',  name: 'Cysteine',           kind: 'polar',     color: 0xffd43b },
  Asn:  { code1: 'N', code3: 'Asn',  name: 'Asparagine',         kind: 'polar',     color: 0x38d9a9 },
  Trp:  { code1: 'W', code3: 'Trp',  name: 'Tryptophan',         kind: 'aromatic',  color: 0xb197fc },
  His:  { code1: 'H', code3: 'His',  name: 'Histidine',          kind: 'positive',  color: 0x4dabf7 },
  Arg:  { code1: 'R', code3: 'Arg',  name: 'Arginine',           kind: 'positive',  color: 0x4dabf7 },
  Stop: { code1: '*', code3: 'Stop', name: 'Stop (RF1)',         kind: 'stop',      color: 0xff6b6b },
};

const CODON_TO_AA3 = {
  UUU: 'Phe', UUC: 'Phe', UUA: 'Leu', UUG: 'Leu',
  CUU: 'Leu', CUC: 'Leu', CUA: 'Leu', CUG: 'Leu',
  AUU: 'Ile', AUC: 'Ile', AUA: 'Ile', AUG: 'Met',
  GUU: 'Val', GUC: 'Val', GUA: 'Val', GUG: 'Val',
  UCU: 'Ser', UCC: 'Ser', UCA: 'Ser', UCG: 'Ser',
  CCU: 'Pro', CCC: 'Pro', CCA: 'Pro', CCG: 'Pro',
  ACU: 'Thr', ACC: 'Thr', ACA: 'Thr', ACG: 'Thr',
  GCU: 'Ala', GCC: 'Ala', GCA: 'Ala', GCG: 'Ala',
  UAU: 'Tyr', UAC: 'Tyr', UAA: 'Stop', UAG: 'Stop',
  CAU: 'His', CAC: 'His', CAA: 'Gln', CAG: 'Gln',
  AAU: 'Asn', AAC: 'Asn', AAA: 'Lys', AAG: 'Lys',
  GAU: 'Asp', GAC: 'Asp', GAA: 'Glu', GAG: 'Glu',
  UGU: 'Cys', UGC: 'Cys', UGA: 'Stop', UGG: 'Trp',
  CGU: 'Arg', CGC: 'Arg', CGA: 'Arg', CGG: 'Arg',
  AGU: 'Ser', AGC: 'Ser', AGA: 'Arg', AGG: 'Arg',
  GGU: 'Gly', GGC: 'Gly', GGA: 'Gly', GGG: 'Gly',
};

// Standard 48-bp bacterial construct:
// 0..4 (4 bp): Promoter -10 box (TATA)
// 4..12 (8 bp): 5' UTR (AGGAGGTA — Shine-Dalgarno AGGAGG at 4..10, spacer TA at 10..12)
// 12..45 (33 bp = 11 sense codons): ATG GCT GAA TTT AAA GGT TCT GAC TAC CAA GCT
// 45..48 (3 bp = stop codon): TAA
export const DEFAULT_EXPRESSION_DNA = 'TATAAGGAGGTAATGGCTGAATTTAAAGGTTCTGACTACCAAGGCTTAA'.length === 48
  ? 'TATAAGGAGGTAATGGCTGAATTTAAAGGTTCTGACTACCAAGGCTTAA'
  : 'TATA' + 'AGGAGGTA' + 'ATGGCTGAATTTAAAGGTTCTGACTACCAAGCTTAA';

function buildConstructMeta(customConstruct) {
  if (customConstruct && customConstruct.codingDna && Array.isArray(customConstruct.codons)) {
    return customConstruct;
  }
  const codingDna = (customConstruct && typeof customConstruct.codingDna === 'string')
    ? customConstruct.codingDna.toUpperCase().replace(/[^ACGT]/g, '')
    : 'TATAAGGAGGTAATGGCTGAATTTAAAGGTTCTGACTACCAAGCTTAA';
  const nDna = codingDna.length;
  const template3to5 = [...codingDna].map(b => DNA_COMP[b]).join('');
  const template5to3 = [...template3to5].reverse().join('');
  const tssIndex = customConstruct?.tssIndex ?? 4;
  const utrLength = customConstruct?.utrLength ?? 8;
  const mrnaStartDna = tssIndex;
  const mrnaSeq = codingDna.slice(mrnaStartDna).replace(/T/g, 'U');
  const nMrna = mrnaSeq.length;
  const orfStartMrna = utrLength;
  const nCodons = Math.floor((nMrna - orfStartMrna) / 3);
  const codons = [];
  const residues = [];
  for (let c = 0; c < nCodons; c++) {
    const m0 = orfStartMrna + c * 3;
    const triplet = mrnaSeq.slice(m0, m0 + 3);
    const anticodon3to5 = [...triplet].map(b => RNA_COMP[b]).join('');
    const anticodon5to3 = [...anticodon3to5].reverse().join('');
    const rawAa = CODON_TO_AA3[triplet] || 'Ala';
    const isStop = rawAa === 'Stop';
    const isInit = c === 0 && !isStop;
    const aaKey = isInit ? 'fMet' : rawAa;
    const meta = AA_META[aaKey] || AA_META.Ala;
    const codonEntry = {
      index: c,
      number: c + 1,
      triplet,
      anticodon3to5,
      anticodon5to3,
      mrnaRange: [m0, m0 + 3],
      dnaRange: [mrnaStartDna + m0, mrnaStartDna + m0 + 3],
      aa3: meta.code3,
      aa1: meta.code1,
      aaName: meta.name,
      kind: meta.kind,
      color: meta.color,
      isInitiator: isInit,
      isStop,
    };
    codons.push(codonEntry);
    if (!isStop) {
      residues.push({
        index: residues.length,
        codonIndex: c,
        code1: meta.code1,
        code3: meta.code3,
        name: meta.name,
        kind: meta.kind,
        color: meta.color,
      });
    }
  }
  return {
    name: 'E. coli Mini-ORF Construct (48 bp)',
    length: nDna,
    codingDna,
    templateDna3to5: template3to5,
    templateDna5to3: template5to3,
    mrna: mrnaSeq,
    mrnaLength: nMrna,
    regions: {
      promoter: [0, tssIndex],
      utr5: [tssIndex, tssIndex + utrLength],
      shineDalgarno: [tssIndex, tssIndex + 6],
      spacer: [tssIndex + 6, tssIndex + utrLength],
      orf: [tssIndex + utrLength, nDna - 3],
      stop: [nDna - 3, nDna],
    },
    mrnaRegions: {
      utr5: [0, utrLength],
      shineDalgarno: [0, 6],
      spacer: [6, utrLength],
      orf: [utrLength, nMrna - 3],
      stop: [nMrna - 3, nMrna],
    },
    codons,
    residues,
    peptideSeq: residues.map((r, i) => (i === 0 ? 'fMet' : r.code1)).join('-'),
    peptideCode3: residues.map(r => r.code3).join('-'),
  };
}

/** Macromolecular complexes shown as translucent volumetric envelopes (used by the Express-mode legend). */
export const EXPRESS_BLOB_DEF = {
  rnap:           { label: 'RNA Polymerase (RNAP)',    kind: 'rnap',         radius: 15, color: 0x4fb6ff, scale: [1.15, 0.95, 1.35] },
  'ribosome-30s': { label: '30S Ribosomal Subunit',    kind: 'ribosome-30s', radius: 13, color: 0x38d9a9, scale: [1.20, 0.75, 1.10] },
  'ribosome-50s': { label: '50S Ribosomal Subunit',    kind: 'ribosome-50s', radius: 16, color: 0x63e6be, scale: [1.25, 1.05, 1.15] },
  'trna-init':    { label: 'Initiator fMet-tRNAfMet',  kind: 'trna',         radius: 6.5, color: 0xffd43b, scale: [0.75, 1.35, 0.80] },
  'trna-aa':      { label: 'Elongator aa-tRNA',        kind: 'trna',         radius: 6.5, color: 0xff922b, scale: [0.75, 1.35, 0.80] },
  rf1:            { label: 'Release Factor 1 (RF1)',   kind: 'rf1',          radius: 9,  color: 0xff6b6b, scale: [0.80, 1.20, 0.80] },
};

const smooth01 = smoothstep;
const win = (t, a, b, tin = 0.7, tout = 0.7) => smooth01((t - a) / tin) * (1 - smooth01((t - b) / tout));

// ----------------------------------------------------------------------------------------- simulation factory
export function createExpressionSim(opts = {}) {
  const { seed = 1, speed: speed0 = 1, construct: customConstruct = null } = opts;
  let speedV = Number.isFinite(speed0) && speed0 > 0 ? speed0 : 1;
  let cutawayV = Boolean(opts.cutaway ?? true);
  let cameraModeV = opts.cameraMode || 'overview';

  const construct = buildConstructMeta(customConstruct);
  const seq = construct.codingDna;
  const nDna = seq.length;                    // 48 bp
  const tss = construct.regions.promoter[1];  // 4
  const mrnaSeq = construct.mrna;             // 44 nt
  const nMrna = mrnaSeq.length;               // 44
  const utrLen = construct.mrnaRegions.utr5[1]; // 8
  const codons = construct.codons;            // 12 codons (0..10 sense, 11 stop UAA)
  const nCodons = codons.length;              // 12
  const nSense = construct.residues.length;   // 11

  const rng = mulberry32(seed);
  const z0 = -((nDna - 1) * RISE_B) / 2;
  const zOfDna = k => z0 + k * RISE_B;

  // Translation track geometry (displaced laterally in +x so ribosome has an unobstructed stage)
  const TRACK_X = 28.0;
  const TRACK_Y = -2.0;
  const TRACK_Z0 = zOfDna(tss) + 4.0;
  const zOfTrack = m => TRACK_Z0 + m * RISE_A;

  // ============================================================================ assembly (built once)
  const asm = new Assembly();
  asm.residues = [];

  const blankFrame = () => ({ o: [0, 0, 0], R: [1, 0, 0, 0, 1, 0, 0, 0, 1] });
  const dnaCoding = new Array(nDna);
  const dnaTemplate = new Array(nDna); // indexed by pair k = 0..nDna-1
  const mrnaNucs = new Array(nMrna);
  const trnaNucs = new Array(nSense * 3); // 11 sense codons * 3 anticodon ribonucleotides = 33 nt

  // 1. Parental DNA Duplex (Strands 0 and 1)
  for (let k = 0; k < nDna; k++) {
    const f = idealPairFrame(k, nDna, HELIX_B);
    const R = f.R.slice(), Rp = f.R.slice();
    Rp[1] = -Rp[1]; Rp[2] = -Rp[2]; Rp[4] = -Rp[4]; Rp[5] = -Rp[5]; Rp[7] = -Rp[7]; Rp[8] = -Rp[8];
    const cIdx = k >= tss + utrLen ? Math.floor((k - (tss + utrLen)) / 3) : -1;
    dnaCoding[k] = addNucSafe(asm, {
      base: seq[k], strand: 0, sugar: 'deoxyribose', role: 'coding', codon: cIdx,
      frame: { o: f.o.slice(), R },
    });
    dnaTemplate[k] = addNucSafe(asm, {
      base: DNA_COMP[seq[k]], strand: 1, sugar: 'deoxyribose', role: 'template', codon: cIdx,
      frame: { o: f.o.slice(), R: Rp },
    });
    addPairSafe(asm, dnaCoding[k], dnaTemplate[k], 1); // pair id 0..nDna-1
  }
  asm.strands[1].reverse(); // store template strand 5'->3'
  dnaTemplate.forEach((nu, k) => { nu.index = nDna - 1 - k; });
  for (let k = 0; k + 1 < nDna; k++) {
    asm.addLink(dnaCoding[k], dnaCoding[k + 1], true);
    asm.addLink(dnaTemplate[k + 1], dnaTemplate[k], true);
  }

  // 2. mRNA Transcript (Strand 2, 44 nt, sugar: 'ribose', role: 'mrna')
  for (let m = 0; m < nMrna; m++) {
    const cIdx = m >= utrLen ? Math.floor((m - utrLen) / 3) : -1;
    mrnaNucs[m] = addNucSafe(asm, {
      base: mrnaSeq[m], strand: 2, sugar: 'ribose', role: 'mrna', codon: cIdx,
      frame: blankFrame(),
    });
    mrnaNucs[m].visible = false;
    mrnaNucs[m].opacity = 0;
  }
  const mrnaLink0 = asm.links.length;
  for (let m = 0; m + 1 < nMrna; m++) {
    asm.addLink(mrnaNucs[m], mrnaNucs[m + 1], false);
  }
  const hybridPair0 = asm.pairs.length;
  for (let m = 0; m < nMrna; m++) {
    const k = tss + m;
    addPairSafe(asm, dnaTemplate[k], mrnaNucs[m], 0); // pair id nDna + m
  }

  // 3. tRNA Anticodon Triplets (Strand 3, 11 * 3 = 33 nt, sugar: 'ribose', role: 'trna')
  // Stored in 5'->3' order for each tRNA carrier; base-paired antiparallel to mRNA codon m0..m0+2.
  const trnaLink0 = asm.links.length;
  const codonPair0 = asm.pairs.length;
  for (let c = 0; c < nSense; c++) {
    const cod = codons[c];
    // cod.anticodon3to5[j] pairs with mRNA codon position j (j = 0, 1, 2)
    // In 5'->3' chemical order of tRNA anticodon loop, index 0 is 5' (pairs with j=2), index 2 is 3' (pairs with j=0).
    // For clarity of codon-anticodon indexing, we create the 3 nucleotides for j=0,1,2 and link 5'->3' (j=2 -> j=1 -> j=0):
    for (let j = 0; j < 3; j++) {
      const antiBase = cod.anticodon3to5[j];
      const tn = addNucSafe(asm, {
        base: antiBase, strand: 3, sugar: 'ribose', role: 'trna', codon: c,
        frame: blankFrame(),
      });
      tn.visible = false;
      tn.opacity = 0;
      tn.tag = c === 0 ? 'trna-init' : 'trna-aa';
      trnaNucs[c * 3 + j] = tn;
    }
    // 5'->3' phosphodiester links inside the anticodon triplet (j=2 -> j=1 -> j=0)
    asm.addLink(trnaNucs[c * 3 + 2], trnaNucs[c * 3 + 1], false);
    asm.addLink(trnaNucs[c * 3 + 1], trnaNucs[c * 3 + 0], false);
    // 3 codon-anticodon base pairs (mRNA nucleotide m0+j <-> tRNA nucleotide c*3+j)
    const m0 = cod.mrnaRange[0];
    for (let j = 0; j < 3; j++) {
      addPairSafe(asm, mrnaNucs[m0 + j], trnaNucs[c * 3 + j], 0);
    }
  }

  // Restore initial parental pair indices on DNA nucleotides
  for (let k = 0; k < nDna; k++) {
    dnaCoding[k].pair = k;
    dnaTemplate[k].pair = k;
  }

  // 4. Nascent Polypeptide Chain (11 Cα residues on asm.residues)
  for (let c = 0; c < nSense; c++) {
    const rMeta = construct.residues[c];
    asm.residues.push({
      id: c,
      index: c,
      code1: rMeta.code1,
      code3: rMeta.code3,
      name: rMeta.name,
      kind: rMeta.kind,
      color: rMeta.color,
      codonIndex: c,
      pos: [0, 0, 0],
      radius: 1.9,
      visible: false,
      opacity: 0,
      peptideBondActive: false,
    });
  }

  asm.meta = {
    kind: 'expression',
    sequence: seq,
    length: nDna,
    helix: HELIX_B,
    rnaHelix: HELIX_A,
    construct,
    axis: [[0, 0, z0], [0, 0, -z0]],
  };
  asm.finalize();

  // ============================================================================ timeline schedule
  // Phase 1: Promoter binding & open complex formation (0 .. T_PROM_END)
  const T_PROM_END = 3.2;

  // Phase 2: Transcription elongation (T_PROM_END .. T_TX_END)
  const SEC_PER_NT = 0.34;
  const FLIGHT_RNA = 1.4;
  const T_HB_RNA = 0.32;
  const T_LINK_RNA = 0.12;
  const HYBRID_WINDOW = 8.5;   // ~8-9 bp RNA·DNA hybrid inside RNAP
  const BUBBLE_HALF = 6.2;     // ±6 bp transcription bubble around RNAP active site

  const tMrnaDock = new Float64Array(nMrna);
  const tMrnaStart = new Float64Array(nMrna);
  const tMrnaLink = new Float64Array(nMrna);
  for (let m = 0; m < nMrna; m++) {
    tMrnaDock[m] = T_PROM_END + (m + 0.5) * SEC_PER_NT;
    tMrnaStart[m] = tMrnaDock[m] - FLIGHT_RNA;
    tMrnaLink[m] = tMrnaDock[m] + T_HB_RNA + T_LINK_RNA;
  }
  const T_TX_LAST_DOCK = tMrnaDock[nMrna - 1];
  const T_TX_CLEAR = T_TX_LAST_DOCK + 3.0; // RNAP slides off 3' end, hybrid fully peels onto translation track

  // Phase 3: Translation initiation (starts once 5' UTR + AUG have emerged onto the translation track,
  // or right as transcription finishes peeling the 5' region; we schedule initiation cleanly at T_INIT_START
  // so students can follow transcription -> initiation -> elongation -> termination with zero visual clutter).
  const T_INIT_START = T_TX_LAST_DOCK + 1.2;
  const T_30S_DOCK = T_INIT_START + 1.0;
  const T_FMET_DOCK = T_INIT_START + 2.2;
  const T_50S_JOIN = T_INIT_START + 3.4;
  const T_INIT_END = T_INIT_START + 4.2;

  // Phase 4: Ribosome codon-by-codon elongation (codons c = 1..10)
  const STEP_CODON = 2.0;      // 2.0 s per elongation cycle: A-site arrival (0.8s) -> peptide bond (0.4s) -> translocation (0.8s)
  const T_ELONG_START = T_INIT_END;
  const codonSched = new Array(nSense);
  codonSched[0] = {
    tArrive: T_INIT_START + 0.9,
    tDock: T_FMET_DOCK,
    tPeptide: T_50S_JOIN,
    tTransStart: T_INIT_END,
    tTransEnd: T_INIT_END,
  };
  for (let c = 1; c < nSense; c++) {
    const t0 = T_ELONG_START + (c - 1) * STEP_CODON;
    codonSched[c] = {
      tArrive: t0,
      tDock: t0 + 0.75,
      tPeptide: t0 + 1.15,
      tTransStart: t0 + 1.25,
      tTransEnd: t0 + STEP_CODON,
    };
  }
  const T_ELONG_END = T_ELONG_START + (nSense - 1) * STEP_CODON;

  // Phase 5: Termination at Stop Codon UAA (codon c = 11)
  const T_TERM_START = T_ELONG_END;
  const T_RF1_DOCK = T_TERM_START + 1.1;
  const T_HYDROLYSIS = T_TERM_START + 2.0;
  const T_DISSOC_END = T_TERM_START + 3.8;
  const T_HOLD = 1.4;
  const DURATION = T_DISSOC_END + T_HOLD;

  // ============================================================================ deterministic noise & flights
  const noise = createNoise(rng, 18, { fMin: 0.35, fMax: 1.1, gMax: 1 / 12, waves: 2 });
  const rnaFlight = new Array(nMrna);
  for (let m = 0; m < nMrna; m++) {
    const angle = (rng() * 0.9 - 0.45) + (m % 2 ? 0.4 : -0.4);
    const dist = 23 + 4 * rng();
    const ax = [rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1], al = Math.hypot(...ax) || 1;
    rnaFlight[m] = {
      offset: [Math.cos(angle) * dist, ( Math.sin(angle) * 0.7 + 0.4 ) * dist, (rng() - 0.5) * 8],
      bulge: [0, (rng() < 0.5 ? 1 : -1) * (5 + 3 * rng()), (rng() - 0.5) * 4],
      axis: ax.map(v => v / al),
      spin: (rng() < 0.5 ? -1 : 1) * (2.8 + 1.8 * rng()),
    };
  }

  const trnaFlight = new Array(nSense);
  for (let c = 0; c < nSense; c++) {
    const ax = [rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1], al = Math.hypot(...ax) || 1;
    trnaFlight[c] = {
      entryOffset: [16 + 3 * rng(), 14 + 3 * rng(), 8 + 2 * rng()],
      exitOffset: [-14 - 3 * rng(), 12 + 3 * rng(), -10 - 2 * rng()],
      axis: ax.map(v => v / al),
      spin: (rng() < 0.5 ? -1 : 1) * (1.6 + 0.8 * rng()),
    };
  }

  // ============================================================================ helper functions for geometry
  const Rz = new Array(9), Rx = new Array(9), Ry = new Array(9), Rt = new Array(9), Rn = new Array(9), Rbow = new Array(9);
  const NOISE_POS = 0.10, NOISE_ROT = 0.012;

  // RNAP center position along DNA index (0..nDna+6)
  function rnapDnaIndexAt(t) {
    if (t <= T_PROM_END) {
      // Docks onto -10 promoter (dnaIdx 2 -> 4)
      return lerp(1.5, tss, smooth01(t / T_PROM_END));
    }
    if (t <= T_TX_LAST_DOCK) {
      const u = (t - T_PROM_END) / (T_TX_LAST_DOCK - T_PROM_END);
      return lerp(tss, nDna - 1, u);
    }
    const uAfter = clamp((t - T_TX_LAST_DOCK) / (T_TX_CLEAR - T_TX_LAST_DOCK), 0, 1);
    return lerp(nDna - 1, nDna + 9.5, smooth01(uAfter));
  }

  // Overall transcription bubble envelope (0 -> 1 at promoter open, 1 during transcription, 1 -> 0 as RNAP clears)
  function bubbleMasterAt(t) {
    const openIn = smooth01((t - 1.1) / (T_PROM_END - 1.1));
    const closeOut = 1 - smooth01((t - T_TX_LAST_DOCK - 0.3) / (T_TX_CLEAR - T_TX_LAST_DOCK - 0.3));
    return openIn * closeOut;
  }

  // Local opening weight (0 = closed B-DNA, 1 = fully open bubble) for DNA base pair k at time t
  function pairOpenWeight(k, rnapIdx, master) {
    if (master <= 0) return 0;
    // Asymmetric bell around rnapIdx - 2.5 (covers active site + ~8 bp hybrid behind RNAP + 2 bp ahead)
    const center = rnapIdx - 2.5;
    const d = k - center;
    const halfSpan = d >= 0 ? 4.2 : 6.8;
    const u = Math.abs(d) / halfSpan;
    if (u >= 1) return 0;
    return master * (1 - smooth01(u));
  }

  // Compute DNA frame for strand s (0 = coding, 1 = template) at pair k
  function dnaFrameInto(out, s, k, openW, t, env) {
    rotZInto(Rz, k * OMEGA_B);
    if (s === 1) {
      Rz[1] = -Rz[1]; Rz[2] = -Rz[2]; Rz[4] = -Rz[4]; Rz[5] = -Rz[5]; Rz[7] = -Rz[7]; Rz[8] = -Rz[8];
    }
    let ox = 0, oy = 0, oz = zOfDna(k);
    if (openW > 0) {
      // Coding strand (s=0) bows toward -x/+y; Template strand (s=1) bows toward +x/-y to meet RNAP active site
      const bowSign = s === 0 ? -1 : 1;
      const radial = 6.8 * openW;
      ox += bowSign * radial * 0.85;
      oy += -bowSign * radial * 0.52;
      // Slight base untwisting inside the bubble so template bases face the RNA·DNA hybrid cleanly
      axisAngle(Rbow, 0, 0, 1, bowSign * 0.28 * openW);
      mulMM(Rt, Rbow, Rz);
      for (let i = 0; i < 9; i++) Rz[i] = Rt[i];
    }
    if (env > 0) {
      const c0 = s * 6;
      ox += env * NOISE_POS * noise.at(c0, t, k);
      oy += env * NOISE_POS * noise.at(c0 + 1, t, k);
      oz += env * NOISE_POS * noise.at(c0 + 2, t, k);
      expMap(Rn, env * NOISE_ROT * noise.at(c0 + 3, t, k), env * NOISE_ROT * noise.at(c0 + 4, t, k), env * NOISE_ROT * noise.at(c0 + 5, t, k));
      mulMM(Rt, Rn, Rz);
      for (let i = 0; i < 9; i++) Rz[i] = Rt[i];
    }
    out.o[0] = ox; out.o[1] = oy; out.o[2] = oz;
    for (let i = 0; i < 9; i++) out.R[i] = Rz[i];
    return out;
  }

  function partnerInto(dst, src) {
    dst.o[0] = src.o[0]; dst.o[1] = src.o[1]; dst.o[2] = src.o[2];
    const R = src.R, D = dst.R;
    D[0] = R[0]; D[1] = -R[1]; D[2] = -R[2];
    D[3] = R[3]; D[4] = -R[4]; D[5] = -R[5];
    D[6] = R[6]; D[7] = -R[7]; D[8] = -R[8];
    return dst;
  }

  // Compute canonical cytoplasmic mRNA translation-track frame for mRNA index m (0..nMrna-1)
  // Placed along x = TRACK_X, y = TRACK_Y, z = zOfTrack(m) with gentle A-form helical presentation
  // so consecutive O3'-P links are ~1.61 Å and ribosome A/P sites have a clear decoding axis.
  function mrnaTrackFrameInto(out, m, t, env) {
    const z = zOfTrack(m);
    // Gentle helical twist along the translation track so bases face upward/outward (+y/+x) toward the tRNA anticodons
    const twist = (m * 18.0 - 35.0) * DEG;
    rotZInto(Rz, twist);
    let ox = TRACK_X + 1.2 * Math.cos(twist);
    let oy = TRACK_Y + 1.2 * Math.sin(twist);
    let oz = z;
    if (env > 0) {
      ox += env * 0.06 * noise.at(12, t, m);
      oy += env * 0.06 * noise.at(13, t, m);
      oz += env * 0.06 * noise.at(14, t, m);
    }
    out.o[0] = ox; out.o[1] = oy; out.o[2] = oz;
    for (let i = 0; i < 9; i++) out.R[i] = Rz[i];
    return out;
  }

  // Ribosome P-site codon index (continuous float 0..10) as a function of time t
  function riboCodonAt(t) {
    if (t <= T_INIT_END) return 0;
    for (let c = 1; c < nSense; c++) {
      const sc = codonSched[c];
      if (t <= sc.tTransStart) return c - 1;
      if (t <= sc.tTransEnd) {
        return (c - 1) + smootherstep((t - sc.tTransStart) / (sc.tTransEnd - sc.tTransStart));
      }
    }
    return nSense - 1; // P-site sits at codon 10 while A-site is at stop codon 11 (UAA)
  }

  // Ribosome P-site z coordinate on the mRNA translation track
  function riboPsiteZ(riboCodon) {
    const mCenter = utrLen + riboCodon * 3 + 1; // middle nucleotide of P-site codon
    return zOfTrack(mCenter);
  }

  // ============================================================================ blobs setup
  const blobObjs = {};
  for (const [id, d] of Object.entries(EXPRESS_BLOB_DEF)) {
    blobObjs[id] = {
      id,
      label: d.label,
      kind: d.kind,
      pos: [0, 0, 0],
      scale: d.scale.slice(),
      rot: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      radius: d.radius,
      color: d.color,
      opacity: 0,
      visible: false,
      cutaway: cutawayV,
      anchors: {},
    };
  }
  const blobs = [];

  function emitBlob(id, x, y, z, op, anchors = {}, scaleOverride = null) {
    if (op <= 0.004) return;
    const b = blobObjs[id];
    b.pos[0] = x; b.pos[1] = y; b.pos[2] = z;
    if (scaleOverride) {
      b.scale[0] = scaleOverride[0]; b.scale[1] = scaleOverride[1]; b.scale[2] = scaleOverride[2];
    } else {
      const def = EXPRESS_BLOB_DEF[id].scale;
      b.scale[0] = def[0]; b.scale[1] = def[1]; b.scale[2] = def[2];
    }
    b.opacity = op;
    b.visible = true;
    b.cutaway = cutawayV;
    b.anchors = anchors;
    blobs.push(b);
  }

  // ============================================================================ state object
  const state = {
    t: 0,
    time: 0,
    progress: 0,
    playing: false,
    finished: false,
    speed: speedV,
    cutaway: cutawayV,
    cameraMode: cameraModeV,
    phase: 'promoter',
    caption: '',
    bubbleOpen: 0,
    rnapIndex: 0,
    rnaCount: 0,
    rnaLength: 0,
    hybridCount: 0,
    codonIndex: -1,
    codonNumber: 0,
    codonTriplet: '',
    anticodonTriplet: '',
    peptideCount: 0,
    peptideLength: 0,
    peptideSeq: '',
    activeCodon: null,
    activeResidue: null,
    construct,
  };

  // ============================================================================ pure evaluation apply(t)
  const fHybridTarget = newFrame();
  const fTrackTarget = newFrame();
  const fPartner = newFrame();
  const Rtemp = new Array(9);
  let tNow = 0, dirty = true, disposed = false;

  function apply(t) {
    t = clamp(t, 0, DURATION);
    const env = smooth01(t / 1.2) * (1 - smooth01((t - (DURATION - 1.5)) / 1.2));
    const rnapIdx = rnapDnaIndexAt(t);
    const masterBubble = bubbleMasterAt(t);

    // 1. Update Parental DNA Duplex (Strands 0 & 1) and Transcription Bubble
    let openBpCount = 0;
    for (let k = 0; k < nDna; k++) {
      const openW = pairOpenWeight(k, rnapIdx, masterBubble);
      if (openW > 0.35) openBpCount++;
      dnaFrameInto(dnaCoding[k].frame, 0, k, openW, t, env);
      dnaFrameInto(dnaTemplate[k].frame, 1, k, openW, t, env);
      const pStrength = clamp(1 - openW * 1.35, 0, 1);
      asm.pairs[k].strength = pStrength;
    }

    // 2. Update mRNA Nucleotides (Strand 2), RNA·DNA Hybrid Pairs, and Peeling to Translation Track
    let rnaTranscribed = 0;
    let hybridActiveCount = 0;
    for (let m = 0; m < nMrna; m++) {
      const k = tss + m;
      const mn = mrnaNucs[m];
      const hPair = asm.pairs[hybridPair0 + m];
      const ts = tMrnaStart[m], td = tMrnaDock[m];

      if (t < ts) {
        mn.visible = false;
        mn.opacity = 0;
        hPair.strength = 0;
        mrnaTrackFrameInto(mn.frame, m, t, 0);
        continue;
      }

      mn.visible = true;
      // Partner frame on the opened DNA template strand (RNA·DNA hybrid docking site)
      partnerInto(fHybridTarget, dnaTemplate[k].frame);
      // Canonical cytoplasmic translation-track frame
      mrnaTrackFrameInto(fTrackTarget, m, t, env);

      // How far RNAP has moved past this ribonucleotide determines peeling from hybrid to translation track:
      // While rnapIdx - k <= 6.5, nucleotide m stays base-paired in the RNA·DNA hybrid;
      // Between rnapIdx - k in [6.5, 11.5], it peels smoothly through the RNAP exit channel onto the translation track.
      const peelProgress = smooth01((rnapIdx - k - 6.0) / 5.0);

      if (t < td) {
        // Incoming rNTP flight into RNAP active site
        const u = clamp((t - ts) / (td - ts), 0, 1);
        const e = smootherstep(u);
        const fl = rnaFlight[m];
        const sx = fHybridTarget.o[0] + fl.offset[0];
        const sy = fHybridTarget.o[1] + fl.offset[1];
        const sz = fHybridTarget.o[2] + fl.offset[2];
        const bulgeSin = Math.sin(Math.PI * e);
        mn.frame.o[0] = lerp(sx, fHybridTarget.o[0], e) + fl.bulge[0] * bulgeSin;
        mn.frame.o[1] = lerp(sy, fHybridTarget.o[1], e) + fl.bulge[1] * bulgeSin;
        mn.frame.o[2] = lerp(sz, fHybridTarget.o[2], e) + fl.bulge[2] * bulgeSin;
        const rem = (1 - e) * (1 - e);
        axisAngle(Rtemp, fl.axis[0], fl.axis[1], fl.axis[2], fl.spin * rem);
        mulMM(mn.frame.R, Rtemp, fHybridTarget.R);
        mn.opacity = smooth01(u / 0.25);
        hPair.strength = 0;
      } else {
        rnaTranscribed++;
        mn.opacity = 1;
        // Blend between RNA·DNA hybrid frame and cytoplasmic translation-track frame
        mn.frame.o[0] = lerp(fHybridTarget.o[0], fTrackTarget.o[0], peelProgress);
        mn.frame.o[1] = lerp(fHybridTarget.o[1], fTrackTarget.o[1], peelProgress);
        mn.frame.o[2] = lerp(fHybridTarget.o[2], fTrackTarget.o[2], peelProgress);
        // Arch slightly in +x/+y mid-peel to represent threading through the RNAP RNA exit channel
        const arch = Math.sin(Math.PI * peelProgress);
        mn.frame.o[0] += 4.0 * arch;
        mn.frame.o[1] += 3.5 * arch;
        slerpMat(mn.frame.R, fHybridTarget.R, fTrackTarget.R, peelProgress);

        const dockHb = smooth01((t - td) / T_HB_RNA);
        const hybridStr = dockHb * (1 - smooth01(peelProgress / 0.45));
        hPair.strength = hybridStr;
        if (hybridStr > 0.2) hybridActiveCount++;
      }

      // Update template nucleotide's active pair pointer for viewer highlighting
      dnaTemplate[k].pair = asm.pairs[k].strength > 0.2 ? k : (hPair.strength > 0.1 ? hPair.id : -1);
      mn.pair = hPair.strength > 0.1 ? hPair.id : -1;
    }

    // Activate mRNA 5'->3' phosphodiester links once consecutive ribonucleotides have docked
    for (let m = 0; m + 1 < nMrna; m++) {
      asm.links[mrnaLink0 + m].active = t >= tMrnaLink[m + 1];
    }

    // 3. Update Translation: tRNA Anticodon Triplets (Strand 3), Codon-Anticodon H-bonds, and Nascent Peptide
    const riboCodon = riboCodonAt(t);
    const pSiteZ = riboPsiteZ(riboCodon);
    let activeCodonIdx = -1;
    let peptideCount = 0;

    // Determine active codon index for UI & captions
    if (t >= T_INIT_START && t < T_ELONG_START) {
      activeCodonIdx = 0;
    } else if (t >= T_ELONG_START && t < T_TERM_START) {
      const c = Math.min(nSense - 1, 1 + Math.floor((t - T_ELONG_START) / STEP_CODON));
      activeCodonIdx = c;
    } else if (t >= T_TERM_START) {
      activeCodonIdx = nCodons - 1; // 11 (UAA Stop codon)
    }

    // Place each sense codon's tRNA anticodon triplet (c = 0..10)
    let activeTrnaInitBlob = null;
    let activeTrnaElongBlob = null;

    for (let c = 0; c < nSense; c++) {
      const sc = codonSched[c];
      const cod = codons[c];
      const m0 = cod.mrnaRange[0];

      // A tRNA for codon c is visible from sc.tArrive until it translocates out of the E-site
      // When codon c+1 finishes translocation (at codonSched[c+1].tTransEnd), codon c moves P -> E and exits over 0.7s.
      const tExitStart = (c + 1 < nSense) ? codonSched[c + 1].tTransStart : T_HYDROLYSIS;
      const tExitEnd = tExitStart + 0.85;

      const linkA = asm.links[trnaLink0 + c * 2];
      const linkB = asm.links[trnaLink0 + c * 2 + 1];

      if (t < sc.tArrive || t >= tExitEnd) {
        for (let j = 0; j < 3; j++) {
          const mn = mrnaNucs[m0 + j];
          const tn = trnaNucs[c * 3 + j];
          tn.visible = false;
          tn.opacity = 0;
          partnerInto(tn.frame, mn.frame);
          asm.pairs[codonPair0 + c * 3 + j].strength = 0;
        }
        linkA.active = false;
        linkB.active = false;
        continue;
      }

      // Compute arrival interpolation (0 -> 1) and E-site exit interpolation (0 -> 1)
      const uIn = clamp((t - sc.tArrive) / Math.max(0.01, sc.tDock - sc.tArrive), 0, 1);
      const eIn = smootherstep(uIn);
      const uOut = clamp((t - tExitStart) / (tExitEnd - tExitStart), 0, 1);
      const eOut = smootherstep(uOut);
      const op = smooth01(uIn / 0.25) * (1 - smooth01((uOut - 0.35) / 0.65));
      const hbStr = (t >= sc.tDock ? smooth01((t - sc.tDock) / 0.25) : 0) * (1 - smooth01(uOut / 0.35));
      const fl = trnaFlight[c];

      let cx = 0, cy = 0, cz = 0;
      for (let j = 0; j < 3; j++) {
        const mn = mrnaNucs[m0 + j];
        const tn = trnaNucs[c * 3 + j];
        const cPair = asm.pairs[codonPair0 + c * 3 + j];

        partnerInto(fPartner, mn.frame);
        const ox = fPartner.o[0] + (1 - eIn) * fl.entryOffset[0] + eOut * fl.exitOffset[0];
        const oy = fPartner.o[1] + (1 - eIn) * fl.entryOffset[1] + eOut * fl.exitOffset[1];
        const oz = fPartner.o[2] + (1 - eIn) * fl.entryOffset[2] + eOut * fl.exitOffset[2];
        tn.frame.o[0] = ox; tn.frame.o[1] = oy; tn.frame.o[2] = oz;

        const spinAngle = fl.spin * ((1 - eIn) * (1 - eIn) + eOut * eOut);
        axisAngle(Rtemp, fl.axis[0], fl.axis[1], fl.axis[2], spinAngle);
        mulMM(tn.frame.R, Rtemp, fPartner.R);

        tn.visible = op > 0.01;
        tn.opacity = op;
        cPair.strength = hbStr;
        if (hbStr > 0.1) {
          mn.pair = cPair.id;
          tn.pair = cPair.id;
        }
        cx += ox / 3; cy += oy / 3; cz += oz / 3;
      }
      linkA.active = op > 0.2;
      linkB.active = op > 0.2;

      // Record carrier blob position above the anticodon triplet (extending toward the 50S peptidyl transferase center)
      const blobPos = [cx + 4.5, cy + 5.8, cz];
      const anticodonAnchor = [cx, cy, cz];
      const acceptorAnchor = [cx + 8.5, cy + 11.0, cz - 0.5];
      if (c === 0) {
        activeTrnaInitBlob = { pos: blobPos, op: op * 0.48, anticodon: anticodonAnchor, acceptor: acceptorAnchor };
      } else if (!activeTrnaElongBlob || op > activeTrnaElongBlob.op) {
        activeTrnaElongBlob = { pos: blobPos, op: op * 0.48, anticodon: anticodonAnchor, acceptor: acceptorAnchor, codon: c };
      }
    }

    // 4. Update Nascent Polypeptide Chain (asm.residues[0..10])
    // Peptide transferase center (PTC) sits inside the 50S subunit at [TRACK_X + 9, TRACK_Y + 11, pSiteZ].
    // As each residue c is incorporated (t >= codonSched[c].tPeptide), residues 0..c thread outward through
    // the 50S exit tunnel in a smooth 3D α-helical / coiled trajectory with ~3.8 Å Cα-Cα spacing.
    let newestRes = -1;
    for (let c = 0; c < nSense; c++) {
      if (t >= codonSched[c].tPeptide) {
        newestRes = c;
        peptideCount = c + 1;
      }
    }

    // Smooth continuous chain progression index so residues glide smoothly through the exit tunnel
    let chainHead = 0;
    for (let c = 0; c < nSense; c++) {
      const sc = codonSched[c];
      if (t >= sc.tPeptide) {
        const nextT = (c + 1 < nSense) ? codonSched[c + 1].tPeptide : T_HYDROLYSIS;
        const frac = c + 1 < nSense ? smooth01((t - sc.tPeptide) / Math.max(0.1, nextT - sc.tPeptide)) : 0;
        chainHead = c + frac * 0.35;
      }
    }

    // After hydrolysis at T_HYDROLYSIS, the finished 11-aa polypeptide releases smoothly from the 50S exit tunnel
    const releaseShift = smooth01((t - T_HYDROLYSIS) / (T_DISSOC_END - T_HYDROLYSIS));

    for (let c = 0; c < nSense; c++) {
      const res = asm.residues[c];
      const sc = codonSched[c];
      if (t < sc.tArrive) {
        res.pos[0] = 0; res.pos[1] = 0; res.pos[2] = 0;
        res.visible = false;
        res.opacity = 0;
        res.peptideBondActive = false;
        continue;
      }
      if (t < sc.tPeptide) {
        // Carried on incoming aminoacyl-tRNA acceptor stem before peptide bond formation
        const u = clamp((t - sc.tArrive) / Math.max(0.01, sc.tPeptide - sc.tArrive), 0, 1);
        const e = smootherstep(u);
        const codZ = zOfTrack(codons[c].mrnaRange[0] + 1);
        res.pos[0] = TRACK_X + 8.8 + (1 - e) * 14.0;
        res.pos[1] = TRACK_Y + 11.2 + (1 - e) * 12.0;
        res.pos[2] = codZ + (1 - e) * 6.0;
        res.visible = true;
        res.opacity = smooth01(u / 0.3);
        res.peptideBondActive = false;
      } else {
        // Incorporated into nascent polypeptide chain threading out of the 50S exit tunnel
        // Depth d >= 0 along the chain from the PTC (d = 0 is the C-terminal residue at the PTC,
        // d = newestRes - c is how many steps toward the N-terminus this residue has been pushed).
        const d = Math.max(0, chainHead - c) + releaseShift * 2.4;
        // 3.8 Å Cα-Cα virtual bond step along a gentle 3D helical coil emerging toward (+x, +y, -z)
        const coilAngle = c * 1.72; // ~98.5° per residue
        const coilRadius = 2.1 * smooth01(d / 1.5);
        const dirX = 0.72, dirY = 0.65, dirZ = -0.24; // unit vector (~3.8 Å per step along exit tunnel)
        const stepLen = 3.65;
        res.pos[0] = (TRACK_X + 8.8) + d * stepLen * dirX + coilRadius * Math.cos(coilAngle) + releaseShift * 8.0;
        res.pos[1] = (TRACK_Y + 11.2) + d * stepLen * dirY + coilRadius * Math.sin(coilAngle) * 0.5 + releaseShift * 6.0;
        res.pos[2] = pSiteZ + d * stepLen * dirZ + coilRadius * Math.sin(coilAngle) * 0.85;
        res.visible = true;
        res.opacity = 1;
        res.peptideBondActive = c > 0 && t >= sc.tPeptide;
      }
    }

    asm.updatePositions();

    // 5. Update Macromolecular Envelopes (sim.blobs) & Named Anchors
    blobs.length = 0;
    const BLOB_ALPHA = cutawayV ? 0.34 : 0.52;

    // 5a. RNA Polymerase (rnap)
    const rnapOp = win(t, 0.15, T_TX_CLEAR, 0.9, 1.1) * BLOB_ALPHA;
    const rnapZ = zOfDna(clamp(rnapIdx - 2.0, 0, nDna + 2));
    emitBlob('rnap', 2.5, -1.0, rnapZ, rnapOp, {
      dnaEntry: [0, 0, rnapZ + 14],
      activeSite: [2.0, -1.5, rnapZ],
      dnaExit: [0, 0, rnapZ - 16],
      rnaExit: [12.0, 1.5, rnapZ - 6],
    });

    // 5b. 30S & 50S Ribosomal Subunits
    const dissocShift = smooth01((t - T_HYDROLYSIS - 0.3) / (T_DISSOC_END - T_HYDROLYSIS - 0.3));
    const op30S = win(t, T_INIT_START, T_DISSOC_END, 0.85, 0.95) * BLOB_ALPHA;
    const op50S = win(t, T_50S_JOIN - 0.7, T_DISSOC_END, 0.85, 0.95) * BLOB_ALPHA;
    const join30S = smooth01((t - T_INIT_START) / (T_30S_DOCK - T_INIT_START));
    const join50S = smooth01((t - (T_50S_JOIN - 0.7)) / 0.85);

    const pos30S = [
      TRACK_X - 2.2 - (1 - join30S) * 10.0 - dissocShift * 9.0,
      TRACK_Y - 4.8 - (1 - join30S) * 8.0 - dissocShift * 7.0,
      pSiteZ,
    ];
    const pos50S = [
      TRACK_X + 10.5 + (1 - join50S) * 14.0 + dissocShift * 12.0,
      TRACK_Y + 12.0 + (1 - join50S) * 10.0 + dissocShift * 9.0,
      pSiteZ,
    ];
    const riboAnchors = {
      mrnaEntry: [TRACK_X, TRACK_Y, pSiteZ + 14.0],
      siteA: [TRACK_X + 1.5, TRACK_Y + 2.0, pSiteZ + 3 * RISE_A],
      siteP: [TRACK_X + 1.5, TRACK_Y + 2.0, pSiteZ],
      siteE: [TRACK_X + 1.5, TRACK_Y + 2.0, pSiteZ - 3 * RISE_A],
      mrnaExit: [TRACK_X, TRACK_Y, pSiteZ - 14.0],
      peptideTunnelExit: [TRACK_X + 20.0, TRACK_Y + 21.0, pSiteZ - 3.0],
    };
    emitBlob('ribosome-30s', pos30S[0], pos30S[1], pos30S[2], op30S, riboAnchors);
    emitBlob('ribosome-50s', pos50S[0], pos50S[1], pos50S[2], op50S, riboAnchors);

    // 5c. Initiator fMet-tRNAfMet & Elongator aa-tRNA blobs
    if (activeTrnaInitBlob && activeTrnaInitBlob.op > 0.01) {
      emitBlob('trna-init', activeTrnaInitBlob.pos[0], activeTrnaInitBlob.pos[1], activeTrnaInitBlob.pos[2], activeTrnaInitBlob.op, {
        anticodon: activeTrnaInitBlob.anticodon,
        acceptorStem: activeTrnaInitBlob.acceptor,
      });
    }
    if (activeTrnaElongBlob && activeTrnaElongBlob.op > 0.01) {
      emitBlob('trna-aa', activeTrnaElongBlob.pos[0], activeTrnaElongBlob.pos[1], activeTrnaElongBlob.pos[2], activeTrnaElongBlob.op, {
        anticodon: activeTrnaElongBlob.anticodon,
        acceptorStem: activeTrnaElongBlob.acceptor,
      });
    }

    // 5d. Release Factor 1 (RF1) at Stop Codon UAA (codon 11, A-site at pSiteZ + 3 * RISE_A)
    if (t >= T_TERM_START) {
      const opRf1 = win(t, T_TERM_START + 0.1, T_DISSOC_END - 0.2, 0.65, 0.8) * (BLOB_ALPHA + 0.14);
      const uRf1 = smooth01((t - T_TERM_START) / (T_RF1_DOCK - T_TERM_START));
      const aSiteZ = zOfTrack(codons[nCodons - 1].mrnaRange[0] + 1);
      const rfX = TRACK_X + 4.8 + (1 - uRf1) * 14.0 + dissocShift * 8.0;
      const rfY = TRACK_Y + 5.2 + (1 - uRf1) * 10.0 - dissocShift * 5.0;
      const rfZ = aSiteZ + (1 - uRf1) * 5.0;
      emitBlob('rf1', rfX, rfY, rfZ, opRf1, {
        siteA: [TRACK_X + 1.5, TRACK_Y + 1.5, aSiteZ],
        peptidylTransferaseCenter: [TRACK_X + 8.8, TRACK_Y + 11.2, pSiteZ],
      });
    }

    // 6. Update Phase, Educational Caption, and State Metadata
    const phaseInfo = describePhaseAndCaption(t, rnaTranscribed, hybridActiveCount, activeCodonIdx, peptideCount);
    const activeCodObj = activeCodonIdx >= 0 && activeCodonIdx < nCodons ? codons[activeCodonIdx] : null;
    const activeResObj = newestRes >= 0 ? asm.residues[newestRes] : null;

    state.t = t;
    state.time = t;
    state.progress = clamp(t / DURATION, 0, 1);
    state.finished = t >= DURATION - 1e-9;
    state.speed = speedV;
    state.cutaway = cutawayV;
    state.cameraMode = cameraModeV;
    state.phase = phaseInfo.phase;
    state.caption = phaseInfo.caption;
    state.bubbleOpen = openBpCount;
    state.rnapIndex = clamp(Math.round(rnapIdx), 0, nDna - 1);
    state.rnaCount = rnaTranscribed;
    state.rnaLength = rnaTranscribed;
    state.hybridCount = hybridActiveCount;
    state.codonIndex = activeCodonIdx;
    state.codonNumber = activeCodonIdx >= 0 ? activeCodonIdx + 1 : 0;
    state.codonTriplet = activeCodObj ? activeCodObj.triplet : '';
    state.anticodonTriplet = activeCodObj ? (activeCodObj.isStop ? 'RF1' : activeCodObj.anticodon3to5) : '';
    state.peptideCount = peptideCount;
    state.peptideLength = peptideCount;
    state.peptideSeq = construct.residues.slice(0, peptideCount).map((r, i) => (i === 0 ? 'fMet' : r.code1)).join('-');
    state.activeCodon = activeCodObj;
    state.activeResidue = activeResObj;

    tNow = t;
    dirty = false;
  }

  function describePhaseAndCaption(t, rnaCount, hybridCount, codIdx, pepCount) {
    if (t < T_PROM_END) {
      return {
        phase: 'promoter',
        caption: 'Promoter recognition: bacterial RNA polymerase (RNAP holoenzyme with σ factor) recognizes the −10 Pribnow box (5′-TATA-3′) and melts ~12 bp of parental B-DNA to form the open transcription bubble.',
      };
    }
    if (t < T_INIT_START) {
      const mIdx = clamp(rnaCount - 1, 0, nMrna - 1);
      const rnaBase = mrnaSeq[mIdx] || 'A';
      const tmplBase = DNA_COMP[seq[tss + mIdx]] || 'T';
      const regionLabel = mIdx < 6
        ? 'the 5′ UTR Shine–Dalgarno ribosome-binding site (5′-AGGAGG-3′)'
        : mIdx < 8
        ? 'the 5′ UTR spacer upstream of AUG'
        : mIdx < 41
        ? `sense codon ${Math.floor((mIdx - 8) / 3) + 1} (${codons[Math.floor((mIdx - 8) / 3)]?.triplet || ''})`
        : 'the 3′ UAA stop codon';
      return {
        phase: 'transcription',
        caption: `Transcription elongation (5′→3′): RNAP reads the 3′→5′ template strand, pairing r${rnaBase}TP (with 2′-OH ribose) opposite template d${tmplBase} while transcribing ${regionLabel}. An ~${Math.max(1, hybridCount)}-bp RNA·DNA hybrid sits inside RNAP as upstream DNA re-anneals.`,
      };
    }
    if (t < T_ELONG_START) {
      if (t < T_FMET_DOCK) {
        return {
          phase: 'initiation',
          caption: 'Translation initiation (30S docking): the 30S small ribosomal subunit binds the mRNA Shine–Dalgarno sequence (5′-AGGAGG-3′), aligning the AUG start codon (codon 1) directly in the ribosomal P-site.',
        };
      }
      return {
        phase: 'initiation',
        caption: 'Translation initiation (70S assembly): initiator formylmethionyl-tRNA (fMet-tRNAfMet, anticodon 3′-UAC-5′) base-pairs with AUG in the P-site, and the 50S large subunit joins to complete the 70S initiation complex.',
      };
    }
    if (t < T_TERM_START) {
      const cod = codons[clamp(codIdx, 1, nSense - 1)];
      const prevSeq = construct.residues.slice(0, Math.max(1, pepCount)).map((r, i) => (i === 0 ? 'fMet' : r.code1)).join('-');
      return {
        phase: 'elongation',
        caption: `Ribosome elongation — codon ${cod.number} (5′-${cod.triplet}-3′ → ${cod.aa3}): cognate ${cod.aa3}-tRNA (anticodon 3′-${cod.anticodon3to5}-5′) decodes the A-site, the 50S peptidyl transferase center forms a peptide bond (${prevSeq}), and the ribosome translocates 3 nt (A→P→E).`,
      };
    }
    if (t < T_DISSOC_END) {
      return {
        phase: 'termination',
        caption: 'Translation termination at stop codon 12 (5′-UAA-3′): no tRNA decodes UAA and no amino acid is added. Protein Release Factor 1 (RF1) binds the A-site, hydrolyzes the peptidyl-tRNA ester bond, and releases the 11-residue polypeptide (fMet-A-E-F-K-G-S-D-Y-Q-A).',
      };
    }
    return {
      phase: 'complete',
      caption: 'Gene expression complete: the parental 48-bp DNA duplex is fully re-annealed, the 44-nt mRNA transcript has been decoded from AUG to UAA, the finished 11-aa polypeptide is released, and the 30S/50S ribosomal subunits dissociate.',
    };
  }

  // Camera focus target helper for UI / 3D viewer camera tracking modes
  function focusTargetFor(mode = cameraModeV) {
    if (mode === 'rnap') {
      const b = blobObjs.rnap;
      return { target: b.pos.slice(), radius: 28 };
    }
    if (mode === 'ribosome') {
      const pZ = riboPsiteZ(riboCodonAt(tNow));
      return { target: [TRACK_X + 3.0, TRACK_Y + 3.0, pZ], radius: 32 };
    }
    if (mode === 'peptide') {
      const idx = Math.max(0, state.peptideCount - 1);
      const r = asm.residues[idx];
      return { target: r && r.visible ? r.pos.slice() : [TRACK_X + 12, TRACK_Y + 14, 0], radius: 24 };
    }
    return { target: [12, 2, 0], radius: 85 };
  }

  // ============================================================================ public API
  const sim = {
    assembly: asm,
    blobs,
    state,
    duration: DURATION,
    layout: {
      nDna,
      nMrna,
      nCodons,
      nSense,
      tss,
      utrLen,
      construct,
      trackX: TRACK_X,
      trackY: TRACK_Y,
    },
    get speed() { return speedV; },
    set speed(v) {
      if (Number.isFinite(v) && v > 0) {
        speedV = v;
        state.speed = v;
      }
    },
    get playing() { return state.playing; },
    setSpeed(v) {
      if (Number.isFinite(v) && v > 0) {
        speedV = v;
        state.speed = v;
      }
    },
    setCutaway(v) {
      cutawayV = Boolean(v);
      state.cutaway = cutawayV;
      for (const b of Object.values(blobObjs)) b.cutaway = cutawayV;
      apply(tNow);
    },
    setCameraMode(mode) {
      cameraModeV = mode || 'overview';
      state.cameraMode = cameraModeV;
    },
    focusTargetFor,
    seek(progress) {
      if (disposed) return;
      const p = clamp(Number.isFinite(progress) ? progress : 0, 0, 1);
      apply(p * DURATION);
    },
    step(deltaProgress = 0.02) {
      if (disposed) return;
      state.playing = false;
      const p = clamp(state.progress + deltaProgress, 0, 1);
      apply(p * DURATION);
    },
    play() {
      if (disposed) return;
      if (state.finished) apply(0);
      state.playing = true;
      state.finished = false;
    },
    pause() {
      state.playing = false;
    },
    update(dt) {
      if (disposed) return;
      if (state.playing && dt > 0) {
        const t = Math.min(DURATION, tNow + dt * speedV);
        apply(t);
        if (t >= DURATION) {
          state.playing = false;
          state.finished = true;
        }
      } else if (dirty) {
        apply(tNow);
      }
    },
    dispose() {
      disposed = true;
      blobs.length = 0;
    },
  };

  apply(0);
  return sim;
}
