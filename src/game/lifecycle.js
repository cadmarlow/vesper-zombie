import { mapDefinition } from "../maps/catalog.js";
import { zombieModel } from "../creatures.js";
import * as T from "three";
import { prepareSurfaces, setSurfaceQuality } from "../surfaces.js";
import { releaseZombie } from "../creatures.js";
import { prepareCreatureSkins } from "../creature-head.js";
import { CombatEffects } from "../combat-effects.js";
import { captureEnvironment, ContactShadows } from "../rendering.js";
import { World } from "../world.js";
import { disposeModel } from "../resources.js";

import { ENEMIES, DIFFICULTIES, MAPS } from "../config.js";
import { newWeapon, Navigation } from "../logic.js";
/** Owns one run's resources: prepare, attach, cancel, release. */
export class RunLifecycle {
  constructor(
    context,
    {
      resize,
      updateNavigation,
      setGun,
      sessionLost,
      applyDetail,
      damageEnemy,
      hurt,
      creditKill,
      restReward,
      collect,
      receiveWeapon,
      updateHUD,
      pause,
      resume,
      respawn,
      explosionEffects,
      end,
      throwGrenade,
      applySharedInteraction,
      lock,
    },
  ) {
    Object.assign(this, context);
    this.commands = {
      resize,
      updateNavigation,
      setGun,
      sessionLost,
      applyDetail,
      damageEnemy,
      hurt,
      creditKill,
      restReward,
      collect,
      receiveWeapon,
      updateHUD,
      pause,
      resume,
      respawn,
      explosionEffects,
      end,
      throwGrenade,
      applySharedInteraction,
      lock,
    };
  }
  async load(map, difficulty, touch, session = null, checkpoint = () => {}) {
    await this.sound.init();
    checkpoint();
    this.run.nextEnemyId = 1;
    this.run.nextPickupId = 1;
    this.run.nextProjectileId = 1;
    this.run.touch = touch;
    this.view.mobileResolutionScale = 1;
    this.view.desktopResolutionScale = 1;
    this.view.adaptiveOcclusionOff = false;
    this.view.resolutionRecovery = 0;
    this.view.mobileFrameMs = 16.7;
    this.view.resolutionTimer = 0;
    this.view.nextWeaponLight = 0;
    this.view.weaponBounce.intensity = 0;
    this.commands.resize();
    this.cleanup();
    // The previous session, if any, is gone with cleanup(); install the new one.
    this.run.session = session;
    this.run.downed = false;
    await Promise.all([
      prepareSurfaces(touch, mapDefinition(map).theme),
      // Creatures fall back to procedural skin when the scanned faces are
      // unavailable; a missing texture must not abort the whole session.
      prepareCreatureSkins(touch).catch((error) =>
        console.warn(
          "Creature skins unavailable, using procedural fallback",
          error,
        ),
      ),
    ]);
    checkpoint();
    this.run.map = map;
    this.view.film.uniforms.cold.value = mapDefinition(map).cold;
    this.run.difficulty = DIFFICULTIES[difficulty];
    this.run.difficultyId = difficulty;
    this.run.world = new World(this.view.scene, map, this.run.settings.quality);
    this.run.world.viewer = this.view.camera;
    this.run.world.setQuality(this.run.settings.quality, touch);
    this.run.world.update(0, 0);
    // Compilation and the one-off reflection capture happen behind the loader.
    // The far level shares its shaders with these; it is built after the
    // loader, during the opening rest, so phones start sooner.
    const warmup = Object.keys(ENEMIES)
      .filter((type) => !ENEMIES[type].hidden)
      .flatMap((type) =>
        (touch || this.run.settings.quality === "low"
          ? ["lite"]
          : ["full", "lite"]
        ).map((detail) => zombieModel(type, detail)),
      );
    warmup.forEach((model) => {
      this.view.scene.add(model);
      setSurfaceQuality(model, this.run.settings.quality);
    });
    try {
      await this.view.renderer.compileAsync(this.view.scene, this.view.camera);
    } finally {
      warmup.forEach((model) => {
        this.view.scene.remove(model);
        releaseZombie(model);
      });
    }
    checkpoint();
    this.view.mapEnvironment = captureEnvironment(
      this.view.renderer,
      this.view.scene,
      this.run.world,
      touch,
    );
    this.view.scene.environment = this.view.mapEnvironment.texture;
    this.view.viewScene.environment = this.view.environmentTarget.texture;
    this.view.viewScene.environmentIntensity = 0.68;
    this.view.combatEffects = new CombatEffects(
      this.view.scene,
      touch,
      this.view.camera,
    );
    this.view.contactShadows = new ContactShadows(this.view.scene);
    if (touch) {
      const anisotropy = Math.min(
        8,
        this.view.renderer.capabilities.getMaxAnisotropy(),
      );
      this.run.world.root.traverse((o) => {
        for (const material of Array.isArray(o.material)
          ? o.material
          : [o.material])
          if (material?.map) material.map.anisotropy = anisotropy;
      });
    }
    const navigationSize = Math.max(
      64,
      Math.ceil(
        (Math.max(this.run.world.bounds.x, this.run.world.bounds.z) * 2 + 4) /
          8,
      ) * 8,
    );
    this.run.navigation = new Navigation(
      this.run.world.obstacles,
      navigationSize,
      1,
      0.36,
    );
    this.run.largeNavigation = new Navigation(
      this.run.world.obstacles,
      navigationSize,
      1,
      0.6,
    );
    // Co-op players stand side by side at the arrival point.
    const seat = session ? [...session.roster.keys()].indexOf(session.id) : 0;
    const seats = session?.roster.size || 1;
    this.run.player = {
      position: this.run.world.spawn
        .clone()
        .add(new T.Vector3((seat - 0.5 * (seats - 1)) * 1.6, 0, 0)),
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
    this.commands.updateNavigation();
    this.run.weapons = [newWeapon("vigil")];
    this.run.slot = 0;
    this.run.wave = 0;
    this.run.phase = "rest";
    this.run.phaseTimer = 10;
    this.run.remaining = 0;
    this.run.spawnTimer = 0;
    this.run.reloadTime = 0;
    this.run.reloadDuration = 0;
    this.run.shotTimer = 0;
    this.run.meleeTimer = 0;
    this.run.meleePending = false;
    this.run.meleeSwing = false;
    this.run.knifeImpactTime = 0;
    this.view.knife.visible = false;
    this.view.knifeTrail.material.opacity = 0;
    this.run.recoil = 0;
    this.run.stepTimer = 0;
    this.run.growlTimer = 3;
    this.run.powerups = { double: 0, insta: 0 };
    this.input.yaw = 0;
    this.input.pitch = this.run.world.viewPitch || 0;
    this.run.time = 0;
    this.input.touchMove = { x: 0, y: 0 };
    this.input.touchSprint = false;
    this.input.touchRun = false;
    this.run.extraction = false;
    this.run.extractionTimer = 0;
    this.run.lastHurtEffect = 0;
    this.run.saved = false;
    this.run.navTimer = 0;
    this.view.camera.position.copy(this.run.player.position);
    this.view.camera.rotation.set(0, 0, 0);
    this.commands.setGun();
    await this.view.renderer.compileAsync(
      this.view.combatEffects.root,
      this.view.camera,
      this.view.scene,
    );
    checkpoint();
    await this.view.renderer.compileAsync(
      this.view.viewScene,
      this.view.viewCamera,
    );
    checkpoint();
    session?.attach({
      run: this.run,
      view: this.view,
      input: this.input,
      sound: this.sound,
      emit: this.emit,
      commands: {
        sessionLost: (...args) => this.commands.sessionLost(...args),
        applyDetail: (...args) => this.commands.applyDetail(...args),
        damageEnemy: (...args) => this.commands.damageEnemy(...args),
        hurt: (...args) => this.commands.hurt(...args),
        creditKill: (...args) => this.commands.creditKill(...args),
        restReward: (...args) => this.commands.restReward(...args),
        collect: (...args) => this.commands.collect(...args),
        receiveWeapon: (...args) => this.commands.receiveWeapon(...args),
        updateHUD: (...args) => this.commands.updateHUD(...args),
        pause: (...args) => this.commands.pause(...args),
        resume: (...args) => this.commands.resume(...args),
        respawn: (...args) => this.commands.respawn(...args),
        explosionEffects: (...args) => this.commands.explosionEffects(...args),
        end: (...args) => this.commands.end(...args),
        throwGrenade: (...args) => this.commands.throwGrenade(...args),
        applySharedInteraction: (...args) =>
          this.commands.applySharedInteraction(...args),
      },
    });
    await session?.ready();
    checkpoint();
    this.run.state = "playing";
    this.run.last = performance.now();
    this.view.nextShadowFrame = 0;
    this.warmupDistantModels();
    this.commands.updateHUD();
    this.emit("state", "playing");
    this.emit("announce", {
      eyebrow: MAPS.find((m) => m.id === map).region,
      title: MAPS.find((m) => m.id === map).short,
      subtitle: "Tenez 10 vagues. Rétablissez le courant. Rentrez vivant.",
      duration: 5500,
    });
    this.emit("toast", {
      title: session
        ? `La nuit commence à ${session.roster.size}`
        : "La nuit commence",
      text: touch
        ? "Glisse à gauche pour bouger. Maintiens le tir et glisse pour viser."
        : session?.peer
          ? "Explorez les lieux. L’hôte appelle la première vague avec N."
          : "Explorez les lieux. Appuyez sur N pour lancer la première vague.",
    });
    if (!touch) this.commands.lock();
  }
  warmupDistantModels() {
    // One template per tick keeps each pause well under a frame budget.
    const session = (this.run.warmupSession =
      (this.run.warmupSession || 0) + 1);
    const types = Object.keys(ENEMIES).filter((t) => !ENEMIES[t].hidden);
    const step = (i) => {
      if (session !== this.run.warmupSession || this.run.state === "menu")
        return;
      if (i >= types.length) return;
      releaseZombie(zombieModel(types[i], "far"));
      this.warmupTimer = setTimeout(() => step(i + 1), 250);
    };
    this.warmupTimer = setTimeout(() => step(0), 400);
  }
  cleanup() {
    clearTimeout(this.warmupTimer);
    this.run.warmupSession = (this.run.warmupSession || 0) + 1;
    this.run.session?.detach();
    this.run.session = null;
    this.run.downed = false;
    this.view.contactShadows?.dispose();
    this.view.contactShadows = null;
    this.view.scene.environment = this.view.environmentTarget.texture;
    this.view.viewScene.environment = this.view.environmentTarget.texture;
    this.view.mapEnvironment?.dispose();
    this.view.mapEnvironment = null;
    this.view.combatEffects?.dispose();
    this.view.combatEffects = null;
    if (this.run.world) {
      this.run.world.dispose();
      this.run.world = null;
    }
    for (const e of this.run.enemies) {
      this.view.scene.remove(e.model);
      releaseZombie(e.model);
    }
    this.run.enemies = [];
    for (const e of [
      ...this.run.effects,
      ...this.run.pickups,
      ...this.run.projectiles,
    ]) {
      if (e.mesh) {
        this.view.scene.remove(e.mesh);
        disposeModel(e.mesh);
      }
    }
    this.run.effects = [];
    this.run.pickups = [];
    this.run.projectiles = [];
    if (this.view.gun) {
      this.view.viewScene.remove(this.view.gun);
      this.view.gun = null;
    }
    for (const gun of this.view.gunCache.values()) disposeModel(gun);
    this.view.gunCache.clear();
  }
}
