import { mapDefinition } from "../maps/catalog.js";
import { createMapGameplay } from "../maps/gameplay.js";
import { prepareSurvivor } from "../survivor.js";
import { zombieModel } from "../creatures.js";
import * as T from "three";
import { prepareSurfaces, setSurfaceQuality } from "../surfaces.js";
import { releaseZombie } from "../creatures.js";
import { prepareCreatureSkins } from "../creature-head.js";
import { hordeTextures, prepareHorde } from "../horde/library.js";
import { HordeEyes } from "../horde/eyes.js";
import { HordeGibs } from "../horde/gibs.js";
import { HordeAudio } from "../horde/voice.js";
import { CombatEffects } from "../combat-effects.js";
import { captureEnvironment, ContactShadows } from "../rendering.js";
import { World } from "../world.js";
import { disposeModel } from "../resources.js";

import { ENEMIES, DIFFICULTIES, MAPS } from "../config.js";
import { newWeapon, Navigation } from "../logic.js";
import { ViewModel } from "../armory/viewmodel.js";
import { ViewEffects } from "../armory/effects.js";
import { RIGS } from "../armory/catalog.js";
import { WeaponAudio } from "../armory/audio.js";
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
      revive,
      eliminate,
      obstacleDistance,
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
      revive,
      eliminate,
      obstacleDistance,
      explosionEffects,
      end,
      throwGrenade,
      applySharedInteraction,
      lock,
    };
  }
  async load(map, difficulty, touch, session = null, checkpoint = () => {}) {
    await this.sound.init();
    this.sound.score.startRun();
    if (session) await prepareSurvivor();
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
    this.run.eliminated = false;
    this.input.touchInteract = false;
    await Promise.all([
      this.prepareArmory(touch),
      prepareSurfaces(touch, mapDefinition(map).theme),
      prepareHorde(touch),
      (this.sound.horde ||= new HordeAudio(this.sound, touch))
        .load()
        .catch((error) => console.warn("Horde sounds unavailable", error)),
      (this.sound.armory ||= new WeaponAudio(this.sound, touch))
        .load()
        .catch((error) => console.warn("Weapon sounds unavailable", error)),
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
    this.sound.armory?.setRoom(mapDefinition(map).theme);
    this.view.film.uniforms.cold.value = mapDefinition(map).cold;
    this.run.difficulty = DIFFICULTIES[difficulty];
    this.run.difficultyId = difficulty;
    this.run.world = new World(this.view.scene, map, this.run.settings.quality);
    this.view.camera.far = this.run.world.viewDistance || 160;
    this.view.camera.updateProjectionMatrix();
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
      // Upload every body's maps now: a new face mid-wave must not stall a frame.
      for (const texture of hordeTextures())
        this.view.renderer.initTexture(texture);
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
    this.view.hordeEyes = new HordeEyes(this.view.scene, touch);
    this.view.hordeGibs = new HordeGibs(this.view.scene, touch);
    this.sound.horde?.attach(this.run, this.view.camera);
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
    this.run.mapGameplay = createMapGameplay(
      {
        run: this.run,
        view: this.view,
        input: this.input,
        sound: this.sound,
        emit: this.emit,
      },
      this.commands,
    );
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
        revive: (...args) => this.commands.revive(...args),
        eliminate: (...args) => this.commands.eliminate(...args),
        obstacleDistance: (...args) => this.commands.obstacleDistance(...args),
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
    this.preloadArmory();
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
  /**
   * First-person arms and the starting weapon load behind the loader. A
   * failure leaves the procedural weapons in place.
   */
  async prepareArmory(touch) {
    if (!this.view.viewModel || this.view.viewModel.mobile !== touch) {
      this.view.viewEffects?.dispose();
      this.view.viewModel?.dispose();
      this.view.viewModel = new ViewModel(this.view.viewScene, {
        mobile: touch,
      });
      this.view.viewEffects = new ViewEffects(this.view.viewModel.root, touch);
    }
    try {
      await Promise.all([
        this.view.viewModel.prepare(),
        this.view.viewModel.load("vigil"),
      ]);
    } catch (error) {
      console.warn("Armory unavailable, procedural weapons in use", error);
    }
  }
  /** The other weapons stream in one by one once the run has started. */
  preloadArmory() {
    const vm = this.view.viewModel;
    if (!vm) return;
    const session = this.run.warmupSession;
    const ids = Object.keys(RIGS).filter((id) => !vm.has(id));
    const next = (i) => {
      if (i >= ids.length || session !== this.run.warmupSession) return;
      vm.load(ids[i])
        .then((weapon) =>
          this.view.renderer.compileAsync(
            weapon,
            this.view.viewCamera,
            this.view.viewScene,
          ),
        )
        .catch((error) =>
          console.warn(`Weapon model unavailable: ${ids[i]}`, error),
        )
        .finally(() => {
          this.armoryTimer = setTimeout(() => next(i + 1), 250);
        });
    };
    this.armoryTimer = setTimeout(() => next(0), 1200);
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
    this.run.mapGameplay?.dispose();
    this.run.mapGameplay = null;
    clearTimeout(this.warmupTimer);
    clearTimeout(this.armoryTimer);
    this.view.viewModel?.hide();
    this.run.pendingDraw = 0;
    this.run.warmupSession = (this.run.warmupSession || 0) + 1;
    this.run.session?.detach();
    this.run.session = null;
    this.run.downed = false;
    this.view.contactShadows?.dispose();
    this.view.contactShadows = null;
    this.view.hordeEyes?.dispose();
    this.view.hordeEyes = null;
    this.view.hordeGibs?.dispose();
    this.view.hordeGibs = null;
    this.sound.horde?.detach();
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
