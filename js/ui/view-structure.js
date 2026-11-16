// "Explore" mode: representation, colour scheme, toggles, sequence editor, helix dimensions.
import { h, debounce, fmt, setText } from './dom.js';
import { icon } from './icons.js';
import { segmented, toggleTile, stat, sectionLabel } from './components.js';

export const MIN_BP = 4, MAX_BP = 40;
export const PRESETS = [
  { label: 'Dickerson dodecamer', seq: 'CGCGAATTCGCG', note: 'The 12-mer crystallised as PDB 1BNA' },
  { label: 'TATA box', seq: 'GGGTATAAAAGGGC', note: 'Promoter element, very AT-rich' },
  { label: 'EcoRI site', seq: 'CCGAATTCGG', note: 'GAATTC (restriction site) inside GC flanks' },
  { label: 'Human telomere', seq: 'TTAGGGTTAGGGTTAGGGTTAGGG', note: '(TTAGGG)×4 repeat' },
  { label: 'GC-rich', seq: 'GCCGCGGCGCCGCGGC', note: 'Three H-bonds per pair: melts late' },
  { label: 'AT-rich', seq: 'ATTATAATATTAATAATTAT', note: 'Two H-bonds per pair: melts early' },
];
const COMP = { A: 'T', T: 'A', G: 'C', C: 'G' };

export function createStructureView(ctx) {
  const { H } = ctx;
  let style = {};
  let lastEmitted = '';
  let current = '';

  // --- representation + colour ---------------------------------------------------------------
  const rep = segmented({
    label: 'Representation', value: 'ballstick',
    options: [{ value: 'ballstick', label: 'Ball & stick' }, { value: 'spacefill', label: 'Space-filling' }, { value: 'cartoon', label: 'Cartoon' }],
    onChange: v => H.onStyle({ representation: v }),
  });
  const colour = segmented({
    label: 'Colour scheme', value: 'element', className: 'seg-sm',
    options: [{ value: 'element', label: 'Element' }, { value: 'base', label: 'Base' }, { value: 'strand', label: 'Strand' }, { value: 'part', label: 'Part' }],
    onChange: v => { H.onStyle({ color: v }); ctx.onColourPicked && ctx.onColourPicked(v); },
  });

  // --- toggles ---------------------------------------------------------------------------------
  const TOGGLES = [['hbonds', 'Hydrogen bonds'], ['grooves', 'Grooves'], ['axis', 'Helix axis'], ['labels', 'Base labels'], ['autoRotate', 'Auto-rotate']];
  const tiles = {};
  const tileEls = TOGGLES.map(([key, label]) => {
    const t = toggleTile({ label, className: key === 'autoRotate' ? 'tile-wide' : '', onChange: v => H.onStyle({ [key]: v }) });
    tiles[key] = t; return t.el;
  });

  // --- sequence editor -------------------------------------------------------------------------
  const input = h('input', {
    id: 'seq-input', class: 'seq-input', type: 'text', value: '', autocomplete: 'off', autocapitalize: 'characters',
    autocorrect: 'off', spellcheck: 'false', inputmode: 'text', enterkeyhint: 'done', maxlength: '80',
    'aria-describedby': 'seq-msg', 'aria-label': 'DNA sequence, 5 prime to 3 prime',
  });
  const count = h('span', { class: 'seq-count' }, '0 bp');
  const msg = h('div', { id: 'seq-msg', class: 'seq-msg', role: 'status', 'aria-live': 'polite' });
  const duplex = h('div', { class: 'duplex', role: 'img' });
  const chipEls = PRESETS.map(p => h('button', { type: 'button', class: 'chip', title: `${p.seq} — ${p.note}`, onclick: () => applyPreset(p.seq) }, p.label));

  const emit = debounce(seq => { if (seq !== lastEmitted) { lastEmitted = seq; H.onSequence(seq); } }, 380);

  let flashTimer = 0;
  function flash(text) {
    msg.className = 'seq-msg is-warn'; msg.textContent = text;
    clearTimeout(flashTimer); flashTimer = setTimeout(validate, 2200);
  }
  function validate() {
    const n = current.length;
    setText(count, `${n} bp`);
    let ok = n >= MIN_BP && n <= MAX_BP;
    if (n < MIN_BP) {
      msg.className = 'seq-msg is-warn';
      setText(msg, n === 0 ? `Type ${MIN_BP}–${MAX_BP} bases using A, C, G, T.` : `Add ${MIN_BP - n} more base${MIN_BP - n > 1 ? 's' : ''} (minimum ${MIN_BP}).`);
    } else {
      const gc = [...current].filter(b => b === 'G' || b === 'C').length;
      msg.className = 'seq-msg';
      setText(msg, `${n} base pairs \u00b7 GC ${Math.round(gc / n * 100)}\u202f%`);
    }
    input.classList.toggle('is-invalid', !ok);
    input.setAttribute('aria-invalid', String(!ok));
    return ok;
  }
  function renderDuplex() {
    duplex.replaceChildren();
    const n = current.length;
    if (!n) { duplex.append(h('div', { class: 'duplex-empty' }, 'Your sequence and its complementary strand appear here.')); duplex.setAttribute('aria-label', 'No sequence'); return; }
    const chunks = Math.ceil(n / 18), size = Math.ceil(n / chunks);
    for (let c = 0; c < chunks; c++) {
      const part = current.slice(c * size, (c + 1) * size);
      const k = part.length;
      const g = h('div', { class: 'dx-block', style: { '--k': k } });
      g.append(h('span', { class: 'dx-end' }, c === 0 ? '5′' : '…'));
      for (const b of part) g.append(h('span', { class: 'dx-b', style: { color: ctx.col(b) } }, b));
      g.append(h('span', { class: 'dx-end' }, c === chunks - 1 ? '3′' : '…'));
      g.append(h('span'));
      for (let i = 0; i < k; i++) g.append(h('span', { class: 'dx-tick' }));
      g.append(h('span'));
      g.append(h('span', { class: 'dx-end' }, c === 0 ? '3′' : '…'));
      for (const b of part) g.append(h('span', { class: 'dx-b', style: { color: ctx.col(COMP[b]) } }, COMP[b]));
      g.append(h('span', { class: 'dx-end' }, c === chunks - 1 ? '5′' : '…'));
      duplex.append(g);
    }
    duplex.setAttribute('aria-label', `Strand 5 to 3: ${current.split('').join(' ')}. Complement 3 to 5: ${[...current].map(b => COMP[b]).join(' ')}`);
    chipEls.forEach((c, i) => c.classList.toggle('is-on', PRESETS[i].seq === current));
  }
  function refresh() { const ok = validate(); renderDuplex(); return ok; }

  input.addEventListener('input', () => {
    const raw = input.value.toUpperCase();
    let cleaned = raw.replace(/[^ACGT]/g, '');
    const removed = raw.length - cleaned.length;
    let warn = removed > 0 ? 'Only A, C, G and T are allowed.' : '';
    if (cleaned.length > MAX_BP) { cleaned = cleaned.slice(0, MAX_BP); warn = `Maximum length is ${MAX_BP} bases.`; }
    if (cleaned !== input.value) {
      const pos = Math.max(0, (input.selectionStart ?? cleaned.length) - removed);
      input.value = cleaned;
      try { input.setSelectionRange(pos, pos); } catch { /* not supported */ }
    }
    current = cleaned;
    const ok = refresh();
    if (warn) flash(warn);
    if (ok) emit(current); else emit.cancel();
  });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });

  function applyPreset(seq) {
    current = seq; input.value = seq; refresh(); emit.cancel();
    lastEmitted = seq; H.onSequence(seq);
  }

  // --- helix dimensions ------------------------------------------------------------------------
  const S = {
    rise: stat({ label: 'Rise per bp', unit: 'Å' }), twist: stat({ label: 'Twist per bp', unit: '°' }),
    bpt: stat({ label: 'Pairs per turn', unit: 'bp' }), pitch: stat({ label: 'Pitch', unit: 'Å' }),
    diameter: stat({ label: 'Diameter', unit: 'Å' }), minor: stat({ label: 'Minor groove', unit: 'Å' }),
    major: stat({ label: 'Major groove', unit: 'Å' }), length: stat({ label: 'Length', unit: 'Å' }),
    hb: stat({ label: 'Mean H-bond', unit: 'Å' }),
  };
  let measureOn = false;
  const measureBtn = h('button', { type: 'button', class: 'btn btn-block', 'aria-pressed': 'false', onclick: () => { setMeasureActive(!measureOn); H.onMeasureToggle(measureOn); } },
    icon('ruler', 18), h('span', {}, 'Show on model'));
  function setMeasureActive(v) { measureOn = !!v; measureBtn.setAttribute('aria-pressed', String(measureOn)); }

  const el = h('section', { class: 'view', id: 'view-structure', 'aria-labelledby': 'tab-structure', role: 'tabpanel', hidden: true },
    h('header', { class: 'view-head' }, h('h2', {}, 'Explore the double helix'), h('p', {}, 'Every atom of an ideal B-DNA duplex. Drag to orbit, then change how it is drawn.')),
    h('div', { class: 'peek' }, rep.el),
    h('div', { class: 'group' }, sectionLabel('Colour by'), colour.el),
    h('div', { class: 'group' }, sectionLabel('Show'), h('div', { class: 'tiles' }, tileEls)),
    h('div', { class: 'group' },
      h('div', { class: 'label-row' }, h('label', { class: 'label', for: 'seq-input' }, 'Sequence, 5′ → 3′'), count),
      input, msg, duplex,
      h('div', { class: 'chips', role: 'group', 'aria-label': 'Example sequences' }, chipEls)),
    h('div', { class: 'card' },
      h('div', { class: 'card-title' }, h('h3', {}, 'Helix dimensions'), h('span', { class: 'card-sub' }, 'measured from the model')),
      h('div', { class: 'stats' }, Object.values(S).map(x => x.el)),
      measureBtn));

  return {
    el,
    setStyle(st) {
      style = { ...style, ...st };
      if (st.representation) rep.set(st.representation);
      if (st.color) colour.set(st.color);
      for (const [k] of TOGGLES) if (k in st) tiles[k].set(st[k]);
    },
    setSequence(seq) {
      const c = (seq || '').toUpperCase().replace(/[^ACGT]/g, '').slice(0, MAX_BP);
      current = c; lastEmitted = c; emit.cancel();
      if (input.value !== c) input.value = c;
      refresh();
    },
    setMeasurements(m) {
      if (!m) return;
      S.rise.set(fmt(m.rise, 2)); S.twist.set(fmt(m.twistDeg, 1));
      S.bpt.set(fmt(m.twistDeg > 0 ? 360 / m.twistDeg : NaN, 1)); S.pitch.set(fmt(m.pitch, 1));
      S.diameter.set(fmt(m.diameter, 1)); S.minor.set(fmt(m.minorGrooveWidth, 1));
      S.major.set(fmt(m.majorGrooveWidth, 1)); S.length.set(fmt(m.length, 1)); S.hb.set(fmt(m.hbondMean, 2));
    },
    setMeasureActive,
    focusSequence() { input.focus(); },
  };
}
