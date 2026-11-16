// "X-ray" mode: PDB 1BNA info, water / B-factor toggles, ideal-vs-crystal comparison.
import { h, fmt, fmtSigned, setText } from './dom.js';
import { icon } from './icons.js';
import { toggleTile, sectionLabel } from './components.js';

const DEFAULT_INFO = {
  id: '1BNA', title: 'Structure of a B-DNA dodecamer: conformation and dynamics',
  citation: 'Drew HR, Wing RM, Takano T, Broka C, Tanaka S, Itakura K, Dickerson RE (1981) Proc. Natl. Acad. Sci. USA 78:2179–2183',
  method: 'X-ray diffraction', resolution: 1.9, sequence: 'CGCGAATTCGCG', atoms: 486, waters: null,
};
const ROWS = [
  ['diameter', 'Diameter', 'Å', 1], ['minorGrooveWidth', 'Minor groove', 'Å', 1], ['majorGrooveWidth', 'Major groove', 'Å', 1],
  ['hbondMean', 'Mean H-bond', '\u00c5', 2],
];

export function createCrystalView(ctx) {
  const { H } = ctx;
  const state = { waters: false, bfactor: false };
  const emit = () => H.onCrystal({ waters: state.waters, bfactor: state.bfactor });

  const water = toggleTile({ label: 'Water molecules', hint: 'Show crystallographic waters', onChange: v => { state.waters = v; emit(); } });
  const bfac = toggleTile({ className: 'tile-wide', label: 'Colour by B-factor', hint: 'Colour atoms by thermal motion', onChange: v => { state.bfactor = v; bkey.hidden = !v; emit(); } });
  const bkey = h('div', { class: 'bkey', hidden: true }, h('span', {}, 'rigid'), h('span', { class: 'bkey-bar' }), h('span', {}, 'mobile'));

  const pdb = h('span', { class: 'pdb-id' }, DEFAULT_INFO.id);
  const resolution = h('b', {}, '1.9'); const method = h('span', {}, DEFAULT_INFO.method);
  const title = h('h3', { class: 'xt' }, DEFAULT_INFO.title);
  const cite = h('p', { class: 'cite' }, DEFAULT_INFO.citation);
  const metaSeq = h('span', { class: 'mono' }, DEFAULT_INFO.sequence);
  const metaAtoms = h('span', { class: 'mono' }, '486');
  const metaWaters = h('span', { class: 'mono' }, '—');

  const tbody = h('tbody');
  const cells = ROWS.map(([k, name, unit, d]) => {
    const i = h('td', { class: 'num' }, '—'), c = h('td', { class: 'num' }, '—'), dl = h('td', { class: 'num dim' }, '—');
    tbody.append(h('tr', {}, h('th', { scope: 'row' }, name, h('i', {}, ` ${unit}`)), i, c, dl));
    return { k, d, i, c, dl };
  });

  const el = h('section', { class: 'view', id: 'view-crystal', 'aria-labelledby': 'tab-crystal', role: 'tabpanel', hidden: true },
    h('header', { class: 'view-head' }, h('h2', {}, 'A real crystal structure'), h('p', {}, 'Atomic coordinates measured by X-ray diffraction.')),
    h('div', { class: 'peek' },
      h('div', { class: 'xpeek' }, h('div', { class: 'xid' }, pdb, h('span', {}, 'Resolution ', resolution, ' Å')), water.el)),
    h('div', { class: 'card' },
      h('div', { class: 'xhead' }, icon('xray', 20), h('span', { class: 'label' }, 'Experimental structure')),
      title, cite,
      h('dl', { class: 'meta' },
        h('div', {}, h('dt', {}, 'Method'), h('dd', {}, method)),
        h('div', {}, h('dt', {}, 'Sequence'), h('dd', {}, metaSeq)),
        h('div', {}, h('dt', {}, 'Atoms'), h('dd', {}, metaAtoms)),
        h('div', {}, h('dt', {}, 'Waters'), h('dd', {}, metaWaters)))),
    h('div', { class: 'group' }, sectionLabel('Show'), h('div', { class: 'tiles' }, bfac.el, h('p', { class: 'tile-note' }, 'Waters form a “spine of hydration” in the narrow AATT minor groove.')), bkey),
    h('div', { class: 'card' },
      h('div', { class: 'card-title' }, h('h3', {}, 'Ideal model vs. crystal')),
      h('table', { class: 'cmp' },
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Quantity'), h('th', { scope: 'col', class: 'num' }, 'Ideal'), h('th', { scope: 'col', class: 'num' }, 'Crystal'), h('th', { scope: 'col', class: 'num' }, 'Δ'))), tbody)),
    h('div', { class: 'explain' }, h('h3', { class: 'label' }, 'Why is a real helix irregular?'),
      h('p', {}, 'The ideal model repeats the same step every time. In a crystal, the sequence itself bends and twists the helix: the A-tract in the middle (AATT) has a notably narrow minor groove and flatter, propeller-twisted base pairs, and packing against neighbouring molecules adds more distortion. Atoms at the ends move most, shown by high B-factors.')));

  return {
    el,
    setInfo(i) {
      i = { ...DEFAULT_INFO, ...i };
      setText(pdb, i.id); setText(resolution, fmt(i.resolution, 1)); title.textContent = i.title; cite.textContent = i.citation;
      setText(method, i.method); setText(metaSeq, i.sequence); setText(metaAtoms, i.atoms == null ? '—' : String(i.atoms));
      setText(metaWaters, i.waters == null ? '—' : String(i.waters));
      if (i.bfactorGradient) bkey.querySelector('.bkey-bar').style.background = `linear-gradient(90deg, ${i.bfactorGradient.join(',')})`;
    },
    setCompare(c) {
      if (!c) return;
      for (const r of cells) {
        const a = c.ideal && c.ideal[r.k], b = c.crystal && c.crystal[r.k];
        setText(r.i, fmt(a, r.d)); setText(r.c, fmt(b, r.d));
        setText(r.dl, Number.isFinite(a) && Number.isFinite(b) ? fmtSigned(b - a, r.d) : '—');
      }
    },
    setToggles({ waters, bfactor }) {
      if (waters !== undefined) { state.waters = !!waters; water.set(waters); }
      if (bfactor !== undefined) { state.bfactor = !!bfactor; bfac.set(bfactor); bkey.hidden = !bfactor; }
    },
  };
}
