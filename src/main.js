import "./style.css";
import { Sound } from "./audio.js";
import {
  MAPS,
  WEAPONS,
  ENEMIES,
  DIFFICULTIES,
  DEFAULT_SETTINGS,
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
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const icon = (name, cls = "") => {
  const shapes = {
    eclipse:
      '<circle cx="12" cy="12" r="8"/><path d="M12 1v5m0 12v5M1 12h5m12 0h5"/><path d="m8 8 4 10 4-10"/>',
    arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
    sound:
      '<path d="m4 9 5 0 5-4v14l-5-4H4zM17 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14"/>',
    gear: '<path d="m9 3 1-2h4l1 2 3 2 3 0 2 4-2 2v3l2 2-2 4h-3l-3 2h-5l-2-2H5l-2-4 2-2v-3L3 9l2-4h3z"/><circle cx="12.5" cy="12" r="3.5"/>',
    close: '<path d="m5 5 14 14M5 19 19 5"/>',
    skull:
      '<path d="M5 16C0 7 6 2 12 2s12 5 7 14l-3 1v5H8v-5z"/><path d="m8 10 2 2-3 1zm8 0-2 2 3 1zM10 18v4m4-4v4"/>',
    bolt: '<path d="m14 2-9 12h6l-1 8 9-12h-6z"/>',
    cross: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>',
    target:
      '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 1v5m0 12v5M1 12h5m12 0h5"/>',
    chevron: '<path d="m9 5 7 7-7 7"/>',
    shield:
      '<path d="m12 2 8 3v7c0 5-8 10-8 10S4 17 4 12V5z"/><path d="m8 12 3 3 5-6"/>',
    fullscreen: '<path d="M3 9V3h6m6 0h6v6m0 6v6h-6m-6 0H3v-6"/>',
    run: '<circle cx="15" cy="4" r="2"/><path d="m12 8 4 4 4 1M12 8l-4 4-4-1m8-3-1 7 5 3 2 4m-7-7-4 5H3"/>',
    crouch:
      '<circle cx="13" cy="4" r="2"/><path d="m12 8-4 5 7 2-2 6h6m-7-13 4 4 5 1M8 13l-4 3 3 5"/>',
    radio:
      '<path d="M7 10h10v11H7zM9 14h6m-6 4h4M9 10V5m6 2V3M4 3c-3 3-3 6 0 9m16-9c3 3 3 6 0 9"/>',
  };
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[name] || shapes.eclipse}</svg>`;
};
let selectedMap = "abbey",
  difficulty = "normal",
  game,
  activePanel = null,
  lastRecord;
const sound = new Sound();
let settings = { ...DEFAULT_SETTINGS };
try {
  settings = {
    ...settings,
    ...JSON.parse(localStorage.getItem("vesper-settings") || "{}"),
  };
} catch {}
const app = $("#app");
app.innerHTML = `
 <canvas id="game-canvas" aria-label="Jeu de survie Vesper en trois dimensions"></canvas>
 <main id="menu" class="screen menu-screen">
  <div class="menu-art" id="menu-art"></div><div class="menu-shade"></div><div class="grain"></div><div class="embers"><i></i><i></i><i></i><i></i><i></i><i></i></div>
  <header class="menu-header"><a class="wordmark" href="#" aria-label="Accueil Vesper">${icon("eclipse")}<span>VESPER<span class="brand-divider"> / </span><small>SURVIVAL PROTOCOL</small></span></a><nav aria-label="Navigation principale"><button class="nav-button active" data-panel="home">JOUER</button><button class="nav-button" data-panel="arsenal">ARSENAL</button><button class="nav-button" data-panel="archives">ARCHIVES</button></nav><button class="icon-button" id="settings-button" aria-label="Paramètres">${icon("gear")}</button></header>
  <div class="menu-content"><section class="hero-copy"><div class="eyebrow"><span class="live-dot"></span> UN SIGNAL DANS L’OBSCURITÉ</div><h1>VESPER<span class="title-slice" aria-hidden="true"></span></h1><div class="subtitle"><span></span> LES DERNIERS VIVANTS <span></span></div><p class="hero-description">La nuit est tombée.<br>Quelque chose s’est relevé.</p><button id="play-button" class="primary-button">ENTRER DANS LA NUIT ${icon("arrow")}</button><div class="play-meta"><span>SOLO</span><i></i><span>SURVIE PAR VAGUES</span><i></i><span>2 CARTES</span></div></section>
  <aside class="transmission"><span class="tiny">TRANSMISSION <b>00<span id="transmission-number">1</span></b></span><div class="signal"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><p id="map-quote">« Les cloches se sont tues.<br>Ce qui dort sous la nef, non. »</p><span class="transmission-source">DERNIER CONTACT · <b id="map-time">03:47</b></span></aside>
  <section class="deployment"><div class="section-label"><span>CHOISIR VOTRE DESTINATION</span><span class="tiny">01 — 02</span></div><div class="map-cards">${MAPS.map((m) => `<button class="map-card ${m.id === "abbey" ? "selected" : ""}" data-map="${m.id}" aria-pressed="${m.id === "abbey"}"><img src="/art/${m.id}.png" alt="${m.name}"/><div class="map-card-shade"></div><span class="map-number">${m.number}</span><span class="map-selected">${icon("target")} SÉLECTIONNÉE</span><div class="map-card-copy"><span class="tiny">${m.region}</span><h2>${m.name}</h2><span class="map-tags">${m.tags.join(" <b>·</b> ")}</span></div></button>`).join("")}</div><div class="difficulty-row"><span>DIFFICULTÉ</span><div class="difficulty-options">${Object.entries(
    DIFFICULTIES,
  )
    .map(
      ([id, d]) =>
        `<button data-difficulty="${id}" class="${id === difficulty ? "selected" : ""}" title="${d.desc}">${d.name}</button>`,
    )
    .join("")}</div></div></section>
  </div><div class="menu-coordinate"><span id="map-coordinates">48° 04′ N / 07° 01′ E</span><div class="coordinate-line"></div><span id="map-condition">ÉCLIPSE TOTALE · AUCUN SURVIVANT SIGNALÉ</span></div>
  <footer class="menu-footer"><div><span class="live-dot"></span> PROTOCOLE VESPER <b>V.1.1.3</b></div><button id="controls-button">${icon("target")} GUIDE DE SURVIE</button><div class="footer-right"><button id="sound-button" aria-label="Activer ou couper le son">${icon("sound")}<span>SON ACTIVÉ</span></button><button id="fullscreen-button" class="icon-button" aria-label="Plein écran">${icon("fullscreen")}</button></div></footer>
 </main>
 <section id="panel" class="overlay hidden" role="dialog" aria-modal="true" aria-label="Informations"><div class="panel-shell"><div class="panel-top"><a class="wordmark" href="#">${icon("eclipse")}<span>VESPER</span></a><button class="close-button" id="close-panel">FERMER ${icon("close")}</button></div><div id="panel-content"></div></div></section>
 <section id="loading" class="screen loading-screen hidden"><div class="loading-symbol">${icon("eclipse")}</div><div class="eyebrow">OUVERTURE DU PROTOCOLE</div><h2 id="loading-map">L’Abbaye des Cendres</h2><div class="loading-track"><span></span></div><p>Gardez vos munitions. Faites compter chaque balle.</p></section>
 <section id="hud" class="screen hud hidden" aria-label="Interface de partie"><div id="scope" class="scope hidden"><span></span></div>
  <div class="hud-top-left"><div class="tiny" id="hud-map">ABBAYE DES CENDRES</div><div class="wave-line"><span class="wave-number" id="wave-number">00</span><div><span class="eyebrow">VAGUE</span><span id="wave-status">LA NUIT COMMENCE</span></div></div><div class="enemy-counter">${icon("skull")}<span id="enemy-count">0</span> <span>PRÉSENCES</span></div></div>
  <div class="compass"><div class="compass-ticks">│ · · │ · · │ · · │ · · │ · · │ · · │</div><div id="compass-directions">N <span>NE</span> E</div><span class="compass-marker">◆</span></div>
  <div class="hud-objective"><div class="tiny" id="power-state">COURANT COUPÉ</div><div class="objective-title" id="objective-title">Survivre à la première vague</div><div id="objective-subtitle">Éliminez les présences pour gagner des essences.</div><div class="objective-progress"><span id="objective-progress"></span></div><div class="hud-tools"><button id="hud-help" aria-label="Guide de survie">?</button><button id="hud-pause" aria-label="Mettre en pause">Ⅱ</button></div></div>
  <div id="crosshair" class="crosshair"><i></i><i></i><i></i><i></i><b></b></div><div id="hitmarker" class="hitmarker">╳</div><div id="damage-overlay" class="damage-overlay"></div>
  <div id="announcement" class="announcement"><div class="eyebrow"></div><h2></h2><p></p></div>
  <div id="interaction" class="interaction hidden"><kbd>E</kbd><span></span></div>
  <div class="hud-bottom-left"><div class="minimap-wrap"><canvas id="minimap" width="180" height="180" aria-label="Radar : ennemis en rouge, machines en doré"></canvas><span class="radar-caption">RADAR DE PROXIMITÉ</span></div><div id="perk-slots" class="perk-slots"></div><div class="player-name">${icon("shield")} <b id="movement-state">DEBOUT</b> <span>01</span></div><div class="health-row">${icon("cross")}<strong id="health-value">100</strong><span id="health-max">/ 100</span></div><div class="health-track"><span id="health-fill"></span></div><div class="stamina-track"><span id="stamina-fill"></span></div><div class="essence-row">${icon("eclipse")}<strong id="points-value">650</strong><span>ESSENCES</span></div></div>
  <div class="hud-bottom-center"><div id="powerup-row"></div><div id="reload-bar" class="reload-bar hidden"><span>RECHARGEMENT</span><div><i></i></div></div><div id="quick-controls"><span><kbd>ZQSD</kbd> DÉPLACEMENT</span><span><kbd>MAJ</kbd> COURIR</span><span><kbd>C</kbd> S’ACCROUPIR</span><span><kbd>R</kbd> RECHARGER</span><span><kbd>V</kbd> COUTEAU</span><span><kbd>G</kbd> GRENADE</span><span><kbd>ÉCHAP</kbd> PAUSE</span></div></div>
  <div class="hud-bottom-right"><div class="weapon-class" id="weapon-class">PISTOLET</div><div class="weapon-name" id="weapon-name">VIGILE .45</div><div class="ammo-row"><span id="ammo-value">12</span><span class="ammo-slash">/</span><span id="reserve-value">84</span></div><div class="weapon-slots" id="weapon-slots"></div><div class="grenade-row">◇ <span id="grenade-count">3</span> <span>GRENADES</span><kbd>G</kbd></div></div>
  <div id="score-feed" class="score-feed"></div><div class="session-timer" id="session-timer">00:00</div>
 </section>
 <div id="touch-controls" class="touch-controls hidden"><div id="touch-move" class="touch-stick"><span></span></div><div id="touch-look" class="touch-look"></div><div class="touch-locomotion"><button data-action="sprint" aria-label="Activer la course" aria-pressed="false">${icon("run")}<small>COURIR</small></button><button data-action="crouch" aria-label="S’accroupir ou se relever" aria-pressed="false">${icon("crouch")}<small>ACCROUPIR</small></button></div><div class="touch-actions"><button data-action="reload">R</button><button data-action="interact">E</button><button data-action="grenade">G</button><button data-action="switch">⇄</button><button data-action="melee">V</button><button data-action="jump">↑</button><button data-action="aim">◎</button><button data-action="fire" class="touch-fire">${icon("target")}</button></div></div>
 <section id="pause" class="screen pause-screen hidden"><div class="pause-content"><div class="eyebrow">UN INSTANT DE SILENCE</div><h2>La nuit attend.</h2><p>Votre partie est en pause.</p><button class="primary-button" id="resume-button">REPRENDRE ${icon("arrow")}</button><button class="secondary-button" id="pause-settings">PARAMÈTRES</button><button class="text-button" id="quit-button">QUITTER LA PARTIE</button><div class="pause-hint">ÉCHAP POUR REPRENDRE</div></div></section>
 <section id="gameover" class="screen gameover-screen hidden"><div class="gameover-content"><div class="eyebrow" id="end-eyebrow">TRANSMISSION INTERROMPUE</div><h2 id="end-title">La nuit vous a pris.</h2><p id="end-subtitle">D’autres entendront le signal.</p><div class="end-stats" id="end-stats"></div><div class="end-details" id="end-details"></div><button class="primary-button" id="retry-button">RETOURNER DANS LA NUIT ${icon("arrow")}</button><button class="text-button" id="end-menu">RETOUR AU MENU</button></div></section>
 <div id="toast-container" aria-live="polite"></div>`;
const menuArt = $("#menu-art");
menuArt.style.backgroundImage = "url(/art/abbey.png)";
const formatTime = (s) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
let toastTimer, announceTimer, hitTimer, damageTimer, panelReturnFocus;
function toast({ title, text }) {
  const root = $("#toast-container");
  root.innerHTML = `<div class="toast"><div class="toast-icon">${icon("eclipse")}</div><div><strong></strong><p></p></div></div>`;
  $(".toast strong").textContent = title;
  $(".toast p").textContent = text || "";
  root.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => root.classList.remove("visible"), 4300);
}
function announce(a) {
  const root = $("#announcement");
  root.querySelector(".eyebrow").textContent = a.eyebrow;
  root.querySelector("h2").textContent = a.title;
  root.querySelector("p").textContent = a.subtitle;
  root.classList.remove("visible");
  void root.offsetWidth;
  root.classList.add("visible");
  clearTimeout(announceTimer);
  announceTimer = setTimeout(
    () => root.classList.remove("visible"),
    a.duration || 3500,
  );
}
function state(s) {
  for (const [id, show] of [
    ["menu", s === "menu"],
    ["loading", s === "loading"],
    ["hud", ["playing", "paused"].includes(s)],
    ["pause", s === "paused"],
    ["gameover", s === "gameover"],
  ])
    $("#" + id).classList.toggle("hidden", !show);
  $("#game-canvas").classList.toggle("visible", s !== "menu");
  $("#touch-controls").classList.toggle(
    "hidden",
    !(s === "playing" && game.touch),
  );
  document.body.classList.toggle("in-game", s === "playing");
  document.body.classList.toggle("touch-mode", !!game?.touch);
  if (s === "playing")
    $("#hud-map").textContent = MAPS.find(
      (m) => m.id === game.map,
    ).short.toUpperCase();
  if (s === "menu") {
    selectedMap = game?.map || selectedMap;
    selectMap(selectedMap);
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
    case "hit":
      $("#hitmarker").className =
        `hitmarker visible ${payload.head ? "headshot" : ""}`;
      clearTimeout(hitTimer);
      hitTimer = setTimeout(
        () => $("#hitmarker").classList.remove("visible"),
        110,
      );
      break;
    case "damage":
      $("#damage-overlay").classList.add("visible");
      clearTimeout(damageTimer);
      damageTimer = setTimeout(
        () => $("#damage-overlay").classList.remove("visible"),
        400,
      );
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
  }
}
async function startGame(event) {
  if (game?.state === "loading") return;
  // Some touch browsers report zero maxTouchPoints. A touch launch also covers
  // hybrid devices whose primary pointer is a mouse or trackpad.
  const touch =
    event?.pointerType === "touch" || matchMedia("(pointer: coarse)").matches;
  // Unlock audio in the actual click/tap, before loading the 3D engine.
  sound.setVolume(settings.volume);
  sound.setMusicVolume(settings.musicVolume);
  void sound.init().catch(() => {});
  closePanel();
  $("#loading-map").textContent = MAPS.find((m) => m.id === selectedMap).name;
  state("loading");
  await new Promise((r) =>
    requestAnimationFrame(() => requestAnimationFrame(r)),
  );
  try {
    if (!game) {
      const { Game } = await import("./game.js");
      game = new Game($("#game-canvas"), settings, onEvent, sound);
      if (import.meta.env.DEV) {
        window.__vesper = game;
      }
    }
    await game.start(selectedMap, difficulty, touch);
    $("#hud-map").textContent = MAPS.find((m) => m.id === selectedMap).short;
  } catch (e) {
    console.error(e);
    state("menu");
    toast({
      title: "Le jeu n’a pas pu démarrer",
      text: "Vérifiez que l’accélération graphique et WebGL 2 sont activés dans votre navigateur.",
    });
  }
}
function selectMap(id) {
  selectedMap = id;
  const map = MAPS.find((m) => m.id === id);
  menuArt.style.backgroundImage = `url(/art/${id}.png)`;
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
    id === "abbey"
      ? "ÉCLIPSE TOTALE · AUCUN SURVIVANT SIGNALÉ"
      : "NUIT POLAIRE · SIGNAL NON IDENTIFIÉ";
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
$("#resume-button").onclick = () => game.resume();
$("#retry-button").onclick = startGame;
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
  if (kind === "settings") {
    content.innerHTML = `<div class="eyebrow">PERSONNALISEZ VOTRE EXPÉRIENCE</div><h2>Paramètres</h2><p class="panel-description">Trouvez votre équilibre entre précision, atmosphère et fluidité.</p><div class="settings-grid"><section><h3>SON & COMMANDES</h3>${slider("volume", "Volume général", 0, 1, 0.05, settings.volume, Math.round(settings.volume * 100) + " %")}${slider("musicVolume", "Musique", 0, 1, 0.05, settings.musicVolume, Math.round(settings.musicVolume * 100) + " %")}${slider("sensitivity", "Sensibilité de la souris", 0.2, 3, 0.1, settings.sensitivity, settings.sensitivity.toFixed(1))}<div class="setting"><label for="setting-layout">Disposition du clavier<span>Les commandes suivent la position physique des touches.</span></label><select id="setting-layout"><option value="azerty" ${settings.layout === "azerty" ? "selected" : ""}>AZERTY · ZQSD</option><option value="qwerty" ${settings.layout === "qwerty" ? "selected" : ""}>QWERTY · WASD</option></select></div></section><section><h3>AFFICHAGE</h3>${slider("fov", "Champ de vision", 65, 105, 5, settings.fov, settings.fov + "°")}<div class="setting"><label for="setting-quality">Qualité graphique<span>Élevée : halos lumineux et résolution supérieure.</span></label><select id="setting-quality">${[
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
      )}</select></div>${toggle("shake", "Mouvements de recul", settings.shake)}${toggle("crosshair", "Réticule de visée", settings.crosshair)}</section></div><div class="panel-foot"><span>Vos réglages sont enregistrés automatiquement sur cet appareil.</span><button class="secondary-button" id="reset-settings">RÉGLAGES PAR DÉFAUT</button></div>`;
    for (const key of ["volume", "musicVolume", "sensitivity", "fov"])
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
    for (const key of ["layout", "quality"])
      $("#setting-" + key).onchange = (e) => {
        settings[key] = e.target.value;
        persistSettings();
      };
    for (const key of ["shake", "crosshair"])
      $("#setting-" + key).onchange = (e) => {
        settings[key] = e.target.checked;
        persistSettings();
      };
    $("#reset-settings").onclick = () => {
      settings = { ...DEFAULT_SETTINGS };
      persistSettings();
      openPanel("settings");
    };
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
      )}</div><div class="lore-note">${icon("bolt")} LA TRANSFIGURATION <span>Après avoir rétabli le courant, investissez 3 000 essences pour multiplier les dégâts par 2,5 et agrandir votre chargeur.</span></div>`;
  } else if (kind === "archives") {
    const save = readSave();
    content.innerHTML = `<div class="eyebrow">CE QUI RESTE APRÈS LA NUIT</div><h2>Archives du signal.</h2><p class="panel-description">Vos expéditions sont enregistrées sur cet appareil.</p><div class="archive-summary"><div><strong>${save.runs || "00"}</strong><span>EXPÉDITIONS</span></div><div><strong>${save.totalKills || "00"}</strong><span>ÉLIMINATIONS</span></div><div><strong>${Math.max(0, ...Object.values(save.records || {}).map((r) => r.wave))}</strong><span>MEILLEURE VAGUE</span></div></div><div class="archive-maps">${MAPS.map(
      (m) => {
        const r = save.records?.[m.id];
        return `<article><img src="/art/${m.id}.png" alt=""/><div><span class="eyebrow">${m.region}</span><h3>${m.name}</h3><p>${r ? `Vague ${r.wave} · ${r.kills} éliminations · ${formatTime(r.time)} · ${r.victory ? "Extraction réussie" : "Signal perdu"}` : "Aucune expédition enregistrée. Le signal vous attend."}</p></div></article>`;
      },
    ).join(
      "",
    )}</div><h3 class="bestiary-title">LES PRÉSENCES</h3><div class="bestiary-grid">${Object.entries(
      ENEMIES,
    )
      .map(
        ([id, e], i) =>
          `<article><span class="enemy-glyph" style="color:#${e.eye.toString(16)}">${icon(id === "brute" ? "shield" : id === "wraith" ? "eclipse" : "skull")}</span><span class="tiny">SUJET 0${i + 1}</span><h3>${e.name}</h3><p>${{ walker: "Lent, nombreux. Visez la tête et gardez vos distances.", runner: "Rapide et fragile. Ne lui tournez pas le dos.", brute: "Massif et résistant. Grenades et armes transfigurées conseillées.", spitter: "Projette de l’acide à distance. Déplacez-vous latéralement.", wraith: "Sa silhouette disparaît. Ses yeux trahissent sa présence." }[id]}</p></article>`,
      )
      .join("")}</div>`;
  } else if (kind === "quit") {
    content.innerHTML = `<div class="eyebrow">ABANDONNER L’EXPÉDITION</div><h2>Couper le signal ?</h2><p class="panel-description">Cette partie sera terminée. Votre résultat sera conservé dans les archives.</p><div class="dialog-actions"><button class="primary-button" id="confirm-quit">QUITTER LA PARTIE ${icon("arrow")}</button><button class="secondary-button" id="cancel-quit">RESTER EN VIE</button></div>`;
    $("#confirm-quit").onclick = () => {
      closePanel();
      game.end(false);
      game.menu();
    };
    $("#cancel-quit").onclick = closePanel;
  } else {
    content.innerHTML = `<div class="eyebrow">MANUEL DE L’OPÉRATEUR</div><h2>Restez en mouvement.</h2><p class="panel-description">Éliminez les présences. Préparez la prochaine vague. Retrouvez la lumière.</p><div class="guide-grid"><section><h3>COMMANDES</h3><div class="controls-list">${[
      [settings.layout === "azerty" ? "Z Q S D" : "W A S D", "Se déplacer"],
      ["SOURIS", "Regarder autour de soi"],
      ["CLIC GAUCHE", "Tirer (maintenir pour les armes automatiques)"],
      ["CLIC DROIT", "Viser"],
      ["MAJ", "Maintenir pour courir · consomme l’endurance"],
      ["C", "S’accroupir / se relever"],
      ["ESPACE", "Sauter"],
      ["R", "Recharger"],
      ["E", "Interagir / acheter / prendre une arme"],
      ["1 / 2 · MOLETTE", "Changer d’arme"],
      ["V", "Coup de couteau"],
      ["G", "Lancer une grenade"],
      ["F", "Lampe torche"],
      ["N", "Appeler la prochaine vague"],
      ["ÉCHAP", "Pause / libérer la souris"],
    ]
      .map(([key, desc]) => `<div><kbd>${key}</kbd><span>${desc}</span></div>`)
      .join(
        "",
      )}</div></section><section><h3>LE PLAN POUR RENTRER</h3><ol class="survival-steps"><li><b>Faites compter chaque balle.</b><p>Les tirs à la tête infligent davantage de dégâts et rapportent plus d’essences. Le couteau permet d’économiser vos munitions.</p></li><li><b>Équipez-vous.</b><p>Le Reliquaire coûte 950 essences. Vous pouvez porter deux armes. Récupérez le résultat avec E avant sa disparition.</p></li><li><b>Ouvrez la voie.</b><p>Déverrouillez la grille pour 750 essences. Le générateur se trouve au fond, dans l’aile gauche.</p></li><li><b>Rétablissez le courant.</b><p>Activez les atouts et la Transfiguration. Sang de fer augmente votre santé ; Nerfs d’acier améliore recharge et endurance.</p></li><li><b>Survivez. Puis choisissez.</b><p>Après la vague 10, activez la balise près de votre point d’arrivée. Restez à moins de 4,5 mètres pendant 20 secondes pour être extrait, ou continuez les vagues sans limite.</p></li></ol><div class="guide-tip">Votre santé se régénère après 5 secondes sans dégâts. Les anomalies laissées par les ennemis offrent soins, munitions ou bonus temporaires.</div></section></div><div class="panel-foot"><span>Sur écran tactile : joystick gauche pour marcher, glissement à droite pour regarder. Poussez le joystick à fond ou activez COURIR. ACCROUPIR permet de s’accroupir ; appuyez à nouveau pour vous relever. Les boutons R, E, G, V reprennent les actions ci-dessus.</span></div>`;
  }
  $("#close-panel").focus();
}
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
const minimap = $("#minimap"),
  mc = minimap.getContext("2d");
let miniFrame = 0;
function renderHUD(h) {
  $("#wave-number").textContent = String(h.wave).padStart(2, "0");
  $("#wave-status").textContent =
    h.phase === "rest"
      ? `PROCHAINE DANS ${h.timer} S · [N]`
      : "SURVIVEZ À LA HORDE";
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
    ["sprint", game.touchRun || h.sprinting],
    ["crouch", h.crouched],
    ["aim", game.mouse.aim],
  ]) {
    const button = $(`[data-action="${action}"]`);
    button.classList.toggle("selected", !!selected);
    button.setAttribute("aria-pressed", String(!!selected));
  }
  $("#points-value").textContent = h.points.toLocaleString("fr-FR");
  $("#weapon-name").textContent =
    h.definition.name + (h.weapon.level ? " ✦" : "");
  $("#weapon-class").textContent = h.weapon.level
    ? "TRANSFIGURÉE"
    : h.definition.class;
  $("#ammo-value").textContent = String(h.weapon.ammo).padStart(2, "0");
  $("#ammo-value").classList.toggle("low", h.weapon.ammo < 4);
  $("#reserve-value").textContent = h.weapon.reserve;
  $("#grenade-count").textContent = h.grenades;
  $("#session-timer").textContent = formatTime(h.time);
  $("#weapon-slots").innerHTML = h.slots
    .map(
      (w, i) =>
        `<span class="${w === h.weapon ? "selected" : ""}"><kbd>${i + 1}</kbd>${WEAPONS[w.id].name}</span>`,
    )
    .join("");
  $("#crosshair").style.display =
    settings.crosshair && !game.mouse.aim ? "" : "none";
  $("#crosshair").classList.toggle("wide", h.weapon.id === "requiem");
  $("#scope").classList.toggle(
    "hidden",
    !(game.mouse.aim && h.weapon.id === "longinus" && h.reload === null),
  );
  $("#interaction").classList.toggle("hidden", !h.interaction);
  $("#interaction span").textContent = h.interaction || "";
  $("#reload-bar").classList.toggle("hidden", h.reload === null);
  $("#reload-bar i").style.width = (h.reload || 0) * 100 + "%";
  $("#perk-slots").innerHTML = h.perks
    .map(
      (p) =>
        `<span title="${p === "health" ? "Sang de fer" : "Nerfs d’acier"}">${icon(p === "health" ? "cross" : "bolt")}</span>`,
    )
    .join("");
  $("#powerup-row").innerHTML = [
    h.double ? `<span>×2 ESSENCES <b>${h.double}s</b></span>` : "",
    h.insta ? `<span>☠ MORT INSTANTANÉE <b>${h.insta}s</b></span>` : "",
  ].join("");
  $("#quick-controls").classList.toggle("faded", h.time > 35);
  $("#quick-controls kbd").textContent =
    settings.layout === "azerty" ? "ZQSD" : "WASD";
  let title, sub;
  if (h.extraction !== null) {
    title = `Extraction · ${h.extraction} s`;
    sub = "Restez près de la balise (rayon de 4,5 m).";
  } else if (!h.door) {
    title = "Ouvrir la zone interdite";
    sub = "Grille centrale · 750 essences";
  } else if (!h.power) {
    title = "Rétablir le courant";
    sub = "Générateur · Aile gauche, au fond";
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
  $("#compass-directions").innerHTML =
    `<span>${dirs[(Math.round(angle / 45) + 7) % 8]}</span> ${dirs[Math.round(angle / 45) % 8]} <span>${dirs[(Math.round(angle / 45) + 1) % 8]}</span>`;
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
        90 + (e.model.position.x - px) * scale,
        90 + (e.model.position.z - pz) * scale,
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
}
function renderEnd(r) {
  lastRecord = r;
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
    `${r.headshots} tirs à la tête · ${r.accuracy} % de précision · ${DIFFICULTIES[r.difficulty].name}`;
}
// Touch controls use independent pointer captures: movement, camera and firing can run simultaneously.
const stick = $("#touch-move");
let movePointer = null,
  moveOrigin;
stick.addEventListener("pointerdown", (e) => {
  if (!game) return;
  movePointer = e.pointerId;
  moveOrigin = { x: e.clientX, y: e.clientY };
  stick.setPointerCapture(e.pointerId);
});
stick.addEventListener("pointermove", (e) => {
  if (e.pointerId !== movePointer) return;
  const x = Math.max(-1, Math.min(1, (e.clientX - moveOrigin.x) / 42)),
    y = Math.max(-1, Math.min(1, (e.clientY - moveOrigin.y) / 42));
  game.touchMove = { x, y: -y };
  game.touchSprint = Math.hypot(x, y) > 0.93;
  stick.querySelector("span").style.transform =
    `translate(${x * 30}px,${y * 30}px)`;
});
function stopMove() {
  movePointer = null;
  if (game) {
    game.touchMove = { x: 0, y: 0 };
    game.touchSprint = false;
  }
  stick.querySelector("span").style.transform = "";
}
stick.addEventListener("pointerup", stopMove);
stick.addEventListener("pointercancel", stopMove);
let lookPointer = null,
  lastLook;
const look = $("#touch-look");
look.addEventListener("pointerdown", (e) => {
  lookPointer = e.pointerId;
  lastLook = { x: e.clientX, y: e.clientY };
  look.setPointerCapture(e.pointerId);
});
look.addEventListener("pointermove", (e) => {
  if (e.pointerId !== lookPointer || !game) return;
  game.yaw -= (e.clientX - lastLook.x) * 0.004 * settings.sensitivity;
  game.pitch = Math.max(
    -1.35,
    Math.min(
      1.35,
      game.pitch - (e.clientY - lastLook.y) * 0.004 * settings.sensitivity,
    ),
  );
  lastLook = { x: e.clientX, y: e.clientY };
});
look.addEventListener("pointerup", () => (lookPointer = null));
look.addEventListener("pointercancel", () => (lookPointer = null));
$$("[data-action]").forEach((b) => {
  b.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (!game || game.state !== "playing") return;
    b.setPointerCapture(e.pointerId);
    switch (b.dataset.action) {
      case "fire":
        game.mouse.fire = true;
        game.shoot();
        break;
      case "aim":
        game.mouse.aim = !game.mouse.aim;
        b.classList.toggle("selected", game.mouse.aim);
        break;
      case "reload":
        game.reload();
        break;
      case "interact":
        game.interact();
        break;
      case "grenade":
        game.grenade();
        break;
      case "melee":
        game.melee();
        break;
      case "switch":
        game.switchWeapon(1 - game.slot);
        break;
      case "jump":
        game.jump();
        break;
      case "sprint":
        game.toggleRun();
        break;
      case "crouch":
        game.toggleCrouch();
        break;
    }
  });
  for (const event of ["pointerup", "pointercancel"])
    b.addEventListener(event, () => {
      if (b.dataset.action === "fire" && game) game.mouse.fire = false;
    });
});
// Reset captured touch states whenever the simulation pauses.
window.addEventListener("blur", stopMove);
persistSettings();
