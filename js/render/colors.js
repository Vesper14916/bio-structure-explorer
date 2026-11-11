// Colour schemes. Everything is stored in linear working space (THREE converts hex = sRGB).
import * as THREE from 'three';
import { ELEMENTS, ELEMENT_INFO, BASE_INFO } from '../science/index.js';

export const STRAND_HEX = [0x4cc9f0, 0xff9f5a, 0xb58cff, 0x5fe3a1, 0xffd35c, 0xff6fae, 0x7f9cff, 0xc8f36b];
export const PART_HEX = [0x5fd0ff, 0xf0dfbd, 0xffa23a];          // base, sugar, phosphate
export const PART_NAMES = ['Base', 'Sugar', 'Phosphate'];
const SUGAR_NEUTRAL = 0xaeb6c8, PHOS_NEUTRAL = 0xcdb894;
const ELEMENT_HEX = ELEMENTS.map(e => ELEMENT_INFO[e].color);

const tmp = new THREE.Color();
const set = (arr, i, hex) => { tmp.setHex(hex); arr[i * 3] = tmp.r; arr[i * 3 + 1] = tmp.g; arr[i * 3 + 2] = tmp.b; };
const lerpWhite = (arr, i, f) => { for (let k = 0; k < 3; k++) arr[i * 3 + k] += (1 - arr[i * 3 + k]) * f; };

// Blue -> white -> red ramp (sRGB stops) for B-factors.
const RAMP = [[0.16, 0.36, 1.0], [0.93, 0.95, 1.0], [1.0, 0.22, 0.16]];
function ramp(arr, i, t) {
  t = Math.max(0, Math.min(1, t));
  const s = t < 0.5 ? 0 : 1, f = t < 0.5 ? t * 2 : t * 2 - 1;
  const a = RAMP[s], b = RAMP[s + 1];
  tmp.setRGB(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, THREE.SRGBColorSpace);
  arr[i * 3] = tmp.r; arr[i * 3 + 1] = tmp.g; arr[i * 3 + 2] = tmp.b;
}

export class ColorModel {
  constructor(asm) {
    this.asm = asm;
    const N = asm.atoms.count, n = asm.nucleotides.length;
    this.atom = new Float32Array(N * 3);
    this.nucBase = new Float32Array(n * 3);     // cartoon slab colour
    this.nucBack = new Float32Array(n * 3);     // cartoon tube colour
    this.emph = new Float32Array(n).fill(1);    // 1 emphasised/normal, 0 dimmed
    this.pairEmph = new Float32Array(asm.pairs.length).fill(1);
    this.highlightActive = false;
    // B-factor normalisation (5th..95th percentile so a few outliers do not flatten the ramp)
    const b = Array.from(asm.atoms.bfactor).filter(v => v > 0).sort((x, y) => x - y);
    this.hasB = b.length > 0;
    this.bLo = this.hasB ? b[Math.floor(b.length * 0.05)] : 0;
    this.bHi = this.hasB ? b[Math.floor(b.length * 0.95)] : 1;
    this.nucB = new Float32Array(n);
    if (this.hasB) for (const nu of asm.nucleotides) {
      let s = 0; for (let i = 0; i < nu.atomCount; i++) s += asm.atoms.bfactor[nu.atomStart + i];
      this.nucB[nu.id] = s / nu.atomCount;
    }
  }

  compute(scheme, highlight) {
    const asm = this.asm, A = asm.atoms, N = A.count;
    if (scheme === 'bfactor' && !this.hasB) scheme = 'element';
    const bt = v => (v - this.bLo) / Math.max(1e-3, this.bHi - this.bLo);
    for (let g = 0; g < N; g++) {
      const nu = asm.nucleotides[A.nuc[g]], part = A.part[g];
      switch (scheme) {
        case 'base':
          set(this.atom, g, part === 0 ? BASE_INFO[nu.base].color : part === 1 ? SUGAR_NEUTRAL : PHOS_NEUTRAL); break;
        case 'strand':
          set(this.atom, g, STRAND_HEX[nu.strand % STRAND_HEX.length]);
          if (part === 0) lerpWhite(this.atom, g, 0.35);
          break;
        case 'part': set(this.atom, g, PART_HEX[part]); break;
        case 'bfactor': ramp(this.atom, g, bt(A.bfactor[g])); break;
        default: set(this.atom, g, ELEMENT_HEX[A.el[g]]);
      }
    }
    for (const nu of asm.nucleotides) {
      const i = nu.id;
      switch (scheme) {
        case 'strand':
          set(this.nucBack, i, STRAND_HEX[nu.strand % STRAND_HEX.length]);
          set(this.nucBase, i, STRAND_HEX[nu.strand % STRAND_HEX.length]); lerpWhite(this.nucBase, i, 0.35); break;
        case 'part': set(this.nucBack, i, PART_HEX[2]); set(this.nucBase, i, PART_HEX[0]); break;
        case 'bfactor': ramp(this.nucBack, i, bt(this.nucB[i])); ramp(this.nucBase, i, bt(this.nucB[i])); break;
        case 'element': set(this.nucBack, i, ELEMENT_INFO.P.color); set(this.nucBase, i, BASE_INFO[nu.base].color); break;
        default: set(this.nucBack, i, SUGAR_NEUTRAL); set(this.nucBase, i, BASE_INFO[nu.base].color);
      }
    }
    // Highlight: emphasised nucleotides keep (slightly boosted) colour, the rest is desaturated + dimmed.
    this.highlightActive = !!highlight;
    this.emph.fill(highlight ? 0 : 1);
    this.pairEmph.fill(highlight ? 0 : 1);
    if (highlight) {
      for (const id of highlight.nucleotides || []) if (id >= 0 && id < this.emph.length) this.emph[id] = 1;
      for (const pid of highlight.pairs || []) {
        const p = asm.pairs[pid]; if (!p) continue;
        this.emph[p.a] = this.emph[p.b] = 1;
      }
      for (const p of asm.pairs) this.pairEmph[p.id] = this.emph[p.a] && this.emph[p.b] ? 1 : 0;
      for (let g = 0; g < N; g++) dimOrBoost(this.atom, g, this.emph[A.nuc[g]]);
      for (let i = 0; i < this.emph.length; i++) { dimOrBoost(this.nucBack, i, this.emph[i]); dimOrBoost(this.nucBase, i, this.emph[i]); }
    }
    return scheme;
  }
}

function dimOrBoost(arr, i, e) {
  const o = i * 3, r = arr[o], g = arr[o + 1], b = arr[o + 2];
  if (e) { arr[o] = r * 1.12; arr[o + 1] = g * 1.12; arr[o + 2] = b * 1.12; return; }
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  arr[o] = (l + (r - l) * 0.2) * 0.16 + 0.004;
  arr[o + 1] = (l + (g - l) * 0.2) * 0.16 + 0.006;
  arr[o + 2] = (l + (b - l) * 0.2) * 0.16 + 0.012;
}
