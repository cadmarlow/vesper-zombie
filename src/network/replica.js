import {
  animateDeath,
  corpseBlood,
  deathDuration,
  emergenceDirt,
  presentEnemyIntent,
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
import {
  EMERGE_DEPTH,
  enemyActionFromSnapshot,
  enemyActionPresentation,
  enemySpeed,
  enemyVariation,
  isWaveCleanup,
  riseRate,
} from "../game/enemy-actions.js";
import { hordeGait } from "../content/horde.js";
import { crippleEnemy, severArm, tearJaw } from "../game/crawlers.js";
import { LIMBS } from "../horde/dismember.js";
import {
  canVault,
  vaultCrossing,
  vaultHeight,
  vaultPhase,
  vaultWorld,
} from "../game/vaulting.js";
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
    const time = s.time ?? g.run.time;
    this.latestTime = time;
    this.renderTime ??= time - 0.1;
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
    g.run.mapGameplay?.applySnapshot(s.mapState);
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
    const crawlers = new Set(s.c || []);
    const cuts = new Map(s.x || []);
    const leaps = new Set((s.lp || []).map(([id, seq]) => `${id}:${seq}`));
    const intents = new Map(
      (s.ai || []).map(([id, role, sequence, since]) => [
        id,
        { role, sequence, since },
      ]),
    );
    for (const row of s.e) {
      const [
        id,
        typeIndex,
        x,
        z,
        yaw,
        hp,
        dead,
        ,
        headGone,
        ,
        maxHealth,
        actionCode,
        actionStart,
        actionSequence,
        targetYaw,
        staggerUntil,
      ] = row;
      seen.add(id);
      let e = this.remoteEnemies.get(id);
      if (!e) {
        const type = typeIndex;
        const variation = enemyVariation(id);
        const model = zombieModel(
          type,
          g.run.touch || g.run.settings.quality === "low" ? "lite" : "full",
          id,
        );
        setSurfaceQuality(model, g.run.settings.quality);
        model.position.set(x, model.userData.horde ? -EMERGE_DEPTH : -1.9, z);
        model.rotation.y = yaw;
        g.view.scene.add(model);
        const gait = hordeGait(type, id, g.run.wave);
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
          seed: variation * 12,
          tx: x,
          tz: z,
          tyaw: yaw,
          attacking: false,
          speed: 0,
          remote: true,
          samples: [],
          speedFactor: gait.factor,
          gait: gait.gait,
        };
        this.remoteEnemies.set(id, e);
        g.run.enemies.push(e);
      }
      e.tx = x;
      e.tz = z;
      e.tyaw = yaw;
      e.action = enemyActionFromSnapshot(
        actionCode,
        actionStart,
        actionSequence,
        leaps.has(`${id}:${actionSequence}`),
      );
      e.samples.push({
        time,
        x,
        z,
        yaw,
        targetYaw,
        action: e.action,
        staggerUntil,
        dead: !!dead,
        headGone: !!headGone,
        crawler: crawlers.has(id),
        cuts: cuts.get(id) || 0,
        intent: intents.get(id) || null,
      });
      if (e.samples.length > 8) e.samples.shift();
      e.health = hp;
      e.removeAt = undefined;
    }
    for (const [id, e] of this.remoteEnemies)
      if (!seen.has(id)) e.removeAt ??= time;
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
        model.visible = kind === 0;
        g.view.scene.add(model);
        p =
          kind === 0
            ? { mesh: model, target: new T.Vector3(x, y, z) }
            : { mesh: model, bornAt: time, samples: [] };
        this.remoteProjectiles.set(id, p);
      }
      if (p.target) {
        p.target.set(x, y, z);
        continue;
      }
      p.samples.push({ time, x, y, z });
      if (p.samples.length > 8) p.samples.shift();
      p.removeAt = undefined;
    }
    for (const [id, p] of this.remoteProjectiles)
      if (!projSeen.has(id)) {
        if (p.target) {
          g.view.scene.remove(p.mesh);
          disposeModel(p.mesh);
          this.remoteProjectiles.delete(id);
        } else p.removeAt ??= time;
      }
  }
  updateRemoteEnemies(dt) {
    const g = this.context;
    if (this.renderTime !== undefined) {
      const drift = this.latestTime - 0.1 - this.renderTime;
      // Slow hosts must slow this clock too, never rewind an already shown
      // pose. A long interruption may require a forward resynchronization.
      if (drift > 0.5) this.renderTime = this.latestTime - 0.1;
      else this.renderTime += dt * T.MathUtils.clamp(1 + drift * 8, 0, 1.5);
    }
    const clock = this.renderTime ?? g.run.time;
    const removed = [];
    const cleanup = isWaveCleanup(g.run);
    for (const e of g.run.enemies) {
      e.hurrying = cleanup;
      e.age += dt;
      if (e.dead) {
        animateDeath(e, dt);
        corpseBlood(e, g.view);
        if (e.deathTime <= 0) e.model.visible = false;
        if (e.removeAt <= clock && e.deathTime <= 0) removed.push(e);
        continue;
      }
      if (e.removeAt <= clock) {
        removed.push(e);
        continue;
      }
      e.model.position.y = Math.min(
        0,
        e.model.position.y + dt * riseRate(e.model),
      );
      emergenceDirt(e, g.view);
      e.stagger -= dt;
      const m = e.model,
        bx = m.position.x,
        bz = m.position.z;
      const samples = e.samples;
      while (samples.length > 2 && samples[1].time <= this.renderTime)
        samples.shift();
      const a = samples[0],
        b = samples[1] || a;
      const mix =
        a && b.time > a.time
          ? T.MathUtils.clamp(
              (this.renderTime - a.time) / (b.time - a.time),
              0,
              1,
            )
          : 1;
      m.position.x = a ? T.MathUtils.lerp(a.x, b.x, mix) : e.tx;
      m.position.z = a ? T.MathUtils.lerp(a.z, b.z, mix) : e.tz;
      const bodyYaw = a
        ? a.yaw +
          Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw)) * mix
        : e.tyaw;
      let delta = bodyYaw - m.rotation.y;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      // Host turns are already gradual. Interpolate once, without adding a
      // second facing lag that makes the body crabwalk around a corner.
      m.rotation.y += delta;
      const moved = Math.hypot(m.position.x - bx, m.position.z - bz);
      e.speed = T.MathUtils.damp(e.speed, dt > 0 ? moved / dt : 0, 8, dt);
      e.velocityX = dt > 0 ? (m.position.x - bx) / dt : 0;
      e.velocityZ = dt > 0 ? (m.position.z - bz) / dt : 0;
      e.turnRate = dt > 0 ? delta / dt : 0;
      const actionState =
        b?.action && b.action.startTime <= clock ? b.action : a?.action;
      const observation = b?.time <= clock ? b : a?.time <= clock ? a : null;
      e.intent = observation?.intent || null;
      presentEnemyIntent(e, clock);
      const motion = enemyActionPresentation(
        actionState,
        clock,
        e.type,
        e.id,
        (e.motion ||= {}),
      );
      e.attacking = motion.action !== "none";
      const staggerUntil =
        b?.staggerUntil && b.staggerUntil - 0.16 <= clock
          ? b.staggerUntil
          : a?.staggerUntil || 0;
      e.stagger = Math.max(e.stagger, Math.min(0.16, staggerUntil - clock));
      const lookA = a?.targetYaw ?? a?.yaw ?? bodyYaw;
      const lookB = b?.targetYaw ?? b?.yaw ?? bodyYaw;
      e.targetYaw =
        lookA +
        Math.atan2(Math.sin(lookB - lookA), Math.cos(lookB - lookA)) * mix;
      motion.dt = dt;
      motion.velocityX = e.velocityX;
      motion.velocityZ = e.velocityZ;
      motion.targetYaw = e.targetYaw;
      motion.turnRate = e.turnRate;
      motion.clock = clock;
      motion.isGrounded = m.position.y >= -0.001;
      motion.expectedSpeed = enemySpeed(e, g.run.wave);
      motion.hurrying = e.hurrying;
      motion.viewer = g.view?.camera?.position;
      // Crossing a low obstacle: derived from the position, as on the host.
      if (g.run.world) vaultWorld(g.run.world);
      const over =
        g.run.world && canVault(e) && m.position.y >= -0.001
          ? vaultCrossing(
              m.position.x,
              m.position.z,
              g.run.world.obstacles || [],
            )
          : null;
      if (over) m.position.y = vaultHeight(over);
      else if (m.position.y > 0) m.position.y = 0;
      motion.vault = vaultPhase(over, e.velocityX, e.velocityZ);
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
        clock + e.seed,
        e.speed / 1.65,
        e.attacking,
        Math.min(0.16, e.stagger),
        motion,
      );
      updateEnemyVisibility(e, clock, d);
      // Flags are observations, just like positions: a future snapshot must
      // not interrupt a swing whose contact has not yet been presented.
      if (observation?.headGone && !m.userData.headDestroyed) {
        const at = new T.Vector3();
        destroyZombieHead(m, at);
        g.view.combatEffects.blood.hit(at, new T.Vector3(0, 1, 0), true);
        const near = g.view.camera
          ? at.distanceTo(g.view.camera.position)
          : Infinity;
        if (near < 3.2)
          g.emit?.("gore", { strength: Math.min(1, 1.25 - near / 3.2) });
      }
      if (observation?.crawler && !e.crawler) crippleEnemy(e, g.view, clock);
      // Arms torn by the host: replay each new cut in order (elbow first).
      const missing = (observation?.cuts || 0) & ~(m.userData.cuts || 0);
      if (missing) {
        for (const key of ["forearmL", "armL", "forearmR", "armR"])
          if (missing & LIMBS[key].bit)
            severArm(e, key.slice(-1), key.startsWith("arm"), g.view);
        if (missing & LIMBS.jaw.bit) tearJaw(e, g.view);
      }
      if (observation?.dead) {
        e.dead = true;
        e.attacking = false;
        e.deathTime = deathDuration(e);
        e.fallSide = enemyVariation(e.id) < 0.5 ? -1 : 1;
      }
    }
    // Wait for both the host's removal observation and the complete local
    // collapse. Packet quantization must not shorten the corpse's lifetime.
    for (const e of removed) {
      g.view.scene.remove(e.model);
      releaseZombie(e.model);
      this.remoteEnemies.delete(e.id);
    }
    if (removed.length)
      g.run.enemies = g.run.enemies.filter((e) => !removed.includes(e));
    this.updateRemoteProjectiles(clock);
  }
  updateRemoteProjectiles(clock = this.renderTime) {
    if (!this.remoteProjectiles) return;
    for (const [id, p] of this.remoteProjectiles) {
      if (p.target) continue;
      if (p.removeAt <= clock) {
        this.context.view.scene.remove(p.mesh);
        disposeModel(p.mesh);
        this.remoteProjectiles.delete(id);
        continue;
      }
      p.mesh.visible = clock >= p.bornAt;
      if (!p.mesh.visible) continue;
      while (p.samples.length > 2 && p.samples[1].time <= clock)
        p.samples.shift();
      const a = p.samples[0],
        b = p.samples[1] || a;
      const mix =
        b.time > a.time
          ? T.MathUtils.clamp((clock - a.time) / (b.time - a.time), 0, 1)
          : 1;
      p.mesh.position.set(
        T.MathUtils.lerp(a.x, b.x, mix),
        T.MathUtils.lerp(a.y, b.y, mix),
        T.MathUtils.lerp(a.z, b.z, mix),
      );
    }
  }
}
