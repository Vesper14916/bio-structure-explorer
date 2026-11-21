/**
 * @module scene/story-scene
 * Round 3 top-level story scene controller (PLAN.md §8.1, §8.4, docs/CONTRACTS.md §7.5, task R3-INT2).
 * Connects Story (`buildStory`/`stateAt`), Poser (`createPoser`), CameraRails (`createCameraRails`),
 * Labels (`selectLabels`), Inspection (`buildInspectInfo`), and the Helix 3D Viewer API.
 *
 * The whole story plays: story time is clamped to `duration - END_EPSILON` (the contract shows defaults at
 * exactly `duration`, S2 boundary rule), unless `opts.maxTime` asks for an earlier stop.
 */
import { Assembly, TRUE_SCALE_GENE_CONSTRUCT, codonTable } from '../science/index.js';
import { buildStory, stateAt, createWorldState } from '../sim/gene/story.js';
import { createPoser } from '../kin/pose.js';
import { createCameraRails } from './camera-rails.js';
import { selectLabels } from './labels.js';
import { buildInspectInfo } from '../ui/inspect.js';
import { generateCrowd } from './crowd.js';
import { RIBO_LAYOUT } from '../sim/gene/translation.js';

/** The last story time that can be shown: the contract returns defaults at t = duration (PLAN.md §8.2). */
export const END_EPSILON = 1e-3;

const GROUP_PHASE_LEVEL = {
  T: 'closed',
  I: 'mid',
  E: 'open',
  O: 'closed',
};

const REGION_GENE_INDICES = [
  ['−35', 10],
  ['−10', 35],
  ['+1', 45],
  ['SD', 56],
  ['AUG', 69],
  ['UAA', 189],
  ['Terminator', 205],
];

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function normalizeFxList(worldFx) {
  const out = [];
  if (Array.isArray(worldFx)) {
    for (let i = 0; i < worldFx.length; i++) {
      const e = worldFx[i];
      if (e && (e.type === 'pulse' || e.type === 'gtp')) out.push(e);
    }
    return out;
  }
  if (!worldFx || typeof worldFx !== 'object') return out;
  if (Array.isArray(worldFx.pulses)) {
    for (let i = 0; i < worldFx.pulses.length; i++) {
      const e = worldFx.pulses[i];
      if (e && (e.type === 'pulse' || e.type === 'gtp')) out.push(e);
      else if (e && e.anchor) out.push({ type: 'pulse', anchor: e.anchor, f: e.f ?? 0 });
    }
  }
  if (Array.isArray(worldFx.flashes)) {
    for (let i = 0; i < worldFx.flashes.length; i++) {
      const e = worldFx.flashes[i];
      if (e && (e.type === 'pulse' || e.type === 'gtp')) out.push(e);
      else if (e && e.anchor) out.push({ type: 'gtp', anchor: e.anchor, f: e.f ?? 0, label: e.label });
    }
  }
  return out;
}

function computeLabelPositions(target, world, out) {
  const asm = target && target.asm;
  const nucs = asm && asm.nucleotides;
  if (!nucs || nucs.length < 496) return out;

  const setPt = (key, o) => {
    if (!o) return;
    let dst = out[key];
    if (!dst) { dst = [0, 0, 0]; out[key] = dst; }
    dst[0] = o[0]; dst[1] = o[1]; dst[2] = o[2];
  };

  // DNA 5' and 3' ends (coding strand 0: 0..247)
  if (nucs[0] && nucs[0].frame) setPt('DNA 5′', nucs[0].frame.o);
  if (nucs[247] && nucs[247].frame) setPt('DNA 3′', nucs[247].frame.o);

  // Region tags along DNA (coding strand 0). Once the ribosome is in the scene, SD, AUG and UAA are drawn on the
  // mRNA codons in the ribosome (mRNA index = DNA index − 45) instead of on the DNA (ST8 audit F04).
  const riboLayout = Boolean(world && world.rna && world.rna.layout === 'ribosome') ||
    Boolean(world && (world.machines || []).some(m => m && m.id === 'ribosome'));
  for (let i = 0; i < REGION_GENE_INDICES.length; i++) {
    const [key, g] = REGION_GENE_INDICES[i];
    const onMrna = riboLayout && (key === 'SD' || key === 'AUG' || key === 'UAA');
    const nu = onMrna ? nucs[496 + (key === 'SD' ? g - 45 + 2 : g - 45 + 1)] : nucs[g];
    if (nu && nu.frame) setPt(key, nu.frame.o);
  }

  // mRNA 5' and 3' ends (strand 2: 496..674)
  const rnaLen = Math.max(0, Math.min(179, Math.floor(world?.rna?.length ?? 0)));
  if (rnaLen > 0) {
    const head = nucs[496];
    const tail = nucs[496 + rnaLen - 1];
    if (head && head.frame) setPt('mRNA 5′', head.frame.o);
    if (tail && tail.frame) setPt('mRNA 3′', tail.frame.o);
  }

  return out;
}

function actorMatchesCutaway(act, cutSpec) {
  if (!act || !cutSpec) return false;
  const id = String(act.id || '');
  const assetId = String(act.assetId || '');
  // Resolved cut specs (camera-rails `resolveCutSpec`) name the machine they open; `kind` is only 'anchor' or
  // 'tunnel-axis', so it cannot be used to pick the machine.
  const machine = typeof cutSpec === 'object' ? String(cutSpec.machineId || '') : '';
  if (machine === 'ribosome') return id === 'ribosome' || id === 'ribo' || assetId.startsWith('ribosome');
  if (machine === 'rnap') return id === 'rnap' || assetId.startsWith('rnap');
  const kind = typeof cutSpec === 'string' ? cutSpec : String(cutSpec.anchor || cutSpec.kind || '');
  if (kind === 'decoding' || kind === 'ptc' || kind === 'tunnel-axis') {
    return id === 'ribosome' || id === 'ribo' || assetId.startsWith('ribosome');
  }
  return id === 'rnap' || assetId.startsWith('rnap');
}

function normalizePickHit(hit, target) {
  if (!hit || typeof hit !== 'object') return null;
  if (hit.kind === 'actor') {
    const actorObj = target.actors.find(a => a && a.id === hit.actorId) || null;
    const part = hit.part || hit.partId || null;
    return {
      ...hit,
      assetId: hit.assetId || (actorObj && actorObj.assetId) || null,
      part,
      partId: part,
    };
  }
  if (hit.kind === 'atomGroup') {
    return {
      ...hit,
      groupId: hit.groupId || hit.id || null,
      role: hit.role || hit.groupId || null,
    };
  }
  if (Number.isInteger(hit.residue) && hit.residue >= 0) {
    return { ...hit, kind: 'peptide', role: 'peptide' };
  }
  if (Number.isInteger(hit.nuc) && hit.nuc >= 0) {
    const nu = target.asm && target.asm.nucleotides && target.asm.nucleotides[hit.nuc];
    if (!nu) return null;
    const role = nu.role || (nu.strand === 2 ? 'mrna' : 'coding');
    return {
      ...hit,
      kind: 'nucleotide',
      role,
      strand: nu.strand,
      base: nu.base,
      seqIndex: nu.seqIndex,
      codon: nu.codon,
    };
  }
  return null;
}

/**
 * Create a StoryScene controller bound to a Helix 3D `viewer` instance.
 *
 * @param {object} viewer - Helix 3D Viewer instance (`createViewer(...)`).
 * @param {{
 *   scenario?: object,
 *   assets?: object,
 *   mode?: 'sequential' | 'coupled',
 *   tier?: string,
 *   maxTime?: number,
 *   onStateChange?: (uiState: object) => void,
 * }} [opts]
 * @returns {object} StoryScene controller (`PLAN.md` §8.4).
 */
export function createStoryScene(viewer, opts = {}) {
  if (!viewer || typeof viewer !== 'object') {
    throw new Error('createStoryScene: viewer instance is required');
  }

  const scenario = opts.scenario || TRUE_SCALE_GENE_CONSTRUCT;
  const assets = opts.assets || {};
  let mode = opts.mode === 'coupled' ? 'coupled' : 'sequential';
  let tier = opts.tier || (viewer.getState ? viewer.getState().tier : 'high') || 'high';
  const onStateChange = typeof opts.onStateChange === 'function' ? opts.onStateChange : null;

  let story = buildStory(scenario, assets, { mode });
  const lastShownTime = () => Math.max(0, story.duration - END_EPSILON);
  const defaultMaxTime = () => {
    if (Number.isFinite(opts.maxTime) && opts.maxTime > 0) return Math.min(opts.maxTime, lastShownTime());
    return lastShownTime();
  };
  let maxTime = defaultMaxTime();

  const poser = createPoser({ construct: scenario, assets });
  const world = createWorldState();
  const target = {
    asm: new Assembly(),
    groups: [],
    actors: [],
    fx: { pulses: [], flashes: [] },
    focus: { center: [0, 0, 0], radius: 32 },
  };
  const labelPositions = Object.create(null);

  const codons = codonTable(scenario);
  let t = 0;
  let playing = false;
  let speed = 1;
  let selectedCodon = null;
  let inspect = null;
  let disposed = false;

  const toggles = {
    cutaway: true,
    labels: true,
    crowding: tier !== 'low',
  };

  // Cytoplasmic crowders (PLAN.md §4.5): generated once per quality tier, shown while the Crowding toggle is on.
  const crowdCache = new Map();
  let crowdShown = null;
  function currentTier() {
    const st = viewer.getState ? viewer.getState() : null;
    return (st && st.quality) || tier;
  }
  let crowdFrames = 0;
  function syncCrowd(force = false) {
    if (disposed || !viewer.setCrowd) return;
    // The auto quality tier can change while playing; poll it every 30 frames rather than on each one.
    if (!force && crowdShown !== null && (++crowdFrames % 30) !== 0) return;
    tier = currentTier();
    const useTier = toggles.crowding ? tier : 'low';
    if (crowdShown === useTier) return;
    crowdShown = useTier;
    if (useTier === 'low') { viewer.setCrowd([], assets); return; }
    let list = crowdCache.get(useTier);
    if (!list) {
      list = generateCrowd(scenario, assets, { seed: 19, tier: useTier, ribosomePose: RIBO_LAYOUT });
      crowdCache.set(useTier, list);
    }
    viewer.setCrowd(list, assets);
  }

  const cameraRails = createCameraRails(viewer, {
    initialOption: 'auto',
    onCameraOptionChange: () => emitState(),
  });

  // Prime the 675-nt Assembly and attach it once to Viewer with expression strand colours.
  stateAt(story, 0, world);
  poser.pose(world, target);
  if (target.asm.meta) target.asm.meta.kind = 'expression';
  viewer.setStyle?.({ representation: 'ballstick', color: 'strand', hbonds: true, autoRotate: false });
  viewer.setFraming?.(null);
  viewer.setBlobs?.([]);
  viewer.setAnnotations?.([]);
  viewer.setFar?.(12000);
  viewer.setAssembly?.(target.asm, { keepCamera: true });

  function getActorLevels() {
    const map = {};
    const st = viewer.getActorState ? viewer.getActorState() : null;
    if (Array.isArray(st)) {
      for (let i = 0; i < st.length; i++) {
        if (st[i] && st[i].id && st[i].level) map[st[i].id] = st[i].level;
      }
    }
    return map;
  }

  function applyScene({ instantCamera = false, forceTransition = false } = {}) {
    if (disposed) return;
    stateAt(story, t, world);
    poser.pose(world, target);

    const activeShot = cameraRails.applyWorldState(world, assets, {
      instant: instantCamera,
      forceTransition,
    });

    const cutSpec = toggles.cutaway && activeShot ? activeShot.cut : null;
    for (let i = 0; i < target.actors.length; i++) {
      const act = target.actors[i];
      if (!act) continue;
      act.cutaway = cutSpec && actorMatchesCutaway(act, cutSpec) ? cutSpec : false;
    }

    viewer.setActors?.(target.actors);
    viewer.setAtomGroups?.(target.groups);
    viewer.setFx?.(normalizeFxList(world.fx));
    syncCrowd();

    if (toggles.labels) {
      computeLabelPositions(target, world, labelPositions);
      const labels = selectLabels(world, assets, {
        enabled: true,
        cameraOption: cameraRails.getOption(),
        positions: labelPositions,
      });
      viewer.setLabels?.(labels);
    } else {
      viewer.setLabels?.([]);
    }

    viewer.sync?.();
  }

  function buildUiState() {
    const ch = world.chapter || story.chapters[0];
    const chIdx = ch ? ch.index : 0;
    const dur = story.duration > 0 ? story.duration : 1;
    const rawCodon = world.counters ? world.counters.codon : 0;
    return {
      t,
      duration: story.duration,
      maxTime,
      progress: clamp(t / dur, 0, 1),
      playing,
      speed,
      mode,
      chapterIndex: chIdx,
      chapters: story.chapters,
      caption: world.caption || (ch ? ch.caption : ''),
      phase: ch ? ch.title : '',
      phaseLevel: (ch && GROUP_PHASE_LEVEL[ch.group]) || 'closed',
      cameraOption: cameraRails.getOption(),
      toggles: { ...toggles },
      counters: {
        mrna: world.counters?.mrna ?? world.rna?.length ?? 0,
        hybrid: world.counters?.hybrid ?? 0,
        codon: rawCodon,
        peptide: world.counters?.peptide ?? world.peptide?.length ?? 0,
      },
      codons,
      activeCodon: rawCodon > 0 ? rawCodon : 0,
      selectedCodon,
      peptideSeq: [],
      inspect,
      tier,
    };
  }

  function emitState() {
    if (onStateChange && !disposed) onStateChange(buildUiState());
  }

  function seek(nextT, { instantCamera = false } = {}) {
    if (disposed) return;
    const clamped = clamp(Number(nextT) || 0, 0, maxTime);
    t = clamped;
    if (t >= maxTime && playing) playing = false;
    applyScene({ instantCamera });
    emitState();
  }

  function seekProgress(p, optsSeek) {
    const dur = story.duration > 0 ? story.duration : maxTime;
    seek(clamp(Number(p) || 0, 0, 1) * dur, optsSeek);
  }

  function setChapter(index, { frac = 0.001, instantCamera = false } = {}) {
    if (disposed || !story.chapters.length) return;
    const ci = clamp(Math.floor(Number(index) || 0), 0, story.chapters.length - 1);
    const ch = story.chapters[ci];
    const f = clamp(Number(frac) || 0, 0, 0.999);
    const targetT = ch.t0 + f * Math.max(0, ch.t1 - ch.t0);
    seek(Math.min(targetT, maxTime), { instantCamera });
  }

  function play() {
    if (disposed) return;
    if (t >= maxTime - 1e-3) {
      t = 0;
      applyScene({ instantCamera: true });
    }
    playing = true;
    emitState();
  }

  function pause() {
    if (disposed) return;
    if (playing) {
      playing = false;
      emitState();
    }
  }

  function restart() {
    if (disposed) return;
    t = 0;
    playing = true;
    applyScene({ instantCamera: true });
    emitState();
  }

  function setSpeed(v) {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return;
    speed = n;
    emitState();
  }

  function setMode(nextMode) {
    if (disposed) return;
    const norm = nextMode === 'coupled' ? 'coupled' : 'sequential';
    if (norm === mode) return;
    mode = norm;
    story = buildStory(scenario, assets, { mode });
    maxTime = defaultMaxTime();
    t = clamp(t, 0, maxTime);
    poser.reset?.();
    applyScene({ instantCamera: true });
    emitState();
  }

  function setCameraOption(opt, camOpts = {}) {
    if (disposed) return;
    cameraRails.setOption(opt, camOpts);
    applyScene({ instantCamera: Boolean(camOpts.instant) });
    emitState();
  }

  function setToggles(partial = {}) {
    if (disposed || !partial || typeof partial !== 'object') return;
    let changed = false;
    if ('cutaway' in partial && Boolean(partial.cutaway) !== toggles.cutaway) {
      toggles.cutaway = Boolean(partial.cutaway);
      changed = true;
    }
    if ('labels' in partial && Boolean(partial.labels) !== toggles.labels) {
      toggles.labels = Boolean(partial.labels);
      changed = true;
    }
    if ('crowding' in partial && Boolean(partial.crowding) !== toggles.crowding) {
      toggles.crowding = Boolean(partial.crowding);
      changed = true;
    }
    if (changed) {
      syncCrowd(true);
      applyScene({ instantCamera: false });
      emitState();
    }
  }

  function selectCodon(codonIdx) {
    if (disposed) return;
    if (codonIdx === null || codonIdx === undefined || codonIdx < 0) {
      selectedCodon = null;
      viewer.setHighlight?.(null);
      emitState();
      return;
    }
    const idx = Math.floor(Number(codonIdx));
    selectedCodon = selectedCodon === idx ? null : idx;
    if (selectedCodon === null) {
      viewer.setHighlight?.(null);
    } else {
      const nucIds = [];
      const wantCodon1Based = selectedCodon + 1;
      for (let i = 496; i < target.asm.nucleotides.length; i++) {
        const nu = target.asm.nucleotides[i];
        if (nu && nu.codon === wantCodon1Based) nucIds.push(nu.id);
      }
      viewer.setHighlight?.(nucIds.length ? { nucleotides: nucIds } : null);
    }
    emitState();
  }

  function clearInspect() {
    if (disposed) return;
    if (inspect !== null) {
      inspect = null;
      emitState();
    }
  }

  function pick(hit) {
    if (disposed) return null;
    const norm = normalizePickHit(hit, target);
    const info = norm ? buildInspectInfo(norm, assets, world, { actorLevels: getActorLevels() }) : null;
    inspect = info;
    emitState();
    return info;
  }

  function tick(dt) {
    if (disposed || !playing) return;
    const step = Math.min(Math.max(Number(dt) || 0, 0), 0.1) * speed;
    if (step <= 0) return;
    t += step;
    if (t >= maxTime) {
      t = maxTime;
      playing = false;
    }
    applyScene({ instantCamera: false });
    emitState();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    playing = false;
    cameraRails.dispose();
    viewer.setActors?.([]);
    viewer.setAtomGroups?.([]);
    viewer.setFx?.([]);
    viewer.setLabels?.([]);
    viewer.setCrowd?.([], assets);
    viewer.setDetailFocus?.(null);
    viewer.setFollowTarget?.(null);
    viewer.setHighlight?.(null);
  }

  // Render initial frame at t = 0 with instant camera snap.
  applyScene({ instantCamera: true, forceTransition: true });

  return {
    get story() { return story; },
    get world() { return world; },
    get target() { return target; },
    get maxTime() { return maxTime; },
    seek,
    seekProgress,
    setChapter,
    play,
    pause,
    restart,
    setSpeed,
    setMode,
    setCameraOption,
    setToggles,
    selectCodon,
    clearInspect,
    pick,
    tick,
    state: buildUiState,
    dispose,
  };
}
