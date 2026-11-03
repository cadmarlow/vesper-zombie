import * as T from "three";
import { animateWeapon } from "../weapons.js";
import { ENEMIES, WEAPONS } from "../config.js";
import { clamp, moveSlide } from "../logic.js";
const dir = new T.Vector3();

/** player owns its rules; commands are the explicit cross-system operations. */
export class PlayerSystem {
  constructor(
    { run, view, input, sound, emit },
    { end, updateHUD, obstacleDistance, updateKnife, shoot, cancelTonic },
  ) {
    Object.assign(this, { run, view, input, sound, emit });
    this.commands = {
      end,
      updateHUD,
      obstacleDistance,
      updateKnife,
      shoot,
      cancelTonic,
    };
  }
  /** source: world position of the attacker, when known (claws, bites). */
  hurt(amount, source = null) {
    if (
      this.run.time < this.run.player.invulnerable ||
      this.run.state !== "playing" ||
      this.run.downed
    )
      return;
    let angle = null;
    if (source) {
      // Bearing of the attacker relative to where the camera looks.
      const dx = source.x - this.run.player.position.x,
        dz = source.z - this.run.player.position.z,
        yaw = this.input.yaw;
      angle = Math.atan2(
        dx * Math.cos(yaw) - dz * Math.sin(yaw),
        -dx * Math.sin(yaw) - dz * Math.cos(yaw),
      );
      this.run.hurtKick = {
        age: 0,
        side: Math.sin(angle),
        front: Math.cos(angle),
        strength: Math.min(1, 0.45 + amount / 40),
      };
    }
    this.run.player.health = Math.max(
      0,
      this.run.player.health - amount * this.run.difficulty.damage,
    );
    this.run.player.lastHurt = this.run.time;
    this.run.player.invulnerable = this.run.time + 0.37;
    this.run.lastHurtEffect = 1;
    this.sound.hurt();
    this.emit("damage", { angle, strength: Math.min(1, amount / 35) });
    if (this.run.player.health <= 0) {
      if (this.run.session) this.down();
      else this.commands.end(false);
    }
  }
  down() {
    if (this.run.downed) return;
    this.commands.cancelTonic?.();
    this.run.downed = true;
    this.run.eliminated = false;
    this.input.keys.clear();
    this.input.touchInteract = false;
    this.run.meleePending = this.run.meleeSwing = false;
    this.run.meleeTimer = 0;
    this.input.touchMove = { x: 0, y: 0 };
    this.input.touchSprint = this.input.touchRun = false;
    this.run.player.health = 0;
    this.run.player.crouched = false;
    this.run.player.invulnerable = 1e9;
    this.input.mouse.fire = false;
    this.input.mouse.aim = false;
    this.run.reloadTime = 0;
    this.emit("toast", {
      title: "Vous êtes à terre",
      text: "Votre équipe a 45 secondes pour vous réanimer.",
    });
    this.commands.updateHUD();
  }
  respawn() {
    if (!this.run.downed) return;
    this.run.downed = false;
    this.run.eliminated = false;
    this.run.player.health = this.run.player.maxHealth;
    this.run.player.invulnerable = this.run.time + 3;
    this.run.player.position.copy(this.run.world.spawn);
    this.run.player.vy = 0;
    this.run.player.grounded = true;
    this.emit("toast", {
      title: "Vous revenez dans la nuit",
      text: "Trois secondes d’invulnérabilité. Rejoignez vos coéquipiers.",
    });
    this.commands.updateHUD();
  }
  revive() {
    if (!this.run.downed || this.run.eliminated) return;
    this.run.downed = false;
    this.run.player.health = Math.ceil(this.run.player.maxHealth * 0.5);
    this.run.player.lastHurt = this.run.time;
    this.run.player.invulnerable = this.run.time + 3;
    this.run.player.vy = 0;
    this.input.keys.clear();
    this.input.touchInteract = false;
    this.commands.updateHUD();
  }
  eliminate() {
    if (!this.run.downed) return;
    this.run.eliminated = true;
    this.emit("toast", {
      title: "Vous êtes éliminé",
      text: "Vous reviendrez à la prochaine vague.",
    });
    this.commands.updateHUD();
  }
  toggleCrouch() {
    if (
      this.run.state !== "playing" ||
      this.run.downed ||
      !this.run.player.grounded
    )
      return;
    this.run.player.crouched = !this.run.player.crouched;
    this.input.touchRun = false;
    this.commands.updateHUD();
  }
  toggleRun() {
    if (this.run.state !== "playing" || this.run.downed) return;
    this.input.touchRun = !this.input.touchRun;
    if (this.input.touchRun) this.run.player.crouched = false;
    this.commands.updateHUD();
  }
  jump() {
    if (
      this.run.state !== "playing" ||
      this.run.downed ||
      !this.run.player.grounded
    )
      return;
    this.run.player.crouched = false;
    this.run.player.vy = 5;
    this.run.player.grounded = false;
  }
  touchAimFriction() {
    if (!this.run.settings.touchAimAssist || !this.run.touch) return 1;
    const forward = this.view.camera.getWorldDirection(new T.Vector3());
    for (const enemy of this.run.enemies) {
      if (enemy.dead || enemy.model.position.y < -0.1) continue;
      // The chest, wherever it is: standing, hunched or crawling.
      const chest = enemy.model.userData.torso;
      const toward = (
        chest
          ? chest.getWorldPosition(new T.Vector3())
          : enemy.model.position.clone().add(new T.Vector3(0, 1.35, 0))
      ).sub(this.view.camera.position);
      const distance = toward.length();
      if (distance < 2 || distance > 25) continue;
      toward.normalize();
      if (
        forward.dot(toward) > 0.993 &&
        this.commands.obstacleDistance(
          this.view.camera.position,
          toward,
          distance,
        ) >=
          distance - 0.25
      )
        return 0.68;
    }
    return 1;
  }
  /** The horde is solid: a survivor cannot walk through standing bodies. */
  blockByHorde(p) {
    if (this.run.downed) return;
    for (const e of this.run.enemies) {
      if (e.dead || e.model.position.y < -0.3) continue;
      const reach = (e.crawler ? 0.24 : ENEMIES[e.type].radius || 0.36) + 0.34;
      const dx = p.position.x - e.model.position.x,
        dz = p.position.z - e.model.position.z,
        d2 = dx * dx + dz * dz;
      if (d2 >= reach * reach || d2 < 1e-8) continue;
      const d = Math.sqrt(d2),
        push = reach - d;
      moveSlide(
        p.position,
        (dx / d) * push,
        (dz / d) * push,
        this.run.world.obstacles,
      );
    }
  }
  updatePlayer(dt) {
    const p = this.run.player;
    const definition = WEAPONS[this.run.weapons[this.run.slot].id];
    if (this.run.meleeTimer > 0) this.input.mouse.aim = false;
    const forward =
      (this.input.keys.has("KeyW") || this.input.keys.has("ArrowUp") ? 1 : 0) -
      (this.input.keys.has("KeyS") || this.input.keys.has("ArrowDown") ? 1 : 0);
    const right =
      (this.input.keys.has("KeyD") || this.input.keys.has("ArrowRight")
        ? 1
        : 0) -
      (this.input.keys.has("KeyA") || this.input.keys.has("ArrowLeft") ? 1 : 0);
    const touch = this.input.touchMove || { x: 0, y: 0 };
    const mx = this.run.downed ? 0 : right + touch.x,
      mz = this.run.downed ? 0 : forward + touch.y,
      length = Math.hypot(mx, mz);
    const sprint =
      !!(
        this.input.keys.has("Space") ||
        this.input.touchSprint ||
        this.input.touchRun
      ) &&
      length > 0.1 &&
      !p.exhausted &&
      p.stamina > 0 &&
      !p.crouched &&
      !this.input.mouse.aim &&
      !this.input.mouse.fire &&
      !this.run.reloadTime &&
      !this.run.meleeTimer;
    p.sprinting = sprint;
    const speed =
      (p.crouched ? 1.8 : sprint ? 7.15 : 3.65) *
      (this.input.mouse.aim ? 0.62 : 1);
    p.crouchAmount = T.MathUtils.damp(
      p.crouchAmount,
      p.crouched ? 1 : 0,
      13,
      dt,
    );
    if (length > 0.05) {
      const x = mx / Math.max(1, length),
        z = mz / Math.max(1, length);
      moveSlide(
        p.position,
        (Math.cos(this.input.yaw) * x - Math.sin(this.input.yaw) * z) *
          speed *
          dt,
        (-Math.sin(this.input.yaw) * x - Math.cos(this.input.yaw) * z) *
          speed *
          dt,
        this.run.world.obstacles,
      );
      this.run.stepTimer -= dt;
      if (this.run.stepTimer <= 0 && p.grounded) {
        this.sound.step(sprint, p.crouched);
        this.run.stepTimer = p.crouched ? 0.64 : sprint ? 0.27 : 0.47;
      }
    }
    this.blockByHorde(p);
    p.stamina = clamp(
      p.stamina + (sprint ? -(p.perks.includes("speed") ? 14 : 21) : 23) * dt,
      0,
      100,
    );
    if (p.stamina === 0) p.exhausted = true;
    else if (p.stamina >= 25) p.exhausted = false;
    if (!p.grounded) {
      p.vy -= dt * 13;
      p.position.y += p.vy * dt;
      if (p.position.y <= 1.7) {
        p.position.y = 1.7;
        p.grounded = true;
        // Impact speed drives the weapon's landing dip.
        this.landed = Math.abs(p.vy);
        p.vy = 0;
      }
    }
    if (
      !this.run.downed &&
      this.run.time - p.lastHurt > 5 &&
      p.health < p.maxHealth
    )
      p.health = Math.min(p.maxHealth, p.health + dt * 9);
    this.run.recoil = Math.max(0, this.run.recoil - dt * 0.65);
    this.recoverRecoil(dt, definition, length, sprint);
    this.run.lastHurtEffect = Math.max(0, this.run.lastHurtEffect - dt * 1.1);
    const bob =
      length > 0.05 && p.grounded
        ? Math.sin(this.run.time * (sprint ? 17 : p.crouched ? 7 : 10)) *
          (p.crouched ? 0.011 : sprint ? 0.047 : 0.027)
        : Math.sin(this.run.time * 1.5) * 0.007;
    this.view.camera.position.copy(p.position);
    this.view.camera.position.y +=
      (this.run.settings.shake ? bob : 0) - p.crouchAmount * 0.65;
    p.downAmount = T.MathUtils.damp(
      p.downAmount || 0,
      this.run.downed ? 1 : 0,
      7,
      dt,
    );
    this.view.camera.position.y -= p.downAmount * 1.12;
    // A blow snaps the head away from the attacker, then springs back.
    let kickPitch = 0,
      kickYaw = 0,
      kickRoll = 0;
    const kick = this.run.hurtKick;
    if (kick && this.run.settings.shake) {
      kick.age += dt;
      const t = kick.age;
      const envelope =
        t < 0.05
          ? t / 0.05
          : Math.exp(-(t - 0.05) * 9) * Math.cos((t - 0.05) * 18);
      const k = envelope * kick.strength;
      kickPitch = k * 0.09 * Math.max(0.3, kick.front);
      kickYaw = -k * 0.05 * kick.side;
      kickRoll = -k * 0.11 * kick.side;
      if (t > 0.8) this.run.hurtKick = null;
    }
    // Recoil offsets are real aim (the player pulls against them); the
    // short shake on top is only seen.
    this.view.camera.rotation.set(
      // Recoil never tips the view past the vertical.
      T.MathUtils.clamp(this.input.pitch + (p.recoilPitch || 0), -1.5, 1.5) +
        kickPitch +
        (this.run.settings.shake
          ? this.run.recoil * 0.1 - this.run.knifeImpactTime * 0.12
          : 0),
      this.input.yaw + (p.recoilYaw || 0) + kickYaw,
      kickRoll +
        (this.run.settings.shake && sprint
          ? Math.sin(this.run.time * 8.5) * 0.008
          : 0),
      "YXZ",
    );
    const baseFov = this.run.touch
      ? Math.min(
          this.run.settings.fov,
          T.MathUtils.radToDeg(
            2 *
              Math.atan(
                (Math.tan(T.MathUtils.degToRad(this.run.settings.fov) / 2) *
                  (16 / 9)) /
                  this.view.camera.aspect,
              ),
          ),
        )
      : this.run.settings.fov;
    const rescuing = !!this.run.session?.rescue?.intent();
    // One aiming state for the lens, the scope, the HUD and the view model:
    // reloads, sprinting, the knife and working a bolt all lower the sights.
    const armory = !!this.view.gun?.userData.armory;
    const aim =
      this.input.mouse.aim &&
      !rescuing &&
      !this.run.tonic &&
      !this.run.reloadTime &&
      !sprint &&
      !this.run.meleeTimer &&
      !(armory && this.view.viewModel.blocksAim);
    this.run.aiming = aim;
    // A scope only magnifies once it reaches the eye.
    const scoped =
      aim &&
      definition.scopeFov &&
      (!armory || this.view.viewModel.aimT > 0.82);
    const targetFov = aim
      ? (scoped && definition.scopeFov) || baseFov * (definition.adsZoom ?? 0.8)
      : baseFov + (sprint ? 9 : 0);
    this.run.scoped = !!scoped;
    this.scopeSway(dt, !!scoped);
    this.view.camera.fov = T.MathUtils.lerp(
      this.view.camera.fov,
      targetFov,
      dt * 10,
    );
    this.view.camera.updateProjectionMatrix();
    p.rescueAmount = T.MathUtils.damp(
      p.rescueAmount || 0,
      rescuing ? 1 : 0,
      9,
      dt,
    );
    if (armory || (this.run.tonic && this.view.viewModel?.arms)) {
      if (!armory) this.view.gun.visible = false;
      this.updateViewModel(dt, { aim, sprint, length, mx, definition });
    } else this.updateLegacyGun(dt, { aim, sprint, length, bob, definition });
    this.view.weaponAmbient.intensity =
      1.1 + (this.run.world?.powerLevel || 0) * 0.25;
    this.view.weaponKey.position.set(
      -2 * Math.cos(this.input.yaw),
      3,
      -1 + Math.sin(this.input.yaw),
    );
    this.view.weaponKey.color.copy(this.run.world.sun.color);
    if (this.run.time > (this.view.nextWeaponLight || 0)) {
      this.view.nextWeaponLight = this.run.time + 0.1;
      let nearest = null,
        strength = 0;
      for (const { light } of this.run.world.lights) {
        const value =
          light.intensity /
          (2 + light.position.distanceToSquared(this.view.camera.position));
        if (value > strength) {
          strength = value;
          nearest = light;
        }
      }
      if (nearest) this.view.weaponBounce.color.lerp(nearest.color, 0.3);
      this.view.weaponBounce.intensity =
        Math.min(3.5, strength * 2.6) + this.run.recoil * 8;
    }
    this.commands.updateKnife();
    this.view.flashlight.position.copy(this.view.camera.position);
    this.view.flashlight.target.position
      .copy(this.view.camera.position)
      .add(this.view.camera.getWorldDirection(dir).multiplyScalar(15));
    if (
      this.input.mouse.fire &&
      (WEAPONS[this.run.weapons[this.run.slot].id].automatic || this.run.touch)
    )
      this.commands.shoot();
  }
  /**
   * Recoil recovers once the trigger rests; spread blooms with sustained
   * fire, movement and jumps, and settles when crouched and still.
   */
  recoverRecoil(dt, definition, length, sprint) {
    const p = this.run.player;
    const since = this.run.time - (p.lastShot ?? -10);
    if (since > Math.max(0.09, (definition.rate || 0.1) * 0.9)) {
      const k = 1 - Math.exp(-dt * (definition.kick?.recover ?? 6));
      p.recoilPitch = (p.recoilPitch || 0) * (1 - k);
      p.recoilYaw = (p.recoilYaw || 0) * (1 - k);
      if (Math.abs(p.recoilPitch) < 1e-5) p.recoilPitch = 0;
      if (Math.abs(p.recoilYaw) < 1e-5) p.recoilYaw = 0;
    }
    p.bloom = Math.max(0, (p.bloom || 0) - dt * (since > 0.12 ? 3.2 : 0.8));
    const moving = length > 0.1 && p.grounded;
    const target =
      (moving ? (sprint ? 1.4 : 0.55) : 0) +
      (p.grounded ? 0 : 1.6) -
      (p.crouched && !moving ? 0.25 : 0);
    this.run.movePenalty = T.MathUtils.damp(
      this.run.movePenalty || 0,
      target,
      10,
      dt,
    );
    // Current hip-fire cone for the crosshair (radians).
    const hip = definition.hipSpread ?? definition.spread;
    const aimed = !!this.run.aiming;
    this.run.spreadNow =
      (aimed
        ? definition.spread * 0.3 * (1 + p.bloom * 0.3)
        : hip * (1 + p.bloom + this.run.movePenalty)) *
      (p.perks.includes("focus") ? 0.55 : 1);
  }
  /**
   * A magnified sight shows the shooter's breathing. Shift holds the breath
   * while stamina lasts; running out forces a shaky exhale.
   */
  scopeSway(dt, scoped) {
    const p = this.run.player;
    const keys = this.input.keys;
    p.breathOut = Math.max(0, (p.breathOut || 0) - dt);
    const holding =
      scoped && keys.has("Space") && p.stamina > 4 && p.breathOut === 0;
    if (holding) {
      p.stamina = Math.max(0, p.stamina - dt * 24);
      if (p.stamina <= 4) p.breathOut = 2.4;
    }
    this.run.holdingBreath = holding;
    const amplitude = !scoped
      ? 0
      : holding
        ? 0.00045
        : (p.breathOut > 0 ? 0.0085 : 0.0034) *
          (p.perks.includes("focus") ? 0.6 : 1) *
          (p.crouched ? 0.6 : 1) *
          // No breath key on a touch screen: a steadier hold instead.
          (this.run.touch ? 0.5 : 1);
    this.swayAmplitude = T.MathUtils.damp(
      this.swayAmplitude || 0,
      amplitude,
      4,
      dt,
    );
    const t = this.run.time,
      a = this.swayAmplitude;
    const pitch = Math.sin(t * 0.93) * a + Math.sin(t * 2.31 + 0.7) * a * 0.3;
    const yaw =
      Math.sin(t * 0.71 + 1.3) * a * 1.25 + Math.sin(t * 1.83) * a * 0.35;
    this.view.camera.rotation.x += pitch;
    this.view.camera.rotation.y += yaw;
    // The eye drifts in the eye box with the same rhythm.
    const drift = (this.run.scopeDrift ||= { x: 0, y: 0 });
    drift.x = yaw * 4;
    drift.y = -pitch * 4;
  }
  /** Real-scale weapon and arms (src/armory). */
  updateViewModel(dt, { aim, sprint, length, mx, definition }) {
    const p = this.run.player;
    const vm = this.view.viewModel;
    // Bringing the sights up rustles the sleeves and rattles the sling.
    if (aim && !this.wasAiming)
      this.sound.weaponCue?.("aim", this.run.weapons[this.run.slot]?.id);
    this.wasAiming = aim;
    // Raising the sights or reloading ends an inspection.
    if (
      vm.busy === "inspect" &&
      (aim || this.run.reloadTime > 0 || this.run.meleeTimer > 0)
    )
      vm.stop();
    const yaw = this.input.yaw,
      pitch = this.input.pitch;
    const turn = yaw - (this.lastYaw ?? yaw);
    const lookX = Math.atan2(Math.sin(turn), Math.cos(turn));
    const lookY = pitch - (this.lastPitch ?? pitch);
    this.lastYaw = yaw;
    this.lastPitch = pitch;
    const moving = length > 0.05 && p.grounded;
    const speed = moving
      ? (p.crouched ? 0.5 : sprint ? 1.9 : 1) * Math.min(1, length)
      : 0;
    vm.update({
      dt,
      tonic: this.run.tonic,
      time: this.run.time,
      aim,
      sprint,
      crouch: p.crouched,
      speed,
      strafe: moving ? Math.max(-1, Math.min(1, mx)) : 0,
      stepRate: 1 / (p.crouched ? 0.64 : sprint ? 0.27 : 0.47),
      grounded: p.grounded,
      landed: this.landed || 0,
      lookX,
      lookY,
      lowered: Math.max(p.rescueAmount || 0, p.downAmount || 0),
      // A scope replaces the weapon once it is at the eye.
      hidden: this.run.downed || this.run.scoped,
      // The knife: normalized progress of the melee swing.
      melee: this.run.meleeTimer > 0 ? 1 - this.run.meleeTimer / 0.78 : null,
      shake: this.run.settings.shake,
    });
    this.landed = 0;
    this.view.viewEffects?.update(
      dt,
      vm.socket("muzzle", this.muzzle || (this.muzzle = new T.Vector3())),
    );
  }
  /** Procedural stand-in while a weapon model loads. */
  updateLegacyGun(dt, { aim, sprint, length, bob, definition }) {
    const p = this.run.player;
    this.view.gun.visible =
      !this.run.downed && !this.run.meleeTimer && !(aim && definition.scopeFov);
    const reloadProgress =
      this.run.reloadTime > 0
        ? Math.sin(
            (1 - this.run.reloadTime / this.run.reloadDuration) * Math.PI,
          )
        : 0;
    this.view.gun.position.x =
      T.MathUtils.lerp(
        this.view.gun.position.x,
        aim ? 0 : sprint ? 0.12 : this.run.touch ? 0.18 : 0.24,
        dt * 14,
      ) + (length > 0.05 ? Math.cos(this.run.time * 6) * 0.0007 : 0);
    this.view.gun.position.y =
      T.MathUtils.lerp(
        this.view.gun.position.y,
        aim
          ? -definition.adsHeight * (this.run.touch ? 0.68 : 0.78)
          : sprint
            ? -0.31
            : -0.18,
        dt * 14,
      ) -
      reloadProgress * 0.012;
    this.view.gun.position.z =
      (this.run.touch ? -0.63 : -0.62) +
      this.run.recoil * 0.7 +
      reloadProgress * 0.2;
    this.view.gun.rotation.set(
      -reloadProgress * 0.55 + sprint * 0.36,
      reloadProgress * -0.35 + sprint * -0.28 + (aim ? 0 : 0.055),
      -reloadProgress * 0.52 + sprint * 0.27 + (aim ? 0 : -0.045),
    );
    this.view.gun.position.y += bob * 0.12;
    this.view.gun.position.y -= p.rescueAmount * 0.24;
    this.view.gun.rotation.x += p.rescueAmount * 0.55;
    animateWeapon(
      this.view.gun,
      dt,
      this.run.reloadTime > 0
        ? 1 - this.run.reloadTime / this.run.reloadDuration
        : 0,
      this.run.recoil,
      sprint,
      this.run.time,
      aim,
    );
  }
}
