import { ENEMIES } from "../content/enemies.js";

/** Both host simulation and peer interpolation share the same death animation. */
export function animateDeath(enemy, dt) {
  enemy.deathTime -= dt;
  enemy.model.rotation.x = Math.max(
    -Math.PI / 2 + 0.06,
    enemy.model.rotation.x - dt * 3.4,
  );
  enemy.model.rotation.z =
    (enemy.fallSide || 1) *
    0.12 *
    (1 - Math.max(0, enemy.deathTime - 1.8) / 0.6);
  if (enemy.deathTime < 0.65) enemy.model.position.y -= dt * 0.65;
}
export function updateEnemyVisibility(enemy, time, distance) {
  if (ENEMIES[enemy.type].behavior === "wraith")
    enemy.model.visible =
      Math.sin(time * 5 + enemy.seed) > 0.05 || distance < 4;
}
