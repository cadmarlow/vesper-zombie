// Builds public/models/horde/horde-anims.glb: the shared zombie animation
// library, retargeted from CMU motion capture and Quaternius/Rocketbox clips
// onto the reduced Rocketbox Biped. Every clip carries its own metadata
// (loop, natural speed, contact markers) in glTF extras.
//
//   node scripts/horde/build-animations.mjs [--preview]
import fs from "node:fs";
import * as T from "three";
import path from "node:path";
import {
  readTargetSkeleton,
  readBVH,
  readGLTFClips,
  gltfSource,
  retarget,
  buildReference,
  sliceFrames,
  alignStart,
  makeInPlace,
  closeLoop,
  smooth,
  findLoop,
  removeDrift,
  anchorEnd,
  writeLibrary,
} from "./retarget.mjs";
import { CMU_MAP, UAL_MAP, UE_MAP } from "./sources.mjs";
import {
  cloneClip,
  mirror,
  offset,
  overlay,
  poseClip,
  retime,
  chain,
  rootAdjust,
  footAnalysis,
  groundClip,
  keyed,
  lockFeet,
  lockLimbs,
  kneesDown,
  kneeClearance,
  ARMS as ARM_CHAINS,
} from "./compose.mjs";

const ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../..",
);
const CACHE = path.join(ROOT, ".cache");
const SOURCES = path.join(CACHE, "horde-sources");
const FPS = 30;
const REFERENCE_CHARACTER = path.join(
  CACHE,
  "horde-build/characters/civilian-08.glb",
);
const OUT =
  process.env.OUT || path.join(ROOT, "public/models/horde/horde-anims.glb");

const target = await readTargetSkeleton(
  fs.existsSync(REFERENCE_CHARACTER)
    ? REFERENCE_CHARACTER
    : path.join(CACHE, "horde-build/Male_Adult_08.glb"),
);
{
  // Height of the sole joints above the floor in the bind pose.
  const foot = target.byName.get("Bip01 L Foot").restWorldP.y;
  const toe = target.byName.get("Bip01 L Toe0").restWorldP.y;
  target.soleOffset = Math.min(foot, toe);
}

// ---------------------------------------------------------------------------
// Sources

const bvhCache = new Map();
function cmu(id) {
  if (!bvhCache.has(id)) {
    const source = readBVH(path.join(SOURCES, "cmu", `${id}.bvh`), FPS);
    source.frames.shift(); // frame 0 is the added T-pose
    const result = retarget(target, source, CMU_MAP);
    bvhCache.set(id, {
      fps: FPS,
      frames: result.frames,
      rootName: result.rootName,
      reference: buildReference(target, source, CMU_MAP),
    });
  }
  const c = bvhCache.get(id);
  return cloneClip(c);
}

const ual1 = await readGLTFClips(
  path.join(
    SOURCES,
    "quaternius/ual1/Animation Library[Standard]/Godot/AnimationLibrary_Godot_Standard.glb",
  ),
  FPS,
);
const ual2 = await readGLTFClips(
  path.join(
    SOURCES,
    "quaternius/ual2/Universal Animation Library 2 [Standard]/Unreal-Godot/UAL2_Standard.glb",
  ),
  FPS,
);
function ual(library, name, map) {
  const source = gltfSource(library, name, FPS, "A_TPose");
  const result = retarget(target, source, map);
  return { fps: FPS, frames: result.frames, rootName: result.rootName };
}
const UAL1 = (name) => ual(ual1, name, UAL_MAP);
const UAL2 = (name) => ual(ual2, name, UE_MAP);

// Symmetric reference used for mirroring (T-pose directions of CMU).
const mirrorRef = cmu("104_41").reference;

// ---------------------------------------------------------------------------
// Clip recipes

const LEG_WEIGHTS = new Map([
  ["Bip01 Pelvis", 1],
  ["Bip01 L Thigh", 1.5],
  ["Bip01 R Thigh", 1.5],
  ["Bip01 L Calf", 1],
  ["Bip01 R Calf", 1],
  ["Bip01 L Foot", 0.5],
  ["Bip01 R Foot", 0.5],
  ["Bip01 Spine1", 0.4],
  ["Bip01 L UpperArm", 0.4],
  ["Bip01 R UpperArm", 0.4],
  ["Bip01 Head", 0.2],
]);

/** Extract a clean in-place loop from a locomotion capture. */
function loopFrom(clip, window, { smoothRadius = 1, cycles } = {}) {
  const found = window.loop
    ? { start: window.loop[0], end: window.loop[1], score: 0 }
    : findLoop(clip, {
        start: window.start,
        end: window.end,
        min: window.min ?? 0.8,
        max: window.max ?? 2.4,
        weights: LEG_WEIGHTS,
      });
  let c = sliceFrames(clip, found.start, found.end);
  c = makeInPlace(c);
  c = closeLoop(c);
  c = smooth(c, smoothRadius, { loop: true });
  c.loopScore = found.score;
  c.window = [found.start, found.end];
  return c;
}

/** In-place loops authored without root travel: measure the stance speed. */
function inPlaceLoop(clip) {
  const c = closeLoop(cloneClip(clip));
  const { stanceSpeed } = footAnalysis(c, target);
  c.speed = Math.max(0, stanceSpeed);
  return c;
}

function oneShot(clip, start, end, { align = true, smoothRadius = 1 } = {}) {
  let c = sliceFrames(clip, start, end);
  if (align) c = alignStart(c, target);
  return smooth(c, smoothRadius);
}

const UPPER = [
  "Bip01 Spine",
  "Bip01 Spine1",
  "Bip01 Spine2",
  "Bip01 Neck",
  "Bip01 Head",
  "Bip01 L Clavicle",
  "Bip01 L UpperArm",
  "Bip01 L Forearm",
  "Bip01 L Hand",
  "Bip01 R Clavicle",
  "Bip01 R UpperArm",
  "Bip01 R Forearm",
  "Bip01 R Hand",
];
const ARMS = UPPER.filter((n) => /Clavicle|Arm|Forearm|Hand/.test(n));

const hunch = (amount, head = -amount * 0.7) => ({
  "Bip01 Spine": [amount * 0.35, 0, 0],
  "Bip01 Spine1": [amount * 0.35, 0, 0],
  "Bip01 Spine2": [amount * 0.3, 0, 0],
  "Bip01 Neck": [head * 0.5, 0, 0],
  "Bip01 Head": [head * 0.5, 0, 0],
});

const clips = [];
const report = [];
function add(name, clip, meta = {}) {
  const grounded =
    meta.ground === false
      ? clip
      : groundClip(clip, target, {
          mode: meta.groundMode || "clip",
          radii: meta.radii,
        });
  const out = { ...grounded, name, rootName: target.joints[0].name };
  const extras = {
    loop: !!meta.loop,
    speed: +(clip.speed ?? meta.speed ?? 0).toFixed(3),
    ...meta.extras,
  };
  // Footfalls (normalized times) drive footstep sounds on locomotion loops.
  if (meta.loop && extras.speed > 0) {
    const { steps } = footAnalysis(out, target);
    extras.steps = [...steps[0], ...steps[1]]
      .map((v) => +v.toFixed(3))
      .sort((a, b) => a - b);
  }
  out.extras = extras;
  clips.push(out);
  const lows = footAnalysis(out, target).lows;
  const xs = out.frames.map((f) => f.root.x),
    zs = out.frames.map((f) => f.root.z),
    ys = out.frames.map((f) => f.root.y);
  const range = (v) =>
    `${Math.min(...v).toFixed(2)}..${Math.max(...v).toFixed(2)}`;
  const knees = /crawl/.test(name)
    ? ` knee ${range(kneeClearance(target, out))}`
    : "";
  report.push({
    name,
    root: `x ${range(xs)} y ${range(ys)} z ${range(zs)} sole ${range(lows)}${knees}`,
    seconds: +((out.frames.length - 1) / FPS).toFixed(2),
    ...extras,
    window: clip.window,
    loopScore: clip.loopScore && +clip.loopScore.toFixed(3),
  });
}

// --- Idles -------------------------------------------------------------------
add("idle_sway", inPlaceLoop(UAL2("Zombie_Idle_Loop")), { loop: true });
add(
  "idle_hunched",
  inPlaceLoop(offset(UAL2("Zombie_Idle_Loop"), target, hunch(0.28))),
  { loop: true },
);
// A slow drunk wait: the whole body drifts on its feet.
{
  const c = oneShot(cmu("137_15"), 1.0, 7.0, { smoothRadius: 2 });
  add("idle_drift", closeLoop(removeDrift(c)), { loop: true });
}

// --- Walks (in-place, speed measured from the capture) ---------------------
{
  // Quaternius shamble: hunched, dragging, arms low.
  const c = inPlaceLoop(UAL2("Zombie_Walk_Fwd_Loop"));
  add("walk_shamble", c, { loop: true });
  add("walk_shamble_m", mirror(c, target, mirrorRef), {
    loop: true,
    speed: c.speed,
  });
}
{
  // CMU classic reaching walk (arms forward).
  const c = loopFrom(cmu("104_41"), { start: 3.2, end: 10.5 });
  add("walk_reach", c, { loop: true });
}
{
  // CMU mummy walk: stiff, arms forward, heavier steps.
  const c = loopFrom(cmu("91_05"), { start: 2.5, end: 9.5 });
  add("walk_mummy", c, { loop: true });
}
{
  // CMU "zombie" performance: slouched, dragging.
  const c = loopFrom(cmu("120_22"), { start: 1.2, end: 7.0 });
  add("walk_slouch", c, { loop: true });
  add("walk_slouch_m", mirror(c, target, mirrorRef), {
    loop: true,
    speed: c.speed,
  });
}
{
  // Drunk walk: swaying shambler.
  const c = loopFrom(cmu("137_16"), { start: 2.5, end: 9.5 });
  add("walk_drunk", offset(c, target, hunch(0.18)), {
    loop: true,
    speed: c.speed,
  });
}
{
  // Limp / dragged leg.
  const c = loopFrom(cmu("91_25"), { start: 2.0, end: 10.0, max: 2.8 });
  add("walk_drag", c, { loop: true });
  add("walk_drag_m", mirror(c, target, mirrorRef), {
    loop: true,
    speed: c.speed,
  });
}
{
  const c = loopFrom(cmu("91_16"), { start: 2.0, end: 10.0 });
  add("walk_limp", c, { loop: true });
}
{
  // Hurt stomach: hunched over the wound.
  const c = loopFrom(cmu("91_26"), { start: 2.0, end: 9.0 });
  add("walk_hurt", c, { loop: true });
}
{
  // Reaching shamble: the Quaternius legs with the CMU reaching arms.
  const base = inPlaceLoop(UAL2("Zombie_Walk_Fwd_Loop"));
  const reach = loopFrom(cmu("104_41"), { start: 3.2, end: 10.5 });
  const c = overlay(base, reach, ARMS, 0.85);
  c.speed = base.speed;
  add("walk_shamble_reach", c, { loop: true });
}

// Fast shamblers for later waves: brisk captured walks, hunched, with the
// reaching or dangling zombie arms layered over them.
{
  const reach = loopFrom(cmu("104_41"), { start: 3.2, end: 10.5 });
  const quick = loopFrom(cmu("91_17"), { start: 2.0, end: 9.0, max: 1.6 });
  const hunched = offset(quick, target, hunch(0.3, -0.18));
  add("walk_fast", hunched, { loop: true, speed: quick.speed });
  const reaching = overlay(hunched, reach, ARMS, 0.8);
  reaching.speed = quick.speed;
  add("walk_fast_reach", reaching, { loop: true });
  const brisk = loopFrom(cmu("132_17"), { start: 0.5, end: 6.0, max: 1.6 });
  add("walk_brisk", offset(brisk, target, hunch(0.34, -0.2)), {
    loop: true,
    speed: brisk.speed,
  });
}

// --- Runs ----------------------------------------------------------------------
{
  const run = loopFrom(cmu("09_01"), {
    start: 0,
    end: 1.1,
    min: 0.5,
    max: 1.1,
  });
  const crazed = offset(run, target, {
    ...hunch(0.32, -0.2),
    "Bip01 L UpperArm": [-0.35, 0, 0],
    "Bip01 R UpperArm": [-0.35, 0, 0],
  });
  add("run_crazed", crazed, { loop: true, speed: run.speed });
  add("run_crazed_m", mirror(crazed, target, mirrorRef), {
    loop: true,
    speed: run.speed,
  });
}
{
  const run = loopFrom(cmu("35_17"), {
    start: 0,
    end: 1.3,
    min: 0.5,
    max: 1.3,
  });
  const reach = loopFrom(cmu("104_41"), { start: 3.2, end: 10.5 });
  const c = overlay(offset(run, target, hunch(0.25)), reach, ARMS, 0.6);
  c.speed = run.speed;
  add("run_reach", c, { loop: true });
}
{
  const c = inPlaceLoop(UAL1("Sprint_Loop"));
  add("run_sprint", offset(c, target, hunch(0.3, -0.15)), {
    loop: true,
    speed: c.speed,
  });
}
{
  const c = inPlaceLoop(UAL1("Jog_Fwd_Loop"));
  add("run_jog", offset(c, target, hunch(0.22)), {
    loop: true,
    speed: c.speed,
  });
}
{
  // Ape-like charge for heavy types.
  const c = loopFrom(cmu("120_02"), { start: 2.0, end: 7.5, max: 2.0 });
  add("run_gorilla", c, { loop: true });
}

// --- Crawl -------------------------------------------------------------------
// Crawlers rest on their stumps: the knee joints sit right on the floor.
// Their lost feet and toes never touch it.
const STUMPS = {
  "L Calf": 0.02,
  "R Calf": 0.02,
  "L Foot": -Infinity,
  "R Foot": -Infinity,
  "L Toe0": -Infinity,
  "R Toe0": -Infinity,
};
const crawlElbows = (limb) =>
  new T.Vector3(limb.side === "L" ? 0.6 : -0.6, 0, -1);
{
  // Crawlers drag themselves twice as fast as the captured crawl, knees and
  // stumps on the floor, head up toward their prey.
  const captured = loopFrom(cmu("111_03"), { start: 3.0, end: 11.0, max: 3.0 });
  const raw = offset(retime(captured, 2), target, {
    "Bip01 Neck": [-0.25, 0, 0],
    "Bip01 Head": [-0.3, 0, 0],
  });
  // On this body the captured palms meet the floor before the knees: drop
  // the knees (the stumps) to the floor and bend the elbows back and out so
  // the palms stay planted, a low predatory prowl.
  const onHands = groundClip(raw, target, { mode: "frame" });
  const c = lockLimbs(
    kneesDown(onHands, target, { radius: 0.02 }),
    onHands,
    target,
    {
      limbs: ARM_CHAINS,
      bend: crawlElbows,
    },
  );
  c.speed = captured.speed * 2;
  add("crawl", c, {
    loop: true,
    groundMode: "frame",
    radii: STUMPS,
    speed: c.speed,
  });
  const pose = poseClip(c, 0.2, 1.2);
  // Resting on the stumps: slow breaths, the head hunting for a target.
  const idle = keyed(pose, target, {
    duration: 2.6,
    keys: [
      { t: 0 },
      {
        t: 0.3,
        bones: {
          "Bip01 Spine2": [-0.06, 0.04, 0.02],
          "Bip01 Neck": [-0.05, 0.1, 0],
          "Bip01 Head": [-0.08, 0.22, 0.05],
        },
        root: [0, 0.015, 0],
      },
      {
        t: 0.65,
        bones: {
          "Bip01 Spine2": [-0.03, -0.05, -0.02],
          "Bip01 Neck": [-0.02, -0.12, 0],
          "Bip01 Head": [-0.05, -0.25, -0.04],
        },
        root: [0, 0.005, 0],
      },
      { t: 1 },
    ],
  });
  idle.speed = 0;
  add("crawl_idle", idle, { loop: true, groundMode: "frame", radii: STUMPS });
  // Ground attack: rear up on one arm and rake at the legs, jaws first.
  const crawlAttack = keyed(pose, target, {
    duration: 1.1,
    keys: [
      { t: 0 },
      {
        t: 0.25,
        bones: {
          "Bip01 Spine2": [-0.35, 0.1, 0],
          "Bip01 Spine1": [-0.2, 0, 0],
          "Bip01 R UpperArm": [-1.2, -0.2, -0.3],
          "Bip01 R Forearm": [-1.1, 0, 0],
          "Bip01 Head": [-0.25, 0, 0],
        },
        root: [0, 0.06, -0.05],
      },
      {
        t: 0.42,
        bones: {
          "Bip01 Spine2": [0.1, -0.2, 0],
          "Bip01 Spine1": [0.05, -0.1, 0],
          "Bip01 R UpperArm": [-0.3, 0.5, 0.1],
          "Bip01 R Forearm": [-0.2, 0, 0],
          "Bip01 Neck": [0.2, 0, 0],
          "Bip01 Head": [0.15, 0, 0],
        },
        root: [0, 0.03, 0.17],
      },
      {
        t: 0.7,
        bones: {
          "Bip01 Spine2": [0.05, -0.05, 0],
          "Bip01 R UpperArm": [-0.1, 0.2, 0],
        },
        root: [0, 0, 0.06],
      },
      { t: 1 },
    ],
  });
  add("attack_crawl", crawlAttack, {
    groundMode: "frame",
    radii: STUMPS,
    extras: { contact: 0.42 },
  });
  add("attack_crawl_m", mirror(crawlAttack, target, mirrorRef), {
    groundMode: "frame",
    radii: STUMPS,
    extras: { contact: 0.42 },
  });
  // Dying crawler: the arms give way and the body slumps flat.
  const crawlDeath = keyed(pose, target, {
    duration: 1.4,
    keys: [
      { t: 0 },
      {
        t: 0.3,
        bones: {
          "Bip01 Spine2": [-0.2, 0, 0.1],
          "Bip01 Head": [-0.35, 0.2, 0],
        },
      },
      {
        t: 0.65,
        bones: {
          "Bip01 L UpperArm": [1.1, 0, 0.5],
          "Bip01 R UpperArm": [1.0, 0, -0.6],
          "Bip01 L Forearm": [0.3, 0, 0],
          "Bip01 R Forearm": [0.2, 0, 0],
          "Bip01 Spine2": [0.25, 0, 0.1],
          "Bip01 Spine1": [0.2, 0, 0],
          "Bip01 Head": [0.2, 0.5, 0.2],
        },
        root: [0, -0.28, 0.12],
      },
      {
        t: 1,
        bones: {
          "Bip01 L UpperArm": [1.25, 0, 0.6],
          "Bip01 R UpperArm": [1.15, 0, -0.7],
          "Bip01 L Forearm": [0.3, 0, 0],
          "Bip01 R Forearm": [0.2, 0, 0],
          "Bip01 Spine2": [0.3, 0, 0.1],
          "Bip01 Spine1": [0.22, 0, 0],
          "Bip01 Head": [0.25, 0.6, 0.25],
        },
        root: [0, -0.3, 0.14],
      },
    ],
  });
  add("death_crawl", crawlDeath, {
    groundMode: "frame",
    radii: STUMPS,
    extras: { death: true },
  });
}
// Legs blown off: the body drops to its knees and falls onto its hands, in
// place (the stumps no longer show the feet the drift removal slides).
{
  // Legs blown off: the stumps come down while the palms reach the floor,
  // the elbows give under the weight, then the crawl's low stance.
  const fall = groundClip(
    removeDrift(oneShot(cmu("133_01"), 3.0, 4.6)),
    target,
    {
      mode: "frame",
    },
  );
  const drop = (t) => Math.min(1, Math.max(0, (t - 0.12) / 0.5)) ** 1.5;
  const low = lockLimbs(
    kneesDown(fall, target, { loop: false, weight: drop, radius: 0.02 }),
    fall,
    target,
    {
      limbs: ARM_CHAINS,
      bend: crawlElbows,
      // Only palms pushed under the floor move (back onto it).
      goal: (limb, end) => (end.y < 0.035 ? end.setY(0.035) : null),
    },
  );
  add("fall_to_crawl", low, {
    groundMode: "frame",
    radii: STUMPS,
    extras: { next: "crawl" },
  });
}

// --- Attacks (contact marker = normalized time of the hit) ---------------------
// Authored zombie attacks keyed over a living, breathing hunched base; the
// feet stay planted through lunges and crouches (two-bone IK).
const attackBase = groundClip(
  offset(
    closeLoop(
      removeDrift(oneShot(cmu("137_15"), 1.5, 4.5, { smoothRadius: 2 })),
    ),
    target,
    hunch(0.26),
  ),
  target,
);
function authored(name, duration, contact, keys, { mirrorToo = true } = {}) {
  let c = keyed(attackBase, target, { duration, keys });
  const reference = keyed(attackBase, target, {
    duration,
    keys: [{ t: 0 }, { t: 1 }],
  });
  c = lockFeet(c, reference, target);
  c = smooth(c, 1);
  add(name, c, { extras: { contact } });
  if (mirrorToo)
    add(`${name}_m`, mirror(c, target, mirrorRef), { extras: { contact } });
}
const R = (s) => `Bip01 R ${s}`,
  Lh = (s) => `Bip01 L ${s}`;
// Diagonal claw: high wind-up, the torso twists into a raking swipe at the
// victim's face and chest. Arm pitches compensate the parents' lean.
authored("attack_claw", 1.1, 0.42, [
  { t: 0 },
  {
    t: 0.16,
    bones: {
      [R("UpperArm")]: [-0.9, -0.3, -0.55],
      [R("Forearm")]: [-0.9, 0, 0],
      "Bip01 Spine2": [-0.08, -0.18, 0],
      "Bip01 Spine1": [-0.04, -0.1, 0],
    },
  },
  {
    t: 0.32,
    bones: {
      [R("Clavicle")]: [-0.2, 0, -0.3],
      [R("UpperArm")]: [-2.35, -0.5, -0.85],
      [R("Forearm")]: [-1.3, 0, 0],
      [R("Hand")]: [0.45, 0, 0],
      [Lh("UpperArm")]: [-0.6, 0, 0.25],
      [Lh("Forearm")]: [-0.7, 0, 0],
      "Bip01 Spine2": [-0.2, -0.36, 0.05],
      "Bip01 Spine1": [-0.1, -0.2, 0],
      "Bip01 Neck": [0.08, -0.1, 0],
      "Bip01 Head": [0.08, 0.08, 0],
    },
  },
  {
    t: 0.42,
    bones: {
      [R("Clavicle")]: [-0.1, 0.1, 0],
      [R("UpperArm")]: [-1.55, 0.6, -0.15],
      [R("Forearm")]: [-0.3, 0, 0],
      [R("Hand")]: [-0.2, 0, 0],
      [Lh("UpperArm")]: [-0.4, 0, 0.12],
      "Bip01 Spine2": [0.1, 0.3, 0],
      "Bip01 Spine1": [0.05, 0.18, 0],
      "Bip01 Pelvis": [0.02, 0.1, 0],
      "Bip01 Neck": [0.12, 0.1, 0],
      "Bip01 Head": [0.02, 0.12, 0],
    },
  },
  {
    t: 0.56,
    bones: {
      [R("UpperArm")]: [-0.85, 1.05, 0.3],
      [R("Forearm")]: [-0.55, 0, 0],
      "Bip01 Spine2": [0.16, 0.44, 0],
      "Bip01 Spine1": [0.08, 0.24, 0],
      "Bip01 Pelvis": [0.02, 0.12, 0],
      "Bip01 Head": [0.02, 0.2, 0],
    },
  },
  {
    t: 0.78,
    bones: {
      [R("UpperArm")]: [-0.4, 0.4, 0],
      [R("Forearm")]: [-0.45, 0, 0],
      "Bip01 Spine2": [0.06, 0.14, 0],
    },
  },
  { t: 1 },
]);
// Two-handed grab: reach for the shoulders, lunge in and bite.
authored(
  "attack_grab",
  1.25,
  0.46,
  [
    { t: 0 },
    {
      t: 0.22,
      bones: {
        "Bip01 Spine2": [-0.18, 0, 0],
        "Bip01 Spine1": [-0.08, 0, 0],
        [R("UpperArm")]: [-0.95, 0, -0.35],
        [Lh("UpperArm")]: [-0.95, 0, 0.35],
        [R("Forearm")]: [-0.9, 0, 0],
        [Lh("Forearm")]: [-0.9, 0, 0],
        "Bip01 Head": [-0.12, 0, 0],
      },
    },
    {
      t: 0.46,
      bones: {
        "Bip01 Spine1": [-0.02, 0, 0],
        "Bip01 Spine2": [-0.04, 0, 0],
        [R("UpperArm")]: [-1.42, 0.36, -0.08],
        [Lh("UpperArm")]: [-1.42, -0.36, 0.08],
        [R("Forearm")]: [-0.3, 0, 0],
        [Lh("Forearm")]: [-0.3, 0, 0],
        [R("Hand")]: [0.35, 0, 0],
        [Lh("Hand")]: [0.35, 0, 0],
        "Bip01 Neck": [0.22, 0, 0],
        "Bip01 Head": [0.08, 0, 0],
      },
      root: [0, -0.02, 0.1],
    },
    {
      t: 0.63,
      bones: {
        "Bip01 Spine1": [0.06, 0, 0],
        "Bip01 Spine2": [0.1, 0, 0],
        [R("UpperArm")]: [-1.3, 0.5, 0],
        [Lh("UpperArm")]: [-1.3, -0.5, 0],
        [R("Forearm")]: [-1.1, 0, 0],
        [Lh("Forearm")]: [-1.1, 0, 0],
        "Bip01 Neck": [0.22, 0, 0],
        "Bip01 Head": [0.06, 0, 0.05],
      },
      root: [0, -0.04, 0.12],
    },
    {
      t: 0.8,
      bones: {
        "Bip01 Spine2": [0.05, 0, 0],
        [R("UpperArm")]: [-0.8, 0.2, 0],
        [Lh("UpperArm")]: [-0.8, -0.2, 0],
        [R("Forearm")]: [-0.6, 0, 0],
        [Lh("Forearm")]: [-0.6, 0, 0],
      },
      root: [0, -0.01, 0.04],
    },
    { t: 1 },
  ],
  { mirrorToo: false },
);
// Pounce for sprinters: a coiled crouch, the leap with both claws out, a
// crouched landing. The game carries the body forward (the root only rises
// and falls here), so the contact lands wherever the victim stands. Feet are
// pinned by IK while on the floor; in the air the legs tuck.
{
  const tuck = (thigh, calf) => ({
    [R("Thigh")]: [thigh, 0, 0],
    [Lh("Thigh")]: [thigh, 0, 0],
    [R("Calf")]: [calf, 0, 0],
    [Lh("Calf")]: [calf, 0, 0],
  });
  const keys = [
    { t: 0 },
    {
      t: 0.14,
      bones: {
        "Bip01 Spine1": [0.25, 0, 0],
        "Bip01 Spine2": [0.2, 0, 0],
        "Bip01 Neck": [-0.3, 0, 0],
        "Bip01 Head": [-0.25, 0, 0],
        [R("UpperArm")]: [0.5, 0, -0.2],
        [Lh("UpperArm")]: [0.5, 0, 0.2],
        [R("Forearm")]: [-0.7, 0, 0],
        [Lh("Forearm")]: [-0.7, 0, 0],
      },
      root: [0, -0.24, -0.05],
    },
    {
      t: 0.27,
      bones: {
        "Bip01 Spine1": [0.12, 0, 0],
        "Bip01 Spine2": [0.1, 0, 0],
        "Bip01 Neck": [-0.25, 0, 0],
        "Bip01 Head": [-0.15, 0, 0],
        [R("UpperArm")]: [-1.15, 0.15, -0.15],
        [Lh("UpperArm")]: [-1.15, -0.15, 0.15],
        [R("Forearm")]: [-0.25, 0, 0],
        [Lh("Forearm")]: [-0.25, 0, 0],
        [R("Hand")]: [-0.35, 0, 0],
        [Lh("Hand")]: [-0.35, 0, 0],
        ...tuck(0.35, -1.1),
      },
      root: [0, 0.3, 0],
    },
    {
      t: 0.38,
      bones: {
        "Bip01 Spine1": [0.16, 0, 0],
        "Bip01 Spine2": [0.2, 0, 0],
        "Bip01 Neck": [0.05, 0, 0],
        "Bip01 Head": [0.05, 0, 0],
        [R("UpperArm")]: [-1.0, 0.4, 0],
        [Lh("UpperArm")]: [-1.0, -0.4, 0],
        [R("Forearm")]: [-0.45, 0, 0],
        [Lh("Forearm")]: [-0.45, 0, 0],
        [R("Hand")]: [0.4, 0, 0],
        [Lh("Hand")]: [0.4, 0, 0],
        ...tuck(0.5, -0.8),
      },
      root: [0, 0.14, 0],
    },
    {
      t: 0.56,
      bones: {
        "Bip01 Spine1": [0.32, 0, 0],
        "Bip01 Spine2": [0.24, 0, 0],
        "Bip01 Neck": [-0.18, 0, 0],
        [R("UpperArm")]: [-0.55, 0.2, -0.1],
        [Lh("UpperArm")]: [-0.55, -0.2, 0.1],
        [R("Forearm")]: [-0.85, 0, 0],
        [Lh("Forearm")]: [-0.85, 0, 0],
      },
      root: [0, -0.24, 0.02],
    },
    {
      t: 0.8,
      bones: {
        "Bip01 Spine1": [0.12, 0, 0],
        "Bip01 Spine2": [0.08, 0, 0],
      },
      root: [0, -0.07, 0],
    },
    { t: 1 },
  ];
  const leap = keyed(attackBase, target, { duration: 1.0, keys });
  const standing = keyed(attackBase, target, {
    duration: 1.0,
    keys: [{ t: 0 }, { t: 1 }],
  });
  // Feet on the floor through the coil and the landing, free in the air.
  const onFloor = (t) => {
    const s = (a, b, x) => Math.min(1, Math.max(0, (x - a) / (b - a)));
    return 1 - s(0.17, 0.22, t) + s(0.44, 0.52, t);
  };
  const pinned = lockFeet(leap, standing, target, { weight: onFloor });
  // One constant floor for the whole clip: the leap keeps its arc.
  add("attack_leap", smooth(pinned, 1), {
    groundMode: "clip",
    extras: { contact: 0.38, leap: true },
  });
}
// Vault over a low obstacle (pews, crates): hands planted on the top, the
// knees tucked up and over, a heavy drop on the far side. The game raises
// the body along the obstacle's height and plays this by crossing progress.
{
  const legs = (right, left) => ({
    [R("Thigh")]: [right[0], 0, 0],
    [R("Calf")]: [right[1], 0, 0],
    [Lh("Thigh")]: [left[0], 0, 0],
    [Lh("Calf")]: [left[1], 0, 0],
  });
  const vault = keyed(attackBase, target, {
    duration: 1.0,
    keys: [
      { t: 0 },
      {
        t: 0.2,
        bones: {
          "Bip01 Spine1": [0.4, 0, 0],
          "Bip01 Spine2": [0.3, 0, 0],
          "Bip01 Neck": [-0.35, 0, 0],
          "Bip01 Head": [-0.2, 0, 0],
          [R("UpperArm")]: [-0.55, 0, -0.3],
          [Lh("UpperArm")]: [-0.55, 0, 0.3],
          [R("Forearm")]: [-0.15, 0, 0],
          [Lh("Forearm")]: [-0.15, 0, 0],
          ...legs([1.15, -1.4], [0.25, -0.4]),
        },
      },
      {
        t: 0.45,
        bones: {
          "Bip01 Spine1": [0.55, 0, 0],
          "Bip01 Spine2": [0.35, 0, 0],
          "Bip01 Neck": [-0.4, 0, 0],
          "Bip01 Head": [-0.2, 0, 0],
          [R("UpperArm")]: [0.25, 0, -0.35],
          [Lh("UpperArm")]: [0.25, 0, 0.35],
          [R("Forearm")]: [-0.3, 0, 0],
          [Lh("Forearm")]: [-0.3, 0, 0],
          ...legs([1.35, -1.7], [1.2, -1.6]),
        },
      },
      {
        t: 0.7,
        bones: {
          "Bip01 Spine1": [0.3, 0, 0],
          "Bip01 Spine2": [0.2, 0, 0],
          "Bip01 Neck": [-0.2, 0, 0],
          [R("UpperArm")]: [-0.8, 0.2, -0.2],
          [Lh("UpperArm")]: [-0.8, -0.2, 0.2],
          [R("Forearm")]: [-0.5, 0, 0],
          [Lh("Forearm")]: [-0.5, 0, 0],
          ...legs([0.35, -0.5], [0.6, -0.9]),
        },
      },
      {
        t: 0.88,
        bones: {
          "Bip01 Spine1": [0.35, 0, 0],
          "Bip01 Spine2": [0.25, 0, 0],
          ...legs([0.65, -1.05], [0.55, -0.95]),
        },
        root: [0, -0.12, 0],
      },
      { t: 1 },
    ],
  });
  // Poses relative to the body: the game carries it over the obstacle.
  add("vault_over", smooth(vault, 1), {
    ground: false,
    extras: { vault: true },
  });
}
// Heavy overhead double blow for Pénitents and the Archonte.
authored(
  "attack_slam",
  1.4,
  0.5,
  [
    { t: 0 },
    {
      t: 0.3,
      bones: {
        [R("UpperArm")]: [-2.75, 0.1, -0.12],
        [Lh("UpperArm")]: [-2.75, -0.1, 0.12],
        [R("Forearm")]: [-1.0, 0, 0],
        [Lh("Forearm")]: [-1.0, 0, 0],
        "Bip01 Spine2": [-0.28, 0, 0],
        "Bip01 Spine1": [-0.14, 0, 0],
        "Bip01 Head": [-0.2, 0, 0],
      },
      root: [0, 0.02, -0.03],
    },
    {
      t: 0.42,
      bones: {
        [R("UpperArm")]: [-2.95, 0.1, -0.12],
        [Lh("UpperArm")]: [-2.95, -0.1, 0.12],
        [R("Forearm")]: [-1.15, 0, 0],
        [Lh("Forearm")]: [-1.15, 0, 0],
        "Bip01 Spine2": [-0.34, 0, 0],
        "Bip01 Spine1": [-0.16, 0, 0],
        "Bip01 Head": [-0.25, 0, 0],
      },
      root: [0, 0.03, -0.04],
    },
    {
      t: 0.5,
      bones: {
        [R("UpperArm")]: [-1.25, 0.25, 0],
        [Lh("UpperArm")]: [-1.25, -0.25, 0],
        [R("Forearm")]: [-0.2, 0, 0],
        [Lh("Forearm")]: [-0.2, 0, 0],
        "Bip01 Pelvis": [0.1, 0, 0],
        "Bip01 Spine1": [0.16, 0, 0],
        "Bip01 Spine2": [0.24, 0, 0],
        "Bip01 Head": [0.08, 0, 0],
      },
      root: [0, -0.1, 0.06],
    },
    {
      t: 0.68,
      bones: {
        [R("UpperArm")]: [-0.9, 0.2, 0],
        [Lh("UpperArm")]: [-0.9, -0.2, 0],
        "Bip01 Pelvis": [0.08, 0, 0],
        "Bip01 Spine1": [0.14, 0, 0],
        "Bip01 Spine2": [0.22, 0, 0],
      },
      root: [0, -0.08, 0.05],
    },
    { t: 1 },
  ],
  { mirrorToo: false },
);
{
  // The Quaternius scratch: a low raking blow, kept as a variant.
  const c = oneShot(UAL2("Zombie_Scratch"), 0, undefined, { align: false });
  add("attack_scratch", c, { extras: { contact: 0.42 } });
  add("attack_scratch_m", mirror(c, target, mirrorRef), {
    extras: { contact: 0.42 },
  });
}

// --- Convention probes (development) ----------------------------------------
if (process.env.PROBE) {
  const base = inPlaceLoop(UAL2("Zombie_Idle_Loop"));
  const probe = (name, bones) =>
    add(
      name,
      keyed(base, target, {
        duration: 1,
        keys: [{ t: 0 }, { t: 0.5, bones }, { t: 1 }],
      }),
    );
  probe("probe_rarm_x-", { "Bip01 R UpperArm": [-1.4, 0, 0] });
  probe("probe_rarm_z-", { "Bip01 R UpperArm": [0, 0, -1.2] });
  probe("probe_rarm_y+", { "Bip01 R UpperArm": [-1.2, 0.8, 0] });
  probe("probe_rfore_x-", { "Bip01 R Forearm": [-1.4, 0, 0] });
  probe("probe_spine_x+", {
    "Bip01 Spine1": [0.5, 0, 0],
    "Bip01 Spine2": [0.3, 0, 0],
  });
  probe("probe_spine_y+", {
    "Bip01 Spine1": [0, 0.4, 0],
    "Bip01 Spine2": [0, 0.4, 0],
  });
}

// --- Reactions ----------------------------------------------------------------
add("hit_chest", UAL1("Hit_Chest"), { extras: {} });
add("hit_head", UAL1("Hit_Head"), { extras: {} });
add("death_blast", UAL2("Hit_Knockback"), {
  groundMode: "frame",
  extras: { death: true },
});
// Overlays return to the navigation position: no horizontal travel.
add("stagger_a", removeDrift(oneShot(cmu("104_13"), 0.8, 2.2)), { extras: {} });
add("stagger_b", removeDrift(oneShot(cmu("91_59"), 0.4, 1.8)), { extras: {} });

// --- Deaths -------------------------------------------------------------------
add("death_back", oneShot(cmu("90_18"), 0.5, 2.2), {
  groundMode: "frame",
  extras: { death: true },
});
add("death_collapse", UAL1("Death01"), {
  groundMode: "frame",
  extras: { death: true },
});

// --- Emergence / get-ups --------------------------------------------------------
// Get-ups end standing on the origin; the start lies underground at spawn.
add("getup_prone", anchorEnd(oneShot(cmu("140_01"), 1.2, 5.2)), {
  groundMode: "frame",
  extras: { emergeFrom: 0.42 },
});
add("getup_back", anchorEnd(oneShot(cmu("139_18"), 1.2, 6.4)), {
  groundMode: "frame",
  extras: { emergeFrom: 0.5 },
});
add("getup_side", anchorEnd(oneShot(cmu("140_03"), 1.4, 6.0)), {
  groundMode: "frame",
  extras: { emergeFrom: 0.45 },
});

fs.mkdirSync(path.dirname(OUT), { recursive: true });
await writeLibrary(target, clips, OUT, {
  generator: "vesper horde build-animations",
});
fs.writeFileSync(
  path.join(CACHE, "horde-build/anims-report.json"),
  JSON.stringify(report, null, 1),
);
for (const r of report)
  console.log(
    r.name.padEnd(22),
    String(r.seconds).padStart(5) + "s",
    r.loop ? `loop speed ${r.speed}` : "",
    r.window ? `window ${r.window.map((v) => v.toFixed(2)).join("-")}` : "",
    r.loopScore !== undefined ? `score ${r.loopScore}` : "",
    r.root,
  );
console.log("wrote", OUT, (fs.statSync(OUT).size / 1024).toFixed(0) + " KiB");
