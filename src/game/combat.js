import { weaponModel } from "../weapons.js";
import * as T from "three";
import { setSurfaceQuality } from "../surfaces.js";
import { destroyZombieHead } from "../creatures.js";
import {
  updateEnemyHitVolumes,
  enemyImpactPosition,
} from "./enemy-hitboxes.js";
import { enemyVariation } from "./enemy-actions.js";

import { glowSprite, mat } from "../assets.js";
import { WEAPONS, ENEMIES } from "../config.js";
import { clamp, magazine, damageMultiplier, moveSlide } from "../logic.js";
const vec = new T.Vector3(),
  dir = new T.Vector3(),
  point = new T.Vector3(),
  ray = new T.Ray(),
  aabb = new T.Box3();
const MELEE_DURATION = 0.78;

/** combat owns its rules; commands are the explicit cross-system operations. */
export class CombatSystem {
  constructor(
    { run, view, input, sound, emit },
    { updateHUD, burst, tracer, drop, announce, hurt },
  ) {
    Object.assign(this, { run, view, input, sound, emit });
    this.commands = { updateHUD, burst, tracer, drop, announce, hurt };
  }
  setGun() {
    if (this.view.gun) this.view.viewScene.remove(this.view.gun);
    // Building a first-person weapon generates hundreds of geometries and
    // several canvases. Keep every model of the session so a switch or a
    // transfiguration never stalls a frame mid-fight.
    const key = `${this.run.weapons[this.run.slot].id}-${this.run.weapons[this.run.slot].level ? 1 : 0}`;
    if (!this.view.gunCache.has(key))
      this.view.gunCache.set(
        key,
        weaponModel(
          this.run.weapons[this.run.slot].id,
          this.run.weapons[this.run.slot].level,
          true,
        ),
      );
    this.view.gun = this.view.gunCache.get(key);
    this.view.gun.userData.flash.visible = false;
    setSurfaceQuality(this.view.gun, this.run.settings.quality);
    this.view.gun.scale.setScalar(this.run.touch ? 0.68 : 0.78);
    this.view.gun.position.set(
      this.run.touch ? 0.18 : 0.24,
      -0.24,
      this.run.touch ? -0.63 : -0.62,
    );
    this.view.viewScene.add(this.view.gun);
    this.run.reloadTime = 0;
    this.emit("weapon", this.run.weapons[this.run.slot]);
  }
  switchWeapon(slot) {
    if (
      this.run.meleeTimer > 0 ||
      slot === this.run.slot ||
      !this.run.weapons[slot]
    )
      return;
    this.run.slot = slot;
    this.setGun();
    this.run.shotTimer = 0.25;
    this.sound.click();
    this.commands.updateHUD();
  }
  reload() {
    if (
      this.run.state !== "playing" ||
      this.run.downed ||
      this.run.meleeTimer > 0 ||
      this.run.reloadTime > 0 ||
      this.run.weapons[this.run.slot].ammo >=
        magazine(this.run.weapons[this.run.slot]) ||
      this.run.weapons[this.run.slot].reserve <= 0
    )
      return;
    this.run.reloadDuration =
      WEAPONS[this.run.weapons[this.run.slot].id].reload *
      (this.run.player.perks.includes("speed") ? 0.65 : 1);
    this.run.reloadTime = this.run.reloadDuration;
    this.sound.reload(this.run.reloadDuration);
    this.commands.updateHUD();
  }
  obstacleDistance(origin, direction, max = 100, details = null) {
    ray.set(origin, direction);
    let nearest = max;
    for (const o of this.run.world.obstacles) {
      if (o.active === false) continue;
      aabb.min.set(o.x - o.w / 2, 0, o.z - o.d / 2);
      aabb.max.set(o.x + o.w / 2, o.h, o.z + o.d / 2);
      const hit = ray.intersectBox(aabb, point);
      if (hit) {
        const distance = origin.distanceTo(hit);
        if (distance < nearest) {
          nearest = distance;
          if (details) {
            details.obstacle = o;
            const dx = Math.abs(Math.abs(hit.x - o.x) - o.w / 2),
              dz = Math.abs(Math.abs(hit.z - o.z) - o.d / 2),
              dy = Math.abs(hit.y - o.h);
            details.normal =
              dy < dx && dy < dz
                ? new T.Vector3(0, 1, 0)
                : dx < dz
                  ? new T.Vector3(Math.sign(hit.x - o.x), 0, 0)
                  : new T.Vector3(0, 0, Math.sign(hit.z - o.z));
          }
        }
      }
    }
    return nearest;
  }
  shoot() {
    if (
      this.run.state !== "playing" ||
      this.run.downed ||
      this.run.reloadTime > 0 ||
      this.run.shotTimer > 0 ||
      this.run.meleeTimer > 0
    )
      return;
    const w = this.run.weapons[this.run.slot],
      d = WEAPONS[this.run.weapons[this.run.slot].id];
    if (w.ammo <= 0) {
      this.reload();
      if (w.reserve === 0 && this.run.shotTimer <= 0) {
        this.sound.click();
        this.run.shotTimer = 0.3;
        this.emit("toast", {
          title: "Munitions épuisées",
          text: this.run.touch
            ? "Utilise le couteau ou rejoins le ravitaillement."
            : "Passez au couteau [V] ou rejoignez le ravitaillement.",
        });
      }
      return;
    }
    w.ammo--;
    this.run.player.shots++;
    const steady = this.run.player.perks.includes("rate");
    this.run.shotTimer = d.rate * (steady ? 0.8 : 1);
    this.run.recoil = Math.min(
      0.22,
      this.run.recoil + d.recoil * (steady ? 0.68 : 1),
    );
    this.sound.shot(d);
    this.view.gun.userData.flash.visible = true;
    this.view.gun.userData.cycle = 1;
    this.view.gun.userData.flash.rotation.z = Math.random() * Math.PI * 2;
    this.run.flashTimer = 0.05;
    this.view.flash.intensity = 12;
    this.view.flash.position
      .copy(this.run.player.position)
      .add(this.view.camera.getWorldDirection(dir).multiplyScalar(0.7));
    const ejection = this.view.camera.position
      .clone()
      .add(
        new T.Vector3(0.18, -0.17, -0.35).applyQuaternion(
          this.view.camera.quaternion,
        ),
      );
    if (!d.energy)
      this.view.combatEffects.casing(ejection, this.view.camera.quaternion);
    this.view.combatEffects.puff(
      this.view.camera.position
        .clone()
        .add(
          new T.Vector3(0.12, -0.12, -0.75).applyQuaternion(
            this.view.camera.quaternion,
          ),
        ),
    );
    const aimed = this.input.mouse.aim;
    const spread =
      d.spread *
      (aimed ? 0.3 : 1) *
      (this.run.player.perks.includes("focus") ? 0.55 : 1);
    let shotHit = false;
    for (const e of this.run.enemies)
      if (!e.dead) updateEnemyHitVolumes(e.model);
    for (let pellet = 0; pellet < d.pellets; pellet++) {
      const direction = new T.Vector3(0, 0, -1).applyQuaternion(
        this.view.camera.quaternion,
      );
      direction.x += (Math.random() - 0.5) * spread;
      direction.y += (Math.random() - 0.5) * spread;
      direction.normalize();
      const origin = this.view.camera.position.clone();
      const impact = {};
      let distance = this.obstacleDistance(origin, direction, 90, impact),
        target = null,
        head = false;
      if (direction.y < -0.001) {
        const ground = -origin.y / direction.y;
        if (ground < distance) {
          distance = ground;
          impact.normal = new T.Vector3(0, 1, 0);
        }
      }
      ray.set(origin, direction);
      for (const e of this.run.enemies) {
        if (e.dead) continue;
        for (const part of e.model.userData.hitVolumes) {
          const hit = ray.intersectSphere(part.sphere, point);
          if (hit) {
            const dist = origin.distanceTo(hit);
            if (dist < distance) {
              distance = dist;
              target = e;
              head = part.head;
            }
          }
        }
      }
      const end = origin.clone().addScaledVector(direction, distance);
      if (target) {
        const damage =
          d.damage *
          damageMultiplier(w.level) *
          (head ? (this.run.player.perks.includes("focus") ? 3.2 : 2.35) : 1) *
          (this.run.powerups.insta > this.run.time ? 100 : 1);
        this.damageEnemy(target, damage, head, { position: end, direction });
        shotHit = true;
        this.emit("hit", { head });
        this.sound.hit(head);
        if (d.splash) {
          this.commands.burst(end, 0x67ffdf, 16, 0.8);
          for (const e of this.run.enemies)
            if (
              e !== target &&
              !e.dead &&
              e.model.position.distanceTo(end) < d.splash.radius
            )
              this.damageEnemy(e, damage * d.splash.multiplier, false);
        }
      } else if (distance < 90) {
        this.commands.burst(end, d.energy ? 0x61ffdf : 0xdbb58b, 4, 0.3);
        this.view.combatEffects.impact(
          end,
          impact.normal,
          d.energy ? 0.4 : 0.16 + Math.random() * 0.08,
        );
        if (pellet === 0) this.view.combatEffects.puff(end);
      }
      if (pellet === 0 || d.energy)
        this.commands.tracer(
          origin
            .clone()
            .add(
              new T.Vector3(0.16, -0.16, 0).applyQuaternion(
                this.view.camera.quaternion,
              ),
            ),
          end,
          d.energy ? 0x6dffe7 : 0xffd4a0,
          d.energy ? 0.065 : 0.024,
        );
    }
    if (shotHit) this.run.player.hits++;
    this.commands.updateHUD();
  }
  damageEnemy(enemy, damage, head, hit = null, by = null) {
    if (enemy.dead) return;
    const reaction = (enemy.model.userData.hitReaction ||= { serial: 0 });
    reaction.serial++;
    reaction.head = head;
    reaction.strength = clamp(damage / 65, 0.35, 1);
    reaction.side = hit?.direction
      ? clamp(
          hit.direction.x * Math.cos(enemy.model.rotation.y) -
            hit.direction.z * Math.sin(enemy.model.rotation.y),
          -1,
          1,
        )
      : (enemy.model.userData.variation || 0.5) * 2 - 1;
    if (this.run.session?.peer) {
      // The host owns enemy health: show the impact now, let it decide.
      enemy.stagger = 0.16;
      const position =
        hit?.position?.clone() ||
        enemyImpactPosition(enemy.model, head, new T.Vector3());
      const direction =
        hit?.direction ||
        position.clone().sub(this.view.camera.position).normalize();
      this.view.combatEffects.blood.hit(position, direction, false);
      this.projectBlood(position, direction, false);
      this.run.session.sendHit(enemy, damage, head, hit);
      return;
    }
    enemy.health -= damage;
    enemy.stagger = 0.16;
    const headKill = head && enemy.health <= 0;
    // Shotgun pellets still deal their own damage, but share one body spray in
    // a short interval. A lethal headshot always gets its complete effect.
    if (headKill || this.run.time >= (enemy.nextBloodFx || 0)) {
      const position =
        hit?.position?.clone() ||
        enemyImpactPosition(enemy.model, head, new T.Vector3());
      const direction =
        hit?.direction ||
        position.clone().sub(this.view.camera.position).normalize();
      if (headKill) destroyZombieHead(enemy.model, position);
      this.view.combatEffects.blood.hit(position, direction, headKill);
      this.projectBlood(position, direction, headKill);
      // Impacts sit where the creature stands relative to the view.
      const rx = Math.cos(this.input.yaw),
        rz = -Math.sin(this.input.yaw);
      this.sound.flesh(
        headKill,
        clamp(
          ((enemy.model.position.x - this.view.camera.position.x) * rx +
            (enemy.model.position.z - this.view.camera.position.z) * rz) /
            9,
          -1,
          1,
        ),
      );
      enemy.nextBloodFx = this.run.time + 0.055;
    }
    const push = new T.Vector3(
      enemy.model.position.x - this.run.player.position.x,
      0,
      enemy.model.position.z - this.run.player.position.z,
    )
      .normalize()
      .multiplyScalar(0.035);
    moveSlide(
      enemy.model.position,
      push.x,
      push.z,
      this.run.world.obstacles,
      ENEMIES[enemy.type].radius || 0.36,
    );
    if (enemy.health <= 0) {
      enemy.dead = true;
      enemy.deathTime = 2.4;
      enemy.fallSide = enemyVariation(enemy.id) < 0.5 ? -1 : 1;
      const base = ENEMIES[enemy.type].score + (head ? 50 : 0);
      let points = base;
      if (by !== null && this.run.session) {
        // A teammate landed the kill: the reward travels to them.
        this.run.session.send(by, {
          k: "score",
          points: base,
          head,
          type: enemy.type,
        });
      } else points = this.creditKill(base, head, enemy.type);
      if (Math.random() < 0.17) this.commands.drop(enemy.model.position);
      if (ENEMIES[enemy.type].boss) {
        this.commands.drop(enemy.model.position, "ammo");
        this.commands.drop(
          enemy.model.position,
          Math.random() < 0.5 ? "insta" : "double",
        );
        this.run.player.grenades = Math.min(5, this.run.player.grenades + 2);
        this.sound.wave();
        this.commands.announce({
          eyebrow: `+${points} ESSENCES · +2 GRENADES`,
          title: "L’ARCHONTE EST TOMBÉ",
          subtitle: "Ses reliques sont à vous. La horde n’a pas fini.",
          duration: 3500,
        });
        if (this.run.session)
          for (const p of this.run.session.players.values())
            this.run.session.send(p.id, {
              k: "reward",
              reward: 0,
              grenades: 2,
            });
      } else if (ENEMIES[enemy.type].ammoDrop) {
        this.commands.drop(enemy.model.position, "ammo");
        this.emit("toast", {
          title: "Pénitent abattu",
          text: "+300 essences · Munitions récupérables",
        });
      }
    }
  }
  creditKill(base, head, type) {
    const points = base * (this.run.powerups.double > this.run.time ? 2 : 1);
    this.run.player.kills++;
    if (head) this.run.player.headshots++;
    this.run.player.points += points;
    this.emit("score", { points, head, type });
    return points;
  }
  projectBlood(position, direction, headKill) {
    const origin = position.clone().addScaledVector(direction, 0.06),
      range = headKill ? 4 : 2.2,
      hit = {};
    let distance = this.obstacleDistance(origin, direction, range, hit),
      size = headKill ? 0.85 : 0.42;
    if (direction.y < -0.001) {
      const floor = -origin.y / direction.y;
      if (floor >= 0 && floor < distance) {
        distance = floor;
        hit.normal = new T.Vector3(0, 1, 0);
        hit.obstacle = null;
      }
    }
    if (!hit.normal || distance >= range) return;
    const point = origin.addScaledVector(direction, distance),
      o = hit.obstacle;
    if (o) {
      // Navigation boundaries and the broad colliders around machinery do
      // not necessarily coincide with a rendered surface.
      if (!o.bloodSurface) return;
      const { minY, maxY } = o.bloodSurface;
      if (Math.abs(hit.normal.y) > 0.5 && Math.abs(point.y - maxY) > 0.025)
        return;
      // Keep the full quad on the struck face, never hanging over a narrow
      // pillar, tabletop or crate edge. World collision boxes supply the face.
      const edgeX = o.w / 2 - Math.abs(point.x - o.x),
        edgeZ = o.d / 2 - Math.abs(point.z - o.z),
        edgeY = Math.min(point.y - minY, maxY - point.y),
        edge =
          hit.normal.y > 0.5
            ? Math.min(edgeX, edgeZ)
            : Math.abs(hit.normal.x) > 0.5
              ? Math.min(edgeZ, edgeY)
              : Math.min(edgeX, edgeY);
      size = Math.min(size, Math.max(0, edge * 1.35));
    }
    if (size > 0.08)
      this.view.combatEffects.blood.stain(point, hit.normal, size);
  }
  melee() {
    if (
      this.run.meleeTimer > 0 ||
      this.run.state !== "playing" ||
      this.run.downed
    )
      return;
    this.run.meleeTimer = MELEE_DURATION;
    this.run.meleePending = true;
    this.run.meleeSwing = true;
    this.run.reloadTime = 0;
    this.input.mouse.aim = false;
    this.view.knife.visible = true;
    this.sound.melee();
    this.commands.updateHUD();
  }
  meleeContact() {
    this.view.camera.getWorldDirection(dir);
    dir.y = 0;
    dir.normalize();
    let target = null,
      dist = 2.35;
    for (const e of this.run.enemies) {
      if (e.dead) continue;
      vec.copy(e.model.position).sub(this.run.player.position);
      vec.y = 0;
      const d = vec.length();
      if (
        d < dist &&
        vec.normalize().dot(dir) > 0.4 &&
        Math.abs(this.view.camera.position.y - 1.15 * ENEMIES[e.type].scale) <
          1.8
      ) {
        const contact = e.model.position.clone();
        contact.y += 1.15 * ENEMIES[e.type].scale;
        const direction = contact.clone().sub(this.view.camera.position);
        const reach = direction.length();
        direction.normalize();
        if (
          this.obstacleDistance(this.view.camera.position, direction, reach) >=
          reach - 0.05
        ) {
          target = e;
          dist = d;
        }
      }
    }
    if (target) {
      this.damageEnemy(target, 145 + this.run.wave * 7, false);
      this.sound.knifeImpact();
      this.run.knifeImpactTime = 0.09;
      this.emit("hit", { head: false });
    } else {
      this.view.camera.getWorldDirection(dir);
      const wall = this.obstacleDistance(this.view.camera.position, dir, 1.7);
      if (wall < 1.7) {
        this.commands.burst(
          this.view.camera.position.clone().addScaledVector(dir, wall - 0.025),
          0xf3c18a,
          8,
          0.22,
        );
        this.sound.knifeImpact(true);
        this.run.knifeImpactTime = 0.07;
      }
    }
  }
  grenade() {
    if (
      this.run.meleeTimer > 0 ||
      this.run.player.grenades <= 0 ||
      this.run.state !== "playing" ||
      this.run.downed
    )
      return;
    this.run.player.grenades--;
    const velocity = this.view.camera
      .getWorldDirection(new T.Vector3())
      .multiplyScalar(12);
    velocity.y += 4;
    if (this.run.session?.peer)
      this.run.session.toHost({
        k: "grenade",
        x: this.view.camera.position.x,
        y: this.view.camera.position.y,
        z: this.view.camera.position.z,
        vx: velocity.x,
        vy: velocity.y,
        vz: velocity.z,
      });
    else this.throwGrenade(this.view.camera.position, velocity, null);
    this.sound.melee();
    this.commands.updateHUD();
  }
  throwGrenade(position, velocity, owner = null) {
    const model = new T.Mesh(
      new T.SphereGeometry(0.09, 8, 6),
      mat(0x4c6257, 0.65, 0.7),
    );
    model.position.copy(position);
    this.view.scene.add(model);
    this.run.projectiles.push({
      id: this.run.nextProjectileId++,
      mesh: model,
      velocity: velocity.clone(),
      life: 1.65,
      type: "grenade",
      owner,
    });
  }
  explosionEffects(position, remote = false) {
    this.sound.explosion();
    this.commands.burst(position, 0xffa45a, 48, 1.6);
    const s = glowSprite(0xffbc76, 10);
    s.position.copy(position);
    this.view.scene.add(s);
    this.run.effects.push({ mesh: s, life: 0.45, max: 0.45, type: "flash" });
    if (this.run.player.position.distanceTo(position) < 8)
      this.run.recoil = 0.16;
    if (remote) {
      const d = this.run.player.position.distanceTo(position);
      if (d < 3.2) this.commands.hurt(40 * (1 - d / 3.2));
    }
  }
  explode(position, owner = null) {
    this.explosionEffects(position);
    for (const e of this.run.enemies) {
      if (e.dead) continue;
      const d = e.model.position.distanceTo(position);
      if (d < 6) {
        vec
          .copy(e.model.position)
          .add(new T.Vector3(0, 1, 0))
          .sub(position);
        const len = vec.length();
        if (this.obstacleDistance(position, vec.normalize(), len) >= len - 0.2)
          this.damageEnemy(e, 540 * (1 - d / 7), false, null, owner);
      }
    }
    const d = this.run.player.position.distanceTo(position);
    if (d < 3.2) this.commands.hurt(40 * (1 - d / 3.2));
    if (this.run.session?.host)
      this.run.session.broadcast({
        k: "explode",
        x: position.x,
        y: position.y,
        z: position.z,
      });
  }
  updateKnife() {
    const progress = MELEE_DURATION - this.run.meleeTimer;
    this.view.knife.visible = this.run.meleeTimer > 0;
    this.view.knifeTrail.visible = this.view.knife.visible;
    if (!this.view.knife.visible) return;
    const frames = [
      [0, 0.34, -0.8, -0.5, 0.25, -0.5, -0.9],
      [0.16, 0.17, -0.23, -0.8, -0.15, -0.2, -0.7],
      [0.25, 0.21, -0.17, -0.8, -0.1, -0.25, -0.9],
      [0.34, -0.09, -0.17, -0.83, -0.2, 0.15, 0.65],
      [0.44, -0.3, -0.32, -0.65, 0.12, 0.4, 1.3],
      [0.58, -0.08, -0.43, -0.57, 0.22, 0.2, 0.5],
      [MELEE_DURATION, 0.25, -0.9, -0.48, 0.2, 0, -0.4],
    ];
    let index = 0;
    while (index < frames.length - 2 && progress > frames[index + 1][0])
      index++;
    const a = frames[index],
      b = frames[index + 1];
    let blend = clamp((progress - a[0]) / (b[0] - a[0]), 0, 1);
    blend = blend * blend * (3 - 2 * blend);
    const pose = a.slice(1).map((v, i) => T.MathUtils.lerp(v, b[i + 1], blend));
    const mobileScale = Math.min(1, Math.max(0.6, this.view.viewCamera.aspect));
    this.view.knife.scale.setScalar(0.72 * mobileScale);
    this.view.knife.position.set(
      pose[0] * mobileScale * (this.view.viewCamera.aspect < 1 ? 0.5 : 1),
      pose[1],
      pose[2],
    );
    this.view.knife.rotation.set(pose[3], pose[4], pose[5] * mobileScale);
    this.view.knifeTrail.scale.setScalar(mobileScale);
    this.view.knifeTrail.rotation.z = 0.3 + (progress - 0.25) * 9;
    this.view.knifeTrail.material.opacity =
      progress > 0.26 && progress < 0.39
        ? Math.sin(((progress - 0.26) / 0.13) * Math.PI) * 0.16
        : 0;
  }
}
