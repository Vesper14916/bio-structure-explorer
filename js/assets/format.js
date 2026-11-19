// Helix asset format v1 & v2: shared reader/writer helpers and validator.
// No DOM and no three.js dependency; runs in Node and in the browser.
// The format is frozen in docs/CONTRACTS.md sections 6.2 and 7. Change the contract before changing this file.

export const ASSET_FORMAT = 'helix-asset';
export const ASSET_VERSION_V1 = 1;
export const ASSET_VERSION = 2;
export const SUPPORTED_VERSIONS = Object.freeze([1, 2]);
export const QUANT_STEP = 0.05;               // angstrom per int16 unit (range about +/-1638 A)
export const CHAIN_CLASSES = Object.freeze(['protein', 'rna', 'dna']);
export const PART_ROLES = Object.freeze(['body', 'replaceable', 'release']);
export const BEAD_KIND = Object.freeze({ CA: 0, P: 1 });

const bytesToB64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const b64ToBytes = b64 => { const s = atob(b64); const u8 = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i); return u8; };

/** Encode a typed array (little-endian host assumed) as base64. */
export const encodeArray = arr => bytesToB64(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength));
/** Decode base64 into a typed array of the given constructor (copy, aligned). */
export const decodeArray = (b64, Ctor) => { const u8 = b64ToBytes(b64); return new Ctor(u8.buffer.slice(0, u8.byteLength - (u8.byteLength % Ctor.BYTES_PER_ELEMENT))); };

/** Quantise angstrom coordinates (array-like of xyz) to base64 int16. Throws when out of range. */
export function encodePositions(xyz, step = QUANT_STEP) {
  const q = new Int16Array(xyz.length);
  for (let i = 0; i < xyz.length; i++) {
    const v = Math.round(xyz[i] / step);
    if (v < -32768 || v > 32767) throw new Error(`coordinate ${xyz[i]} out of int16 range at step ${step}`);
    q[i] = v;
  }
  return encodeArray(q);
}
/** Decode base64 int16 positions to Float32Array angstroms. */
export function decodePositions(b64, step = QUANT_STEP) {
  const q = decodeArray(b64, Int16Array), f = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) f[i] = q[i] * step;
  return f;
}

const isVec = (v, n) => Array.isArray(v) && v.length === n && v.every(Number.isFinite);
function frameError(f) {
  if (!f || !isVec(f.o, 3) || !isVec(f.R, 9)) return Infinity;
  const R = f.R; let e = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    let d = 0; for (let k = 0; k < 3; k++) d += R[k * 3 + i] * R[k * 3 + j];   // columns orthonormal
    e = Math.max(e, Math.abs(d - (i === j ? 1 : 0)));
  }
  const det = R[0] * (R[4] * R[8] - R[5] * R[7]) - R[1] * (R[3] * R[8] - R[5] * R[6]) + R[2] * (R[3] * R[7] - R[4] * R[6]);
  return Math.max(e, Math.abs(det - 1));
}

/** Validate a v1 or v2 asset object. Returns an array of problem strings (empty when valid). */
export function validateAsset(a) {
  const p = [], bad = m => p.push(m);
  if (!a || a.format !== ASSET_FORMAT) return ['format must be "helix-asset"'];
  if (!SUPPORTED_VERSIONS.includes(a.version)) bad(`version must be one of ${SUPPORTED_VERSIONS.join(', ')}`);
  if (!/^[a-z0-9-]+$/.test(a.id || '')) bad('id must be kebab-case');
  if (!a.name) bad('name missing');
  if (a.units !== 'angstrom') bad('units must be "angstrom"');
  if (a.quantStep !== QUANT_STEP) bad(`quantStep must be ${QUANT_STEP}`);
  const s = a.source || {};
  if (!['pdb', 'synthetic'].includes(s.type)) bad('source.type must be "pdb" or "synthetic"');
  if (s.type === 'pdb') for (const k of ['pdbId', 'title', 'method', 'organism', 'downloaded', 'sha256', 'license']) if (!s[k]) bad(`source.${k} missing`);
  if (!a.bounds || !isVec(a.bounds.center, 3) || !(a.bounds.radius > 0) || !isVec(a.bounds.size, 3)) bad('bounds invalid');
  const partIds = new Set();
  for (const part of a.parts || []) {
    if (!part || !part.id) { bad('part id missing'); continue; }
    partIds.add(part.id);
    if (part.role !== undefined && !PART_ROLES.includes(part.role)) bad(`part ${part.id}: bad role ${part.role}`);
  }
  if (!partIds.size) bad('parts missing');
  for (const c of a.chains || []) {
    if (!partIds.has(c.part)) bad(`chain ${c.id}: unknown part ${c.part}`);
    if (!CHAIN_CLASSES.includes(c.class)) bad(`chain ${c.id}: bad class ${c.class}`);
  }
  const nChains = (a.chains || []).length;
  if (!nChains) bad('chains missing');
  // lod0
  for (const m of (a.lod0 && a.lod0.parts) || []) {
    if (!partIds.has(m.part)) bad(`lod0: unknown part ${m.part}`);
    const pos = decodePositions(m.positions), idx = decodeArray(m.indices, m.indexType === 'u32' ? Uint32Array : Uint16Array);
    if (pos.length !== m.vertexCount * 3) bad(`lod0 ${m.part}: vertexCount mismatch`);
    if (idx.length !== m.triangleCount * 3) bad(`lod0 ${m.part}: triangleCount mismatch`);
    for (let i = 0; i < idx.length; i++) if (idx[i] >= m.vertexCount) { bad(`lod0 ${m.part}: index out of range`); break; }
  }
  if (!a.lod0 || !Array.isArray(a.lod0.parts) || !a.lod0.parts.length) bad('lod0.parts missing');
  // lod1
  if (!a.lod1) bad('lod1 missing');
  else {
    const n = a.lod1.count, ch = decodeArray(a.lod1.chain, Uint8Array), kd = decodeArray(a.lod1.kind, Uint8Array);
    if (decodePositions(a.lod1.positions).length !== n * 3 || ch.length !== n || kd.length !== n) bad('lod1 array lengths mismatch');
    for (let i = 0; i < n; i++) if (ch[i] >= nChains || kd[i] > 1) { bad('lod1 chain/kind out of range'); break; }
  }
  // anchors (validated before lod2.sites references them)
  for (const [k, f] of Object.entries(a.anchors || {})) if (frameError(f) > 1e-4) bad(`anchor ${k}: frame not orthonormal`);
  if (!a.anchors || !a.anchors.center) bad('anchors.center missing');
  // lod2 (optional)
  if (a.lod2) {
    const n = a.lod2.count, b = decodeArray(a.lod2.bonds, Uint16Array);
    if (decodePositions(a.lod2.positions).length !== n * 3) bad('lod2 positions length mismatch');
    if (decodeArray(a.lod2.element, Uint8Array).length !== n || decodeArray(a.lod2.chain, Uint8Array).length !== n) bad('lod2 element/chain length mismatch');
    if (b.length !== a.lod2.bondCount * 2) bad('lod2 bondCount mismatch');
    for (let i = 0; i < b.length; i++) if (b[i] >= n) { bad('lod2 bond index out of range'); break; }
    if (a.lod2.sites !== undefined) {
      if (!Array.isArray(a.lod2.sites) || !a.lod2.sites.length) bad('lod2.sites must be a non-empty array');
      else {
        for (let i = 0; i < a.lod2.sites.length; i++) {
          const site = a.lod2.sites[i];
          if (!site || typeof site.anchor !== 'string' || !site.anchor) bad(`lod2.sites[${i}]: anchor missing`);
          else if (!a.anchors || !a.anchors[site.anchor]) bad(`lod2.sites[${i}]: unknown anchor ${site.anchor}`);
          if (!site || !Number.isFinite(site.radius) || !(site.radius > 0)) bad(`lod2.sites[${i}]: radius must be > 0`);
        }
      }
    } else if (a.version >= 2) {
      bad('lod2.sites missing');
    } else {
      if (typeof a.lod2.anchor !== 'string' || !a.lod2.anchor) bad('lod2.anchor missing');
      else if (!a.anchors || !a.anchors[a.lod2.anchor]) bad(`lod2.anchor: unknown anchor ${a.lod2.anchor}`);
      if (!Number.isFinite(a.lod2.radius) || !(a.lod2.radius > 0)) bad('lod2.radius must be > 0');
    }
  }
  // tracks (optional)
  for (const [k, t] of Object.entries(a.tracks || {})) {
    const n = (t.registers || []).length;
    if (!['dna', 'rna'].includes(t.kind)) bad(`track ${k}: kind must be dna or rna`);
    if (!n || (t.frames || []).length !== n || (t.synthetic || []).length !== n || (t.bases || '').length !== n) bad(`track ${k}: registers/frames/synthetic/bases length mismatch`);
    if (n && !Number.isInteger(t.registers[0])) bad(`track ${k}: registers must be integers`);
    for (let i = 1; i < n; i++) if (!Number.isInteger(t.registers[i]) || t.registers[i] !== t.registers[i - 1] + 1) { bad(`track ${k}: registers must be consecutive ascending integers`); break; }
    if (Array.isArray(t.synthetic) && t.synthetic.length === n && !t.synthetic.every(v => v === 0 || v === 1)) bad(`track ${k}: synthetic entries must be 0 or 1`);
    for (let i = 0; i < n; i++) if (frameError(t.frames[i]) > 1e-4) { bad(`track ${k}: frame ${i} not orthonormal`); break; }
  }
  // paths (optional, v2)
  if (a.paths !== undefined) {
    if (!a.paths || typeof a.paths !== 'object' || Array.isArray(a.paths)) bad('paths must be an object');
    else {
      for (const [k, pt] of Object.entries(a.paths)) {
        if (!pt || !Number.isInteger(pt.count) || pt.count < 2) { bad(`path ${k}: count must be an integer >= 2`); continue; }
        if (typeof pt.points !== 'string' || decodePositions(pt.points).length !== pt.count * 3) bad(`path ${k}: points length mismatch`);
        const synOk = pt.synthetic === 0 || pt.synthetic === 1
          || (Array.isArray(pt.synthetic) && pt.synthetic.length === pt.count && pt.synthetic.every(v => v === 0 || v === 1));
        if (!synOk) bad(`path ${k}: synthetic must be 0 or 1 (or an array of 0/1 of length count)`);
      }
    }
  }
  return p;
}

/** Decode a v1 or v2 asset into typed arrays ready for a renderer or simulation. Throws on invalid input. */
export function decodeAsset(a) {
  const problems = validateAsset(a);
  if (problems.length) throw new Error(`invalid asset ${a && a.id}: ${problems.join('; ')}`);
  const paths = {};
  for (const [k, pt] of Object.entries(a.paths || {})) {
    paths[k] = {
      points: decodePositions(pt.points),
      count: pt.count,
      synthetic: pt.synthetic,
    };
  }
  const lod2 = a.lod2 ? {
    count: a.lod2.count,
    positions: decodePositions(a.lod2.positions),
    element: decodeArray(a.lod2.element, Uint8Array),
    chain: decodeArray(a.lod2.chain, Uint8Array),
    bonds: decodeArray(a.lod2.bonds, Uint16Array),
    anchor: a.lod2.anchor ?? (a.lod2.sites && a.lod2.sites[0] ? a.lod2.sites[0].anchor : undefined),
    radius: a.lod2.radius ?? (a.lod2.sites && a.lod2.sites[0] ? a.lod2.sites[0].radius : undefined),
    sites: a.lod2.sites
      ? a.lod2.sites.map(s => ({ anchor: s.anchor, radius: s.radius }))
      : (a.lod2.anchor ? [{ anchor: a.lod2.anchor, radius: a.lod2.radius }] : []),
  } : null;
  return {
    version: a.version,
    id: a.id, name: a.name, source: a.source, bounds: a.bounds,
    parts: a.parts.map(pt => ({ ...pt, role: pt.role ?? 'body' })),
    chains: a.chains,
    anchors: a.anchors, tracks: a.tracks || {}, paths,
    lod0: a.lod0.parts.map(m => ({ part: m.part, positions: decodePositions(m.positions), indices: decodeArray(m.indices, m.indexType === 'u32' ? Uint32Array : Uint16Array) })),
    lod1: { count: a.lod1.count, positions: decodePositions(a.lod1.positions), chain: decodeArray(a.lod1.chain, Uint8Array), kind: decodeArray(a.lod1.kind, Uint8Array) },
    lod2,
  };
}

/** Look up a track frame by register. Returns null when the register is outside the track. */
export function trackFrame(track, register) {
  const i = register - track.registers[0];
  return i >= 0 && i < track.frames.length ? track.frames[i] : null;
}
