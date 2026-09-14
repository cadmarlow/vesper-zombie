import * as T from "three";
import { disposeModel } from "../resources.js";
import { glowSprite, glow, mesh } from "../assets.js";
import { reserveCapacity, canStand } from "../logic.js";

/** effects owns its rules; commands are the explicit cross-system operations. */
export class EffectsSystem {
  constructor({ run, view, input, sound, emit }, { hurt, explode }) {
    Object.assign(this, { run, view, input, sound, emit });
    this.commands = { hurt, explode };
  }
  drop(position, forced) {
    const r = Math.random(),
      type =
        forced ||
        (r < 0.3
          ? "health"
          : r < 0.57
            ? "ammo"
            : r < 0.82
              ? "double"
              : "insta");
    const color = {
      health: 0xff6560,
      ammo: 0xeac786,
      double: 0xecb648,
      insta: 0x9cfaf3,
    }[type];
    const model = new T.Group();
    mesh(new T.OctahedronGeometry(0.22), glow(color, 2), model);
    const halo = glowSprite(color, 1.5);
    model.add(halo);
    model.position.copy(position);
    model.position.y = 0.5;
    this.view.scene.add(model);
    this.run.pickups.push({
      id: this.run.nextPickupId++,
      mesh: model,
      type,
      life: 24,
    });
  }
  collect(p) {
    this.sound.pickup();
    switch (p.type) {
      case "health":
        this.run.player.health = Math.min(
          this.run.player.maxHealth,
          this.run.player.health + 50,
        );
        break;
      case "ammo":
        for (const w of this.run.weapons) w.reserve = reserveCapacity(w);
        break;
      case "double":
        this.run.powerups.double = this.run.time + 25;
        break;
      case "insta":
        this.run.powerups.insta = this.run.time + 18;
        break;
    }
    const names = {
      health: "Vitalité +50",
      ammo: "Munitions maximales",
      double: "Essences doubles · 25 s",
      insta: "Mort instantanée · 18 s",
    };
    this.emit("toast", { title: names[p.type], text: "Anomalie récupérée" });
    p.life = 0;
  }
  burst(position, color, count = 8, force = 1) {
    this.view.combatEffects.burst(position, color, count, force);
  }
  tracer(start, end, color, radius) {
    this.view.combatEffects.tracer(start, end, color, radius);
  }
  updateEffects(dt) {
    this.view.combatEffects.update(dt);
    for (const e of this.run.effects) {
      e.life -= dt;
      if (e.velocity) {
        e.velocity.y -= dt * 7;
        e.mesh.position.addScaledVector(e.velocity, dt);
      }
      if (e.mesh.material)
        e.mesh.material.opacity =
          Math.max(0, e.life / e.max) * (e.type === "flash" ? 0.6 : 1);
    }
    for (const p of this.run.projectiles) {
      p.life -= dt;
      const prev = p.mesh.position.clone();
      if (p.type === "grenade") p.velocity.y -= dt * 9;
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.mesh.rotation.x += dt * 5;
      if (p.mesh.position.y < 0.11) {
        p.mesh.position.y = 0.11;
        p.velocity.y = Math.abs(p.velocity.y) * 0.35;
        p.velocity.x *= 0.72;
        p.velocity.z *= 0.72;
      }
      if (
        !canStand(
          p.mesh.position.x,
          p.mesh.position.z,
          this.run.world.obstacles,
          0.12,
        )
      ) {
        p.mesh.position.copy(prev);
        p.velocity.x *= -0.5;
        p.velocity.z *= -0.5;
        if (p.type === "acid") p.life = 0;
      }
      if (
        p.type === "acid" &&
        p.mesh.position.distanceTo(this.view.camera.position) <
          (this.run.player.crouched ? 0.43 : 0.65)
      ) {
        this.commands.hurt(13);
        p.life = 0;
      }
      if (p.type === "acid" && p.life > 0 && this.run.session?.host)
        for (const other of this.run.session.players.values()) {
          if (!other.model || other.flags & 8) continue;
          const dy = p.mesh.position.y - (other.ty || 1.7);
          if (
            Math.hypot(
              p.mesh.position.x - other.model.position.x,
              dy,
              p.mesh.position.z - other.model.position.z,
            ) < 0.65
          ) {
            this.run.session.send(other.id, { k: "damage", amount: 13 });
            p.life = 0;
          }
        }
      if (p.life <= 0 && p.type === "grenade")
        this.commands.explode(
          p.mesh.position.clone().add(new T.Vector3(0, 0.35, 0)),
          p.owner ?? null,
        );
    }
    for (const p of this.run.pickups) {
      p.life -= dt;
      p.mesh.rotation.y += dt * 1.5;
      p.mesh.position.y = 0.65 + Math.sin(this.run.time * 3) * 0.15;
      if (
        !this.run.downed &&
        p.mesh.position.distanceTo(this.run.player.position) < 1.8
      )
        this.collect(p);
    }
    for (const list of [
      this.run.effects,
      this.run.projectiles,
      this.run.pickups,
    ]) {
      for (let i = list.length - 1; i >= 0; i--)
        if (list[i].life <= 0) {
          this.view.scene.remove(list[i].mesh);
          disposeModel(list[i].mesh);
          list.splice(i, 1);
        }
    }
    // Cap transient visuals during high-volume automatic fire.
    while (this.run.effects.length > 260) {
      const e = this.run.effects.shift();
      this.view.scene.remove(e.mesh);
      disposeModel(e.mesh);
    }
  }
}
