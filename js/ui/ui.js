/*
 * Helix UI  --  pure DOM, no framework, no viewer/sim dependency.
 *
 *   import { createUI } from './ui/ui.js';
 *   const ui = createUI(document.getElementById('ui'), handlers);
 *
 * The UI starts in the LOADING state; call ui.setLoading(false) when the first model is on screen.
 * Units: Angstrom, degrees Celsius, molar (Na is in mol/L, e.g. 0.1 = 100 mM), kcal/mol, cal/(mol K).
 * Modes (strings): 'structure' | 'pair' | 'melt' | 'replicate' | 'crystal'
 *    (tab labels Explore / Pairs / Melt / Copy / X-ray; keys 1..5).
 *
 * ---------------------------------------------------------------------------------------------
 * HANDLERS  (UI -> app).  All optional.  Never called as a result of calling a setter.
 *   onMode(mode)                 user switched mode (tab, tab bar or key 1-5).
 *   onStyle(partial)             partial viewer style, exact Viewer API keys/values:
 *                                  {representation:'ballstick'|'spacefill'|'cartoon'}
 *                                  {color:'element'|'base'|'strand'|'part'}
 *                                  {hbonds|grooves|axis|labels|autoRotate: boolean}
 *                                (never 'bfactor'/'waters': those come through onCrystal)
 *   onSequence(seq)              valid sequence only (A/C/G/T, 4..40 bases, upper case), debounced 380 ms.
 *                                Also fired immediately when a preset chip is tapped.
 *   onSelectPair(index|null)     pair strip / step buttons / arrow keys / "Clear"  (0-based pair id).
 *   onMeasureToggle(bool)        "Show on model" in Explore.
 *   onMelt({T, Na})              T in degC, Na in mol/L. Fires continuously while dragging, at most
 *                                once per animation frame; also on salt change.
 *   onReplication({action, value})  action: 'play' | 'pause' | 'restart'
 *                                   | 'seek'  (value = progress 0..1, rAF-throttled while scrubbing)
 *                                   | 'speed' (value = 0.5 | 1 | 2)
 *   onCrystal({waters, bfactor}) both booleans, always the full current state.
 *   onLayout(insets)             {top,right,bottom,left} CSS px of the stage covered by UI (desktop: right =
 *                                panel width + margin, 0 when collapsed; phone: top = header bottom,
 *                                bottom = sheet visible height + tab bar). Fired once after creation
 *                                and whenever it changes (resize, rotate, collapse, sheet snap).
 *                                During a sheet drag nothing fires; it fires when the sheet settles.
 *                                Not fired while the on-screen keyboard is open.
 *   onAbout(open)                about sheet opened/closed (informational).
 *
 * ---------------------------------------------------------------------------------------------
 * SETTERS  (app -> UI).  None of them fires a handler.  All are cheap; call per frame if needed.
 *   setMode(mode)                switch visible mode.
 *   setLoading(bool, message?)   full-screen loading veil.
 *   setSequence(seq)             sets editor, complement view, pair strip, openness-strip colours.
 *   setStyle(style)              any subset of the Viewer style; reflects representation, color,
 *                                hbonds, grooves, axis, labels, autoRotate; style.waters and
 *                                (style.color === 'bfactor') reflect the X-ray toggles.
 *   setMeasurements(m)           measureDuplex() result: {rise, twistDeg, pitch, diameter,
 *                                minorGrooveWidth, majorGrooveWidth, hbondMean, length, ...}.
 *   setMeasureActive(bool)       reflect the "Show on model" state.
 *   setPair(data|null)           {index, count?, type:'AT'|'TA'|'GC'|'CG',
 *                                 hbonds:[{donor:'N6', acceptor:'O4', length:2.93,
 *                                          donorBase?:'A', acceptorBase?:'T'}],   // order = WC_HBONDS[type]
 *                                 c1c1: 10.6}
 *                                null clears the selection. Call every frame for live lengths; DOM is only
 *                                touched when text changes. hbonds may be omitted (ideal list, no lengths).
 *                                See payloads.js pairPayload(asm, pairId) which builds this from an Assembly.
 *   setMeltState(state)          MERGES the given keys (send only what changed):
 *                                 {T, Na, Tm, dH, dS, dG37, gc /*0..1*\/, curve:[{T,paired}] (redrawn only when
 *                                  the array identity changes), openness: Float32Array|number[] per bp
 *                                  (1 = open; reuses DOM nodes, only writes changed cells),
 *                                  fractionPaired /*0..1*\/, phase: string}
 *                                See payloads.js meltStatic / meltDynamic.
 *   setReplicationState(state)   MERGES: {progress 0..1, playing, speed, caption, phase, unwound,
 *                                 leadingCount, laggingCount, fragments}
 *   setReplicationLegend(items)  optional: [{id,label,color:'#rrggbb',kind:'strand'|'blob'}] to match the sim colours.
 *   setCrystalInfo(info)         {id,title,citation,method,resolution,sequence,atoms,waters,bfactorGradient?:[css colours]}
 *                                (defaults to the 1BNA facts, so calling it is optional)
 *   setCompare({ideal, crystal}) two measureDuplex() results; table shows ideal, crystal and the difference.
 *   toast(message)               transient message (3.2 s).
 *   setDebug({fps, quality, atoms})  only visible with ?debug in the URL.
 *   showError(message, title?)   blocking error card (e.g. WebGL unavailable) with a reload button.
 *
 * OTHER
 *   ui.getMode(), ui.getInsets(), ui.setPanelOpen(bool) / ui.isPanelOpen() (desktop side panel),
 *   ui.setSheet('peek'|'half'|'full') / ui.getSheet() (phone), ui.openAbout() / closeAbout(), ui.destroy().
 *   DOM / CSS hooks: root gets classes `is-mobile` (phone layout), `is-collapsed`, `kb-open`, and CSS vars
 *   --inset-top/right/bottom/left (px) always mirroring the last onLayout payload.
 *   Keys: 1-5 modes, H panel, Space play/pause (Copy), Left/Right step pair (Pairs), ? about.
 */
import { BASE_INFO } from '../science/index.js';
import { h, hex, lsGet, lsSet, rafThrottle } from './dom.js';
import { icon, LOGO_SVG } from './icons.js';
import { createSheet } from './sheet.js';
import { createAbout } from './about.js';
import { createStructureView } from './view-structure.js';
import { createPairView } from './view-pair.js';
import { createMeltView } from './view-melt.js';
import { createReplicateView } from './view-replicate.js';
import { createCrystalView } from './view-crystal.js';

export { pairPayload, meltStatic, meltDynamic, meltPhase } from './payloads.js';

export const MODES = [
  { id: 'structure', label: 'Explore', title: 'Structure', icon: 'explore' },
  { id: 'pair', label: 'Pairs', title: 'Base pair', icon: 'pairs' },
  { id: 'melt', label: 'Melt', title: 'Melting', icon: 'melt' },
  { id: 'replicate', label: 'Copy', title: 'Replication', icon: 'replicate' },
  { id: 'crystal', label: 'X-ray', title: 'Crystal structure', icon: 'xray' },
];
const NOOP = () => {};
const HANDLER_NAMES = ['onMode', 'onStyle', 'onSequence', 'onSelectPair', 'onMeasureToggle', 'onMelt', 'onReplication', 'onCrystal', 'onLayout', 'onAbout'];
const HINT_KEY = 'helix.hint.v1';

export function createUI(root, handlers = {}) {
  const H = {}; for (const n of HANDLER_NAMES) H[n] = (...a) => (handlers[n] || NOOP)(...a);
  const doc = root.ownerDocument;
  const params = new URLSearchParams(location.search);
  const mq = matchMedia('(max-width: 699px)');
  let mobile = mq.matches, mode = 'structure', collapsed = false, destroyed = false;

  // colours from the science layer
  const colors = {}; for (const k of Object.keys(BASE_INFO)) { colors[k] = hex(BASE_INFO[k].color); root.style.setProperty(`--base-${k}`, colors[k]); }
  const ctx = { H, col: b => colors[b] || 'var(--text-2)', mode: () => mode };

  root.classList.add('ui-root'); root.replaceChildren();

  // ---- views ------------------------------------------------------------------------------------
  const views = {
    structure: createStructureView(ctx), pair: createPairView(ctx), melt: createMeltView(ctx),
    replicate: createReplicateView(ctx), crystal: createCrystalView(ctx),
  };
  ctx.onColourPicked = () => views.crystal.setToggles({ bfactor: false });

  // ---- shell ------------------------------------------------------------------------------------
  const aboutBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'About, references and shortcuts', onclick: () => openAbout() }, icon('info', 20));
  const logo = h('span', { class: 'logo' }); logo.innerHTML = LOGO_SVG;
  const header = h('header', { class: 'app-header' },
    logo, h('div', { class: 'brand' }, h('h1', {}, 'Helix'), h('p', {}, 'Interactive DNA structure explorer')), aboutBtn);

  function makeTabs(prefix, cls) {
    const list = h('div', { class: cls, role: 'tablist', 'aria-label': 'Mode' });
    const tabs = MODES.map((m, i) => h('button', {
      type: 'button', role: 'tab', id: `${prefix}-${m.id}`, class: 'tab', 'aria-selected': 'false', 'aria-controls': `view-${m.id}`,
      tabindex: '-1', title: `${m.title} (${i + 1})`, onclick: () => userMode(m.id),
    }, icon(m.icon, 22), h('span', { class: 'tab-label' }, m.label)));
    list.append(...tabs);
    list.addEventListener('keydown', e => {
      const i = MODES.findIndex(m => m.id === mode);
      let n = -1;
      if (e.key === 'ArrowRight') n = (i + 1) % MODES.length; else if (e.key === 'ArrowLeft') n = (i + MODES.length - 1) % MODES.length;
      else if (e.key === 'Home') n = 0; else if (e.key === 'End') n = MODES.length - 1;
      if (n < 0) return;
      e.preventDefault(); userMode(MODES[n].id); tabs[n].focus();
    });
    return { list, tabs };
  }
  const dTabs = makeTabs('tab', 'tabs'), mTabs = makeTabs('mtab', 'tabbar');

  const grip = h('button', { type: 'button', class: 'grip', 'aria-label': 'Resize panel' }, h('span', { class: 'grip-bar' }));
  const scroller = h('div', { class: 'panel-scroll' }, h('div', { class: 'views' }, Object.values(views).map(v => v.el)));
  const panel = h('aside', { class: 'panel', 'aria-label': 'Controls' }, grip, h('div', { class: 'panel-top' }, dTabs.list), scroller);
  const toggle = h('button', { type: 'button', class: 'panel-toggle', 'aria-label': 'Hide panel (H)', 'aria-expanded': 'true', title: 'Hide panel (H)', onclick: () => setPanelOpen(collapsed) }, icon('chevR', 18));
  const dock = h('div', { class: 'dock' }, header, panel, mTabs.list);

  const loadMsg = h('p', { class: 'load-msg' }, 'Building the double helix…');
  const loading = h('div', { class: 'loading', role: 'status', 'aria-live': 'polite' }, h('div', { class: 'spinner', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i'), h('i')), loadMsg);

  const toasts = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
  const hintClose = h('button', { type: 'button', class: 'icon-btn icon-btn-sm', 'aria-label': 'Dismiss hint', onclick: () => dismissHint(true) }, icon('close', 16));
  const hint = h('div', { class: 'hint', hidden: true }, h('p', {}, h('span', {}, 'drag to rotate'), ' · ', h('span', {}, 'pinch / scroll to zoom'), ' · ', h('span', {}, 'tap a base')), hintClose);
  const debugChip = params.has('debug') ? h('div', { class: 'debug', 'aria-hidden': 'true' }, '…') : null;

  const errTitle = h('h2', {}, 'Something went wrong'), errMsg = h('p', {});
  const errCard = h('div', { class: 'error', role: 'alert', hidden: true }, h('div', { class: 'error-card' }, errTitle, errMsg, h('button', { type: 'button', class: 'btn', onclick: () => location.reload() }, 'Reload')));

  const about = createAbout({ onClose: () => H.onAbout(false) });
  root.append(dock, toggle, toasts, hint, about.el, loading, errCard);
  if (debugChip) root.append(debugChip);

  // ---- sheet ------------------------------------------------------------------------------------
  const sheet = createSheet({ dock, panel, scroller, grip, tabbar: mTabs.list, header, onChange: () => scheduleLayout() });

  // ---- insets -----------------------------------------------------------------------------------
  let insets = { top: 0, right: 0, bottom: 0, left: 0 }, sent = null;
  function computeInsets() {
    if (mobile) {
      return { top: Math.round(header.getBoundingClientRect().bottom), right: 0, left: 0, bottom: Math.round(sheet.visibleHeight() + sheet.tabbarHeight()) };
    }
    const m = parseFloat(getComputedStyle(panel).right) || 12;
    return { top: 0, right: collapsed ? 0 : Math.round(panel.offsetWidth + m), bottom: 0, left: 0 };
  }
  function emitLayout() {
    if (destroyed) return;
    insets = computeInsets();
    for (const k in insets) root.style.setProperty(`--inset-${k}`, `${insets[k]}px`);
    if (root.classList.contains('kb-open')) return;
    if (sent && ['top', 'right', 'bottom', 'left'].every(k => Math.abs(sent[k] - insets[k]) < 1)) return;
    sent = { ...insets }; H.onLayout({ ...insets });
  }
  const scheduleLayout = rafThrottle(emitLayout);

  // ---- modes ------------------------------------------------------------------------------------
  function applyMode(id) {
    mode = id;
    MODES.forEach((m, i) => {
      const on = m.id === id;
      views[m.id].el.hidden = !on;
      for (const t of [dTabs.tabs[i], mTabs.tabs[i]]) { t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; }
    });
    root.dataset.mode = id; scroller.scrollTop = 0;
  }
  function userMode(id) {
    if (id === mode) { if (mobile) sheet.setSnap(sheet.getSnap() === 'peek' ? 'half' : 'peek'); return; }
    applyMode(id); H.onMode(id);
    if (mobile && sheet.getSnap() === 'peek') { /* keep the peek: it shows the key control */ }
  }

  // ---- panel collapse (desktop) -----------------------------------------------------------------
  function setPanelOpen(open) {
    collapsed = !open;
    root.classList.toggle('is-collapsed', collapsed);
    panel.toggleAttribute('inert', collapsed);
    toggle.setAttribute('aria-expanded', String(!collapsed));
    const l = collapsed ? 'Show panel (H)' : 'Hide panel (H)';
    toggle.setAttribute('aria-label', l); toggle.title = l;
    scheduleLayout();
  }

  // ---- hint -------------------------------------------------------------------------------------
  let hintTimer = 0, hintDone = lsGet(HINT_KEY) === '1';
  function showHint() { if (hintDone || destroyed) return; hint.hidden = false; requestAnimationFrame(() => hint.classList.add('is-on')); hintTimer = setTimeout(() => dismissHint(false), 14000); }
  function dismissHint(remember) {
    clearTimeout(hintTimer); hint.classList.remove('is-on'); setTimeout(() => { hint.hidden = true; }, 220);
    hintDone = true; if (remember) lsSet(HINT_KEY, '1');
  }
  const onWinPointer = e => { if (!hint.hidden && !root.contains(e.target)) dismissHint(true); };
  addEventListener('pointerdown', onWinPointer, true);

  // ---- keyboard ---------------------------------------------------------------------------------
  function onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
    if (about.isOpen()) return;
    const t = e.target;
    if (t.closest && t.closest('input[type="text"], textarea, select, [contenteditable]')) return;
    const k = e.key;
    if (k >= '1' && k <= '5') { userMode(MODES[+k - 1].id); e.preventDefault(); return; }
    if (k === 'h' || k === 'H') { if (!mobile) { setPanelOpen(collapsed); e.preventDefault(); } return; }
    if (k === '?') { openAbout(); e.preventDefault(); return; }
    if (k === ' ' && mode === 'replicate') {
      if (t.closest && t.closest('button, a, [role="radio"], [role="tab"]')) return;
      views.replicate.togglePlay(); e.preventDefault(); return;
    }
    if ((k === 'ArrowLeft' || k === 'ArrowRight') && mode === 'pair') {
      if (t.closest && t.closest('input[type="range"], [role="radio"], [role="tab"]')) return;
      views.pair.step(k === 'ArrowRight' ? 1 : -1); e.preventDefault();
    }
  }
  doc.addEventListener('keydown', onKey);

  // ---- responsive + keyboard (visualViewport) ----------------------------------------------------
  let preKbSnap = null;
  function onBreakpoint() {
    mobile = mq.matches; root.classList.toggle('is-mobile', mobile);
    sheet.enable(mobile);
    if (!mobile) { panel.toggleAttribute('inert', collapsed); }
    else panel.removeAttribute('inert');
    sheet.measure(); scheduleLayout();
  }
  mq.addEventListener('change', onBreakpoint);
  const vv = window.visualViewport;
  function onVV() {
    const open = mobile && vv && (innerHeight - vv.height) > 120;
    const was = root.classList.contains('kb-open');
    root.classList.toggle('kb-open', !!open);
    if (open) { root.style.setProperty('--vv-h', `${vv.height}px`); root.style.setProperty('--vv-top', `${vv.offsetTop}px`); }
    else { root.style.removeProperty('--vv-h'); root.style.removeProperty('--vv-top'); }
    sheet.measure();
    if (open && !was) { sheet.setSnap('full', false); }
    if (!open && was) { sent = null; scheduleLayout(); }
  }
  if (vv) { vv.addEventListener('resize', onVV); vv.addEventListener('scroll', onVV); }
  panel.addEventListener('focusin', e => {
    if (!mobile || !e.target.matches('input[type="text"]')) return;
    preKbSnap = preKbSnap || sheet.getSnap();
    sheet.setSnap('full');
    setTimeout(() => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 320);
  });
  panel.addEventListener('focusout', e => {
    if (!mobile || !e.target.matches('input[type="text"]')) return;
    setTimeout(() => { if (preKbSnap && !panel.contains(doc.activeElement)) { sheet.setSnap(preKbSnap); preKbSnap = null; } }, 200);
  });

  const ro = new ResizeObserver(() => { if (mobile) sheet.measure(); scheduleLayout(); });
  ro.observe(panel); ro.observe(header); ro.observe(dock);
  addEventListener('orientationchange', () => setTimeout(() => { sheet.measure(); scheduleLayout(); }, 250));

  // ---- about ------------------------------------------------------------------------------------
  function openAbout() { about.open(); H.onAbout(true); }

  // ---- public API --------------------------------------------------------------------------------
  let toastCount = 0;
  const api = {
    setMode(m) { if (views[m] && m !== mode) applyMode(m); },
    getMode: () => mode,
    setLoading(on, message) {
      if (message) loadMsg.textContent = message;
      loading.classList.toggle('is-off', !on);
      if (!on) { setTimeout(() => showHint(), 700); root.classList.add('is-ready'); }
    },
    setSequence(seq) { views.structure.setSequence(seq); views.pair.setSequence(seq); views.melt.setSequence(seq); },
    setStyle(st) {
      if (!st) return;
      views.structure.setStyle(st);
      const c = {}; if ('waters' in st) c.waters = st.waters; if ('color' in st) c.bfactor = st.color === 'bfactor';
      views.crystal.setToggles(c);
    },
    setMeasurements: m => views.structure.setMeasurements(m),
    setMeasureActive: v => views.structure.setMeasureActive(v),
    setPair: d => views.pair.setPair(d),
    setMeltState: s => views.melt.setMeltState(s),
    setReplicationState: s => views.replicate.setState(s),
    setReplicationLegend: i => views.replicate.setLegend(i),
    setCrystalInfo: i => views.crystal.setInfo(i),
    setCompare: c => views.crystal.setCompare(c),
    toast(message) {
      const el = h('div', { class: 'toast' }, String(message));
      toasts.append(el); toastCount++;
      while (toasts.children.length > 3) toasts.firstChild.remove();
      requestAnimationFrame(() => el.classList.add('is-on'));
      setTimeout(() => { el.classList.remove('is-on'); setTimeout(() => el.remove(), 220); }, 3200);
    },
    setDebug(d) {
      if (!debugChip || !d) return;
      const t = `${Math.round(d.fps)} fps · ${d.quality} · ${d.atoms != null ? (d.atoms >= 1000 ? (d.atoms / 1000).toFixed(1) + 'k' : d.atoms) : '?'} atoms`;
      if (debugChip.textContent !== t) debugChip.textContent = t;
    },
    showError(message, title) {
      errTitle.textContent = title || 'Something went wrong'; errMsg.textContent = message;
      errCard.hidden = false; loading.classList.add('is-off');
    },
    getInsets: () => ({ ...insets }),
    setPanelOpen, isPanelOpen: () => !collapsed,
    setSheet: (n, animate = true) => sheet.setSnap(n, animate), getSheet: () => sheet.getSnap(),
    openAbout, closeAbout: () => about.close(),
    destroy() {
      destroyed = true; doc.removeEventListener('keydown', onKey); removeEventListener('pointerdown', onWinPointer, true);
      ro.disconnect(); mq.removeEventListener('change', onBreakpoint); root.replaceChildren();
    },
  };

  // initial state
  applyMode('structure');
  root.classList.toggle('is-mobile', mobile);
  sheet.enable(mobile);
  views.structure.setStyle({ representation: 'ballstick', color: 'element', hbonds: true, grooves: false, axis: false, labels: false, autoRotate: true });
  views.melt.setMeltState({});
  requestAnimationFrame(() => { sheet.measure(); emitLayout(); });
  return api;
}
