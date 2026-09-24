// The horde: realistic zombie bodies and motion-captured animation sets.
// Bodies are Microsoft Rocketbox avatars (MIT) repainted offline by
// scripts/horde/build-characters.mjs; the clips come from the CMU motion
// capture database and Quaternius CC0 libraries (scripts/horde/build-animations.mjs).

export const HORDE_ANIMATIONS = "/models/horde/horde-anims.glb";
/** Seconds a body takes to climb out of the ground, and from which depth. */
export const EMERGE_TIME = 1.35;
export const EMERGE_DEPTH = 1.15;
/** Seconds a motion-captured corpse stays before sinking away. */
export const CORPSE_TIME = 6.5;
/**
 * Crawlers: bodies whose lower legs were blown off (explosions, crippling
 * leg damage). Seconds of the collapse, then crawl speed (m/s) per type.
 */
export const CRAWL_FALL = 1.0;
/**
 * Sprinters pounce once the waves grow: from `near`..`far` metres, on a
 * share `chance` of their attacks, landing `reach` metres from the prey.
 */
export const LEAP = {
  types: ["runner"],
  wave: 4,
  near: 2.4,
  far: 3.8,
  chance: 0.55,
  reach: 1.1,
  from: 0.1,
  to: 0.4,
};
export const hordeCanLeap = (type, wave) =>
  LEAP.types.includes(type) && wave >= LEAP.wave;
export const CRAWL_SPEED = { walker: 0.44, runner: 0.62, spitter: 0.4 };
export const hordeCanCrawl = (type) => type in CRAWL_SPEED;

/** Character pack ids per enemy type. Packs live in /models/horde/. */
export const HORDE_CAST = {
  walker: [
    "civilian-08",
    "civilian-05",
    "civilian-13",
    "civilian-12",
    "worker-01",
    "business-01",
    "civilian-f08",
    "civilian-f04",
  ],
  runner: ["runner-04", "runner-10", "runner-sports", "runner-f12"],
  brute: ["brute-swat", "brute-fire"],
  spitter: ["spitter-doctor", "spitter-nurse"],
  wraith: ["wraith-hood"],
  archon: ["archon-soldier"],
};

export const hordePackUrl = (id, mobile) =>
  `/models/horde/${id}${mobile ? "-mobile" : ""}.glb`;

// Clip pools. Locomotion clips carry their natural speed (m/s at scale 1);
// the animator keeps playback within a natural range of that speed.
const WALKS = [
  "walk_shamble",
  "walk_shamble_m",
  "walk_slouch",
  "walk_slouch_m",
  "walk_drag",
  "walk_drag_m",
  "walk_drunk",
  "walk_hurt",
  "walk_limp",
  "walk_reach",
  "walk_mummy",
  "walk_shamble_reach",
  "walk_fast",
  "walk_fast_reach",
  "walk_brisk",
];
const SWIPES = [
  "attack_claw",
  "attack_claw_m",
  "attack_grab",
  "attack_claw",
  "attack_claw_m",
  "attack_scratch",
  "attack_scratch_m",
];
const COMMON = {
  idle: ["idle_sway", "idle_hunched", "idle_drift"],
  hit: ["hit_chest", "hit_head"],
  stagger: ["stagger_a", "stagger_b"],
  death: ["death_back", "death_collapse", "death_collapse", "death_blast"],
  emerge: ["getup_prone", "getup_side", "getup_back"],
  crawl: {
    idle: "crawl_idle",
    move: "crawl",
    attack: ["attack_crawl", "attack_crawl_m"],
    death: "death_crawl",
    fall: "fall_to_crawl",
  },
};
export const HORDE_MOTION = {
  walker: { ...COMMON, move: WALKS, attack: SWIPES },
  runner: {
    ...COMMON,
    idle: ["idle_hunched"],
    move: ["run_crazed", "run_crazed_m", "run_reach", "run_jog", "run_sprint"],
    attack: [
      "attack_claw",
      "attack_claw_m",
      "attack_grab",
      "attack_claw",
      "attack_claw_m",
    ],
  },
  brute: {
    ...COMMON,
    idle: ["idle_hunched", "idle_sway"],
    move: [
      "walk_mummy",
      "walk_drag",
      "walk_drag_m",
      "walk_shamble",
      "run_gorilla",
    ],
    attack: ["attack_slam", "attack_slam", "attack_claw", "attack_claw_m"],
    death: ["death_back", "death_collapse", "death_blast"],
  },
  spitter: {
    ...COMMON,
    move: [
      "walk_hurt",
      "walk_drunk",
      "walk_shamble",
      "walk_shamble_m",
      "walk_limp",
      "walk_brisk",
      "walk_fast",
    ],
    attack: [
      "attack_claw",
      "attack_claw_m",
      "attack_scratch",
      "attack_scratch_m",
    ],
  },
  wraith: {
    ...COMMON,
    idle: ["idle_hunched"],
    move: ["run_reach", "run_crazed", "walk_shamble_reach"],
    attack: ["attack_claw", "attack_claw_m", "attack_grab"],
  },
  archon: {
    ...COMMON,
    idle: ["idle_hunched"],
    move: ["walk_mummy", "walk_drag", "run_gorilla"],
    attack: ["attack_slam", "attack_slam", "attack_claw"],
    death: ["death_back", "death_collapse"],
    emerge: ["getup_side"],
  },
};

/** Glow of the eyes (linear RGB scale) per type; the COD-style signature. */
export const HORDE_EYES = {
  walker: [1.0, 0.46, 0.06],
  runner: [1.0, 0.18, 0.08],
  brute: [1.0, 0.7, 0.2],
  spitter: [0.62, 1.0, 0.22],
  wraith: [0.3, 0.75, 1.0],
  archon: [1.0, 0.12, 0.05],
};

const hash = (n) => {
  let v = (n ^ 0x9e3779b9) >>> 0;
  v = Math.imul(v ^ (v >>> 16), 0x21f0aaad);
  v = Math.imul(v ^ (v >>> 15), 0x735a2d97);
  return ((v ^ (v >>> 15)) >>> 0) / 4294967296;
};
export const hordeRandom = (id, salt = 0) =>
  hash((id * 7919 + salt * 104729) | 0);

/**
 * Per-zombie gait, deterministic from the network id and the wave so host and
 * guests agree without extra data. Early waves shamble; later waves walk fast.
 * `factor` multiplies the type's base speed.
 */
export function hordeGait(type, id, wave = 1) {
  if (type !== "walker")
    return { gait: "default", factor: 0.94 + hordeRandom(id, 3) * 0.12 };
  const r = hordeRandom(id, 1);
  const w = Math.max(1, wave);
  const slow = Math.max(0.1, 0.62 - w * 0.06);
  const fast = Math.min(0.55, Math.max(0, (w - 3) * 0.07));
  const jitter = hordeRandom(id, 2);
  if (r < slow) return { gait: "shamble", factor: 0.52 + jitter * 0.16 };
  if (r > 1 - fast) return { gait: "fast", factor: 1.12 + jitter * 0.14 };
  return { gait: "walk", factor: 0.84 + jitter * 0.18 };
}
