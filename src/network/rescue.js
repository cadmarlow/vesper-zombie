import * as T from "three";
import { PLAYER_FLAGS } from "../../server/protocol.js";

export const REVIVE_SECONDS = 3;
export const BLEEDOUT_SECONDS = 45;
const { DOWN, DEAD } = PLAYER_FLAGS;
/** The host alone advances rescue timers and confirms a revive. */
export class Rescue {
  constructor(session) {
    this.session = session;
    this.states = new Map();
  }
  actors() {
    const s = this.session,
      g = s.context;
    return [
      {
        id: s.id,
        name: s.roster.get(s.id),
        position: g.run.player.position,
        down: g.run.downed,
        dead: g.run.eliminated,
        health: g.run.player.health,
        maxHealth: g.run.player.maxHealth,
        intent: this.intent(),
      },
      ...[...s.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        position: new T.Vector3(p.tx, p.ty, p.tz),
        down: !!(p.flags & DOWN),
        dead: !!(p.flags & DEAD),
        health: p.health,
        maxHealth: p.maxHealth,
        intent: p.rescueTarget || 0,
      })),
    ];
  }
  canReach(a, b) {
    if (a.position.distanceTo(b.position) > 2.5) return false;
    const g = this.session.context,
      origin = a.position.clone();
    origin.y = 0.7;
    const direction = b.position.clone();
    direction.y = 0.7;
    direction.sub(origin);
    const distance = direction.length();
    return (
      distance < 0.01 ||
      g.commands.obstacleDistance(
        origin,
        direction.divideScalar(distance),
        distance,
      ) >=
        distance - 0.1
    );
  }
  nearby() {
    const s = this.session,
      g = s.context;
    if (g.run.downed || g.run.state !== "playing") return null;
    const a = { position: g.run.player.position };
    return (
      [...s.players.values()]
        .filter((p) => p.flags & DOWN && !(p.flags & DEAD))
        .map((p) => ({
          id: p.id,
          name: p.name,
          position: new T.Vector3(p.tx, p.ty, p.tz),
        }))
        .filter((p) => this.canReach(a, p))
        .sort(
          (a, b) =>
            a.position.distanceToSquared(g.run.player.position) -
            b.position.distanceToSquared(g.run.player.position),
        )[0] || null
    );
  }
  intent() {
    const g = this.session.context;
    return (g.input.keys.has("KeyE") || g.input.touchInteract) &&
      !g.input.mouse.fire
      ? this.nearby()?.id || 0
      : 0;
  }
  prompt() {
    const p = this.nearby();
    return p
      ? `Maintenir ${this.session.context.run.touch ? "pour réanimer" : "E · Réanimer"} ${p.name}`
      : null;
  }
  update(dt) {
    const s = this.session,
      g = s.context;
    if (!s.host) return;
    const actors = this.actors();
    for (const [id] of this.states)
      if (!actors.some((a) => a.id === id && a.down)) this.states.delete(id);
    for (const target of actors.filter((a) => a.down)) {
      let state = this.states.get(target.id);
      if (!state) {
        state = {
          remaining: BLEEDOUT_SECONDS,
          progress: 0,
          actor: 0,
          dead: !!target.dead,
        };
        this.states.set(target.id, state);
        const notice = {
          title: `${target.name} est à terre`,
          text: "Rejoignez votre coéquipier pour le réanimer.",
        };
        g.emit("toast", notice);
        s.broadcast({ k: "toast", a: notice });
      }
      if (state.dead) continue;
      state.remaining = Math.max(0, state.remaining - dt);
      if (state.remaining === 0) {
        state.dead = true;
        state.progress = 0;
        state.actor = 0;
        if (target.id === s.id) g.commands.eliminate();
        else {
          const p = s.players.get(target.id);
          p.flags |= DEAD;
          s.send(target.id, { k: "eliminated" });
        }
        continue;
      }
      const rescuers = actors.filter(
        (a) =>
          !a.down &&
          a.health > 0 &&
          a.intent === target.id &&
          this.canReach(a, target),
      );
      const actor = rescuers.find((a) => a.id === state.actor) || rescuers[0];
      if (!actor) {
        state.progress = 0;
        state.actor = 0;
        continue;
      }
      if (actor.id !== state.actor || actor.health < state.health)
        state.progress = 0;
      state.actor = actor.id;
      state.health = actor.health;
      state.progress = Math.min(1, state.progress + dt / REVIVE_SECONDS);
      if (state.progress < 1) continue;
      const health = Math.ceil(target.maxHealth * 0.5);
      if (target.id === s.id) g.commands.revive();
      else {
        const p = s.players.get(target.id);
        p.flags &= ~(DOWN | DEAD);
        p.health = health;
        p.reviveUntil = g.run.time + 3;
        s.send(target.id, { k: "revived" });
      }
      this.states.delete(target.id);
      const notice = {
        title: `${target.name} est de retour`,
        text: `Réanimé par ${actor.name}.`,
      };
      g.emit("toast", notice);
      s.broadcast({ k: "toast", a: notice });
    }
  }
  snapshot() {
    return [...this.states].map(([id, s]) => [
      id,
      +s.remaining.toFixed(2),
      +s.progress.toFixed(3),
      s.actor,
      s.dead ? 1 : 0,
    ]);
  }
  receive(rows = []) {
    this.states = new Map(
      rows.map(([id, remaining, progress, actor, dead]) => [
        id,
        { remaining, progress, actor, dead: !!dead },
      ]),
    );
  }
  status(id) {
    return this.states.get(id);
  }
  hud() {
    const s = this.session,
      g = s.context,
      own = this.status(s.id);
    const helping = [...this.states].find(([, state]) => state.actor === s.id);
    return {
      remaining: own?.remaining ?? BLEEDOUT_SECONDS,
      dead: g.run.eliminated || own?.dead,
      progress: own?.progress || helping?.[1].progress || 0,
      helping: helping ? s.roster.get(helping[0]) : null,
      rescuer: own?.actor ? s.roster.get(own.actor) : null,
    };
  }
}
