import { bossCount, waveCount } from "../logic.js";
import { assaultSpawnInterval, beginAssaultWave } from "./assault-director.js";

/** survival owns its rules; commands are the explicit cross-system operations. */
export class SurvivalMode {
  constructor(
    { run, view, input, sound, emit },
    { respawn, announce, spawnEnemy, end },
  ) {
    Object.assign(this, { run, view, input, sound, emit });
    this.commands = { respawn, announce, spawnEnemy, end };
  }
  beginWave() {
    this.run.wave++;
    this.run.phase = "wave";
    this.run.remaining = waveCount(this.run.wave, this.run.difficulty.count);
    beginAssaultWave(this.run);
    this.run.spawnTimer = 0.4;
    this.sound.wave();
    const bosses = bossCount(this.run.wave);
    if (this.run.downed) this.commands.respawn();
    this.run.session?.broadcast({ k: "wave" });
    this.commands.announce({
      eyebrow: bosses
        ? "UNE PRÉSENCE APPROCHE"
        : "ILS ONT ENTENDU VOTRE SOUFFLE",
      title: `VAGUE ${String(this.run.wave).padStart(2, "0")}`,
      subtitle:
        this.run.wave === 1
          ? "Visez la tête. Restez en mouvement."
          : bosses > 1
            ? "Deux Archontes marchent parmi eux."
            : bosses
              ? this.run.wave === 10
                ? "L’Archonte garde la dernière vague avant l’extraction."
                : "L’Archonte s’éveille. Visez la tête, gardez vos grenades."
              : "La nuit n’a pas dit son dernier mot.",
      duration: 3200,
    });
    // Bosses join the wave on top of the regular count and must fall too.
    for (let i = 0; i < bosses; i++) this.commands.spawnEnemy("archon");
    if (this.run.wave % 3 === 0)
      this.run.player.grenades = Math.min(5, this.run.player.grenades + 1);
  }
  restReward(reward, grenades = 1) {
    this.run.player.points += reward;
    this.run.player.grenades = Math.min(5, this.run.player.grenades + grenades);
    if (reward)
      this.emit("announce", {
        eyebrow: `+${reward} ESSENCES · +1 GRENADE`,
        title: "UN RÉPIT. PAS LA PAIX.",
        subtitle:
          this.run.wave >= 10
            ? "L’extraction est disponible à la balise. Ou poursuivez la survie."
            : this.run.session?.peer
              ? "Améliorez votre équipement. L’hôte appelle la prochaine vague."
              : "Améliorez votre équipement. N pour appeler la prochaine vague.",
        duration: 3500,
      });
    this.sound.purchase();
  }
  update(dt) {
    if (this.run.session?.host && this.run.session.allDown()) {
      this.commands.end(false);
      return;
    }
    if (this.run.phase === "rest") {
      this.run.phaseTimer -= dt;
      if (this.run.phaseTimer <= 0) this.beginWave();
    } else {
      this.run.spawnTimer -= dt;
      if (
        this.run.remaining > 0 &&
        this.run.enemies.filter((e) => !e.dead).length < 28 &&
        this.run.spawnTimer <= 0
      ) {
        if (this.commands.spawnEnemy()) this.run.remaining--;
        this.run.spawnTimer = assaultSpawnInterval(this.run);
      }
      if (this.run.remaining === 0 && !this.run.enemies.some((e) => !e.dead)) {
        this.run.phase = "rest";
        this.run.phaseTimer = 17;
        const reward = 200 + this.run.wave * 35;
        this.restReward(reward);
        if (this.run.session)
          for (const p of this.run.session.players.values())
            this.run.session.send(p.id, { k: "reward", reward });
      }
    }

    if (this.run.extraction) {
      const beacon = this.run.world.interactions.find(
        (i) => i.kind === "extract",
      );
      const standing = this.run.session
        ? this.run.session.everyone().filter((p) => p.alive)
        : [{ position: this.run.player.position }];
      const near =
        beacon &&
        standing.some(
          (p) =>
            Math.hypot(
              p.position.x - beacon.position.x,
              p.position.z - beacon.position.z,
            ) < 4.5,
        );
      if (near) this.run.extractionTimer -= dt;
      if (this.run.extractionTimer <= 0) this.commands.end(true);
    }
  }
}
