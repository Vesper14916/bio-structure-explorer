// Helix asset format v1: shared reader/writer helpers and validator.
// No DOM and no three.js dependency; runs in Node and in the browser.
// The format is frozen in docs/CONTRACTS.md section 6. Change the contract before changing this file.

export const ASSET_FORMAT = 'helix-asset';
export const ASSET_VERSION = 1;
export const QUANT_STEP = 0.05;               // angstrom per int16 unit (range about +/-1638 A)
export const CHAIN_CLASSES = ['protein', 'rna', 'dna'];
export const BEAD_KIND = { CA: 0, P: 1 };

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

/** Validate an asset object. Returns an array of problem strings (empty when valid). */
export function validateAsset(a) {
  const p = [], bad = m => p.push(m);
  if (!a || a.format !== ASSET_FORMAT) return ['format must be "helix-asset"'];
  if (a.version !== ASSET_VERSION) bad(`version must be ${ASSET_VERSION}`);
  if (!/^[a-z0-9-]+$/.test(a.id || '')) bad('id must be kebab-case');
  if (!a.name) bad('name missing');
  if (a.units !== 'angstrom') bad('units must be "angstrom"');
  if (a.quantStep !== QUANT_STEP) bad(`quantStep must be ${QUANT_STEP}`);
  const s = a.source || {};
  if (!['pdb', 'synthetic'].includes(s.type)) bad('source.type must be "pdb" or "synthetic"');
  if (s.type === 'pdb') for (const k of ['pdbId', 'title', 'method', 'organism', 'downloaded', 'sha256', 'license']) if (!s[k]) bad(`source.${k} missing`);
  if (!a.bounds || !isVec(a.bounds.center, 3) || !(a.bounds.radius > 0) || !isVec(a.bounds.size, 3)) bad('bounds invalid');
  const partIds = new Set((a.parts || []).map(x => x.id));
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
  // lod2 (optional)
  if (a.lod2) {
    const n = a.lod2.count, b = decodeArray(a.lod2.bonds, Uint16Array);
    if (decodePositions(a.lod2.positions).length !== n * 3) bad('lod2 positions length mismatch');
    if (decodeArray(a.lod2.element, Uint8Array).length !== n || decodeArray(a.lod2.chain, Uint8Array).length !== n) bad('lod2 element/chain length mismatch');
    if (b.length !== a.lod2.bondCount * 2) bad('lod2 bondCount mismatch');
    for (let i = 0; i < b.length; i++) if (b[i] >= n) { bad('lod2 bond index out of range'); break; }
  }
  // anchors and tracks
  for (const [k, f] of Object.entries(a.anchors || {})) if (frameError(f) > 1e-4) bad(`anchor ${k}: frame not orthonormal`);
  if (!a.anchors || !a.anchors.center) bad('anchors.center missing');
  for (const [k, t] of Object.entries(a.tracks || {})) {
    const n = (t.registers || []).length;
    if (!['dna', 'rna'].includes(t.kind)) bad(`track ${k}: kind must be dna or rna`);
    if (!n || (t.frames || []).length !== n || (t.synthetic || []).length !== n || (t.bases || '').length !== n) bad(`track ${k}: registers/frames/synthetic/bases length mismatch`);
    for (let i = 1; i < n; i++) if (t.registers[i] !== t.registers[i - 1] + 1) { bad(`track ${k}: registers must be consecutive ascending integers`); break; }
    for (let i = 0; i < n; i++) if (frameError(t.frames[i]) > 1e-4) { bad(`track ${k}: frame ${i} not orthonormal`); break; }
  }
  return p;
}

/** Decode an asset into typed arrays ready for a renderer or simulation. Throws on invalid input. */
export function decodeAsset(a) {
  const problems = validateAsset(a);
  if (problems.length) throw new Error(`invalid asset ${a && a.id}: ${problems.join('; ')}`);
  return {
    id: a.id, name: a.name, source: a.source, bounds: a.bounds, parts: a.parts, chains: a.chains,
    anchors: a.anchors, tracks: a.tracks || {},
    lod0: a.lod0.parts.map(m => ({ part: m.part, positions: decodePositions(m.positions), indices: decodeArray(m.indices, m.indexType === 'u32' ? Uint32Array : Uint16Array) })),
    lod1: { count: a.lod1.count, positions: decodePositions(a.lod1.positions), chain: decodeArray(a.lod1.chain, Uint8Array), kind: decodeArray(a.lod1.kind, Uint8Array) },
    lod2: a.lod2 ? {
      count: a.lod2.count, positions: decodePositions(a.lod2.positions), element: decodeArray(a.lod2.element, Uint8Array),
      chain: decodeArray(a.lod2.chain, Uint8Array), bonds: decodeArray(a.lod2.bonds, Uint16Array), anchor: a.lod2.anchor, radius: a.lod2.radius,
    } : null,
  };
}

/** Look up a track frame by register. Returns null when the register is outside the track. */
export function trackFrame(track, register) {
  const i = register - track.registers[0];
  return i >= 0 && i < track.frames.length ? track.frames[i] : null;
}
