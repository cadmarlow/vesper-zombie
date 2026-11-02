import * as T from "three";
import { ENEMIES } from "../content/enemies.js";
import {
  CRAWL_FALL,
  EMERGE_TIME,
  HORDE_MOTION,
  hordeRandom,
} from "../content/horde.js";
import { hordeClip, hordeClipFor, hordeClipInfo } from "./library.js";
import { ARM_LEFT, ARM_RIGHT } from "./dismember.js";
import { hordeEvent } from "./voice.js";

// Motion-capture driven zombie animation. One AnimationMixer per body:
//  - locomotion: an idle loop and a gait loop, cross-faded by the measured
//    speed; the gait playback rate follows the navigation speed so planted
//    feet do not skate;
//  - overlay: one full-body one-shot (emergence, attack, stagger) driven by
//    explicit time, so the attack contact frame lands exactly on the
//    authoritative contact time shared with guests;
//  - additive flinches for hits, then a procedural layer (look at the target,
//    jaw, spitting, recoil twist);
//  - crawlers (lower legs blown off) fall onto their hands and swap every
//    loop, attack and death for the ground set.
// Every random choice derives from the network id: host and guests agree.

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const damp = (a, b, rate, dt) => b + (a - b) * Math.exp(-rate * dt);
const angle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const UP = new T.Vector3(0, 1, 0);
const tmpQ = new T.Quaternion(),
  tmpQ2 = new T.Quaternion(),
  parentQ = new T.Quaternion();

function pick(list, id, salt) {
  const available = list.filter((name) => hordeClip(name));
  if (!available.length) return null;
  return available[Math.floor(hordeRandom(id, salt) * available.length)];
}

/** A gait whose natural speed suits the expected navigation speed. */
function pickGait(pool, expected, scale, id) {
  const rows = pool
    .filter((name) => hordeClip(name))
    .map((name) => {
      const natural = (hordeClipInfo(name)?.speed || 0.8) * scale;
      return { name, ratio: expected / natural };
    });
  if (!rows.length) return null;
  const good = rows.filter((r) => r.ratio >= 0.72 && r.ratio <= 1.7);
  const list = good.length
    ? good
    : [
        rows.sort(
          (a, b) => Math.abs(Math.log(a.ratio)) - Math.abs(Math.log(b.ratio)),
        )[0],
      ];
  return list[Math.floor(hordeRandom(id, 21) * list.length)].name;
}

function action(mixer, pack, name, { loop = true } = {}) {
  const clip = hordeClipFor(pack, name);
  if (!clip) return null;
  const a = mixer.clipAction(clip);
  a.setLoop(loop ? T.LoopRepeat : T.LoopOnce, loop ? Infinity : 1);
  a.clampWhenFinished = !loop;
  a.enabled = true;
  a.setEffectiveWeight(0);
  a.play();
  return a;
}

export function createHordeAnimator(
  model,
  { type, id, expectedSpeed, emerging },
) {
  const data = model.userData;
  const horde = data.horde;
  const mixer = new T.AnimationMixer(model);
  horde.mixer = mixer;
  const pools =
    HORDE_MOTION[type] || HORDE_MOTION[data.look] || HORDE_MOTION.walker;
  const scale = model.scale.y;
  const expected = expectedSpeed ?? ENEMIES[type].speed;
  const idleName = pick(pools.idle, id, 31);
  const moveName = pickGait(pools.move, expected, scale, id);
  const anim = {
    id,
    type,
    pools,
    mixer,
    pack: horde.pack,
    idle: action(mixer, horde.pack, idleName),
    move: action(mixer, horde.pack, moveName),
    moveInfo: hordeClipInfo(moveName) || { speed: 1 },
    moveWeight: 0,
    rate: 1,
    rateJitter: 0.94 + hordeRandom(id, 32) * 0.12,
    overlay: null,
    flinch: null,
    hitSerial: undefined,
    recoil: 0,
    recoilSide: 1,
    lookYaw: 0,
    jaw: 0,
    jawTarget: 0,
    jawNext: 0,
    lastClock: null,
    accum: 0,
  };
  // Desynchronize the crowd.
  if (anim.idle)
    anim.idle.time = hordeRandom(id, 33) * anim.idle.getClip().duration;
  if (anim.move)
    anim.move.time = hordeRandom(id, 34) * anim.move.getClip().duration;
  if (anim.idle) anim.idle.setEffectiveWeight(1);
  horde.anim = anim;
  if (emerging) {
    startOverlay(anim, "emerge", pick(pools.emerge, id, 35), 0, EMERGE_TIME);
    hordeEvent(model, "emerge");
  }
  return anim;
}

function startOverlay(anim, kind, name, start, duration, extra = {}) {
  if (!name) return;
  const clip = hordeClipFor(anim.pack, name);
  if (!clip) return;
  const previous = anim.overlay;
  if (previous && previous.action.getClip() !== clip) previous.fading = true;
  const a = anim.mixer.clipAction(clip);
  a.setLoop(T.LoopOnce, 1);
  a.clampWhenFinished = true;
  a.enabled = true;
  a.timeScale = 0;
  a.play();
  anim.overlay = {
    kind,
    name,
    action: a,
    info: hordeClipInfo(name) || {},
    start,
    duration,
    previous: previous && previous.action.getClip() !== clip ? previous : null,
    ...extra,
  };
}

/** Legs lost: collapse onto the stumps, then crawl. */
function startCrawling(model, anim, clock) {
  const crawl = anim.pools.crawl || HORDE_MOTION.walker.crawl;
  anim.crawling = true;
  // The standing loops fade out under the fall; the ground loops take over.
  anim.retired = [
    ...(anim.retired || []),
    ...[anim.idle, anim.move]
      .filter(Boolean)
      .map((a) => ({ action: a, weight: a.getEffectiveWeight() })),
  ];
  anim.idle = action(anim.mixer, anim.pack, crawl.idle);
  anim.move = action(anim.mixer, anim.pack, crawl.move);
  anim.moveInfo = hordeClipInfo(crawl.move) || { speed: 0.3 };
  anim.moveWeight = 0;
  anim.rate = 1;
  if (anim.move)
    anim.move.time = hordeRandom(anim.id, 36) * anim.move.getClip().duration;
  if (anim.feet) for (const foot of anim.feet) foot.locked = false;
  startOverlay(anim, "fall", crawl.fall, clock, CRAWL_FALL);
  hordeEvent(model, "dismember");
}

/** Clip time for a normalized action phase, aligning the contact frame. */
export function warpAttack(phase, gameContact, info, duration) {
  const clipContact = clamp(info.contact ?? 0.4, 0.1, 0.9) * duration;
  if (phase <= gameContact) return (phase / gameContact) * clipContact;
  return (
    clipContact +
    ((phase - gameContact) / (1 - gameContact)) * (duration - clipContact)
  );
}

/**
 * Per-frame update, same signature as the procedural animateZombie().
 * motion: dt, velocityX/Z (m/s), targetYaw, turnRate, clock, isGrounded,
 * action ("none" | "melee" | "spit"), actionPhase, actionContact, actionSide.
 */
export function animateHorde(
  model,
  t,
  _speedNormalized,
  _attacking,
  stagger = 0,
  motion = {},
) {
  const data = model.userData;
  const horde = data.horde;
  const anim =
    horde.anim ||
    createHordeAnimator(model, {
      type: data.type,
      id: horde.seed,
      expectedSpeed: motion.expectedSpeed,
      emerging: motion.isGrounded === false,
    });
  const clock = Number.isFinite(motion.clock) ? motion.clock : t;
  let dt = Number.isFinite(motion.dt)
    ? motion.dt
    : anim.lastClock === null
      ? 0
      : clock - anim.lastClock;
  dt = clamp(dt, 0, 0.25);
  anim.lastClock = clock;
  // Distant bodies animate at a reduced rate; accumulated time is kept.
  anim.accum += dt;
  const interval = data.detail === "far" ? 1 / 20 : 0;
  if (anim.accum < interval) return;
  dt = anim.accum;
  anim.accum = 0;

  const scale = model.scale.y;
  const vx = motion.velocityX || 0,
    vz = motion.velocityZ || 0;
  const speed = Math.hypot(vx, vz);

  if (data.legsLost && !anim.crawling) startCrawling(model, anim, clock);
  // The final stragglers switch to a run, rather than speeding up a shamble.
  const hurrying = !!motion.hurrying && !ENEMIES[anim.type].boss;
  if (!anim.crawling && hurrying !== !!anim.hurrying) {
    anim.hurrying = hurrying;
    const pool = hurrying
      ? (ENEMIES[anim.type].look || anim.type) === "brute"
        ? ["run_gorilla"]
        : HORDE_MOTION.runner.move
      : anim.pools.move;
    const name = pickGait(pool, motion.expectedSpeed ?? speed, scale, anim.id);
    if (name && anim.move?.getClip() !== hordeClipFor(anim.pack, name)) {
      // Existing retired loops also handle the walk/run crossfade.
      anim.retired ||= [];
      if (anim.move)
        anim.retired.push({
          action: anim.move,
          weight: anim.move.getEffectiveWeight(),
        });
      const next = action(anim.mixer, anim.pack, name);
      anim.retired = anim.retired.filter((r) => r.action !== next);
      anim.move = next;
      anim.moveInfo = hordeClipInfo(name) || { speed: 1 };
      anim.rate = 1;
      if (anim.feet) for (const foot of anim.feet) foot.locked = false;
    }
  }
  // An arm torn off rocks the body back on its heels.
  const cuts = data.cuts || 0;
  if (cuts !== (anim.cuts ?? 0)) {
    const torn = cuts & ~(anim.cuts ?? 0) & (ARM_LEFT | ARM_RIGHT);
    anim.cuts = cuts;
    if (
      torn &&
      !anim.crawling &&
      (!anim.overlay || anim.overlay.kind === "stagger")
    ) {
      const name = pick(anim.pools.stagger, anim.id, 70 + cuts);
      const info = hordeClipInfo(name);
      startOverlay(anim, "stagger", name, clock, (info?.duration || 1) * 0.8);
    }
  }

  // ---- hit reactions --------------------------------------------------------
  const hit = data.hitReaction;
  if (hit && hit.serial !== anim.hitSerial) {
    const first = anim.hitSerial === undefined;
    anim.hitSerial = hit.serial;
    if (!first) {
      const strength = clamp(hit.strength ?? 0.6, 0.2, 1);
      const name = hit.head ? "hit_head+" : "hit_chest+";
      const clip = hordeClipFor(anim.pack, name);
      if (clip) {
        const a = anim.mixer.clipAction(clip);
        a.setLoop(T.LoopOnce, 1);
        a.clampWhenFinished = false;
        a.reset();
        a.timeScale = 1.1 + hordeRandom(anim.id, hit.serial) * 0.3;
        a.setEffectiveWeight(0.55 + strength * 0.6);
        a.play();
        anim.flinch = a;
      }
      anim.recoil = Math.min(1, anim.recoil + strength);
      hordeEvent(model, "pain");
      anim.recoilSide = (hit.side ?? 1) < 0 ? -1 : 1;
      anim.recoilHead = !!hit.head;
      // A round in an arm throws it back from the shoulder.
      if (hit.arm === "L" || hit.arm === "R") {
        anim.armKick ||= { L: 0, R: 0 };
        anim.armKick[hit.arm] = Math.min(1.2, anim.armKick[hit.arm] + strength);
      }
      // Heavy blows break the stride.
      if (
        hit.heavy &&
        !anim.crawling &&
        (!anim.overlay || anim.overlay.kind === "stagger" || anim.overlay.done)
      ) {
        const name2 = pick(anim.pools.stagger, anim.id, 40 + hit.serial);
        const info = hordeClipInfo(name2);
        startOverlay(
          anim,
          "stagger",
          name2,
          clock,
          (info?.duration || 1) * 0.85,
        );
      }
    }
  }
  anim.recoil = damp(anim.recoil, 0, 7, dt);
  if (anim.armKick) {
    anim.armKick.L = damp(anim.armKick.L, 0, 8, dt);
    anim.armKick.R = damp(anim.armKick.R, 0, 8, dt);
  }

  // ---- actions (attack / spit) -------------------------------------------------
  const kind = motion.action || "none";
  if (kind === "melee" && Number.isFinite(motion.actionPhase)) {
    const sequence = motion.actionSequence ?? 0;
    if (
      !anim.overlay ||
      anim.overlay.kind !== "melee" ||
      anim.overlay.sequence !== sequence
    ) {
      const pool = anim.crawling
        ? anim.pools.crawl?.attack || HORDE_MOTION.walker.crawl.attack
        : anim.pools.attack;
      const leap = motion.actionLeap && hordeClip("attack_leap");
      let name = leap
        ? "attack_leap"
        : pool[Math.floor(hordeRandom(anim.id, 50 + sequence) * pool.length)];
      // Mirror variants follow the authoritative swing side.
      if (leap) {
        // Both claws out: no mirrored variant.
      } else if ((motion.actionSide ?? 1) > 0 && hordeClip(`${name}_m`))
        name = `${name}_m`;
      else if ((motion.actionSide ?? 1) < 0 && name.endsWith("_m"))
        name = name.slice(0, -2);
      // A torn arm leaves the other to claw (base clips strike right).
      const cuts = data.cuts || 0;
      if (cuts & ARM_RIGHT && !(cuts & ARM_LEFT) && hordeClip(`${name}_m`))
        name = `${name}_m`;
      else if (cuts & ARM_LEFT && !(cuts & ARM_RIGHT) && name.endsWith("_m"))
        name = name.slice(0, -2);
      startOverlay(anim, "melee", name, clock, motion.actionDuration || 1, {
        sequence,
      });
      hordeEvent(model, "attack");
    }
    const contact = motion.actionContact || 0.38;
    if (anim.overlay?.kind !== "melee") {
      // Unknown clip: keep walking rather than freeze.
    } else {
      if (
        anim.overlay &&
        !anim.overlay.swung &&
        motion.actionPhase >= contact - 0.08
      ) {
        anim.overlay.swung = true;
        hordeEvent(model, "swing");
      }
      anim.overlay.phase = motion.actionPhase;
    }
  } else if (anim.overlay?.kind === "melee" && !anim.overlay.fading) {
    anim.overlay.fading = true;
  }
  // Climbing over a low obstacle: the clip follows the crossing progress.
  const vault = Number.isFinite(motion.vault) ? motion.vault : -1;
  if (vault >= 0 && !anim.crawling) {
    if (anim.overlay?.kind !== "vault" || anim.overlay.fading)
      startOverlay(anim, "vault", "vault_over", clock, 1);
    if (anim.overlay?.kind === "vault") {
      // Heavy feet back on the floor.
      if (vault >= 0.82 && !anim.overlay.landed) {
        anim.overlay.landed = true;
        hordeEvent(model, "land");
      }
      anim.overlay.phase = vault;
    }
  } else if (anim.overlay?.kind === "vault" && !anim.overlay.fading)
    anim.overlay.fading = true;
  const spit = kind === "spit" ? (motion.actionPhase ?? 0) : -1;
  if (spit >= 0.45 && !anim.spat) {
    anim.spat = true;
    hordeEvent(model, "spit");
  } else if (spit < 0) anim.spat = false;

  // ---- overlay weight and time ---------------------------------------------------
  let overlayWeight = 0;
  const o = anim.overlay;
  if (o) {
    const duration = o.action.getClip().duration;
    let progress;
    if (o.kind === "vault") {
      progress = clamp(o.phase ?? 0, 0, 1);
      o.action.time = progress * duration;
    } else if (o.kind === "melee") {
      progress = o.phase ?? 0;
      o.action.time = warpAttack(
        progress,
        motion.actionContact || 0.38,
        o.info,
        duration,
      );
    } else {
      progress = clamp((clock - o.start) / o.duration, 0, 1);
      const from =
        o.kind === "emerge" ? (o.info.emergeFrom ?? 0.45) * duration : 0;
      // A body losing its legs drops at once, then settles on its hands.
      const eased = o.kind === "fall" ? 1 - (1 - progress) ** 2 : progress;
      o.action.time = from + eased * (duration - from);
    }
    const fadeIn = o.kind === "emerge" ? 1 : smooth(0, 0.08, progress);
    const fadeOut =
      o.kind === "emerge"
        ? 1 - smooth(0.82, 1, progress)
        : 1 - smooth(0.78, 1, progress);
    o.weight = o.fading ? damp(o.weight ?? 1, 0, 14, dt) : fadeIn * fadeOut;
    if (progress >= 1 && !o.fading) o.fading = true;
    overlayWeight = clamp(o.weight, 0, 1);
    o.action.setEffectiveWeight(overlayWeight);
    if (o.previous) {
      o.previous.weight = damp(o.previous.weight ?? 1, 0, 16, dt);
      o.previous.action.setEffectiveWeight(
        o.previous.weight * (1 - overlayWeight),
      );
      if (o.previous.weight < 0.01) {
        o.previous.action.stop();
        o.previous = null;
      }
    }
    if (o.fading && overlayWeight < 0.01) {
      o.action.stop();
      anim.overlay = null;
      overlayWeight = 0;
    }
  }
  const previousWeight = o?.previous
    ? (o.previous.weight ?? 0) * (1 - overlayWeight)
    : 0;
  // Previous locomotion loops fade under a fall or a walk/run transition.
  let retiredWeight = 0;
  if (anim.retired) {
    for (const r of anim.retired) {
      r.weight = damp(r.weight, 0, 9, dt);
      const w = r.weight * (1 - overlayWeight);
      r.action.setEffectiveWeight(w);
      retiredWeight += w;
    }
    if (anim.retired.every((r) => r.weight < 0.01)) {
      for (const r of anim.retired) r.action.stop();
      anim.retired = null;
    }
  }

  // ---- locomotion ---------------------------------------------------------------
  const natural = Math.max(0.2, (anim.moveInfo.speed || 0.8) * scale);
  const ratio = speed / natural;
  anim.moveWeight = damp(anim.moveWeight, smooth(0.06, 0.32, ratio), 7, dt);
  if (ratio > 0.05)
    anim.rate = damp(
      anim.rate,
      clamp(ratio, 0.55, anim.crawling ? 2.4 : 1.9),
      6,
      dt,
    );
  const share = clamp(1 - overlayWeight - previousWeight - retiredWeight, 0, 1);
  if (anim.move) {
    anim.move.timeScale = anim.rate * anim.rateJitter;
    anim.move.setEffectiveWeight(anim.moveWeight * share);
  }
  if (anim.idle) anim.idle.setEffectiveWeight((1 - anim.moveWeight) * share);

  const moveBefore = anim.move ? anim.move.time : 0;
  anim.mixer.update(dt);
  // Footfalls of the gait loop, heard when the stride carries weight.
  if (anim.move && anim.moveWeight * share > 0.45) {
    const duration = anim.move.getClip().duration;
    const a = moveBefore / duration,
      b = anim.move.time / duration;
    for (const step of anim.moveInfo.steps || []) {
      const crossed = b >= a ? step > a && step <= b : step > a || step <= b;
      if (crossed)
        hordeEvent(model, "step", {
          running: speed > 2.2,
          crawling: !!anim.crawling,
        });
    }
  }

  // ---- procedural layer -----------------------------------------------------------
  const b = horde.bones;
  if (data.detail === "far") return;
  model.updateMatrixWorld(true);
  const overlayKind = anim.overlay?.kind;
  const grounded =
    data.detail !== "far" &&
    motion.isGrounded !== false &&
    overlayKind !== "emerge" &&
    anim.overlay?.name !== "attack_leap" &&
    anim.overlay?.kind !== "vault" &&
    !anim.crawling;
  if (motion.viewer) keepOutOfView(model, motion.viewer);
  if (grounded) {
    groundSoles(model, anim, dt);
    lockFeet(model, anim, dt, speed);
    bendToes(model);
  } else {
    anim.lift = 0;
    if (anim.feet) for (const foot of anim.feet) foot.locked = false;
  }
  const lookAllowed =
    overlayKind !== "emerge" &&
    overlayKind !== "stagger" &&
    overlayKind !== "fall";
  const wanted = lookAllowed
    ? clamp(
        angle((motion.targetYaw ?? model.rotation.y) - model.rotation.y),
        -1.1,
        1.1,
      )
    : 0;
  anim.lookYaw = damp(anim.lookYaw, wanted, 4.5, dt);
  const recoil = anim.recoil;
  const twist = recoil * anim.recoilSide * 0.35;
  rotateWorld(model, b.chest, anim.lookYaw * 0.22 + twist * 0.5, 0);
  rotateWorld(
    model,
    b.neck,
    anim.lookYaw * 0.33,
    recoil * (anim.recoilHead ? -0.25 : -0.08),
  );
  rotateWorld(
    model,
    b.head,
    anim.lookYaw * 0.4 + twist * 0.3,
    recoil * (anim.recoilHead ? -0.45 : -0.1),
  );
  if (anim.armKick)
    for (const side of ["L", "R"]) {
      const kick = anim.armKick[side];
      if (kick > 0.02)
        rotateWorld(
          model,
          b[`arm${side}`],
          (side === "L" ? 0.35 : -0.35) * kick,
          -0.75 * kick,
        );
    }
  // Spit: rear back with the mouth open, then lunge the head forward.
  if (spit >= 0) {
    const load = Math.sin(Math.PI * clamp(spit / 0.55, 0, 1));
    const release = smooth(0.5, 0.58, spit) * (1 - smooth(0.62, 0.9, spit));
    rotateWorld(model, b.chest, 0, -0.35 * load + 0.45 * release);
    rotateWorld(model, b.neck, 0, -0.25 * load + 0.35 * release);
    rotateWorld(model, b.head, 0, -0.2 * load + 0.3 * release);
    anim.jawTarget = Math.max(anim.jawTarget, 0.35 * load + 0.55 * release);
  }
  // Jaw: moans between long pauses, gaping during attacks.
  if (clock >= anim.jawNext) {
    const r = hordeRandom(anim.id, Math.floor(clock * 3));
    anim.jawTarget = r < 0.45 ? 0.08 + r * 0.5 : 0.02;
    anim.jawNext = clock + 0.35 + r * 1.2;
  }
  if (overlayKind === "melee") {
    const p = anim.overlay.phase ?? 0;
    anim.jawTarget = Math.max(
      anim.jawTarget,
      0.42 * (1 - smooth(0.55, 0.9, p)),
    );
  }
  anim.jaw = damp(anim.jaw, anim.jawTarget, 10, dt);
  if (b.jaw) {
    b.jaw.quaternion.multiply(
      tmpQ.setFromAxisAngle(
        JAW_AXIS,
        -clamp(anim.jaw, 0, data.jawLimit ?? 0.5),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Blending two strides (idle into a run, a swing over a gait) can push a heel
// or the ball of a foot through the floor: the pelvis rises by the deepest
// one and settles back once the feet are clear. Toe tips that still dip are
// bent up at the toe joint, as a real foot rolls over its toes.

const sole = new T.Vector3(),
  lift = new T.Vector3(),
  qLift = new T.Quaternion(),
  sLift = new T.Vector3(),
  tipNow = new T.Vector3(),
  tipWanted = new T.Vector3(),
  ballAt = new T.Vector3(),
  qToe = new T.Quaternion(),
  qFlat = new T.Quaternion();

// ---------------------------------------------------------------------------
// Lunges and hunched swings must not push a torso through the local camera:
// the whole body is held back so the chest stays out of the near field while
// the arms still sweep across the screen.

const chestAt = new T.Vector3(),
  toViewer = new T.Vector3(),
  holdBack = new T.Vector3(),
  qHold = new T.Quaternion(),
  sHold = new T.Vector3();

function keepOutOfView(model, viewer) {
  const horde = model.userData.horde;
  const pelvis = horde.bones.pelvis,
    chest = horde.bones.chest;
  if (!pelvis || !chest) return;
  toViewer.set(viewer.x - model.position.x, 0, viewer.z - model.position.z);
  const distance = toViewer.length();
  if (distance > 2.4 || distance < 1e-3) return;
  toViewer.divideScalar(distance);
  chest.getWorldPosition(chestAt);
  const along =
    (chestAt.x - model.position.x) * toViewer.x +
    (chestAt.z - model.position.z) * toViewer.z;
  const excess = along - (distance - 0.62);
  if (excess <= 0) return;
  holdBack.copy(toViewer).multiplyScalar(-excess);
  pelvis.parent.getWorldQuaternion(qHold).invert();
  pelvis.parent.getWorldScale(sHold);
  holdBack.applyQuaternion(qHold).divideScalar(sHold.x);
  pelvis.position.add(holdBack);
  pelvis.updateMatrixWorld(true);
}

/** Minimal turn of a bone (world rotation about `pivot`) moving `point` up by `rise`. */
function raisePoint(bone, pivot, point, rise, maxAngle) {
  tipNow.subVectors(point, pivot);
  const length = tipNow.length();
  const flat = Math.hypot(tipNow.x, tipNow.z);
  if (length < 1e-5 || flat < 1e-5) return;
  const y = Math.min(length * 0.98, tipNow.y + rise);
  const reach = Math.sqrt(Math.max(0, length * length - y * y)) / flat;
  tipWanted.set(tipNow.x * reach, y, tipNow.z * reach);
  qToe.setFromUnitVectors(tipNow.normalize(), tipWanted.normalize());
  const angle = 2 * Math.acos(Math.min(1, Math.abs(qToe.w)));
  if (angle > maxAngle) qToe.slerp(qLift.identity(), 1 - maxAngle / angle);
  // World turn -> local: bone' = parent^-1 * turn * parent * bone.
  bone.parent.getWorldQuaternion(qLift);
  qToe.premultiply(qFlat.copy(qLift).invert()).multiply(qLift);
  bone.quaternion.premultiply(qToe);
  bone.updateMatrixWorld(true);
}

function groundSoles(model, anim, dt) {
  const horde = model.userData.horde;
  const soles = horde.pack.soles;
  const pelvis = horde.bones.pelvis;
  if (!soles || !pelvis) return;
  const ground = model.position.y,
    scale = model.scale.y;
  // Heel strikes: the foot pivots on the ankle instead of sinking its heel.
  for (let i = 0; i < soles.length; i++) {
    const s = soles[i],
      foot = horde.bones[i === 0 ? "footL" : "footR"];
    if (!s || !foot) continue;
    sole.copy(s.heel).applyMatrix4(foot.matrixWorld);
    const depth = ground + 0.004 * scale - sole.y;
    if (depth <= 0) continue;
    foot.getWorldPosition(ballAt);
    raisePoint(foot, ballAt, sole, depth, 0.6);
  }
  // Whatever still sinks (a low ankle from blended strides) lifts the pelvis.
  let low = Infinity;
  for (let i = 0; i < soles.length; i++) {
    const s = soles[i],
      side = i === 0 ? "L" : "R";
    const foot = horde.bones[`foot${side}`],
      toe = horde.bones[`toe${side}`];
    if (!s || !foot || !toe) continue;
    low = Math.min(low, sole.copy(s.heel).applyMatrix4(foot.matrixWorld).y);
    toe.getWorldPosition(ballAt);
    low = Math.min(low, ballAt.y - s.ball * scale);
  }
  if (!Number.isFinite(low)) return;
  const depth = Math.max(0, ground - low);
  anim.lift =
    depth > (anim.lift || 0) ? depth : damp(anim.lift || 0, depth, 10, dt);
  if (anim.lift < 5e-4) return;
  // World up into the pelvis parent's space.
  pelvis.parent.getWorldQuaternion(qLift).invert();
  pelvis.parent.getWorldScale(sLift);
  lift.set(0, anim.lift / sLift.y, 0).applyQuaternion(qLift);
  pelvis.position.add(lift);
  pelvis.updateMatrixWorld(true);
}

function bendToes(model) {
  const horde = model.userData.horde;
  const soles = horde.pack.soles;
  if (!soles) return;
  const ground = model.position.y;
  for (let i = 0; i < soles.length; i++) {
    const s = soles[i],
      toe = horde.bones[i === 0 ? "toeL" : "toeR"];
    if (!s || !toe) continue;
    sole.copy(s.tip).applyMatrix4(toe.matrixWorld);
    const depth = ground - sole.y;
    if (depth <= 0.002) continue;
    toe.getWorldPosition(ballAt);
    raisePoint(toe, ballAt, sole, depth, 1.1);
  }
}

// ---------------------------------------------------------------------------
// Runtime foot locking. While a foot is in stance (its toe on the floor and
// barely moving in the animation), its ankle is pinned where the contact
// began and a two-bone IK bends the leg to reach it. Speed matching keeps
// corrections small; turns and rate limits no longer make feet skate.

const hip = new T.Vector3(),
  knee = new T.Vector3(),
  ankle = new T.Vector3(),
  toe = new T.Vector3(),
  goal = new T.Vector3(),
  dir = new T.Vector3(),
  pole = new T.Vector3(),
  newKnee = new T.Vector3(),
  newAnkle = new T.Vector3(),
  va = new T.Vector3(),
  vb = new T.Vector3(),
  qThigh = new T.Quaternion(),
  qCalf = new T.Quaternion(),
  qFoot = new T.Quaternion(),
  qTurn = new T.Quaternion(),
  qParent = new T.Quaternion();

function lockFeet(model, anim, dt, bodySpeed) {
  const legs = model.userData.legs;
  if (!legs) return;
  const scale = model.scale.y;
  const ground = model.position.y;
  anim.feet ||= legs.map(() => ({
    locked: false,
    anchor: new T.Vector3(),
    offset: new T.Vector3(),
    last: new T.Vector3(),
    hasLast: false,
    stance: false,
  }));
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i],
      foot = anim.feet[i];
    leg.foot.getWorldPosition(ankle);
    leg.toe.getWorldPosition(toe);
    const toeHeight = (toe.y - ground) / scale;
    const ankleHeight = (ankle.y - ground) / scale;
    // Animated speed of the ball of the foot on the floor plane (m/s).
    const slide =
      foot.hasLast && dt > 0
        ? Math.hypot(toe.x - foot.last.x, toe.z - foot.last.z) / dt
        : 0;
    foot.last.copy(toe);
    foot.hasLast = true;
    const enter = toeHeight < 0.04 && ankleHeight < 0.17;
    const leave = toeHeight > 0.07 || ankleHeight > 0.22;
    if (!foot.stance && enter) {
      foot.stance = true;
      foot.released = false;
    } else if (foot.stance && leave) {
      foot.stance = false;
      foot.locked = false;
    }
    // Lock once the animated foot has landed (nearly still): a foot dragged
    // on purpose keeps its drag.
    if (
      foot.stance &&
      !foot.locked &&
      !foot.released &&
      slide < Math.max(0.3, bodySpeed * 0.5)
    ) {
      foot.locked = true;
      // Continue from the current correction: no pop at touchdown.
      foot.anchor.set(toe.x + foot.offset.x, 0, toe.z + foot.offset.z);
    }
    if (foot.locked) {
      foot.offset.set(foot.anchor.x - toe.x, 0, foot.anchor.z - toe.z);
      // A turn or a stop far from the anchor: let the step happen.
      if (foot.offset.length() > 0.22 * scale) {
        foot.locked = false;
        foot.released = true;
      }
    }
    if (!foot.locked) foot.offset.multiplyScalar(Math.exp(-14 * dt));
    if (foot.offset.lengthSq() < 1e-6) continue;
    // The ball of the foot stays put; the animated heel roll is kept by
    // moving the ankle with the same horizontal offset.
    goal.copy(ankle).add(foot.offset);
    // Out of reach (a stretched leg at toe-off): the lock gives way rather
    // than leaving the foot short of its anchor.
    if (solveLeg(leg, goal) > 0.004 * scale && foot.locked) {
      foot.locked = false;
      foot.released = true;
    }
  }
}

/**
 * Analytic two-bone IK in world space; the foot keeps its world rotation.
 * Returns how far the target lies beyond the leg's reach (0 when reached).
 */
export function solveLeg(leg, target) {
  const thigh = leg.root,
    calf = leg.shin,
    foot = leg.foot;
  thigh.getWorldPosition(hip);
  calf.getWorldPosition(knee);
  foot.getWorldPosition(ankle);
  foot.getWorldQuaternion(qFoot);
  const a = knee.distanceTo(hip),
    b = ankle.distanceTo(knee);
  dir.subVectors(target, hip);
  const wanted = dir.length();
  const d = clamp(wanted, Math.abs(a - b) + 1e-4, a + b - 1e-4);
  dir.normalize();
  pole.subVectors(knee, hip);
  pole.addScaledVector(dir, -pole.dot(dir));
  if (pole.lengthSq() < 1e-8) pole.set(0, 0, 1);
  pole.normalize();
  const along = (a * a - b * b + d * d) / (2 * d);
  const height = Math.sqrt(Math.max(0, a * a - along * along));
  newKnee.copy(hip).addScaledVector(dir, along).addScaledVector(pole, height);
  newAnkle.copy(hip).addScaledVector(dir, d);
  // Thigh: turn hip->knee onto hip->newKnee (world), then back to local.
  qTurn.setFromUnitVectors(
    va.subVectors(knee, hip).normalize(),
    vb.subVectors(newKnee, hip).normalize(),
  );
  thigh.getWorldQuaternion(qThigh);
  qThigh.premultiply(qTurn);
  thigh.parent.getWorldQuaternion(qParent);
  thigh.quaternion.copy(qParent).invert().multiply(qThigh);
  thigh.updateMatrixWorld(true);
  // Calf: turn the (moved) knee->ankle onto newKnee->newAnkle.
  calf.getWorldPosition(knee);
  foot.getWorldPosition(ankle);
  qTurn.setFromUnitVectors(
    va.subVectors(ankle, knee).normalize(),
    vb.subVectors(newAnkle, knee).normalize(),
  );
  calf.getWorldQuaternion(qCalf);
  qCalf.premultiply(qTurn);
  calf.quaternion.copy(qThigh).invert().multiply(qCalf);
  calf.updateMatrixWorld(true);
  // Foot: restore the animated world orientation.
  foot.quaternion.copy(qCalf).invert().multiply(qFoot);
  foot.updateMatrixWorld(true);
  return Math.abs(wanted - d);
}

const JAW_AXIS = new T.Vector3(0, 0, 1);
const axisX = new T.Vector3();

/**
 * Rotate a bone by `yaw` about world up and `pitch` about the character's
 * lateral axis, whatever its local axes (Biped bones are not Y-up).
 */
function rotateWorld(model, bone, yaw, pitch) {
  if (!bone || (Math.abs(yaw) < 1e-4 && Math.abs(pitch) < 1e-4)) return;
  bone.parent.getWorldQuaternion(parentQ);
  // World rotation: yaw about up, pitch about the model's lateral axis
  // (positive pitch bends forward).
  axisX.set(1, 0, 0).applyQuaternion(model.quaternion);
  tmpQ.setFromAxisAngle(UP, yaw);
  tmpQ2.setFromAxisAngle(axisX, pitch);
  tmpQ.multiply(tmpQ2);
  // local' = parent^-1 * R * parent * local
  tmpQ2.copy(parentQ).invert().multiply(tmpQ).multiply(parentQ);
  bone.quaternion.premultiply(tmpQ2);
  bone.updateMatrixWorld(true);
}

// ---------------------------------------------------------------------------
// Deaths

export function startHordeDeath(enemy) {
  const model = enemy.model;
  const data = model.userData;
  const anim = data.horde?.anim;
  if (!anim) return;
  const pools = anim.pools;
  // Headshots drop straight down; heavy frontal blows throw the body back;
  // otherwise the pool decides (falling backward only when hit from the front).
  const hit = data.hitReaction || {};
  const backward = (hit.push ?? 1) > 0;
  let name;
  if (anim.crawling) name = pools.crawl?.death || "death_crawl";
  else if (data.headDestroyed) name = "death_collapse";
  else if (hit.heavy && backward && hordeClip("death_blast"))
    name = "death_blast";
  else {
    const candidates = pools.death.filter(
      (n) => n !== "death_blast" && (backward || n !== "death_back"),
    );
    name = pick(candidates.length ? candidates : pools.death, anim.id, 60);
  }
  if (!hordeClip(name)) name = pick(pools.death, anim.id, 61);
  const clip = name && hordeClipFor(anim.pack, name);
  anim.death = { name, time: 0, duration: clip?.duration || 2 };
  hordeEvent(model, "death", {
    fallDelay: anim.crawling
      ? 0.45
      : name === "death_collapse"
        ? 1.05
        : name === "death_blast"
          ? 0.35
          : 0.6,
  });
  if (!clip) return;
  const a = anim.mixer.clipAction(clip);
  a.setLoop(T.LoopOnce, 1);
  a.clampWhenFinished = true;
  a.reset();
  a.timeScale = 1;
  a.setEffectiveWeight(1);
  a.play();
  // Everything else fades out quickly under the fall.
  for (const other of [
    anim.idle,
    anim.move,
    anim.overlay?.action,
    anim.overlay?.previous?.action,
    anim.flinch,
    ...(anim.retired || []).map((r) => r.action),
  ])
    if (other && other !== a) other.fadeOut(0.12);
  anim.retired = null;
  a.fadeIn(0.12);
  anim.overlay = null;
}

/** Advance a death; returns false once the body lies still. */
export function animateHordeDeath(enemy, dt) {
  const horde = enemy.model.userData.horde;
  const anim = horde?.anim;
  if (!anim) return false;
  if (!anim.death) startHordeDeath(enemy);
  const death = anim.death;
  if (death.done) return false;
  death.time += dt;
  anim.mixer.update(dt);
  if (death.time > death.duration + 0.2) death.done = true;
  return true;
}
