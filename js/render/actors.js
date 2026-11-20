// Machine actors: rigid macromolecular machines loaded from helix-asset v1/v2 files (docs/CONTRACTS.md 6.2 & 7.1),
// drawn at three levels of detail in the visual style of 6.4.
//   L0  translucent envelope mesh per part
//   L1  one instanced bead per residue (Calpha / P), chain tints
//   L2  instanced heavy atoms and bond cylinders around the active site
// An actor is one rigid transform { o, R } (science space, angstroms) applied to the asset frame.
// Level selection follows ratio = cameraDistance / bounds.radius with a 250 ms cross-fade.
import * as THREE from 'three';
import { ELEMENT_INFO } from '../science/index.js';
import { BALL_SCALE, BOND_RADIUS } from './molecule.js';
import { FOG_COLOR } from './stage.js';
import { writeSphere, writeCylinder, writeHidden, clamp, sphereGeometry, cylinderGeometry } from './util.js';

// ---- visual tokens (docs/CONTRACTS.md 6.4 and PLAN.md 4.3) ---------------------------------------
export const ACTOR_TOKENS = {
  partColor: {
    core: 0x4fb6ff,
    sigma: 0xb58cff,
    accessory: 0xb58cff,
    small: 0xe4dcc4,
    large: 0xd2b183,
    unknown: 0x9fb2dc,
  },
  actorColor: {
    'rnap-ec': 0x4fb6ff,
    'rnap-holo': 0x4fb6ff,
    'ribosome-70s': 0xe4dcc4,
    'trna-init': 0xffd43b,
    'trna-aa': 0xff922b,
    rf1: 0xff6b6b,
    'ef-tu': 0xf783ac,
    'ef-g': 0xa9e34b,
    if1: 0xd0bfff,
    if2: 0xb197fc,
    if3: 0x9775fa,
    nusg: 0x15aabf,
  },
  chainTint: {
    alpha: 0x8fd0ff,
    beta: 0x4fb6ff,
    betaPrime: 0x2f8fe0,
    omega: 0xb9e2ff,
    rRNA16S: 0xf0eadb,
    rprotein30S: 0xc9bd9c,
    rRNA23S: 0xe0c59f,
    rRNA5S: 0xe0c59f,
    rprotein50S: 0xb38f5e,
  },
  l0: { roughness: 0.55, metalness: 0, opacityOnly: 0.30, opacityWithL1: 0.10 },
  crowd: { mixTowardFog: 0.65, opacity: 0.22, depthWrite: false },
  beadRadius: { ca: 1.9, p: 2.4 },
  ratio: { l0Only: 6, l2: 2.5 },
  fadeSeconds: 0.25,
};
const L1_MAT = { roughness: 0.24, metalness: 0.12, envMapIntensity: 1.15 };      // = MoleculeLayer.residueMat
const ATOM_MAT = { roughness: 0.32, metalness: 0.06, envMapIntensity: 1.0 };      // = MoleculeLayer.atomMat
const BOND_MAT = { roughness: 0.42, metalness: 0.05, envMapIntensity: 0.9 };      // = MoleculeLayer.bondMat

// L2 element radii (angstroms) by atomic number; colours from ELEMENT_INFO where it defines the element.
const ELEMENT_RADIUS = { 6: 1.70, 7: 1.55, 8: 1.52, 15: 1.80, 16: 1.80, 12: 1.73, 30: 1.39 };
const OTHER_RADIUS = 1.60;
const ELEMENT_COLOR = {
  6: ELEMENT_INFO.C.color, 7: ELEMENT_INFO.N.color, 8: ELEMENT_INFO.O.color, 15: ELEMENT_INFO.P.color,
  16: 0xe6c84a, 12: 0x7dff7a, 30: 0x8f9cc9,
};
const OTHER_COLOR = 0xb0b8c8;

const fogLinear = new THREE.Color(FOG_COLOR);
const tmpCrowd = new THREE.Color();

/** Resolve L0 part colour from part id, falling back to actor id for single-body assets. */
export function partColor(partId, assetId) {
  const P = ACTOR_TOKENS.partColor, A = ACTOR_TOKENS.actorColor;
  if (partId && P[partId] !== undefined) return P[partId];
  if (assetId && A[assetId] !== undefined) return A[assetId];
  return P.unknown;
}

/** Crowder colour: machine L0 part colour mixed 65 % toward FOG_COLOR (0x0a1628) in linear space (PLAN.md §4.3). */
export function crowdColor(hex) {
  tmpCrowd.setHex(hex);
  tmpCrowd.lerp(fogLinear, ACTOR_TOKENS.crowd.mixTowardFog);
  return tmpCrowd.getHex();
}

/** Chain colour for L1 beads: an explicit subunit tint when matched, otherwise part/actor colour. */
export function chainColor(chain, partId, assetId) {
  const n = String(chain && chain.name || '').toLowerCase();
  const T = ACTOR_TOKENS.chainTint, P = ACTOR_TOKENS.partColor;
  const sub = chain && chain.subunit;
  if (sub && T[sub] !== undefined) return T[sub];               // explicit subunit tag from the asset pipeline
  if (sub === 'sigma70' || sub === 'sigma') return P.sigma;
  if (partId === 'small') return chain && chain.class === 'rna' ? T.rRNA16S : T.rprotein30S;
  if (partId === 'large') return chain && chain.class === 'rna' ? T.rRNA23S : T.rprotein50S;
  // DEC-019 L3: guard RNAP subunit substring fallbacks so factor descriptions containing "alpha"/"beta" are not mis-tinted.
  if (!assetId || assetId.startsWith('rnap')) {
    if (/beta[\s_-]*(prime|'|′)|β\s*['′]/.test(n)) return T.betaPrime; // test beta' before beta
    if (n.includes('beta') || n.includes('β')) return T.beta;
    if (n.includes('alpha') || n.includes('α')) return T.alpha;
    if (n.includes('omega') || n.includes('ω')) return T.omega;
    if (n.includes('sigma') || n.includes('σ')) return P.sigma;
  }
  return partColor(partId, assetId);
}

/** Level the ratio rule asks for: 'l0' | 'l1' | 'l2'. */
export function levelForRatio(ratio) {
  return ratio > ACTOR_TOKENS.ratio.l0Only ? 'l0' : ratio > ACTOR_TOKENS.ratio.l2 ? 'l1' : 'l2';
}

const IDENTITY_O = [0, 0, 0];
const IDENTITY_R = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** Row-major rigid transform { o, R } (columns of R are the local axes) -> Matrix4. */
export function frameToMatrix4(f, out = new THREE.Matrix4()) {
  const R = f.R || IDENTITY_R, o = f.o || IDENTITY_O;
  return out.set(R[0], R[1], R[2], o[0], R[3], R[4], R[5], o[1], R[6], R[7], R[8], o[2], 0, 0, 0, 1);
}

const tmpColor = new THREE.Color();

export class ActorLayer {
  constructor(parent, tier = 'high') {
    this.group = new THREE.Group();
    this.group.name = 'actors';
    parent.add(this.group);
    this.crowdGroup = new THREE.Group();
    this.crowdGroup.name = 'crowders';
    parent.add(this.crowdGroup);
    this.tier = tier;
    this.records = new Map();
    this.crowdRecords = new Map();
    this._assetCache = new Map();
    this._cam = new THREE.Vector3();
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._v3 = new THREE.Vector3();
    this._ray = new THREE.Ray();
    this._inv = new THREE.Matrix4();
    this._tmpM = new THREE.Matrix4();
    this._sph = new THREE.Sphere();
  }

  // ------------------------------------------------------------ list management
  /**
   * Register decoded assets by id so `setCrowd([{ assetId, transforms }])` can resolve
   * them even when the caller omits `item.asset` and the asset is not currently an active actor.
   */
  registerAssets(assetsById) {
    if (!assetsById) return;
    if (assetsById instanceof Map) {
      for (const [id, asset] of assetsById) if (asset && asset.lod0) this._assetCache.set(id, asset);
      return;
    }
    for (const [id, asset] of Object.entries(assetsById)) {
      if (asset && asset.lod0) this._assetCache.set(id, asset);
    }
  }

  /**
   * Idempotent: builds GPU objects once per (id, asset.id), then only updates transforms and uniforms.
   * Each spec may include:
   * - `parts: { [partId]: { visible?, opacity?, transform?: { o?, R? } } }` where `transform` is a rigid
   *   transform in the actor's local frame applied to that part's L0 mesh, L1 beads, and L2 atoms/bonds.
   * - `pickable`: boolean (default `true`; when `false`, the actor is skipped by `pick()`).
   * - `cutaway`: boolean | string (anchor name) | `{ anchor?, point?, normal? }`.
   */
  setActors(list = []) {
    const seen = new Set();
    for (const spec of list || []) {
      if (!spec || spec.id === undefined || !spec.asset) continue;
      if (spec.asset.id) this._assetCache.set(spec.asset.id, spec.asset);
      seen.add(spec.id);
      let rec = this.records.get(spec.id);
      if (rec && rec.assetId !== spec.asset.id) { this._disposeRecord(rec); this.records.delete(spec.id); rec = null; }
      if (!rec) { rec = this._build(spec); this.records.set(spec.id, rec); }
      this._configure(rec, spec);
    }
    for (const [id, rec] of [...this.records]) if (!seen.has(id)) { this._disposeRecord(rec); this.records.delete(id); }
  }

  /**
   * Render instanced cytoplasmic crowders (L0 envelopes only, one `THREE.InstancedMesh` / draw call per asset part).
   * Material follows PLAN.md §4.3 & CONTRACTS.md §6.4: `crowdColor(partColor(part, assetId))`, opacity 0.22,
   * transparent, `depthWrite: false`, roughness 0.65, metalness 0, not pickable.
   *
   * Each entry in `list` is `{ assetId, asset?, transforms }`:
   * - `transforms`: `Float32Array` of 16 floats per instance in standard Three.js column-major `Matrix4.elements`
   *   layout (translation in slots 12..14, slot 15 = 1), or an Array of `{ o, R }` rigid frames.
   * - `asset`: optional decoded asset; if omitted, resolved from `assetsById` or previously seen/registered assets.
   * Passing `[]` or `null` disposes all crowder meshes and restores baseline draw calls and GPU memory.
   */
  setCrowd(list = [], assetsById = null) {
    if (assetsById) this.registerAssets(assetsById);
    const seen = new Set();
    for (const item of list || []) {
      if (!item) continue;
      const asset = item.asset || this._resolveAsset(item.assetId, assetsById);
      const assetId = item.assetId || (asset && asset.id);
      if (!assetId || !asset || !Array.isArray(asset.lod0) || !asset.lod0.length) continue;
      this._assetCache.set(assetId, asset);

      const raw = item.transforms;
      const isFrameArr = Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'object' && raw[0] !== null;
      const count = !raw ? 0 : isFrameArr ? raw.length : Math.floor(raw.length / 16);
      if (count <= 0) continue;

      seen.add(assetId);
      let rec = this.crowdRecords.get(assetId);
      if (rec && (rec.asset !== asset || rec.cap < count)) {
        this._disposeCrowdRecord(rec);
        this.crowdRecords.delete(assetId);
        rec = null;
      }
      if (!rec) {
        rec = this._buildCrowdRecord(assetId, asset, count);
        this.crowdRecords.set(assetId, rec);
      }

      for (let p = 0; p < rec.meshes.length; p++) {
        const mesh = rec.meshes[p];
        const dst = mesh.instanceMatrix.array;
        if (isFrameArr) {
          for (let i = 0; i < count; i++) {
            frameToMatrix4(raw[i], this._tmpM).toArray(dst, i * 16);
          }
        } else {
          dst.set(raw.subarray ? raw.subarray(0, count * 16) : raw.slice(0, count * 16), 0);
        }
        mesh.count = count;
        mesh.visible = true;
        mesh.instanceMatrix.needsUpdate = true;
      }
      rec.count = count;
    }

    for (const [id, rec] of [...this.crowdRecords]) {
      if (!seen.has(id)) {
        this._disposeCrowdRecord(rec);
        this.crowdRecords.delete(id);
      }
    }
  }

  clearCrowd() {
    for (const rec of this.crowdRecords.values()) this._disposeCrowdRecord(rec);
    this.crowdRecords.clear();
  }

  getCrowdState() {
    return [...this.crowdRecords.values()].map(r => ({
      assetId: r.assetId,
      instances: r.count,
      parts: r.meshes.length,
    }));
  }

  _resolveAsset(assetId, assetsById) {
    if (!assetId) return null;
    if (assetsById) {
      const a = assetsById instanceof Map ? assetsById.get(assetId) : assetsById[assetId];
      if (a) return a;
    }
    return this._assetCache.get(assetId) || null;
  }

  _buildCrowdRecord(assetId, asset, cap) {
    const meshes = [], mats = [], geos = [];
    const C = ACTOR_TOKENS.crowd;
    for (const m of asset.lod0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
      geo.setIndex(new THREE.BufferAttribute(m.indices, 1));
      geo.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({
        color: crowdColor(partColor(m.part, assetId)),
        roughness: 0.65,
        metalness: 0,
        transparent: true,
        depthWrite: C.depthWrite,
        opacity: C.opacity,
      });
      const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, cap));
      mesh.count = 0;
      mesh.renderOrder = 0;
      mesh.frustumCulled = false;
      mesh.userData.crowd = true;
      mesh.userData.assetId = assetId;
      mesh.userData.part = m.part;
      this.crowdGroup.add(mesh);
      meshes.push(mesh);
      mats.push(mat);
      geos.push(geo);
    }
    return { assetId, asset, cap, count: 0, meshes, mats, geos };
  }

  _disposeCrowdRecord(rec) {
    for (let i = 0; i < rec.meshes.length; i++) {
      rec.meshes[i].removeFromParent();
      rec.meshes[i].dispose();
      rec.geos[i].dispose();
      rec.mats[i].dispose();
    }
  }

  clear() {
    for (const rec of this.records.values()) this._disposeRecord(rec);
    this.records.clear();
  }

  setTier(tier) {
    if (tier === this.tier) return;
    this.tier = tier;
    for (const rec of this.records.values()) {
      const s1 = l1SphereGeometry(tier), s2 = sphereGeometry(tier), c = cylinderGeometry(tier);
      rec.l1.geometry = s1; rec.l2Atoms.geometry = s2; rec.l2Bonds.geometry = c;
      rec.l1SphereGeo.dispose(); rec.sphereGeo.dispose(); rec.cylGeo.dispose();
      rec.l1SphereGeo = s1; rec.sphereGeo = s2; rec.cylGeo = c;
    }
  }

  dispose() {
    this.clear();
    this.clearCrowd();
    this._assetCache.clear();
    this.group.removeFromParent();
    this.crowdGroup.removeFromParent();
  }

  /** Largest bounds radius (angstroms) among visible actors; 0 when there are none. */
  get maxRadius() {
    let r = 0;
    for (const rec of this.records.values()) if (rec.visible) r = Math.max(r, rec.asset.bounds.radius);
    return r;
  }

  /**
   * Resolve a named anchor on an active visible actor into science space (parent / `root` coordinates).
   * Returns `out` or `null` if the actor is absent/hidden or the named anchor does not exist.
   */
  getAnchorPosition(actorId, anchorName, out = new THREE.Vector3()) {
    const rec = this.records.get(actorId);
    if (!rec || !rec.visible) return null;
    const anchor = anchorName ? rec.asset.anchors[anchorName] : rec.asset.anchors.center;
    if (!anchor || !anchor.o) return null;
    return out.set(anchor.o[0], anchor.o[1], anchor.o[2]).applyMatrix4(rec.group.matrix);
  }

  // ------------------------------------------------------------ build
  _build(spec) {
    const asset = spec.asset, L2 = asset.lod2;
    const l2Sites = L2
      ? (Array.isArray(L2.sites) && L2.sites.length
        ? L2.sites
        : (L2.anchor ? [{ anchor: L2.anchor, radius: L2.radius }] : []))
      : [];
    const rec = {
      id: spec.id, assetId: asset.id, asset, l2Sites,
      group: new THREE.Group(), l0: [], l0Mats: [], partIndex: new Map(),
      visible: true, opacity: 1, pickable: true, parts: null, partsKey: '',
      cutaway: false, cutOn: false, lod: 'auto', label: '',
      plane: new THREE.Plane(), fade: { l0: 0, l1: 0, l2: 0 }, level: 'l0', ratio: Infinity, snapped: false,
    };
    rec.group.name = `actor:${spec.id}`;
    rec.group.matrixAutoUpdate = false;
    this.group.add(rec.group);

    const partIds = asset.parts.map(p => p.id);
    asset.parts.forEach((p, i) => rec.partIndex.set(p.id, i));

    // L0: one envelope mesh per part (supports optional per-part local rigid transform)
    for (const m of asset.lod0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
      geo.setIndex(new THREE.BufferAttribute(m.indices, 1));
      geo.computeVertexNormals();
      const T = ACTOR_TOKENS.l0;
      const mat = new THREE.MeshStandardMaterial({
        color: partColor(m.part, asset.id),
        roughness: T.roughness, metalness: T.metalness, transparent: true, depthWrite: false, opacity: T.opacityOnly,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.matrixAutoUpdate = false;
      mesh.renderOrder = 1;
      mesh.userData.part = m.part;
      rec.group.add(mesh);
      rec.l0.push(mesh); rec.l0Mats.push(mat);
    }

    const chainPart = asset.chains.map(c => c.part);
    rec.chainPart = chainPart;
    rec.l1SphereGeo = l1SphereGeometry(this.tier);
    rec.sphereGeo = sphereGeometry(this.tier);
    rec.cylGeo = cylinderGeometry(this.tier);

    // L1: one bead per residue
    const L1 = asset.lod1, n1 = L1.count;
    rec.l1Mat = new THREE.MeshStandardMaterial(L1_MAT);
    rec.l1 = this._instanced(rec, rec.l1SphereGeo, rec.l1Mat, n1);
    const c1 = rec.l1.instanceColor.array;
    for (let i = 0; i < n1; i++) {
      const ch = L1.chain[i];
      tmpColor.setHex(chainColor(asset.chains[ch], chainPart[ch], asset.id));
      c1[i * 3] = tmpColor.r; c1[i * 3 + 1] = tmpColor.g; c1[i * 3 + 2] = tmpColor.b;
    }
    rec.l1.instanceColor.needsUpdate = true;

    // L2: heavy atoms and bond cylinders across all v1/v2 sites (optional)
    const n2 = L2 ? L2.count : 0, nb = L2 ? L2.bonds.length / 2 : 0;
    rec.atomMat = new THREE.MeshStandardMaterial(ATOM_MAT);
    rec.bondMat = new THREE.MeshStandardMaterial(BOND_MAT);
    rec.l2Atoms = this._instanced(rec, rec.sphereGeo, rec.atomMat, n2);
    rec.l2Bonds = this._instanced(rec, rec.cylGeo, rec.bondMat, 2 * nb);
    if (L2) {
      const ca = rec.l2Atoms.instanceColor.array, cb = rec.l2Bonds.instanceColor.array;
      for (let i = 0; i < n2; i++) {
        tmpColor.setHex(ELEMENT_COLOR[L2.element[i]] ?? OTHER_COLOR);
        ca[i * 3] = tmpColor.r; ca[i * 3 + 1] = tmpColor.g; ca[i * 3 + 2] = tmpColor.b;
      }
      for (let b = 0; b < nb; b++) for (let h = 0; h < 2; h++) {
        const a = L2.bonds[2 * b + h], k = (2 * b + h) * 3;
        cb[k] = ca[a * 3]; cb[k + 1] = ca[a * 3 + 1]; cb[k + 2] = ca[a * 3 + 2];
      }
      rec.l2Atoms.instanceColor.needsUpdate = true; rec.l2Bonds.instanceColor.needsUpdate = true;
    }
    rec.partIds = partIds;
    return rec;
  }

  _instanced(rec, geo, mat, count) {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, count));
    m.count = count;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, count) * 3), 3);
    m.frustumCulled = false;
    m.visible = false;
    rec.group.add(m);
    return m;
  }

  // ------------------------------------------------------------ per-call configuration
  _configure(rec, spec) {
    rec.visible = spec.visible !== false;
    rec.opacity = clamp(spec.opacity ?? 1, 0, 1);
    rec.pickable = spec.pickable !== false;
    rec.cutaway = spec.cutaway || false;
    rec.lod = spec.lod || 'auto';
    rec.label = spec.label || '';
    rec.parts = spec.parts || null;
    if (spec.transform) { frameToMatrix4(spec.transform, rec.group.matrix); rec.group.matrixWorldNeedsUpdate = true; }
    const key = this._partsKey(rec);
    if (key !== rec.partsKey) {
      rec.partsKey = key;
      this._applyPartTransforms(rec);
      this._writeInstances(rec);
    }
  }

  _partFactor(rec, partId) {
    const p = rec.parts && rec.parts[partId];
    if (!p) return 1;
    return p.visible === false ? 0 : clamp(p.opacity ?? 1, 0, 1);
  }

  _partTransform(rec, partId) {
    const p = rec.parts && rec.parts[partId];
    return (p && p.transform) ? p.transform : null;
  }

  _partsKey(rec) {
    let key = '';
    for (let i = 0; i < rec.partIds.length; i++) {
      const id = rec.partIds[i];
      if (i > 0) key += '|';
      key += this._partFactor(rec, id).toFixed(3);
      const tf = this._partTransform(rec, id);
      if (tf) {
        const o = tf.o || IDENTITY_O, R = tf.R || IDENTITY_R;
        key += `:${o[0].toFixed(3)},${o[1].toFixed(3)},${o[2].toFixed(3)},`
          + `${R[0].toFixed(4)},${R[1].toFixed(4)},${R[2].toFixed(4)},`
          + `${R[3].toFixed(4)},${R[4].toFixed(4)},${R[5].toFixed(4)},`
          + `${R[6].toFixed(4)},${R[7].toFixed(4)},${R[8].toFixed(4)}`;
      }
    }
    return key;
  }

  /** Apply optional per-part local rigid transforms to L0 envelope meshes. */
  _applyPartTransforms(rec) {
    for (let i = 0; i < rec.l0.length; i++) {
      const mesh = rec.l0[i];
      const tf = this._partTransform(rec, mesh.userData.part);
      if (tf) frameToMatrix4(tf, mesh.matrix);
      else mesh.matrix.identity();
      mesh.matrixWorldNeedsUpdate = true;
    }
  }

  /**
   * Rewrite L1/L2 instance matrices:
   * - a part's visibility/opacity scales its beads and atoms (<= 0.001 hides them);
   * - a part's local rigid `transform` `{ o, R }` transforms its beads, atoms, and bond endpoints in actor space.
   */
  _writeInstances(rec) {
    const A = rec.asset;
    const f = rec.partIds.map(id => this._partFactor(rec, id));
    const tfs = rec.partIds.map(id => this._partTransform(rec, id));
    const partIdxOfChain = rec.chainPart.map(pid => rec.partIndex.get(pid));

    const L1 = A.lod1, m1 = rec.l1.instanceMatrix.array, T = ACTOR_TOKENS.beadRadius;
    for (let i = 0; i < L1.count; i++) {
      const pi = partIdxOfChain[L1.chain[i]];
      const s = pi !== undefined ? f[pi] : 1;
      if (s <= 0.001) { writeHidden(m1, i); continue; }
      let x = L1.positions[i * 3], y = L1.positions[i * 3 + 1], z = L1.positions[i * 3 + 2];
      const tf = pi !== undefined ? tfs[pi] : null;
      if (tf) {
        const R = tf.R || IDENTITY_R, o = tf.o || IDENTITY_O;
        const tx = R[0] * x + R[1] * y + R[2] * z + o[0];
        const ty = R[3] * x + R[4] * y + R[5] * z + o[1];
        const tz = R[6] * x + R[7] * y + R[8] * z + o[2];
        x = tx; y = ty; z = tz;
      }
      writeSphere(m1, i, x, y, z, (L1.kind[i] === 1 ? T.p : T.ca) * s);
    }
    rec.l1.instanceMatrix.needsUpdate = true;

    const L2 = A.lod2;
    if (L2) {
      const ma = rec.l2Atoms.instanceMatrix.array, mb = rec.l2Bonds.instanceMatrix.array, P = L2.positions;
      for (let i = 0; i < L2.count; i++) {
        const pi = partIdxOfChain[L2.chain[i]];
        const s = pi !== undefined ? f[pi] : 1;
        if (s <= 0.001) { writeHidden(ma, i); continue; }
        let x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
        const tf = pi !== undefined ? tfs[pi] : null;
        if (tf) {
          const R = tf.R || IDENTITY_R, o = tf.o || IDENTITY_O;
          const tx = R[0] * x + R[1] * y + R[2] * z + o[0];
          const ty = R[3] * x + R[4] * y + R[5] * z + o[1];
          const tz = R[6] * x + R[7] * y + R[8] * z + o[2];
          x = tx; y = ty; z = tz;
        }
        writeSphere(ma, i, x, y, z, BALL_SCALE * (ELEMENT_RADIUS[L2.element[i]] ?? OTHER_RADIUS) * s);
      }
      for (let b = 0; b < L2.bonds.length / 2; b++) {
        const a = L2.bonds[2 * b], c = L2.bonds[2 * b + 1];
        const pia = partIdxOfChain[L2.chain[a]], pic = partIdxOfChain[L2.chain[c]];
        const sa = pia !== undefined ? f[pia] : 1, sc = pic !== undefined ? f[pic] : 1;
        const s = Math.min(sa, sc);
        if (s <= 0.001) { writeHidden(mb, 2 * b); writeHidden(mb, 2 * b + 1); continue; }
        // Transformed atom positions are already stored in slots 12..14 of ma
        const ax = ma[a * 16 + 12], ay = ma[a * 16 + 13], az = ma[a * 16 + 14];
        const bx = ma[c * 16 + 12], by = ma[c * 16 + 13], bz = ma[c * 16 + 14];
        const mx = (ax + bx) * 0.5, my = (ay + by) * 0.5, mz = (az + bz) * 0.5, r = BOND_RADIUS * s;
        writeCylinder(mb, 2 * b, ax, ay, az, mx, my, mz, r);
        writeCylinder(mb, 2 * b + 1, mx, my, mz, bx, by, bz, r);
      }
      rec.l2Atoms.instanceMatrix.needsUpdate = true; rec.l2Bonds.instanceMatrix.needsUpdate = true;
    }
  }

  // ------------------------------------------------------------ per-frame update
  /** Select levels, cross-fade, and place the cutaway plane. Call once per frame after the camera moved. */
  update(camera, dt = 0, tier = this.tier) {
    if (tier !== this.tier) this.setTier(tier);
    if (!this.records.size) return;
    this.group.updateWorldMatrix(true, true);
    camera.getWorldPosition(this._cam);
    const T = ACTOR_TOKENS, step = dt > 0 ? dt / T.fadeSeconds : 1;
    for (const rec of this.records.values()) {
      rec.group.visible = rec.visible;
      if (!rec.visible) continue;
      const B = rec.asset.bounds, M = rec.group.matrixWorld;
      this._v.set(B.center[0], B.center[1], B.center[2]).applyMatrix4(M);
      const boundsRatio = this._cam.distanceTo(this._v) / B.radius;
      rec.ratio = boundsRatio;

      // Multi-site L2 (Asset Format v2): check distance to each lod2.sites entry as well as bounds.center.
      let minSiteDist = Infinity, closestSiteAnchor = null;
      const sites = rec.l2Sites;
      for (let i = 0; i < sites.length; i++) {
        const anc = rec.asset.anchors[sites[i].anchor];
        if (!anc) continue;
        this._v2.set(anc.o[0], anc.o[1], anc.o[2]).applyMatrix4(M);
        const d = this._cam.distanceTo(this._v2);
        if (d < minSiteDist) { minSiteDist = d; closestSiteAnchor = anc; }
      }
      const effectiveRatio = Number.isFinite(minSiteDist) ? Math.min(boundsRatio, minSiteDist / B.radius) : boundsRatio;

      // target level (what is shown), then the target opacity of each level
      const hasL2 = !!rec.asset.lod2;
      let level;
      if (rec.lod === 'l0' || rec.lod === 'l1' || rec.lod === 'l2') {
        level = rec.lod;
      } else if (boundsRatio > T.ratio.l0Only) {
        level = 'l0';
      } else if (effectiveRatio <= T.ratio.l2) {
        level = 'l2';
      } else {
        level = 'l1';
      }
      if (level === 'l2' && (!hasL2 || (rec.lod === 'auto' && this.tier === 'low'))) level = 'l1';
      rec.level = level;
      const t0 = level === 'l0' ? T.l0.opacityOnly : level === 'l1' ? T.l0.opacityWithL1 : 0;
      const t1 = level === 'l0' ? 0 : 1, t2 = level === 'l2' ? 1 : 0;
      const F = rec.fade;
      if (!rec.snapped) { F.l0 = t0; F.l1 = t1; F.l2 = t2; rec.snapped = true; }
      else {
        F.l0 = approach(F.l0, t0, step * T.l0.opacityOnly);
        F.l1 = approach(F.l1, t1, step);
        F.l2 = approach(F.l2, t2, step);
      }

      // cutaway: plane's kept side points away from the camera, applied to L0 and L1 only (L2 stays unclipped)
      const cutEnabled = !!rec.cutaway;
      if (cutEnabled) {
        this._updateCutPlane(rec, M, closestSiteAnchor);
      }
      if (cutEnabled !== rec.cutOn) {
        rec.cutOn = cutEnabled;
        const planes = rec.cutOn ? [rec.plane] : null;
        for (const m of rec.l0Mats) m.clippingPlanes = planes;
        rec.l1Mat.clippingPlanes = planes;
        rec.l1Mat.side = rec.cutOn ? THREE.DoubleSide : THREE.FrontSide;    // cut beads show their inside instead of a hollow rim
        rec.l1Mat.needsUpdate = true;
      }

      // apply opacities
      rec.l0.forEach((mesh, i) => {
        const o = F.l0 * rec.opacity * this._partFactor(rec, mesh.userData.part);
        rec.l0Mats[i].opacity = o;
        mesh.visible = o > 0.002;
      });
      setFade(rec.l1, rec.l1Mat, F.l1 * rec.opacity);
      setFade(rec.l2Atoms, rec.atomMat, F.l2 * rec.opacity);
      setFade(rec.l2Bonds, rec.bondMat, F.l2 * rec.opacity);
    }
  }

  _updateCutPlane(rec, M, closestSiteAnchor) {
    const cut = rec.cutaway;
    const p = this._v;
    const n = this._v2;
    if (typeof cut === 'object' && cut !== null && Array.isArray(cut.point)) {
      // Explicit point in science space (group parent space) -> world space
      p.set(cut.point[0], cut.point[1], cut.point[2]).applyMatrix4(this.group.matrixWorld);
      if (Array.isArray(cut.normal)) {
        n.set(cut.normal[0], cut.normal[1], cut.normal[2]).transformDirection(this.group.matrixWorld).normalize();
      } else {
        n.subVectors(p, this._cam).normalize();
      }
      rec.plane.setFromNormalAndCoplanarPoint(n, p);
      return;
    }
    const anchorName = typeof cut === 'string'
      ? cut
      : (typeof cut === 'object' && cut !== null && typeof cut.anchor === 'string' ? cut.anchor : null);
    const site = (anchorName && rec.asset.anchors[anchorName])
      || rec.asset.anchors.activeSite
      || closestSiteAnchor
      || rec.asset.anchors.center;
    p.set(site.o[0], site.o[1], site.o[2]).applyMatrix4(M);
    n.subVectors(p, this._cam).normalize();
    rec.plane.setFromNormalAndCoplanarPoint(n, p);
  }

  /** [{ id, level, ratio, fade }] for scripted checks and HUDs. `level` is the level the rules select right now. */
  getState() {
    return [...this.records.values()].map(r => ({ id: r.id, level: r.level, ratio: r.ratio, fade: { ...r.fade } }));
  }

  // ------------------------------------------------------------ picking
  /**
   * World-space raycaster -> { actor, part, chain } or null.
   * L1 beads win over the L0 envelope that encloses them (the envelope is only a fallback when no bead is hit,
   * or while L1 is not shown). `minRadius` (angstroms) enlarges small beads so they stay clickable when zoomed out.
   * Actors with `pickable: false` and all crowders are skipped.
   */
  pick(raycaster, minRadius = 0) {
    this.group.updateWorldMatrix(true, true);
    let bead = null, beadT = Infinity, env = null, envT = Infinity;
    const ray = raycaster.ray;
    for (const rec of this.records.values()) {
      if (!rec.visible || !rec.group.visible || !rec.pickable) continue;
      const M = rec.group.matrixWorld, clip = rec.cutOn ? rec.plane : null;
      // L1 beads (ray tested in the actor frame; the transform is rigid, so distances are preserved)
      if (rec.fade.l1 > 0.5) {
        const lr = this._ray.copy(ray).applyMatrix4(this._inv.copy(M).invert());
        const L1 = rec.asset.lod1, mA = rec.l1.instanceMatrix.array, o = lr.origin, d = lr.direction;
        for (let i = 0; i < L1.count; i++) {
          const base = i * 16;
          if (mA[base] <= 0.001) continue;                       // hidden instance (part switched off)
          const s = Math.max(mA[base], minRadius);               // uniform scale = bead radius
          // Read center from instance matrix so per-part transforms are respected automatically
          const wx = mA[base + 12] - o.x, wy = mA[base + 13] - o.y, wz = mA[base + 14] - o.z;
          const tc = wx * d.x + wy * d.y + wz * d.z;
          if (tc <= 0) continue;
          const d2 = wx * wx + wy * wy + wz * wz - tc * tc;
          if (d2 > s * s) continue;
          const t = tc - Math.sqrt(s * s - d2);
          if (t >= beadT) continue;
          if (clip && clip.distanceToPoint(this._v.copy(d).multiplyScalar(t).add(o).applyMatrix4(M)) < 0) continue;
          const ch = L1.chain[i];
          beadT = t; bead = { actor: rec.id, part: rec.chainPart[ch], chain: rec.asset.chains[ch].id };
        }
      }
      // L0 envelope triangles
      for (const mesh of rec.l0) {
        if (!mesh.visible) continue;
        for (const h of raycaster.intersectObject(mesh, false)) {
          if (clip && clip.distanceToPoint(h.point) < 0) continue;
          if (h.distance < envT) { envT = h.distance; env = { actor: rec.id, part: mesh.userData.part, chain: null }; }
          break;
        }
      }
    }
    return bead || env;
  }

  // ------------------------------------------------------------ disposal
  _disposeRecord(rec) {
    rec.group.removeFromParent();
    for (const mesh of rec.l0) mesh.geometry.dispose();
    for (const m of [...rec.l0Mats, rec.l1Mat, rec.atomMat, rec.bondMat]) m.dispose();
    for (const im of [rec.l1, rec.l2Atoms, rec.l2Bonds]) im.dispose();
    rec.l1SphereGeo.dispose(); rec.sphereGeo.dispose(); rec.cylGeo.dispose();
  }
}

/** Lighter unit sphere for L1 residue beads (up to ~10k beads on ribosome-70s) to keep draw cost bounded. */
function l1SphereGeometry(tier) {
  const seg = tier === 'high' ? [12, 8] : tier === 'medium' ? [9, 7] : [7, 5];
  return new THREE.SphereGeometry(1, seg[0], seg[1]);
}

function approach(cur, target, maxStep) {
  const d = target - cur;
  return Math.abs(d) <= maxStep ? target : cur + Math.sign(d) * maxStep;
}

/** Opaque when fully faded in; transparent (and not depth-writing) only while cross-fading or dimmed. */
function setFade(mesh, mat, value) {
  const on = value > 0.002;
  mesh.visible = on;
  if (!on) return;
  const solid = value >= 0.999;
  mat.opacity = value;
  mat.transparent = !solid;
  mat.depthWrite = solid;
}
