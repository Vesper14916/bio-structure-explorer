// Helix viewer: three.js scene driven by a science-layer Assembly.
// Public API: see CONTRACT.md ("Viewer API") plus setViewInsets / setQuality / resize / off.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ELEMENTS, ELEMENT_INFO } from '../science/index.js';
import { ColorModel } from './colors.js';
import { MoleculeLayer, BALL_SCALE } from './molecule.js';
import { CartoonLayer } from './cartoon.js';
import { GuideLayer } from './guides.js';
import { OverlayLayer } from './overlay.js';
import { buildEnvironment, buildBackground, buildLightRig, Particles, Post, FOG_COLOR } from './stage.js';
import { clamp, easeInOutCubic, disposeTree } from './util.js';

const TIERS = {
  low: { dpr: 1, particles: 140 },
  medium: { dpr: 1.5, particles: 380 },
  high: { dpr: 2, particles: 800 },
};
const TIER_ORDER = ['low', 'medium', 'high'];
const DEFAULT_STYLE = {
  representation: 'ballstick', color: 'element', hbonds: true, waters: false, axis: false, grooves: false,
  labels: false, autoRotate: true, jitter: 0, effects: 'auto',
};
const VDW = ELEMENTS.map(e => ELEMENT_INFO[e].vdw);
const FOV = 32;

function detectTier() {
  const ua = navigator.userAgent || '';
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const mobile = /iPhone|iPad|iPod|Android|Mobile/i.test(ua) || (coarse && Math.min(screen.width, screen.height) < 900);
  if (mobile) return (navigator.hardwareConcurrency || 4) <= 2 ? 'low' : 'medium';
  return 'high';
}

export function createViewer(container, opts = {}) {
  return new Viewer(container, opts).api;
}

class Viewer {
  constructor(container, opts) {
    this.container = container;
    this.opts = opts;
    this.listeners = { pick: new Set(), frame: new Set() };
    this.style = { ...DEFAULT_STYLE };
    this.highlight = null;
    this.insets = { top: 0, right: 0, bottom: 0, left: 0, ...(opts.insets || {}) };
    this.qualityMode = opts.quality || 'auto';
    this.tier = this.qualityMode === 'auto' ? detectTier() : (TIERS[this.qualityMode] ? this.qualityMode : 'high');
    this.reducedMotionMQ = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    this.reducedMotion = !!(this.reducedMotionMQ && this.reducedMotionMQ.matches);
    this.disposed = false;
    this.t = 0;
    this.fpsEma = 60; this.ftEma = 16.7; this.slowSince = 0; this.lastTierChange = performance.now();
    this.dirty = true;
    this.tmpV = new THREE.Vector3(); this.tmpV2 = new THREE.Vector3(); this.tmpM = new THREE.Matrix4();
    this.ray = new THREE.Ray(); this.raycaster = new THREE.Raycaster(); this.ndc = new THREE.Vector2();
    this.fit = { cy: 0, h: 40, r: 12 };
    this.autoFramed = true;
    this.resumeAt = 0; this.interacting = false;
    this.anim = null;

    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    const canvas = this.canvas = document.createElement('canvas');
    canvas.className = 'hx-canvas';
    Object.assign(canvas.style, { display: 'block', width: '100%', height: '100%', touchAction: 'none', outline: 'none', WebkitTapHighlightColor: 'transparent', userSelect: 'none', WebkitUserSelect: 'none' });
    canvas.setAttribute('aria-label', 'Interactive 3D DNA structure');
    canvas.setAttribute('role', 'img');
    container.appendChild(canvas);

    this.initGL();
    this.bindEvents();
    this.api = this.makeApi();
    this.resize();
    this.raf = requestAnimationFrame(this.tick);
  }

  // ------------------------------------------------------------ setup
  initGL() {
    const r = this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance' });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.setPixelRatio(this.pixelRatio());

    const scene = this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 5000);
    this.camera.position.set(0, 8, 90);
    scene.add(this.camera);
    buildLightRig(this.camera);
    this.root = new THREE.Group(); this.root.name = 'science-root';
    scene.add(this.root);
    this.envRT = buildEnvironment(r);
    scene.environment = this.envRT.texture;
    this.bgTex = buildBackground();
    scene.background = this.bgTex;
    scene.fog = new THREE.Fog(FOG_COLOR, 60, 300);

    this.particles = new Particles(TIERS.high.particles);
    scene.add(this.particles.points);
    this.molecule = new MoleculeLayer(this.root, this.tier);
    this.cartoon = new CartoonLayer(this.root, this.tier);
    this.guides = new GuideLayer(this.root);
    this.overlay = new OverlayLayer(this.container, this.root, (x, y, z, out) => this.project(x, y, z, out));
    this.post = new Post(r, scene, this.camera, this.tier);

    const c = this.controls = new OrbitControls(this.camera, this.canvas);
    c.enableDamping = true; c.dampingFactor = 0.075;
    c.rotateSpeed = 0.65; c.zoomSpeed = 0.9; c.panSpeed = 0.8;
    c.screenSpacePanning = true;
    c.minDistance = 6; c.maxDistance = 600;
    c.autoRotateSpeed = 0.7;
    c.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    this.applyTierSettings();
  }

  pixelRatio() { return Math.min(window.devicePixelRatio || 1, TIERS[this.tier].dpr); }

  applyTierSettings() {
    const effectsOn = this.style.effects !== 'off';
    this.particles.setCount(TIERS[this.tier].particles);
    this.particles.points.visible = effectsOn;
    this.post.bloom.enabled = effectsOn && this.tier !== 'low';
    this.post.finish.uniforms.uVignette.value = effectsOn ? 0.55 : 0;
    this.scene.background = effectsOn ? this.bgTex : new THREE.Color(0x070d18);
  }

  setTier(tier) {
    if (!TIERS[tier] || tier === this.tier) return;
    this.tier = tier;
    this.lastTierChange = performance.now();
    this.renderer.setPixelRatio(this.pixelRatio());
    this.post.rebuild(tier);
    this.molecule.setTier(tier);
    this.cartoon.setTier(tier);
    this.applyTierSettings();
    this.resize();
    this.dirty = true;
  }

  bindEvents() {
    const cv = this.canvas;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.container);
    this.onVisibility = () => {
      if (document.hidden) { cancelAnimationFrame(this.raf); this.raf = 0; }
      else if (!this.raf && !this.lost && !this.disposed) { this.last = 0; this.raf = requestAnimationFrame(this.tick); }
    };
    document.addEventListener('visibilitychange', this.onVisibility);
    this.onLost = e => {
      e.preventDefault(); this.lost = true; cancelAnimationFrame(this.raf); this.raf = 0;
      // Release GPU-side handles now (calls on a lost context are silent no-ops); three.js
      // re-uploads every CPU-side buffer/texture on the first render after restoration.
      this.scene.traverse(o => {
        if (o.isInstancedMesh) o.dispatchEvent({ type: 'dispose' });
        if (o.geometry) o.geometry.dispose();
        const m = o.material;
        if (m) (Array.isArray(m) ? m : [m]).forEach(mm => mm.dispose());
      });
      this.bgTex.dispose();
      this.post.dispose();
      this.envRT.dispose();
    };
    this.onRestored = () => {
      this.lost = false;
      this.envRT = buildEnvironment(this.renderer);
      this.scene.environment = this.envRT.texture;
      this.post.build(this.tier);
      this.applyTierSettings();
      this.resize();
      this.recolor();
      this.dirty = true;
      if (!this.raf) { this.last = 0; this.raf = requestAnimationFrame(this.tick); }
    };
    cv.addEventListener('webglcontextlost', this.onLost, false);
    cv.addEventListener('webglcontextrestored', this.onRestored, false);
    this.onMotionPref = () => { this.reducedMotion = this.reducedMotionMQ.matches; };
    if (this.reducedMotionMQ) this.reducedMotionMQ.addEventListener?.('change', this.onMotionPref);

    this.controls.addEventListener('start', this.onCtlStart = () => {
      this.interacting = true; this.controls.autoRotate = false; this.anim = null; this.autoFramed = false;
    });
    this.controls.addEventListener('end', this.onCtlEnd = () => {
      this.interacting = false; this.resumeAt = performance.now() + 3000;
    });

    // tap / click picking (no drag, short press, single pointer)
    this.pointers = new Set();
    this.press = null;
    this.onDown = e => {
      this.pointers.add(e.pointerId);
      if (this.pointers.size === 1) this.press = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), cancel: false };
      else if (this.press) this.press.cancel = true;
    };
    this.onMove = e => {
      const p = this.press;
      if (p && p.id === e.pointerId && Math.hypot(e.clientX - p.x, e.clientY - p.y) >= 6) p.cancel = true;
    };
    this.onUp = e => {
      this.pointers.delete(e.pointerId);
      const p = this.press;
      if (!p || p.id !== e.pointerId) return;
      this.press = null;
      if (p.cancel || performance.now() - p.t > 400 || Math.hypot(e.clientX - p.x, e.clientY - p.y) >= 6) return;
      this.emit('pick', this.pick(e.clientX, e.clientY));
    };
    this.onCancel = e => { this.pointers.delete(e.pointerId); this.press = null; };
    cv.addEventListener('pointerdown', this.onDown);
    cv.addEventListener('pointermove', this.onMove);
    cv.addEventListener('pointerup', this.onUp);
    cv.addEventListener('pointercancel', this.onCancel);
    cv.addEventListener('contextmenu', this.onCtx = e => e.preventDefault());
  }

  emit(evt, ...args) {
    for (const fn of this.listeners[evt] || []) {
      try { fn(...args); } catch (err) { console.error(err); }
    }
  }

  // ------------------------------------------------------------ assembly
  setAssembly(asm, { keepCamera = false } = {}) {
    this.asm = asm;
    const n = asm.nucleotides.length, N = asm.atoms.count;
    this.nucScale = new Float32Array(n);
    this.nucOff = new Float32Array(n * 3);
    this.jpos = new Float32Array(N * 3);
    this.dpos = asm.atoms.pos;
    this.nucPh = new Float32Array(n * 6).map(() => Math.random() * 6.283);
    this.atomPh = new Float32Array(N * 3).map(() => Math.random() * 6.283);
    this.atomFr = new Float32Array(N).map(() => 2.2 + Math.random() * 1.6);
    this.colors = new ColorModel(asm);
    this.molecule.setAssembly(asm);
    this.cartoon.setAssembly(asm);
    this.guides.setAssembly(asm);
    this.overlay.setAssembly(asm);
    this.computeOrientation(asm);
    this.recolor();
    this.dirty = true;
    this.updateGeometry();
    if (!keepCamera) { this.frameAll(0); this.autoFramed = true; }
  }

  /** Root transform: helix axis -> screen vertical (+Y), centred on the origin. */
  computeOrientation(asm) {
    const A = asm.atoms, pos = A.pos;
    let dir = new THREE.Vector3(0, 0, 1), center = new THREE.Vector3();
    if (asm.meta && asm.meta.axis) {
      const [a, b] = asm.meta.axis;
      center.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
      dir.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    } else {
      // principal axis of the phosphorus atoms (all atoms as fallback)
      let idx = [];
      for (let g = 0; g < A.count; g++) if (ELEMENTS[A.el[g]] === 'P') idx.push(g);
      if (idx.length < 4) idx = Array.from({ length: A.count }, (_, i) => i);
      for (const g of idx) center.x += pos[g * 3], center.y += pos[g * 3 + 1], center.z += pos[g * 3 + 2];
      center.multiplyScalar(1 / idx.length);
      const C = [0, 0, 0, 0, 0, 0, 0, 0, 0];
      for (const g of idx) {
        const d = [pos[g * 3] - center.x, pos[g * 3 + 1] - center.y, pos[g * 3 + 2] - center.z];
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i * 3 + j] += d[i] * d[j];
      }
      let v = [0.3, 0.5, 0.8];
      for (let it = 0; it < 60; it++) {   // power iteration -> largest eigenvector
        const w = [C[0] * v[0] + C[1] * v[1] + C[2] * v[2], C[3] * v[0] + C[4] * v[1] + C[5] * v[2], C[6] * v[0] + C[7] * v[1] + C[8] * v[2]];
        const l = Math.hypot(...w) || 1; v = w.map(x => x / l);
      }
      dir.set(...v);
      // orient so strand 0 runs 5'->3' upward (matches the ideal-duplex convention)
      const s0 = asm.strands[0];
      if (s0 && s0.length > 1) {
        const f = asm.nucleotides[s0[0]].frame.o, l = asm.nucleotides[s0[s0.length - 1]].frame.o;
        if ((l[0] - f[0]) * dir.x + (l[1] - f[1]) * dir.y + (l[2] - f[2]) * dir.z < 0) dir.negate();
      }
      // centre on the axis line through the atom centroid
    }
    this.axisDir = dir.clone(); this.axisCenter = center.clone();
    const q = new THREE.Quaternion().setFromUnitVectors(dir, new THREE.Vector3(0, 1, 0));
    this.root.quaternion.copy(q);
    this.root.position.copy(center).applyQuaternion(q).negate();
    this.root.updateMatrixWorld(true);
    // axis guide spans the projected atom extent along the axis
    let lo = Infinity, hi = -Infinity;
    for (let g = 0; g < A.count; g++) {
      const s = (pos[g * 3] - center.x) * dir.x + (pos[g * 3 + 1] - center.y) * dir.y + (pos[g * 3 + 2] - center.z) * dir.z;
      if (s < lo) lo = s; if (s > hi) hi = s;
    }
    const pad = 6;
    this.guides.setAxis(center.clone().addScaledVector(dir, lo - pad).toArray(), center.clone().addScaledVector(dir, hi + pad).toArray());
  }

  recolor() {
    if (!this.asm) return;
    this.colors.compute(this.style.color, this.highlight);
    this.molecule.recolor(this.colors);
    this.cartoon.recolor(this.colors);
    this.dirty = true;
  }

  // ------------------------------------------------------------ per-frame geometry
  updateDisplayPositions(t) {
    const asm = this.asm, n = asm.nucleotides.length, off = this.nucOff;
    const j = clamp(+this.style.jitter || 0, 0, 1);
    if (j <= 0) {
      if (this.dpos !== asm.atoms.pos) { this.dpos = asm.atoms.pos; off.fill(0); }
      return;
    }
    const amp = 0.3 * j, ph = this.nucPh;
    for (let i = 0; i < n; i++) {
      const p = i * 6;
      off[i * 3] = amp * 0.7 * (0.6 * Math.sin(t * 1.9 + ph[p]) + 0.4 * Math.sin(t * 3.3 + ph[p + 1]));
      off[i * 3 + 1] = amp * 0.7 * (0.6 * Math.sin(t * 2.1 + ph[p + 2]) + 0.4 * Math.sin(t * 2.9 + ph[p + 3]));
      off[i * 3 + 2] = amp * 0.7 * (0.6 * Math.sin(t * 1.7 + ph[p + 4]) + 0.4 * Math.sin(t * 3.7 + ph[p + 5]));
    }
    const src = asm.atoms.pos, dst = this.jpos, nuc = asm.atoms.nuc, aph = this.atomPh, fr = this.atomFr, a2 = amp * 0.35;
    for (let g = 0, N = asm.atoms.count; g < N; g++) {
      const k = nuc[g] * 3, f = fr[g] * t, o = g * 3;
      dst[o] = src[o] + off[k] + a2 * Math.sin(f + aph[o]);
      dst[o + 1] = src[o + 1] + off[k + 1] + a2 * Math.sin(f * 1.13 + aph[o + 1]);
      dst[o + 2] = src[o + 2] + off[k + 2] + a2 * Math.sin(f * 0.91 + aph[o + 2]);
    }
    this.dpos = dst;
  }

  updateGeometry() {
    const asm = this.asm; if (!asm) return;
    const sc = this.nucScale;
    for (const nu of asm.nucleotides) sc[nu.id] = nu.visible === false ? 0 : clamp(nu.opacity ?? 1, 0, 1);
    this.updateDisplayPositions(this.t);
    const st = this.style, hl = this.colors.highlightActive;
    this.molecule.update(this.dpos, sc, st, hl);
    this.cartoon.update(this.dpos, sc, this.nucOff, st.representation === 'cartoon');
    this.guides.update(sc, st);
    this.dirty = false;
  }

  // ------------------------------------------------------------ camera
  viewport() {
    const w = Math.max(1, this.width || 1), h = Math.max(1, this.height || 1), I = this.insets;
    const vw = Math.max(40, w - I.left - I.right), vh = Math.max(40, h - I.top - I.bottom);
    return { w, h, vw, vh };
  }

  /** Distance at which a vertical cylinder (half-height hh, radius r) fits the unobstructed view. */
  fitDistance(hh, r) {
    const { w, h, vw, vh } = this.viewport();
    const tv = Math.tan(THREE.MathUtils.degToRad(FOV) / 2), th = tv * (w / h);
    const dv = (hh * 1.08) / (tv * (vh / h)) + r;
    const dh = (r * 1.25) / (th * (vw / w)) + r;
    return Math.max(dv, dh, 12);
  }

  measureFit() {
    const asm = this.asm; if (!asm) return;
    const pos = asm.atoms.pos, m = this.root.matrixWorld.elements, A = asm.atoms;
    let lo = Infinity, hi = -Infinity, r2 = 0, any = false;
    for (let g = 0; g < A.count; g++) {
      if (this.nucScale && this.nucScale[A.nuc[g]] <= 0.001) continue;
      const x = pos[g * 3], y = pos[g * 3 + 1], z = pos[g * 3 + 2];
      const wx = m[0] * x + m[4] * y + m[8] * z + m[12], wy = m[1] * x + m[5] * y + m[9] * z + m[13], wz = m[2] * x + m[6] * y + m[10] * z + m[14];
      if (wy < lo) lo = wy; if (wy > hi) hi = wy;
      const rr = wx * wx + wz * wz; if (rr > r2) r2 = rr;
      any = true;
    }
    if (!any) { lo = -10; hi = 10; r2 = 100; }
    this.fit = { cy: (lo + hi) / 2, h: hi - lo, r: Math.sqrt(r2) + 1.5 };
  }

  frameAll(duration = 0.8) {
    this.measureFit();
    const f = this.fit;
    const target = new THREE.Vector3(0, f.cy, 0);
    const dist = this.fitDistance(f.h / 2 + 2, f.r);
    this.controls.maxDistance = Math.max(200, dist * 5);
    this.moveCamera(target, dist, duration, this.anim ? null : (this.hasFramed ? null : new THREE.Vector3(0.0, 0.16, 1).normalize()));
    this.hasFramed = true;
  }

  moveCamera(target, dist, duration, dir = null) {
    const cam = this.camera, c = this.controls;
    const fromDir = this.tmpV.copy(cam.position).sub(c.target);
    const fromDist = fromDir.length() || dist;
    fromDir.normalize();
    const toDir = (dir || fromDir).clone();
    if (this.reducedMotion) duration = 0;
    if (!duration || duration <= 0) {
      c.target.copy(target);
      cam.position.copy(target).addScaledVector(toDir, dist);
      c.update();
      this.anim = null;
      return;
    }
    this.anim = { t: 0, dur: duration, fromT: c.target.clone(), toT: target.clone(), fromDir: fromDir.clone(), toDir, fromDist, toDist: dist };
  }

  stepCameraAnim(dt) {
    const a = this.anim; if (!a) return;
    a.t += dt;
    const k = easeInOutCubic(clamp(a.t / a.dur, 0, 1));
    const c = this.controls, cam = this.camera;
    c.target.lerpVectors(a.fromT, a.toT, k);
    const d = this.tmpV.copy(a.fromDir).lerp(a.toDir, k).normalize();
    const dist = a.fromDist * Math.pow(a.toDist / a.fromDist, k);
    cam.position.copy(c.target).addScaledVector(d, dist);
    if (a.t >= a.dur) this.anim = null;
  }

  focus(sel, { duration = 0.8 } = {}) {
    if (!this.asm) return;
    this.autoFramed = !sel;
    if (!sel) { this.frameAll(duration); return; }
    const asm = this.asm, pts = [];
    if (sel.pair !== undefined && asm.pairs[sel.pair]) { const p = asm.pairs[sel.pair]; pts.push(p.a, p.b); }
    else if (sel.nucleotide !== undefined && asm.nucleotides[sel.nucleotide]) pts.push(sel.nucleotide);
    if (!pts.length) return;
    const c = new THREE.Vector3(); let cnt = 0;
    for (const id of pts) {
      const nu = asm.nucleotides[id];
      for (let i = 0; i < nu.atomCount; i++) { const g = nu.atomStart + i; c.x += asm.atoms.pos[g * 3]; c.y += asm.atoms.pos[g * 3 + 1]; c.z += asm.atoms.pos[g * 3 + 2]; cnt++; }
    }
    c.multiplyScalar(1 / Math.max(1, cnt)).applyMatrix4(this.root.matrixWorld);
    const r = pts.length > 1 ? 11 : 8;
    this.moveCamera(c, this.fitDistance(r * 1.3, r), duration);
  }

  // ------------------------------------------------------------ projection / picking
  project(x, y, z, out) {
    const v = this.tmpV2.set(x, y, z).applyMatrix4(this.root.matrixWorld);
    v.applyMatrix4(this.camera.matrixWorldInverse);
    out.z = -v.z;
    v.applyMatrix4(this.camera.projectionMatrix);
    out.x = (v.x + 1) * 0.5 * this.width;
    out.y = (1 - v.y) * 0.5 * this.height;
    out.ok = out.z > 0.5 && v.z < 1;
    return out;
  }

  pxPerA(depth) { return this.height / (2 * Math.tan(THREE.MathUtils.degToRad(FOV) / 2) * Math.max(0.5, depth)); }

  pick(clientX, clientY) {
    const asm = this.asm; if (!asm) return null;
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const inv = this.tmpM.copy(this.root.matrixWorld).invert();
    const ray = this.ray.copy(this.raycaster.ray).applyMatrix4(inv);
    const ox = ray.origin.x, oy = ray.origin.y, oz = ray.origin.z, dx = ray.direction.x, dy = ray.direction.y, dz = ray.direction.z;
    const pos = this.dpos, A = asm.atoms, rep = this.style.representation;
    const minR = 6 / this.pxPerA(this.camera.position.distanceTo(this.controls.target));
    let best = -1, bestT = Infinity;
    for (let g = 0; g < A.count; g++) {
      const s = this.nucScale[A.nuc[g]];
      if (s <= 0.05) continue;
      const wx = pos[g * 3] - ox, wy = pos[g * 3 + 1] - oy, wz = pos[g * 3 + 2] - oz;
      const tc = wx * dx + wy * dy + wz * dz;
      if (tc <= 0) continue;
      const d2 = wx * wx + wy * wy + wz * wz - tc * tc;
      let r = rep === 'spacefill' ? VDW[A.el[g]] : rep === 'cartoon' ? 1.7 : VDW[A.el[g]] * BALL_SCALE * 1.4;
      r = Math.max(r * s, minR);
      if (d2 > r * r) continue;
      const th = tc - Math.sqrt(r * r - d2);
      if (th < bestT) { bestT = th; best = g; }
    }
    if (best < 0) return null;
    const nu = asm.nucleotides[A.nuc[best]];
    return { nucleotide: nu.id, atom: best, pair: nu.pair, clientX, clientY };
  }

  // ------------------------------------------------------------ loop
  resize() {
    if (this.disposed) return;
    const w = Math.max(1, this.container.clientWidth), h = Math.max(1, this.container.clientHeight);
    const pr = this.pixelRatio();
    this.width = w; this.height = h;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.applyViewOffset();
    this.post.setSize(w, h, pr);
    this.particles.material.uniforms.uPx.value = (h * pr) / (2 * Math.tan(THREE.MathUtils.degToRad(FOV) / 2));
    if (this.asm && this.autoFramed && !this.interacting) this.frameAll(0);
  }

  applyViewOffset() {
    const { w, h, vw, vh } = this.viewport(), I = this.insets;
    const cx = I.left + vw / 2, cy = I.top + vh / 2;
    if (Math.abs(cx - w / 2) < 0.5 && Math.abs(cy - h / 2) < 0.5) this.camera.clearViewOffset();
    else this.camera.setViewOffset(w, h, w / 2 - cx, h / 2 - cy, w, h);
    this.camera.updateProjectionMatrix();
  }

  tick = now => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.tick);
    const raw = this.last ? (now - this.last) : 16.7;
    this.last = now;
    const dt = Math.min(0.05, raw / 1000);
    this.t += dt;
    this.trackPerformance(raw, now);
    this.emit('frame', dt, this.t);

    // camera
    if (this.anim) this.stepCameraAnim(dt);
    const wantRotate = this.style.autoRotate && !this.reducedMotion && !this.interacting && !this.anim && now >= this.resumeAt;
    this.controls.autoRotate = wantRotate;
    this.controls.update(dt);

    if (this.asm && (this.dirty || this.style.jitter > 0)) this.updateGeometry();

    // per-frame uniforms
    const motion = this.reducedMotion ? 0 : 1;
    this.molecule.setTime(this.t, motion);
    const dist = this.camera.position.distanceTo(this.controls.target);
    const pu = this.particles.material.uniforms;
    pu.uTime.value = this.t * motion + (motion ? 0 : 0);
    pu.uDrift.value = motion;
    pu.uFocus.value = dist;
    pu.uCenter.value.copy(this.controls.target);
    const R = Math.max(this.fit.r, 10), box = Math.max(70, 2.2 * Math.max(this.fit.h / 2, R), dist * 1.2);
    pu.uBox.value.set(box, box, box);
    this.scene.fog.near = Math.max(1, dist - R * 0.6);
    this.scene.fog.far = dist + R * 4.5 + 25;

    // DOM overlays
    this.camera.updateMatrixWorld();
    this.root.updateMatrixWorld();
    const ctx = this.labelCtx || (this.labelCtx = { pxPerAAt: d => this.pxPerA(d) });
    ctx.pxPerA = this.pxPerA(dist);
    ctx.centerDepth = dist;
    ctx.emph = this.colors && this.colors.highlightActive ? this.colors.emph : null;
    if (this.asm) this.overlay.updateBaseLabels(this.style.labels, this.nucScale, this.nucOff, ctx);
    this.overlay.updateTags(ctx, this.t);

    if (this.lost) return;
    this.post.render(dt);
  };

  trackPerformance(raw, now) {
    if (raw <= 0 || raw > 250) { this.slowSince = 0; return; }   // tab switch / stall
    this.ftEma += (raw - this.ftEma) * 0.05;
    this.fpsEma = 1000 / this.ftEma;
    if (this.qualityMode !== 'auto') return;
    if (this.ftEma > 24) {
      if (!this.slowSince) this.slowSince = now;
      if (now - this.slowSince > 2500 && now - this.lastTierChange > 4000) {
        const i = TIER_ORDER.indexOf(this.tier);
        if (i > 0) { this.setTier(TIER_ORDER[i - 1]); this.ftEma = 16.7; }
        this.slowSince = 0;
      }
    } else this.slowSince = 0;
  }

  // ------------------------------------------------------------ public API
  makeApi() {
    const v = this;
    return {
      setAssembly: (asm, o) => v.setAssembly(asm, o),
      sync: () => { v.dirty = true; },
      setStyle(partial = {}) {
        const prev = v.style;
        v.style = { ...prev, ...partial };
        if (partial.color !== undefined && partial.color !== prev.color) v.recolor();
        if (partial.effects !== undefined && partial.effects !== prev.effects) v.applyTierSettings();
        if (partial.autoRotate === false) v.controls.autoRotate = false;
        v.dirty = true;
      },
      setHighlight(h) {
        v.highlight = h && ((h.nucleotides && h.nucleotides.length) || (h.pairs && h.pairs.length)) ? h : null;
        v.recolor();
      },
      focus: (sel, o) => v.focus(sel, o),
      setAnnotations: list => v.overlay.setAnnotations(list || []),
      setBlobs: list => v.overlay.setBlobs(list || []),
      setViewInsets(ins = {}) {
        v.insets = { top: 0, right: 0, bottom: 0, left: 0, ...ins };
        v.applyViewOffset();
        if (v.asm && v.autoFramed && !v.interacting) v.frameAll(0.5);
      },
      setQuality(q) {
        v.qualityMode = q;
        if (q === 'auto') v.lastTierChange = performance.now();
        else v.setTier(q);
      },
      resize: () => v.resize(),
      on(evt, fn) { (v.listeners[evt] ||= new Set()).add(fn); return () => v.listeners[evt].delete(fn); },
      off(evt, fn) { v.listeners[evt]?.delete(fn); },
      getState: () => ({
        fps: Math.round(v.fpsEma * 10) / 10, quality: v.tier, qualityMode: v.qualityMode,
        atoms: v.asm ? v.asm.atoms.count : 0, representation: v.style.representation,
        pixelRatio: v.renderer.getPixelRatio(), style: { ...v.style },
      }),
      get canvas() { return v.canvas; },
      get camera() { return v.camera; },
      dispose: () => v.dispose(),
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibility);
    if (this.reducedMotionMQ) this.reducedMotionMQ.removeEventListener?.('change', this.onMotionPref);
    const cv = this.canvas;
    cv.removeEventListener('webglcontextlost', this.onLost);
    cv.removeEventListener('webglcontextrestored', this.onRestored);
    cv.removeEventListener('pointerdown', this.onDown);
    cv.removeEventListener('pointermove', this.onMove);
    cv.removeEventListener('pointerup', this.onUp);
    cv.removeEventListener('pointercancel', this.onCancel);
    cv.removeEventListener('contextmenu', this.onCtx);
    this.controls.removeEventListener('start', this.onCtlStart);
    this.controls.removeEventListener('end', this.onCtlEnd);
    this.controls.dispose();
    this.overlay.dispose();
    this.molecule.dispose();
    this.cartoon.dispose();
    this.guides.dispose();
    this.particles.dispose();
    disposeTree(this.scene);
    this.post.dispose();
    this.envRT.dispose();
    this.bgTex.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
    cv.remove();
    for (const k in this.listeners) this.listeners[k].clear();
    this.asm = null;
  }
}
