import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRUE_SCALE_GENE_CONSTRUCT as C } from '../js/science/scenario.js';
import { DEFAULT_GENE_CONSTRUCT, translateMrna } from '../js/science/genetic-code.js';
import { reverseComplement } from '../js/science/assembly.js';

// Transcript from docs/CONTRACTS.md 6.5: DNA [45, 137), 92 nt.
const EXPECTED_MRNA = 'ACUCUAACUAUAGGAGGUAACAUAAUGGCUGAAUUUAAAGGUUCUGACUACCAAGCUUAAACUCGGCGCCUGGAAACAGGCGCCUUUUUUUU';

test('true-scale construct has the 150-bp geometry from CONTRACTS 6.5', () => {
  assert.equal(C.length, 150);
  assert.equal(C.tss, 45);
  assert.equal(C.transcriptionEnd, 137);
  assert.equal(C.mrnaLength, 92);
});

test('true-scale transcript matches CONTRACTS 6.5 exactly', () => {
  assert.equal(C.mrna, EXPECTED_MRNA);
  assert.equal(C.mrna.length, 92);
});

test('start and stop codon positions in the transcript', () => {
  assert.equal(C.mrna.indexOf('AUG'), 24);
  assert.equal(C.orf.mrnaStart, 24);
  assert.equal(C.stop.mrnaStart, 57);
});

test('promoter elements and their spacing', () => {
  assert.equal(C.region('minus35').sequence, 'TTGACA');
  assert.equal(C.region('minus10').sequence, 'TATAAT');
  assert.equal(C.region('minus10').start - C.region('minus35').end, 17);
});

test('SD-start spacer is 7 nt', () => {
  assert.equal(C.region('sdSpacer').sequence.length, 7);
});

test('terminator stem arms are reverse complements', () => {
  assert.equal(reverseComplement(C.region('termStem5').sequence), C.region('termStem3').sequence);
});

test('codon table ends with the RF1 stop codon and has 12 entries', () => {
  assert.equal(C.codons.length, 12);
  const last = C.codons[C.codons.length - 1];
  assert.equal(last.isStop, true);
  assert.equal(last.factor, 'RF1');
});

test('peptide matches the 48-bp construct and translation of the transcript', () => {
  assert.equal(C.peptideSequence1, DEFAULT_GENE_CONSTRUCT.peptideSequence1);
  assert.equal(C.peptideLength, 11);
  const translated = translateMrna(C.mrna.slice(24));
  assert.equal(translated.residues.length, 11);
  assert.equal(translated.peptideSequence1, DEFAULT_GENE_CONSTRUCT.peptideSequence1);
});

test('48-bp construct is unchanged', () => {
  assert.equal(DEFAULT_GENE_CONSTRUCT.length, 48);
});
