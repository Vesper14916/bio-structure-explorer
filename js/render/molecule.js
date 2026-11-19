// Atomic representations: ball-and-stick / space-filling atoms, covalent bonds, glowing
// hydrogen-bond beads and crystal waters. All instance buffers are updated in place.
import * as THREE from 'three';
import { ELEMENTS, ELEMENT_INFO } from '../science/index.js';
import { dimOrBoost, EXPRESSION_HEX } from './colors.js';
import { writeSphere, writeCylinder, writeHidden, smoothstep, clamp, sphereGeometry, cylinderGeometry } from './util.js';

const BEADS = 7;
const VDW = ELEMENTS.map(e => ELEMENT_INFO[e].vdw);
export const BALL_SCALE = 0.3, BOND_RADIUS = 0.17, PEPTIDE_BOND_RADIUS = 0.42;
export const DETAIL_FADE_BAND = 12;

/**
 * Detail-sphere weight for a reference point at offset (dx, dy, dz) from focus center.
 * Returns 1 inside `radius`, smoothly fades to 0 across `[radius, radius + 12]` angstroms,
 * and returns 0 everywhere when `radius <= 0` (cartoon only).
 */
export function computeDetailWeight(dx, dy, dz, radius) {
  if (!(radius > 0)) return 0;
  const d = Math.hypot(dx, dy, dz);
  if (d <= radius) return 1;
  if (d >= radius + DETAIL_FADE_BAND) return 0;
  return 1 - smoothstep(radius, radius + DETAIL_FADE_BAND, d);
}

const beadVertex = /* glsl */`
#include <common>
#include <fog_pars_vertex>
attribute float aI;
attribute float aT;
uniform float uTime;
uniform float uPulse;
varying float vI;
varying vec3 vN;
varying vec3 vV;
void main() {
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * mat3(instanceMatrix) * normal);
  vV = normalize(-mvPosition.xyz);
  float w = 0.5 + 0.5 * sin(uTime * 2.4 - aT * 11.0);
  vI = aI * (1.0 + uPulse * (1.4 * pow(w, 6.0) - 0.25));
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const beadFragment = /* glsl */`
#include <common>
#include <fog_pars_fragment>
uniform vec3 uColor;
varying float vI;
varying vec3 vN;
varying vec3 vV;
void main() {
  float f = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);
  vec3 col = uColor * vI * (0.35 + 0.85 * f);
  #ifdef USE_FOG
    col *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
  #endif
  gl_FragColor = vec4(col, 1.0);
}`;

export class MoleculeLayer {
  constructor(parent, tier) {
    this.group = new THREE.Group();
    this.group.name = 'molecule';
    parent.add(this.group);
    this.tier = tier;
    this.atomMat = new THREE.MeshStandardMaterial({ roughness: 0.32, metalness: 0.06, envMapIntensity: 1.0 });
    this.bondMat = new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0.05, envMapIntensity: 0.9 });
    this.residueMat = new THREE.MeshStandardMaterial({ roughness: 0.24, metalness: 0.12, envMapIntensity: 1.15 });
    this.waterMat = new THREE.MeshStandardMaterial({
      color: 0x8fd8ff, roughness: 0.2, metalness: 0, transparent: true, opacity: 0.26, depthWrite: false, envMapIntensity: 0.8,
    });
    this.beadMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uColor: { value: new THREE.Color(0.55, 1.9, 3.2) }, uTime: { value: 0 }, uPulse: { value: 1 },
      }]),
      vertexShader: beadVertex, fragmentShader: beadFragment, fog: true,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.sphereGeo = sphereGeometry(tier);
    this.cylGeo = cylinderGeometry(tier);
    this.asm = null;
    this.detailFocus = null;
    this.c1Atom = null;
    this.detailWeight = null;
    this._tmpColor = new THREE.Color();
  }

  setDetailFocus(focus) {
    if (!focus || !focus.center) {
      this.detailFocus = null;
      return;
    }
    const c = focus.center;
    this.detailFocus = {
      center: [c[0] ?? c.x ?? 0, c[1] ?? c.y ?? 0, c[2] ?? c.z ?? 0],
      radius: Math.max(0, Number(focus.radius) || 0),
    };
  }

  setTier(tier) {
    if (tier === this.tier) return;
    this.tier = tier;
    const s = sphereGeometry(tier), c = cylinderGeometry(tier);
    if (this.atoms) this.atoms.geometry = s;
    if (this.bonds) this.bonds.geometry = c;
    if (this.waters) this.waters.geometry = s;
    if (this.residuesMesh) this.residuesMesh.geometry = s;
    if (this.peptideBonds) this.peptideBonds.geometry = c;
    this.sphereGeo.dispose(); this.cylGeo.dispose();
    this.sphereGeo = s; this.cylGeo = c;
  }

  clear() {
    for (const m of [this.atoms, this.bonds, this.beads, this.waters, this.residuesMesh, this.peptideBonds]) {
      if (!m) continue;
      this.group.remove(m);
      if (m === this.beads) m.geometry.dispose();
      m.dispose();
    }
    this.atoms = this.bonds = this.beads = this.waters = this.residuesMesh = this.peptideBonds = null;
    this.c1Atom = this.detailWeight = null;
  }

  setAssembly(asm) {
    this.clear();
    this.asm = asm;
    const N = asm.atoms.count, nb = asm.bonds.length / 2, nl = asm.links.length;
    const nNuc = asm.nucleotides.length;
    this.c1Atom = new Int32Array(nNuc);
    this.detailWeight = new Float32Array(nNuc);
    for (const nu of asm.nucleotides) this.c1Atom[nu.id] = asm.atomOf(nu.id, "C1'");
    const mk = (geo, mat, count) => {
      const m = new THREE.InstancedMesh(geo, mat, Math.max(1, count));
      m.count = count;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      this.group.add(m);
      return m;
    };
    this.atoms = mk(this.sphereGeo, this.atomMat, N);
    this.atoms.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, N) * 3), 3);
    this.nBondInst = 2 * (nb + nl);
    this.bonds = mk(this.cylGeo, this.bondMat, this.nBondInst);
    this.bonds.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, this.nBondInst) * 3), 3);

    // Hydrogen-bond beads
    let nh = 0; for (const p of asm.pairs) nh += p.hbonds.length;
    this.nHb = nh;
    const bg = new THREE.IcosahedronGeometry(1, 1);
    const aI = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, nh * BEADS)), 1);
    const aT = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, nh * BEADS)), 1);
    aI.setUsage(THREE.DynamicDrawUsage);
    for (let h = 0; h < nh; h++) for (let j = 0; j < BEADS; j++) aT.array[h * BEADS + j] = (j + 0.5) / BEADS;
    bg.setAttribute('aI', aI); bg.setAttribute('aT', aT);
    this.beads = mk(bg, this.beadMat, nh * BEADS);
    this.beads.renderOrder = 2;
    this.hbFlat = new Int32Array(nh * 3);  // pairId, atom a, atom b
    let k = 0;
    for (const p of asm.pairs) for (const h of p.hbonds) { this.hbFlat[k++] = p.id; this.hbFlat[k++] = h.a; this.hbFlat[k++] = h.b; }

    if (asm.waters && asm.waters.count) {
      this.waters = mk(this.sphereGeo, this.waterMat, asm.waters.count);
      this.waters.renderOrder = 1;
    }

    if (asm.residues && asm.residues.length > 0) {
      const nr = asm.residues.length;
      this.residuesMesh = mk(this.sphereGeo, this.residueMat, nr);
      this.residuesMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, nr) * 3), 3);
      this.peptideBonds = mk(this.cylGeo, this.residueMat, nr);
      this.peptideBonds.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, nr) * 3), 3);
    }
  }

  recolor(colors) {
    const asm = this.asm; if (!asm) return;
    const ac = this.atoms.instanceColor.array, src = colors.atom;
    ac.set(src);
    this.atoms.instanceColor.needsUpdate = true;
    const bc = this.bonds.instanceColor.array, B = asm.bonds, nb = B.length / 2;
    const cp = (dst, i, g) => { dst[i * 3] = src[g * 3]; dst[i * 3 + 1] = src[g * 3 + 1]; dst[i * 3 + 2] = src[g * 3 + 2]; };
    for (let i = 0; i < nb; i++) { cp(bc, 2 * i, B[2 * i]); cp(bc, 2 * i + 1, B[2 * i + 1]); }
    for (let l = 0; l < asm.links.length; l++) { const L = asm.links[l]; cp(bc, 2 * (nb + l), L.a); cp(bc, 2 * (nb + l) + 1, L.b); }
    this.bonds.instanceColor.needsUpdate = true;
    this.pairEmph = colors.pairEmph;
    this.resEmph = colors.resEmph;
    this.recolorResidues(colors.highlightActive);
  }

  recolorResidues(highlightActive) {
    const asm = this.asm;
    if (!asm || !this.residuesMesh || !asm.residues || !asm.residues.length) return;
    const R = asm.residues, nr = R.length;
    const rc = this.residuesMesh.instanceColor.array, pc = this.peptideBonds.instanceColor.array;
    const c = this._tmpColor;
    for (let i = 0; i < nr; i++) {
      c.setHex(R[i].color ?? EXPRESSION_HEX.peptide);
      rc[i * 3] = c.r; rc[i * 3 + 1] = c.g; rc[i * 3 + 2] = c.b;
      if (highlightActive && this.resEmph && i < this.resEmph.length) dimOrBoost(rc, i, this.resEmph[i]);
    }
    for (let i = 0; i < nr; i++) {
      if (i === 0) {
        pc[0] = rc[0]; pc[1] = rc[1]; pc[2] = rc[2];
      } else {
        pc[i * 3] = (rc[(i - 1) * 3] + rc[i * 3]) * 0.5;
        pc[i * 3 + 1] = (rc[(i - 1) * 3 + 1] + rc[i * 3 + 1]) * 0.5;
        pc[i * 3 + 2] = (rc[(i - 1) * 3 + 2] + rc[i * 3 + 2]) * 0.5;
      }
    }
    this.residuesMesh.instanceColor.needsUpdate = true;
    this.peptideBonds.instanceColor.needsUpdate = true;
  }

  /**
   * Rewrite instance matrices from display positions.
   * pos: Float32Array 3N; nucScale: Float32Array per nucleotide (0 hidden .. 1)
   */
  update(pos, nucScale, style, highlightActive) {
    const asm = this.asm; if (!asm) return;
    const A = asm.atoms, N = A.count, rep = style.representation;
    const df = this.detailFocus;
    const hasDetail = df !== null;
    let dw = null;
    if (hasDetail) {
      dw = this.detailWeight;
      const cx = df.center[0], cy = df.center[1], cz = df.center[2], rad = df.radius;
      if (!(rad > 0)) {
        dw.fill(0);
      } else {
        for (const nu of asm.nucleotides) {
          const id = nu.id, c1 = this.c1Atom[id];
          let rx, ry, rz;
          if (c1 >= 0) {
            rx = pos[c1 * 3]; ry = pos[c1 * 3 + 1]; rz = pos[c1 * 3 + 2];
          } else if (nu.frame && nu.frame.o) {
            rx = nu.frame.o[0]; ry = nu.frame.o[1]; rz = nu.frame.o[2];
          } else if (nu.atomCount > 0) {
            const a0 = nu.atomStart * 3;
            rx = pos[a0]; ry = pos[a0 + 1]; rz = pos[a0 + 2];
          } else {
            dw[id] = 0; continue;
          }
          dw[id] = computeDetailWeight(rx - cx, ry - cy, rz - cz, rad);
        }
      }
    }
    const atomsOn = hasDetail ? df.radius > 0 : rep !== 'cartoon';
    const bondsOn = hasDetail ? (df.radius > 0 && rep !== 'spacefill') : rep === 'ballstick';
    this.atoms.visible = atomsOn;
    this.bonds.visible = bondsOn;
    if (atomsOn) {
      const m = this.atoms.instanceMatrix.array, f = rep === 'spacefill' ? 1 : BALL_SCALE;
      for (let g = 0; g < N; g++) {
        const nid = A.nuc[g];
        const s = hasDetail ? nucScale[nid] * dw[nid] : nucScale[nid];
        if (s <= 0.001) writeHidden(m, g);
        else writeSphere(m, g, pos[g * 3], pos[g * 3 + 1], pos[g * 3 + 2], VDW[A.el[g]] * f * s);
      }
      this.atoms.instanceMatrix.needsUpdate = true;
    }
    if (bondsOn) {
      const m = this.bonds.instanceMatrix.array, B = asm.bonds, nb = B.length / 2;
      for (let i = 0; i < nb; i++) {
        const a = B[2 * i], b = B[2 * i + 1];
        const na = A.nuc[a], nbN = A.nuc[b];
        const sa = hasDetail ? nucScale[na] * dw[na] : nucScale[na];
        const sb = hasDetail ? nucScale[nbN] * dw[nbN] : nucScale[nbN];
        this.halfBond(m, i, pos, a, b, Math.min(sa, sb));
      }
      for (let l = 0; l < asm.links.length; l++) {
        const L = asm.links[l];
        let s = 0;
        if (L.active && L.a >= 0 && L.b >= 0) {
          const sf = hasDetail ? nucScale[L.from] * dw[L.from] : nucScale[L.from];
          const st = hasDetail ? nucScale[L.to] * dw[L.to] : nucScale[L.to];
          s = Math.min(sf, st);
        }
        this.halfBond(m, nb + l, pos, L.a, L.b, s);
      }
      this.bonds.instanceMatrix.needsUpdate = true;
    }
    // Nascent polypeptide chain (always visible across ballstick, spacefill, and cartoon)
    if (this.residuesMesh && asm.residues && asm.residues.length > 0) {
      this.residuesMesh.visible = true;
      this.peptideBonds.visible = true;
      const R = asm.residues, nr = R.length;
      const rm = this.residuesMesh.instanceMatrix.array, pm = this.peptideBonds.instanceMatrix.array;
      writeHidden(pm, 0);
      for (let i = 0; i < nr; i++) {
        const res = R[i];
        const op = !res || !res.visible ? 0 : clamp(res.opacity ?? 1, 0, 1);
        if (op <= 0.001 || !res.pos) {
          writeHidden(rm, i);
          if (i > 0) writeHidden(pm, i);
          continue;
        }
        const r = (res.radius || 1.85) * op;
        writeSphere(rm, i, res.pos[0], res.pos[1], res.pos[2], r);
        if (i > 0) {
          const prev = R[i - 1];
          const prevOp = !prev || !prev.visible ? 0 : clamp(prev.opacity ?? 1, 0, 1);
          if (res.peptideBondActive && res.visible && prev && prev.visible && prevOp > 0.001 && prev.pos) {
            const bs = Math.min(op, prevOp);
            writeCylinder(pm, i, prev.pos[0], prev.pos[1], prev.pos[2], res.pos[0], res.pos[1], res.pos[2], PEPTIDE_BOND_RADIUS * bs);
          } else {
            writeHidden(pm, i);
          }
        }
      }
      this.residuesMesh.instanceMatrix.needsUpdate = true;
      this.peptideBonds.instanceMatrix.needsUpdate = true;
      this.recolorResidues(highlightActive);
    }
    // Hydrogen bonds
    this.beads.visible = !!style.hbonds && this.nHb > 0 && (!hasDetail || df.radius > 0);
    if (this.beads.visible) {
      const m = this.beads.instanceMatrix.array, I = this.beads.geometry.attributes.aI.array, H = this.hbFlat;
      for (let h = 0; h < this.nHb; h++) {
        const p = asm.pairs[H[h * 3]], a = H[h * 3 + 1], b = H[h * 3 + 2];
        let inten = 0;
        if (a >= 0 && b >= 0 && p.strength > 0.01) {
          const hw = hasDetail ? Math.max(dw[p.a], dw[p.b]) : 1;
          if (!hasDetail || hw > 0.05) {
            const dx = pos[b * 3] - pos[a * 3], dy = pos[b * 3 + 1] - pos[a * 3 + 1], dz = pos[b * 3 + 2] - pos[a * 3 + 2];
            const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
            inten = p.strength * (1 - smoothstep(3.3, 4.5, d)) * Math.min(nucScale[p.a], nucScale[p.b]) * hw;
            if (highlightActive && this.pairEmph && !this.pairEmph[p.id]) inten *= 0.18;
          }
        }
        for (let j = 0; j < BEADS; j++) {
          const slot = h * BEADS + j;
          if (inten < 0.02) { writeHidden(m, slot); I[slot] = 0; continue; }
          const t = 0.16 + 0.68 * (j + 0.5) / BEADS;
          const x = pos[a * 3] + (pos[b * 3] - pos[a * 3]) * t;
          const y = pos[a * 3 + 1] + (pos[b * 3 + 1] - pos[a * 3 + 1]) * t;
          const z = pos[a * 3 + 2] + (pos[b * 3 + 2] - pos[a * 3 + 2]) * t;
          writeSphere(m, slot, x, y, z, (rep === 'spacefill' ? 0.16 : 0.11) * (0.55 + 0.45 * Math.sqrt(inten)));
          I[slot] = inten;
        }
      }
      this.beads.instanceMatrix.needsUpdate = true;
      this.beads.geometry.attributes.aI.needsUpdate = true;
    }
    if (this.waters) {
      this.waters.visible = !!style.waters;
      if (this.waters.visible && !this._waterDone) {
        const w = asm.waters, m = this.waters.instanceMatrix.array;
        for (let i = 0; i < w.count; i++) writeSphere(m, i, w.pos[i * 3], w.pos[i * 3 + 1], w.pos[i * 3 + 2], rep === 'spacefill' ? 1.1 : 0.4);
        this.waters.instanceMatrix.needsUpdate = true;
        this._waterDone = rep;
      }
      if (this._waterDone && this._waterDone !== rep) this._waterDone = false;
    }
  }

  halfBond(m, i, pos, a, b, s) {
    if (s <= 0.001 || a < 0 || b < 0) { writeHidden(m, 2 * i); writeHidden(m, 2 * i + 1); return; }
    const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
    const bx = pos[b * 3], by = pos[b * 3 + 1], bz = pos[b * 3 + 2];
    const mx = (ax + bx) * 0.5, my = (ay + by) * 0.5, mz = (az + bz) * 0.5, r = BOND_RADIUS * s;
    writeCylinder(m, 2 * i, ax, ay, az, mx, my, mz, r);
    writeCylinder(m, 2 * i + 1, mx, my, mz, bx, by, bz, r);
  }

  setTime(t, pulse) { this.beadMat.uniforms.uTime.value = t; this.beadMat.uniforms.uPulse.value = pulse; }

  dispose() {
    this.clear();
    this.atomMat.dispose(); this.bondMat.dispose(); this.residueMat.dispose(); this.waterMat.dispose(); this.beadMat.dispose();
    this.sphereGeo.dispose(); this.cylGeo.dispose();
    this.group.removeFromParent();
  }
}
