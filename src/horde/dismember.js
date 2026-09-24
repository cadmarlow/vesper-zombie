import * as T from "three";
import { HORDE_BONES } from "./bones.js";

// Limbs that can be torn off a horde body. Each region lists the bones it
// removes, where its wound caps sit (the surviving parent bone and the lost
// child it pointed at) and its bit in the per-zombie mask shared with peers.
// Triangles mostly driven by removed bones disappear; the remaining weights
// move to the surviving parent. Geometry is cached per source and mask, so
// every body of a pack reuses the same cut meshes.

export const LIMBS = {
  legs: {
    bit: 1,
    removed: ["calfL", "footL", "toeL", "calfR", "footR", "toeR"],
    stumps: [
      ["thighL", "calfL"],
      ["thighR", "calfR"],
    ],
  },
  forearmL: {
    bit: 2,
    removed: ["forearmL", "handL"],
    stumps: [["armL", "forearmL"]],
  },
  armL: {
    bit: 4,
    removed: ["armL", "forearmL", "handL"],
    stumps: [["clavicleL", "armL"]],
  },
  forearmR: {
    bit: 8,
    removed: ["forearmR", "handR"],
    stumps: [["armR", "forearmR"]],
  },
  armR: {
    bit: 16,
    removed: ["armR", "forearmR", "handR"],
    stumps: [["clavicleR", "armR"]],
  },
  // The lower jaw, shot away: the wound is the open mouth, lined inside.
  jaw: {
    bit: 32,
    removed: ["jaw"],
    stumps: [["head", "jaw"]],
  },
};
export const ARM_LEFT = LIMBS.forearmL.bit | LIMBS.armL.bit;
export const ARM_RIGHT = LIMBS.forearmR.bit | LIMBS.armR.bit;
export const LIMB_MASK = 63;

const removedNames = (mask) => {
  const names = new Set();
  for (const region of Object.values(LIMBS))
    if (mask & region.bit)
      for (const key of region.removed) names.add(HORDE_BONES[key]);
  return names;
};

/** Per triangle, 1 when its vertices mostly follow the removed bones. */
const flagCache = new WeakMap();
function removedTriangles(geometry, skeleton, mask) {
  let byMask = flagCache.get(geometry);
  if (!byMask) flagCache.set(geometry, (byMask = new Map()));
  if (byMask.has(mask)) return byMask.get(mask);
  const names = removedNames(mask);
  const removed = new Set(
    skeleton.bones.flatMap((b, i) => (names.has(b.name) ? [i] : [])),
  );
  const si = geometry.attributes.skinIndex,
    sw = geometry.attributes.skinWeight;
  const weight = new Float32Array(si.count);
  for (let v = 0; v < si.count; v++)
    for (let k = 0; k < 4; k++)
      if (removed.has(si.getComponent(v, k)))
        weight[v] += sw.getComponent(v, k);
  const index = geometry.index;
  const flags = new Uint8Array(index.count / 3);
  for (let t = 0; t < flags.length; t++) {
    const a = index.getX(t * 3),
      b = index.getX(t * 3 + 1),
      c = index.getX(t * 3 + 2);
    flags[t] = (weight[a] + weight[b] + weight[c]) / 3 >= 0.5 ? 1 : 0;
  }
  byMask.set(mask, flags);
  return flags;
}

const cutCache = new WeakMap();
/** The source geometry without the triangles of the limbs in `mask`. */
export function cutGeometry(geometry, skeleton, mask) {
  mask &= LIMB_MASK;
  if (!mask) return geometry;
  let byMask = cutCache.get(geometry);
  if (!byMask) cutCache.set(geometry, (byMask = new Map()));
  if (byMask.has(mask)) return byMask.get(mask);
  const flags = removedTriangles(geometry, skeleton, mask);
  const index = geometry.index;
  const kept = [];
  for (let t = 0; t < flags.length; t++)
    if (!flags[t])
      kept.push(
        index.getX(t * 3),
        index.getX(t * 3 + 1),
        index.getX(t * 3 + 2),
      );
  const result = geometry.clone();
  result.setIndex(kept);
  // Removed bones hand their remaining influence to the surviving parent.
  const bones = skeleton.bones;
  const names = removedNames(mask);
  const parentOf = new Map();
  bones.forEach((bone, i) => {
    if (!names.has(bone.name)) return;
    let parent = bone.parent;
    while (parent?.isBone && names.has(parent.name)) parent = parent.parent;
    parentOf.set(i, Math.max(0, bones.indexOf(parent)));
  });
  const joints = result.attributes.skinIndex;
  for (let v = 0; v < joints.count; v++)
    for (let k = 0; k < 4; k++) {
      const j = joints.getComponent(v, k);
      if (parentOf.has(j)) joints.setComponent(v, k, parentOf.get(j));
    }
  joints.needsUpdate = true;
  byMask.set(mask, result);
  return result;
}

const rimCache = new WeakMap();
/**
 * Open rims left by one region on a source geometry: centre and radius of
 * each wound, in the space of its surviving parent bone.
 */
export function limbRims(geometry, skeleton, key) {
  let byKey = rimCache.get(geometry);
  if (!byKey) rimCache.set(geometry, (byKey = new Map()));
  if (byKey.has(key)) return byKey.get(key);
  const region = LIMBS[key];
  const flags = removedTriangles(geometry, skeleton, region.bit);
  const index = geometry.index,
    position = geometry.attributes.position;
  const kept = new Uint8Array(position.count),
    cut = new Uint8Array(position.count);
  for (let t = 0; t < flags.length; t++)
    for (let c = 0; c < 3; c++)
      (flags[t] ? cut : kept)[index.getX(t * 3 + c)] = 1;
  const bones = skeleton.bones;
  const boneIndex = (k) => bones.findIndex((b) => b.name === HORDE_BONES[k]);
  const bind = (i) =>
    new T.Vector3().setFromMatrixPosition(
      new T.Matrix4().copy(skeleton.boneInverses[i]).invert(),
    );
  // Each rim vertex belongs to the wound of the nearest lost child joint.
  const stumps = region.stumps.map(([parent, child]) => ({
    parent: boneIndex(parent),
    child: bind(boneIndex(child)),
    points: [],
  }));
  const p = new T.Vector3();
  for (let v = 0; v < position.count; v++) {
    if (!kept[v] || !cut[v]) continue;
    p.fromBufferAttribute(position, v);
    let best = stumps[0];
    for (const s of stumps)
      if (s.child.distanceToSquared(p) < best.child.distanceToSquared(p))
        best = s;
    best.points.push(p.clone());
  }
  const rims = stumps.map((s) => {
    if (s.points.length < 4 || s.parent < 0) return null;
    const centre = s.points
      .reduce((sum, q) => sum.add(q), new T.Vector3())
      .divideScalar(s.points.length);
    const radius =
      s.points.reduce((sum, q) => sum + q.distanceTo(centre), 0) /
      s.points.length;
    return {
      local: centre.applyMatrix4(skeleton.boneInverses[s.parent]),
      radius,
    };
  });
  byKey.set(key, rims);
  return rims;
}

/**
 * Triangles a new cut removes from a body already missing `mask`, split per
 * wound (left and right lower legs are two pieces): vertex index triples.
 */
export function limbPieces(geometry, skeleton, mask, key) {
  const region = LIMBS[key];
  const before =
    mask & LIMB_MASK ? removedTriangles(geometry, skeleton, mask) : null;
  const after = removedTriangles(
    geometry,
    skeleton,
    (mask | region.bit) & LIMB_MASK,
  );
  const index = geometry.index,
    position = geometry.attributes.position;
  const bones = skeleton.bones;
  const joints = region.stumps.map(([, child]) =>
    new T.Vector3().setFromMatrixPosition(
      new T.Matrix4()
        .copy(
          skeleton.boneInverses[
            bones.findIndex((b) => b.name === HORDE_BONES[child])
          ],
        )
        .invert(),
    ),
  );
  const pieces = joints.map(() => []);
  const p = new T.Vector3();
  for (let t = 0; t < after.length; t++) {
    if (!after[t] || before?.[t]) continue;
    const a = index.getX(t * 3);
    p.fromBufferAttribute(position, a);
    let best = 0;
    for (let j = 1; j < joints.length; j++)
      if (joints[j].distanceToSquared(p) < joints[best].distanceToSquared(p))
        best = j;
    pieces[best].push(a, index.getX(t * 3 + 1), index.getX(t * 3 + 2));
  }
  return pieces;
}
