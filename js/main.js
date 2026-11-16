// Helix — application glue: connects the UI, the WebGL viewer, the science model and the sims.
import {
  buildDuplex, buildRnaDuplex, buildCrystal, measureDuplex,
  cleanSequence, cleanRnaSequence, applyFrame, idealPairFrame, HELIX_B, HELIX_A,
} from './science/index.js';
import { createViewer } from './render/viewer.js';
import { createUI, pairPayload } from './ui/ui.js';
import { createMeltSim } from './sim/melt.js';
import { createReplicationSim, BLOB_DEF } from './sim/replication.js';
import { createExpressionSim, EXPRESS_BLOB_DEF } from './sim/expression.js';
import { REPLICATION_HEX, EXPRESSION_HEX } from './render/colors.js';

const DEFAULT_SEQUENCE = 'CGCGAATTCGCGATATGGCC';
const params = new URLSearchParams(location.search);

const initialNa = params.get('na') === 'rna' ? 'rna' : 'dna';
const cleanForNa = (s, na = app.nucleicAcid) => (na === 'rna' ? cleanRnaSequence(s) : cleanSequence(s));

const app = {
  mode: 'structure',
  nucleicAcid: initialNa,
  sequence: (initialNa === 'rna' ? cleanRnaSequence(params.get('seq') || '') : cleanSequence(params.get('seq') || '')).slice(0, 40)
    || (initialNa === 'rna' ? cleanRnaSequence(DEFAULT_SEQUENCE) : DEFAULT_SEQUENCE),
  style: { representation: 'ballstick', color: 'element', hbonds: true, grooves: false, axis: false, labels: false, autoRotate: true },
  crystal: { waters: true, bfactor: false },
  melt: { T: 25, Na: 0.1 },
  replSpeed: 1,
  exprSpeed: 1,
  exprCamera: 'overview',
  exprCutaway: true,
  selectedCodon: null,     // selected codon index 0..11 in Express mode
  pair: null,              // selected base-pair index (structure / pair / crystal modes)
  measure: false,
  asm: null,               // assembly currently shown
  ideal: null, crystalAsm: null, meltSim: null, replSim: null, exprSim: null,
};
if (app.sequence.length < 4) app.sequence = initialNa === 'rna' ? cleanRnaSequence(DEFAULT_SEQUENCE) : DEFAULT_SEQUENCE;

const stage = document.getElementById('stage');
const uiRoot = document.getElementById('ui');
let viewer, ui;

// ---------------------------------------------------------------------------------------------
// Assemblies per mode (built lazily, invalidated when the sequence or nucleicAcid changes)
const ideal = () => (app.ideal ||= (app.nucleicAcid === 'rna' ? buildRnaDuplex(app.sequence) : buildDuplex(app.sequence)));
const crystal = () => (app.crystalAsm ||= buildCrystal());
const meltSim = () => (app.meltSim ||= createMeltSim(app.sequence, { T: app.melt.T, Na: app.melt.Na, seed: 7, nucleicAcid: app.nucleicAcid }));
const replSim = () => (app.replSim ||= createReplicationSim(cleanSequence(app.sequence), { seed: 11 }));
const exprSim = () => (app.exprSim ||= createExpressionSim({ seed: 19, cutaway: app.exprCutaway }));

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
  } else if (app.mode === 'express') {
    s.color = 'strand'; s.grooves = false; s.autoRotate = false;
  } else if (app.mode === 'melt') {
    s.grooves = false; s.hbonds = true;
  } else if (app.mode === 'pair') {
    s.autoRotate = false;                 // keep the face-on view of the selected pair steady
  }
  return s;
}

// ---------------------------------------------------------------------------------------------
// Annotations
const fmt = (v, d = 1) => v.toFixed(d);

function measurementAnnotations(asm) {
  if (asm.meta.kind !== 'ideal') return [];
  const helix = asm.meta.helix || (asm.meta.nucleicAcid === 'rna' ? HELIX_A : HELIX_B);
  const n = asm.meta.length, m = measureDuplex(asm), out = [];
  const z = k => idealPairFrame(k, n, helix).o[2];
  const mid = Math.floor(n / 2);
  // Rise: one base-pair step, drawn just outside the helix.
  const R = m.phosphateRadius + 5;
  out.push({ id: 'rise', kind: 'distance', from: [R, 0, z(mid)], to: [R, 0, z(mid + 1 < n ? mid + 1 : mid - 1)], label: `rise ${fmt(m.rise, 2)} Å` });
  // Pitch: one full turn (10.5 bp for B-DNA, 11.0 bp for A-RNA), if the duplex is long enough.
  if ((n - 1) * m.rise >= m.pitch) {
    const z0 = -m.pitch / 2;
    out.push({ id: 'pitch', kind: 'distance', from: [-R, 0, z0], to: [-R, 0, z0 + m.pitch], label: `pitch ${fmt(m.pitch)} Å · ${helix.bpPerTurn} bp` });
  }
  // Diameter: a bar just below the bottom end (so it is not hidden inside the atoms), spanning the
  // phosphate-to-phosphate width in the direction of the first phosphate; label underneath.
  const k = Math.min(n - 1, 1), p = asm.position(asm.atomOf(2 * k, 'P'));
  const r = Math.hypot(p[0], p[1]), ux = p[0] / r, uy = p[1] / r, h = m.diameter / 2, zb = z(0) - 6;
  out.push({ id: 'dia', kind: 'distance', labelPos: 'below', from: [-ux * h, -uy * h, zb], to: [ux * h, uy * h, zb], label: `diameter ≈ ${fmt(m.diameter, 0)} Å` });
  // Grooves: +x of a pair frame looks into the major groove, −x into the minor groove. Groove widths
  // need at least a full turn on each side, so short duplexes get the label without a number.
  const kg = Math.min(n - 1, mid + 3), kh = Math.max(0, mid - 3);
  const w = v => (Number.isFinite(v) ? ` · ${fmt(v)} Å` : '');
  out.push({ id: 'major', kind: 'label', at: applyFrame(idealPairFrame(kg, n, helix), [9.5, 0, 0]), label: `Major groove${w(m.majorGrooveWidth)}` });
  out.push({ id: 'minor', kind: 'label', at: applyFrame(idealPairFrame(kh, n, helix), [-8.5, 0, 0]), label: `Minor groove${w(m.minorGrooveWidth)}` });
  return out;
}

function pairAnnotations(asm, index) {
  const p = asm.pairs[index];
  if (!p) return [];
  return p.hbonds.map((h, i) => {
    const a = asm.position(h.a), b = asm.position(h.b);
    return { id: 'hb' + i, kind: 'distance', size: 'sm', from: a, to: b, label: `${fmt(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]), 2)} Å` };
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
    if (focus) viewer.focus({ pair: index }, { duration: 0.8, view: 'face' });
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
  viewer.setFollowTarget?.(null);
  viewer.setFraming?.(
    mode === 'replicate' ? replicationFraming(replSim()) :
    mode === 'express' ? expressionFraming(exprSim()) : null
  );

  if (mode === 'crystal') app.asm = crystal();
  else if (mode === 'melt') { const s = meltSim(); s.setConditions({ T: app.melt.T, Na: app.melt.Na }); app.asm = s.assembly; }
  else if (mode === 'replicate') app.asm = replSim().assembly;
  else if (mode === 'express') app.asm = exprSim().assembly;
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
    const sim = replSim();
    if (sim.state.progress === 0 || sim.state.finished) { sim.seek(0); sim.play(); }
    viewer.setBlobs(sim.blobs);
    pushReplication(true);
  } else if (mode === 'express') {
    const sim = exprSim();
    sim.setCutaway(app.exprCutaway);
    sim.setCameraMode(app.exprCamera);
    if (sim.state.progress === 0 || sim.state.finished) { sim.seek(0); sim.play(); }
    viewer.setBlobs(sim.blobs);
    applyExpressCamera();
    applyCodonHighlight(app.selectedCodon, { focus: false });
    pushExpression(true);
  } else if (mode === 'crystal') {
    app.pair = null;
    ui.setCrystalInfo({ atoms: app.asm.atoms.count, waters: app.asm.waters ? app.asm.waters.count : null });
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
const REPL_PHASE = {
  initiation: 'Helicase loading', unwinding: 'Unwinding', priming: 'Priming', leading: 'Leading strand',
  lagging: 'Lagging strand', 'primer-removal': 'Primer removal', ligation: 'Ligation', termination: 'Finishing',
  separation: 'Daughters separate', complete: 'Complete',
};
const hexCss = c => '#' + c.toString(16).padStart(6, '0');
const REPL_LEGEND = [
  { id: 'parental', label: 'Parental (old)', color: hexCss(REPLICATION_HEX.parental), kind: 'strand' },
  { id: 'leading', label: 'New leading strand', color: hexCss(REPLICATION_HEX.leading), kind: 'strand' },
  { id: 'lagging', label: 'New lagging strand', color: hexCss(REPLICATION_HEX.lagging), kind: 'strand' },
  { id: 'primer', label: 'RNA primer', color: hexCss(REPLICATION_HEX.primer), kind: 'strand' },
  { id: 'helicase', label: BLOB_DEF.helicase.label, color: hexCss(BLOB_DEF.helicase.color), kind: 'blob' },
  { id: 'polymerase', label: BLOB_DEF['pol-leading'].label, color: hexCss(BLOB_DEF['pol-leading'].color), kind: 'blob' },
  { id: 'primase', label: BLOB_DEF.primase.label, color: hexCss(BLOB_DEF.primase.color), kind: 'blob' },
  { id: 'ligase', label: BLOB_DEF.ligase.label, color: hexCss(BLOB_DEF.ligase.color), kind: 'blob' },
];

/**
 * Camera framing for the whole replication timeline: the oriented bounding box (fork plane axes) of every
 * docked / settled atom and every enzyme body over the animation, so nothing important ever leaves the
 * view, and a view direction perpendicular to the plane of the Y-shaped fork. Cached per sim.
 */
function replicationFraming(sim) {
  if (sim._framing) return sim._framing;
  const fp = sim.layout.forkPlane, U = fp.inPlane, N = fp.normal, Z = [0, 0, 1];
  const dot = (a, x, y, z) => a[0] * x + a[1] * y + a[2] * z;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  const add = (x, y, z, r = 0) => {
    const c = [dot(U, x, y, z), dot(N, x, y, z), z];
    for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], c[i] - r); hi[i] = Math.max(hi[i], c[i] + r); }
  };
  const save = sim.state.progress, asm = sim.assembly, P = asm.atoms.pos;
  for (let i = 0; i <= 48; i++) {
    sim.seek(i / 48);
    for (const nu of asm.nucleotides) {
      if (nu.visible === false || nu.opacity < 0.7) continue;
      for (let a = 0; a < nu.atomCount; a += 3) { const g = (nu.atomStart + a) * 3; add(P[g], P[g + 1], P[g + 2]); }
    }
    for (const b of sim.blobs) if (b.opacity > 0.08) add(b.pos[0], b.pos[1], b.pos[2], b.radius * 0.9);
  }
  sim.seek(save);
  hi[2] += 7;                                          // room for the enzyme labels above the top blob
  const pts = [];
  for (const a of [lo[0], hi[0]]) for (const b of [lo[1], hi[1]]) for (const c of [lo[2], hi[2]]) {
    pts.push([a * U[0] + b * N[0] + c * Z[0], a * U[1] + b * N[1] + c * Z[1], a * U[2] + b * N[2] + c * Z[2]]);
  }
  const d = [N[0], N[1], N[2] + 0.14], l = Math.hypot(...d);
  return (sim._framing = { points: pts, dir: d.map(v => v / l) });
}
function pushReplication(force = false) {
  const sim = replSim(), st = sim.state;
  const payload = {
    progress: st.progress, playing: !!st.playing && !st.finished, speed: app.replSpeed, phase: REPL_PHASE[st.phase] || st.phase,
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
// Gene Expression (Transcription + Translation)
let lastExprCaption = '';
const EXPRESS_LEGEND = [
  { id: 'coding', label: 'Coding DNA (5′→3′)', color: hexCss(EXPRESSION_HEX.coding), kind: 'strand' },
  { id: 'template', label: 'Template DNA (3′→5′)', color: hexCss(EXPRESSION_HEX.template), kind: 'strand' },
  { id: 'mrna', label: 'mRNA transcript (2′-OH)', color: hexCss(EXPRESSION_HEX.mrna), kind: 'strand' },
  { id: 'trna', label: 'tRNA anticodon', color: hexCss(EXPRESSION_HEX.trna), kind: 'strand' },
  { id: 'peptide', label: 'Nascent peptide', color: hexCss(EXPRESSION_HEX.peptide), kind: 'strand' },
  { id: 'rnap', label: EXPRESS_BLOB_DEF.rnap.label, color: hexCss(EXPRESS_BLOB_DEF.rnap.color), kind: 'blob' },
  { id: 'ribosome', label: '30S / 50S Ribosome', color: hexCss(EXPRESS_BLOB_DEF['ribosome-30s'].color), kind: 'blob' },
  { id: 'rf1', label: EXPRESS_BLOB_DEF.rf1.label, color: hexCss(EXPRESS_BLOB_DEF.rf1.color), kind: 'blob' },
];

function expressionFraming(sim) {
  if (sim._framing) return sim._framing;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  const add = (x, y, z, r = 0) => {
    lo[0] = Math.min(lo[0], x - r); hi[0] = Math.max(hi[0], x + r);
    lo[1] = Math.min(lo[1], y - r); hi[1] = Math.max(hi[1], y + r);
    lo[2] = Math.min(lo[2], z - r); hi[2] = Math.max(hi[2], z + r);
  };
  const save = sim.state.progress, asm = sim.assembly, P = asm.atoms.pos;
  for (let i = 0; i <= 32; i++) {
    sim.seek(i / 32);
    for (const nu of asm.nucleotides) {
      if (nu.visible === false || nu.opacity < 0.5) continue;
      for (let a = 0; a < nu.atomCount; a += 4) { const g = (nu.atomStart + a) * 3; add(P[g], P[g + 1], P[g + 2]); }
    }
    for (const r of asm.residues || []) if (r.visible) add(r.pos[0], r.pos[1], r.pos[2], r.radius || 2);
    for (const b of sim.blobs) if (b.visible && b.opacity > 0.08) add(b.pos[0], b.pos[1], b.pos[2], b.radius * 0.85);
  }
  sim.seek(save);
  const pts = [];
  for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) pts.push([x, y, z]);
  return (sim._framing = { points: pts, dir: [0.15, 0.88, 0.45] });
}

function applyExpressCamera() {
  if (!viewer || app.mode !== 'express') return;
  if (app.exprCamera === 'overview') {
    viewer.setFollowTarget?.(null);
    viewer.focus(null, { duration: 0.7 });
  } else {
    viewer.setFollowTarget?.({ mode: app.exprCamera });
  }
}

function applyCodonHighlight(codonIdx, { focus = true } = {}) {
  app.selectedCodon = codonIdx;
  if (!viewer || app.mode !== 'express') return;
  const asm = exprSim().assembly;
  if (codonIdx === null || codonIdx === undefined || codonIdx < 0) {
    viewer.setHighlight(null);
    return;
  }
  const nucIds = [];
  for (const nu of asm.nucleotides) {
    if (nu.codon === codonIdx) nucIds.push(nu.id);
  }
  const resIds = [];
  for (const r of asm.residues || []) {
    if (r.codonIndex === codonIdx) resIds.push(r.id);
  }
  viewer.setHighlight({ nucleotides: nucIds, residues: resIds });
  if (focus && nucIds.length) {
    viewer.focus({ nucleotides: nucIds }, { duration: 0.65 });
  }
}

function pushExpression(force = false) {
  const sim = exprSim(), st = sim.state;
  const payload = {
    progress: st.progress,
    playing: !!st.playing && !st.finished,
    speed: app.exprSpeed,
    phase: st.phase,
    cameraMode: app.exprCamera,
    cutaway: app.exprCutaway,
    rnaCount: st.rnaCount,
    hybridCount: st.hybridCount,
    codonIndex: st.codonIndex,
    activeCodon: st.activeCodon,
    selectedCodon: app.selectedCodon,
    peptideCount: st.peptideCount,
    peptideSeq: st.peptideSeq,
    construct: st.construct,
  };
  if (force || st.caption !== lastExprCaption) {
    payload.caption = st.caption;
    lastExprCaption = st.caption;
  }
  ui.setExpressState?.(payload);
}

function tickExpression(dt) {
  const sim = exprSim();
  sim.update(dt * app.exprSpeed);
  viewer.sync();
  viewer.setBlobs(sim.blobs);
  pushExpression();
}

// ---------------------------------------------------------------------------------------------
// UI handlers
const handlers = {
  onMode(mode) { if (mode !== app.mode) showMode(mode); },

  onNucleicAcid(na) {
    if (na !== 'dna' && na !== 'rna') return;
    if (na === app.nucleicAcid) return;
    app.nucleicAcid = na;
    app.sequence = cleanForNa(app.sequence, na);
    app.pair = null;
    invalidateSequenceModels();
    ui.setNucleicAcid?.(na);
    ui.setSequence(app.sequence);
    if (app.mode === 'structure' || app.mode === 'pair' || app.mode === 'melt') {
      showMode(app.mode, { keepCamera: true });
    }
  },

  onStyle(partial) {
    Object.assign(app.style, partial);
    viewer.setStyle(styleForMode());
  },

  onSequence(seq) {
    seq = cleanForNa(seq, app.nucleicAcid);
    if (seq === app.sequence || seq.length < 4) return;
    app.sequence = seq; app.pair = null;
    invalidateSequenceModels();
    ui.setSequence(seq);
    if (app.mode !== 'crystal' && app.mode !== 'express') showMode(app.mode);
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

  onExpression({ action, value }) {
    const sim = exprSim();
    if (action === 'play') { if (sim.state.finished) sim.seek(0); sim.play(); }
    else if (action === 'pause') sim.pause();
    else if (action === 'restart') { sim.seek(0); sim.play(); }
    else if (action === 'seek') { sim.seek(value); viewer.sync(); viewer.setBlobs(sim.blobs); }
    else if (action === 'speed') { app.exprSpeed = value; sim.setSpeed(value); }
    else if (action === 'camera') { app.exprCamera = value || 'overview'; sim.setCameraMode(app.exprCamera); applyExpressCamera(); }
    else if (action === 'cutaway') { app.exprCutaway = !!value; sim.setCutaway(app.exprCutaway); viewer.setBlobs(sim.blobs); }
    else if (action === 'selectCodon') { applyCodonHighlight(value, { focus: true }); }
    pushExpression(true);
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
    if (app.mode === 'express') {
      if (!e || (e.codon === undefined || e.codon < 0)) {
        if (app.selectedCodon !== null) { applyCodonHighlight(null, { focus: false }); pushExpression(true); }
        return;
      }
      const nextCodon = app.selectedCodon === e.codon ? null : e.codon;
      applyCodonHighlight(nextCodon, { focus: false });
      pushExpression(true);
      return;
    }
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
    else if (app.mode === 'express') tickExpression(dt);
    if (params.has('debug') && (debugAcc += dt) > 0.5) { debugAcc = 0; ui.setDebug(viewer.getState()); }
  });

  ui.setNucleicAcid?.(app.nucleicAcid);
  ui.setSequence(app.sequence);
  ui.setReplicationLegend?.(REPL_LEGEND);
  ui.setExpressLegend?.(EXPRESS_LEGEND);
  const startMode = ['structure', 'pair', 'melt', 'replicate', 'express', 'crystal'].includes(params.get('mode')) ? params.get('mode') : 'structure';
  ui.setMode(startMode);
  showMode(startMode);
  ui.setLoading(false);
  window.helix = { app, viewer, ui };                   // handy for debugging and automated tests
}

boot();
