// Procedural atom-group renderer: instanced ball-and-stick atoms, covalent half-bonds,
// and peptide C-alpha cartoon tubes with beads, supporting per-residue detail-sphere
// cross-fade (12 angstrom band) and locked Helix colour schemes (PLAN.md §4.3-§4.4).
import * as THREE from 'three';
import { ELEMENT_INFO, AMINO_ACIDS } from '../science/index.js';
import { EXPRESSION_HEX } from './colors.js';
import { BALL_SCALE, BOND_RADIUS, PEPTIDE_BOND_RADIUS, computeDetailWeight } from './molecule.js';
import { writeSphere, writeCylinder, writeHidden, clamp, sphereGeometry, cylinderGeometry } from './util.js';

const TUBE_SUBDIV = 5;
const TUBE_RAD = 10;
const CA_BEAD_RADIUS = 0.85;

// Locked element radii (angstroms) and sRGB hex colours (PLAN.md §4.3, CONTRACTS.md §6.4).
const ELEMENT_VDW = {
  C: ELEMENT_INFO.C.vdw,
  N: ELEMENT_INFO.N.vdw,
  O: ELEMENT_INFO.O.vdw,
  P: ELEMENT_INFO.P.vdw,
  S: 1.80,
  MG: 1.73,
  ZN: 1.39,
  H: 1.20,
};
const OTHER_VDW = 1.60;

const ELEMENT_HEX = {
  C: ELEMENT_INFO.C.color,
  N: ELEMENT_INFO.N.color,
  O: ELEMENT_INFO.O.color,
  P: ELEMENT_INFO.P.color,
  S: 0xe6c84a,
  MG: 0x7dff7a,
  ZN: 0x8f9cc9,
};
const OTHER_HEX = 0xb0b8c8;

const BACKBONE_ATOMS = new Set(['N', 'CA', 'C', 'O']);

// Case-insensitive amino acid colour lookup from AMINO_ACIDS (handles 'FME', 'fMet', 'ALA', 'Ala', 'A', etc.).
const AA_HEX = Object.create(null);
for (const [key, info] of Object.entries(AMINO_ACIDS)) {
  if (!info || typeof info.color !== 'number') continue;
  AA_HEX[key.toUpperCase()] = info.color;
  if (info.code3) AA_HEX[info.code3.toUpperCase()] = info.color;
  if (info.code1 && key !== 'fMet') AA_HEX[info.code1.toUpperCase()] = info.color;
}
if (AMINO_ACIDS.fMet) {
  AA_HEX.FME = AMINO_ACIDS.fMet.color;
  AA_HEX.FMET = AMINO_ACIDS.fMet.color;
}

const WHITE = new THREE.Color(0xffffff);
const tmpColor = new THREE.Color();

function elementVdw(el) {
  if (!el) return OTHER_VDW;
  const k = String(el).trim().toUpperCase();
  return ELEMENT_VDW[k] ?? OTHER_VDW;
}

function elementHex(el) {
  if (!el) return OTHER_HEX;
  const k = String(el).trim().toUpperCase();
  return ELEMENT_HEX[k] ?? OTHER_HEX;
}

function aminoAcidHex(res) {
  if (!res) return EXPRESSION_HEX.peptide;
  const key = res.code3 || res.aa || res.code1 || '';
  if (!key) return EXPRESSION_HEX.peptide;
  return AA_HEX[String(key).trim().toUpperCase()] ?? EXPRESSION_HEX.peptide;
}

function writeLinearColor(arr, i, hex, lightenWhite = 0) {
  tmpColor.setHex(hex);
  if (lightenWhite > 0) tmpColor.lerp(WHITE, lightenWhite);
  arr[i * 3] = tmpColor.r;
  arr[i * 3 + 1] = tmpColor.g;
  arr[i * 3 + 2] = tmpColor.b;
}

function normalizeFocus(focus) {
  if (!focus || !focus.center) return null;
  const c = focus.center;
  return {
    center: [c[0] ?? c.x ?? 0, c[1] ?? c.y ?? 0, c[2] ?? c.z ?? 0],
    radius: Math.max(0, Number(focus.radius) || 0),
  };
}

class PeptideTube {
  constructor(resCap, material) {
    this.capRings = resCap * TUBE_SUBDIV + 4 * resCap + 4;
    const nv = this.capRings * (TUBE_RAD + 1);
    this.pos = new Float32Array(nv * 3);
    this.nrm = new Float32Array(nv * 3);
    this.col = new Float32Array(nv * 3);
    this.idx = new Uint32Array(this.capRings * TUBE_RAD * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(new THREE.BufferAttribute(this.idx, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.geometry = g;
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false;
    this.cp = new Float32Array(resCap * 3 + 6);
    this.cpRes = new Int32Array(resCap + 2);
    this.cpCount = 0;
    this._c = new Float64Array(3);
    this._d = new Float64Array(3);
  }

  update(nr, caPos, resCw, resCol) {
    const cp = this.cp, cr = this.cpRes, idx = this.idx;
    let ring = 0, ip = 0, changed = false;
    let runStart = 0;
    this.cpCount = 0;

    const flush = () => {
      const m = this.cpCount - runStart;
      if (m >= 2) {
        const r0 = ring;
        ring = this.emitRun(runStart, m, resCw, resCol, ring);
        for (let r = r0; r < ring - 1; r++) {
          for (let k = 0; k < TUBE_RAD; k++) {
            const v0 = r * (TUBE_RAD + 1) + k;
            const v1 = v0 + 1;
            const v2 = v0 + TUBE_RAD + 1;
            const v3 = v2 + 1;
            if (idx[ip] !== v0 || idx[ip + 1] !== v1 || idx[ip + 2] !== v2 || idx[ip + 4] !== v3) changed = true;
            idx[ip++] = v0; idx[ip++] = v1; idx[ip++] = v2;
            idx[ip++] = v1; idx[ip++] = v3; idx[ip++] = v2;
          }
        }
      }
      runStart = this.cpCount;
    };

    for (let r = 0; r < nr; r++) {
      if (resCw[r] > 0.001) {
        const k = this.cpCount++;
        cp[k * 3] = caPos[r * 3];
        cp[k * 3 + 1] = caPos[r * 3 + 1];
        cp[k * 3 + 2] = caPos[r * 3 + 2];
        cr[k] = r;
      } else {
        flush();
      }
    }
    flush();

    if (this.geometry.drawRange.count !== ip) changed = true;
    this.geometry.setDrawRange(0, ip);
    this.mesh.visible = ip > 0;
    const a = this.geometry.attributes;
    a.position.needsUpdate = a.normal.needsUpdate = a.color.needsUpdate = ring > 0;
    if (changed) this.geometry.index.needsUpdate = true;
  }

  emitRun(s, m, resCw, resCol, ring) {
    const cp = this.cp, cr = this.cpRes;
    let nx = 0, ny = 0, nz = 0;
    let first = true;
    const P = (k, c) => {
      if (k < 0) return 2 * cp[s * 3 + c] - cp[(s + 1) * 3 + c];
      if (k >= m) return 2 * cp[(s + m - 1) * 3 + c] - cp[(s + m - 2) * 3 + c];
      return cp[(s + k) * 3 + c];
    };
    const startRing = ring;
    ring++;
    for (let j = 0; j < m - 1; j++) {
      const last = j === m - 2;
      for (let q = 0; q <= (last ? TUBE_SUBDIV : TUBE_SUBDIV - 1); q++) {
        const t = q / TUBE_SUBDIV, t2 = t * t, t3 = t2 * t;
        const c = this._c, d = this._d;
        for (let a = 0; a < 3; a++) {
          const p0 = P(j - 1, a), p1 = P(j, a), p2 = P(j + 1, a), p3 = P(j + 2, a);
          c[a] = 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
          d[a] = 0.5 * ((-p0 + p2) + 2 * (2 * p0 - 5 * p1 + 4 * p2 - p3) * t + 3 * (-p0 + 3 * p1 - 3 * p2 + p3) * t2);
        }
        const cx = c[0], cy = c[1], cz = c[2];
        let tx = d[0], ty = d[1], tz = d[2];
        const tl = Math.hypot(tx, ty, tz) || 1;
        tx /= tl; ty /= tl; tz /= tl;
        if (first) {
          if (Math.abs(tx) < 0.9) { nx = 0; ny = -tz; nz = ty; }
          else { nx = tz; ny = 0; nz = -tx; }
          first = false;
        }
        const dp = nx * tx + ny * ty + nz * tz;
        nx -= dp * tx; ny -= dp * ty; nz -= dp * tz;
        const nl = Math.hypot(nx, ny, nz) || 1;
        nx /= nl; ny /= nl; nz /= nl;
        const bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx;
        const ra = cr[s + j], rb = cr[s + j + 1];
        const sc = resCw[ra] + (resCw[rb] - resCw[ra]) * t;
        const r = PEPTIDE_BOND_RADIUS * sc;
        this.writeRing(ring, cx, cy, cz, nx, ny, nz, bx, by, bz, r, resCol, ra, rb, t);
        if (ring === startRing + 1) {
          this.writeRing(startRing, cx, cy, cz, nx, ny, nz, bx, by, bz, 0, resCol, ra, rb, t, -tx, -ty, -tz);
        }
        ring++;
        if (last && q === TUBE_SUBDIV) {
          this.writeRing(ring, cx, cy, cz, nx, ny, nz, bx, by, bz, 0, resCol, ra, rb, t, tx, ty, tz);
          ring++;
        }
      }
    }
    return ring;
  }

  writeRing(ring, cx, cy, cz, nx, ny, nz, bx, by, bz, r, col, ra, rb, t, fx, fy, fz) {
    const p = this.pos, n = this.nrm, c = this.col;
    const cr = col[ra * 3] + (col[rb * 3] - col[ra * 3]) * t;
    const cg = col[ra * 3 + 1] + (col[rb * 3 + 1] - col[ra * 3 + 1]) * t;
    const cb = col[ra * 3 + 2] + (col[rb * 3 + 2] - col[ra * 3 + 2]) * t;
    for (let k = 0; k <= TUBE_RAD; k++) {
      const ang = (k / TUBE_RAD) * Math.PI * 2;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const dx = ca * nx + sa * bx, dy = ca * ny + sa * by, dz = ca * nz + sa * bz;
      const v = (ring * (TUBE_RAD + 1) + k) * 3;
      p[v] = cx + dx * r; p[v + 1] = cy + dy * r; p[v + 2] = cz + dz * r;
      if (fx !== undefined) { n[v] = fx; n[v + 1] = fy; n[v + 2] = fz; }
      else { n[v] = dx; n[v + 1] = dy; n[v + 2] = dz; }
      c[v] = cr; c[v + 1] = cg; c[v + 2] = cb;
    }
  }

  dispose() {
    this.geometry.dispose();
  }
}

/**
 * Instanced ball-and-stick and cartoon layer for dynamic procedural atom groups
 * (`{ id, count, pos, el, bonds, color?, opacity?, detail?, residues?, names?, kind? }`).
 */
export class AtomGroupLayer {
  constructor(parentOrOpts = null, tier = 'high') {
    let parent = null;
    let initTier = tier;
    if (parentOrOpts && typeof parentOrOpts === 'object' && !parentOrOpts.isObject3D) {
      parent = parentOrOpts.parent || null;
      if (parentOrOpts.tier) initTier = parentOrOpts.tier;
    } else {
      parent = parentOrOpts;
    }
    this.group = new THREE.Group();
    this.group.name = 'atom-groups';
    if (parent && typeof parent.add === 'function') parent.add(this.group);
    this.tier = initTier;
    this.style = { representation: 'ballstick', color: 'strand' };
    this.detailFocus = null;
    this.records = new Map();

    // Exact MoleculeLayer material parameters (PLAN.md §4.4).
    this.atomMat = new THREE.MeshStandardMaterial({ roughness: 0.32, metalness: 0.06, envMapIntensity: 1.0 });
    this.bondMat = new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0.05, envMapIntensity: 0.9 });
    this.beadMat = new THREE.MeshStandardMaterial({ roughness: 0.24, metalness: 0.12, envMapIntensity: 1.15 });
    this.tubeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.12, envMapIntensity: 1.0 });

    this.sphereGeo = sphereGeometry(this.tier);
    this.cylGeo = cylinderGeometry(this.tier);
  }

  setTier(tier) {
    if (tier === this.tier) return;
    this.tier = tier;
    const s = sphereGeometry(tier), c = cylinderGeometry(tier);
    for (const rec of this.records.values()) {
      rec.atoms.geometry = s;
      rec.bonds.geometry = c;
      if (rec.beads) rec.beads.geometry = s;
    }
    this.sphereGeo.dispose();
    this.cylGeo.dispose();
    this.sphereGeo = s;
    this.cylGeo = c;
  }

  setDetailFocus(focus) {
    this.detailFocus = normalizeFocus(focus);
    this.update();
  }

  setStyle(style = {}) {
    if (!style) return;
    this.style = { ...this.style, ...style };
    this.update();
  }

  setGroups(groups, style) {
    if (style) this.style = { ...this.style, ...style };
    const list = Array.isArray(groups) ? groups : [];
    const seen = new Set();

    for (const g of list) {
      if (!g || g.id == null) continue;
      const id = String(g.id);
      seen.add(id);

      const posLen = g.pos ? Math.floor(g.pos.length / 3) : 0;
      const count = Math.max(0, Math.min(Number(g.count) || 0, posLen));
      const nb = g.bonds ? Math.floor(g.bonds.length / 2) : 0;
      const residues = this._resolveResidues(g, count);
      const isPeptide = g.kind === 'peptide' || (residues !== null && residues.length > 0);
      const nr = residues ? residues.length : 0;

      let rec = this.records.get(id);
      if (
        !rec ||
        rec.isPeptide !== isPeptide ||
        rec.atomCap < count ||
        rec.bondCap < nb ||
        rec.resCap < nr
      ) {
        if (rec) this._disposeRecord(rec);
        rec = this._createRecord(id, count, nb, isPeptide, nr);
        this.records.set(id, rec);
      }
      rec.desc = g;
      rec.count = count;
      rec.nb = nb;
      rec.residues = residues;
      rec.nr = nr;
      rec.atoms.count = count;
      rec.bonds.count = nb * 2;
      if (rec.beads) rec.beads.count = nr;
    }

    for (const [id, rec] of this.records) {
      if (!seen.has(id)) {
        this._disposeRecord(rec);
        this.records.delete(id);
      }
    }

    this.update();
  }

  _resolveResidues(g, count) {
    if (Array.isArray(g.residues) && g.residues.length > 0) return g.residues;
    if (g.kind !== 'peptide' || count === 0) return null;
    const names = g.names || g.name;
    if (!names) return null;
    // Fallback when a peptide group supplies atom names with 'CA' but no explicit residues array.
    const cas = [];
    for (let i = 0; i < count; i++) {
      if (names[i] === 'CA') cas.push(i);
    }
    if (!cas.length) return null;
    const res = [];
    for (let r = 0; r < cas.length; r++) {
      const start = r === 0 ? 0 : Math.max(0, cas[r] - 1);
      const end = r + 1 < cas.length ? Math.max(start + 1, cas[r + 1] - 1) : count;
      res.push({ index: r, atomStart: start, atomCount: end - start });
    }
    return res;
  }

  _createRecord(id, count, nb, isPeptide, nr) {
    const atomCap = Math.max(1, count);
    const bondCap = Math.max(1, nb);
    const resCap = Math.max(1, nr);

    const mkInst = (geo, mat, cap) => {
      const m = new THREE.InstancedMesh(geo, mat, cap);
      m.count = 0;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      m.frustumCulled = false;
      this.group.add(m);
      return m;
    };

    const rec = {
      id,
      isPeptide,
      atomCap,
      bondCap,
      resCap,
      count: 0,
      nb: 0,
      nr: 0,
      desc: null,
      residues: null,
      atoms: mkInst(this.sphereGeo, this.atomMat, atomCap),
      bonds: mkInst(this.cylGeo, this.bondMat, bondCap * 2),
      beads: null,
      tube: null,
      resWeight: null,
      resCw: null,
      resCol: null,
      caPos: null,
      atomRes: null,
      trans: null,
    };

    if (isPeptide) {
      rec.beads = mkInst(this.sphereGeo, this.beadMat, resCap);
      rec.tube = new PeptideTube(resCap, this.tubeMat);
      this.group.add(rec.tube.mesh);
      rec.resWeight = new Float32Array(resCap);
      rec.resCw = new Float32Array(resCap);
      rec.resCol = new Float32Array(resCap * 3);
      rec.caPos = new Float32Array(resCap * 3);
      rec.atomRes = new Int32Array(atomCap);
    }

    return rec;
  }

  _applyOpacity(rec, op) {
    if (op >= 0.999) {
      rec.atoms.material = this.atomMat;
      rec.bonds.material = this.bondMat;
      if (rec.beads) rec.beads.material = this.beadMat;
      if (rec.tube) rec.tube.mesh.material = this.tubeMat;
      if (rec.trans) {
        this._disposeTranslucent(rec.trans);
        rec.trans = null;
      }
      return;
    }
    if (!rec.trans) {
      const mk = base => {
        const m = base.clone();
        m.transparent = true;
        m.depthWrite = false;
        m.opacity = op;
        return m;
      };
      rec.trans = {
        atom: mk(this.atomMat),
        bond: mk(this.bondMat),
        bead: rec.beads ? mk(this.beadMat) : null,
        tube: rec.tube ? mk(this.tubeMat) : null,
      };
      rec.atoms.material = rec.trans.atom;
      rec.bonds.material = rec.trans.bond;
      if (rec.beads) rec.beads.material = rec.trans.bead;
      if (rec.tube) rec.tube.mesh.material = rec.trans.tube;
    } else {
      rec.trans.atom.opacity = op;
      rec.trans.bond.opacity = op;
      if (rec.trans.bead) rec.trans.bead.opacity = op;
      if (rec.trans.tube) rec.trans.tube.opacity = op;
    }
  }

  _disposeTranslucent(trans) {
    trans.atom.dispose();
    trans.bond.dispose();
    if (trans.bead) trans.bead.dispose();
    if (trans.tube) trans.tube.dispose();
  }

  _disposeRecord(rec) {
    this.group.remove(rec.atoms);
    rec.atoms.dispose();
    this.group.remove(rec.bonds);
    rec.bonds.dispose();
    if (rec.beads) {
      this.group.remove(rec.beads);
      rec.beads.dispose();
    }
    if (rec.tube) {
      this.group.remove(rec.tube.mesh);
      rec.tube.dispose();
    }
    if (rec.trans) {
      this._disposeTranslucent(rec.trans);
      rec.trans = null;
    }
  }

  update() {
    if (this.records.size === 0) return;
    for (const rec of this.records.values()) {
      this._updateRecord(rec);
    }
  }

  _updateRecord(rec) {
    const g = rec.desc;
    if (!g) return;
    const op = g.visible === false ? 0 : clamp(g.opacity ?? 1, 0, 1);
    const count = rec.count;
    if (op <= 0.001 || count === 0) {
      rec.atoms.visible = false;
      rec.bonds.visible = false;
      if (rec.beads) rec.beads.visible = false;
      if (rec.tube) rec.tube.mesh.visible = false;
      return;
    }

    this._applyOpacity(rec, op);

    const pos = g.pos;
    const el = g.el || [];
    const names = g.names || g.name || null;
    const bonds = g.bonds;
    const nb = rec.nb;
    const scheme = this.style.color || 'strand';
    const rep = this.style.representation || 'ballstick';
    const df = this.detailFocus;
    const detailMode = g.detail || 'auto';

    if (rec.isPeptide && rec.nr > 0) {
      this._updatePeptide(rec, g, pos, el, names, bonds, nb, scheme, rep, df, detailMode);
    } else {
      this._updatePlainGroup(rec, g, pos, el, bonds, nb, scheme, rep, df, detailMode);
    }
  }

  _updatePeptide(rec, g, pos, el, names, bonds, nb, scheme, rep, df, detailMode) {
    const count = rec.count;
    const residues = rec.residues;
    const nr = rec.nr;
    const atomRes = rec.atomRes;
    const resWeight = rec.resWeight;
    const resCw = rec.resCw;
    const resCol = rec.resCol;
    const caPos = rec.caPos;

    // Map each atom to its residue index and extract live C-alpha coordinates.
    atomRes.fill(0, 0, count);
    for (let r = 0; r < nr; r++) {
      const res = residues[r];
      const start = Math.max(0, Math.min(count, res.atomStart ?? 0));
      const end = Math.max(start, Math.min(count, start + (res.atomCount ?? 0)));
      let caIdx = -1;
      for (let i = start; i < end; i++) {
        atomRes[i] = r;
        if (caIdx < 0 && names && names[i] === 'CA') caIdx = i;
      }
      if (caIdx >= 0) {
        caPos[r * 3] = pos[caIdx * 3];
        caPos[r * 3 + 1] = pos[caIdx * 3 + 1];
        caPos[r * 3 + 2] = pos[caIdx * 3 + 2];
      } else if (res.ca && res.ca.length >= 3) {
        caPos[r * 3] = res.ca[0];
        caPos[r * 3 + 1] = res.ca[1];
        caPos[r * 3 + 2] = res.ca[2];
      } else if (start < count) {
        caPos[r * 3] = pos[start * 3];
        caPos[r * 3 + 1] = pos[start * 3 + 1];
        caPos[r * 3 + 2] = pos[start * 3 + 2];
      }
    }
    if (g.residue && g.residue.length >= count) {
      for (let i = 0; i < count; i++) {
        const r = g.residue[i];
        if (r >= 0 && r < nr) atomRes[i] = r;
      }
    }

    // Per-residue detail weight (1 = ball-and-stick, 0 = C-alpha cartoon).
    let maxW = 0, maxCw = 0;
    for (let r = 0; r < nr; r++) {
      let w;
      if (detailMode === 'ballstick') {
        w = 1;
      } else if (detailMode === 'cartoon') {
        w = 0;
      } else if (df !== null) {
        w = computeDetailWeight(
          caPos[r * 3] - df.center[0],
          caPos[r * 3 + 1] - df.center[1],
          caPos[r * 3 + 2] - df.center[2],
          df.radius,
        );
      } else {
        w = rep === 'cartoon' ? 0 : 1;
      }
      resWeight[r] = w;
      const cw = 1 - w;
      resCw[r] = cw;
      if (w > maxW) maxW = w;
      if (cw > maxCw) maxCw = cw;
    }

    // Colours per residue (for cartoon tube + beads) and per atom (for ball-and-stick).
    const baseHex = g.color ?? EXPRESSION_HEX.peptide;
    const bc = rec.beads.instanceColor.array;
    for (let r = 0; r < nr; r++) {
      let hex;
      if (scheme === 'codon') hex = aminoAcidHex(residues[r]);
      else if (scheme === 'element') hex = ELEMENT_INFO.C.color;
      else hex = baseHex;
      writeLinearColor(resCol, r, hex, 0);
      bc[r * 3] = resCol[r * 3];
      bc[r * 3 + 1] = resCol[r * 3 + 1];
      bc[r * 3 + 2] = resCol[r * 3 + 2];
    }
    rec.beads.instanceColor.needsUpdate = true;

    const ac = rec.atoms.instanceColor.array;
    for (let i = 0; i < count; i++) {
      const r = atomRes[i];
      if (scheme === 'strand') {
        const isBB = names && BACKBONE_ATOMS.has(names[i]);
        writeLinearColor(ac, i, baseHex, isBB ? 0 : 0.35);
      } else if (scheme === 'codon') {
        writeLinearColor(ac, i, aminoAcidHex(residues[r]), 0);
      } else {
        writeLinearColor(ac, i, elementHex(el[i]), 0);
      }
    }
    rec.atoms.instanceColor.needsUpdate = true;

    // Ball-and-stick atoms & half-bonds.
    const atomsOn = maxW > 0.001;
    const bondsOn = atomsOn && nb > 0 && !(df === null && rep === 'spacefill');
    rec.atoms.visible = atomsOn;
    rec.bonds.visible = bondsOn;

    if (atomsOn) {
      const am = rec.atoms.instanceMatrix.array;
      const ballScale = df === null && rep === 'spacefill' ? 1 : BALL_SCALE;
      for (let i = 0; i < count; i++) {
        const w = resWeight[atomRes[i]];
        if (w <= 0.001) {
          writeHidden(am, i);
        } else {
          writeSphere(am, i, pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], elementVdw(el[i]) * ballScale * w);
        }
      }
      rec.atoms.instanceMatrix.needsUpdate = true;
    }

    if (bondsOn) {
      const bm = rec.bonds.instanceMatrix.array;
      const bcol = rec.bonds.instanceColor.array;
      for (let i = 0; i < nb; i++) {
        const a = bonds[2 * i], b = bonds[2 * i + 1];
        if (a < 0 || b < 0 || a >= count || b >= count) {
          writeHidden(bm, 2 * i);
          writeHidden(bm, 2 * i + 1);
          continue;
        }
        const s = Math.min(resWeight[atomRes[a]], resWeight[atomRes[b]]);
        this._writeHalfBond(bm, bcol, ac, i, pos, a, b, s);
      }
      rec.bonds.instanceMatrix.needsUpdate = true;
      rec.bonds.instanceColor.needsUpdate = true;
    }

    // Cartoon C-alpha tube & beads (complement weight 1 - weight).
    const cartoonOn = maxCw > 0.001;
    rec.beads.visible = cartoonOn;
    if (cartoonOn) {
      const rm = rec.beads.instanceMatrix.array;
      for (let r = 0; r < nr; r++) {
        const cw = resCw[r];
        if (cw <= 0.001) {
          writeHidden(rm, r);
        } else {
          writeSphere(rm, r, caPos[r * 3], caPos[r * 3 + 1], caPos[r * 3 + 2], CA_BEAD_RADIUS * cw);
        }
      }
      rec.beads.instanceMatrix.needsUpdate = true;
      rec.tube.update(nr, caPos, resCw, resCol);
    } else {
      rec.tube.mesh.visible = false;
    }
  }

  _updatePlainGroup(rec, g, pos, el, bonds, nb, scheme, rep, df, detailMode) {
    const count = rec.count;
    let w;
    if (detailMode === 'ballstick') {
      w = 1;
    } else if (detailMode === 'cartoon') {
      w = 0;
    } else if (df !== null) {
      if (!(df.radius > 0)) {
        w = 0;
      } else {
        let cx = 0, cy = 0, cz = 0;
        for (let i = 0; i < count; i++) {
          cx += pos[i * 3]; cy += pos[i * 3 + 1]; cz += pos[i * 3 + 2];
        }
        const inv = 1 / count;
        w = computeDetailWeight(cx * inv - df.center[0], cy * inv - df.center[1], cz * inv - df.center[2], df.radius);
      }
    } else {
      w = 1;
    }

    const atomsOn = w > 0.001;
    const bondsOn = atomsOn && nb > 0 && !(df === null && rep === 'spacefill');
    rec.atoms.visible = atomsOn;
    rec.bonds.visible = bondsOn;
    if (!atomsOn) return;

    const ac = rec.atoms.instanceColor.array;
    const useGroupColor = (scheme === 'strand' || scheme === 'codon') && g.color !== undefined && g.color !== null;
    for (let i = 0; i < count; i++) {
      writeLinearColor(ac, i, useGroupColor ? g.color : elementHex(el[i]), 0);
    }
    rec.atoms.instanceColor.needsUpdate = true;

    const am = rec.atoms.instanceMatrix.array;
    const ballScale = df === null && rep === 'spacefill' ? 1 : BALL_SCALE;
    for (let i = 0; i < count; i++) {
      writeSphere(am, i, pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], elementVdw(el[i]) * ballScale * w);
    }
    rec.atoms.instanceMatrix.needsUpdate = true;

    if (bondsOn) {
      const bm = rec.bonds.instanceMatrix.array;
      const bcol = rec.bonds.instanceColor.array;
      for (let i = 0; i < nb; i++) {
        const a = bonds[2 * i], b = bonds[2 * i + 1];
        if (a < 0 || b < 0 || a >= count || b >= count) {
          writeHidden(bm, 2 * i);
          writeHidden(bm, 2 * i + 1);
          continue;
        }
        this._writeHalfBond(bm, bcol, ac, i, pos, a, b, w);
      }
      rec.bonds.instanceMatrix.needsUpdate = true;
      rec.bonds.instanceColor.needsUpdate = true;
    }
  }

  _writeHalfBond(bm, bcol, ac, i, pos, a, b, s) {
    const i0 = 2 * i, i1 = i0 + 1;
    if (s <= 0.001) {
      writeHidden(bm, i0);
      writeHidden(bm, i1);
      return;
    }
    const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
    const bx = pos[b * 3], by = pos[b * 3 + 1], bz = pos[b * 3 + 2];
    const mx = (ax + bx) * 0.5, my = (ay + by) * 0.5, mz = (az + bz) * 0.5;
    const r = BOND_RADIUS * s;
    writeCylinder(bm, i0, ax, ay, az, mx, my, mz, r);
    writeCylinder(bm, i1, mx, my, mz, bx, by, bz, r);
    bcol[i0 * 3] = ac[a * 3]; bcol[i0 * 3 + 1] = ac[a * 3 + 1]; bcol[i0 * 3 + 2] = ac[a * 3 + 2];
    bcol[i1 * 3] = ac[b * 3]; bcol[i1 * 3 + 1] = ac[b * 3 + 1]; bcol[i1 * 3 + 2] = ac[b * 3 + 2];
  }

  clear() {
    for (const rec of this.records.values()) this._disposeRecord(rec);
    this.records.clear();
  }

  dispose() {
    this.clear();
    this.atomMat.dispose();
    this.bondMat.dispose();
    this.beadMat.dispose();
    this.tubeMat.dispose();
    this.sphereGeo.dispose();
    this.cylGeo.dispose();
    this.group.removeFromParent();
  }
}
