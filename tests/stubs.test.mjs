// Round 3 W0 step 7: verify all 23 Round 3 module stubs import cleanly in Node,
// expose every contracted export, and throw `Error('not implemented: <name>')`.
import test from 'node:test';
import assert from 'node:assert/strict';

const STUBS = [
  // Story (js/sim/gene/)
  { path: 'js/sim/gene/story.js', fns: ['buildStory', 'stateAt', 'chapterAt'] },
  { path: 'js/sim/gene/timeline.js', fns: ['buildTimeline'] },
  { path: 'js/sim/gene/transcription.js', fns: ['contributeTx'] },
  { path: 'js/sim/gene/translation.js', fns: ['contributeTl'] },
  { path: 'js/sim/gene/coupled.js', fns: ['buildCoupledTimeline', 'contributeCoupled'] },
  { path: 'js/sim/gene/shots.js', fns: ['getShot', 'resolveChapterShot'] },

  // Kinematics (js/kin/)
  {
    path: 'js/kin/frames.js',
    implemented: true, // DEC-005: implemented in R3-K1 step 1; export check only, behaviour in tests/kin-frames.test.mjs
    fns: [
      'matToQuat',
      'quatToMat',
      'slerpFrame',
      'composeFrame',
      'invertFrame',
      'screwStep',
      'rotationMinimizingFrames',
      'arcLengthTable',
      'sampleCubicBezier',
      'sampleCatmullRom',
    ],
  },
  { path: 'js/kin/duplex.js', implemented: true, fns: ['poseDuplex'] }, // DEC-005: implemented in R3-K1 step 2; behaviour in tests/kin-duplex.test.mjs
  { path: 'js/kin/track.js', implemented: true, fns: ['sampleTrack', 'blendTrackFrame'] },
  { path: 'js/kin/chain.js', fns: ['buildFreeChain', 'poseFreeChain'] },
  { path: 'js/kin/hairpin.js', fns: ['poseHairpin'] },
  { path: 'js/kin/peptide-path.js', fns: ['posePeptideOnPath'] },
  { path: 'js/kin/trna.js', fns: ['poseTrnaAnticodon', 'poseAminoacylEnd'] },
  { path: 'js/kin/ntp.js', fns: ['poseNtp', 'posePpi'] },
  { path: 'js/kin/pose.js', fns: ['createPoser'] },

  // Scene (js/scene/)
  { path: 'js/scene/story-scene.js', fns: ['createStoryScene'] },
  { path: 'js/scene/camera-rails.js', fns: ['resolveShot', 'transitionDuration', 'createCameraRails'] },
  { path: 'js/scene/crowd.js', fns: ['generateCrowd'] },
  { path: 'js/scene/labels.js', fns: ['selectLabels'] },

  // Render (js/render/)
  { path: 'js/render/atom-groups.js', classes: ['AtomGroupLayer'] },
  { path: 'js/render/fx.js', classes: ['FxLayer'] },

  // UI (js/ui/)
  { path: 'js/ui/view-story.js', fns: ['createStoryView'] },
  { path: 'js/ui/inspect.js', fns: ['buildInspectInfo'] },
];

test('stub manifest covers all 23 Round 3 modules', () => {
  assert.equal(STUBS.length, 23);
});

for (const spec of STUBS) {
  test(`stub ${spec.path} imports in Node and throws not implemented`, async () => {
    const url = new URL(`../${spec.path}`, import.meta.url).href;
    const mod = await import(url);

    for (const name of spec.fns ?? []) {
      assert.equal(typeof mod[name], 'function', `${spec.path} must export function ${name}`);
      if (spec.implemented) continue; // DEC-005: implemented modules keep the export check only
      assert.throws(
        () => mod[name](),
        (err) => err instanceof Error && err.message === `not implemented: ${name}` && /not implemented: /.test(err.message),
        `${spec.path}#${name} must throw Error('not implemented: ${name}')`,
      );
    }

    for (const name of spec.classes ?? []) {
      const Ctor = mod[name];
      assert.equal(typeof Ctor, 'function', `${spec.path} must export class ${name}`);
      assert.throws(
        () => new Ctor(),
        (err) => err instanceof Error && err.message === `not implemented: ${name}` && /not implemented: /.test(err.message),
        `${spec.path}#${name} constructor must throw Error('not implemented: ${name}')`,
      );
    }
  });
}
