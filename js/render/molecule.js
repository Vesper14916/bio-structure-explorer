// Atomic representations: ball-and-stick / space-filling atoms, covalent bonds, glowing
// hydrogen-bond beads and crystal waters. All instance buffers are updated in place.
import * as THREE from 'three';
import { ELEMENTS, ELEMENT_INFO } from '../science/index.js';
import { writeSphere, writeCylinder, writeHidden, smoothstep, sphereGeometry, cylinderGeometry } from './util.js';

const BEADS = 7;
const VDW = ELEMENTS.map(e => ELEMENT_INFO[e].vdw);
export const BALL_SCALE = 0.3, BOND_RADIUS = 0.17;

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
    this.waterMat = new THREE.MeshStandardMaterial({
      color: 0xff7a6e, roughness: 0.15, metalness: 0, transparent: true, opacity: 0.38, depthWrite: false, envMapIntensity: 1.2,
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
  }

  setTier(tier) {
    if (tier === this.tier) return;
    this.tier = tier;
    const s = sphereGeometry(tier), c = cylinderGeometry(tier);
    if (this.atoms) this.atoms.geometry = s;
    if (this.bonds) this.bonds.geometry = c;
    if (this.waters) this.waters.geometry = s;
    this.sphereGeo.dispose(); this.cylGeo.dispose();
    this.sphereGeo = s; this.cylGeo = c;
  }

  clear() {
    for (const m of [this.atoms, this.bonds, this.beads, this.waters]) {
      if (!m) continue;
      this.group.remove(m);
      if (m === this.beads) m.geometry.dispose();
      m.dispose();
    }
    this.atoms = this.bonds = this.beads = this.waters = null;
  }

  setAssembly(asm) {
    this.clear();
    this.asm = asm;
    const N = asm.atoms.count, nb = asm.bonds.length / 2, nl = asm.links.length;
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
  }

  /**
   * Rewrite instance matrices from display positions.
   * pos: Float32Array 3N; nucScale: Float32Array per nucleotide (0 hidden .. 1)
   */
  update(pos, nucScale, style, highlightActive) {
    const asm = this.asm; if (!asm) return;
    const A = asm.atoms, N = A.count, rep = style.representation;
    const atomsOn = rep !== 'cartoon', bondsOn = rep === 'ballstick';
    this.atoms.visible = atomsOn;
    this.bonds.visible = bondsOn;
    if (atomsOn) {
      const m = this.atoms.instanceMatrix.array, f = rep === 'spacefill' ? 1 : BALL_SCALE;
      for (let g = 0; g < N; g++) {
        const s = nucScale[A.nuc[g]];
        if (s <= 0.001) writeHidden(m, g);
        else writeSphere(m, g, pos[g * 3], pos[g * 3 + 1], pos[g * 3 + 2], VDW[A.el[g]] * f * s);
      }
      this.atoms.instanceMatrix.needsUpdate = true;
    }
    if (bondsOn) {
      const m = this.bonds.instanceMatrix.array, B = asm.bonds, nb = B.length / 2;
      for (let i = 0; i < nb; i++) {
        const a = B[2 * i], b = B[2 * i + 1], s = Math.min(nucScale[A.nuc[a]], nucScale[A.nuc[b]]);
        this.halfBond(m, i, pos, a, b, s);
      }
      for (let l = 0; l < asm.links.length; l++) {
        const L = asm.links[l];
        const s = L.active && L.a >= 0 && L.b >= 0 ? Math.min(nucScale[L.from], nucScale[L.to]) : 0;
        this.halfBond(m, nb + l, pos, L.a, L.b, s);
      }
      this.bonds.instanceMatrix.needsUpdate = true;
    }
    // Hydrogen bonds
    this.beads.visible = !!style.hbonds && this.nHb > 0;
    if (this.beads.visible) {
      const m = this.beads.instanceMatrix.array, I = this.beads.geometry.attributes.aI.array, H = this.hbFlat;
      for (let h = 0; h < this.nHb; h++) {
        const p = asm.pairs[H[h * 3]], a = H[h * 3 + 1], b = H[h * 3 + 2];
        let inten = 0;
        if (a >= 0 && b >= 0 && p.strength > 0.01) {
          const dx = pos[b * 3] - pos[a * 3], dy = pos[b * 3 + 1] - pos[a * 3 + 1], dz = pos[b * 3 + 2] - pos[a * 3 + 2];
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          inten = p.strength * (1 - smoothstep(3.3, 4.5, d)) * Math.min(nucScale[p.a], nucScale[p.b]);
          if (highlightActive && this.pairEmph && !this.pairEmph[p.id]) inten *= 0.18;
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
        for (let i = 0; i < w.count; i++) writeSphere(m, i, w.pos[i * 3], w.pos[i * 3 + 1], w.pos[i * 3 + 2], rep === 'spacefill' ? 1.2 : 0.62);
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
    this.atomMat.dispose(); this.bondMat.dispose(); this.waterMat.dispose(); this.beadMat.dispose();
    this.sphereGeo.dispose(); this.cylGeo.dispose();
    this.group.removeFromParent();
  }
}
