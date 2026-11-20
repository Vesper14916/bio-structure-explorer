// About / help sheet: references, sources, simplifications, controls.
import { h } from './dom.js';
import { icon } from './icons.js';

const kbd = (...k) => h('span', { class: 'keys' }, k.map(x => h('kbd', {}, x)));

/**
 * Bibliographic source entries for every PDB structure in PLAN.md §7.2 (plus 6CA0 per DEC-023),
 * formatted per PLAN.md §4.10:
 * `PDB <id> — <title>, <first author> et al. (<year>), <journal>. <resolution> Å, <method>.`
 */
export const PDB_SOURCES = Object.freeze([
  Object.freeze({
    pdbId: '6ALF',
    title: 'CryoEM structure of crosslinked E. coli RNA polymerase elongation complex',
    author: 'Kang JY',
    year: '2017',
    journal: 'eLife',
    resolutionA: '4.1',
    method: 'cryo-EM',
  }),
  Object.freeze({
    pdbId: '6C9Y',
    title: 'Cryo-EM structure of E. coli RNAP sigma70 holoenzyme',
    author: 'Narayanan A',
    year: '2018',
    journal: 'J. Biol. Chem.',
    resolutionA: '4.25',
    method: 'cryo-EM',
  }),
  Object.freeze({
    pdbId: '6CA0',
    title: 'Cryo-EM structure of E. coli RNAP sigma70 open complex',
    author: 'Narayanan A',
    year: '2018',
    journal: 'J. Biol. Chem.',
    resolutionA: '5.75',
    method: 'cryo-EM',
  }),
  Object.freeze({
    pdbId: '7K00',
    title: 'Structure of the Bacterial Ribosome at 2 Angstrom Resolution',
    author: 'Watson ZL',
    year: '2020',
    journal: 'eLife',
    resolutionA: '1.98',
    method: 'cryo-EM',
  }),
  Object.freeze({
    pdbId: '7ST2',
    title: 'Post translocation, non-rotated 70S ribosome with EF-G dissociated (Structure VII)',
    author: 'Carbone CE',
    year: '2021',
    journal: 'Nat. Commun.',
    resolutionA: '2.9',
    method: 'cryo-EM',
  }),
  Object.freeze({
    pdbId: '8FZH',
    title: 'Cryo-EM structure of an E. coli non-rotated ribosome termination complex bound with RF1, P- and E-site tRNAPhe (State II-D)',
    author: 'Li L',
    year: '2024',
    journal: 'Nat. Struct. Mol. Biol.',
    resolutionA: '2.9',
    method: 'cryo-EM',
  }),
  Object.freeze({
    pdbId: '5WE4',
    title: '70S ribosome-EF-Tu wt complex with GppNHp',
    author: 'Fislage M',
    year: '2018',
    journal: 'Nucleic Acids Res.',
    resolutionA: '3.1',
    method: 'cryo-EM',
  }),
  Object.freeze({
    pdbId: '7PJV',
    title: 'Structure of the 70S-EF-G-GDP-Pi ribosome complex with tRNAs in hybrid state 1 (H1-EF-G-GDP-Pi)',
    author: 'Petrychenko V',
    year: '2021',
    journal: 'Nat. Commun.',
    resolutionA: '3.1',
    method: 'cryo-EM',
  }),
  Object.freeze({
    pdbId: '9ZN2',
    title: 'Escherichia coli 70S ribosome initiation complex bound to IF1 and extended IF2-GDPCP (70S IC*)',
    author: 'Guerra GS',
    year: '2026',
    journal: 'wwPDB (To Be Published)',
    resolutionA: '3.0',
    method: 'cryo-EM',
  }),
  Object.freeze({
    pdbId: '9FDA',
    title: 'Structure of E. coli 30S-IF1-IF3-mRNA-Edeine complex',
    author: 'Safdari HA',
    year: '2025',
    journal: 'Nat. Commun.',
    resolutionA: '2.0',
    method: 'cryo-EM',
  }),
  Object.freeze({
    pdbId: '6ZTJ',
    title: 'E. coli 70S-RNAP expressome complex in NusG-coupled state (38 nt intervening mRNA)',
    author: 'Webster MW',
    year: '2020',
    journal: 'Science',
    resolutionA: '3.4',
    method: 'cryo-EM',
  }),
  Object.freeze({
    pdbId: '7YPA',
    title: 'Cryo-EM structure of Escherichia coli hairpin-nucleation complex of transcription termination (TTC-hairpin)',
    author: 'You L',
    year: '2023',
    journal: 'Nature',
    resolutionA: '3.05',
    method: 'cryo-EM',
  }),
  Object.freeze({
    pdbId: '1BNA',
    title: 'Structure of a B-DNA dodecamer: conformation and dynamics',
    author: 'Drew HR',
    year: '1981',
    journal: 'Proc. Natl. Acad. Sci. USA',
    resolutionA: '1.9',
    method: 'X-ray diffraction',
  }),
]);

export function formatPdbSource(s) {
  const j = String(s.journal || '').replace(/\.$/, '');
  return `PDB ${s.pdbId} — ${s.title}, ${s.author} et al. (${s.year}), ${j}. ${s.resolutionA} Å, ${s.method}.`;
}

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
        h('li', {}, h('b', {}, 'B-DNA & A-RNA geometry. '), 'PDB 1BNA: Drew HR et al. (1981) ', h('i', {}, 'PNAS'), ' 78:2179–2183 (1.9\u202fÅ). A-RNA C3′-endo ribose (with 2′-OH) regularised under 2.81\u202fÅ / 11.0\u202fbp-per-turn screw symmetry (Arnott et al. 1972; Gelbin et al. 1996).'),
        h('li', {}, h('b', {}, 'DNA & RNA thermodynamics. '), 'SantaLucia J Jr (1998) ', h('i', {}, 'PNAS'), ' 95:1460–1465 (B-DNA); Xia T et al. (1998) ', h('i', {}, 'Biochemistry'), ' 37:14719–14735 & Turner & Mathews (2010) (A-RNA).'),
        h('li', {}, h('b', {}, 'Groove chemistry & wobble pairs. '), 'Seeman NC, Rosenberg JM, Rich A (1976) ', h('i', {}, 'PNAS'), ' 73:804–808; Varani G, McClain WH (2000) ', h('i', {}, 'EMBO Rep.'), ' 1:18–23.'),
        h('li', {}, h('b', {}, 'Bacterial transcription & translation. '), 'RNAP transcription bubble and 70S ribosome (30S + 50S) decoding reference: PDB 8FIZ (E. coli 70S ribosome with mRNA and tRNA) & PDB-101.'),
        h('li', {}, h('b', {}, '3D rendering. '), 'three.js (MIT licence), WebGL.')),

      h('h3', {}, 'Sources'),
      h('ul', { class: 'refs sources' },
        ...PDB_SOURCES.map(s => h('li', { 'data-pdb': s.pdbId }, formatPdbSource(s)))),

      h('h3', {}, 'What is simplified'),
      h('ul', { class: 'simp' },
        h('li', {}, 'Ideal B-DNA and A-RNA helices use perfectly regular screw symmetry with rigid nucleotides; real nucleic acids bend and breathe.'),
        h('li', {}, 'Hydrogen atoms, bulk solvent, and counter-ions are omitted (except crystallographic waters in the X-ray view).'),
        h('li', {}, 'Melting solves an exact nearest-neighbour helix–coil model with a monovalent salt correction at 1\u202fµM strand concentration.'),
        h('li', {}, 'In Express mode, a compact 48-bp bacterial construct (−10 TATA box, Shine–Dalgarno AGGAGG, 11 sense codons starting with fMet, and a UAA stop codon decoded by RF1) runs sequentially in one scene for visual clarity.'),
        h('li', {}, 'Macromolecular complexes (RNAP, 30S/50S ribosomal subunits, tRNA bodies, and RF1) are shown as translucent envelopes with active-site cutaways rather than all-atom protein/rRNA structures.')))
  );
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
