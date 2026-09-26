import { ENEMY_BEHAVIORS } from "./enemy-behaviors.js";
import {
  animateDeath,
  corpseBlood,
  emergenceDirt,
  updateEnemyVisibility,
} from "./enemy-presentation.js";
import { zombieModel, animateZombie } from "../creatures.js";
import * as T from "three";
import { setSurfaceQuality } from "../surfaces.js";
import { releaseZombie, setZombieDetail } from "../creatures.js";
import {
  EMERGE_DEPTH,
  enemyActionDuration,
  enemyActionPresentation,
  enemySpeed,
  enemyVariation,
  riseRate,
  turnEnemyYaw,
  updateEnemyAction,
} from "./enemy-actions.js";

import { ENEMIES } from "../config.js";
import { moveSlide, enemyType } from "../logic.js";
import {
  LEAP,
  hordeCanLeap,
  hordeGait,
  hordeRandom,
} from "../content/horde.js";
import { CRAWL_REACH, crawlSpeed } from "./crawlers.js";
import {
  VAULT,
  canVault,
  shortcutOver,
  vaultCrossing,
  vaultHeight,
  vaultPhase,
  vaultWorld,
} from "./vaulting.js";
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
        this.run.mapGameplay?.spawnAnchors() || this.run.world.spawnPoints,
        this.run.player.position,
        Math.random,
        this.run.enemies.filter((e) => !e.dead).map((e) => e.model.position),
      );
      if (!candidate) return false;
      // Always spawn at the validated position. The old fallback used the
      // authored anchor even when it overlapped a column or scenery collider.
      pos = new T.Vector3(candidate.x, 0, candidate.z);
    }
    const id = this.run.nextEnemyId++;
    const variation = enemyVariation(id);
    const model = zombieModel(
      type,
      this.run.touch || this.run.settings.quality === "low" ? "lite" : "full",
      id,
    );
    setSurfaceQuality(model, this.run.settings.quality);
    model.position.copy(pos);
    model.position.y = model.userData.horde ? -EMERGE_DEPTH : -1.9;
    const gait = hordeGait(type, id, this.run.wave);
    model.rotation.y = Math.atan2(
      this.run.player.position.x - pos.x,
      this.run.player.position.z - pos.z,
    );
    this.view.scene.add(model);
    const health =
      ENEMIES[type].health *
      (1 + (this.run.wave - 1) * 0.15) *
      this.run.difficulty.health;
    this.run.enemies.push({
      id,
      model,
      type,
      health,
      maxHealth: health,
      attacking: false,
      attack: 1.5,
      stagger: 0,
      age: 0,
      seed: variation * 12,
      targetYaw: model.rotation.y,
      action: null,
      staggerUntil: 0,
      dead: false,
      spit: 2 + Math.random() * 3,
      speedFactor: gait.factor,
      gait: gait.gait,
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
        corpseBlood(e, this.view);
        continue;
      }
      e.model.position.y = Math.min(
        0,
        e.model.position.y + dt * riseRate(e.model),
      );
      emergenceDirt(e, this.view);
      if (e.model.position.y < -0.2) {
        // Bodies climbing out of the ground animate while rising.
        if (e.model.userData.horde)
          animateZombie(e.model, this.run.time + e.seed, 0, false, 0, {
            ...(e.motion ||= {}),
            dt,
            velocityX: 0,
            velocityZ: 0,
            action: "none",
            clock: this.run.time,
            isGrounded: false,
            targetYaw: e.model.rotation.y,
            expectedSpeed: enemySpeed(e, this.run.wave),
          });
        continue;
      }
      e.stagger -= dt;
      e.staggerUntil = Math.max(e.staggerUntil || 0, this.run.time + e.stagger);
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
      let focus = this.run.session
        ? this.run.session.nearest(e.model.position)
        : null;
      focus = this.run.mapGameplay?.enemyFocus(e, focus) || focus;
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
      const navigation = focus?.bait
        ? focus.navigation
        : focus && !focus.local
          ? this.run.session.field(focus.id, large)
          : large
            ? this.run.largeNavigation
            : this.run.navigation;
      target = navigation.direction(
        e.model.position.x,
        e.model.position.z,
        prey,
      );
      // Near the prey, low obstacles in the way are climbed over.
      const radius = ENEMIES[e.type].radius || 0.36;
      const solid = vaultWorld(this.run.world);
      const vaulter = canVault(e);
      const crossing = vaulter
        ? vaultCrossing(
            e.model.position.x,
            e.model.position.z,
            this.run.world.obstacles,
          )
        : null;
      // Straight on for a moment after landing: the flow field still sees
      // the body at the obstacle's edge.
      const landed = this.run.time < (e.vaultedUntil || 0);
      const overLow =
        !!crossing ||
        landed ||
        (vaulter &&
          blocked &&
          shortcutOver(
            e.model.position,
            prey,
            this.run.world.obstacles,
            solid,
            radius,
          ));
      const goal = overLow ? prey : target;
      const delta = dir.set(
        goal.x - e.model.position.x,
        0,
        goal.z - e.model.position.z,
      );
      const length = delta.length();
      if (length > 0.001) delta.divideScalar(length);
      const falling = this.run.time < (e.crawlFall || 0);
      const speed =
        (e.crawler
          ? crawlSpeed(e, this.run.wave, this.run.time)
          : enemySpeed(e, this.run.wave)) * (e.stagger > 0 ? 0.2 : 1);
      const beforeX = e.model.position.x,
        beforeZ = e.model.position.z;
      // Arm's length from the prey: bodies stop there and spread around it
      // instead of stacking into the survivor (and through the camera).
      const stop = e.crawler ? 0.45 + radius : 0.8 + radius;
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
      // A pounce carries the body at the prey between its coil and contact.
      const leapAction =
        e.action?.leap &&
        this.run.time <
          e.action.startTime + enemyActionDuration("melee", e.type)
          ? e.action
          : null;
      if (leapAction) {
        const duration = enemyActionDuration("melee", e.type);
        const phase = (this.run.time - leapAction.startTime) / duration;
        const gap = d - LEAP.reach;
        if (phase > LEAP.from && phase < LEAP.to && gap > 0) {
          const left = Math.max(dt, (LEAP.to - phase) * duration);
          const step = Math.min(gap, (gap * dt) / left);
          const ax = prey.x - e.model.position.x,
            az = prey.z - e.model.position.z,
            al = Math.hypot(ax, az) || 1;
          moveSlide(
            e.model.position,
            (ax / al) * step,
            (az / al) * step,
            this.run.world.obstacles,
            radius,
          );
        }
      }
      const approach =
        !leapAction && (d > stop || blocked || crossing)
          ? Math.min(speed * dt, length)
          : 0;
      if (approach > 0 || sx || sz)
        moveSlide(
          e.model.position,
          delta.x * approach + sx * dt,
          delta.z * approach + sz * dt,
          overLow ? solid : this.run.world.obstacles,
          radius,
        );
      // A blast throws the body back; the push dies out within a second.
      if (e.knock) {
        moveSlide(
          e.model.position,
          e.knock.x * dt,
          e.knock.z * dt,
          this.run.world.obstacles,
          radius,
        );
        const decay = Math.exp(-5 * dt);
        e.knock.x *= decay;
        e.knock.z *= decay;
        if (Math.hypot(e.knock.x, e.knock.z) < 0.05) e.knock = null;
      }
      // The crowd never shoves a body inside the prey's reach circle.
      const gx = e.model.position.x - prey.x,
        gz = e.model.position.z - prey.z,
        gap = Math.hypot(gx, gz),
        minimum = stop - 0.12;
      if (!blocked && gap < minimum && gap > 1e-4)
        moveSlide(
          e.model.position,
          (gx / gap) * (minimum - gap),
          (gz / gap) * (minimum - gap),
          this.run.world.obstacles,
          radius,
        );
      // Over a low obstacle the body rises and falls with the crossing.
      const over = vaulter
        ? vaultCrossing(
            e.model.position.x,
            e.model.position.z,
            this.run.world.obstacles,
          )
        : null;
      e.model.position.y = vaultHeight(over);
      if (over) e.vaultedUntil = this.run.time + VAULT.settle;
      e.targetYaw = Math.atan2(
        prey.x - e.model.position.x,
        prey.z - e.model.position.z,
      );
      const moved = Math.hypot(
        e.model.position.x - beforeX,
        e.model.position.z - beforeZ,
      );
      e.speed = T.MathUtils.damp(e.speed || 0, dt > 0 ? moved / dt : 0, 8, dt);
      e.velocityX = dt > 0 ? (e.model.position.x - beforeX) / dt : 0;
      e.velocityZ = dt > 0 ? (e.model.position.z - beforeZ) / dt : 0;
      const previousYaw = e.model.rotation.y;
      e.model.rotation.y = turnEnemyYaw(
        previousYaw,
        moved > 0.0001 ? Math.atan2(e.velocityX, e.velocityZ) : e.targetYaw,
        dt,
        e.type,
      );
      e.turnRate = dt > 0 ? (e.model.rotation.y - previousYaw) / dt : 0;
      const inMeleeRange =
        d < (e.crawler ? CRAWL_REACH : 1.65) && !blocked && !falling && !over;
      // Sprinters facing their prey a few metres away may pounce instead.
      const facingPrey =
        Math.abs(
          Math.atan2(
            Math.sin(e.targetYaw - e.model.rotation.y),
            Math.cos(e.targetYaw - e.model.rotation.y),
          ),
        ) < 0.6;
      const leapReady =
        !inMeleeRange &&
        !blocked &&
        !e.crawler &&
        facingPrey &&
        d >= LEAP.near &&
        d <= LEAP.far &&
        hordeCanLeap(e.type, this.run.wave) &&
        hordeRandom(e.id, 900 + (e.action?.sequence || 0)) < LEAP.chance;
      const contact = updateEnemyAction(e, this.run.time, {
        melee: !focus?.bait && (inMeleeRange || leapReady),
        leap: !focus?.bait && leapReady,
        spit:
          !focus?.bait &&
          ENEMIES[e.type].behavior === "spitter" &&
          d > 3 &&
          d < 17 &&
          !blocked,
      });
      const motion = enemyActionPresentation(
        e.action,
        this.run.time,
        e.type,
        e.id,
        (e.motion ||= {}),
      );
      motion.dt = dt;
      motion.velocityX = e.velocityX;
      motion.velocityZ = e.velocityZ;
      motion.targetYaw = e.targetYaw;
      motion.turnRate = e.turnRate;
      motion.clock = this.run.time;
      motion.isGrounded = e.model.position.y >= -0.001;
      motion.expectedSpeed = enemySpeed(e, this.run.wave);
      motion.viewer = this.view?.camera?.position;
      motion.vault = vaultPhase(over, e.velocityX, e.velocityZ);
      e.attacking = motion.action !== "none";
      animateZombie(
        e.model,
        this.run.time + e.seed,
        e.speed / 1.65,
        e.attacking,
        Math.min(0.16, e.stagger),
        motion,
      );
      if (contact === "melee" && !focus?.bait) {
        // A committed swing may miss if its target moves away or behind cover.
        const facing =
          Math.abs(
            Math.atan2(
              Math.sin(e.targetYaw - e.model.rotation.y),
              Math.cos(e.targetYaw - e.model.rotation.y),
            ),
          ) <=
          (Math.PI * 4) / 9;
        // Range at contact: a pounce has just closed the gap.
        const reach = Math.hypot(
          e.model.position.x - prey.x,
          e.model.position.z - prey.z,
        );
        if (
          reach < (e.crawler ? CRAWL_REACH : 1.65) &&
          !blocked &&
          !falling &&
          facing
        ) {
          // Crawlers claw at the legs: less reach, less damage.
          const damage = Math.round(
            ENEMIES[e.type].damage * (e.crawler ? 0.7 : 1),
          );
          if (preyLocal) this.commands.hurt(damage, e.model.position);
          else
            this.run.session.send(focus.id, {
              k: "damage",
              amount: damage,
              time: +this.run.time.toFixed(3),
              // The relay stamps `from` with the sender: the zombie travels apart.
              src: e.id,
            });
        }
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
        contact: focus?.bait ? null : contact,
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
