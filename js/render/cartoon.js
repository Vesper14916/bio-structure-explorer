// Cartoon representation: one smooth backbone tube per strand through consecutive P atoms
// (C4'/C1' fallback), broken at inactive links / hidden nucleotides, plus a flat slab per
// base from C1' to its Watson-Crick edge. Rebuilt in place on every sync (no allocations).
import * as THREE from 'three';
import { writeCylinder, writeHidden, cylinderGeometry } from './util.js';

const S = 7;          // tube subdivisions per control-point span
const RAD = 10;       // radial segments
const TUBE_R = 1.05;
const PURINE = { A: 1, G: 1 };

class StrandTube {
  constructor(n, material) {
    this.n = n;
    this.capRings = 2 * n * S + 4 * n + 4;
    const nv = this.capRings * (RAD + 1);
    this.pos = new Float32Array(nv * 3);
    this.nrm = new Float32Array(nv * 3);
    this.col = new Float32Array(nv * 3);
    this.idx = new Uint32Array((this.capRings) * RAD * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(new THREE.BufferAttribute(this.idx, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.geometry = g;
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false;
    // control points (max: every nucleotide + one O3' end point per run)
    this.cp = new Float32Array(2 * n * 3 + 6);
    this.cpNuc = new Int32Array(2 * n + 2);
    this.cpCount = 0;
  }
}

export class CartoonLayer {
  constructor(parent, tier) {
    this.group = new THREE.Group();
    this.group.name = 'cartoon';
    parent.add(this.group);
    this.tubeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.12, envMapIntensity: 1.0 });
    this.slabMat = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.04, envMapIntensity: 0.9 });
    this.boxGeo = new THREE.BoxGeometry(1, 1, 1);
    this.cylGeo = cylinderGeometry(tier);
    this.tubes = [];
    this._c = new Float64Array(3); this._d = new Float64Array(3);
  }

  setTier(tier) {
    const c = cylinderGeometry(tier);
    if (this.conn) this.conn.geometry = c;
    this.cylGeo.dispose(); this.cylGeo = c;
  }

  clear() {
    for (const t of this.tubes) { this.group.remove(t.mesh); t.geometry.dispose(); }
    this.tubes = [];
    for (const m of [this.slabs, this.conn]) if (m) { this.group.remove(m); m.dispose(); }
    this.slabs = this.conn = null;
  }

  setAssembly(asm) {
    this.clear();
    this.asm = asm;
    const n = asm.nucleotides.length;
    for (const s of asm.strands) {
      const t = new StrandTube(s ? s.length : 0, this.tubeMat);
      this.tubes.push(t); this.group.add(t.mesh);
    }
    // link from the 5' neighbour, per nucleotide
    this.prevLink = new Array(n).fill(null);
    for (const l of asm.links) this.prevLink[l.to] = l;
    // control-point atom per nucleotide, its O3' (tube end) and C1'
    this.cpAtom = new Int32Array(n); this.o3Atom = new Int32Array(n); this.c1Atom = new Int32Array(n);
    this.local = new Float32Array(n * 16);
    for (const nu of asm.nucleotides) {
      const p = asm.atomOf(nu.id, 'P'), c4 = asm.atomOf(nu.id, "C4'"), c1 = asm.atomOf(nu.id, "C1'");
      this.cpAtom[nu.id] = p >= 0 ? p : c4 >= 0 ? c4 : c1;
      const o3 = asm.atomOf(nu.id, "O3'"), c3 = asm.atomOf(nu.id, "C3'");
      this.o3Atom[nu.id] = o3 >= 0 ? o3 : c3;
      this.c1Atom[nu.id] = c1;
      this.slabLocal(nu, this.local, nu.id * 16);
    }
    const mk = count => {
      const m = new THREE.InstancedMesh(this.boxGeo, this.slabMat, Math.max(1, count));
      m.count = count; m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, count) * 3), 3);
      this.group.add(m); return m;
    };
    this.slabs = mk(n);
    this.conn = mk(n); this.conn.geometry = this.cylGeo;
  }

  /** Local (base-frame) box transform: C1' -> Watson-Crick edge atom, centred on the ring system. */
  slabLocal(nu, out, o) {
    const L = nu.local, ix = nm => nu.atomIndex[nm];
    const c1 = ix("C1'"), edge = ix(PURINE[nu.base] ? 'N1' : 'N3');
    let cx = 0, cy = 0, cnt = 0;
    for (let i = 0; i < nu.atomCount; i++) if (nu.part[i] === 0) { cx += L[i * 3]; cy += L[i * 3 + 1]; cnt++; }
    cx /= cnt || 1; cy /= cnt || 1;
    const ax = c1 !== undefined ? L[c1 * 3] : -2.48, ay = c1 !== undefined ? L[c1 * 3 + 1] : 5.37;
    const bx = edge !== undefined ? L[edge * 3] : 0, by = edge !== undefined ? L[edge * 3 + 1] : 1;
    let ux = bx - ax, uy = by - ay; const len = Math.hypot(ux, uy); ux /= len; uy /= len;
    const vx = uy, vy = -ux;                      // (v, u, z) right-handed
    const ext = len + 0.45;
    const mx = ax + ux * ext * 0.5, my = ay + uy * ext * 0.5;
    const off = (cx - mx) * vx + (cy - my) * vy;
    const w = PURINE[nu.base] ? 2.35 : 2.05, th = 0.78;
    out.set([vx * w, vy * w, 0, 0, ux * ext, uy * ext, 0, 0, 0, 0, th, 0, mx + vx * off, my + vy * off, 0, 1], o);
  }

  recolor(colors) {
    this.colors = colors;
    if (!this.slabs) return;
    const n = this.asm.nucleotides.length, sc = this.slabs.instanceColor.array, cc = this.conn.instanceColor.array, b = colors.nucBase;
    for (let i = 0; i < n * 3; i++) { sc[i] = b[i]; cc[i] = b[i] * 0.85; }
    this.slabs.instanceColor.needsUpdate = true;
    this.conn.instanceColor.needsUpdate = true;
  }

  update(pos, nucScale, nucOff, visible) {
    this.group.visible = visible;
    if (!visible || !this.asm) return;
    const asm = this.asm;
    for (let s = 0; s < asm.strands.length; s++) this.updateTube(this.tubes[s], asm.strands[s] || [], pos, nucScale);
    // slabs + connectors
    const sm = this.slabs.instanceMatrix.array, cm = this.conn.instanceMatrix.array, Lm = this.local;
    for (const nu of asm.nucleotides) {
      const i = nu.id, s = nucScale[i];
      if (s <= 0.001) { writeHidden(sm, i); writeHidden(cm, i); continue; }
      const R = nu.frame.R, F = nu.frame.o, o = i * 16;
      const ox = F[0] + nucOff[i * 3], oy = F[1] + nucOff[i * 3 + 1], oz = F[2] + nucOff[i * 3 + 2];
      for (let c = 0; c < 3; c++) {           // rotate the 3 basis columns, scale by opacity
        const x = Lm[o + c * 4], y = Lm[o + c * 4 + 1], z = Lm[o + c * 4 + 2];
        sm[o + c * 4] = (R[0] * x + R[1] * y + R[2] * z) * s;
        sm[o + c * 4 + 1] = (R[3] * x + R[4] * y + R[5] * z) * s;
        sm[o + c * 4 + 2] = (R[6] * x + R[7] * y + R[8] * z) * s;
        sm[o + c * 4 + 3] = 0;
      }
      const x = Lm[o + 12], y = Lm[o + 13], z = Lm[o + 14];
      sm[o + 12] = R[0] * x + R[1] * y + R[2] * z + ox;
      sm[o + 13] = R[3] * x + R[4] * y + R[5] * z + oy;
      sm[o + 14] = R[6] * x + R[7] * y + R[8] * z + oz;
      sm[o + 15] = 1;
      // connector: C1' -> tube (between this nucleotide's control point and its 3' neighbour's)
      const c1 = this.c1Atom[i];
      const a = this.cpAtom[i];
      if (c1 < 0 || a < 0) { writeHidden(cm, i); continue; }
      let tx = pos[a * 3], ty = pos[a * 3 + 1], tz = pos[a * 3 + 2];
      const strand = asm.strands[nu.strand], nextId = strand[nu.index + 1];
      const nl = nextId !== undefined ? this.prevLink[nextId] : null;
      const b = nl && nl.active && nucScale[nextId] > 0.001 ? this.cpAtom[nextId] : this.o3Atom[i];
      if (b >= 0) { tx = (tx + pos[b * 3]) * 0.5; ty = (ty + pos[b * 3 + 1]) * 0.5; tz = (tz + pos[b * 3 + 2]) * 0.5; }
      writeCylinder(cm, i, pos[c1 * 3], pos[c1 * 3 + 1], pos[c1 * 3 + 2], tx, ty, tz, 0.42 * s);
    }
    this.slabs.instanceMatrix.needsUpdate = true;
    this.conn.instanceMatrix.needsUpdate = true;
  }

  updateTube(T, strand, pos, nucScale) {
    const asm = this.asm, cp = T.cp, cn = T.cpNuc, col = this.colors ? this.colors.nucBack : null;
    let ring = 0, ip = 0, changed = false;
    const idx = T.idx;
    // walk the strand collecting runs of control points
    let runStart = 0; T.cpCount = 0;
    const flush = () => {
      const m = T.cpCount - runStart;
      if (m >= 2) {
        const r0 = ring;
        ring = this.emitRun(T, runStart, m, pos, nucScale, col, ring);
        for (let r = r0; r < ring - 1; r++) for (let k = 0; k < RAD; k++) {
          const v0 = r * (RAD + 1) + k, v1 = v0 + 1, v2 = v0 + RAD + 1, v3 = v2 + 1;
          if (idx[ip] !== v0 || idx[ip + 1] !== v1 || idx[ip + 2] !== v2 || idx[ip + 4] !== v3) changed = true;
          idx[ip++] = v0; idx[ip++] = v1; idx[ip++] = v2; idx[ip++] = v1; idx[ip++] = v3; idx[ip++] = v2;
        }
      }
      T.cpCount = runStart = T.cpCount;
    };
    const push = (atom, nucId) => {
      const k = T.cpCount++;
      cp[k * 3] = pos[atom * 3]; cp[k * 3 + 1] = pos[atom * 3 + 1]; cp[k * 3 + 2] = pos[atom * 3 + 2];
      cn[k] = nucId;
    };
    let prev = -1;
    for (let j = 0; j < strand.length; j++) {
      const id = strand[j], vis = nucScale[id] > 0.001;
      const l = this.prevLink[id];
      const joined = prev >= 0 && vis && l && l.from === prev && l.active;
      if (!joined && prev >= 0) {          // close the previous run with its O3'
        if (this.o3Atom[prev] >= 0) push(this.o3Atom[prev], prev);
        flush();
      }
      if (vis) { if (this.cpAtom[id] >= 0) push(this.cpAtom[id], id); prev = id; } else prev = -1;
    }
    if (prev >= 0) { if (this.o3Atom[prev] >= 0) push(this.o3Atom[prev], prev); flush(); }
    if (T.geometry.drawRange.count !== ip) changed = true;
    T.geometry.setDrawRange(0, ip);
    const a = T.geometry.attributes;
    a.position.needsUpdate = a.normal.needsUpdate = a.color.needsUpdate = ring > 0;
    if (changed) T.geometry.index.needsUpdate = true;
  }

  /** Emit tube rings for control points [s, s+m). Returns the next free ring index. */
  emitRun(T, s, m, pos, nucScale, col, ring) {
    const cp = T.cp, cn = T.cpNuc;
    let nx = 0, ny = 0, nz = 0;   // running normal (rotation-minimising by projection)
    let first = true;
    const P = (k, c) => {
      if (k < 0) return 2 * cp[(s) * 3 + c] - cp[(s + 1) * 3 + c];
      if (k >= m) return 2 * cp[(s + m - 1) * 3 + c] - cp[(s + m - 2) * 3 + c];
      return cp[(s + k) * 3 + c];
    };
    const startRing = ring;
    ring++;                                   // reserve the start cap ring
    for (let j = 0; j < m - 1; j++) {
      const last = j === m - 2;
      for (let q = 0; q <= (last ? S : S - 1); q++) {
        const t = q / S, t2 = t * t, t3 = t2 * t;
        let cx, cy, cz, tx, ty, tz;
        {
          const c = this._c, d = this._d;
          for (let a = 0; a < 3; a++) {
            const p0 = P(j - 1, a), p1 = P(j, a), p2 = P(j + 1, a), p3 = P(j + 2, a);
            c[a] = 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
            d[a] = 0.5 * ((-p0 + p2) + 2 * (2 * p0 - 5 * p1 + 4 * p2 - p3) * t + 3 * (-p0 + 3 * p1 - 3 * p2 + p3) * t2);
          }
          cx = c[0]; cy = c[1]; cz = c[2]; tx = d[0]; ty = d[1]; tz = d[2];
        }
        let tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
        if (first) {                          // any perpendicular
          if (Math.abs(tx) < 0.9) { nx = 0; ny = -tz; nz = ty; } else { nx = tz; ny = 0; nz = -tx; }
          first = false;
        }
        const dp = nx * tx + ny * ty + nz * tz;
        nx -= dp * tx; ny -= dp * ty; nz -= dp * tz;
        const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
        const bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx;
        const na = cn[s + j], nb = cn[s + j + 1];
        const sc = nucScale[na] + (nucScale[nb] - nucScale[na]) * t, r = TUBE_R * sc;
        this.writeRing(T, ring, cx, cy, cz, nx, ny, nz, bx, by, bz, r, col, na, nb, t);
        if (ring === startRing + 1) {         // start cap: zero-radius ring facing -T
          this.writeRing(T, startRing, cx, cy, cz, nx, ny, nz, bx, by, bz, 0, col, na, nb, t, -tx, -ty, -tz);
        }
        ring++;
        if (last && q === S) {
          this.writeRing(T, ring, cx, cy, cz, nx, ny, nz, bx, by, bz, 0, col, na, nb, t, tx, ty, tz);
          ring++;
        }
      }
    }
    return ring;
  }

  writeRing(T, ring, cx, cy, cz, nx, ny, nz, bx, by, bz, r, col, na, nb, t, fx, fy, fz) {
    const p = T.pos, n = T.nrm, c = T.col;
    let cr = 0.7, cg = 0.72, cb = 0.78;
    if (col) {
      cr = col[na * 3] + (col[nb * 3] - col[na * 3]) * t;
      cg = col[na * 3 + 1] + (col[nb * 3 + 1] - col[na * 3 + 1]) * t;
      cb = col[na * 3 + 2] + (col[nb * 3 + 2] - col[na * 3 + 2]) * t;
    }
    for (let k = 0; k <= RAD; k++) {
      const ang = (k / RAD) * Math.PI * 2, ca = Math.cos(ang), sa = Math.sin(ang);
      const dx = ca * nx + sa * bx, dy = ca * ny + sa * by, dz = ca * nz + sa * bz;
      const v = (ring * (RAD + 1) + k) * 3;
      p[v] = cx + dx * r; p[v + 1] = cy + dy * r; p[v + 2] = cz + dz * r;
      if (fx !== undefined) { n[v] = fx; n[v + 1] = fy; n[v + 2] = fz; } else { n[v] = dx; n[v + 1] = dy; n[v + 2] = dz; }
      c[v] = cr; c[v + 1] = cg; c[v + 2] = cb;
    }
  }

  dispose() {
    this.clear();
    this.tubeMat.dispose(); this.slabMat.dispose(); this.boxGeo.dispose(); this.cylGeo.dispose();
    this.group.removeFromParent();
  }
}
