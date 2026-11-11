// "Pairs" mode: sequence strip + base-pair inspector.
import { BASE_INFO, WC_HBONDS, GROOVE_PATTERN } from '../science/index.js';
import { h, fmt, setText } from './dom.js';
import { icon } from './icons.js';
import { sectionLabel } from './components.js';

const ROLE = {
  A: { name: 'Acceptor', cls: 'dot-a' }, D: { name: 'Donor', cls: 'dot-d' },
  M: { name: 'Methyl', cls: 'dot-m' }, H: { name: 'Non-polar H', cls: 'dot-h' },
};
const NOTE_BONDS = {
  AT: 'Adenine and thymine share two hydrogen bonds: thymine has only one N–H to offer, so the A·T pair is held together more weakly, and AT-rich DNA melts at a lower temperature.',
  GC: 'Guanine carries an extra amino group (N2) that donates a third hydrogen bond to the O2 of cytosine, so a G·C pair is stronger and GC-rich DNA melts at a higher temperature.',
};
const NOTE_GROOVE = 'Proteins read the major groove: it shows a different pattern of acceptors, donors and methyl groups for each of the four base-pair orientations, so a protein can recognise a sequence without opening the helix. The minor groove looks almost the same for A·T and T·A (and for G·C and C·G), so it carries far less information.';

export function createPairView(ctx) {
  const { H } = ctx;
  let seq = '', selected = null, shownKey = '';

  // ---- strip ------------------------------------------------------------------------------------
  const strip = h('div', { class: 'strip h-scroll', role: 'listbox', 'aria-orientation': 'horizontal', 'aria-label': 'Base pairs' });
  const prev = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Previous base pair', onclick: () => step(-1) }, icon('left'));
  const next = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Next base pair', onclick: () => step(1) }, icon('right'));
  const stripWrap = h('div', { class: 'strip-wrap' }, prev, strip, next);
  let cells = [];

  const COMP = { A: 'T', T: 'A', G: 'C', C: 'G' };
  function buildStrip() {
    strip.replaceChildren();
    cells = [...seq].map((b, i) => {
      const c = COMP[b];
      const cell = h('button', {
        type: 'button', role: 'option', class: 'pcell', 'aria-selected': 'false', 'aria-label': `Pair ${i + 1}: ${b} · ${c}`,
        style: { '--c1': ctx.col(b), '--c2': ctx.col(c) }, onclick: () => select(i),
      }, h('span', { class: 'pcell-n' }, String(i + 1)), h('span', { class: 'pcell-b pcell-t' }, b), h('span', { class: 'pcell-b pcell-u' }, c));
      return cell;
    });
    strip.append(...cells);
    paintStrip(false);
  }
  function paintStrip(scroll = true) {
    cells.forEach((c, i) => {
      const on = i === selected;
      if (c.getAttribute('aria-selected') !== String(on)) c.setAttribute('aria-selected', String(on));
    });
    const n = cells.length;
    prev.disabled = n === 0 || (selected !== null && selected <= 0);
    next.disabled = n === 0 || (selected !== null && selected >= n - 1);
    if (scroll && selected !== null && cells[selected]) {
      const c = cells[selected], target = c.offsetLeft - (strip.clientWidth - c.offsetWidth) / 2;
      if (Math.abs(strip.scrollLeft - target) > 2) strip.scrollTo({ left: target, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
  }
  function select(i) {
    if (i === selected) return;
    selected = i; paintStrip(); H.onSelectPair(i);
  }
  function step(d) {
    const n = seq.length; if (!n) return;
    const i = selected === null ? (d > 0 ? 0 : n - 1) : Math.min(n - 1, Math.max(0, selected + d));
    select(i);
  }

  // ---- inspector --------------------------------------------------------------------------------
  const badge = () => {
    const l = h('b', { class: 'badge-l' }, '–'), n = h('span', { class: 'badge-n' }), k = h('span', { class: 'badge-k' });
    return { el: h('div', { class: 'badge' }, l, n, k), l, n, k };
  };
  const bA = badge(), bB = badge();
  const glyph = h('div', { class: 'bond-glyph', 'aria-hidden': 'true' });
  const glyphLabel = h('span', { class: 'bond-glyph-n' });
  const title = h('h3', { class: 'pair-title' }, '—');
  const sub = h('p', { class: 'pair-sub' });
  const bondList = h('ul', { class: 'bonds' });
  const c1 = h('b', { class: 'stat-v' }, '—');
  const bondsHead = h('span', { class: 'label' }, 'Hydrogen bonds');
  let lenEls = [];

  const patRow = (name) => {
    const dots = h('div', { class: 'pat-dots' });
    const a = h('b', { class: 'pat-end' }), z = h('b', { class: 'pat-end' });
    return { el: h('div', { class: 'pat-row' }, h('span', { class: 'pat-name' }, name), h('div', { class: 'pat-line' }, a, dots, z)), dots, a, z };
  };
  const major = patRow('Major groove'), minor = patRow('Minor groove');
  const legend = h('ul', { class: 'legend-inline' }, ['A', 'D', 'M', 'H'].map(k =>
    h('li', {}, h('span', { class: `dot ${ROLE[k].cls}` }, k), ROLE[k].name)));
  const notes = h('div', { class: 'notes' }, h('p', { class: 'note-bonds' }), h('p', {}, NOTE_GROOVE));
  const noteBonds = notes.querySelector('.note-bonds');

  const inspector = h('div', { class: 'pair-detail' },
    h('div', { class: 'card pair-card' },
      h('div', { class: 'pair-head' }, bA.el, h('div', { class: 'bond-link' }, glyph, glyphLabel), bB.el),
      title, sub,
      h('div', { class: 'label-row' }, bondsHead, h('button', { type: 'button', class: 'link-btn', onclick: () => { selected = null; paintStrip(false); H.onSelectPair(null); showEmpty(true); } }, 'Clear')),
      bondList,
      h('div', { class: 'kv' }, h('span', {}, 'C1′–C1′ distance'), h('span', { class: 'stat-val' }, c1, h('i', { class: 'stat-u' }, 'Å')))),
    h('div', { class: 'card' },
      h('div', { class: 'card-title' }, h('h3', {}, 'What a protein sees'), h('span', { class: 'card-sub' }, 'groove edge chemistry')),
      major.el, minor.el, legend),
    notes);
  const empty = h('div', { class: 'empty card' },
    h('div', { class: 'empty-ico' }, icon('pairs', 28)),
    h('h3', {}, 'Pick a base pair'),
    h('p', {}, 'Tap a base in the 3D view, or choose a pair from the strip. Use ← → to step along the helix.'));
  function showEmpty(v) { empty.hidden = !v; inspector.hidden = v; }
  showEmpty(true);

  function renderPatterns(type) {
    const fill = (row, pat) => {
      row.dots.replaceChildren(...[...pat].map(k => h('span', { class: `dot ${ROLE[k].cls}`, title: ROLE[k].name }, k)));
      row.a.textContent = type[0]; row.z.textContent = type[1];
      row.a.style.color = ctx.col(type[0]); row.z.style.color = ctx.col(type[1]);
    };
    fill(major, GROOVE_PATTERN.major[type]); fill(minor, GROOVE_PATTERN.minor[type]);
  }

  function describe(type, i, b) {
    const e = (WC_HBONDS[type] || [])[i];
    const donor = b.donor ?? (e ? (e[2] === 0 ? e[0] : e[1]) : '?');
    const acceptor = b.acceptor ?? (e ? (e[2] === 0 ? e[1] : e[0]) : '?');
    const dBase = b.donorBase ?? (e ? (e[2] === 0 ? type[0] : type[1]) : null);
    const aBase = b.acceptorBase ?? (e ? (e[2] === 0 ? type[1] : type[0]) : null);
    return { donor, acceptor, dBase, aBase, length: b.length };
  }

  function setPair(d) {
    if (!d) { selected = null; paintStrip(false); showEmpty(true); shownKey = ''; return; }
    const type = d.type;
    if (!BASE_INFO[type[0]] || !BASE_INFO[type[1]]) return;
    if (d.index !== selected) { selected = d.index; paintStrip(); }
    const n = d.count ?? seq.length;
    showEmpty(false);
    const bonds = (d.hbonds && d.hbonds.length ? d.hbonds : (WC_HBONDS[type] || []).map(() => ({}))).map((b, i) => describe(type, i, b));
    const key = `${d.index}|${type}|${bonds.length}`;
    if (key !== shownKey) {
      shownKey = key;
      const A = BASE_INFO[type[0]], B = BASE_INFO[type[1]];
      for (const [bd, base, info] of [[bA, type[0], A], [bB, type[1], B]]) {
        bd.l.textContent = base; bd.l.style.color = ctx.col(base); bd.el.style.setProperty('--bc', ctx.col(base));
        bd.n.textContent = info.name; bd.k.textContent = info.kind;
      }
      title.textContent = `${A.name} · ${B.name}`;
      sub.textContent = `Pair ${d.index + 1} of ${n} · ${A.kind} · ${B.kind}`;
      glyph.replaceChildren(...bonds.map(() => h('i')));
      glyphLabel.textContent = `${bonds.length} H-bond${bonds.length === 1 ? '' : 's'}`;
      bondsHead.textContent = `Hydrogen bonds · ${bonds.length}`;
      bondList.replaceChildren(); lenEls = [];
      bonds.forEach((b, i) => {
        const len = h('b', { class: 'stat-v' }, '—');
        lenEls.push(len);
        const chip = (base, atom) => h('span', { class: 'atom', style: { '--bc': base ? ctx.col(base) : 'var(--text-2)' } }, base ? h('em', {}, base) : null, atom);
        bondList.append(h('li', {},
          h('span', { class: 'bond-atoms' }, chip(b.dBase, b.donor), h('span', { class: 'bond-arrow', 'aria-label': 'donates to' }, '→'), chip(b.aBase, b.acceptor)),
          h('span', { class: 'stat-val' }, len, h('i', { class: 'stat-u' }, 'Å'))));
      });
      renderPatterns(type);
      noteBonds.textContent = NOTE_BONDS[type === 'AT' || type === 'TA' ? 'AT' : 'GC'];
    }
    bonds.forEach((b, i) => lenEls[i] && setText(lenEls[i], fmt(b.length, 2)));
    setText(c1, fmt(d.c1c1, 2));
  }

  const el = h('section', { class: 'view', id: 'view-pair', 'aria-labelledby': 'tab-pair', role: 'tabpanel', hidden: true },
    h('header', { class: 'view-head' }, h('h2', {}, 'Base pairs'), h('p', {}, 'A pairs with T, G pairs with C. Select a pair to see how they bond.')),
    h('div', { class: 'peek' }, stripWrap),
    empty, inspector);

  return {
    el,
    setSequence(s) { s = (s || '').toUpperCase().replace(/[^ACGT]/g, ''); if (s !== seq) { seq = s; if (selected !== null && selected >= s.length) selected = null; buildStrip(); } },
    setPair, step, getSelected: () => selected,
  };
}
