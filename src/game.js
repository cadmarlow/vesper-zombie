import { RunLifecycle } from "./game/lifecycle.js";
import { FrameClock } from "./game/frame-clock.js";
import { resolutionForFrameTime } from "./game/adaptive-quality.js";
import { mapDefinition } from "./maps/catalog.js";
import { observeGame } from "./game/diagnostics.js";

import * as T from "three";
import { setSurfaceQuality } from "./surfaces.js";

import { Sound } from "./audio.js";
import {
  WEAPONS,
  ENEMIES,
  DIFFICULTIES,
  saveRecord,
  readSave,
} from "./config.js";
import { clamp, reloadWeapon } from "./logic.js";
import { Presentation } from "./game/presentation.js";
import { DesktopControls, createInputPort } from "./game/input.js";
import { CombatSystem } from "./game/combat.js";
import { PlayerSystem } from "./game/player.js";
import { EnemySystem } from "./game/enemies.js";
import { InteractionSystem } from "./game/interactions.js";
import { EffectsSystem } from "./game/effects.js";
import { SurvivalMode } from "./game/survival.js";
const MELEE_DURATION = 0.78,
  MELEE_CONTACT = 0.3;
/** Application facade: run lifecycle and frame order. Rules live in game/*.js. */
export class Game {
  constructor(canvas, settings, emit, sound = null) {
    this.loop = this.loop.bind(this);
    this.frameClock = new FrameClock();
    this.run = { settings };
    this.input = {};
    this.emit = emit;
    this.sound = sound || new Sound();
    this.sound.setVolume(settings.volume);
    this.sound.setMusicVolume(settings.musicVolume ?? 0.75);
    this.sound.setMusicTrack(settings.musicTrack);

    this.run.state = "menu";
    this.input.keys = new Set();
    this.input.mouse = { fire: false, aim: false };
    this.run.enemies = [];
    this.run.effects = [];
    this.run.projectiles = [];
    this.run.pickups = [];
    this.run.time = 0;
    this.run.last = performance.now();
    this.input.yaw = 0;
    this.input.pitch = 0;
    this.run.hudTimer = 0;
    this.run.navTimer = 0;

    this.view = new Presentation(canvas, this.run);
    const context = {
      run: this.run,
      view: this.view,
      input: this.input,
      sound: this.sound,
      emit: (...args) => this.emit(...args),
    };
    this.lifecycle = new RunLifecycle(context, {
      resize: (...args) => this.resize(...args),
      updateNavigation: (...args) => this.updateNavigation(...args),
      setGun: (...args) => this.setGun(...args),
      sessionLost: (...args) => this.sessionLost(...args),
      applyDetail: (...args) => this.applyDetail(...args),
      damageEnemy: (...args) => this.damageEnemy(...args),
      hurt: (...args) => this.hurt(...args),
      creditKill: (...args) => this.creditKill(...args),
      restReward: (...args) => this.restReward(...args),
      collect: (...args) => this.collect(...args),
      receiveWeapon: (...args) => this.receiveWeapon(...args),
      updateHUD: (...args) => this.updateHUD(...args),
      pause: (...args) => this.pause(...args),
      resume: (...args) => this.resume(...args),
      respawn: (...args) => this.respawn(...args),
      revive: (...args) => this.player.revive(...args),
      eliminate: (...args) => this.player.eliminate(...args),
      obstacleDistance: (...args) => this.obstacleDistance(...args),
      explosionEffects: (...args) => this.explosionEffects(...args),
      end: (...args) => this.end(...args),
      throwGrenade: (...args) => this.throwGrenade(...args),
      applySharedInteraction: (...args) => this.applySharedInteraction(...args),
      lock: (...args) => this.lock(...args),
    });
    this.combat = new CombatSystem(context, {
      updateHUD: (...args) => this.updateHUD(...args),
      burst: (...args) => this.burst(...args),
      tracer: (...args) => this.tracer(...args),
      drop: (...args) => this.drop(...args),
      announce: (...args) => this.announce(...args),
      hurt: (...args) => this.hurt(...args),
    });
    this.player = new PlayerSystem(context, {
      end: (...args) => this.end(...args),
      updateHUD: (...args) => this.updateHUD(...args),
      obstacleDistance: (...args) => this.obstacleDistance(...args),
      updateKnife: (...args) => this.updateKnife(...args),
      shoot: (...args) => this.shoot(...args),
    });
    this.enemies = new EnemySystem(context, {
      obstacleDistance: (...args) => this.obstacleDistance(...args),
      hurt: (...args) => this.hurt(...args),
    });
    this.interactions = new InteractionSystem(context, {
      updateHUD: (...args) => this.updateHUD(...args),
      updateNavigation: (...args) => this.updateNavigation(...args),
      burst: (...args) => this.burst(...args),
      setGun: (...args) => this.setGun(...args),
      announce: (...args) => this.announce(...args),
    });
    this.effects = new EffectsSystem(context, {
      hurt: (...args) => this.hurt(...args),
      explode: (...args) => this.explode(...args),
    });
    this.survival = new SurvivalMode(context, {
      respawn: (...args) => this.respawn(...args),
      announce: (...args) => this.announce(...args),
      spawnEnemy: (...args) => this.spawnEnemy(...args),
      end: (...args) => this.end(...args),
    });
    this.controls = new DesktopControls(this.run, this.view, this.input, {
      requestFrame: () => this.requestFrame(),
      resize: (...args) => this.resize(...args),
      reload: (...args) => this.reload(...args),
      interact: (...args) => this.interact(...args),
      grenade: (...args) => this.grenade(...args),
      melee: (...args) => this.melee(...args),
      toggleCrouch: (...args) => this.toggleCrouch(...args),
      switchWeapon: (...args) => this.switchWeapon(...args),
      inspectWeapon: (...args) => this.inspectWeapon(...args),
      pause: (...args) => this.pause(...args),
      jump: (...args) => this.jump(...args),
      resume: (...args) => this.resume(...args),
      lock: (...args) => this.lock(...args),
      shoot: (...args) => this.shoot(...args),
    });
    this.inputPort = createInputPort(this.run, this.input, {
      shoot: (...args) => this.shoot(...args),
      reload: (...args) => this.reload(...args),
      interact: (...args) => this.interact(...args),
      grenade: (...args) => this.grenade(...args),
      melee: (...args) => this.melee(...args),
      switchWeapon: (...args) => this.switchWeapon(...args),
      jump: (...args) => this.jump(...args),
      toggleCrouch: (...args) => this.toggleCrouch(...args),
      touchAimFriction: (...args) => this.touchAimFriction(...args),
    });
    this.resize();
  }
  get state() {
    return this.run.state;
  }
  get touch() {
    return this.run.touch;
  }
  get map() {
    return this.run.map;
  }
  resize() {
    this.view.resize();
    this.requestFrame();
  }
  applySettings(settings) {
    this.run.settings = settings;
    this.view.mobileResolutionScale = 1;
    this.view.desktopResolutionScale = 1;
    this.view.adaptiveOcclusionOff = false;
    this.view.mobileFrameMs = 16.7;
    this.view.resolutionTimer = this.view.resolutionRecovery = 0;
    this.view.renderer.shadowMap.needsUpdate = true;
    this.sound.setVolume(settings.volume);
    this.sound.setMusicVolume(settings.musicVolume ?? 0.75);
    this.sound.setMusicTrack(settings.musicTrack);
    this.view.camera.fov = settings.fov;
    this.view.camera.updateProjectionMatrix();
    this.resize();
    this.run.world?.setQuality(this.run.settings.quality, this.run.touch);
    setSurfaceQuality(this.view.scene, this.run.settings.quality);
    setSurfaceQuality(this.view.viewScene, this.run.settings.quality);
  }
  async lock() {
    try {
      await this.view.canvas.requestPointerLock();
    } catch {
      this.emit("toast", {
        title: "Cliquez dans le jeu pour capturer la souris",
        text: "Échap permet de libérer le curseur.",
      });
    }
  }
  async start(
    map = "abbey",
    difficulty = "normal",
    touch = false,
    session = null,
  ) {
    if (this.loading) return this.loading;
    const version = (this.loadVersion = (this.loadVersion || 0) + 1);
    const checkpoint = () => {
      if (version !== this.loadVersion || this.destroyed)
        throw new DOMException("Run cancelled", "AbortError");
    };
    mapDefinition(map);
    if (!Object.hasOwn(DIFFICULTIES, difficulty))
      throw new Error("Unknown difficulty: " + difficulty);
    this.run.state = "loading";
    this.emit("state", "loading");
    this.loading = this.load(map, difficulty, touch, session, checkpoint);
    try {
      await this.loading;
      this.frameClock.reset();
      this.requestFrame();
    } catch (error) {
      // A failed load must never strand the game in "loading": the menu can
      // otherwise no longer relaunch a session.
      this.cleanup();
      this.run.state = "menu";
      this.emit("state", "menu");
      throw error;
    } finally {
      this.loading = null;
    }
  }
  load(...args) {
    return this.lifecycle.load(...args);
  }
  warmupDistantModels(...args) {
    return this.lifecycle.warmupDistantModels(...args);
  }
  cleanup(...args) {
    return this.lifecycle.cleanup(...args);
  }
  pause(remote = false) {
    if (this.run.state !== "playing") return;
    if (!remote && this.run.session) {
      if (this.run.session.peer)
        this.run.session.toHost({ k: "pause", paused: true });
      else this.run.session.broadcast({ k: "pause", paused: true });
    }
    this.run.state = "paused";
    this.run.mapGameplay?.setPaused(true);
    this.input.keys.clear();
    this.input.touchMove = { x: 0, y: 0 };
    this.input.touchSprint = false;
    this.input.touchRun = false;
    this.input.touchInteract = false;
    this.input.mouse.fire = this.input.mouse.aim = false;
    if (document.pointerLockElement) document.exitPointerLock();
    this.emit("state", "paused");
    this.view.needsRender = true;
    this.requestFrame();
  }
  resume(remote = false) {
    if (this.run.state !== "paused") return;
    if (!remote && this.run.session) {
      if (this.run.session.peer)
        this.run.session.toHost({ k: "pause", paused: false });
      else this.run.session.broadcast({ k: "pause", paused: false });
    }
    this.run.state = "playing";
    this.run.last = performance.now();
    this.run.mapGameplay?.setPaused(false);
    this.frameClock.reset();
    this.emit("state", "playing");
    this.sound.init();
    if (!this.run.touch) this.lock();
    this.requestFrame();
  }
  menu() {
    this.loadVersion = (this.loadVersion || 0) + 1;
    this.run.state = "menu";
    if (document.pointerLockElement) document.exitPointerLock();
    this.input.keys.clear();
    this.input.mouse.fire = this.input.mouse.aim = false;
    this.cleanup();
    this.emit("state", "menu");
    this.requestFrame();
  }
  announce(a) {
    this.emit("announce", a);
    if (this.run.session?.host)
      this.run.session.broadcast({ k: "announce", a });
  }
  sessionLost() {
    if (this.run.state === "menu") return;
    this.menu();
    this.emit("session-lost");
  }
  update(dt) {
    this.run.time += dt;
    this.run.shotTimer = Math.max(0, this.run.shotTimer - dt);
    this.run.meleeTimer = Math.max(0, this.run.meleeTimer - dt);
    this.run.knifeImpactTime = Math.max(0, this.run.knifeImpactTime - dt);
    this.run.flashTimer = (this.run.flashTimer || 0) - dt;
    if (this.run.flashTimer <= 0) {
      this.view.flash.intensity = 0;
      this.view.gun.userData.flash.visible = false;
    }
    if (this.run.pendingDraw > 0) {
      // A holstered weapon has left the view: raise the next one.
      this.run.pendingDraw -= dt;
      if (this.run.pendingDraw <= 0) {
        this.run.pendingDraw = 0;
        this.setGun({ draw: "quick" });
      }
    }
    if (this.run.shellReload) this.combat.updateShellReload(dt);
    else if (this.run.reloadTime > 0) {
      this.run.reloadTime = Math.max(0, this.run.reloadTime - dt);
      if (this.run.reloadTime === 0)
        reloadWeapon(this.run.weapons[this.run.slot]);
    }
    this.updatePlayer(dt);
    this.run.mapGameplay?.update(dt);
    if (this.run.meleeSwing && this.run.meleeTimer <= MELEE_DURATION - 0.23) {
      this.run.meleeSwing = false;
      this.sound.knifeSwing();
    }
    if (
      this.run.meleePending &&
      this.run.meleeTimer <= MELEE_DURATION - MELEE_CONTACT
    ) {
      this.run.meleePending = false;
      this.meleeContact();
    }
    this.run.navTimer -= dt;
    if (this.run.navTimer <= 0) {
      this.updateNavigation();
      this.run.navTimer = 0.5;
    }
    this.updateEnemies(dt);
    this.updateEffects(dt);
    if (this.run.state !== "playing") return;
    this.run.session?.update(dt);
    if (!this.run.session?.peer) {
      this.survival.update(dt);
      if (this.run.state !== "playing") return;
      this.interactions.update(dt);
    }
    this.updateAmbience(dt);
  }
  updateAmbience(dt) {
    this.run.growlTimer -= dt;
    // Recorded horde voices replace the synthetic growl once they are loaded.
    if (this.sound.horde?.ready) {
      this.sound.horde.update(this.run.enemies, dt);
      this.run.growlTimer = Math.max(this.run.growlTimer, 1);
    } else if (this.run.growlTimer <= 0 && this.run.enemies.length) {
      const e =
          this.run.enemies[Math.floor(Math.random() * this.run.enemies.length)],
        d = e.model.position.distanceTo(this.run.player.position);
      this.sound.growl(
        d,
        clamp((e.model.position.x - this.run.player.position.x) / 15, -1, 1),
        e.type,
      );
      this.run.growlTimer = 1.3 + Math.random() * 2;
    }
    this.run.world.update(dt, this.run.time);
    this.run.hudTimer -= dt;
    if (this.run.hudTimer <= 0) {
      this.updateHUD();
      this.run.hudTimer = 0.075;
    }
  }
  updateHUD() {
    if (!this.run.player) return;
    this.emit("hud", {
      map: this.run.map,
      sector: this.run.world.sectorAt?.(this.run.player.position),
      mapStatus: this.run.mapGameplay?.hud() || null,
      health: this.run.player.health,
      maxHealth: this.run.player.maxHealth,
      stamina: this.run.player.stamina,
      crouched: this.run.player.crouched,
      sprinting: this.run.player.sprinting,
      exhausted: this.run.player.exhausted,
      points: this.run.player.points,
      kills: this.run.player.kills,
      wave: this.run.wave,
      remaining:
        this.run.remaining + this.run.enemies.filter((e) => !e.dead).length,
      phase: this.run.phase,
      timer: Math.ceil(this.run.phaseTimer),
      weapon: { ...this.run.weapons?.[this.run.slot] },
      definition: WEAPONS[this.run.weapons[this.run.slot].id],
      grenades: this.run.player.grenades,
      reload:
        this.run.reloadTime > 0
          ? 1 - this.run.reloadTime / this.run.reloadDuration
          : null,
      interaction:
        this.run.session?.rescue.prompt() ||
        this.interactionText(this.nearInteraction()),
      perks: [...this.run.player.perks],
      downed: this.run.downed,
      rescue: this.run.session?.rescue.hud(),
      team: this.run.session?.teamStatus() || null,
      peer: !!this.run.session?.peer,
      boss: this.run.enemies
        .filter((e) => !e.dead && ENEMIES[e.type].boss)
        .map((e) => ({
          name: ENEMIES[e.type].name,
          health: Math.max(0, e.health),
          max: e.maxHealth,
        })),
      power: this.run.world.power,
      door: this.run.world.doors.some((d) => d.open),
      extraction: this.run.extraction
        ? Math.ceil(this.run.extractionTimer)
        : null,
      double: Math.max(0, Math.ceil(this.run.powerups.double - this.run.time)),
      insta: Math.max(0, Math.ceil(this.run.powerups.insta - this.run.time)),
      time: this.run.time,
      yaw: this.input.yaw,
      position: {
        x: this.run.player.position.x,
        z: this.run.player.position.z,
      },
      enemies: this.run.enemies.map((e) => ({
        type: e.type,
        dead: e.dead,
        position: { x: e.model.position.x, z: e.model.position.z },
      })),
      obstacles: this.run.world.obstacles.map(({ x, z, w, d, active }) => ({
        x,
        z,
        w,
        d,
        active,
      })),
      interactions: this.run.world.interactions.map((i) => ({
        kind: i.kind,
        position: { x: i.position.x, z: i.position.z },
      })),
      fps: this.view.fps,
      slots: this.run.weapons.map((w) => ({ ...w })),
      slot: this.run.slot,
      touch: this.run.touch,
      aim: this.run.aiming ?? this.input.mouse.aim,
      scoped: !!this.run.scoped,
      breath: this.run.holdingBreath
        ? "hold"
        : this.run.player.breathOut > 0
          ? "out"
          : "ready",
      spread: this.run.spreadNow ?? null,
      fov: this.view.camera.fov,
      settings: {
        crosshair: this.run.settings.crosshair,
        layout: this.run.settings.layout,
        lacunaHints: this.run.settings.lacunaHints,
      },
    });
  }
  end(victory, remote = false) {
    if (this.run.saved) return;
    this.run.saved = true;
    if (this.run.session?.host && !remote)
      this.run.session.broadcast({ k: "end", victory: !!victory });
    this.run.state = "gameover";
    this.run.mapGameplay?.setPaused(true);
    if (document.pointerLockElement) document.exitPointerLock();
    this.input.mouse.fire = this.input.mouse.aim = false;
    this.sound.death();
    const record = {
      map: this.run.map,
      difficulty: this.run.difficultyId,
      wave: this.run.wave,
      kills: this.run.player.kills,
      headshots: this.run.player.headshots,
      accuracy: this.run.player.shots
        ? Math.round((this.run.player.hits / this.run.player.shots) * 100)
        : 0,
      time: Math.floor(this.run.time),
      points: this.run.player.points,
      victory,
      date: new Date().toISOString(),
    };
    const previous = readSave().records?.[this.run.map];
    record.newBest =
      !previous ||
      record.wave > previous.wave ||
      (record.wave === previous.wave && record.kills > previous.kills);
    saveRecord(record);
    this.emit("end", record);
    this.emit("state", "gameover");
    this.view.needsRender = true;
    this.requestFrame();
  }
  requestFrame() {
    cancelAnimationFrame(this.frame);
    clearTimeout(this.idleFrame);
    if (this.destroyed) return;
    const visible = !document.hidden;
    const active = this.run.state === "playing";
    const dirty =
      this.run.world && this.run.state !== "loading" && this.view.needsRender;
    if (visible && (active || dirty))
      this.frame = requestAnimationFrame(this.loop);
    else {
      // A light idle tick updates music volume while the frozen image
      // requires no new GPU submissions.
      this.idleFrame = setTimeout(
        () => this.loop(performance.now()),
        visible ? 100 : 1000,
      );
    }
  }
  loop(now) {
    if (this.destroyed) return;
    this.requestFrame();
    if (document.hidden) return;
    // Respect both 30 and 60 FPS on 60/90/120/144+ Hz screens. Simulation
    // integrates the elapsed time of accepted frames, independently of Hz.
    if (
      this.run.state === "playing" &&
      !this.frameClock.accept(now, this.run.settings.frameRate)
    )
      return;
    const elapsed = (now - this.run.last) / 1000;
    const delta = Math.min(elapsed, 0.05);
    this.run.last = now;
    this.sound.music({
      map: this.run.world?.theme || this.run.map,
      phase: this.run.phase,
      wave: this.run.wave,
      power: this.run.world?.power,
      state: this.run.state,
      hidden: document.hidden,
    });
    if (this.run.state === "playing") {
      this.view.fps = T.MathUtils.lerp(
        this.view.fps,
        1 / Math.max(elapsed, 0.001),
        0.035,
      );
      this.update(delta);
      this.view.contactShadows?.update(this.run.enemies);
      this.view.hordeEyes?.update(
        this.run.enemies,
        this.view.camera,
        this.run.time,
      );
      this.view.hordeGibs?.update(delta);
      if (
        (this.run.touch
          ? this.run.settings.touchAdaptiveQuality
          : this.run.settings.adaptiveQuality !== false) &&
        this.run.time > 4 &&
        elapsed > 0 &&
        elapsed < 0.5
      ) {
        this.view.mobileFrameMs = T.MathUtils.lerp(
          this.view.mobileFrameMs,
          Math.min(elapsed * 1000, 100),
          0.025,
        );
        this.view.resolutionTimer += elapsed;
        this.view.resolutionRecovery += elapsed;
        if (this.view.resolutionTimer > 2.5) {
          this.view.resolutionTimer = 0;
          const current = this.run.touch
            ? this.view.mobileResolutionScale
            : this.view.desktopResolutionScale;
          const next = resolutionForFrameTime(
            current,
            this.view.mobileFrameMs,
            this.view.resolutionRecovery,
            this.run.settings.frameRate,
          );
          if (next !== current) {
            this.view.resolutionRecovery = 0;
            if (this.run.touch) this.view.mobileResolutionScale = next;
            else this.view.desktopResolutionScale = next;
            this.resize();
          }
          if (
            !this.run.touch &&
            next <= 0.66 &&
            this.view.mobileFrameMs >
              (1000 / this.run.settings.frameRate) * 1.56 &&
            !this.view.adaptiveOcclusionOff
          ) {
            this.view.adaptiveOcclusionOff = true;
            this.resize();
          }
        }
      }
    }
    // compileAsync yields to animation frames while the new world and its
    // shadow textures are still being prepared. Present only the ready scene.
    if (
      this.run.world &&
      this.run.state !== "loading" &&
      (this.run.state === "playing" || this.view.needsRender)
    ) {
      this.view.film.uniforms.time.value = now;
      this.updateScope(delta);
      this.view.film.uniforms.hurt.value = Math.max(
        this.run.lastHurtEffect || 0,
        this.run.player && this.run.player.health < 35 ? 0.25 : 0,
      );
      this.view.renderer.autoClear = true;
      // Render the shadow map once, not again for the GTAO normal pass.
      // Phones update it at 30 Hz while simulation and presentation stay at 60.
      if (
        now >= (this.view.nextShadowFrame || 0) &&
        this.run.state === "playing"
      ) {
        this.view.renderer.shadowMap.needsUpdate = true;
        this.view.nextShadowFrame =
          now +
          (this.run.touch || this.run.settings.quality === "low"
            ? 1000 / 30
            : 0);
      }
      this.view.viewPass.enabled =
        this.run.state === "playing" || this.run.state === "paused";
      this.view.composer.render();
      this.view.needsRender = false;
    }
  }
  /** Scope overlay: snaps on at the eye, then the relief shadow opens. */
  updateScope(dt) {
    const f = this.view.film.uniforms;
    const scoped = this.run.state === "playing" && !!this.run.scoped;
    this.view.scopeOpen = scoped
      ? T.MathUtils.damp(this.view.scopeOpen || 0, 1, 9, dt)
      : 0;
    f.scope.value = scoped ? 1 : 0;
    f.scopeOpen.value = this.view.scopeOpen;
    const sway = this.view.viewModel?.sway.value;
    const drift = this.run.scopeDrift || { x: 0, y: 0 };
    f.scopeShift.value.set(
      T.MathUtils.clamp((sway ? -sway.y * 2.2 : 0) + drift.x, -0.09, 0.09),
      T.MathUtils.clamp((sway ? sway.x * 2.2 : 0) + drift.y, -0.09, 0.09),
    );
    f.scopeGlow.value = this.run.world?.power ? 0.7 : 1;
  }
  debug() {
    return observeGame(this);
  }
  inspect() {
    return {
      state: this.run.state,
      map: this.run.map,
      wave: this.run.wave,
      phase: this.run.phase,
      remaining: this.run.remaining,
      enemies: this.run.enemies.filter((e) => !e.dead).length,
      health: this.run.player?.health,
      points: this.run.player?.points,
      weapon: this.run.weapons[this.run.slot],
      position: this.run.player?.position.toArray(),
      power: this.run.world?.power,
      drawCalls: this.view.renderer.info.render.calls,
      fps: Math.round(this.view.fps),
    };
  }
  setGun(...args) {
    return this.combat.setGun(...args);
  }
  switchWeapon(...args) {
    return this.combat.switchWeapon(...args);
  }
  reload(...args) {
    return this.combat.reload(...args);
  }
  obstacleDistance(...args) {
    return this.combat.obstacleDistance(...args);
  }
  shoot(...args) {
    return this.combat.shoot(...args);
  }
  damageEnemy(...args) {
    return this.combat.damageEnemy(...args);
  }
  creditKill(...args) {
    return this.combat.creditKill(...args);
  }
  projectBlood(...args) {
    return this.combat.projectBlood(...args);
  }
  melee(...args) {
    return this.combat.melee(...args);
  }
  inspectWeapon(...args) {
    return this.combat.inspectWeapon(...args);
  }
  meleeContact(...args) {
    return this.combat.meleeContact(...args);
  }
  grenade(...args) {
    return this.combat.grenade(...args);
  }
  throwGrenade(...args) {
    return this.combat.throwGrenade(...args);
  }
  explosionEffects(...args) {
    return this.combat.explosionEffects(...args);
  }
  explode(...args) {
    return this.combat.explode(...args);
  }
  updateKnife(...args) {
    return this.combat.updateKnife(...args);
  }
  hurt(...args) {
    return this.player.hurt(...args);
  }
  down(...args) {
    return this.player.down(...args);
  }
  respawn(...args) {
    return this.player.respawn(...args);
  }
  toggleCrouch(...args) {
    return this.player.toggleCrouch(...args);
  }
  toggleRun(...args) {
    return this.player.toggleRun(...args);
  }
  jump(...args) {
    return this.player.jump(...args);
  }
  touchAimFriction(...args) {
    return this.player.touchAimFriction(...args);
  }
  updatePlayer(...args) {
    return this.player.updatePlayer(...args);
  }
  updateNavigation(...args) {
    return this.enemies.updateNavigation(...args);
  }
  spawnEnemy(...args) {
    return this.enemies.spawnEnemy(...args);
  }
  applyDetail(...args) {
    return this.enemies.applyDetail(...args);
  }
  updateEnemies(...args) {
    return this.enemies.updateEnemies(...args);
  }
  applySharedInteraction(...args) {
    return this.interactions.applySharedInteraction(...args);
  }
  interact(...args) {
    return this.interactions.interact(...args);
  }
  requestExtraction(...args) {
    return this.interactions.requestExtraction(...args);
  }
  receiveWeapon(...args) {
    return this.interactions.receiveWeapon(...args);
  }
  interactionCost(...args) {
    return this.interactions.interactionCost(...args);
  }
  nearInteraction(...args) {
    return this.interactions.nearInteraction(...args);
  }
  interactionText(...args) {
    return this.interactions.interactionText(...args);
  }
  drop(...args) {
    return this.effects.drop(...args);
  }
  collect(...args) {
    return this.effects.collect(...args);
  }
  burst(...args) {
    return this.effects.burst(...args);
  }
  tracer(...args) {
    return this.effects.tracer(...args);
  }
  updateEffects(...args) {
    return this.effects.updateEffects(...args);
  }
  beginWave(...args) {
    return this.survival.beginWave(...args);
  }
  restReward(...args) {
    return this.survival.restReward(...args);
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.menu();
    this.controls.dispose();
    cancelAnimationFrame(this.frame);
    clearTimeout(this.idleFrame);
    this.view.dispose();
  }
}
