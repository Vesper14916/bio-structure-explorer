/**
 * @module kin/pose
 * Round 3 top-level kinematics poser (PLAN.md §8.1, §8.3, docs/CONTRACTS.md §7.4, task R3-S3, Argon C1–C6).
 * Translates `WorldState` into 675-nucleotide `Assembly` frames (248 coding DNA + 248 template DNA + 179 mRNA),
 * procedural `AtomGroup` buffers (`ntp`, `ppi`), `ActorSpec` transforms, FX, and camera detail focus
 * with zero per-frame typed-array allocations.
 */
import { ntpTemplate, PPI_TEMPLATE, nucleotideTemplate, Assembly, TRUE_SCALE_GENE_CONSTRUCT } from '../science/index.js';
import { composeFrame, readFrame16, writeFrame16 } from './frames.js';
import { sampleTrack } from './track.js';
import { poseDuplex, machinePoseForRegister } from './duplex.js';
import { buildFreeChain, poseFreeChain } from './chain.js';
import { poseHairpin, HAIRPIN_LENGTH } from './hairpin.js';
import { poseNtp, posePpi } from './ntp.js';

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

    // Recompute all atom positions in place for deterministic bit-for-bit output across all 675 nucleotides
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
    if (rnapSpec && !rna.released) {
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
