// True-scale synthetic bacterial teaching construct (150 bp), as specified in docs/CONTRACTS.md 6.5.
// Sequence and mechanism only: no rendering or UI code. The 48-bp DEFAULT_GENE_CONSTRUCT in
// genetic-code.js is left unchanged until the simulation migrates.
// Coordinates are 0-based, half-open [start, end) on the coding strand (5'->3').

import { cleanRnaSequence, reverseComplement, complement } from './assembly.js';
import { CODON_TABLE, AMINO_ACID_INFO, anticodonOf } from './genetic-code.js';

// The construct is synthetic. Ending the transcript at the last U of the U-tract is a simplification.
const REGIONS = [
  { id: 'upstream', label: 'Upstream', sequence: 'CGACTGCATC' },
  { id: 'minus35', label: '−35 element', sequence: 'TTGACA' },
  { id: 'spacer', label: 'Spacer (17 bp)', sequence: 'GCTAGCTCAGTCCTAGG' },
  { id: 'minus10', label: '−10 element', sequence: 'TATAAT' },
  { id: 'discriminator', label: 'Discriminator', sequence: 'GCTAGC' },
  { id: 'utrLeader', label: '5′ UTR leader (+1)', sequence: 'ACTCTAACTAT' },
  { id: 'sd', label: 'Shine–Dalgarno', sequence: 'AGGAGG' },
  { id: 'sdSpacer', label: 'SD–start spacer (7 nt)', sequence: 'TAACATA' },
  { id: 'orf', label: 'ORF (11 sense codons)', sequence: 'ATGGCTGAATTTAAAGGTTCTGACTACCAAGCT' },
  { id: 'stop', label: 'Stop codon', sequence: 'TAA' },
  { id: 'linker', label: 'Linker', sequence: 'ACTC' },
  { id: 'termStem5', label: 'Terminator stem 5′', sequence: 'GGCGCCTG' },
  { id: 'termLoop', label: 'Terminator loop', sequence: 'GAAA' },
  { id: 'termStem3', label: 'Terminator stem 3′', sequence: 'CAGGCGCC' },
  { id: 'uTract', label: 'U-tract', sequence: 'TTTTTTTT' },
  { id: 'downstream', label: 'Downstream', sequence: 'GACTCAGTCAGCA' },
];

/**
 * Concatenate ordered regions into a construct and derive its transcript, ORF, stop codon,
 * codon table, and peptide. `regions` is an array of `{ id, label, sequence }`.
 * `transcribedFrom` / `transcribedTo` are region ids: the transcript spans from the start of the
 * first region to the end of the last one.
 */
export function buildConstruct(regions, { id, name, transcribedFrom, transcribedTo }) {
  const placed = [];
  let cursor = 0;
  for (const r of regions) {
    const start = cursor;
    const end = start + r.sequence.length;
    placed.push({ id: r.id, label: r.label, sequence: r.sequence, start, end });
    cursor = end;
  }

  const sequence = placed.map(r => r.sequence).join('');
  const byId = new Map(placed.map(r => [r.id, r]));
  const requireRegion = regionId => {
    const r = byId.get(regionId);
    if (!r) throw new Error(`buildConstruct: unknown region "${regionId}"`);
    return r;
  };

  const tss = requireRegion(transcribedFrom).start;
  const transcriptionEnd = requireRegion(transcribedTo).end;
  const mrna = cleanRnaSequence(sequence.slice(tss, transcriptionEnd));

  const orfRegion = requireRegion('orf');
  const stopRegion = requireRegion('stop');
  const senseCount = (orfRegion.end - orfRegion.start) / 3;

  const makeCodon = (index, dnaStart) => {
    const dnaEnd = dnaStart + 3;
    const mrnaStart = dnaStart - tss;
    const mrnaEnd = dnaEnd - tss;
    const dnaTriplet = sequence.slice(dnaStart, dnaEnd);
    const mrnaTriplet = cleanRnaSequence(dnaTriplet);
    const ac = anticodonOf(mrnaTriplet);
    const aa = index === 0 ? { ...AMINO_ACID_INFO.fMet } : { ...CODON_TABLE[mrnaTriplet] };
    return {
      index,
      number: index + 1,
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
      isStart: index === 0,
      isStop: aa.kind === 'stop',
      factor: aa.factor || null,
    };
  };

  const codons = [];
  for (let c = 0; c < senseCount; c++) codons.push(makeCodon(c, orfRegion.start + 3 * c));
  codons.push(makeCodon(senseCount, stopRegion.start));

  const peptide = codons.filter(c => !c.isStop).map((c, idx) => ({
    index: idx,
    codonIndex: c.index,
    codon: c.mrna,
    code1: c.code1,
    code3: c.code3,
    name: c.name,
    kind: c.kind,
    color: c.color,
  }));

  const stopCodon = codons[codons.length - 1];

  return {
    id,
    name,
    length: sequence.length,
    sequence,
    codingDna: sequence,
    templateDna: complement(sequence),
    templateDna5to3: reverseComplement(sequence),
    regions: placed,
    region: regionId => byId.get(regionId),
    tss,
    transcriptionStart: tss,
    transcriptionEnd,
    mrna,
    mrnaLength: mrna.length,
    orf: {
      start: orfRegion.start,
      end: orfRegion.end,
      mrnaStart: orfRegion.start - tss,
      mrnaEnd: orfRegion.end - tss,
      codons: senseCount,
    },
    stop: {
      start: stopRegion.start,
      end: stopRegion.end,
      mrnaStart: stopRegion.start - tss,
      mrnaEnd: stopRegion.end - tss,
      codonIndex: stopCodon.index,
      factor: stopCodon.factor,
    },
    codons,
    peptide,
    peptideLength: peptide.length,
    peptideSequence1: peptide.map(r => r.code1).join(''),
    peptideSequence3: peptide.map(r => r.code3).join('-'),
  };
}

export const TRUE_SCALE_GENE_CONSTRUCT = buildConstruct(REGIONS, {
  id: 'bacterial-true-scale-gene',
  name: 'Synthetic bacterial teaching gene (150 bp)',
  transcribedFrom: 'utrLeader',
  transcribedTo: 'uTract',
});
