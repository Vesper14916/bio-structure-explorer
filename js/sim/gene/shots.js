/**
 * @module sim/gene/shots
 * Camera shot catalog (PLAN.md §6.3, §6.4, §4.7) and chapter-time shot resolution
 * (docs/tasks/R3-ST3-design.md §4.3). Data only; no rendering, no clock.
 *
 * Shot shape: `{ id, target, dir, distance, detailRadius, cut, follow }`.
 * - `target` names a point in a frame: `{ frame: 'rnap'|'ribo'|'world', anchor }`,
 *   `{ frame: 'world', point }`, `{ frame: 'ribo', path, at }` or, for the coupled shots,
 *   `{ frame: 'world', midpoint: [target, target] }`.
 * - `dir` is expressed in `target.frame` (not normalised; the camera rails normalise it).
 * - `distance` is a number (angstrom) or `'fit'`; fit shots carry `fit: { margin, exclude }`.
 * - `cut` is `null` or the name of a cutaway: an anchor name or `'tunnel-axis'`.
 */

/** Minimum shot transition duration in seconds (§4.7 duration rule; design §4.3). */
export const SHOT_BLEND_SECONDS = 1.2;

const rnap = anchor => ({ frame: 'rnap', anchor });
const ribo = anchor => ({ frame: 'ribo', anchor });

const SHOT_LIST = [
  { id: 'wide', target: { frame: 'world', point: [0, 0, 0] }, dir: [0.15, 0.88, 0.45], distance: 'fit', fit: { margin: 0.10, exclude: ['crowders'] }, detailRadius: 0, cut: null, follow: false },
  { id: 'rnap-side', target: rnap('center'), dir: [0.85, 0.35, -0.40], distance: 300, detailRadius: 40, cut: null, follow: true },
  { id: 'rnap-active', target: rnap('activeSite'), dir: [0.80, 0.45, -0.40], distance: 95, detailRadius: 28, cut: 'activeSite', follow: true },
  { id: 'rnap-follow', target: rnap('activeSite'), dir: [0.85, 0.35, -0.40], distance: 180, detailRadius: 34, cut: 'activeSite', follow: true },
  { id: 'rnap-exit', target: rnap('rnaExit'), dir: [0.60, 0.70, 0.40], distance: 160, detailRadius: 36, cut: 'rnaExit', follow: true },
  { id: 'ribo-30s', target: ribo('antiSD'), dir: [-0.30, -0.85, 0.43], distance: 380, detailRadius: 34, cut: null, follow: true },
  { id: 'ribo-decode', target: ribo('siteA'), dir: [0.20, -0.75, 0.63], distance: 130, detailRadius: 30, cut: 'decoding', follow: true },
  { id: 'ribo-side', target: ribo('center'), dir: [0.10, -0.35, 0.93], distance: 560, detailRadius: 30, cut: null, follow: true },
  { id: 'ribo-ptc', target: ribo('ptc'), dir: [0.55, 0.25, 0.80], distance: 120, detailRadius: 26, cut: 'ptc', follow: true },
  { id: 'ribo-tunnel', target: { frame: 'ribo', path: 'tunnel', at: 'midpoint' }, dir: [0.70, 0.10, 0.70], distance: 210, detailRadius: 30, cut: 'tunnel-axis', follow: true },
  { id: 'ribo-exit', target: ribo('tunnelExit'), dir: [0.60, 0.55, 0.58], distance: 240, detailRadius: 40, cut: null, follow: true },
  // Coupled mode (PLAN.md §6.4): midpoint between RNAP `center` and ribosome `center`.
  { id: 'coupled-wide', target: { frame: 'world', midpoint: [rnap('center'), ribo('center')] }, dir: [0.15, 0.80, 0.58], distance: 'fit', fit: { margin: 0.15, exclude: [] }, detailRadius: 0, cut: null, follow: false },
  { id: 'coupled-follow', target: { frame: 'world', midpoint: [rnap('center'), ribo('center')] }, dir: [0.15, 0.80, 0.58], distance: 'fit', fit: { margin: 0.15, exclude: [] }, detailRadius: 0, cut: null, follow: true },
];

const deepFreeze = o => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
};

const SHOTS = new Map(SHOT_LIST.map(s => [s.id, deepFreeze(s)]));

/** All shot ids in table order. */
export const SHOT_IDS = Object.freeze(SHOT_LIST.map(s => s.id));

/**
 * Look up a named shot specification from the shot table (PLAN.md §6.3, §6.4).
 * The returned object is deeply frozen shared data. Throws for an unknown id.
 *
 * @param {string} id - Shot identifier.
 * @returns {{ id: string, target: object, dir: number[], distance: number | 'fit', detailRadius: number, cut: string | null, follow: boolean }}
 */
export function getShot(id) {
  const s = SHOTS.get(id);
  if (!s) throw new Error(`getShot: unknown shot "${id}"`);
  return s;
}

/**
 * Shot segments of every chapter of a timeline: `[{ id, t0 }]` per chapter, in order, the first
 * segment starting at the chapter start. Chapters 14 (`elongate-tl`, `ribo-tunnel` -> `ribo-exit`
 * at the start of codon 25's cycle) and 15 (`release`, `ribo-decode` -> `ribo-exit` when the peptide
 * starts to slide) of the sequential timeline switch shots in-chapter (PLAN.md §6.1); all other
 * chapters, and every coupled chapter, have a single segment.
 *
 * @param {{ chapters: object[], events: object[] }} timeline - Result of `buildTimeline`.
 * @returns {Array<Array<{ id: string, t0: number }>>} Segment list per chapter index.
 */
export function shotSegments(timeline) {
  const { chapters, events } = timeline;
  return chapters.map(ch => {
    const segs = [{ id: ch.shot, t0: ch.t0 }];
    if (ch.id === 'elongate-tl') {
      const e = events.find(ev => ev.chapter === ch.index && ev.type === 'trna.enter' && ev.data.codon === 25);
      if (e) segs.push({ id: 'ribo-exit', t0: e.t0 });
    } else if (ch.id === 'release' && ch.shot === 'ribo-decode') {
      const e = events.find(ev => ev.chapter === ch.index && ev.type === 'peptide.release');
      if (e) segs.push({ id: 'ribo-exit', t0: ch.t0 + e.data.slide[0] });
    }
    return segs;
  });
}

/**
 * Resolve the active shot state for a chapter at story time `t`, handling mid-chapter shot
 * switches. Uses `chapter.shots` (`[{ id, t0 }]`, attached by `buildTimeline`) when present, else the
 * single segment `chapter.shot`. `from` is the previous segment id; for a chapter's first segment it is `segments[0].from` (the previous chapter's last shot, set by `buildTimeline`; null for the first chapter) and
 * `blend = clamp((t - segment.t0) / 1.2)`.
 *
 * @param {object} chapter - Active Chapter descriptor.
 * @param {number} t - Story time in seconds at 1x.
 * @returns {{ id: string, from: string | null, blend: number }} Active shot transition state.
 */
export function resolveChapterShot(chapter, t) {
  const segs = chapter.shots && chapter.shots.length ? chapter.shots : [{ id: chapter.shot, t0: chapter.t0 }];
  let i = 0;
  for (let k = 1; k < segs.length; k++) if (t >= segs[k].t0) i = k;
  const u = (t - segs[i].t0) / SHOT_BLEND_SECONDS;
  return { id: segs[i].id, from: i > 0 ? segs[i - 1].id : (segs[0].from != null ? segs[0].from : null), blend: u < 0 ? 0 : u > 1 ? 1 : u };
}
