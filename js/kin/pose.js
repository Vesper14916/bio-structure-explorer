/**
 * @module kin/pose
 * Round 3 top-level kinematics poser (PLAN.md §8.1, §8.3, docs/CONTRACTS.md §7.4, task R3-S3, Argon C1–C6).
 * Translates `WorldState` into 675-nucleotide `Assembly` frames (248 coding DNA + 248 template DNA + 179 mRNA),
 * procedural `AtomGroup` buffers (`ntp`, `ppi`), `ActorSpec` transforms, FX, and camera detail focus
 * with zero per-frame typed-array allocations.
 */
import { ntpTemplate, PPI_TEMPLATE, nucleotideTemplate, Assembly, TRUE_SCALE_GENE_CONSTRUCT, codonTable } from '../science/index.js';
import { composeFrame, readFrame16, writeFrame16, slerpFrame } from './frames.js';
import { sampleTrack } from './track.js';
import { poseDuplex, machinePoseForRegister } from './duplex.js';
import { buildFreeChain, poseFreeChain, generateTailControlPoints, sampleFreeChainAt } from './chain.js';
import { poseHairpin, HAIRPIN_LENGTH } from './hairpin.js';
import { poseNtp, posePpi } from './ntp.js';
import { anticodonOf, trnaSiteFrame, poseTrnaAnticodon, poseAminoacylResidue, peptidylAttachPoint, residueCode3 } from './trna.js';
import { posePeptideOnPath } from './peptide-path.js';

const HYBRID_MAX = 9;
const HAIRPIN_START_MRNA = 151;
const HAIRPIN_END_MRNA = HAIRPIN_START_MRNA + HAIRPIN_LENGTH - 1; // 170
const TSS_REGISTER = 45;
const END_REGISTER = 223;

const newFrame = () => ({ o: [0, 0, 0], R: [1, 0, 0, 0, 1, 0, 0, 0, 1] });

function copyFrame(src, dst) {
  dst.o[0] = src.o[0]; dst.o[1] = src.o[1]; dst.o[2] = src.o[2];
  for (let i = 0; i < 9; i++) dst.R[i] = src.R[i];
  return dst;
}

/**
 * Invert the local +y and +z axes of a frame (180 deg rotation about local x) so an outward-growing
 * free chain (from 3'-most emerged nucleotide k = 0 to 5' cap k = E - 1) has its nucleotide frame +z
 * pointing 5' -> 3' (from k + 1 toward k).
 */
function flipStrandDirection(f, out = f) {
  const R = f.R, P = out.R;
  const r0 = R[0], r1 = -R[1], r2 = -R[2];
  const r3 = R[3], r4 = -R[4], r5 = -R[5];
  const r6 = R[6], r7 = -R[7], r8 = -R[8];
  P[0] = r0; P[1] = r1; P[2] = r2;
  P[3] = r3; P[4] = r4; P[5] = r5;
  P[6] = r6; P[7] = r7; P[8] = r8;
  out.o[0] = f.o[0]; out.o[1] = f.o[1]; out.o[2] = f.o[2];
  return out;
}

/**
 * Normalize construct sequences so callers can pass either `TRUE_SCALE_GENE_CONSTRUCT`
 * (`codingDna`, `templateDna`, `mrna`) or an object with `{ coding, template, rna }`.
 */
function resolveConstruct(scenarioOrConstruct) {
  const raw = (scenarioOrConstruct && scenarioOrConstruct.construct) || scenarioOrConstruct || TRUE_SCALE_GENE_CONSTRUCT;
  const coding = raw.coding || raw.codingDna || raw.sequence || TRUE_SCALE_GENE_CONSTRUCT.codingDna;
  const template = raw.template || raw.templateDna || TRUE_SCALE_GENE_CONSTRUCT.templateDna;
  const rna = raw.rna || raw.mrna || TRUE_SCALE_GENE_CONSTRUCT.mrna;
  return { raw, coding, template, rna, dnaLen: coding.length, rnaLen: rna.length };
}

/**
 * Populate a 675-nucleotide `Assembly` in place (`248` coding DNA + `248` template DNA + `179` mRNA)
 * per Argon Rule C3.
 */
export function initStoryAssembly(asm, cInfo) {
  const { coding, template, rna, dnaLen, rnaLen } = cInfo;
  // Strand 0: coding DNA (g = 0..247)
  const codingNucs = new Array(dnaLen);
  for (let g = 0; g < dnaLen; g++) {
    const t = nucleotideTemplate(coding[g], 'deoxyribose');
    codingNucs[g] = asm.addNucleotide({
      base: coding[g],
      sugar: 'deoxyribose',
      strand: 0,
      seqIndex: g,
      role: 'coding',
      frame: newFrame(),
      names: t.names,
      el: t.el,
      local: t.local,
      bonds: t.bonds,
    });
    codingNucs[g].seqIndex = g;
  }
  for (let g = 1; g < dnaLen; g++) {
    asm.addLink(codingNucs[g - 1], codingNucs[g], true);
  }

  // Strand 1: template DNA (index 248 + g for g = 0..247)
  const templateNucs = new Array(dnaLen);
  for (let g = 0; g < dnaLen; g++) {
    const t = nucleotideTemplate(template[g], 'deoxyribose');
    templateNucs[g] = asm.addNucleotide({
      base: template[g],
      sugar: 'deoxyribose',
      strand: 1,
      seqIndex: g,
      role: 'template',
      frame: newFrame(),
      names: t.names,
      el: t.el,
      local: t.local,
      bonds: t.bonds,
    });
    templateNucs[g].seqIndex = g;
  }
  // Antiparallel 5' -> 3' direction on template strand: g + 1 is 5' of g (Argon C3)
  for (let g = 0; g < dnaLen - 1; g++) {
    asm.addLink(templateNucs[g + 1], templateNucs[g], true);
  }
  // Watson-Crick pairs for g = 0..247
  for (let g = 0; g < dnaLen; g++) {
    asm.addPair(codingNucs[g], templateNucs[g], 1);
  }

  // Strand 2: mRNA (index 496 + j for j = 0..178)
  const rnaNucs = new Array(rnaLen);
  for (let j = 0; j < rnaLen; j++) {
    const t = nucleotideTemplate(rna[j], 'ribose');
    const codon = (j >= 24 && j < 144) ? Math.floor((j - 24) / 3) + 1 : 0;
    rnaNucs[j] = asm.addNucleotide({
      base: rna[j],
      sugar: 'ribose',
      strand: 2,
      seqIndex: j,
      role: 'mrna',
      codon,
      visible: false,
      frame: newFrame(),
      names: t.names,
      el: t.el,
      local: t.local,
      bonds: t.bonds,
    });
    rnaNucs[j].seqIndex = j;
  }
  for (let j = 1; j < rnaLen; j++) {
    asm.addLink(rnaNucs[j - 1], rnaNucs[j], false);
  }

  // Strand 3 (translation only, R3-K3/S4): anticodons 34-36 of the tRNA for each sense codon k = 1..40,
  // 120 nucleotides at 675 + 3(k - 1) + q, each paired with its codon nucleotide (34 <-> 3rd, 36 <-> 1st).
  if (cInfo.translation) {
    for (let k = 1; k <= 40; k++) {
      const j0 = 24 + 3 * (k - 1);
      const anti = anticodonOf(rna.slice(j0, j0 + 3));
      const ac = [];
      for (let q = 0; q < 3; q++) {
        const t = nucleotideTemplate(anti[q], 'ribose');
        const nu = asm.addNucleotide({
          base: anti[q], sugar: 'ribose', strand: 3, seqIndex: 3 * (k - 1) + q, role: 'trna', tag: `anticodon:${k}`,
          visible: false, frame: newFrame(), names: t.names, el: t.el, local: t.local, bonds: t.bonds,
        });
        nu.seqIndex = 3 * (k - 1) + q;
        nu.anticodonOf = k;
        ac.push(nu);
      }
      asm.addLink(ac[0], ac[1], false);
      asm.addLink(ac[1], ac[2], false);
      for (let q = 0; q < 3; q++) asm.addPair(rnaNucs[j0 + 2 - q], ac[q], 0);
    }
  }

  asm.meta = {
    kind: 'gene-expression',
    nucleicAcid: 'dna-rna',
    sequence: coding,
    length: dnaLen,
    mrnaLength: rnaLen,
    // Keep Viewer.root at identity so Round 3 world (+x horizontal DNA, +y up, +z viewer) matches camera/actor space 1:1.
    axis: [[0, -0.5, 0], [0, 0.5, 0]],
  };
  asm.finalize();
  return asm;
}

/**
 * Create a reusable `Poser` with precomputed molecular templates and typed working buffers.
 * Accepts either `createPoser({ construct, assets })` or `createPoser(scenario, assets)`.
 *
 * @param {object} scenarioOrOpts - `{ construct, assets, scenario }` or `scenario` directly.
 * @param {object} [maybeAssets] - Decoded machine asset map keyed by asset id when called with 2 arguments.
 * @returns {{ pose: (world: object, target?: object) => object, reset: () => void, asm: Assembly }} Poser instance.
 */
export function createPoser(scenarioOrOpts = {}, maybeAssets = undefined) {
  let rawScenario = scenarioOrOpts;
  let assets = maybeAssets;
  if (
    maybeAssets === undefined &&
    scenarioOrOpts &&
    typeof scenarioOrOpts === 'object' &&
    ('assets' in scenarioOrOpts || 'construct' in scenarioOrOpts || 'scenario' in scenarioOrOpts)
  ) {
    rawScenario = scenarioOrOpts.construct || scenarioOrOpts.scenario || TRUE_SCALE_GENE_CONSTRUCT;
    assets = scenarioOrOpts.assets || {};
  }
  assets = assets || {};
  const cInfo = resolveConstruct(rawScenario);
  const { raw: construct, dnaLen, rnaLen } = cInfo;
  const tlKit = createTranslationKit(cInfo, assets);
  cInfo.translation = Boolean(tlKit);

  // Preallocated typed buffers (zero per-frame heap allocation)
  const dnaFrames = new Float32Array(32 * dnaLen);
  const hairpinLocalFrames = new Float32Array(16 * HAIRPIN_LENGTH);
  const freeChainLocalFrames = new Float32Array(16 * rnaLen);

  // Precompute RNAP-local free chain splines (Argon C2b):
  // 1) From rnaExit outward along unit(rnaExit.o - tracks.rna[-9].o), stepped 2.8 A outward so k=0 clears L1 beads
  const ecAsset = assets['rnap-ec'] || null;
  const rnaExitO = (ecAsset && ecAsset.anchors && ecAsset.anchors.rnaExit)
    ? ecAsset.anchors.rnaExit.o
    : [-33.338, -12.841, -13.813];
  const rna9O = (ecAsset && ecAsset.tracks && ecAsset.tracks.rna && ecAsset.tracks.rna.frames[3])
    ? ecAsset.tracks.rna.frames[3].o
    : [-16.761, -18.379, -1.297];
  const hairpinAnchor = (ecAsset && ecAsset.anchors && ecAsset.anchors.hairpin)
    ? ecAsset.anchors.hairpin
    : {
      o: [-32.384, -9.451, -5.123],
      R: [-0.382298, -0.662703, -0.643951, -0.909916, 0.14861, 0.387257, -0.160939, 0.733989, -0.659817],
    };

  const dx = rnaExitO[0] - rna9O[0], dy = rnaExitO[1] - rna9O[1], dz = rnaExitO[2] - rna9O[2];
  const dl = Math.hypot(dx, dy, dz) || 1;
  const exitTan = [dx / dl, dy / dl, dz / dl];

  // Start point at rnaExit + 3.0 A outward along exitTan and gentle upward/outward arc clear of RNAP core & sigma
  const exitStart = [
    rnaExitO[0] + exitTan[0] * 3.0,
    rnaExitO[1] + exitTan[1] * 3.0,
    rnaExitO[2] + exitTan[2] * 3.0,
  ];
  const exitMid = [
    exitStart[0] + exitTan[0] * 28.0,
    exitStart[1] + exitTan[1] * 28.0 - 8.0,
    exitStart[2] + exitTan[2] * 28.0 - 10.0,
  ];
  const exitFar = [
    exitMid[0] + exitTan[0] * 40.0,
    exitMid[1] + exitTan[1] * 40.0 - 12.0,
    exitMid[2] + exitTan[2] * 40.0 - 15.0,
  ];
  const rnapExitChain = buildFreeChain([exitStart, exitMid, exitFar], {
    seed: 19,
    chainId: 'mrna-rnap-exit',
    extendTo: rnaLen + 10,
    swayAmplitude: 3.5,
    anchorDampRadius: 35,
  });

  // 2) Upstream 5' tail emerging from the 5' foot of the terminator hairpin (mRNA[150] -> mRNA[0])
  const hpStart = [
    hairpinAnchor.o[0] + exitTan[0] * 3.5,
    hairpinAnchor.o[1] + exitTan[1] * 3.5 - 2.0,
    hairpinAnchor.o[2] + exitTan[2] * 3.5 - 3.0,
  ];
  const hpMid = [
    hpStart[0] + exitTan[0] * 30.0,
    hpStart[1] + exitTan[1] * 30.0 - 10.0,
    hpStart[2] + exitTan[2] * 30.0 - 12.0,
  ];
  const hpFar = [
    hpMid[0] + exitTan[0] * 45.0,
    hpMid[1] + exitTan[1] * 45.0 - 14.0,
    hpMid[2] + exitTan[2] * 45.0 - 16.0,
  ];
  const hairpinTailChain = buildFreeChain([hpStart, hpMid, hpFar], {
    seed: 23,
    chainId: 'mrna-hairpin-tail',
    extendTo: rnaLen + 10,
    swayAmplitude: 3.5,
    anchorDampRadius: 35,
  });

  // Preallocated NTP & PPi AtomGroup objects
  const maxNtpAtoms = Math.max(
    ntpTemplate('A').names.length,
    ntpTemplate('C').names.length,
    ntpTemplate('G').names.length,
    ntpTemplate('U').names.length,
  );
  const ntpGroup = {
    id: 'ntp',
    count: 0,
    pos: new Float32Array(maxNtpAtoms * 3),
    el: null,
    names: null,
    bonds: null,
    opacity: 1,
    visible: false,
    label: 'NTP',
    role: 'ntp',
  };
  const ppiGroup = {
    id: 'ppi',
    count: PPI_TEMPLATE.names.length,
    pos: new Float32Array(PPI_TEMPLATE.names.length * 3),
    el: PPI_TEMPLATE.el,
    names: PPI_TEMPLATE.names,
    bonds: null,
    opacity: 0,
    visible: false,
    label: 'PPi',
    role: 'ppi',
  };

  // Preallocated actor specs pool
  const actorPool = [];
  const acquireActor = idx => {
    while (actorPool.length <= idx) {
      actorPool.push({
        id: '',
        assetId: '',
        asset: null,
        transform: newFrame(),
        opacity: 1,
        visible: true,
        parts: null,
        cutaway: false,
        lod: 'auto',
        label: '',
        pickable: true,
      });
    }
    return actorPool[idx];
  };

  // Preallocated buffers for RNAP L1 clearance guard (Argon C4/C5 & PLAN.md §5.3 item 8)
  const MAX_L1_BEADS = 4096;
  const l1WorldX = new Float32Array(MAX_L1_BEADS);
  const l1WorldY = new Float32Array(MAX_L1_BEADS);
  const l1WorldZ = new Float32Array(MAX_L1_BEADS);
  const l1WorldR = new Float32Array(MAX_L1_BEADS);
  const L1_MAX_PEN = 0.85; // strictly <= 1.0 A gate

  /**
   * Ensure a nucleotide's heavy atoms do not penetrate any visible RNAP L1 bead by more than `L1_MAX_PEN`.
   */
  const nearBeadIdx = new Int32Array(128);
  function enforceNucL1Clearance(nuc, bCount) {
    const f = nuc.frame;
    const ox = f.o[0], oy = f.o[1], oz = f.o[2];
    let nNear = 0;
    for (let b = 0; b < bCount; b++) {
      const dx = ox - l1WorldX[b];
      if (dx > 13.5 || dx < -13.5) continue;
      const dy = oy - l1WorldY[b];
      if (dy > 13.5 || dy < -13.5) continue;
      const dz = oz - l1WorldZ[b];
      if (dz > 13.5 || dz < -13.5) continue;
      if (dx * dx + dy * dy + dz * dz <= 182.25) {
        nearBeadIdx[nNear++] = b;
        if (nNear === 128) break;
      }
    }
    if (nNear === 0) return;

    const L = nuc.local;
    const ac = nuc.atomCount;
    const R = f.R;
    for (let pass = 0; pass < 3; pass++) {
      let anyHit = false;
      for (let a = 0; a < ac; a++) {
        const lx = L[3 * a], ly = L[3 * a + 1], lz = L[3 * a + 2];
        let ax = R[0] * lx + R[1] * ly + R[2] * lz + f.o[0];
        let ay = R[3] * lx + R[4] * ly + R[5] * lz + f.o[1];
        let az = R[6] * lx + R[7] * ly + R[8] * lz + f.o[2];
        for (let k = 0; k < nNear; k++) {
          const b = nearBeadIdx[k];
          const dx = ax - l1WorldX[b];
          const dy = ay - l1WorldY[b];
          const dz = az - l1WorldZ[b];
          const r = l1WorldR[b];
          const thresh = r - L1_MAX_PEN;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 >= thresh * thresh) continue;
          const d = Math.sqrt(d2) || 1e-6;
          const need = (thresh - d) + 0.02;
          const px = (dx / d) * need;
          const py = (dy / d) * need;
          const pz = (dz / d) * need;
          f.o[0] += px;
          f.o[1] += py;
          f.o[2] += pz;
          ax += px;
          ay += py;
          az += pz;
          anyHit = true;
        }
      }
      if (!anyHit) break;
    }
  }

  // Scratch frames
  const frozenRnapM = newFrame();
  const rnaRefM = newFrame();
  const localF = newFrame();
  const worldF = newFrame();
  const duplexMachineOpt = { assetId: 'rnap-ec', transform: frozenRnapM };
  const duplexOpts = { machine: null, trackBlend: 0 };

  // Default internal Assembly if caller passes an empty target
  let defaultAsm = null;

  function pose(world, target = {}) {
    if (!target.asm) {
      if (!defaultAsm) {
        defaultAsm = new Assembly();
        initStoryAssembly(defaultAsm, cInfo);
      }
      target.asm = defaultAsm;
    } else if (target.asm.nucleotides.length === 0) {
      initStoryAssembly(target.asm, cInfo);
    }

    const asm = target.asm;
    const nucs = asm.nucleotides;
    const links = asm.links;
    const pairs = asm.pairs;

    // 1. Find RNAP machine in world.machines
    const machines = world.machines || [];
    let rnapSpec = null;
    for (let i = 0; i < machines.length; i++) {
      if (machines[i] && machines[i].id === 'rnap') {
        rnapSpec = machines[i];
        break;
      }
    }

    const dna = world.dna || { machineId: null, register: TSS_REGISTER, bend: 0, bubble: [0, 0], relax: 0, trackBlend: 0 };
    const rna = world.rna || { length: 0, addProgress: 0, hairpin: 0, released: false };
    const reg = dna.register ?? TSS_REGISTER;
    const bend = dna.bend ?? 0;
    const relax = dna.relax ?? 0;
    const beta = Math.max(0, Math.min(1, bend)) * (1 - Math.max(0, Math.min(1, relax)));

    // 2. Pose 248-bp DNA duplex (Argon C1a, C1b, C4)
    // Always pass the bound reference pose machinePoseForRegister(rnap-ec, reg) to poseDuplex
    // so DNA is never dragged off the world +x axis during Chapter 2 RNAP approach or Chapter 7 RNAP departure,
    // and clamp effectiveTrackBlend >= 1e-6 so r1 = 13 (ec.C[13]) is used continuously with 0.0000 A downstream drift!
    const useDnaMachine = Boolean(rnapSpec && (dna.machineId === 'rnap' || beta > 0));
    if (useDnaMachine) {
      if (ecAsset) {
        machinePoseForRegister(ecAsset, reg, frozenRnapM);
      } else {
        copyFrame(rnapSpec.transform, frozenRnapM);
      }
      duplexMachineOpt.assetId = rnapSpec.assetId || 'rnap-ec';
      duplexOpts.machine = duplexMachineOpt;
      duplexOpts.trackBlend = Math.max(1e-6, dna.trackBlend ?? (duplexMachineOpt.assetId === 'rnap-holo' ? 0 : 1));
    } else {
      duplexOpts.machine = null;
      duplexOpts.trackBlend = 0;
    }

    poseDuplex(construct, dna, assets, dnaFrames, duplexOpts);

    // Copy 496 DNA frames into Assembly strand 0 (0..247) and strand 1 (248..495) and update pair strengths
    const bub = dna.bubble || [0, 0];
    const bLo = bub[0] ?? 0, bHi = bub[1] ?? 0;
    const bubbleOpen = beta > 0 && bHi > bLo;
    const gBubMin = bubbleOpen ? Math.ceil(reg + bLo) : 1e9;
    const gBubMax = bubbleOpen ? Math.floor(reg + bHi) : -1e9;

    for (let g = 0; g < dnaLen; g++) {
      const cNuc = nucs[g];
      const tNuc = nucs[dnaLen + g];
      readFrame16(dnaFrames, g, cNuc.frame);
      readFrame16(dnaFrames, dnaLen + g, tNuc.frame);
      cNuc.visible = true;
      tNuc.visible = true;
      pairs[g].strength = (bubbleOpen && g >= gBubMin && g <= gBubMax) ? 0 : 1;
    }

    // 3. Pose 179-nt mRNA strand 2 (indices 496 .. 674) (Argon C2a, C2b, C2c)
    const L = Math.max(0, Math.min(rnaLen, Math.floor(rna.length ?? 0)));
    const rnaStartIdx = 2 * dnaLen; // 496
    // Reference RNAP transform for mRNA: when released (or relaxing in Chapter 7), freeze at register 223
    // so the finished 179-nt transcript stays posed in solvent near the termination site rather than flying away with RNAP.
    if (rnapSpec && !rna.released && relax === 0) {
      copyFrame(rnapSpec.transform, rnaRefM);
    } else if (ecAsset) {
      machinePoseForRegister(ecAsset, rna.released ? END_REGISTER : reg, rnaRefM);
      if (rna.released) {
        // Gentle solvent settle offset after release so mRNA detaches cleanly from the closing DNA duplex
        rnaRefM.o[1] -= 14.0 * Math.min(1, relax);
        rnaRefM.o[2] -= 10.0 * Math.min(1, relax);
      }
    } else if (rnapSpec) {
      copyFrame(rnapSpec.transform, rnaRefM);
    }

    const rnaTrack = ecAsset && ecAsset.tracks && ecAsset.tracks.rna ? ecAsset.tracks.rna : null;
    const H = Math.min(L, HYBRID_MAX);
    const storyTime = world.t ?? 0;

    if (L > 0) {
      // 3a. 3'-most H nucleotides (j = L - H .. L - 1): RNA-DNA hybrid at registers r = j - L (-H .. -1)
      for (let j = L - H; j < L; j++) {
        const r = j - L; // in [-9, -1]
        if (rnaTrack) {
          sampleTrack(rnaTrack, r, localF);
        } else {
          localF.o[0] = 0; localF.o[1] = 0; localF.o[2] = r * 2.81;
          localF.R[0] = 1; localF.R[1] = 0; localF.R[2] = 0;
          localF.R[3] = 0; localF.R[4] = 1; localF.R[5] = 0;
          localF.R[6] = 0; localF.R[7] = 0; localF.R[8] = 1;
        }
        composeFrame(rnaRefM, localF, nucs[rnaStartIdx + j].frame);
      }

      // 3b. Emerged 5' nucleotides (j = 0 .. L - H - 1, count E = L - H)
      const E = L - H;
      if (E > 0) {
        const hasHairpin = (rna.hairpin ?? 0) > 0 && E > HAIRPIN_START_MRNA;
        if (hasHairpin) {
          // Pose terminator hairpin (mRNA[151..170]) in RNAP local frame, then transform by rnaRefM
          poseHairpin(hairpinAnchor, rna.hairpin, hairpinLocalFrames, {
            totalTranscriptLength: L + (rna.addProgress ?? 0),
            hairpinStart: HAIRPIN_START_MRNA,
          });
          const hpEnd = Math.min(E - 1, HAIRPIN_END_MRNA);
          for (let j = HAIRPIN_START_MRNA; j <= hpEnd; j++) {
            readFrame16(hairpinLocalFrames, j - HAIRPIN_START_MRNA, localF);
            composeFrame(rnaRefM, localF, nucs[rnaStartIdx + j].frame);
          }
          // Upstream 5' tail (j = 0 .. 150, count tailCount = min(E, 151)) extending outward from hairpin 5' foot
          const tailCount = Math.min(E, HAIRPIN_START_MRNA);
          if (tailCount > 0) {
            poseFreeChain(hairpinTailChain, tailCount, storyTime, freeChainLocalFrames);
            for (let j = 0; j < tailCount; j++) {
              // k = 0 is closest to hairpin 5' entry (j = tailCount - 1); k = tailCount - 1 is 5' cap (j = 0)
              const k = tailCount - 1 - j;
              readFrame16(freeChainLocalFrames, k, localF);
              flipStrandDirection(localF, localF);
              composeFrame(rnaRefM, localF, nucs[rnaStartIdx + j].frame);
            }
          }
        } else {
          // Before hairpin folding: emerged 5' nucleotides (j = 0 .. E - 1) along rnapExitChain
          poseFreeChain(rnapExitChain, E, storyTime, freeChainLocalFrames);
          for (let j = 0; j < E; j++) {
            // k = 0 is closest to rnaExit (j = E - 1); k = E - 1 is 5' cap (j = 0)
            const k = E - 1 - j;
            readFrame16(freeChainLocalFrames, k, localF);
            flipStrandDirection(localF, localF);
            composeFrame(rnaRefM, localF, nucs[rnaStartIdx + j].frame);
          }
        }
      }
    }

    // 3c. Enforce slot-track L1 clearance (<= 0.85 A <= 1.0 A gate) when RNAP is bound in an active open complex
    const isFractionalReg = Math.abs(reg - Math.round(reg)) > 1e-4;
    const isHoloActive = rnapSpec && rnapSpec.assetId === 'rnap-holo';
    if (rnapSpec && rnapSpec.visible !== false && bend === 1 && relax === 0 && (isHoloActive || isFractionalReg)) {
      const rnapAsset = assets[rnapSpec.assetId] || ecAsset;
      if (rnapAsset && rnapAsset.lod1) {
        const l1 = rnapAsset.lod1;
        const M = rnapSpec.transform;
        const mR = M.R, mo = M.o;
        let bCount = 0;
        for (let b = 0; b < l1.count; b++) {
          const chId = l1.chain[b];
          const partId = rnapAsset.chains[chId].part;
          const pSpec = rnapSpec.parts && rnapSpec.parts[partId];
          if (pSpec && (pSpec.visible === false || (pSpec.opacity !== undefined && pSpec.opacity <= 0.001))) continue;
          let lx = l1.positions[3 * b], ly = l1.positions[3 * b + 1], lz = l1.positions[3 * b + 2];
          if (pSpec && pSpec.transform && pSpec.transform.o) {
            lx += pSpec.transform.o[0];
            ly += pSpec.transform.o[1];
            lz += pSpec.transform.o[2];
          }
          if (lx < -130 || lx > 35 || ly < -95 || ly > 45 || lz < -45 || lz > 65) continue;
          l1WorldX[bCount] = mR[0] * lx + mR[1] * ly + mR[2] * lz + mo[0];
          l1WorldY[bCount] = mR[3] * lx + mR[4] * ly + mR[5] * lz + mo[1];
          l1WorldZ[bCount] = mR[6] * lx + mR[7] * ly + mR[8] * lz + mo[2];
          l1WorldR[bCount] = l1.kind[b] === 1 ? 2.4 : 1.9;
          bCount++;
        }

        const r0 = isHoloActive ? -45 : -15;
        const r1 = isHoloActive ? 11 : 13;
        const gLo = Math.max(0, Math.ceil(reg + r0));
        const gHi = Math.min(dnaLen - 1, Math.floor(reg + r1));
        for (let g = gLo; g <= gHi; g++) {
          enforceNucL1Clearance(nucs[g], bCount);
          enforceNucL1Clearance(nucs[dnaLen + g], bCount);
        }

        if (!rna.released && L > 0) {
          const startJ = (rna.hairpin ?? 0) > 0 ? Math.min(HAIRPIN_START_MRNA, L - H) : (L - H);
          for (let j = Math.max(0, startJ); j < L; j++) {
            enforceNucL1Clearance(nucs[rnaStartIdx + j], bCount);
          }
        }
      }
    }

    // Update visibility of all 179 mRNA nucleotides and active state of strand-2 backbone links
    for (let j = 0; j < rnaLen; j++) {
      const nu = nucs[rnaStartIdx + j];
      nu.visible = j < L;
      if (j >= L) {
        copyFrame(rnaRefM, nu.frame);
      }
    }
    const rnaLinkOffset = 2 * (dnaLen - 1); // 494 DNA links precede the 178 mRNA links
    for (let j = 1; j < rnaLen; j++) {
      links[rnaLinkOffset + j - 1].active = j < L;
    }

    // 3d. Translation layout (R3-S4): mRNA on the ribosome track and tails, tRNA anticodons and codon pairs.
    const tlActive = Boolean(tlKit) && nucs.length > rnaStartIdx + rnaLen &&
      tlKit.poseNucleotides(world, nucs, pairs, links, rnaStartIdx, rnaStartIdx + rnaLen, dnaLen,
        2 * (dnaLen - 1) + (rnaLen - 1));

    // Recompute all atom positions in place for deterministic bit-for-bit output across all nucleotides
    asm.updatePositions();

    // 4. Populate procedural AtomGroups (NTP & PPi)
    if (!Array.isArray(target.groups)) target.groups = [];
    target.groups.length = 0;

    if (rnapSpec) {
      const rnapAsset = assets[rnapSpec.assetId] || ecAsset;
      const ntpOut = poseNtp(world.ntp, rnapSpec.transform, rnapAsset, ntpGroup, ecAsset);
      if (ntpOut && ntpOut.visible) target.groups.push(ntpOut);

      const ppiSource = (world.ppi && world.ppi.opacity > 0) ? world.ppi : world.ntp;
      const ppiOut = posePpi(ppiSource, rnapSpec.transform, rnapAsset, ppiGroup, ecAsset);
      if (ppiOut && ppiOut.visible) target.groups.push(ppiOut);
    }

    // 5. Populate ActorSpecs in target.actors
    if (!Array.isArray(target.actors)) target.actors = [];
    target.actors.length = 0;

    for (let i = 0; i < machines.length; i++) {
      const m = machines[i];
      if (!m || m.visible === false) continue;
      const act = acquireActor(target.actors.length);
      act.id = m.id;
      act.assetId = m.assetId;
      act.asset = assets[m.assetId] || null;
      copyFrame(m.transform, act.transform);
      act.opacity = m.opacity ?? 1;
      act.visible = m.visible !== false;
      act.parts = m.parts || null;
      act.cutaway = m.cutaway ?? false;
      act.lod = m.lod || 'auto';
      act.label = m.label || '';
      act.pickable = m.pickable !== false;
      target.actors.push(act);
    }

    // 5b. Translation actors and atom groups (tRNAs, aminoacyl residues, peptide).
    if (tlActive) tlKit.poseGroupsAndActors(world, target, world.fx);

    // 6. Populate target.fx and target.focus
    if (!target.fx || typeof target.fx !== 'object') {
      target.fx = { pulses: [], flashes: [], list: [] };
    }
    if (Array.isArray(target.fx)) {
      target.fx.length = 0;
      if (Array.isArray(world.fx)) {
        for (let i = 0; i < world.fx.length; i++) target.fx.push(world.fx[i]);
      }
    } else {
      target.fx.pulses = Array.isArray(world.fx) ? world.fx : [];
      target.fx.flashes = [];
      target.fx.list = Array.isArray(world.fx) ? world.fx : [];
    }

    if (!target.focus) target.focus = { center: [0, 0, 0], radius: 24 };
    if (tlActive && tlKit.focusCenter(world, target.focus.center)) {
      target.focus.radius = 30;
    } else if (rnapSpec && !rna.released) {
      const actSite = (ecAsset && ecAsset.anchors && ecAsset.anchors.activeSite)
        ? ecAsset.anchors.activeSite.o
        : [4.632, 4.565, -6.39];
      const R = rnapSpec.transform.R, o = rnapSpec.transform.o;
      target.focus.center[0] = R[0] * actSite[0] + R[1] * actSite[1] + R[2] * actSite[2] + o[0];
      target.focus.center[1] = R[3] * actSite[0] + R[4] * actSite[1] + R[5] * actSite[2] + o[1];
      target.focus.center[2] = R[6] * actSite[0] + R[7] * actSite[1] + R[8] * actSite[2] + o[2];
      target.focus.radius = 32;
    } else {
      // Promoter (+1 TSS, bp 45) or termination site center
      const focusBp = rna.released ? END_REGISTER : TSS_REGISTER;
      const cNuc = nucs[Math.min(dnaLen - 1, Math.max(0, Math.round(focusBp)))];
      target.focus.center[0] = cNuc.frame.o[0];
      target.focus.center[1] = cNuc.frame.o[1];
      target.focus.center[2] = cNuc.frame.o[2];
      target.focus.radius = 40;
    }

    return target;
  }

  function reset() {
    defaultAsm = null;
  }

  return { pose, reset };
}

// ---------------------------------------------------------------------------------------------------
// Translation parts (task R3-S4): mRNA translation layout and sliding, tRNA actors, procedural anticodons
// paired with their codons (R3-K3), aminoacyl residues, and the peptide through the exit tunnel.
// ---------------------------------------------------------------------------------------------------

const ORF_START_MRNA = 24;          // mRNA index of the first nucleotide of codon 1 (PLAN.md §5.1)
const SENSE_CODONS = 40;
const TL_ENTER_DISTANCE = 220;      // factor / carried-tRNA approach distance (PLAN.md §10 R3-S4)
const TL_RELEASE_DISTANCE = 60;     // part or factor release distance (PLAN.md §4.4)
const TAIL_EXTRA_NT = 4;
const IDENTITY_FRAME = Object.freeze({ o: Object.freeze([0, 0, 0]), R: Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]) });

/** Unit vector `b - a`. */
function unitBetween(a, b, out = [0, 0, 0]) {
  const x = b[0] - a[0], y = b[1] - a[1], z = b[2] - a[2];
  const l = Math.hypot(x, y, z) || 1;
  out[0] = x / l; out[1] = y / l; out[2] = z / l;
  return out;
}

function applyPoint(f, p, out = [0, 0, 0]) {
  const R = f.R, o = f.o;
  const x = p[0], y = p[1], z = p[2];
  out[0] = R[0] * x + R[1] * y + R[2] * z + o[0];
  out[1] = R[3] * x + R[4] * y + R[5] * z + o[1];
  out[2] = R[6] * x + R[7] * y + R[8] * z + o[2];
  return out;
}

/**
 * Build a ribosome-local free-chain tail leaving the mRNA track at `endReg` (outward, `dirSign` = +1 for the
 * 3′ tail beyond register +15, -1 for the 5′ tail beyond register −16). The tail first continues along the
 * track, then turns away from the ribosome centre and wanders deterministically (seeded).
 */
function buildMrnaTail(ribo, endReg, dirSign, ntCount, seed, chainId) {
  const track = ribo.tracks.mrna;
  const fEnd = sampleTrack(track, endReg, newFrame());
  const fIn = sampleTrack(track, endReg - dirSign, newFrame());
  const t0 = unitBetween(fIn.o, fEnd.o);
  const centre = ribo.anchors.center.o;
  const radial = unitBetween(centre, fEnd.o);
  const p0 = fEnd.o.slice();
  const p1 = [p0[0] + t0[0] * 10, p0[1] + t0[1] * 10, p0[2] + t0[2] * 10];
  const bend = unitBetween([0, 0, 0], [t0[0] + 1.6 * radial[0], t0[1] + 1.6 * radial[1], t0[2] + 1.6 * radial[2]]);
  const p2 = [p1[0] + bend[0] * 36, p1[1] + bend[1] * 36, p1[2] + bend[2] * 36];
  const out = unitBetween([0, 0, 0], [0.4 * t0[0] + radial[0], 0.4 * t0[1] + radial[1], 0.4 * t0[2] + radial[2]]);
  const rest = generateTailControlPoints(p2, out, ntCount, { seed, chainId, maxTurnDeg: 25 });
  const seedFrame = dirSign > 0 ? fEnd : flipStrandDirection(fEnd, newFrame());
  return buildFreeChain([p0, p1, ...rest], {
    seed, chainId, anchorStart: true, anchorEnd: false, swayAmplitude: 3.5, anchorDampRadius: 40,
    seedFrame, extendTo: ntCount + TAIL_EXTRA_NT,
  });
}

/**
 * Create the translation kit when the ribosome and both tRNA assets are present (otherwise null, and the
 * Assembly keeps its 675-nucleotide transcription topology).
 */
function createTranslationKit(cInfo, assets) {
  const ribo = assets['ribosome-70s'];
  const trnaAssets = { init: assets['trna-init'], aa: assets['trna-aa'] };
  if (!ribo || !ribo.tracks || !ribo.tracks.mrna || !trnaAssets.init || !trnaAssets.aa) return null;
  const { rna, rnaLen } = cInfo;
  const track = ribo.tracks.mrna;
  const r0 = track.registers[0];
  const r1 = track.registers[track.registers.length - 1];

  // Codons, anticodons and residue codes of the ORF (codon k = 1..40).
  const codons = [];
  for (let k = 1; k <= SENSE_CODONS; k++) {
    const j = ORF_START_MRNA + 3 * (k - 1);
    codons.push(rna.slice(j, j + 3));
  }
  const anticodons = codons.map(anticodonOf);
  const residueCodes = codonTable(cInfo.raw).slice(0, SENSE_CODONS).map(c => residueCode3(c.aa3));
  const residuePrefixes = [[]];
  for (let n = 1; n <= SENSE_CODONS; n++) residuePrefixes.push(residueCodes.slice(0, n));

  // mRNA tails in the ribosome frame (longest reach: 3′ at codon 1, 5′ at codon 40).
  const n3 = (rnaLen - 1 - ORF_START_MRNA) - r1 + 3; // codon 1: nucleotide 178 beyond register +15
  const n5 = (ORF_START_MRNA + 3 * (SENSE_CODONS - 1)) + r0 + 3; // codon 40: nucleotide 0 beyond register -16
  const tail3 = buildMrnaTail(ribo, r1, +1, n3, 31, 'mrna-ribo-3p');
  const tail5 = buildMrnaTail(ribo, r0, -1, n5, 37, 'mrna-ribo-5p');
  const tailBuf3 = new Float32Array(16 * (rnaLen + 8));
  const tailBuf5 = new Float32Array(16 * (rnaLen + 8));

  // Factor directions (ribosome centre -> factor centre) for tRNAs carried in by EF-Tu or IF2.
  const carrierDir = {};
  for (const id of ['ef-tu', 'if2']) {
    const a = assets[id];
    carrierDir[id] = a && a.anchors && a.anchors.center ? unitBetween(ribo.anchors.center.o, a.anchors.center.o) : [0, 0, 1];
  }

  // Ribosome-frame tunnel polyline (asset path) and a free path beyond the exit.
  const tunnel = ribo.paths && ribo.paths.tunnel;
  const tunnelLocal = [];
  if (tunnel) for (let i = 0; i < tunnel.count; i++) tunnelLocal.push([tunnel.points[3 * i], tunnel.points[3 * i + 1], tunnel.points[3 * i + 2]]);
  let worldCache = null; // { key, tunnel: number[][], free: chain }

  function worldPaths(layout) {
    const key = layout.o.join(',') + '|' + layout.R.join(',');
    if (worldCache && worldCache.key === key) return worldCache;
    const tw = tunnelLocal.map(p => applyPoint(layout, p));
    const n = tw.length;
    const exitDir = unitBetween(tw[n - 4], tw[n - 1]);
    const radial = unitBetween(applyPoint(layout, ribo.anchors.center.o), tw[n - 1]);
    const d = unitBetween([0, 0, 0], [exitDir[0] + radial[0], exitDir[1] + radial[1], exitDir[2] + radial[2]]);
    const q0 = tw[n - 1];
    const q1 = [q0[0] + exitDir[0] * 12, q0[1] + exitDir[1] * 12, q0[2] + exitDir[2] * 12];
    const rest = generateTailControlPoints([q1[0] + d[0] * 20, q1[1] + d[1] * 20, q1[2] + d[2] * 20], d, 60, { seed: 41, chainId: 'peptide-free', maxTurnDeg: 25 });
    // Static (non-swaying) free path sampled once every 3 Å: re-sampling a swaying chain per frame costs ~3 ms.
    const chain = buildFreeChain([q0, q1, ...rest], { seed: 41, chainId: 'peptide-free', anchorStart: true, anchorEnd: false, swayAmplitude: 0 });
    const len = sampleFreeChainAt(chain, 0, 0).length;
    const free = [];
    for (let s = 0; s <= len; s += 3) free.push(sampleFreeChainAt(chain, s, 0).point);
    worldCache = { key, tunnel: tw, free };
    return worldCache;
  }

  // Ribosome L1 beads within 60 Å of any mRNA track register (ribo frame), for the §5.3 item 8 guard:
  // procedural nucleotides in and next to the slot track are pushed out of beads beyond 0.85 Å (<= 1.0 Å gate).
  const l1 = ribo.lod1;
  const nearIdx = [];
  if (l1) {
    const tO = track.frames.map(f => f.o);
    for (let b = 0; b < l1.count; b++) {
      const x = l1.positions[3 * b], y = l1.positions[3 * b + 1], z = l1.positions[3 * b + 2];
      for (let i = 0; i < tO.length; i++) {
        const dx = x - tO[i][0], dy = y - tO[i][1], dz = z - tO[i][2];
        if (dx * dx + dy * dy + dz * dz <= 3600) { nearIdx.push(b); break; }
      }
    }
  }
  const NB = nearIdx.length;
  const bLocal = new Float32Array(3 * NB), bRad = new Float32Array(NB), bLarge = new Uint8Array(NB);
  nearIdx.forEach((b, i) => {
    bLocal[3 * i] = l1.positions[3 * b]; bLocal[3 * i + 1] = l1.positions[3 * b + 1]; bLocal[3 * i + 2] = l1.positions[3 * b + 2];
    bRad[i] = l1.kind[b] === 1 ? 2.4 : 1.9;
    bLarge[i] = ribo.chains[l1.chain[b]].part === 'large' ? 1 : 0;
  });
  const bx = new Float32Array(NB), by = new Float32Array(NB), bz = new Float32Array(NB), br = new Float32Array(NB);
  const nearB = new Int32Array(256);
  const MAX_PEN = 0.85;

  function loadBeads(M, large) {
    let n = 0;
    const R = M.R, o = M.o;
    for (let i = 0; i < NB; i++) {
      let x = bLocal[3 * i], y = bLocal[3 * i + 1], z = bLocal[3 * i + 2];
      if (bLarge[i]) {
        if (!large) continue;
        x += large.o[0]; y += large.o[1]; z += large.o[2];
      }
      bx[n] = R[0] * x + R[1] * y + R[2] * z + o[0];
      by[n] = R[3] * x + R[4] * y + R[5] * z + o[1];
      bz[n] = R[6] * x + R[7] * y + R[8] * z + o[2];
      br[n] = bRad[i];
      n++;
    }
    return n;
  }

  /** Push a nucleotide frame out of L1 beads so no heavy atom lies deeper than MAX_PEN inside one. */
  function clearNuc(nu, count) {
    const f = nu.frame;
    let nNear = 0;
    for (let b = 0; b < count && nNear < 256; b++) {
      const dx = f.o[0] - bx[b];
      if (dx > 14 || dx < -14) continue;
      const dy = f.o[1] - by[b];
      if (dy > 14 || dy < -14) continue;
      const dz = f.o[2] - bz[b];
      if (dz > 14 || dz < -14) continue;
      if (dx * dx + dy * dy + dz * dz <= 196) nearB[nNear++] = b;
    }
    if (nNear === 0) return;
    const Lc = nu.local, R = f.R;
    for (let pass = 0; pass < 4; pass++) {
      let hit = false;
      for (let a = 0; a < nu.atomCount; a++) {
        const lx = Lc[3 * a], ly = Lc[3 * a + 1], lz = Lc[3 * a + 2];
        let ax = R[0] * lx + R[1] * ly + R[2] * lz + f.o[0];
        let ay = R[3] * lx + R[4] * ly + R[5] * lz + f.o[1];
        let az = R[6] * lx + R[7] * ly + R[8] * lz + f.o[2];
        for (let k = 0; k < nNear; k++) {
          const b = nearB[k];
          const dx = ax - bx[b], dy = ay - by[b], dz = az - bz[b];
          const th = br[b] - MAX_PEN;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 >= th * th) continue;
          const d = Math.sqrt(d2) || 1e-6;
          const need = th - d + 0.02;
          const px = dx / d * need, py = dy / d * need, pz = dz / d * need;
          f.o[0] += px; f.o[1] += py; f.o[2] += pz;
          ax += px; ay += py; az += pz;
          hit = true;
        }
      }
      if (!hit) break;
    }
  }

  // Scratch
  const fA = newFrame(), fB = newFrame(), fL = newFrame(), fW = newFrame(), fS = newFrame();
  const acBuf = new Float32Array(48);
  const codonFrameRefs = [null, null, null];
  const trnaSpec = { transform: newFrame(), pair: 0, codonFrames: codonFrameRefs };
  const pVec = [0, 0, 0], dVec = [0, 0, 0];
  const attachPt = [0, 0, 0];
  const aaGroups = [{}, {}, {}, {}].map((g, s) => Object.assign(g, { id: `aa:${s}`, opacity: 1, label: 'Amino acid' }));
  const peptideGroup = { id: 'peptide', opacity: 1, label: 'Peptide' };
  const trnaActors = [0, 1, 2, 3].map(s => ({
    id: `trna:${s}`, assetId: 'trna-aa', asset: null, transform: newFrame(), opacity: 1, visible: true,
    parts: { body: { visible: true, opacity: 1 }, anticodon: { visible: false, opacity: 0 } },
    cutaway: false, lod: 'auto', label: 'tRNA', pickable: true,
  }));
  const trnaWorld = [newFrame(), newFrame(), newFrame(), newFrame()];
  const trnaKind = ['aa', 'aa', 'aa', 'aa'];
  const trnaPresent = [false, false, false, false];
  const staticP = { transform: newFrame() };

  /** Frame of the tail nucleotide `d` registers beyond the track end (fractional), from a posed tail buffer. */
  function tailFrame(buf, d, endFrame, flip, out) {
    if (d < 1) {
      readFrame16(buf, 1, fB);
      if (flip) flipStrandDirection(fB, fB);
      return slerpFrame(endFrame, fB, d, out);
    }
    const k = Math.floor(d), u = d - k;
    readFrame16(buf, k, fA);
    if (flip) flipStrandDirection(fA, fA);
    if (u === 0) return copyFrame(fA, out);
    readFrame16(buf, k + 1, fB);
    if (flip) flipStrandDirection(fB, fB);
    return slerpFrame(fA, fB, u, out);
  }

  /**
   * Place the 179 mRNA nucleotides on the translation layout (blended from their current frames by
   * `layoutBlend`), then the visible tRNAs' anticodons and pair strengths. Returns false when idle.
   */
  function poseNucleotides(world, nucs, pairs, links, rnaStartIdx, acStartIdx, acPairStart, acLinkStart) {
    for (let i = 0; i < 3 * SENSE_CODONS; i++) {
      const nu = nucs[acStartIdx + i];
      nu.visible = false;
      // Hidden anticodons rest on their codon nucleotide so positions never depend on seek history.
      copyFrame(nucs[rnaStartIdx + ORF_START_MRNA + i - 2 * (i % 3) + 2].frame, nu.frame);
      pairs[acPairStart + i].strength = 0;
    }
    for (let i = 0; i < 2 * SENSE_CODONS; i++) links[acLinkStart + i].active = false;
    for (let s = 0; s < 4; s++) trnaPresent[s] = false;

    const rs = world.ribosome;
    const layout = rs && rs.layout;
    const rnaS = world.rna;
    if (!layout || !rnaS || rnaS.layout !== 'ribosome') return false;
    const blend = Math.max(0, Math.min(1, rnaS.layoutBlend ?? 0));
    const codon = Math.max(1, rs.codon || 1);
    const p0 = ORF_START_MRNA + 3 * (codon - 1);
    const t = world.t ?? 0;
    const L = Math.max(0, Math.min(rnaLen, Math.floor(rnaS.length ?? 0)));

    if (blend > 0 && L > 0) {
      const maxD3 = Math.max(0, (L - 1 - p0) - r1);
      const maxD5 = Math.max(0, r0 - (0 - p0));
      if (maxD3 > 0) poseFreeChain(tail3, Math.ceil(maxD3) + 2, t, tailBuf3);
      if (maxD5 > 0) poseFreeChain(tail5, Math.ceil(maxD5) + 2, t, tailBuf5);
      for (let j = 0; j < L; j++) {
        const r = j - p0;
        if (r >= r0 && r <= r1) {
          sampleTrack(track, r, fL);
        } else if (r > r1) {
          sampleTrack(track, r1, fS);
          tailFrame(tailBuf3, r - r1, fS, false, fL);
        } else {
          sampleTrack(track, r0, fS);
          tailFrame(tailBuf5, r0 - r, fS, true, fL);
        }
        composeFrame(layout, fL, fW);
        const nf = nucs[rnaStartIdx + j].frame;
        if (blend >= 1) copyFrame(fW, nf);
        else slerpFrame(nf, fW, blend, nf);
      }
    }

    // Clearance guard (whenever the ribosome machine is in the scene, including the 30S docking in chapter 8):
    // mRNA nucleotides within 30 registers of the track.
    let beadCount = 0;
    if (NB > 0) {
      let rm = null;
      const ms = world.machines || [];
      for (let i = 0; i < ms.length; i++) if (ms[i] && ms[i].id === 'ribosome') { rm = ms[i]; break; }
      if (rm) {
        const lp = rm.parts && rm.parts.large;
        const large = lp && lp.visible !== false && (lp.opacity ?? 1) > 0.001 ? (lp.transform || IDENTITY_FRAME) : null;
        beadCount = loadBeads(rm.transform, large);
        const jLo = Math.max(0, Math.floor(p0 + r0 - 30)), jHi = Math.min(L - 1, Math.ceil(p0 + r1 + 30));
        for (let j = jLo; j <= jHi; j++) clearNuc(nucs[rnaStartIdx + j], beadCount);
      }
    }

    // tRNAs: world placement, anticodon nucleotides and codon pairs.
    const trnas = world.trnas || [];
    for (let i = 0; i < trnas.length; i++) {
      const tr = trnas[i];
      const s = tr.slot | 0;
      const k = tr.codon | 0;
      if (s < 0 || s > 3 || k < 1 || k > SENSE_CODONS) continue;
      const kind = tr.kind === 'init' ? 'init' : 'aa';
      const asset = trnaAssets[kind];
      trnaSiteFrame(ribo, tr.from || tr.site, tr.site, tr.blend ?? 1, fL);
      if (tr.approach > 0) {
        const dir = carrierDir[tr.carrier] || carrierDir['ef-tu'];
        const d = TL_ENTER_DISTANCE * tr.approach;
        fL.o[0] += dir[0] * d; fL.o[1] += dir[1] * d; fL.o[2] += dir[2] * d;
      }
      if (tr.depart > 0) {
        applyPoint(fL, asset.anchors.center.o, pVec);
        unitBetween(ribo.anchors.center.o, pVec, dVec);
        const d = TL_RELEASE_DISTANCE * tr.depart;
        fL.o[0] += dVec[0] * d; fL.o[1] += dVec[1] * d; fL.o[2] += dVec[2] * d;
      }
      composeFrame(layout, fL, trnaWorld[s]);
      trnaKind[s] = kind;
      trnaPresent[s] = true;

      const base = ORF_START_MRNA + 3 * (k - 1);
      for (let q = 0; q < 3; q++) codonFrameRefs[q] = nucs[rnaStartIdx + base + q].frame;
      copyFrame(trnaWorld[s], trnaSpec.transform);
      trnaSpec.pair = tr.pair ?? 0;
      trnaSpec.codon = codons[k - 1];
      trnaSpec.anticodon = anticodons[k - 1];
      poseTrnaAnticodon(trnaSpec, asset, acBuf);
      const op = tr.opacity ?? 1;
      for (let q = 0; q < 3; q++) {
        const nu = nucs[acStartIdx + 3 * (k - 1) + q];
        readFrame16(acBuf, q, nu.frame);
        if (beadCount > 0) clearNuc(nu, beadCount);
        nu.visible = op > 0.02;
        nu.opacity = op;
        pairs[acPairStart + 3 * (k - 1) + q].strength = (tr.pair ?? 0) * (op > 0.02 ? 1 : 0);
      }
      links[acLinkStart + 2 * (k - 1)].active = op > 0.02;
      links[acLinkStart + 2 * (k - 1) + 1].active = op > 0.02;
    }
    return true;
  }

  /** tRNA actors, aminoacyl residues, the peptide chain and the peptide-bond pulse atoms. */
  function poseGroupsAndActors(world, target, worldFx) {
    const rs = world.ribosome;
    const layout = rs && rs.layout;
    if (!layout) return;
    const trnas = world.trnas || [];
    for (let i = 0; i < trnas.length; i++) {
      const tr = trnas[i];
      const s = tr.slot | 0;
      if (!trnaPresent[s]) continue;
      const act = trnaActors[s];
      act.assetId = trnaKind[s] === 'init' ? 'trna-init' : 'trna-aa';
      act.asset = trnaAssets[trnaKind[s]];
      copyFrame(trnaWorld[s], act.transform);
      act.opacity = tr.opacity ?? 1;
      act.visible = act.opacity > 0.001;
      act.parts.body.opacity = act.opacity;
      act.label = tr.aa === 'fMet' ? 'fMet-tRNA' : (tr.aa ? `${tr.aa}-tRNA` : 'tRNA');
      if (act.visible) target.actors.push(act);

      // Aminoacyl residue on a charged tRNA that does not (yet) hold the chain.
      if (tr.aa && !tr.peptidyl) {
        const g = aaGroups[s];
        poseAminoacylResidue({ transform: trnaWorld[s] }, act.asset, tr.aa, g);
        g.opacity = act.opacity;
        g.visible = act.visible;
        if (act.visible) target.groups.push(g);
      }
    }

    const pep = world.peptide;
    const n = pep ? Math.min(SENSE_CODONS, pep.length | 0) : 0;
    if (n <= 0 || !tunnelLocal.length) return;
    let holder = -1;
    for (let i = 0; i < trnas.length; i++) {
      const tr = trnas[i];
      if (tr.peptidyl && trnaPresent[tr.slot | 0]) { holder = tr.slot | 0; break; }
    }
    if (holder >= 0 && pep.attach !== 'free') {
      peptidylAttachPoint({ transform: trnaWorld[holder] }, trnaAssets[trnaKind[holder]], attachPt);
    } else {
      trnaSiteFrame(ribo, 'P', 'P', 1, fL);
      composeFrame(layout, fL, staticP.transform);
      peptidylAttachPoint(staticP, trnaAssets.aa, attachPt);
    }
    const paths = worldPaths(layout);
    const path = [[attachPt[0], attachPt[1], attachPt[2]], ...paths.tunnel];
    posePeptideOnPath(residuePrefixes[n], path, paths.free, pep.release ?? 0, peptideGroup);
    peptideGroup.opacity = 1;
    peptideGroup.visible = true;
    target.groups.push(peptideGroup);

    // Peptide-bond pulse: C of residue n-1 and N of residue n (the bond just made).
    if (Array.isArray(worldFx)) {
      for (let i = 0; i < worldFx.length; i++) {
        const fx = worldFx[i];
        if (!fx || fx.kind !== 'peptide' || !fx.anchor || !Array.isArray(fx.anchor.atoms)) continue;
        const res = peptideGroup.residues;
        if (n >= 2 && res && res.length >= n) {
          fx.anchor.atoms[0] = findAtom(peptideGroup, res[n - 2], 'C');
          fx.anchor.atoms[1] = findAtom(peptideGroup, res[n - 1], 'N');
        }
      }
    }
  }

  function findAtom(g, res, name) {
    for (let a = res.atomStart; a < res.atomStart + res.atomCount; a++) if (g.names[a] === name) return a;
    return -1;
  }

  /** Detail-sphere centre for translation shots: the decoding centre. */
  function focusCenter(world, out) {
    const layout = world.ribosome && world.ribosome.layout;
    if (!layout || !ribo.anchors.decoding) return false;
    applyPoint(layout, ribo.anchors.decoding.o, out);
    return true;
  }

  return { ribo, codons, poseNucleotides, poseGroupsAndActors, focusCenter, worldPaths, anticodonCount: 3 * SENSE_CODONS };
}
