// Offline motion retargeting for the Vesper horde.
//
// Sources: CMU motion-capture BVH files, Quaternius glTF clips and Rocketbox
// Biped clips. Target: the reduced 23-joint Rocketbox Biped exported by
// blender-character.py. Retargeting works on world rotations:
//
//   G_target = G_source * inverse(G_source_reference) * G_target_reference
//
// The target reference is the target bind pose whose limb segments have been
// turned onto the source reference directions, so rest poses (A-pose, T-pose,
// splayed CMU legs) never leak into the motion.
import fs from "node:fs";
import * as T from "three";
import { BVHLoader } from "three/addons/loaders/BVHLoader.js";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

export const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

// ---------------------------------------------------------------------------
// Skeleton containers. `joints` is ordered parents-first.

function makeSkeleton(joints) {
  const byName = new Map(joints.map((j) => [j.name, j]));
  return { joints, byName, root: joints[0] };
}

function worldRest(skeleton) {
  // World rest positions/rotations from the local rest transforms.
  for (const j of skeleton.joints) {
    const pq = j.parent ? j.parent.restWorldQ : new T.Quaternion();
    const pp = j.parent ? j.parent.restWorldP : new T.Vector3();
    j.restWorldQ = pq.clone().multiply(j.restQ);
    j.restWorldP = j.restP.clone().applyQuaternion(pq).add(pp);
  }
}

/** Target skeleton from the converted character GLB (glTF, metres, Y-up). */
export async function readTargetSkeleton(file) {
  const doc = await io.read(file);
  const skin = doc.getRoot().listSkins()[0];
  const nodes = skin.listJoints();
  const set = new Set(nodes);
  const joints = [];
  const visit = (node, parent) => {
    const joint = {
      name: node.getName(),
      restP: new T.Vector3(...node.getTranslation()),
      restQ: new T.Quaternion(...node.getRotation()),
      parent,
      children: [],
    };
    parent?.children.push(joint);
    joints.push(joint);
    for (const child of node.listChildren())
      if (set.has(child)) visit(child, joint);
  };
  const roots = nodes.filter(
    (n) => !nodes.some((p) => p.listChildren().includes(n)),
  );
  // Any armature transform above the first joint must be identity; the
  // Blender conversion applies all object transforms.
  for (const r of roots) visit(r, null);
  const skeleton = makeSkeleton(joints);
  worldRest(skeleton);
  return skeleton;
}

// ---------------------------------------------------------------------------
// Sources, sampled into per-frame local rotations and a root position.

function sampleClip(skeleton, clip, fps) {
  const duration = clip.duration;
  const count = Math.max(2, Math.round(duration * fps) + 1);
  const tracks = new Map();
  for (const track of clip.tracks) {
    const dot = track.name.lastIndexOf(".");
    tracks.set(track.name, track);
    track.bone = track.name.slice(0, dot);
    track.property = track.name.slice(dot + 1);
  }
  const frames = [];
  const q = new T.Quaternion(),
    p = new T.Vector3();
  for (let f = 0; f < count; f++) {
    const t = Math.min(duration, f / fps);
    const local = new Map();
    for (const j of skeleton.joints) {
      const qt = tracks.get(`${j.name}.quaternion`);
      const pt = tracks.get(`${j.name}.position`);
      if (qt) {
        const interp = qt.createInterpolant();
        const v = interp.evaluate(t);
        q.set(v[0], v[1], v[2], v[3]).normalize();
      } else q.copy(j.restQ);
      if (pt) {
        const v = pt.createInterpolant().evaluate(t);
        p.set(v[0], v[1], v[2]);
      } else p.copy(j.restP);
      local.set(j.name, { q: q.clone(), p: p.clone() });
    }
    frames.push(local);
  }
  return { fps, frames, duration: (count - 1) / fps };
}

/** CMU BVH. The zero-rotation rest is the source reference pose. */
export function readBVH(file, fps = 30) {
  const text = fs.readFileSync(file, "utf8");
  const result = new BVHLoader().parse(text);
  const joints = [];
  const visit = (bone, parent) => {
    const joint = {
      // BVHLoader names every end site "ENDSITE"; keep them unique.
      name: bone.name === "ENDSITE" ? `${parent.name}_end` : bone.name,
      restP: bone.position.clone(),
      restQ: new T.Quaternion(),
      parent,
      children: [],
    };
    parent?.children.push(joint);
    joints.push(joint);
    for (const child of bone.children) if (child.isBone) visit(child, joint);
  };
  visit(result.skeleton.bones[0], null);
  // End sites become explicit leaf joints (BVHLoader names them ENDSITE).
  const skeleton = makeSkeleton(joints);
  worldRest(skeleton);
  const sampled = sampleClip(skeleton, result.clip, fps);
  return {
    kind: "bvh",
    skeleton,
    ...sampled,
    // Reference global rotations: identity everywhere.
    referenceFrame: null,
  };
}

/** glTF clips (Quaternius UAL, converted Rocketbox FBX). */
export async function readGLTFClips(file, fps = 30) {
  const doc = await io.read(file);
  const root = doc.getRoot();
  const skin = root.listSkins()[0];
  const nodes = skin.listJoints();
  const set = new Set(nodes);
  const joints = [];
  const nodeToJoint = new Map();
  const visit = (node, parent) => {
    const joint = {
      name: node.getName(),
      restP: new T.Vector3(...node.getTranslation()),
      restQ: new T.Quaternion(...node.getRotation()),
      parent,
      children: [],
    };
    nodeToJoint.set(node, joint);
    parent?.children.push(joint);
    joints.push(joint);
    for (const child of node.listChildren())
      if (set.has(child)) visit(child, joint);
  };
  const roots = nodes.filter(
    (n) => !nodes.some((p) => p.listChildren().includes(n)),
  );
  for (const r of roots) visit(r, null);
  // Parent transforms above the skin root (armature scale/rotation) are folded
  // into the root joint's rest so world rotations are true world rotations.
  let above = roots[0].getParentNode?.();
  const parentChain = [];
  for (const n of root.listNodes())
    if (n.listChildren().includes(roots[0])) above = n;
  while (above) {
    parentChain.unshift(above);
    let next = null;
    for (const n of root.listNodes())
      if (n.listChildren().includes(above)) next = n;
    above = next;
  }
  const armature = new T.Matrix4();
  for (const n of parentChain)
    armature.multiply(
      new T.Matrix4().compose(
        new T.Vector3(...n.getTranslation()),
        new T.Quaternion(...n.getRotation()),
        new T.Vector3(...n.getScale()),
      ),
    );
  const skeleton = makeSkeleton(joints);
  const clips = new Map();
  for (const animation of root.listAnimations()) {
    const tracks = [];
    let duration = 0;
    for (const channel of animation.listChannels()) {
      const node = channel.getTargetNode();
      const joint = nodeToJoint.get(node);
      if (!joint) continue;
      const sampler = channel.getSampler();
      const times = Array.from(sampler.getInput().getArray());
      const values = Array.from(sampler.getOutput().getArray());
      duration = Math.max(duration, times.at(-1));
      const path = channel.getTargetPath();
      if (path === "rotation")
        tracks.push(
          new T.QuaternionKeyframeTrack(
            `${joint.name}.quaternion`,
            times,
            values,
          ),
        );
      else if (path === "translation")
        tracks.push(
          new T.VectorKeyframeTrack(`${joint.name}.position`, times, values),
        );
    }
    clips.set(
      animation.getName(),
      new T.AnimationClip(animation.getName(), duration, tracks),
    );
  }
  return { kind: "gltf", skeleton, clips, armature, fps };
}

export function gltfSource(library, name, fps = 30, reference = null) {
  const clip = library.clips.get(name);
  if (!clip) throw new Error(`Missing clip ${name}`);
  const sampled = sampleClip(library.skeleton, clip, fps);
  let referenceFrame = null;
  if (reference) {
    const refClip = library.clips.get(reference);
    referenceFrame = sampleClip(library.skeleton, refClip, fps).frames[0];
  }
  return {
    kind: "gltf",
    skeleton: library.skeleton,
    armature: library.armature,
    ...sampled,
    referenceFrame,
  };
}

// ---------------------------------------------------------------------------
// Forward kinematics on a sampled frame.

function globals(skeleton, local, armature) {
  const out = new Map();
  const aq = new T.Quaternion(),
    ap = new T.Vector3(),
    as = new T.Vector3(1, 1, 1);
  if (armature) armature.decompose(ap, aq, as);
  for (const j of skeleton.joints) {
    const l = local ? local.get(j.name) : { q: j.restQ, p: j.restP };
    const parent = j.parent ? out.get(j.parent.name) : null;
    const pq = parent ? parent.q : aq;
    const pp = parent ? parent.p : ap;
    const ps = parent ? parent.s : as.x;
    const q = pq.clone().multiply(l.q);
    const p = l.p.clone().multiplyScalar(ps).applyQuaternion(pq).add(pp);
    out.set(j.name, { q, p, s: ps });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Retargeting.

/**
 * map: target joint -> { source, from, to } where the source segment
 * (from -> to, source joint names) gives the reference direction of the
 * target segment (target joint -> its `aim` child).
 */
export function buildReference(target, source, map) {
  const sourceRef = globals(
    source.skeleton,
    source.referenceFrame,
    source.armature,
  );
  // Start from the target bind pose; turn mapped segments onto the source.
  const local = new Map(
    target.joints.map((j) => [j.name, { q: j.restQ.clone(), p: j.restP }]),
  );
  for (const j of target.joints) {
    const m = map[j.name];
    if (!(m?.aim || m?.aimVector) || !m.from || !m.to) continue;
    const g = globals(target, local);
    const aimJoint = m.aim ? target.byName.get(m.aim) : true;
    // aimVector: a direction fixed to the joint, expressed in the bind world
    // frame (e.g. "head up"), for joints without a usable child.
    const current = m.aim
      ? g.get(m.aim).p.clone().sub(g.get(j.name).p).normalize()
      : new T.Vector3(...m.aimVector)
          .applyQuaternion(
            g.get(j.name).q.clone().multiply(j.restWorldQ.clone().invert()),
          )
          .normalize();
    const desired = sourceRef
      .get(m.to)
      .p.clone()
      .sub(sourceRef.get(m.from).p)
      .normalize();
    if (!aimJoint || current.lengthSq() < 1e-9 || desired.lengthSq() < 1e-9)
      continue;
    const turn = new T.Quaternion().setFromUnitVectors(current, desired);
    const world = turn.multiply(g.get(j.name).q);
    const parentWorld = j.parent ? g.get(j.parent.name).q : new T.Quaternion();
    local.get(j.name).q.copy(parentWorld.clone().invert().multiply(world));
  }
  const targetRef = globals(target, local);
  return { sourceRef, targetRef, local };
}

/**
 * Produce per-frame target local rotations and the pelvis position.
 * `hipScale` converts source root translation to target metres.
 */
export function retarget(target, source, map, options = {}) {
  const reference = buildReference(target, source, map);
  const rootName = target.joints[0].name;
  const sourceRoot = Object.entries(map).find(([t]) => t === rootName)[1]
    .source;
  const sourceRefRoot = reference.sourceRef.get(sourceRoot).p;
  const targetRefRoot = reference.targetRef.get(rootName).p;
  // Leg length in the reference pose, measured from the lowest joint.
  let sourceLow = Infinity;
  for (const g of reference.sourceRef.values())
    sourceLow = Math.min(sourceLow, g.p.y);
  const hipScale =
    options.hipScale ??
    targetRefRoot.y / Math.max(1e-6, sourceRefRoot.y - sourceLow);
  const frames = [];
  for (const local of source.frames) {
    const sg = globals(source.skeleton, local, source.armature);
    const tg = new Map();
    const out = new Map();
    for (const j of target.joints) {
      const m = map[j.name];
      const parentG = j.parent ? tg.get(j.parent.name) : new T.Quaternion();
      let world;
      if (m?.source && sg.has(m.source)) {
        const delta = sg
          .get(m.source)
          .q.clone()
          .multiply(reference.sourceRef.get(m.source).q.clone().invert());
        world = delta.multiply(reference.targetRef.get(j.name).q);
      } else {
        // Unmapped joints keep their reference local rotation.
        world = parentG.clone().multiply(reference.local.get(j.name).q);
      }
      tg.set(j.name, world);
      out.set(j.name, parentG.clone().invert().multiply(world));
    }
    const root = sg
      .get(sourceRoot)
      .p.clone()
      .sub(new T.Vector3(0, options.sourceFloor ?? 0, 0))
      .multiplyScalar(hipScale);
    if (options.rootOffsetY) root.y += options.rootOffsetY;
    frames.push({ rotations: out, root });
  }
  return { fps: source.fps, frames, hipScale, rootName };
}

// ---------------------------------------------------------------------------
// Clip editing.

export function sliceFrames(clip, start, end) {
  const f0 = Math.max(0, Math.round(start * clip.fps));
  const f1 = Math.min(
    clip.frames.length - 1,
    end === undefined ? clip.frames.length - 1 : Math.round(end * clip.fps),
  );
  return { ...clip, frames: clip.frames.slice(f0, f1 + 1) };
}

function yawOf(q) {
  const f = new T.Vector3(0, 0, 1).applyQuaternion(q);
  return Math.atan2(f.x, f.z);
}

/** Rotate/translate the whole clip so it starts at the origin facing +Z. */
export function alignStart(clip, target, { heading, keepY = true } = {}) {
  const rootName = clip.rootName;
  const first = clip.frames[0];
  const yaw =
    heading ??
    yawOf(
      first.rotations
        .get(rootName)
        .clone()
        .multiply(target.byName.get(rootName).restQ.clone().invert()),
    );
  const turn = new T.Quaternion().setFromAxisAngle(
    new T.Vector3(0, 1, 0),
    -yaw,
  );
  const origin = first.root.clone();
  for (const f of clip.frames) {
    f.root.sub(origin);
    if (keepY) f.root.y += origin.y;
    f.root.applyQuaternion(turn);
    f.rotations.set(rootName, turn.clone().multiply(f.rotations.get(rootName)));
  }
  return clip;
}

/** Remove the average root displacement (in-place loop) and return speed. */
export function makeInPlace(clip) {
  const n = clip.frames.length;
  const a = clip.frames[0].root.clone(),
    b = clip.frames[n - 1].root.clone();
  const travel = new T.Vector3(b.x - a.x, 0, b.z - a.z);
  const duration = (n - 1) / clip.fps;
  const heading = Math.atan2(travel.x, travel.z);
  // Face the travel direction (+Z), then subtract the linear drift.
  const turn = new T.Quaternion().setFromAxisAngle(
    new T.Vector3(0, 1, 0),
    -heading,
  );
  const rootName = clip.rootName;
  for (let i = 0; i < n; i++) {
    const f = clip.frames[i];
    f.root.sub(a).applyQuaternion(turn);
    f.root.y += a.y;
    const t = i / (n - 1);
    f.root.z -= travel.length() * t;
    f.rotations.set(rootName, turn.clone().multiply(f.rotations.get(rootName)));
  }
  clip.speed = travel.length() / duration;
  return clip;
}

/** Remove the linear horizontal drift of a stationary loop (idles). */
export function removeDrift(clip) {
  const n = clip.frames.length;
  const a = clip.frames[0].root,
    b = clip.frames[n - 1].root;
  const dx = b.x - a.x,
    dz = b.z - a.z;
  const x0 = a.x,
    z0 = a.z;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    clip.frames[i].root.x -= x0 + dx * t;
    clip.frames[i].root.z -= z0 + dz * t;
  }
  return clip;
}

/** Shift the clip horizontally so its last frame stands on the origin. */
export function anchorEnd(clip) {
  const end = clip.frames[clip.frames.length - 1].root;
  const x = end.x,
    z = end.z;
  for (const f of clip.frames) {
    f.root.x -= x;
    f.root.z -= z;
  }
  return clip;
}

/** Spread the pose mismatch between the last and first frame over the loop. */
export function closeLoop(clip, blendFrames = 0) {
  const n = clip.frames.length;
  const first = clip.frames[0],
    last = clip.frames[n - 1];
  const names = [...first.rotations.keys()];
  const corrections = new Map();
  for (const name of names) {
    const a = first.rotations.get(name),
      b = last.rotations.get(name);
    // Correction that maps b onto a (local space).
    corrections.set(name, a.clone().multiply(b.clone().invert()));
  }
  const rootDelta = first.root.clone().sub(last.root);
  rootDelta.z = 0; // forward drift was already removed by makeInPlace
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const f = clip.frames[i];
    for (const name of names) {
      const c = new T.Quaternion().slerp(corrections.get(name), t);
      f.rotations.set(name, c.multiply(f.rotations.get(name)).normalize());
    }
    f.root.addScaledVector(rootDelta, t);
  }
  return clip;
}

/** Light temporal smoothing against capture jitter (odd window). */
export function smooth(clip, radius = 1, { loop = false } = {}) {
  if (radius < 1) return clip;
  const n = clip.frames.length;
  const names = [...clip.frames[0].rotations.keys()];
  const src = clip.frames.map((f) => ({
    rotations: new Map([...f.rotations].map(([k, q]) => [k, q.clone()])),
    root: f.root.clone(),
  }));
  for (let i = 0; i < n; i++) {
    for (const name of names) {
      const acc = new T.Quaternion(0, 0, 0, 0);
      const ref = src[i].rotations.get(name);
      let weight = 0;
      for (let k = -radius; k <= radius; k++) {
        let j = i + k;
        if (loop) j = (j + n - 1) % (n - 1);
        else j = Math.max(0, Math.min(n - 1, j));
        const q = src[j].rotations.get(name);
        const w = 1 - Math.abs(k) / (radius + 1);
        const s = ref.dot(q) < 0 ? -w : w;
        acc.x += q.x * s;
        acc.y += q.y * s;
        acc.z += q.z * s;
        acc.w += q.w * s;
        weight += w;
      }
      clip.frames[i].rotations.set(name, acc.normalize());
    }
  }
  return clip;
}

/** Pose distance used to find loop points (hips-relative, rotation based). */
export function poseDistance(a, b, weights) {
  let d = 0;
  for (const [name, w] of weights) {
    const qa = a.rotations.get(name),
      qb = b.rotations.get(name);
    const dot = Math.min(1, Math.abs(qa.dot(qb)));
    d += w * 2 * Math.acos(dot);
  }
  d += Math.abs(a.root.y - b.root.y) * 4;
  return d;
}

/** Search the best loop of roughly `cycles` gait cycles inside [start, end]. */
export function findLoop(
  clip,
  { start = 0, end, min = 0.7, max = 2.6, weights },
) {
  const fps = clip.fps;
  const f0 = Math.round(start * fps);
  const f1 = Math.min(
    clip.frames.length - 1,
    end === undefined ? clip.frames.length - 1 : Math.round(end * fps),
  );
  let best = null;
  for (let a = f0; a < f1; a++)
    for (
      let b = a + Math.round(min * fps);
      b <= Math.min(f1, a + Math.round(max * fps));
      b++
    ) {
      const d =
        poseDistance(clip.frames[a], clip.frames[b], weights) +
        // velocity continuity
        0.5 *
          poseDistance(
            clip.frames[Math.min(a + 1, f1)],
            clip.frames[Math.min(b + 1, f1)],
            weights,
          ) -
        // mild preference for longer loops (more variety per loop)
        (0.02 * (b - a)) / fps;
      if (!best || d < best.d) best = { a, b, d };
    }
  return { start: best.a / fps, end: best.b / fps, score: best.d };
}

// ---------------------------------------------------------------------------
// Output.

/** Write an animation-only glTF (skeleton nodes + clips). */
export async function writeLibrary(target, clips, file, extras = {}) {
  const { Document } = await import("@gltf-transform/core");
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene("horde-animations");
  const nodes = new Map();
  for (const j of target.joints) {
    const node = doc
      .createNode(j.name)
      .setTranslation(j.restP.toArray())
      .setRotation(j.restQ.toArray());
    nodes.set(j.name, node);
    if (j.parent) nodes.get(j.parent.name).addChild(node);
    else scene.addChild(node);
  }
  for (const clip of clips) {
    const animation = doc.createAnimation(clip.name);
    animation.setExtras({ ...(clip.extras || {}) });
    const n = clip.frames.length;
    const times = new Float32Array(n);
    for (let i = 0; i < n; i++) times[i] = i / clip.fps;
    const input = doc
      .createAccessor()
      .setType("SCALAR")
      .setArray(times)
      .setBuffer(buffer);
    for (const j of target.joints) {
      const values = new Float32Array(n * 4);
      let previous = null;
      for (let i = 0; i < n; i++) {
        const q = clip.frames[i].rotations.get(j.name).clone();
        if (previous && previous.dot(q) < 0) q.set(-q.x, -q.y, -q.z, -q.w);
        previous = q;
        values.set([q.x, q.y, q.z, q.w], i * 4);
      }
      const output = doc
        .createAccessor()
        .setType("VEC4")
        .setArray(values)
        .setBuffer(buffer);
      const sampler = doc
        .createAnimationSampler()
        .setInput(input)
        .setOutput(output)
        .setInterpolation("LINEAR");
      animation
        .addSampler(sampler)
        .addChannel(
          doc
            .createAnimationChannel()
            .setTargetNode(nodes.get(j.name))
            .setTargetPath("rotation")
            .setSampler(sampler),
        );
    }
    const root = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) root.set(clip.frames[i].root.toArray(), i * 3);
    const output = doc
      .createAccessor()
      .setType("VEC3")
      .setArray(root)
      .setBuffer(buffer);
    const sampler = doc
      .createAnimationSampler()
      .setInput(input)
      .setOutput(output)
      .setInterpolation("LINEAR");
    animation
      .addSampler(sampler)
      .addChannel(
        doc
          .createAnimationChannel()
          .setTargetNode(nodes.get(target.joints[0].name))
          .setTargetPath("translation")
          .setSampler(sampler),
      );
  }
  doc.getRoot().setExtras(extras);
  await io.write(file, doc);
  return doc;
}
