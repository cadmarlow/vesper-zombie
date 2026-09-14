import * as T from "three";
import { animateWeapon } from "../weapons.js";
import { WEAPONS } from "../config.js";
import { clamp, moveSlide } from "../logic.js";
const dir = new T.Vector3();

/** player owns its rules; commands are the explicit cross-system operations. */
export class PlayerSystem {
  constructor(
    { run, view, input, sound, emit },
    { end, updateHUD, obstacleDistance, updateKnife, shoot },
  ) {
    Object.assign(this, { run, view, input, sound, emit });
    this.commands = { end, updateHUD, obstacleDistance, updateKnife, shoot };
  }
  hurt(amount) {
    if (
      this.run.time < this.run.player.invulnerable ||
      this.run.state !== "playing" ||
      this.run.downed
    )
      return;
    this.run.player.health = Math.max(
      0,
      this.run.player.health - amount * this.run.difficulty.damage,
    );
    this.run.player.lastHurt = this.run.time;
    this.run.player.invulnerable = this.run.time + 0.37;
    this.run.lastHurtEffect = 1;
    this.sound.hurt();
    this.emit("damage");
    if (this.run.player.health <= 0) {
      if (this.run.session) this.down();
      else this.commands.end(false);
    }
  }
  down() {
    this.run.downed = true;
    this.run.meleePending = this.run.meleeSwing = false;
    this.run.meleeTimer = 0;
    this.input.touchMove = { x: 0, y: 0 };
    this.input.touchSprint = this.input.touchRun = false;
    this.run.player.health = 0;
    this.run.player.invulnerable = 1e9;
    this.input.mouse.fire = false;
    this.input.mouse.aim = false;
    this.run.reloadTime = 0;
    this.emit("announce", {
      eyebrow: "VOUS ÊTES À TERRE",
      title: "TENEZ BON",
      subtitle:
        "Vos coéquipiers doivent finir la vague. Vous reviendrez à la suivante.",
      duration: 4500,
    });
    this.commands.updateHUD();
  }
  respawn() {
    if (!this.run.downed) return;
    this.run.downed = false;
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
      const toward = enemy.model.position
        .clone()
        .add(new T.Vector3(0, 1.35, 0))
        .sub(this.view.camera.position);
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
        this.input.keys.has("ShiftLeft") ||
        this.input.keys.has("ShiftRight") ||
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
    this.run.lastHurtEffect = Math.max(0, this.run.lastHurtEffect - dt * 1.1);
    const bob =
      length > 0.05 && p.grounded
        ? Math.sin(this.run.time * (sprint ? 17 : p.crouched ? 7 : 10)) *
          (p.crouched ? 0.011 : sprint ? 0.047 : 0.027)
        : Math.sin(this.run.time * 1.5) * 0.007;
    this.view.camera.position.copy(p.position);
    this.view.camera.position.y +=
      (this.run.settings.shake ? bob : 0) - p.crouchAmount * 0.65;
    this.view.camera.rotation.set(
      this.input.pitch +
        (this.run.settings.shake
          ? this.run.recoil * 0.22 - this.run.knifeImpactTime * 0.12
          : 0),
      this.input.yaw,
      this.run.settings.shake && sprint
        ? Math.sin(this.run.time * 8.5) * 0.008
        : 0,
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
    const targetFov = this.input.mouse.aim
      ? definition.scopeFov || baseFov * 0.77
      : baseFov + (sprint ? 9 : 0);
    this.view.camera.fov = T.MathUtils.lerp(
      this.view.camera.fov,
      targetFov,
      dt * 10,
    );
    this.view.camera.updateProjectionMatrix();
    const aim =
      this.input.mouse.aim &&
      !this.run.reloadTime &&
      !sprint &&
      !this.run.meleeTimer;
    this.view.gun.visible =
      !this.run.meleeTimer && !(aim && definition.scopeFov);
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
}
