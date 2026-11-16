// About / help sheet: references, simplifications, controls.
import { h } from './dom.js';
import { icon } from './icons.js';

const kbd = (...k) => h('span', { class: 'keys' }, k.map(x => h('kbd', {}, x)));

export function createAbout({ onClose }) {
  const closeBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', onclick: () => close() }, icon('close', 20));
  const dlg = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'about-title', tabindex: '-1' },
    h('div', { class: 'modal-head' }, h('h2', { id: 'about-title' }, 'About Helix'), closeBtn),
    h('div', { class: 'modal-body' },
      h('p', { class: 'lead' }, 'Helix is an interactive atomic model of DNA, RNA, and bacterial gene expression. Every nucleotide is placed from published reference geometry, so what you measure on screen matches experimental crystallography.'),

      h('h3', {}, 'Controls'),
      h('table', { class: 'keytable' }, h('tbody', {},
        [['Rotate', 'drag'], ['Zoom', 'scroll or pinch'], ['Select a base pair or codon', 'click or tap a base, codon, or residue']].map(([a, b]) => h('tr', {}, h('th', {}, a), h('td', {}, b))),
        [['Switch mode', kbd('1'), '–', kbd('6')], ['Hide or show the panel', kbd('H')], ['Step along pairs or codons', kbd('←'), kbd('→')], ['Play or pause (Copy / Express)', kbd('Space')], ['This sheet', kbd('?')]]
          .map(([a, ...b]) => h('tr', {}, h('th', {}, a), h('td', {}, b))))),

      h('h3', {}, 'Data and references'),
      h('ul', { class: 'refs' },
        h('li', {}, h('b', {}, 'Standard base reference frame. '), 'Olson WK et al. (2001) A standard reference frame for the description of nucleic acid base-pair geometry. ', h('i', {}, 'J. Mol. Biol.'), ' 313:229–237.'),
        h('li', {}, h('b', {}, 'B-DNA & A-RNA geometry. '), 'PDB 1BNA: Drew HR et al. (1981) ', h('i', {}, 'PNAS'), ' 78:2179–2183 (1.9 Å). A-RNA C3′-endo ribose (with 2′-OH) regularised under 2.81 Å / 11.0 bp-per-turn screw symmetry (Arnott et al. 1972; Gelbin et al. 1996).'),
        h('li', {}, h('b', {}, 'DNA & RNA thermodynamics. '), 'SantaLucia J Jr (1998) ', h('i', {}, 'PNAS'), ' 95:1460–1465 (B-DNA); Xia T et al. (1998) ', h('i', {}, 'Biochemistry'), ' 37:14719–14735 & Turner & Mathews (2010) (A-RNA).'),
        h('li', {}, h('b', {}, 'Groove chemistry & wobble pairs. '), 'Seeman NC, Rosenberg JM, Rich A (1976) ', h('i', {}, 'PNAS'), ' 73:804–808; Varani G, McClain WH (2000) ', h('i', {}, 'EMBO Rep.'), ' 1:18–23.'),
        h('li', {}, h('b', {}, 'Bacterial transcription & translation. '), 'RNAP transcription bubble and 70S ribosome (30S + 50S) decoding reference: PDB 8FIZ (E. coli 70S ribosome with mRNA and tRNA) & PDB-101.'),
        h('li', {}, h('b', {}, '3D rendering. '), 'three.js (MIT licence), WebGL.')),

      h('h3', {}, 'What is simplified'),
      h('ul', { class: 'simp' },
        h('li', {}, 'Ideal B-DNA and A-RNA helices use perfectly regular screw symmetry with rigid nucleotides; real nucleic acids bend and breathe.'),
        h('li', {}, 'Hydrogen atoms, bulk solvent, and counter-ions are omitted (except crystallographic waters in the X-ray view).'),
        h('li', {}, 'Melting solves an exact nearest-neighbour helix–coil model with a monovalent salt correction at 1 µM strand concentration.'),
        h('li', {}, 'In Express mode, a compact 48-bp bacterial construct (−10 TATA box, Shine–Dalgarno AGGAGG, 11 sense codons starting with fMet, and a UAA stop codon decoded by RF1) runs sequentially in one scene for visual clarity.'),
        h('li', {}, 'Macromolecular complexes (RNAP, 30S/50S ribosomal subunits, tRNA bodies, and RF1) are shown as translucent envelopes with active-site cutaways rather than all-atom protein/rRNA structures.'))));
  const scrim = h('div', { class: 'scrim', hidden: true, onclick: e => { if (e.target === scrim) close(); } }, dlg);
  let opener = null;
  function open() { opener = document.activeElement; scrim.hidden = false; requestAnimationFrame(() => { scrim.classList.add('is-open'); dlg.focus(); }); }
  function close() {
    if (scrim.hidden) return;
    scrim.classList.remove('is-open');
    setTimeout(() => { scrim.hidden = true; }, 200);
    if (opener && opener.focus) opener.focus();
    onClose && onClose();
  }
  scrim.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    if (e.key === 'Tab') {
      const f = [...dlg.querySelectorAll('button, a[href], [tabindex="0"]')];
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dlg)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  return { el: scrim, open, close, isOpen: () => !scrim.hidden };
}
