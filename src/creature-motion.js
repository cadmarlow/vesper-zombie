import * as T from "three";
import { jawOpening } from "./creature-head.js";

const TAU = Math.PI * 2;
const EMPTY_MOTION = Object.freeze({});
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (t) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};
const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const angle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const finite = (n, fallback = 0) => (Number.isFinite(n) ? n : fallback);

// Original, authored motion profiles. Dimensions are in the unscaled rig's
// metres, so a large creature takes larger, slower steps at the same speed.
// A cycle is the distance between two successive contacts of the SAME foot.
export const ZOMBIE_MOTION_PROFILES = Object.freeze({
  walker: {
    cycle: 0.88,
    duty: 0.64,
    lift: 0.072,
    hips: 0.803,
    width: 0.122,
    sway: 0.027,
    lean: 0.2,
    arm: -0.18,
    swing: 0.34,
    elbow: 0.18,
    armDrift: 0.085,
    armResponse: 13,
    armLag: 0.065,
    handRate: 1.65,
    handFlex: 0.085,
    limp: 0.1,
    speed: 1.35,
    breath: 1.8,
  },
  runner: {
    cycle: 1.24,
    duty: 0.44,
    lift: 0.19,
    hips: 0.785,
    width: 0.115,
    sway: 0.014,
    lean: 0.34,
    arm: -0.14,
    swing: 0.72,
    elbow: 0.32,
    armDrift: 0.055,
    armResponse: 18,
    armLag: 0.035,
    handRate: 2.8,
    handFlex: 0.065,
    limp: 0.025,
    speed: 3.15,
    breath: 4.1,
  },
  brute: {
    cycle: 0.82,
    duty: 0.69,
    lift: 0.09,
    hips: 0.79,
    width: 0.167,
    sway: 0.055,
    lean: 0.14,
    arm: -0.11,
    swing: 0.25,
    elbow: 0.16,
    armDrift: 0.06,
    armResponse: 10,
    armLag: 0.09,
    handRate: 1.25,
    handFlex: 0.07,
    limp: 0.06,
    speed: 1.1,
    breath: 1.6,
  },
  spitter: {
    cycle: 0.82,
    duty: 0.65,
    lift: 0.077,
    hips: 0.79,
    width: 0.14,
    sway: 0.029,
    lean: 0.28,
    arm: -0.21,
    swing: 0.27,
    elbow: 0.27,
    armDrift: 0.075,
    armResponse: 12,
    armLag: 0.075,
    handRate: 1.9,
    handFlex: 0.095,
    limp: 0.08,
    speed: 1.45,
    breath: 2.0,
  },
  wraith: {
    cycle: 1.08,
    duty: 0.55,
    lift: 0.1,
    hips: 0.81,
    width: 0.1,
    sway: 0.022,
    lean: 0.17,
    arm: -0.17,
    swing: 0.39,
    elbow: 0.2,
    armDrift: 0.11,
    armResponse: 12,
    armLag: 0.115,
    handRate: 1.4,
    handFlex: 0.11,
    limp: 0.14,
    speed: 2.55,
    breath: 1.5,
  },
  archon: {
    cycle: 0.73,
    duty: 0.73,
    lift: 0.074,
    hips: 0.793,
    width: 0.174,
    sway: 0.041,
    lean: 0.09,
    arm: -0.12,
    swing: 0.22,
    elbow: 0.17,
    armDrift: 0.055,
    armResponse: 9,
    armLag: 0.1,
    handRate: 1.1,
    handFlex: 0.075,
    limp: 0.025,
    speed: 1,
    breath: 1.2,
  },
});

// Hermite curves avoid the robotic stop at every intermediate key that a
// succession of smoothsteps would produce. End slopes are zero for contact.
const ARM = [
  0, 0.88, 0.16, 0.5, 0.37, -0.58, 0.55, -1, 0.76, -0.22, 0.92, 0.72, 1, 0.88,
];
const LIFT = [0, 0, 0.19, 0.5, 0.45, 1, 0.68, 0.77, 0.88, 0.22, 1, 0];
const FOOT_PITCH = [0, 0, 0.2, 0.37, 0.48, 0.08, 0.71, -0.16, 0.9, -0.1, 1, 0];
const BODY = [0, -0.012, 0.17, -0.017, 0.46, 0.015, 0.73, 0.008, 1, -0.012];
const STRIKE = [0, 0, 0.44, -1.2, 1, -0.94, 1.2, -0.48, 1.8, -0.13, 2.64, 0];
const STRIKE_ELBOW = [
  0, 0, 0.5, -0.58, 1, 0.24, 1.22, 0.16, 1.95, -0.11, 2.64, 0,
];
const STRIKE_TWIST = [0, 0, 0.5, -0.2, 1, 0.23, 1.27, 0.18, 1.9, 0.05, 2.64, 0];

function curve(keys, t) {
  if (t <= keys[0]) return keys[1];
  const end = keys.length - 2;
  if (t >= keys[end]) return keys[end + 1];
  let i = 0;
  while (i + 2 < end && t > keys[i + 2]) i += 2;
  const x0 = keys[i],
    x1 = keys[i + 2],
    span = x1 - x0;
  const a = keys[i + 1],
    b = keys[i + 3],
    u = (t - x0) / span;
  const ma = i === 0 ? 0 : (b - keys[i - 1]) / (x1 - keys[i - 2]);
  const mb = i + 2 === end ? 0 : (keys[i + 5] - a) / (keys[i + 4] - x0);
  const u2 = u * u,
    u3 = u2 * u;
  return (
    (2 * u3 - 3 * u2 + 1) * a +
    (u3 - 2 * u2 + u) * span * ma +
    (-2 * u3 + 3 * u2) * b +
    (u3 - u2) * span * mb
  );
}

function pose(bone, x, y, z, alpha) {
  if (!bone) return;
  bone.rotation.set(
    mix(bone.rotation.x, x, alpha),
    mix(bone.rotation.y, y, alpha),
    mix(bone.rotation.z, z, alpha),
  );
}

function makeState(g, profile) {
  const d = g.userData;
  const v = finite(d.variation, 0.5);
  const state = {
    time: 0,
    move: 0,
    speed: 0,
    turn: 0,
    cycle: finite(d.walkPhase, v * TAU) / TAU,
    lastTime: null,
    lastYaw: 0,
    lastX: 0,
    lastZ: 0,
    initialized: false,
    virtualX: 0,
    virtualZ: 0,
    forwardX: 0,
    forwardZ: 1,
    attackTime: 0,
    wasAttacking: false,
    reactionAge: 10,
    reactionStrength: 0,
    reactionSide: 1,
    reactionHead: false,
    reactionSerial: undefined,
    lastStagger: 0,
    hands: (d.fingers || []).map((fingers) => ({
      nextSample: 0,
      detail: null,
      // Root curl, root spread and distal curl, reused for the whole life.
      targets: new Float64Array(fingers.length * 3),
    })),
    wasGrounded: false,
    profile,
    phase: 0,
    cadence: 0,
    distance: 0,
    root: new T.Vector3(),
    scale: new T.Vector3(),
    inverse: new T.Matrix4(),
    rootQ: new T.Quaternion(),
    inverseRootQ: new T.Quaternion(),
    inverseHipsQ: new T.Quaternion(),
    a: new T.Vector3(),
    b: new T.Vector3(),
    c: new T.Vector3(),
    pole: new T.Vector3(),
    knee: new T.Vector3(),
    upperRest: new T.Vector3(0, -1, 0),
    lowerRest: new T.Vector3(),
    q0: new T.Quaternion(),
    q1: new T.Quaternion(),
    q2: new T.Quaternion(),
    euler: new T.Euler(),
    feet: [0, 1].map((i) => ({
      side: i ? 1 : -1,
      planted: true,
      pendingStep: false,
      initialized: false,
      progress: 0,
      anchor: new T.Vector3(),
      start: new T.Vector3(),
      target: new T.Vector3(),
      position: new T.Vector3(),
      yaw: 0,
      startYaw: 0,
      targetYaw: 0,
      pitch: 0,
      lastPhase: 0,
      reachError: 0,
      contactCount: 0,
    })),
  };
  d.motionState = state;
  return state;
}

// Targets live in world space during stance. Only swing targets are allowed
// to follow changes of direction; this is what prevents skating under turns.
function footTarget(
  state,
  foot,
  remaining,
  stride,
  duty,
  width,
  ankleY,
  yaw,
  turnRate,
  speed,
  sy,
  sx,
) {
  const seconds = state.cadence > 0.01 ? remaining / state.cadence : 0;
  const landingYaw = yaw + clamp(turnRate * seconds, -0.35, 0.35);
  const forwardDistance = speed > 0.025 ? stride * (remaining + duty * 0.5) : 0;
  const rightX = Math.cos(landingYaw),
    rightZ = -Math.sin(landingYaw);
  foot.target.set(
    state.root.x +
      state.forwardX * forwardDistance +
      rightX * foot.side * width * sx,
    ankleY,
    state.root.z +
      state.forwardZ * forwardDistance +
      rightZ * foot.side * width * sx,
  );
  foot.targetYaw = landingYaw + foot.side * 0.045;
}

function solveLeg(state, leg, foot, hips, ankleY, virtualX, virtualZ) {
  // All solver vectors are in hips-parent space (unscaled rig metres).
  // Inverting the model transform first also handles the slightly different
  // per-zombie X/Y scales without a per-frame allocation.
  state.a.copy(foot.position);
  state.a.x -= virtualX;
  state.a.z -= virtualZ;
  state.a
    .applyMatrix4(state.inverse)
    .sub(hips.position)
    .applyQuaternion(state.inverseHipsQ)
    .sub(leg.root.position);
  const upper = leg.lengths?.upper || leg.shin.position.length() || 0.42;
  const lower =
    leg.lengths?.lower || leg.foot.position.length() || Math.hypot(0.36, 0.025);
  const actualDistance = state.a.length();
  const distance = clamp(
    actualDistance,
    Math.abs(upper - lower) + 0.002,
    upper + lower - 0.002,
  );
  foot.reachError = Math.max(0, actualDistance - distance);
  if (actualDistance < 1e-6) state.a.set(0, -1, 0);
  else state.a.multiplyScalar(1 / actualDistance);
  // Knees bend FORWARD, never sideways or backwards. A tiny outward bias
  // prevents the medial collapse visible with a straight-ahead pole on turns.
  state.pole.set(foot.side * 0.12, 0, 1).applyQuaternion(state.inverseHipsQ);
  state.pole.addScaledVector(state.a, -state.pole.dot(state.a)).normalize();
  const along =
    (upper * upper - lower * lower + distance * distance) / (2 * distance);
  const bend = Math.sqrt(Math.max(0, upper * upper - along * along));
  state.knee
    .copy(state.a)
    .multiplyScalar(along)
    .addScaledVector(state.pole, bend);
  state.b.copy(state.knee).normalize();
  leg.root.quaternion.setFromUnitVectors(state.upperRest, state.b);
  state.b.copy(state.a).multiplyScalar(distance).sub(state.knee).normalize();
  state.q0.copy(leg.root.quaternion).invert();
  state.b.applyQuaternion(state.q0);
  state.lowerRest.copy(leg.foot.position);
  if (state.lowerRest.lengthSq() < 1e-8) state.lowerRest.set(0, -0.36, 0.025);
  state.lowerRest.normalize();
  leg.shin.quaternion.setFromUnitVectors(state.lowerRest, state.b);
  // Cancel the complete leg chain to preserve the ankle's world orientation.
  state.q0
    .copy(hips.quaternion)
    .multiply(leg.root.quaternion)
    .multiply(leg.shin.quaternion)
    .invert();
  state.euler.set(foot.pitch, foot.yaw, 0, "YXZ");
  state.q1.setFromEuler(state.euler);
  state.q2.copy(state.inverseRootQ).multiply(state.q1);
  leg.foot.quaternion.copy(state.q0).multiply(state.q2);
  if (leg.toe)
    leg.toe.rotation.x = foot.planted ? 0 : -Math.max(0, foot.pitch) * 0.46;
}

/**
 * Original procedural/key-pose controller, shared by solo, host and guests.
 * motion velocities are WORLD metres/second, and actionPhase is [0, 1].
 * Without motion context, a virtual moving root supports existing in-place
 * previews. All vectors/quaternions are allocated only when a model is seen.
 */
export function animateZombie(
  g,
  t,
  speedNormalized,
  attacking = false,
  stagger = 0,
  motion = EMPTY_MOTION,
) {
  const d = g.userData;
  if (!d.hips || !d.legs?.length) return;
  const profile =
    ZOMBIE_MOTION_PROFILES[d.type] ||
    ZOMBIE_MOTION_PROFILES[d.look] ||
    ZOMBIE_MOTION_PROFILES.walker;
  const state = d.motionState || makeState(g, profile);
  const dt = clamp(
    finite(motion.dt, state.lastTime === null ? 0 : t - state.lastTime),
    0,
    0.25,
  );
  state.lastTime = t;
  d.animationTime = t;
  state.time += dt;
  const variation = finite(d.variation, 0.5),
    individuality = variation - 0.5;
  g.updateWorldMatrix(true, false);
  g.matrixWorld.decompose(state.root, state.rootQ, state.scale);
  state.inverse.copy(g.matrixWorld).invert();
  state.inverseRootQ.copy(state.rootQ).invert();
  state.a.set(0, 0, 1).applyQuaternion(state.rootQ);
  const yaw = Math.atan2(state.a.x, state.a.z);
  const sy = Math.max(0.01, Math.abs(state.scale.y));
  const sx = Math.max(0.01, Math.abs(state.scale.x));
  const sz = Math.max(0.01, Math.abs(state.scale.z));
  const hasVelocity =
    Number.isFinite(motion.velocityX) && Number.isFinite(motion.velocityZ);
  const normalized = Math.max(0, finite(speedNormalized));
  let vx = hasVelocity
    ? motion.velocityX
    : Math.sin(yaw) * normalized * profile.speed;
  let vz = hasVelocity
    ? motion.velocityZ
    : Math.cos(yaw) * normalized * profile.speed;
  const speed = Math.hypot(vx, vz);
  if (!hasVelocity) {
    state.virtualX += vx * dt;
    state.virtualZ += vz * dt;
  }
  state.root.x += state.virtualX;
  state.root.z += state.virtualZ;
  const dx = state.initialized ? state.root.x - state.lastX : 0;
  const dz = state.initialized ? state.root.z - state.lastZ : 0;
  const yawDelta = state.initialized ? angle(yaw - state.lastYaw) : 0;
  const teleported =
    state.initialized &&
    Math.hypot(dx, dz) > Math.max(1.8 * sy, speed * dt * 3 + 0.3);
  const travelled = teleported ? 0 : Math.hypot(dx, dz);
  state.lastX = state.root.x;
  state.lastZ = state.root.z;
  state.lastYaw = yaw;
  state.initialized = true;
  const response = 1 - Math.exp(-dt * 11);
  state.speed = mix(state.speed, speed, response);
  const turnRate = clamp(
    finite(motion.turnRate, dt > 0 ? yawDelta / dt : 0),
    -5,
    5,
  );
  state.turn = mix(state.turn, turnRate, 1 - Math.exp(-dt * 8));
  const activity = clamp(speed / (profile.speed * 0.7), 0, 1);
  state.move = mix(state.move, activity, response);
  if (speed > 0.025) {
    state.forwardX = vx / speed;
    state.forwardZ = vz / speed;
  } else if (!state.initialized || Math.abs(turnRate) > 0.05) {
    state.forwardX = Math.sin(yaw);
    state.forwardZ = Math.cos(yaw);
  }
  // Short steps at low speeds; higher speeds increase cadence, not an
  // impossible leg reach. There is deliberately no runner speed clamp.
  const stride =
    profile.cycle * sz * mix(0.5, 1, clamp(speed / profile.speed, 0, 1));
  const turnTravel = Math.abs(yawDelta) * profile.width * sx * 1.65;
  const advance = (travelled + turnTravel) / Math.max(0.1, stride);
  state.cadence = dt > 0 ? advance / dt : speed / Math.max(0.1, stride);
  state.distance += travelled;
  state.cycle += advance;
  // Keep phase numerically small for multi-hour sessions; only phase, never
  // absolute wall-clock time, controls gait. A speed change cannot reset it.
  if (state.cycle > 2048) state.cycle %= 2;
  d.walkPhase = (state.cycle * TAU) % (TAU * 2);
  state.phase = state.cycle % 1;
  const rig = d.rig;
  const ankleHeight = (rig?.ankleHeight ?? 0.1) - (rig?.soleHeight ?? 0.024);
  const ground = finite(motion.groundHeight, state.root.y);
  const ankleY = ground + ankleHeight * sy;
  const moving = speed > 0.025 || Math.abs(turnRate) > 0.12;
  const planted = motion.isGrounded !== false;
  const gait = curve(ARM, state.phase);
  const breath = Math.sin(state.time * profile.breath + variation * TAU);

  let action = motion.action || (attacking ? "melee" : "none");
  if (action === "none" && attacking) action = "melee";
  if (attacking && !state.wasAttacking) state.attackTime = 0;
  state.attackTime += dt;
  state.wasAttacking = attacking;
  const phase = clamp(
    finite(motion.actionPhase, (state.attackTime % 1.05) / 1.05),
    0,
    1,
  );
  const contact = clamp(
    finite(motion.actionContact, action === "spit" ? 0.55 : 0.38),
    0.1,
    0.85,
  );
  const strikePhase =
    phase <= contact
      ? phase / contact
      : 1 + ((phase - contact) / (1 - contact)) * 1.64;
  const melee = action === "melee" ? 1 : 0;
  const spit = action === "spit" ? 1 : 0;
  const side = finite(motion.actionSide, variation < 0.5 ? -1 : 1) < 0 ? -1 : 1;
  const strike = curve(STRIKE, strikePhase) * melee;
  const twist = curve(STRIKE_TWIST, strikePhase) * melee * side;
  const preparation =
    action !== "none"
      ? smooth(phase / contact) * (1 - smooth((phase - contact) / 0.27))
      : 0;
  const spitLoad = spit * Math.sin(Math.PI * clamp(phase / contact, 0, 1));
  const spitRelease =
    spit * smooth(phase / contact) * (1 - smooth((phase - contact) / 0.22));

  const hit = d.hitReaction;
  if (hit && hit.serial !== state.reactionSerial) {
    state.reactionSerial = hit.serial;
    state.reactionAge = 0;
    state.reactionStrength = clamp(finite(hit.strength, 0.6), 0, 1);
    state.reactionSide = finite(hit.side, 1) < 0 ? -1 : 1;
    state.reactionHead = !!hit.head;
  } else if (stagger > state.lastStagger + 0.05) {
    state.reactionAge = 0;
    state.reactionStrength = clamp(stagger, 0, 1);
    state.reactionSide = variation < 0.5 ? -1 : 1;
    state.reactionHead = false;
  }
  state.lastStagger = finite(stagger);
  state.reactionAge += dt;
  const reaction =
    state.reactionStrength *
    smooth(state.reactionAge / 0.045) *
    Math.exp(-Math.max(0, state.reactionAge - 0.045) * 8);
  const poseAlpha = dt > 0 ? 1 - Math.exp(-dt * 19) : 1;
  const bodyLift = curve(BODY, (state.phase * 2) % 1) * state.move;
  const support = curve(ARM, (state.phase + 0.08) % 1);
  d.hips.position.set(
    mix(d.hips.position.x, -support * profile.sway * state.move, response),
    profile.hips + bodyLift + breath * 0.002 - preparation * 0.013,
    gait * 0.008 * state.move,
  );
  pose(
    d.hips,
    0.014 * state.move,
    gait * 0.055 * state.move - twist * 0.12,
    support * profile.sway * 0.7 * state.move,
    poseAlpha,
  );
  state.inverseHipsQ.copy(d.hips.quaternion).invert();

  for (let i = 0; i < d.legs.length; i++) {
    const foot = state.feet[i];
    const localPhase = (state.cycle + i * 0.5) % 1;
    const duty = clamp(
      profile.duty + (i ? 1 : -1) * profile.limp * (0.2 + variation * 0.2),
      d.type === "runner" ? 0.4 : 0.52,
      0.78,
    );
    if (!foot.initialized || teleported) {
      footTarget(
        state,
        foot,
        0,
        0,
        duty,
        profile.width,
        ankleY,
        yaw,
        0,
        0,
        sy,
        sx,
      );
      if (moving && !teleported) {
        const initialLead = stride * (duty * 0.5 - Math.min(localPhase, duty));
        foot.target.x += state.forwardX * initialLead;
        foot.target.z += state.forwardZ * initialLead;
      }
      foot.anchor.copy(foot.target);
      foot.position.copy(foot.target);
      foot.yaw = foot.targetYaw;
      foot.planted = true;
      foot.pendingStep = false;
      foot.initialized = true;
      foot.lastPhase = localPhase;
      foot.progress = 0;
      foot.start.copy(foot.position);
      foot.startYaw = foot.yaw;
      if (moving && !teleported && localPhase >= duty) {
        // Spawn directly at the individual's authored phase. Restarting a
        // whole swing here could leave the opposite (already trailing) foot
        // supporting the body for twice its available stance distance.
        foot.planted = false;
        foot.progress = (localPhase - duty) / (1 - duty);
        foot.start.x -= state.forwardX * stride * (localPhase - duty);
        foot.start.z -= state.forwardZ * stride * (localPhase - duty);
      }
    }
    // Emergence translates the whole actor vertically while it is still
    // below the floor. Carry its support frame along until the first grounded
    // frame; otherwise an anchor created underground survives the rise.
    if (!planted || !state.wasGrounded) {
      const rise = ankleY - foot.anchor.y;
      foot.anchor.y = ankleY;
      foot.start.y += rise;
      foot.target.y += rise;
      foot.position.y += rise;
    }
    const crossedLift =
      localPhase >= duty &&
      (foot.lastPhase < duty || localPhase < foot.lastPhase);
    const trailing =
      (state.root.x - foot.anchor.x) * state.forwardX +
      (state.root.z - foot.anchor.z) * state.forwardZ;
    const needsRecoveryStep =
      state.feet[1 - i].planted &&
      (trailing > stride * duty * 0.5 + 0.045 * sz ||
        Math.abs(angle(yaw - foot.yaw)) > 0.62);
    // A cold start begins from two supported feet. Lift the selected foot
    // gradually even if the random individual phase starts halfway through.
    if (!moving) foot.pendingStep = false;
    else if (
      foot.planted &&
      (crossedLift ||
        needsRecoveryStep ||
        (localPhase >= duty && state.move < 0.2))
    )
      foot.pendingStep = true;
    // Walking species always transfer weight onto the other foot BEFORE
    // lifting. Unequal stance times and cold random phases must not create an
    // accidental hop. Remember a deferred step instead of losing its event.
    if (
      foot.planted &&
      foot.pendingStep &&
      (d.type === "runner" || state.feet[1 - i].planted)
    ) {
      foot.planted = false;
      foot.pendingStep = false;
      foot.progress = 0;
      foot.start.copy(foot.position);
      foot.startYaw = foot.yaw;
    }
    if (!foot.planted) {
      // The foot completes its return to the floor when the root stops;
      // freezing gait phase must never leave a foot hovering in mid-air.
      const swingRate = moving ? Math.max(0.8, state.cadence / (1 - duty)) : 5;
      foot.progress = Math.min(1, foot.progress + dt * swingRate);
      const u = foot.progress;
      const remaining = (1 - u) * (1 - duty);
      footTarget(
        state,
        foot,
        remaining,
        stride,
        duty,
        profile.width,
        ankleY,
        yaw,
        state.turn,
        speed,
        sy,
        sx,
      );
      const travel = smoother(u);
      foot.position.lerpVectors(foot.start, foot.target, travel);
      const lift = Math.max(0, curve(LIFT, u)) * profile.lift * sy;
      foot.pitch = curve(FOOT_PITCH, u) * (d.type === "runner" ? 1 : 0.7);
      // Clearance includes the toe length under a plantar-flexed ankle.
      foot.position.y += lift + Math.max(0, Math.sin(foot.pitch)) * 0.17 * sy;
      foot.yaw =
        foot.startYaw + angle(foot.targetYaw - foot.startYaw) * smooth(u);
      if (u >= 1) {
        foot.anchor.copy(foot.target);
        foot.position.copy(foot.anchor);
        foot.yaw = foot.targetYaw;
        foot.pitch = 0;
        foot.planted = true;
        foot.contactCount++;
      }
    } else {
      foot.position.copy(foot.anchor);
      foot.pitch = 0;
    }
    foot.lastPhase = localPhase;
    if (!planted) foot.position.y = Math.max(foot.position.y, ankleY);
  }
  state.wasGrounded = planted;

  // The support leg determines the pelvis ceiling. Without this correction a
  // decorative body bob can pull a fully extended ankle off its locked point.
  // This is a root-height adjustment, not a release or slide of the anchor.
  let pelvisCeiling = d.hips.position.y;
  for (let i = 0; i < d.legs.length; i++) {
    const foot = state.feet[i],
      leg = d.legs[i];
    if (!foot.planted) continue;
    state.a.copy(foot.position);
    state.a.x -= state.virtualX;
    state.a.z -= state.virtualZ;
    state.a.applyMatrix4(state.inverse);
    state.b.copy(leg.root.position).applyQuaternion(d.hips.quaternion);
    const x = state.a.x - d.hips.position.x - state.b.x;
    const z = state.a.z - d.hips.position.z - state.b.z;
    const reach =
      (leg.lengths?.upper || 0.42) +
      (leg.lengths?.lower || Math.hypot(0.36, 0.025)) -
      0.006;
    const vertical = Math.sqrt(Math.max(0.01, reach * reach - x * x - z * z));
    pelvisCeiling = Math.min(pelvisCeiling, state.a.y + vertical - state.b.y);
  }
  d.hips.position.y = Math.max(0.63, pelvisCeiling);
  for (let i = 0; i < d.legs.length; i++) {
    solveLeg(
      state,
      d.legs[i],
      state.feet[i],
      d.hips,
      ankleY,
      state.virtualX,
      state.virtualZ,
    );
  }

  const aim = clamp(angle(finite(motion.targetYaw, yaw) - yaw), -0.7, 0.7);
  const lean = profile.lean + clamp(speed / profile.speed - 1, 0, 1) * 0.045;
  const spineShare = d.spine ? 0.43 : 0;
  pose(
    d.spine,
    lean * spineShare + preparation * 0.07 - spitLoad * 0.09 - reaction * 0.12,
    -gait * 0.06 * state.move + twist * 0.42,
    -support * 0.02 * state.move + reaction * state.reactionSide * 0.055,
    poseAlpha,
  );
  pose(
    d.torso,
    lean * (1 - spineShare) +
      preparation * 0.09 -
      spitLoad * 0.09 +
      spitRelease * 0.13 -
      reaction * 0.23,
    -gait * 0.065 * state.move +
      twist * 0.7 +
      aim * 0.08 +
      reaction * state.reactionSide * 0.14,
    -support * 0.025 * state.move - state.turn * 0.018 + individuality * 0.04,
    poseAlpha,
  );
  pose(
    d.neck,
    -lean * 0.2 - spitLoad * 0.16 + spitRelease * 0.12 - reaction * 0.08,
    aim * 0.27 - twist * 0.2,
    individuality * 0.055,
    poseAlpha,
  );
  pose(
    d.head,
    -lean * 0.34 +
      breath * 0.012 -
      spitLoad * 0.18 +
      spitRelease * 0.12 -
      reaction * (state.reactionHead ? 0.31 : 0.07),
    aim * 0.61 -
      twist * 0.22 +
      reaction * state.reactionSide * (state.reactionHead ? 0.21 : 0.055),
    individuality * 0.17 + gait * 0.025 * state.move,
    poseAlpha,
  );
  if (d.jaw) {
    const look = d.look || (d.type === "archon" ? "brute" : d.type);
    const open = jawOpening(look || "walker", state.time, false);
    pose(
      d.jaw,
      Math.min(
        d.jawLimit ?? Infinity,
        open +
          preparation * 0.16 +
          spitLoad * 0.28 +
          spitRelease * 0.32 +
          reaction * 0.1,
      ),
      0,
      breath * 0.006,
      poseAlpha,
    );
  }
  // Shoulders lead the free arm; the elbow and wrist follow at different
  // phases and response rates. A small breath-driven drift survives a stop,
  // without advancing the distance-driven gait or disturbing planted feet.
  // Authored attacks/hit reactions retain the original response speed.
  const free = 1 - Math.max(preparation * 0.85, reaction * 0.6);
  const urgent = action !== "none" || reaction > 0.025;
  const armAlpha =
    urgent || dt === 0 ? poseAlpha : 1 - Math.exp(-dt * profile.armResponse);
  const elbowAlpha =
    urgent || dt === 0
      ? poseAlpha
      : 1 - Math.exp(-dt * profile.armResponse * 0.88);
  const wristAlpha =
    urgent || dt === 0
      ? poseAlpha
      : 1 - Math.exp(-dt * profile.armResponse * 0.75);
  const fingerAlpha = dt > 0 ? 1 - Math.exp(-dt * (urgent ? 19 : 10)) : 1;
  const handInterval =
    d.detail === "far" ? 0.14 : d.detail === "lite" ? 0.08 : 0;
  for (let i = 0; i < (d.arms?.length || 0); i++) {
    const s = i ? 1 : -1;
    const p = (state.phase + i * 0.5 + 0.045 + individuality * 0.02) % 1;
    const swing = curve(ARM, p) * state.move;
    const lag = curve(ARM, (p + 1 - profile.armLag) % 1) * state.move;
    const wristLag =
      curve(ARM, (p + 1 - profile.armLag * 1.6) % 1) * state.move;
    const driftPhase =
      state.time * profile.breath * 0.62 + variation * TAU + i * 1.7;
    const drift =
      Math.sin(driftPhase) * 0.7 + Math.sin(driftPhase * 0.47 + i * 0.9) * 0.3;
    const handDrift = Math.sin(driftPhase - 0.6);
    const active = s === side ? 1 : 0.3;
    const asymmetry = (i ? 0.11 : -0.12) * (d.type === "runner" ? 0.2 : 1);
    const swingGain = 1 + s * (0.1 + individuality * 0.035);
    const shoulderLift = -strike * active * 0.07;
    pose(
      d.shoulders?.[i],
      -swing * 0.045 + drift * 0.018 * free - preparation * 0.06,
      -swing * s * 0.035 + twist * 0.19,
      s * (shoulderLift + breath * 0.004 + drift * 0.014 * free),
      poseAlpha,
    );
    pose(
      d.arms[i],
      profile.arm +
        asymmetry +
        swing * profile.swing * swingGain +
        drift * profile.armDrift * free +
        strike * active -
        spitLoad * 0.18 -
        reaction * (s === state.reactionSide ? 0.2 : -0.06),
      twist * 0.32 + s * (0.035 + swing * 0.055) + drift * 0.025 * free,
      s *
        (0.055 +
          (d.type === "brute" || d.type === "archon" ? 0.08 : 0) +
          preparation * active * 0.09 +
          handDrift * 0.022 * free),
      armAlpha,
    );
    pose(
      d.elbows?.[i],
      -profile.elbow -
        Math.max(0, -lag) * (d.type === "runner" ? 0.25 : 0.15) +
        handDrift * 0.045 * free +
        curve(STRIKE_ELBOW, strikePhase) * melee * active -
        spitLoad * 0.15,
      s * 0.025,
      0,
      elbowAlpha,
    );
    pose(
      d.wrists?.[i],
      0.06 +
        wristLag * 0.16 +
        handDrift * 0.065 * free -
        preparation * active * 0.18,
      -s * (0.08 + individuality * 0.04) + drift * 0.045 * free,
      s * (0.025 + wristLag * 0.04 + handDrift * 0.025 * free),
      wristAlpha,
    );
    const fingers = d.fingers?.[i];
    const hand = state.hands[i];
    if (fingers && hand) {
      // LOD reduces target sampling, never freezes the pose. Interpolate every
      // frame so distant fingers flex smoothly; actions and LOD transitions
      // refresh immediately. Time/variation, not world position, drive flex.
      if (urgent || state.time >= hand.nextSample || hand.detail !== d.detail) {
        hand.nextSample = state.time + handInterval;
        hand.detail = d.detail;
        for (let j = 0; j < fingers.length; j++) {
          const finger = fingers[j];
          const flexPhase =
            state.time * profile.handRate +
            variation * TAU +
            i * 1.9 +
            j * 0.68;
          const flex = Math.sin(flexPhase) * profile.handFlex * free;
          const curl = clamp(
            0.2 +
              j * 0.033 +
              flex +
              wristLag * 0.045 +
              preparation * (0.19 + j * 0.017) +
              reaction * 0.09,
            0.09,
            0.65,
          );
          hand.targets[j * 3] = finger.thumb ? curl * 0.42 : curl;
          hand.targets[j * 3 + 1] = finger.thumb
            ? -s * (0.11 + flex * 0.2)
            : s * ((j - 1.5) * 0.015 + flex * 0.12);
          hand.targets[j * 3 + 2] = finger.thumb
            ? curl * 0.35
            : curl * 0.85 + 0.065;
        }
      }
      for (let j = 0; j < fingers.length; j++) {
        const finger = fingers[j];
        pose(
          finger.root,
          hand.targets[j * 3],
          0,
          hand.targets[j * 3 + 1],
          fingerAlpha,
        );
        pose(finger.tip, hand.targets[j * 3 + 2], 0, 0, fingerAlpha);
      }
    }
  }
}
