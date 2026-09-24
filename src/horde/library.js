import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { ENEMIES } from "../content/enemies.js";
import {
  HORDE_ANIMATIONS,
  HORDE_CAST,
  HORDE_EYES,
  hordePackUrl,
  hordeRandom,
} from "../content/horde.js";
import {
  addWound,
  instanceMaterial,
  prepareHordeMaterial,
} from "./material.js";
import { headlessGeometry } from "../creature-headless.js";
import { HORDE_BONES } from "./bones.js";
import { LIMBS, cutGeometry, limbPieces, limbRims } from "./dismember.js";

// Loads the shared clip library and the character packs, builds one template
// per character and detail level, and clones light instances from them.
// Geometry, textures and clips are shared; bones, poses, mixers and material
// uniforms belong to each zombie.

const DETAILS = ["full", "lite", "far"];
// Pelvis height of the body the clips were retargeted to (civilian-08).
const REFERENCE_HIP = 0.8952;
const state = {
  clips: null,
  clipInfo: new Map(),
  packs: new Map(), // key -> pack
  pending: new Map(),
  profile: null,
  loaded: false,
};
const loader = new GLTFLoader();

export { HORDE_BONES };

async function fetchGLTF(url, timeout) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
    const bytes = await response.arrayBuffer();
    return await loader.parseAsync(
      bytes,
      url.slice(0, url.lastIndexOf("/") + 1),
    );
  } finally {
    clearTimeout(timer);
  }
}

async function loadClips(mobile) {
  if (state.clips) return;
  const gltf = await fetchGLTF(HORDE_ANIMATIONS, mobile ? 45000 : 30000);
  state.clips = new Map();
  const extras = gltf.parser.json.animations || [];
  gltf.animations.forEach((clip, i) => {
    const info = extras[i]?.extras || {};
    state.clips.set(clip.name, clip);
    state.clipInfo.set(clip.name, {
      loop: !!info.loop,
      speed: info.speed || 0,
      contact: info.contact ?? 0.4,
      death: !!info.death,
      emergeFrom: info.emergeFrom,
      steps: info.steps || [],
      duration: clip.duration,
    });
  });
  // Additive variants of the flinches, layered over any other motion.
  for (const name of ["hit_chest", "hit_head"]) {
    const clip = state.clips.get(name);
    if (!clip) continue;
    const additive = clip.clone();
    additive.name = `${name}+`;
    T.AnimationUtils.makeClipAdditive(additive, 0, clip, 30);
    state.clips.set(additive.name, additive);
    state.clipInfo.set(additive.name, { ...state.clipInfo.get(name) });
  }
}

/** Bone-local centre of the vertices a bone (set) mostly drives. */
function volumeCentre(mesh, boneNames) {
  const skeleton = mesh.skeleton;
  const indices = boneNames
    .map((n) => skeleton.bones.findIndex((b) => b.name === n))
    .filter((i) => i >= 0);
  const g = mesh.geometry;
  const pos = g.attributes.position,
    si = g.attributes.skinIndex,
    sw = g.attributes.skinWeight;
  const sum = new T.Vector3(),
    p = new T.Vector3();
  let count = 0;
  const min = new T.Vector3(Infinity, Infinity, Infinity),
    max = new T.Vector3(-Infinity, -Infinity, -Infinity);
  for (let i = 0; i < pos.count; i++) {
    let w = 0;
    for (let k = 0; k < 4; k++)
      if (indices.includes(si.getComponent(i, k))) w += sw.getComponent(i, k);
    if (w < 0.6) continue;
    p.fromBufferAttribute(pos, i);
    sum.add(p);
    min.min(p);
    max.max(p);
    count++;
  }
  if (!count) return null;
  sum.divideScalar(count);
  // Bind space -> bone space of the first bone.
  const boneInverse = skeleton.boneInverses[indices[0]];
  const local = sum.clone().applyMatrix4(boneInverse);
  const size = max.clone().sub(min);
  return { bone: skeleton.bones[indices[0]].name, local, size, bind: sum };
}

/**
 * Heel and toe-tip points of each sole, in foot / toe bone space: the lowest
 * bind vertices mostly driven by that foot, furthest back and forward.
 */
function solePoints(mesh) {
  const skeleton = mesh.skeleton;
  const g = mesh.geometry;
  const pos = g.attributes.position,
    si = g.attributes.skinIndex,
    sw = g.attributes.skinWeight;
  const index = (name) => skeleton.bones.findIndex((b) => b.name === name);
  const p = new T.Vector3();
  return ["L", "R"].map((side) => {
    const foot = index(HORDE_BONES[`foot${side}`]),
      toe = index(HORDE_BONES[`toe${side}`]);
    let heel = null,
      tip = null;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) > 0.035) continue;
      let w = 0;
      for (let k = 0; k < 4; k++) {
        const j = si.getComponent(i, k);
        if (j === foot || j === toe) w += sw.getComponent(i, k);
      }
      if (w < 0.5) continue;
      p.fromBufferAttribute(pos, i);
      if (!heel || p.z < heel.z) heel = p.clone();
      if (!tip || p.z > tip.z) tip = p.clone();
    }
    if (!heel || foot < 0 || toe < 0) return null;
    // Height of the ball (toe joint) above the floor in the bind pose.
    const ball = new T.Matrix4().copy(skeleton.boneInverses[toe]).invert()
      .elements[13];
    return {
      heel: heel.applyMatrix4(skeleton.boneInverses[foot]),
      tip: tip.applyMatrix4(skeleton.boneInverses[toe]),
      ball,
    };
  });
}

/** Centre, normal and radius of the neck cut, in neck-bone space. */
function neckRim(mesh, cut) {
  const skeleton = mesh.skeleton;
  const neck = skeleton.bones.findIndex((b) => b.name === HORDE_BONES.neck);
  if (neck < 0) return null;
  const pos = mesh.geometry.attributes.position;
  const p = new T.Vector3(),
    centre = new T.Vector3();
  const rim = [];
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    if (Math.abs(p.y - cut) < 0.012) rim.push(p.clone());
  }
  if (rim.length < 6) return null;
  // Median-ish centre: the average of the ring (hair and collars excluded by
  // keeping the points nearest the neck axis).
  const axis = new T.Vector3().setFromMatrixPosition(
    new T.Matrix4().copy(skeleton.boneInverses[neck]).invert(),
  );
  rim.sort(
    (a, b) =>
      Math.hypot(a.x - axis.x, a.z - axis.z) -
      Math.hypot(b.x - axis.x, b.z - axis.z),
  );
  const ring = rim.slice(0, Math.max(6, Math.floor(rim.length * 0.6)));
  for (const q of ring) centre.add(q);
  centre.divideScalar(ring.length);
  centre.y = cut;
  const radius =
    ring.reduce(
      (sum, q) => sum + Math.hypot(q.x - centre.x, q.z - centre.z),
      0,
    ) / ring.length;
  const inverse = skeleton.boneInverses[neck];
  return {
    local: centre.applyMatrix4(inverse),
    normal: new T.Vector3(0, 1, 0).transformDirection(inverse),
    radius,
  };
}

function preparePack(gltf, id, mobile) {
  const meta = gltf.parser.json.extras?.vesperHorde || {};
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const levels = new Map();
  scene.traverse((o) => {
    if (o.userData?.vesperDetail) levels.set(o.userData.vesperDetail, o);
  });
  let bodyMaterial = null,
    hairMaterial = null;
  scene.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    // Animated bounds include lunges and deaths without per-frame work.
    o.geometry.boundingSphere = new T.Sphere(new T.Vector3(0, 0.9, 0), 1.6);
    o.frustumCulled = true;
    if (o.material.name === "zombie") {
      if (!bodyMaterial)
        bodyMaterial = prepareHordeMaterial(o.material, { mobile });
      o.material = bodyMaterial;
      o.name = "horde-body";
    } else {
      if (!hairMaterial) {
        hairMaterial = o.material;
        hairMaterial.alphaToCoverage = false;
      }
      o.material = hairMaterial;
      o.name = "horde-hair";
    }
    for (const value of Object.values(o.material))
      if (value?.isTexture) {
        value.userData.sharedSurface = true;
        value.anisotropy = mobile ? 2 : 8;
      }
  });
  // Hit volumes and landmarks from the highest available level.
  const reference = [...levels.values()][0];
  let body = null;
  reference.traverse((o) => {
    if (o.isSkinnedMesh && o.name === "horde-body") body = o;
  });
  const head = volumeCentre(body, [HORDE_BONES.head, HORDE_BONES.jaw]);
  const chest = volumeCentre(body, [HORDE_BONES.chest, HORDE_BONES.spine1]);
  const pelvis = volumeCentre(body, [HORDE_BONES.pelvis, HORDE_BONES.spine]);
  const soles = solePoints(body);
  const neckBone = body.skeleton.bones.find((b) => b.name === HORDE_BONES.neck);
  const headBone = body.skeleton.bones.find((b) => b.name === HORDE_BONES.head);
  const neckY = new T.Vector3().setFromMatrixPosition(neckBone.matrixWorld).y;
  const headY = new T.Vector3().setFromMatrixPosition(headBone.matrixWorld).y;
  const neckCut = T.MathUtils.lerp(neckY, headY, 0.55);
  const neckStump = neckRim(body, neckCut);
  // Eye glow anchors in head-bone space, slightly in front of the eyeballs.
  const headIndex = body.skeleton.bones.findIndex(
    (b) => b.name === HORDE_BONES.head,
  );
  const eyes = ["eyeL", "eyeR"]
    .map((k) => meta.landmarks?.[k])
    .filter(Boolean)
    .map((p) =>
      new T.Vector3(p[0], p[1], p[2] + 0.012).applyMatrix4(
        body.skeleton.boneInverses[headIndex],
      ),
    );
  const hitParts = [
    { bone: head.bone, offset: head.local, radius: 0.15, head: true },
    { bone: chest.bone, offset: chest.local, radius: 0.28, head: false },
    { bone: pelvis.bone, offset: pelvis.local, radius: 0.24, head: false },
  ];
  // Legs: shots there cripple (see game/crawlers.js).
  for (const side of ["L", "R"])
    for (const [key, radius, lower] of [
      ["thigh", 0.13, false],
      ["calf", 0.1, true],
    ]) {
      const part = volumeCentre(body, [HORDE_BONES[`${key}${side}`]]);
      if (part)
        hitParts.push({
          bone: part.bone,
          offset: part.local,
          radius,
          head: false,
          leg: true,
          lower,
        });
    }
  // Arms: enough damage tears them off at the elbow or the shoulder.
  for (const side of ["L", "R"])
    for (const [key, radius, lower] of [
      ["arm", 0.075, false],
      ["forearm", 0.065, true],
    ]) {
      const part = volumeCentre(body, [HORDE_BONES[`${key}${side}`]]);
      if (part)
        hitParts.push({
          bone: part.bone,
          offset: part.local,
          radius,
          head: false,
          arm: side,
          lower,
        });
    }
  const templates = new Map();
  for (const detail of DETAILS) {
    const selected = levels.has(detail)
      ? detail
      : levels.has("lite")
        ? "lite"
        : [...levels.keys()][0];
    const template = cloneSkinned(scene);
    template.traverse((o) => {
      if (o.userData?.vesperDetail && o.userData.vesperDetail !== selected)
        o.visible = false;
    });
    for (const child of [...template.children])
      if (
        child.userData?.vesperDetail &&
        child.userData.vesperDetail !== selected
      )
        template.remove(child);
    template.userData = { hordePack: id, detail };
    templates.set(detail, template);
  }
  // Geometry per level and part for LOD swaps on live instances.
  const geometries = new Map();
  for (const [detail, node] of levels) {
    const parts = {};
    node.traverse((o) => {
      if (o.isSkinnedMesh) parts[o.name] = o.geometry;
    });
    geometries.set(detail, parts);
  }
  return {
    id,
    meta,
    templates,
    geometries,
    hitParts,
    eyes,
    soles,
    neckCut,
    neckStump,
    hipHeight: meta.hipHeight || 0.9,
    landmarks: meta.landmarks || {},
    bodyMaterial,
    hairMaterial,
  };
}

/**
 * Load the clip library and every character pack behind the loading screen.
 * A pack that fails keeps the other bodies of its type; a type without any
 * body keeps the procedural fallback. Nothing here blocks a run on error.
 */
export async function prepareHorde(mobile = false) {
  const profile = mobile ? "mobile" : "desktop";
  try {
    await loadClips(mobile);
  } catch (error) {
    console.warn(
      "Horde animations unavailable, procedural zombies kept",
      error,
    );
    return false;
  }
  const ids = [...new Set(Object.values(HORDE_CAST).flat())];
  await Promise.all(
    ids.map(async (id) => {
      const key = `${profile}:${id}`;
      if (state.packs.has(key)) return;
      if (!state.pending.has(key))
        state.pending.set(
          key,
          fetchGLTF(hordePackUrl(id, mobile), mobile ? 60000 : 40000)
            .then((gltf) => state.packs.set(key, preparePack(gltf, id, mobile)))
            .catch((error) =>
              console.warn(`Horde body ${id} unavailable`, error),
            )
            .finally(() => state.pending.delete(key)),
        );
      await state.pending.get(key);
    }),
  );
  state.profile = profile;
  state.loaded = true;
  return true;
}

function castFor(type) {
  const ids = HORDE_CAST[type] || HORDE_CAST[ENEMIES[type]?.look] || [];
  return ids
    .map((id) => state.packs.get(`${state.profile}:${id}`))
    .filter(Boolean);
}

export const hordeReady = (type) => !!state.clips && castFor(type).length > 0;

/** Every texture of the loaded bodies (uploaded behind the loading screen). */
export function hordeTextures() {
  const textures = new Set();
  for (const [key, pack] of state.packs) {
    if (!key.startsWith(`${state.profile}:`)) continue;
    for (const material of [pack.bodyMaterial, pack.hairMaterial])
      for (const value of Object.values(material || {}))
        if (value?.isTexture) textures.add(value);
  }
  return [...textures];
}
export const hordeClip = (name) => state.clips?.get(name);

/**
 * The clip adapted to one body: rotations are shared, the pelvis translation
 * is scaled by the body's leg length so feet meet the floor on every avatar.
 */
export function hordeClipFor(pack, name) {
  const base = state.clips?.get(name);
  if (!base || !pack) return base;
  const ratio = pack.hipHeight / REFERENCE_HIP;
  if (Math.abs(ratio - 1) < 0.004) return base;
  const cache = (pack.clips ||= new Map());
  if (!cache.has(name)) {
    const tracks = base.tracks.map((track) => {
      if (!track.name.startsWith(`${HORDE_BONES.pelvis}.position`))
        return track;
      const values = track.values.slice();
      for (let i = 0; i < values.length; i++) values[i] *= ratio;
      return new T.VectorKeyframeTrack(track.name, track.times, values);
    });
    const clip = new T.AnimationClip(
      base.name,
      base.duration,
      tracks,
      base.blendMode,
    );
    cache.set(name, clip);
  }
  return cache.get(name);
}
export const hordeClipInfo = (name) => state.clipInfo.get(name);
export const hordeClips = () => state.clips;

const woundAt = new T.Vector3(),
  woundDir = new T.Vector3();
/**
 * Every body arrives with bite and bullet holes of its own (deterministic
 * per network id): points of the torso and arms, pierced along the normal.
 */
function oldWounds(mesh, seed) {
  const g = mesh.geometry;
  const position = g.attributes.position,
    normal = g.attributes.normal;
  if (!normal) return;
  const count = 1 + Math.floor(hordeRandom(seed, 16) * 3);
  for (let i = 0, tries = 0; i < count && tries < 40; tries++) {
    const v = Math.floor(hordeRandom(seed, 100 + tries) * position.count);
    woundAt.fromBufferAttribute(position, v);
    if (woundAt.y < 0.95 || woundAt.y > 1.5) continue;
    woundDir.fromBufferAttribute(normal, v).negate().normalize();
    addWound(
      mesh.material,
      woundAt,
      woundDir,
      0.02 + hordeRandom(seed, 140 + i) * 0.022,
    );
    i++;
  }
}

/** A new zombie body for a network id (deterministic choice of body). */
export function hordeModel(type, detail = "full", seed = 0) {
  const cast = castFor(type);
  if (!cast.length || !state.clips) return null;
  const pack = cast[Math.floor(hordeRandom(seed, 11) * cast.length)];
  const template = pack.templates.get(detail) || pack.templates.get("lite");
  const model = cloneSkinned(template);
  const definition = ENEMIES[type];
  const body = [];
  let skeleton = null;
  model.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    baseOf.set(o, o.geometry);
    if (!skeleton) skeleton = o.skeleton;
    else o.skeleton = skeleton;
    if (o.name === "horde-body") {
      o.material = instanceMaterial(pack.bodyMaterial);
      body.push(o);
    }
  });
  const variation = hordeRandom(seed, 12);
  const scale = definition.scale * (0.95 + hordeRandom(seed, 13) * 0.1);
  model.scale.setScalar(scale);
  const uniforms = body[0]?.material.userData.hordeUniforms;
  if (uniforms) {
    // Skin/cloth variation, fresh blood and the type's eye glow.
    const warm = hordeRandom(seed, 14) - 0.5;
    uniforms.hordeTint.value.setRGB(
      0.92 + warm * 0.12,
      0.93,
      0.92 - warm * 0.1,
    );
    uniforms.hordeBlood.value = 0.15 + hordeRandom(seed, 15) * 0.45;
    const eye = HORDE_EYES[type] || HORDE_EYES.walker;
    const glow = definition.boss ? 5 : 3.2;
    uniforms.hordeEye.value.setRGB(eye[0] * glow, eye[1] * glow, eye[2] * glow);
    oldWounds(body[0], seed);
  }
  const bone = (key) => model.getObjectByName(HORDE_BONES[key]);
  model.userData = {
    horde: {
      seed,
      pack,
      body,
      skeleton,
      bones: Object.fromEntries(
        Object.keys(HORDE_BONES).map((k) => [k, bone(k)]),
      ),
    },
    type,
    look: definition.look || type,
    variation,
    detail,
    lite: detail !== "full",
    headDestroyed: false,
    cuts: 0,
    hitParts: pack.hitParts,
    head: bone("head"),
    neck: bone("neck"),
    torso: bone("chest"),
    spine: bone("spine1"),
    hips: bone("pelvis"),
    jaw: bone("jaw"),
    jawLimit: 0.5,
    // Same limb description as the procedural rig, for shared tooling.
    shoulders: [bone("clavicleL"), bone("clavicleR")],
    arms: [bone("armL"), bone("armR")],
    elbows: [bone("forearmL"), bone("forearmR")],
    wrists: [bone("handL"), bone("handR")],
    legs: ["L", "R"].map((s) => ({
      root: bone(`thigh${s}`),
      shin: bone(`calf${s}`),
      foot: bone(`foot${s}`),
      toe: bone(`toe${s}`),
    })),
  };
  return model;
}

// The uncut geometry each mesh currently draws from (its detail level).
// Kept apart from userData, which Three.js serialises when cloning.
const baseOf = new WeakMap();

/** Geometry for the current state: level, destroyed head, lost limbs. */
function applyCuts(model) {
  const data = model.userData;
  const pack = data.horde.pack;
  model.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const base = baseOf.get(o) || o.geometry;
    let geometry = data.headDestroyed
      ? headlessFor(pack, base, o.skeleton)
      : base;
    if (data.cuts && o.name === "horde-body")
      geometry = cutGeometry(geometry, o.skeleton, data.cuts);
    o.geometry = geometry;
  });
}

/** LOD swap on a live instance: geometry only, skeleton and pose kept. */
export function setHordeDetail(model, detail, castShadow = true) {
  const data = model.userData;
  const horde = data.horde;
  if (data.detail !== detail) {
    const parts =
      horde.pack.geometries.get(detail) ||
      horde.pack.geometries.get("lite") ||
      [...horde.pack.geometries.values()][0];
    model.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      const geometry = parts[o.name];
      o.visible =
        !!geometry && !(o.name === "horde-hair" && data.headDestroyed);
      if (geometry) baseOf.set(o, geometry);
    });
    applyCuts(model);
    data.detail = detail;
    data.lite = detail !== "full";
  }
  model.traverse((o) => {
    if (o.isSkinnedMesh) o.castShadow = castShadow && o.name === "horde-body";
  });
}

const headless = new WeakMap();
function headlessFor(pack, geometry, skeleton) {
  if (headless.has(geometry)) return headless.get(geometry);
  const result = headlessGeometry(geometry, skeleton, pack.neckCut, {
    removed: [HORDE_BONES.head, HORDE_BONES.jaw],
    neck: HORDE_BONES.neck,
  });
  headless.set(geometry, result);
  return result;
}

let stumpGeometry, stumpMaterial, boneGeometry, boneMaterial;
function woundMaterials() {
  stumpGeometry ||= new T.SphereGeometry(1, 12, 8);
  stumpMaterial ||= new T.MeshStandardMaterial({
    color: 0x330605,
    roughness: 0.5,
    metalness: 0,
  });
  boneGeometry ||= new T.CylinderGeometry(0.014, 0.02, 0.09, 6);
  boneMaterial ||= new T.MeshStandardMaterial({
    color: 0xcbbfa6,
    roughness: 0.55,
    metalness: 0,
  });
}
const stumpAxis = new T.Vector3(),
  stumpUp = new T.Vector3(0, 1, 0),
  rimWorld = new T.Vector3(),
  childWorld = new T.Vector3();

/** Raw flesh closing a torn end, with the bone poking out of it. */
export function hordeWound(radius, small = false) {
  woundMaterials();
  const cap = new T.Mesh(stumpGeometry, stumpMaterial);
  cap.name = "limb-stump";
  cap.scale.set(radius, radius * 0.7, radius);
  cap.castShadow = true;
  const stub = new T.Mesh(boneGeometry, boneMaterial);
  stub.name = "limb-stump-bone";
  stub.position.set(0, (radius * 0.75) / (radius * 0.7), 0);
  stub.scale.set(
    (small ? 0.75 : 1) / radius,
    (small ? 0.75 : 1) / (radius * 0.7),
    (small ? 0.75 : 1) / radius,
  );
  cap.add(stub);
  return cap;
}

export function destroyHordeHead(model) {
  const data = model.userData;
  if (data.headDestroyed) return false;
  data.headDestroyed = true;
  model.traverse((o) => {
    if (o.isSkinnedMesh && o.name === "horde-hair") o.visible = false;
  });
  applyCuts(model);
  // The open neck: raw flesh and the stub of the spine.
  const rim = data.horde.pack.neckStump;
  const neck = data.horde.bones.neck;
  if (rim && neck) {
    woundMaterials();
    const radius = Math.min(0.08, Math.max(0.035, rim.radius));
    const cap = new T.Mesh(stumpGeometry, stumpMaterial);
    cap.name = "neck-wound";
    cap.quaternion.setFromUnitVectors(stumpUp, rim.normal);
    cap.position.copy(rim.local).addScaledVector(rim.normal, -radius * 0.4);
    cap.scale.set(radius, radius * 0.35, radius);
    const spine = new T.Mesh(boneGeometry, boneMaterial);
    spine.name = "neck-wound-bone";
    spine.quaternion.copy(cap.quaternion);
    spine.position.copy(rim.local).addScaledVector(rim.normal, 0.012);
    spine.scale.setScalar(0.8);
    neck.add(cap, spine);
  }
  return true;
}

/**
 * Tear a limb region (see LIMBS) off a body. `onPieces(mesh, pieces, ends)`
 * receives the lost triangles while they still follow the limb, so they can
 * be thrown, with the world centre, direction and radius of each torn end.
 * Then the cut and the wound caps apply. False when nothing is left to tear.
 */
export function hordeSever(model, key, onPieces = null) {
  const data = model.userData;
  const region = LIMBS[key];
  if (!data.horde || !region) return false;
  const mask = data.cuts || 0;
  if (mask & region.bit) return false;
  if (key === "forearmL" && mask & LIMBS.armL.bit) return false;
  if (key === "forearmR" && mask & LIMBS.armR.bit) return false;
  const horde = data.horde;
  const body = horde.body?.[0];
  const source = body
    ? data.headDestroyed
      ? headlessFor(
          horde.pack,
          baseOf.get(body) || body.geometry,
          body.skeleton,
        )
      : baseOf.get(body) || body.geometry
    : null;
  const rims = body
    ? limbRims(baseOf.get(body) || body.geometry, body.skeleton, key)
    : [];
  if (body && onPieces) {
    model.updateMatrixWorld(true);
    const ends = region.stumps.map(([parentKey, childKey], i) => {
      const parent = horde.bones[parentKey],
        child = horde.bones[childKey];
      if (!parent || !child) return null;
      const local =
        rims[i]?.local || child.position.clone().multiplyScalar(0.93);
      rimWorld.copy(local).applyMatrix4(parent.matrixWorld);
      child.getWorldPosition(childWorld);
      return {
        position: rimWorld.clone(),
        direction: childWorld.clone().sub(rimWorld).normalize(),
        radius: Math.max(0.03, rims[i]?.radius || 0.05) * model.scale.y,
      };
    });
    onPieces(body, limbPieces(source, body.skeleton, mask, key), ends);
  }
  data.cuts = mask | region.bit;
  if (key === "legs") data.legsLost = true;
  applyCuts(model);
  // Wounds left on bones this cut takes away go with them.
  for (const k of region.removed) {
    const bone = horde.bones[k];
    for (const child of [...(bone?.children || [])])
      if (child.name === "limb-stump") bone.remove(child);
  }
  if (key === "jaw") {
    // Flesh lining the skull, seen through the torn mouth.
    const head = horde.bones.head;
    const volume = horde.pack?.hitParts.find((p) => p.head);
    if (head && volume) {
      woundMaterials();
      const inner = new T.Mesh(stumpGeometry, stumpMaterial);
      inner.name = "jaw-wound";
      inner.position.copy(volume.offset);
      inner.scale.setScalar(0.068);
      head.add(inner);
    }
    return true;
  }
  region.stumps.forEach(([parentKey, childKey], i) => {
    const parent = horde.bones[parentKey],
      child = horde.bones[childKey];
    if (!parent || !child) return;
    // In the parent's space the lost joint sits at the child's position.
    stumpAxis.copy(child.position).normalize();
    const small = key !== "legs";
    const rim = rims[i] || {
      local: child.position.clone().multiplyScalar(0.93),
      radius: small ? 0.045 : 0.06,
    };
    const radius = Math.min(
      small ? 0.065 : 0.09,
      Math.max(0.03, rim.radius * 1.08),
    );
    const cap = hordeWound(radius, small);
    cap.position.copy(rim.local).addScaledVector(stumpAxis, -radius * 0.2);
    cap.quaternion.setFromUnitVectors(stumpUp, stumpAxis);
    parent.add(cap);
  });
  return true;
}

/** Blow the lower legs off: the body now crawls on its knees and stumps. */
export const hordeLoseLegs = (model, onPieces) =>
  hordeSever(model, "legs", onPieces);

export function releaseHorde(model) {
  const data = model.userData.horde;
  data?.mixer?.stopAllAction();
  data?.mixer?.uncacheRoot(model);
  for (const mesh of data?.body || []) mesh.material.dispose();
  data?.skeleton?.dispose();
}

/**
 * World point (and optional direction) -> bind space, through one bone: the
 * inverse of that bone's current skinning transform.
 */
const inverse = new T.Matrix4(),
  bindMatrix = new T.Matrix4(),
  skinning = new T.Matrix4();
export function toBindSpace(
  model,
  worldPoint,
  boneName,
  target,
  direction = null,
) {
  const horde = model.userData.horde;
  const skeleton = horde.skeleton;
  const index = skeleton.bones.findIndex((b) => b.name === boneName);
  if (index < 0) return null;
  const bone = skeleton.bones[index];
  bone.updateWorldMatrix(true, false);
  inverse.copy(bone.matrixWorld).invert();
  bindMatrix.copy(skeleton.boneInverses[index]).invert();
  skinning.multiplyMatrices(bindMatrix, inverse);
  target.copy(worldPoint).applyMatrix4(skinning);
  if (direction) direction.transformDirection(skinning);
  return target;
}
