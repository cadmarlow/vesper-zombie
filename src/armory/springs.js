import * as T from "three";

// Second-order springs for procedural view-model motion. Impulses go into
// the velocity (a shot, a landing), targets into the rest point (sway).
// Sub-stepped semi-implicit Euler stays stable at 30 fps and on hitches.

export class Spring3 {
  constructor(stiffness = 120, damping = 14) {
    this.k = stiffness;
    this.c = damping;
    this.value = new T.Vector3();
    this.velocity = new T.Vector3();
    this.target = new T.Vector3();
  }
  impulse(x, y, z) {
    this.velocity.x += x;
    this.velocity.y += y;
    this.velocity.z += z;
    return this;
  }
  update(dt) {
    const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / steps;
    const v = this.velocity,
      p = this.value,
      t = this.target;
    for (let i = 0; i < steps; i++) {
      v.x += ((t.x - p.x) * this.k - v.x * this.c) * h;
      v.y += ((t.y - p.y) * this.k - v.y * this.c) * h;
      v.z += ((t.z - p.z) * this.k - v.z * this.c) * h;
      p.x += v.x * h;
      p.y += v.y * h;
      p.z += v.z * h;
    }
    return p;
  }
  reset() {
    this.value.set(0, 0, 0);
    this.velocity.set(0, 0, 0);
    this.target.set(0, 0, 0);
  }
}

/** Exponential approach, frame-rate independent. */
export const approach = (value, target, rate, dt) =>
  value + (target - value) * (1 - Math.exp(-rate * dt));

export const smooth = (t) => t * t * (3 - 2 * t);
export const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);
export const clamp01 = (t) => Math.min(1, Math.max(0, t));
/** 0 -> 1 -> 0 hump over [a, b]. */
export const pulse = (t, a, b) =>
  t <= a || t >= b ? 0 : Math.sin(((t - a) / (b - a)) * Math.PI);
/** Normalized progress of t over [a, b], eased. */
export const phase = (t, a, b) => smoother(clamp01((t - a) / (b - a)));
