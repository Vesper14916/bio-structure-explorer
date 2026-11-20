/**
 * @module scene/camera-rails
 * Round 3 guided camera rails and shot resolution (PLAN.md §4.7, §6.3, §6.4, §8.1, task R3-R3).
 * Resolves shot definitions in actor/world frames, computes transition timing, and manages Free interrupt.
 * Zero Three.js or DOM imports so it runs identically in Node and in the browser.
 */
import { SHOT_IDS, getShot } from '../sim/gene/shots.js';
import { composeFrame } from '../kin/frames.js';
import { machinePoseForRegister } from '../kin/duplex.js';

const FOV_DEG = 32;
const HALF_FOV_RAD = (FOV_DEG * 0.5 * Math.PI) / 180;
const SIN_HALF_FOV = Math.sin(HALF_FOV_RAD);
const MIN_FIT_DISTANCE = 280;
const MAX_FIT_DISTANCE = 2600;
const GENE_HALF_SPAN_X = 420; // 248 bp * 3.38 A / 2 ≈ 419.12 A along world +x
const GENE_DUPLEX_RADIUS = 12;

const IDENTITY_FRAME = Object.freeze({
  o: Object.freeze([0, 0, 0]),
  R: Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]),
});

const DEFAULT_RIBO_FRAME = Object.freeze({
  o: Object.freeze([0, 0, -250]),
  R: Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]),
});

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function isFiniteVec3(v) {
  return (
    (Array.isArray(v) || ArrayBuffer.isView(v)) &&
    v.length >= 3 &&
    Number.isFinite(v[0]) &&
    Number.isFinite(v[1]) &&
    Number.isFinite(v[2])
  );
}

function applyFramePoint(frame, pt) {
  const R = (frame && frame.R) || IDENTITY_FRAME.R;
  const o = (frame && frame.o) || IDENTITY_FRAME.o;
  const x = pt ? pt[0] || 0 : 0;
  const y = pt ? pt[1] || 0 : 0;
  const z = pt ? pt[2] || 0 : 0;
  return [
    R[0] * x + R[1] * y + R[2] * z + o[0],
    R[3] * x + R[4] * y + R[5] * z + o[1],
    R[6] * x + R[7] * y + R[8] * z + o[2],
  ];
}

function rotateUnitDir(frame, dir) {
  const dx = dir && Number.isFinite(dir[0]) ? dir[0] : 0;
  const dy = dir && Number.isFinite(dir[1]) ? dir[1] : 0;
  const dz = dir && Number.isFinite(dir[2]) ? dir[2] : 1;
  const len = Math.hypot(dx, dy, dz) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const uz = dz / len;
  const R = (frame && frame.R) || IDENTITY_FRAME.R;
  const wx = R[0] * ux + R[1] * uy + R[2] * uz;
  const wy = R[3] * ux + R[4] * uy + R[5] * uz;
  const wz = R[6] * ux + R[7] * uy + R[8] * uz;
  const wlen = Math.hypot(wx, wy, wz) || 1;
  return [wx / wlen, wy / wlen, wz / wlen];
}

function normalizeFrame(tf, fallback = IDENTITY_FRAME) {
  if (!tf || !isFiniteVec3(tf.o) || !(Array.isArray(tf.R) || ArrayBuffer.isView(tf.R)) || tf.R.length < 9) {
    return { o: fallback.o.slice(), R: fallback.R.slice() };
  }
  return {
    o: [tf.o[0], tf.o[1], tf.o[2]],
    R: [tf.R[0], tf.R[1], tf.R[2], tf.R[3], tf.R[4], tf.R[5], tf.R[6], tf.R[7], tf.R[8]],
  };
}

function findRnapContext(worldState, assets) {
  const machines = (worldState && Array.isArray(worldState.machines)) ? worldState.machines : [];
  const rnapMachine =
    machines.find(m => m && m.visible !== false && (m.id === 'rnap' || String(m.assetId || '').startsWith('rnap'))) ||
    machines.find(m => m && (m.id === 'rnap' || String(m.assetId || '').startsWith('rnap'))) ||
    null;

  const assetMap = assets || {};
  const asset =
    (rnapMachine && rnapMachine.assetId && assetMap[rnapMachine.assetId]) ||
    assetMap['rnap-ec'] ||
    assetMap['rnap-holo'] ||
    null;

  if (rnapMachine && rnapMachine.transform && isFiniteVec3(rnapMachine.transform.o)) {
    return {
      machineId: rnapMachine.id || 'rnap',
      machine: rnapMachine,
      asset,
      frame: normalizeFrame(rnapMachine.transform),
    };
  }

  const reg = Number.isFinite(worldState?.dna?.register) ? worldState.dna.register : 45;
  const templateAsset = (asset && asset.tracks && asset.tracks.template)
    ? asset
    : (assetMap['rnap-ec'] && assetMap['rnap-ec'].tracks && assetMap['rnap-ec'].tracks.template ? assetMap['rnap-ec'] : null);

  if (templateAsset) {
    try {
      const pose = machinePoseForRegister(templateAsset, reg);
      return { machineId: 'rnap', machine: rnapMachine, asset: asset || templateAsset, frame: pose };
    } catch { /* fall through */ }
  }

  return {
    machineId: 'rnap',
    machine: rnapMachine,
    asset,
    frame: normalizeFrame(null, IDENTITY_FRAME),
  };
}

function findRiboContext(worldState, assets, rnapCtx = null) {
  const machines = (worldState && Array.isArray(worldState.machines)) ? worldState.machines : [];
  const riboMachine =
    machines.find(m => m && m.visible !== false && (
      m.id === 'ribosome' || m.id === 'small' || m.id === 'large' || m.assetId === 'ribosome-70s'
    )) ||
    machines.find(m => m && (
      m.id === 'ribosome' || m.id === 'small' || m.id === 'large' || m.assetId === 'ribosome-70s'
    )) ||
    null;

  const assetMap = assets || {};
  const asset =
    (riboMachine && riboMachine.assetId && assetMap[riboMachine.assetId]) ||
    assetMap['ribosome-70s'] ||
    null;

  if (riboMachine && riboMachine.transform && isFiniteVec3(riboMachine.transform.o)) {
    return {
      machineId: riboMachine.id || 'ribosome',
      machine: riboMachine,
      asset,
      frame: normalizeFrame(riboMachine.transform, DEFAULT_RIBO_FRAME),
    };
  }

  // In coupled mode or when RNAP has an expressome anchor, use the expressome pose if coupled layout is active.
  const rnap = rnapCtx || findRnapContext(worldState, assets);
  const ecAsset = assetMap['rnap-ec'] || rnap.asset;
  const expAnchor = ecAsset && ecAsset.anchors && ecAsset.anchors.expressome;
  const isCoupled =
    worldState?.rna?.layout === 'coupled' ||
    String(worldState?.shot?.id || '').startsWith('coupled') ||
    String(worldState?.chapter?.id || '').startsWith('couple');

  if (isCoupled && expAnchor && isFiniteVec3(expAnchor.o)) {
    return {
      machineId: 'ribosome',
      machine: riboMachine,
      asset,
      frame: composeFrame(rnap.frame, expAnchor),
    };
  }

  return {
    machineId: 'ribosome',
    machine: riboMachine,
    asset,
    frame: normalizeFrame(null, DEFAULT_RIBO_FRAME),
  };
}

function resolveTunnelMidpoint(riboCtx) {
  const asset = riboCtx && riboCtx.asset;
  const tunnel = asset && asset.paths && asset.paths.tunnel;
  if (tunnel && tunnel.points && tunnel.points.length >= 3) {
    const count = Number.isInteger(tunnel.count) && tunnel.count > 0
      ? tunnel.count
      : Math.floor(tunnel.points.length / 3);
    const midIdx = Math.min(count - 1, Math.max(0, Math.floor(count / 2)));
    const localPt = [
      tunnel.points[midIdx * 3],
      tunnel.points[midIdx * 3 + 1],
      tunnel.points[midIdx * 3 + 2],
    ];
    return applyFramePoint(riboCtx.frame, localPt);
  }
  const ptc = asset && asset.anchors && asset.anchors.ptc && asset.anchors.ptc.o;
  const exit = asset && asset.anchors && asset.anchors.tunnelExit && asset.anchors.tunnelExit.o;
  if (ptc && exit) {
    return applyFramePoint(riboCtx.frame, [
      0.5 * (ptc[0] + exit[0]),
      0.5 * (ptc[1] + exit[1]),
      0.5 * (ptc[2] + exit[2]),
    ]);
  }
  const center = (asset && asset.anchors && asset.anchors.center && asset.anchors.center.o) || [0, 0, 0];
  return applyFramePoint(riboCtx.frame, center);
}

function resolveAnchorWorld(ctx, anchorName) {
  const asset = ctx && ctx.asset;
  const anchor =
    (asset && asset.anchors && anchorName && asset.anchors[anchorName]) ||
    (asset && asset.anchors && asset.anchors.center) ||
    null;
  const localO = (anchor && isFiniteVec3(anchor.o))
    ? anchor.o
    : (asset && asset.bounds && isFiniteVec3(asset.bounds.center) ? asset.bounds.center : [0, 0, 0]);
  return applyFramePoint(ctx ? ctx.frame : IDENTITY_FRAME, localO);
}

function resolveTargetSpec(targetSpec, rnapCtx, riboCtx) {
  if (!targetSpec || typeof targetSpec !== 'object') {
    return { point: [0, 0, 0], frame: IDENTITY_FRAME, frameKind: 'world' };
  }

  if (Array.isArray(targetSpec.midpoint) && targetSpec.midpoint.length >= 2) {
    const a = resolveTargetSpec(targetSpec.midpoint[0], rnapCtx, riboCtx).point;
    const b = resolveTargetSpec(targetSpec.midpoint[1], rnapCtx, riboCtx).point;
    return {
      point: [0.5 * (a[0] + b[0]), 0.5 * (a[1] + b[1]), 0.5 * (a[2] + b[2])],
      frame: IDENTITY_FRAME,
      frameKind: 'world',
    };
  }

  const frameKind = targetSpec.frame || 'world';
  if (frameKind === 'world') {
    const pt = isFiniteVec3(targetSpec.point) ? [targetSpec.point[0], targetSpec.point[1], targetSpec.point[2]] : [0, 0, 0];
    return { point: pt, frame: IDENTITY_FRAME, frameKind: 'world' };
  }

  const ctx = frameKind === 'ribo' ? riboCtx : rnapCtx;
  if (targetSpec.path === 'tunnel') {
    return {
      point: resolveTunnelMidpoint(riboCtx),
      frame: riboCtx.frame,
      frameKind: 'ribo',
    };
  }

  return {
    point: resolveAnchorWorld(ctx, targetSpec.anchor || 'center'),
    frame: ctx.frame,
    frameKind,
  };
}

function computeFitDistance(shot, target, rnapCtx, riboCtx, worldState, assets) {
  const margin = Number.isFinite(shot?.fit?.margin) ? shot.fit.margin : 0.10;
  const spheres = [];
  const addSphere = (center, radius) => {
    if (!isFiniteVec3(center)) return;
    spheres.push({ c: [center[0], center[1], center[2]], r: Math.max(0, Number(radius) || 0) });
  };

  const isCoupledShot = shot.id === 'coupled-wide' || shot.id === 'coupled-follow' || Array.isArray(shot?.target?.midpoint);
  if (isCoupledShot) {
    const rnapCenter = resolveAnchorWorld(rnapCtx, 'center');
    const rnapRadius = rnapCtx.asset?.bounds?.radius ?? 85;
    const riboCenter = resolveAnchorWorld(riboCtx, 'center');
    const riboRadius = riboCtx.asset?.bounds?.radius ?? 140;
    addSphere(rnapCenter, rnapRadius);
    addSphere(riboCenter, riboRadius);
  } else {
    // Wide shot: fit the 248-bp DNA span (±420 Å along world +x) and all visible machines (excluding crowders).
    addSphere([-GENE_HALF_SPAN_X, 0, 0], GENE_DUPLEX_RADIUS);
    addSphere([GENE_HALF_SPAN_X, 0, 0], GENE_DUPLEX_RADIUS);
    addSphere([0, 0, 0], GENE_DUPLEX_RADIUS);

    const machines = (worldState && Array.isArray(worldState.machines)) ? worldState.machines : [];
    const assetMap = assets || {};
    let addedMachine = false;
    for (const m of machines) {
      if (!m || m.visible === false || (m.opacity ?? 1) <= 0.01) continue;
      const a = (m.assetId && assetMap[m.assetId]) || null;
      const tf = normalizeFrame(m.transform, IDENTITY_FRAME);
      const localC = (a && a.anchors && a.anchors.center && a.anchors.center.o)
        || (a && a.bounds && a.bounds.center)
        || [0, 0, 0];
      const worldC = applyFramePoint(tf, localC);
      const rad = a?.bounds?.radius ?? 60;
      addSphere(worldC, rad);
      addedMachine = true;
    }
    if (!addedMachine && rnapCtx.asset) {
      addSphere(resolveAnchorWorld(rnapCtx, 'center'), rnapCtx.asset?.bounds?.radius ?? 85);
    }
  }

  let maxRadius = 80;
  for (const s of spheres) {
    const d = Math.hypot(s.c[0] - target[0], s.c[1] - target[1], s.c[2] - target[2]) + s.r;
    if (d > maxRadius) maxRadius = d;
  }

  const rawDist = (maxRadius * (1 + margin)) / SIN_HALF_FOV;
  return clamp(rawDist, MIN_FIT_DISTANCE, MAX_FIT_DISTANCE);
}

function resolveCutSpec(shot, frameKind, rnapCtx, riboCtx) {
  if (!shot || !shot.cut) return null;
  if (shot.cut === 'tunnel-axis') {
    return {
      kind: 'tunnel-axis',
      anchor: 'ptc',
      machineId: 'ribosome',
      at: resolveTunnelMidpoint(riboCtx),
    };
  }
  const isRibo = frameKind === 'ribo' || shot.cut === 'decoding' || shot.cut === 'ptc';
  const ctx = isRibo ? riboCtx : rnapCtx;
  return {
    kind: 'anchor',
    anchor: String(shot.cut),
    machineId: isRibo ? 'ribosome' : 'rnap',
    at: resolveAnchorWorld(ctx, String(shot.cut)),
  };
}

/**
 * Map a UI camera segmented-control option (`'auto' | 'overview' | 'rnap' | 'ribosome' | 'free'`)
 * to a shot ID (or `null` for `'free'`) per PLAN.md §6.3:
 * - `'overview'` -> `'wide'`
 * - `'rnap'` -> `'rnap-follow'` when transcript exists (`length > 0`), else `'rnap-side'`
 * - `'ribosome'` -> `'ribo-side'`
 * - `'auto'` -> `worldState.shot.id || worldState.chapter.shot || 'wide'`
 * - `'free'` -> `null`
 *
 * @param {string} cameraOption - Selected camera option.
 * @param {object} [worldState] - Current WorldState from `stateAt`.
 * @returns {string | null} Resolved shot id or `null` when in Free mode.
 */
export function resolveCameraShotId(cameraOption, worldState) {
  const opt = String(cameraOption || 'auto').toLowerCase();
  if (opt === 'free') return null;
  if (opt === 'overview') return 'wide';
  if (opt === 'ribosome') return 'ribo-side';
  if (opt === 'rnap') {
    const rnaLen = Number(worldState?.rna?.length ?? worldState?.counters?.mrna ?? 0);
    return rnaLen > 0 ? 'rnap-follow' : 'rnap-side';
  }
  // 'auto' (or direct shot id fallback)
  if (SHOT_IDS.includes(cameraOption)) return cameraOption;
  const shotId = worldState?.shot?.id || worldState?.chapter?.shot || 'wide';
  return SHOT_IDS.includes(shotId) ? shotId : 'wide';
}

/**
 * Resolve a shot specification `{ target, dir, distance, detailRadius, cut, follow }` (or shot id string)
 * into world-space camera position, look-at target, view direction, distance, cutaway plane, and
 * detail-sphere focus for the given `worldState` and decoded `assets`.
 *
 * @param {object | string} shotOrId - Shot specification from `shots.js` or shot id string (PLAN.md §6.3, §6.4).
 * @param {object} [worldState] - Current WorldState from `stateAt`.
 * @param {object} [assets] - Decoded machine asset map keyed by asset id.
 * @returns {{ id: string, pos: number[], target: number[], dir: number[], distance: number, detailRadius: number, cut: object | null, follow: boolean }} Resolved camera pose.
 */
export function resolveShot(shotOrId, worldState = {}, assets = {}) {
  const shot = typeof shotOrId === 'string' ? getShot(shotOrId) : shotOrId;
  if (!shot || typeof shot !== 'object' || !shot.target) {
    throw new Error('resolveShot: expected a valid shot specification or shot id');
  }

  const rnapCtx = findRnapContext(worldState, assets);
  const riboCtx = findRiboContext(worldState, assets, rnapCtx);
  const { point: target, frame, frameKind } = resolveTargetSpec(shot.target, rnapCtx, riboCtx);
  const dir = rotateUnitDir(frame, shot.dir);

  const distance = (typeof shot.distance === 'number' && Number.isFinite(shot.distance) && shot.distance > 0)
    ? shot.distance
    : computeFitDistance(shot, target, rnapCtx, riboCtx, worldState, assets);

  const pos = [
    target[0] + dir[0] * distance,
    target[1] + dir[1] * distance,
    target[2] + dir[2] * distance,
  ];

  const detailRadius = Number.isFinite(shot.detailRadius) && shot.detailRadius > 0 ? shot.detailRadius : 0;
  const cut = resolveCutSpec(shot, frameKind, rnapCtx, riboCtx);

  return {
    id: shot.id || 'wide',
    pos,
    target,
    dir,
    distance,
    detailRadius,
    cut,
    follow: Boolean(shot.follow),
  };
}

/**
 * Compute camera transition duration in seconds between two world positions per PLAN.md §4.7:
 * `clamp(0.8 + travel / 600, 1.2, 3.0)` seconds, where `travel` is Euclidean distance in angstroms.
 *
 * @param {number[]} fromPos - Starting camera position `[x, y, z]` in angstroms.
 * @param {number[]} toPos - Destination camera position `[x, y, z]` in angstroms.
 * @returns {number} Transition duration in seconds.
 */
export function transitionDuration(fromPos, toPos) {
  if (!isFiniteVec3(fromPos) || !isFiniteVec3(toPos)) return 1.2;
  const travel = Math.hypot(
    toPos[0] - fromPos[0],
    toPos[1] - fromPos[1],
    toPos[2] - fromPos[2],
  );
  if (!Number.isFinite(travel)) return 1.2;
  return clamp(0.8 + travel / 600, 1.2, 3.0);
}

function getCameraPos(viewer, fallbackPos) {
  const p = viewer && viewer.camera && viewer.camera.position;
  if (!p) return fallbackPos;
  if (Array.isArray(p) && isFiniteVec3(p)) return [p[0], p[1], p[2]];
  if (Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)) return [p.x, p.y, p.z];
  return fallbackPos;
}

/**
 * Create a camera-rails controller bound to `viewer` that applies shots, drives `follow`
 * smoothing, switches to `'free'` on user orbit/pan/zoom interrupt (`controlstart`), and respects reduced motion.
 *
 * @param {object} viewer - Helix 3D Viewer instance.
 * @param {{ initialOption?: string, onCameraOptionChange?: (opt: string) => void }} [opts] - Controller options.
 * @returns {{
 *   getOption: () => string,
 *   setOption: (opt: string, opts?: { instant?: boolean }) => void,
 *   getActiveShot: () => object | null,
 *   applyWorldState: (worldState: object, assets: object, opts?: { instant?: boolean }) => object | null,
 *   dispose: () => void
 * }} CameraRails controller.
 */
export function createCameraRails(viewer, opts = {}) {
  if (!viewer || typeof viewer !== 'object') {
    throw new Error('createCameraRails: viewer instance is required');
  }

  let option = String(opts.initialOption || 'auto').toLowerCase();
  let activeShotId = null;
  let lastResolved = null;
  let lastWorldState = null;
  let lastAssets = null;
  let disposed = false;

  const onControlStart = () => {
    if (disposed) return;
    if (option !== 'free') {
      option = 'free';
      activeShotId = null;
      viewer.setFollowTarget?.(null);
      opts.onCameraOptionChange?.('free');
    }
  };

  const offControlStart = typeof viewer.on === 'function'
    ? viewer.on('controlstart', onControlStart)
    : null;

  function applyWorldState(worldState, assets, { instant = false, forceTransition = false } = {}) {
    if (disposed) return null;
    lastWorldState = worldState || lastWorldState || {};
    lastAssets = assets || lastAssets || {};

    if (option === 'free') {
      viewer.setFollowTarget?.(null);
      return lastResolved;
    }

    const shotId = resolveCameraShotId(option, lastWorldState);
    if (!shotId) {
      viewer.setFollowTarget?.(null);
      return lastResolved;
    }

    const resolved = resolveShot(shotId, lastWorldState, lastAssets);
    const shotChanged = shotId !== activeShotId;

    if (shotChanged || instant || forceTransition) {
      const curPos = getCameraPos(viewer, lastResolved ? lastResolved.pos : null);
      const reduced = Boolean(viewer.reducedMotion);
      const dur = (instant || reduced || !curPos) ? 0 : transitionDuration(curPos, resolved.pos);
      activeShotId = shotId;
      if (viewer.controls && Number.isFinite(resolved.distance)) {
        if (viewer.controls.maxDistance < resolved.distance * 2) {
          viewer.controls.maxDistance = resolved.distance * 2;
        }
        if (viewer.controls.minDistance > Math.min(6, resolved.distance * 0.25)) {
          viewer.controls.minDistance = Math.min(6, resolved.distance * 0.25);
        }
      }
      viewer.moveCamera?.(resolved.target, resolved.distance, dur, resolved.dir);
    }

    if (resolved.follow) {
      viewer.setFollowTarget?.({
        center: resolved.target,
        dir: resolved.dir,
        distance: resolved.distance,
        radius: Math.max(20, resolved.detailRadius || 30),
      });
    } else {
      viewer.setFollowTarget?.(null);
    }

    viewer.setDetailFocus?.({
      center: resolved.target,
      radius: resolved.detailRadius > 0 ? resolved.detailRadius : 0,
    });

    lastResolved = resolved;
    return resolved;
  }

  function setOption(nextOpt, { instant = false } = {}) {
    if (disposed) return;
    const norm = String(nextOpt || 'auto').toLowerCase();
    const changed = norm !== option;
    option = norm;
    if (option === 'free') {
      activeShotId = null;
      viewer.setFollowTarget?.(null);
      if (changed) opts.onCameraOptionChange?.('free');
      return;
    }
    if (changed) opts.onCameraOptionChange?.(option);
    if (lastWorldState) {
      applyWorldState(lastWorldState, lastAssets, { instant, forceTransition: true });
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (typeof offControlStart === 'function') offControlStart();
    else viewer.off?.('controlstart', onControlStart);
  }

  return {
    getOption: () => option,
    setOption,
    getActiveShot: () => lastResolved,
    applyWorldState,
    dispose,
  };
}
