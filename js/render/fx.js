/**
 * @module render/fx
 * Round 3 molecular event effects layer (PLAN.md §4.4, §4.11, §8.1–§8.2, task R3-R2).
 * Renders bond-formation pulses and GTP hydrolysis cues driven by `WorldState.fx`.
 *
 * Timing conventions (PLAN.md §4.4):
 * - Bond pulse (`type: 'pulse'`): duration 400 ms (`f` in `[0, 1]`).
 *   `pulseWeight(f)` applies `easeInOutCubic` on each half (`f < 0.5 ? easeInOutCubic(2f) : easeInOutCubic(2(1-f))`),
 *   peaking at `f = 0.5` (200 ms). The two bonded atoms scale `1 -> 1.35 -> 1` and lerp `0 -> 40% -> 0` toward white
 *   using standard PBR `MeshStandardMaterial` (no emissive/glow, per PLAN.md §4.11) without mutating underlying layers.
 * - GTP hydrolysis cue (`type: 'gtp'`): duration 1400 ms (`f` in `[0, 1]`).
 *   Displays an HTML overlay label `GTP → GDP` (`hx-tag hx-sm`, zero new CSS) at the factor's `gDomain` anchor,
 *   with 250 ms fade-in (`f in [0, 250/1400]`), steady hold (`f in [250/1400, 1150/1400]`),
 *   and 250 ms fade-out (`f in [1150/1400, 1]`).
 *
 * Both deterministic `WorldState.fx` driving (explicit `entry.f` in `[0, 1]`) and optional real-time
 * frame-timestamp playback (omit `entry.f`, supply optional `entry.startTime` in `performance.now()` ms)
 * are supported.
 */
import * as THREE from 'three';
import { ELEMENTS, ELEMENT_INFO } from '../science/index.js';
import { BALL_SCALE } from './molecule.js';
import { clamp, easeInOutCubic, writeSphere, writeHidden, sphereGeometry } from './util.js';

export const FX_PULSE_DURATION_MS = 400;
export const FX_PULSE_MAX_SCALE = 1.35;
export const FX_PULSE_WHITE_MIX = 0.40;
export const FX_GTP_DURATION_MS = 1400;
export const FX_GTP_FADE_MS = 250;
export const FX_GTP_LABEL = 'GTP → GDP';

const GTP_FADE_FRAC = FX_GTP_FADE_MS / FX_GTP_DURATION_MS;
const INITIAL_PULSE_CAP = 16;

const ELEMENT_VDW_BY_SYM = {
  C: ELEMENT_INFO.C.vdw,
  N: ELEMENT_INFO.N.vdw,
  O: ELEMENT_INFO.O.vdw,
  P: ELEMENT_INFO.P.vdw,
  S: 1.80,
  MG: 1.73,
  ZN: 1.39,
  H: 1.20,
};
const ELEMENT_HEX_BY_SYM = {
  C: ELEMENT_INFO.C.color,
  N: ELEMENT_INFO.N.color,
  O: ELEMENT_INFO.O.color,
  P: ELEMENT_INFO.P.color,
  S: 0xe6c84a,
  MG: 0x7dff7a,
  ZN: 0x8f9cc9,
};
const OTHER_VDW = 1.60;
const OTHER_HEX = 0xb0b8c8;

const tmpColor = new THREE.Color();

/**
 * Symmetric bond-pulse envelope over `f` in `[0, 1]` (`easeInOutCubic` on each half).
 * Returns `0` at `f <= 0` and `f >= 1`, peaking at `1` when `f = 0.5`.
 */
export function pulseWeight(f) {
  if (!(f > 0) || !(f < 1)) return 0;
  return f < 0.5 ? easeInOutCubic(f * 2) : easeInOutCubic((1 - f) * 2);
}

/**
 * GTP hydrolysis cue opacity envelope over `f` in `[0, 1]` (1.4 s total, 250 ms fade-in & fade-out).
 * Returns `0` at `f <= 0` and `f >= 1`, `1` on `[250/1400, 1150/1400]`, and `easeInOutCubic` on both fades.
 */
export function gtpOpacity(f) {
  if (!(f > 0) || !(f < 1)) return 0;
  if (f < GTP_FADE_FRAC) return easeInOutCubic(f / GTP_FADE_FRAC);
  if (f > 1 - GTP_FADE_FRAC) return easeInOutCubic((1 - f) / GTP_FADE_FRAC);
  return 1;
}

function vdwForSymbol(sym) {
  if (!sym) return OTHER_VDW;
  return ELEMENT_VDW_BY_SYM[String(sym).trim().toUpperCase()] ?? OTHER_VDW;
}

function hexForSymbol(sym) {
  if (!sym) return OTHER_HEX;
  return ELEMENT_HEX_BY_SYM[String(sym).trim().toUpperCase()] ?? OTHER_HEX;
}

/**
 * Event-effects layer driven by `WorldState.fx` entries (`type: 'pulse' | 'gtp'`).
 */
export class FxLayer {
  /**
   * @param {{ parent?: THREE.Object3D, overlayEl?: HTMLElement, project?: Function, tier?: string }} [opts]
   */
  constructor(opts = {}) {
    this.parent = opts.parent || null;
    this.overlayEl = opts.overlayEl || null;
    this.project = typeof opts.project === 'function' ? opts.project : null;
    this.tier = opts.tier || 'high';

    this.group = new THREE.Group();
    this.group.name = 'fx';
    if (this.parent && typeof this.parent.add === 'function') this.parent.add(this.group);

    // Matches MoleculeLayer.atomMat (PLAN.md §4.4) with no emissive/glow (PLAN.md §4.11).
    this.pulseMat = new THREE.MeshStandardMaterial({
      roughness: 0.32,
      metalness: 0.06,
      envMapIntensity: 1.0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    this.sphereGeo = sphereGeometry(this.tier);
    this.pulseCap = INITIAL_PULSE_CAP;
    this.pulseMesh = this._buildPulseMesh(this.pulseCap);

    this.gtpPool = [];
    this.items = [];
    this.lastState = [];
    this._v = new THREE.Vector3();
    this._p = { x: 0, y: 0, z: 0, ok: false };
    this._atomScratch = [];
  }

  _buildPulseMesh(cap) {
    const m = new THREE.InstancedMesh(this.sphereGeo, this.pulseMat, Math.max(1, cap));
    m.count = 0;
    m.visible = false;
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, cap) * 3), 3);
    m.renderOrder = 2;
    this.group.add(m);
    return m;
  }

  _ensurePulseCapacity(needed) {
    if (needed <= this.pulseCap) return;
    const nextCap = Math.max(needed, this.pulseCap * 2);
    const oldMesh = this.pulseMesh;
    const oldMat = oldMesh.instanceMatrix.array;
    const oldCol = oldMesh.instanceColor.array;
    const nextMesh = this._buildPulseMesh(nextCap);
    nextMesh.instanceMatrix.array.set(oldMat);
    nextMesh.instanceColor.array.set(oldCol);
    oldMesh.removeFromParent();
    oldMesh.dispose();
    this.pulseMesh = nextMesh;
    this.pulseCap = nextCap;
  }

  _acquireGtpElement(index) {
    if (index < this.gtpPool.length) return this.gtpPool[index];
    if (!this.overlayEl || typeof document === 'undefined') return null;
    const el = document.createElement('div');
    el.className = 'hx-tag hx-sm';
    el.setAttribute('data-fx-type', 'gtp');
    el.textContent = FX_GTP_LABEL;
    el.style.display = 'none';
    el.style.opacity = '0';
    this.overlayEl.appendChild(el);
    this.gtpPool.push(el);
    return el;
  }

  setTier(tier) {
    if (tier === this.tier) return;
    this.tier = tier;
    const nextGeo = sphereGeometry(tier);
    this.pulseMesh.geometry = nextGeo;
    this.sphereGeo.dispose();
    this.sphereGeo = nextGeo;
  }

  /**
   * Set active molecular FX list from `WorldState.fx`.
   * Each entry: `{ type: 'pulse' | 'gtp', anchor, f?, startTime?, durationMs?, label? }`.
   */
  setFx(list = []) {
    const src = Array.isArray(list) ? list : [];
    this.items = [];
    for (let i = 0; i < src.length; i++) {
      const e = src[i];
      if (!e || (e.type !== 'pulse' && e.type !== 'gtp')) continue;
      this.items.push({
        type: e.type,
        anchor: e.anchor || null,
        f: typeof e.f === 'number' && Number.isFinite(e.f) ? e.f : null,
        startTime: typeof e.startTime === 'number' && Number.isFinite(e.startTime) ? e.startTime : null,
        durationMs: typeof e.durationMs === 'number' && e.durationMs > 0
          ? e.durationMs
          : (e.type === 'gtp' ? FX_GTP_DURATION_MS : FX_PULSE_DURATION_MS),
        label: typeof e.label === 'string' && e.label.length ? e.label : FX_GTP_LABEL,
      });
    }
    if (!this.items.length) this._hideAll();
  }

  _hideAll() {
    this.pulseMesh.count = 0;
    this.pulseMesh.visible = false;
    for (let i = 0; i < this.gtpPool.length; i++) {
      this.gtpPool[i].style.display = 'none';
      this.gtpPool[i].style.opacity = '0';
    }
    this.lastState = [];
  }

  /**
   * Update pulse instances and projected GTP overlay labels for the current frame.
   *
   * @param {THREE.Camera} _camera
   * @param {number} width - Viewport width in CSS pixels.
   * @param {number} height - Viewport height in CSS pixels.
   * @param {{ actors?: object, atomGroups?: object, molecule?: object, asm?: object, dpos?: Float32Array }} [resolvers]
   * @param {number} [now] - Current frame timestamp in ms (`performance.now()`).
   */
  update(_camera, width = 0, height = 0, resolvers = {}, now = performance.now()) {
    if (!this.items.length) {
      if (this.pulseMesh.visible || this.lastState.length) this._hideAll();
      return;
    }

    let pulseCount = 0;
    let gtpCount = 0;
    const states = [];

    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      let f;
      if (item.f !== null) {
        f = clamp(item.f, 0, 1);
      } else {
        if (item.startTime === null) item.startTime = now;
        f = clamp((now - item.startTime) / item.durationMs, 0, 1);
      }

      if (item.type === 'pulse') {
        const w = pulseWeight(f);
        const scale = 1 + (FX_PULSE_MAX_SCALE - 1) * w;
        const whiteMix = FX_PULSE_WHITE_MIX * w;
        let renderedAtoms = 0;

        if (w > 0) {
          const atoms = this._resolvePulseAtoms(item.anchor, resolvers);
          if (atoms.length > 0) {
            this._ensurePulseCapacity(pulseCount + atoms.length);
            const matArr = this.pulseMesh.instanceMatrix.array;
            const colArr = this.pulseMesh.instanceColor.array;
            for (let k = 0; k < atoms.length; k++) {
              const a = atoms[k];
              const slot = pulseCount++;
              writeSphere(matArr, slot, a.x, a.y, a.z, a.radius * scale);
              // Lerp linear RGB 0 -> 40% toward white (1, 1, 1) and back
              colArr[slot * 3] = a.r + (1 - a.r) * whiteMix;
              colArr[slot * 3 + 1] = a.g + (1 - a.g) * whiteMix;
              colArr[slot * 3 + 2] = a.b + (1 - a.b) * whiteMix;
              renderedAtoms++;
            }
          }
        }
        states.push({
          type: 'pulse',
          f,
          weight: w,
          scale,
          whiteMix,
          visible: renderedAtoms > 0,
          atomCount: renderedAtoms,
        });
      } else if (item.type === 'gtp') {
        const op = gtpOpacity(f);
        let shown = false;
        let screenPos = null;

        if (op > 0) {
          const pos = this._resolveGtpPosition(item.anchor, resolvers, this._v);
          if (pos && this.project) {
            this.project(pos.x, pos.y, pos.z, this._p);
            if (this._p.ok) {
              const el = this._acquireGtpElement(gtpCount);
              if (el) {
                gtpCount++;
                if (el.textContent !== item.label) el.textContent = item.label;
                let sx = this._p.x;
                let sy = this._p.y - 12;
                if (width > 80) sx = clamp(sx, 40, width - 40);
                if (height > 40) sy = clamp(sy, 24, height - 16);
                el.style.transform = `translate3d(${sx.toFixed(1)}px,${sy.toFixed(1)}px,0) translate(-50%,-100%)`;
                el.style.opacity = op.toFixed(3);
                el.style.display = '';
                shown = true;
                screenPos = [sx, sy];
              }
            }
          }
        }
        states.push({
          type: 'gtp',
          f,
          opacity: op,
          visible: shown,
          label: item.label,
          screenPos,
        });
      }
    }

    // Finalize pulse InstancedMesh
    for (let s = pulseCount; s < this.pulseMesh.count; s++) {
      writeHidden(this.pulseMesh.instanceMatrix.array, s);
    }
    this.pulseMesh.count = pulseCount;
    this.pulseMesh.visible = pulseCount > 0;
    if (pulseCount > 0) {
      this.pulseMesh.instanceMatrix.needsUpdate = true;
      this.pulseMesh.instanceColor.needsUpdate = true;
    }

    // Hide unused pooled GTP DOM labels
    for (let i = gtpCount; i < this.gtpPool.length; i++) {
      const el = this.gtpPool[i];
      if (el.style.display !== 'none') el.style.display = 'none';
      el.style.opacity = '0';
    }

    this.lastState = states;
  }

  _resolvePulseAtoms(anchor, resolvers) {
    const out = this._atomScratch;
    out.length = 0;
    if (!anchor) return out;

    // 1. Direct coordinates fallback: { positions: [[x,y,z], ...], radii?, colors? }
    if (Array.isArray(anchor.positions)) {
      for (let i = 0; i < anchor.positions.length; i++) {
        const p = anchor.positions[i];
        if (!p || p.length < 3) continue;
        const r = (Array.isArray(anchor.radii) && anchor.radii[i] > 0) ? anchor.radii[i] : 0.55;
        tmpColor.setHex((Array.isArray(anchor.colors) && anchor.colors[i] !== undefined) ? anchor.colors[i] : 0xff9f38);
        out.push({ x: p[0], y: p[1], z: p[2], radius: r, r: tmpColor.r, g: tmpColor.g, b: tmpColor.b });
      }
      return out;
    }

    // 2. AtomGroupLayer or Assembly atom indices: { atomGroup, atoms: [i, j] }
    if (Array.isArray(anchor.atoms) && anchor.atoms.length > 0) {
      const groupId = anchor.atomGroup != null ? String(anchor.atomGroup) : '';
      const groupRec = groupId && resolvers.atomGroups && resolvers.atomGroups.records
        ? resolvers.atomGroups.records.get(groupId)
        : null;

      if (groupRec && groupRec.desc && groupRec.desc.pos) {
        const pos = groupRec.desc.pos;
        const el = groupRec.desc.el || [];
        const matArr = groupRec.atoms && groupRec.atoms.instanceMatrix ? groupRec.atoms.instanceMatrix.array : null;
        const colArr = groupRec.atoms && groupRec.atoms.instanceColor ? groupRec.atoms.instanceColor.array : null;
        for (let i = 0; i < anchor.atoms.length; i++) {
          const idx = anchor.atoms[i];
          if (!Number.isInteger(idx) || idx < 0 || idx >= groupRec.count) continue;
          const baseR = (matArr && groupRec.atoms.visible && matArr[idx * 16] > 0.001)
            ? matArr[idx * 16]
            : BALL_SCALE * vdwForSymbol(el[idx]);
          let r, g, b;
          if (colArr) {
            r = colArr[idx * 3]; g = colArr[idx * 3 + 1]; b = colArr[idx * 3 + 2];
          } else {
            tmpColor.setHex(hexForSymbol(el[idx]));
            r = tmpColor.r; g = tmpColor.g; b = tmpColor.b;
          }
          out.push({ x: pos[idx * 3], y: pos[idx * 3 + 1], z: pos[idx * 3 + 2], radius: baseR, r, g, b });
        }
        return out;
      }

      // Assembly / MoleculeLayer fallback (e.g. atomGroup: 'assembly' | 'mrna' | 'dna', or omitted)
      const asm = resolvers.asm;
      const dpos = resolvers.dpos || (asm && asm.atoms ? asm.atoms.pos : null);
      if (asm && dpos) {
        const mol = resolvers.molecule;
        const matArr = mol && mol.atoms && mol.atoms.instanceMatrix ? mol.atoms.instanceMatrix.array : null;
        const colArr = mol && mol.atoms && mol.atoms.instanceColor ? mol.atoms.instanceColor.array : null;
        for (let i = 0; i < anchor.atoms.length; i++) {
          const idx = anchor.atoms[i];
          if (!Number.isInteger(idx) || idx < 0 || idx >= asm.atoms.count) continue;
          const sym = ELEMENTS[asm.atoms.el[idx]];
          const baseR = (matArr && matArr[idx * 16] > 0.001)
            ? matArr[idx * 16]
            : BALL_SCALE * vdwForSymbol(sym);
          let r, g, b;
          if (colArr) {
            r = colArr[idx * 3]; g = colArr[idx * 3 + 1]; b = colArr[idx * 3 + 2];
          } else {
            tmpColor.setHex(hexForSymbol(sym));
            r = tmpColor.r; g = tmpColor.g; b = tmpColor.b;
          }
          out.push({ x: dpos[idx * 3], y: dpos[idx * 3 + 1], z: dpos[idx * 3 + 2], radius: baseR, r, g, b });
        }
        return out;
      }
    }

    // 3. Machine anchor fallback: { machineId, name }
    if (anchor.machineId && resolvers.actors && typeof resolvers.actors.getAnchorPosition === 'function') {
      const pos = resolvers.actors.getAnchorPosition(anchor.machineId, anchor.name || 'activeSite', this._v);
      if (pos) {
        tmpColor.setHex(anchor.color ?? 0x2fd9b9);
        out.push({
          x: pos.x, y: pos.y, z: pos.z,
          radius: anchor.radius > 0 ? anchor.radius : 1.1,
          r: tmpColor.r, g: tmpColor.g, b: tmpColor.b,
        });
      }
    }
    return out;
  }

  _resolveGtpPosition(anchor, resolvers, out) {
    if (!anchor) return null;
    if (Array.isArray(anchor.position) && anchor.position.length >= 3) {
      return out.set(anchor.position[0], anchor.position[1], anchor.position[2]);
    }
    if (Array.isArray(anchor.at) && anchor.at.length >= 3) {
      return out.set(anchor.at[0], anchor.at[1], anchor.at[2]);
    }
    if (anchor.machineId && resolvers.actors && typeof resolvers.actors.getAnchorPosition === 'function') {
      return resolvers.actors.getAnchorPosition(anchor.machineId, anchor.name || 'gDomain', out);
    }
    if (Array.isArray(anchor.atoms) && anchor.atoms.length > 0) {
      const atoms = this._resolvePulseAtoms(anchor, resolvers);
      if (!atoms.length) return null;
      let cx = 0, cy = 0, cz = 0;
      for (let i = 0; i < atoms.length; i++) { cx += atoms[i].x; cy += atoms[i].y; cz += atoms[i].z; }
      const inv = 1 / atoms.length;
      return out.set(cx * inv, cy * inv, cz * inv);
    }
    return null;
  }

  /** Snapshot of active FX state from the most recent `update()` call. */
  getState() {
    return this.lastState.map(s => ({ ...s }));
  }

  clear() {
    this.items = [];
    this._hideAll();
  }

  dispose() {
    this.clear();
    for (let i = 0; i < this.gtpPool.length; i++) this.gtpPool[i].remove();
    this.gtpPool.length = 0;
    this.pulseMesh.removeFromParent();
    this.pulseMesh.dispose();
    this.pulseMat.dispose();
    this.sphereGeo.dispose();
    this.group.removeFromParent();
  }
}
