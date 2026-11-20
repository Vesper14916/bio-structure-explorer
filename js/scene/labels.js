/**
 * @module scene/labels
 * Round 3 3D label priority selection (PLAN.md §4.6, §4.3, §8.1, §8.4, task R3-R3).
 * Selects up to 6 scene overlay tags in strict priority order 1 -> 9 with world-space positions.
 * Pure function with zero Three.js or DOM imports so it runs in Node and in the browser.
 */
import { TRUE_SCALE_GENE_CONSTRUCT } from '../science/scenario.js';
import { HELIX_B } from '../science/templates.js';
import { composeFrame, slerpFrame } from '../kin/frames.js';
import { machinePoseForRegister } from '../kin/duplex.js';

/** Hard cap of visible scene labels at any time (PLAN.md §4.6). */
export const MAX_VISIBLE_LABELS = 6;

const RISE_B = HELIX_B.rise; // 3.38 A per base pair
const MID_BP = 124;          // gene index at the world origin (bp 124 -> x = 0)

/** Locked sRGB hex colours from PLAN.md §4.3 / CONTRACTS.md §6.4. */
export const LABEL_COLORS = Object.freeze({
  rnap: 0x4fb6ff,
  sigma: 0xb58cff,
  small: 0xe4dcc4,
  large: 0xd2b183,
  trnaInit: 0xffd43b,
  trnaAa: 0xff922b,
  'ef-tu': 0xf783ac,
  'ef-g': 0xa9e34b,
  rf1: 0xff6b6b,
  if1: 0xd0bfff,
  if2: 0xb197fc,
  if3: 0x9775fa,
  nusg: 0x15aabf,
  mrna: 0x2fd9b9,
  peptide: 0xff7a45,
  codingDna: 0x7c93c3,
  region: 0x9fb2dc,
});

const FACTOR_LABELS = Object.freeze([
  ['ef-tu', 'EF-Tu'],
  ['ef-g', 'EF-G'],
  ['rf1', 'RF1'],
  ['if1', 'IF1'],
  ['if2', 'IF2'],
  ['if3', 'IF3'],
  ['nusg', 'NusG'],
]);

const SITE_ANCHOR = Object.freeze({
  AT: 'siteAT',
  A: 'siteA',
  AP: 'siteAP',
  P: 'siteP',
  PE: 'sitePE',
  E: 'siteE',
});

const IDENTITY_FRAME = Object.freeze({
  o: Object.freeze([0, 0, 0]),
  R: Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]),
});

const DEFAULT_RIBO_FRAME = Object.freeze({
  o: Object.freeze([0, 0, -250]),
  R: Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]),
});

function hexBorder(hexInt) {
  return '#' + (hexInt >>> 0).toString(16).padStart(6, '0') + 'aa';
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

function normalizeFrame(tf, fallback = IDENTITY_FRAME) {
  if (!tf || !isFiniteVec3(tf.o) || !(Array.isArray(tf.R) || ArrayBuffer.isView(tf.R)) || tf.R.length < 9) {
    return { o: fallback.o.slice(), R: fallback.R.slice() };
  }
  return {
    o: [tf.o[0], tf.o[1], tf.o[2]],
    R: [tf.R[0], tf.R[1], tf.R[2], tf.R[3], tf.R[4], tf.R[5], tf.R[6], tf.R[7], tf.R[8]],
  };
}

function isMachineVisible(m) {
  return Boolean(m && m.visible !== false && (m.opacity ?? 1) > 0.05);
}

function isPartVisible(m, partId, minOpacity = 0.05) {
  if (!isMachineVisible(m)) return false;
  const p = m.parts && m.parts[partId];
  if (!p) return true;
  return p.visible !== false && (p.opacity ?? 1) * (m.opacity ?? 1) > minOpacity;
}

function isOverviewShot(shotId, cameraOption) {
  if (String(cameraOption || '').toLowerCase() === 'overview') return true;
  return shotId === 'wide' || shotId === 'coupled-wide';
}

function anchorWorld(frame, asset, anchorName, offsetWorld = [0, 0, 0]) {
  const anchor =
    (asset && asset.anchors && anchorName && asset.anchors[anchorName]) ||
    (asset && asset.anchors && asset.anchors.center) ||
    null;
  const localO = (anchor && isFiniteVec3(anchor.o))
    ? anchor.o
    : (asset && asset.bounds && isFiniteVec3(asset.bounds.center) ? asset.bounds.center : [0, 0, 0]);
  const pt = applyFramePoint(frame, localO);
  return [
    pt[0] + (offsetWorld[0] || 0),
    pt[1] + (offsetWorld[1] || 0),
    pt[2] + (offsetWorld[2] || 0),
  ];
}

function computePartCentroidLocal(asset, partId) {
  if (!asset) return null;
  if (asset.lod1 && asset.lod1.count > 0 && Array.isArray(asset.chains)) {
    const chainIsPart = asset.chains.map(c => c && c.part === partId);
    if (chainIsPart.some(Boolean)) {
      let sx = 0, sy = 0, sz = 0, n = 0;
      const pos = asset.lod1.positions;
      const ch = asset.lod1.chain;
      for (let i = 0; i < asset.lod1.count; i++) {
        if (chainIsPart[ch[i]]) {
          sx += pos[i * 3];
          sy += pos[i * 3 + 1];
          sz += pos[i * 3 + 2];
          n++;
        }
      }
      if (n > 0) return [sx / n, sy / n, sz / n];
    }
  }
  if (Array.isArray(asset.lod0)) {
    const mesh = asset.lod0.find(m => m && m.part === partId);
    if (mesh && mesh.positions && mesh.positions.length >= 3) {
      let sx = 0, sy = 0, sz = 0;
      const count = Math.floor(mesh.positions.length / 3);
      for (let i = 0; i < count; i++) {
        sx += mesh.positions[i * 3];
        sy += mesh.positions[i * 3 + 1];
        sz += mesh.positions[i * 3 + 2];
      }
      if (count > 0) return [sx / count, sy / count, sz / count];
    }
  }
  return null;
}

const partCentroidCache = new WeakMap();

function getPartCentroidLocal(asset, partId) {
  if (!asset) return [0, 35, 0];
  let map = partCentroidCache.get(asset);
  if (!map) {
    map = new Map();
    partCentroidCache.set(asset, map);
  }
  if (!map.has(partId)) {
    map.set(partId, computePartCentroidLocal(asset, partId) || [0, 35, 0]);
  }
  return map.get(partId);
}

function findRnapState(worldState, assets) {
  const machines = (worldState && Array.isArray(worldState.machines)) ? worldState.machines : [];
  const m = machines.find(x => isMachineVisible(x) && (x.id === 'rnap' || String(x.assetId || '').startsWith('rnap'))) || null;
  const assetMap = assets || {};
  const asset = (m && m.assetId && assetMap[m.assetId]) || assetMap['rnap-ec'] || assetMap['rnap-holo'] || null;
  let frame = m && m.transform ? normalizeFrame(m.transform) : null;
  if (!frame) {
    const reg = Number.isFinite(worldState?.dna?.register) ? worldState.dna.register : 45;
    const tplAsset = (asset && asset.tracks && asset.tracks.template) ? asset : assetMap['rnap-ec'];
    if (tplAsset && tplAsset.tracks && tplAsset.tracks.template) {
      try { frame = machinePoseForRegister(tplAsset, reg); } catch { /* ignore */ }
    }
  }
  return {
    visible: Boolean(m),
    machine: m,
    asset,
    frame: frame || normalizeFrame(null, IDENTITY_FRAME),
  };
}

function findRibosomeState(worldState, assets, rnapState) {
  const machines = (worldState && Array.isArray(worldState.machines)) ? worldState.machines : [];
  const riboM = machines.find(x => isMachineVisible(x) && (x.id === 'ribosome' || x.assetId === 'ribosome-70s')) || null;
  const smallM = machines.find(x => isMachineVisible(x) && x.id === 'small') || null;
  const largeM = machines.find(x => isMachineVisible(x) && x.id === 'large') || null;
  const primary = riboM || smallM || largeM || null;

  const assetMap = assets || {};
  const asset = (primary && primary.assetId && assetMap[primary.assetId]) || assetMap['ribosome-70s'] || null;

  let frame = (primary && primary.transform) ? normalizeFrame(primary.transform, DEFAULT_RIBO_FRAME) : null;
  if (!frame) {
    const ecAsset = assetMap['rnap-ec'] || rnapState.asset;
    const expAnchor = ecAsset && ecAsset.anchors && ecAsset.anchors.expressome;
    const isCoupled =
      worldState?.rna?.layout === 'coupled' ||
      String(worldState?.shot?.id || '').startsWith('coupled') ||
      String(worldState?.chapter?.id || '').startsWith('couple');
    if (isCoupled && expAnchor && isFiniteVec3(expAnchor.o)) {
      frame = composeFrame(rnapState.frame, expAnchor);
    }
  }
  frame = frame || normalizeFrame(null, DEFAULT_RIBO_FRAME);

  const bound = Boolean(worldState?.ribosome?.bound);
  const visible = Boolean(primary) || bound;
  const smallVisible = riboM
    ? isPartVisible(riboM, 'small')
    : (smallM ? true : (!largeM && bound));
  const largeVisible = riboM
    ? isPartVisible(riboM, 'large')
    : (largeM ? true : (!smallM && bound));

  return {
    visible,
    smallVisible,
    largeVisible,
    machine: primary,
    smallMachine: smallM,
    largeMachine: largeM,
    asset,
    frame,
  };
}

function resolveTrnaLabelText(trna) {
  if (!trna) return 'tRNA';
  if (trna.aa === 'fMet' || (trna.kind === 'init' && trna.aa !== null)) return 'fMet-tRNA';
  if (typeof trna.aa === 'string' && trna.aa.length > 0 && trna.aa !== 'Stop') return `${trna.aa}-tRNA`;
  return 'tRNA';
}

function resolveTrnaSiteFrame(riboAsset, siteName) {
  if (!riboAsset || !riboAsset.anchors) return IDENTITY_FRAME;
  const anchorKey = SITE_ANCHOR[siteName] || 'siteP';
  const anc = riboAsset.anchors[anchorKey]
    || (siteName === 'AP' ? riboAsset.anchors.siteA : null)
    || (siteName === 'PE' ? riboAsset.anchors.siteP : null)
    || riboAsset.anchors.siteP
    || riboAsset.anchors.center;
  return anc ? normalizeFrame(anc) : IDENTITY_FRAME;
}

function resolveTrnaWorldPos(trna, riboState, assets) {
  const riboAsset = riboState.asset;
  const toSite = trna.site && trna.site !== 'out' ? trna.site : (trna.from || 'P');
  const fromSite = trna.from && trna.from !== 'out' ? trna.from : toSite;
  const fFrom = resolveTrnaSiteFrame(riboAsset, fromSite);
  const fTo = resolveTrnaSiteFrame(riboAsset, toSite);
  const blend = Number.isFinite(trna.blend) ? Math.max(0, Math.min(1, trna.blend)) : 1;
  const localSiteFrame = slerpFrame(fFrom, fTo, blend);
  const worldTrnaFrame = composeFrame(riboState.frame, localSiteFrame);

  const trnaAssetId = trna.kind === 'init' ? 'trna-init' : 'trna-aa';
  const trnaAsset = (assets && assets[trnaAssetId]) || null;
  const elbow = (trnaAsset && trnaAsset.anchors && trnaAsset.anchors.elbow && trnaAsset.anchors.elbow.o)
    || (trnaAsset && trnaAsset.anchors && trnaAsset.anchors.center && trnaAsset.anchors.center.o)
    || [0, 0, 28];
  return applyFramePoint(worldTrnaFrame, elbow);
}

function dnaBpWorldPos(bpIndex, yOffset = 14, zOffset = 0) {
  return [(bpIndex - MID_BP) * RISE_B, yOffset, zOffset];
}

function regionMidpointWorld(construct, regionId, yOffset = 14) {
  const r = construct && typeof construct.region === 'function' ? construct.region(regionId) : null;
  if (!r) return [0, yOffset, 0];
  const midBp = 0.5 * (r.start + r.end - 1);
  return dnaBpWorldPos(midBp, yOffset, 0);
}

function resolveRegionTagsForChapter(chapter, mode, construct, riboState) {
  const chId = chapter && chapter.id;
  const chNum = chapter && Number.isInteger(chapter.index) ? chapter.index + 1 : 0;
  const tags = [];

  // Chapters 1–3 (`establish`, `search`, `open`): promoter tags −35, −10, +1
  if (chId === 'establish' || chId === 'search' || chId === 'open' || (chNum >= 1 && chNum <= 3)) {
    tags.push(
      { id: 'region:minus35', text: '−35', at: regionMidpointWorld(construct, 'minus35', 15) },
      { id: 'region:minus10', text: '−10', at: regionMidpointWorld(construct, 'minus10', 15) },
      { id: 'region:tss', text: '+1', at: dnaBpWorldPos(construct.tss ?? 45, 15, 0) },
    );
  }

  // Chapters 8–9 (`scan`, `start`, or coupled `couple-scan`): SD and AUG tags
  if (chId === 'scan' || chId === 'start' || chId === 'couple-scan' || (mode !== 'coupled' && (chNum === 8 || chNum === 9))) {
    const sdAt = riboState.visible && riboState.asset
      ? anchorWorld(riboState.frame, riboState.asset, 'antiSD', [0, 12, 0])
      : regionMidpointWorld(construct, 'sd', 15);
    const augAt = riboState.visible && riboState.asset
      ? anchorWorld(riboState.frame, riboState.asset, 'siteP', [0, 10, 0])
      : dnaBpWorldPos(construct.orf?.start ?? 69, 15, 0);
    tags.push(
      { id: 'region:sd', text: 'SD', at: sdAt },
      { id: 'region:aug', text: 'AUG', at: augAt },
    );
  }

  // Chapter 7 (`terminate-tx`, or coupled chapter 10 `couple-terminate`): Terminator
  if (chId === 'terminate-tx' || chId === 'couple-terminate' || (mode !== 'coupled' && chNum === 7)) {
    tags.push({
      id: 'region:terminator',
      text: 'Terminator',
      at: regionMidpointWorld(construct, 'termLoop', 18),
    });
  }

  // Chapter 15 (`release`, sequential chapter 15 or coupled chapter 11): UAA
  if (chId === 'release' || (mode !== 'coupled' && chNum === 15)) {
    const uaaAt = riboState.visible && riboState.asset
      ? anchorWorld(riboState.frame, riboState.asset, 'siteA', [0, 10, 0])
      : regionMidpointWorld(construct, 'stop', 15);
    tags.push({
      id: 'region:uaa',
      text: 'UAA',
      at: uaaAt,
    });
  }

  return tags;
}

/**
 * Select and position the active 3D scene labels from `worldState` and `assets`
 * according to the exact text strings and priority table in PLAN.md §4.6.
 *
 * Contract (PLAN.md §4.6, §8.4, §10 R3-R3):
 * - Enforces a hard cap of at most 6 visible tags at any time.
 * - Uses existing `hx-tag` (`hx-blob` / `hx-label` / `hx-sm`) overlay styles.
 *
 * @param {object} worldState - Current WorldState from `stateAt`.
 * @param {object} [assets] - Decoded machine asset map for anchor positions.
 * @param {{ enabled?: boolean, shotId?: string, cameraOption?: string, mode?: string, construct?: object, positions?: object }} [opts] - Label selection options.
 * @returns {Array<{ id: string, text: string, label: string, priority: number, variant: 'blob' | 'label' | 'sm', kind: string, size?: string, color: number, borderColor: string, at: number[] }>} Ordered list of at most 6 label descriptors for `viewer.setLabels`.
 */
export function selectLabels(worldState, assets = {}, opts = {}) {
  if (opts && opts.enabled === false) return [];
  if (!worldState || typeof worldState !== 'object') return [];

  const construct = opts.construct || TRUE_SCALE_GENE_CONSTRUCT;
  const shotId = opts.shotId || worldState?.shot?.id || worldState?.chapter?.shot || 'wide';
  const overview = isOverviewShot(shotId, opts.cameraOption);
  const posOverrides = (opts && opts.positions) || {};
  const candidates = [];

  const pushLabel = ({ id, text, priority, variant, color, at, radius = 0 }) => {
    if (candidates.length >= MAX_VISIBLE_LABELS) return;
    const finalAt = isFiniteVec3(posOverrides[id])
      ? [posOverrides[id][0], posOverrides[id][1], posOverrides[id][2]]
      : (isFiniteVec3(posOverrides[text])
        ? [posOverrides[text][0], posOverrides[text][1], posOverrides[text][2]]
        : (isFiniteVec3(at) ? [at[0], at[1], at[2]] : [0, 0, 0]));
    candidates.push({
      id,
      text,
      label: text,
      priority,
      variant,
      kind: variant === 'blob' ? 'blob' : 'label',
      ...(variant === 'sm' ? { size: 'sm' } : {}),
      color,
      borderColor: hexBorder(color),
      at: finalAt,
      radius,
    });
  };

  const rnapState = findRnapState(worldState, assets);
  const riboState = findRibosomeState(worldState, assets, rnapState);

  // Priority 1: `RNA polymerase` — when RNAP visible
  if (rnapState.visible) {
    const rnapAt = anchorWorld(rnapState.frame, rnapState.asset, 'center', [0, 58, 0]);
    pushLabel({
      id: 'machine:rnap',
      text: 'RNA polymerase',
      priority: 1,
      variant: 'blob',
      color: LABEL_COLORS.rnap,
      at: rnapAt,
    });
  }

  // Priority 2: `σ⁷⁰` — when σ part visible and opacity > 0.5. Not in chapter 1 (`establish`): the six-tag cap
  // there goes to `RNA polymerase`, the DNA ends and the promoter tags (ST8 DEC-030).
  const establishing = Boolean(worldState.chapter && worldState.chapter.id === 'establish')
    && !((worldState.rna && worldState.rna.length > 0) || (worldState.machines || []).some(m => m && m.id === 'ribosome'));
  if (rnapState.visible && rnapState.machine && !establishing) {
    const m = rnapState.machine;
    const sigmaPart = m.parts && m.parts.sigma;
    const hasSigmaInAsset = rnapState.asset && Array.isArray(rnapState.asset.parts)
      ? rnapState.asset.parts.some(p => p.id === 'sigma')
      : m.assetId === 'rnap-holo';
    const sigmaVisible = sigmaPart
      ? (sigmaPart.visible !== false && (sigmaPart.opacity ?? 1) * (m.opacity ?? 1) > 0.5)
      : (hasSigmaInAsset && (m.opacity ?? 1) > 0.5);

    if (sigmaVisible) {
      let localPt = getPartCentroidLocal(rnapState.asset, 'sigma');
      if (sigmaPart && sigmaPart.transform && isFiniteVec3(sigmaPart.transform.o)) {
        localPt = applyFramePoint(normalizeFrame(sigmaPart.transform), localPt);
      }
      const worldPt = applyFramePoint(rnapState.frame, localPt);
      pushLabel({
        id: 'part:sigma',
        text: 'σ⁷⁰',
        priority: 2,
        variant: 'blob',
        color: LABEL_COLORS.sigma,
        at: [worldPt[0], worldPt[1] + 24, worldPt[2]],
      });
    }
  }

  // Priority 3: `Ribosome` (overview shots) or `30S subunit` and `50S subunit` (all other shots) — when ribosome visible
  if (riboState.visible) {
    if (overview) {
      const riboAt = anchorWorld(riboState.frame, riboState.asset, 'center', [0, 110, 0]);
      pushLabel({
        id: 'machine:ribosome',
        text: 'Ribosome',
        priority: 3,
        variant: 'blob',
        color: LABEL_COLORS.small,
        at: riboAt,
      });
    } else {
      if (riboState.smallVisible) {
        const smallFrame = riboState.smallMachine && riboState.smallMachine.transform
          ? normalizeFrame(riboState.smallMachine.transform, riboState.frame)
          : riboState.frame;
        const smallAt = anchorWorld(smallFrame, riboState.asset, 'smallCenter', [0, 62, 0]);
        pushLabel({
          id: 'part:30s',
          text: '30S subunit',
          priority: 3,
          variant: 'blob',
          color: LABEL_COLORS.small,
          at: smallAt,
        });
      }
      if (riboState.largeVisible) {
        const largeFrame = riboState.largeMachine && riboState.largeMachine.transform
          ? normalizeFrame(riboState.largeMachine.transform, riboState.frame)
          : riboState.frame;
        const largeAt = anchorWorld(largeFrame, riboState.asset, 'largeCenter', [0, 74, 0]);
        pushLabel({
          id: 'part:50s',
          text: '50S subunit',
          priority: 3,
          variant: 'blob',
          color: LABEL_COLORS.large,
          at: largeAt,
        });
      }
    }
  }

  // Priority 4: `mRNA 5′` and `mRNA 3′` (ends of the transcript) — when mRNA length >= 12
  // ST8 DEC-030: while the ribosome decodes (chapters 11-15, `decode` to `release`) the two mRNA-end tags are
  // dropped so that the six-tag cap reaches the factor, region (UAA) and peptide tags of those chapters.
  const chIdx = Number(worldState?.chapter?.index);
  const decodingChapters = riboState.visible && worldState?.chapter?.group === 'E' && chIdx >= 10 && chIdx <= 14
    && worldState?.chapter?.id !== undefined && (worldState.rna?.layout === 'ribosome');
  const mrnaLen = Number(worldState?.rna?.length ?? worldState?.counters?.mrna ?? 0);
  if (mrnaLen >= 12 && !decodingChapters) {
    let mrna5At;
    let mrna3At;
    const layout = worldState?.rna?.layout || 'rnap';
    if ((layout === 'ribosome' || riboState.visible) && worldState?.rna?.released) {
      mrna5At = anchorWorld(riboState.frame, riboState.asset, 'mrnaExit', [-28, -14, -20]);
      mrna3At = anchorWorld(riboState.frame, riboState.asset, 'mrnaEntry', [28, 14, 24]);
    } else if (layout === 'coupled' && riboState.visible) {
      mrna5At = anchorWorld(riboState.frame, riboState.asset, 'mrnaExit', [-24, -12, -18]);
      mrna3At = anchorWorld(rnapState.frame, rnapState.asset, 'activeSite', [0, -10, 0]);
    } else {
      const exitAt = anchorWorld(rnapState.frame, rnapState.asset, 'rnaExit', [0, 0, 0]);
      const tailSpan = Math.min(180, Math.max(24, (mrnaLen - 9) * 2.2));
      mrna5At = [exitAt[0] - tailSpan * 0.45, exitAt[1] + tailSpan * 0.65, exitAt[2] + 18];
      mrna3At = anchorWorld(rnapState.frame, rnapState.asset, 'activeSite', [0, -8, 0]);
    }
    pushLabel({
      id: 'mrna:5',
      text: 'mRNA 5′',
      priority: 4,
      variant: 'label',
      color: LABEL_COLORS.mrna,
      at: mrna5At,
    });
    pushLabel({
      id: 'mrna:3',
      text: 'mRNA 3′',
      priority: 4,
      variant: 'label',
      color: LABEL_COLORS.mrna,
      at: mrna3At,
    });
  }

  // Priority 5: `fMet-tRNA` / `<Aa>-tRNA` / `tRNA` (deacylated) — when tRNA visible
  const trnas = Array.isArray(worldState.trnas) ? worldState.trnas : [];
  for (const trna of trnas) {
    if (!trna || (trna.opacity ?? 1) <= 0.05 || (trna.site === 'out' && (trna.blend ?? 1) >= 0.99)) continue;
    const text = resolveTrnaLabelText(trna);
    const isInit = trna.kind === 'init' || trna.aa === 'fMet';
    const color = isInit ? LABEL_COLORS.trnaInit : LABEL_COLORS.trnaAa;
    const at = resolveTrnaWorldPos(trna, riboState, assets);
    pushLabel({
      id: `trna:${trna.slot ?? text}`,
      text,
      priority: 5,
      variant: 'blob',
      color,
      at,
    });
  }

  // Priority 6: `EF-Tu`, `EF-G`, `RF1`, `IF1`, `IF2`, `IF3`, `NusG` — when factor visible
  const machines = Array.isArray(worldState.machines) ? worldState.machines : [];
  for (const [factorId, factorLabel] of FACTOR_LABELS) {
    const fm = machines.find(m => isMachineVisible(m) && (m.id === factorId || m.assetId === factorId));
    if (!fm) continue;
    const factorAsset = (assets && assets[fm.assetId || factorId]) || null;
    const hostFrame = factorId === 'nusg' ? rnapState.frame : riboState.frame;
    const factorFrame = fm.transform && isFiniteVec3(fm.transform.o)
      ? normalizeFrame(fm.transform, hostFrame)
      : hostFrame;
    const at = anchorWorld(factorFrame, factorAsset, 'center', [0, 26, 0]);
    pushLabel({
      id: `factor:${factorId}`,
      text: factorLabel,
      priority: 6,
      variant: 'blob',
      color: LABEL_COLORS[factorId] || LABEL_COLORS.if2,
      at,
    });
  }

  // Priority 7: `Peptide N-terminus` — when peptide length >= 1
  const pepLen = Number(worldState?.peptide?.length ?? worldState?.counters?.peptide ?? 0);
  if (pepLen >= 1) {
    const tunnel = riboState.asset && riboState.asset.paths && riboState.asset.paths.tunnel;
    let pepAt;
    if (tunnel && tunnel.points && tunnel.points.length >= 3) {
      const count = Number.isInteger(tunnel.count) && tunnel.count > 0
        ? tunnel.count
        : Math.floor(tunnel.points.length / 3);
      // C-terminus is at index 0 (PTC); N-terminus advances ~3.4 A per residue along tunnel (~1 A per point)
      const ptIdx = Math.min(count - 1, Math.max(0, Math.round((pepLen - 1) * 3.4)));
      const localPt = [
        tunnel.points[ptIdx * 3],
        tunnel.points[ptIdx * 3 + 1],
        tunnel.points[ptIdx * 3 + 2],
      ];
      pepAt = applyFramePoint(riboState.frame, localPt);
      if ((pepLen - 1) * 3.4 > count - 1) {
        const extra = (pepLen - 1) * 3.4 - (count - 1);
        pepAt = [pepAt[0] + extra * 0.4, pepAt[1] + extra * 0.65, pepAt[2] + extra * 0.3];
      }
    } else {
      pepAt = anchorWorld(riboState.frame, riboState.asset, pepLen >= 25 ? 'tunnelExit' : 'ptc', [0, 14, 0]);
    }
    pushLabel({
      id: 'peptide:nterm',
      text: 'Peptide N-terminus',
      priority: 7,
      variant: 'label',
      color: LABEL_COLORS.peptide,
      at: pepAt,
    });
  }

  // Priority 8: `DNA 5′`, `DNA 3′` (coding strand ends) — overview shots only
  if (overview) {
    const nBp = construct?.length || 248;
    pushLabel({
      id: 'dna:5',
      text: 'DNA 5′',
      priority: 8,
      variant: 'label',
      color: LABEL_COLORS.codingDna,
      at: dnaBpWorldPos(0, 16, 0),
    });
    pushLabel({
      id: 'dna:3',
      text: 'DNA 3′',
      priority: 8,
      variant: 'label',
      color: LABEL_COLORS.codingDna,
      at: dnaBpWorldPos(nBp - 1, 16, 0),
    });
  }

  // Priority 9: `−35`, `−10`, `+1`, `SD`, `AUG`, `UAA`, `Terminator` (region tags, `hx-sm`)
  if (candidates.length < MAX_VISIBLE_LABELS) {
    const mode = opts.mode || (worldState?.rna?.layout === 'coupled' ? 'coupled' : 'sequential');
    const regTags = resolveRegionTagsForChapter(worldState.chapter, mode, construct, riboState);
    for (const rt of regTags) {
      pushLabel({
        id: rt.id,
        text: rt.text,
        priority: 9,
        variant: 'sm',
        color: LABEL_COLORS.region,
        at: rt.at,
      });
    }
  }

  return candidates.slice(0, MAX_VISIBLE_LABELS);
}
