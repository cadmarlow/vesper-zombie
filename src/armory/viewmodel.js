import * as T from "three";
import { RIGS } from "./catalog.js";
import { createWeapon, resetParts } from "./models.js";
import { createArms } from "./arms.js";
import { tickArmory } from "./material.js";
import {
  Spring3,
  approach,
  smooth,
  smoother,
  clamp01,
  pulse,
} from "./springs.js";
import {
  dressFlash,
  shapeFlash,
  reseedFlash,
  FLASH_STYLES,
} from "./effects.js";
import { knifeModel } from "../assets.js";
import {
  sampleTrack,
  sampleState,
  crossedEvents,
  sampleHand,
  blendPose,
} from "./timeline.js";

// The first-person weapon: a real-scale model held by IK arms in the view
// frame (eyes at the origin, looking down -z). Base poses (hip, aim, sprint)
// blend with springs for look sway, footsteps, breathing, landings and
// recoil; keyframed actions move the hands, the magazine and the action.
// The game renders `root` with the view-model camera after the world.

const X = new T.Vector3(1, 0, 0),
  Y = new T.Vector3(0, 1, 0),
  Z = new T.Vector3(0, 0, 1);
const v1 = new T.Vector3(),
  v2 = new T.Vector3(),
  v3 = new T.Vector3(),
  q1 = new T.Quaternion(),
  q2 = new T.Quaternion(),
  e1 = new T.Euler(),
  m1 = new T.Matrix4(),
  m2 = new T.Matrix4();
const vec = (a, out = new T.Vector3()) => out.fromArray(a);
const SIDES = ["right", "left"];
const LINKED = ["pump", "bolt", "bolt_handle", "charging_handle"];
const ONE = new T.Vector3(1, 1, 1);
// Per-hand scratch for the IK targets: the hands are solved every frame.
const handScratch = () => ({
  ma: new T.Matrix4(),
  mb: new T.Matrix4(),
  pa: new T.Vector3(),
  pb: new T.Vector3(),
  qa: new T.Quaternion(),
  qb: new T.Quaternion(),
  scale: new T.Vector3(),
  pole: new T.Vector3(),
  target: { knuckle: null, forward: new T.Vector3(), lateral: new T.Vector3() },
  sample: { a: null, b: null, k: 0 },
  pose: {},
});
const HAND = { right: handScratch(), left: handScratch() };

export class ViewModel {
  constructor(scene, { mobile = false } = {}) {
    this.scene = scene;
    this.mobile = mobile;
    this.root = new T.Group();
    this.root.name = "view-model";
    scene.add(this.root);
    // One muzzle light, always present: toggling lights would change the
    // light count and swap shader programs mid-fight.
    this.muzzleLight = new T.PointLight(0xffb870, 0, 1.4, 2);
    this.root.add(this.muzzleLight);
    this.cache = new Map();
    this.pending = new Map();
    this.weapon = null;
    this.id = null;
    this.rig = null;
    this.arms = null;
    this.armsLoading = null;
    this.sway = new Spring3(80, 12);
    this.swayPos = new Spring3(95, 14);
    this.kickPos = new Spring3(240, 19);
    this.kickRot = new Spring3(200, 15);
    this.bounce = new Spring3(120, 11);
    this.drawSpring = new Spring3(90, 12);
    this.aimT = 0;
    this.sprintT = 0;
    this.crouchT = 0;
    this.moveT = 0;
    this.bobPhase = 0;
    this.action = null;
    this.slide = 0;
    this.slideLocked = false;
    this.fireAge = 1;
    this.switching = null;
    this.visible = true;
    // Receives action cues ("eject", "magin", "pump"...) for sound and brass.
    this.onEvent = null;
    this.pendingCycle = null;
    this.spin = {};
    this.spinBoost = 0;
    this.basePosition = new T.Vector3();
    this.baseQuaternion = new T.Quaternion();
    this.adsPosition = new T.Vector3();
    this.adsQuaternion = new T.Quaternion();
    this.hipQuaternion = new T.Quaternion();
    this.sprintQuaternion = new T.Quaternion();
    this.actionRotation = new T.Vector3();
    this.ready = false;
  }

  /** Load the arms early (the run loader awaits this). */
  prepare() {
    this.armsLoading ||= createArms(this.mobile).then((arms) => {
      this.arms = arms;
      this.root.add(arms.root);
      arms.root.visible = false;
      // The combat knife at real scale, carried by the right hand.
      this.knife = knifeModel({ hand: false });
      this.knife.scale.setScalar(0.36);
      this.knife.visible = true;
      this.knifeHolder = new T.Group();
      this.knifeHolder.add(this.knife);
      this.knifeHolder.visible = false;
      this.root.add(this.knifeHolder);
      return arms;
    });
    return this.armsLoading;
  }

  key(id, camo) {
    return `${id}|${camo}`;
  }

  /** Model instance for a weapon, created once per session. */
  load(id, camo = 0) {
    const key = this.key(id, camo);
    if (this.cache.has(key)) return Promise.resolve(this.cache.get(key));
    if (!this.pending.has(key))
      this.pending.set(
        key,
        createWeapon(id, { camo, mobile: this.mobile })
          .then((weapon) => {
            this.cache.set(key, weapon);
            this.pending.delete(key);
            weapon.visible = false;
            this.root.add(weapon);
            this.prepareWeapon(weapon, id);
            return weapon;
          })
          .catch((error) => {
            this.pending.delete(key);
            throw error;
          }),
      );
    return this.pending.get(key);
  }

  has(id, camo = 0) {
    return this.cache.has(this.key(id, camo)) && !!this.arms;
  }

  prepareWeapon(weapon, id) {
    const a = weapon.userData.armory;
    const rig = RIGS[id];
    a.rig = rig;
    // Aim pose: the sight line on the view axis, the eye `relief` behind.
    const rear = a.sockets[rig.sight?.rear || "sight_rear"];
    const front = a.sockets[rig.sight?.front || "sight_front"];
    const r = rear ? rear.position.clone() : new T.Vector3(0, 0.03, 0.05);
    const f = front
      ? front.position.clone()
      : r.clone().add(new T.Vector3(0, 0, -0.2));
    const line = f.clone().sub(r).normalize();
    const align = new T.Quaternion().setFromUnitVectors(
      line,
      new T.Vector3(0, 0, -1),
    );
    a.adsQuaternion = align;
    a.adsPosition = r
      .clone()
      .applyQuaternion(align)
      .negate()
      .add(new T.Vector3(0, 0, -rig.relief));
    // Compatibility with the legacy combat hooks.
    weapon.userData.flash = a.flash = this.createFlash(weapon, rig);
    dressFlash(
      a.flash,
      FLASH_STYLES[rig.flash] || FLASH_STYLES.pistol,
      a.camo > 0,
    );
    weapon.userData.magazine = a.parts.magazine || null;
    weapon.userData.cycle = 0;
    if (a.parts.shell) a.parts.shell.visible = false;
  }

  createFlash(weapon, rig) {
    const socket = weapon.userData.armory.sockets[rig.muzzle || "muzzle"];
    const flash = new T.Group();
    flash.name = "muzzle-flash";
    if (socket) flash.position.copy(socket.position);
    flash.visible = false;
    weapon.add(flash);
    return flash;
  }

  /** Show a weapon. Returns false when it is not loaded yet. */
  show(id, camo = 0) {
    const weapon = this.cache.get(this.key(id, camo));
    if (!weapon || !this.arms) return false;
    if (this.weapon && this.weapon !== weapon) this.weapon.visible = false;
    this.weapon = weapon;
    this.id = id;
    this.rig = weapon.userData.armory.rig;
    weapon.visible = true;
    this.arms.root.visible = true;
    this.action = null;
    this.slide = 0;
    this.slideLocked = false;
    resetParts(weapon);
    return true;
  }

  /** Muzzle and ejection port in the view frame, for effects and tracers. */
  socket(name, target = new T.Vector3()) {
    const s = this.weapon?.userData.armory.sockets[name];
    if (!s) return null;
    return s.getWorldPosition(target);
  }

  hide() {
    if (this.weapon) this.weapon.visible = false;
    if (this.arms) this.arms.root.visible = false;
    this.weapon = null;
    this.id = null;
  }

  /** Raise the weapon from below (after a switch or a pickup). */
  draw(first = false) {
    this.switching = { t: 0, duration: first ? 1.1 : 0.42, first };
  }

  /** Lower the current weapon; resolves when it is out of view. */
  holster(duration = 0.2) {
    this.switching = { t: 0, duration, down: true };
    return duration;
  }

  fire({ aim = false, empty = false, strength = 1 } = {}) {
    if (!this.rig) return;
    const k = this.rig.kick || {};
    const ads = aim ? (k.ads ?? 0.45) : 1;
    const r = () => Math.random() * 2 - 1;
    // Impulses: metres and radians per second.
    this.kickPos.impulse(
      r() * (k.side ?? 0.05) * ads,
      (k.rise ?? 0.08) * ads * strength,
      (k.back ?? 0.8) * ads * strength,
    );
    this.kickRot.impulse(
      (k.pitch ?? 2.4) * ads * strength * (0.85 + Math.random() * 0.3),
      r() * (k.yaw ?? 0.45) * ads,
      r() * (k.roll ?? 0.9) * ads,
    );
    this.fireAge = 0;
    this.slide = 1;
    this.spinBoost = 1;
    // Pump and bolt guns work their action after the shot.
    if (this.rig.cycle && !empty)
      this.pendingCycle = {
        t: this.rig.cycle.delay ?? 0.08,
        ...this.rig.cycle,
      };
    if (empty && this.rig.action?.lockOnEmpty) this.slideLocked = true;
    reseedFlash(this.weapon?.userData.armory.flash);
  }

  /**
   * Start a keyframed action from the rig: "reload", "reloadEmpty", "pump",
   * "bolt", "inspect". onEvent receives the named cues (sounds, ammo).
   */
  play(name, duration, onEvent = null) {
    const def = this.rig?.actions?.[name];
    if (!def) return false;
    this.pendingCycle = null;
    this.action = {
      name,
      def,
      t: 0,
      duration,
      onEvent: onEvent || this.onEvent,
      fired: 0,
      magOffset: null,
      dropAge: -1,
    };
    return true;
  }

  /** True while an action forbids aiming (working a bolt, feeding shells). */
  get blocksAim() {
    return !!(this.action?.def.unaim || this.pendingCycle?.unaim);
  }

  /** Name of the running action, if any. */
  get busy() {
    return this.action?.name || null;
  }

  stop() {
    this.action = null;
    this.pendingCycle = null;
    if (this.weapon) resetParts(this.weapon);
  }

  /**
   * One frame. s: { dt, time, aim, sprint, crouch, speed, strafe, stepRate,
   * grounded, landed, lookX, lookY, hidden, lowered, shake }
   */
  update(s) {
    const dt = s.dt;
    tickArmory(s.time);
    if (!this.weapon || !this.arms) return;
    const rig = this.rig;
    const a = this.weapon.userData.armory;
    // --- blends (kept running behind a scope or the knife)
    const aimRate = rig.aimRate ?? 11;
    this.aimT = approach(this.aimT, s.aim ? 1 : 0, aimRate, dt);
    this.sprintT = approach(this.sprintT, s.sprint ? 1 : 0, 8, dt);
    this.crouchT = approach(this.crouchT, s.crouch ? 1 : 0, 8, dt);
    this.moveT = approach(this.moveT, Math.min(1.4, s.speed || 0), 7, dt);
    // Knife: the weapon is put away, the right hand slashes.
    if (s.melee != null && !s.hidden) {
      this.weapon.visible = false;
      this.arms.root.visible = true;
      this.meleeSwing(s.melee);
      this.wasMelee = true;
      this.fireAge += dt;
      return;
    }
    if (this.wasMelee) {
      this.wasMelee = false;
      if (this.knifeHolder) this.knifeHolder.visible = false;
      this.draw(false);
    }
    const visible = !s.hidden;
    this.weapon.visible = visible;
    this.arms.root.visible = visible;
    if (!visible) {
      this.fireAge += dt;
      return;
    }
    const aim = smoother(this.aimT);
    const sprint = smooth(this.sprintT) * (1 - aim);
    // --- base pose
    vec(rig.hip.position, v1);
    this.hipQuaternion.setFromEuler(e1.fromArray(rig.hip.rotation));
    this.basePosition.copy(v1).lerp(a.adsPosition, aim);
    this.baseQuaternion.copy(this.hipQuaternion).slerp(a.adsQuaternion, aim);
    if (rig.sprint) {
      vec(rig.sprint.position, v2);
      this.sprintQuaternion.setFromEuler(e1.fromArray(rig.sprint.rotation));
      this.basePosition.lerp(v2, sprint);
      this.baseQuaternion.slerp(this.sprintQuaternion, sprint);
    }
    // --- look sway (the weapon lags behind the view)
    const swayScale = (1 - aim * 0.75) * (s.shake === false ? 0.4 : 1);
    const lookX = T.MathUtils.clamp(s.lookX / Math.max(dt, 1e-3), -6, 6);
    const lookY = T.MathUtils.clamp(s.lookY / Math.max(dt, 1e-3), -6, 6);
    // Turning left (lookX > 0) leaves the muzzle pointing right, then it catches up.
    this.sway.target.set(
      -lookY * 0.02 * swayScale,
      -lookX * 0.03 * swayScale,
      lookX * 0.022 * swayScale,
    );
    this.swayPos.target.set(
      lookX * 0.0035 * swayScale,
      -lookY * 0.003 * swayScale,
      0,
    );
    this.sway.update(dt);
    this.swayPos.update(dt);
    // --- footsteps: a figure of eight, wider when running, tiny when aiming
    const moving = this.moveT;
    this.bobPhase +=
      dt * (s.stepRate || 1.9) * Math.PI * (moving > 0.05 ? 1 : 0);
    const bobAmp =
      moving *
      (1 - aim * 0.86) *
      (s.shake === false ? 0.3 : 1) *
      (1 + sprint * 1.6);
    const bx = Math.sin(this.bobPhase) * 0.009 * bobAmp;
    const by = -(1 - Math.cos(this.bobPhase * 2)) * 0.0055 * bobAmp;
    const broll = Math.sin(this.bobPhase) * 0.035 * bobAmp;
    const byaw = Math.sin(this.bobPhase) * 0.02 * bobAmp;
    // --- breathing
    const breath = 1 - aim * 0.6;
    const brx = Math.sin(s.time * 1.35) * 0.006 * breath;
    const bry = Math.sin(s.time * 0.9 + 1.1) * 0.004 * breath;
    const bpy = Math.sin(s.time * 1.35 + 0.6) * 0.0014 * breath;
    // --- landing and jumping
    if (s.landed) this.bounce.impulse(0, -Math.min(1.2, s.landed * 0.28), 0);
    this.bounce.update(dt);
    // --- recoil
    this.kickPos.update(dt);
    this.kickRot.update(dt);
    this.fireAge += dt;
    // --- switch / draw
    let drawY = 0,
      drawPitch = 0,
      drawRoll = 0;
    if (this.switching) {
      const w = this.switching;
      w.t += dt;
      const k = clamp01(w.t / w.duration);
      if (w.down) {
        const e = smoother(k);
        drawY = -0.22 * e;
        drawPitch = -0.9 * e;
        drawRoll = 0.35 * e;
      } else if (w.first) {
        // First raise: the weapon rolls to show its flank, then settles.
        const up = 1 - smoother(clamp01(k / 0.35));
        drawY = -0.22 * up;
        drawPitch = -0.9 * up;
        drawRoll = 0.35 * up + pulse(k, 0.25, 0.95) * 0.75;
        drawPitch += pulse(k, 0.3, 0.9) * 0.18;
      } else {
        const e = 1 - smoother(k);
        drawY = -0.22 * e;
        drawPitch = -0.9 * e;
        drawRoll = 0.35 * e;
      }
      if (k >= 1 && !w.down) this.switching = null;
    }
    if (this.pendingCycle) {
      this.pendingCycle.t -= dt;
      if (this.pendingCycle.t <= 0) {
        const c = this.pendingCycle;
        this.pendingCycle = null;
        this.play(c.name, c.duration);
      }
    }
    // --- keyframed action
    const act = this.action;
    let actionPos = v3.set(0, 0, 0),
      actionRot = null;
    if (act) {
      const prev = act.t;
      act.t = Math.min(1, act.t + dt / act.duration);
      if (act.def.events)
        for (const name of crossedEvents(act.def.events, prev, act.t))
          this.event(name, act);
      actionPos = sampleTrack(act.def.weaponPosition, act.t, v3.set(0, 0, 0));
      if (act.def.weaponRotation)
        actionRot = sampleTrack(
          act.def.weaponRotation,
          act.t,
          this.actionRotation,
        );
    }
    // --- compose the weapon transform
    const w = this.weapon;
    w.position
      .copy(this.basePosition)
      .add(this.swayPos.value)
      .add(v2.set(bx, by + bpy + drawY, 0))
      .add(this.bounce.value)
      .add(actionPos);
    // Recoil pushes back along the bore, whatever the pose.
    w.position.add(
      v2.copy(this.kickPos.value).applyQuaternion(this.baseQuaternion),
    );
    const crouchRoll = this.crouchT * 0.05 * (1 - aim);
    const strafeRoll = -(s.strafe || 0) * 0.05 * (1 - aim * 0.6);
    // Reviving a teammate or being downed lowers the weapon.
    const lowered = s.lowered || 0;
    w.position.y -= lowered * 0.24;
    e1.set(
      this.sway.value.x +
        brx +
        drawPitch +
        this.kickRot.value.x +
        (actionRot?.x || 0) -
        lowered * 0.55,
      this.sway.value.y +
        bry +
        byaw +
        this.kickRot.value.y +
        (actionRot?.y || 0),
      this.sway.value.z +
        broll +
        drawRoll +
        crouchRoll +
        strafeRoll +
        this.kickRot.value.z +
        (actionRot?.z || 0),
    );
    // Offsets rotate around the grip, not the bore origin.
    const pivot = vec(rig.pivot || [0, -0.06, 0.06], v1);
    q1.setFromEuler(e1);
    w.quaternion.copy(this.baseQuaternion).multiply(q1);
    const shift = v2
      .copy(pivot)
      .applyQuaternion(this.baseQuaternion)
      .sub(v3.copy(pivot).applyQuaternion(w.quaternion));
    w.position.add(shift);
    w.updateMatrixWorld(true);
    const flash = shapeFlash(a.flash, this.fireAge, true, 1 - aim * 0.55);
    this.muzzleLight.intensity = 7 * flash * flash;
    if (flash > 0) {
      a.flash.getWorldPosition(this.muzzleLight.position);
      this.muzzleLight.color.copy(a.flash.userData.flash.color);
    }
    // --- mechanism
    this.animateParts(dt, s);
    // --- hands
    this.solveHands();
  }

  event(name, act) {
    if (name === "release") this.slideLocked = false;
    if (name === "magout") act.dropAge = 0;
    act.onEvent?.(name);
  }

  animateParts(dt, s) {
    const a = this.weapon.userData.armory;
    const rig = this.rig;
    const act = this.action;
    const t = act?.t ?? 0;
    // Slide / bolt carrier: back in 25 ms, home by 80 ms, or locked open.
    const slidePart = a.parts[rig.action?.part || "slide"];
    if (slidePart) {
      const rest = a.rest.get(slidePart);
      this.slide = Math.max(0, this.slide - dt / 0.075);
      let travel =
        this.fireAge < 0.025 ? this.fireAge / 0.025 : smooth(this.slide);
      if (this.slideLocked) travel = Math.max(travel, rig.action?.lock ?? 0.85);
      if (act?.def.action)
        travel = Math.max(travel, sampleTrack(act.def.action, t));
      slidePart.position
        .copy(rest.position)
        .addScaledVector(Z, travel * (rig.action?.travel ?? 0.05));
    }
    const hammer = a.parts.hammer;
    if (hammer) {
      const rest = a.rest.get(hammer);
      const fall = this.fireAge < 0.02 ? 1 - this.fireAge / 0.02 : 0;
      hammer.quaternion
        .copy(rest.quaternion)
        .multiply(q1.setFromAxisAngle(X, -fall * 0.7));
    }
    const trigger = a.parts.trigger;
    if (trigger) {
      const rest = a.rest.get(trigger);
      const pull = this.fireAge < 0.09 ? 1 - this.fireAge / 0.09 : 0;
      trigger.position.copy(rest.position).addScaledVector(Z, pull * 0.0035);
    }
    const stop = a.parts.slide_stop;
    if (stop) {
      const rest = a.rest.get(stop);
      stop.quaternion
        .copy(rest.quaternion)
        .multiply(q1.setFromAxisAngle(X, this.slideLocked ? 0.12 : 0));
    }
    // Pump fore-end and bolt handle follow their action tracks.
    for (const name of LINKED) {
      const part = a.parts[name];
      // The firing cycle owns the action part (slide or bolt carrier).
      if (!part || name === rig.action?.part) continue;
      const rest = a.rest.get(part);
      const spec = rig.parts?.[name] || {};
      const travel = act?.def[name] ? sampleTrack(act.def[name], t) : 0;
      part.position
        .copy(rest.position)
        .addScaledVector(
          vec(spec.axis || [0, 0, 1], v1),
          travel * (spec.travel ?? 0.08),
        );
      const turn = act?.def[`${name}Turn`]
        ? sampleTrack(act.def[`${name}Turn`], t)
        : 0;
      part.quaternion
        .copy(rest.quaternion)
        .multiply(
          q1.setFromAxisAngle(
            vec(spec.turnAxis || [0, 0, 1], v2),
            turn * (spec.turn ?? 1),
          ),
        );
    }
    // Parts that turn by themselves (gyroscopes, coronas).
    this.spinBoost = Math.max(0, this.spinBoost - dt * 1.5);
    for (const name in rig.spin) {
      const spec = rig.spin[name];
      const part = a.parts[name];
      if (!part) continue;
      this.spin[name] =
        (this.spin[name] || 0) +
        dt * spec.speed * (1 + this.spinBoost * (spec.boost ?? 3));
      part.quaternion
        .copy(a.rest.get(part).quaternion)
        .multiply(
          q1.setFromAxisAngle(vec(spec.axis, v1).normalize(), this.spin[name]),
        );
    }
    this.animateMagazine(dt);
    // A loose shell travels in the support hand's fingers.
    const shell = a.parts.shell;
    if (shell) {
      const spec = act?.def.shell;
      const held =
        !!spec && act.t >= spec.from && act.t < spec.to && this.handTargets;
      shell.visible = held;
      if (held) {
        m1.copy(this.handTargets.left.matrix).multiply(
          m2.makeTranslation(v1.fromArray(spec.knuckleOffset)),
        );
        v1.setFromMatrixPosition(m1);
        this.weapon.worldToLocal(shell.position.copy(v1));
        shell.quaternion.identity();
      }
    }
    if (act && act.t >= 1) this.action = null;
  }

  /** Magazine: seated, dropping out, hidden, or carried by the left hand. */
  animateMagazine(dt) {
    const a = this.weapon.userData.armory;
    const mag = a.parts.magazine;
    if (!mag) return;
    const rest = a.rest.get(mag);
    const act = this.action;
    const state = act ? sampleState(act.def.mag, act.t, "in") : "in";
    mag.visible = state !== "hidden";
    if (state === "in") {
      mag.position.copy(rest.position);
      mag.quaternion.copy(rest.quaternion);
      return;
    }
    if (state === "drop") {
      // Slides out along its axis, then falls in view space.
      act.dropAge = act.dropAge < 0 ? 0 : act.dropAge + dt;
      const age = act.dropAge;
      const axis = vec(mag.userData.axis || [0, -1, 0], v1).normalize();
      const out =
        Math.min(1, age / 0.05) * 0.04 + Math.max(0, age - 0.05) * 0.35;
      mag.position.copy(rest.position).addScaledVector(axis, out);
      // Gravity in the view frame, expressed in the weapon frame.
      const fall = 0.5 * 9.8 * Math.max(0, age - 0.04) ** 2;
      const down = v2
        .set(0, -fall, 0)
        .applyQuaternion(q1.copy(this.weapon.quaternion).invert());
      mag.position.add(down);
      mag.quaternion
        .copy(rest.quaternion)
        .multiply(q2.setFromAxisAngle(X, age * 2.5));
      if (age > 0.6) mag.visible = false;
      return;
    }
    // "hand": the new magazine rides with the left hand's target.
    const hand = this.handTargets?.left;
    if (!hand || !act.def.seat) return;
    if (!act.magOffset) {
      // Seat pose relative to the hand's seat target, in the weapon frame.
      const seat = this.handFrame(act.def.seat, "left", new T.Matrix4(), true);
      act.magOffset = seat
        .invert()
        .multiply(
          new T.Matrix4().compose(
            rest.position,
            rest.quaternion,
            new T.Vector3(1, 1, 1),
          ),
        );
    }
    // Hand target (view frame) -> weapon frame, times the offset.
    m1.copy(this.weapon.matrixWorld)
      .invert()
      .multiply(hand.matrix)
      .multiply(act.magOffset);
    m1.decompose(mag.position, mag.quaternion, v1);
  }

  /** A hand key as a matrix in the view frame (or the weapon frame). */
  handFrame(key, side, out, weaponFrame = false) {
    const rig = this.rig;
    const g = key.grip === "rest" || !key.knuckle ? rig.grips[side] : key;
    const space =
      key.grip === "rest" || !key.knuckle
        ? g.space || "weapon"
        : key.space || "weapon";
    const f = vec(g.forward, v1).normalize();
    const l = vec(g.lateral, v2);
    l.addScaledVector(f, -l.dot(f)).normalize();
    const n = v3.crossVectors(f, l).normalize();
    out.makeBasis(f, l, n).setPosition(vec(g.knuckle || g.wrist, v1));
    if (weaponFrame) {
      if (space === "view")
        out.premultiply(m2.copy(this.weapon.matrixWorld).invert());
      return out;
    }
    if (space === "weapon") out.premultiply(this.weapon.matrixWorld);
    else if (space !== "view") {
      const part = this.weapon.userData.armory.parts[space];
      if (part) out.premultiply(part.matrixWorld);
    }
    return out;
  }

  solveHands() {
    const rig = this.rig;
    const act = this.action;
    this.handTargets ||= {
      left: { matrix: new T.Matrix4() },
      right: { matrix: new T.Matrix4() },
    };
    const aim = smoother(this.aimT);
    for (const side of SIDES) {
      // Shoulders drop as the weapon comes to the eye: the forearms then
      // rise from the bottom of the view instead of covering the sights.
      const shoulder = this.arms.shoulderOffset[side];
      if (rig.shoulders?.[side]) shoulder.fromArray(rig.shoulders[side]);
      else shoulder.set(0, 0, 0);
      if (rig.shouldersAim)
        shoulder.lerp(v1.fromArray(rig.shouldersAim[side]), aim);
      // An action may bring a shoulder back to where a real one would be,
      // so a hand working the action rises from below, not past the eye.
      const lift = act?.def.shoulders?.[side];
      if (lift) shoulder.add(sampleTrack(lift, act.t, v1));
      const track = act?.def[side];
      const h = HAND[side];
      const sample = track ? sampleHand(track, act.t, h.sample) : null;
      const a = sample ? sample.a : REST,
        b = sample ? sample.b : a,
        k = sample ? sample.k : 0;
      const g = rig.grips[side];
      this.placeHand(
        side,
        a,
        b,
        k,
        b.pole || a.pole || g.pole,
        blendPose(
          this.resolvePose(a, side),
          this.resolvePose(b, side),
          k,
          h.pose,
        ),
      );
    }
  }

  /** Blend two hand keys, record the target and solve the arm. */
  placeHand(side, a, b, k, pole, pose) {
    const h = HAND[side];
    const ma = this.handFrame(a, side, h.ma);
    const mb = k > 0 && b !== a ? this.handFrame(b, side, h.mb) : ma;
    ma.decompose(h.pa, h.qa, h.scale);
    mb.decompose(h.pb, h.qb, h.scale);
    h.pa.lerp(h.pb, k);
    h.qa.slerp(h.qb, k);
    this.handTargets[side].matrix.compose(h.pa, h.qa, ONE);
    const target = h.target;
    target.knuckle = h.pa;
    target.forward.copy(X).applyQuaternion(h.qa);
    target.lateral.copy(Y).applyQuaternion(h.qa);
    // Holding still, a hand keeps its wrist straight; while the weapon is
    // worked or turned (reloads, bolt, pump, inspection) it may bend more.
    target.wristLimit = this.action ? ACTION_WRIST : undefined;
    this.arms.solve(side, target, vec(pole, h.pole).normalize(), pose);
  }

  /** Diagonal knife slash, t in [0, 1] over the melee (contact at 0.38). */
  meleeSwing(t) {
    this.handTargets ||= {
      left: { matrix: new T.Matrix4() },
      right: { matrix: new T.Matrix4() },
    };
    for (const side of SIDES) {
      this.arms.shoulderOffset[side].fromArray(MELEE_SHOULDERS[side]);
      const { a, b, k } = sampleHand(MELEE[side], t, HAND[side].sample);
      const pose = blendPose(
        POSES[a.pose] || POSES.grab,
        POSES[b.pose] || POSES.grab,
        k,
        HAND[side].pose,
      );
      this.placeHand(side, a, b, k, b.pole || a.pole, pose);
      if (side === "right" && this.knifeHolder) {
        // Grip in the fist: behind the knuckles, toward the palm, blade out
        // of the thumb side.
        this.knifeHolder.visible = true;
        this.knifeHolder.matrixAutoUpdate = false;
        this.knifeHolder.matrix
          .copy(this.handTargets.right.matrix)
          .multiply(m1.makeTranslation(-0.034, -0.012, -0.022));
        this.knifeHolder.matrixWorldNeedsUpdate = true;
      }
    }
  }

  resolvePose(key, side) {
    if (key.grip === "rest" || !key.pose) return this.rig.grips[side].pose;
    return typeof key.pose === "string"
      ? this.rig.poses?.[key.pose] || POSES[key.pose]
      : key.pose;
  }

  dispose() {
    this.root.removeFromParent();
    this.arms?.dispose();
    this.cache.clear();
  }
}

const REST = { grip: "rest" };
const ACTION_WRIST = (40 * Math.PI) / 180;
const MELEE_SHOULDERS = { right: [0, -0.05, 0.1], left: [0, -0.1, 0.05] };

/**
 * Knife slash in the view frame: raised to the right, cut across at the
 * contact, follow through low left, out of view. The left hand drops away.
 */
const MELEE = {
  right: [
    {
      t: 0,
      space: "view",
      knuckle: [0.22, -0.44, -0.34],
      forward: [0, 0.3, -1],
      lateral: [0, 1, 0.2],
      pose: "fist",
      pole: [0.8, -0.6, 0.2],
    },
    {
      t: 0.18,
      space: "view",
      knuckle: [0.21, -0.06, -0.4],
      forward: [-0.25, 0.35, -0.9],
      lateral: [-0.35, 0.85, 0.35],
      pose: "fist",
      pole: [0.8, -0.3, 0.2],
    },
    {
      t: 0.3,
      space: "view",
      knuckle: [0.11, -0.04, -0.46],
      forward: [-0.5, 0.05, -0.85],
      lateral: [-0.75, 0.3, -0.55],
      pose: "fist",
      pole: [0.8, -0.4, 0.1],
    },
    {
      t: 0.38,
      space: "view",
      knuckle: [0.02, -0.07, -0.49],
      forward: [-0.65, -0.1, -0.75],
      lateral: [-0.85, -0.1, -0.5],
      pose: "fist",
      pole: [0.8, -0.5, 0.1],
    },
    {
      t: 0.46,
      space: "view",
      knuckle: [-0.1, -0.17, -0.45],
      forward: [-0.55, -0.4, -0.65],
      lateral: [-0.6, -0.7, -0.3],
      pose: "fist",
      pole: [0.7, -0.7, 0.1],
    },
    {
      t: 0.55,
      space: "view",
      knuckle: [-0.16, -0.3, -0.4],
      forward: [-0.5, -0.5, -0.6],
      lateral: [-0.4, -0.85, -0.2],
      pose: "fist",
      pole: [0.6, -0.8, 0.1],
    },
    {
      t: 0.72,
      space: "view",
      knuckle: [0.02, -0.5, -0.3],
      forward: [0, 0, -1],
      lateral: [0, 1, 0],
      pose: "fist",
      pole: [0.8, -0.6, 0.2],
    },
    {
      t: 1,
      space: "view",
      knuckle: [0.2, -0.56, -0.25],
      forward: [0, 0, -1],
      lateral: [0, 1, 0],
      pose: "fist",
      pole: [0.8, -0.6, 0.2],
    },
  ],
  left: [
    {
      t: 0,
      space: "view",
      knuckle: [-0.16, -0.46, -0.25],
      forward: [0.2, 0.3, -0.9],
      lateral: [0, 0.2, -1],
      pose: "relaxed",
      pole: [-0.6, -0.8, 0.1],
    },
    {
      t: 0.4,
      space: "view",
      knuckle: [-0.2, -0.4, -0.3],
      forward: [0.3, 0.4, -0.85],
      lateral: [0, 0.2, -1],
      pose: "relaxed",
      pole: [-0.6, -0.8, 0.1],
    },
    {
      t: 1,
      space: "view",
      knuckle: [-0.16, -0.5, -0.25],
      forward: [0.2, 0.3, -0.9],
      lateral: [0, 0.2, -1],
      pose: "relaxed",
      pole: [-0.6, -0.8, 0.1],
    },
  ],
};

/** Shared hand shapes for actions. */
export const POSES = {
  open: {
    index: [0.1, 0.1, 0.05],
    middle: [0.12, 0.1, 0.05],
    ring: [0.15, 0.1, 0.05],
    pinky: [0.2, 0.1, 0.05],
    thumb: [0.1, 0.1, 0.05, 0.05],
    spread: 0.6,
  },
  relaxed: {
    index: [0.35, 0.4, 0.2],
    middle: [0.45, 0.45, 0.25],
    ring: [0.5, 0.5, 0.25],
    pinky: [0.55, 0.5, 0.25],
    thumb: [0.25, 0.1, 0.15, 0.1],
  },
  grab: {
    index: [0.9, 1.0, 0.6],
    middle: [1.0, 1.05, 0.65],
    ring: [1.05, 1.05, 0.65],
    pinky: [1.1, 1.0, 0.6],
    thumb: [0.5, 0.35, 0.3, 0.2],
  },
  pinch: {
    index: [0.7, 0.9, 0.5],
    middle: [0.8, 1.0, 0.6],
    ring: [1.2, 1.3, 0.8],
    pinky: [1.3, 1.3, 0.8],
    thumb: [0.6, 0.45, 0.35, 0.25],
  },
  slap: {
    index: [0.15, 0.1, 0.05],
    middle: [0.15, 0.1, 0.05],
    ring: [0.15, 0.1, 0.05],
    pinky: [0.15, 0.1, 0.05],
    thumb: [0.15, 0.05, 0.05, 0.05],
    spread: 0.2,
  },
  fist: {
    index: [1.25, 1.45, 0.9],
    middle: [1.3, 1.5, 0.95],
    ring: [1.35, 1.5, 0.95],
    pinky: [1.4, 1.45, 0.9],
    thumb: [1.0, -0.2, 0.5, 0.4],
  },
};
