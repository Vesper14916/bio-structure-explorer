// Scene dressing: procedural environment map, nucleus-like background, camera light rig,
// drifting out-of-focus solvent particles and the post-processing chain.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const BG_CENTER = 0x14284a, BG_EDGE = 0x03060d, FOG_COLOR = 0x0a1628;

// ---------------------------------------------------------------- environment
/** Small RoomEnvironment-like scene: gradient dome + a few soft emissive panels. */
export function buildEnvironment(renderer) {
  const scene = new THREE.Scene();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(50, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `varying vec3 vP; void main(){
        float h = vP.y;
        vec3 top = vec3(0.30, 0.42, 0.62), mid = vec3(0.05, 0.08, 0.14), bot = vec3(0.015, 0.02, 0.035);
        vec3 c = h > 0.0 ? mix(mid, top, pow(h, 0.8)) : mix(mid, bot, pow(-h, 0.6));
        gl_FragColor = vec4(c, 1.0); }`,
    }));
  scene.add(dome);
  const panel = (w, h, color, pos, look) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(...look); scene.add(m);
  };
  panel(30, 14, new THREE.Color(5.0, 4.6, 4.2), [6, 30, 12], [0, 0, 0]);     // warm soft-box above / front
  panel(14, 24, new THREE.Color(0.8, 1.6, 3.2), [-34, 4, -6], [0, 0, 0]);     // cool side panel
  panel(16, 10, new THREE.Color(2.6, 1.2, 2.6), [26, -6, -22], [0, 0, 0]);    // magenta kicker behind
  panel(30, 6, new THREE.Color(1.0, 2.2, 2.4), [0, -26, 14], [0, 0, 0]);      // teal bounce from below
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0.035);
  pmrem.dispose();
  scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  return rt;
}

/** Radial gradient background (dithered to avoid banding) as a screen-space texture. */
export function buildBackground() {
  const S = 512, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const c = new THREE.Color();
  const hex = h => '#' + h.toString(16).padStart(6, '0');
  const grad = g.createRadialGradient(S * 0.5, S * 0.42, 0, S * 0.5, S * 0.5, S * 0.75);
  grad.addColorStop(0, hex(BG_CENTER));
  grad.addColorStop(0.45, hex(0x0b1830));
  grad.addColorStop(1, hex(BG_EDGE));
  g.fillStyle = grad; g.fillRect(0, 0, S, S);
  // faint nebular blotches: chromatin-like out-of-focus haze
  const blot = (x, y, r, col, a) => {
    const gg = g.createRadialGradient(x, y, 0, x, y, r);
    c.setHex(col);
    gg.addColorStop(0, `rgba(${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0},${a})`);
    gg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gg; g.fillRect(0, 0, S, S);
  };
  blot(S * 0.18, S * 0.25, S * 0.35, 0x3a2a7a, 0.22);
  blot(S * 0.85, S * 0.7, S * 0.4, 0x0e5a6a, 0.2);
  blot(S * 0.7, S * 0.15, S * 0.25, 0x2a3f8a, 0.14);
  const img = g.getImageData(0, 0, S, S), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 3; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Key / fill / rim lights that ride with the camera so the molecule always reads well. */
export function buildLightRig(camera) {
  const rig = new THREE.Group();
  const key = new THREE.DirectionalLight(0xfff1e0, 2.3); key.position.set(-0.6, 0.9, 0.7);
  const fill = new THREE.DirectionalLight(0x9cc4ff, 0.7); fill.position.set(0.9, -0.2, 0.5);
  const rim = new THREE.DirectionalLight(0x66e0ff, 1.9); rim.position.set(0.3, 0.4, -1.0);
  const rim2 = new THREE.DirectionalLight(0xc58cff, 1.0); rim2.position.set(-0.8, -0.5, -0.7);
  // DirectionalLight targets default to the world origin; give each a camera-relative target.
  for (const l of [key, fill, rim, rim2]) { const t = new THREE.Object3D(); t.position.set(0, 0, 0); rig.add(t); l.target = t; rig.add(l); }
  for (const l of [key, fill, rim, rim2]) l.position.multiplyScalar(10);
  camera.add(rig);
  return rig;
}

// ---------------------------------------------------------------- particles
const particleVertex = /* glsl */`
attribute vec4 aSeed;           // size, phase, speed, kind
uniform float uTime;
uniform float uDrift;
uniform vec3 uBox;
uniform vec3 uCenter;
uniform float uPx;
uniform float uFocus;
varying float vAlpha;
varying float vBlur;
varying float vKind;
void main() {
  vec3 p = position * uBox;
  float ph = aSeed.y, sp = aSeed.z;
  p += uDrift * vec3(sin(uTime * 0.11 * sp + ph) * 6.0, uTime * 0.6 * sp + sin(uTime * 0.07 + ph * 2.0) * 4.0, cos(uTime * 0.09 * sp + ph * 1.7) * 6.0);
  p = mod(p + uBox, 2.0 * uBox) - uBox + uCenter;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float depth = max(-mv.z, 0.5);
  float blur = clamp(abs(depth - uFocus) / (uFocus * 0.8), 0.0, 1.0);
  vBlur = blur; vKind = aSeed.w;
  float size = aSeed.x * (1.0 + 3.0 * blur);
  gl_PointSize = clamp(size * uPx / depth, 1.0, 96.0);
  float nearFade = smoothstep(uFocus * 0.12, uFocus * 0.6, depth);
  float farFade = 1.0 - smoothstep(uFocus * 2.2, uFocus * 3.2, depth);
  vAlpha = nearFade * farFade / (1.0 + 4.0 * blur * blur);
  gl_Position = projectionMatrix * mv;
}`;
const particleFragment = /* glsl */`
uniform float uIntensity;
varying float vAlpha;
varying float vBlur;
varying float vKind;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  if (d > 1.0) discard;
  float soft = 1.0 - smoothstep(mix(0.25, 0.75, vBlur), 1.0, d);
  float ring = smoothstep(0.55, 0.92, d) * (1.0 - smoothstep(0.92, 1.0, d)) * vBlur * 0.6;
  vec3 col = vKind < 0.5 ? vec3(0.45, 0.75, 1.0) : (vKind < 1.5 ? vec3(0.75, 0.55, 1.0) : vec3(0.45, 1.0, 0.75));
  float a = (soft * (0.65 - 0.35 * vBlur) + ring) * vAlpha * uIntensity;
  gl_FragColor = vec4(col * a, 1.0);
}`;

export class Particles {
  constructor(max) {
    this.max = max;
    const pos = new Float32Array(max * 3), seed = new Float32Array(max * 4);
    for (let i = 0; i < max; i++) {
      pos[i * 3] = Math.random() * 2 - 1; pos[i * 3 + 1] = Math.random() * 2 - 1; pos[i * 3 + 2] = Math.random() * 2 - 1;
      const r = Math.random(), kind = r < 0.82 ? 0 : r < 0.92 ? 1 : 2;          // water, Na+, Cl-
      seed[i * 4] = kind === 0 ? 0.5 + Math.random() * 0.9 : 0.9 + Math.random() * 0.8;
      seed[i * 4 + 1] = Math.random() * 6.283; seed[i * 4 + 2] = 0.4 + Math.random(); seed[i * 4 + 3] = kind;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uDrift: { value: 1 }, uBox: { value: new THREE.Vector3(80, 80, 80) },
        uCenter: { value: new THREE.Vector3() }, uPx: { value: 500 }, uFocus: { value: 80 }, uIntensity: { value: 0.42 },
      },
      vertexShader: particleVertex, fragmentShader: particleFragment,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 8;
    this.geometry = g;
  }
  setCount(n) { this.geometry.setDrawRange(0, Math.min(n, this.max)); }
  dispose() { this.geometry.dispose(); this.material.dispose(); this.points.removeFromParent(); }
}

// ---------------------------------------------------------------- post
const FinishShader = {
  uniforms: { tDiffuse: { value: null }, uVignette: { value: 0.55 }, uAspect: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uVignette; uniform float uAspect; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 q = (vUv - 0.5) * vec2(max(uAspect, 1.0), max(1.0 / uAspect, 1.0));
      float v = smoothstep(1.05, 0.25, length(q) * 1.15);
      c.rgb *= mix(1.0, v, uVignette);
      gl_FragColor = c;
    }`,
};

export class Post {
  constructor(renderer, scene, camera, tier) {
    this.renderer = renderer; this.scene = scene; this.camera = camera;
    this.build(tier);
  }
  build(tier) {
    this.tier = tier;
    const r = this.renderer, size = r.getSize(new THREE.Vector2()), pr = r.getPixelRatio();
    const samples = tier === 'low' ? 0 : 4;
    const rt = new THREE.WebGLRenderTarget(Math.max(1, size.x * pr), Math.max(1, size.y * pr), { type: THREE.HalfFloatType, samples });
    this.composer = new EffectComposer(r, rt);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(size.x, size.y);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.5, 1.05);
    const scale = tier === 'high' ? 1 : 0.75, orig = this.bloom.setSize.bind(this.bloom);
    this.bloom.setSize = (w, h) => orig(Math.max(2, Math.round(w * scale)), Math.max(2, Math.round(h * scale)));
    this.bloom.enabled = tier !== 'low';
    this.composer.addPass(this.bloom);
    this.finish = new ShaderPass(FinishShader);
    this.composer.addPass(this.finish);
    this.composer.addPass(new OutputPass());
    this.composer.setSize(size.x, size.y);
  }
  rebuild(tier) { this.dispose(); this.build(tier); }
  setSize(w, h, pr) {
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.finish.uniforms.uAspect.value = w / Math.max(1, h);
  }
  render(dt) { this.composer.render(dt); }
  dispose() {
    for (const p of this.composer.passes) if (p.dispose) p.dispose();
    this.composer.dispose();
  }
}
