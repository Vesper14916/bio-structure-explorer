// Standard genetic code, bacterial translation rules (Shine–Dalgarno + fMet initiation +
// RF1/RF2 termination), and the 48-bp annotated E. coli teaching gene construct.

import { cleanSequence, cleanRnaSequence, complement, reverseComplement, complementRna, reverseComplementRna } from './assembly.js';

export const AMINO_ACID_INFO = {
  fMet: { code1: 'M', code3: 'fMet', name: 'N-Formylmethionine', kind: 'initiator', color: 0xffd43b },
  Met:  { code1: 'M', code3: 'Met',  name: 'Methionine',         kind: 'nonpolar',  color: 0xffca3a },
  Ala:  { code1: 'A', code3: 'Ala',  name: 'Alanine',            kind: 'nonpolar',  color: 0x63e6be },
  Val:  { code1: 'V', code3: 'Val',  name: 'Valine',             kind: 'nonpolar',  color: 0x51cf66 },
  Leu:  { code1: 'L', code3: 'Leu',  name: 'Leucine',            kind: 'nonpolar',  color: 0x40c057 },
  Ile:  { code1: 'I', code3: 'Ile',  name: 'Isoleucine',         kind: 'nonpolar',  color: 0x37b24d },
  Phe:  { code1: 'F', code3: 'Phe',  name: 'Phenylalanine',      kind: 'nonpolar',  color: 0xff922b },
  Trp:  { code1: 'W', code3: 'Trp',  name: 'Tryptophan',         kind: 'nonpolar',  color: 0xf76707 },
  Pro:  { code1: 'P', code3: 'Pro',  name: 'Proline',            kind: 'nonpolar',  color: 0xfcc419 },
  Gly:  { code1: 'G', code3: 'Gly',  name: 'Glycine',            kind: 'nonpolar',  color: 0x94d82d },
  Ser:  { code1: 'S', code3: 'Ser',  name: 'Serine',             kind: 'polar',     color: 0x3bc9db },
  Thr:  { code1: 'T', code3: 'Thr',  name: 'Threonine',          kind: 'polar',     color: 0x22b8cf },
  Cys:  { code1: 'C', code3: 'Cys',  name: 'Cysteine',           kind: 'polar',     color: 0xffe066 },
  Tyr:  { code1: 'Y', code3: 'Tyr',  name: 'Tyrosine',           kind: 'polar',     color: 0x15aabf },
  Asn:  { code1: 'N', code3: 'Asn',  name: 'Asparagine',         kind: 'polar',     color: 0x74c0fc },
  Gln:  { code1: 'Q', code3: 'Gln',  name: 'Glutamine',          kind: 'polar',     color: 0x4dabf7 },
  Lys:  { code1: 'K', code3: 'Lys',  name: 'Lysine',             kind: 'positive',  color: 0x5c7cfa },
  Arg:  { code1: 'R', code3: 'Arg',  name: 'Arginine',           kind: 'positive',  color: 0x4c6ef5 },
  His:  { code1: 'H', code3: 'His',  name: 'Histidine',          kind: 'positive',  color: 0x7950f2 },
  Asp:  { code1: 'D', code3: 'Asp',  name: 'Aspartic acid',      kind: 'negative',  color: 0xff6b6b },
  Glu:  { code1: 'E', code3: 'Glu',  name: 'Glutamic acid',      kind: 'negative',  color: 0xfa5252 },
  Stop: { code1: '*', code3: 'Stop', name: 'Stop codon',         kind: 'stop',      color: 0xff4d6d },
};

// Also allow 1-letter lookup on AMINO_ACID_INFO (e.g. AMINO_ACID_INFO.A, AMINO_ACID_INFO.M).
for (const info of Object.values(AMINO_ACID_INFO)) {
  if (info.code3 !== 'fMet' && !AMINO_ACID_INFO[info.code1]) {
    AMINO_ACID_INFO[info.code1] = info;
  }
}

const AA = k => ({ ...AMINO_ACID_INFO[k] });

/** Standard genetic code table (all 64 RNA triplets 5'->3'). */
export const CODON_TABLE = {
  UUU: AA('Phe'), UUC: AA('Phe'), UUA: AA('Leu'), UUG: AA('Leu'),
  UCU: AA('Ser'), UCC: AA('Ser'), UCA: AA('Ser'), UCG: AA('Ser'),
  UAU: AA('Tyr'), UAC: AA('Tyr'), UAA: { ...AA('Stop'), factor: 'RF1', stopName: 'Ochre' }, UAG: { ...AA('Stop'), factor: 'RF1', stopName: 'Amber' },
  UGU: AA('Cys'), UGC: AA('Cys'), UGA: { ...AA('Stop'), factor: 'RF2', stopName: 'Opal' },  UGG: AA('Trp'),

  CUU: AA('Leu'), CUC: AA('Leu'), CUA: AA('Leu'), CUG: AA('Leu'),
  CCU: AA('Pro'), CCC: AA('Pro'), CCA: AA('Pro'), CCG: AA('Pro'),
  CAU: AA('His'), CAC: AA('His'), CAA: AA('Gln'), CAG: AA('Gln'),
  CGU: AA('Arg'), CGC: AA('Arg'), CGA: AA('Arg'), CGG: AA('Arg'),

  AUU: AA('Ile'), AUC: AA('Ile'), AUA: AA('Ile'), AUG: AA('Met'),
  ACU: AA('Thr'), ACC: AA('Thr'), ACA: AA('Thr'), ACG: AA('Thr'),
  AAU: AA('Asn'), AAC: AA('Asn'), AAA: AA('Lys'), AAG: AA('Lys'),
  AGU: AA('Ser'), AGC: AA('Ser'), AGA: AA('Arg'), AGG: AA('Arg'),

  GUU: AA('Val'), GUC: AA('Val'), GUA: AA('Val'), GUG: AA('Val'),
  GCU: AA('Ala'), GCC: AA('Ala'), GCA: AA('Ala'), GCG: AA('Ala'),
  GAU: AA('Asp'), GAC: AA('Asp'), GAA: AA('Glu'), GAG: AA('Glu'),
  GGU: AA('Gly'), GGC: AA('Gly'), GGA: AA('Gly'), GGG: AA('Gly'),
};

/**
 * Compute the Watson–Crick RNA anticodon of a 3-nt codon.
 * Returns a descriptor with both `anticodon5to3` (chemical 5'->3' order) and `anticodon3to5`
 * (3'->5' antiparallel alignment against the 5'->3' mRNA codon), while coercing to the
 * 5'->3' string if used in string context.
 */
export function anticodonOf(codon) {
  const c = cleanRnaSequence(codon).slice(0, 3);
  const ac3to5 = complementRna(c);
  const ac5to3 = reverseComplementRna(c);
  return {
    codon: c,
    anticodon5to3: ac5to3,
    anticodon3to5: ac3to5,
    fiveToThree: ac5to3,
    threeToFive: ac3to5,
    display: `3'-${ac3to5}-5'`,
    toString() { return ac5to3; },
    valueOf() { return ac5to3; },
    [Symbol.toPrimitive]() { return ac5to3; },
  };
}

// 48-bp bacterial teaching construct:
// 0..4   (4 bp): -10 Pribnow promoter element ('TATA')
// 4..12  (8 bp): 5' UTR ('AGGAGGTA' DNA / 'AGGAGGUA' mRNA), with Shine-Dalgarno 'AGGAGG' at DNA 4..10 (mRNA 0..6)
// 12..45 (33 bp, 11 sense codons): Coding ORF ('ATGGCTGAATTTAAAGGTTCTGACTACCAAGCT')
// 45..48 (3 bp, 1 stop codon): Ochre stop ('TAA' DNA / 'UAA' mRNA, recognized by RF1)
const PROMOTER_DNA = 'TATA';
const UTR5_DNA = 'AGGAGGTA';
const ORF_SENSE_DNA = 'ATGGCTGAATTTAAAGGTTCTGACTACCAAGCT';
const STOP_DNA = 'TAA';
const FULL_CODING_DNA = PROMOTER_DNA + UTR5_DNA + ORF_SENSE_DNA + STOP_DNA; // 48 bp
const TSS_INDEX = 4; // +1 transcription start site (0-based DNA index)
const FULL_MRNA = cleanRnaSequence(FULL_CODING_DNA.slice(TSS_INDEX));        // 44 nt

const buildConstructCodons = () => {
  const list = [];
  for (let c = 0; c < 12; c++) {
    const dnaStart = 12 + c * 3, dnaEnd = dnaStart + 3;
    const mrnaStart = 8 + c * 3, mrnaEnd = mrnaStart + 3;
    const dnaTriplet = FULL_CODING_DNA.slice(dnaStart, dnaEnd);
    const mrnaTriplet = FULL_MRNA.slice(mrnaStart, mrnaEnd);
    const ac = anticodonOf(mrnaTriplet);
    const aa = c === 0 ? AA('fMet') : { ...CODON_TABLE[mrnaTriplet] };
    list.push({
      index: c,
      number: c + 1,
      dnaStart,
      dnaEnd,
      mrnaStart,
      mrnaEnd,
      dna: dnaTriplet,
      mrna: mrnaTriplet,
      codon: mrnaTriplet,
      anticodon5to3: ac.anticodon5to3,
      anticodon3to5: ac.anticodon3to5,
      aa,
      code1: aa.code1,
      code3: aa.code3,
      name: aa.name,
      kind: aa.kind,
      color: aa.color,
      isStart: c === 0,
      isStop: aa.kind === 'stop',
      factor: aa.factor || null,
    });
  }
  return list;
};

const CONSTRUCT_CODONS = buildConstructCodons();
const CONSTRUCT_PEPTIDE = CONSTRUCT_CODONS.filter(c => !c.isStop).map((c, idx) => ({
  index: idx,
  codonIndex: c.index,
  codon: c.mrna,
  code1: c.code1,
  code3: c.code3,
  name: c.name,
  kind: c.kind,
  color: c.color,
}));

export const DEFAULT_GENE_CONSTRUCT = {
  id: 'bacterial-mini-gene',
  name: 'E. coli Mini-Gene Construct (48 bp)',
  length: FULL_CODING_DNA.length, // 48
  sequence: FULL_CODING_DNA,
  codingDna: FULL_CODING_DNA,
  templateDna: complement(FULL_CODING_DNA),             // 3'->5' aligned with coding strand
  templateDna5to3: reverseComplement(FULL_CODING_DNA),  // 5'->3' antiparallel strand order
  tss: TSS_INDEX,                                       // 4 (+1 site)
  transcriptionStart: TSS_INDEX,                        // 4
  transcriptionEnd: FULL_CODING_DNA.length,             // 48
  mrna: FULL_MRNA,                                      // 44 nt
  mrnaLength: FULL_MRNA.length,                         // 44
  promoter: {
    id: 'promoter',
    start: 0,
    end: 4,
    sequence: PROMOTER_DNA,
    label: '-10 Pribnow box',
  },
  utr5: {
    id: 'utr5',
    start: 4,
    end: 12,
    mrnaStart: 0,
    mrnaEnd: 8,
    sequence: cleanRnaSequence(UTR5_DNA),
    dnaSequence: UTR5_DNA,
    sdStart: 4,
    sdEnd: 10,
    mrnaSdStart: 0,
    mrnaSdEnd: 6,
    sdSequence: 'AGGAGG',
    label: '5′ UTR (Shine–Dalgarno)',
  },
  orf: {
    id: 'orf',
    start: 12,
    end: 45,
    mrnaStart: 8,
    mrnaEnd: 41,
    codons: 11,
    totalCodons: 12,
    sequence: ORF_SENSE_DNA,
    mrnaSequence: cleanRnaSequence(ORF_SENSE_DNA),
    label: 'Coding ORF (11 aa)',
  },
  stop: {
    id: 'stop',
    start: 45,
    end: 48,
    mrnaStart: 41,
    mrnaEnd: 44,
    codonStart: 45,
    codonEnd: 48,
    codonIndex: 11,
    sequence: STOP_DNA,
    mrnaSequence: cleanRnaSequence(STOP_DNA),
    factor: 'RF1',
    label: 'Stop codon (UAA / RF1)',
  },
  codons: CONSTRUCT_CODONS,
  peptide: CONSTRUCT_PEPTIDE,
  peptideLength: CONSTRUCT_PEPTIDE.length, // 11
  peptideSequence1: CONSTRUCT_PEPTIDE.map(r => r.code1).join(''),
  peptideSequence3: CONSTRUCT_PEPTIDE.map(r => r.code3).join('-'),
};

DEFAULT_GENE_CONSTRUCT.regions = [
  DEFAULT_GENE_CONSTRUCT.promoter,
  DEFAULT_GENE_CONSTRUCT.utr5,
  DEFAULT_GENE_CONSTRUCT.orf,
  DEFAULT_GENE_CONSTRUCT.stop,
];

/** Map 0-based DNA index (`0..47`) to 0-based mRNA index (`0..43`), or `-1` if upstream of `+1` TSS. */
export function dnaToMrnaIndex(dnaIdx, construct = DEFAULT_GENE_CONSTRUCT) {
  const tss = construct.tss ?? 4;
  const end = construct.transcriptionEnd ?? construct.length ?? 48;
  if (dnaIdx < tss || dnaIdx >= end) return -1;
  return dnaIdx - tss;
}

/** Map 0-based mRNA index (`0..43`) to 0-based DNA index (`4..47`), or `-1` if out of range. */
export function mrnaToDnaIndex(mrnaIdx, construct = DEFAULT_GENE_CONSTRUCT) {
  const tss = construct.tss ?? 4;
  const mrnaLen = construct.mrnaLength ?? ((construct.length ?? 48) - tss);
  if (mrnaIdx < 0 || mrnaIdx >= mrnaLen) return -1;
  return mrnaIdx + tss;
}

/** Map 0-based mRNA index (`0..43`) to 0-based codon index (`0..11`), or `-1` if in 5' UTR. */
export function mrnaToCodonIndex(mrnaIdx, construct = DEFAULT_GENE_CONSTRUCT) {
  const orfStart = construct.orf?.mrnaStart ?? 8;
  const stopEnd = construct.stop?.mrnaEnd ?? 44;
  if (mrnaIdx < orfStart || mrnaIdx >= stopEnd) return -1;
  return Math.floor((mrnaIdx - orfStart) / 3);
}

/** Map 0-based DNA index (`0..47`) to 0-based codon index (`0..11`), or `-1` if outside coding+stop region. */
export function dnaToCodonIndex(dnaIdx, construct = DEFAULT_GENE_CONSTRUCT) {
  const mrnaIdx = dnaToMrnaIndex(dnaIdx, construct);
  return mrnaIdx < 0 ? -1 : mrnaToCodonIndex(mrnaIdx, construct);
}

/**
 * Return the half-open mRNA index range `[start, end)` for a 0-based codon index (`0..11`).
 * Returned value is a 2-element array `[start, end]` augmented with `.start`, `.end`, `.dnaStart`, `.dnaEnd`
 * so both destructuring styles (`const [s, e] = ...` and `const { start, end } = ...`) work.
 */
export function codonToMrnaRange(codonIdx, construct = DEFAULT_GENE_CONSTRUCT) {
  const orfStart = construct.orf?.mrnaStart ?? 8;
  const tss = construct.tss ?? 4;
  const start = orfStart + 3 * codonIdx;
  const end = start + 3;
  const range = [start, end];
  range.start = start;
  range.end = end;
  range.dnaStart = start + tss;
  range.dnaEnd = end + tss;
  return range;
}

/** Return the half-open DNA index range `[start, end)` for a 0-based codon index (`0..11`). */
export function codonToDnaRange(codonIdx, construct = DEFAULT_GENE_CONSTRUCT) {
  const mrnaRange = codonToMrnaRange(codonIdx, construct);
  const range = [mrnaRange.dnaStart, mrnaRange.dnaEnd];
  range.start = mrnaRange.dnaStart;
  range.end = mrnaRange.dnaEnd;
  range.mrnaStart = mrnaRange.start;
  range.mrnaEnd = mrnaRange.end;
  return range;
}

/**
 * Transcribe a gene construct from its `+1` TSS (`construct.tss`) to `construct.transcriptionEnd`.
 */
export function transcribeConstruct(construct = DEFAULT_GENE_CONSTRUCT) {
  const coding = cleanSequence(construct.codingDna || construct.sequence || FULL_CODING_DNA);
  const tss = construct.tss ?? 4;
  const end = construct.transcriptionEnd ?? coding.length;
  const mrna = cleanRnaSequence(coding.slice(tss, end));
  return {
    codingDna: coding,
    templateDna: complement(coding),
    mrna,
    length: mrna.length,
    tss,
    transcriptionEnd: end,
    utr5: construct.utr5,
    orf: construct.orf,
    stop: construct.stop,
    codons: construct.codons,
  };
}

/**
 * Translate an mRNA sequence into a nascent bacterial polypeptide.
 * - By default, if `mrnaSeq` begins with the construct's 8-nt 5' UTR (`AGGAGGUA`), translation
 *   initiates at `startIndex = 8` (`AUG`); if a bare coding sequence starting with `AUG` is passed
 *   without an explicit `startIndex`, translation starts at `0`.
 * - When `bacterialInitiator === true`, the initiator codon (`c === 0`, `AUG`) incorporates `fMet`
 *   (`N-Formylmethionine`), while internal `AUG` codons incorporate standard `Met`.
 * - Translation terminates at the first in-frame stop codon (`UAA`, `UAG`, `UGA`), adding 0 residues.
 */
export function translateMrna(mrnaSeq, opts = {}) {
  const mrna = cleanRnaSequence(mrnaSeq);
  const bacterialInitiator = opts.bacterialInitiator !== false;
  let startIndex = opts.startIndex;
  if (startIndex === undefined) {
    startIndex = mrna.startsWith('AGGAGGUA') ? 8 : mrna.startsWith('AUG') ? 0 : 8;
  }
  const residues = [];
  const codons = [];
  let terminated = false;
  let stopCodon = null;
  let stopCodonIndex = -1;

  for (let pos = startIndex, c = 0; pos + 3 <= mrna.length; pos += 3, c++) {
    const triplet = mrna.slice(pos, pos + 3);
    const ac = anticodonOf(triplet);
    const entry = CODON_TABLE[triplet];
    if (!entry) break;
    if (entry.kind === 'stop') {
      terminated = true;
      stopCodon = triplet;
      stopCodonIndex = c;
      codons.push({
        index: c,
        mrnaStart: pos,
        mrnaEnd: pos + 3,
        codon: triplet,
        anticodon5to3: ac.anticodon5to3,
        anticodon3to5: ac.anticodon3to5,
        aa: { ...entry },
        code1: entry.code1,
        code3: entry.code3,
        name: entry.name,
        kind: 'stop',
        color: entry.color,
        isStart: false,
        isStop: true,
        factor: entry.factor || 'RF1',
      });
      break;
    }
    const aa = (c === 0 && bacterialInitiator && triplet === 'AUG') ? AA('fMet') : { ...entry };
    const codonObj = {
      index: c,
      mrnaStart: pos,
      mrnaEnd: pos + 3,
      codon: triplet,
      anticodon5to3: ac.anticodon5to3,
      anticodon3to5: ac.anticodon3to5,
      aa,
      code1: aa.code1,
      code3: aa.code3,
      name: aa.name,
      kind: aa.kind,
      color: aa.color,
      isStart: c === 0,
      isStop: false,
      factor: null,
    };
    codons.push(codonObj);
    residues.push({
      index: residues.length,
      codonIndex: c,
      mrnaStart: pos,
      mrnaEnd: pos + 3,
      codon: triplet,
      anticodon5to3: ac.anticodon5to3,
      anticodon3to5: ac.anticodon3to5,
      code1: aa.code1,
      code3: aa.code3,
      name: aa.name,
      kind: aa.kind,
      color: aa.color,
    });
  }

  return {
    mrna,
    startIndex,
    residues,
    codons,
    peptideLength: residues.length,
    peptideSequence1: residues.map(r => r.code1).join(''),
    peptideSequence3: residues.map(r => r.code3).join('-'),
    terminated,
    stopCodon,
    stopCodonIndex,
  };
}
