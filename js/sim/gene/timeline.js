/**
 * @module sim/gene/timeline
 * Timeline builder (PLAN.md §6.1-§6.4, docs/tasks/R3-ST3-design.md §4.2, task R3-S2 part a).
 * Pure and deterministic: chapter tables and per-nucleotide / per-codon events for both modes.
 * All boundaries are computed in integer milliseconds and converted once to seconds, so chapters are
 * exactly contiguous. No clock, no randomness (the seed is only recorded in `meta`).
 *
 * Events carry semantics, not geometry. Every event has `data.target` naming its subject:
 * `'rnap' | 'sigma' | 'ribosome' | 'small' | 'large' | 'if1' | 'if2' | 'if3' | 'ef-tu' | 'ef-g' |
 * 'rf1' | 'nusg' | 'trna:<slot>'`. Where an event has times inside `data` (peptide.release), they are
 * seconds relative to the chapter start, as in the design schedule table.
 */
import { TRUE_SCALE_GENE_CONSTRUCT, codonTable } from '../../science/scenario.js';
import { shotSegments } from './shots.js';

/** The 26 allowed event types (docs/CONTRACTS.md §7.3). */
export const EVENT_TYPES = Object.freeze([
  'machine.move', 'machine.bind', 'part.release', 'dna.open', 'dna.close', 'dna.relax', 'ntp.enter',
  'bond.phosphodiester', 'ppi.leave', 'rna.hairpin', 'rna.release', 'mrna.layout', 'ribosome.bind',
  'ribosome.join', 'factor.enter', 'factor.leave', 'gtp.hydrolyse', 'trna.enter', 'trna.move',
  'trna.leave', 'codon.pair', 'bond.peptide', 'translocate', 'peptide.release', 'couple.lock',
  'couple.unlock',
]);

const DEFAULT_D = 38;
const DEFAULT_D_SOURCE = '6ZTJ, DEC-024';
const RESIDUE_SPACING = 3.40; // Å per residue along the tunnel (PLAN.md §7.4, CONTRACTS §7.4)
const MS = s => Math.round(s * 1000);

// --- Captions (PLAN.md §6.2 and §6.4; plain text per DEC-006) --------------------------------------

const CAPTIONS = [
  'A 248-base-pair gene in a patch of E. coli cytoplasm. Everything here is at true scale, built from experimental structures.',
  'RNA polymerase holoenzyme scans the DNA. Its σ⁷⁰ subunit (violet) recognises the −35 TTGACA and −10 TATAAT promoter elements.',
  'σ⁷⁰ melts about 13 base pairs around the start site. The template strand enters the active site and the DNA bends sharply.',
  'Each incoming NTP pairs with the template. The RNA 3′-OH attacks its α-phosphate, adding one nucleotide and releasing pyrophosphate.',
  'After about 12 nucleotides the enzyme leaves the promoter. Here σ⁷⁰ is shown leaving; in cells it often stays bound for longer.',
  'The polymerase reads the template 3′→5′ and builds RNA 5′→3′. About nine base pairs of RNA·DNA hybrid stay inside; the DNA re-closes behind.',
  'A GC-rich hairpin folds in the new RNA as the U-tract is copied. The weak U·A hybrid gives way, releasing the RNA and the DNA.',
  'The 30S subunit, with IF1 and IF3, finds the Shine–Dalgarno sequence AGGAGG by pairing it with the 3′ end of its 16S rRNA.',
  'IF2 brings the initiator fMet-tRNA to the P site, where its anticodon pairs with AUG. This sets the reading frame.',
  'The 50S subunit joins. IF3 and IF1 leave, and IF2 hydrolyses GTP and departs, leaving a 70S ribosome ready to read codon 2.',
  'EF-Tu brings an aminoacyl-tRNA to the A site. When its anticodon pairs with the codon, EF-Tu hydrolyses GTP and releases the tRNA.',
  'In the peptidyl-transferase centre of the 23S rRNA, the new amino acid attacks the ester bond. The growing chain moves to the A-site tRNA.',
  'EF-G uses GTP to move both tRNAs and the mRNA by exactly one codon: A to P, P to E. The A site is empty again.',
  'Each cycle adds one amino acid to the C-terminus. The chain threads through the 50S exit tunnel and emerges after about {N} residues.',
  'UAA has no tRNA. Release factor RF1 reads it in the A site and its GGQ motif hydrolyses the ester bond, freeing the 40-residue peptide.',
  'One gene, one transcript, one peptide. More ribosomes could read the same mRNA; the peptide would now fold, which is not modelled here.',
];

const COUPLED_CAPTIONS = [
  'The 5′ end of the mRNA, with its Shine–Dalgarno sequence, leaves the polymerase while transcription continues.',
  'In bacteria a ribosome can start on an mRNA that is still being made. Here transcription pauses briefly so the steps can be seen.',
  'The 50S subunit joins and the initiation factors leave. NusG links the ribosome to the polymerase, {D} nucleotides behind its active site.',
  'The polymerase and ribosome move together. Every three nucleotides transcribed match one codon translated.',
  'The terminator hairpin has folded and the polymerase releases the RNA. The ribosome no longer depends on the polymerase.',
  'Release factor RF1 reads UAA and frees the 40-residue peptide.',
  'In coupled expression, transcription and translation overlap in time and space, which is possible because bacteria have no nucleus.',
];

// --- Chapter tables (PLAN.md §6.1, §6.4) ----------------------------------------------------------

// id, title, group, shot; durations are computed from the content below.
const SEQ_CHAPTERS = [
  ['establish', 'A gene in the cytoplasm', 'O', 'wide'],
  ['search', 'Finding the promoter', 'T', 'rnap-side'],
  ['open', 'Opening the DNA', 'T', 'rnap-side'],
  ['initiate', 'First bonds', 'T', 'rnap-active'],
  ['escape', 'Promoter escape', 'T', 'rnap-side'],
  ['elongate-tx', 'Elongation', 'T', 'rnap-follow'],
  ['terminate-tx', 'Termination', 'T', 'rnap-exit'],
  ['scan', 'Ribosome meets mRNA', 'I', 'ribo-30s'],
  ['start', 'Start codon', 'I', 'ribo-decode'],
  ['join', '70S assembly', 'I', 'ribo-side'],
  ['decode', 'Decoding', 'E', 'ribo-decode'],
  ['bond', 'Peptide bond', 'E', 'ribo-ptc'],
  ['translocate', 'Translocation', 'E', 'ribo-side'],
  ['elongate-tl', 'Elongation', 'E', 'ribo-tunnel'],
  ['release', 'Stop codon', 'E', 'ribo-decode'],
  ['finale', 'Finished', 'O', 'wide'],
];

const COUPLED_CHAPTERS = [
  ...SEQ_CHAPTERS.slice(0, 5),
  ['elongate-early', 'RNA emerges', 'T', 'rnap-follow'],
  ['couple-scan', 'Ribosome joins early', 'I', 'ribo-30s'],
  ['couple-join', '70S assembly', 'I', 'coupled-wide'],
  ['couple-run', 'Coupled elongation', 'E', 'coupled-follow'],
  ['couple-terminate', 'Transcription ends', 'T', 'rnap-exit'],
  ['release', 'Stop codon', 'E', 'ribo-exit'],
  ['finale', 'Finished', 'O', 'wide'],
];

// Chapter constants of the construct (PLAN.md §5.1, §6.1).
const NT_END = 179; // transcript length
const CODON_STOP = 41;
const TX = { init: [1, 3], escape: [4, 12], elongate: [13, 150], terminate: [151, 179] };
const CYCLE_MS = 1100; // one translation cycle (PLAN.md §6.1 chapter 14)

const slotOf = codon => (codon - 1) % 4; // tRNA slot of codon k: four slots rotate 0..3

// --- Event emitter --------------------------------------------------------------------------------

function createEmitter() {
  const raw = [];
  return {
    raw,
    /** Add an event with times in absolute milliseconds. `target` is merged first into `data`. */
    add(type, chapter, a, b, target, data) {
      if (!EVENT_TYPES.includes(type)) throw new Error(`timeline: unknown event type "${type}"`);
      raw.push({ type, chapter, a, b, data: { target, ...data } });
    },
  };
}

/** One nucleotide addition: NTP entry, phosphodiester bond, PPi exit (ratio 0.8 : 0.4 : 0.6). */
function nucleotide(em, ch, c, n, base, dt, split) {
  const e = split ? split[0] : Math.round(dt * 8 / 18);
  const b = split ? split[1] : Math.round(dt * 12 / 18);
  em.add('ntp.enter', ch, c, c + e, 'rnap', { n, base });
  em.add('bond.phosphodiester', ch, c + e, c + b, 'rnap', { n });
  em.add('ppi.leave', ch, c + b, c + dt, 'rnap', { n });
}

function nucleotideRun(em, ch, t0, from, to, dt, mrna) {
  for (let n = from; n <= to; n++) nucleotide(em, ch, t0 + (n - from) * dt, n, mrna[n - 1], dt);
}

// --- Initiation, decoding and elongation fragments (times in ms, absolute) -------------------------

/** Chapter 8 content (chapter-relative seconds): 30S·IF1·IF3 meets the SD. Layout event omitted. */
function scanEvents(em, ch, at, sd) {
  em.add('factor.enter', ch, at(3.0), at(6.0), 'if1', {});
  em.add('factor.enter', ch, at(3.0), at(6.0), 'if3', {});
  em.add('ribosome.bind', ch, at(3.0), at(8.0), 'small', { sd });
}

/** Chapter 9 content: IF2·fMet-tRNA arrives, anticodon pairs with AUG in P. */
function startEvents(em, ch, at) {
  em.add('factor.enter', ch, at(0), at(3.0), 'if2', {});
  em.add('trna.enter', ch, at(0), at(3.0), 'trna:0', { kind: 'init', aa: 'fMet', site: 'P', codon: 1 });
  em.add('codon.pair', ch, at(3.0), at(4.5), 'trna:0', { codon: 1, site: 'P' });
}

/** Chapter 10 content: 50S joins; IF3, IF1, IF2 leave. */
function joinEvents(em, ch, t0) {
  const at = s => t0 + MS(s);
  em.add('ribosome.join', ch, at(0), at(2.5), 'large', {});
  em.add('factor.leave', ch, at(1.0), at(3.0), 'if3', {});
  em.add('gtp.hydrolyse', ch, at(3.0), at(4.4), 'if2', {});
  em.add('factor.leave', ch, at(3.0), at(5.0), 'if1', {});
  em.add('factor.leave', ch, at(3.0), at(5.0), 'if2', {});
}

/** Chapter 11 content: decoding of codon 2. */
function decodeEvents(em, ch, t0, aa2) {
  const at = s => t0 + MS(s);
  const slot = `trna:${slotOf(2)}`;
  em.add('factor.enter', ch, at(0), at(3.0), 'ef-tu', { carries: slot });
  em.add('trna.enter', ch, at(0), at(3.0), slot, { kind: 'aa', aa: aa2, site: 'AT', codon: 2 });
  em.add('codon.pair', ch, at(3.0), at(5.0), slot, { codon: 2, site: 'A' });
  em.add('gtp.hydrolyse', ch, at(5.0), at(6.4), 'ef-tu', {});
  em.add('factor.leave', ch, at(5.0), at(7.0), 'ef-tu', {});
  em.add('trna.move', ch, at(7.0), at(9.0), slot, { from: 'AT', to: 'A' });
}

/** Chapter 12 content: peptide bond between codon 1 (P) and codon 2 (A). */
function bondEvents(em, ch, t0) {
  em.add('bond.peptide', ch, t0 + MS(1.0), t0 + MS(3.0), `trna:${slotOf(2)}`,
    { codon: 2, from: `trna:${slotOf(1)}`, to: `trna:${slotOf(2)}` });
}

/** Chapter 13 content: EF-G translocation after codon 2. */
function translocateEvents(em, ch, t0) {
  const at = s => t0 + MS(s);
  em.add('factor.enter', ch, at(0), at(1.5), 'ef-g', {});
  em.add('gtp.hydrolyse', ch, at(1.5), at(2.9), 'ef-g', {});
  em.add('translocate', ch, at(1.5), at(4.0), 'ribosome', { codon: 2 });
  em.add('trna.move', ch, at(1.5), at(4.0), `trna:${slotOf(1)}`, { from: 'P', to: 'E' });
  em.add('trna.move', ch, at(1.5), at(4.0), `trna:${slotOf(2)}`, { from: 'A', to: 'P' });
  em.add('factor.leave', ch, at(4.0), at(6.0), 'ef-g', {});
}

/**
 * One translation cycle for codon k (chapter 14 sub-timing, 1.1 s): E-site tRNA exit and EF-Tu
 * delivery 0.35 s, bond 0.15 s, translocation 0.6 s. Slots rotate 0->1->2->3->0.
 */
function translationCycle(em, ch, c, k, aa) {
  const at = ms => c + ms;
  const eSlot = `trna:${slotOf(k - 2)}`; // tRNA of codon k-2 sits in E
  const pSlot = `trna:${slotOf(k - 1)}`; // peptidyl-tRNA of codon k-1 sits in P
  const aSlot = `trna:${slotOf(k)}`; // freshly delivered tRNA of codon k
  if (k >= 3) em.add('trna.leave', ch, at(0), at(350), eSlot, { from: 'E', codon: k - 2 });
  em.add('factor.enter', ch, at(0), at(150), 'ef-tu', { carries: aSlot, codon: k });
  em.add('trna.enter', ch, at(0), at(150), aSlot, { kind: 'aa', aa, site: 'AT', codon: k });
  em.add('codon.pair', ch, at(150), at(250), aSlot, { codon: k, site: 'A' });
  em.add('gtp.hydrolyse', ch, at(250), at(350), 'ef-tu', { codon: k });
  em.add('factor.leave', ch, at(250), at(350), 'ef-tu', { codon: k });
  em.add('trna.move', ch, at(250), at(350), aSlot, { from: 'AT', to: 'A', codon: k });
  em.add('bond.peptide', ch, at(350), at(500), aSlot, { codon: k, from: pSlot, to: aSlot });
  em.add('factor.enter', ch, at(500), at(600), 'ef-g', { codon: k });
  em.add('translocate', ch, at(600), at(1000), 'ribosome', { codon: k });
  em.add('trna.move', ch, at(600), at(1000), pSlot, { from: 'P', to: 'E', codon: k });
  em.add('trna.move', ch, at(600), at(1000), aSlot, { from: 'A', to: 'P', codon: k });
  em.add('gtp.hydrolyse', ch, at(600), at(700), 'ef-g', { codon: k });
  em.add('factor.leave', ch, at(1000), at(1100), 'ef-g', { codon: k });
}

/** Chapter 15 content: UAA in A, RF1 binds, peptide released. */
function releaseEvents(em, ch, t0) {
  const at = s => t0 + MS(s);
  em.add('trna.leave', ch, at(0), at(1.0), `trna:${slotOf(39)}`, { from: 'E', codon: 39 });
  em.add('factor.enter', ch, at(0), at(3.0), 'rf1', { codon: CODON_STOP, site: 'A' });
  em.add('peptide.release', ch, at(3.0), at(9.0), 'ribosome', { hydrolysis: [3.0, 5.0], slide: [5.0, 9.0] });
  em.add('factor.leave', ch, at(9.0), at(11.0), 'rf1', {});
}

/** Chapter 16 content: the deacylated P-site tRNA leaves. */
function finaleEvents(em, ch, t0) {
  em.add('trna.leave', ch, t0, t0 + MS(2.0), `trna:${slotOf(40)}`, { from: 'P', codon: 40 });
}

/** Release of the RNA and DNA after the last nucleotide (chapter 7 and coupled chapter 10). */
function endOfTranscription(em, ch, t) {
  em.add('rna.release', ch, t, t, 'rnap', {});
  em.add('dna.close', ch, t, t + 3000, 'rnap', {});
  em.add('dna.relax', ch, t, t + 3000, 'rnap', {});
  em.add('machine.move', ch, t, t + 3000, 'rnap', { leave: true });
}

// --- Helpers ---------------------------------------------------------------------------------------

function tunnelLength(asset) {
  const p = asset && asset.paths && asset.paths.tunnel;
  if (!p || !p.points) return null;
  const n = p.count ?? p.points.length / 3;
  let len = 0;
  for (let i = 1; i < n; i++) {
    const dx = p.points[3 * i] - p.points[3 * i - 3];
    const dy = p.points[3 * i + 1] - p.points[3 * i - 2];
    const dz = p.points[3 * i + 2] - p.points[3 * i - 1];
    len += Math.hypot(dx, dy, dz);
  }
  return len;
}

function resolveD(assets, optD) {
  if (optD !== undefined && optD !== null) return { D: optD, dSource: 'option opts.D' };
  const coupling = assets && assets['rnap-ec'] && assets['rnap-ec'].source && assets['rnap-ec'].source.coupling;
  if (coupling && Number.isFinite(coupling.D)) return { D: coupling.D, dSource: "asset rnap-ec source.coupling.D" };
  return { D: DEFAULT_D, dSource: DEFAULT_D_SOURCE };
}

const INITIAL_VALUES = [
  'Chapter 4/5/6/7 per-nucleotide split: NTP entry : bond : PPi exit = 0.8 : 0.4 : 0.6 (of 1.8 s), scaled to the nucleotide time and rounded to whole milliseconds.',
  'Chapter 2: machine.move [0, 8.0] easeInOutCubic and machine.bind at 8.0 s (register 45).',
  'Chapter 3: dna.open spans the whole chapter, bend 0 to 1, bubble [-11, 2].',
  'Chapter 5: part.release sigma [3.5, 5.0] (starts with nucleotide 11); machine.bind rnap [3.5, 5.0] with trackBlend 0 to 1 and assetSwitchAt 0.5 (DEC-007).',
  'Chapter 7: rna.hairpin starts when nucleotide 164 (first nucleotide of termStem3, mRNA index 163) is added and ends at 10.15 s; rna.release at 10.15 s; dna.close, dna.relax and machine.move leave span 3.0 s.',
  'Chapter 8: mrna.layout [0, 3.0]; IF1 and IF3 enter [3.0, 6.0]; 30S binds [3.0, 8.0].',
  'Chapter 9: IF2 and fMet-tRNA enter [0, 3.0]; codon.pair [3.0, 4.5].',
  'Chapter 10: 50S join [0, 2.5]; IF3 leaves [1.0, 3.0]; IF2 GTP cue [3.0, 4.4]; IF1 and IF2 leave [3.0, 5.0].',
  'Chapters 11-13: sub-timings as in the design schedule table (design §4.2).',
  'Chapter 14 cycle (1.1 s): trna.leave 0-0.35; EF-Tu enter 0-0.15; pair 0.15-0.25; GTP cue, EF-Tu leave and AT->A 0.25-0.35; bond 0.35-0.5; EF-G enter 0.5-0.6; translocate and P->E, A->P 0.6-1.0; EF-G GTP cue 0.6-0.7; EF-G leave 1.0-1.1.',
  'Chapter 15: trna.leave (E slot) [0, 1.0]; RF1 enter [0, 3.0]; peptide.release [3.0, 9.0] with hydrolysis [3.0, 5.0] and slide [5.0, 9.0] (seconds from chapter start); RF1 leave [9.0, 11.0].',
  'Chapter 16: deacylated P-site tRNA leaves [0, 2.0].',
  'Coupled chapter 7: mrna.layout [0, 2.0]; sequential chapter 8 (from 3.0 s) and chapter 9 events are linearly compressed from [3.0, 12.5] to [2.0, 10.0].',
  'Coupled chapter 8: join events as sequential chapter 10 in [0, 6.0]; nusg enters [6.0, 7.5]; couple.lock at 7.5 s (target ribosome).',
  'Coupled chapter 9: one 1.1 s cycle per three nucleotides; nucleotide j of a cycle starts at round(j * 1100 / 3) ms with NTP entry 100 ms, bond 67 ms, PPi exit 100 ms; translation cycles start with codon 2 (no E-site exit for codon 2).',
  'Coupled chapter 10: remaining nucleotides at 0.35 s; rna.hairpin completion [0, 1.0]; rna.release at 1.0 s; nusg leaves [1.0, 2.0]; DNA close, relax and RNAP leave [1.0, 4.0]; couple.unlock at 4.0 s.',
  'Coupled mode needs an integer D in [38, 139]: D >= 38 keeps the coupled cycles within the 40 codons (floor((155 - D) / 3) <= 39), D <= 139 keeps nucleotide 164 inside couple-run, where the hairpin fold event starts.',
];

// --- Builder ---------------------------------------------------------------------------------------

/**
 * Build the chapter list and sorted event list for the gene-expression timeline.
 *
 * @param {object} scenario - Construct v3 (`TRUE_SCALE_GENE_CONSTRUCT`), or `{ construct }`.
 * @param {object} [assets] - Decoded assets keyed by id (`ribosome-70s` gives `{N}`; `rnap-ec` may give D).
 * @param {{ mode?: 'sequential' | 'coupled', seed?: number, D?: number }} [opts] - Options.
 * @returns {{ duration: number, chapters: object[], events: object[], meta: object }} Timeline.
 *   Chapters carry `shots: [{ id, t0 }]` (see `shotSegments`); `chapter.shot` is the first shot id.
 */
export function buildTimeline(scenario, assets, { mode = 'sequential', seed = 19, D } = {}) {
  if (mode !== 'sequential' && mode !== 'coupled') throw new Error(`buildTimeline: unknown mode "${mode}"`);
  const construct = (scenario && scenario.construct) || scenario || TRUE_SCALE_GENE_CONSTRUCT;
  if (construct.mrnaLength !== NT_END || construct.codons.length !== CODON_STOP) {
    throw new Error('buildTimeline: expected the 248-bp construct v3 (179-nt transcript, 41 codons)');
  }
  const mrna = construct.mrna;
  const codons = codonTable(construct);
  const aaOf = k => codons[k - 1].aa3;
  const tss = construct.tss;
  const regionMrna = id => { const r = construct.region(id); return [r.start - tss, r.end - tss]; };
  const sd = regionMrna('sd');
  const hairpin = { stem: regionMrna('termStem5'), loop: regionMrna('termLoop'), stem3: regionMrna('termStem3') };
  const hairpinNt = hairpin.stem3[0] + 1; // nucleotide number (1-based) of the first termStem3 base

  // {N}: residues needed to fill the tunnel path.
  const L = tunnelLength(assets && assets['ribosome-70s']);
  const N = L === null ? null : Math.ceil(L / RESIDUE_SPACING);

  let dInfo = { D: null, dSource: null };
  if (mode === 'coupled') {
    dInfo = resolveD(assets, D);
    if (!Number.isInteger(dInfo.D) || dInfo.D < 38 || dInfo.D > 139) {
      throw new RangeError(`buildTimeline: coupled mode needs an integer D in [38, 139], got ${dInfo.D}`);
    }
  }
  const Dv = dInfo.D;
  const cycles = mode === 'coupled' ? Math.floor((NT_END - 24 - Dv) / 3) : 0;
  const remainingNt = mode === 'coupled' ? NT_END - 24 - Dv - 3 * cycles : 0;
  const remainingCodons = mode === 'coupled' ? 40 - 1 - cycles : 0;

  // Chapter durations in ms.
  let dur;
  if (mode === 'sequential') {
    dur = [
      MS(6.0), MS(8.0), MS(6.0), 3 * 1800 + 1000, MS(6.0), (TX.elongate[1] - TX.elongate[0] + 1) * 150,
      (TX.terminate[1] - TX.terminate[0] + 1) * 350 + 3000, MS(8.0), MS(6.0), MS(6.0), MS(9.0), MS(4.0),
      MS(6.0), 38 * CYCLE_MS, MS(11.0), MS(6.0),
    ];
  } else {
    dur = [
      MS(6.0), MS(8.0), MS(6.0), 3 * 1800 + 1000, MS(6.0), (12 + Dv) * 150, MS(10.0), MS(7.5),
      cycles * CYCLE_MS, MS(4.0), remainingCodons * CYCLE_MS + MS(11.0), MS(6.0),
    ];
  }
  const table = mode === 'sequential' ? SEQ_CHAPTERS : COUPLED_CHAPTERS;
  const starts = [];
  let acc = 0;
  for (const d of dur) { starts.push(acc); acc += d; }
  const totalMs = acc;

  const sub = text => text
    .replace('{N}', N === null ? '{N}' : String(N))
    .replace('{D}', mode === 'coupled' ? String(Dv) : '{D}');
  const captions = mode === 'sequential'
    ? CAPTIONS
    : [...CAPTIONS.slice(0, 5), ...COUPLED_CAPTIONS];

  const em = createEmitter();
  const E = (i, name) => { // chapter index i (0-based), asserts table order
    if (table[i][0] !== name) throw new Error(`timeline table mismatch at ${i}: ${table[i][0]} vs ${name}`);
    return starts[i];
  };

  // Chapters 1-5 (both modes).
  E(0, 'establish');
  {
    const t = E(1, 'search');
    em.add('machine.move', 1, t, t + MS(8.0), 'rnap', { assetId: 'rnap-holo', ease: 'easeInOutCubic' });
    em.add('machine.bind', 1, t + MS(8.0), t + MS(8.0), 'rnap', { register: 45 });
  }
  {
    const t = E(2, 'open');
    em.add('dna.open', 2, t, t + MS(6.0), 'rnap', { bubble: [-11, 2], bend: [0, 1] });
  }
  {
    const t = E(3, 'initiate');
    nucleotideRun(em, 3, t, TX.init[0], TX.init[1], 1800, mrna);
  }
  {
    const t = E(4, 'escape');
    nucleotideRun(em, 4, t, TX.escape[0], TX.escape[1], 500, mrna);
    em.add('part.release', 4, t + MS(3.5), t + MS(5.0), 'sigma', {});
    em.add('machine.bind', 4, t + MS(3.5), t + MS(5.0), 'rnap', { trackBlend: [0, 1], assetSwitchAt: 0.5, assetId: 'rnap-ec' });
  }

  if (mode === 'sequential') {
    {
      const t = E(5, 'elongate-tx');
      nucleotideRun(em, 5, t, TX.elongate[0], TX.elongate[1], 150, mrna);
    }
    {
      const t = E(6, 'terminate-tx');
      nucleotideRun(em, 6, t, TX.terminate[0], TX.terminate[1], 350, mrna);
      const tEnd = t + (TX.terminate[1] - TX.terminate[0] + 1) * 350;
      em.add('rna.hairpin', 6, t + (hairpinNt - TX.terminate[0]) * 350, tEnd, 'rnap', hairpin);
      endOfTranscription(em, 6, tEnd);
    }
    {
      const t = E(7, 'scan');
      em.add('mrna.layout', 7, t, t + MS(3.0), 'ribosome', { to: 'ribosome' });
      scanEvents(em, 7, s => t + MS(s), sd);
    }
    {
      const t = E(8, 'start');
      startEvents(em, 8, s => t + MS(s));
    }
    joinEvents(em, 9, E(9, 'join'));
    decodeEvents(em, 10, E(10, 'decode'), aaOf(2));
    bondEvents(em, 11, E(11, 'bond'));
    translocateEvents(em, 12, E(12, 'translocate'));
    {
      const t = E(13, 'elongate-tl');
      for (let k = 3; k <= 40; k++) translationCycle(em, 13, t + (k - 3) * CYCLE_MS, k, aaOf(k));
    }
    releaseEvents(em, 14, E(14, 'release'));
    finaleEvents(em, 15, E(15, 'finale'));
  } else {
    {
      const t = E(5, 'elongate-early');
      nucleotideRun(em, 5, t, TX.elongate[0], 24 + Dv, 150, mrna);
    }
    {
      const t = E(6, 'couple-scan');
      em.add('mrna.layout', 6, t, t + MS(2.0), 'ribosome', { to: 'coupled' });
      // Sequential chapters 8 and 9 (from 3.0 s of chapter 8, 8.0 s later for chapter 9) squeezed
      // linearly from [3.0, 12.5] to [2.0, 10.0].
      const squeeze = s => t + MS(2.0) + Math.round((MS(s) - MS(3.0)) * 16 / 19);
      em.add('factor.enter', 6, squeeze(3.0), squeeze(6.0), 'if1', {});
      em.add('factor.enter', 6, squeeze(3.0), squeeze(6.0), 'if3', {});
      em.add('ribosome.bind', 6, squeeze(3.0), squeeze(8.0), 'small', { sd, pose: 'expressome' });
      startEvents(em, 6, s => squeeze(8.0 + s));
    }
    {
      const t = E(7, 'couple-join');
      joinEvents(em, 7, t);
      em.add('factor.enter', 7, t + MS(6.0), t + MS(7.5), 'nusg', {});
      em.add('couple.lock', 7, t + MS(7.5), t + MS(7.5), 'ribosome', {});
    }
    {
      const t = E(8, 'couple-run');
      let ntFirst = 24 + Dv + 1;
      for (let j = 0; j < cycles; j++) {
        const c = t + j * CYCLE_MS;
        for (let q = 0; q < 3; q++) {
          const n = ntFirst + 3 * j + q;
          nucleotide(em, 8, c + Math.round(q * CYCLE_MS / 3), n, mrna[n - 1], 267, [100, 167]);
        }
        const k = 2 + j;
        translationCycle(em, 8, c, k, aaOf(k));
      }
      const tHairpin = (() => { // start of the cycle slot holding nucleotide hairpinNt
        const idx = hairpinNt - ntFirst; const j = Math.floor(idx / 3); const q = idx % 3;
        return t + j * CYCLE_MS + Math.round(q * CYCLE_MS / 3);
      })();
      em.add('rna.hairpin', 8, tHairpin, t + cycles * CYCLE_MS, 'rnap', { ...hairpin, part: 'fold' });
    }
    {
      const t = E(9, 'couple-terminate');
      const first = NT_END - remainingNt + 1;
      nucleotideRun(em, 9, t, first, NT_END, 350, mrna);
      em.add('rna.hairpin', 9, t, t + MS(1.0), 'rnap', { ...hairpin, part: 'complete' });
      em.add('factor.leave', 9, t + MS(1.0), t + MS(2.0), 'nusg', {});
      endOfTranscription(em, 9, t + MS(1.0));
      em.add('couple.unlock', 9, t + MS(4.0), t + MS(4.0), 'ribosome', {});
    }
    {
      const t = E(10, 'release');
      for (let j = 0; j < remainingCodons; j++) {
        const k = 2 + cycles + j;
        translationCycle(em, 10, t + j * CYCLE_MS, k, aaOf(k));
      }
      releaseEvents(em, 10, t + remainingCodons * CYCLE_MS);
    }
    finaleEvents(em, 11, E(11, 'finale'));
  }

  // Chapters.
  const chapters = table.map(([id, title, group, shot], i) => ({
    index: i,
    id,
    title,
    group,
    t0: starts[i] / 1000,
    t1: (starts[i] + dur[i]) / 1000,
    shot,
    caption: sub(captions[i]),
  }));

  // Events: stable sort by start, number per type in that order, then sort by (t0, id).
  const ordered = em.raw.map((e, i) => ({ ...e, i })).sort((x, y) => x.a - y.a || x.i - y.i);
  const counters = new Map();
  const events = ordered.map(e => {
    const n = (counters.get(e.type) || 0) + 1;
    counters.set(e.type, n);
    return { id: `${e.type}:${n}`, type: e.type, t0: e.a / 1000, t1: e.b / 1000, chapter: e.chapter, data: e.data };
  });
  events.sort((x, y) => x.t0 - y.t0 || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));

  const timeline = {
    duration: totalMs / 1000,
    chapters,
    events,
    meta: {
      mode,
      seed,
      N,
      D: mode === 'coupled' ? Dv : null,
      dSource: mode === 'coupled' ? dInfo.dSource : null,
      constructVersion: construct.version ?? null,
      cycles: mode === 'coupled' ? cycles : null,
      initialValues: INITIAL_VALUES.slice(),
    },
  };
  const segs = shotSegments(timeline);
  for (const ch of chapters) ch.shots = segs[ch.index];
  // The first segment of a chapter records the shot the camera comes from (the previous chapter's last shot),
  // so `shot.from` is defined across chapter boundaries; null only for the first chapter.
  for (let i = 0; i < chapters.length; i++) {
    const prev = i > 0 ? chapters[i - 1].shots : null;
    chapters[i].shots[0].from = prev ? prev[prev.length - 1].id : null;
  }
  return timeline;
}
