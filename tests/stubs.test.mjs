// Round 3 W0 step 7: verify all 23 Round 3 module stubs import cleanly in Node,
// expose every contracted export, and throw `Error('not implemented: <name>')`.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const STUBS = [
  // Story (js/sim/gene/)
  { path: 'js/sim/gene/story.js', implemented: true, fns: ['buildStory', 'stateAt', 'chapterAt'] }, // DEC-005: implemented in R3-S2 step 4; behaviour in tests/story.test.mjs
  { path: 'js/sim/gene/timeline.js', implemented: true, fns: ['buildTimeline'] }, // DEC-005: implemented in R3-S2 step 3; behaviour in tests/timeline.test.mjs
  { path: 'js/sim/gene/transcription.js', implemented: true, fns: ['contributeTx'] }, // DEC-005: pass-through plug point in R3-S2 step 4; behaviour in tests/story.test.mjs
  { path: 'js/sim/gene/translation.js', implemented: true, fns: ['contributeTl'] }, // DEC-005: pass-through plug point in R3-S2 step 4; behaviour in tests/story.test.mjs
  { path: 'js/sim/gene/coupled.js', implemented: true, fns: ['buildCoupledTimeline', 'contributeCoupled'] },
  { path: 'js/sim/gene/shots.js', implemented: true, fns: ['getShot', 'resolveChapterShot'] }, // DEC-005: implemented in R3-S2 step 3; behaviour in tests/timeline.test.mjs

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
  { path: 'js/kin/chain.js', implemented: true, fns: ['buildFreeChain', 'poseFreeChain'] }, // DEC-005: implemented in R3-K2; behaviour in tests/kin-chain.test.mjs
  { path: 'js/kin/hairpin.js', implemented: true, fns: ['poseHairpin'] }, // DEC-005: implemented in R3-K2; behaviour in tests/kin-chain.test.mjs
  { path: 'js/kin/peptide-path.js', implemented: true, fns: ['posePeptideOnPath'] }, // DEC-005: implemented in R3-K2; behaviour in tests/kin-chain.test.mjs
  { path: 'js/kin/trna.js', implemented: true, fns: ['poseTrnaAnticodon', 'poseAminoacylEnd'] }, // DEC-005: implemented in R3-K3; behaviour in tests/kin-trna.test.mjs
  { path: 'js/kin/ntp.js', implemented: true, fns: ['poseNtp', 'posePpi'] }, // DEC-005: implemented in R3-S3; behaviour in tests/story-tx.test.mjs
  { path: 'js/kin/pose.js', implemented: true, fns: ['createPoser'] }, // DEC-005: implemented in R3-S3; behaviour in tests/story-tx.test.mjs

  // Scene (js/scene/)
  { path: 'js/scene/story-scene.js', implemented: true, fns: ['createStoryScene'] }, // DEC-005: implemented in R3-INT2
  { path: 'js/scene/camera-rails.js', implemented: true, fns: ['resolveShot', 'transitionDuration', 'createCameraRails'] }, // DEC-005: implemented in R3-R3; behaviour in tests/camera-rails.test.mjs
  { path: 'js/scene/crowd.js', implemented: true, fns: ['generateCrowd'] }, // DEC-005: implemented in R3-R4; behaviour in tests/crowd.test.mjs
  { path: 'js/scene/labels.js', implemented: true, fns: ['selectLabels'] }, // DEC-005: implemented in R3-R3; behaviour in tests/camera-rails.test.mjs

  // Render (js/render/)
  { path: 'js/render/atom-groups.js', implemented: true, browserOnly: true, classes: ['AtomGroupLayer'] }, // DEC-005: implemented in R3-R1 (imports 'three' via browser importmap); behaviour in tests/render-detail.browser.mjs
  { path: 'js/render/fx.js', implemented: true, browserOnly: true, classes: ['FxLayer'] }, // DEC-005/DEC-020: implemented in R3-R2 (imports 'three' via browser importmap); behaviour in tests/render-actors.browser.mjs

  // UI (js/ui/)
  { path: 'js/ui/view-story.js', implemented: true, fns: ['createStoryView'] }, // DEC-005: implemented in R3-U1; behaviour in tests/ui-story.browser.mjs
  { path: 'js/ui/inspect.js', implemented: true, fns: ['buildInspectInfo'] }, // DEC-005: implemented in R3-U2; behaviour in tests/ui-inspect.browser.mjs
];

test('stub manifest covers all 23 Round 3 modules', () => {
  assert.equal(STUBS.length, 23);
});

for (const spec of STUBS) {
  test(`stub ${spec.path} imports in Node and throws not implemented`, async () => {
    const fileUrl = new URL(`../${spec.path}`, import.meta.url);
    if (spec.implemented && spec.browserOnly) {
      const src = fs.readFileSync(fileUrl, 'utf8');
      for (const name of spec.fns ?? []) {
        assert.match(src, new RegExp(`export\\s+(?:async\\s+)?function\\s+${name}\\b|export\\s*\\{[^}]*\\b${name}\\b`), `${spec.path} must export function ${name}`);
      }
      for (const name of spec.classes ?? []) {
        assert.match(src, new RegExp(`export\\s+class\\s+${name}\\b|export\\s*\\{[^}]*\\b${name}\\b`), `${spec.path} must export class ${name}`);
      }
      return;
    }

    const mod = await import(fileUrl.href);

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
      if (spec.implemented) continue; // DEC-005: implemented modules keep the export check only
      assert.throws(
        () => new Ctor(),
        (err) => err instanceof Error && err.message === `not implemented: ${name}` && /not implemented: /.test(err.message),
        `${spec.path}#${name} constructor must throw Error('not implemented: ${name}')`,
      );
    }
  });
}
