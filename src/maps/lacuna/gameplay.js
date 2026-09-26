import { ENEMIES } from "../../content/enemies.js";
import { Navigation } from "../../logic.js";
import { BRIDGE, PURGE_ZONES, inZone } from "./data.js";
import {
  PHASE,
  MODE,
  createHydraulics,
  canActivate,
  activate,
  advance,
  packHydraulics,
  unpackHydraulics,
} from "./state.js";
import { LacunaAudio } from "./audio.js";

export class LacunaGameplay {
  constructor(context, commands) {
    Object.assign(this, context);
    this.commands = commands;
    this.hydraulics = createHydraulics();
    this.audio = new LacunaAudio(this.sound);
    this.damageTimer = 0;
    this.owner = null;
    this.rewarded = false;
    this.lastWarning = "";
    this.run.world.detail.setHydraulics(this.hydraulics);
  }
  interactionCost(interaction, actor) {
    return canActivate(
      this.hydraulics,
      interaction.action,
      this.run.world.power,
    ) && actor.points >= interaction.cost
      ? interaction.cost
      : null;
  }
  interactionText(interaction) {
    const s = this.hydraulics;
    if (!this.run.world.power) return `${interaction.name} · Courant requis`;
    if (interaction.action === "bell")
      return s.bellCooldown > 0
        ? `Carillon · Recharge ${Math.ceil(s.bellCooldown)} s`
        : "Sonner le carillon · Attirer la horde au quai · 200 essences";
    if (interaction.action === "release") {
      if (s.mastered) return "Grande Décrue accomplie · La ville se souvient";
      if (s.used !== 7)
        return `Grande Décrue · Activez les 3 vannes (${this.usedCount()}/3)`;
    }
    if (s.phase !== PHASE.IDLE) return `${interaction.name} · Cycle en cours`;
    if (
      typeof interaction.action === "number" &&
      s.cooldowns[interaction.action] > 0
    )
      return `${interaction.name} · Recharge ${Math.ceil(s.cooldowns[interaction.action])} s`;
    return interaction.action === "release"
      ? "Déclencher la Grande Décrue · Récompense 1 000 essences"
      : `${interaction.name} · 350 essences · Danger dans 4 s`;
  }
  interact(interaction, actor) {
    if (!activate(this.hydraulics, interaction.action, this.run.world.power))
      return false;
    if (interaction.action !== "bell")
      this.owner =
        actor.id && actor.id !== this.run.session?.id ? actor.id : null;
    this.sync();
    return true;
  }
  usedCount() {
    return [1, 2, 4].filter((bit) => this.hydraulics.used & bit).length;
  }
  update(dt) {
    const s = this.hydraulics,
      { world, player, session } = this.run;
    if (!session?.peer) {
      const people = session?.everyone() || [{ position: player.position }];
      const bridgeClear =
        !people.some((p) => inZone(p.position, BRIDGE, 3)) &&
        !this.run.enemies.some(
          (e) => !e.dead && inZone(e.model.position, BRIDGE, 1),
        );
      const before = s.phase;
      advance(s, dt, {
        enabled: world.power && this.run.wave >= 3 && this.run.phase === "wave",
        bridgeClear,
      });
      if (
        before === PHASE.IDLE &&
        s.phase === PHASE.WARNING &&
        s.mode === MODE.AUTO
      )
        this.owner = null;
    } else {
      // Only predict the displayed clock. Phase, collision and danger always
      // come from the host snapshot, so a client cannot start a purge early.
      s.timer = Math.max(0, s.timer - dt);
      s.cooldowns = s.cooldowns.map((value) => Math.max(0, value - dt));
      s.bell = Math.max(0, s.bell - dt);
      s.bellCooldown = Math.max(0, s.bellCooldown - dt);
    }
    this.sync();
    this.damageTimer -= dt;
    if (s.phase === PHASE.FLOOD && this.damageTimer <= 0) {
      this.damageTimer = 0.4;
      const zone = PURGE_ZONES[s.zone];
      if (inZone(player.position, zone) && !this.run.downed)
        this.commands.hurt(7.2);
      if (!session?.peer) {
        for (const enemy of [...this.run.enemies]) {
          if (enemy.dead || !inZone(enemy.model.position, zone)) continue;
          const damage = ENEMIES[enemy.type].boss
            ? 19
            : 58 + Math.min(50, this.run.wave * 2);
          this.commands.damageEnemy(enemy, damage, false, null, this.owner);
        }
      }
    }
    this.audio.update(s, player.position, this.run.time);
  }
  sync() {
    const s = this.hydraulics,
      w = this.run.world;
    w.detail.setHydraulics(s);
    const blocked = s.bridgeClosed || !w.detail.bridgeOpen;
    if (w.lacunaBridgeObstacle.active !== blocked) {
      w.lacunaBridgeObstacle.active = blocked;
      this.lureFields = null;
      this.commands.updateNavigation(true);
    }
    const key = `${s.mode}:${s.zone}:${s.cycle}:${s.sequence}`;
    if (s.bell > 0 && !this.bellSounded) {
      this.audio.ring();
      this.emit("toast", {
        title: "LE CARILLON DES ABSENTS",
        text: "La horde converge vers le quai. Préparez la vanne 01.",
        duration: 4000,
      });
    }
    this.bellSounded = s.bell > 0;
    if (s.phase === PHASE.IDLE) this.lastWarning = "";
    if (s.phase === PHASE.WARNING && key !== this.lastWarning) {
      this.lastWarning = key;
      this.emit("toast", {
        title: s.mode === MODE.RELEASE ? "LA GRANDE DÉCRUE" : "SIRÈNE DE PURGE",
        text: `${PURGE_ZONES[s.zone].name} · Quittez les bandes jaunes. Les deux ponts de pierre restent ouverts.`,
        duration: 4800,
      });
    }
    if (s.mastered && !this.rewarded) {
      this.rewarded = true;
      this.run.player.points += 1000;
      this.run.player.grenades = Math.min(5, this.run.player.grenades + 2);
      this.emit("announce", {
        eyebrow: "+1 000 ESSENCES · +2 GRENADES",
        title: "LES GARDIENS DE LACUNA",
        subtitle:
          "Les trois vannes ont répondu. Vous avez dompté la dernière crue.",
        duration: 5000,
      });
      this.sound.powerOn();
    }
  }
  spawnAnchors() {
    const people = (
      this.run.session?.everyone() || [
        { position: this.run.player.position, alive: true },
      ]
    ).filter((p) => p.alive);
    if (!people.length) return this.run.world.spawnPoints;
    const distance = ([x, z]) =>
      Math.min(
        ...people.map((p) => Math.hypot(p.position.x - x, p.position.z - z)),
      );
    const safe = this.run.world.spawnPoints.filter(
      (anchor) => distance(anchor) >= 15,
    );
    const close = safe.filter((anchor) => distance(anchor) < 43);
    return close.length
      ? close
      : safe.length
        ? safe
        : this.run.world.spawnPoints;
  }
  enemyFocus(enemy, focus) {
    if (this.hydraulics.bell <= 0 || ENEMIES[enemy.type].boss) return focus;
    const p = enemy.model.position;
    const people = this.run.session
      ?.everyone()
      .filter((person) => person.alive) || [
      { position: this.run.player.position },
    ];
    if (
      people.some(
        ({ position }) => Math.hypot(position.x - p.x, position.z - p.z) < 4,
      ) ||
      Math.hypot(p.x - 18, p.z - 4) > 52
    )
      return focus;
    if (!this.lureFields)
      this.lureFields = [0.36, 0.6].map((radius) => {
        const field = new Navigation(
          this.run.world.obstacles,
          this.run.navigation.size,
          1,
          radius,
        );
        field.update(18, 4);
        return field;
      });
    return {
      bait: true,
      local: false,
      position: { x: 18, y: 0, z: 4 },
      navigation:
        this.lureFields[(ENEMIES[enemy.type].radius || 0.36) > 0.4 ? 1 : 0],
    };
  }
  snapshot() {
    return packHydraulics(this.hydraulics);
  }
  applySnapshot(packet) {
    const next = unpackHydraulics(packet);
    if (!next) return;
    this.hydraulics = next;
    this.sync();
  }
  hud() {
    const s = this.hydraulics,
      player = this.run.player.position;
    const valves = PURGE_ZONES.filter((_, i) => !(s.used & (1 << i))).sort(
      (a, b) =>
        Math.hypot(player.x - a.valve[0], player.z - a.valve[1]) -
        Math.hypot(player.x - b.valve[0], player.z - b.valve[1]),
    );
    const target = !this.run.world.power
      ? { label: "COURANT · POSTE DES VANNES", position: [-54, -44] }
      : valves.length
        ? { label: `VANNE · ${valves[0].name}`, position: valves[0].valve }
        : { label: "GRANDE DÉCRUE · CARILLON", position: [19, -2.5] };
    return {
      phase: s.phase,
      timer: Math.ceil(s.timer),
      zone: PURGE_ZONES[s.zone].name,
      bridge: this.run.world.lacunaBridgeObstacle.active,
      used: this.usedCount(),
      mastered: s.mastered,
      power: this.run.world.power,
      armed: this.run.wave >= 3,
      bell: Math.ceil(s.bell),
      waiting: s.phase === PHASE.WARNING && s.timer === 0,
      danger: s.phase === PHASE.FLOOD && inZone(player, PURGE_ZONES[s.zone]),
      guide: target.label,
      distance: Math.round(
        Math.hypot(
          player.x - target.position[0],
          player.z - target.position[1],
        ),
      ),
      bearing:
        Math.atan2(
          player.x - target.position[0],
          player.z - target.position[1],
        ) - this.input.yaw,
    };
  }
  setPaused(paused) {
    this.audio.setPaused(paused);
  }
  dispose() {
    this.audio.dispose();
  }
}
