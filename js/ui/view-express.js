// "Express" mode: bacterial transcription (DNA -> mRNA) & translation (mRNA -> polypeptide) transport,
// camera follow, active-site cutaway, interactive 12-codon & polypeptide inspector strip, live stats, and legend.
import { h, hex, setText, rafThrottle } from './dom.js';
import { icon } from './icons.js';
import { segmented, toggleTile, range, stat, sectionLabel } from './components.js';

export const DEFAULT_EXPRESS_LEGEND = [
  { id: 'coding', label: 'Coding DNA (5′→3′)', color: '#74c0fc', kind: 'strand' },
  { id: 'template', label: 'Template DNA (3′→5′)', color: '#9fb2dc', kind: 'strand' },
  { id: 'mrna', label: 'mRNA transcript (2′-OH)', color: '#ff8a3d', kind: 'strand' },
  { id: 'trna', label: 'tRNA anticodon', color: '#ffd43b', kind: 'strand' },
  { id: 'peptide', label: 'Nascent peptide', color: '#b197fc', kind: 'strand' },
  { id: 'rnap', label: 'RNA polymerase', color: '#4fb6ff', kind: 'blob' },
  { id: 'ribosome', label: '30S / 50S Ribosome', color: '#38d9a9', kind: 'blob' },
  { id: 'rf1', label: 'Release factor RF1', color: '#ff6b6b', kind: 'blob' },
];

export const DEFAULT_CODONS = [
  { index: 0, number: 1, triplet: 'AUG', anticodon3to5: 'UAC', aa3: 'fMet', aa1: 'M', aaName: 'N-Formylmethionine', color: 0xffd43b, isInitiator: true, isStop: false },
  { index: 1, number: 2, triplet: 'GCU', anticodon3to5: 'CGA', aa3: 'Ala', aa1: 'A', aaName: 'Alanine', color: 0x74c0fc, isInitiator: false, isStop: false },
  { index: 2, number: 3, triplet: 'GAA', anticodon3to5: 'CUU', aa3: 'Glu', aa1: 'E', aaName: 'Glutamate', color: 0xff6b6b, isInitiator: false, isStop: false },
  { index: 3, number: 4, triplet: 'UUU', anticodon3to5: 'AAA', aa3: 'Phe', aa1: 'F', aaName: 'Phenylalanine', color: 0xb197fc, isInitiator: false, isStop: false },
  { index: 4, number: 5, triplet: 'AAA', anticodon3to5: 'UUU', aa3: 'Lys', aa1: 'K', aaName: 'Lysine', color: 0x4dabf7, isInitiator: false, isStop: false },
  { index: 5, number: 6, triplet: 'GGU', anticodon3to5: 'CCA', aa3: 'Gly', aa1: 'G', aaName: 'Glycine', color: 0x96f2d7, isInitiator: false, isStop: false },
  { index: 6, number: 7, triplet: 'UCU', anticodon3to5: 'AGA', aa3: 'Ser', aa1: 'S', aaName: 'Serine', color: 0x63e6be, isInitiator: false, isStop: false },
  { index: 7, number: 8, triplet: 'GAC', anticodon3to5: 'CUG', aa3: 'Asp', aa1: 'D', aaName: 'Aspartate', color: 0xff8787, isInitiator: false, isStop: false },
  { index: 8, number: 9, triplet: 'UAC', anticodon3to5: 'AUG', aa3: 'Tyr', aa1: 'Y', aaName: 'Tyrosine', color: 0xda77f2, isInitiator: false, isStop: false },
  { index: 9, number: 10, triplet: 'CAA', anticodon3to5: 'GUU', aa3: 'Gln', aa1: 'Q', aaName: 'Glutamine', color: 0x38d9a9, isInitiator: false, isStop: false },
  { index: 10, number: 11, triplet: 'GCU', anticodon3to5: 'CGA', aa3: 'Ala', aa1: 'A', aaName: 'Alanine', color: 0x74c0fc, isInitiator: false, isStop: false },
  { index: 11, number: 12, triplet: 'UAA', anticodon3to5: 'RF1', aa3: 'Stop', aa1: '*', aaName: 'Stop (RF1)', color: 0xff6b6b, isInitiator: false, isStop: true },
];

const PHASE_LABELS = {
  promoter: { label: 'Promoter open', level: 'closed' },
  transcription: { label: 'Transcription', level: 'mid' },
  initiation: { label: '70S Initiation', level: 'mid' },
  elongation: { label: 'Translation', level: 'open' },
  termination: { label: 'RF1 Termination', level: 'open' },
  complete: { label: 'Complete', level: 'closed' },
};

export function createExpressView(ctx) {
  const { H } = ctx;
  let playing = false, scrubbing = false, progress = 0;
  let codons = DEFAULT_CODONS;
  let activeCodonIdx = -1;
  let selectedCodon = null;
  let totalRna = 44;
  let totalPeptide = 11;

  const send = (action, value) => H.onExpression(value === undefined ? { action } : { action, value });

  // ---- transport & peek -----------------------------------------------------------------------
  const playBtn = h('button', {
    type: 'button', class: 'btn-play', 'aria-label': 'Play',
    onclick: () => { setPlaying(!playing); send(playing ? 'play' : 'pause'); },
  }, icon('play', 22));
  const restartBtn = h('button', {
    type: 'button', class: 'icon-btn', 'aria-label': 'Restart',
    onclick: () => { setPlaying(true); send('restart'); },
  }, icon('restart', 20));
  const seek = rafThrottle(v => send('seek', v));
  const scrub = range({
    min: 0, max: 1000, step: 1, value: 0, label: 'Gene expression progress', className: 'range-scrub',
    onInput: v => { progress = v / 1000; paintPct(); seek(progress); },
  });
  scrub.el.addEventListener('pointerdown', () => { scrubbing = true; });
  const endScrub = () => { scrubbing = false; };
  scrub.el.addEventListener('pointerup', endScrub);
  scrub.el.addEventListener('pointercancel', endScrub);
  scrub.el.addEventListener('blur', endScrub);

  const pct = h('span', { class: 'pct' }, '0\u202f%');
  const caption = h('p', { class: 'caption', 'aria-live': 'polite', 'aria-atomic': 'true' },
    'Press play to watch RNA polymerase transcribe the gene into mRNA and the 70S ribosome translate it into an 11-residue polypeptide.');
  const phase = h('span', { class: 'phase', 'data-level': 'closed' }, 'Ready');

  function paintPct() { setText(pct, `${Math.round(progress * 100)}\u202f%`); }
  function setPlaying(p) {
    playing = !!p;
    playBtn.replaceChildren(icon(playing ? 'pause' : 'play', 22));
    playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    playBtn.classList.toggle('is-playing', playing);
  }

  // ---- controls: speed, camera follow, cutaway ------------------------------------------------
  const speed = segmented({
    label: 'Playback speed', value: 1, className: 'seg-sm',
    options: [{ value: 0.5, label: '0.5×' }, { value: 1, label: '1×' }, { value: 2, label: '2×' }],
    onChange: v => send('speed', v),
  });

  const camera = segmented({
    label: 'Camera follow', value: 'overview', className: 'seg-sm',
    options: [
      { value: 'overview', label: 'Overview' },
      { value: 'rnap', label: 'RNAP' },
      { value: 'ribosome', label: 'Ribosome' },
      { value: 'peptide', label: 'Peptide' },
    ],
    onChange: v => send('camera', v),
  });

  const cutawayTile = toggleTile({
    label: 'Cutaway active sites (RNAP & 50S)',
    hint: 'Cross-section macromolecular envelopes to reveal the RNA·DNA hybrid and peptidyl transferase center',
    className: 'tile-wide',
    onChange: v => send('cutaway', v),
  });
  cutawayTile.set(true);

  // ---- interactive codon & polypeptide strip --------------------------------------------------
  const codonStrip = h('div', {
    class: 'strip codon-strip h-scroll',
    role: 'listbox',
    'aria-orientation': 'horizontal',
    'aria-label': 'mRNA codons and translated amino acids',
  });
  const prevCodonBtn = h('button', { type: 'button', class: 'icon-btn icon-btn-sm', 'aria-label': 'Previous codon', onclick: () => stepCodon(-1) }, icon('left', 18));
  const nextCodonBtn = h('button', { type: 'button', class: 'icon-btn icon-btn-sm', 'aria-label': 'Next codon', onclick: () => stepCodon(1) }, icon('right', 18));
  const clearCodonBtn = h('button', {
    type: 'button', class: 'link-btn', hidden: true,
    onclick: () => selectCodon(null),
  }, 'Clear');
  const codonReadout = h('p', { class: 'codon-readout' }, 'Tap a codon to highlight its mRNA triplet, tRNA anticodon, and amino acid in 3D.');
  const peptideChainEl = h('div', { class: 'peptide-chain', 'aria-label': 'Nascent polypeptide chain' });

  let codonCells = [];
  let residuePills = [];

  function buildCodonStrip() {
    codonStrip.replaceChildren();
    codonCells = [];

    // 5' UTR (AGGAGG Shine-Dalgarno) badge preceding the 12 codons
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
      const bases = [...cod.triplet].map(b => h('span', { class: 'ccell-b', style: { color: ctx.col(b) } }, b));
      const cell = h('button', {
        type: 'button',
        role: 'option',
        class: `ccell ${cod.isStop ? 'ccell-stop' : ''} ${cod.isInitiator ? 'ccell-init' : ''}`,
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

    // Build nascent peptide pill chain (11 sense residues)
    peptideChainEl.replaceChildren();
    residuePills = [];
    codons.forEach((cod, i) => {
      if (cod.isStop) return;
      const aaColor = typeof cod.color === 'number' ? hex(cod.color) : (cod.color || '#74c0fc');
      const pill = h('button', {
        type: 'button',
        class: 'pep-pill',
        title: `Residue ${i + 1}: ${cod.aaName} (codon #${cod.number} ${cod.triplet})`,
        style: { '--aa': aaColor },
        onclick: () => selectCodon(selectedCodon === i ? null : i),
      }, cod.isInitiator ? 'fMet' : cod.aa1);
      residuePills.push(pill);
      peptideChainEl.append(pill);
    });

    paintCodons(false);
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
      setText(codonReadout, `Codon #${cod.number}: 5′-${cod.triplet}-3′ → recognized by Release Factor RF1 in the A-site (no tRNA, 0 aa added).`);
    } else {
      const siteHint = cod.isInitiator ? 'Initiator fMet-tRNAfMet (enters P-site)' : `Cognate ${cod.aa3}-tRNA (anticodon 3′-${cod.anticodon3to5}-5′)`;
      setText(codonReadout, `Codon #${cod.number}: 5′-${cod.triplet}-3′ → ${cod.aa3} (${cod.aaName}) · ${siteHint}`);
    }
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
      const target = c.offsetLeft - (codonStrip.clientWidth - c.offsetWidth) / 2;
      if (Math.abs(codonStrip.scrollLeft - target) > 4) {
        codonStrip.scrollTo({
          left: target,
          behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        });
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
    const next = Math.min(n - 1, Math.max(0, base + dir));
    selectCodon(next);
  }

  buildCodonStrip();

  // ---- live stats -----------------------------------------------------------------------------
  const C = {
    mrna: stat({ label: 'mRNA transcribed', unit: `/ ${totalRna} nt`, big: true }),
    hybrid: stat({ label: 'RNA·DNA hybrid', unit: 'bp', big: true }),
    codon: stat({ label: 'Active codon', unit: '', big: true }),
    peptide: stat({ label: 'Nascent peptide', unit: `/ ${totalPeptide} aa`, big: true }),
  };
  C.mrna.set('0');
  C.hybrid.set('0');
  C.codon.set('—');
  C.peptide.set('0');

  // ---- legend ---------------------------------------------------------------------------------
  const legendList = h('ul', { class: 'legend' });
  function setLegend(items) {
    legendList.replaceChildren(...items.map(it => h('li', {},
      h('span', { class: `swatch swatch-${it.kind || 'strand'}`, style: { '--sw': it.color } }),
      it.label)));
  }
  setLegend(DEFAULT_EXPRESS_LEGEND);

  // ---- view root ------------------------------------------------------------------------------
  const el = h('section', { class: 'view', id: 'view-express', 'aria-labelledby': 'tab-express', role: 'tabpanel', hidden: true },
    h('header', { class: 'view-head' },
      h('h2', {}, 'Express the gene'),
      h('p', {}, 'Transcription (DNA → mRNA) & translation (mRNA → polypeptide).')),
    h('div', { class: 'peek' },
      h('div', { class: 'transport' }, playBtn, restartBtn, h('div', { class: 'scrub' }, scrub.el), pct),
      caption),
    h('div', { class: 'group row-between' },
      h('div', { class: 'grow' }, sectionLabel('Speed'), speed.el),
      phase),
    h('div', { class: 'group' },
      sectionLabel('Camera follow'),
      camera.el),
    h('div', { class: 'group' },
      cutawayTile.el),
    h('div', { class: 'card codon-card' },
      h('div', { class: 'card-title' },
        h('h3', {}, 'Codon & polypeptide table'),
        h('div', { class: 'codon-nav' }, clearCodonBtn, prevCodonBtn, nextCodonBtn)),
      codonStrip,
      codonReadout,
      peptideChainEl),
    h('div', { class: 'stats stats-2' }, Object.values(C).map(c => c.el)),
    h('div', { class: 'card' },
      h('div', { class: 'card-title' }, h('h3', {}, 'Legend')),
      legendList),
    h('div', { class: 'explain' },
      h('h3', { class: 'label' }, 'What you are seeing'),
      h('p', {}, 'Bacterial RNA polymerase recognises the −10 TATA promoter, opens a ~12-bp transcription bubble, and synthesises a single-stranded mRNA (5′→3′, with 2′-OH ribose and uracil) complementary to the 3′→5′ template strand while parental DNA re-anneals behind it. The 30S ribosomal subunit binds the 5′ UTR Shine–Dalgarno motif (AGGAGG), initiator fMet-tRNAfMet enters the P-site directly at AUG, elongator aa-tRNAs decode sense codons 2–11 through the A→P→E cycle as the nascent chain threads out of the 50S exit tunnel, and Release Factor 1 (RF1) recognises the UAA stop codon to release the 11-residue polypeptide without adding a stop residue.'),
      h('p', { class: 'note' }, 'Pedagogical simplification: macromolecular complexes (RNAP, 30S/50S subunits, tRNAs, and RF1) are shown as translucent envelopes with active-site cutaways so atomic base pairing and peptide bond formation remain clearly visible at 60 fps.')));

  return {
    el,
    setState(s) {
      if (!s) return;
      if (s.construct && Array.isArray(s.construct.codons) && s.construct.codons !== codons) {
        codons = s.construct.codons;
        totalRna = s.construct.mrnaLength || 44;
        totalPeptide = s.construct.residues ? s.construct.residues.length : 11;
        C.mrna.setUnit(`/ ${totalRna} nt`);
        C.peptide.setUnit(`/ ${totalPeptide} aa`);
        buildCodonStrip();
      }
      if ('playing' in s && !!s.playing !== playing) setPlaying(s.playing);
      if ('progress' in s && Number.isFinite(s.progress)) {
        progress = s.progress;
        if (!scrubbing) scrub.set(Math.round(s.progress * 1000));
        paintPct();
      }
      if ('speed' in s && s.speed != null) speed.set(s.speed);
      if ('cameraMode' in s && s.cameraMode) camera.set(s.cameraMode);
      if ('cutaway' in s && s.cutaway != null) cutawayTile.set(!!s.cutaway);
      if ('caption' in s && s.caption && caption.textContent !== s.caption) {
        caption.textContent = s.caption;
      }
      if ('phase' in s && s.phase) {
        const pInfo = PHASE_LABELS[s.phase] || { label: s.phase, level: 'mid' };
        setText(phase, pInfo.label);
        phase.dataset.level = pInfo.level;
      }
      if ('rnaLength' in s || 'rnaCount' in s) {
        const rLen = s.rnaLength ?? s.rnaCount ?? 0;
        C.mrna.set(String(rLen));
      }
      if ('hybridCount' in s) {
        C.hybrid.set(String(s.hybridCount ?? 0));
      }
      if ('selectedCodon' in s && s.selectedCodon !== selectedCodon) {
        selectedCodon = s.selectedCodon;
      }
      if ('codonIndex' in s) {
        const prevAct = activeCodonIdx;
        activeCodonIdx = s.codonIndex ?? -1;
        const cObj = s.activeCodon || (activeCodonIdx >= 0 && activeCodonIdx < codons.length ? codons[activeCodonIdx] : null);
        if (cObj) {
          C.codon.set(`${cObj.triplet} · ${cObj.isStop ? 'RF1' : cObj.aa3}`);
          C.codon.setUnit(`#${cObj.number}`);
        } else {
          C.codon.set('—');
          C.codon.setUnit('');
        }
        paintCodons(prevAct !== activeCodonIdx && selectedCodon === null);
      } else {
        paintCodons(false);
      }
      if ('peptideLength' in s || 'peptideCount' in s) {
        const pLen = s.peptideLength ?? s.peptideCount ?? 0;
        C.peptide.set(String(pLen));
        residuePills.forEach((pill, i) => pill.classList.toggle('is-made', i < pLen));
      }
    },
    setLegend,
    togglePlay() { setPlaying(!playing); send(playing ? 'play' : 'pause'); },
    stepCodon,
    isPlaying: () => playing,
  };
}
