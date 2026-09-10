// Co-op session on top of the relay. The host runs the simulation the solo
// game already has and streams compact snapshots; peers own their movement,
// aim and health, detect their own hits and ask the host to apply them.
import * as T from "three";
import {
  zombieModel,
  animateZombie,
  releaseZombie,
  destroyZombieHead,
} from "./creatures.js";
import {
  survivorModel,
  survivorWeapon,
  animateSurvivor,
  TEAM_COLORS,
} from "./survivor.js";
import { ENEMIES, WEAPONS } from "./config.js";
import { Navigation } from "./logic.js";
import { setSurfaceQuality } from "./surfaces.js";
import { disposeModel } from "./world.js";
import { glow, glowSprite, mesh } from "./assets.js";

const ENEMY_TYPES = Object.keys(ENEMIES);
const WEAPON_IDS = Object.keys(WEAPONS);
const PICKUP_TYPES = ["health", "ammo", "double", "insta"];
const SNAPSHOT_INTERVAL = 1 / 20;
const F_CROUCH = 1,
  F_SPRINT = 2,
  F_FIRING = 4,
  F_DOWN = 8,
  F_AIM = 16;

function nameSprite(name) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext("2d");
  ctx.font = "bold 30px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#0b1316cc";
  ctx.fillRect(0, 8, 256, 48);
  ctx.fillStyle = "#e8d9c4";
  ctx.fillText(name.toUpperCase(), 128, 32, 236);
  const texture = new T.CanvasTexture(c);
  texture.colorSpace = T.SRGBColorSpace;
  const sprite = new T.Sprite(
    new T.SpriteMaterial({ map: texture, transparent: true, depthTest: false }),
  );
  sprite.scale.set(1.4, 0.35, 1);
  sprite.position.y = 2.15;
  sprite.renderOrder = 5;
  return sprite;
}

export class Session {
  constructor(net, { hostId, players }) {
    this.net = net;
    this.id = net.id;
    this.hostId = hostId;
    this.host = hostId === net.id;
    this.peer = !this.host;
    this.roster = new Map(players.map((p) => [p.id, p.name]));
    this.players = new Map(); // remote players (everyone but me)
    this.fields = new Map(); // host: flow fields per player id
    this.remoteEnemies = new Map(); // peer: enemy id → entry in game.enemies
    this.remotePickups = new Map();
    this.remoteProjectiles = new Map();
    this.snapshotTimer = 0;
    this.inputTimer = 0;
    this.tick = 0;
    this.lastSnapshotTick = -1;
    this.nextEnemyId = 1;
    this.nextPickupId = 1;
    this.nextProjectileId = 1;
    this.unsubscribe = [];
    this.game = null;
    this.ended = false;
  }
  attach(game) {
    this.game = game;
    const on = (type, handler) =>
      this.unsubscribe.push(this.net.on(type, handler));
    on("input", (m) => this.host && this.applyInput(m));
    on("state", (m) => this.peer && this.applySnapshot(m));
    on("ev", (m) => this.onEvent(m));
    on("left", (m) => this.onLeft(m));
    on("close", () => this.onClose());
    for (const [id, name] of this.roster)
      if (id !== this.id) this.ensurePlayer(id, name);
  }
  detach() {
    for (const off of this.unsubscribe) off();
    this.unsubscribe = [];
    for (const p of this.players.values()) this.removePlayerModel(p);
    this.players.clear();
    this.remoteEnemies.clear();
    for (const p of this.remotePickups.values()) {
      this.game.scene.remove(p.mesh);
      disposeModel(p.mesh);
    }
    this.remotePickups.clear();
    for (const p of this.remoteProjectiles.values()) {
      this.game.scene.remove(p.mesh);
      disposeModel(p.mesh);
    }
    this.remoteProjectiles.clear();
    this.fields.clear();
  }
  // ---------- roster ----------
  ensurePlayer(id, name) {
    if (this.players.has(id)) return this.players.get(id);
    const p = {
      id,
      name: name || this.roster.get(id) || "Survivant",
      model: null,
      label: null,
      gun: null,
      gunId: null,
      x: 0,
      y: 1.7,
      z: 0,
      yaw: 0,
      pitch: 0,
      tx: 0,
      ty: 1.7,
      tz: 0,
      tyaw: 0,
      speed: 0,
      weapon: "vigil",
      level: 0,
      health: 100,
      maxHealth: 100,
      flags: 0,
      seen: 0,
      seed: Math.random() * 10,
    };
    this.players.set(id, p);
    return p;
  }
  ensurePlayerModel(p) {
    if (p.model || !this.game?.world) return;
    const seat = [...this.roster.keys()].indexOf(p.id);
    const model = survivorModel(
      TEAM_COLORS[Math.max(0, seat) % TEAM_COLORS.length],
    );
    setSurfaceQuality(model, this.game.settings.quality);
    model.position.set(p.tx, 0, p.tz);
    p.label = nameSprite(p.name);
    model.add(p.label);
    this.game.scene.add(model);
    p.model = model;
  }
  removePlayerModel(p) {
    if (!p.model) return;
    this.game.scene.remove(p.model);
    if (p.label) {
      p.label.material.map.dispose();
      p.label.material.dispose();
    }
    disposeModel(p.model);
    p.model = p.gun = p.label = null;
  }
  // Positions of every player (me first), for targeting and pickups.
  everyone() {
    const g = this.game;
    const list = [
      {
        id: this.id,
        position: g.player.position,
        alive: !g.downed && g.player.health > 0,
        local: true,
      },
    ];
    for (const p of this.players.values())
      list.push({
        id: p.id,
        position: p.model ? p.model.position : new T.Vector3(p.tx, 0, p.tz),
        alive: !(p.flags & F_DOWN) && p.health > 0,
        local: false,
      });
    return list;
  }
  nearest(position) {
    let best = null,
      bestDistance = Infinity;
    for (const p of this.everyone()) {
      if (!p.alive) continue;
      const d = Math.hypot(
        p.position.x - position.x,
        p.position.z - position.z,
      );
      if (d < bestDistance) {
        bestDistance = d;
        best = p;
      }
    }
    return best;
  }
  field(id, large) {
    const g = this.game;
    if (id === this.id) return large ? g.largeNavigation : g.navigation;
    if (!this.fields.has(id))
      this.fields.set(id, {
        small: new Navigation(
          g.world.obstacles,
          g.navigation.size,
          1,
          g.navigation.clearance,
        ),
        large: new Navigation(
          g.world.obstacles,
          g.largeNavigation.size,
          1,
          g.largeNavigation.clearance,
        ),
      });
    const f = this.fields.get(id);
    return large ? f.large : f.small;
  }
  updateFields(rebuild) {
    for (const p of this.players.values()) {
      if (!p.model) continue;
      for (const field of [this.field(p.id, false), this.field(p.id, true)]) {
        if (rebuild) field.rebuild();
        field.update(p.model.position.x, p.model.position.z);
      }
    }
  }
  allDown() {
    return this.everyone().every((p) => !p.alive);
  }
  // ---------- messaging ----------
  send(to, ev) {
    this.net.relay(to, { t: "ev", ...ev });
  }
  broadcast(ev) {
    this.net.relay("all", { t: "ev", ...ev });
  }
  toHost(ev) {
    this.net.relay("host", { t: "ev", ...ev });
  }
  // Peer → host: my hit on an enemy (damage already includes my perks).
  sendHit(enemy, damage, head, hit) {
    this.toHost({
      k: "hit",
      id: enemy.id,
      d: Math.round(damage),
      h: head ? 1 : 0,
      p: hit?.position
        ? hit.position.toArray().map((v) => +v.toFixed(2))
        : null,
      v: hit?.direction
        ? hit.direction.toArray().map((v) => +v.toFixed(3))
        : null,
    });
  }
  // ---------- per-frame ----------
  update(dt) {
    const g = this.game;
    this.tick++;
    this.updateRemotePlayers(dt);
    if (this.host) {
      this.snapshotTimer -= dt;
      if (this.snapshotTimer <= 0) {
        this.snapshotTimer = SNAPSHOT_INTERVAL;
        this.net.relay("all", this.snapshot());
      }
      this.collectForPeers();
    } else {
      this.inputTimer -= dt;
      if (this.inputTimer <= 0) {
        this.inputTimer = SNAPSHOT_INTERVAL;
        this.toHost({ k: "input", ...this.myState() });
      }
      for (const p of this.remoteProjectiles.values())
        p.mesh.position.lerp(p.target, Math.min(1, dt * 14));
      for (const p of this.remotePickups.values()) {
        p.mesh.rotation.y += dt * 1.5;
        p.mesh.position.y = 0.65 + Math.sin(g.time * 3) * 0.15;
      }
    }
  }
  myState() {
    const g = this.game,
      p = g.player;
    const flags =
      (p.crouched ? F_CROUCH : 0) |
      (p.sprinting ? F_SPRINT : 0) |
      (g.mouse.fire && g.shotTimer > 0 ? F_FIRING : 0) |
      (g.downed ? F_DOWN : 0) |
      (g.mouse.aim ? F_AIM : 0);
    return {
      x: +p.position.x.toFixed(2),
      y: +p.position.y.toFixed(2),
      z: +p.position.z.toFixed(2),
      yaw: +g.yaw.toFixed(3),
      pitch: +g.pitch.toFixed(3),
      w: WEAPON_IDS.indexOf(g.weapon.id),
      l: g.weapon.level || 0,
      hp: Math.round(p.health),
      mhp: p.maxHealth,
      f: flags,
    };
  }
  applyInput(m) {
    const p = this.ensurePlayer(m.from);
    this.applyPlayerState(p, m);
  }
  applyPlayerState(p, m) {
    if (!p.seen) {
      p.x = p.tx = m.x;
      p.z = p.tz = m.z;
      p.yaw = p.tyaw = m.yaw;
    }
    p.seen = this.game.time;
    p.tx = m.x;
    p.ty = m.y;
    p.tz = m.z;
    p.tyaw = m.yaw;
    p.pitch = m.pitch;
    p.weapon = WEAPON_IDS[m.w] || "vigil";
    p.level = m.l || 0;
    p.health = m.hp;
    p.maxHealth = m.mhp || 100;
    p.flags = m.f || 0;
  }
  updateRemotePlayers(dt) {
    const g = this.game;
    for (const p of this.players.values()) {
      this.ensurePlayerModel(p);
      if (!p.model) continue;
      const m = p.model;
      const before = m.position.x,
        beforeZ = m.position.z;
      m.position.x = T.MathUtils.damp(m.position.x, p.tx, 14, dt);
      m.position.z = T.MathUtils.damp(m.position.z, p.tz, 14, dt);
      m.position.y = T.MathUtils.damp(
        m.position.y,
        Math.max(0, p.ty - 1.7),
        14,
        dt,
      );
      let delta = p.tyaw - m.rotation.y;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      m.rotation.y += delta * Math.min(1, dt * 14);
      const moved = Math.hypot(m.position.x - before, m.position.z - beforeZ);
      p.speed = T.MathUtils.damp(p.speed, dt > 0 ? moved / dt : 0, 8, dt);
      const down = p.flags & F_DOWN;
      m.visible = !down;
      const crouch = !!(p.flags & F_CROUCH);
      const gun = survivorWeapon(m, p.weapon, p.level > 0);
      animateSurvivor(m, g.time + p.seed, p.speed / 3.65, {
        crouch,
        pitch: p.pitch,
        firing: !!(p.flags & F_FIRING),
      });
      if (gun)
        gun.userData.flash.visible =
          !!(p.flags & F_FIRING) && Math.random() < 0.5;
    }
  }
  teamStatus() {
    return [...this.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      health: p.health,
      maxHealth: p.maxHealth,
      down: !!(p.flags & F_DOWN),
      weapon: WEAPONS[p.weapon]?.name || "",
    }));
  }
  // ---------- host: snapshot ----------
  snapshot() {
    const g = this.game;
    const box = g.world.interactions.find((i) => i.kind === "box");
    const me = this.myState();
    return {
      t: "state",
      n: this.tick,
      wave: g.wave,
      phase: g.phase,
      timer: +g.phaseTimer.toFixed(1),
      remaining: g.remaining,
      power: g.world.power ? 1 : 0,
      doors: g.world.doors.map((d) => (d.open ? 1 : 0)),
      box: box
        ? [
            box.busy ? 1 : 0,
            box.offered ? WEAPON_IDS.indexOf(box.offered) : -1,
            box.display ? WEAPON_IDS.indexOf(box.display.name.slice(7)) : -1,
          ]
        : null,
      extraction: g.extraction ? Math.ceil(g.extractionTimer) : -1,
      e: g.enemies.map((e) => [
        e.id,
        ENEMY_TYPES.indexOf(e.type),
        +e.model.position.x.toFixed(2),
        +e.model.position.z.toFixed(2),
        +e.model.rotation.y.toFixed(2),
        Math.max(0, Math.round(e.health)),
        e.dead ? 1 : 0,
        e.attacking ? 1 : 0,
        e.model.userData.headDestroyed ? 1 : 0,
        e.stagger > 0 ? 1 : 0,
        e.maxHealth,
      ]),
      p: [
        [
          this.id,
          me.x,
          me.y,
          me.z,
          me.yaw,
          me.pitch,
          me.w,
          me.l,
          me.hp,
          me.mhp,
          me.f,
        ],
        ...[...this.players.values()].map((p) => [
          p.id,
          p.tx,
          p.ty,
          p.tz,
          p.tyaw,
          p.pitch,
          WEAPON_IDS.indexOf(p.weapon),
          p.level,
          p.health,
          p.maxHealth,
          p.flags,
        ]),
      ],
      k: g.pickups.map((p) => [
        p.id,
        PICKUP_TYPES.indexOf(p.type),
        +p.mesh.position.x.toFixed(2),
        +p.mesh.position.z.toFixed(2),
      ]),
      j: g.projectiles.map((p) => [
        p.id,
        p.type === "grenade" ? 0 : 1,
        +p.mesh.position.x.toFixed(2),
        +p.mesh.position.y.toFixed(2),
        +p.mesh.position.z.toFixed(2),
      ]),
    };
  }
  // Host: hand pickups to whoever stands on them, local or remote.
  collectForPeers() {
    const g = this.game;
    for (const pickup of g.pickups) {
      if (pickup.life <= 0) continue;
      for (const p of this.players.values()) {
        if (!p.model || p.flags & F_DOWN) continue;
        if (p.model.position.distanceTo(pickup.mesh.position) < 1.8) {
          this.send(p.id, { k: "collect", type: pickup.type });
          pickup.life = 0;
          break;
        }
      }
    }
  }
  // ---------- peer: apply ----------
  applySnapshot(s) {
    const g = this.game;
    if (s.n <= this.lastSnapshotTick || g.state === "menu" || !g.world) return;
    this.lastSnapshotTick = s.n;
    if (s.wave !== g.wave) g.wave = s.wave;
    g.phase = s.phase;
    g.phaseTimer = s.timer;
    g.remaining = s.remaining;
    if (s.power && !g.world.power) {
      g.world.setPower();
      g.sound.powerOn();
    }
    s.doors.forEach((open, i) => {
      const door = g.world.doors[i];
      if (open && door && !door.open) g.world.openDoor(door);
    });
    const box = g.world.interactions.find((i) => i.kind === "box");
    if (box && s.box) {
      const [busy, offered, display] = s.box;
      box.busy = !!busy;
      box.offered = offered >= 0 ? WEAPON_IDS[offered] : null;
      const wanted = display >= 0 ? WEAPON_IDS[display] : null;
      if (wanted && box.display?.name !== `weapon-${wanted}`)
        g.world.showBoxWeapon(wanted);
      else if (!wanted && box.display) {
        box.root.remove(box.display);
        box.display = null;
      }
    }
    g.extraction = s.extraction >= 0;
    g.extractionTimer = Math.max(0, s.extraction);
    // players
    for (const row of s.p) {
      const [id, x, y, z, yaw, pitch, w, l, hp, mhp, f] = row;
      if (id === this.id) continue;
      const p = this.ensurePlayer(id);
      this.applyPlayerState(p, { x, y, z, yaw, pitch, w, l, hp, mhp, f });
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
        const type = ENEMY_TYPES[typeIndex] || "walker";
        const model = zombieModel(
          type,
          g.touch || g.settings.quality === "low" ? "lite" : "full",
        );
        setSurfaceQuality(model, g.settings.quality);
        model.position.set(x, -1.9, z);
        model.rotation.y = yaw;
        g.scene.add(model);
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
        g.enemies.push(e);
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
        g.combatEffects.blood.hit(at, new T.Vector3(0, 1, 0), true);
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
        g.scene.remove(e.model);
        releaseZombie(e.model);
        g.enemies = g.enemies.filter((x) => x !== e);
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
        g.scene.add(model);
        this.remotePickups.set(id, { mesh: model, type });
      }
    }
    for (const [id, p] of this.remotePickups)
      if (!pickupsSeen.has(id)) {
        g.scene.remove(p.mesh);
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
        g.scene.add(model);
        p = { mesh: model, target: new T.Vector3(x, y, z) };
        this.remoteProjectiles.set(id, p);
      }
      p.target.set(x, y, z);
    }
    for (const [id, p] of this.remoteProjectiles)
      if (!projSeen.has(id)) {
        g.scene.remove(p.mesh);
        disposeModel(p.mesh);
        this.remoteProjectiles.delete(id);
      }
  }
  // Peer: move and animate the mirrored horde.
  updateRemoteEnemies(dt) {
    const g = this.game;
    for (const e of g.enemies) {
      e.age += dt;
      if (e.dead) {
        e.deathTime -= dt;
        e.model.rotation.x = Math.max(
          -Math.PI / 2 + 0.06,
          e.model.rotation.x - dt * 3.4,
        );
        e.model.rotation.z =
          (e.fallSide || 1) * 0.12 * (1 - Math.max(0, e.deathTime - 1.8) / 0.6);
        if (e.deathTime < 0.65) e.model.position.y -= dt * 0.65;
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
        m.position.x - g.player.position.x,
        m.position.z - g.player.position.z,
      );
      if (g.time >= (e.nextDetailCheck || 0)) {
        e.nextDetailCheck = g.time + 0.4;
        g.applyDetail(e, d);
      }
      animateZombie(
        m,
        g.time + e.seed,
        e.speed / 1.65,
        e.attacking,
        Math.min(0.16, e.stagger),
      );
      if (e.type === "wraith")
        m.visible = Math.sin(g.time * 5 + e.seed) > 0.05 || d < 4;
    }
    const gone = g.enemies.filter((e) => e.dead && e.deathTime <= 0);
    for (const e of gone) {
      g.scene.remove(e.model);
      releaseZombie(e.model);
      this.remoteEnemies.delete(e.id);
    }
    g.enemies = g.enemies.filter((e) => !gone.includes(e));
  }
  // ---------- events ----------
  onEvent(m) {
    const g = this.game;
    if (!g || g.state === "menu") return;
    switch (m.k) {
      case "input":
        if (this.host) this.applyInput(m);
        break;
      case "hit": {
        if (!this.host) break;
        const enemy = g.enemies.find((e) => e.id === m.id);
        if (!enemy || enemy.dead) break;
        const hit = m.p
          ? {
              position: new T.Vector3(...m.p),
              direction: m.v ? new T.Vector3(...m.v) : null,
            }
          : null;
        g.damageEnemy(enemy, m.d, !!m.h, hit, m.from);
        break;
      }
      case "damage":
        if (this.peer) g.hurt(m.amount);
        break;
      case "score":
        if (this.peer) g.creditKill(m.points, m.head, m.type);
        break;
      case "reward":
        if (this.peer) g.restReward(m.reward, m.grenades ?? 1);
        break;
      case "collect":
        if (this.peer) g.collect({ type: m.type, life: 0 });
        break;
      case "weapon":
        if (this.peer) g.receiveWeapon(m.id);
        break;
      case "refund":
        if (this.peer) g.player.points += m.cost;
        break;
      case "announce":
        if (this.peer) g.emit("announce", m.a);
        break;
      case "toast":
        if (this.peer) g.emit("toast", m.a);
        break;
      case "wave":
        if (this.peer) {
          g.sound.wave();
          if (g.downed) g.respawn();
        }
        break;
      case "explode":
        if (this.peer) g.explosionEffects(new T.Vector3(m.x, m.y, m.z), true);
        break;
      case "end":
        if (this.peer && !this.ended) {
          this.ended = true;
          g.end(!!m.victory, true);
        }
        break;
      case "interact":
        if (this.host) this.hostInteract(m);
        break;
      case "grenade":
        if (this.host)
          g.throwGrenade(
            new T.Vector3(m.x, m.y, m.z),
            new T.Vector3(m.vx, m.vy, m.vz),
            m.from,
          );
        break;
    }
  }
  // Host applies world interactions on behalf of peers.
  hostInteract(m) {
    const g = this.game,
      i = g.world.interactions[m.index];
    if (!i) return;
    const refund = () =>
      m.cost && this.send(m.from, { k: "refund", cost: m.cost });
    switch (i.kind) {
      case "door":
        if (i.open) return refund();
        g.world.openDoor(i);
        g.updateNavigation(true);
        break;
      case "power":
        if (g.world.power) return;
        g.world.setPower();
        g.sound.powerOn();
        break;
      case "box":
        if (m.take) {
          if (!i.busy || !i.offered) return;
          this.send(m.from, { k: "weapon", id: i.offered });
          i.busy = false;
          i.offered = null;
          i.timer = 0;
          if (i.display) {
            i.root.remove(i.display);
            i.display = null;
          }
          return;
        }
        if (i.busy) return refund();
        i.busy = true;
        i.timer = 3.2;
        i.offerTimer = 0;
        g.sound.box();
        break;
      case "extract":
        g.requestExtraction();
        break;
    }
  }
  onLeft(m) {
    const p = this.players.get(m.id);
    if (p) {
      this.removePlayerModel(p);
      this.players.delete(m.id);
      this.fields.delete(m.id);
      this.game?.emit("toast", {
        title: `${p.name} a quitté la nuit`,
        text: "La partie continue.",
      });
    }
    if (m.id === this.hostId && this.peer && !this.ended) {
      this.ended = true;
      this.game?.emit("toast", {
        title: "L’hôte a quitté la partie",
        text: "Retour au menu.",
      });
      this.game?.sessionLost();
    }
  }
  onClose() {
    if (this.ended) return;
    this.ended = true;
    this.game?.emit("toast", {
      title: "Connexion au relais perdue",
      text: "La partie s’arrête ici.",
    });
    this.game?.sessionLost();
  }
}
