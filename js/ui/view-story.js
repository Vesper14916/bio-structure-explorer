/**
 * @module ui/view-story
 * Round 3 Express v2 panel (PLAN.md §4.8–§4.10, docs/CONTRACTS.md §7.5, task R3-U1).
 * Builds `section.view#view-express` using only existing Helix UI components, DOM helpers,
 * icons, and locked design tokens.
 *
 * Emitted `ctx.H.onExpression({ action, value })` payloads:
 * - `{ action: 'play' }`
 * - `{ action: 'pause' }`
 * - `{ action: 'restart' }`
 * - `{ action: 'seek', value: number }` (progress in [0, 1], rAF-throttled while scrubbing)
 * - `{ action: 'speed', value: 0.5 | 1 | 2 | 4 }`
 * - `{ action: 'mode', value: 'sequential' | 'coupled' }`
 * - `{ action: 'camera', value: 'auto' | 'overview' | 'rnap' | 'ribosome' | 'free' }`
 * - `{ action: 'toggle', value: { cutaway?: boolean, labels?: boolean, crowding?: boolean } }`
 * - `{ action: 'chapter', value: number }` (0-based chapter index)
 * - `{ action: 'selectCodon', value: number | null }` (0-based codon index or null to clear)
 * - `{ action: 'clearInspect' }`
 */
import { h, hex, setText, rafThrottle, clamp } from './dom.js';
import { icon } from './icons.js';
import { segmented, toggleTile, range, stat, sectionLabel } from './components.js';
import { TRUE_SCALE_GENE_CONSTRUCT, codonTable } from '../science/scenario.js';

const GROUP_LEVEL = {
  T: 'closed', // transcription
  I: 'mid',    // translation initiation
  E: 'open',   // translation elongation and termination
  O: 'closed', // establishing and finale
};

/** Exact legend entries from PLAN.md §4.9 (in order). NusG is included only in Coupled mode. */
export const STORY_LEGEND_ENTRIES = Object.freeze([
  // Strands
  { id: 'coding', label: 'Coding DNA (5′→3′)', color: '#7c93c3', kind: 'strand' },
  { id: 'template', label: 'Template DNA (3′→5′)', color: '#9fb2dc', kind: 'strand' },
  { id: 'mrna', label: 'mRNA (5′→3′)', color: '#2fd9b9', kind: 'strand' },
  { id: 'trna-ac', label: 'tRNA anticodon', color: '#ffd43b', kind: 'strand' },
  { id: 'peptide', label: 'Peptide (N→C)', color: '#ff7a45', kind: 'strand' },
  // Machines
  { id: 'rnap', label: 'RNA polymerase', color: '#4fb6ff', kind: 'blob' },
  { id: 'sigma', label: 'σ⁷⁰', color: '#b58cff', kind: 'blob' },
  { id: 'small', label: '30S subunit', color: '#e4dcc4', kind: 'blob' },
  { id: 'large', label: '50S subunit', color: '#d2b183', kind: 'blob' },
  { id: 'trna-init', label: 'Initiator tRNA', color: '#ffd43b', kind: 'blob' },
  { id: 'trna-aa', label: 'Elongator tRNA', color: '#ff922b', kind: 'blob' },
  { id: 'ef-tu', label: 'EF-Tu', color: '#f783ac', kind: 'blob' },
  { id: 'ef-g', label: 'EF-G', color: '#a9e34b', kind: 'blob' },
  { id: 'rf1', label: 'RF1', color: '#ff6b6b', kind: 'blob' },
  { id: 'ifs', label: 'IF1–IF3', color: '#b197fc', kind: 'blob' },
  { id: 'nusg', label: 'NusG', color: '#15aabf', kind: 'blob', coupledOnly: true },
]);

/** Return the locked §4.9 legend list for `'sequential'` or `'coupled'` mode. */
export function storyLegend(mode = 'sequential') {
  return STORY_LEGEND_ENTRIES.filter(it => !it.coupledOnly || mode === 'coupled');
}

/** Default Step-by-step chapters (PLAN.md §6.1 & §6.2; plain text "E. coli" per DEC-006). */
const DEFAULT_CHAPTERS = [
  { index: 0, id: 'establish', title: 'A gene in the cytoplasm', group: 'O', t0: 0, t1: 6.0, caption: 'A 248-base-pair gene in a patch of E. coli cytoplasm. Everything here is at true scale, built from experimental structures.' },
  { index: 1, id: 'search', title: 'Finding the promoter', group: 'T', t0: 6.0, t1: 14.0, caption: 'RNA polymerase holoenzyme scans the DNA. Its σ⁷⁰ subunit (violet) recognises the −35 TTGACA and −10 TATAAT promoter elements.' },
  { index: 2, id: 'open', title: 'Opening the DNA', group: 'T', t0: 14.0, t1: 20.0, caption: 'σ⁷⁰ melts about 13 base pairs around the start site. The template strand enters the active site and the DNA bends sharply.' },
  { index: 3, id: 'initiate', title: 'First bonds', group: 'T', t0: 20.0, t1: 26.4, caption: 'Each incoming NTP pairs with the template. The RNA 3′-OH attacks its α-phosphate, adding one nucleotide and releasing pyrophosphate.' },
  { index: 4, id: 'escape', title: 'Promoter escape', group: 'T', t0: 26.4, t1: 32.4, caption: 'After about 12 nucleotides the enzyme leaves the promoter. Here σ⁷⁰ is shown leaving; in cells it often stays bound for longer.' },
  { index: 5, id: 'elongate-tx', title: 'Elongation', group: 'T', t0: 32.4, t1: 53.1, caption: 'The polymerase reads the template 3′→5′ and builds RNA 5′→3′. About nine base pairs of RNA·DNA hybrid stay inside; the DNA re-closes behind.' },
  { index: 6, id: 'terminate-tx', title: 'Termination', group: 'T', t0: 53.1, t1: 66.25, caption: 'A GC-rich hairpin folds in the new RNA as the U-tract is copied. The weak U·A hybrid gives way, releasing the RNA and the DNA.' },
  { index: 7, id: 'scan', title: 'Ribosome meets mRNA', group: 'I', t0: 66.25, t1: 74.25, caption: 'The 30S subunit, with IF1 and IF3, finds the Shine–Dalgarno sequence AGGAGG by pairing it with the 3′ end of its 16S rRNA.' },
  { index: 8, id: 'start', title: 'Start codon', group: 'I', t0: 74.25, t1: 80.25, caption: 'IF2 brings the initiator fMet-tRNA to the P site, where its anticodon pairs with AUG. This sets the reading frame.' },
  { index: 9, id: 'join', title: '70S assembly', group: 'I', t0: 80.25, t1: 86.25, caption: 'The 50S subunit joins. IF3 and IF1 leave, and IF2 hydrolyses GTP and departs, leaving a 70S ribosome ready to read codon 2.' },
  { index: 10, id: 'decode', title: 'Decoding', group: 'E', t0: 86.25, t1: 95.25, caption: 'EF-Tu brings an aminoacyl-tRNA to the A site. When its anticodon pairs with the codon, EF-Tu hydrolyses GTP and releases the tRNA.' },
  { index: 11, id: 'bond', title: 'Peptide bond', group: 'E', t0: 95.25, t1: 99.25, caption: 'In the peptidyl-transferase centre of the 23S rRNA, the new amino acid attacks the ester bond. The growing chain moves to the A-site tRNA.' },
  { index: 12, id: 'translocate', title: 'Translocation', group: 'E', t0: 99.25, t1: 105.25, caption: 'EF-G uses GTP to move both tRNAs and the mRNA by exactly one codon: A to P, P to E. The A site is empty again.' },
  { index: 13, id: 'elongate-tl', title: 'Elongation', group: 'E', t0: 105.25, t1: 147.05, caption: 'Each cycle adds one amino acid to the C-terminus. The chain threads through the 50S exit tunnel and emerges after about 26 residues.' },
  { index: 14, id: 'release', title: 'Stop codon', group: 'E', t0: 147.05, t1: 158.05, caption: 'UAA has no tRNA. Release factor RF1 reads it in the A site and its GGQ motif hydrolyses the ester bond, freeing the 40-residue peptide.' },
  { index: 15, id: 'finale', title: 'Finished', group: 'O', t0: 158.05, t1: 164.05, caption: 'One gene, one transcript, one peptide. More ribosomes could read the same mRNA; the peptide would now fold, which is not modelled here.' },
];

const DEFAULT_CODONS_V3 = codonTable(TRUE_SCALE_GENE_CONSTRUCT);

function formatTime(sec) {
  const s = Number.isFinite(sec) && sec > 0 ? Math.round(sec) : 0;
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${mins}:${String(rem).padStart(2, '0')}`;
}

function chaptersSignature(list) {
  if (!Array.isArray(list) || !list.length) return '';
  const last = list[list.length - 1];
  return `${list.length}:${list[0].id}:${last.id}:${last.t1}`;
}

function totalDurationOf(list) {
  if (!Array.isArray(list) || !list.length) return 1;
  const last = list[list.length - 1];
  return last && Number.isFinite(last.t1) && last.t1 > 0 ? last.t1 : 1;
}

/**
 * Create the Express v2 story control panel view (`section.view#view-express`).
 *
 * @param {object} ctx - UI view context (`{ H, col, mode, tier? }`).
 * @returns {{ el: HTMLElement, setState: (s: object) => void, setLegend: (items: Array) => void, togglePlay: () => void, stepChapter: (dir: number) => void, restart: () => void, isPlaying: () => boolean }}
 */
export function createStoryView(ctx) {
  const { H } = ctx;
  const col = ctx.col || (() => 'var(--text-2)');
  const send = (action, value) => H.onExpression(value === undefined ? { action } : { action, value });

  let playing = false;
  let scrubbing = false;
  let progress = 0;
  let currentMode = 'sequential';
  let currentSpeed = 1;
  let chapters = DEFAULT_CHAPTERS;
  let chapSig = chaptersSignature(chapters);
  let totalDuration = totalDurationOf(chapters);
  let activeChapterIdx = 0;
  let codons = DEFAULT_CODONS_V3;
  let activeCodonIdx = -1;
  let selectedCodon = null;
  let peptideMade = 0;
  let customLegend = false;
  let crowdingUserSet = false;
  let lastInspectRef = undefined;

  const toggles = {
    cutaway: true,
    labels: true,
    crowding: ctx.tier !== 'low',
  };

  // ---- Item 1: view header ----------------------------------------------------------------------
  const viewHead = h('header', { class: 'view-head' },
    h('h2', {}, 'Express the gene'),
    h('p', {}, 'From one gene to one protein, at true scale.'));

  // ---- Item 2: peek (transport + phase/chapter-count + caption) ---------------------------------
  const playBtn = h('button', {
    type: 'button',
    class: 'btn-play',
    'aria-label': 'Play',
    onclick: () => togglePlay(),
  }, icon('play', 22));

  const restartBtn = h('button', {
    type: 'button',
    class: 'icon-btn',
    'aria-label': 'Restart',
    onclick: () => restart(),
  }, icon('restart', 20));

  const seek = rafThrottle(v => send('seek', v));
  const scrub = range({
    min: 0,
    max: 1000,
    step: 1,
    value: 0,
    label: 'Story progress',
    className: 'range-scrub',
    onInput: v => {
      progress = v / 1000;
      paintPct();
      seek(progress);
    },
  });
  scrub.el.addEventListener('pointerdown', () => { scrubbing = true; });
  const endScrub = () => { scrubbing = false; };
  scrub.el.addEventListener('pointerup', endScrub);
  scrub.el.addEventListener('pointercancel', endScrub);
  scrub.el.addEventListener('blur', endScrub);

  const scrubTicks = h('div', { class: 'scrub-ticks', 'aria-hidden': 'true' });
  const pct = h('span', { class: 'pct' }, '0\u202f%');
  const phase = h('span', { class: 'phase', 'data-level': 'closed' }, chapters[0].title);
  const chapterCount = h('span', { class: 'chapter-count mono' }, `1 / ${chapters.length}`);
  const caption = h('p', { class: 'caption', 'aria-live': 'polite', 'aria-atomic': 'true' }, chapters[0].caption);

  function paintPct() {
    setText(pct, `${Math.round(clamp(progress, 0, 1) * 100)}\u202f%`);
  }

  function setPlaying(p) {
    playing = !!p;
    playBtn.replaceChildren(icon(playing ? 'pause' : 'play', 22));
    playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    playBtn.classList.toggle('is-playing', playing);
  }

  function togglePlay() {
    setPlaying(!playing);
    send(playing ? 'play' : 'pause');
  }

  function restart() {
    send('restart');
  }

  const peek = h('div', { class: 'peek' },
    h('div', { class: 'transport' },
      playBtn,
      restartBtn,
      h('div', { class: 'scrub' }, scrub.el, scrubTicks),
      pct),
    h('div', { class: 'row-between' }, phase, chapterCount),
    caption);

  // ---- Item 3: Story mode + Speed ---------------------------------------------------------------
  const modeSeg = segmented({
    label: 'Story',
    value: currentMode,
    className: 'seg-sm',
    options: [
      { value: 'sequential', label: 'Step by step' },
      { value: 'coupled', label: 'Coupled' },
    ],
    onChange: v => {
      currentMode = v;
      if (!customLegend) renderLegendItems(storyLegend(currentMode));
      send('mode', v);
    },
  });

  const speedSeg = segmented({
    label: 'Speed',
    value: currentSpeed,
    className: 'seg-sm',
    options: [
      { value: 0.5, label: '0.5×' },
      { value: 1, label: '1×' },
      { value: 2, label: '2×' },
      { value: 4, label: '4×' },
    ],
    onChange: v => {
      currentSpeed = v;
      updateChapterDurations();
      send('speed', v);
    },
  });

  const modeSpeedGroup = h('div', { class: 'group row-between' },
    h('div', { class: 'grow' }, sectionLabel('Story'), modeSeg.el),
    h('div', { class: 'grow' }, sectionLabel('Speed'), speedSeg.el));

  // ---- Item 4: Camera ---------------------------------------------------------------------------
  const cameraSeg = segmented({
    label: 'Camera',
    value: 'auto',
    className: 'seg-sm',
    options: [
      { value: 'auto', label: 'Auto' },
      { value: 'overview', label: 'Overview' },
      { value: 'rnap', label: 'RNAP' },
      { value: 'ribosome', label: 'Ribosome' },
      { value: 'free', label: 'Free' },
    ],
    onChange: v => send('camera', v),
  });

  const cameraGroup = h('div', { class: 'group' },
    sectionLabel('Camera'),
    cameraSeg.el);

  // ---- Item 5: Toggle tiles (Cutaway, Labels, Crowding) -----------------------------------------
  const cutawayTile = toggleTile({
    label: 'Cutaway',
    hint: 'Open machines at the active site',
    onChange: v => {
      toggles.cutaway = v;
      send('toggle', { cutaway: v });
    },
  });
  const labelsTile = toggleTile({
    label: 'Labels',
    hint: 'Names in the scene',
    onChange: v => {
      toggles.labels = v;
      send('toggle', { labels: v });
    },
  });
  const crowdingTile = toggleTile({
    label: 'Crowding',
    hint: 'Neighbouring molecules',
    className: 'tile-wide',
    onChange: v => {
      crowdingUserSet = true;
      toggles.crowding = v;
      send('toggle', { crowding: v });
    },
  });
  cutawayTile.set(toggles.cutaway);
  labelsTile.set(toggles.labels);
  crowdingTile.set(toggles.crowding);

  const tilesGroup = h('div', { class: 'group tiles' },
    cutawayTile.el,
    labelsTile.el,
    crowdingTile.el);

  // ---- Item 6: Chapter list card ----------------------------------------------------------------
  const totalDurEl = h('span', { class: 'card-sub mono' }, formatTime(totalDuration / currentSpeed));
  const chapterListEl = h('ol', { class: 'chapter-list', 'aria-label': 'Story chapters' });
  let chapterRows = [];
  let chapterDurEls = [];
  let tickEls = [];

  function selectChapter(idx) {
    if (!chapters.length) return;
    const next = clamp(idx, 0, chapters.length - 1);
    setActiveChapter(next, true);
    send('chapter', next);
  }

  function stepChapter(dir) {
    if (!chapters.length) return;
    const next = clamp(activeChapterIdx + dir, 0, chapters.length - 1);
    setActiveChapter(next, true);
    send('chapter', next);
  }

  function buildChapters() {
    chapterListEl.replaceChildren();
    scrubTicks.replaceChildren();
    chapterRows = [];
    chapterDurEls = [];
    tickEls = [];

    const dur = totalDuration > 0 ? totalDuration : 1;
    chapters.forEach((ch, i) => {
      const numText = String(i + 1).padStart(2, '0');
      const dEl = h('span', { class: 'chapter-d mono' }, formatTime((ch.t1 - ch.t0) / currentSpeed));
      const row = h('button', {
        type: 'button',
        class: 'chapter-row',
        style: { width: '100%' },
        onclick: () => selectChapter(i),
      },
        h('span', { class: 'chapter-n mono' }, numText),
        h('span', { class: 'chapter-t' }, ch.title),
        dEl);
      const li = h('li', { style: { listStyle: 'none' } }, row);
      chapterListEl.append(li);
      chapterRows.push(row);
      chapterDurEls.push(dEl);

      const leftPct = clamp((ch.t0 / dur) * 100, 0, 100);
      const tick = h('i', { style: { left: `${leftPct.toFixed(3)}%` } });
      scrubTicks.append(tick);
      tickEls.push(tick);
    });

    setText(totalDurEl, formatTime(totalDuration / currentSpeed));
    setActiveChapter(clamp(activeChapterIdx, 0, Math.max(0, chapters.length - 1)), false);
  }

  function updateChapterDurations() {
    setText(totalDurEl, formatTime(totalDuration / currentSpeed));
    chapters.forEach((ch, i) => {
      if (chapterDurEls[i]) setText(chapterDurEls[i], formatTime((ch.t1 - ch.t0) / currentSpeed));
    });
  }

  function setActiveChapter(idx, scrollRow = false, phaseLevelOverride = null) {
    if (!chapters.length) return;
    const clamped = clamp(idx, 0, chapters.length - 1);
    const changed = clamped !== activeChapterIdx;
    activeChapterIdx = clamped;
    const ch = chapters[clamped];

    chapterRows.forEach((row, i) => {
      if (i === clamped) row.setAttribute('aria-current', 'step');
      else row.removeAttribute('aria-current');
    });
    tickEls.forEach((t, i) => t.classList.toggle('is-active', i === clamped));

    if (ch) {
      setText(phase, ch.title);
      phase.dataset.level = phaseLevelOverride || GROUP_LEVEL[ch.group] || 'closed';
    }
    setText(chapterCount, `${clamped + 1} / ${chapters.length}`);

    if ((scrollRow || changed) && chapterRows[clamped] && chapterListEl.scrollHeight > chapterListEl.clientHeight) {
      const row = chapterRows[clamped];
      const listRect = chapterListEl.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      const top = rowRect.top - listRect.top + chapterListEl.scrollTop;
      const bottom = top + rowRect.height;
      const viewTop = chapterListEl.scrollTop;
      const viewBottom = viewTop + chapterListEl.clientHeight;
      if (top < viewTop) chapterListEl.scrollTop = top;
      else if (bottom > viewBottom) chapterListEl.scrollTop = bottom - chapterListEl.clientHeight;
    }
  }

  const chapterCard = h('div', { class: 'card chapter-card' },
    h('div', { class: 'card-title' },
      h('h3', {}, 'Chapters'),
      totalDurEl),
    chapterListEl);

  buildChapters();

  // ---- Item 7: Codon & polypeptide card (41 cells: 40 sense + UAA) ------------------------------
  const codonStrip = h('div', {
    class: 'strip codon-strip h-scroll',
    role: 'listbox',
    'aria-orientation': 'horizontal',
    'aria-label': 'mRNA codons and translated amino acids',
  });
  const prevCodonBtn = h('button', {
    type: 'button',
    class: 'icon-btn icon-btn-sm',
    'aria-label': 'Previous codon',
    onclick: () => stepCodon(-1),
  }, icon('left', 18));
  const nextCodonBtn = h('button', {
    type: 'button',
    class: 'icon-btn icon-btn-sm',
    'aria-label': 'Next codon',
    onclick: () => stepCodon(1),
  }, icon('right', 18));
  const clearCodonBtn = h('button', {
    type: 'button',
    class: 'link-btn',
    hidden: true,
    onclick: () => selectCodon(null),
  }, 'Clear');
  const codonReadout = h('p', { class: 'codon-readout' },
    'Tap a codon to highlight its mRNA triplet, tRNA anticodon, and amino acid in 3D.');
  const peptideChainEl = h('div', { class: 'peptide-chain', 'aria-label': 'Nascent polypeptide chain' });

  let codonCells = [];
  let residuePills = [];

  function senseCodonCount() {
    let n = 0;
    for (const c of codons) if (!c.isStop) n++;
    return n || 40;
  }

  function buildCodonStrip() {
    codonStrip.replaceChildren();
    codonCells = [];

    const utrBadge = h('div', {
      class: 'utr-badge',
      title: '5′ untranslated region containing the Shine–Dalgarno ribosome-binding site (5′-AGGAGG-3′)',
    },
      h('span', { class: 'utr-top' }, '5′ UTR'),
      h('span', { class: 'utr-seq mono' }, 'AGGAGG'),
      h('span', { class: 'utr-sub' }, 'SD site'));
    codonStrip.append(utrBadge);

    codons.forEach((cod, i) => {
      const aaColor = typeof cod.color === 'number' ? hex(cod.color) : (cod.color || '#74c0fc');
      const bases = [...cod.triplet].map(b => h('span', { class: 'ccell-b', style: { color: col(b) } }, b));
      const cell = h('button', {
        type: 'button',
        role: 'option',
        class: `ccell ${cod.isStop ? 'ccell-stop' : ''} ${cod.isInitiator ? 'ccell-init' : ''}`.trim(),
        'aria-selected': 'false',
        'aria-label': `Codon ${cod.number}: ${cod.triplet} → ${cod.aa3} (${cod.aaName})`,
        style: { '--aa': aaColor },
        onclick: () => selectCodon(selectedCodon === i ? null : i),
      },
        h('span', { class: 'ccell-n' }, `#${cod.number}`),
        h('span', { class: 'ccell-mid mono' }, ...bases),
        h('span', { class: 'ccell-aa' }, cod.aa3));
      codonCells.push(cell);
      codonStrip.append(cell);
    });

    peptideChainEl.replaceChildren();
    residuePills = [];
    codons.forEach((cod, i) => {
      if (cod.isStop) return;
      const aaColor = typeof cod.color === 'number' ? hex(cod.color) : (cod.color || '#74c0fc');
      const pill = h('button', {
        type: 'button',
        class: 'pep-pill',
        'aria-label': `Residue ${i + 1}: ${cod.aaName} (codon ${cod.number}, ${cod.triplet})`,
        title: `Residue ${i + 1}: ${cod.aaName} (codon #${cod.number} ${cod.triplet})`,
        style: { '--aa': aaColor },
        onclick: () => selectCodon(selectedCodon === i ? null : i),
      }, cod.isInitiator ? 'fMet' : cod.aa1);
      residuePills.push(pill);
      peptideChainEl.append(pill);
    });

    paintCodons(false);
    paintPeptideMade();
  }

  function updateCodonReadout() {
    const focusIdx = selectedCodon !== null ? selectedCodon : activeCodonIdx;
    clearCodonBtn.hidden = selectedCodon === null;
    if (focusIdx == null || focusIdx < 0 || focusIdx >= codons.length) {
      setText(codonReadout, 'Tap a codon to highlight its mRNA triplet, tRNA anticodon, and amino acid in 3D.');
      return;
    }
    const cod = codons[focusIdx];
    if (cod.isStop) {
      setText(codonReadout, `Codon #${cod.number}: 5′-${cod.triplet}-3′ → recognised by Release Factor RF1 in the A site (no tRNA, 0 aa added).`);
    } else {
      const siteHint = cod.isInitiator
        ? 'Initiator fMet-tRNA (enters P site)'
        : `Cognate ${cod.aa3}-tRNA (anticodon 3′-${cod.anticodon3to5}-5′)`;
      setText(codonReadout, `Codon #${cod.number}: 5′-${cod.triplet}-3′ → ${cod.aa3} (${cod.aaName}) · ${siteHint}`);
    }
  }

  function paintPeptideMade() {
    residuePills.forEach((pill, i) => pill.classList.toggle('is-made', i < peptideMade));
  }

  function paintCodons(scroll = false) {
    codonCells.forEach((cell, i) => {
      const isSel = i === selectedCodon;
      const isAct = i === activeCodonIdx;
      if (cell.getAttribute('aria-selected') !== String(isSel)) {
        cell.setAttribute('aria-selected', String(isSel));
      }
      cell.classList.toggle('is-active', isAct);
    });
    residuePills.forEach((pill, i) => {
      pill.classList.toggle('is-selected', i === selectedCodon);
      pill.classList.toggle('is-active', i === activeCodonIdx);
    });
    updateCodonReadout();

    const targetIdx = selectedCodon !== null ? selectedCodon : activeCodonIdx;
    if (scroll && targetIdx !== null && targetIdx >= 0 && codonCells[targetIdx]) {
      const c = codonCells[targetIdx];
      const stripRect = codonStrip.getBoundingClientRect();
      const cellRect = c.getBoundingClientRect();
      const cellLeft = cellRect.left - stripRect.left + codonStrip.scrollLeft;
      const target = Math.max(0, cellLeft - (codonStrip.clientWidth - cellRect.width) / 2);
      if (Math.abs(codonStrip.scrollLeft - target) > 4) {
        const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
        codonStrip.scrollTo({ left: target, behavior: reduced ? 'auto' : 'smooth' });
      }
    }
  }

  function selectCodon(c) {
    const next = (c !== null && c !== undefined && c >= 0 && c < codons.length) ? c : null;
    selectedCodon = next;
    paintCodons(true);
    send('selectCodon', next);
  }

  function stepCodon(dir) {
    const n = codons.length;
    if (!n) return;
    const base = selectedCodon !== null ? selectedCodon : (activeCodonIdx >= 0 ? activeCodonIdx : (dir > 0 ? -1 : n));
    const next = clamp(base + dir, 0, n - 1);
    selectCodon(next);
  }

  const codonCard = h('div', { class: 'card codon-card' },
    h('div', { class: 'card-title' },
      h('h3', {}, 'Codon & polypeptide table'),
      h('div', { class: 'codon-nav' }, clearCodonBtn, prevCodonBtn, nextCodonBtn)),
    codonStrip,
    codonReadout,
    peptideChainEl);

  buildCodonStrip();

  // ---- Item 8: Live stats (4 big stats in 2x2 grid) ---------------------------------------------
  const C = {
    mrna: stat({ label: 'mRNA', unit: '/ 179 nt', big: true }),
    hybrid: stat({ label: 'RNA·DNA hybrid', unit: 'bp', big: true }),
    codon: stat({ label: 'Codon', unit: '', big: true }),
    peptide: stat({ label: 'Peptide', unit: '/ 40 aa', big: true }),
  };
  C.mrna.set('0');
  C.hybrid.set('0');
  C.codon.set('—');
  C.peptide.set('0');

  const statsGrid = h('div', { class: 'stats stats-2' }, Object.values(C).map(c => c.el));

  // ---- Item 9: Inspection card ------------------------------------------------------------------
  const inspectTitle = h('h3', {}, 'Inspect');
  const inspectClearBtn = h('button', {
    type: 'button',
    class: 'icon-btn icon-btn-sm',
    'aria-label': 'Clear selection',
    hidden: true,
    onclick: () => {
      renderInspect(null);
      send('clearInspect');
    },
  }, icon('close', 16));

  const inspectEmpty = h('p', { class: 'note' },
    'Click or tap a molecule to see what it is and where its structure comes from.');
  const inspectRole = h('p', { class: 'inspect-role' });
  const inspectSourceDd = h('dd');
  const inspectOrganismDd = h('dd');
  const inspectMethodDd = h('dd');
  const inspectChainsDd = h('dd');
  const inspectDetailDd = h('dd');
  const inspectSimpList = h('ul');

  const inspectDl = h('dl', { class: 'inspect-dl' },
    h('dt', {}, 'Source'), inspectSourceDd,
    h('dt', {}, 'Organism'), inspectOrganismDd,
    h('dt', {}, 'Method'), inspectMethodDd,
    h('dt', {}, 'Chains shown'), inspectChainsDd,
    h('dt', {}, 'Detail level'), inspectDetailDd,
    h('dt', {}, 'Simplifications'), h('dd', {}, inspectSimpList));

  const inspectFilled = h('div', { hidden: true }, inspectRole, inspectDl);

  function renderInspect(info) {
    lastInspectRef = info;
    if (!info) {
      setText(inspectTitle, 'Inspect');
      inspectClearBtn.hidden = true;
      inspectEmpty.hidden = false;
      inspectFilled.hidden = true;
      return;
    }

    setText(inspectTitle, info.name || info.label || 'Inspect');
    inspectClearBtn.hidden = false;
    inspectEmpty.hidden = true;
    inspectFilled.hidden = false;

    setText(inspectRole, info.role || '');

    // Source row: label (e.g. "PDB 7K00") + optional click-only RCSB link.
    inspectSourceDd.replaceChildren();
    const srcObj = typeof info.source === 'object' && info.source !== null ? info.source : null;
    const pdbId = info.pdbId || (srcObj && srcObj.pdbId) || null;
    const srcText = (typeof info.source === 'string' && info.source)
      || (srcObj && srcObj.label)
      || (pdbId ? `PDB ${pdbId}` : 'Procedural');
    const rcsbUrl = info.rcsbUrl
      || info.sourceUrl
      || (srcObj && srcObj.url)
      || (pdbId ? `https://www.rcsb.org/structure/${encodeURIComponent(pdbId)}` : null);
    inspectSourceDd.append(srcText);
    if (rcsbUrl) {
      inspectSourceDd.append(' ', h('a', {
        class: 'link-btn',
        href: rcsbUrl,
        target: '_blank',
        rel: 'noopener',
      }, 'RCSB ↗'));
    }

    setText(inspectOrganismDd, info.organism || '—');
    setText(inspectMethodDd, info.method || '—');
    setText(inspectChainsDd, info.chainsShown ?? info.chains ?? '—');
    setText(inspectDetailDd, info.detailLevel ?? info.detail ?? '—');

    const bullets = Array.isArray(info.simplifications)
      ? info.simplifications.slice(0, 3)
      : (info.simplifications ? [String(info.simplifications)] : []);
    inspectSimpList.replaceChildren(...bullets.map(text => h('li', {}, text)));
  }

  const inspectCard = h('div', { class: 'card inspect-card' },
    h('div', { class: 'card-title' }, inspectTitle, inspectClearBtn),
    inspectEmpty,
    inspectFilled);

  // ---- Item 10: Legend card ---------------------------------------------------------------------
  const legendList = h('ul', { class: 'legend' });

  function renderLegendItems(items) {
    legendList.replaceChildren(...items.map(it => {
      const color = typeof it.color === 'number' ? hex(it.color) : it.color;
      return h('li', {},
        h('span', { class: `swatch swatch-${it.kind || 'strand'}`, style: { '--sw': color } }),
        it.label);
    }));
  }

  function setLegend(items) {
    if (!items) {
      customLegend = false;
      renderLegendItems(storyLegend(currentMode));
      return;
    }
    customLegend = true;
    renderLegendItems(items);
  }

  renderLegendItems(storyLegend(currentMode));

  const legendCard = h('div', { class: 'card' },
    h('div', { class: 'card-title' }, h('h3', {}, 'Legend')),
    legendList);

  // ---- Item 11: What you are seeing (PLAN.md §4.10) ---------------------------------------------
  const explain = h('div', { class: 'explain' },
    h('h3', { class: 'label' }, 'What you are seeing'),
    h('p', {},
      'A 248-base-pair synthetic gene in ',
      h('em', {}, 'E. coli'),
      '. RNA polymerase copies its template strand into a 179-nucleotide mRNA; a ribosome then reads 40 codons of that mRNA and joins 40 amino acids into a peptide. Every molecule is drawn at its real size.'),
    h('p', { class: 'note' },
      'Machines come from cryo-EM and X-ray structures listed under Sources. DNA, RNA, tRNA anticodons and the peptide are built atom by atom and moved between positions taken from those structures. Motion between structures is interpolated, not simulated.'));

  // ---- Root section (exact PLAN.md §4.8 item order 1..11) ---------------------------------------
  const el = h('section', {
    class: 'view',
    id: 'view-express',
    'aria-labelledby': 'tab-express',
    role: 'tabpanel',
    hidden: true,
  },
    viewHead,
    peek,
    modeSpeedGroup,
    cameraGroup,
    tilesGroup,
    chapterCard,
    codonCard,
    statsGrid,
    inspectCard,
    legendCard,
    explain);

  // ---- State updater (accepts full UiState and main.js placeholder keys) ------------------------
  function setState(s) {
    if (!s) return;

    if ('mode' in s && (s.mode === 'sequential' || s.mode === 'coupled')) {
      const modeChanged = s.mode !== currentMode;
      currentMode = s.mode;
      modeSeg.set(currentMode);
      if (modeChanged && !customLegend) renderLegendItems(storyLegend(currentMode));
    }

    if ('speed' in s && s.speed != null) {
      const speedChanged = s.speed !== currentSpeed;
      currentSpeed = s.speed;
      speedSeg.set(currentSpeed);
      if (speedChanged) updateChapterDurations();
    }

    if (Array.isArray(s.chapters) && s.chapters.length) {
      const nextSig = chaptersSignature(s.chapters);
      if (s.chapters !== chapters && nextSig !== chapSig) {
        chapters = s.chapters;
        chapSig = nextSig;
        totalDuration = Number.isFinite(s.duration) && s.duration > 0 ? s.duration : totalDurationOf(chapters);
        buildChapters();
      } else if (Number.isFinite(s.duration) && s.duration > 0 && s.duration !== totalDuration) {
        totalDuration = s.duration;
        updateChapterDurations();
      }
    } else if (Number.isFinite(s.duration) && s.duration > 0 && s.duration !== totalDuration) {
      totalDuration = s.duration;
      updateChapterDurations();
    }

    if ('playing' in s && !!s.playing !== playing) setPlaying(s.playing);

    if ('progress' in s && Number.isFinite(s.progress)) {
      progress = clamp(s.progress, 0, 1);
      if (!scrubbing) scrub.set(Math.round(progress * 1000));
      paintPct();
    }

    if ('cameraOption' in s && s.cameraOption) cameraSeg.set(s.cameraOption);
    else if ('cameraMode' in s && s.cameraMode) cameraSeg.set(s.cameraMode);

    if ('tier' in s && s.tier === 'low' && !crowdingUserSet && !(s.toggles && 'crowding' in s.toggles) && !('crowding' in s)) {
      toggles.crowding = false;
      crowdingTile.set(false);
    }

    const tSrc = s.toggles || null;
    const nextCutaway = tSrc && 'cutaway' in tSrc ? tSrc.cutaway : ('cutaway' in s ? s.cutaway : undefined);
    const nextLabels = tSrc && 'labels' in tSrc ? tSrc.labels : ('labels' in s ? s.labels : undefined);
    const nextCrowding = tSrc && 'crowding' in tSrc ? tSrc.crowding : ('crowding' in s ? s.crowding : undefined);
    if (nextCutaway !== undefined) { toggles.cutaway = !!nextCutaway; cutawayTile.set(toggles.cutaway); }
    if (nextLabels !== undefined) { toggles.labels = !!nextLabels; labelsTile.set(toggles.labels); }
    if (nextCrowding !== undefined) { toggles.crowding = !!nextCrowding; crowdingTile.set(toggles.crowding); }

    if ('chapterIndex' in s && Number.isInteger(s.chapterIndex)) {
      setActiveChapter(s.chapterIndex, false, s.phaseLevel || null);
    } else if ('phase' in s && s.phase) {
      setText(phase, s.phase);
      if (s.phaseLevel) phase.dataset.level = s.phaseLevel;
    } else if ('phaseLevel' in s && s.phaseLevel) {
      phase.dataset.level = s.phaseLevel;
    }

    if ('caption' in s && s.caption != null && caption.textContent !== s.caption) {
      caption.textContent = s.caption;
    }

    if (Array.isArray(s.codons) && s.codons.length && s.codons !== codons) {
      codons = s.codons;
      C.peptide.setUnit(`/ ${senseCodonCount()} aa`);
      buildCodonStrip();
    }

    if ('selectedCodon' in s && s.selectedCodon !== selectedCodon) {
      selectedCodon = s.selectedCodon;
    }

    // Counters (accepts UiState.counters or main.js placeholder keys).
    const ctr = s.counters || null;
    const mrnaVal = ctr && 'mrna' in ctr ? ctr.mrna : ('rnaLength' in s ? s.rnaLength : ('rnaCount' in s ? s.rnaCount : undefined));
    if (mrnaVal !== undefined && mrnaVal !== null) C.mrna.set(String(mrnaVal));

    const hybridVal = ctr && 'hybrid' in ctr ? ctr.hybrid : ('hybridCount' in s ? s.hybridCount : undefined);
    if (hybridVal !== undefined && hybridVal !== null) C.hybrid.set(String(hybridVal));

    const hasCodon = (ctr && 'codon' in ctr) || 'activeCodon' in s || 'codonIndex' in s;
    if (hasCodon) {
      let codonNum = 0;
      if (ctr && 'codon' in ctr && ctr.codon != null) {
        codonNum = ctr.codon;
      } else if ('activeCodon' in s) {
        const ac = s.activeCodon;
        if (typeof ac === 'number') codonNum = ac;
        else if (ac && typeof ac === 'object') codonNum = ac.number ?? (ac.index != null ? ac.index + 1 : 0);
      } else if ('codonIndex' in s && s.codonIndex != null) {
        codonNum = s.codonIndex;
      }

      const sense = senseCodonCount();
      const prevAct = activeCodonIdx;
      if (codonNum > 0 && codonNum <= codons.length) {
        activeCodonIdx = codonNum - 1;
        const cObj = codons[activeCodonIdx];
        if (cObj && cObj.isStop) C.codon.set(cObj.triplet || 'UAA');
        else C.codon.set(`${codonNum} / ${sense}`);
      } else {
        activeCodonIdx = -1;
        C.codon.set('—');
      }
      paintCodons(prevAct !== activeCodonIdx && selectedCodon === null);
    } else if ('selectedCodon' in s) {
      paintCodons(false);
    }

    const pepVal = ctr && 'peptide' in ctr
      ? ctr.peptide
      : ('peptideLength' in s ? s.peptideLength
        : ('peptideCount' in s ? s.peptideCount
          : (Array.isArray(s.peptideSeq) ? s.peptideSeq.length : undefined)));
    if (pepVal !== undefined && pepVal !== null) {
      peptideMade = pepVal;
      C.peptide.set(String(pepVal));
      paintPeptideMade();
    }

    if ('inspect' in s && s.inspect !== lastInspectRef) {
      renderInspect(s.inspect);
    }
  }

  return {
    el,
    setState,
    setLegend,
    togglePlay,
    stepChapter,
    restart,
    isPlaying: () => playing,
  };
}
