// Helix — application glue: connects the UI, the WebGL viewer, the science model and the sims.
import {
  buildDuplex, buildCrystal, measureDuplex, cleanSequence, applyFrame, idealPairFrame, HELIX_B,
} from './science/index.js';
import { createViewer } from './render/viewer.js';
import { createUI, pairPayload } from './ui/ui.js';
import { createMeltSim } from './sim/melt.js';
import { createReplicationSim } from './sim/replication.js';

const DEFAULT_SEQUENCE = 'CGCGAATTCGCGATATGGCC';
const params = new URLSearchParams(location.search);

const app = {
  mode: 'structure',
  sequence: cleanSequence(params.get('seq') || '') .slice(0, 40) || DEFAULT_SEQUENCE,
  style: { representation: 'ballstick', color: 'element', hbonds: true, grooves: false, axis: false, labels: false, autoRotate: true },
  crystal: { waters: true, bfactor: false },
  melt: { T: 25, Na: 0.1 },
  replSpeed: 1,
  pair: null,              // selected base-pair index (structure / pair / crystal modes)
  measure: false,
  asm: null,               // assembly currently shown
  ideal: null, crystalAsm: null, meltSim: null, replSim: null,
};
if (app.sequence.length < 4) app.sequence = DEFAULT_SEQUENCE;

const stage = document.getElementById('stage');
const uiRoot = document.getElementById('ui');
let viewer, ui;

// ---------------------------------------------------------------------------------------------
// Assemblies per mode (built lazily, invalidated when the sequence changes)
const ideal = () => (app.ideal ||= buildDuplex(app.sequence));
const crystal = () => (app.crystalAsm ||= buildCrystal());
const meltSim = () => (app.meltSim ||= createMeltSim(app.sequence, { T: app.melt.T, Na: app.melt.Na, seed: 7 }));
const replSim = () => (app.replSim ||= createReplicationSim(app.sequence, { seed: 11 }));

function invalidateSequenceModels() {
  app.meltSim?.dispose?.(); app.replSim?.dispose?.();
  app.ideal = app.meltSim = app.replSim = null;
}

function styleForMode() {
  const s = { ...app.style, waters: false, jitter: 0 };
  if (app.mode === 'crystal') {
    s.waters = app.crystal.waters;
    if (app.crystal.bfactor) s.color = 'bfactor';
  } else if (app.mode === 'replicate') {
    s.color = 'strand'; s.grooves = false; s.autoRotate = false;
  } else if (app.mode === 'melt') {
    s.grooves = false; s.hbonds = true;
  }
  return s;
}

// ---------------------------------------------------------------------------------------------
// Annotations
const fmt = (v, d = 1) => v.toFixed(d);

function measurementAnnotations(asm) {
  if (asm.meta.kind !== 'ideal') return [];
  const n = asm.meta.length, m = measureDuplex(asm), out = [];
  const z = k => idealPairFrame(k, n).o[2];
  const mid = Math.floor(n / 2);
  // Rise: one base-pair step, drawn just outside the helix.
  const R = m.phosphateRadius + 5;
  out.push({ id: 'rise', kind: 'distance', from: [R, 0, z(mid)], to: [R, 0, z(mid + 1 < n ? mid + 1 : mid - 1)], label: `rise ${fmt(m.rise, 2)} Å` });
  // Pitch: one full turn (10.5 bp), if the duplex is long enough.
  if ((n - 1) * m.rise >= m.pitch) {
    const z0 = -m.pitch / 2;
    out.push({ id: 'pitch', kind: 'distance', from: [-R, 0, z0], to: [-R, 0, z0 + m.pitch], label: `pitch ${fmt(m.pitch)} Å · ${HELIX_B.bpPerTurn} bp` });
  }
  // Diameter: through the axis, in the direction of a phosphate near one end.
  const k = Math.min(n - 1, 1), p = asm.position(asm.atomOf(2 * k, 'P'));
  const r = Math.hypot(p[0], p[1]), ux = p[0] / r, uy = p[1] / r, h = m.diameter / 2;
  out.push({ id: 'dia', kind: 'distance', from: [-ux * h, -uy * h, p[2]], to: [ux * h, uy * h, p[2]], label: `diameter ≈ ${fmt(m.diameter, 0)} Å` });
  // Grooves: +x of a pair frame looks into the major groove, −x into the minor groove.
  const kg = Math.min(n - 1, mid + 3), kh = Math.max(0, mid - 3);
  out.push({ id: 'major', kind: 'label', at: applyFrame(idealPairFrame(kg, n), [9.5, 0, 0]), label: `Major groove · ${fmt(m.majorGrooveWidth)} Å` });
  out.push({ id: 'minor', kind: 'label', at: applyFrame(idealPairFrame(kh, n), [-8.5, 0, 0]), label: `Minor groove · ${fmt(m.minorGrooveWidth)} Å` });
  return out;
}

function pairAnnotations(asm, index) {
  const p = asm.pairs[index];
  if (!p) return [];
  return p.hbonds.map((h, i) => {
    const a = asm.position(h.a), b = asm.position(h.b);
    return { id: 'hb' + i, kind: 'distance', from: a, to: b, label: `${fmt(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]), 2)} Å` };
  });
}

function refreshAnnotations() {
  if (app.mode === 'pair' && app.pair !== null) viewer.setAnnotations(pairAnnotations(app.asm, app.pair));
  else if (app.mode === 'structure' && app.measure) viewer.setAnnotations(measurementAnnotations(app.asm));
  else viewer.setAnnotations([]);
}

// ---------------------------------------------------------------------------------------------
// Pair selection
function selectPair(index, { focus = true } = {}) {
  const asm = app.asm;
  if (index !== null && (!asm || !asm.pairs[index])) index = null;
  app.pair = index;
  if (index === null) {
    viewer.setHighlight(null);
    ui.setPair(null);
    if (focus) viewer.focus(null, { duration: 0.8 });
  } else {
    viewer.setHighlight({ pairs: [index] });
    ui.setPair(pairPayload(asm, index));
    if (focus) viewer.focus({ pair: index }, { duration: 0.8 });
  }
  refreshAnnotations();
}

// ---------------------------------------------------------------------------------------------
// Mode switching
function showMode(mode, { keepCamera = false } = {}) {
  app.mode = mode;
  viewer.setHighlight(null);
  viewer.setBlobs([]);
  viewer.setAnnotations([]);

  if (mode === 'crystal') app.asm = crystal();
  else if (mode === 'melt') { const s = meltSim(); s.setConditions({ T: app.melt.T, Na: app.melt.Na }); app.asm = s.assembly; }
  else if (mode === 'replicate') app.asm = replSim().assembly;
  else app.asm = ideal();

  viewer.setStyle(styleForMode());
  viewer.setAssembly(app.asm, { keepCamera });
  ui.setStyle(styleForMode());

  if (mode === 'structure') {
    app.pair = null;
    ui.setMeasurements(measureDuplex(app.asm));
  } else if (mode === 'pair') {
    selectPair(app.pair !== null && app.asm.pairs[app.pair] ? app.pair : Math.floor(app.asm.pairs.length / 2));
  } else if (mode === 'melt') {
    pushMeltStatic();
  } else if (mode === 'replicate') {
    pushReplication(true);
  } else if (mode === 'crystal') {
    app.pair = null;
    ui.setCompare({ ideal: measureDuplex(buildDuplex(app.asm.meta.sequence)), crystal: measureDuplex(app.asm) });
  }
  refreshAnnotations();
}

// ---------------------------------------------------------------------------------------------
// Melt
let lastJitter = -1;
function pushMeltStatic() {
  const st = meltSim().state;
  ui.setMeltState({ T: st.T, Na: st.Na, Tm: st.Tm, dH: st.dH, dS: st.dS, dG37: st.dG37, gc: st.gc, curve: st.curve });
}
const PHASE_LABEL = { duplex: 'Intact duplex', fraying: 'Fraying ends', melting: 'Partly melted', 'single strands': 'Single strands' };
function tickMelt(dt) {
  const sim = meltSim();
  sim.update(dt);
  viewer.sync();
  const st = sim.state;
  ui.setMeltState({ openness: st.openness, fractionPaired: st.fractionPaired, phase: PHASE_LABEL[st.phase] || st.phase });
  const j = Math.round((st.jitter ?? 0) * 20) / 20;
  if (j !== lastJitter) { lastJitter = j; viewer.setStyle({ jitter: j }); }
}

// ---------------------------------------------------------------------------------------------
// Replication
let lastCaption = '';
function pushReplication(force = false) {
  const sim = replSim(), st = sim.state;
  const payload = {
    progress: st.progress, playing: !!st.playing && !st.finished, speed: app.replSpeed, phase: st.phase,
    unwound: st.unwound, leadingCount: st.leadingCount, laggingCount: st.laggingCount, fragments: st.fragments,
  };
  if (force || st.caption !== lastCaption) { payload.caption = st.caption; lastCaption = st.caption; }
  ui.setReplicationState(payload);
}
function tickReplication(dt) {
  const sim = replSim();
  sim.update(dt * app.replSpeed);
  viewer.sync();
  viewer.setBlobs(sim.blobs);
  pushReplication();
}

// ---------------------------------------------------------------------------------------------
// UI handlers
const handlers = {
  onMode(mode) { if (mode !== app.mode) showMode(mode); },

  onStyle(partial) {
    Object.assign(app.style, partial);
    viewer.setStyle(styleForMode());
  },

  onSequence(seq) {
    seq = cleanSequence(seq);
    if (seq === app.sequence || seq.length < 4) return;
    app.sequence = seq; app.pair = null;
    invalidateSequenceModels();
    ui.setSequence(seq);
    if (app.mode !== 'crystal') showMode(app.mode);
  },

  onSelectPair(index) {
    if (app.mode !== 'pair') return;
    selectPair(index);
  },

  onMeasureToggle(on) { app.measure = !!on; refreshAnnotations(); },

  onMelt({ T, Na }) {
    const naChanged = Na !== undefined && Na !== app.melt.Na;
    if (T !== undefined) app.melt.T = T;
    if (Na !== undefined) app.melt.Na = Na;
    if (app.mode !== 'melt') return;
    meltSim().setConditions({ T: app.melt.T, Na: app.melt.Na });
    if (naChanged) pushMeltStatic(); else ui.setMeltState({ T: app.melt.T });
  },

  onReplication({ action, value }) {
    const sim = replSim();
    if (action === 'play') { if (sim.state.finished) sim.seek(0); sim.play(); }
    else if (action === 'pause') sim.pause();
    else if (action === 'restart') { sim.seek(0); sim.play(); }
    else if (action === 'seek') { sim.seek(value); viewer.sync(); viewer.setBlobs(sim.blobs); }
    else if (action === 'speed') app.replSpeed = value;
    pushReplication(true);
  },

  onCrystal(c) {
    Object.assign(app.crystal, c);
    if (app.mode === 'crystal') viewer.setStyle(styleForMode());
  },

  onLayout(insets) { viewer?.setViewInsets?.(insets); },
};

// ---------------------------------------------------------------------------------------------
// Boot
function boot() {
  ui = createUI(uiRoot, handlers);
  try {
    viewer = createViewer(stage, { quality: params.get('quality') || 'auto' });
  } catch (err) {
    console.error(err);
    ui.setLoading(false);
    ui.showError('This browser could not start WebGL, which Helix needs for the 3D view.', '3D view unavailable');
    return;
  }
  if (ui.getInsets) viewer.setViewInsets?.(ui.getInsets());

  viewer.on('pick', e => {
    if (app.mode === 'melt' || app.mode === 'replicate') return;
    if (!e || e.pair < 0) {
      if (app.mode === 'pair') return;                 // keep the inspected pair
      if (app.pair !== null) selectPair(null, { focus: false });
      return;
    }
    if (app.mode === 'crystal') {                       // inspect in place, on the experimental model
      app.pair = e.pair; viewer.setHighlight({ pairs: [e.pair] });
      viewer.setAnnotations(pairAnnotations(app.asm, e.pair));
      return;
    }
    app.pair = e.pair;
    if (app.mode !== 'pair') { ui.setMode('pair'); showMode('pair', { keepCamera: true }); }
    else selectPair(e.pair);
  });

  let debugAcc = 0;
  viewer.on('frame', dt => {
    if (app.mode === 'melt') tickMelt(dt);
    else if (app.mode === 'replicate') tickReplication(dt);
    if (params.has('debug') && (debugAcc += dt) > 0.5) { debugAcc = 0; ui.setDebug(viewer.getState()); }
  });

  ui.setSequence(app.sequence);
  const startMode = ['structure', 'pair', 'melt', 'replicate', 'crystal'].includes(params.get('mode')) ? params.get('mode') : 'structure';
  ui.setMode(startMode);
  showMode(startMode);
  ui.setLoading(false);
  window.helix = { app, viewer, ui };                   // handy for debugging and automated tests
}

boot();
