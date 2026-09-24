import { ENEMIES } from "../content/enemies.js";
import { CORPSE_TIME } from "../content/horde.js";
import { animateHordeDeath } from "../horde/animator.js";
import * as T from "three";

/** Corpse lifetime: motion-captured bodies lie longer than procedural ones. */
export const deathDuration = (enemy) =>
  enemy.model.userData.horde ? CORPSE_TIME : 2.4;

function animateBodyDeath(enemy, dt) {
  enemy.deathTime -= dt;
  enemy.deathAge = (enemy.deathAge || 0) + dt;
  const model = enemy.model;
  enemy.deathBaseY ??= model.position.y;
  animateHordeDeath(enemy, dt);
  // The last moments sink the corpse through the floor.
  model.position.y =
    enemy.deathBaseY -
    T.MathUtils.smoothstep(0.9 - enemy.deathTime, 0, 0.9) * 0.9 * model.scale.y;
}

const deathRotation = new T.Euler(),
  deathTarget = new T.Quaternion(),
  deathSupport = new T.Vector3();
const smooth = (a, b, t) => T.MathUtils.smoothstep(t, a, b);
const soleSides = [-0.085, 0.085],
  soleEnds = [-0.104, 0.208];

function deathPose(enemy) {
  const joints = [];
  enemy.model.traverse((bone) => {
    if (bone.isBone) joints.push({ bone, rotation: bone.quaternion.clone() });
  });
  return {
    joints,
    hipY: enemy.model.userData.hips?.position.y ?? 0.865,
    baseY: enemy.model.position.y,
    side: enemy.fallSide || (enemy.model.userData.variation < 0.5 ? -1 : 1),
  };
}

/** Both host simulation and peer interpolation share the same death animation. */
export function animateDeath(enemy, dt) {
  if (enemy.model.userData.horde) return animateBodyDeath(enemy, dt);
  enemy.deathTime -= dt;
  const data = enemy.model.userData,
    pose = (enemy.deathPose ||= deathPose(enemy)),
    age = Math.max(0, 2.4 - enemy.deathTime),
    buckle = smooth(0.04, 0.32, age) * (1 - smooth(0.32, 0.82, age)),
    fall = smooth(0.2, 0.96, age),
    release = smooth(0, 0.3, age),
    side = pose.side;
  // Retain the struck pose, let knees give way, then settle the articulated
  // body onto its back. No physics bodies, per-frame allocations or root flip.
  for (const { bone, rotation } of pose.joints) {
    const name = bone.name;
    let x = 0,
      y = 0,
      z = 0,
      blend = release;
    if (name === "hips") {
      x = 0.12 * buckle - 1.47 * fall;
      z = side * 0.1 * fall;
      blend = smooth(0, 0.18, age);
    } else if (name === "spine") x = 0.17 * buckle + 0.03 * fall;
    else if (name === "torso") {
      x = 0.24 * buckle + 0.04 * fall;
      y = side * 0.07 * fall;
    } else if (name === "neck") x = -0.04 * fall;
    else if (name === "head") {
      x = -0.07 * fall;
      y = side * 0.22 * fall;
      z = side * 0.1 * fall;
    } else if (name === "jaw") x = Math.min(0.25, data.jawLimit ?? Infinity);
    else if (name.startsWith("leg")) {
      x = -0.45 * buckle - 0.12 * fall;
      z = (name.endsWith("0") ? -1 : 1) * 0.09 * fall;
    } else if (name.startsWith("shin")) x = 0.9 * buckle + 0.32 * fall;
    else if (name.startsWith("foot")) x = -0.45 * buckle;
    else if (name.startsWith("arm")) {
      x = -0.65 * buckle - 0.15 * fall;
      z = (name.endsWith("0") ? -1 : 1) * (0.16 + 0.26 * fall);
    } else if (name.startsWith("elbow")) x = -0.5 * buckle - 0.22 * fall;
    else if (name.startsWith("wrist")) x = 0.12 * fall;
    else {
      // Fingers retain the relaxed authored curl; toe/clavicle transforms
      // return gradually to their bind orientation.
      if (name.startsWith("finger") || name.startsWith("thumb")) {
        bone.quaternion.copy(rotation);
        continue;
      }
    }
    deathTarget.setFromEuler(deathRotation.set(x, y, z));
    bone.quaternion.copy(rotation).slerp(deathTarget, blend);
  }
  if (data.hips) {
    data.hips.position.y =
      T.MathUtils.lerp(pose.hipY, 0.23, fall) - 0.13 * buckle;
    data.hips.position.x *= Math.exp(-dt * 10);
    data.hips.position.z *= Math.exp(-dt * 10);
  }
  // During the collapse the knees cannot pull the planted boots below the
  // floor. Four underside points cover a rolled heel/toe without mesh scans.
  enemy.model.position.y = pose.baseY;
  if (data.hips && data.legs) {
    enemy.model.updateWorldMatrix(true, true);
    let lowest = Infinity;
    for (const leg of data.legs)
      for (const x of soleSides)
        for (const z of soleEnds) {
          deathSupport.set(x, -0.076, z).applyMatrix4(leg.foot.matrixWorld);
          lowest = Math.min(lowest, deathSupport.y);
        }
    if ((data.look || data.type) === "spitter" && data.torso) {
      deathSupport.set(0, -0.221, -0.34).applyMatrix4(data.torso.matrixWorld);
      lowest = Math.min(lowest, deathSupport.y);
    }
    if (lowest < pose.baseY)
      data.hips.position.y += (pose.baseY - lowest) / enemy.model.scale.y;
  }
  enemy.model.position.y =
    pose.baseY -
    smooth(0, 0.65, 0.65 - enemy.deathTime) * 0.72 * enemy.model.scale.y;
}
const UP = new T.Vector3(0, 1, 0),
  soil = new T.Vector3();
/**
 * Dirt thrown up while a body claws its way out of the ground: a cracked
 * patch of floor, clods and dust at three depths of the climb. Host and
 * peers call it from their own rise; a body already standing shows none.
 */
export function emergenceDirt(enemy, view) {
  const model = enemy.model;
  const fx = view?.combatEffects;
  if (!model.userData.horde || !fx || (enemy.dirtStage ?? 0) >= 3) return;
  const depth = -model.position.y;
  if (enemy.dirtStage === undefined && depth < 0.3) {
    enemy.dirtStage = 3;
    return;
  }
  const stage = depth > 0.95 ? 0 : depth > 0.55 ? 1 : depth > 0.12 ? 2 : 3;
  let done = enemy.dirtStage ?? -1;
  const scale = model.scale.y;
  while (done < stage) {
    done++;
    soil.set(model.position.x, 0.05, model.position.z);
    if (done === 0) {
      fx.impact(soil.setY(0), UP, 1.05 * scale);
      soil.setY(0.05);
      fx.burst(soil, 0x3a2f25, 18, 0.55 * scale);
      fx.puff(soil);
      fx.puff(soil);
    } else if (done === 1) fx.burst(soil, 0x453829, 12, 0.45 * scale);
    else if (done === 2) {
      fx.burst(soil, 0x3a2f25, 8, 0.32 * scale);
      fx.puff(soil);
    }
  }
  enemy.dirtStage = done;
}

/** Blood spreading under a fallen body: two overlapping pools. */
export function corpseBlood(enemy, view) {
  const blood = view?.combatEffects?.blood;
  const model = enemy.model;
  const count = enemy.pools ?? 0;
  if (!blood || !model.userData.horde || count >= 2) return;
  if ((enemy.deathAge ?? 0) < (count ? 2.2 : 1.1)) return;
  const chest = model.userData.torso;
  if (!chest) return;
  chest.getWorldPosition(soil);
  soil.y = 0;
  blood.stain(soil, UP, (count ? 1.05 : 0.65) * model.scale.y);
  enemy.pools = count + 1;
}

export function updateEnemyVisibility(enemy, time, distance) {
  if (ENEMIES[enemy.type].behavior === "wraith")
    enemy.model.visible =
      Math.sin(time * 5 + enemy.seed) > 0.05 || distance < 4;
}
