/**
 * @module sim/gene/story
 * Story engine (PLAN.md §8.2, docs/CONTRACTS.md §7.3, docs/tasks/R3-ST3-design.md §4.4-§4.5, task R3-S2 part b).
 * Pure, deterministic evaluation of story time into WorldState with no DOM or Three.js dependencies.
 *
 * `stateAt` fills `t`, `chapter`, `chapterProgress`, `caption`, `counters`, `highlight` and `shot`, resets every
 * other field to the `createWorldState()` defaults, then calls the contributors `contributeTx`, `contributeTl`
 * and (coupled mode only) `contributeCoupled`. Those are pass-through plug points that S3, S4 and S5 replace.
 *
 * Contributor rule for `out` arrays (`machines`, `trnas`, `fx`): `stateAt` truncates them (`length = 0`) at the start of
 * every call, so a contributor must fill them completely on every call; to avoid per-call allocation it should keep
 * its entry pool on `out` itself (e.g. a non-enumerable `out._pool`), never in module-level mutable state.
 */
import { buildTimeline } from './timeline.js';
import { SHOT_BLEND_SECONDS } from './shots.js';
import { contributeTx } from './transcription.js';
import { contributeTl } from './translation.js';
import { contributeCoupled } from './coupled.js';

const HYBRID_MAX = 9;
const STOP_CODON = 41;

/** Create a WorldState with the S2 defaults (design §4.5). `chapter` is null until `stateAt` fills it. */
export function createWorldState() {
  return {
    t: 0,
    chapter: null,
    chapterProgress: 0,
    caption: '',
    machines: [],
    dna: { machineId: null, register: 45, bend: 0, bubble: [0, 0], relax: 0, trackBlend: 0 },
    rna: { length: 0, addProgress: 0, hairpin: 0, released: false, layout: 'rnap', layoutBlend: 0 },
    ribosome: { codon: 0, bound: false },
    trnas: [],
    peptide: { length: 0, attach: 'free', release: 0 },
    ntp: { base: null, path: 0, bonded: false },
    ppi: { path: 0, opacity: 0 },
    fx: [],
    counters: { mrna: 0, hybrid: 0, codon: 0, peptide: 0 },
    highlight: { codon: null },
    shot: { id: '', from: null, blend: 0 },
  };
}

// --- Event index ------------------------------------------------------------------------------------

function makeChannel(events, ids) {
  const n = ids.length;
  const idx0 = Int32Array.from(ids); // already in (t0, id) order
  const t0 = new Float64Array(n);
  for (let i = 0; i < n; i++) t0[i] = events[idx0[i]].t0;
  const byEnd = Array.from(ids).sort((a, b) => events[a].t1 - events[b].t1 || a - b);
  const idx1 = Int32Array.from(byEnd);
  const t1 = new Float64Array(n);
  for (let i = 0; i < n; i++) t1[i] = events[idx1[i]].t1;
  return { n, idx0, t0, idx1, t1 };
}

function buildIndex(chapters, events) {
  const groups = new Map(); // type -> { all: number[], targets: Map<target, number[]> }
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    let g = groups.get(e.type);
    if (!g) groups.set(e.type, (g = { all: [], targets: new Map() }));
    g.all.push(i);
    const tg = e.data && e.data.target !== undefined ? e.data.target : null;
    let l = g.targets.get(tg);
    if (!l) g.targets.set(tg, (l = []));
    l.push(i);
  }
  const byType = new Map();
  for (const [type, g] of groups) {
    const targets = new Map();
    for (const [tg, ids] of g.targets) targets.set(tg, makeChannel(events, ids));
    byType.set(type, { all: makeChannel(events, g.all), targets });
  }
  const chT0 = new Float64Array(chapters.length);
  const chT1 = new Float64Array(chapters.length);
  chapters.forEach((c, i) => { chT0[i] = c.t0; chT1[i] = c.t1; });
  return { byType, chT0, chT1 };
}

const EMPTY = { n: 0, idx0: new Int32Array(0), t0: new Float64Array(0), idx1: new Int32Array(0), t1: new Float64Array(0) };

function channel(story, type, target) {
  const g = story.index.byType.get(type);
  if (!g) return EMPTY;
  if (target === null || target === undefined) return g.all;
  return g.targets.get(target) || EMPTY;
}

/** Number of elements of the sorted array `a` that are <= x. */
function upperBound(a, n, x) {
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (a[mid] <= x) lo = mid + 1; else hi = mid;
  }
  return lo;
}

/**
 * Index (into `story.events`) of the last event of `type` (and `target`, or any target when null) that has started
 * (`t0 <= t`); -1 if none. O(log E), no allocation.
 */
export function lastStarted(story, type, target, t) {
  const c = channel(story, type, target);
  const p = upperBound(c.t0, c.n, t);
  return p === 0 ? -1 : c.idx0[p - 1];
}

/** Number of events of `type` (and `target`, or any when null) with `t1 <= t`. O(log E), no allocation. */
export function completedCount(story, type, target, t) {
  const c = channel(story, type, target);
  return upperBound(c.t1, c.n, t);
}

/** Progress of event `eventIndex` at `t`: clamp((t - t0)/(t1 - t0)); 1 for a zero-length event once started (else 0). */
export function progressOf(story, eventIndex, t) {
  const e = story.events[eventIndex];
  const d = e.t1 - e.t0;
  if (d <= 0) return t >= e.t0 ? 1 : 0;
  const u = (t - e.t0) / d;
  return u < 0 ? 0 : u > 1 ? 1 : u;
}

// --- Builder ----------------------------------------------------------------------------------------

function isSorted(events) {
  for (let i = 1; i < events.length; i++) {
    const a = events[i - 1];
    const b = events[i];
    if (a.t0 > b.t0 || (a.t0 === b.t0 && a.id > b.id)) return false;
  }
  return true;
}

/**
 * Build a deterministic Story (chapters, sorted events, metadata, event index) for a gene-expression scenario.
 *
 * Contract (PLAN.md §8.2): `Story = { mode, duration, chapters, events, meta }`; the event index is attached as a
 * non-enumerable `index` property, so `JSON.stringify(story)` is safe and does not include it.
 *
 * @param {object} scenario - Construct v3 (or `{ construct }`).
 * @param {object} assets - Decoded assets keyed by id (`ribosome-70s` gives `{N}`; `rnap-ec` may give D).
 * @param {{ mode?: 'sequential' | 'coupled', seed?: number, D?: number, timeline?: object }} [opts] - With
 *   `opts.timeline` (e.g. `tests/fixtures/story-mini.json`) its chapters and events are used instead of generated ones.
 * @returns {object} Story.
 */
export function buildStory(scenario, assets, { mode = 'sequential', seed = 19, D, timeline } = {}) {
  const tl = timeline || buildTimeline(scenario, assets, { mode, seed, D });
  const events = isSorted(tl.events) ? tl.events : tl.events.slice().sort((a, b) => a.t0 - b.t0 || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const story = {
    mode: timeline ? (timeline.mode || mode) : mode,
    duration: tl.duration,
    chapters: tl.chapters,
    events,
    meta: tl.meta || {},
  };
  Object.defineProperty(story, 'index', { value: buildIndex(story.chapters, events), enumerable: false, writable: false });
  return story;
}

// --- Evaluation -------------------------------------------------------------------------------------

function chapterIndex(story, t) {
  const a = story.index.chT0;
  const p = upperBound(a, a.length, t);
  return p === 0 ? 0 : p - 1;
}

/**
 * Return the active Chapter at story time `t` (seconds at 1x). `t` is clamped to `[0, duration]`; at a chapter
 * boundary the later chapter is returned, except at `duration`, which returns the last chapter.
 *
 * @param {object} story - Story built by `buildStory`.
 * @param {number} t - Story time.
 * @returns {object} Chapter descriptor (the same object as in `story.chapters`).
 */
export function chapterAt(story, t) {
  const tc = t > story.duration ? story.duration : t > 0 ? t : 0;
  return story.chapters[chapterIndex(story, tc)];
}

function resetDefaults(out) {
  out.machines.length = 0;
  out.trnas.length = 0;
  out.fx.length = 0;
  const d = out.dna;
  d.machineId = null; d.register = 45; d.bend = 0; d.bubble[0] = 0; d.bubble[1] = 0; d.relax = 0; d.trackBlend = 0;
  const r = out.rna;
  r.length = 0; r.addProgress = 0; r.hairpin = 0; r.released = false; r.layout = 'rnap'; r.layoutBlend = 0;
  out.ribosome.codon = 0; out.ribosome.bound = false;
  const p = out.peptide;
  p.length = 0; p.attach = 'free'; p.release = 0;
  out.ntp.base = null; out.ntp.path = 0; out.ntp.bonded = false;
  out.ppi.path = 0; out.ppi.opacity = 0;
}

/**
 * Evaluate the deterministic WorldState at story time `t` (seconds at 1x). Pure function of `(story, t)`; with `out`
 * given, no objects or arrays are created (captions and ids are existing strings). `t` is clamped to `[0, duration]`.
 * Then calls `contributeTx`, `contributeTl` and, in coupled mode, `contributeCoupled`.
 *
 * @param {object} story - Story built by `buildStory`.
 * @param {number} t - Story time.
 * @param {object} [out] - Optional reusable WorldState to populate in place.
 * @returns {object} WorldState at time `t`.
 */
export function stateAt(story, t, out = undefined) {
  if (out === undefined) out = createWorldState();
  else resetDefaults(out);
  const tc = t > story.duration ? story.duration : t > 0 ? t : 0; // NaN -> 0
  const ci = chapterIndex(story, tc);
  const ch = story.chapters[ci];
  out.t = tc;
  out.chapter = ch;
  const span = ch.t1 - ch.t0;
  const prog = span > 0 ? (tc - ch.t0) / span : 1;
  out.chapterProgress = prog < 0 ? 0 : prog > 1 ? 1 : prog;
  out.caption = ch.caption;

  // Counters (design §4.5).
  const mrna = completedCount(story, 'bond.phosphodiester', null, tc);
  const c = out.counters;
  c.mrna = mrna;
  c.hybrid = lastStarted(story, 'rna.release', null, tc) >= 0 ? 0 : (mrna < HYBRID_MAX ? mrna : HYBRID_MAX);
  let codon = 0;
  const pairs = channel(story, 'codon.pair', null);
  const np = upperBound(pairs.t1, pairs.n, tc);
  if (np > 0) codon = story.events[pairs.idx1[np - 1]].data.codon | 0;
  if (completedCount(story, 'factor.enter', 'rf1', tc) > 0) codon = STOP_CODON;
  c.codon = codon;
  c.peptide = np > 0 ? 1 + completedCount(story, 'bond.peptide', null, tc) : 0;
  out.highlight.codon = codon > 0 ? codon : null;

  // Shot: same result as resolveChapterShot(ch, t), written in place without allocating.
  const segs = ch.shots && ch.shots.length ? ch.shots : null;
  let si = 0;
  let segT0 = ch.t0;
  let segId = ch.shot;
  if (segs) {
    for (let k = 1; k < segs.length; k++) if (tc >= segs[k].t0) si = k;
    segT0 = segs[si].t0;
    segId = segs[si].id;
  }
  const u = (tc - segT0) / SHOT_BLEND_SECONDS;
  out.shot.id = segId;
  out.shot.from = si > 0 ? segs[si - 1].id : (segs && segs[0].from != null ? segs[0].from : null);
  out.shot.blend = u < 0 ? 0 : u > 1 ? 1 : u;

  contributeTx(story, tc, out);
  contributeTl(story, tc, out);
  if (story.mode === 'coupled') contributeCoupled(story, tc, out);
  return out;
}
