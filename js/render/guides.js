// Structural guides: translucent major/minor groove ribbons and the glowing helix axis.
import * as THREE from 'three';
import { smoothstep } from './util.js';

const SG = 6; // subdivisions between consecutive base pairs

const grooveVertex = /* glsl */`
#include <common>
#include <fog_pars_vertex>
attribute float aV;
attribute float aF;
varying float vV;
varying float vF;
varying vec3 vN;
varying vec3 vView;
void main() {
  vV = aV; vF = aF;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vView = normalize(-mvPosition.xyz);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const grooveFragment = /* glsl */`
#include <common>
#include <fog_pars_fragment>
uniform vec3 uColor;
uniform float uOpacity;
varying float vV;
varying float vF;
varying vec3 vN;
varying vec3 vView;
void main() {
  float edge = smoothstep(0.86, 0.99, vV);
  float facing = abs(dot(normalize(vN), normalize(vView)));
  float a = uOpacity * vF * (0.18 + 0.55 * pow(vV, 1.6) + 0.15 * (1.0 - facing));
  vec3 col = uColor * (0.75 + 0.6 * vV) + uColor * edge * 2.4;
  a = min(1.0, a + edge * 0.55 * vF);
  #ifdef USE_FOG
    float ff = smoothstep(fogNear, fogFar, vFogDepth);
    a *= 1.0 - ff * 0.85;
  #endif
  gl_FragColor = vec4(col, a);
}`;

const cpt = (A, m, k, a) => (k < 0 ? 2 * A[a] - A[3 + a] : k >= m ? 2 * A[(m - 1) * 3 + a] - A[(m - 2) * 3 + a] : A[k * 3 + a]);
function catmull(A, m, j, a, t) {
  const p0 = cpt(A, m, j - 1, a), p1 = cpt(A, m, j, a), p2 = cpt(A, m, j + 1, a), p3 = cpt(A, m, j + 2, a), t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

class GrooveStrip {
  constructor(nPairs, color, inner, outer) {
    this.inner = inner; this.outer = outer;
    const cap = (nPairs * SG + 2) * 2;
    this.pos = new Float32Array(cap * 3);
    this.nrm = new Float32Array(cap * 3);
    this.v = new Float32Array(cap);
    this.f = new Float32Array(cap);
    this.idx = new Uint32Array(Math.max(1, nPairs * SG) * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aV', new THREE.BufferAttribute(this.v, 1));
    g.setAttribute('aF', new THREE.BufferAttribute(this.f, 1).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(new THREE.BufferAttribute(this.idx, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    for (let i = 0; i < cap; i++) this.v[i] = i & 1;
    this.geometry = g;
    this.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uColor: { value: new THREE.Color(color) }, uOpacity: { value: 0.55 } }]),
      vertexShader: grooveVertex, fragmentShader: grooveFragment, fog: true,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
  }
  dispose() { this.geometry.dispose(); this.material.dispose(); }
}

export class GuideLayer {
  constructor(parent) {
    this.group = new THREE.Group();
    this.group.name = 'guides';
    parent.add(this.group);
    // pre-allocated per-pair scratch (sized on setAssembly)
    this.axisMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 1.1, 1.9), fog: true, toneMapped: true });
    this.axisHaloMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.55, 1.0), transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true);
    this.axis = new THREE.Mesh(cyl, this.axisMat);
    this.axisHalo = new THREE.Mesh(cyl, this.axisHaloMat);
    this.axisHalo.renderOrder = 4;
    this.axis.frustumCulled = this.axisHalo.frustumCulled = false;
    this.axisGroup = new THREE.Group();
    this.axisGroup.add(this.axis, this.axisHalo);
    this.group.add(this.axisGroup);
    this.grooves = [];
  }

  setAxis(a, b) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const d = B.clone().sub(A), L = d.length();
    this.axisGroup.position.copy(A).add(B).multiplyScalar(0.5);
    this.axisGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    this.axis.scale.set(0.11, L, 0.11);
    this.axisHalo.scale.set(0.55, L, 0.55);
  }

  setAssembly(asm) {
    for (const g of this.grooves) { this.group.remove(g.mesh); g.dispose(); }
    this.asm = asm;
    const np = asm.pairs.length;
    this.order = asm.pairs.map(p => p.id).sort((x, y) => {
      const a = asm.nucleotides[asm.pairs[x].a], b = asm.nucleotides[asm.pairs[y].a];
      return a.strand - b.strand || a.index - b.index;
    });
    this.inner = new Float32Array(np * 3); this.outer = new Float32Array(np * 3);
    this.fade = new Float32Array(np);
    // major groove: local +x (cool cyan), minor groove: local -x (warm magenta)
    this.grooves = [new GrooveStrip(np, 0x38c6ff, 3.0, 9.4), new GrooveStrip(np, 0xff5fc8, -3.4, -9.4)];
    for (const g of this.grooves) this.group.add(g.mesh);
  }

  update(nucScale, style) {
    this.axisGroup.visible = !!style.axis;
    const on = !!style.grooves && this.asm;
    for (const g of this.grooves) g.mesh.visible = !!on;
    if (!on) return;
    const asm = this.asm, ord = this.order;
    for (const g of this.grooves) this.updateStrip(g, asm, ord, nucScale);
  }

  updateStrip(G, asm, ord, nucScale) {
    let vtx = 0, ip = 0, run = 0;
    const I = this.inner, O = this.outer, F = this.fade;
    const flush = () => {
      if (run >= 2) {
        const v0 = vtx;
        vtx = this.emit(G, run, vtx);
        for (let v = v0; v < vtx - 2; v += 2) {
          G.idx[ip++] = v; G.idx[ip++] = v + 1; G.idx[ip++] = v + 2;
          G.idx[ip++] = v + 1; G.idx[ip++] = v + 3; G.idx[ip++] = v + 2;
        }
      }
      run = 0;
    };
    let prevA = null;
    for (let k = 0; k < ord.length; k++) {
      const p = asm.pairs[ord[k]], na = asm.nucleotides[p.a], nb = asm.nucleotides[p.b];
      const sc = Math.min(nucScale[p.a], nucScale[p.b]);
      const ok = p.strength > 0.5 && sc > 0.001;
      const adj = prevA && prevA.strand === na.strand && Math.abs(prevA.index - na.index) === 1;
      if (!ok || !adj) flush();
      if (!ok) { prevA = null; continue; }
      const Ra = na.frame.R, Rb = nb.frame.R, oa = na.frame.o, ob = nb.frame.o;
      let xx = Ra[0] + Rb[0], xy = Ra[3] + Rb[3], xz = Ra[6] + Rb[6];
      const xl = Math.hypot(xx, xy, xz) || 1; xx /= xl; xy /= xl; xz /= xl;
      const ox = (oa[0] + ob[0]) / 2, oy = (oa[1] + ob[1]) / 2, oz = (oa[2] + ob[2]) / 2;
      I[run * 3] = ox + xx * G.inner; I[run * 3 + 1] = oy + xy * G.inner; I[run * 3 + 2] = oz + xz * G.inner;
      O[run * 3] = ox + xx * G.outer; O[run * 3 + 1] = oy + xy * G.outer; O[run * 3 + 2] = oz + xz * G.outer;
      F[run] = smoothstep(0.5, 0.85, p.strength) * sc;
      run++; prevA = na;
    }
    flush();
    G.geometry.setDrawRange(0, ip);
    G.geometry.index.needsUpdate = true;
    const a = G.geometry.attributes;
    a.position.needsUpdate = a.normal.needsUpdate = a.aF.needsUpdate = true;
  }

  /** Catmull-Rom through inner / outer points of a run; writes vertex pairs. */
  emit(G, m, vtx) {
    const I = this.inner, O = this.outer, F = this.fade, P = G.pos, N = G.nrm;
    for (let j = 0; j < m - 1; j++) {
      const last = j === m - 2;
      for (let q = 0; q <= (last ? SG : SG - 1); q++) {
        const t = q / SG;
        for (let a = 0; a < 3; a++) { P[vtx * 3 + a] = catmull(I, m, j, a, t); P[vtx * 3 + 3 + a] = catmull(O, m, j, a, t); }
        const f = F[j] + (F[j + 1] - F[j]) * t;
        G.f[vtx] = f; G.f[vtx + 1] = f;
        vtx += 2;
      }
    }
    // normals: cross(radial, along)
    for (let v = 0; v < vtx; v += 2) {
      const n = v + 2 < vtx ? v + 2 : v - 2;
      const s = v + 2 < vtx ? 1 : -1;
      const rx = P[v * 3 + 3] - P[v * 3], ry = P[v * 3 + 4] - P[v * 3 + 1], rz = P[v * 3 + 5] - P[v * 3 + 2];
      const ax = (P[n * 3] - P[v * 3]) * s, ay = (P[n * 3 + 1] - P[v * 3 + 1]) * s, az = (P[n * 3 + 2] - P[v * 3 + 2]) * s;
      let nx = ry * az - rz * ay, ny = rz * ax - rx * az, nz = rx * ay - ry * ax;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      N[v * 3] = N[v * 3 + 3] = nx; N[v * 3 + 1] = N[v * 3 + 4] = ny; N[v * 3 + 2] = N[v * 3 + 5] = nz;
    }
    return vtx;
  }

  dispose() {
    for (const g of this.grooves) g.dispose();
    this.axis.geometry.dispose(); this.axisMat.dispose(); this.axisHaloMat.dispose();
    this.group.removeFromParent();
  }
}
