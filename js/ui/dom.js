// Tiny DOM helpers shared by the UI modules. No dependencies.
const SVGNS = 'http://www.w3.org/2000/svg';

function apply(el, props) {
  if (!props) return;
  for (const k in props) {
    const v = props[k];
    if (v == null || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'style' && typeof v === 'object') {
      for (const p in v) (p.startsWith('--') ? el.style.setProperty(p, v[p]) : (el.style[p] = v[p]));
    } else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
}
function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k.nodeType ? k : String(k));
  }
}
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  apply(el, props); append(el, kids); return el;
}
export function s(tag, props, ...kids) {
  const el = document.createElementNS(SVGNS, tag);
  apply(el, props); append(el, kids); return el;
}

/** Calls fn at most once per animation frame with the latest arguments. */
export function rafThrottle(fn) {
  let queued = false, args;
  const wrapped = (...a) => {
    args = a;
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; fn(...args); });
  };
  return wrapped;
}

export function debounce(fn, ms) {
  let t = 0;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.cancel = () => clearTimeout(t);
  return d;
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const hex = c => '#' + (c >>> 0).toString(16).padStart(6, '0');

/** Fixed-decimals number with a real minus sign; em-dash for missing values. */
export function fmt(v, d = 1) {
  if (v == null || typeof v !== 'number' || !Number.isFinite(v)) return '—';
  return v.toFixed(d).replace('-', '−');
}
export function fmtSigned(v, d = 2) {
  if (v == null || !Number.isFinite(v)) return '—';
  const t = Math.abs(v).toFixed(d);
  return (v < 0 ? '−' : v > 0 ? '+' : '±') + t;
}

export function lsGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
export function lsSet(key, val) { try { localStorage.setItem(key, val); } catch { /* private mode */ } }

/** Sets text only when it changed (avoids needless layout/paint work in hot paths). */
export function setText(node, text) {
  text = String(text);
  if (node.textContent !== text) node.textContent = text;
}
