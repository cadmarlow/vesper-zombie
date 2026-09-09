import * as T from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { FXAAShader } from "three/addons/shaders/FXAAShader.js";
import { prepareSurfaces, setSurfaceQuality } from "./surfaces.js";
import {
  releaseZombie,
  setZombieDetail,
  destroyZombieHead,
} from "./creatures.js";
import { prepareCreatureSkins } from "./creature-head.js";
import { animateWeapon } from "./weapons.js";
import { CombatEffects } from "./combat-effects.js";
import {
  captureEnvironment,
  cinematicShader,
  WorldOcclusionPass,
  ContactShadows,
} from "./rendering.js";
import { World, disposeModel } from "./world.js";
import {
  zombieModel,
  animateZombie,
  weaponModel,
  knifeModel,
  glowSprite,
  mat,
  glow,
  mesh,
} from "./assets.js";
import { Sound } from "./audio.js";
import { WEAPONS, ENEMIES, DIFFICULTIES, MAPS, saveRecord } from "./config.js";
import {
  clamp,
  newWeapon,
  magazine,
  reloadWeapon,
  Navigation,
  moveSlide,
  canStand,
  waveCount,
  enemyType,
  mysteryWeapon,
} from "./logic.js";
const vec = new T.Vector3(),
  dir = new T.Vector3(),
  point = new T.Vector3(),
  ray = new T.Ray(),
  sphere = new T.Sphere(),
  aabb = new T.Box3();
const MELEE_DURATION = 0.78,
  MELEE_CONTACT = 0.3;

export class Game {
  constructor(canvas, settings, emit, sound = null) {
    this.canvas = canvas;
    this.settings = settings;
    this.emit = emit;
    this.sound = sound || new Sound();
    this.sound.setVolume(settings.volume);
    this.sound.setMusicVolume(settings.musicVolume ?? 0.75);
    this.state = "menu";
    this.keys = new Set();
    this.mouse = { fire: false, aim: false };
    this.enemies = [];
    this.effects = [];
    this.projectiles = [];
    this.pickups = [];
    this.gunCache = new Map();
    this.time = 0;
    this.last = performance.now();
    this.yaw = 0;
    this.pitch = 0;
    this.hudTimer = 0;
    this.navTimer = 0;
    this.fps = 60;
    this.frameTimes = [];
    this.mobileResolutionScale = 1;
    this.desktopResolutionScale = 1;
    this.resolutionRecovery = 0;
    this.adaptiveOcclusionOff = false;
    this.mobileFrameMs = 16.7;
    this.resolutionTimer = 0;
    // Every frame goes through the composer's own render targets and ends in
    // a full-screen quad, so a multisampled canvas only adds a resolve per
    // frame. Anti-aliasing comes from the FXAA pass.
    this.renderer = new T.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: "high-performance",
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    this.renderer.setClearColor(0x111d25);
    this.scene = new T.Scene();
    const pmrem = new T.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.environmentTarget = pmrem.fromScene(room, 0.045);
    this.scene.environment = this.environmentTarget.texture;
    this.scene.environmentIntensity = 0.38;
    room.dispose();
    pmrem.dispose();
    this.camera = new T.PerspectiveCamera(settings.fov, 1, 0.08, 160);
    this.camera.rotation.order = "YXZ";
    this.scene.add(this.camera);
    this.viewScene = new T.Scene();
    this.viewScene.environment = this.environmentTarget.texture;
    this.viewScene.environmentIntensity = 0.52;
    this.viewCamera = new T.PerspectiveCamera(62, 1, 0.01, 10);
    this.weaponAmbient = new T.HemisphereLight(0xc4dae7, 0x242929, 1.65);
    this.viewScene.add(this.weaponAmbient);
    const key = new T.DirectionalLight(0xdce7ea, 2.1);
    key.position.set(-2, 3, -1);
    this.viewScene.add(key);
    this.weaponKey = key;
    const rim = new T.DirectionalLight(0x779ea8, 1.5);
    rim.position.set(2, 0, 1);
    this.viewScene.add(rim);
    this.weaponRim = rim;
    this.weaponBounce = new T.PointLight(0xffbb77, 0, 5, 1.5);
    this.weaponBounce.position.set(-0.7, 0.2, -1.3);
    this.viewScene.add(this.weaponBounce);
    this.knife = knifeModel();
    this.viewScene.add(this.knife);
    this.knifeTrail = new T.Mesh(
      new T.RingGeometry(0.25, 0.27, 32, 1, 0.2, 1.9),
      new T.MeshBasicMaterial({
        color: 0xe8e9ce,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: T.DoubleSide,
        blending: T.AdditiveBlending,
      }),
    );
    this.knifeTrail.position.set(0, -0.01, -0.7);
    this.viewScene.add(this.knifeTrail);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.ao = new WorldOcclusionPass(this.scene, this.camera, 1, 1);
    this.ao.blendIntensity = 1.1;
    this.ao.updateGtaoMaterial({
      radius: 0.48,
      distanceExponent: 1.5,
      thickness: 0.8,
      samples: 8,
    });
    this.ao.updatePdMaterial({
      lumaPhi: 5,
      depthPhi: 2,
      normalPhi: 3,
      radius: 4,
      samples: 8,
    });
    this.composer.addPass(this.ao);
    // First-person models go through the same exposure, bloom and grading.
    this.viewPass = new RenderPass(this.viewScene, this.viewCamera);
    this.viewPass.clear = false;
    this.viewPass.clearDepth = true;
    this.composer.addPass(this.viewPass);
    this.bloom = new UnrealBloomPass(new T.Vector2(1, 1), 0.23, 0.45, 1.35);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.antialias = new ShaderPass(FXAAShader);
    this.composer.addPass(this.antialias);
    this.film = new ShaderPass(cinematicShader);
    this.composer.addPass(this.film);
    this.flash = new T.PointLight(0xffb260, 0, 8, 1);
    this.scene.add(this.flash);
    this.flashlight = new T.SpotLight(0xd5e8e3, 18, 23, 0.5, 0.65, 1.7);
    this.scene.add(this.flashlight, this.flashlight.target);
    this.flashlight.visible = true;
    this.resize();
    this.bind();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }
  bind() {
    window.addEventListener("resize", () => this.resize());
    window.addEventListener("keydown", (e) => {
      if (e.target.matches("input,select,textarea")) return;
      // Only swallow navigation keys during play. Menus and panels keep
      // keyboard focus traversal and button activation.
      if (
        this.state === "playing" &&
        [
          "Space",
          "Tab",
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
        ].includes(e.code)
      )
        e.preventDefault();
      this.keys.add(e.code);
      if (e.repeat) return;
      if (this.state === "playing") {
        switch (e.code) {
          case "KeyR":
            this.reload();
            break;
          case "KeyE":
            this.interact();
            break;
          case "KeyG":
            this.grenade();
            break;
          case "KeyV":
            this.melee();
            break;
          case "KeyC":
            this.toggleCrouch();
            break;
          case "ShiftLeft":
          case "ShiftRight":
            this.player.crouched = false;
            break;
          case "KeyF":
            this.flashlight.visible = !this.flashlight.visible;
            break;
          case "Digit1":
            this.switchWeapon(0);
            break;
          case "Digit2":
            this.switchWeapon(1);
            break;
          case "KeyN":
            if (this.phase === "rest")
              this.phaseTimer = Math.min(this.phaseTimer, 0.2);
            break;
          case "Escape":
            this.pause();
            break;
          case "Space":
            this.jump();
            break;
        }
      } else if (e.code === "Escape" && this.state === "paused") this.resume();
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => {
      this.keys.clear();
      if (this.state === "playing") this.pause();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.state === "playing") this.pause();
    });
    document.addEventListener("pointerlockchange", () => {
      if (
        document.pointerLockElement !== this.canvas &&
        this.state === "playing" &&
        !this.touch
      )
        this.pause();
    });
    document.addEventListener("mousemove", (e) => {
      if (this.state !== "playing") return;
      if (document.pointerLockElement === this.canvas) {
        this.yaw -= e.movementX * 0.0018 * this.settings.sensitivity;
        this.pitch = clamp(
          this.pitch - e.movementY * 0.0018 * this.settings.sensitivity,
          -1.38,
          1.38,
        );
      }
    });
    this.canvas.addEventListener("mousedown", (e) => {
      if (this.state !== "playing") return;
      if (document.pointerLockElement !== this.canvas && !this.touch) {
        this.lock();
        return;
      }
      if (e.button === 0) {
        this.mouse.fire = true;
        this.shoot();
      }
      if (e.button === 2) this.mouse.aim = true;
    });
    window.addEventListener("mouseup", (e) => {
      if (e.button === 0) this.mouse.fire = false;
      if (e.button === 2) this.mouse.aim = false;
    });
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    this.canvas.addEventListener(
      "wheel",
      (e) => {
        if (this.state === "playing") {
          e.preventDefault();
          this.switchWeapon(1 - this.slot);
        }
      },
      { passive: false },
    );
  }
  resize() {
    const w = innerWidth,
      h = window.visualViewport?.height || innerHeight;
    const cap = this.touch
      ? this.settings.quality === "high"
        ? 2
        : this.settings.quality === "medium"
          ? 1.5
          : 1
      : this.settings.quality === "high"
        ? 1.65
        : this.settings.quality === "medium"
          ? 1.15
          : 1;
    const budget = this.settings.quality === "high" ? 1600000 : 1000000;
    const nativeRatio = Math.min(
      devicePixelRatio,
      cap,
      Math.sqrt((this.touch ? budget : 2600000) / (w * h)),
    );
    const ratio = Math.max(
      Math.min(nativeRatio, 0.75),
      nativeRatio *
        (this.touch ? this.mobileResolutionScale : this.desktopResolutionScale),
    );
    const composerRatio = ratio;
    const previous = this.renderSize;
    // Browser bars can emit both viewport and window resize events. Avoid
    // allocating the same render targets twice for one viewport change.
    if (!previous || previous.ratio !== ratio)
      this.renderer.setPixelRatio(ratio);
    if (!previous || previous.w !== w || previous.h !== h)
      this.renderer.setSize(w, h);
    // The composer otherwise stays at 1× and stretches the world on Retina screens.
    if (!previous || previous.composerRatio !== composerRatio)
      this.composer.setPixelRatio(composerRatio);
    if (!previous || previous.w !== w || previous.h !== h)
      this.composer.setSize(w, h);
    this.renderSize = { w, h, ratio, composerRatio };
    this.antialias.uniforms.resolution.value.set(
      1 / (w * ratio),
      1 / (h * ratio),
    );
    this.film.uniforms.texel.value.copy(
      this.antialias.uniforms.resolution.value,
    );
    this.ao.enabled =
      !this.touch &&
      this.settings.quality === "high" &&
      !this.adaptiveOcclusionOff;
    this.ao.setSize(
      Math.max(1, Math.floor(w * ratio * 0.5)),
      Math.max(1, Math.floor(h * ratio * 0.5)),
    );
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.viewCamera.aspect = w / h;
    this.viewCamera.fov = this.touch ? 58 : 62;
    this.viewCamera.updateProjectionMatrix();
    this.bloom.enabled = this.settings.quality !== "low";
  }
  applySettings(settings) {
    this.settings = settings;
    this.mobileResolutionScale = 1;
    this.desktopResolutionScale = 1;
    this.adaptiveOcclusionOff = false;
    this.mobileFrameMs = 16.7;
    this.resolutionTimer = this.resolutionRecovery = 0;
    this.renderer.shadowMap.needsUpdate = true;
    this.sound.setVolume(settings.volume);
    this.sound.setMusicVolume(settings.musicVolume ?? 0.75);
    this.camera.fov = settings.fov;
    this.camera.updateProjectionMatrix();
    this.resize();
    this.world?.setQuality(this.settings.quality, this.touch);
    setSurfaceQuality(this.scene, this.settings.quality);
    setSurfaceQuality(this.viewScene, this.settings.quality);
  }
  async lock() {
    try {
      await this.canvas.requestPointerLock();
    } catch {
      this.emit("toast", {
        title: "Cliquez dans le jeu pour capturer la souris",
        text: "Échap permet de libérer le curseur.",
      });
    }
  }
  async start(map = "abbey", difficulty = "normal", touch = false) {
    this.state = "loading";
    this.emit("state", "loading");
    try {
      await this.load(map, difficulty, touch);
    } catch (error) {
      // A failed load must never strand the game in "loading": the menu can
      // otherwise no longer relaunch a session.
      this.cleanup();
      this.state = "menu";
      throw error;
    }
  }
  async load(map, difficulty, touch) {
    await this.sound.init();
    this.touch = touch;
    this.mobileResolutionScale = 1;
    this.desktopResolutionScale = 1;
    this.adaptiveOcclusionOff = false;
    this.resolutionRecovery = 0;
    this.mobileFrameMs = 16.7;
    this.resolutionTimer = 0;
    this.nextWeaponLight = 0;
    this.weaponBounce.intensity = 0;
    this.resize();
    this.cleanup();
    await Promise.all([
      prepareSurfaces(touch, map),
      // Creatures fall back to procedural skin when the scanned faces are
      // unavailable; a missing texture must not abort the whole session.
      prepareCreatureSkins(touch).catch((error) =>
        console.warn(
          "Creature skins unavailable, using procedural fallback",
          error,
        ),
      ),
    ]);
    this.map = map;
    this.film.uniforms.cold.value =
      map === "station" ? 1 : map === "abyss" ? 0.45 : 0;
    this.difficulty = DIFFICULTIES[difficulty];
    this.difficultyId = difficulty;
    this.world = new World(this.scene, map, this.settings.quality);
    this.world.viewer = this.camera;
    this.world.setQuality(this.settings.quality, touch);
    this.world.update(0, 0);
    // Compilation and the one-off reflection capture happen behind the loader.
    const warmup = Object.keys(ENEMIES).flatMap((type) =>
      (touch || this.settings.quality === "low"
        ? ["lite", "far"]
        : ["full", "lite", "far"]
      ).map((detail) => zombieModel(type, detail)),
    );
    warmup.forEach((model) => {
      this.scene.add(model);
      setSurfaceQuality(model, this.settings.quality);
    });
    await this.renderer.compileAsync(this.scene, this.camera);
    warmup.forEach((model) => {
      this.scene.remove(model);
      releaseZombie(model);
    });
    this.mapEnvironment = captureEnvironment(
      this.renderer,
      this.scene,
      this.world,
      touch,
    );
    this.scene.environment = this.mapEnvironment.texture;
    this.viewScene.environment = this.environmentTarget.texture;
    this.viewScene.environmentIntensity = 0.68;
    this.combatEffects = new CombatEffects(this.scene, touch, this.camera);
    this.contactShadows = new ContactShadows(this.scene);
    if (touch) {
      const anisotropy = Math.min(
        8,
        this.renderer.capabilities.getMaxAnisotropy(),
      );
      this.world.root.traverse((o) => {
        for (const material of Array.isArray(o.material)
          ? o.material
          : [o.material])
          if (material?.map) material.map.anisotropy = anisotropy;
      });
    }
    const navigationSize = Math.max(
      64,
      Math.ceil(
        (Math.max(this.world.bounds.x, this.world.bounds.z) * 2 + 4) / 8,
      ) * 8,
    );
    this.navigation = new Navigation(
      this.world.obstacles,
      navigationSize,
      1,
      0.36,
    );
    this.largeNavigation = new Navigation(
      this.world.obstacles,
      navigationSize,
      1,
      0.6,
    );
    this.player = {
      position: this.world.spawn.clone(),
      health: 100,
      maxHealth: 100,
      stamina: 100,
      crouched: false,
      crouchAmount: 0,
      sprinting: false,
      exhausted: false,
      vy: 0,
      grounded: true,
      points: 650,
      kills: 0,
      headshots: 0,
      shots: 0,
      hits: 0,
      grenades: 3,
      perks: [],
      lastHurt: -10,
      invulnerable: 0,
    };
    this.updateNavigation();
    this.weapons = [newWeapon("vigil")];
    this.slot = 0;
    this.wave = 0;
    this.phase = "rest";
    this.phaseTimer = 10;
    this.remaining = 0;
    this.spawnTimer = 0;
    this.reloadTime = 0;
    this.reloadDuration = 0;
    this.shotTimer = 0;
    this.meleeTimer = 0;
    this.meleePending = false;
    this.meleeSwing = false;
    this.knifeImpactTime = 0;
    this.knife.visible = false;
    this.knifeTrail.material.opacity = 0;
    this.recoil = 0;
    this.stepTimer = 0;
    this.growlTimer = 3;
    this.powerups = { double: 0, insta: 0 };
    this.yaw = 0;
    this.pitch = this.world.viewPitch || 0;
    this.time = 0;
    this.touchMove = { x: 0, y: 0 };
    this.touchSprint = false;
    this.touchRun = false;
    this.extraction = false;
    this.extractionTimer = 0;
    this.lastHurtEffect = 0;
    this.saved = false;
    this.navTimer = 0;
    this.camera.position.copy(this.player.position);
    this.camera.rotation.set(0, 0, 0);
    this.setGun();
    await this.renderer.compileAsync(
      this.combatEffects.root,
      this.camera,
      this.scene,
    );
    await this.renderer.compileAsync(this.viewScene, this.viewCamera);
    this.state = "playing";
    this.last = performance.now();
    this.nextShadowFrame = 0;
    this.updateHUD();
    this.emit("state", "playing");
    this.emit("announce", {
      eyebrow: MAPS.find((m) => m.id === map).region,
      title: MAPS.find((m) => m.id === map).short,
      subtitle: "Tenez 10 vagues. Rétablissez le courant. Rentrez vivant.",
      duration: 5500,
    });
    this.emit("toast", {
      title: "La nuit commence",
      text: touch
        ? "Glisse à gauche pour bouger. Maintiens le tir et glisse pour viser."
        : "Explorez les lieux. Appuyez sur N pour lancer la première vague.",
    });
    if (!touch) this.lock();
  }
  cleanup() {
    this.contactShadows?.dispose();
    this.contactShadows = null;
    this.scene.environment = this.environmentTarget.texture;
    this.viewScene.environment = this.environmentTarget.texture;
    this.mapEnvironment?.dispose();
    this.mapEnvironment = null;
    this.combatEffects?.dispose();
    this.combatEffects = null;
    if (this.world) {
      this.world.dispose();
      this.world = null;
    }
    for (const e of this.enemies) {
      this.scene.remove(e.model);
      releaseZombie(e.model);
    }
    this.enemies = [];
    for (const e of [...this.effects, ...this.pickups, ...this.projectiles]) {
      if (e.mesh) {
        this.scene.remove(e.mesh);
        disposeModel(e.mesh);
      }
    }
    this.effects = [];
    this.pickups = [];
    this.projectiles = [];
    if (this.gun) {
      this.viewScene.remove(this.gun);
      this.gun = null;
    }
    for (const gun of this.gunCache.values()) disposeModel(gun);
    this.gunCache.clear();
  }
  pause() {
    if (this.state !== "playing") return;
    this.state = "paused";
    this.keys.clear();
    this.touchMove = { x: 0, y: 0 };
    this.touchSprint = false;
    this.touchRun = false;
    this.mouse.fire = this.mouse.aim = false;
    if (document.pointerLockElement) document.exitPointerLock();
    this.emit("state", "paused");
  }
  resume() {
    if (this.state !== "paused") return;
    this.state = "playing";
    this.last = performance.now();
    this.emit("state", "playing");
    this.sound.init();
    if (!this.touch) this.lock();
  }
  menu() {
    this.state = "menu";
    if (document.pointerLockElement) document.exitPointerLock();
    this.keys.clear();
    this.mouse.fire = this.mouse.aim = false;
    this.cleanup();
    this.emit("state", "menu");
  }
  get weapon() {
    return this.weapons[this.slot];
  }
  get definition() {
    return WEAPONS[this.weapon.id];
  }
  setGun() {
    if (this.gun) this.viewScene.remove(this.gun);
    // Building a first-person weapon generates hundreds of geometries and
    // several canvases. Keep every model of the session so a switch or a
    // transfiguration never stalls a frame mid-fight.
    const key = `${this.weapon.id}-${this.weapon.level ? 1 : 0}`;
    if (!this.gunCache.has(key))
      this.gunCache.set(
        key,
        weaponModel(this.weapon.id, this.weapon.level, true),
      );
    this.gun = this.gunCache.get(key);
    this.gun.userData.flash.visible = false;
    setSurfaceQuality(this.gun, this.settings.quality);
    this.gun.scale.setScalar(this.touch ? 0.68 : 0.78);
    this.gun.position.set(
      this.touch ? 0.18 : 0.24,
      -0.24,
      this.touch ? -0.63 : -0.62,
    );
    this.viewScene.add(this.gun);
    this.reloadTime = 0;
    this.emit("weapon", this.weapon);
  }
  switchWeapon(slot) {
    if (this.meleeTimer > 0 || slot === this.slot || !this.weapons[slot])
      return;
    this.slot = slot;
    this.setGun();
    this.shotTimer = 0.25;
    this.sound.click();
    this.updateHUD();
  }
  reload() {
    if (
      this.state !== "playing" ||
      this.meleeTimer > 0 ||
      this.reloadTime > 0 ||
      this.weapon.ammo >= magazine(this.weapon) ||
      this.weapon.reserve <= 0
    )
      return;
    this.reloadDuration =
      this.definition.reload * (this.player.perks.includes("speed") ? 0.65 : 1);
    this.reloadTime = this.reloadDuration;
    this.sound.reload(this.reloadDuration);
    this.updateHUD();
  }
  obstacleDistance(origin, direction, max = 100, details = null) {
    ray.set(origin, direction);
    let nearest = max;
    for (const o of this.world.obstacles) {
      if (o.active === false) continue;
      aabb.min.set(o.x - o.w / 2, 0, o.z - o.d / 2);
      aabb.max.set(o.x + o.w / 2, o.h, o.z + o.d / 2);
      const hit = ray.intersectBox(aabb, point);
      if (hit) {
        const distance = origin.distanceTo(hit);
        if (distance < nearest) {
          nearest = distance;
          if (details) {
            details.obstacle = o;
            const dx = Math.abs(Math.abs(hit.x - o.x) - o.w / 2),
              dz = Math.abs(Math.abs(hit.z - o.z) - o.d / 2),
              dy = Math.abs(hit.y - o.h);
            details.normal =
              dy < dx && dy < dz
                ? new T.Vector3(0, 1, 0)
                : dx < dz
                  ? new T.Vector3(Math.sign(hit.x - o.x), 0, 0)
                  : new T.Vector3(0, 0, Math.sign(hit.z - o.z));
          }
        }
      }
    }
    return nearest;
  }
  shoot() {
    if (
      this.state !== "playing" ||
      this.reloadTime > 0 ||
      this.shotTimer > 0 ||
      this.meleeTimer > 0
    )
      return;
    const w = this.weapon,
      d = this.definition;
    if (w.ammo <= 0) {
      this.reload();
      if (w.reserve === 0 && this.shotTimer <= 0) {
        this.sound.click();
        this.shotTimer = 0.3;
        this.emit("toast", {
          title: "Munitions épuisées",
          text: this.touch
            ? "Utilise le couteau ou rejoins le ravitaillement."
            : "Passez au couteau [V] ou rejoignez le ravitaillement.",
        });
      }
      return;
    }
    w.ammo--;
    this.player.shots++;
    this.shotTimer = d.rate;
    this.recoil = Math.min(0.22, this.recoil + d.recoil);
    this.sound.shot(d);
    this.gun.userData.flash.visible = true;
    this.gun.userData.cycle = 1;
    this.gun.userData.flash.rotation.z = Math.random() * Math.PI * 2;
    this.flashTimer = 0.05;
    this.flash.intensity = 12;
    this.flash.position
      .copy(this.player.position)
      .add(this.camera.getWorldDirection(dir).multiplyScalar(0.7));
    const ejection = this.camera.position
      .clone()
      .add(
        new T.Vector3(0.18, -0.17, -0.35).applyQuaternion(
          this.camera.quaternion,
        ),
      );
    if (w.id !== "eclipse")
      this.combatEffects.casing(ejection, this.camera.quaternion);
    this.combatEffects.puff(
      this.camera.position
        .clone()
        .add(
          new T.Vector3(0.12, -0.12, -0.75).applyQuaternion(
            this.camera.quaternion,
          ),
        ),
    );
    const aimed = this.mouse.aim;
    let shotHit = false;
    for (let pellet = 0; pellet < d.pellets; pellet++) {
      const direction = new T.Vector3(0, 0, -1).applyQuaternion(
        this.camera.quaternion,
      );
      direction.x += (Math.random() - 0.5) * d.spread * (aimed ? 0.3 : 1);
      direction.y += (Math.random() - 0.5) * d.spread * (aimed ? 0.3 : 1);
      direction.normalize();
      const origin = this.camera.position.clone();
      const impact = {};
      let distance = this.obstacleDistance(origin, direction, 90, impact),
        target = null,
        head = false;
      if (direction.y < -0.001) {
        const ground = -origin.y / direction.y;
        if (ground < distance) {
          distance = ground;
          impact.normal = new T.Vector3(0, 1, 0);
        }
      }
      ray.set(origin, direction);
      for (const e of this.enemies) {
        if (e.dead) continue;
        const s = ENEMIES[e.type].scale;
        for (const part of [
          { y: 1.8, r: 0.21, head: true },
          { y: 1.27, r: 0.34, head: false },
          { y: 0.65, r: 0.27, head: false },
        ]) {
          sphere.center.set(
            e.model.position.x,
            e.model.position.y + part.y * s,
            e.model.position.z,
          );
          sphere.radius = part.r * s;
          const hit = ray.intersectSphere(sphere, point);
          if (hit) {
            const dist = origin.distanceTo(hit);
            if (dist < distance) {
              distance = dist;
              target = e;
              head = part.head;
            }
          }
        }
      }
      const end = origin.clone().addScaledVector(direction, distance);
      if (target) {
        const damage =
          d.damage *
          (1 + w.level * 1.5) *
          (head ? 2.35 : 1) *
          (this.powerups.insta > this.time ? 100 : 1);
        this.damageEnemy(target, damage, head, { position: end, direction });
        shotHit = true;
        this.emit("hit", { head });
        this.sound.hit(head);
        if (w.id === "eclipse") {
          this.burst(end, 0x67ffdf, 16, 0.8);
          for (const e of this.enemies)
            if (
              e !== target &&
              !e.dead &&
              e.model.position.distanceTo(end) < 3.2
            )
              this.damageEnemy(e, damage * 0.55, false);
        }
      } else if (distance < 90) {
        this.burst(end, w.id === "eclipse" ? 0x61ffdf : 0xdbb58b, 4, 0.3);
        this.combatEffects.impact(
          end,
          impact.normal,
          w.id === "eclipse" ? 0.4 : 0.16 + Math.random() * 0.08,
        );
        if (pellet === 0) this.combatEffects.puff(end);
      }
      if (pellet === 0 || w.id === "eclipse")
        this.tracer(
          origin
            .clone()
            .add(
              new T.Vector3(0.16, -0.16, 0).applyQuaternion(
                this.camera.quaternion,
              ),
            ),
          end,
          w.id === "eclipse" ? 0x6dffe7 : 0xffd4a0,
          w.id === "eclipse" ? 0.065 : 0.024,
        );
    }
    if (shotHit) this.player.hits++;
    this.updateHUD();
  }
  damageEnemy(enemy, damage, head, hit = null) {
    if (enemy.dead) return;
    enemy.health -= damage;
    enemy.stagger = 0.16;
    const headKill = head && enemy.health <= 0;
    // Shotgun pellets still deal their own damage, but share one body spray in
    // a short interval. A lethal headshot always gets its complete effect.
    if (headKill || this.time >= (enemy.nextBloodFx || 0)) {
      const position =
        hit?.position?.clone() ||
        enemy.model.position
          .clone()
          .add(new T.Vector3(0, (head ? 1.8 : 1.27) * enemy.model.scale.y, 0));
      const direction =
        hit?.direction ||
        position.clone().sub(this.camera.position).normalize();
      if (headKill) destroyZombieHead(enemy.model, position);
      this.combatEffects.blood.hit(position, direction, headKill);
      this.projectBlood(position, direction, headKill);
      this.sound.flesh(headKill);
      enemy.nextBloodFx = this.time + 0.055;
    }
    const push = new T.Vector3(
      enemy.model.position.x - this.player.position.x,
      0,
      enemy.model.position.z - this.player.position.z,
    )
      .normalize()
      .multiplyScalar(0.035);
    moveSlide(
      enemy.model.position,
      push.x,
      push.z,
      this.world.obstacles,
      enemy.type === "brute" ? 0.6 : 0.36,
    );
    if (enemy.health <= 0) {
      enemy.dead = true;
      enemy.deathTime = 2.4;
      enemy.fallSide = Math.random() < 0.5 ? -1 : 1;
      this.player.kills++;
      if (head) this.player.headshots++;
      const points =
        (ENEMIES[enemy.type].score + (head ? 50 : 0)) *
        (this.powerups.double > this.time ? 2 : 1);
      this.player.points += points;
      this.emit("score", { points, head, type: enemy.type });
      if (Math.random() < 0.17) this.drop(enemy.model.position);
      if (enemy.type === "brute") {
        this.drop(enemy.model.position, "ammo");
        this.emit("toast", {
          title: "Pénitent abattu",
          text: "+300 essences · Munitions récupérables",
        });
      }
    }
  }
  projectBlood(position, direction, headKill) {
    const origin = position.clone().addScaledVector(direction, 0.06),
      range = headKill ? 4 : 2.2,
      hit = {};
    let distance = this.obstacleDistance(origin, direction, range, hit),
      size = headKill ? 0.85 : 0.42;
    if (direction.y < -0.001) {
      const floor = -origin.y / direction.y;
      if (floor >= 0 && floor < distance) {
        distance = floor;
        hit.normal = new T.Vector3(0, 1, 0);
        hit.obstacle = null;
      }
    }
    if (!hit.normal || distance >= range) return;
    const point = origin.addScaledVector(direction, distance),
      o = hit.obstacle;
    if (o) {
      // Navigation boundaries and the broad colliders around machinery do
      // not necessarily coincide with a rendered surface.
      if (!o.bloodSurface) return;
      const { minY, maxY } = o.bloodSurface;
      if (Math.abs(hit.normal.y) > 0.5 && Math.abs(point.y - maxY) > 0.025)
        return;
      // Keep the full quad on the struck face, never hanging over a narrow
      // pillar, tabletop or crate edge. World collision boxes supply the face.
      const edgeX = o.w / 2 - Math.abs(point.x - o.x),
        edgeZ = o.d / 2 - Math.abs(point.z - o.z),
        edgeY = Math.min(point.y - minY, maxY - point.y),
        edge =
          hit.normal.y > 0.5
            ? Math.min(edgeX, edgeZ)
            : Math.abs(hit.normal.x) > 0.5
              ? Math.min(edgeZ, edgeY)
              : Math.min(edgeX, edgeY);
      size = Math.min(size, Math.max(0, edge * 1.35));
    }
    if (size > 0.08) this.combatEffects.blood.stain(point, hit.normal, size);
  }
  melee() {
    if (this.meleeTimer > 0 || this.state !== "playing") return;
    this.meleeTimer = MELEE_DURATION;
    this.meleePending = true;
    this.meleeSwing = true;
    this.reloadTime = 0;
    this.mouse.aim = false;
    this.knife.visible = true;
    this.sound.melee();
    this.updateHUD();
  }
  meleeContact() {
    this.camera.getWorldDirection(dir);
    dir.y = 0;
    dir.normalize();
    let target = null,
      dist = 2.35;
    for (const e of this.enemies) {
      if (e.dead) continue;
      vec.copy(e.model.position).sub(this.player.position);
      vec.y = 0;
      const d = vec.length();
      if (
        d < dist &&
        vec.normalize().dot(dir) > 0.4 &&
        Math.abs(this.camera.position.y - 1.15 * ENEMIES[e.type].scale) < 1.8
      ) {
        const contact = e.model.position.clone();
        contact.y += 1.15 * ENEMIES[e.type].scale;
        const direction = contact.clone().sub(this.camera.position);
        const reach = direction.length();
        direction.normalize();
        if (
          this.obstacleDistance(this.camera.position, direction, reach) >=
          reach - 0.05
        ) {
          target = e;
          dist = d;
        }
      }
    }
    if (target) {
      this.damageEnemy(target, 145 + this.wave * 7, false);
      this.sound.knifeImpact();
      this.knifeImpactTime = 0.09;
      this.emit("hit", { head: false });
    } else {
      this.camera.getWorldDirection(dir);
      const wall = this.obstacleDistance(this.camera.position, dir, 1.7);
      if (wall < 1.7) {
        this.burst(
          this.camera.position.clone().addScaledVector(dir, wall - 0.025),
          0xf3c18a,
          8,
          0.22,
        );
        this.sound.knifeImpact(true);
        this.knifeImpactTime = 0.07;
      }
    }
  }
  grenade() {
    if (
      this.meleeTimer > 0 ||
      this.player.grenades <= 0 ||
      this.state !== "playing"
    )
      return;
    this.player.grenades--;
    const model = new T.Mesh(
      new T.SphereGeometry(0.09, 8, 6),
      mat(0x4c6257, 0.65, 0.7),
    );
    model.position.copy(this.camera.position);
    this.scene.add(model);
    const velocity = this.camera
      .getWorldDirection(new T.Vector3())
      .multiplyScalar(12);
    velocity.y += 4;
    this.projectiles.push({
      mesh: model,
      velocity,
      life: 1.65,
      type: "grenade",
    });
    this.sound.melee();
    this.updateHUD();
  }
  explode(position) {
    this.sound.explosion();
    this.burst(position, 0xffa45a, 48, 1.6);
    const s = glowSprite(0xffbc76, 10);
    s.position.copy(position);
    this.scene.add(s);
    this.effects.push({ mesh: s, life: 0.45, max: 0.45, type: "flash" });
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = e.model.position.distanceTo(position);
      if (d < 6) {
        vec
          .copy(e.model.position)
          .add(new T.Vector3(0, 1, 0))
          .sub(position);
        const len = vec.length();
        if (this.obstacleDistance(position, vec.normalize(), len) >= len - 0.2)
          this.damageEnemy(e, 540 * (1 - d / 7), false);
      }
    }
    const d = this.player.position.distanceTo(position);
    if (d < 3.2) this.hurt(40 * (1 - d / 3.2));
    this.recoil = 0.16;
  }
  hurt(amount) {
    if (this.time < this.player.invulnerable || this.state !== "playing")
      return;
    this.player.health = Math.max(
      0,
      this.player.health - amount * this.difficulty.damage,
    );
    this.player.lastHurt = this.time;
    this.player.invulnerable = this.time + 0.37;
    this.lastHurtEffect = 1;
    this.sound.hurt();
    this.emit("damage");
    if (this.player.health <= 0) this.end(false);
  }
  beginWave() {
    this.wave++;
    this.phase = "wave";
    this.remaining = waveCount(this.wave, this.difficulty.count);
    this.spawnTimer = 0.4;
    this.sound.wave();
    this.emit("announce", {
      eyebrow:
        this.wave % 5 === 0
          ? "UNE PRÉSENCE APPROCHE"
          : "ILS ONT ENTENDU VOTRE SOUFFLE",
      title: `VAGUE ${String(this.wave).padStart(2, "0")}`,
      subtitle:
        this.wave === 1
          ? "Visez la tête. Restez en mouvement."
          : this.wave === 5
            ? "Les pénitents marchent parmi eux."
            : this.wave === 10
              ? "Dernière vague avant l’extraction."
              : "La nuit n’a pas dit son dernier mot.",
      duration: 3200,
    });
    if (this.wave % 3 === 0)
      this.player.grenades = Math.min(5, this.player.grenades + 1);
  }
  updateNavigation(rebuild = false) {
    for (const field of [this.navigation, this.largeNavigation]) {
      if (rebuild) field.rebuild();
      field.update(this.player.position.x, this.player.position.z);
    }
  }
  spawnEnemy(typeOverride, positionOverride) {
    const type = typeOverride || enemyType(this.wave);
    const navigation =
      type === "brute" ? this.largeNavigation : this.navigation;
    let pos = positionOverride;
    if (!pos) {
      const candidate = navigation.spawnPosition(
        this.world.spawnPoints,
        this.player.position,
        Math.random,
        this.enemies.filter((e) => !e.dead).map((e) => e.model.position),
      );
      if (!candidate) return false;
      // Always spawn at the validated position. The old fallback used the
      // authored anchor even when it overlapped a column or scenery collider.
      pos = new T.Vector3(candidate.x, 0, candidate.z);
    }
    const model = zombieModel(
      type,
      this.touch || this.settings.quality === "low" ? "lite" : "full",
    );
    setSurfaceQuality(model, this.settings.quality);
    model.position.copy(pos);
    model.position.y = -1.9;
    this.scene.add(model);
    this.enemies.push({
      model,
      type,
      health:
        ENEMIES[type].health *
        (1 + (this.wave - 1) * 0.15) *
        this.difficulty.health,
      attack: 1.5,
      stagger: 0,
      age: 0,
      seed: Math.random() * 12,
      dead: false,
      spit: 2 + Math.random() * 3,
    });
    return true;
  }
  updateEnemies(dt) {
    for (const e of this.enemies) {
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
      if (e.model.position.y < -0.2) continue;
      e.stagger -= dt;
      e.attack -= dt;
      e.spit -= dt;
      const d = Math.hypot(
        e.model.position.x - this.player.position.x,
        e.model.position.z - this.player.position.z,
      );
      if (this.time >= (e.nextDetailCheck || 0)) {
        e.nextDetailCheck = this.time + 0.4;
        // Three levels with hysteresis: full up close, lite at mid range, far
        // for the distant horde where a head spans a handful of pixels.
        const current = e.model.userData.detail,
          farAt = this.touch ? 13 : 18;
        const detail =
          d > (current === "far" ? farAt - 2 : farAt)
            ? "far"
            : this.touch ||
                this.settings.quality === "low" ||
                d > (current === "full" ? 10 : 8)
              ? "lite"
              : "full";
        setZombieDetail(e.model, detail, d < (this.touch ? 17 : 28));
      }
      let target = this.player.position;
      const direct = vec.subVectors(this.player.position, e.model.position);
      direct.y = 0;
      direct.normalize();
      const origin = point.copy(e.model.position);
      origin.y = 1;
      const blocked = this.obstacleDistance(origin, direct, d) < d - 0.1;
      const navigation =
        e.type === "brute" ? this.largeNavigation : this.navigation;
      target = navigation.direction(
        e.model.position.x,
        e.model.position.z,
        this.player.position,
      );
      const delta = dir.set(
        target.x - e.model.position.x,
        0,
        target.z - e.model.position.z,
      );
      const length = delta.length();
      if (length > 0.001) delta.divideScalar(length);
      const speed =
        ENEMIES[e.type].speed *
        (1 + Math.min(this.wave, 20) * 0.022) *
        (e.stagger > 0 ? 0.2 : 1);
      if (d > 1.15 || blocked) {
        let sx = 0,
          sz = 0;
        for (const other of this.enemies) {
          if (other === e || other.dead) continue;
          const dx = e.model.position.x - other.model.position.x,
            dz = e.model.position.z - other.model.position.z,
            ds = dx * dx + dz * dz;
          if (ds < 0.7 && ds > 0.001) {
            sx += (dx / ds) * 0.22;
            sz += (dz / ds) * 0.22;
          }
        }
        moveSlide(
          e.model.position,
          delta.x * Math.min(speed * dt, length) + sx * dt,
          delta.z * Math.min(speed * dt, length) + sz * dt,
          this.world.obstacles,
          e.type === "brute" ? 0.6 : 0.36,
        );
      }
      e.model.rotation.y = Math.atan2(
        this.player.position.x - e.model.position.x,
        this.player.position.z - e.model.position.z,
      );
      animateZombie(
        e.model,
        this.time + e.seed,
        speed / 1.65,
        d < 1.65,
        Math.min(0.16, e.stagger),
      );
      if (d < 1.65 && !blocked && e.attack <= 0) {
        this.hurt(ENEMIES[e.type].damage);
        e.attack = e.type === "runner" ? 0.85 : 1.15;
      }
      if (e.type === "spitter" && d < 17 && d > 3 && !blocked && e.spit <= 0) {
        const orb = new T.Mesh(
          new T.SphereGeometry(0.12, 8, 6),
          glow(0x9ae54f, 3),
        );
        orb.position.copy(e.model.position).add(new T.Vector3(0, 1.6, 0));
        this.scene.add(orb);
        const velocity = this.camera.position
          .clone()
          .sub(orb.position)
          .normalize()
          .multiplyScalar(7);
        this.projectiles.push({ mesh: orb, velocity, life: 3, type: "acid" });
        e.spit = 3.6;
      }
      if (e.type === "wraith") {
        e.model.visible = Math.sin(this.time * 5 + e.seed) > 0.05 || d < 4;
      }
    }
    const gone = this.enemies.filter((e) => e.dead && e.deathTime <= 0);
    for (const e of gone) {
      this.scene.remove(e.model);
      releaseZombie(e.model);
    }
    this.enemies = this.enemies.filter((e) => !gone.includes(e));
  }
  interact() {
    if (this.state !== "playing") return;
    const i = this.nearInteraction();
    if (!i) return;
    if (i.kind === "door" && i.open) return;
    if (i.kind === "recording") {
      i.read = true;
      this.sound.click();
      this.emit("toast", { title: i.name, text: i.text, duration: 11000 });
      this.updateHUD();
      return;
    }
    const fail = (text) => {
      this.emit("toast", { title: "Impossible pour le moment", text });
      this.sound.click();
    };
    if (i.kind === "box" && i.busy) {
      if (i.offered) {
        const id = i.offered;
        if (this.weapons.length < 2) {
          this.weapons.push(newWeapon(id));
          this.slot = 1;
        } else this.weapons[this.slot] = newWeapon(id);
        this.setGun();
        i.busy = false;
        i.offered = null;
        i.timer = 0;
        if (i.display) {
          i.root.remove(i.display);
          i.display = null;
        }
        this.sound.purchase();
        this.emit("toast", {
          title: WEAPONS[id].name,
          text: WEAPONS[id].description,
        });
      }
      return;
    }
    if (["upgrade", "health", "speed"].includes(i.kind) && !this.world.power)
      return fail("Rétablissez d’abord le courant au générateur.");
    if (i.kind === "power" && this.world.power)
      return fail("Le courant est déjà rétabli.");
    if (i.kind === "upgrade" && this.weapon.level)
      return fail("Cette arme est déjà transfigurée.");
    if (this.player.perks.includes(i.kind))
      return fail("Vous possédez déjà cet atout.");
    if (i.kind === "extract") {
      if (!this.world.power)
        return fail("Rétablissez le courant pour activer la balise.");
      if (this.wave < 10 || (this.phase === "wave" && this.wave === 10))
        return fail("Survivez à la vague 10 pour autoriser l’extraction.");
      if (this.extraction) return;
      this.extraction = true;
      this.extractionTimer = 20;
      this.emit("announce", {
        eyebrow: "LA BALISE A RÉPONDU",
        title: "EXTRACTION",
        subtitle: "Restez à proximité de la balise pendant 20 secondes.",
        duration: 4000,
      });
      this.sound.wave();
      return;
    }
    if (this.player.points < i.cost)
      return fail(`Il vous manque ${i.cost - this.player.points} essences.`);
    if (
      i.kind === "ammo" &&
      this.weapons.every(
        (w) => w.reserve >= WEAPONS[w.id].reserve * (w.level ? 1.5 : 1),
      ) &&
      this.player.grenades >= 3
    )
      return fail("Vos réserves sont déjà pleines.");
    this.player.points -= i.cost;
    this.sound.purchase();
    switch (i.kind) {
      case "door":
        this.world.openDoor(i);
        this.updateNavigation(true);
        this.emit("toast", {
          title: "Nouvelle zone ouverte",
          text:
            this.map === "abyss"
              ? `${i.name} · Cherchez les machines et les archives du secteur.`
              : "Le générateur et les machines d’atouts sont accessibles.",
        });
        break;
      case "box":
        i.busy = true;
        i.timer = 3.2;
        i.offerTimer = 0;
        this.sound.box();
        this.emit("toast", {
          title: "Le Reliquaire choisit…",
          text: "Revenez prendre votre arme une fois le tirage terminé.",
        });
        break;
      case "ammo":
        for (const w of this.weapons)
          w.reserve = Math.ceil(WEAPONS[w.id].reserve * (w.level ? 1.5 : 1));
        this.player.grenades = Math.max(3, this.player.grenades);
        this.emit("toast", {
          title: "Ravitaillement effectué",
          text: "Réserves pleines · Grenades reconstituées",
        });
        break;
      case "power":
        this.world.setPower();
        this.sound.powerOn();
        this.burst(
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
      case "upgrade":
        this.weapon.level = 1;
        this.weapon.ammo = magazine(this.weapon);
        this.weapon.reserve = Math.ceil(this.definition.reserve * 1.5);
        this.setGun();
        this.emit("toast", {
          title: "Arme transfigurée",
          text: "Dégâts ×2,5 · Chargeur augmenté · Munitions restaurées",
        });
        break;
      case "health":
        this.player.perks.push("health");
        this.player.maxHealth = 180;
        this.player.health = 180;
        this.emit("toast", {
          title: "Sang de fer",
          text: "Santé maximale augmentée à 180.",
        });
        break;
      case "speed":
        this.player.perks.push("speed");
        this.emit("toast", {
          title: "Nerfs d’acier",
          text: "Rechargement 35 % plus rapide · Endurance améliorée",
        });
        break;
    }
    this.updateHUD();
  }
  nearInteraction() {
    if (!this.world || !this.player) return null;
    let near = null,
      distance = 3.1;
    for (const i of this.world.interactions) {
      if (i.kind === "door" && i.open) continue;
      const dx =
        i.kind === "door"
          ? Math.max(
              0,
              Math.abs(this.player.position.x - i.obstacle.x) -
                i.obstacle.w / 2,
            )
          : this.player.position.x - i.position.x;
      const dz =
        i.kind === "door"
          ? Math.max(
              0,
              Math.abs(this.player.position.z - i.obstacle.z) -
                i.obstacle.d / 2,
            )
          : this.player.position.z - i.position.z;
      // Grilles are operated across their frame; machines use their centre.
      const d = Math.max(0, Math.hypot(dx, dz) - (i.kind === "door" ? 1 : 0));
      if (d < distance) {
        near = i;
        distance = d;
      }
    }
    return near;
  }
  interactionText(i) {
    if (!i) return null;
    let action = `${i.name} · ${i.cost ? `${i.cost} essences` : "Activer"}`;
    if (i.kind === "recording")
      action = `${i.read ? "Relire" : "Lire"} · ${i.name}`;
    if (i.kind === "box" && i.busy)
      action = i.offered
        ? `Prendre ${WEAPONS[i.offered].name}`
        : "Le Reliquaire choisit…";
    if (i.kind === "power" && this.world.power) action = "Courant rétabli";
    if (i.kind === "extract")
      action = this.extraction
        ? "Extraction en cours"
        : this.wave >= 10
          ? "Demander l’extraction"
          : "Extraction disponible après la vague 10";
    if (["health", "speed", "upgrade"].includes(i.kind) && !this.world.power)
      action = `${i.name} · Courant requis`;
    if (
      this.player.perks.includes(i.kind) ||
      (i.kind === "upgrade" && this.weapon.level)
    )
      action = `${i.name} · Acquis`;
    return action;
  }
  drop(position, forced) {
    const r = Math.random(),
      type =
        forced ||
        (r < 0.3
          ? "health"
          : r < 0.57
            ? "ammo"
            : r < 0.82
              ? "double"
              : "insta");
    const color = {
      health: 0xff6560,
      ammo: 0xeac786,
      double: 0xecb648,
      insta: 0x9cfaf3,
    }[type];
    const model = new T.Group();
    const core = mesh(new T.OctahedronGeometry(0.22), glow(color, 2), model);
    const halo = glowSprite(color, 1.5);
    model.add(halo);
    model.position.copy(position);
    model.position.y = 0.5;
    this.scene.add(model);
    this.pickups.push({ mesh: model, type, life: 24 });
  }
  collect(p) {
    this.sound.pickup();
    switch (p.type) {
      case "health":
        this.player.health = Math.min(
          this.player.maxHealth,
          this.player.health + 50,
        );
        break;
      case "ammo":
        for (const w of this.weapons) {
          w.reserve = Math.ceil(WEAPONS[w.id].reserve * (w.level ? 1.5 : 1));
        }
        break;
      case "double":
        this.powerups.double = this.time + 25;
        break;
      case "insta":
        this.powerups.insta = this.time + 18;
        break;
    }
    const names = {
      health: "Vitalité +50",
      ammo: "Munitions maximales",
      double: "Essences doubles · 25 s",
      insta: "Mort instantanée · 18 s",
    };
    this.emit("toast", { title: names[p.type], text: "Anomalie récupérée" });
    p.life = 0;
  }
  burst(position, color, count = 8, force = 1) {
    this.combatEffects.burst(position, color, count, force);
  }
  tracer(start, end, color, radius) {
    this.combatEffects.tracer(start, end, color, radius);
  }
  updateEffects(dt) {
    this.combatEffects.update(dt);
    for (const e of this.effects) {
      e.life -= dt;
      if (e.velocity) {
        e.velocity.y -= dt * 7;
        e.mesh.position.addScaledVector(e.velocity, dt);
      }
      if (e.mesh.material)
        e.mesh.material.opacity =
          Math.max(0, e.life / e.max) * (e.type === "flash" ? 0.6 : 1);
    }
    for (const p of this.projectiles) {
      p.life -= dt;
      const prev = p.mesh.position.clone();
      if (p.type === "grenade") p.velocity.y -= dt * 9;
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.mesh.rotation.x += dt * 5;
      if (p.mesh.position.y < 0.11) {
        p.mesh.position.y = 0.11;
        p.velocity.y = Math.abs(p.velocity.y) * 0.35;
        p.velocity.x *= 0.72;
        p.velocity.z *= 0.72;
      }
      if (
        !canStand(
          p.mesh.position.x,
          p.mesh.position.z,
          this.world.obstacles,
          0.12,
        )
      ) {
        p.mesh.position.copy(prev);
        p.velocity.x *= -0.5;
        p.velocity.z *= -0.5;
        if (p.type === "acid") p.life = 0;
      }
      if (
        p.type === "acid" &&
        p.mesh.position.distanceTo(this.camera.position) <
          (this.player.crouched ? 0.43 : 0.65)
      ) {
        this.hurt(13);
        p.life = 0;
      }
      if (p.life <= 0 && p.type === "grenade")
        this.explode(p.mesh.position.clone().add(new T.Vector3(0, 0.35, 0)));
    }
    for (const p of this.pickups) {
      p.life -= dt;
      p.mesh.rotation.y += dt * 1.5;
      p.mesh.position.y = 0.65 + Math.sin(this.time * 3) * 0.15;
      if (p.mesh.position.distanceTo(this.player.position) < 1.8)
        this.collect(p);
    }
    for (const list of [this.effects, this.projectiles, this.pickups]) {
      for (let i = list.length - 1; i >= 0; i--)
        if (list[i].life <= 0) {
          this.scene.remove(list[i].mesh);
          disposeModel(list[i].mesh);
          list.splice(i, 1);
        }
    }
    // Cap transient visuals during high-volume automatic fire.
    while (this.effects.length > 260) {
      const e = this.effects.shift();
      this.scene.remove(e.mesh);
      disposeModel(e.mesh);
    }
  }
  toggleCrouch() {
    if (this.state !== "playing" || !this.player.grounded) return;
    this.player.crouched = !this.player.crouched;
    this.touchRun = false;
    this.updateHUD();
  }
  toggleRun() {
    if (this.state !== "playing") return;
    this.touchRun = !this.touchRun;
    if (this.touchRun) this.player.crouched = false;
    this.updateHUD();
  }
  jump() {
    if (this.state !== "playing" || !this.player.grounded) return;
    this.player.crouched = false;
    this.player.vy = 5;
    this.player.grounded = false;
  }
  touchAimFriction() {
    if (!this.settings.touchAimAssist || !this.touch) return 1;
    const forward = this.camera.getWorldDirection(new T.Vector3());
    for (const enemy of this.enemies) {
      if (enemy.dead || enemy.model.position.y < -0.1) continue;
      const toward = enemy.model.position
        .clone()
        .add(new T.Vector3(0, 1.35, 0))
        .sub(this.camera.position);
      const distance = toward.length();
      if (distance < 2 || distance > 25) continue;
      toward.normalize();
      if (
        forward.dot(toward) > 0.993 &&
        this.obstacleDistance(this.camera.position, toward, distance) >=
          distance - 0.25
      )
        return 0.68;
    }
    return 1;
  }
  updateKnife() {
    const progress = MELEE_DURATION - this.meleeTimer;
    this.knife.visible = this.meleeTimer > 0;
    this.knifeTrail.visible = this.knife.visible;
    if (!this.knife.visible) return;
    const frames = [
      [0, 0.34, -0.8, -0.5, 0.25, -0.5, -0.9],
      [0.16, 0.17, -0.23, -0.8, -0.15, -0.2, -0.7],
      [0.25, 0.21, -0.17, -0.8, -0.1, -0.25, -0.9],
      [0.34, -0.09, -0.17, -0.83, -0.2, 0.15, 0.65],
      [0.44, -0.3, -0.32, -0.65, 0.12, 0.4, 1.3],
      [0.58, -0.08, -0.43, -0.57, 0.22, 0.2, 0.5],
      [MELEE_DURATION, 0.25, -0.9, -0.48, 0.2, 0, -0.4],
    ];
    let index = 0;
    while (index < frames.length - 2 && progress > frames[index + 1][0])
      index++;
    const a = frames[index],
      b = frames[index + 1];
    let blend = clamp((progress - a[0]) / (b[0] - a[0]), 0, 1);
    blend = blend * blend * (3 - 2 * blend);
    const pose = a.slice(1).map((v, i) => T.MathUtils.lerp(v, b[i + 1], blend));
    const mobileScale = Math.min(1, Math.max(0.6, this.viewCamera.aspect));
    this.knife.scale.setScalar(0.72 * mobileScale);
    this.knife.position.set(
      pose[0] * mobileScale * (this.viewCamera.aspect < 1 ? 0.5 : 1),
      pose[1],
      pose[2],
    );
    this.knife.rotation.set(pose[3], pose[4], pose[5] * mobileScale);
    this.knifeTrail.scale.setScalar(mobileScale);
    this.knifeTrail.rotation.z = 0.3 + (progress - 0.25) * 9;
    this.knifeTrail.material.opacity =
      progress > 0.26 && progress < 0.39
        ? Math.sin(((progress - 0.26) / 0.13) * Math.PI) * 0.16
        : 0;
  }
  updatePlayer(dt) {
    const p = this.player;
    if (this.meleeTimer > 0) this.mouse.aim = false;
    const forward =
      (this.keys.has("KeyW") || this.keys.has("ArrowUp") ? 1 : 0) -
      (this.keys.has("KeyS") || this.keys.has("ArrowDown") ? 1 : 0);
    const right =
      (this.keys.has("KeyD") || this.keys.has("ArrowRight") ? 1 : 0) -
      (this.keys.has("KeyA") || this.keys.has("ArrowLeft") ? 1 : 0);
    const touch = this.touchMove || { x: 0, y: 0 };
    const mx = right + touch.x,
      mz = forward + touch.y,
      length = Math.hypot(mx, mz);
    const sprint =
      !!(
        this.keys.has("ShiftLeft") ||
        this.keys.has("ShiftRight") ||
        this.touchSprint ||
        this.touchRun
      ) &&
      length > 0.1 &&
      !p.exhausted &&
      p.stamina > 0 &&
      !p.crouched &&
      !this.mouse.aim &&
      !this.mouse.fire &&
      !this.reloadTime &&
      !this.meleeTimer;
    p.sprinting = sprint;
    const speed =
      (p.crouched ? 1.8 : sprint ? 7.15 : 3.65) * (this.mouse.aim ? 0.62 : 1);
    p.crouchAmount = T.MathUtils.damp(
      p.crouchAmount,
      p.crouched ? 1 : 0,
      13,
      dt,
    );
    if (length > 0.05) {
      const x = mx / Math.max(1, length),
        z = mz / Math.max(1, length);
      moveSlide(
        p.position,
        (Math.cos(this.yaw) * x - Math.sin(this.yaw) * z) * speed * dt,
        (-Math.sin(this.yaw) * x - Math.cos(this.yaw) * z) * speed * dt,
        this.world.obstacles,
      );
      this.stepTimer -= dt;
      if (this.stepTimer <= 0 && p.grounded) {
        this.sound.step(sprint, p.crouched);
        this.stepTimer = p.crouched ? 0.64 : sprint ? 0.27 : 0.47;
      }
    }
    p.stamina = clamp(
      p.stamina + (sprint ? -(p.perks.includes("speed") ? 14 : 21) : 23) * dt,
      0,
      100,
    );
    if (p.stamina === 0) p.exhausted = true;
    else if (p.stamina >= 25) p.exhausted = false;
    if (!p.grounded) {
      p.vy -= dt * 13;
      p.position.y += p.vy * dt;
      if (p.position.y <= 1.7) {
        p.position.y = 1.7;
        p.grounded = true;
        p.vy = 0;
      }
    }
    if (this.time - p.lastHurt > 5 && p.health < p.maxHealth)
      p.health = Math.min(p.maxHealth, p.health + dt * 9);
    this.recoil = Math.max(0, this.recoil - dt * 0.65);
    this.lastHurtEffect = Math.max(0, this.lastHurtEffect - dt * 1.1);
    const bob =
      length > 0.05 && p.grounded
        ? Math.sin(this.time * (sprint ? 17 : p.crouched ? 7 : 10)) *
          (p.crouched ? 0.011 : sprint ? 0.047 : 0.027)
        : Math.sin(this.time * 1.5) * 0.007;
    this.camera.position.copy(p.position);
    this.camera.position.y +=
      (this.settings.shake ? bob : 0) - p.crouchAmount * 0.65;
    this.camera.rotation.set(
      this.pitch +
        (this.settings.shake
          ? this.recoil * 0.22 - this.knifeImpactTime * 0.12
          : 0),
      this.yaw,
      this.settings.shake && sprint ? Math.sin(this.time * 8.5) * 0.008 : 0,
      "YXZ",
    );
    const baseFov = this.touch
      ? Math.min(
          this.settings.fov,
          T.MathUtils.radToDeg(
            2 *
              Math.atan(
                (Math.tan(T.MathUtils.degToRad(this.settings.fov) / 2) *
                  (16 / 9)) /
                  this.camera.aspect,
              ),
          ),
        )
      : this.settings.fov;
    const targetFov = this.mouse.aim
      ? this.weapon.id === "longinus"
        ? 38
        : baseFov * 0.77
      : baseFov + (sprint ? 9 : 0);
    this.camera.fov = T.MathUtils.lerp(this.camera.fov, targetFov, dt * 10);
    this.camera.updateProjectionMatrix();
    const aim =
      this.mouse.aim && !this.reloadTime && !sprint && !this.meleeTimer;
    this.gun.visible =
      !this.meleeTimer && !(aim && this.weapon.id === "longinus");
    const reloadProgress =
      this.reloadTime > 0
        ? Math.sin((1 - this.reloadTime / this.reloadDuration) * Math.PI)
        : 0;
    this.gun.position.x =
      T.MathUtils.lerp(
        this.gun.position.x,
        aim ? 0 : sprint ? 0.12 : this.touch ? 0.18 : 0.24,
        dt * 14,
      ) + (length > 0.05 ? Math.cos(this.time * 6) * 0.0007 : 0);
    this.gun.position.y =
      T.MathUtils.lerp(
        this.gun.position.y,
        aim
          ? -(this.weapon.id === "longinus"
              ? 0.17
              : this.weapon.id === "vigil"
                ? 0.12
                : 0.138) * (this.touch ? 0.68 : 0.78)
          : sprint
            ? -0.31
            : -0.18,
        dt * 14,
      ) -
      reloadProgress * 0.012;
    this.gun.position.z =
      (this.touch ? -0.63 : -0.62) + this.recoil * 0.7 + reloadProgress * 0.2;
    this.gun.rotation.set(
      -reloadProgress * 0.55 + sprint * 0.36,
      reloadProgress * -0.35 + sprint * -0.28 + (aim ? 0 : 0.055),
      -reloadProgress * 0.52 + sprint * 0.27 + (aim ? 0 : -0.045),
    );
    this.gun.position.y += bob * 0.12;
    animateWeapon(
      this.gun,
      dt,
      this.reloadTime > 0 ? 1 - this.reloadTime / this.reloadDuration : 0,
      this.recoil,
      sprint,
      this.time,
      aim,
    );
    this.weaponAmbient.intensity = 1.1 + (this.world?.powerLevel || 0) * 0.25;
    this.weaponKey.position.set(
      -2 * Math.cos(this.yaw),
      3,
      -1 + Math.sin(this.yaw),
    );
    this.weaponKey.color.copy(this.world.sun.color);
    if (this.time > (this.nextWeaponLight || 0)) {
      this.nextWeaponLight = this.time + 0.1;
      let nearest = null,
        strength = 0;
      for (const { light } of this.world.lights) {
        const value =
          light.intensity /
          (2 + light.position.distanceToSquared(this.camera.position));
        if (value > strength) {
          strength = value;
          nearest = light;
        }
      }
      if (nearest) this.weaponBounce.color.lerp(nearest.color, 0.3);
      this.weaponBounce.intensity =
        Math.min(3.5, strength * 2.6) + this.recoil * 8;
    }
    this.updateKnife();
    this.flashlight.position.copy(this.camera.position);
    this.flashlight.target.position
      .copy(this.camera.position)
      .add(this.camera.getWorldDirection(dir).multiplyScalar(15));
    if (this.mouse.fire && (this.definition.automatic || this.touch))
      this.shoot();
  }
  update(dt) {
    this.time += dt;
    this.shotTimer = Math.max(0, this.shotTimer - dt);
    this.meleeTimer = Math.max(0, this.meleeTimer - dt);
    this.knifeImpactTime = Math.max(0, this.knifeImpactTime - dt);
    this.flashTimer = (this.flashTimer || 0) - dt;
    if (this.flashTimer <= 0) {
      this.flash.intensity = 0;
      this.gun.userData.flash.visible = false;
    }
    if (this.reloadTime > 0) {
      this.reloadTime = Math.max(0, this.reloadTime - dt);
      if (this.reloadTime === 0) reloadWeapon(this.weapon);
    }
    this.updatePlayer(dt);
    if (this.meleeSwing && this.meleeTimer <= MELEE_DURATION - 0.23) {
      this.meleeSwing = false;
      this.sound.knifeSwing();
    }
    if (
      this.meleePending &&
      this.meleeTimer <= MELEE_DURATION - MELEE_CONTACT
    ) {
      this.meleePending = false;
      this.meleeContact();
    }
    this.navTimer -= dt;
    if (this.navTimer <= 0) {
      this.updateNavigation();
      this.navTimer = 0.5;
    }
    this.updateEnemies(dt);
    this.updateEffects(dt);
    if (this.state !== "playing") return;
    if (this.phase === "rest") {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) this.beginWave();
    } else {
      this.spawnTimer -= dt;
      if (
        this.remaining > 0 &&
        this.enemies.filter((e) => !e.dead).length < 28 &&
        this.spawnTimer <= 0
      ) {
        if (this.spawnEnemy()) this.remaining--;
        this.spawnTimer = Math.max(0.35, 1.6 - this.wave * 0.07);
      }
      if (this.remaining === 0 && !this.enemies.some((e) => !e.dead)) {
        this.phase = "rest";
        this.phaseTimer = 17;
        const reward = 200 + this.wave * 35;
        this.player.points += reward;
        this.player.grenades = Math.min(5, this.player.grenades + 1);
        this.emit("announce", {
          eyebrow: `+${reward} ESSENCES · +1 GRENADE`,
          title: "UN RÉPIT. PAS LA PAIX.",
          subtitle:
            this.wave >= 10
              ? "L’extraction est disponible à la balise. Ou poursuivez la survie."
              : "Améliorez votre équipement. N pour appeler la prochaine vague.",
          duration: 3500,
        });
        this.sound.purchase();
      }
    }
    const b = this.world.interactions.find((i) => i.kind === "box");
    if (b.busy) {
      if (b.timer > 0) {
        b.timer -= dt;
        if (Math.floor(b.timer * 8) !== b.cycle) {
          b.cycle = Math.floor(b.timer * 8);
          this.world.showBoxWeapon(mysteryWeapon());
        }
        if (b.timer <= 0) {
          b.offered = mysteryWeapon();
          this.world.showBoxWeapon(b.offered);
          b.offerTimer = 18;
          this.sound.pickup();
          this.emit("toast", {
            title: `${WEAPONS[b.offered].rarity} · ${WEAPONS[b.offered].name}`,
            text: this.touch
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
    this.growlTimer -= dt;
    if (this.growlTimer <= 0 && this.enemies.length) {
      const e = this.enemies[Math.floor(Math.random() * this.enemies.length)],
        d = e.model.position.distanceTo(this.player.position);
      this.sound.growl(
        d,
        clamp((e.model.position.x - this.player.position.x) / 15, -1, 1),
        e.type,
      );
      this.growlTimer = 1.3 + Math.random() * 2;
    }
    if (this.extraction) {
      const beacon = this.world.interactions.find((i) => i.kind === "extract");
      const near =
        beacon &&
        Math.hypot(
          this.player.position.x - beacon.position.x,
          this.player.position.z - beacon.position.z,
        ) < 4.5;
      if (near) this.extractionTimer -= dt;
      if (this.extractionTimer <= 0) this.end(true);
    }
    this.world.update(dt, this.time);
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.updateHUD();
      this.hudTimer = 0.075;
    }
  }
  updateHUD() {
    if (!this.player) return;
    this.emit("hud", {
      map: this.map,
      sector: this.world.sectorAt?.(this.player.position),
      health: this.player.health,
      maxHealth: this.player.maxHealth,
      stamina: this.player.stamina,
      crouched: this.player.crouched,
      sprinting: this.player.sprinting,
      exhausted: this.player.exhausted,
      points: this.player.points,
      kills: this.player.kills,
      wave: this.wave,
      remaining: this.remaining + this.enemies.filter((e) => !e.dead).length,
      phase: this.phase,
      timer: Math.ceil(this.phaseTimer),
      weapon: this.weapon,
      definition: this.definition,
      grenades: this.player.grenades,
      reload:
        this.reloadTime > 0 ? 1 - this.reloadTime / this.reloadDuration : null,
      interaction: this.interactionText(this.nearInteraction()),
      perks: this.player.perks,
      power: this.world.power,
      door: this.world.doors.some((d) => d.open),
      extraction: this.extraction ? Math.ceil(this.extractionTimer) : null,
      double: Math.max(0, Math.ceil(this.powerups.double - this.time)),
      insta: Math.max(0, Math.ceil(this.powerups.insta - this.time)),
      time: this.time,
      yaw: this.yaw,
      position: this.player.position,
      enemies: this.enemies,
      obstacles: this.world.obstacles,
      interactions: this.world.interactions,
      fps: this.fps,
      slots: this.weapons,
    });
  }
  end(victory) {
    if (this.saved) return;
    this.saved = true;
    this.state = "gameover";
    if (document.pointerLockElement) document.exitPointerLock();
    this.mouse.fire = this.mouse.aim = false;
    this.sound.death();
    const record = {
      map: this.map,
      difficulty: this.difficultyId,
      wave: this.wave,
      kills: this.player.kills,
      headshots: this.player.headshots,
      accuracy: this.player.shots
        ? Math.round((this.player.hits / this.player.shots) * 100)
        : 0,
      time: Math.floor(this.time),
      points: this.player.points,
      victory,
      date: new Date().toISOString(),
    };
    saveRecord(record);
    this.emit("end", record);
    this.emit("state", "gameover");
  }
  loop(now) {
    requestAnimationFrame(this.loop);
    // Optional 30 Hz presentation: halves GPU work and heat on phones. The
    // simulation still integrates the real elapsed time.
    if (this.settings.frameRate === 30 && now - this.last < 1000 / 30 - 2)
      return;
    const elapsed = (now - this.last) / 1000;
    const delta = Math.min(elapsed, 0.05);
    this.last = now;
    this.sound.music({
      map: this.map,
      phase: this.phase,
      wave: this.wave,
      power: this.world?.power,
      state: this.state,
      hidden: document.hidden,
    });
    if (this.state === "playing") {
      this.fps = T.MathUtils.lerp(
        this.fps,
        1 / Math.max(elapsed, 0.001),
        0.035,
      );
      this.update(delta);
      this.contactShadows?.update(this.enemies);
      if (
        (this.touch
          ? this.settings.touchAdaptiveQuality
          : this.settings.adaptiveQuality !== false) &&
        this.time > 4 &&
        elapsed > 0 &&
        elapsed < 0.5
      ) {
        this.mobileFrameMs = T.MathUtils.lerp(
          this.mobileFrameMs,
          Math.min(elapsed * 1000, 100),
          0.025,
        );
        this.resolutionTimer += elapsed;
        this.resolutionRecovery += elapsed;
        if (this.resolutionTimer > 2.5) {
          this.resolutionTimer = 0;
          const current = this.touch
            ? this.mobileResolutionScale
            : this.desktopResolutionScale;
          const next =
            this.mobileFrameMs > 18.4
              ? Math.max(0.65, current - 0.1)
              : this.mobileFrameMs < 17.2 && this.resolutionRecovery > 12
                ? Math.min(1, current + 0.04)
                : current;
          if (next !== current) {
            this.resolutionRecovery = 0;
            if (this.touch) this.mobileResolutionScale = next;
            else this.desktopResolutionScale = next;
            this.resize();
          }
          if (
            !this.touch &&
            next <= 0.66 &&
            this.mobileFrameMs > 26 &&
            !this.adaptiveOcclusionOff
          ) {
            this.adaptiveOcclusionOff = true;
            this.resize();
          }
        }
      }
    }
    // compileAsync yields to animation frames while the new world and its
    // shadow textures are still being prepared. Present only the ready scene.
    if (this.world && this.state !== "loading") {
      this.film.uniforms.time.value = now;
      this.film.uniforms.hurt.value = Math.max(
        this.lastHurtEffect || 0,
        this.player && this.player.health < 35 ? 0.25 : 0,
      );
      this.renderer.autoClear = true;
      // Render the shadow map once, not again for the GTAO normal pass.
      // Phones update it at 30 Hz while simulation and presentation stay at 60.
      if (now >= (this.nextShadowFrame || 0) && this.state === "playing") {
        this.renderer.shadowMap.needsUpdate = true;
        this.nextShadowFrame =
          now + (this.touch || this.settings.quality === "low" ? 1000 / 30 : 0);
      }
      this.viewPass.enabled =
        this.state === "playing" || this.state === "paused";
      this.composer.render();
    }
  }
  // Read-only state for diagnostics; debug mutations exist only behind Vite's development flag.
  inspect() {
    return {
      state: this.state,
      map: this.map,
      wave: this.wave,
      phase: this.phase,
      remaining: this.remaining,
      enemies: this.enemies.filter((e) => !e.dead).length,
      health: this.player?.health,
      points: this.player?.points,
      weapon: this.weapon,
      position: this.player?.position.toArray(),
      power: this.world?.power,
      drawCalls: this.renderer.info.render.calls,
      fps: Math.round(this.fps),
    };
  }
}
