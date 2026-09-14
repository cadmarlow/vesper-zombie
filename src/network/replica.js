import {
  animateDeath,
  updateEnemyVisibility,
} from "../game/enemy-presentation.js";
import * as T from "three";
import {
  zombieModel,
  animateZombie,
  releaseZombie,
  destroyZombieHead,
} from "../creatures.js";
import { setSurfaceQuality } from "../surfaces.js";
import { disposeModel } from "../resources.js";
import { glow, glowSprite, mesh } from "../assets.js";
const PICKUP_TYPES = ["health", "ammo", "double", "insta"];
export class WorldReplica {
  constructor(
    context,
    { id, remoteEnemies, remotePickups, remoteProjectiles },
    commands,
  ) {
    Object.assign(this, {
      context,
      id,
      remoteEnemies,
      remotePickups,
      remoteProjectiles,
      commands,
    });
  }
  apply(s) {
    const g = this.context;
    if (s.wave !== g.run.wave) g.run.wave = s.wave;
    g.run.phase = s.phase;
    g.run.phaseTimer = s.timer;
    g.run.remaining = s.remaining;
    if (s.power && !g.run.world.power) {
      g.run.world.setPower();
      g.sound.powerOn();
    }
    s.doors.forEach(([id, open]) => {
      const door = g.run.world.doors.find((door) => door.id === id);
      if (open && door && !door.open) g.run.world.openDoor(door);
    });
    const box = g.run.world.interactions.find((i) => i.kind === "box");
    if (box && s.box) {
      const [busy, offered, display] = s.box;
      box.busy = !!busy;
      box.offered = offered;
      const wanted = display;
      if (wanted && box.display?.name !== `weapon-${wanted}`)
        g.run.world.showBoxWeapon(wanted);
      else if (!wanted && box.display) {
        box.root.remove(box.display);
        box.display = null;
      }
    }
    g.run.extraction = s.extraction >= 0;
    g.run.extractionTimer = Math.max(0, s.extraction);
    // players
    for (const row of s.p) {
      const [id, x, y, z, yaw, pitch, w, l, hp, mhp, f, points, grenades] = row;
      if (id === this.id) continue;
      const p = this.commands.ensurePlayer(id);
      this.commands.applyPlayerState(p, {
        x,
        y,
        z,
        yaw,
        pitch,
        w,
        l,
        hp,
        mhp,
        f,
        points,
        grenades,
      });
    }
    // enemies
    const seen = new Set();
    for (const row of s.e) {
      const [
        id,
        typeIndex,
        x,
        z,
        yaw,
        hp,
        dead,
        attacking,
        headGone,
        stagger,
        maxHealth,
      ] = row;
      seen.add(id);
      let e = this.remoteEnemies.get(id);
      if (!e) {
        const type = typeIndex;
        const model = zombieModel(
          type,
          g.run.touch || g.run.settings.quality === "low" ? "lite" : "full",
        );
        setSurfaceQuality(model, g.run.settings.quality);
        model.position.set(x, -1.9, z);
        model.rotation.y = yaw;
        g.view.scene.add(model);
        e = {
          id,
          model,
          type,
          health: hp,
          maxHealth: maxHealth || hp,
          dead: false,
          deathTime: 2.4,
          stagger: 0,
          age: 0,
          seed: Math.random() * 12,
          tx: x,
          tz: z,
          tyaw: yaw,
          attacking: false,
          speed: 0,
          remote: true,
        };
        this.remoteEnemies.set(id, e);
        g.run.enemies.push(e);
      }
      e.tx = x;
      e.tz = z;
      e.tyaw = yaw;
      e.health = hp;
      e.attacking = !!attacking;
      if (stagger && e.stagger <= 0) e.stagger = 0.16;
      if (headGone && !e.model.userData.headDestroyed) {
        const at = new T.Vector3();
        destroyZombieHead(e.model, at);
        g.view.combatEffects.blood.hit(at, new T.Vector3(0, 1, 0), true);
      }
      if (dead && !e.dead) {
        e.dead = true;
        e.deathTime = 2.4;
        e.fallSide = Math.random() < 0.5 ? -1 : 1;
      }
    }
    for (const [id, e] of this.remoteEnemies)
      if (!seen.has(id)) {
        // Host already removed it (body faded): drop ours too.
        g.view.scene.remove(e.model);
        releaseZombie(e.model);
        g.run.enemies = g.run.enemies.filter((x) => x !== e);
        this.remoteEnemies.delete(id);
      }
    // pickups
    const pickupsSeen = new Set();
    for (const [id, typeIndex, x, z] of s.k) {
      pickupsSeen.add(id);
      if (!this.remotePickups.has(id)) {
        const type = PICKUP_TYPES[typeIndex] || "health";
        const color = {
          health: 0xff6560,
          ammo: 0xeac786,
          double: 0xecb648,
          insta: 0x9cfaf3,
        }[type];
        const model = new T.Group();
        mesh(new T.OctahedronGeometry(0.22), glow(color, 2), model);
        model.add(glowSprite(color, 1.5));
        model.position.set(x, 0.5, z);
        g.view.scene.add(model);
        this.remotePickups.set(id, { mesh: model, type });
      }
    }
    for (const [id, p] of this.remotePickups)
      if (!pickupsSeen.has(id)) {
        g.view.scene.remove(p.mesh);
        disposeModel(p.mesh);
        this.remotePickups.delete(id);
      }
    // projectiles
    const projSeen = new Set();
    for (const [id, kind, x, y, z] of s.j) {
      projSeen.add(id);
      let p = this.remoteProjectiles.get(id);
      if (!p) {
        const model = new T.Mesh(
          new T.SphereGeometry(kind === 0 ? 0.09 : 0.12, 8, 6),
          kind === 0 ? glow(0x4c6257, 0.2) : glow(0x9ae54f, 3),
        );
        model.position.set(x, y, z);
        g.view.scene.add(model);
        p = { mesh: model, target: new T.Vector3(x, y, z) };
        this.remoteProjectiles.set(id, p);
      }
      p.target.set(x, y, z);
    }
    for (const [id, p] of this.remoteProjectiles)
      if (!projSeen.has(id)) {
        g.view.scene.remove(p.mesh);
        disposeModel(p.mesh);
        this.remoteProjectiles.delete(id);
      }
  }
  updateRemoteEnemies(dt) {
    const g = this.context;
    for (const e of g.run.enemies) {
      e.age += dt;
      if (e.dead) {
        animateDeath(e, dt);
        continue;
      }
      e.model.position.y = Math.min(0, e.model.position.y + dt * 2.5);
      e.stagger -= dt;
      const m = e.model,
        bx = m.position.x,
        bz = m.position.z;
      m.position.x = T.MathUtils.damp(m.position.x, e.tx, 12, dt);
      m.position.z = T.MathUtils.damp(m.position.z, e.tz, 12, dt);
      let delta = e.tyaw - m.rotation.y;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      m.rotation.y += delta * Math.min(1, dt * 10);
      const moved = Math.hypot(m.position.x - bx, m.position.z - bz);
      e.speed = T.MathUtils.damp(e.speed, dt > 0 ? moved / dt : 0, 8, dt);
      const d = Math.hypot(
        m.position.x - g.run.player.position.x,
        m.position.z - g.run.player.position.z,
      );
      if (g.run.time >= (e.nextDetailCheck || 0)) {
        e.nextDetailCheck = g.run.time + 0.4;
        g.commands.applyDetail(e, d);
      }
      animateZombie(
        m,
        g.run.time + e.seed,
        e.speed / 1.65,
        e.attacking,
        Math.min(0.16, e.stagger),
      );
      updateEnemyVisibility(e, g.run.time, d);
    }
    const gone = g.run.enemies.filter((e) => e.dead && e.deathTime <= 0);
    for (const e of gone) {
      g.view.scene.remove(e.model);
      releaseZombie(e.model);
      this.remoteEnemies.delete(e.id);
    }
    g.run.enemies = g.run.enemies.filter((e) => !gone.includes(e));
  }
}
