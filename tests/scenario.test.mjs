import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRUE_SCALE_GENE_CONSTRUCT as C, codonTable } from '../js/science/scenario.js';
import { DEFAULT_GENE_CONSTRUCT, AMINO_ACIDS, translateMrna } from '../js/science/genetic-code.js';
import { reverseComplement, reverseComplementRna } from '../js/science/assembly.js';

// Exact Construct v3 sequences from PLAN.md §5.1 (248 bp coding strand; 179 nt transcript over [45, 224)).
const EXPECTED_DNA = 'CGACTGCATCTTGACAGCTAGCTCAGTCCTAGGTATAATGCTAGCACTCTAACTATAGGAGGTAACATAATGGCTGAATTTAAAGGTTCTGACTACCAAGCTACCCTGGTTCGTAACATCCACTGGGAACTGACTAAAGTTATGGACCGCTGCACCAACCTGGCGGAAAAGATCCACGGCTCTTACCTGTAAACTCGGCGCCTGGAAACAGGCGCCTTTTTTTTGACTCAGTCAGCAGTCGATGCAGC';
const EXPECTED_MRNA = 'ACUCUAACUAUAGGAGGUAACAUAAUGGCUGAAUUUAAAGGUUCUGACUACCAAGCUACCCUGGUUCGUAACAUCCACUGGGAACUGACUAAAGUUAUGGACCGCUGCACCAACCUGGCGGAAAAGAUCCACGGCUCUUACCUGUAAACUCGGCGCCUGGAAACAGGCGCCUUUUUUUU';
const EXPECTED_PEPTIDE = 'fMet-A-E-F-K-G-S-D-Y-Q-A-T-L-V-R-N-I-H-W-E-L-T-K-V-M-D-R-C-T-N-L-A-E-K-I-H-G-S-Y-L';

const EXPECTED_REGIONS = [
  ['upstream', 0, 10, 'CGACTGCATC'],
  ['minus35', 10, 16, 'TTGACA'],
  ['spacer', 16, 33, 'GCTAGCTCAGTCCTAGG'],
  ['minus10', 33, 39, 'TATAAT'],
  ['discriminator', 39, 45, 'GCTAGC'],
  ['utrLeader', 45, 56, 'ACTCTAACTAT'],
  ['sd', 56, 62, 'AGGAGG'],
  ['sdSpacer', 62, 69, 'TAACATA'],
  ['orf', 69, 189, 'ATGGCTGAATTTAAAGGTTCTGACTACCAAGCTACCCTGGTTCGTAACATCCACTGGGAACTGACTAAAGTTATGGACCGCTGCACCAACCTGGCGGAAAAGATCCACGGCTCTTACCTG'],
  ['stop', 189, 192, 'TAA'],
  ['linker', 192, 196, 'ACTC'],
  ['termStem5', 196, 204, 'GGCGCCTG'],
  ['termLoop', 204, 208, 'GAAA'],
  ['termStem3', 208, 216, 'CAGGCGCC'],
  ['uTract', 216, 224, 'TTTTTTTT'],
  ['downstream', 224, 248, 'GACTCAGTCAGCAGTCGATGCAGC'],
];

// PLAN.md §5.1 41-row codon table: [number, triplet, aa3, anticodon5to3]
const EXPECTED_CODONS_V3 = [
  [1, 'AUG', 'fMet', 'CAU'], [2, 'GCU', 'Ala', 'AGC'], [3, 'GAA', 'Glu', 'UUC'],
  [4, 'UUU', 'Phe', 'AAA'], [5, 'AAA', 'Lys', 'UUU'], [6, 'GGU', 'Gly', 'ACC'],
  [7, 'UCU', 'Ser', 'AGA'], [8, 'GAC', 'Asp', 'GUC'], [9, 'UAC', 'Tyr', 'GUA'],
  [10, 'CAA', 'Gln', 'UUG'], [11, 'GCU', 'Ala', 'AGC'], [12, 'ACC', 'Thr', 'GGU'],
  [13, 'CUG', 'Leu', 'CAG'], [14, 'GUU', 'Val', 'AAC'], [15, 'CGU', 'Arg', 'ACG'],
  [16, 'AAC', 'Asn', 'GUU'], [17, 'AUC', 'Ile', 'GAU'], [18, 'CAC', 'His', 'GUG'],
  [19, 'UGG', 'Trp', 'CCA'], [20, 'GAA', 'Glu', 'UUC'], [21, 'CUG', 'Leu', 'CAG'],
  [22, 'ACU', 'Thr', 'AGU'], [23, 'AAA', 'Lys', 'UUU'], [24, 'GUU', 'Val', 'AAC'],
  [25, 'AUG', 'Met', 'CAU'], [26, 'GAC', 'Asp', 'GUC'], [27, 'CGC', 'Arg', 'GCG'],
  [28, 'UGC', 'Cys', 'GCA'], [29, 'ACC', 'Thr', 'GGU'], [30, 'AAC', 'Asn', 'GUU'],
  [31, 'CUG', 'Leu', 'CAG'], [32, 'GCG', 'Ala', 'CGC'], [33, 'GAA', 'Glu', 'UUC'],
  [34, 'AAG', 'Lys', 'CUU'], [35, 'AUC', 'Ile', 'GAU'], [36, 'CAC', 'His', 'GUG'],
  [37, 'GGC', 'Gly', 'GCC'], [38, 'UCU', 'Ser', 'AGA'], [39, 'UAC', 'Tyr', 'GUA'],
  [40, 'CUG', 'Leu', 'CAG'], [41, 'UAA', 'Stop', null],
];

test('true-scale construct v3 has the 248-bp geometry and all 16 regions from PLAN.md §5.1', () => {
  assert.equal(C.version, 3);
  assert.equal(C.length, 248);
  assert.equal(C.codingDna, EXPECTED_DNA);
  assert.equal(C.tss, 45);
  assert.equal(C.transcriptionEnd, 224);
  assert.equal(C.mrnaLength, 179);
  assert.equal(C.regions.length, 16);
  EXPECTED_REGIONS.forEach(([id, start, end, seq], i) => {
    const r = C.regions[i];
    assert.equal(r.id, id);
    assert.equal(r.start, start);
    assert.equal(r.end, end);
    assert.equal(r.sequence, seq);
    assert.equal(C.region(id), r);
  });
});

test('PLAN.md §5.3 item 1: transcript equals coding [45, 224) with T->U and reverse complement of template', () => {
  assert.equal(C.mrna, EXPECTED_MRNA);
  assert.equal(C.mrna.length, 179);
  assert.equal(C.mrna, C.codingDna.slice(45, 224).replace(/T/g, 'U'));
  // templateDna is 3'->5' aligned to codingDna; reversing gives 5'->3' template over [45, 224).
  const templateSlice5to3 = [...C.templateDna.slice(45, 224)].reverse().join('');
  assert.equal(C.mrna, reverseComplementRna(templateSlice5to3.replace(/T/g, 'U')));
  // Equivalent check using templateDna5to3 (5'->3' full template strand):
  const revStart = C.length - 224;
  const revEnd = C.length - 45;
  assert.equal(C.templateDna5to3.slice(revStart, revEnd), templateSlice5to3);
});

test('mRNA landmarks: SD, start codon, stop codon, terminator stem/loop, U-tract', () => {
  assert.equal(C.mrna.slice(11, 17), 'AGGAGG');
  assert.equal(C.mrna.slice(24, 27), 'AUG');
  assert.equal(C.mrna.indexOf('AUG'), 24);
  assert.equal(C.orf.mrnaStart, 24);
  assert.equal(C.orf.mrnaEnd, 144);
  assert.equal(C.stop.mrnaStart, 144);
  assert.equal(C.stop.mrnaEnd, 147);
  assert.equal(C.mrna.slice(144, 147), 'UAA');
  assert.equal(C.mrna.slice(151, 159), 'GGCGCCUG');
  assert.equal(C.mrna.slice(159, 163), 'GAAA');
  assert.equal(C.mrna.slice(163, 171), 'CAGGCGCC');
  assert.equal(C.mrna.slice(171, 179), 'UUUUUUUU');
});

test('promoter elements, SD spacer, and terminator stem arms', () => {
  assert.equal(C.region('minus35').sequence, 'TTGACA');
  assert.equal(C.region('minus10').sequence, 'TATAAT');
  assert.equal(C.region('minus10').start - C.region('minus35').end, 17);
  assert.equal(C.region('sdSpacer').sequence.length, 7);
  assert.equal(reverseComplement(C.region('termStem5').sequence), C.region('termStem3').sequence);
});

test('PLAN.md §5.1 design checks: stops, single AGGAGG, homopolymers, internal AUG, GC content', () => {
  // No in-frame stop before codon 41
  assert.equal(C.codons.length, 41);
  for (let i = 0; i < 40; i++) assert.equal(C.codons[i].isStop, false, `unexpected stop at codon ${i + 1}`);
  const last = C.codons[40];
  assert.equal(last.isStop, true);
  assert.equal(last.mrna, 'UAA');
  assert.equal(last.factor, 'RF1');

  // Exactly one AGGAGG in the entire 248-bp construct
  const sdMatches = [...C.codingDna.matchAll(/AGGAGG/g)].map(m => m.index);
  assert.deepEqual(sdMatches, [56]);

  // No run of >= 4 T and no run of >= 6 A in the ORF
  const orfSeq = C.region('orf').sequence;
  assert.equal(/T{4,}/.test(orfSeq), false, 'ORF must not contain >= 4 consecutive T');
  assert.equal(/A{6,}/.test(orfSeq), false, 'ORF must not contain >= 6 consecutive A');

  // Internal AUG at codon 25 (index 24) is in-frame and read as Met, not fMet
  const c25 = C.codons[24];
  assert.equal(c25.number, 25);
  assert.equal(c25.mrna, 'AUG');
  assert.equal(c25.code3, 'Met');
  assert.equal(c25.isStart, false);

  // GC content: 49% in ORF, 48% overall (rounded to nearest integer percent)
  const gcPct = seq => Math.round((100 * [...seq].filter(b => b === 'G' || b === 'C').length) / seq.length);
  assert.equal(gcPct(orfSeq), 49);
  assert.equal(gcPct(C.codingDna), 48);
});

test('40-residue peptide matches §5.1, extends Round 1 fixture, and contains all 19 non-proline amino acids', () => {
  assert.equal(C.peptideLength, 40);
  const formatted = C.peptide.map((r, i) => (i === 0 ? r.code3 : r.code1)).join('-');
  assert.equal(formatted, EXPECTED_PEPTIDE);

  // First 11 sense codons match Round 1 DEFAULT_GENE_CONSTRUCT
  assert.equal(C.peptideSequence1.slice(0, 11), DEFAULT_GENE_CONSTRUCT.peptideSequence1);
  for (let i = 0; i < 11; i++) {
    assert.equal(C.codons[i].mrna, DEFAULT_GENE_CONSTRUCT.codons[i].mrna, `codon ${i + 1}`);
  }

  // Contains all 19 non-proline amino acids and zero prolines
  const unique = new Set(C.peptide.map(r => r.code1));
  assert.equal(unique.size, 19);
  assert.equal(unique.has('P'), false);
  assert.equal([...unique].sort().join(''), 'ACDEFGHIKLMNQRSTVWY');

  // Matches translateMrna on the transcript from start codon [24, ...)
  const translated = translateMrna(C.mrna.slice(24));
  assert.equal(translated.residues.length, 40);
  assert.equal(translated.peptideSequence1, C.peptideSequence1);
  assert.equal(translated.residues[0].code3, 'fMet');
  assert.equal(translated.residues[24].code3, 'Met');
  assert.equal(translated.stopCodon, 'UAA');
});

test('codonTable(TRUE_SCALE_GENE_CONSTRUCT) returns 41 rows in Round 1 DEFAULT_CODONS shape', () => {
  const rows = codonTable();
  assert.equal(rows.length, 41);
  const expectedKeys = ['index', 'number', 'triplet', 'anticodon3to5', 'aa3', 'aa1', 'aaName', 'color', 'isInitiator', 'isStop'].sort();

  rows.forEach((row, i) => {
    assert.deepEqual(Object.keys(row).sort(), expectedKeys);
    const [num, triplet, aa3, ac5to3] = EXPECTED_CODONS_V3[i];
    assert.equal(row.index, i);
    assert.equal(row.number, num);
    assert.equal(row.triplet, triplet);
    assert.equal(row.aa3, aa3);
    assert.equal(row.isInitiator, i === 0);
    assert.equal(row.isStop, i === 40);
    assert.equal(row.color, AMINO_ACIDS[aa3].color);
    if (row.isStop) {
      assert.equal(row.anticodon3to5, 'RF1');
      assert.equal(row.aa1, '*');
      assert.equal(row.aaName, 'Stop (RF1)');
    } else {
      // anticodon3to5 is the reverse of 5'->3' anticodon listed in §5.1
      assert.equal(row.anticodon3to5, [...ac5to3].reverse().join(''));
      assert.equal(row.aa1, AMINO_ACIDS[aa3].code1);
      assert.equal(row.aaName, AMINO_ACIDS[aa3].name);
    }
  });
});

test('48-bp DEFAULT_GENE_CONSTRUCT is unchanged', () => {
  assert.equal(DEFAULT_GENE_CONSTRUCT.length, 48);
  assert.equal(DEFAULT_GENE_CONSTRUCT.mrnaLength, 44);
  assert.equal(DEFAULT_GENE_CONSTRUCT.peptideLength, 11);
});
