// Annotation layer: DOM labels (base letters, measurement / text annotations, blob names)
// that track 3D points, plus the 3D parts of annotations and the translucent enzyme blobs.
import * as THREE from 'three';
import { BASE_INFO } from '../science/index.js';
import { clamp } from './util.js';

const CSS = `
.hx-overlay{position:absolute;inset:0;pointer-events:none;user-select:none;-webkit-user-select:none;overflow:hidden;
  font-family:ui-sans-serif,system-ui,-apple-system,"SF Pro Text","Segoe UI",Roboto,sans-serif;contain:strict;z-index:1}
.hx-overlay *{pointer-events:none;user-select:none;-webkit-user-select:none}
.hx-base{position:absolute;left:0;top:0;font-weight:800;line-height:1;will-change:transform,opacity;
  text-shadow:0 0 2px #000,0 0 4px #000,0 0 8px rgba(0,0,0,.8);letter-spacing:0}
.hx-tag{position:absolute;left:0;top:0;white-space:nowrap;font-size:12.5px;font-weight:600;color:#eaf6ff;
  padding:3px 8px;border-radius:999px;background:rgba(8,16,30,.72);border:1px solid rgba(140,200,255,.35);
  box-shadow:0 2px 10px rgba(0,0,0,.45);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);will-change:transform,opacity;
  font-variant-numeric:tabular-nums}
.hx-tag.hx-label{border-color:rgba(255,255,255,.28)}
.hx-tag.hx-blob{font-size:13px;letter-spacing:.02em;border-color:rgba(255,255,255,.3)}
@media (max-width:600px){.hx-tag{font-size:12px;padding:3px 7px}}
`;

const blobVertex = /* glsl */`
uniform float uTime;
uniform float uSeed;
varying vec3 vN;
varying vec3 vV;
void main() {
  vec3 p = position;
  float w = 1.0 + 0.035 * sin(uTime * 1.3 + uSeed + p.x * 3.1 + p.y * 2.3) + 0.025 * sin(uTime * 0.9 + uSeed * 2.0 + p.z * 4.0);
  vec4 mv = modelViewMatrix * vec4(p * w, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const blobFragment = /* glsl */`
uniform vec3 uColor;
uniform float uOpacity;
varying vec3 vN;
varying vec3 vV;
void main() {
  float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  float rim = pow(f, 2.4);
  vec3 col = uColor * (0.35 + rim * 2.6);
  float a = uOpacity * (0.22 + rim * 1.25);
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
}`;

export class OverlayLayer {
  constructor(container, parent, project) {
    this.project = project;     // (x,y,z science) -> {x,y,z(view depth),ok}
    this.el = document.createElement('div');
    this.el.className = 'hx-overlay';
    this.el.setAttribute('aria-hidden', 'true');
    if (!document.getElementById('hx-overlay-css')) {
      const st = document.createElement('style'); st.id = 'hx-overlay-css'; st.textContent = CSS; document.head.appendChild(st);
    }
    container.appendChild(this.el);
    this.group = new THREE.Group(); this.group.name = 'overlay3d';
    parent.add(this.group);
    this.baseEls = [];
    this.annots = new Map();
    this.blobs = new Map();
    this.blobGeo = new THREE.SphereGeometry(1, 48, 32);
    this.lineGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, false);
    this.dotGeo = new THREE.SphereGeometry(1, 16, 12);
    this.lineMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.5, 1.0), fog: false });
    this.dotMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.9, 1.7, 1.1), fog: false });
    this.p = { x: 0, y: 0, z: 0, ok: false };
    this.time = 0;
  }

  // ---------- base letters ----------
  setAssembly(asm) {
    for (const e of this.baseEls) e.el.remove();
    this.baseEls = [];
    this.asm = asm;
    this.labelLocal = new Float32Array(asm.nucleotides.length * 3);
    for (const nu of asm.nucleotides) {
      let cx = 0, cy = 0, cz = 0, c = 0;
      for (let i = 0; i < nu.atomCount; i++) if (nu.part[i] === 0) { cx += nu.local[i * 3]; cy += nu.local[i * 3 + 1]; cz += nu.local[i * 3 + 2]; c++; }
      c = c || 1;
      this.labelLocal.set([cx / c, cy / c, cz / c], nu.id * 3);
    }
  }

  ensureBaseEls() {
    if (this.baseEls.length || !this.asm) return;
    const frag = document.createDocumentFragment();
    for (const nu of this.asm.nucleotides) {
      const el = document.createElement('div');
      el.className = 'hx-base';
      el.textContent = nu.base;
      el.style.color = '#' + BASE_INFO[nu.base].color.toString(16).padStart(6, '0');
      el.style.display = 'none';
      frag.appendChild(el);
      this.baseEls.push({ el, shown: false, last: '' });
    }
    this.el.appendChild(frag);
  }

  updateBaseLabels(on, nucScale, nucOff, ctx) {
    if (!on || !this.asm) { for (const b of this.baseEls) if (b.shown) { b.el.style.display = 'none'; b.shown = false; } return; }
    this.ensureBaseEls();
    const asm = this.asm, L = this.labelLocal, p = this.p;
    const n = asm.nucleotides.length;
    // density check at the focus depth: hide everything when bases would overlap
    const pxPerA = ctx.pxPerA;
    const tooDense = pxPerA * 3.38 < 10 || n > 400;
    const size = clamp(pxPerA * 2.3, 10, 19);
    for (const nu of asm.nucleotides) {
      const b = this.baseEls[nu.id], s = nucScale[nu.id];
      let show = !tooDense && s > 0.15;
      if (show) {
        const R = nu.frame.R, o = nu.frame.o, i = nu.id * 3, x = L[i], y = L[i + 1], z = L[i + 2];
        this.project(R[0] * x + R[1] * y + R[2] * z + o[0] + nucOff[i], R[3] * x + R[4] * y + R[5] * z + o[1] + nucOff[i + 1], R[6] * x + R[7] * y + R[8] * z + o[2] + nucOff[i + 2], p);
        show = p.ok;
        if (show) {
          // fade labels on the far side of the helix
          const back = clamp((p.z - ctx.centerDepth) / 8, 0, 1);
          const op = (1 - 0.72 * back) * clamp(s, 0, 1) * (ctx.emph ? (ctx.emph[nu.id] ? 1 : 0.25) : 1);
          b.el.style.transform = `translate3d(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px,0) translate(-50%,-50%)`;
          b.el.style.opacity = op.toFixed(2);
          const fs = size.toFixed(0) + 'px';
          if (b.last !== fs) { b.el.style.fontSize = fs; b.last = fs; }
        }
      }
      if (show !== b.shown) { b.el.style.display = show ? '' : 'none'; b.shown = show; }
    }
  }

  // ---------- annotations ----------
  setAnnotations(list) {
    const keep = new Set();
    for (const a of list || []) {
      const id = a.id ?? JSON.stringify(a);
      keep.add(id);
      let rec = this.annots.get(id);
      if (!rec || rec.kind !== a.kind) {
        if (rec) this.removeAnnot(id);
        rec = this.makeAnnot(a);
        this.annots.set(id, rec);
      }
      this.placeAnnot(rec, a);
    }
    for (const id of [...this.annots.keys()]) if (!keep.has(id)) this.removeAnnot(id);
  }

  makeAnnot(a) {
    const g = new THREE.Group();
    const el = document.createElement('div');
    el.className = 'hx-tag' + (a.kind === 'label' ? ' hx-label' : '');
    this.el.appendChild(el);
    const rec = { kind: a.kind, group: g, el, at: new THREE.Vector3(), text: '' };
    if (a.kind === 'distance') {
      rec.line = new THREE.Mesh(this.lineGeo, this.lineMat);
      rec.t1 = new THREE.Mesh(this.lineGeo, this.lineMat); rec.t2 = new THREE.Mesh(this.lineGeo, this.lineMat);
      rec.d1 = new THREE.Mesh(this.dotGeo, this.dotMat); rec.d2 = new THREE.Mesh(this.dotGeo, this.dotMat);
      g.add(rec.line, rec.t1, rec.t2, rec.d1, rec.d2);
    } else {
      rec.d1 = new THREE.Mesh(this.dotGeo, this.dotMat);
      g.add(rec.d1);
    }
    g.traverse(o => { o.renderOrder = 6; o.frustumCulled = false; });
    this.group.add(g);
    return rec;
  }

  placeAnnot(rec, a) {
    if (rec.text !== (a.label || '')) { rec.text = a.label || ''; rec.el.textContent = rec.text; rec.el.style.display = rec.text ? '' : 'none'; }
    if (a.kind === 'distance') {
      const A = new THREE.Vector3(...a.from), B = new THREE.Vector3(...a.to);
      const d = B.clone().sub(A), L = d.length(), u = d.clone().normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), u);
      rec.line.position.copy(A).add(B).multiplyScalar(0.5);
      rec.line.quaternion.copy(q); rec.line.scale.set(0.055, L, 0.055);
      // end ticks perpendicular to the measured segment
      let perp = new THREE.Vector3(0, 0, 1).cross(u);
      if (perp.lengthSq() < 1e-4) perp = new THREE.Vector3(1, 0, 0).cross(u);
      perp.normalize();
      const qt = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), perp);
      for (const [t, P] of [[rec.t1, A], [rec.t2, B]]) { t.position.copy(P); t.quaternion.copy(qt); t.scale.set(0.05, 1.1, 0.05); }
      rec.d1.position.copy(A); rec.d2.position.copy(B);
      rec.d1.scale.setScalar(0.16); rec.d2.scale.setScalar(0.16);
      rec.at.copy(A).add(B).multiplyScalar(0.5);
      rec.dx = 0; rec.dy = -14;
    } else {
      rec.d1.position.set(...a.at); rec.d1.scale.setScalar(0.32);
      rec.at.set(...a.at);
      rec.dx = 10; rec.dy = -12; rec.anchorLeft = true;
    }
  }

  removeAnnot(id) {
    const rec = this.annots.get(id); if (!rec) return;
    this.group.remove(rec.group); rec.el.remove(); this.annots.delete(id);
  }

  // ---------- blobs ----------
  setBlobs(list) {
    const keep = new Set();
    for (const b of list || []) {
      const id = b.id ?? 'blob';
      keep.add(id);
      let rec = this.blobs.get(id);
      if (!rec) {
        const mat = new THREE.ShaderMaterial({
          uniforms: { uColor: { value: new THREE.Color() }, uOpacity: { value: 0.35 }, uTime: this.timeUniform || (this.timeUniform = { value: 0 }), uSeed: { value: Math.random() * 10 } },
          vertexShader: blobVertex, fragmentShader: blobFragment, transparent: true, depthWrite: false,
        });
        const mesh = new THREE.Mesh(this.blobGeo, mat);
        mesh.renderOrder = 5; mesh.frustumCulled = false;
        this.group.add(mesh);
        const el = document.createElement('div'); el.className = 'hx-tag hx-blob'; this.el.appendChild(el);
        rec = { mesh, mat, el, text: null, at: new THREE.Vector3(), radius: 10 };
        this.blobs.set(id, rec);
      }
      const r = b.radius ?? 12;
      rec.mesh.position.set(...(b.pos || [0, 0, 0]));
      if (b.scale) rec.mesh.scale.set(r * b.scale[0], r * b.scale[1], r * b.scale[2]); else rec.mesh.scale.setScalar(r);
      rec.mat.uniforms.uColor.value.setHex(b.color ?? 0x7c5cff);
      rec.mat.uniforms.uOpacity.value = b.opacity ?? 0.35;
      rec.mesh.visible = b.visible !== false;
      rec.at.copy(rec.mesh.position); rec.radius = r * (b.scale ? Math.max(...b.scale) : 1);
      const text = b.label || '';
      if (text !== rec.text) { rec.text = text; rec.el.textContent = text; }
      rec.el.style.borderColor = '#' + (b.color ?? 0x7c5cff).toString(16).padStart(6, '0') + 'aa';
    }
    for (const [id, rec] of this.blobs) if (!keep.has(id)) {
      this.group.remove(rec.mesh); rec.mat.dispose(); rec.el.remove(); this.blobs.delete(id);
    }
  }

  /** Per-frame: move DOM tags to their projected anchors. */
  updateTags(ctx, t) {
    if (this.timeUniform) this.timeUniform.value = t;
    const p = this.p;
    for (const rec of this.annots.values()) {
      if (!rec.text) continue;
      this.project(rec.at.x, rec.at.y, rec.at.z, p);
      if (!p.ok) { rec.el.style.opacity = '0'; continue; }
      const tx = rec.anchorLeft ? `translate(${rec.dx}px,-50%)` : 'translate(-50%,-100%)';
      rec.el.style.transform = `translate3d(${p.x.toFixed(1)}px,${(p.y + (rec.anchorLeft ? rec.dy : rec.dy + 4)).toFixed(1)}px,0) ${tx}`;
      rec.el.style.opacity = '1';
    }
    for (const rec of this.blobs.values()) {
      if (!rec.text || !rec.mesh.visible) { rec.el.style.display = 'none'; continue; }
      rec.el.style.display = '';
      this.project(rec.at.x, rec.at.y, rec.at.z, p);
      if (!p.ok) { rec.el.style.opacity = '0'; continue; }
      const rpx = rec.radius * ctx.pxPerAAt(p.z);
      rec.el.style.transform = `translate3d(${p.x.toFixed(1)}px,${(p.y - rpx - 8).toFixed(1)}px,0) translate(-50%,-100%)`;
      rec.el.style.opacity = '1';
    }
  }

  clearAll() { this.setAnnotations([]); this.setBlobs([]); }

  dispose() {
    this.clearAll();
    this.el.remove();
    this.blobGeo.dispose(); this.lineGeo.dispose(); this.dotGeo.dispose(); this.lineMat.dispose(); this.dotMat.dispose();
    this.group.removeFromParent();
  }
}
