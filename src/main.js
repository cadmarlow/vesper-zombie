import { splashScreen } from "./ui/screen-blood.js";
import { MUSIC_TRACKS } from "./content/music.js";
import { DEFAULT_SETTINGS } from "./content/defaults.js";
import { readSettings } from "./app/storage.js";
import { createLauncher } from "./app/launch.js";
import { createUpdates } from "./app/updates.js";
import {
  changelogPanel,
  changelogStatusBlock,
  markSeen,
  unseenRelease,
  whatsNewCard,
} from "./ui/changelog.js";
import { mountShell } from "./ui/shell.js";
import { createHUD } from "./ui/hud.js";
import { $, $$, icon, escapeHtml } from "./ui/dom.js";

import "./style.css";
import "./mobile.css";
import { TouchControls } from "./touch.js";
import { Sound } from "./audio.js";
import { Net } from "./net.js";
import {
  MAPS,
  WEAPONS,
  ENEMIES,
  DIFFICULTIES,
  PERKS,
  UPGRADE,
  readSave,
} from "./config.js";
import "@fontsource/barlow/latin-400.css";
import "@fontsource/barlow/latin-500.css";
import "@fontsource/barlow/latin-600.css";
import "@fontsource/barlow/latin-700.css";
import "@fontsource/barlow-condensed/latin-400.css";
import "@fontsource/barlow-condensed/latin-500.css";
import "@fontsource/barlow-condensed/latin-600.css";
import "@fontsource/rajdhani/latin-400.css";
import "@fontsource/rajdhani/latin-500.css";
import "@fontsource/rajdhani/latin-600.css";
let selectedMap = "abbey",
  difficulty = "normal",
  game,
  activePanel = null;
const sound = new Sound();
let settings = readSettings();
mountShell(difficulty);
let currentScreen = "menu";
let updateStatus = { latest: null, checking: false, error: false };
let unseen = unseenRelease(__APP_VERSION__);
const updates = createUpdates({
  version: __APP_VERSION__,
  build: __BUILD_ID__,
  onChange(status) {
    updateStatus = status;
    renderUpdateStatus();
  },
});
function renderUpdateStatus() {
  const safe = ["menu", "gameover"].includes(currentScreen);
  $("#update-notice").hidden = !updateStatus.latest || !safe;
  if (updateStatus.latest)
    $("#update-message").textContent = updateStatus.latest.title
      ? `VESPER ${updateStatus.latest.version} · ${updateStatus.latest.title} est disponible.`
      : `VESPER ${updateStatus.latest.version} est disponible.`;
  $("#whats-new").hidden = !unseen || currentScreen !== "menu";
  if (activePanel === "changelog") {
    const block = $(".changelog-follow");
    if (block) {
      block.outerHTML = changelogStatusBlock(__APP_VERSION__, updateStatus);
      bindChangelogActions();
    }
  }
  const status = $("#update-check-status");
  if (status)
    status.textContent = updateStatus.checking
      ? "Vérification…"
      : updateStatus.latest
        ? safe
          ? "Mise à jour disponible."
          : "Mise à jour disponible au retour au menu."
        : updateStatus.error
          ? "Vérification impossible. Réessayez avec une connexion."
          : "Vous utilisez la dernière version vérifiée.";
}
$("#update-now").onclick = () => updates.apply();
$("#update-notes").onclick = () => openPanel("changelog");
// Release notes: the version buttons open the journal; after an update a
// returning player gets a one-time card on the menu.
function dismissNews() {
  unseen = null;
  markSeen(__APP_VERSION__);
  $("#version-news").hidden = true;
  $("#whats-new").hidden = true;
}
function bindChangelogActions() {
  const check = $("#changelog-check"),
    update = $("#changelog-update");
  if (check) check.onclick = () => updates.check();
  if (update) update.onclick = () => updates.apply();
}
if (unseen) {
  $("#whats-new").innerHTML = whatsNewCard(unseen);
  $("#version-news").hidden = false;
  $("#whats-new-open").onclick = () => openPanel("changelog");
  $("#whats-new-close").onclick = dismissNews;
}
$("#version-button").onclick = () => openPanel("changelog");
$("#pause-version").onclick = () => openPanel("changelog");
const renderHUD = createHUD({
  onDismissMapHints() {
    settings.lacunaHints = false;
    persistSettings();
  },
});
const menuArt = $("#menu-art");
menuArt.style.backgroundImage = "url(/art/abbey.webp)";
const formatTime = (s) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
let toastTimer, hitTimer, damageTimer, panelReturnFocus;

// A red arc points at the attacker; claw blows leave fading scratches.
function showDamageDirection(payload) {
  if (!payload || payload.angle === null || payload.angle === undefined) return;
  const layer = $("#damage-arcs");
  if (!layer) return;
  const arc = document.createElement("div");
  arc.className = "damage-arc";
  arc.style.setProperty("--angle", `${payload.angle}rad`);
  arc.style.setProperty("--strength", String(0.55 + payload.strength * 0.45));
  layer.append(arc);
  setTimeout(() => arc.remove(), 1300);
  while (layer.querySelectorAll(".damage-arc").length > 4)
    layer.querySelector(".damage-arc").remove();
  const claws = document.createElement("div");
  claws.className = "claw-marks";
  claws.style.setProperty(
    "--tilt",
    `${(Math.sin(payload.angle) < 0 ? -1 : 1) * (18 + Math.random() * 16)}deg`,
  );
  claws.style.setProperty("--x", `${40 + Math.sin(payload.angle) * 22}%`);
  claws.style.setProperty("--y", `${38 + Math.random() * 20}%`);
  layer.append(claws);
  setTimeout(() => claws.remove(), 1700);
  while (layer.querySelectorAll(".claw-marks").length > 2)
    layer.querySelector(".claw-marks").remove();
}
function toast({ title, text, duration = 2100 }) {
  const root = $("#toast-container");
  // Repeated interaction failures must not keep the same notice on screen.
  if (
    root.classList.contains("visible") &&
    root.querySelector("strong")?.textContent === title &&
    root.querySelector("p")?.textContent === (text || "")
  )
    return;
  root.innerHTML = `<div class="toast"><div class="toast-icon">${icon("eclipse")}</div><div><strong></strong><p></p></div></div>`;
  $(".toast strong").textContent = title;
  $(".toast p").textContent = text || "";
  root.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(
    () => root.classList.remove("visible"),
    Math.min(duration, 2600),
  );
}
function announce(a) {
  toast({
    title: a.title,
    text: [a.eyebrow, a.subtitle].filter(Boolean).join(" · "),
    duration: a.duration || 2600,
  });
}
function state(s) {
  if (s !== currentScreen) {
    clearTimeout(toastTimer);
    $("#toast-container").classList.remove("visible");
  }
  currentScreen = s;
  // One flowing column keeps prompts and notices clear of the objective.
  (["playing", "paused"].includes(s) ? $(".hud-feedback") : $("#app")).append(
    $("#toast-container"),
  );
  renderUpdateStatus();
  for (const [id, show] of [
    ["menu", s === "menu"],
    ["loading", s === "loading"],
    ["hud", ["playing", "paused"].includes(s)],
    ["hud-feedback", ["playing", "paused"].includes(s)],
    ["pause", s === "paused"],
    ["gameover", s === "gameover"],
  ])
    $("#" + id).classList.toggle("hidden", !show);
  $("#game-canvas").classList.toggle("visible", s !== "menu");
  $("#touch-controls").classList.toggle(
    "hidden",
    !(s === "playing" && game.touch),
  );
  if (s !== "playing") touchControls.reset();
  else if (game.touch) queueMicrotask(updateViewport);
  document.body.classList.toggle("in-game", s === "playing");
  $(".lacuna-status").classList.toggle(
    "hidden",
    !["playing", "paused"].includes(s),
  );
  document.body.classList.toggle("touch-mode", !!game?.touch);
  if (s === "playing")
    $("#hud-map").textContent = MAPS.find(
      (m) => m.id === game.map,
    ).short.toUpperCase();
  if (s === "menu") {
    selectedMap = game?.map || selectedMap;
    selectMap(selectedMap);
    refreshRecords();
    if (net.room) {
      if (net.room.host === net.id) net.lobby();
      openPanel("multi");
    }
  }
}
function onEvent(type, payload) {
  switch (type) {
    case "state":
      state(payload);
      break;
    case "hud":
      renderHUD(payload);
      break;
    case "toast":
      toast(payload);
      break;
    case "announce":
      announce(payload);
      break;
    case "hit": {
      const marker = $("#hitmarker");
      // Restart the kill pop even on back-to-back kills.
      marker.className = "hitmarker";
      void marker.offsetWidth;
      marker.className = `hitmarker visible${payload.kill ? " kill" : ""}${payload.head ? " headshot" : ""}`;
      clearTimeout(hitTimer);
      hitTimer = setTimeout(
        () => marker.classList.remove("visible"),
        payload.kill ? 240 : 120,
      );
      break;
    }
    case "gore":
      splashScreen($("#damage-arcs"), payload?.strength ?? 1);
      break;
    case "damage":
      $("#damage-overlay").classList.add("visible");
      clearTimeout(damageTimer);
      damageTimer = setTimeout(
        () => $("#damage-overlay").classList.remove("visible"),
        400,
      );
      showDamageDirection(payload);
      break;
    case "score": {
      const row = document.createElement("div");
      row.className = payload.head ? "headshot" : "";
      row.textContent = `+${payload.points} ${payload.head ? "TIR À LA TÊTE" : "ÉLIMINATION"}`;
      $("#score-feed").append(row);
      setTimeout(() => row.remove(), 1900);
      break;
    }
    case "end":
      renderEnd(payload);
      break;
    case "session-lost":
      if (net.room) openPanel("multi");
      break;
  }
}
function startGame(event, coop = null) {
  return launcher.start(event, coop);
}
function refreshRecords() {
  const save = readSave();
  for (const m of MAPS) {
    const r = save.records?.[m.id],
      el = $(`[data-record="${m.id}"]`);
    if (!el) continue;
    el.textContent = r
      ? `RECORD · VAGUE ${r.wave} · ${r.kills} ÉLIMINATIONS`
      : "";
  }
}
function selectMap(id) {
  selectedMap = id;
  const map = MAPS.find((m) => m.id === id);
  menuArt.style.backgroundImage = `url(${map.art || `/art/${id}.webp`})`;
  document.documentElement.style.setProperty("--map-accent", map.color);
  $$("[data-map]").forEach((b) => {
    b.classList.toggle("selected", b.dataset.map === id);
    b.setAttribute("aria-pressed", b.dataset.map === id);
  });
  $("#map-quote").textContent = `« ${map.description} »`;
  $("#map-time").textContent = map.time;
  $("#transmission-number").textContent = map.number.slice(1);
  $("#map-coordinates").textContent = map.coordinates;
  $("#map-condition").textContent =
    map.condition ||
    (id === "abbey"
      ? "ÉCLIPSE TOTALE · AUCUN SURVIVANT SIGNALÉ"
      : "NUIT POLAIRE · SIGNAL NON IDENTIFIÉ");
}
$$("[data-map]").forEach(
  (b) =>
    (b.onclick = () => {
      selectMap(b.dataset.map);
      game?.sound.click();
    }),
);
$$("[data-difficulty]").forEach(
  (b) =>
    (b.onclick = () => {
      difficulty = b.dataset.difficulty;
      $$("[data-difficulty]").forEach((el) =>
        el.classList.toggle("selected", el === b),
      );
    }),
);
$("#play-button").onclick = startGame;
$("#resume-button").onclick = () => {
  if (
    game.touch &&
    innerWidth < (window.visualViewport?.height || innerHeight)
  ) {
    $("#mobile-orientation").classList.remove("hidden");
    return;
  }
  game.resume();
};
$("#retry-button").onclick = (event) => {
  if (game?.run.session) {
    game.menu();
    openPanel("multi");
  } else startGame(event);
};
$("#end-menu").onclick = () => game.menu();
$("#quit-button").onclick = () => {
  openPanel("quit");
};
$("#hud-pause").onclick = () => game.pause();
$("#hud-help").onclick = () => {
  game.pause();
  openPanel("controls");
};
$("#settings-button").onclick = () => openPanel("settings");
$("#pause-help").onclick = () => openPanel("controls");
$("#pause-settings").onclick = () => openPanel("settings");
$("#controls-button").onclick = () => openPanel("controls");
$("#close-panel").onclick = closePanel;
$$("[data-panel]").forEach(
  (b) =>
    (b.onclick = () => {
      if (b.dataset.panel === "home") closePanel();
      else openPanel(b.dataset.panel);
    }),
);
$$(".wordmark").forEach(
  (a) =>
    (a.onclick = (e) => {
      e.preventDefault();
      closePanel();
    }),
);
$("#sound-button").onclick = async () => {
  settings.volume = settings.volume > 0 ? 0 : 0.65;
  persistSettings();
  if (!game)
    toast({
      title: settings.volume ? "Son activé" : "Son coupé",
      text: settings.volume
        ? "L’ambiance sonore commencera avec votre partie."
        : "",
    });
  $("#sound-button span").textContent = settings.volume
    ? "SON ACTIVÉ"
    : "SON COUPÉ";
};
$("#fullscreen-button").onclick = async () => {
  try {
    if (!document.fullscreenElement)
      await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  } catch {
    toast({
      title: "Plein écran indisponible",
      text: "Utilisez le mode plein écran de votre navigateur.",
    });
  }
};
function persistSettings() {
  try {
    localStorage.setItem("vesper-settings", JSON.stringify(settings));
  } catch {}
  game?.applySettings(settings);
  if (["playing", "paused"].includes(game?.state)) game.updateHUD();
  const hintsToggle = $("#setting-lacunaHints");
  if (hintsToggle) hintsToggle.checked = settings.lacunaHints !== false;
  $("#sound-button span").textContent = settings.volume
    ? "SON ACTIVÉ"
    : "SON COUPÉ";
}
const weaponSilhouette = (id) => {
  const pistol = id === "vigil",
    alien = id === "eclipse";
  return `<svg class="weapon-silhouette" viewBox="0 0 400 130" fill="currentColor" aria-hidden="true">${pistol ? '<path d="M82 40h215v29H178l-16 54h-47l14-55H82z"/><path d="M90 35h17v9H90m174-9h16v10h-16"/>' : `<path d="M28 42h67l22 9h144v-8h34v12h72v9h-75v11H156l-8 44h-29l6-44h-19l-36 22H28z"/><path d="M178 72h37l13 43h-37zM125 43h120v7H125m12-22h59v14h-59"/>${alien ? '<path d="M222 35h8v51h-8m18-56h8v61h-8m18-57h8v53h-8m18-48h8v43h-8"/>' : ""}`}</svg>`;
};
function openPanel(kind) {
  panelReturnFocus = document.activeElement;
  activePanel = kind;
  $("#panel").classList.remove("hidden");
  const content = $("#panel-content");
  if (kind === "changelog") {
    content.innerHTML = changelogPanel(__APP_VERSION__, updateStatus);
    bindChangelogActions();
    dismissNews();
    content.scrollTop = 0;
  } else if (kind === "settings") {
    content.innerHTML = `<div class="eyebrow">PERSONNALISEZ VOTRE EXPÉRIENCE</div><h2>Paramètres</h2><p class="panel-description">Trouvez votre équilibre entre précision, atmosphère et fluidité.</p><div class="settings-grid"><section><h3>SON & COMMANDES</h3>${slider("volume", "Volume général", 0, 1, 0.05, settings.volume, Math.round(settings.volume * 100) + " %")}${slider("musicVolume", "Musique", 0, 1, 0.05, settings.musicVolume, Math.round(settings.musicVolume * 100) + " %")}<div class="setting"><label for="setting-musicTrack">Bande originale<span>Un morceau différent à chaque partie, ou votre sélection en boucle.</span></label><select id="setting-musicTrack"><option value="random" ${settings.musicTrack === "random" ? "selected" : ""}>Aléatoire à chaque partie</option>${MUSIC_TRACKS.map((track) => `<option value="${track.id}" ${settings.musicTrack === track.id ? "selected" : ""}>${track.title}</option>`).join("")}</select><small id="music-now">${escapeHtml(sound.score?.error || (sound.score?.track ? "À l’écoute : " + sound.score.track.title : "La musique démarre avec votre partie."))}</small></div>${slider("touchSensitivity", "Sensibilité tactile", 0.4, 2.2, 0.1, settings.touchSensitivity, settings.touchSensitivity.toFixed(1))}${toggle("touchAimAssist", "Aide à la précision tactile", settings.touchAimAssist)}${toggle("touchAdaptiveQuality", "Fluidité adaptative mobile<span>Ajuste la résolution quand l’appareil ralentit.</span>", settings.touchAdaptiveQuality)}${slider("sensitivity", "Sensibilité de la souris", 0.2, 3, 0.1, settings.sensitivity, settings.sensitivity.toFixed(1))}<div class="setting"><label for="setting-layout">Disposition du clavier<span>Les commandes suivent la position physique des touches.</span></label><select id="setting-layout"><option value="azerty" ${settings.layout === "azerty" ? "selected" : ""}>AZERTY · ZQSD</option><option value="qwerty" ${settings.layout === "qwerty" ? "selected" : ""}>QWERTY · WASD</option></select></div></section><section><h3>AFFICHAGE</h3>${toggle("adaptiveQuality", "Fluidité adaptative desktop<span>Ajuste la résolution pour garder les commandes réactives.</span>", settings.adaptiveQuality)}${slider("fov", "Champ de vision", 65, 105, 5, settings.fov, settings.fov + "°")}<div class="setting"><label for="setting-frameRate">Cadence maximale<span>30 images par seconde limite la chauffe et la batterie sur téléphone.</span></label><select id="setting-frameRate"><option value="60" ${settings.frameRate !== 30 ? "selected" : ""}>60 images / s</option><option value="30" ${settings.frameRate === 30 ? "selected" : ""}>30 images / s</option></select></div><div class="setting"><label for="setting-quality">Qualité graphique<span>Textures détaillées, ombres et atmosphère. Les effets s’adaptent au mobile.</span></label><select id="setting-quality">${[
      ["high", "Élevée"],
      ["medium", "Équilibrée"],
      ["low", "Performance"],
    ]
      .map(
        ([v, t]) =>
          `<option value="${v}" ${settings.quality === v ? "selected" : ""}>${t}</option>`,
      )
      .join(
        "",
      )}</select></div>${toggle("shake", "Mouvements de recul", settings.shake)}${toggle("crosshair", "Réticule de visée", settings.crosshair)}${toggle("lacunaHints", "Aides de LACUNA<span>Guidage, flèche, distances et panneau hydraulique.</span>", settings.lacunaHints)}</section></div><div class="panel-foot"><span>Vos réglages sont enregistrés automatiquement sur cet appareil.</span><button class="secondary-button" id="reset-settings">RÉGLAGES PAR DÉFAUT</button></div>`;
    for (const key of [
      "volume",
      "musicVolume",
      "sensitivity",
      "touchSensitivity",
      "fov",
    ])
      $("#setting-" + key).oninput = (e) => {
        settings[key] = Number(e.target.value);
        $("#value-" + key).textContent =
          key === "volume" || key === "musicVolume"
            ? Math.round(settings[key] * 100) + " %"
            : key === "fov"
              ? settings[key] + "°"
              : settings[key].toFixed(1);
        persistSettings();
      };
    for (const key of ["layout", "quality", "frameRate", "musicTrack"])
      $("#setting-" + key).onchange = (e) => {
        settings[key] =
          key === "frameRate" ? Number(e.target.value) : e.target.value;
        persistSettings();
        if (key === "musicTrack") {
          sound.setMusicTrack(settings.musicTrack);
          sound.score?.unlock();
          $("#music-now").textContent = sound.score?.track
            ? "À l’écoute : " + sound.score.track.title
            : "La musique démarre avec votre partie.";
        }
      };
    for (const key of [
      "shake",
      "crosshair",
      "lacunaHints",
      "touchAimAssist",
      "touchAdaptiveQuality",
      "adaptiveQuality",
    ])
      $("#setting-" + key).onchange = (e) => {
        settings[key] = e.target.checked;
        persistSettings();
      };
    $("#reset-settings").onclick = () => {
      settings = { ...DEFAULT_SETTINGS };
      persistSettings();
      openPanel("settings");
    };
    content.insertAdjacentHTML(
      "beforeend",
      `<div class="app-update-settings"><div><b>VESPER · v${__APP_VERSION__}</b><small id="update-check-status"></small></div><div class="app-update-actions"><button class="text-button" id="open-changelog">NOTES DE VERSION</button><button class="secondary-button" id="check-update">VÉRIFIER LA MISE À JOUR</button></div></div>`,
    );
    $("#check-update").onclick = () => updates.check();
    $("#open-changelog").onclick = () => openPanel("changelog");
    renderUpdateStatus();
  } else if (kind === "arsenal") {
    content.innerHTML = `<div class="eyebrow">INVENTAIRE DU PROTOCOLE</div><h2>Chaque balle compte.</h2><p class="panel-description">Six armes. Deux emplacements. Une chance de traverser la nuit.<br>Le Reliquaire offre une arme aléatoire pour 950 essences.</p><div class="arsenal-grid">${Object.entries(
      WEAPONS,
    )
      .map(
        ([id, w]) =>
          `<article class="weapon-card" style="--weapon-color:#${w.color.toString(16).padStart(6, "0")}"><div class="weapon-card-top"><span>${w.class}</span><b>${w.rarity}</b></div>${weaponSilhouette(id)}<h3>${w.name}</h3><p>${w.description}</p><div class="weapon-stat"><span>PUISSANCE</span><i><b style="width:${Math.min(100, (w.damage * w.pellets) / 2.4)}%"></b></i></div><div class="weapon-stat"><span>CADENCE</span><i><b style="width:${Math.min(100, 8 / w.rate)}%"></b></i></div><div class="weapon-card-bottom"><span>${w.mag} / ${w.reserve} MUNITIONS</span><span>${w.reload.toFixed(1)} S</span></div></article>`,
      )
      .join(
        "",
      )}</div><div class="lore-note">${icon("bolt")} LA TRANSFIGURATION <span>Après avoir rétabli le courant, trois paliers : ${UPGRADE.costs.map((c, i) => `${c.toLocaleString("fr-FR")} essences pour ×${String(UPGRADE.damage[i + 1]).replace(".", ",")}`).join(", ")}. Chaque palier agrandit le chargeur et restaure les munitions.</span></div>`;
  } else if (kind === "archives") {
    const save = readSave();
    content.innerHTML = `<div class="eyebrow">CE QUI RESTE APRÈS LA NUIT</div><h2>Archives du signal.</h2><p class="panel-description">Vos expéditions sont enregistrées sur cet appareil.</p><div class="archive-summary"><div><strong>${save.runs || "00"}</strong><span>EXPÉDITIONS</span></div><div><strong>${save.totalKills || "00"}</strong><span>ÉLIMINATIONS</span></div><div><strong>${Math.max(0, ...Object.values(save.records || {}).map((r) => r.wave))}</strong><span>MEILLEURE VAGUE</span></div></div><div class="archive-maps">${MAPS.map(
      (m) => {
        const r = save.records?.[m.id];
        return `<article><img src="${m.art || `/art/${m.id}.webp`}" alt=""/><div><span class="eyebrow">${m.region}</span><h3>${m.name}</h3><p>${r ? `Vague ${r.wave} · ${r.kills} éliminations · ${formatTime(r.time)} · ${r.victory ? "Extraction réussie" : "Signal perdu"}` : "Aucune expédition enregistrée. Le signal vous attend."}</p></div></article>`;
      },
    ).join(
      "",
    )}</div><h3 class="bestiary-title">LES PRÉSENCES</h3><div class="bestiary-grid">${Object.entries(
      ENEMIES,
    )
      .filter(([, e]) => !e.hidden)
      .map(
        ([id, e], i) =>
          `<article><span class="enemy-glyph" style="color:#${e.eye.toString(16)}">${icon(id === "brute" || id === "archon" ? "shield" : id === "wraith" ? "eclipse" : "skull")}</span><span class="tiny">${e.boss ? "PRÉSENCE MAJEURE" : `SUJET 0${i + 1}`}</span><h3>${e.name}</h3><p>${{ walker: "Lent, nombreux. Visez la tête et gardez vos distances.", runner: "Rapide et fragile. Ne lui tournez pas le dos.", brute: "Massif et résistant. Grenades et armes transfigurées conseillées.", spitter: "Projette de l’acide à distance. Déplacez-vous latéralement.", wraith: "Sa silhouette disparaît. Ses yeux trahissent sa présence.", archon: "Se lève toutes les cinq vagues, deux à partir de la quinzième. Sa chute libère grenades et reliques." }[id]}</p></article>`,
      )
      .join("")}</div>`;
  } else if (kind === "multi") {
    renderLobby();
  } else if (kind === "quit") {
    content.innerHTML = `<div class="eyebrow">ABANDONNER L’EXPÉDITION</div><h2>Couper le signal ?</h2><p class="panel-description">Cette partie sera terminée. Votre résultat sera conservé dans les archives.</p><div class="dialog-actions"><button class="primary-button" id="confirm-quit">QUITTER LA PARTIE ${icon("arrow")}</button><button class="secondary-button" id="cancel-quit">RESTER EN VIE</button></div>`;
    $("#confirm-quit").onclick = () => {
      closePanel();
      game.end(false);
      game.menu();
    };
    $("#cancel-quit").onclick = closePanel;
  } else if (game?.touch || matchMedia("(pointer: coarse)").matches) {
    content.innerHTML = `<div class="eyebrow">DEUX POUCES. UNE DERNIÈRE NUIT.</div><h2>Prends le contrôle.</h2><p class="panel-description">Joue en paysage. Garde tes pouces dans les deux zones de jeu.</p><div class="mobile-guide-grid"><article>${icon("run")}<h3>BOUGER & COURIR</h3><p>Pose ton pouce où tu veux dans la zone gauche. Glisse doucement pour marcher, pousse franchement vers l’avant pour courir. Relâche pour t’arrêter.</p></article><article>${icon("bullet")}<h3>VISER EN TIRANT</h3><p>Glisse à droite pour regarder. Maintiens le grand bouton de tir et glisse dessus : tu peux suivre une cible en tirant, avec le même pouce.</p></article><article>${icon("magazine")}<h3>GARDER LE RYTHME</h3><p>Touche le compteur de munitions pour recharger. La flèche à côté change d’arme. La cible active la visée précise ; les autres icônes commandent saut, accroupissement, couteau et grenade.</p></article><article>${icon("target")}<h3>INTERAGIR</h3><p>Approche d’une grille ou d’une machine. Un bouton affiche l’action et son prix : touche-le pour acheter ou activer. L’icône Pause reste en haut à droite.</p></article></div><div class="guide-tip">Ouvre la grille avec 750 essences, puis suis l’objectif vers le générateur. À Néréide, ouvre aussi le sas de l’Atelier des marées pour 1 000 essences. Le Reliquaire tire une arme pour 950 essences : récupère-la avant sa disparition. Après la vague 10, rejoins la balise de départ pour demander l’extraction.</div><div class="mobile-install-note">${icon("phone")}<div><b>Une place sur ton écran d’accueil</b><p>Sur iPhone : Partager → Sur l’écran d’accueil. Le jeu s’ouvre alors sans les barres du navigateur. Une connexion reste nécessaire au chargement.</p></div></div><div class="panel-foot"><span>La sensibilité tactile et l’aide à la précision se règlent dans les paramètres. Passer en portrait met la partie en pause.</span></div>`;
  } else {
    content.innerHTML = `<div class="eyebrow">MANUEL DE L’OPÉRATEUR</div><h2>Restez en mouvement.</h2><p class="panel-description">Éliminez les présences. Préparez la prochaine vague. Retrouvez la lumière.</p><div class="guide-grid"><section><h3>COMMANDES</h3><div class="controls-list">${[
      [settings.layout === "azerty" ? "Z Q S D" : "W A S D", "Se déplacer"],
      ["SOURIS", "Regarder autour de soi"],
      ["CLIC GAUCHE", "Tirer (maintenir pour les armes automatiques)"],
      ["CLIC DROIT", "Viser"],
      ["ESPACE", "Courir (endurance) · en lunette : retenir son souffle"],
      ["C", "S’accroupir / se relever"],
      ["MAJ", "Sauter"],
      ["R", "Recharger"],
      ["E", "Interagir / acheter / prendre une arme"],
      ["1 / 2 · MOLETTE", "Changer d’arme"],
      ["V", "Coup de couteau"],
      ["G", "Lancer une grenade"],
      ["T", "Inspecter son arme"],
      ["F", "Lampe torche"],
      ["N", "Appeler la prochaine vague"],
      ["ÉCHAP", "Pause / libérer la souris"],
    ]
      .map(([key, desc]) => `<div><kbd>${key}</kbd><span>${desc}</span></div>`)
      .join(
        "",
      )}</div></section><section><h3>LE PLAN POUR RENTRER</h3><ol class="survival-steps"><li><b>Faites compter chaque balle.</b><p>Les tirs à la tête infligent davantage de dégâts et rapportent plus d’essences. Le couteau permet d’économiser vos munitions.</p></li><li><b>Équipez-vous.</b><p>Le Reliquaire coûte 950 essences. Vous pouvez porter deux armes. Récupérez le résultat avec E avant sa disparition.</p></li><li><b>Ouvrez la voie.</b><p>Déverrouillez la grille pour 750 essences. Suis l’objectif vers le générateur. À Néréide, l’Atelier des marées demande un second sas à 1 000 essences ; le Belvédère s’ouvre pour 1 250 essences.</p></li><li><b>Rétablissez le courant.</b><p>Activez les atouts et la Transfiguration. ${Object.values(
      PERKS,
    )
      .map(
        (p) =>
          `${escapeHtml(p.name)} : ${p.description.replace(/\.$/, "").charAt(0).toLowerCase()}${p.description.replace(/\.$/, "").slice(1)}`,
      )
      .join(
        " ; ",
      )}. La Transfiguration a trois paliers.</p></li><li><b>Tenez face à l’Archonte.</b><p>Toutes les cinq vagues, une présence majeure rejoint la horde. Elle tombe sous les grenades et les tirs à la tête et laisse des reliques derrière elle.</p></li><li><b>Survivez. Puis choisissez.</b><p>Après la vague 10, activez la balise près de votre point d’arrivée. Restez à moins de 4,5 mètres pendant 20 secondes pour être extrait, ou continuez les vagues sans limite.</p></li></ol><div class="guide-tip">Votre santé se régénère après 5 secondes sans dégâts. Les anomalies laissées par les ennemis offrent soins, munitions ou bonus temporaires.</div></section></div><div class="panel-foot"><span>Sur mobile, jouez en paysage : posez le pouce à gauche puis glissez pour vous déplacer. Poussez vers l’avant pour courir. Glissez à droite pour regarder, ou maintenez le bouton de tir et glissez dessus pour viser en tirant. Touchez les munitions pour recharger. Le bouton d’interaction apparaît à proximité des machines. Pour enlever les barres du navigateur sur iPhone : menu Partager, puis Sur l’écran d’accueil.</span></div>`;
  }
  $("#close-panel").focus();
}
// ---------- co-op lobby ----------
const net = new Net();
let playerName = "";
try {
  playerName = localStorage.getItem("vesper-name") || "";
} catch {}
let lobbyStatus = "";
function renderLobby() {
  if (activePanel !== "multi") return;
  const content = $("#panel-content");
  const room = net.room;
  const isHost = room && room.host === net.id;
  if (!room) {
    content.innerHTML = `<div class="eyebrow">JOUER ENTRE AMIS</div><h2>Une nuit à plusieurs.</h2><p class="panel-description">Jusqu’à quatre survivants dans la même partie. Créez un salon et partagez son code, ou entrez celui d’un ami. Le créateur du salon héberge la partie : sa connexion doit rester ouverte.</p><div class="lobby-form"><label for="coop-name">Votre nom</label><input id="coop-name" maxlength="16" placeholder="Survivant" value="${escapeHtml(playerName)}"/><div class="lobby-actions"><button class="primary-button" id="coop-create">CRÉER UN SALON ${icon("arrow")}</button><div class="lobby-join"><input id="coop-code" maxlength="4" placeholder="CODE" autocapitalize="characters"/><button class="secondary-button" id="coop-join">REJOINDRE</button></div></div><p class="lobby-status" id="coop-status">${lobbyStatus}</p></div>`;
    $("#coop-name").oninput = (e) => {
      playerName = e.target.value.trim();
      try {
        localStorage.setItem("vesper-name", playerName);
      } catch {}
    };
    const connect = async () => {
      // Unlock both audio outputs during the join/create gesture, before the
      // host starts the run later through a WebSocket event (Safari/PWA).
      sound.setVolume(settings.volume);
      sound.setMusicVolume(settings.musicVolume);
      sound.setMusicTrack(settings.musicTrack);
      void sound.init().catch(() => {});
      lobbyStatus = "Connexion au relais…";
      $("#coop-status").textContent = lobbyStatus;
      try {
        await updates.check();
        if (updates.apply()) return false;
        await net.connect();
        return true;
      } catch (error) {
        lobbyStatus =
          error?.message === "relay-not-configured"
            ? "Aucun relais configuré pour ce site (VITE_RELAY_URL)."
            : error?.message === "version-mismatch"
              ? "Mise à jour nécessaire. Revenez au menu puis mettez VESPER à jour."
              : "Le relais est injoignable. Vérifiez votre connexion ou réessayez.";
        $("#coop-status").textContent = lobbyStatus;
        return false;
      }
    };
    $("#coop-create").onclick = async () => {
      if (await connect()) net.create(playerName || "Survivant");
    };
    $("#coop-join").onclick = async () => {
      const code = $("#coop-code").value.trim().toUpperCase();
      if (code.length !== 4) {
        lobbyStatus = "Le code fait quatre lettres.";
        $("#coop-status").textContent = lobbyStatus;
        return;
      }
      if (await connect()) net.join(code, playerName || "Survivant");
    };
    $("#coop-code").onkeydown = (e) => {
      if (e.key === "Enter") $("#coop-join").click();
    };
    return;
  }
  const map = MAPS.find((m) => m.id === room.map) || MAPS[0];
  content.innerHTML = `<div class="eyebrow">SALON ${room.code}</div><h2>${room.players.length} survivant${room.players.length > 1 ? "s" : ""} prêt${room.players.length > 1 ? "s" : ""}.</h2><p class="panel-description">Partagez le code <b class="lobby-code">${room.code}</b> avec vos amis. ${isHost ? "Choisissez la destination et lancez la nuit quand tout le monde est là." : "L’hôte choisit la destination et lance la partie."}</p><div class="lobby-grid"><section><h3>ÉQUIPE</h3><ul class="lobby-players">${room.players.map((p) => `<li><span>${escapeHtml(p.name)}</span><small>${p.id === room.host ? "HÔTE" : ""}${p.id === net.id ? " · VOUS" : ""}</small></li>`).join("")}${Array.from({ length: Math.max(0, 4 - room.players.length) }, () => `<li class="empty"><span>Place libre</span></li>`).join("")}</ul></section><section><h3>DESTINATION</h3>${
    isHost
      ? `<div class="setting"><label for="coop-map">Carte</label><select id="coop-map">${MAPS.map((m) => `<option value="${m.id}" ${m.id === room.map ? "selected" : ""}>${m.name}</option>`).join("")}</select></div><div class="setting"><label for="coop-difficulty">Difficulté</label><select id="coop-difficulty">${Object.entries(
          DIFFICULTIES,
        )
          .map(
            ([id, d]) =>
              `<option value="${id}" ${id === room.difficulty ? "selected" : ""}>${d.name}</option>`,
          )
          .join("")}</select></div>`
      : `<p class="lobby-choice"><b>${map.name}</b><br>${DIFFICULTIES[room.difficulty]?.name || ""}</p>`
  }</section></div><div class="dialog-actions">${isHost ? `<button class="primary-button" id="coop-start">LANCER LA NUIT ${icon("arrow")}</button>` : `<span class="lobby-wait"><span class="live-dot"></span> En attente de l’hôte…</span>`}<button class="secondary-button" id="coop-leave">QUITTER LE SALON</button></div><p class="lobby-status" id="coop-status">${lobbyStatus}</p>`;
  if (isHost) {
    $("#coop-map").onchange = (e) =>
      net.settings(e.target.value, $("#coop-difficulty").value);
    $("#coop-difficulty").onchange = (e) =>
      net.settings($("#coop-map").value, e.target.value);
    $("#coop-start").onclick = () => net.start();
  }
  $("#coop-leave").onclick = () => {
    net.leave();
    lobbyStatus = "";
    renderLobby();
  };
}
net.on("room", () => {
  lobbyStatus = "";
  renderLobby();
});
net.on("error", (m) => {
  lobbyStatus =
    m.code === "no-room"
      ? "Aucun salon avec ce code."
      : m.code === "full"
        ? "Ce salon est complet."
        : m.code === "started"
          ? "La partie de ce salon a déjà commencé."
          : "Le relais a refusé la demande.";
  renderLobby();
});
net.on("close", () => {
  if (activePanel === "multi") {
    lobbyStatus = "Connexion au relais perdue.";
    renderLobby();
  }
});
net.on("start", (m) => {
  if (game?.state === "playing") return;
  void startGame(null, {
    map: m.map,
    difficulty: m.difficulty,
    host: m.host,
    players: m.players,
    run: m.run,
  });
});
$("#coop-button").onclick = () => openPanel("multi");
function slider(id, label, min, max, step, value, display) {
  return `<div class="setting"><label for="setting-${id}">${label}</label><output id="value-${id}">${display}</output><input id="setting-${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"/></div>`;
}
function toggle(id, label, value) {
  return `<div class="setting toggle-setting"><label for="setting-${id}">${label}</label><label class="switch"><input type="checkbox" id="setting-${id}" ${value ? "checked" : ""}/><span></span></label></div>`;
}
function closePanel() {
  if (!activePanel) return;
  activePanel = null;
  $("#panel").classList.add("hidden");
  panelReturnFocus?.focus();
}
window.addEventListener(
  "keydown",
  (e) => {
    if (e.code === "Escape" && activePanel) {
      e.stopImmediatePropagation();
      e.preventDefault();
      closePanel();
    }
    if (e.code === "Tab" && activePanel) {
      const focusables = $$(
        "#panel button, #panel a, #panel input, #panel select",
      ).filter((el) => !el.disabled);
      const first = focusables[0],
        last = focusables.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    if (
      e.code === "Enter" &&
      !activePanel &&
      (!game || game.state === "menu") &&
      e.target === document.body
    )
      startGame();
  },
  true,
);
function renderEnd(r) {
  $("#end-eyebrow").textContent = r.victory
    ? "EXTRACTION CONFIRMÉE"
    : "TRANSMISSION INTERROMPUE";
  $("#end-title").textContent = r.victory
    ? "Vous avez vu l’aube."
    : "La nuit vous a pris.";
  $("#end-subtitle").textContent = r.victory
    ? "Le signal s’éloigne. Vous êtes encore vivant."
    : "D’autres entendront le signal. Votre histoire reste.";
  $("#end-stats").innerHTML = [
    [r.wave, "VAGUES"],
    [r.kills, "ÉLIMINATIONS"],
    [formatTime(r.time), "TEMPS SURVÉCU"],
  ]
    .map(([v, k]) => `<div><strong>${v}</strong><span>${k}</span></div>`)
    .join("");
  $("#end-details").textContent =
    `${r.headshots} tirs à la tête · ${r.accuracy} % de précision · ${DIFFICULTIES[r.difficulty].name}` +
    (r.newBest && r.wave > 0 ? " · Nouveau record sur cette carte" : "");
  $("#gameover").classList.toggle("new-best", !!(r.newBest && r.wave > 0));
}
const touchControls = new TouchControls(
  $("#touch-controls"),
  () => game?.inputPort,
  () => settings,
);
// The contextual touch action shares the HUD column with keyboard prompts.
touchControls.bind($("#mobile-interact"), "interact");
const launcher = createLauncher({
  sound,
  net,
  beforeLaunch: async () => {
    await updates.check();
    return !updates.apply();
  },
  canvas: $("#game-canvas"),
  getSettings: () => settings,
  getSelection: () => ({ map: selectedMap, difficulty }),
  onGame: {
    created: (instance) => {
      game = instance;
    },
    event: onEvent,
  },
  onLoading: (map, selectedDifficulty) => {
    selectedMap = map.id;
    difficulty = selectedDifficulty;
    closePanel();
    $("#loading-map").textContent = map.name;
    state("loading");
  },
  onReady: (map) => {
    $("#hud-map").textContent = map.short;
  },
  onError: (error) => {
    console.error(error);
    state("menu");
    toast({
      title: "Le jeu n’a pas pu démarrer",
      text:
        error.message === "session-lost"
          ? "La partie entre amis a été fermée. Rejoignez le salon pour relancer."
          : "Le chargement a échoué. Vous pouvez réessayer depuis le menu.",
    });
  },
  showOrientation: () => {
    $("#orientation-status").textContent =
      "La partie commencera après la rotation.";
    $("#mobile-orientation").classList.remove("hidden");
  },
});
window.addEventListener("pageshow", () => void updates.check());
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) void updates.check();
});
setInterval(() => {
  if (!document.hidden && currentScreen === "menu") void updates.check();
}, 60000);
void updates.check();
function updateViewport() {
  const height = window.visualViewport?.height || innerHeight;
  document.documentElement.style.setProperty("--app-height", `${height}px`);
  if (launcher.awaitingLandscape && innerWidth > height) {
    $("#mobile-orientation").classList.add("hidden");
    void launcher.resumeAfterRotation();
  } else if (game?.touch && game.state === "playing" && innerWidth < height) {
    game.pause();
    $("#orientation-status").textContent =
      "Partie en pause. Reprends une fois en paysage.";
    $("#mobile-orientation").classList.remove("hidden");
  } else if (game?.touch && game.state === "paused" && innerWidth > height) {
    $("#mobile-orientation").classList.add("hidden");
  }
  game?.resize();
}
window.addEventListener("resize", updateViewport);
window.visualViewport?.addEventListener("resize", updateViewport);
$("#orientation-back").onclick = () => {
  launcher.cancelDeferred();
  $("#mobile-orientation").classList.add("hidden");
  if (game?.state === "paused") openPanel("quit");
};
updateViewport();
persistSettings();
refreshRecords();
