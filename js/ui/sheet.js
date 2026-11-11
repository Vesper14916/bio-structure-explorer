// Draggable bottom sheet with three snap points (peek / half / full), used on narrow screens.
// Dragging is transform-only. Only the grip drags directly; content drags the sheet only when the
// scroller is at scrollTop 0 (down = collapse, up = expand unless already full), so inner scrolling
// never fights the sheet.
import { clamp } from './dom.js';

export const PEEK_H = 108;
const ORDER = ['peek', 'half', 'full'];

export function createSheet({ dock, panel, scroller, grip, tabbar, header, onChange }) {
  let enabled = false, snap = 'half', vis = { peek: PEEK_H, half: 340, full: 600 }, T = 0, y = 0;
  let drag = null, suppressClick = false, settleTimer = 0;
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  const yFor = name => vis.full - vis[name];
  function apply(yy) { y = yy; panel.style.transform = `translate3d(0,${yy.toFixed(1)}px,0)`; }
  function place(name, animate) {
    snap = name;
    panel.classList.remove('snap-peek', 'snap-half', 'snap-full'); panel.classList.add(`snap-${name}`);
    panel.style.setProperty('--sheet-off', `${vis.full - vis[name]}px`);
    panel.dataset.snap = name;
    if (animate && !reduce()) {
      panel.classList.add('settling');
      clearTimeout(settleTimer); settleTimer = setTimeout(() => panel.classList.remove('settling'), 380);
    } else panel.classList.remove('settling');
    apply(yFor(name));
  }
  function measure() {
    if (!enabled) return;
    const dockH = dock.clientHeight;
    T = tabbar.offsetHeight;
    const full = Math.max(PEEK_H + 140, dockH - T - header.offsetHeight - 6);
    vis = { peek: PEEK_H, half: Math.round(clamp(full * 0.5, 300, full - 70)), full };
    panel.style.height = `${full + T}px`;
    panel.style.setProperty('--tab-h', `${T}px`);
    place(snap, false);
  }
  function enable(v) {
    if (v === enabled) return;
    enabled = v;
    if (v) { panel.classList.add('is-sheet'); measure(); }
    else {
      panel.classList.remove('is-sheet', 'snap-peek', 'snap-half', 'snap-full', 'settling');
      panel.style.transform = ''; panel.style.height = ''; panel.style.removeProperty('--sheet-off'); delete panel.dataset.snap;
    }
  }
  function setSnap(name, animate = true) {
    if (!ORDER.includes(name)) return;
    place(name, animate);
    onChange && onChange(snap);
  }

  // ---- drag ------------------------------------------------------------------------------------
  function begin(clientY) { drag = { y0: clientY, base: y, samples: [[performance.now(), clientY]], moved: false }; panel.classList.remove('settling'); panel.classList.add('dragging'); }
  function move(clientY) {
    if (!drag) return;
    const d = clientY - drag.y0;
    if (Math.abs(d) > 3) drag.moved = true;
    let ny = drag.base + d; const lo = 0, hi = yFor('peek');
    if (ny < lo) ny = lo + (ny - lo) * 0.2; else if (ny > hi) ny = hi + (ny - hi) * 0.2;
    apply(ny);
    const now = performance.now(); drag.samples.push([now, clientY]);
    while (drag.samples.length > 2 && now - drag.samples[0][0] > 120) drag.samples.shift();
  }
  function end() {
    if (!drag) return;
    const d = drag; drag = null; panel.classList.remove('dragging');
    if (!d.moved) { return; }
    const [t0, y0] = d.samples[0], [t1, y1] = d.samples[d.samples.length - 1];
    const v = t1 > t0 ? (y1 - y0) / (t1 - t0) : 0;        // px/ms, + = downward
    const proj = y + v * 220;
    let best = 'half', bd = Infinity;
    for (const n of ORDER) { const dd = Math.abs(proj - yFor(n)); if (dd < bd) { bd = dd; best = n; } }
    setSnap(best, true);
  }

  // grip: pointer events (mouse / touch / pen). Click without drag cycles the snap.
  grip.addEventListener('pointerdown', e => {
    if (!enabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    grip.setPointerCapture(e.pointerId); begin(e.clientY); suppressClick = false;
  });
  grip.addEventListener('pointermove', e => { if (drag) move(e.clientY); });
  const up = () => { if (drag) { suppressClick = drag.moved; end(); } };
  grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
  grip.addEventListener('click', () => {
    if (!enabled) return;
    if (suppressClick) { suppressClick = false; return; }
    setSnap(snap === 'peek' ? 'half' : snap === 'half' ? 'full' : 'peek');
  });
  grip.addEventListener('keydown', e => {
    if (!enabled) return;
    const i = ORDER.indexOf(snap);
    if (e.key === 'ArrowUp') { e.preventDefault(); setSnap(ORDER[Math.min(2, i + 1)]); }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSnap(ORDER[Math.max(0, i - 1)]); }
  });

  // content: touch events so we can cancel native scroll only when the sheet should move
  let t = null;
  scroller.addEventListener('touchstart', e => {
    if (!enabled || e.touches.length !== 1) { t = null; return; }
    if (e.target.closest('input[type="range"], .no-sheet-drag')) { t = null; return; }
    const p = e.touches[0];
    t = { x: p.clientX, y: p.clientY, state: 'pending' };
  }, { passive: true });
  scroller.addEventListener('touchmove', e => {
    if (!t) return;
    const p = e.touches[0];
    if (t.state === 'pending') {
      const dx = p.clientX - t.x, dy = p.clientY - t.y;
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      if (Math.abs(dx) > Math.abs(dy)) { t.state = 'ignore'; return; }
      const atTop = scroller.scrollTop <= 0;
      const sheetGesture = atTop && !(snap === 'full' && dy < 0);
      if (sheetGesture) { t.state = 'sheet'; begin(t.y); }
      else { t.state = 'scroll'; return; }
    }
    if (t.state === 'sheet') { if (e.cancelable) e.preventDefault(); move(p.clientY); }
  }, { passive: false });
  const tEnd = () => { if (t && t.state === 'sheet') end(); t = null; };
  scroller.addEventListener('touchend', tEnd); scroller.addEventListener('touchcancel', tEnd);

  return {
    enable, measure, setSnap, getSnap: () => snap,
    isEnabled: () => enabled,
    visibleHeight: () => (enabled ? vis[snap] : 0),
    tabbarHeight: () => T,
    isDragging: () => !!drag,
  };
}
