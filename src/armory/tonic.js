import * as T from "three";
import { TONIC } from "../content/services.js";
import { createTonic } from "../supplies.js";
import { disposeModel } from "../resources.js";
import { sampleTrack } from "./timeline.js";

const clamp = (x) => Math.max(0, Math.min(1, x));
const ease = (x) => {
  x = clamp(x);
  return x * x * (3 - 2 * x);
};
const POSITION = [
  [0.22, [-0.2, -0.62, -0.43]],
  [0.48, [-0.19, -0.3, -0.45]],
  [1.08, [-0.18, -0.29, -0.43]],
  [1.28, [-0.17, -0.23, -0.39]],
  [1.9, [-0.16, -0.23, -0.38]],
  [2.08, [-0.19, -0.29, -0.42]],
  [2.3, [-0.25, -0.62, -0.32]],
];
const ROTATION = [
  [0.22, [-0.15, 0, -0.1]],
  [0.48, [-0.07, 0, -0.08]],
  [1.1, [-0.06, 0, -0.08]],
  [1.3, [0.3, 0, -0.1]],
  [1.5, [1.85, 0, -0.12]],
  [1.84, [1.9, 0, -0.12]],
  [1.98, [0.6, 0, -0.1]],
  [2.1, [0.05, 0, -0.1]],
  [2.3, [-0.25, 0, -0.1]],
];
const GRASP = {
  index: [0.72, 0.95, 0.5],
  middle: [0.8, 1.0, 0.55],
  ring: [0.9, 1.05, 0.6],
  pinky: [0.95, 1.05, 0.6],
  thumb: [0.65, 0.4, 0.4, 0.3],
};
const PINCH = {
  index: [0.6, 0.95, 0.45],
  middle: [0.35, 0.4, 0.3],
  ring: [0.5, 0.6, 0.4],
  pinky: [0.6, 0.6, 0.4],
  thumb: [0.7, 0.7, 0.45, 0.25],
};
const RELAX = {
  index: [0.15, 0.18, 0.13],
  middle: [0.2, 0.22, 0.15],
  ring: [0.3, 0.3, 0.2],
  pinky: [0.4, 0.35, 0.2],
  thumb: [0.2, 0.1, 0.2, 0.15],
};
const Y = new T.Vector3(0, 1, 0);

/** Bottle and articulated hands are authored in the view frame, in metres. */
export class TonicView {
  constructor(vm) {
    this.vm = vm;
    this.root = new T.Group();
    this.root.name = "tonic-action";
    this.root.visible = false;
    vm.root.add(this.root);
    this.cache = new Map();
    this.request = null;
    this.recovered = false;
    this.rotation = new T.Vector3();
    this.euler = new T.Euler();
    this.q = new T.Quaternion();
    this.q2 = new T.Quaternion();
    this.parentQ = new T.Quaternion();
    this.v = new T.Vector3();
    this.neck = new T.Vector3();
    this.mouth = new T.Vector3(-0.075, -0.13, -0.105);
    this.capPosition = new T.Vector3();
    this.capStart = new T.Vector3();
    this.capPark = new T.Vector3();
    this.left = {
      knuckle: new T.Vector3(),
      forward: new T.Vector3(),
      lateral: new T.Vector3(),
      wristLimit: 0.72,
    };
    this.right = {
      knuckle: new T.Vector3(),
      forward: new T.Vector3(),
      lateral: new T.Vector3(),
      wristLimit: 0.72,
    };
    this.poleL = new T.Vector3(-0.8, -0.8, 0.25).normalize();
    this.poleR = new T.Vector3(0.8, -0.8, 0.25).normalize();
  }
  prepare() {
    for (const kind of ["health", "speed", "rate", "focus"]) this.model(kind);
  }
  model(kind) {
    if (!this.cache.has(kind)) {
      const model = createTonic(kind);
      model.root.visible = false;
      this.root.add(model.root);
      if (model.cap)
        model.capRest = {
          position: model.cap.position.clone(),
          quaternion: model.cap.quaternion.clone(),
          scale: model.cap.scale.clone(),
        };
      if (model.liquid) model.fillRest = model.liquid.scale.clone();
      this.cache.set(kind, model);
    }
    return this.cache.get(kind);
  }
  start(state) {
    this.stop();
    this.request = state;
    this.recovered = false;
    this.current = this.model(state.kind);
    this.current.root.visible = true;
  }
  draw(state, hidden) {
    if (state !== this.request) this.start(state);
    const t = state.elapsed,
      vm = this.vm,
      model = this.current;
    if (hidden || t < TONIC.lower) {
      this.root.visible = false;
      return false;
    }
    if (t >= TONIC.recover) {
      this.root.visible = false;
      if (!this.recovered) {
        this.recovered = true;
        vm.draw(false);
      }
      return false;
    }
    this.root.visible = true;
    sampleTrack(POSITION, t, model.root.position);
    sampleTrack(ROTATION, t, this.rotation);
    model.root.quaternion.setFromEuler(
      this.euler.set(this.rotation.x, this.rotation.y, this.rotation.z),
    );
    const lift = ease((t - 1.17) / 0.35) * (1 - ease((t - 1.9) / 0.26));
    this.neck.set(0, 0.235, 0).applyQuaternion(model.root.quaternion);
    model.root.position.lerp(this.v.copy(this.mouth).sub(this.neck), lift);
    model.root.updateMatrixWorld(true);
    const twist = ease((t - 0.65) / 0.26) * 2.6;
    this.q
      .copy(model.root.quaternion)
      .multiply(this.q2.setFromAxisAngle(Y, twist));
    this.capStart.set(0, 0.24, 0).applyMatrix4(model.root.matrixWorld);
    this.capPosition.copy(this.capStart);
    if (t > 0.91) {
      const out = ease((t - 0.91) / 0.32);
      this.capPosition.add(
        this.v.set(0.34 * out, 0.055 * Math.sin(out * Math.PI), 0.1 * out),
      );
    }
    // Keep the cap inside the withdrawing hand until both leave the frame.
    this.capPark.set(0.035, -0.012, 0.015).applyQuaternion(this.q);
    this.capPark.negate().add(this.v.set(0.28, -0.57, -0.28));
    this.capPosition.lerp(this.capPark, ease((t - 1.1) / 0.26));
    if (model.cap) {
      model.cap.visible = t < 1.4;
      if (t <= 0.91) {
        model.cap.position.copy(model.capRest.position);
        model.cap.quaternion
          .copy(model.capRest.quaternion)
          .multiply(this.q2.setFromAxisAngle(Y, twist));
      } else {
        model.cap.parent.worldToLocal(
          model.cap.position.copy(this.capPosition),
        );
        model.cap.parent.getWorldQuaternion(this.parentQ).invert();
        model.cap.quaternion.copy(this.parentQ).multiply(this.q);
      }
    }
    if (model.liquid) {
      model.liquid.scale.copy(model.fillRest);
      model.liquid.scale.y *= 1 - ease((t - TONIC.consume) / 0.4) * 0.9;
    }
    this.left.knuckle
      .set(-0.045, 0.105, 0)
      .applyMatrix4(model.root.matrixWorld);
    this.left.forward.set(0, 0, -1).applyQuaternion(model.root.quaternion);
    this.left.lateral.copy(Y).applyQuaternion(model.root.quaternion);
    const reach = ease((t - 0.4) / 0.24);
    this.right.knuckle
      .set(0.035, -0.012, 0.015)
      .applyQuaternion(this.q)
      .add(this.capPosition);
    this.right.knuckle.lerp(this.v.set(0.28, -0.57, -0.28), 1 - reach);
    this.right.forward.set(0, 0, -1).applyQuaternion(this.q);
    this.right.lateral.copy(Y).applyQuaternion(this.q);
    vm.arms.shoulderOffset.left.set(-0.03, -0.04, -0.1);
    vm.arms.shoulderOffset.right.set(0.03, -0.03, -0.1);
    vm.arms.solve("left", this.left, this.poleL, GRASP);
    vm.arms.solve("right", this.right, this.poleR, t < 1.1 ? PINCH : RELAX);
    vm.arms.root.visible = true;
    if (vm.weapon) vm.weapon.visible = false;
    if (vm.knifeHolder) vm.knifeHolder.visible = false;
    vm.muzzleLight.intensity = 0;
    return true;
  }
  stop() {
    this.root.visible = false;
    for (const model of this.cache.values()) model.root.visible = false;
    this.request = null;
  }
  dispose() {
    this.root.removeFromParent();
    disposeModel(this.root);
    this.cache.clear();
  }
}
