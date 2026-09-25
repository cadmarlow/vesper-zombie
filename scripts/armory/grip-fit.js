// Grip fitting for the armory lab: measures how the gloved hands meet the
// weapon (penetration, contact) and closes each finger joint until its
// phalanx rests on the surface, the way a hand closes on a grip. Offline:
// the results are baked into src/armory/catalog.js.
//   await lab.fit.report()            per-segment depth / contact
//   await lab.fit.fingers("right")    contact curls for the rest grip
import * as T from "three";

const CELL = 0.01;
const FINGERS = { index: 1, middle: 2, ring: 3, pinky: 4 };
const SEGMENTS = {
  1: ["1", "11", "12"],
  2: ["2", "21", "22"],
  3: ["3", "31", "32"],
  4: ["4", "41", "42"],
};
// Closing rates (MCP, PIP, DIP) and anatomical limits.
const RATE = [1, 1.15, 0.75];
const LIMIT = [1.6, 1.85, 1.3];
// Thumb: [opposition, abduction, MCP flexion, IP flexion] ranges.
const THUMB_RANGE = [
  [-0.3, 1.5],
  [-0.9, 0.9],
  [-0.2, 1.1],
  [-0.2, 1.3],
];
const FINGER_RANGE = [
  [-0.1, 1.6],
  [0, 1.85],
  [0, 1.3],
];

const a = new T.Vector3(),
  b = new T.Vector3(),
  c = new T.Vector3(),
  p = new T.Vector3(),
  q = new T.Vector3();

/** Closest point on triangle abc to p (Ericson, Real-Time Collision Detection). */
const ab = new T.Vector3(),
  ac = new T.Vector3(),
  ap = new T.Vector3(),
  bp = new T.Vector3(),
  cp = new T.Vector3(),
  bc = new T.Vector3();
function closest(p, a, b, c, out) {
  ab.subVectors(b, a);
  ac.subVectors(c, a);
  ap.subVectors(p, a);
  const d1 = ab.dot(ap),
    d2 = ac.dot(ap);
  if (d1 <= 0 && d2 <= 0) return out.copy(a);
  bp.subVectors(p, b);
  const d3 = ab.dot(bp),
    d4 = ac.dot(bp);
  if (d3 >= 0 && d4 <= d3) return out.copy(b);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0)
    return out.copy(a).addScaledVector(ab, d1 / (d1 - d3));
  cp.subVectors(p, c);
  const d5 = ab.dot(cp),
    d6 = ac.dot(cp);
  if (d6 >= 0 && d5 <= d6) return out.copy(c);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0)
    return out.copy(a).addScaledVector(ac, d2 / (d2 - d6));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0)
    return out
      .copy(b)
      .addScaledVector(bc.subVectors(c, b), (d4 - d3) / (d4 - d3 + (d5 - d6)));
  const denom = 1 / (va + vb + vc);
  return out
    .copy(a)
    .addScaledVector(ab, vb * denom)
    .addScaledVector(ac, vc * denom);
}

const cellKey = (x, y, z) => ((x + 512) * 1024 + (y + 512)) * 1024 + (z + 512);

/** Triangles of some meshes in the frame of `space`, hashed on a grid. */
export class Collider {
  constructor(meshes, space) {
    this.tris = [];
    this.grid = new Map();
    this.stamp = [];
    this.query = 0;
    const inv = new T.Matrix4().copy(space.matrixWorld).invert();
    for (const mesh of meshes) {
      const m = new T.Matrix4().multiplyMatrices(inv, mesh.matrixWorld);
      const g = mesh.geometry;
      const index = g.index;
      const count = index ? index.count : g.attributes.position.count;
      const v = (i) => {
        const k = index ? index.getX(i) : i;
        const out = new T.Vector3();
        if (mesh.isSkinnedMesh) mesh.getVertexPosition(k, out);
        else out.fromBufferAttribute(g.attributes.position, k);
        return out.applyMatrix4(m);
      };
      for (let i = 0; i < count; i += 3) this.add(v(i), v(i + 1), v(i + 2));
    }
  }
  add(a, b, c) {
    const n = b.clone().sub(a).cross(c.clone().sub(a));
    if (n.lengthSq() < 1e-14) return;
    const tri = { a, b, c, n: n.normalize() };
    const id = this.tris.push(tri) - 1;
    this.stamp.push(0);
    const min = a.clone().min(b).min(c),
      max = a.clone().max(b).max(c);
    for (let x = Math.floor(min.x / CELL); x <= Math.floor(max.x / CELL); x++)
      for (let y = Math.floor(min.y / CELL); y <= Math.floor(max.y / CELL); y++)
        for (
          let z = Math.floor(min.z / CELL);
          z <= Math.floor(max.z / CELL);
          z++
        ) {
          const key = cellKey(x, y, z);
          let list = this.grid.get(key);
          if (!list) this.grid.set(key, (list = []));
          list.push(id);
        }
  }
  /** Signed distance to the nearest surface within `reach` (negative inside). */
  distance(point, reach = 0.02) {
    const cx = Math.floor(point.x / CELL),
      cy = Math.floor(point.y / CELL),
      cz = Math.floor(point.z / CELL);
    const query = ++this.query;
    const found = { best: Infinity, sign: 1 };
    const scan = (r, shell) => {
      for (let x = cx - r; x <= cx + r; x++)
        for (let y = cy - r; y <= cy + r; y++)
          for (let z = cz - r; z <= cz + r; z++) {
            if (
              shell &&
              Math.max(Math.abs(x - cx), Math.abs(y - cy), Math.abs(z - cz)) < r
            )
              continue;
            const list = this.grid.get(cellKey(x, y, z));
            if (!list) continue;
            for (const id of list) {
              if (this.stamp[id] === query) continue;
              this.stamp[id] = query;
              const t = this.tris[id];
              closest(point, t.a, t.b, t.c, q);
              const d = q.distanceTo(point);
              // At an edge several faces tie: the one facing the point decides.
              const facing = p.copy(point).sub(q).dot(t.n);
              if (d < found.best - 1e-6) {
                found.best = d;
                found.sign = facing >= 0 ? 1 : -1;
              } else if (
                d < found.best + 1e-6 &&
                Math.abs(facing) > 1e-9 &&
                facing >= 0
              )
                found.sign = 1;
            }
          }
    };
    // Rings of cells outward: a face beyond ring r is at least r cells away.
    const rings = Math.ceil(reach / CELL);
    for (let r = 1; r <= rings; r++) {
      scan(r, r > 1);
      if (found.best <= (r - 0) * CELL * 0.999 && found.best <= reach) break;
    }
    // Farther than the reach, the nearest face in the cells says nothing.
    return found.best > reach ? Infinity : found.best * found.sign;
  }
}

export function createFitter(lab) {
  const vm = lab.vm;
  const arms = vm.arms;
  const mesh = arms.mesh;
  const bones = mesh.skeleton.bones;
  const skinIndex = mesh.geometry.attributes.skinIndex;
  const skinWeight = mesh.geometry.attributes.skinWeight;
  // Vertices by dominant bone.
  const byBone = new Map();
  for (let i = 0; i < skinIndex.count; i++) {
    let best = 0,
      bone = -1;
    for (let k = 0; k < 4; k++) {
      const w = skinWeight.getComponent(i, k);
      if (w > best) {
        best = w;
        bone = skinIndex.getComponent(i, k);
      }
    }
    const name = bones[bone]?.name;
    if (!name) continue;
    if (!byBone.has(name)) byBone.set(name, []);
    byBone.get(name).push(i);
  }
  const S = { right: "R", left: "L" };
  const verts = (side, part) => byBone.get(`Bip01_${S[side]}_${part}`) || [];

  function weaponMeshes() {
    const out = [];
    vm.weapon.traverseVisible((o) => {
      if (!o.isMesh || o.isSprite) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (m?.blending === T.AdditiveBlending || m?.transparent) return;
      out.push(o);
    });
    return out;
  }
  /** Skinned position of a vertex in the weapon frame. */
  const inv = new T.Matrix4();
  // Skinning matrices straight to the weapon frame, rebuilt after a pose
  // change: K = weapon⁻¹ · mesh · bind⁻¹ · bone · boneInverse · bind.
  const K = bones.map(() => new T.Matrix4());
  const rest = mesh.geometry.attributes.position;
  let stale = true;
  const dirty = () => (stale = true);
  const km = new T.Matrix4(),
    kv = new T.Vector3();
  function refresh() {
    vm.weapon.updateMatrixWorld(true);
    inv.copy(vm.weapon.matrixWorld).invert();
    km.copy(inv).multiply(mesh.matrixWorld).multiply(mesh.bindMatrixInverse);
    bones.forEach((bone, i) =>
      K[i]
        .copy(km)
        .multiply(bone.matrixWorld)
        .multiply(mesh.skeleton.boneInverses[i])
        .multiply(mesh.bindMatrix),
    );
    stale = false;
  }
  function vertex(i, out) {
    if (stale) refresh();
    kv.fromBufferAttribute(rest, i);
    out.set(0, 0, 0);
    for (let k = 0; k < 4; k++) {
      const w = skinWeight.getComponent(i, k);
      if (!w) continue;
      out.addScaledVector(
        c2.copy(kv).applyMatrix4(K[skinIndex.getComponent(i, k)]),
        w,
      );
    }
    return out;
  }
  const c2 = new T.Vector3();
  function collider(side, extra = []) {
    vm.weapon.updateMatrixWorld(true);
    arms.root.updateMatrixWorld(true);
    inv.copy(vm.weapon.matrixWorld).invert();
    // The weapon at rest, hashed once per model.
    if (weaponCol.weapon !== vm.weapon) {
      weaponCol.weapon = vm.weapon;
      weaponCol.col = new Collider(weaponMeshes(), vm.weapon);
    }
    if (!extra.includes("hand")) return weaponCol.col;
    // The support hand wraps the firing hand: its glove is a surface too.
    const col = handCollider(side === "left" ? "right" : "left");
    // Union of solids: the nearer surface wins.
    return {
      distance: (point, reach) =>
        Math.min(
          weaponCol.col.distance(point, reach),
          col.distance(point, reach),
        ),
    };
  }
  /** The glove of one hand as a collider, in its current pose. */
  function handCollider(other) {
    const col = new Collider([], vm.weapon);
    {
      const keep = new Set();
      for (const part of [
        "Hand",
        ...Object.values(SEGMENTS)
          .flat()
          .map((s) => `Finger${s}`),
        "Finger0",
        "Finger01",
        "Finger02",
      ])
        for (const i of verts(other, part)) keep.add(i);
      const g = mesh.geometry;
      for (let t = 0; t < g.index.count; t += 3) {
        const i0 = g.index.getX(t),
          i1 = g.index.getX(t + 1),
          i2 = g.index.getX(t + 2);
        if (!keep.has(i0) || !keep.has(i1) || !keep.has(i2)) continue;
        col.add(
          vertex(i0, new T.Vector3()),
          vertex(i1, new T.Vector3()),
          vertex(i2, new T.Vector3()),
        );
      }
    }
    return col;
  }
  const weaponCol = { weapon: null, col: null };
  let lastContact = null;
  function depth(col, list, reach = 0.02) {
    let min = Infinity,
      touching = 0;
    for (const i of list) {
      const d = col.distance(vertex(i, c), reach);
      if (d < min) min = d;
      if (d < 0.002) touching++;
    }
    return { min, touching };
  }
  function segments(side) {
    const out = { palm: verts(side, "Hand") };
    for (const [name, f] of Object.entries(FINGERS))
      SEGMENTS[f].forEach(
        (s, k) => (out[`${name}${k}`] = verts(side, `Finger${s}`)),
      );
    out.thumb0 = verts(side, "Finger0");
    out.thumb1 = verts(side, "Finger01");
    out.thumb2 = verts(side, "Finger02");
    return out;
  }
  function settle() {
    vm.update({ ...lab.state, dt: 1e-4, time: lab.time });
    arms.root.updateMatrixWorld(true);
    dirty();
  }

  return {
    segments,
    collider,
    /** Deepest penetration (mm, negative) and contact count per segment. */
    report(sides = ["right", "left"], extra = { left: ["hand"] }) {
      settle();
      const out = {};
      for (const side of sides) {
        const col = collider(side, extra[side] || []);
        for (const [name, list] of Object.entries(segments(side))) {
          const { min, touching } = depth(col, list);
          out[`${side}.${name}`] = [
            min === Infinity ? null : +(min * 1000).toFixed(1),
            touching,
          ];
        }
      }
      return out;
    },
    /**
     * Slide the rest grip along the palm normal until the palm rests on the
     * surface (deepest palm vertex at -skin). Returns the new knuckle.
     */
    seat(side, { skin = 0.001, range = 0.03, parts = ["palm"] } = {}) {
      const g = vm.rig.grips[side];
      const f = new T.Vector3().fromArray(g.forward).normalize();
      const l = new T.Vector3().fromArray(g.lateral);
      l.addScaledVector(f, -l.dot(f)).normalize();
      // Anatomical palm normal (see orthoFrame in src/armory/arms.js).
      const n =
        side === "right"
          ? new T.Vector3().crossVectors(l, f)
          : new T.Vector3().crossVectors(f, l);
      const base = g.knuckle.slice();
      const at = (t) => {
        g.knuckle = base.map((v, k) => v - n.getComponent(k) * t);
        settle();
        const col = collider(side, side === "left" ? ["hand"] : []);
        let min = Infinity;
        const seg = segments(side);
        for (const part of parts)
          min = Math.min(min, depth(col, seg[part], 0.02).min);
        return min;
      };
      // t > 0 moves the hand off the surface.
      let lo = -range,
        hi = range;
      for (let i = 0; i < 18; i++) {
        const mid = (lo + hi) / 2;
        const d = at(mid);
        if (d < -skin) lo = mid;
        else hi = mid;
      }
      at(hi);
      return {
        knuckle: g.knuckle.map((v) => +v.toFixed(4)),
        moved: +(hi * 1000).toFixed(1),
      };
    },
    /**
     * Close the fingers of the rest grip until each phalanx meets the
     * surface: all joints close together; a phalanx that touches freezes
     * itself and the joints before it, the tip keeps curling.
     * skin: allowed glove compression (m).
     */
    fingers(
      side,
      {
        skin = 0.0015,
        only = Object.keys(FINGERS),
        extra,
        start,
        fallback = "closest",
      } = {},
    ) {
      settle();
      const r = arms.sides[side];
      const pose = JSON.parse(JSON.stringify(vm.rig.grips[side].pose));
      const col = collider(side, extra || (side === "left" ? ["hand"] : []));
      const result = {},
        contact = {};
      for (const name of only) {
        const f = FINGERS[name];
        const lists = SEGMENTS[f].map((s) => verts(side, `Finger${s}`));
        const curl = start?.[name]?.slice() || [0, 0, 0];
        const apply = () => {
          pose[name] = curl.slice();
          arms.pose(r, pose);
          r.hand.updateMatrixWorld(true);
          dirty();
        };
        const free = (k) => depth(col, lists[k], 0.015).min >= -skin;
        const touched = [false, false, false];
        // Proximal first: each joint sweeps until its own phalanx meets the
        // surface (the end of the first free stretch of its sweep).
        for (let k = 0; k < 3; k++) {
          const from = curl[k];
          let entered = false,
            best = from,
            nearest = Infinity,
            closestAt = from;
          for (let t = from; t <= LIMIT[k] + 1e-9; t += 0.02) {
            curl[k] = t;
            apply();
            // This phalanx and the ones beyond it, which it carries.
            let d = Infinity;
            for (let j = k; j < 3; j++)
              d = Math.min(d, depth(col, lists[j], 0.03).min);
            if (d >= -skin) {
              entered = true;
              best = t;
              if (d < nearest) {
                nearest = d;
                closestAt = t;
              }
            } else if (entered) {
              touched[k] = true;
              break;
            }
          }
          // Nothing to rest on: stop where the phalanx came closest to the
          // surface rather than closing into a fist.
          curl[k] =
            touched[k] || nearest === Infinity || fallback === "limit"
              ? best
              : closestAt;
          apply();
        }
        contact[name] = touched.map(Number).join("");

        result[name] = curl.map((v) => +v.toFixed(2));
      }
      Object.defineProperty(result, "contact", {
        value: contact,
        enumerable: false,
      });
      lastContact = contact;
      return result;
    },
    contact: () => lastContact,
    /**
     * The hollow of a closed hand, as a cylinder in the hand target frame
     * (origin at the middle knuckle, axes f = forward, l = lateral, n =
     * palm): for each finger, the largest empty circle inside its slab of
     * the hand (plane normal to l); the axis runs through those centres.
     */
    graspAxis(side, pose) {
      const g = vm.rig.grips[side];
      const keep = JSON.parse(JSON.stringify(g.pose));
      Object.assign(g.pose, pose);
      settle();
      const r = arms.sides[side];
      const W = (n) =>
        arms.bones[`Bip01_${S[side]}_${n}`]
          .getWorldPosition(new T.Vector3())
          .applyMatrix4(inv);
      if (stale) refresh();
      const origin = W("Finger2");
      const f = W("Finger2").sub(W("Hand")).normalize();
      const l = W("Finger1").sub(W("Finger4"));
      l.addScaledVector(f, -l.dot(f)).normalize();
      const n =
        side === "right"
          ? new T.Vector3().crossVectors(l, f)
          : new T.Vector3().crossVectors(f, l);
      const seg = segments(side);
      const own = handCollider(side);
      const pts = [];
      for (const list of Object.values(seg))
        for (const i of list) {
          vertex(i, c).sub(origin);
          pts.push([c.dot(f), c.dot(l), c.dot(n)]);
        }
      const mcpL = (name) =>
        W("Finger" + FINGERS[name])
          .sub(origin)
          .dot(l);
      const slabs = [];
      for (const name of ["index", "middle", "ring", "pinky"]) {
        const mcp = W("Finger" + FINGERS[name])
          .sub(origin)
          .dot(l);
        const slab = pts.filter((q) => Math.abs(q[1] - mcp) < 0.006);
        let best = { r: 0 };
        // In front of the palm, under the curled fingers.
        for (let a = -0.05; a <= 0.04; a += 0.0015)
          for (let b = 0.0; b <= 0.08; b += 0.0015) {
            let m = Infinity;
            for (const q of slab)
              m = Math.min(m, Math.hypot(q[0] - a, q[2] - b));
            // Enclosed: hand surface within a band around the circle over
            // most directions (the fingers, the palm, the heel).
            const bins = new Set();
            for (const q of slab) {
              const d = Math.hypot(q[0] - a, q[2] - b);
              if (d < m + 0.012)
                bins.add(
                  Math.floor(
                    ((Math.atan2(q[2] - b, q[0] - a) + Math.PI) /
                      (2 * Math.PI)) *
                      12,
                  ),
                );
            }
            if (bins.size < 7 || m <= best.r) continue;
            // Outside the glove, not in the thickness of the palm.
            const at = c
              .copy(origin)
              .addScaledVector(f, a)
              .addScaledVector(n, b)
              .addScaledVector(l, mcpL(name));
            if (own.distance(at, 0.05) > 0)
              best = { r: m, f: a, n: b, cover: bins.size };
          }
        slabs.push({ name, l: mcp, ...best });
      }
      g.pose = keep;
      settle();
      return slabs.map((s) => ({
        ...s,
        r: +s.r.toFixed(4),
        f: +s.f?.toFixed(4),
        n: +s.n?.toFixed(4),
        l: +s.l.toFixed(4),
      }));
    },
    /**
     * Fit the rest grip of one hand around the weapon: the hand frame moves
     * (position and a small rotation) and the fingers close along a natural
     * power-grip profile, by coordinate descent on
     *   penetration² (every vertex) + gap² (nearest vertex of each phalanx)
     *   + anchors (bone -> point in the weapon frame).
     * fingers: names that must wrap; profile: curl share per joint.
     */
    fitHand(
      side,
      {
        fingers = ["middle", "ring", "pinky"],
        profile = [1, 1.1, 0.8],
        profiles = {},
        contacts = null,
        anchors = [],
        skin = 0.001,
        move = 0.004,
        turn = 0.06,
        rotate = true,
        closure = 1,
        iterations = 6,
        extra,
        // Digits whose joints move one by one instead of along the profile.
        independent = [],
      } = {},
    ) {
      settle();
      const g = vm.rig.grips[side];
      const r = arms.sides[side];
      const col = collider(side, extra || (side === "left" ? ["hand"] : []));
      const base = {
        knuckle: g.knuckle.slice(),
        forward: g.forward.slice(),
        lateral: g.lateral.slice(),
      };
      const f0 = new T.Vector3().fromArray(base.forward).normalize();
      const l0 = new T.Vector3().fromArray(base.lateral);
      l0.addScaledVector(f0, -l0.dot(f0)).normalize();
      const seg = segments(side);
      const all = [...new Set(Object.values(seg).flat())];
      const touch = contacts || [
        ...fingers
          .filter((n) => n !== "thumb")
          .flatMap((n) => [0, 1, 2].map((k) => n + k)),
        "palm",
      ];
      const pose = JSON.parse(JSON.stringify(g.pose));
      // x: [dx, dy, dz, rx, ry, rz, ...closure per finger]
      const x = [0, 0, 0, 0, 0, 0, ...fingers.map(() => closure)];
      const steps = [
        move,
        move,
        move,
        turn,
        turn,
        turn,
        ...fingers.map(() => 0.12),
      ];
      // Independent digits: one scale per joint (1 = the profile's angle).
      const joints = [];
      for (const n of independent) {
        const i = fingers.indexOf(n);
        steps[6 + i] = 0;
        (profiles[n] || profile).forEach((_, j) => {
          joints.push([i, j, x.length]);
          x.push(0);
          steps.push(0.15);
        });
      }
      if (!rotate) steps[3] = steps[4] = steps[5] = 0;
      const e = new T.Euler(),
        qq = new T.Quaternion(),
        w = new T.Vector3();
      const apply = (x) => {
        g.knuckle = base.knuckle.map((v, k) => v + x[k]);
        qq.setFromEuler(e.set(x[3], x[4], x[5]));
        g.forward = f0.clone().applyQuaternion(qq).toArray();
        g.lateral = l0.clone().applyQuaternion(qq).toArray();
        fingers.forEach(
          (n, i) =>
            (pose[n] = (profiles[n] || profile).map((v) => v * x[6 + i])),
        );
        for (const [i, j, k] of joints) {
          const range = (fingers[i] === "thumb" ? THUMB_RANGE : FINGER_RANGE)[
            j
          ];
          pose[fingers[i]][j] = Math.max(
            range[0],
            Math.min(range[1], pose[fingers[i]][j] + x[k]),
          );
        }
        g.pose = pose;
        settle();
      };
      const near = new Map();
      const energy = (x) => {
        apply(x);
        let pen = 0;
        for (const i of all) {
          const d = col.distance(vertex(i, c), 0.012);
          near.set(i, d);
          if (d < -skin) pen += (d + skin) * (d + skin);
        }
        let gap = 0;
        for (const name of touch) {
          let min = Infinity;
          for (const i of seg[name]) min = Math.min(min, near.get(i));
          // Nothing within reach: look farther on a sparse sample.
          if (min === Infinity)
            for (let k = 0; k < seg[name].length; k += 4)
              min = Math.min(min, col.distance(vertex(seg[name][k], c), 0.03));
          const m = min === Infinity ? 0.03 : Math.max(0, min);
          gap += m * m;
        }
        let anchor = 0;
        for (const a of anchors) {
          arms.bones[`Bip01_${S[side]}_${a.bone}`]
            .getWorldPosition(w)
            .applyMatrix4(inv);
          anchor += (a.weight ?? 1) * w.distanceToSquared(b.fromArray(a.at));
        }
        return pen * 400 + gap + anchor;
      };
      let best = energy(x);
      let evals = 1;
      for (let level = 0; level < iterations; level++) {
        let improved = true;
        while (improved) {
          improved = false;
          for (let k = 0; k < x.length; k++) {
            if (!steps[k]) continue;
            for (const dir of [1, -1]) {
              const y = x.slice();
              y[k] += dir * steps[k];
              if (k >= 6 && k < 6 + fingers.length)
                y[k] = Math.max(0.1, Math.min(2, y[k]));
              const v = energy(y);
              evals++;
              if (v < best - 1e-12) {
                best = v;
                x.splice(0, x.length, ...y);
                improved = true;
                break;
              }
            }
          }
        }
        for (let k = 0; k < steps.length; k++) steps[k] /= 2;
      }
      apply(x);
      const round = (a, n = 4) => a.map((v) => +v.toFixed(n));
      return {
        knuckle: round(g.knuckle),
        forward: round(g.forward),
        lateral: round(g.lateral),
        pose: Object.fromEntries(fingers.map((n) => [n, round(pose[n], 2)])),
        closure: round(x.slice(6), 3),
        energy: best,
        evals,
      };
    },
  };
}
