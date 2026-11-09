import { weaponModel } from "../weapons.js";
import { RIGS } from "../armory/catalog.js";
import * as T from "three";
import { setSurfaceQuality } from "../surfaces.js";
import { destroyZombieHead } from "../creatures.js";
import { toBindSpace } from "../horde/library.js";
import { addWound } from "../horde/material.js";
import { hordeEvent } from "../horde/voice.js";
import {
  updateEnemyHitVolumes,
  enemyImpactPosition,
} from "./enemy-hitboxes.js";
import { enemyVariation } from "./enemy-actions.js";
import { deathDuration } from "./enemy-presentation.js";
import { maimAfterHit } from "./crawlers.js";
import { aimHeld } from "./input.js";

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
  /**
   * Show the weapon of the current slot. draw: "quick" after a switch,
   * "first" when a weapon is received or transfigured.
   */
  setGun({ draw = null } = {}) {
    const current = this.run.weapons[this.run.slot];
    const vm = this.view.viewModel;
    const camo = current.level || 0;
    this.run.reloadTime = 0;
    vm?.stop();
    if (vm && RIGS[current.id]) {
      if (vm.has(current.id, camo)) {
        if (this.view.gun && !this.view.gun.userData.armory)
          this.view.viewScene.remove(this.view.gun);
        vm.show(current.id, camo);
        this.view.gun = vm.weapon;
        vm.onEvent = (name) => {
          if (name === "eject") this.ejectCasing(!!vm.rig.shellEject);
          this.sound.weaponCue(name, current.id);
        };
        if (draw) {
          vm.draw(draw === "first");
          this.sound.weaponCue("raise", current.id);
        }
        this.emit("weapon", current);
        return;
      }
      // Loading: the procedural model stands in, then the real one is drawn.
      vm.load(current.id, camo)
        .then(() => {
          const now = this.run.weapons?.[this.run.slot];
          if (
            now?.id === current.id &&
            (now.level || 0) === camo &&
            this.run.state !== "menu"
          )
            this.setGun({ draw: "quick" });
        })
        .catch((error) =>
          console.warn(`Weapon model unavailable: ${current.id}`, error),
        );
    }
    vm?.hide();
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
    if (this.run.tonic) return;
    if (
      this.run.meleeTimer > 0 ||
      slot === this.run.slot ||
      !this.run.weapons[slot]
    )
      return;
    this.run.slot = slot;
    // The rules switch at once; the view lowers one weapon and raises the other.
    const vm = this.view.viewModel;
    const next = this.run.weapons[slot];
    if (vm?.weapon && RIGS[next.id] && vm.has(next.id, next.level || 0)) {
      this.run.shotTimer = 0.52;
      this.run.pendingDraw = 0.17;
      vm.holster(0.17);
    } else {
      this.setGun({ draw: "quick" });
      this.run.shotTimer = 0.4;
    }
    this.sound.click();
    this.commands.updateHUD();
  }
  reload() {
    if (this.run.tonic) return;
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
    const w = this.run.weapons[this.run.slot];
    const vm = this.view.gun?.userData.armory ? this.view.viewModel : null;
    const shells = vm?.rig?.shellReload;
    if (shells) {
      this.startShellReload(w, vm, shells);
      return;
    }
    this.run.reloadTime = this.run.reloadDuration;
    const played =
      vm &&
      ((w.ammo === 0 &&
        vm.play("reloadEmpty", this.run.reloadDuration, (cue) =>
          this.sound.weaponCue?.(cue, w.id),
        )) ||
        vm.play("reload", this.run.reloadDuration, (cue) =>
          this.sound.weaponCue?.(cue, w.id),
        ));
    if (!played || !this.sound.armory?.ready)
      this.sound.reload(this.run.reloadDuration);
    this.commands.updateHUD();
  }
  /**
   * Tube-fed loading: one shell per stroke, each one counted as it enters.
   * Firing stops the loading after the shell in hand; an empty gun is
   * pumped at the end.
   */
  startShellReload(w, vm, timing) {
    const scale = this.run.reloadDuration / WEAPONS[w.id].reload;
    const need = Math.min(magazine(w) - w.ammo, w.reserve);
    const t = {
      start: timing.start * scale,
      shell: timing.shell * scale,
      end: timing.end * scale,
    };
    const state = (this.run.shellReload = {
      weapon: w,
      empty: w.ammo === 0,
      left: need,
      stop: false,
      timing: t,
    });
    // The HUD bar spans the whole sequence.
    this.run.reloadDuration =
      t.start + need * t.shell + t.end + (state.empty ? 0.46 : 0);
    this.run.reloadTime = this.run.reloadDuration;
    const cue = (name) => this.sound.weaponCue?.(name, w.id);
    const next = () => {
      if (this.run.shellReload !== state || this.view.viewModel !== vm) return;
      if (
        state.left > 0 &&
        !state.stop &&
        w.reserve > 0 &&
        w.ammo < magazine(w)
      ) {
        vm.play("reloadShell", t.shell, (name) => {
          cue(name);
          if (name === "shell" && w.reserve > 0 && w.ammo < magazine(w)) {
            w.ammo++;
            w.reserve--;
            state.left--;
            this.commands.updateHUD();
          }
        });
        state.timer = t.shell;
        state.phase = "shell";
      } else {
        vm.play("reloadEnd", t.end, cue);
        state.timer = t.end;
        state.phase = "end";
      }
    };
    state.next = next;
    vm.play("reloadStart", t.start, cue);
    state.timer = t.start;
    state.phase = "start";
    if (!this.sound.armory?.ready) this.sound.reload(this.run.reloadDuration);
    this.commands.updateHUD();
  }
  updateShellReload(dt) {
    const state = this.run.shellReload;
    if (!state) return;
    this.run.reloadTime = Math.max(0.001, this.run.reloadTime - dt);
    if (
      this.run.weapons[this.run.slot] !== state.weapon ||
      !this.view.gun?.userData.armory
    ) {
      this.run.shellReload = null;
      this.run.reloadTime = 0;
      return;
    }
    state.timer -= dt;
    if (state.timer > 0) return;
    if (state.phase === "end") {
      this.run.shellReload = null;
      this.run.reloadTime = 0;
      if (state.empty && state.weapon.ammo > 0) {
        // Chambering from an empty gun: nothing to eject.
        this.view.viewModel.play("pump", 0.46, (name) => {
          if (name !== "eject") this.sound.weaponCue?.(name, state.weapon.id);
        });
        this.run.shotTimer = Math.max(this.run.shotTimer, 0.46);
      }
      this.commands.updateHUD();
      return;
    }
    state.next();
  }
  /** A trigger pull during a shell reload finishes the shell in hand. */
  interruptShellReload() {
    const state = this.run.shellReload;
    if (!state || state.stop) return !!state;
    state.stop = true;
    return true;
  }
  /**
   * Where the visible muzzle is in the world: its view-model position is
   * projected with the view-model camera and cast back at the same screen
   * point, so tracers leave the barrel the player sees.
   */
  muzzleWorld(target, depth = 0.55) {
    const vm = this.view.viewModel;
    if (!this.view.gun?.userData.armory || !vm.socket("muzzle", target)) {
      return target
        .copy(this.view.camera.position)
        .add(
          new T.Vector3(0.16, -0.16, 0).applyQuaternion(
            this.view.camera.quaternion,
          ),
        );
    }
    this.view.viewCamera.updateMatrixWorld();
    target.project(this.view.viewCamera);
    target.z = 0.5;
    target.unproject(this.view.camera);
    const ray = target.sub(this.view.camera.position).normalize();
    return ray.multiplyScalar(depth).add(this.view.camera.position);
  }
  /**
   * Recoil pattern: each shot climbs and wanders; the sequence repeats so a
   * burst can be learned and pulled against. Aiming and Main de fer tame it.
   */
  kickRecoil(d, aimed, steady) {
    const p = this.run.player;
    const k = d.kick || { up: d.recoil * 0.2, side: d.recoil * 0.05 };
    const burst =
      this.run.time - (p.lastShot ?? -10) < (d.rate || 0.1) * 1.9
        ? (p.burst || 0) + 1
        : 0;
    p.burst = burst;
    p.lastShot = this.run.time;
    const scale = (steady ? 0.68 : 1) * (aimed ? (k.ads ?? 0.72) : 1);
    const up =
      k.up *
      (1 + Math.min(burst, 10) * (k.climb ?? 0)) *
      (0.9 + Math.random() * 0.2);
    const side = k.pattern
      ? Math.sin(burst * 0.85 + 0.6) * k.side +
        (Math.random() - 0.5) * k.side * 0.4
      : (Math.random() * 2 - 1) * k.side;
    p.recoilPitch = Math.min(0.35, (p.recoilPitch || 0) + up * scale);
    p.recoilYaw = (p.recoilYaw || 0) + side * scale;
  }
  /** A spent case from the ejection port, handed to the world as it falls. */
  ejectCasing(shell = false) {
    const vm = this.view.viewModel;
    const weapon = this.view.gun;
    const port = vm?.socket(
      weapon?.userData.armory?.rig.eject || "eject",
      new T.Vector3(),
    );
    if (!port || !this.view.viewEffects) return;
    const right = new T.Vector3(1, 0.35, 0.25)
      .normalize()
      .applyQuaternion(weapon.quaternion);
    this.view.viewEffects.eject(port, right, weapon.quaternion, shell);
    // The world copy starts below the view, to the right, and lands beside
    // the feet where the player can see brass pile up.
    const yawOnly = new T.Quaternion().setFromAxisAngle(
      new T.Vector3(0, 1, 0),
      this.input.yaw,
    );
    const ejection = this.run.player.position
      .clone()
      .add(new T.Vector3(0.38, -0.75, -0.12).applyQuaternion(yawOnly));
    this.view.combatEffects.casing(ejection, yawOnly, shell);
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
    if (this.run.tonic) return;
    if (this.view.viewModel?.busy === "inspect") this.view.viewModel.stop();
    if (this.run.shellReload && this.run.shellReload.weapon.ammo > 0) {
      this.interruptShellReload();
      return;
    }
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
        if (!this.sound.weaponCue("dryfire", w.id)) this.sound.click();
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
    const aimed = aimHeld(this.input);
    this.run.shotTimer = d.rate * (steady ? 0.8 : 1);
    this.run.recoil = Math.min(
      0.22,
      this.run.recoil + d.recoil * (steady ? 0.68 : 1),
    );
    this.kickRecoil(d, aimed, steady);
    this.sound.shot(d, { level: w.level || 0, aimed: !!this.run.aiming });
    this.run.flashTimer = 0.05;
    this.view.flash.intensity = 12;
    this.view.flash.position
      .copy(this.run.player.position)
      .add(this.view.camera.getWorldDirection(dir).multiplyScalar(0.7));
    const armory = this.view.gun.userData.armory;
    if (armory) {
      const vm = this.view.viewModel;
      vm.fire({ aim: aimed, empty: w.ammo === 0 });
      // Brass leaves the real port; bolt and pump guns eject on their cycle.
      if (!d.energy && !armory.rig.ejectOnCycle) this.ejectCasing();
      const muzzle = vm.socket("muzzle", new T.Vector3());
      if (muzzle) this.view.viewEffects?.shot(muzzle);
      this.view.combatEffects.puff(this.muzzleWorld(new T.Vector3(), 0.9));
    } else {
      this.view.gun.userData.flash.visible = true;
      this.view.gun.userData.cycle = 1;
      this.view.gun.userData.flash.rotation.z = Math.random() * Math.PI * 2;
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
    }
    const p = this.run.player;
    // Hip fire opens with sustained fire and movement; aiming stays tight.
    const bloom = p.bloom || 0,
      moving = this.run.movePenalty || 0;
    const spread =
      (aimed
        ? d.spread * 0.3 * (1 + bloom * 0.3)
        : (d.hipSpread ?? d.spread) * (1 + bloom + moving)) *
      (p.perks.includes("focus") ? 0.55 : 1);
    p.bloom = Math.min(3, bloom + (d.bloom ?? 0.3));
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
      let distance = this.obstacleDistance(origin, direction, 90, impact);
      if (direction.y < -0.001) {
        const ground = -origin.y / direction.y;
        if (ground < distance) {
          distance = ground;
          impact.normal = new T.Vector3(0, 1, 0);
        }
      }
      ray.set(origin, direction);
      // Every body the ray crosses before the wall, nearest first.
      const crossed = [];
      for (const e of this.run.enemies) {
        if (e.dead) continue;
        // Nearest volume of this body; where the head and the torso overlap
        // (neck, hunched shoulders) a ray that reaches the head counts as a
        // headshot.
        let near = Infinity,
          nearest = null,
          headDistance = Infinity;
        for (const part of e.model.userData.hitVolumes) {
          const hit = ray.intersectSphere(part.sphere, point);
          if (!hit) continue;
          const dist = origin.distanceTo(hit);
          if (dist < near) {
            near = dist;
            nearest = part;
          }
          if (part.head) headDistance = dist;
        }
        const headFirst = headDistance < near + 0.22;
        const dist = headFirst ? headDistance : near;
        if (dist < distance)
          crossed.push({
            e,
            dist,
            head: headFirst,
            part: headFirst ? null : nearest?.part,
          });
      }
      crossed.sort((x, y) => x.dist - y.dist);
      // Rifle rounds go through bodies, losing energy in each one.
      const pierce = d.penetration || 0;
      const struck = crossed.slice(0, 1 + pierce);
      const stopped = crossed.length > pierce;
      if (stopped && struck.length) distance = struck[struck.length - 1].dist;
      const end = origin.clone().addScaledVector(direction, distance);
      for (const [n, h] of struck.entries()) {
        const at = origin.clone().addScaledVector(direction, h.dist);
        const [near, far, floor] = d.falloff || [1e9, 1e9, 1];
        const range =
          h.dist <= near
            ? 1
            : h.dist >= far
              ? floor
              : 1 - ((h.dist - near) / (far - near)) * (1 - floor);
        const damage =
          d.damage *
          damageMultiplier(w.level) *
          range *
          0.62 ** n *
          (h.head
            ? this.run.player.perks.includes("focus")
              ? 3.2
              : 2.35
            : 1) *
          (this.run.powerups.insta > this.run.time ? 100 : 1);
        this.damageEnemy(h.e, damage, h.head, {
          position: at,
          direction,
          leg: !!h.part?.leg,
          arm: h.part?.arm,
          lower: !!h.part?.lower,
        });
        if (n === 0) {
          shotHit = true;
          this.emit("hit", {
            head: h.head,
            kill: h.e.dead,
            pierced: struck.length - 1,
          });
          this.sound.hit(h.head);
          if (d.splash) {
            this.commands.burst(at, 0x67ffdf, 16, 0.8);
            for (const e of this.run.enemies)
              if (
                e !== h.e &&
                !e.dead &&
                e.model.position.distanceTo(at) < d.splash.radius
              )
                this.damageEnemy(e, damage * d.splash.multiplier, false);
          }
        }
      }
      if (!stopped && distance < 90) {
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
          this.muzzleWorld(new T.Vector3()),
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
    // Heavy blows (shotgun, knife, explosions) break the stride.
    const blast = !hit || !!hit.explosive;
    // A teammate's round only carries its impact point: find the limb.
    if (hit?.position && hit.leg === undefined) {
      const part = this.struckPart(enemy, hit.position);
      hit.leg = !!part?.leg;
      hit.arm = part?.arm;
      hit.lower = !!part?.lower;
    }
    // The struck limb jerks on its own (see horde/animator.js).
    reaction.arm = hit?.arm || null;
    // A heavy round in a leg makes the body stumble.
    reaction.heavy =
      damage >= 95 || (blast && damage >= 60) || (!!hit?.leg && damage >= 55);
    // Positive when the blow comes from the front: the body falls backward.
    reaction.push = hit?.direction
      ? -(
          hit.direction.x * Math.sin(enemy.model.rotation.y) +
          hit.direction.z * Math.cos(enemy.model.rotation.y)
        )
      : 1;
    if (hit?.position) this.markWound(enemy, hit.position, head, hit.direction);
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
      if (headKill) {
        destroyZombieHead(enemy.model, position);
        hordeEvent(enemy.model, "headshot", { position });
        this.goreNear(position, 1);
      } else hordeEvent(enemy.model, "flesh", { position });
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
    if (
      enemy.health > 0 &&
      maimAfterHit(enemy, damage, hit, this.view, this.run.time, head)
    )
      this.goreNear(
        hit?.position || enemyImpactPosition(enemy.model, false, point),
        0.85,
      );
    if (enemy.health <= 0) {
      enemy.dead = true;
      enemy.deathTime = deathDuration(enemy);
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
  /** Blood on the view when a head bursts or a limb tears off up close. */
  goreNear(position, strength = 1) {
    const d = position.distanceTo(this.view.camera.position);
    if (d < 3.2)
      this.emit("gore", {
        strength: clamp(strength * (1.25 - d / 3.2), 0.2, 1),
      });
  }
  /** The body part whose volume surface lies nearest an impact point. */
  struckPart(enemy, position) {
    const volumes = updateEnemyHitVolumes(enemy.model);
    let best = null,
      bestGap = Infinity;
    for (const v of volumes) {
      if (!v.sphere.radius) continue;
      const gap = v.sphere.center.distanceTo(position) - v.sphere.radius;
      if (gap < bestGap) {
        bestGap = gap;
        best = v;
      }
    }
    return best?.part || null;
  }
  /** Bullet wound painted on the body where the round landed. */
  markWound(enemy, position, head, direction) {
    const model = enemy.model;
    if (!model.userData.horde) return;
    const volumes = model.userData.hitVolumes;
    if (!volumes) return;
    let best = null,
      bestDistance = Infinity;
    for (const v of volumes) {
      if (!v.bone || (head && !v.head)) continue;
      const d = v.sphere.center.distanceToSquared(position);
      if (d < bestDistance) {
        bestDistance = d;
        best = v;
      }
    }
    if (!best) return;
    const bindDirection = (direction || dir.set(0, 0, -1)).clone();
    const bind = toBindSpace(
      model,
      position,
      best.bone.name,
      vec,
      bindDirection,
    );
    if (!bind) return;
    const radius = (head ? 0.016 : 0.02) + Math.random() * 0.014;
    for (const mesh of model.userData.horde.body)
      addWound(mesh.material, bind, bindDirection, radius);
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
  /** Look the weapon over (T); shooting, aiming or reloading cancels it. */
  inspectWeapon() {
    if (this.run.tonic) return;
    const vm = this.view.gun?.userData.armory ? this.view.viewModel : null;
    if (
      !vm ||
      vm.busy ||
      this.run.state !== "playing" ||
      this.run.downed ||
      this.run.reloadTime > 0 ||
      this.run.meleeTimer > 0 ||
      aimHeld(this.input)
    )
      return;
    const w = this.run.weapons[this.run.slot];
    vm.play("inspect", 2.8, (cue) => this.sound.weaponCue(cue, w.id));
  }
  melee() {
    if (this.run.tonic) return;
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
    if (this.run.tonic) return;
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
        if (
          this.obstacleDistance(position, vec.normalize(), len) >=
          len - 0.2
        ) {
          this.damageEnemy(
            e,
            540 * (1 - d / 7),
            false,
            { explosive: true, distance: d, origin: position },
            owner,
          );
          // Survivors are thrown back by the blast (see EnemySystem).
          const flat = Math.hypot(vec.x, vec.z) || 1;
          if (!e.dead)
            e.knock = {
              x: (vec.x / flat) * 4.2 * (1 - d / 6),
              z: (vec.z / flat) * 4.2 * (1 - d / 6),
            };
        }
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
    // The first-person arms carry their own knife (see ViewModel.meleeSwing).
    const armory = !!this.view.gun?.userData.armory;
    this.view.knife.visible = this.run.meleeTimer > 0 && !armory;
    this.view.knifeTrail.visible = this.run.meleeTimer > 0;
    if (!this.view.knifeTrail.visible) return;
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
