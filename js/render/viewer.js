// Helix viewer: three.js scene driven by a science-layer Assembly.
// Public API: see CONTRACT.md ("Viewer API") plus setViewInsets / setQuality / resize / off.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ELEMENTS, ELEMENT_INFO } from '../science/index.js';
import { ColorModel } from './colors.js';
import { MoleculeLayer, BALL_SCALE } from './molecule.js';
import { CartoonLayer } from './cartoon.js';
import { AtomGroupLayer } from './atom-groups.js';
import { ActorLayer } from './actors.js';
import { FxLayer } from './fx.js';
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
    this.framing = null;          // {points:[[x,y,z]...] science coords, dir:[x,y,z] science view direction}
    this.cutCur = null; this.cutTgt = null; this.cutActive = false; this.tagSig = 0;
    this.detailFocus = null;

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
    r.localClippingEnabled = true;       // per-material clipping planes (machine actor cutaway)

    const scene = this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 12000);
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
    this.atomGroups = null;
    this.actors = new ActorLayer(this.root, this.tier);
    this.fx = null;
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
    if (this.atomGroups) this.atomGroups.setTier(tier);
    if (this.fx) this.fx.setTier(tier);
    this.actors.setTier(tier);
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
      this.emit('controlstart');
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
    this.cutCur = new Float32Array(n); this.cutTgt = new Float32Array(n); this.cutActive = false;
    this.tagSig = this.tagSignature();
    this.molecule.setAssembly(asm);
    this.cartoon.setAssembly(asm);
    this.guides.setAssembly(asm);
    this.overlay.setAssembly(asm);
    this.computeOrientation(asm);
    this.recolor();
    this.dirty = true;
    this.updateGeometry();
    // a fresh model gets the default three-quarter side view (not e.g. a leftover face-on pair view)
    if (!keepCamera) { this.anim = null; this.hasFramed = false; this.faceView = false; this.frameAll(0); this.autoFramed = true; }
  }

  /** Machine actors need room to zoom out to the L0 band (ratio > 6); never lowers the range, no-op without actors. */
  ensureActorRange() {
    const r = this.actors.maxRadius;
    if (r > 0 && this.controls.maxDistance < r * 10) this.controls.maxDistance = r * 10;
  }

  /** Root transform: helix axis -> screen vertical (+Y), centred on the origin. */
  computeOrientation(asm) {
    const A = asm.atoms, pos = A.pos;
    let dir = new THREE.Vector3(0, 0, 1), center = new THREE.Vector3();
    if (asm.meta && asm.meta.axis) {
      const [a, b] = asm.meta.axis;
      center.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
      dir.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    } else if (A.count > 0) {
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
    if (!(lo <= hi)) lo = hi = 0;      // zero-atom assembly (machine actors only): keep the axis guide finite
    const pad = 6;
    this.guides.setAxis(center.clone().addScaledVector(dir, lo - pad).toArray(), center.clone().addScaledVector(dir, hi + pad).toArray());
  }

  recolor() {
    if (this.atomGroups) this.atomGroups.setStyle(this.style);
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
    const sig = this.tagSignature();
    if (sig !== this.tagSig) { this.tagSig = sig; this.recolor(); }
    const cut = this.cutActive ? this.cutCur : null;
    for (const nu of asm.nucleotides) sc[nu.id] = (nu.visible === false ? 0 : clamp(nu.opacity ?? 1, 0, 1)) * (cut ? 1 - cut[nu.id] : 1);
    this.updateDisplayPositions(this.t);
    const st = this.style, hl = this.colors.highlightActive;
    this.molecule.update(this.dpos, sc, st, hl);
    this.cartoon.update(this.dpos, sc, this.nucOff, this.detailFocus !== null || st.representation === 'cartoon');
    if (this.atomGroups) this.atomGroups.update();
    this.guides.update(sc, st);
    this.dirty = false;
  }

  /** Cheap hash of nucleotide tags/roles (e.g. 'primer', 'mrna'), so colour schemes that depend on them refresh. */
  tagSignature() {
    const asm = this.asm; if (!asm) return 0;
    let h = 0;
    for (const nu of asm.nucleotides) {
      if (nu.tag) h = (h * 31 + nu.id + 1 + nu.tag.length * 7919) | 0;
      if (nu.role) h = (h * 31 + nu.id + 3 + nu.role.length * 4099) | 0;
    }
    return h;
  }

  /** Animate the per-nucleotide cutaway (used by the face-on base-pair view). */
  stepCut(dt) {
    if (!this.cutActive) return;
    const c = this.cutCur, g = this.cutTgt, k = this.reducedMotion ? 1 : Math.min(1, dt / 0.35);
    let moving = false, any = false;
    for (let i = 0; i < c.length; i++) {
      const d = g[i] - c[i];
      if (Math.abs(d) > 0.002) { c[i] += d * k + Math.sign(d) * Math.min(Math.abs(d), dt * 0.6); if ((d > 0) !== (g[i] - c[i] > 0)) c[i] = g[i]; moving = true; }
      else c[i] = g[i];
      if (c[i] > 0) any = true;
    }
    if (moving) this.dirty = true;
    if (!any && !moving) { this.cutActive = false; this.dirty = true; }
  }

  setCut(maskFn) {
    if (!this.asm) return;
    for (const nu of this.asm.nucleotides) this.cutTgt[nu.id] = maskFn ? maskFn(nu) : 0;
    this.cutActive = true;
  }

  setDetailFocus(focus) {
    if (!focus || !focus.center) {
      this.detailFocus = null;
    } else {
      const c = focus.center;
      this.detailFocus = {
        center: [c[0] ?? c.x ?? 0, c[1] ?? c.y ?? 0, c[2] ?? c.z ?? 0],
        radius: Math.max(0, Number(focus.radius) || 0),
      };
    }
    this.molecule.setDetailFocus(this.detailFocus);
    this.cartoon.setDetailFocus(this.detailFocus);
    if (this.atomGroups) this.atomGroups.setDetailFocus(this.detailFocus);
    this.dirty = true;
  }

  setAtomGroups(groups) {
    const list = groups || [];
    if (!this.atomGroups) {
      if (!list.length) return;
      this.atomGroups = new AtomGroupLayer(this.root, this.tier);
      this.atomGroups.setDetailFocus(this.detailFocus);
    }
    this.atomGroups.setGroups(list, this.style);
    this.dirty = true;
  }

  setFx(list) {
    const items = list || [];
    if (!this.fx) {
      if (!items.length) return;
      this.fx = new FxLayer({
        parent: this.root,
        overlayEl: this.overlay.el,
        project: (x, y, z, out) => this.project(x, y, z, out),
        tier: this.tier,
      });
    }
    this.fx.setFx(items);
    this.dirty = true;
  }

  setCrowd(instances, assetsById) {
    this.actors.setCrowd(instances || [], assetsById);
    this.dirty = true;
  }

  setLabels(list) {
    if (typeof this.overlay.setLabels === 'function') this.overlay.setLabels(list || []);
    else this.overlay.setAnnotations(list || []);
    this.dirty = true;
  }

  setFar(far) {
    const f = Number(far);
    if (!Number.isFinite(f) || f <= this.camera.near) return;
    this.camera.far = f;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
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
    if (asm.residues && asm.residues.length) {
      for (const res of asm.residues) {
        if (!res || !res.visible || (res.opacity ?? 1) <= 0.01 || !res.pos) continue;
        const x = res.pos[0], y = res.pos[1], z = res.pos[2];
        const wx = m[0] * x + m[4] * y + m[8] * z + m[12], wy = m[1] * x + m[5] * y + m[9] * z + m[13], wz = m[2] * x + m[6] * y + m[10] * z + m[14];
        if (wy < lo) lo = wy; if (wy > hi) hi = wy;
        const rr = wx * wx + wz * wz; if (rr > r2) r2 = rr;
        any = true;
      }
    }
    if (!any) { lo = -10; hi = 10; r2 = 100; }
    this.fit = { cy: (lo + hi) / 2, h: hi - lo, r: Math.sqrt(r2) + 1.5 };
  }

  /** Science-space vector -> world-space direction (root rotation only). */
  toWorldDir(v) { return new THREE.Vector3(v[0], v[1], v[2]).applyQuaternion(this.root.quaternion).normalize(); }

  /** Frame atoms + framing points as seen from a fixed direction (oriented box fit). */
  frameOriented(duration) {
    const asm = this.asm, F = this.framing;
    const dir = this.toWorldDir(F.dir);
    const up0 = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(up0, dir);
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    right.normalize();
    const up = new THREE.Vector3().crossVectors(dir, right).normalize();
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    const v = new THREE.Vector3();
    const add = () => {
      const a = v.dot(right), b = v.dot(up), c = v.dot(dir);
      if (a < lo[0]) lo[0] = a; if (a > hi[0]) hi[0] = a;
      if (b < lo[1]) lo[1] = b; if (b > hi[1]) hi[1] = b;
      if (c < lo[2]) lo[2] = c; if (c > hi[2]) hi[2] = c;
    };
    const m = this.root.matrixWorld;
    for (const p of F.points || []) { v.set(p[0], p[1], p[2]).applyMatrix4(m); add(); }
    const pos = asm.atoms.pos, A = asm.atoms;
    for (let g = 0; g < A.count; g += 2) {
      if (this.nucScale && this.nucScale[A.nuc[g]] <= 0.001) continue;
      v.set(pos[g * 3], pos[g * 3 + 1], pos[g * 3 + 2]).applyMatrix4(m); add();
    }
    if (asm.residues && asm.residues.length) {
      for (const res of asm.residues) {
        if (!res || !res.visible || (res.opacity ?? 1) <= 0.01 || !res.pos) continue;
        v.set(res.pos[0], res.pos[1], res.pos[2]).applyMatrix4(m); add();
      }
    }
    if (!(hi[0] > lo[0])) return this.frameAll(duration, true);
    const { w, h, vw, vh } = this.viewport();
    const tv = Math.tan(THREE.MathUtils.degToRad(FOV) / 2), th = tv * (w / h);
    const hw = (hi[0] - lo[0]) / 2 + 1.5, hh = (hi[1] - lo[1]) / 2 + 1.5, hd = (hi[2] - lo[2]) / 2;
    // depth: points in front of the box centre look bigger; a partial allowance is enough in practice
    const dist = Math.max(hw * 1.06 / (th * (vw / w)), hh * 1.06 / (tv * (vh / h)), 12) + hd * 0.4;
    const target = right.clone().multiplyScalar((lo[0] + hi[0]) / 2)
      .addScaledVector(up, (lo[1] + hi[1]) / 2).addScaledVector(dir, (lo[2] + hi[2]) / 2);
    this.fit = { cy: target.y, h: hi[1] - lo[1], r: Math.max(hw, hd) };
    this.controls.maxDistance = Math.max(200, dist * 5);
    this.moveCamera(target, dist, duration, dir);
    this.hasFramed = true;
  }

  frameAll(duration = 0.8, plain = false) {
    if (!plain && this.framing && this.framing.dir && this.asm) return this.frameOriented(duration);
    this.measureFit();
    const f = this.fit;
    const target = new THREE.Vector3(0, f.cy, 0);
    const dist = this.fitDistance(f.h / 2 + 2, f.r);
    this.controls.maxDistance = Math.max(200, dist * 5);
    const side = this.faceView || !this.hasFramed;      // leave a face-on view for the default side view
    this.moveCamera(target, dist, duration, side ? new THREE.Vector3(0.0, 0.16, 1).normalize() : (this.anim ? this.anim.toDir.clone() : null));
    this.hasFramed = true; this.faceView = false;
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

  setFollowTarget(spec) {
    if (!spec || spec.mode === 'overview' || spec.mode === 'free' || spec.mode === 'none') {
      this.followTarget = null;
      return;
    }
    this.followTarget = typeof spec === 'string' ? { mode: spec } : { ...spec };
  }

  resolveFollowSpec() {
    const ft = this.followTarget;
    if (!ft) return null;
    if (Array.isArray(ft.center) && ft.center.length === 3) {
      return { center: ft.center, radius: ft.radius || 22, dir: ft.dir || null, distance: ft.distance || 0 };
    }
    const blobs = this.overlay && this.overlay.blobs;
    const mode = ft.mode || ft.blobId;
    if (mode === 'rnap' && blobs) {
      const b = blobs.get('rnap');
      if (b && b.mesh.visible) return { center: [b.at.x, b.at.y, b.at.z], radius: ft.radius || Math.max(18, b.radius * 1.15), dir: ft.dir || null, distance: ft.distance || 0 };
    }
    if (mode === 'ribosome' && blobs) {
      const b30 = blobs.get('ribosome-30s'), b50 = blobs.get('ribosome-50s'), bRib = blobs.get('ribosome');
      const active = [b30, b50, bRib].filter(b => b && b.mesh.visible);
      if (active.length) {
        let x = 0, y = 0, z = 0, r = 18;
        for (const b of active) { x += b.at.x; y += b.at.y; z += b.at.z; r = Math.max(r, b.radius * 1.25); }
        const inv = 1 / active.length;
        return { center: [x * inv, y * inv, z * inv], radius: ft.radius || r, dir: ft.dir || null, distance: ft.distance || 0 };
      }
      const rnap = blobs.get('rnap');
      if (rnap && rnap.mesh.visible) return { center: [rnap.at.x, rnap.at.y, rnap.at.z], radius: ft.radius || Math.max(18, rnap.radius * 1.15), dir: ft.dir || null, distance: ft.distance || 0 };
    }
    if (mode === 'peptide' && this.asm && this.asm.residues) {
      const vis = this.asm.residues.filter(r => r && r.visible && r.pos);
      if (vis.length) {
        let x = 0, y = 0, z = 0;
        for (const r of vis) { x += r.pos[0]; y += r.pos[1]; z += r.pos[2]; }
        const inv = 1 / vis.length;
        return { center: [x * inv, y * inv, z * inv], radius: ft.radius || 18, dir: ft.dir || null, distance: ft.distance || 0 };
      }
    }
    return null;
  }

  stepFollow(dt, now) {
    if (!this.followTarget || this.interacting || this.anim) return;
    const resolved = this.resolveFollowSpec();
    if (!resolved) return;
    const worldTarget = this.tmpV.set(resolved.center[0], resolved.center[1], resolved.center[2]).applyMatrix4(this.root.matrixWorld);
    const c = this.controls, cam = this.camera;
    const offset = this.tmpV2.copy(cam.position).sub(c.target);
    const curDist = offset.length() || 40;
    offset.normalize();
    const k = this.reducedMotion ? 1 : 1 - Math.exp(-dt * 5.0);
    c.target.lerp(worldTarget, k);
    const manualGrace = now < this.resumeAt;
    if (!manualGrace && resolved.dir) {
      const wantDir = this.toWorldDir(resolved.dir);
      offset.lerp(wantDir, k * 0.6).normalize();
    }
    const wantDist = resolved.distance || this.fitDistance(resolved.radius * 1.15, resolved.radius);
    const newDist = manualGrace ? curDist : curDist + (wantDist - curDist) * k;
    cam.position.copy(c.target).addScaledVector(offset, newDist);
  }

  focus(sel, { duration = 0.8, view = 'auto', cutaway = true } = {}) {
    if (!this.asm) return;
    this.autoFramed = !sel;
    if (!sel) { if (this.cutActive) this.setCut(null); this.frameAll(duration); return; }
    const asm = this.asm, pts = [];
    if (sel.pair !== undefined && asm.pairs[sel.pair]) { const p = asm.pairs[sel.pair]; pts.push(p.a, p.b); }
    else if (sel.nucleotide !== undefined && asm.nucleotides[sel.nucleotide]) pts.push(sel.nucleotide);
    else if (Array.isArray(sel.nucleotides)) {
      for (const id of sel.nucleotides) if (asm.nucleotides[id]) pts.push(id);
    }
    if (pts.length) {
      const c = new THREE.Vector3(); let cnt = 0;
      for (const id of pts) {
        const nu = asm.nucleotides[id];
        for (let i = 0; i < nu.atomCount; i++) { const g = nu.atomStart + i; c.x += asm.atoms.pos[g * 3]; c.y += asm.atoms.pos[g * 3 + 1]; c.z += asm.atoms.pos[g * 3 + 2]; cnt++; }
      }
      const cs = c.clone().multiplyScalar(1 / Math.max(1, cnt));       // science coords
      c.copy(cs).applyMatrix4(this.root.matrixWorld);
      if (view === 'face' && pts.length > 1 && sel.pair !== undefined && asm.pairs[sel.pair]) { this.focusFace(asm.pairs[sel.pair], cs, c, duration, cutaway); return; }
      if (this.cutActive) this.setCut(null);
      const r = pts.length > 2 ? 14 : pts.length > 1 ? 11 : 8;
      this.moveCamera(c, this.fitDistance(r * 1.3, r), duration, this.faceView ? new THREE.Vector3(0.0, 0.16, 1).normalize() : null);
      this.faceView = false;
      return;
    }
    if (sel.residue !== undefined && asm.residues && asm.residues[sel.residue] && asm.residues[sel.residue].pos) {
      const res = asm.residues[sel.residue];
      const c = new THREE.Vector3(...res.pos).applyMatrix4(this.root.matrixWorld);
      if (this.cutActive) this.setCut(null);
      const r = 10;
      this.moveCamera(c, this.fitDistance(r * 1.3, r), duration, null);
      this.faceView = false;
      return;
    }
    if (Array.isArray(sel.center) && sel.center.length === 3) {
      const c = new THREE.Vector3(...sel.center).applyMatrix4(this.root.matrixWorld);
      if (this.cutActive) this.setCut(null);
      const r = sel.radius || 16;
      this.moveCamera(c, this.fitDistance(r * 1.2, r), duration, sel.dir ? this.toWorldDir(sel.dir) : null);
      this.faceView = false;
    }
  }

  /**
   * Look down the helix axis onto the plane of a base pair (H-bonds face-on), major groove at the top of
   * the screen, and fade away everything stacked above it so the pair is unobstructed.
   */
  focusFace(pair, cs, cw, duration, cutaway) {
    const asm = this.asm, A = asm.nucleotides[pair.a], B = asm.nucleotides[pair.b];
    // pair plane normal ~ mean of the two base normals (local z), flipped to point along the helix axis
    const ax = this.axisDir;
    let n = new THREE.Vector3(A.frame.R[2] - B.frame.R[2], A.frame.R[5] - B.frame.R[5], A.frame.R[8] - B.frame.R[8]);
    if (n.lengthSq() < 1e-6) n.copy(ax);
    n.normalize(); if (n.dot(ax) < 0) n.negate();
    // groove direction: pair x axis (into the major groove) = mean of both local x axes
    const gx = new THREE.Vector3(A.frame.R[0] + B.frame.R[0], A.frame.R[3] + B.frame.R[3], A.frame.R[6] + B.frame.R[6]);
    gx.addScaledVector(n, -gx.dot(n));
    if (gx.lengthSq() < 1e-6) gx.set(1, 0, 0).addScaledVector(n, -n.x);
    gx.normalize();
    // camera sits above the pair (along +axis) and a little to the minor-groove side, so the
    // screen's "up" points into the major groove.
    const tilt = THREE.MathUtils.degToRad(17);
    const dSci = n.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(gx, -Math.sin(tilt));
    const dir = this.toWorldDir(dSci.toArray());
    // fit a ~24 x 18 Å slab (C1'-C1' is 10.5 Å, the phosphates reach ~9 Å from the axis)
    const { w, h, vw, vh } = this.viewport();
    const tv = Math.tan(THREE.MathUtils.degToRad(FOV) / 2), th = tv * (w / h);
    const dist = Math.max(12.5 / (th * (vw / w)), 10 / (tv * (vh / h)), 30);
    this.moveCamera(cw, dist, duration, dir);
    this.faceView = true;
    if (cutaway !== false) {
      const s0 = cs.dot(n);
      this.setCut(nu => {
        if (nu.visible === false) return 0;
        const s = nu.frame.o[0] * n.x + nu.frame.o[1] * n.y + nu.frame.o[2] * n.z;   // base-frame origin along the normal
        return s > s0 + 1.6 ? 1 : 0;
      });
    } else if (this.cutActive) this.setCut(null);
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
    let bestRes = null, bestResT = bestT;
    if (asm.residues && asm.residues.length) {
      for (let i = 0; i < asm.residues.length; i++) {
        const res = asm.residues[i];
        if (!res || !res.visible || !res.pos) continue;
        const op = clamp(res.opacity ?? 1, 0, 1);
        if (op <= 0.05) continue;
        const wx = res.pos[0] - ox, wy = res.pos[1] - oy, wz = res.pos[2] - oz;
        const tc = wx * dx + wy * dy + wz * dz;
        if (tc <= 0) continue;
        const d2 = wx * wx + wy * wy + wz * wz - tc * tc;
        const r = Math.max((res.radius || 1.85) * op, minR);
        if (d2 > r * r) continue;
        const th = tc - Math.sqrt(r * r - d2);
        if (th < bestResT) { bestResT = th; bestRes = res; }
      }
    }
    let bestGroupHit = null;
    if (this.atomGroups && Array.isArray(this.atomGroups.groups)) {
      for (const grp of this.atomGroups.groups) {
        if (!grp || !grp.pos || !(grp.count > 0) || (grp.opacity ?? 1) <= 0.05) continue;
        const gpos = grp.pos;
        const r = Math.max(0.75, minR);
        const r2 = r * r;
        for (let i = 0; i < grp.count; i++) {
          const wx = gpos[i * 3] - ox, wy = gpos[i * 3 + 1] - oy, wz = gpos[i * 3 + 2] - oz;
          const tc = wx * dx + wy * dy + wz * dz;
          if (tc <= 0) continue;
          const d2 = wx * wx + wy * wy + wz * wz - tc * tc;
          if (d2 > r2) continue;
          const th = tc - Math.sqrt(r2 - d2);
          if (th < bestResT) {
            bestResT = th;
            const resIdx = grp.residue ? grp.residue[i] : (grp.kind === 'peptide' ? 0 : -1);
            bestGroupHit = {
              atomGroup: grp.id,
              kind: grp.kind || grp.id,
              groupAtom: i,
              residue: grp.kind === 'peptide' ? resIdx : -1,
              codon: grp.kind === 'peptide' && resIdx >= 0 ? resIdx : -1,
              nucleotide: -1,
              atom: -1,
              pair: -1,
              clientX,
              clientY,
            };
          }
        }
      }
    }
    if (bestGroupHit) return bestGroupHit;
    if (bestRes) {
      return {
        residue: bestRes.id ?? bestRes.index ?? 0,
        codon: bestRes.codonIndex ?? -1,
        nucleotide: -1,
        atom: -1,
        pair: -1,
        clientX,
        clientY,
      };
    }
    if (best < 0) {
      // no atom or residue hit: report a machine actor (bead or envelope) when there is one
      const ah = this.actors.records.size ? this.actors.pick(this.raycaster, minR) : null;
      return ah ? { actor: ah.actor, part: ah.part, chain: ah.chain, nucleotide: -1, atom: -1, pair: -1, residue: -1, clientX, clientY } : null;
    }
    const nu = asm.nucleotides[A.nuc[best]];
    return {
      nucleotide: nu.id,
      atom: best,
      pair: nu.pair,
      codon: nu.codon ?? -1,
      role: nu.role || '',
      clientX,
      clientY,
    };
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
    else if (this.followTarget) this.stepFollow(dt, now);
    this.stepCut(dt);
    const wantRotate = this.style.autoRotate && !this.reducedMotion && !this.interacting && !this.anim && !this.followTarget && now >= this.resumeAt;
    this.controls.autoRotate = wantRotate;
    this.ensureActorRange();
    this.controls.update(dt);

    if (this.asm && (this.dirty || this.style.jitter > 0)) this.updateGeometry();
    else if (this.dirty) { if (this.atomGroups) this.atomGroups.update(); this.dirty = false; }

    // per-frame uniforms
    const motion = this.reducedMotion ? 0 : 1;
    this.molecule.setTime(this.t, motion);
    const dist = this.camera.position.distanceTo(this.controls.target);
    const pu = this.particles.material.uniforms;
    pu.uTime.value = this.t * motion + (motion ? 0 : 0);
    pu.uDrift.value = motion;
    pu.uFocus.value = dist;
    pu.uCenter.value.copy(this.controls.target);
    const R = Math.max(this.fit.r, 10, this.actors.maxRadius), box = Math.max(70, 2.2 * Math.max(this.fit.h / 2, R), dist * 1.2);
    pu.uBox.value.set(box, box, box);
    this.scene.fog.near = Math.max(1, dist - R * 0.6);
    this.scene.fog.far = dist + R * 4.5 + 25;

    // DOM overlays
    this.camera.updateMatrixWorld();
    this.root.updateMatrixWorld();
    this.actors.update(this.camera, dt, this.tier);
    if (this.fx) {
      const fxResolvers = this._fxResolvers || (this._fxResolvers = {
        actors: this.actors,
        molecule: this.molecule,
        _v: this,
        get atomGroups() { return this._v.atomGroups; },
        get asm() { return this._v.asm; },
        get dpos() { return this._v.dpos; },
      });
      this.fx.update(this.camera, this.width, this.height, fxResolvers, now);
    }
    const ctx = this.labelCtx || (this.labelCtx = { pxPerAAt: d => this.pxPerA(d) });
    ctx.pxPerA = this.pxPerA(dist);
    ctx.centerDepth = dist;
    ctx.insets = this.insets; ctx.width = this.width; ctx.height = this.height;
    ctx.emph = this.colors && this.colors.highlightActive ? this.colors.emph : null;
    ctx.resEmph = this.colors && this.colors.highlightActive ? this.colors.resEmph : null;
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
        else if (partial.representation !== undefined && partial.representation !== prev.representation && v.atomGroups) v.atomGroups.setStyle(v.style);
        if (partial.effects !== undefined && partial.effects !== prev.effects) v.applyTierSettings();
        if (partial.autoRotate === false) v.controls.autoRotate = false;
        v.dirty = true;
      },
      setHighlight(h) {
        v.highlight = h && (
          (h.nucleotides && h.nucleotides.length) ||
          (h.pairs && h.pairs.length) ||
          (h.residues && h.residues.length)
        ) ? h : null;
        v.recolor();
      },
      focus: (sel, o) => v.focus(sel, o),
      moveCamera: (target, dist, duration, dir) => v.moveCamera(
        Array.isArray(target) ? new THREE.Vector3(target[0], target[1], target[2]) : target,
        dist,
        duration,
        Array.isArray(dir) ? new THREE.Vector3(dir[0], dir[1], dir[2]).normalize() : dir,
      ),
      setFollowTarget: spec => v.setFollowTarget(spec),
      setDetailFocus: focus => v.setDetailFocus(focus),
      setAtomGroups: groups => v.setAtomGroups(groups),
      setFx: list => v.setFx(list),
      setCrowd: (instances, assetsById) => v.setCrowd(instances, assetsById),
      setLabels: list => v.setLabels(list),
      setFar: far => v.setFar(far),
      setAnnotations: list => v.overlay.setAnnotations(list || []),
      setBlobs: list => v.overlay.setBlobs(list || []),
      /** Machine actors (helix-asset v1/v2, see actors.js): [{ id, asset, transform, visible, opacity, parts, cutaway, lod, label, pickable }]. */
      setActors: list => { v.actors.setActors(list || []); v.ensureActorRange(); v.dirty = true; },
      getActorState: () => v.actors.getState(),
      /** Persistent framing hints for focus(null)/auto-framing: extra science-space points that must stay
       *  in view (e.g. the bounding box of a whole animation) and a fixed science-space view direction. */
      setFraming(f) { v.framing = f && (f.points || f.dir) ? { points: f.points || null, dir: f.dir || null } : null; },
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
        memory: { geometries: v.renderer.info.memory.geometries, textures: v.renderer.info.memory.textures },
      }),
      get canvas() { return v.canvas; },
      get camera() { return v.camera; },
      get controls() { return v.controls; },
      get reducedMotion() { return v.reducedMotion; },
      set reducedMotion(val) { v.reducedMotion = Boolean(val); },
      pick: (clientX, clientY) => v.pick(clientX, clientY),
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
    if (this.fx) this.fx.dispose();
    this.overlay.dispose();
    this.molecule.dispose();
    this.cartoon.dispose();
    if (this.atomGroups) this.atomGroups.dispose();
    this.actors.dispose();
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
