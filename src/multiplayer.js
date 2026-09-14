import { WorldReplica } from "./network/replica.js";
import { TeammateView } from "./network/teammates.js";
import { snapshot } from "./network/snapshot.js";

import {
  HOST_EVENTS,
  PEER_EVENTS,
  validEvent,
  validPlayer,
  validSnapshot,
} from "../server/protocol.js";

// Co-op session on top of the relay. The host runs the simulation the solo
// game already has and streams compact snapshots; peers own their movement,
// aim and health, detect their own hits and ask the host to apply them.
import * as T from "three";

import { ENEMIES, WEAPONS } from "./config.js";
import { Navigation } from "./logic.js";

import { disposeModel } from "./resources.js";

const SNAPSHOT_INTERVAL = 1 / 20;
const F_CROUCH = 1,
  F_SPRINT = 2,
  F_FIRING = 4,
  F_DOWN = 8,
  F_AIM = 16;

export class Session {
  constructor(net, { hostId, players, runId = net.room?.run }) {
    this.net = net;
    this.runId = runId;
    this.nextRequest = 1;
    this.pendingPurchase = null;
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
    this.unsubscribe = [];
    this.context = null;
    this.ended = false;
  }
  attach(game) {
    this.context = game;
    this.teammates = new TeammateView(game, this.roster, this.players);
    this.replica = new WorldReplica(
      game,
      {
        id: this.id,
        remoteEnemies: this.remoteEnemies,
        remotePickups: this.remotePickups,
        remoteProjectiles: this.remoteProjectiles,
      },
      {
        ensurePlayer: (...args) => this.ensurePlayer(...args),
        applyPlayerState: (...args) => this.applyPlayerState(...args),
      },
    );
    const on = (type, handler) =>
      this.unsubscribe.push(this.net.on(type, handler));
    on("state", (m) => this.peer && this.applySnapshot(m));
    on("stop", () => this.context?.commands.sessionLost());
    on("ev", (m) => this.onEvent(m));
    on("left", (m) => this.onLeft(m));
    on("close", () => this.onClose());
    for (const [id, name] of this.roster)
      if (id !== this.id) this.ensurePlayer(id, name);
  }
  detach() {
    this.cancelReady?.();
    for (const off of this.unsubscribe) off();
    this.unsubscribe = [];
    for (const p of this.players.values()) this.removePlayerModel(p);
    this.players.clear();
    this.remoteEnemies.clear();
    for (const p of this.remotePickups.values()) {
      this.context.view.scene.remove(p.mesh);
      disposeModel(p.mesh);
    }
    this.remotePickups.clear();
    for (const p of this.remoteProjectiles.values()) {
      this.context.view.scene.remove(p.mesh);
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
      points: 650,
      grenades: 3,
      lastRequest: 0,
      lastGrenade: -Infinity,
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
      seen: -1,
      seed: Math.random() * 10,
    };
    this.players.set(id, p);
    return p;
  }
  ensurePlayerModel(...args) {
    this.teammates.ensurePlayerModel(...args);
  }
  removePlayerModel(...args) {
    this.teammates.removePlayerModel(...args);
  }
  // Positions of every player (me first), for targeting and pickups.
  everyone() {
    const g = this.context;
    const list = [
      {
        id: this.id,
        position: g.run.player.position,
        alive: !g.run.downed && g.run.player.health > 0,
        local: true,
      },
    ];
    for (const p of this.players.values())
      list.push({
        id: p.id,
        position: new T.Vector3(p.tx, p.ty, p.tz),
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
    const g = this.context;
    if (id === this.id) return large ? g.run.largeNavigation : g.run.navigation;
    if (!this.fields.has(id))
      this.fields.set(id, {
        small: new Navigation(
          g.run.world.obstacles,
          g.run.navigation.size,
          1,
          g.run.navigation.clearance,
        ),
        large: new Navigation(
          g.run.world.obstacles,
          g.run.largeNavigation.size,
          1,
          g.run.largeNavigation.clearance,
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
        field.update(p.tx, p.tz);
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
    const g = this.context;
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
        p.mesh.position.y = 0.65 + Math.sin(g.run.time * 3) * 0.15;
      }
    }
  }
  myState() {
    const g = this.context,
      p = g.run.player;
    const flags =
      (p.crouched ? F_CROUCH : 0) |
      (p.sprinting ? F_SPRINT : 0) |
      (g.input.mouse.fire && g.run.shotTimer > 0 ? F_FIRING : 0) |
      (g.run.downed ? F_DOWN : 0) |
      (g.input.mouse.aim ? F_AIM : 0);
    return {
      x: +p.position.x.toFixed(2),
      y: +p.position.y.toFixed(2),
      z: +p.position.z.toFixed(2),
      yaw: +g.input.yaw.toFixed(3),
      pitch: +g.input.pitch.toFixed(3),
      w: g.run.weapons[g.run.slot].id,
      points: Math.max(0, Math.floor(p.points)),
      grenades: p.grenades,
      l: g.run.weapons[g.run.slot].level || 0,
      hp: Math.round(p.health),
      mhp: p.maxHealth,
      f: flags,
    };
  }
  applyInput(m) {
    if (
      !this.host ||
      !this.accepts(m) ||
      !validPlayer(m) ||
      !Object.hasOwn(WEAPONS, m.w)
    )
      return;
    const p = this.ensurePlayer(m.from);
    this.applyPlayerState(p, m);
  }
  applyPlayerState(p, m) {
    if (p.seen < 0) {
      p.x = p.tx = m.x;
      p.z = p.tz = m.z;
      p.yaw = p.tyaw = m.yaw;
    }
    p.seen = this.context.run.time;
    p.tx = m.x;
    p.ty = m.y;
    p.tz = m.z;
    p.tyaw = m.yaw;
    p.pitch = m.pitch;
    p.weapon = m.w;
    p.points = m.points;
    p.grenades = m.grenades;
    p.level = m.l || 0;
    p.health = m.hp;
    p.maxHealth = m.mhp || 100;
    p.flags = m.f || 0;
  }
  updateRemotePlayers(...args) {
    this.teammates.updateRemotePlayers(...args);
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
    return snapshot(
      this.context,
      this.players,
      this.id,
      this.tick,
      this.myState(),
    );
  }
  // Host: hand pickups to whoever stands on them, local or remote.
  collectForPeers() {
    const g = this.context;
    for (const pickup of g.run.pickups) {
      if (pickup.life <= 0) continue;
      for (const p of this.players.values()) {
        if (!p.model || p.flags & F_DOWN) continue;
        if (
          new T.Vector3(p.tx, p.ty, p.tz).distanceTo(pickup.mesh.position) < 1.8
        ) {
          this.send(p.id, { k: "collect", type: pickup.type });
          pickup.life = 0;
          break;
        }
      }
    }
  }
  // ---------- peer: apply ----------
  applySnapshot(s) {
    const g = this.context;
    if (
      !this.peer ||
      !this.accepts(s) ||
      s.from !== this.hostId ||
      !validSnapshot(s) ||
      s.e.some((row) => !Object.hasOwn(ENEMIES, row[1])) ||
      s.p.some(
        (row) => !this.roster.has(row[0]) || !Object.hasOwn(WEAPONS, row[6]),
      ) ||
      s.box?.slice(1).some((id) => id !== null && !Object.hasOwn(WEAPONS, id))
    )
      return;
    if (s.n <= this.lastSnapshotTick || g.run.state === "menu" || !g.run.world)
      return;
    this.lastSnapshotTick = s.n;
    this.replica.apply(s);
  }
  // Peer: move and animate the mirrored horde.
  updateRemoteEnemies(dt) {
    this.replica.updateRemoteEnemies(dt);
  }
  // ---------- events ----------
  onEvent(m) {
    const g = this.context;
    if (!g || !this.accepts(m) || !validEvent(m)) return;
    if (
      this.peer
        ? m.from !== this.hostId || !HOST_EVENTS.has(m.k)
        : !PEER_EVENTS.has(m.k)
    )
      return;
    if (!["playing", "paused"].includes(g.run.state)) return;
    switch (m.k) {
      case "input":
        if (this.host) this.applyInput(m);
        break;
      case "hit": {
        if (!this.host) break;
        const enemy = g.run.enemies.find((e) => e.id === m.id);
        if (!enemy || enemy.dead) break;
        const hit = m.p
          ? {
              position: new T.Vector3(...m.p),
              direction: m.v ? new T.Vector3(...m.v) : null,
            }
          : null;
        g.commands.damageEnemy(enemy, m.d, !!m.h, hit, m.from);
        break;
      }
      case "damage":
        if (this.peer) g.commands.hurt(m.amount);
        break;
      case "score":
        if (this.peer) g.commands.creditKill(m.points, m.head, m.type);
        break;
      case "reward":
        if (this.peer) g.commands.restReward(m.reward, m.grenades ?? 1);
        break;
      case "collect":
        if (this.peer) g.commands.collect({ type: m.type, life: 0 });
        break;
      case "weapon":
        if (this.peer) g.commands.receiveWeapon(m.id);
        break;
      case "purchase":
        if (this.pendingPurchase?.request !== m.request) break;
        this.pendingPurchase = null;
        g.run.player.points = Math.max(0, g.run.player.points - m.cost);
        if (m.weapon) g.commands.receiveWeapon(m.weapon);
        if (m.cost) g.sound.purchase();
        g.commands.updateHUD();
        break;
      case "pause":
        if (this.host) this.broadcast({ k: "pause", paused: m.paused });
        if (m.paused) g.commands.pause(true);
        else g.commands.resume(true);
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
          if (g.run.downed) g.commands.respawn();
        }
        break;
      case "explode":
        if (this.peer)
          g.commands.explosionEffects(new T.Vector3(m.x, m.y, m.z), true);
        break;
      case "end":
        if (this.peer && !this.ended) {
          this.ended = true;
          g.commands.end(!!m.victory, true);
        }
        break;
      case "interact":
        if (this.host) this.hostInteract(m);
        break;
      case "grenade":
        if (this.host && this.validGrenade(m))
          g.commands.throwGrenade(
            new T.Vector3(m.x, m.y, m.z),
            new T.Vector3(m.vx, m.vy, m.vz),
            m.from,
          );
        break;
    }
  }
  // Host applies world interactions on behalf of peers.
  hostInteract(m) {
    const g = this.context,
      actor = this.players.get(m.from),
      interaction = g.run.world.interactions.find((i) => i.id === m.id);
    if (!actor || m.request <= actor.lastRequest) return;
    actor.lastRequest = m.request;
    if (!interaction)
      return this.send(m.from, { k: "purchase", request: m.request, cost: 0 });
    const result = g.commands.applySharedInteraction(
      interaction,
      {
        position: { x: actor.tx, z: actor.tz },
        alive: !(actor.flags & F_DOWN) && actor.health > 0,
        points: actor.points,
      },
      !!m.take,
    );
    if (!result) {
      this.send(m.from, { k: "purchase", request: m.request, cost: 0 });
      return;
    }
    actor.points -= result.cost;
    this.send(m.from, { k: "purchase", request: m.request, ...result });
  }
  requestInteraction(interaction, take = false) {
    if (this.pendingPurchase) return;
    const request = this.nextRequest++;
    this.pendingPurchase = { request };
    this.toHost({ k: "input", ...this.myState() });
    this.toHost({
      k: "interact",
      id: interaction.id,
      request,
      ...(take ? { take: 1 } : {}),
    });
  }
  accepts(message) {
    return (
      !!message &&
      message.run === this.runId &&
      message.from !== this.id &&
      this.roster.has(message.from)
    );
  }
  validGrenade(m) {
    const player = this.players.get(m.from),
      now = this.context.run.time;
    if (
      !player ||
      player.flags & F_DOWN ||
      now - player.lastGrenade < 0.2 ||
      Math.hypot(m.x - player.tx, m.z - player.tz) > 2.5
    )
      return false;
    player.lastGrenade = now;
    return true;
  }
  ready() {
    if (
      !this.net.room ||
      this.net.room.run !== this.runId ||
      this.net.room.host !== this.hostId
    )
      return Promise.reject(new Error("session-lost"));
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (error) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        off();
        this.cancelReady = null;
        error ? reject(error) : resolve();
      };
      const off = this.net.on("go", (m) => {
        if (m.run === this.runId) finish();
      });
      const timer = setTimeout(
        () => finish(new Error("players-not-ready")),
        60000,
      );
      this.cancelReady = () => finish(new Error("session-lost"));
      this.net.ready(this.runId);
    });
  }
  onLeft(m) {
    this.roster.delete(m.id);
    const p = this.players.get(m.id);
    if (p) {
      this.removePlayerModel(p);
      this.players.delete(m.id);
      this.fields.delete(m.id);
      this.context?.emit("toast", {
        title: `${p.name} a quitté la nuit`,
        text: "La partie continue.",
      });
    }
    if (m.id === this.hostId && this.peer && !this.ended) {
      this.ended = true;
      this.context?.emit("toast", {
        title: "L’hôte a quitté la partie",
        text: "Retour au menu.",
      });
      this.context?.commands.sessionLost();
    }
  }
  onClose() {
    if (this.ended) return;
    this.ended = true;
    this.context?.emit("toast", {
      title: "Connexion au relais perdue",
      text: "La partie s’arrête ici.",
    });
    this.context?.commands.sessionLost();
  }
}
