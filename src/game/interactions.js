import {
  interactionDistance,
  sharedInteractionCost,
} from "./interaction-rules.js";

import * as T from "three";

import { WEAPONS, PERKS, UPGRADE } from "../config.js";
import {
  newWeapon,
  magazine,
  reserveCapacity,
  upgradeCost,
  damageMultiplier,
  MAX_UPGRADE,
  mysteryWeapon,
} from "../logic.js";

/** interactions owns its rules; commands are the explicit cross-system operations. */
export class InteractionSystem {
  constructor(
    { run, view, input, sound, emit },
    { updateHUD, updateNavigation, burst, setGun, announce },
  ) {
    Object.assign(this, { run, view, input, sound, emit });
    this.commands = { updateHUD, updateNavigation, burst, setGun, announce };
  }
  interact() {
    if (this.run.state !== "playing" || this.run.downed) return;
    // A shared purchase is debited on acknowledgement. Do not spend the same
    // balance on a local machine while that confirmation is still in flight.
    if (this.run.session?.pendingPurchase) return;
    if (this.run.session?.rescue?.nearby()) return;
    const i = this.nearInteraction();
    if (!i) return;
    const actor = {
      position: this.run.player.position,
      alive: !this.run.downed,
      points: this.run.player.points,
    };
    if (i.kind === "door" && i.open) return;
    if (i.kind === "recording") {
      i.read = true;
      this.sound.click();
      this.emit("toast", { title: i.name, text: i.text, duration: 11000 });
      this.commands.updateHUD();
      return;
    }
    const fail = (text) => {
      this.emit("toast", { title: "Impossible pour le moment", text });
      this.sound.click();
    };
    if (i.kind === "box" && i.busy) {
      if (i.offered) {
        if (this.run.session?.peer) {
          this.run.session.requestInteraction(i, true);
          return;
        }
        const result = this.applySharedInteraction(i, actor, true);
        if (result?.weapon) this.receiveWeapon(result.weapon);
      }
      return;
    }
    if ((i.kind === "upgrade" || PERKS[i.kind]) && !this.run.world.power)
      return fail("Rétablissez d’abord le courant au générateur.");
    if (i.kind === "power" && this.run.world.power)
      return fail("Le courant est déjà rétabli.");
    if (
      i.kind === "upgrade" &&
      this.run.weapons[this.run.slot].level >= MAX_UPGRADE
    )
      return fail("Cette arme a atteint sa transfiguration ultime.");
    if (this.run.player.perks.includes(i.kind))
      return fail("Vous possédez déjà cet atout.");
    if (i.kind === "extract") {
      if (!this.run.world.power)
        return fail("Rétablissez le courant pour activer la balise.");
      if (
        this.run.wave < 10 ||
        (this.run.phase === "wave" && this.run.wave === 10)
      )
        return fail("Survivez à la vague 10 pour autoriser l’extraction.");
      if (this.run.extraction) return;
      if (this.run.session?.peer) {
        this.run.session.requestInteraction(i);
        return;
      }
      this.applySharedInteraction(i, actor);
      return;
    }
    const cost = this.interactionCost(i);
    if (this.run.player.points < cost)
      return fail(`Il vous manque ${cost - this.run.player.points} essences.`);
    if (
      i.kind === "ammo" &&
      this.run.weapons.every((w) => w.reserve >= reserveCapacity(w)) &&
      this.run.player.grenades >= 3
    )
      return fail("Vos réserves sont déjà pleines.");
    if (["door", "box", "power"].includes(i.kind)) {
      if (this.run.session?.peer) {
        this.run.session.requestInteraction(i);
        return;
      }
      if (!this.applySharedInteraction(i, actor)) return;
    }
    this.run.player.points -= cost;
    this.sound.purchase();
    switch (i.kind) {
      case "door":
        this.emit("toast", {
          title: "Nouvelle zone ouverte",
          text:
            this.run.map === "abyss"
              ? `${i.name} · Cherchez les machines et les archives du secteur.`
              : "Le générateur et les machines d’atouts sont accessibles.",
        });
        break;
      case "box":
        this.emit("toast", {
          title: "Le Reliquaire choisit…",
          text: "Revenez prendre votre arme une fois le tirage terminé.",
        });
        break;
      case "ammo":
        for (const w of this.run.weapons) w.reserve = reserveCapacity(w);
        this.run.player.grenades = Math.max(3, this.run.player.grenades);
        this.emit("toast", {
          title: "Ravitaillement effectué",
          text: "Réserves pleines · Grenades reconstituées",
        });
        break;
      case "power":
        this.commands.burst(
          i.position.clone().add(new T.Vector3(0, 1, 0)),
          0xa8e9ef,
          24,
          0.8,
        );
        this.emit("announce", {
          eyebrow: "LE CIRCUIT EST RÉTABLI",
          title: "LA LUMIÈRE REVIENT",
          subtitle:
            "Les atouts et la Transfiguration sont désormais disponibles.",
          duration: 3500,
        });
        break;
      case "upgrade": {
        this.run.weapons[this.run.slot].level =
          (this.run.weapons[this.run.slot].level || 0) + 1;
        this.run.weapons[this.run.slot].ammo = magazine(
          this.run.weapons[this.run.slot],
        );
        this.run.weapons[this.run.slot].reserve = reserveCapacity(
          this.run.weapons[this.run.slot],
        );
        this.commands.setGun({ draw: "first" });
        const tier = UPGRADE.names[this.run.weapons[this.run.slot].level];
        this.emit("toast", {
          title: `Transfiguration ${tier}`,
          text: `Dégâts ×${String(damageMultiplier(this.run.weapons[this.run.slot].level)).replace(".", ",")} · Chargeur agrandi · Munitions restaurées${
            this.run.weapons[this.run.slot].level < MAX_UPGRADE
              ? ` · Palier suivant : ${upgradeCost(this.run.weapons[this.run.slot].level)} essences`
              : " · Palier ultime"
          }`,
        });
        break;
      }
      default:
        if (PERKS[i.kind]) {
          this.run.player.perks.push(i.kind);
          if (i.kind === "health") {
            this.run.player.maxHealth = 180;
            this.run.player.health = 180;
          }
          this.emit("toast", {
            title: PERKS[i.kind].name,
            text: PERKS[i.kind].description,
          });
        }
    }
    this.commands.updateHUD();
  }
  /** Applies shared world rules identically for the local player and peers. */
  applySharedInteraction(i, actor, take = false) {
    const cost = sharedInteractionCost(i, this.run, actor, take);
    if (cost === null) return null;
    let weapon = null;
    switch (i.kind) {
      case "door":
        this.run.world.openDoor(i);
        this.commands.updateNavigation(true);
        break;
      case "power":
        this.run.world.setPower();
        this.sound.powerOn();
        break;
      case "box":
        if (take) {
          weapon = i.offered;
          i.busy = false;
          i.offered = null;
          i.timer = 0;
          i.display?.removeFromParent();
          i.display = null;
        } else {
          i.busy = true;
          i.timer = 3.2;
          i.offerTimer = 0;
          this.sound.box();
        }
        break;
      case "extract":
        this.requestExtraction();
        break;
    }
    return { cost, weapon };
  }
  requestExtraction() {
    if (this.run.extraction) return;
    this.run.extraction = true;
    this.run.extractionTimer = 20;
    this.commands.announce({
      eyebrow: "LA BALISE A RÉPONDU",
      title: "EXTRACTION",
      subtitle: "Restez à proximité de la balise pendant 20 secondes.",
      duration: 4000,
    });
    this.sound.wave();
  }
  receiveWeapon(id) {
    if (!WEAPONS[id]) return;
    if (this.run.weapons.length < 2) {
      this.run.weapons.push(newWeapon(id));
      this.run.slot = 1;
    } else this.run.weapons[this.run.slot] = newWeapon(id);
    this.commands.setGun({ draw: "first" });
    this.sound.purchase();
    this.emit("toast", {
      title: WEAPONS[id].name,
      text: WEAPONS[id].description,
    });
    this.commands.updateHUD();
  }
  interactionCost(i) {
    if (i.kind === "upgrade")
      return upgradeCost(this.run.weapons[this.run.slot].level || 0) ?? 0;
    return i.cost || 0;
  }
  nearInteraction() {
    if (!this.run.world || !this.run.player) return null;
    let near = null,
      distance = 3.1;
    for (const i of this.run.world.interactions) {
      if (i.kind === "door" && i.open) continue;
      const d = interactionDistance(i, this.run.player.position);
      if (d < distance) {
        near = i;
        distance = d;
      }
    }
    return near;
  }
  interactionText(i) {
    if (!i) return null;
    const cost = this.interactionCost(i);
    let action = `${i.name} · ${cost ? `${cost} essences` : "Activer"}`;
    if (i.kind === "upgrade" && this.run.weapons[this.run.slot].level)
      action = `${i.name} ${UPGRADE.names[this.run.weapons[this.run.slot].level + 1] || ""} · ${cost} essences`;
    if (i.kind === "recording")
      action = `${i.read ? "Relire" : "Lire"} · ${i.name}`;
    if (i.kind === "box" && i.busy)
      action = i.offered
        ? `Prendre ${WEAPONS[i.offered].name}`
        : "Le Reliquaire choisit…";
    if (i.kind === "power" && this.run.world.power) action = "Courant rétabli";
    if (i.kind === "extract")
      action = this.run.extraction
        ? "Extraction en cours"
        : this.run.wave >= 10
          ? "Demander l’extraction"
          : "Extraction disponible après la vague 10";
    if ((i.kind === "upgrade" || PERKS[i.kind]) && !this.run.world.power)
      action = `${i.name} · Courant requis`;
    if (this.run.player.perks.includes(i.kind)) action = `${i.name} · Acquis`;
    if (
      i.kind === "upgrade" &&
      this.run.weapons[this.run.slot].level >= MAX_UPGRADE
    )
      action = `${i.name} · Palier ultime atteint`;
    return action;
  }
  update(dt) {
    const b = this.run.world.interactions.find((i) => i.kind === "box");
    if (b?.busy) {
      if (b.timer > 0) {
        b.timer -= dt;
        if (Math.floor(b.timer * 8) !== b.cycle) {
          b.cycle = Math.floor(b.timer * 8);
          this.run.world.showBoxWeapon(mysteryWeapon());
        }
        if (b.timer <= 0) {
          b.offered = mysteryWeapon();
          this.run.world.showBoxWeapon(b.offered);
          b.offerTimer = 18;
          this.sound.pickup();
          this.emit("toast", {
            title: `${WEAPONS[b.offered].rarity} · ${WEAPONS[b.offered].name}`,
            text: this.run.touch
              ? "Approche du Reliquaire et touche le bouton pour récupérer ton arme."
              : "Appuyez sur E devant le Reliquaire pour prendre votre arme.",
          });
        }
      } else {
        b.offerTimer -= dt;
        if (b.offerTimer <= 0) {
          b.offered = null;
          b.busy = false;
          if (b.display) {
            b.root.remove(b.display);
            b.display = null;
          }
        }
      }
    }
  }
}
