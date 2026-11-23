/**
 * @module ui/plain
 * Plain-language layer for readers with a science background but no molecular biology: one-line mode
 * introductions, the four big steps of gene expression, and an everyday sentence for every story chapter.
 * The technical captions, role sentences and provenance stay where they were; this text is shown first.
 */
import { h, setText } from './dom.js';

/** One line per mode: what the reader is looking at, before any mechanism. */
export const MODE_INTROS = Object.freeze({
  structure: 'You are looking at DNA, the molecule that stores genetic information: two strands of letters twisted into a double helix.',
  pair: 'See what holds the two DNA strands together: each letter on one strand pairs with a matching letter on the other.',
  melt: 'Heat the DNA and watch its two strands come apart, then cool it and watch them pair up again.',
  replicate: 'Watch one DNA molecule become two identical copies, as happens before a cell divides.',
  express: 'Watch a cell read the information in one gene and use it to build a protein.',
  crystal: 'Compare the idealised model with a real DNA molecule whose atom positions were measured by X-ray crystallography.',
});

/** The four big steps of gene expression (shown as a stepper above the chapter caption). */
export const EXPRESS_STEPS = Object.freeze([
  Object.freeze({ id: 'open', label: 'Open DNA' }),
  Object.freeze({ id: 'rna', label: 'Make RNA' }),
  Object.freeze({ id: 'read', label: 'Read RNA' }),
  Object.freeze({ id: 'link', label: 'Join amino acids' }),
]);

/** Story chapter id -> [step index 0..3, plain sentence]. Covers the sequential and coupled chapter tables. */
export const CHAPTER_PLAIN = Object.freeze({
  establish: [0, 'This stretch of DNA is one gene: the recipe for one protein. Everything is drawn at its real size.'],
  search: [0, 'A copying machine, RNA polymerase (blue), slides along the DNA looking for the signal that marks where the gene starts.'],
  open: [0, 'It pulls the two DNA strands apart over a short stretch so it can read the letters of one strand.'],
  initiate: [1, 'It starts an RNA copy, adding one matching letter at a time.'],
  escape: [1, 'After the first dozen letters, the machine lets go of the start signal and moves into the gene.'],
  'elongate-tx': [1, 'It moves along the gene and the RNA copy grows; the DNA closes again behind it.'],
  'terminate-tx': [1, 'At the end of the gene the RNA folds back on itself, and the finished RNA copy is released.'],
  'elongate-early': [1, 'The front of the RNA copy comes out of the polymerase while the rest is still being made.'],
  scan: [2, 'The protein-making machine, the ribosome, grabs the RNA near its front end.'],
  start: [2, 'It finds the start word AUG. A first adapter (tRNA) arrives carrying the first amino acid, the building block of proteins.'],
  join: [2, 'The second half of the ribosome clamps on. The machine is complete and ready to read.'],
  'couple-scan': [2, 'Bacteria have no nucleus, so a ribosome can grab the RNA before the copy is even finished.'],
  'couple-join': [2, 'The ribosome becomes complete right behind the polymerase.'],
  decode: [3, 'The ribosome reads the RNA three letters at a time. An adapter with the matching three letters brings the right amino acid.'],
  bond: [3, 'The new amino acid is chemically linked to the growing chain.'],
  translocate: [3, 'The ribosome steps forward by three letters to read the next word.'],
  'elongate-tl': [3, 'Read, bring, link, step: the cycle repeats and the protein chain grows out through a tunnel in the ribosome.'],
  'couple-run': [3, 'Copying and reading now happen at the same time: the ribosome follows close behind the polymerase.'],
  'couple-terminate': [3, 'The polymerase reaches the end of the gene and lets go of the RNA. The ribosome no longer needs it.'],
  release: [3, 'The stop word has no matching adapter. A release factor binds instead and cuts the finished chain free.'],
  finale: [3, 'Done: one gene was copied into RNA, and the RNA was read to make one protein chain of 40 amino acids.'],
});

const GROUP_STEP = { O: 0, T: 1, I: 2, E: 3 };

/** Plain step index (0..3) and sentence for a story chapter object (falls back on its group). */
export function chapterPlain(ch) {
  if (!ch) return { step: 0, text: '' };
  const hit = CHAPTER_PLAIN[ch.id];
  if (hit) return { step: hit[0], text: hit[1] };
  return { step: GROUP_STEP[ch.group] ?? 0, text: '' };
}

/**
 * Four-step progress row ("1 Open DNA · 2 Make RNA · 3 Read RNA · 4 Link amino acids").
 * `onSelect(stepIndex)` fires when a step is clicked.
 */
export function createStepper({ onSelect } = {}) {
  const items = EXPRESS_STEPS.map((s, i) => h('li', {},
    h('button', {
      type: 'button',
      class: onSelect ? 'step' : 'step is-static',
      'aria-label': `Step ${i + 1}: ${s.label}`,
      ...(onSelect ? { onclick: () => onSelect(i) } : { tabindex: '-1', 'aria-disabled': 'true' }),
    }, h('span', { class: 'step-n' }, String(i + 1)), h('span', { class: 'step-t' }, s.label))));
  const el = h('ol', { class: 'stepper', 'aria-label': 'Main steps' }, ...items);
  let current = -1;
  function set(idx) {
    if (idx === current) return;
    current = idx;
    items.forEach((li, i) => {
      const b = li.firstChild;
      b.classList.toggle('is-done', i < idx);
      if (i === idx) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    });
  }
  return { el, set, get: () => current };
}

/** A plain-language sentence element with a setter that only touches the DOM on change. */
export function plainLine(cls = 'plain-line') {
  const el = h('p', { class: cls, 'aria-live': 'polite' });
  return { el, set: t => setText(el, t || '') };
}
