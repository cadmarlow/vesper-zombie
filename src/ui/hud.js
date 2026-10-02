import { MAPS, WEAPONS, PERKS, UPGRADE } from "../config.js";
import { $, icon, escapeHtml, formatTime } from "./dom.js";
import { createLacunaHUD } from "./lacuna.js";
/** Receives serializable HUD data; never reaches into the game or Three.js. */
export function createHUD({ onDismissMapHints } = {}) {
  const lacuna = createLacunaHUD(onDismissMapHints);
  const minimap = $("#minimap"),
    mc = minimap.getContext("2d");
  // Rewriting innerHTML thirteen times a second re-creates identical nodes.
  const lastHtml = new Map();
  function setHtml(selector, html) {
    if (lastHtml.get(selector) === html) return;
    lastHtml.set(selector, html);
    $(selector).innerHTML = html;
  }
  let miniFrame = 0;
  return function renderHUD(h) {
    lacuna(h.mapStatus, h.settings.lacunaHints !== false);
    $("#wave-number").textContent = String(h.wave).padStart(2, "0");
    $("#hud-map").textContent = h.sector
      ? `${MAPS.find((m) => m.id === h.map).sectorPrefix || ""} · ${h.sector.toUpperCase()}`
      : MAPS.find((m) => m.id === h.map).short;
    $("#wave-status").textContent =
      h.phase === "rest"
        ? `PROCHAINE DANS ${h.timer} S${h.touch || h.peer ? "" : " · [N]"}`
        : "SURVIVEZ À LA HORDE";
    $("#downed").classList.toggle("hidden", !h.downed);
    if (h.downed) {
      $("#downed .eyebrow").textContent = h.rescue?.dead
        ? "ÉLIMINÉ"
        : "À TERRE";
      $("#downed-title").textContent = h.rescue?.dead
        ? "Votre équipe continue le combat"
        : h.rescue?.rescuer
          ? `${h.rescue.rescuer} vous réanime`
          : "Un coéquipier peut vous réanimer";
      $("#downed-status").textContent = h.rescue?.dead
        ? "Retour à la prochaine vague"
        : `${Math.ceil(h.rescue?.remaining ?? 45)} s avant élimination · Retour possible à la prochaine vague`;
    }
    const rescuing = h.rescue?.progress > 0;
    $("#rescue-progress").classList.toggle("hidden", !rescuing);
    if (rescuing) {
      $("#rescue-progress > span").textContent = h.rescue.helping
        ? `Réanimation de ${h.rescue.helping}`
        : "Réanimation en cours";
      $("#rescue-progress b").style.width = `${h.rescue.progress * 100}%`;
    }
    setHtml(
      "#team-list",
      (h.team || [])
        .map(
          (p) =>
            `<div class="${p.down ? "down" : ""}"><span>${escapeHtml(p.name)}</span><i><b style="width:${Math.max(0, Math.min(100, (p.health / p.maxHealth) * 100))}%"></b></i><small>${p.dead ? "ÉLIMINÉ · PROCHAINE VAGUE" : p.down ? `À TERRE · ${Math.ceil(p.rescue?.remaining ?? 45)} S · ${p.distance} M` : p.weapon}</small></div>`,
        )
        .join(""),
    );
    $("#enemy-count").textContent = h.phase === "wave" ? h.remaining : "—";
    $("#health-value").textContent = Math.ceil(h.health);
    $("#health-max").textContent = "/ " + h.maxHealth;
    $("#health-fill").style.width = `${(h.health / h.maxHealth) * 100}%`;
    $("#health-fill").classList.toggle("low", h.health < 35);
    $("#stamina-fill").style.width = h.stamina + "%";
    $("#movement-state").textContent = h.crouched
      ? "ACCROUPI"
      : h.sprinting
        ? "COURSE"
        : h.exhausted
          ? "ESSOUFFLÉ"
          : "DEBOUT";
    $("#power-state").textContent = h.power
      ? "CIRCUIT SOUS TENSION"
      : "COURANT COUPÉ";
    $("#power-state").classList.toggle("powered", h.power);
    for (const [action, selected] of [
      ["crouch", h.crouched],
      ["aim", h.aim],
    ]) {
      const button = $(`[data-action="${action}"]`);
      button.classList.toggle("selected", !!selected);
      button.setAttribute("aria-pressed", String(!!selected));
    }
    $("#mobile-weapon-name").textContent = h.definition.name;
    $("#mobile-ammo").textContent = String(h.weapon.ammo).padStart(2, "0");
    $("#mobile-reserve").textContent = `/ ${h.weapon.reserve}`;
    $("#mobile-grenades").textContent = h.grenades;
    $(".mobile-weapon").classList.toggle("reloading", h.reload !== null);
    $("[data-action='switch']").disabled = h.slots.length < 2;
    $("#mobile-interact").classList.toggle("hidden", !h.interaction);
    $("#mobile-interact span").textContent = h.interaction || "";
    $("#points-value").textContent = h.points.toLocaleString("fr-FR");
    $("#weapon-name").textContent =
      h.definition.name +
      (h.weapon.level ? ` ✦${UPGRADE.names[h.weapon.level]}` : "");
    $("#weapon-class").textContent = h.weapon.level
      ? "TRANSFIGURÉE"
      : h.definition.class;
    $("#ammo-value").textContent = String(h.weapon.ammo).padStart(2, "0");
    $("#ammo-value").classList.toggle("low", h.weapon.ammo < 4);
    $("#reserve-value").textContent = h.weapon.reserve;
    $("#grenade-count").textContent = h.grenades;
    $("#session-timer").textContent = formatTime(h.time);
    setHtml(
      "#weapon-slots",
      h.slots
        .map(
          (w, i) =>
            `<span class="${i === h.slot ? "selected" : ""}"><kbd>${i + 1}</kbd>${WEAPONS[w.id].name}</span>`,
        )
        .join(""),
    );
    $("#crosshair").style.display =
      h.settings.crosshair && !h.aim ? "" : "none";
    // Gap from the real cone: half-angle over the vertical field of view.
    if (h.spread != null && h.fov) {
      const half = Math.tan((h.fov * Math.PI) / 360);
      const gap = Math.max(
        3,
        Math.min(90, (h.spread / 2 / half) * (window.innerHeight / 2)),
      );
      $("#crosshair").style.setProperty("--gap", gap.toFixed(1) + "px");
    }
    // A magnified sight tells the keyboard player how to steady it.
    const breath = h.scoped && !h.touch ? h.breath : null;
    const hint = $("#breath-hint");
    hint.classList.toggle("hidden", !breath);
    hint.classList.toggle("out", breath === "out");
    if (breath)
      setHtml(
        "#breath-hint",
        breath === "hold"
          ? "SOUFFLE RETENU"
          : breath === "out"
            ? "À BOUT DE SOUFFLE"
            : "<kbd>ESPACE</kbd> RETENIR SON SOUFFLE",
      );
    const boss = h.boss?.[0];
    $("#boss-bar").classList.toggle("hidden", !boss);
    if (boss) {
      $("#boss-name").textContent =
        h.boss.length > 1
          ? `${boss.name.toUpperCase()} · ${h.boss.length}`
          : boss.name.toUpperCase();
      $("#boss-fill").style.width =
        `${(h.boss.reduce((a, b) => a + b.health, 0) / h.boss.reduce((a, b) => a + b.max, 0)) * 100}%`;
    }
    $("#interaction").classList.toggle("hidden", !h.interaction);
    $("#interaction span").textContent = h.interaction || "";
    $("#reload-bar").classList.toggle("hidden", h.reload === null);
    $("#reload-bar i").style.width = (h.reload || 0) * 100 + "%";
    setHtml(
      "#perk-slots",
      h.perks
        .map(
          (p) =>
            `<span title="${PERKS[p]?.name || p}">${icon(PERKS[p]?.icon || "bolt")}</span>`,
        )
        .join(""),
    );
    setHtml(
      "#powerup-row",
      [
        h.double ? `<span>×2 ESSENCES <b>${h.double}s</b></span>` : "",
        h.insta ? `<span>☠ MORT INSTANTANÉE <b>${h.insta}s</b></span>` : "",
      ].join(""),
    );
    $("#quick-controls").classList.toggle("faded", h.time > 35);
    $("#quick-controls kbd").textContent =
      h.settings.layout === "azerty" ? "ZQSD" : "WASD";
    let title, sub;
    if (h.extraction !== null) {
      title = `Extraction · ${h.extraction} s`;
      sub = "Restez près de la balise (rayon de 4,5 m).";
    } else if (!h.door) {
      title = "Ouvrir la zone interdite";
      sub =
        MAPS.find((m) => m.id === h.map)?.gateHint ||
        "Grille centrale · 750 essences";
    } else if (!h.power) {
      title = "Rétablir le courant";
      sub =
        MAPS.find((m) => m.id === h.map)?.powerHint ||
        "Générateur · Aile gauche, au fond";
    } else if (h.wave < 10 || (h.wave === 10 && h.phase === "wave")) {
      title = "Survivre à 10 vagues";
      sub = "Améliorez vos armes. Préparez votre extraction.";
    } else {
      title = "Le choix vous appartient";
      sub = "Balise à l’entrée · Extraction ou survie sans fin";
    }
    $("#objective-title").textContent = title;
    $("#objective-subtitle").textContent = sub;
    $("#objective-progress").style.width = Math.min(100, h.wave * 10) + "%";
    const angle = ((((-h.yaw * 180) / Math.PI) % 360) + 360) % 360;
    const dirs = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
    setHtml(
      "#compass-directions",
      `<span>${dirs[(Math.round(angle / 45) + 7) % 8]}</span> ${dirs[Math.round(angle / 45) % 8]} <span>${dirs[(Math.round(angle / 45) + 1) % 8]}</span>`,
    );
    if (++miniFrame % 3 === 0) {
      mc.clearRect(0, 0, 180, 180);
      mc.save();
      mc.beginPath();
      mc.arc(90, 90, 86, 0, Math.PI * 2);
      mc.clip();
      mc.fillStyle = "#111d22c9";
      mc.fillRect(0, 0, 180, 180);
      mc.strokeStyle = "#96b8b315";
      for (let i = 0; i < 180; i += 18) {
        mc.beginPath();
        mc.moveTo(i, 0);
        mc.lineTo(i, 180);
        mc.moveTo(0, i);
        mc.lineTo(180, i);
        mc.stroke();
      }
      const scale = 3.1,
        px = h.position.x,
        pz = h.position.z;
      mc.fillStyle = "#a8bcb236";
      for (const o of h.obstacles) {
        if (o.active === false) continue;
        mc.fillRect(
          90 + (o.x - o.w / 2 - px) * scale,
          90 + (o.z - o.d / 2 - pz) * scale,
          o.w * scale,
          o.d * scale,
        );
      }
      for (const i of h.interactions) {
        if (i.kind === "door") continue;
        mc.fillStyle = i.kind === "extract" ? "#8bcbbb" : "#d9ad6f";
        mc.fillRect(
          88 + (i.position.x - px) * scale,
          88 + (i.position.z - pz) * scale,
          4,
          4,
        );
      }
      for (const e of h.enemies) {
        if (e.dead) continue;
        mc.fillStyle = e.type === "brute" ? "#ffb551" : "#e66d5b";
        mc.beginPath();
        mc.arc(
          90 + (e.position.x - px) * scale,
          90 + (e.position.z - pz) * scale,
          e.type === "brute" ? 3 : 2,
          0,
          7,
        );
        mc.fill();
      }
      mc.translate(90, 90);
      mc.rotate(-h.yaw);
      mc.fillStyle = "#f0e8d2";
      mc.beginPath();
      mc.moveTo(0, -6);
      mc.lineTo(-4, 4);
      mc.lineTo(0, 2);
      mc.lineTo(4, 4);
      mc.fill();
      mc.restore();
      mc.strokeStyle = "#b4c1ad42";
      mc.beginPath();
      mc.arc(90, 90, 86, 0, 7);
      mc.stroke();
    }
  };
}
