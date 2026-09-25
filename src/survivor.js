import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { WEAPONS } from "./content/weapons.js";
import { weaponModel } from "./weapons.js";
import { createWeaponSync, weaponLoaded } from "./armory/models.js";
import { RIGS } from "./armory/catalog.js";
import { dressFlash, FLASH_STYLES } from "./armory/effects.js";
import { disposeModel } from "./resources.js";

export const TEAM_COLORS = [0xe8a64a, 0x52bfe0, 0xe0655c, 0x8fd47c];
let template, loading;
export function prepareSurvivor() {
  return (loading ||= new GLTFLoader()
    .loadAsync("/models/survivor.glb")
    .then((gltf) => {
      template = gltf;
      gltf.scene.traverse((o) => {
        for (const material of o.material ? [o.material].flat() : [])
          for (const texture of Object.values(material))
            if (texture?.isTexture) {
              texture.userData.sharedSurface = true;
              texture.anisotropy = 4;
            }
      });
    })
    .catch((error) => {
      loading = null;
      throw error;
    }));
}
export function survivorModel(color = TEAM_COLORS[0]) {
  if (!template)
    throw new Error("Survivor must be prepared before starting co-op");
  const g = new T.Group(),
    body = clone(template.scene),
    rig = new T.Group();
  g.name = "survivor";
  g.add(rig);
  rig.add(body);
  const bones = {};
  body.traverse((o) => {
    if (o.isBone) bones[o.name.replace(/^mixamorig:?/, "")] = o;
    if (o.isMesh) {
      // Instances own geometry/material handles; texture images stay cached.
      o.geometry = o.geometry.clone();
      o.material = o.material.clone();
      o.material.roughness = 0.8;
      if (o.name === "vanguard_visor") {
        o.material.emissive.setHex(color);
        o.material.emissiveIntensity = 0.12;
      }
      o.castShadow = o.receiveShadow = true;
      o.frustumCulled = false;
    }
  });
  body.updateMatrixWorld(true);
  body.traverse((o) => {
    if (o.isSkinnedMesh) o.computeBoundingBox();
  });
  const bounds = new T.Box3().setFromObject(body),
    height = bounds.max.y - bounds.min.y;
  body.scale.multiplyScalar(1.82 / height);
  body.rotation.y = Math.PI;
  body.position.y = (-bounds.min.y * 1.82) / height;
  const mixer = new T.AnimationMixer(body);
  const actions = Object.fromEntries(
    ["Idle", "Walk", "Run"].map((name) => {
      const action = mixer.clipAction(
        T.AnimationClip.findByName(template.animations, name),
      );
      action.setEffectiveWeight(name === "Idle" ? 1 : 0).play();
      return [name, action];
    }),
  );
  mixer.update(0);
  const mount = new T.Group();
  mount.rotation.y = Math.PI;
  g.add(mount);
  g.userData = {
    body,
    rig,
    bones,
    mixer,
    actions,
    mount,
    baseY: body.position.y,
    gun: null,
    grip: new T.Vector3(),
    foreGrip: new T.Vector3(),
    downBlend: 0,
  };
  return g;
}
/**
 * A teammate's weapon: the real model once the armory has streamed it in,
 * the procedural stand-in until then. Hands target the rig's grips.
 */
export function survivorWeapon(g, id, upgraded, level = upgraded ? 1 : 0) {
  const d = g.userData;
  const look = WEAPONS[id].look || id;
  const armory = !!RIGS[look] && weaponLoaded(look);
  const key = `${id}-${level}-${armory ? "a" : "p"}`;
  if (d.gunId === key) return d.gun;
  if (d.gun) {
    d.gun.removeFromParent();
    disposeModel(d.gun);
  }
  d.pistol = look === "vigil";
  let gun = armory ? createWeaponSync(look, { camo: level }) : null;
  if (gun) {
    const rig = RIGS[look];
    const muzzle = gun.userData.armory.sockets.muzzle;
    const flash = new T.Group();
    if (muzzle) flash.position.copy(muzzle.position);
    flash.visible = false;
    gun.add(flash);
    dressFlash(flash, FLASH_STYLES[rig.flash] || FLASH_STYLES.rifle, level > 0);
    gun.userData.flash = flash;
    const knuckle = (side) => {
      const grip = rig.grips[side];
      const point = new T.Vector3().fromArray(grip.knuckle || grip.wrist);
      const part = grip.space && gun.userData.armory.parts[grip.space];
      if (part) point.applyQuaternion(part.quaternion).add(part.position);
      return point;
    };
    d.grip.copy(knuckle("right"));
    d.foreGrip.copy(knuckle("left"));
  } else {
    gun = weaponModel(id, level > 0);
    gun.scale.setScalar(0.7);
    d.grip.set(0.013, -0.171, d.pistol ? 0.02 : 0.075);
    d.foreGrip.set(0, -0.075, d.pistol ? -0.12 : -0.34);
  }
  d.mount.add(gun);
  d.gun = gun;
  d.gunId = key;
  return gun;
}
const shoulder = new T.Vector3(),
  elbow = new T.Vector3(),
  hand = new T.Vector3(),
  direction = new T.Vector3(),
  bend = new T.Vector3(),
  target = new T.Vector3(),
  pole = new T.Vector3(),
  current = new T.Vector3(),
  desired = new T.Vector3(),
  origin = new T.Vector3();
const rotation = new T.Quaternion(),
  world = new T.Quaternion(),
  parent = new T.Quaternion();
function aimBone(bone, child, at) {
  bone.getWorldPosition(origin);
  child.getWorldPosition(current);
  current.sub(origin).normalize();
  desired.copy(at).sub(origin).normalize();
  rotation.setFromUnitVectors(current, desired);
  bone.getWorldQuaternion(world);
  world.premultiply(rotation);
  bone.parent.getWorldQuaternion(parent).invert();
  bone.quaternion.copy(parent.multiply(world));
  bone.updateWorldMatrix(false, true);
}
function reach(upper, lower, wrist, at, poleAt) {
  upper.getWorldPosition(shoulder);
  lower.getWorldPosition(elbow);
  wrist.getWorldPosition(hand);
  const a = shoulder.distanceTo(elbow),
    b = elbow.distanceTo(hand);
  direction.copy(at).sub(shoulder);
  const distance = T.MathUtils.clamp(
    direction.length(),
    Math.abs(a - b) + 0.005,
    a + b - 0.005,
  );
  direction.normalize();
  const cosine = T.MathUtils.clamp(
    (a * a + distance * distance - b * b) / (2 * a * distance),
    -1,
    1,
  );
  bend.copy(poleAt).sub(shoulder);
  bend.addScaledVector(direction, -bend.dot(direction)).normalize();
  elbow
    .copy(shoulder)
    .addScaledVector(direction, cosine * a)
    .addScaledVector(bend, Math.sqrt(1 - cosine * cosine) * a);
  aimBone(upper, lower, elbow);
  aimBone(lower, wrist, at);
}
export function animateSurvivor(
  g,
  t,
  speed,
  {
    crouch = false,
    pitch = 0,
    firing = false,
    down = false,
    reviving = false,
  } = {},
) {
  const d = g.userData;
  const dt = Math.max(0, Math.min(0.1, t - (d.time ?? t)));
  d.time = t;
  const moving = T.MathUtils.clamp(speed, 0, 1.8);
  const run = T.MathUtils.smoothstep(moving, 0.85, 1.5),
    walk = T.MathUtils.smoothstep(moving, 0.02, 0.3) * (1 - run);
  for (const [name, weight] of Object.entries({
    Idle: 1 - walk - run,
    Walk: walk,
    Run: run,
  })) {
    const action = d.actions[name];
    action.setEffectiveWeight(
      T.MathUtils.damp(
        action.getEffectiveWeight(),
        down ? (name === "Idle" ? 1 : 0) : weight,
        10,
        dt,
      ),
    );
  }
  d.actions.Walk.setEffectiveTimeScale(Math.max(0.35, moving * 1.35));
  d.actions.Run.setEffectiveTimeScale(Math.max(0.6, moving * 0.8));
  d.mixer.update(dt);
  d.downBlend = T.MathUtils.damp(d.downBlend, down ? 1 : 0, 6, dt);
  d.rig.rotation.x = (-Math.PI / 2) * d.downBlend;
  d.rig.position.y = 0.28 * d.downBlend;
  d.rig.position.z = -0.25 * d.downBlend;
  d.body.position.y = d.baseY - (reviving ? 0.26 : crouch ? 0.18 : 0);
  if (crouch || reviving) {
    for (const side of ["Left", "Right"]) {
      d.bones[side + "UpLeg"].rotation.x -= reviving ? 0.65 : 0.45;
      d.bones[side + "Leg"].rotation.x += reviving ? 1.2 : 0.8;
    }
  }
  if (d.gun) {
    d.gun.visible = !down && !reviving;
    d.mount.position.set(
      d.pistol ? 0.08 : 0.15,
      (crouch ? 1.12 : 1.4) + Math.sin(t * 1.7) * 0.003,
      d.pistol ? 0.4 : 0.24,
    );
    d.mount.rotation.set(pitch, Math.PI, 0, "YXZ");
    if (firing) d.mount.position.z -= (0.5 + 0.5 * Math.sin(t * 55)) * 0.018;
    if (!down) {
      g.updateWorldMatrix(true, true);
      for (const [side, grip, sign] of [
        ["Right", d.grip, 1],
        ["Left", d.foreGrip, -1],
      ]) {
        if (reviving)
          target.set(sign * 0.23, 0.65, 0.65).applyMatrix4(g.matrixWorld);
        else {
          target.copy(grip);
          d.gun.localToWorld(target);
        }
        pole
          .set(sign * 0.75, crouch || reviving ? 0.7 : 1.1, 0.12)
          .applyMatrix4(g.matrixWorld);
        reach(
          d.bones[side + "Arm"],
          d.bones[side + "ForeArm"],
          d.bones[side + "Hand"],
          target,
          pole,
        );
      }
    }
  }
}
export function releaseSurvivor(g) {
  g.userData.mixer?.stopAllAction();
  g.userData.mixer?.uncacheRoot(g.userData.body);
  disposeModel(g);
}
