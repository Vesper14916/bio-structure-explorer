// About / help sheet: references, simplifications, controls.
import { h } from './dom.js';
import { icon } from './icons.js';

const kbd = (...k) => h('span', { class: 'keys' }, k.map(x => h('kbd', {}, x)));

export function createAbout({ onClose }) {
  const closeBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', onclick: () => close() }, icon('close', 20));
  const dlg = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'about-title', tabindex: '-1' },
    h('div', { class: 'modal-head' }, h('h2', { id: 'about-title' }, 'About Helix'), closeBtn),
    h('div', { class: 'modal-body' },
      h('p', { class: 'lead' }, 'Helix is an interactive atomic model of the DNA double helix. Every atom is placed from published reference geometry, so what you measure on screen is what is measured in the lab.'),

      h('h3', {}, 'Controls'),
      h('table', { class: 'keytable' }, h('tbody', {},
        [['Rotate', 'drag'], ['Zoom', 'scroll or pinch'], ['Select a base pair', 'click or tap a base']].map(([a, b]) => h('tr', {}, h('th', {}, a), h('td', {}, b))),
        [['Switch mode', kbd('1'), '–', kbd('5')], ['Hide or show the panel', kbd('H')], ['Step along base pairs', kbd('←'), kbd('→')], ['Play or pause replication', kbd('Space')], ['This sheet', kbd('?')]]
          .map(([a, ...b]) => h('tr', {}, h('th', {}, a), h('td', {}, b))))),

      h('h3', {}, 'Data and references'),
      h('ul', { class: 'refs' },
        h('li', {}, h('b', {}, 'Standard reference frame. '), 'Olson WK et al. (2001) A standard reference frame for the description of nucleic acid base-pair geometry. ', h('i', {}, 'J. Mol. Biol.'), ' 313:229–237.'),
        h('li', {}, h('b', {}, 'Crystal structure. '), 'PDB 1BNA: Drew HR et al. (1981) Structure of a B-DNA dodecamer: conformation and dynamics. ', h('i', {}, 'Proc. Natl. Acad. Sci. USA'), ' 78:2179–2183. Resolution 1.9 Å.'),
        h('li', {}, h('b', {}, 'Thermodynamics. '), 'SantaLucia J Jr (1998) A unified view of polymer, dumbbell, and oligonucleotide DNA nearest-neighbor thermodynamics. ', h('i', {}, 'Proc. Natl. Acad. Sci. USA'), ' 95:1460–1465.'),
        h('li', {}, h('b', {}, 'Groove chemistry. '), 'Seeman NC, Rosenberg JM, Rich A (1976) Sequence-specific recognition of double helical nucleic acids by proteins. ', h('i', {}, 'Proc. Natl. Acad. Sci. USA'), ' 73:804–808.'),
        h('li', {}, h('b', {}, '3D rendering. '), 'three.js (MIT licence), WebGL.')),

      h('h3', {}, 'What is simplified'),
      h('ul', { class: 'simp' },
        h('li', {}, 'The ideal helix is a perfectly regular B-DNA with rigid base pairs; real DNA bends and breathes.'),
        h('li', {}, 'Hydrogen atoms, solvent and counter-ions are not drawn (except crystallographic waters in the X-ray view).'),
        h('li', {}, 'Melting uses a nearest-neighbour helix–coil model with a simple salt correction at 1 µM strand concentration, not a full simulation.'),
        h('li', {}, 'The replication animation is a schematic of the mechanism, not a molecular dynamics trajectory.'),
        h('li', {}, 'Thermal motion in the 3D view is a visual effect, not computed physics.')))
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
