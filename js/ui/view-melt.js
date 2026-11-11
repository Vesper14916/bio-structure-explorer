// "Melt" mode: temperature slider, salt selector, melting-curve chart, live openness strip, thermodynamics.
import { h, s, fmt, setText, rafThrottle, clamp } from './dom.js';
import { segmented, range, stat, sectionLabel } from './components.js';

export const T_MIN = 0, T_MAX = 110;
const SALTS = [{ value: 0.01, label: '10 mM' }, { value: 0.05, label: '50 mM' }, { value: 0.1, label: '100 mM' }, { value: 1, label: '1 M' }];

export function createMeltView(ctx) {
  const { H } = ctx;
  const st = { T: 25, Na: 0.1, Tm: NaN, curve: null, fractionPaired: NaN };
  let seq = '';

  // ---- slider ------------------------------------------------------------------------------------
  const tText = h('b', { class: 'tval' }, '25.0');
  const phase = h('span', { class: 'phase', 'data-level': 'closed' }, '—');
  const emit = rafThrottle(() => H.onMelt({ T: st.T, Na: st.Na }));
  const slider = range({
    min: T_MIN, max: T_MAX, step: 0.5, value: st.T, label: 'Temperature in degrees Celsius', className: 'range-lg range-temp',
    onInput: v => { st.T = v; setText(tText, v.toFixed(1)); emit(); },
  });
  const tmTick = h('span', { class: 'tm-tick', hidden: true }, h('span', { class: 'tm-flag' }, 'Tm'));
  const tmScale = h('span', { class: 'tm-scale' }, h('span', {}, '0 °C'), h('span', {}, '110 °C'));
  const sliderWrap = h('div', { class: 'tslider' }, slider.el, tmTick, tmScale);
  const peek = h('div', { class: 'peek' },
    h('div', { class: 'tline' }, h('span', { class: 'tread' }, tText, h('i', {}, '°C')), phase),
    sliderWrap);

  const salt = segmented({
    label: 'Sodium ion concentration', options: SALTS, value: st.Na, className: 'seg-sm',
    onChange: v => { st.Na = v; H.onMelt({ T: st.T, Na: v }); },
  });

  // ---- chart ---------------------------------------------------------------------------------------
  const W = 340, HT = 156, ML = 36, MR = 10, MT = 10, MB = 26;
  const X = T => ML + (T - T_MIN) / (T_MAX - T_MIN) * (W - ML - MR);
  const Y = p => MT + (1 - p) * (HT - MT - MB);
  const grid = s('g', { class: 'ch-grid' });
  for (const p of [0, 0.5, 1]) {
    grid.append(s('line', { x1: ML, x2: W - MR, y1: Y(p), y2: Y(p), class: p === 0 ? 'ch-axis' : '' }),
      s('text', { x: ML - 6, y: Y(p) + 3.5, 'text-anchor': 'end', class: 'ch-tick' }, `${p * 100}%`));
  }
  for (let T = 0; T <= 100; T += 20) grid.append(s('line', { x1: X(T), x2: X(T), y1: Y(1), y2: Y(0), class: 'ch-vgrid' }), s('text', { x: X(T), y: HT - 8, 'text-anchor': 'middle', class: 'ch-tick' }, `${T}°`));
  const area = s('path', { class: 'ch-area' }), line = s('path', { class: 'ch-line' });
  const tmLine = s('line', { class: 'ch-tm', y1: Y(1), y2: Y(0) }), tmTxt = s('text', { class: 'ch-tmtxt', y: MT + 10 }, 'Tm');
  const curG = s('g', { class: 'ch-cur' }, s('line', { y1: Y(1), y2: Y(0) }), s('circle', { r: 4.5, cy: Y(1) }));
  const curDot = curG.querySelector('circle');
  const svg = s('svg', { class: 'chart', viewBox: `0 0 ${W} ${HT}`, role: 'img', 'aria-label': 'Melting curve: fraction of base pairs intact versus temperature' },
    grid, area, line, tmLine, tmTxt, curG,
    s('text', { x: 4, y: 8, class: 'ch-ytitle' }, 'paired'));
  const chartSummary = h('p', { class: 'sr-only', 'aria-live': 'off' });
  let drawnCurve = null;
  function drawCurve(curve) {
    drawnCurve = curve;
    if (!curve || curve.length < 2) { line.setAttribute('d', ''); area.setAttribute('d', ''); return; }
    const pts = curve.map(c => `${X(c.T).toFixed(1)},${Y(c.paired).toFixed(1)}`);
    line.setAttribute('d', 'M' + pts.join('L'));
    area.setAttribute('d', `M${X(curve[0].T).toFixed(1)},${Y(0)}L${pts.join('L')}L${X(curve[curve.length - 1].T).toFixed(1)},${Y(0)}Z`);
  }
  function placeCursor() {
    curG.setAttribute('transform', `translate(${X(clamp(st.T, T_MIN, T_MAX)).toFixed(2)},0)`);
    const p = Number.isFinite(st.fractionPaired) ? st.fractionPaired : 1;
    curDot.setAttribute('cy', Y(clamp(p, 0, 1)).toFixed(2));
  }
  function placeTm() {
    const ok = Number.isFinite(st.Tm) && st.Tm > T_MIN && st.Tm < T_MAX;
    tmTick.hidden = !ok; tmLine.style.display = tmTxt.style.display = ok ? '' : 'none';
    if (!ok) return;
    tmTick.style.setProperty('--f', ((st.Tm - T_MIN) / (T_MAX - T_MIN)).toFixed(4));
    setText(tmTick.firstChild, `Tm ${st.Tm.toFixed(1)}°`);
    const x = X(st.Tm);
    tmLine.setAttribute('x1', x); tmLine.setAttribute('x2', x);
    tmTxt.setAttribute('x', x + (x > W - 60 ? -5 : 5)); tmTxt.setAttribute('text-anchor', x > W - 60 ? 'end' : 'start');
    tmTxt.textContent = `Tm ${st.Tm.toFixed(1)}°C`;
  }

  // ---- openness strip --------------------------------------------------------------------------------
  const strip = h('div', { class: 'openness', role: 'img', 'aria-label': 'Per base pair openness, 5 prime end on the left' });
  let fills = [], last = null;
  function buildStrip(n) {
    strip.replaceChildren(); fills = []; last = new Float32Array(n).fill(-1);
    strip.style.setProperty('--n', n);
    for (let i = 0; i < n; i++) {
      const b = seq.length === n ? seq[i] : null;
      const f = h('b');
      strip.append(h('i', { class: 'ocell', 'data-gc': b ? (b === 'G' || b === 'C' ? '1' : '0') : null, style: b ? { '--tag': ctx.col(b) } : null }, f, h('u')));
      fills.push(f);
    }
  }
  function setOpenness(arr) {
    if (!arr || !arr.length) return;
    if (arr.length !== fills.length) buildStrip(arr.length);
    for (let i = 0; i < arr.length; i++) {
      const v = Math.round(clamp(arr[i], 0, 1) * 160) / 160;
      if (v === last[i]) continue;
      last[i] = v;
      const f = fills[i];
      f.style.transform = `scaleY(${v})`;
      f.style.opacity = (0.45 + 0.55 * v).toFixed(2);
    }
  }

  // ---- thermo readouts ---------------------------------------------------------------------------------
  const R = {
    Tm: stat({ label: 'Melting point Tm', unit: '°C', big: true }),
    gc: stat({ label: 'GC content', unit: '%', big: true }),
    dH: stat({ label: 'ΔH°', unit: 'kcal/mol' }),
    dS: stat({ label: 'ΔS°', unit: 'cal/mol·K' }),
    dG: stat({ label: 'ΔG°37', unit: 'kcal/mol' }),
    fp: stat({ label: 'Pairs intact', unit: '%' }),
  };

  const el = h('section', { class: 'view', id: 'view-melt', 'aria-labelledby': 'tab-melt', role: 'tabpanel', hidden: true },
    h('header', { class: 'view-head' }, h('h2', {}, 'Melt the duplex'), h('p', {}, 'Raise the temperature until the two strands come apart.')),
    peek,
    h('div', { class: 'group' }, sectionLabel('Sodium [Na⁺]'), salt.el),
    h('div', { class: 'card' },
      h('div', { class: 'card-title' }, h('h3', {}, 'Melting curve'), h('span', { class: 'card-sub' }, 'fraction of pairs intact')),
      svg, chartSummary),
    h('div', { class: 'card' },
      h('div', { class: 'card-title' }, h('h3', {}, 'Which pairs are open?'), h('span', { class: 'card-sub' }, '5′ → 3′')),
      strip,
      h('div', { class: 'openness-key' }, h('span', { class: 'k-closed' }, 'paired'), h('span', { class: 'k-bar' }), h('span', { class: 'k-open' }, 'open'))),
    h('div', { class: 'stats stats-2' }, Object.values(R).map(x => x.el)),
    h('div', { class: 'explain' },
      h('h3', { class: 'label' }, 'What is modelled'),
      h('p', {}, 'Each base pair is either closed or open. Closed neighbours gain a stacking free energy from the nearest-neighbour parameters of SantaLucia (1998), corrected for sodium concentration; that helix–coil equilibrium is solved exactly at every temperature. AT-rich stretches and the ends have the weakest stacks, so they open first, and the midpoint Tm shifts with GC content, length and salt.')));

  buildStrip(0);

  function setMeltState(m) {
    if (!m) return;
    if ('Na' in m && m.Na !== st.Na) { st.Na = m.Na; salt.set(m.Na); }
    if ('T' in m && m.T !== st.T) {
      st.T = m.T; setText(tText, m.T.toFixed(1));
      if (document.activeElement !== slider.el || !slider.el.matches(':active')) slider.set(m.T);
      placeCursor();
    }
    if ('Tm' in m) { st.Tm = m.Tm; R.Tm.set(fmt(m.Tm, 1)); placeTm(); }
    if ('dH' in m) R.dH.set(fmt(m.dH, 1));
    if ('dS' in m) R.dS.set(fmt(m.dS, 1));
    if ('dG37' in m) R.dG.set(fmt(m.dG37, 1));
    if ('gc' in m) R.gc.set(fmt(m.gc * 100, 0));
    if ('curve' in m && m.curve !== drawnCurve) { drawCurve(m.curve); if (m.curve) chartSummary.textContent = ''; }
    if ('fractionPaired' in m) {
      st.fractionPaired = m.fractionPaired; R.fp.set(fmt(m.fractionPaired * 100, 0)); placeCursor();
      phase.dataset.level = m.fractionPaired > 0.9 ? 'closed' : m.fractionPaired < 0.1 ? 'open' : 'mid';
    }
    if ('phase' in m) setText(phase, m.phase || '—');
    if (m.openness) setOpenness(m.openness);
  }

  return {
    el, setMeltState,
    setSequence(sq) { seq = sq || ''; if (fills.length === seq.length) { buildStrip(seq.length); } },
    getState: () => ({ T: st.T, Na: st.Na }),
  };
}
