/**
 * @module ui/inspect
 * Round 3 molecule/actor inspection card builder (PLAN.md §4.8 item 9, §5.2, §5.4, §8.1, task R3-U2).
 * Maps a viewer pick hit (machine actor/part or procedural molecule) into structured InspectInfo
 * with exact §5.4 role sentences, provenance, and simplifications.
 */

/**
 * Exact PLAN.md §5.4 role sentences and simplifications for machine actors and parts.
 * Exported for unit and browser tests.
 */
export const MACHINE_INSPECT_TABLE = Object.freeze({
  'rnap-core': Object.freeze({
    name: 'RNA polymerase',
    role: 'Copies the template DNA strand into RNA, 5′→3′.',
    simplifications: Object.freeze(['Rigid structure; promoter DNA bend from 6CA0 (5.75 Å), elongation DNA from 6ALF']),
    defaultChains: 'Core subunits α₂ββ′ω (chains G–K in 6ALF; A–E in 6C9Y)',
    defaultMethod: 'Cryo-EM, 4.1 Å',
    defaultPdbId: '6ALF',
  }),
  sigma: Object.freeze({
    name: 'σ⁷⁰',
    role: 'Recognises the −35 and −10 promoter elements and helps open the DNA.',
    simplifications: Object.freeze(['Released at nucleotide 12 here; often retained longer']),
    defaultChains: 'Sigma factor σ⁷⁰ (RpoD, chain F, 468 residues)',
    defaultMethod: 'Cryo-EM, 4.25 Å',
    defaultPdbId: '6C9Y',
  }),
  'ribosome-small': Object.freeze({
    name: '30S subunit',
    role: 'Binds the mRNA and checks codon–anticodon pairing in the decoding centre.',
    simplifications: Object.freeze(['Rigid; head swivel not shown']),
    defaultChains: '16S rRNA (chain A) and 20 ribosomal proteins S2–S21 (chains B–U)',
    defaultMethod: 'Cryo-EM, 1.98 Å',
    defaultPdbId: '7K00',
  }),
  'ribosome-large': Object.freeze({
    name: '50S subunit',
    role: 'Joins amino acids in the peptidyl-transferase centre; the peptide leaves through its exit tunnel.',
    simplifications: Object.freeze(['Rigid; L1 stalk movement not shown']),
    defaultChains: '23S and 5S rRNA (chains a, b) and 29 ribosomal proteins L2–L36 (chains c–z, 0–4)',
    defaultMethod: 'Cryo-EM, 1.98 Å',
    defaultPdbId: '7K00',
  }),
  'trna-init': Object.freeze({
    name: 'Initiator tRNA',
    role: 'Carries formyl-methionine to the start codon in the P site.',
    simplifications: Object.freeze(['Pre-charged; formylation not shown']),
    defaultChains: 'P-site initiator tRNA-fMet (chain Z, 76 nt)',
    defaultMethod: 'Cryo-EM, 1.98 Å',
    defaultPdbId: '7K00',
  }),
  'trna-aa': Object.freeze({
    name: 'Elongator tRNA',
    role: 'Carries one amino acid and pairs its anticodon with the codon.',
    simplifications: Object.freeze(['One body for all amino acids; anticodon rebuilt per codon']),
    defaultChains: 'A-site elongator tRNA body (chain Y, 74 nt)',
    defaultMethod: 'Cryo-EM, 1.98 Å',
    defaultPdbId: '7K00',
  }),
  'ef-tu': Object.freeze({
    name: 'EF-Tu',
    role: 'Delivers aminoacyl-tRNAs to the A site and hydrolyses GTP on correct pairing.',
    simplifications: Object.freeze(['Proofreading not shown']),
    defaultChains: 'Elongation factor Tu (chain z, 393 residues)',
    defaultMethod: 'Cryo-EM, 3.1 Å',
    defaultPdbId: '5WE4',
  }),
  'ef-g': Object.freeze({
    name: 'EF-G',
    role: 'Uses GTP to move tRNAs and mRNA by one codon.',
    simplifications: Object.freeze(['Hybrid states only where the structure provides them']),
    defaultChains: 'Elongation factor G (chain x, 703 residues)',
    defaultMethod: 'Cryo-EM, 3.1 Å',
    defaultPdbId: '7PJV',
  }),
  rf1: Object.freeze({
    name: 'RF1',
    role: 'Reads UAA and UAG and releases the finished peptide.',
    simplifications: Object.freeze(['RF3 and recycling not shown']),
    defaultChains: 'Peptide chain release factor 1 (chain w, 349 residues)',
    defaultMethod: 'Cryo-EM, 2.9 Å',
    defaultPdbId: '8FZH',
  }),
  if1: Object.freeze({
    name: 'IF1',
    role: 'Binds the 30S A site, keeping elongator tRNAs out, and supports IF2 and IF3.',
    simplifications: Object.freeze(['Canonical order only']),
    defaultChains: 'Translation initiation factor IF-1 (chain y, 72 residues)',
    defaultMethod: 'Cryo-EM, 3.0 Å',
    defaultPdbId: '9ZN2',
  }),
  if2: Object.freeze({
    name: 'IF2',
    role: 'Delivers the initiator fMet-tRNA to the P site and, as a GTPase, helps the 50S subunit join.',
    simplifications: Object.freeze(['Canonical order only']),
    defaultChains: 'Translation initiation factor IF-2 (chain x, residues 296–890, 595 residues)',
    defaultMethod: 'Cryo-EM, 3.0 Å',
    defaultPdbId: '9ZN2',
  }),
  if3: Object.freeze({
    name: 'IF3',
    role: 'Favours the initiator tRNA on the start codon and keeps the subunits apart until the 50S subunit joins.',
    simplifications: Object.freeze(['Canonical order only']),
    defaultChains: 'Translation initiation factor IF-3 CTD (chain J, residues 76–177, 102 residues)',
    defaultMethod: 'Cryo-EM, 2.0 Å',
    defaultPdbId: '9FDA',
  }),
  nusg: Object.freeze({
    name: 'NusG',
    role: 'Bridges RNA polymerase and the ribosome in coupled expression.',
    simplifications: Object.freeze(['Fixed coupling geometry']),
    defaultChains: 'Transcription–translation coupling factor NusG (chain CF, 161 residues)',
    defaultMethod: 'Cryo-EM, 3.4 Å',
    defaultPdbId: '6ZTJ',
  }),
});

/**
 * Procedural molecule inspection metadata (PLAN.md §5.2, §5.4, §10 R3-U2).
 * Each role sentence is strictly <= 120 characters and cites PLAN.md §5.2 mechanisms.
 */
/**
 * Plain-language explanations for readers without a molecular-biology background: what the molecule is and
 * what it does in this story, in one or two everyday sentences. Shown first on the inspection card; the
 * exact role sentences and provenance rows stay under "Scientific details".
 */
export const PLAIN_INSPECT = Object.freeze({
  'rnap-core': 'A molecular machine that slides along DNA and builds an RNA copy of one strand, one letter at a time.',
  sigma: 'A helper that lets RNA polymerase recognise the "start here" signal in front of the gene.',
  'ribosome-small': 'The smaller half of the ribosome, the protein-making machine. It holds the RNA and checks that each adapter matches.',
  'ribosome-large': 'The larger half of the ribosome. It links amino acids together; the growing protein leaves through a tunnel in it.',
  'trna-init': 'The first adapter. It carries the first amino acid and finds the "start" word on the RNA.',
  'trna-aa': 'An adapter molecule. One end reads a three-letter word on the RNA; the other end carries the matching amino acid.',
  'ef-tu': 'A delivery helper that brings each loaded adapter (tRNA) to the ribosome.',
  'ef-g': 'A helper that pushes the ribosome forward by one three-letter word, using chemical energy (GTP).',
  rf1: 'A release helper. It recognises the "stop" word and cuts the finished protein chain free.',
  if1: 'A start-up helper that keeps the wrong adapters out while the ribosome gets ready.',
  if2: 'A start-up helper that brings the first adapter and helps the two ribosome halves join.',
  if3: 'A start-up helper that keeps the ribosome halves apart until the right start is found.',
  nusg: 'A bridge that links the copying machine (RNA polymerase) to the ribosome when both work at once.',
  dna: 'DNA, the long-term store of genetic information: two strands of letters (A, T, G, C) wound around each other.',
  mrna: 'Messenger RNA, a working copy of the gene. The ribosome reads it three letters at a time.',
  anticodon: 'The three letters at the tip of an adapter (tRNA). They pair with a three-letter word on the RNA.',
  peptide: 'The new protein chain, built one amino acid at a time. Later it would fold into a working shape.',
  ntp: 'A single RNA building block arriving to be added to the growing RNA copy.',
  ppi: 'A small leftover piece released each time a building block is added to the RNA.',
});

export const PROCEDURAL_INSPECT_TABLE = Object.freeze({
  dna: Object.freeze({
    name: 'DNA duplex',
    role: 'Parental B-DNA duplex that unwinds inside RNA polymerase, spins about its axis, and re-closes behind.',
    source: 'Procedural B-DNA (Olson et al. 2001 standard base frame)',
    pdbId: null,
    organism: 'Synthetic E. coli construct (248 bp)',
    method: 'Ideal B-DNA screw geometry (3.38 Å rise, 10.5 bp/turn)',
    chains: 'Coding strand (5′→3′) and template strand (3′→5′)',
    detail: 'Procedural',
    simplifications: Object.freeze([
      'Procedural; ideal geometry',
      'DNA spins about its axis while RNAP stays fixed; supercoiling (twin-domain model) is not shown',
    ]),
  }),
  mrna: Object.freeze({
    name: 'mRNA transcript',
    role: 'Single-stranded A-form transcript (179 nt) copied 5′→3′ from the template strand and read by the ribosome.',
    source: 'Procedural A-RNA (Olson et al. 2001 / Arnott et al. 1972)',
    pdbId: null,
    organism: 'Synthetic E. coli construct (179 nt)',
    method: 'A-form single-strand spline & slot tracks (2.81 Å rise, 32.73° twist)',
    chains: 'Messenger RNA (5′→3′, 179 nt, 40 sense codons + UAA)',
    detail: 'Procedural',
    simplifications: Object.freeze([
      'Procedural; ideal geometry',
      'Pausing, backtracking and abortive initiation are not shown',
    ]),
  }),
  anticodon: Object.freeze({
    name: 'tRNA anticodon',
    role: 'Three-nucleotide tRNA anticodon (nt 34–36) that base-pairs with the mRNA codon by Watson–Crick rules in A and P.',
    source: 'Procedural A-RNA triplet on PDB 7K00 anticodon track (nt 34–36)',
    pdbId: null,
    organism: 'Escherichia coli (procedural nucleotides)',
    method: 'Kabsch-fitted base frames with exact Watson–Crick complement',
    chains: 'Anticodon triplet (nucleotides 34–36, 5′→3′)',
    detail: 'Procedural',
    simplifications: Object.freeze([
      'Procedural; ideal geometry',
      'Anticodon is built as an exact Watson–Crick complement per codon',
    ]),
  }),
  peptide: Object.freeze({
    name: 'Nascent peptide',
    role: 'Nascent 40-residue polypeptide chain threading from the peptidyl-transferase centre through the 50S exit tunnel.',
    source: 'Procedural atomic polypeptide (Engh & Huber 1991 templates)',
    pdbId: null,
    organism: 'Synthetic E. coli ORF product (40 aa)',
    method: 'Extended backbone (φ −139°, ψ 135°) on 7K00 exit-tunnel path',
    chains: 'Nascent polypeptide chain (N→C, up to 40 residues)',
    detail: 'Procedural',
    simplifications: Object.freeze([
      'Procedural; ideal geometry',
      'Extended backbone (φ −139°, ψ 135°); co-translational folding is not shown',
    ]),
  }),
  ntp: Object.freeze({
    name: 'Incoming NTP',
    role: 'Incoming ribonucleoside triphosphate entering through the secondary channel to pair with the template strand.',
    source: 'Procedural ribonucleoside triphosphate (Olson et al. 2001 + β/γ-phosphate)',
    pdbId: null,
    organism: 'Escherichia coli substrate (ATP, UTP, GTP, CTP)',
    method: 'Secondary-channel entry path to i+1 active site',
    chains: 'Single ribonucleoside triphosphate (NTP)',
    detail: 'Procedural',
    simplifications: Object.freeze([
      'Procedural; ideal geometry',
      'Chemistry is shown as a 400 ms bond pulse with no transition state',
    ]),
  }),
  ppi: Object.freeze({
    name: 'Pyrophosphate (PPi)',
    role: 'Pyrophosphate leaving group released after each phosphodiester bond forms and departing by the secondary channel.',
    source: 'Procedural pyrophosphate ion (P₂O₇⁴⁻)',
    pdbId: null,
    organism: 'Escherichia coli byproduct',
    method: '18 Å outward departure trajectory along secondary channel',
    chains: 'Pyrophosphate leaving group (PPi)',
    detail: 'Procedural',
    simplifications: Object.freeze([
      'Procedural; ideal geometry',
      'Moves 18 Å outward over 900 ms while fading out',
    ]),
  }),
});

const DETAIL_LEVEL_MAP = Object.freeze({
  l0: 'Surface',
  l1: 'Residues',
  l2: 'Atoms',
  L0: 'Surface',
  L1: 'Residues',
  L2: 'Atoms',
  Surface: 'Surface',
  Residues: 'Residues',
  Atoms: 'Atoms',
  Procedural: 'Procedural',
});

function formatMethodString(source, fallback) {
  if (!source || typeof source !== 'object') return fallback || 'Cryo-EM';
  const rawMethod = String(source.method || '').trim();
  let methodLabel = 'Cryo-EM';
  if (/X-RAY/i.test(rawMethod)) methodLabel = 'X-ray diffraction';
  else if (/ELECTRON MICROSCOPY|CRYO-EM/i.test(rawMethod)) methodLabel = 'Cryo-EM';
  else if (rawMethod) methodLabel = rawMethod;
  const res = Number(source.resolutionA);
  if (Number.isFinite(res) && res > 0) return `${methodLabel}, ${res} Å`;
  return fallback || methodLabel;
}

function resolveDetailLevel(pick, actorId, assetId, opts = {}) {
  const direct = pick.detailLevel || pick.detail || pick.level || opts.detailLevel || opts.level;
  if (direct && DETAIL_LEVEL_MAP[direct]) return DETAIL_LEVEL_MAP[direct];

  const map = opts.actorLevels;
  if (map) {
    if (Array.isArray(map)) {
      const hit = map.find(r => r && (r.id === actorId || r.id === assetId));
      if (hit && DETAIL_LEVEL_MAP[hit.level]) return DETAIL_LEVEL_MAP[hit.level];
    } else if (typeof map === 'object') {
      const lvl = map[actorId] || map[assetId];
      if (lvl && DETAIL_LEVEL_MAP[lvl]) return DETAIL_LEVEL_MAP[lvl];
    }
  }
  return 'Residues';
}

function summarizeAssetChains(asset, partId, pickedChainId, fallback) {
  if (!asset || !Array.isArray(asset.chains) || !asset.chains.length) {
    if (pickedChainId && fallback) return `${fallback} · picked chain ${pickedChainId}`;
    return fallback || '—';
  }
  const partChains = partId
    ? asset.chains.filter(c => c.part === partId)
    : asset.chains;
  const list = partChains.length ? partChains : asset.chains;

  let baseSummary = fallback;
  if (!baseSummary) {
    if (list.length <= 6) {
      baseSummary = list.map(c => `${c.name || c.id} (${c.id})`).join(', ');
    } else {
      const rnaChains = list.filter(c => c.class === 'rna');
      const protChains = list.filter(c => c.class === 'protein');
      const parts = [];
      if (rnaChains.length) {
        parts.push(rnaChains.map(c => `${c.name} (chain ${c.id})`).join(', '));
      }
      if (protChains.length) {
        parts.push(`${protChains.length} ribosomal proteins`);
      }
      baseSummary = parts.join(' and ') || `${list.length} chains`;
    }
  }

  if (pickedChainId) {
    const ch = asset.chains.find(c => c.id === pickedChainId);
    if (ch && list.length > 1) {
      return `${baseSummary} · picked: ${ch.name || ch.id} (chain ${ch.id})`;
    }
  }
  return baseSummary;
}

function resolveMachineEntry(actorId, assetId, partId) {
  const id = String(assetId || actorId || '').toLowerCase();
  const part = String(partId || '').toLowerCase();

  if (part === 'sigma' || id === 'sigma' || id === 'sigma70') {
    return { key: 'sigma', entry: MACHINE_INSPECT_TABLE.sigma, targetAssetId: 'rnap-holo', partId: 'sigma' };
  }
  if (id === 'rnap-holo') {
    return { key: 'rnap-core', entry: MACHINE_INSPECT_TABLE['rnap-core'], targetAssetId: 'rnap-holo', partId: 'core' };
  }
  if (id === 'rnap-ec' || id === 'rnap' || part === 'core') {
    return { key: 'rnap-core', entry: MACHINE_INSPECT_TABLE['rnap-core'], targetAssetId: id === 'rnap-holo' ? 'rnap-holo' : 'rnap-ec', partId: 'core' };
  }
  if (id === 'ribosome-70s' || id === 'ribosome' || id === 'small' || id === 'large' || id === '30s' || id === '50s') {
    const isSmall = part === 'small' || id === 'small' || id === '30s' || id === 'ribosome-30s';
    return isSmall
      ? { key: 'ribosome-small', entry: MACHINE_INSPECT_TABLE['ribosome-small'], targetAssetId: 'ribosome-70s', partId: 'small' }
      : { key: 'ribosome-large', entry: MACHINE_INSPECT_TABLE['ribosome-large'], targetAssetId: 'ribosome-70s', partId: 'large' };
  }
  if (id === 'trna-init' || id.startsWith('trna-init')) {
    return { key: 'trna-init', entry: MACHINE_INSPECT_TABLE['trna-init'], targetAssetId: 'trna-init', partId: 'body' };
  }
  if (id === 'trna-aa' || id.startsWith('trna-aa') || id.startsWith('trna-elong') || id.startsWith('trna-slot') || id === 'trna') {
    return { key: 'trna-aa', entry: MACHINE_INSPECT_TABLE['trna-aa'], targetAssetId: 'trna-aa', partId: 'body' };
  }
  if (id === 'ef-tu' || id === 'eftu') {
    return { key: 'ef-tu', entry: MACHINE_INSPECT_TABLE['ef-tu'], targetAssetId: 'ef-tu', partId: 'body' };
  }
  if (id === 'ef-g' || id === 'efg') {
    return { key: 'ef-g', entry: MACHINE_INSPECT_TABLE['ef-g'], targetAssetId: 'ef-g', partId: 'body' };
  }
  if (id === 'rf1') {
    return { key: 'rf1', entry: MACHINE_INSPECT_TABLE.rf1, targetAssetId: 'rf1', partId: 'body' };
  }
  if (id === 'if1') {
    return { key: 'if1', entry: MACHINE_INSPECT_TABLE.if1, targetAssetId: 'if1', partId: 'body' };
  }
  if (id === 'if2') {
    return { key: 'if2', entry: MACHINE_INSPECT_TABLE.if2, targetAssetId: 'if2', partId: 'body' };
  }
  if (id === 'if3') {
    return { key: 'if3', entry: MACHINE_INSPECT_TABLE.if3, targetAssetId: 'if3', partId: 'body' };
  }
  if (id === 'nusg') {
    return { key: 'nusg', entry: MACHINE_INSPECT_TABLE.nusg, targetAssetId: 'nusg', partId: 'body' };
  }
  return null;
}

function lookupAsset(assets, id) {
  if (!assets || !id) return null;
  if (assets instanceof Map) return assets.get(id) || null;
  if (typeof assets === 'object') {
    if (assets[id]) return assets[id];
    if (assets.id === id) return assets;
  }
  return null;
}

function resolveMachineFromWorld(worldState, actorId) {
  if (!worldState || !Array.isArray(worldState.machines) || !actorId) return null;
  return worldState.machines.find(m => m && (m.id === actorId || m.assetId === actorId)) || null;
}

function buildProceduralInspect(kindKey, pick) {
  const spec = PROCEDURAL_INSPECT_TABLE[kindKey];
  if (!spec) return null;

  let chains = spec.chains;
  if (kindKey === 'dna') {
    const role = String(pick.role || '').toLowerCase();
    if (role === 'coding' || pick.strand === 0) {
      chains = 'Coding DNA strand (5′→3′) and template DNA strand (3′→5′) · picked: coding strand';
    } else if (role === 'template' || pick.strand === 1) {
      chains = 'Coding DNA strand (5′→3′) and template DNA strand (3′→5′) · picked: template strand';
    }
  } else if (kindKey === 'peptide' && Number.isInteger(pick.residue) && pick.residue >= 0) {
    chains = `${spec.chains} · residue #${pick.residue + 1}`;
  } else if (kindKey === 'ntp' && typeof pick.base === 'string' && pick.base) {
    chains = `Incoming ${pick.base}TP ribonucleoside triphosphate`;
  }

  return {
    name: spec.name,
    plain: PLAIN_INSPECT[kindKey] || null,
    title: spec.name,
    role: spec.role,
    source: spec.source,
    pdbId: null,
    rcsbUrl: null,
    organism: spec.organism,
    method: spec.method,
    chains,
    chainsShown: chains,
    detail: 'Procedural',
    detailLevel: 'Procedural',
    simplifications: [...spec.simplifications],
  };
}

/**
 * Build an `InspectInfo` descriptor for the Express v2 inspection card from a viewer `pick`
 * hit (machine actor, nucleotide, atom group, or peptide residue), decoded `assets`, and `worldState`.
 *
 * Contract (PLAN.md §4.8 item 9, §5.4, §8.4, §10 R3-U2):
 * - Populates actor name, one-sentence role description, and six rows:
 *   `Source` (with click-only RCSB URL when PDB-backed), `Organism`, `Method`,
 *   `Chains shown`, `Detail level` (`Surface` / `Residues` / `Atoms` / `Procedural`),
 *   and `Simplifications` (1–3 bullets).
 * - Returns `null` when nothing pickable was selected.
 *
 * @param {object | null} pick - Viewer raycast/pick result.
 * @param {object | Map} [assets] - Decoded machine asset map keyed by asset id.
 * @param {object} [worldState] - Current WorldState from `stateAt`.
 * @param {object} [opts] - Optional detail level hints (`{ actorLevels?, level?, detailLevel? }`).
 * @returns {object | null} InspectInfo object for the inspection card, or `null`.
 */
export function buildInspectInfo(pick, assets = {}, worldState = null, opts = {}) {
  if (!pick || typeof pick !== 'object') return null;

  // 1. Explicit procedural kind / atomGroup (NTP, PPi, peptide, anticodon, mRNA, DNA)
  const rawKind = String(pick.kind || pick.atomGroup || '').toLowerCase();
  if (rawKind === 'ntp' || rawKind.startsWith('ntp')) {
    return buildProceduralInspect('ntp', pick);
  }
  if (rawKind === 'ppi' || rawKind.startsWith('ppi')) {
    return buildProceduralInspect('ppi', pick);
  }
  if (rawKind === 'peptide' || rawKind.startsWith('peptide')) {
    return buildProceduralInspect('peptide', pick);
  }
  if (rawKind === 'anticodon' || rawKind === 'trna-ac' || rawKind === 'trna-anticodon') {
    return buildProceduralInspect('anticodon', pick);
  }
  if (rawKind === 'mrna') {
    return buildProceduralInspect('mrna', pick);
  }
  if (rawKind === 'dna') {
    return buildProceduralInspect('dna', pick);
  }

  // 2. Machine actor pick (unless part === 'anticodon', which is the procedural anticodon track)
  const actorId = pick.actor || pick.assetId || pick.machineId || null;
  if (actorId) {
    if (String(pick.part || '').toLowerCase() === 'anticodon') {
      return buildProceduralInspect('anticodon', pick);
    }
    const worldMachine = resolveMachineFromWorld(worldState, actorId);
    const effectiveAssetId = pick.assetId || (worldMachine && worldMachine.assetId) || actorId;
    const resolved = resolveMachineEntry(actorId, effectiveAssetId, pick.part);

    const asset = lookupAsset(assets, effectiveAssetId)
      || (resolved && lookupAsset(assets, resolved.targetAssetId))
      || lookupAsset(assets, actorId);

    if (resolved) {
      const { entry, partId, key } = resolved;
      const src = asset && asset.source && asset.source.type === 'pdb' ? asset.source : null;
      const pdbId = (src && src.pdbId) || entry.defaultPdbId;
      const sourceLabel = pdbId ? `PDB ${pdbId}` : 'Procedural';
      const rcsbUrl = pdbId ? `https://www.rcsb.org/structure/${encodeURIComponent(pdbId)}` : null;
      const organism = (src && src.organism) ? src.organism : 'Escherichia coli';
      const method = formatMethodString(src, entry.defaultMethod);
      const chains = summarizeAssetChains(asset, pick.part || partId, pick.chain, entry.defaultChains);
      const detail = resolveDetailLevel(pick, actorId, effectiveAssetId, opts);

      return {
        name: entry.name,
        plain: PLAIN_INSPECT[key] || null,
        title: entry.name,
        role: entry.role,
        source: sourceLabel,
        pdbId,
        rcsbUrl,
        organism,
        method,
        chains,
        chainsShown: chains,
        detail,
        detailLevel: detail,
        simplifications: [...entry.simplifications],
      };
    }

    // Fallback for synthetic or unknown machine assets (e.g. fixture-machine)
    if (asset) {
      const src = asset.source || {};
      const pdbId = src.type === 'pdb' && src.pdbId ? src.pdbId : null;
      const sourceLabel = pdbId ? `PDB ${pdbId}` : 'Synthetic fixture';
      const rcsbUrl = pdbId ? `https://www.rcsb.org/structure/${encodeURIComponent(pdbId)}` : null;
      const organism = src.organism || 'Synthetic model';
      const method = pdbId ? formatMethodString(src, 'Cryo-EM') : (src.notes || 'Synthetic geometry');
      const chains = summarizeAssetChains(asset, pick.part, pick.chain, null);
      const detail = resolveDetailLevel(pick, actorId, effectiveAssetId, opts);
      return {
        name: asset.name || actorId,
        title: asset.name || actorId,
        role: 'Macromolecular machine assembly.',
        source: sourceLabel,
        pdbId,
        rcsbUrl,
        organism,
        method,
        chains,
        chainsShown: chains,
        detail,
        detailLevel: detail,
        simplifications: ['Rigid structure'],
      };
    }
    return null;
  }

  // 3. Peptide residue pick (`pick.residue >= 0`)
  if (Number.isInteger(pick.residue) && pick.residue >= 0) {
    return buildProceduralInspect('peptide', pick);
  }

  // 4. Procedural nucleotide pick (`pick.nucleotide >= 0` or explicit role/strand)
  const role = String(pick.role || '').toLowerCase();
  const hasNuc = Number.isInteger(pick.nucleotide) && pick.nucleotide >= 0;
  if (role === 'anticodon' || role === 'trna') {
    return buildProceduralInspect('anticodon', pick);
  }
  if (role === 'mrna' || pick.strand === 2) {
    return buildProceduralInspect('mrna', pick);
  }
  if (role === 'coding' || role === 'template' || pick.strand === 0 || pick.strand === 1 || hasNuc) {
    return buildProceduralInspect('dna', pick);
  }

  return null;
}
