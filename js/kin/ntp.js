/**
 * @module kin/ntp
 * Round 3 NTP entry and pyrophosphate (PPi) departure kinematics (PLAN.md §4.4, §8.1, task R3-S3, Argon C6).
 * Poses incoming NTP and departing PPi atom groups relative to the RNAP active site using
 * heavy-atom centroid guidance along the secondary channel ray (`maxPen <= 0.41 A`).
 */
import { ntpTemplate, PPI_TEMPLATE } from '../science/index.js';
import { partnerFrame, applyFrame } from '../science/math.js';
import { composeFrame, slerpFrame } from './frames.js';
import { sampleTrack } from './track.js';

const clamp01 = x => (x <= 0 ? 0 : x >= 1 ? 1 : x);

const _ntpCentroids = Object.create(null);
function ntpCentroid(base) {
  let c = _ntpCentroids[base];
  if (c) return c;
  const tmpl = ntpTemplate(base);
  const n = tmpl.names.length;
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < n; i++) {
    cx += tmpl.local[3 * i];
    cy += tmpl.local[3 * i + 1];
    cz += tmpl.local[3 * i + 2];
  }
  c = [cx / n, cy / n, cz / n];
  _ntpCentroids[base] = c;
  return c;
}

const _ppiCentroid = (() => {
  const n = PPI_TEMPLATE.names.length;
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < n; i++) {
    cx += PPI_TEMPLATE.local[3 * i];
    cy += PPI_TEMPLATE.local[3 * i + 1];
    cz += PPI_TEMPLATE.local[3 * i + 2];
  }
  return [cx / n, cy / n, cz / n];
})();

const _ppiBonds = (() => {
  const b = PPI_TEMPLATE.bonds;
  if (b instanceof Uint16Array) return b;
  const flat = new Uint16Array(b.length * 2);
  for (let i = 0; i < b.length; i++) {
    flat[2 * i] = b[i][0];
    flat[2 * i + 1] = b[i][1];
  }
  return flat;
})();

const _ntpBondsCache = Object.create(null);
function ntpBondsFlat(base) {
  let flat = _ntpBondsCache[base];
  if (flat) return flat;
  const b = ntpTemplate(base).bonds;
  flat = new Uint16Array(b.length * 2);
  for (let i = 0; i < b.length; i++) {
    flat[2 * i] = b[i][0];
    flat[2 * i + 1] = b[i][1];
  }
  _ntpBondsCache[base] = flat;
  return flat;
}

const _tmpSampleF = { o: [0, 0, 0], R: [1, 0, 0, 0, 1, 0, 0, 0, 1] };
const _tmpTargetF = { o: [0, 0, 0], R: [1, 0, 0, 0, 1, 0, 0, 0, 1] };
const _tmpLocalF = { o: [0, 0, 0], R: [1, 0, 0, 0, 1, 0, 0, 0, 1] };
const _tmpWorldF = { o: [0, 0, 0], R: [1, 0, 0, 0, 1, 0, 0, 0, 1] };

function partnerInto(src, dst) {
  const R = src.R, P = dst.R;
  P[0] = R[0];  P[3] = R[3];  P[6] = R[6];
  P[1] = -R[1]; P[4] = -R[4]; P[7] = -R[7];
  P[2] = -R[2]; P[5] = -R[5]; P[8] = -R[8];
  dst.o[0] = src.o[0]; dst.o[1] = src.o[1]; dst.o[2] = src.o[2];
  return dst;
}

function resolveActiveSiteTarget(rnapAsset, ecAssetFallback, out) {
  const ecTracks = (rnapAsset && rnapAsset.tracks && rnapAsset.tracks.rna)
    ? rnapAsset.tracks
    : (ecAssetFallback && ecAssetFallback.tracks ? ecAssetFallback.tracks : (rnapAsset && rnapAsset.tracks));
  if (ecTracks && ecTracks.template) {
    sampleTrack(ecTracks.template, 0, _tmpSampleF);
    return partnerInto(_tmpSampleF, out);
  }
  // Fallback canonical rnap-ec register 0 partner frame if tracks are unavailable
  out.o[0] = 2.375; out.o[1] = 0.144; out.o[2] = 2.682;
  out.R[0] = 0.39447;  out.R[1] = 0.473169;  out.R[2] = 0.787721;
  out.R[3] = -0.916802; out.R[4] = 0.260679; out.R[5] = 0.302525;
  out.R[6] = -0.062197; out.R[7] = -0.841521; out.R[8] = 0.536632;
  return out;
}

function resolveNtpEntry(rnapAsset, ecAssetFallback) {
  if (rnapAsset && rnapAsset.anchors && rnapAsset.anchors.ntpEntry) return rnapAsset.anchors.ntpEntry;
  if (ecAssetFallback && ecAssetFallback.anchors && ecAssetFallback.anchors.ntpEntry) return ecAssetFallback.anchors.ntpEntry;
  return {
    o: [24.303, 17.807, 11.986],
    R: [0.75502, 0, -0.655701, -0.383342, -0.811301, -0.441406, -0.531971, 0.584628, -0.612549],
  };
}

/**
 * Pose the incoming nucleoside triphosphate (NTP) along the secondary-channel path from
 * `ntpEntry` to the RNAP active site (`i+1` register), writing atomic coordinates into `targetGroup`.
 *
 * Uses centroid-guided interpolation (Argon C6) so the 11-A triphosphate tail stays centered in
 * the secondary channel with <= 0.41 A L1 penetration across all `path in [0, 1]`.
 *
 * @param {object} ntpState - `WorldState.ntp` slice (`{ base, path, bonded, visible?, phase?, ppi? }`).
 * @param {{ o: number[], R: number[] }} rnapTransform - World-space rigid transform of RNAP.
 * @param {object} rnapAsset - Decoded RNAP asset (`rnap-holo` or `rnap-ec`).
 * @param {object} [targetGroup] - Reusable AtomGroup object to populate in place.
 * @param {object} [ecAssetFallback] - Optional `rnap-ec` asset fallback for `tracks.template`.
 * @returns {object | null} Populated `targetGroup`, or `null` when no free incoming NTP is active.
 */
export function poseNtp(ntpState, rnapTransform, rnapAsset, targetGroup, ecAssetFallback) {
  if (!ntpState || !ntpState.base || !rnapTransform) {
    if (targetGroup) targetGroup.visible = false;
    return null;
  }
  const hasPhase = typeof ntpState.phase === 'string';
  const active = hasPhase
    ? (ntpState.visible !== false && (ntpState.phase === 'entering' || ntpState.phase === 'paired'))
    : (ntpState.visible !== false && !ntpState.bonded);

  if (!active) {
    if (targetGroup) targetGroup.visible = false;
    return null;
  }

  const base = ntpState.base;
  const tmpl = ntpTemplate(base);
  const count = tmpl.names.length;
  const cLocal = ntpCentroid(base);
  const ntpEntry = resolveNtpEntry(rnapAsset, ecAssetFallback);
  const F_target = resolveActiveSiteTarget(rnapAsset, ecAssetFallback, _tmpTargetF);

  const u = clamp01(ntpState.path ?? (ntpState.phase === 'paired' ? 1 : 0));
  const F = slerpFrame(ntpEntry, F_target, u, _tmpLocalF);
  const R = F.R;
  const cRot0 = R[0] * cLocal[0] + R[1] * cLocal[1] + R[2] * cLocal[2];
  const cRot1 = R[3] * cLocal[0] + R[4] * cLocal[1] + R[5] * cLocal[2];
  const cRot2 = R[6] * cLocal[0] + R[7] * cLocal[1] + R[8] * cLocal[2];
  const cEnd = applyFrame(F_target, cLocal);

  F.o[0] = ntpEntry.o[0] * (1 - u) + cEnd[0] * u - cRot0;
  F.o[1] = ntpEntry.o[1] * (1 - u) + cEnd[1] * u - cRot1;
  F.o[2] = ntpEntry.o[2] * (1 - u) + cEnd[2] * u - cRot2;

  const worldFrame = composeFrame(rnapTransform, F, _tmpWorldF);
  const wR = worldFrame.R, wo = worldFrame.o;

  const out = targetGroup || {
    id: 'ntp',
    count,
    pos: new Float32Array(count * 3),
    el: tmpl.el,
    names: tmpl.names,
    bonds: ntpBondsFlat(base),
    opacity: 1,
    visible: true,
    label: `${base}TP`,
    role: 'ntp',
  };
  if (!out.pos || out.pos.length < count * 3) out.pos = new Float32Array(count * 3);

  const pos = out.pos;
  const local = tmpl.local;
  for (let i = 0; i < count; i++) {
    const lx = local[3 * i], ly = local[3 * i + 1], lz = local[3 * i + 2];
    pos[3 * i]     = wR[0] * lx + wR[1] * ly + wR[2] * lz + wo[0];
    pos[3 * i + 1] = wR[3] * lx + wR[4] * ly + wR[5] * lz + wo[1];
    pos[3 * i + 2] = wR[6] * lx + wR[7] * ly + wR[8] * lz + wo[2];
  }

  out.id = 'ntp';
  out.count = count;
  out.el = tmpl.el;
  out.names = tmpl.names;
  out.bonds = ntpBondsFlat(base);
  out.opacity = ntpState.opacity ?? 1;
  out.visible = true;
  out.label = `${base}TP`;
  out.role = 'ntp';
  return out;
}

/**
 * Pose departing pyrophosphate (PPi) travelling outward along the secondary-channel ray
 * from the active site (`u = 0`) to `ntpEntry` (`u = 1`) while fading opacity `1 -> 0` (Argon C6).
 * Accepts either `WorldState.ppi` (`{ path, opacity }`) or `WorldState.ntp` (`{ ppi, phase }`).
 *
 * @param {object} ppiOrNtpState - `WorldState.ppi` or `WorldState.ntp`.
 * @param {{ o: number[], R: number[] }} rnapTransform - World-space rigid transform of RNAP.
 * @param {object} rnapAsset - Decoded RNAP asset (`rnap-holo` or `rnap-ec`).
 * @param {object} [targetGroup] - Reusable AtomGroup object to populate in place.
 * @param {object} [ecAssetFallback] - Optional `rnap-ec` asset fallback.
 * @returns {object | null} Populated `targetGroup`, or `null` when PPi is inactive.
 */
export function posePpi(ppiOrNtpState, rnapTransform, rnapAsset, targetGroup, ecAssetFallback) {
  if (!ppiOrNtpState || !rnapTransform) {
    if (targetGroup) targetGroup.visible = false;
    return null;
  }

  let u = 0;
  let opacity = 0;
  let active = false;

  if (typeof ppiOrNtpState.ppi === 'number' || ppiOrNtpState.phase === 'leaving') {
    u = clamp01(ppiOrNtpState.ppi ?? ppiOrNtpState.path ?? 0);
    active = (ppiOrNtpState.ppi > 0 && ppiOrNtpState.ppi < 1) || ppiOrNtpState.phase === 'leaving';
    opacity = ppiOrNtpState.ppiOpacity !== undefined ? ppiOrNtpState.ppiOpacity : (1 - u);
  } else {
    u = clamp01(ppiOrNtpState.path ?? 0);
    opacity = clamp01(ppiOrNtpState.opacity ?? 0);
    active = opacity > 0.001;
  }

  if (!active || opacity <= 0.001) {
    if (targetGroup) targetGroup.visible = false;
    return null;
  }

  const count = PPI_TEMPLATE.names.length;
  const ntpEntry = resolveNtpEntry(rnapAsset, ecAssetFallback);
  const F_target = resolveActiveSiteTarget(rnapAsset, ecAssetFallback, _tmpTargetF);

  const F = slerpFrame(F_target, ntpEntry, u, _tmpLocalF);
  const R = F.R;
  const cRot0 = R[0] * _ppiCentroid[0] + R[1] * _ppiCentroid[1] + R[2] * _ppiCentroid[2];
  const cRot1 = R[3] * _ppiCentroid[0] + R[4] * _ppiCentroid[1] + R[5] * _ppiCentroid[2];
  const cRot2 = R[6] * _ppiCentroid[0] + R[7] * _ppiCentroid[1] + R[8] * _ppiCentroid[2];
  const cStart = applyFrame(F_target, _ppiCentroid);

  F.o[0] = cStart[0] * (1 - u) + ntpEntry.o[0] * u - cRot0;
  F.o[1] = cStart[1] * (1 - u) + ntpEntry.o[1] * u - cRot1;
  F.o[2] = cStart[2] * (1 - u) + ntpEntry.o[2] * u - cRot2;

  const worldFrame = composeFrame(rnapTransform, F, _tmpWorldF);
  const wR = worldFrame.R, wo = worldFrame.o;

  const out = targetGroup || {
    id: 'ppi',
    count,
    pos: new Float32Array(count * 3),
    el: PPI_TEMPLATE.el,
    names: PPI_TEMPLATE.names,
    bonds: _ppiBonds,
    opacity,
    visible: true,
    label: 'PPi',
    role: 'ppi',
  };
  if (!out.pos || out.pos.length < count * 3) out.pos = new Float32Array(count * 3);

  const pos = out.pos;
  const local = PPI_TEMPLATE.local;
  for (let i = 0; i < count; i++) {
    const lx = local[3 * i], ly = local[3 * i + 1], lz = local[3 * i + 2];
    pos[3 * i]     = wR[0] * lx + wR[1] * ly + wR[2] * lz + wo[0];
    pos[3 * i + 1] = wR[3] * lx + wR[4] * ly + wR[5] * lz + wo[1];
    pos[3 * i + 2] = wR[6] * lx + wR[7] * ly + wR[8] * lz + wo[2];
  }

  out.id = 'ppi';
  out.count = count;
  out.el = PPI_TEMPLATE.el;
  out.names = PPI_TEMPLATE.names;
  out.bonds = _ppiBonds;
  out.opacity = opacity;
  out.visible = true;
  out.label = 'PPi';
  out.role = 'ppi';
  return out;
}
