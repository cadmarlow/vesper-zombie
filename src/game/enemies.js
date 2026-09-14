import { ENEMY_BEHAVIORS } from "./enemy-behaviors.js";
import { animateDeath, updateEnemyVisibility } from "./enemy-presentation.js";
import { zombieModel, animateZombie } from "../creatures.js";
import * as T from "three";
import { setSurfaceQuality } from "../surfaces.js";
import { releaseZombie, setZombieDetail } from "../creatures.js";

import { ENEMIES } from "../config.js";
import { moveSlide, enemyType } from "../logic.js";
const vec = new T.Vector3(),
  dir = new T.Vector3(),
  point = new T.Vector3();

/** enemies owns its rules; commands are the explicit cross-system operations. */
export class EnemySystem {
  constructor({ run, view, input, sound, emit }, { obstacleDistance, hurt }) {
    Object.assign(this, { run, view, input, sound, emit });
    this.commands = { obstacleDistance, hurt };
  }
  updateNavigation(rebuild = false) {
    if (this.run.session?.peer) return;
    for (const field of [this.run.navigation, this.run.largeNavigation]) {
      if (rebuild) field.rebuild();
      field.update(this.run.player.position.x, this.run.player.position.z);
    }
    this.run.session?.updateFields(rebuild);
  }
  spawnEnemy(typeOverride, positionOverride) {
    const type = typeOverride || enemyType(this.run.wave);
    const navigation =
      (ENEMIES[type].radius || 0.36) > 0.4
        ? this.run.largeNavigation
        : this.run.navigation;
    let pos = positionOverride;
    if (!pos) {
      const candidate = navigation.spawnPosition(
        this.run.world.spawnPoints,
        this.run.player.position,
        Math.random,
        this.run.enemies.filter((e) => !e.dead).map((e) => e.model.position),
      );
      if (!candidate) return false;
      // Always spawn at the validated position. The old fallback used the
      // authored anchor even when it overlapped a column or scenery collider.
      pos = new T.Vector3(candidate.x, 0, candidate.z);
    }
    const model = zombieModel(
      type,
      this.run.touch || this.run.settings.quality === "low" ? "lite" : "full",
    );
    setSurfaceQuality(model, this.run.settings.quality);
    model.position.copy(pos);
    model.position.y = -1.9;
    this.view.scene.add(model);
    const health =
      ENEMIES[type].health *
      (1 + (this.run.wave - 1) * 0.15) *
      this.run.difficulty.health;
    this.run.enemies.push({
      id: this.run.nextEnemyId++,
      model,
      type,
      health,
      maxHealth: health,
      attacking: false,
      attack: 1.5,
      stagger: 0,
      age: 0,
      seed: Math.random() * 12,
      dead: false,
      spit: 2 + Math.random() * 3,
    });
    return true;
  }
  applyDetail(e, d) {
    // Three levels with hysteresis: full up close, lite at mid range, far
    // for the distant horde where a head spans a handful of pixels.
    const current = e.model.userData.detail,
      farAt = this.run.touch ? 13 : 18;
    const detail =
      d > (current === "far" ? farAt - 2 : farAt)
        ? "far"
        : this.run.touch ||
            this.run.settings.quality === "low" ||
            d > (current === "full" ? 10 : 8)
          ? "lite"
          : "full";
    setZombieDetail(e.model, detail, d < (this.run.touch ? 17 : 28));
  }
  updateEnemies(dt) {
    if (this.run.session?.peer) return this.run.session.updateRemoteEnemies(dt);
    for (const e of this.run.enemies) {
      e.age += dt;
      if (e.dead) {
        animateDeath(e, dt);
        continue;
      }
      e.model.position.y = Math.min(0, e.model.position.y + dt * 2.5);
      if (e.model.position.y < -0.2) continue;
      e.stagger -= dt;
      e.attack -= dt;
      e.spit -= dt;
      const dLocal = Math.hypot(
        e.model.position.x - this.run.player.position.x,
        e.model.position.z - this.run.player.position.z,
      );
      if (this.run.time >= (e.nextDetailCheck || 0)) {
        e.nextDetailCheck = this.run.time + 0.4;
        this.applyDetail(e, dLocal);
      }
      // Co-op: hunt the nearest standing player.
      const focus = this.run.session
        ? this.run.session.nearest(e.model.position)
        : null;
      const prey = focus ? focus.position : this.run.player.position;
      const preyLocal = !focus || focus.local;
      const d = focus
        ? Math.hypot(e.model.position.x - prey.x, e.model.position.z - prey.z)
        : dLocal;
      let target = prey;
      const direct = vec.subVectors(prey, e.model.position);
      direct.y = 0;
      direct.normalize();
      const origin = point.copy(e.model.position);
      origin.y = 1;
      const blocked =
        this.commands.obstacleDistance(origin, direct, d) < d - 0.1;
      const large = (ENEMIES[e.type].radius || 0.36) > 0.4;
      const navigation =
        focus && !focus.local
          ? this.run.session.field(focus.id, large)
          : large
            ? this.run.largeNavigation
            : this.run.navigation;
      target = navigation.direction(
        e.model.position.x,
        e.model.position.z,
        prey,
      );
      const delta = dir.set(
        target.x - e.model.position.x,
        0,
        target.z - e.model.position.z,
      );
      const length = delta.length();
      if (length > 0.001) delta.divideScalar(length);
      const speed =
        ENEMIES[e.type].speed *
        (1 + Math.min(this.run.wave, 20) * 0.022) *
        (e.stagger > 0 ? 0.2 : 1);
      const beforeX = e.model.position.x,
        beforeZ = e.model.position.z;
      if (d > 1.15 || blocked) {
        let sx = 0,
          sz = 0;
        for (const other of this.run.enemies) {
          if (other === e || other.dead) continue;
          const dx = e.model.position.x - other.model.position.x,
            dz = e.model.position.z - other.model.position.z,
            ds = dx * dx + dz * dz;
          if (ds < 0.7 && ds > 0.001) {
            sx += (dx / ds) * 0.22;
            sz += (dz / ds) * 0.22;
          }
        }
        moveSlide(
          e.model.position,
          delta.x * Math.min(speed * dt, length) + sx * dt,
          delta.z * Math.min(speed * dt, length) + sz * dt,
          this.run.world.obstacles,
          ENEMIES[e.type].radius || 0.36,
        );
      }
      e.model.rotation.y = Math.atan2(
        prey.x - e.model.position.x,
        prey.z - e.model.position.z,
      );
      e.attacking = d < 1.65;
      const moved = Math.hypot(
        e.model.position.x - beforeX,
        e.model.position.z - beforeZ,
      );
      e.speed = T.MathUtils.damp(e.speed || 0, dt > 0 ? moved / dt : 0, 8, dt);
      animateZombie(
        e.model,
        this.run.time + e.seed,
        e.speed / 1.65,
        e.attacking,
        Math.min(0.16, e.stagger),
      );
      if (d < 1.65 && !blocked && e.attack <= 0) {
        if (preyLocal) this.commands.hurt(ENEMIES[e.type].damage);
        else
          this.run.session.send(focus.id, {
            k: "damage",
            amount: ENEMIES[e.type].damage,
          });
        e.attack = ENEMIES[e.type].attackInterval;
      }
      ENEMY_BEHAVIORS[ENEMIES[e.type].behavior]({
        enemy: e,
        distance: d,
        blocked,
        target: prey,
        local: preyLocal,
        run: this.run,
        view: this.view,
      });
      updateEnemyVisibility(e, this.run.time, dLocal);
    }
    const gone = this.run.enemies.filter((e) => e.dead && e.deathTime <= 0);
    for (const e of gone) {
      this.view.scene.remove(e.model);
      releaseZombie(e.model);
    }
    this.run.enemies = this.run.enemies.filter((e) => !gone.includes(e));
  }
}
