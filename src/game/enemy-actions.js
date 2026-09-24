import { ENEMIES } from "../content/enemies.js";
import { EMERGE_DEPTH, EMERGE_TIME } from "../content/horde.js";

export { EMERGE_DEPTH };
/** Rise speed out of the ground: slower climb for motion-captured bodies. */
export const riseRate = (model) =>
  model.userData.horde ? EMERGE_DEPTH / (EMERGE_TIME * 0.85) : 2.5;
/** Navigation speed of an enemy at a wave, including its individual gait. */
export function enemySpeed(e, wave) {
  return (
    ENEMIES[e.type].speed *
    (1 + Math.min(wave, 20) * 0.022) *
    (e.speedFactor ?? 1)
  );
}

// These markers drive both the visual pose and the authoritative contact.
// Locomotion never moves an entity through an animation's root translation.
export const ENEMY_ACTIONS = Object.freeze({
  none: Object.freeze({ code: 0, contact: 0, duration: 0 }),
  melee: Object.freeze({ code: 1, contact: 0.38 }),
  spit: Object.freeze({ code: 2, contact: 0.55, duration: 1.1 }),
});
const ACTION_NAMES = ["none", "melee", "spit"];

export function enemyVariation(id) {
  let value = (id ^ 0x9e3779b9) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return ((value ^ (value >>> 15)) >>> 0) / 4294967296;
}

export function enemyActionDuration(kind, type) {
  return kind === "melee"
    ? ENEMIES[type].attackInterval
    : ENEMY_ACTIONS[kind]?.duration || 0;
}

export function enemyActionFromSnapshot(code, startTime, sequence, leap) {
  const kind = ACTION_NAMES[code] || "none";
  return { kind, startTime, sequence, leap: kind === "melee" && !!leap };
}

export function enemyActionPresentation(
  action,
  time,
  type,
  id = 0,
  result = {},
) {
  const kind = action?.kind || "none";
  const duration = enemyActionDuration(kind, type);
  const elapsed = time - (action?.startTime ?? time);
  const active = duration > 0 && elapsed >= 0 && elapsed < duration;
  result.action = active ? kind : "none";
  result.actionPhase = active ? Math.min(1, elapsed / duration) : 0;
  result.actionSide = ((id + (action?.sequence || 0)) & 1) === 0 ? -1 : 1;
  result.actionSequence = action?.sequence || 0;
  result.actionContact = ENEMY_ACTIONS[kind]?.contact || 0;
  result.actionDuration = duration;
  result.actionLeap = active && !!action?.leap;
  return result;
}

/** Advance a single action; contact can fire only once, including long frames. */
export function updateEnemyAction(
  enemy,
  time,
  { melee = false, spit = false, leap = false },
) {
  const action = enemy.action;
  if (action && action.kind !== "none") {
    const duration = enemyActionDuration(action.kind, enemy.type);
    if (
      !action.contactApplied &&
      time >= action.startTime + duration * ENEMY_ACTIONS[action.kind].contact
    ) {
      action.contactApplied = true;
      return action.kind;
    }
    if (time < action.startTime + duration) return null;
  }
  const kind =
    melee &&
    enemy.attack <=
      enemyActionDuration("melee", enemy.type) * ENEMY_ACTIONS.melee.contact
      ? "melee"
      : spit &&
          enemy.spit <= ENEMY_ACTIONS.spit.duration * ENEMY_ACTIONS.spit.contact
        ? "spit"
        : null;
  if (kind) {
    enemy.action = {
      kind,
      startTime: time,
      sequence: (action?.sequence || 0) + 1,
      contactApplied: false,
      leap: kind === "melee" && leap,
    };
  }
  return null;
}

/** Shortest-angle turn, damped and limited so feet can visibly follow a pivot. */
export function turnEnemyYaw(yaw, desired, dt, type) {
  if (!(dt > 0)) return yaw;
  const look = ENEMIES[type].look || type;
  const rate = look === "brute" ? 2.4 : look === "runner" ? 6 : 4;
  const delta = Math.atan2(Math.sin(desired - yaw), Math.cos(desired - yaw));
  const step = delta * (1 - Math.exp(-9 * dt));
  return yaw + Math.max(-rate * dt, Math.min(rate * dt, step));
}
