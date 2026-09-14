import * as T from "three";
import { glow } from "../assets.js";

// Special attacks are optional. Movement and contact damage stay in EnemySystem.
export const ENEMY_BEHAVIORS = {
  melee() {},
  wraith() {},
  spitter({ enemy, distance, blocked, target, local, run, view }) {
    if (distance >= 17 || distance <= 3 || blocked || enemy.spit > 0) return;
    const orb = new T.Mesh(new T.SphereGeometry(0.12, 8, 6), glow(0x9ae54f, 3));
    orb.position.copy(enemy.model.position).add(new T.Vector3(0, 1.6, 0));
    view.scene.add(orb);
    const aim = local
      ? view.camera.position.clone()
      : new T.Vector3(target.x, 1.7, target.z);
    const velocity = aim.sub(orb.position).normalize().multiplyScalar(7);
    run.projectiles.push({
      id: run.nextProjectileId++,
      mesh: orb,
      velocity,
      life: 3,
      type: "acid",
    });
    enemy.spit = 3.6;
  },
};
