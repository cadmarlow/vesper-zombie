import { clearPath } from "../logic.js";

// Low obstacles (pews, crates) are climbed over by zombies close to their
// prey instead of walked around. Everything derives from positions: host and
// peers compute the same crossing, height and animation phase without any
// extra network data.

export const VAULT = {
  maxHeight: 1.3, // metres: taller obstacles are walls
  maxDepth: 1.1, // the thin side must be crossable in a stride or two
  range: 7, // prey closer than this makes the shortcut worth it
  margin: 0.42, // body radius (and navigation clearance) around the footprint
  settle: 0.7, // seconds of straight walking after a landing
};
const VAULTERS = new Set(["walker", "runner", "spitter", "wraith"]);

export const isVaultable = (o) =>
  o.active !== false &&
  o.h <= VAULT.maxHeight &&
  Math.min(o.w, o.d) <= VAULT.maxDepth;

/** Mark the low obstacles of a world once it is built. */
export function markVaultable(obstacles) {
  for (const o of obstacles) o.vaultable = isVaultable(o);
}

export const canVault = (enemy) =>
  VAULTERS.has(enemy.type) && !enemy.crawler && !enemy.dead;

/**
 * The low obstacle a body stands over, if any: `t` runs 0..1 across its thin
 * side, from its negative to its positive face.
 */
export function vaultCrossing(x, z, obstacles) {
  const m = VAULT.margin;
  for (const o of obstacles) {
    if (!o.vaultable || o.active === false) continue;
    if (Math.abs(x - o.x) >= o.w / 2 + m || Math.abs(z - o.z) >= o.d / 2 + m)
      continue;
    const alongX = o.w <= o.d;
    const half = (alongX ? o.w : o.d) / 2 + m;
    const offset = alongX ? x - o.x : z - o.z;
    return {
      obstacle: o,
      alongX,
      t: Math.min(1, Math.max(0, (offset + half) / (2 * half))),
    };
  }
  return null;
}

/** Height of the body over the obstacle: up quickly, a flat top, down. */
export const vaultHeight = (crossing) =>
  crossing
    ? crossing.obstacle.h *
      Math.min(1, Math.sin(Math.PI * crossing.t) * 1.35) *
      0.92
    : 0;

/** Phase of the vault animation, from the side the body entered. */
export const vaultPhase = (crossing, vx, vz) =>
  crossing
    ? (crossing.alongX ? vx : vz) >= 0
      ? crossing.t
      : 1 - crossing.t
    : -1;

/** Walls only: the obstacles a vaulting body still collides with. */
export function solidObstacles(obstacles) {
  return obstacles.filter((o) => !o.vaultable);
}

/** Mark a world's low obstacles once; returns its walls-only list. */
export function vaultWorld(world) {
  if (!world.solidObstacles) {
    const obstacles = world.obstacles || [];
    markVaultable(obstacles);
    world.solidObstacles = solidObstacles(obstacles);
  }
  return world.solidObstacles;
}

/**
 * True when the straight line to the prey is blocked, but only by low
 * obstacles: the body may go straight over them.
 */
export function shortcutOver(from, to, obstacles, solid, radius) {
  const distance = Math.hypot(to.x - from.x, to.z - from.z);
  if (distance > VAULT.range) return false;
  return (
    !clearPath(from, to, obstacles, radius * 0.5) &&
    clearPath(from, to, solid, radius)
  );
}
