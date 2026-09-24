// Offline clip authoring helpers for the horde animation library: mirroring,
// posture offsets, upper-body overlays, resampling and foot analysis.
import * as T from "three";

const clone = (clip) => ({
  ...clip,
  frames: clip.frames.map((f) => ({
    rotations: new Map([...f.rotations].map(([k, q]) => [k, q.clone()])),
    root: f.root.clone(),
  })),
});
export { clone as cloneClip };

/** World rotations/positions of the target skeleton for one frame. */
export function frameGlobals(target, frame) {
  const out = new Map();
  for (const j of target.joints) {
    const parent = j.parent ? out.get(j.parent.name) : null;
    const q = (parent ? parent.q : new T.Quaternion())
      .clone()
      .multiply(frame.rotations.get(j.name));
    const local = j.parent ? j.restP : frame.root;
    const p = j.parent
      ? local.clone().applyQuaternion(parent.q).add(parent.p)
      : local.clone();
    out.set(j.name, { q, p });
  }
  return out;
}

/** Local rotations from a map of joint name -> world quaternion. */
function fromGlobals(target, worldQ, root) {
  const rotations = new Map();
  for (const j of target.joints) {
    const g = worldQ.get(j.name);
    const parent = j.parent ? worldQ.get(j.parent.name) : new T.Quaternion();
    rotations.set(j.name, parent.clone().invert().multiply(g));
  }
  return { rotations, root };
}

const swapName = (name) =>
  name.replace(/ L /, " __ ").replace(/ R /, " L ").replace(/ __ /, " R ");

/**
 * Mirror left/right. Deltas from the symmetric reference pose are reflected
 * across the sagittal (YZ) plane, then applied to the opposite joint.
 */
export function mirror(clip, target, reference) {
  const out = clone(clip);
  const reflect = (q) => new T.Quaternion(q.x, -q.y, -q.z, q.w);
  for (let i = 0; i < clip.frames.length; i++) {
    const g = frameGlobals(target, clip.frames[i]);
    const mirrored = new Map();
    for (const j of target.joints) {
      const other = swapName(j.name);
      const src = g.get(other).q;
      const delta = src
        .clone()
        .multiply(reference.targetRef.get(other).q.clone().invert());
      mirrored.set(
        j.name,
        reflect(delta).multiply(reference.targetRef.get(j.name).q),
      );
    }
    const root = clip.frames[i].root.clone();
    root.x = -root.x;
    out.frames[i] = fromGlobals(target, mirrored, root);
  }
  return out;
}

/**
 * Add world-space posture offsets (radians, applied about the character's
 * axes: x = pitch forward, y = yaw left, z = roll). `offsets` maps joint names
 * to [x, y, z] or to a function of normalized time returning [x, y, z].
 */
export function offset(clip, target, offsets) {
  const out = clone(clip);
  const n = clip.frames.length;
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0;
    const g = frameGlobals(target, clip.frames[i]);
    // Apply in hierarchy order so children inherit parent offsets naturally:
    // offset the joint's local rotation by a world-axis rotation.
    for (const j of target.joints) {
      const spec = offsets[j.name];
      if (!spec) continue;
      const [x, y, z] = typeof spec === "function" ? spec(t, i) : spec;
      const turn = new T.Quaternion().setFromEuler(new T.Euler(x, y, z, "YXZ"));
      const parent = j.parent ? g.get(j.parent.name).q : new T.Quaternion();
      // world' = turn * world  ->  local' = parent^-1 * turn * parent * local
      const local = out.frames[i].rotations.get(j.name);
      const lq = parent
        .clone()
        .invert()
        .multiply(turn)
        .multiply(parent)
        .multiply(local);
      out.frames[i].rotations.set(j.name, lq);
    }
  }
  return out;
}

/** Scale the vertical root motion (bob) and optionally lower the pelvis. */
export function rootAdjust(clip, { bob = 1, drop = 0, sway = 1 } = {}) {
  const out = clone(clip);
  const mean =
    clip.frames.reduce((s, f) => s + f.root.y, 0) / clip.frames.length;
  for (const f of out.frames) {
    f.root.y = mean + (f.root.y - mean) * bob - drop;
    f.root.x *= sway;
  }
  return out;
}

/**
 * Replace the listed joints with those of `upper` (time-warped to the base
 * length, looping), blended by `weight` (0..1 or function of t).
 */
export function overlay(
  base,
  upper,
  joints,
  weight = 1,
  { offsetTime = 0 } = {},
) {
  const out = clone(base);
  const n = base.frames.length,
    m = upper.frames.length;
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0;
    const u = (t + offsetTime) % 1;
    const k = Math.round(u * (m - 1));
    const w = typeof weight === "function" ? weight(t) : weight;
    for (const name of joints) {
      const a = out.frames[i].rotations.get(name);
      const b = upper.frames[k].rotations.get(name);
      out.frames[i].rotations.set(name, a.clone().slerp(b, w));
    }
  }
  return out;
}

/** Hold a single frame of a clip as a static pose clip. */
export function poseClip(clip, time, duration = 1, fps = clip.fps) {
  const k = Math.min(clip.frames.length - 1, Math.round(time * clip.fps));
  const n = Math.max(2, Math.round(duration * fps) + 1);
  const src = clip.frames[k];
  return {
    ...clip,
    fps,
    frames: Array.from({ length: n }, () => ({
      rotations: new Map([...src.rotations].map(([a, q]) => [a, q.clone()])),
      root: src.root.clone(),
    })),
  };
}

/** Change playback rate by resampling (rate > 1 = faster). */
export function retime(clip, rate) {
  const n = clip.frames.length;
  const duration = (n - 1) / clip.fps / rate;
  const m = Math.max(2, Math.round(duration * clip.fps) + 1);
  const frames = [];
  for (let i = 0; i < m; i++) {
    const s = (i / (m - 1)) * (n - 1);
    const a = Math.floor(s),
      b = Math.min(n - 1, a + 1),
      w = s - a;
    const fa = clip.frames[a],
      fb = clip.frames[b];
    const rotations = new Map();
    for (const [k, q] of fa.rotations)
      rotations.set(k, q.clone().slerp(fb.rotations.get(k), w));
    frames.push({ rotations, root: fa.root.clone().lerp(fb.root, w) });
  }
  const out = { ...clip, frames };
  if (clip.speed !== undefined) out.speed = clip.speed * rate;
  return out;
}

/** Concatenate clips with a short crossfade between them. */
export function chain(clips, blend = 4) {
  const out = clone(clips[0]);
  for (const next of clips.slice(1)) {
    const c = clone(next);
    // Carry the root horizontally so the second clip continues in place.
    const last = out.frames.at(-1).root,
      first = c.frames[0].root;
    const dx = last.x - first.x,
      dz = last.z - first.z;
    for (const f of c.frames) {
      f.root.x += dx;
      f.root.z += dz;
    }
    const k = Math.min(blend, out.frames.length - 1, c.frames.length - 1);
    for (let i = 0; i < k; i++) {
      const w = (i + 1) / (k + 1);
      const a = out.frames[out.frames.length - k + i],
        b = c.frames[i];
      for (const [name, q] of a.rotations) q.slerp(b.rotations.get(name), w);
      a.root.lerp(b.root, w);
    }
    out.frames.push(...c.frames.slice(k));
  }
  return out;
}

/**
 * Ground contact analysis of a clip. Returns per-frame lowest sole heights,
 * footfall times (normalized, per foot) and, for in-place loops, the body
 * speed implied by the planted feet: during a stance the foot is fixed in the
 * world, so v = (z at touchdown - z at lift-off) / stance duration.
 */
export function footAnalysis(clip, target) {
  const feet = ["L", "R"].map((s) => [`Bip01 ${s} Foot`, `Bip01 ${s} Toe0`]);
  const n = clip.frames.length;
  const heights = [],
    zs = [],
    lows = [];
  for (const frame of clip.frames) {
    const g = frameGlobals(target, frame);
    const perFoot = feet.map(([foot, toe]) => {
      const a = g.get(foot).p,
        b = g.get(toe).p;
      return { y: Math.min(a.y, b.y), z: (a.z + b.z) / 2 };
    });
    heights.push(perFoot.map((f) => f.y));
    zs.push(perFoot.map((f) => f.z));
    lows.push(Math.min(...perFoot.map((f) => f.y)));
  }
  const floor = Math.min(...lows);
  const speeds = [];
  const steps = [[], []];
  // Loops repeat their first frame at the end: analyse n - 1 unique frames
  // cyclically so the seam is neither a false touchdown nor a missed one.
  const m = Math.max(2, n - 1);
  for (let k = 0; k < 2; k++) {
    const minY = Math.min(...heights.map((h) => h[k]));
    const contact = heights.slice(0, m).map((h) => h[k] <= minY + 0.025);
    for (let i = 0; i < m; i++) {
      if (!contact[i] || contact[(i - 1 + m) % m]) continue;
      let j = i;
      while (contact[(j + 1) % m] && j - i < m) j++;
      steps[k].push(i / m);
      if (j - i >= 2)
        speeds.push((zs[i][k] - zs[j % m][k]) / ((j - i) / clip.fps));
    }
  }
  speeds.sort((a, b) => a - b);
  const stanceSpeed = speeds.length ? speeds[Math.floor(speeds.length / 2)] : 0;
  return { lows, floor, stanceSpeed, steps };
}

// Distance from each joint to the body surface below it, for full-body
// ground contact (lying, kneeling and crawling poses).
const CONTACT_RADIUS = {
  Pelvis: 0.1,
  Spine: 0.1,
  Spine1: 0.11,
  Spine2: 0.12,
  Neck: 0.06,
  Head: 0.1,
  "L Clavicle": 0.07,
  "R Clavicle": 0.07,
  "L UpperArm": 0.05,
  "R UpperArm": 0.05,
  "L Forearm": 0.04,
  "R Forearm": 0.04,
  "L Hand": 0.03,
  "R Hand": 0.03,
  "L Thigh": 0.08,
  "R Thigh": 0.08,
  "L Calf": 0.055,
  "R Calf": 0.055,
  "L Foot": 0.06,
  "R Foot": 0.06,
  "L Toe0": 0.0,
  "R Toe0": 0.0,
};

/** Lowest body-surface height of a frame (joint heights minus radii). */
export function frameFloor(target, frame, radii = {}) {
  const g = frameGlobals(target, frame);
  let low = Infinity;
  for (const [name, { p }] of g) {
    const key = name.replace("Bip01 ", "");
    const r = radii[key] ?? CONTACT_RADIUS[key] ?? 0.05;
    low = Math.min(low, p.y - r);
  }
  return low;
}

/**
 * Put the body on the floor. "clip": one constant shift (standing loops keep
 * their bob). "frame": per-frame full-body contact, lightly smoothed (falls,
 * get-ups, crawls).
 */
export function groundClip(
  clip,
  target,
  { mode = "clip", lift = 0, radii } = {},
) {
  const out = clone(clip);
  const floors = out.frames.map((f) => frameFloor(target, f, radii));
  if (mode === "clip") {
    const floor = Math.min(...floors);
    for (const f of out.frames) f.root.y += lift - floor;
  } else {
    const n = floors.length;
    const shifts = floors.map((v) => lift - v);
    for (let i = 0; i < n; i++) {
      let sum = 0,
        weight = 0;
      for (let k = -2; k <= 2; k++) {
        const j = Math.max(0, Math.min(n - 1, i + k));
        const w = 3 - Math.abs(k);
        sum += shifts[j] * w;
        weight += w;
      }
      out.frames[i].root.y += sum / weight;
    }
  }
  return out;
}

/**
 * Keyframed authoring on top of a living base (idle/walk loop):
 *   keys: [{ t: 0..1, bones: { "Bip01 R UpperArm": [x, y, z], ... },
 *            root: [x, y, z] }]
 * Bone values are character-axis rotations (radians): x pitches forward,
 * y yaws left, z rolls toward the character's left. Values are interpolated
 * with Catmull-Rom tangents (zero at both ends: the clip starts and ends on
 * the base motion). Unlisted bones in a key hold 0 at that key.
 */
export function keyed(base, target, { duration, keys, fps = base.fps }) {
  const n = Math.max(2, Math.round(duration * fps) + 1);
  const m = base.frames.length;
  const frames = [];
  for (let i = 0; i < n; i++) {
    const src = base.frames[i % m];
    frames.push({
      rotations: new Map([...src.rotations].map(([k, q]) => [k, q.clone()])),
      root: src.root.clone(),
    });
  }
  const bones = new Set();
  for (const k of keys)
    for (const b of Object.keys(k.bones || {})) bones.add(b);
  const sorted = [...keys].sort((a, b) => a.t - b.t);
  const value = (getter, t) => {
    // Cubic Hermite through (t_i, v_i) with Catmull-Rom tangents.
    const pts = sorted.map((k) => [k.t, getter(k)]);
    if (t <= pts[0][0]) return pts[0][1];
    if (t >= pts.at(-1)[0]) return pts.at(-1)[1];
    let i = 0;
    while (i < pts.length - 2 && t > pts[i + 1][0]) i++;
    const [t0, v0] = pts[i],
      [t1, v1] = pts[i + 1];
    const tangent = (j) => {
      if (j <= 0 || j >= pts.length - 1) return 0;
      return (pts[j + 1][1] - pts[j - 1][1]) / (pts[j + 1][0] - pts[j - 1][0]);
    };
    const h = t1 - t0,
      u = (t - t0) / h;
    const u2 = u * u,
      u3 = u2 * u;
    return (
      (2 * u3 - 3 * u2 + 1) * v0 +
      (u3 - 2 * u2 + u) * h * tangent(i) +
      (-2 * u3 + 3 * u2) * v1 +
      (u3 - u2) * h * tangent(i + 1)
    );
  };
  const offsets = {};
  for (const b of bones)
    offsets[b] = (t) =>
      [0, 1, 2].map((c) => value((k) => k.bones?.[b]?.[c] ?? 0, t));
  const out = offset({ ...base, fps, frames }, target, offsets);
  if (sorted.some((k) => k.root))
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      for (let c = 0; c < 3; c++) {
        const v = value((k) => k.root?.[c] ?? 0, t);
        if (c === 0) out.frames[i].root.x += v;
        if (c === 1) out.frames[i].root.y += v;
        if (c === 2) out.frames[i].root.z += v;
      }
    }
  return out;
}

const LEGS = ["L", "R"].map((s) => ({
  upper: `Bip01 ${s} Thigh`,
  lower: `Bip01 ${s} Calf`,
  end: `Bip01 ${s} Foot`,
  side: s,
}));
/** Arm chains; the character faces +Z, its left side is +X. */
export const ARMS = ["L", "R"].map((s) => ({
  upper: `Bip01 ${s} UpperArm`,
  lower: `Bip01 ${s} Forearm`,
  end: `Bip01 ${s} Hand`,
  side: s,
}));

/**
 * Keep each limb's end joint where it is in `reference` (same frame count)
 * with an analytic two-bone IK. The middle joint bends in the plane of its
 * current pose, nudged toward `bend(limb)` (a world direction) when given;
 * the end joint keeps the reference world orientation. `goal(limb, end)`
 * may replace the reference target (null: leave the limb alone).
 */
export function lockLimbs(
  clip,
  reference,
  target,
  { limbs = LEGS, weight = () => 1, bend = null, goal: goalFor = null } = {},
) {
  const out = clone(clip);
  const n = out.frames.length;
  for (let i = 0; i < n; i++) {
    const w = weight(n > 1 ? i / (n - 1) : 0, i);
    if (w <= 0) continue;
    const refG = frameGlobals(
      target,
      reference.frames[Math.min(i, reference.frames.length - 1)],
    );
    for (const limb of limbs) {
      const g = frameGlobals(target, out.frames[i]);
      const root = g.get(limb.upper).p,
        mid = g.get(limb.lower).p,
        end = g.get(limb.end).p;
      const custom = goalFor ? goalFor(limb, end.clone()) : null;
      if (goalFor && !custom) continue;
      const goal = custom || end.clone().lerp(refG.get(limb.end).p, w);
      const a = mid.distanceTo(root),
        b = end.distanceTo(mid);
      const toGoal = goal.clone().sub(root);
      const d = Math.min(
        a + b - 1e-4,
        Math.max(Math.abs(a - b) + 1e-4, toGoal.length()),
      );
      const dir = toGoal.normalize();
      // Pole: the current middle-joint offset from the root-end line.
      const pole = mid.clone().sub(root);
      pole.addScaledVector(dir, -pole.dot(dir));
      if (bend) {
        const hint = bend(limb).clone();
        hint.addScaledVector(dir, -hint.dot(dir));
        if (hint.lengthSq() > 1e-8)
          pole.add(hint.normalize().multiplyScalar(0.12));
      }
      if (pole.lengthSq() < 1e-8) pole.set(0, 0, 1);
      pole.normalize();
      const along = (a * a - b * b + d * d) / (2 * d);
      const height = Math.sqrt(Math.max(0, a * a - along * along));
      const newMid = root
        .clone()
        .addScaledVector(dir, along)
        .addScaledVector(pole, height);
      const newEnd = root.clone().addScaledVector(dir, d);
      // Upper: rotate its world orientation so root->mid points to newMid.
      const upperTurn = new T.Quaternion().setFromUnitVectors(
        mid.clone().sub(root).normalize(),
        newMid.clone().sub(root).normalize(),
      );
      const upperWorld = upperTurn.clone().multiply(g.get(limb.upper).q);
      // Lower: after the upper turn, point mid->end toward newEnd.
      const lowerWorldBefore = upperWorld
        .clone()
        .multiply(out.frames[i].rotations.get(limb.lower));
      const oldLowerDir = end
        .clone()
        .sub(mid)
        .normalize()
        .applyQuaternion(upperTurn);
      const lowerTurn = new T.Quaternion().setFromUnitVectors(
        oldLowerDir,
        newEnd.clone().sub(newMid).normalize(),
      );
      const lowerWorld = lowerTurn.clone().multiply(lowerWorldBefore);
      const parentOfUpper = g.get(target.byName.get(limb.upper).parent.name).q;
      out.frames[i].rotations.set(
        limb.upper,
        parentOfUpper.clone().invert().multiply(upperWorld),
      );
      out.frames[i].rotations.set(
        limb.lower,
        upperWorld.clone().invert().multiply(lowerWorld),
      );
      // End joint keeps the reference world orientation.
      const endWorld = g.get(limb.end).q.clone().slerp(refG.get(limb.end).q, w);
      out.frames[i].rotations.set(
        limb.end,
        lowerWorld.clone().invert().multiply(endWorld),
      );
    }
  }
  return out;
}

/**
 * Keep both feet where they are in `reference` (same frame count, e.g. the
 * base motion before keyframed edits) with an analytic two-bone IK per leg.
 * The knee bends in the plane of its current pose; the foot keeps the
 * reference world orientation (flat on the floor).
 */
export function lockFeet(clip, reference, target, options = {}) {
  return lockLimbs(clip, reference, target, { ...options, limbs: LEGS });
}

/** Height of the lowest knee surface above the floor, per frame. */
export function kneeClearance(target, clip, radius = CONTACT_RADIUS["L Calf"]) {
  return clip.frames.map((f) => {
    const g = frameGlobals(target, f);
    return (
      Math.min(g.get("Bip01 L Calf").p.y, g.get("Bip01 R Calf").p.y) - radius
    );
  });
}

/**
 * Crawls: lower the body until the planted knee meets the floor (smoothed;
 * cyclic for loops). `weight(t)` fades the correction in over one-shots.
 */
export function kneesDown(
  clip,
  target,
  { loop = true, weight = () => 1, radius = CONTACT_RADIUS["L Calf"] } = {},
) {
  const out = clone(clip);
  const clearance = kneeClearance(target, clip, radius);
  const n = out.frames.length,
    period = loop ? n - 1 : n;
  for (let i = 0; i < n; i++) {
    let sum = 0,
      total = 0;
    for (let k = -3; k <= 3; k++) {
      const j = loop
        ? (((i + k) % period) + period) % period
        : Math.max(0, Math.min(n - 1, i + k));
      const w = 4 - Math.abs(k);
      sum += clearance[j] * w;
      total += w;
    }
    out.frames[i].root.y -= (sum / total) * weight(n > 1 ? i / (n - 1) : 0);
  }
  return out;
}
