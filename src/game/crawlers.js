import * as T from "three";
import { ENEMIES } from "../content/enemies.js";
import { CRAWL_FALL, CRAWL_SPEED, hordeCanCrawl } from "../content/horde.js";
import { hordeLoseLegs, hordeSever, hordeWound } from "../horde/library.js";
import { hordeEvent } from "../horde/voice.js";

// Maiming: zombies lose limbs like in the classics. Lower legs blown off make
// crawlers that keep coming on their hands; arms shot off at the elbow or the
// shoulder leave the body clawing with the other one. The host decides
// (explosions, damage per limb); guests replay the same cuts from snapshots.
// Every torn piece is thrown as a gib from its last animated pose.

const knee = new T.Vector3(),
  spray = new T.Vector3(),
  UP = new T.Vector3(0, 1, 0),
  DOWN = new T.Vector3(0, -1, 0);

/** Share of the maximum health that, dealt to the legs, cripples a body. */
const LEG_CRIPPLE = 0.55;
/** Share of the maximum health that, dealt to one arm, tears it off. */
const ARM_TEAR = 0.45;

export const canCrawl = (enemy) =>
  !enemy.dead &&
  !enemy.crawler &&
  !!enemy.model.userData.horde &&
  hordeCanCrawl(enemy.type) &&
  enemy.model.position.y > -0.05;

const canTearArms = (enemy) =>
  !enemy.dead &&
  !!enemy.model.userData.horde &&
  !ENEMIES[enemy.type]?.boss &&
  enemy.model.position.y > -0.05;

/**
 * Throw the pieces of a cut as gibs (view.hordeGibs), each with a raw end,
 * and spray blood from the wounds left on the body.
 */
function thrower(view, model, impulse) {
  const gibs = view?.hordeGibs;
  const blood = view?.combatEffects?.blood;
  const material = model.userData.horde?.pack?.bodyMaterial;
  return (mesh, pieces, ends) => {
    pieces.forEach((triangles, i) => {
      const end = ends[i];
      if (end && blood) {
        spray.copy(end.direction).negate().add(UP).normalize();
        blood.hit(end.position, spray, false, true);
      }
      if (!gibs || !material || triangles.length < 9) return;
      let cap = null;
      if (end) {
        cap = hordeWound(end.radius, true);
        cap.position.copy(end.position);
        cap.quaternion.setFromUnitVectors(UP, end.direction.clone().negate());
      }
      const velocity = impulse.clone();
      velocity.x += (Math.random() - 0.5) * 1.4;
      velocity.z += (Math.random() - 0.5) * 1.4;
      velocity.y += 1.2 + Math.random() * 1.6;
      gibs.throw(mesh, triangles, material, velocity, cap);
    });
  };
}

/** Tear the lower legs off: gore at both knees, then the body falls. */
export function crippleEnemy(enemy, view, time, impulse = null) {
  if (
    enemy.crawler ||
    !hordeLoseLegs(
      enemy.model,
      thrower(view, enemy.model, impulse || DOWN.clone().multiplyScalar(0.5)),
    )
  )
    return false;
  enemy.crawler = true;
  enemy.crawlFall = time + CRAWL_FALL;
  const model = enemy.model;
  model.updateWorldMatrix(true, true);
  const blood = view?.combatEffects?.blood;
  for (const leg of model.userData.legs || []) {
    if (!leg.shin || !blood) continue;
    leg.shin.getWorldPosition(knee);
    blood.stain(knee.setY(0), UP, 0.45 + Math.random() * 0.25);
  }
  return true;
}

/** Tear an arm off at the elbow, or the whole arm at the shoulder. */
export function severArm(enemy, side, whole, view, impulse = null) {
  const model = enemy.model;
  const key = `${whole ? "arm" : "forearm"}${side}`;
  if (
    !hordeSever(
      model,
      key,
      thrower(view, model, impulse || new T.Vector3(0, 0.5, 0)),
    )
  )
    return false;
  hordeEvent(model, "sever");
  return true;
}

/** Shoot the lower jaw away: the body keeps coming, gaping. */
export function tearJaw(enemy, view, impulse = null) {
  const model = enemy.model;
  if (model.userData.headDestroyed) return false;
  if (
    !hordeSever(
      model,
      "jaw",
      thrower(view, model, impulse || new T.Vector3(0, 0.8, 0)),
    )
  )
    return false;
  hordeEvent(model, "sever", { jaw: true });
  return true;
}

/** Push of a torn piece: along the round, or away from the blast. */
function pieceImpulse(enemy, hit, strength) {
  const v = new T.Vector3();
  if (hit?.origin)
    v.subVectors(enemy.model.position, hit.origin).setY(0).normalize();
  else if (hit?.direction) v.copy(hit.direction).setY(0).normalize();
  return v.multiplyScalar(strength);
}

/**
 * Host rule after a non-lethal blow: explosions tear legs (or an arm) off
 * nearby bodies; enough damage to the legs cripples them; enough to one arm
 * tears it off, at the elbow for forearm hits, at the shoulder otherwise.
 */
export function maimAfterHit(enemy, damage, hit, view, time, head = false) {
  if (enemy.dead || enemy.health <= 0 || !enemy.model.userData.horde)
    return false;
  // A heavy round that fails to kill can still shoot the jaw away.
  if (head) {
    if (
      canTearArms(enemy) &&
      damage >= enemy.maxHealth * 0.25 &&
      Math.random() < 0.45
    )
      return tearJaw(enemy, view, pieceImpulse(enemy, hit, 2.2));
    return false;
  }
  if (hit?.explosive) {
    const d = hit.distance ?? 3;
    const push = pieceImpulse(enemy, hit, 5 - Math.min(4, d));
    const chance = d < 3 ? 0.75 : d < 5 ? 0.45 : 0;
    if (canCrawl(enemy) && Math.random() < chance)
      return crippleEnemy(enemy, view, time, push);
    if (canTearArms(enemy) && d < 4.5 && Math.random() < 0.35)
      return severArm(enemy, Math.random() < 0.5 ? "L" : "R", true, view, push);
    return false;
  }
  if (hit?.arm && canTearArms(enemy)) {
    const side = hit.arm;
    enemy.armDamage ||= { L: 0, R: 0 };
    enemy.armDamage[side] += damage;
    if (enemy.armDamage[side] >= enemy.maxHealth * ARM_TEAR)
      return severArm(
        enemy,
        side,
        !hit.lower,
        view,
        pieceImpulse(enemy, hit, 2.6),
      );
    return false;
  }
  if (!hit?.leg || !canCrawl(enemy)) return false;
  enemy.legDamage = (enemy.legDamage || 0) + damage;
  if (enemy.legDamage >= enemy.maxHealth * LEG_CRIPPLE)
    return crippleEnemy(enemy, view, time, pieceImpulse(enemy, hit, 1.5));
  return false;
}
/** Former name of the host rule. */
export const crippleAfterHit = maimAfterHit;

/** Navigation speed of a crawler (m/s); none while it collapses. */
export function crawlSpeed(enemy, wave, time) {
  if (time < (enemy.crawlFall || 0)) return 0;
  return (CRAWL_SPEED[enemy.type] ?? 0.4) * (1 + Math.min(wave, 20) * 0.02);
}

/** Reach of a crawler's claws at the players' legs. */
export const CRAWL_REACH = 1.3;
