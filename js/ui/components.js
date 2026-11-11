// Small reusable controls. Every control returns { el, set(value) } where set() only reflects state
// (never fires callbacks), so setters coming from the app cannot cause feedback loops.
import { h, setText } from './dom.js';

/** Segmented radio group with a sliding thumb. Values may be strings or numbers. */
export function segmented({ label, options, value, onChange, className = '' }) {
  let cur;
  const thumb = h('span', { class: 'seg-thumb', 'aria-hidden': 'true' });
  const btns = options.map((o, i) => h('button', {
    type: 'button', role: 'radio', class: 'seg-btn', 'aria-checked': 'false', tabindex: '-1',
    onclick: () => choose(o.value),
  }, h('span', { class: 'seg-label' }, o.label)));
  const el = h('div', { class: `seg ${className}`, role: 'radiogroup', 'aria-label': label, style: { '--n': options.length } }, thumb, ...btns);

  function set(v) {
    cur = v;
    const idx = options.findIndex(o => o.value === v);
    el.style.setProperty('--i', Math.max(idx, 0));
    el.classList.toggle('seg-none', idx < 0);
    btns.forEach((b, i) => {
      b.setAttribute('aria-checked', i === idx ? 'true' : 'false');
      b.tabIndex = i === idx || (idx < 0 && i === 0) ? 0 : -1;
    });
  }
  function choose(v) { if (v !== cur) { set(v); onChange && onChange(v); } }
  el.addEventListener('keydown', e => {
    const k = e.key;
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(k)) return;
    e.preventDefault();
    const idx = Math.max(options.findIndex(o => o.value === cur), 0);
    const next = (idx + (k === 'ArrowRight' || k === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
    choose(options[next].value); btns[next].focus();
  });
  set(value);
  return { el, set };
}

/** Switch-style toggle button (aria-pressed). */
export function toggleTile({ label, hint, onChange, className = '' }) {
  let on = false;
  const el = h('button', { type: 'button', class: `tile ${className}`, 'aria-pressed': 'false', title: hint || null },
    h('span', { class: 'tile-label' }, label),
    h('span', { class: 'switch', 'aria-hidden': 'true' }, h('i')));
  function set(v) { on = !!v; el.setAttribute('aria-pressed', String(on)); }
  el.addEventListener('click', () => { set(!on); onChange && onChange(on); });
  return { el, set, get: () => on };
}

/** Labelled numeric read-out tile. set(text) is a no-op when unchanged. */
export function stat({ label, unit = '', className = '', big = false }) {
  const v = h('b', { class: 'stat-v' }, '—');
  const u = h('i', { class: 'stat-u' }, unit);
  const el = h('div', { class: `stat ${big ? 'stat-big' : ''} ${className}` },
    h('span', { class: 'stat-l' }, label), h('span', { class: 'stat-val' }, v, unit ? u : null));
  return { el, set: t => setText(v, t), setUnit: t => setText(u, t) };
}

/** Styled range input. set() updates the value silently. onInput gets a number. */
export function range({ min = 0, max = 1, step = 'any', value = 0, label, onInput, onCommit, className = '' }) {
  const el = h('input', { type: 'range', class: `range ${className}`, min, max, step, value, 'aria-label': label });
  const paint = () => el.style.setProperty('--p', ((+el.value - min) / (max - min)).toFixed(4));
  el.addEventListener('input', () => { paint(); onInput && onInput(+el.value); });
  el.addEventListener('change', () => onCommit && onCommit(+el.value));
  paint();
  return {
    el,
    set(v) { el.value = v; paint(); },
    get: () => +el.value,
    setMax(m) { el.max = m; paint(); },
  };
}

export function sectionLabel(text, extra) {
  return h('div', { class: 'label-row' }, h('h3', { class: 'label' }, text), extra || null);
}
