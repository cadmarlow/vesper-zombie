import { WEAPONS } from "./content/weapons.js";
// Third-person teammate: a soldier built from rigid parts on a small bone
// tree, with a two-handed rifle stance solved by a two-bone reach so both
// hands sit on the grip and fore-end of whichever weapon they carry.
import * as T from "three";
import { mat, glow } from "./assets.js";
import { surface } from "./surfaces.js";
import { weaponModel } from "./weapons.js";
import { disposeModel } from "./resources.js";

export const TEAM_COLORS = [0xe8a64a, 0x52bfe0, 0xe0655c, 0x8fd47c];
const UPPER_ARM = 0.305,
  FOREARM = 0.29;
const DOWN = new T.Vector3(0, -1, 0);
const v1 = new T.Vector3(),
  v2 = new T.Vector3(),
  v3 = new T.Vector3(),
  axis = new T.Vector3(),
  q1 = new T.Quaternion(),
  q2 = new T.Quaternion();

function part(
  parent,
  geometry,
  material,
  x = 0,
  y = 0,
  z = 0,
  rotation = null,
) {
  const m = new T.Mesh(geometry, material);
  m.position.set(x, y, z);
  if (rotation) m.rotation.set(...rotation);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
const box = (parent, material, x, y, z, w, h, d, rotation) =>
  part(parent, new T.BoxGeometry(w, h, d), material, x, y, z, rotation);
const capsule = (parent, material, x, y, z, r, length, rotation) =>
  part(
    parent,
    new T.CapsuleGeometry(r, length, 4, 10),
    material,
    x,
    y,
    z,
    rotation,
  );

export function survivorModel(color = TEAM_COLORS[0]) {
  const g = new T.Group();
  g.name = "survivor";
  const fabric = surface("cloth", 0x74806a, {
    roughness: 1,
    metalness: 0,
    normalScale: new T.Vector2(0.5, 0.5),
  });
  const camo = surface("cloth", 0x5a6852, { roughness: 1, metalness: 0 });
  const vest = surface("cloth", 0x394342, { roughness: 0.92, metalness: 0 });
  const leather = mat(0x23292a, 0.72, 0.18);
  const strap = mat(0x434c49, 0.9, 0.05);
  const skin = mat(0xcaa583, 0.82, 0);
  const shell = mat(0x38423a, 0.62, 0.25);
  const band = mat(color, 0.55, 0.1, {
    emissive: color,
    emissiveIntensity: 0.3,
  });
  const lamp = glow(0xfff1c8, 3);
  const visor = mat(0x111517, 0.25, 0.5);

  const bone = (name, parent, x, y, z = 0) => {
    const b = new T.Bone();
    b.name = name;
    b.position.set(x, y, z);
    parent.add(b);
    return b;
  };
  const hips = bone("hips", g, 0, 0.88);
  const spine = bone("spine", hips, 0, 0.19);
  const torso = bone("torso", spine, 0, 0.28);
  const neck = bone("neck", torso, 0, 0.22);
  const head = bone("head", neck, 0, 0.2);
  const arms = [],
    elbows = [],
    wrists = [],
    legs = [];
  for (const [i, s] of [-1, 1].entries()) {
    const a = bone(`arm${i}`, torso, s * 0.265, 0.11);
    const e = bone(`elbow${i}`, a, 0, -UPPER_ARM);
    const w = bone(`wrist${i}`, e, 0, -FOREARM);
    arms.push(a);
    elbows.push(e);
    wrists.push(w);
    const thigh = bone(`leg${i}`, hips, s * 0.115, 0);
    const shin = bone(`shin${i}`, thigh, 0, -0.42);
    const foot = bone(`foot${i}`, shin, 0, -0.36, 0.025);
    legs.push({ root: thigh, shin, foot });
  }

  // Pelvis, belt, chest, vest and pack.
  box(hips, camo, 0, 0.02, 0, 0.34, 0.2, 0.23);
  box(hips, leather, 0, 0.11, 0, 0.36, 0.05, 0.25);
  for (const x of [-0.12, 0.12])
    box(hips, strap, x, 0.02, 0.13, 0.08, 0.1, 0.05);
  box(spine, fabric, 0, 0.12, 0, 0.36, 0.3, 0.24);
  box(torso, fabric, 0, -0.06, 0, 0.4, 0.34, 0.25);
  box(torso, vest, 0, -0.08, 0, 0.42, 0.34, 0.31);
  for (const x of [-0.11, 0, 0.11])
    box(torso, strap, x, -0.16, 0.17, 0.09, 0.1, 0.05);
  box(torso, strap, 0, 0.0, 0.17, 0.3, 0.06, 0.03);
  for (const s of [-1, 1])
    box(torso, strap, s * 0.12, 0.07, 0, 0.06, 0.12, 0.33);
  box(torso, vest, 0, -0.1, -0.22, 0.3, 0.36, 0.14);
  box(torso, strap, 0, -0.1, -0.3, 0.2, 0.22, 0.03);
  for (const s of [-1, 1])
    capsule(torso, camo, s * 0.25, 0.1, 0, 0.075, 0.06, [0, 0, s * 0.3]);

  // Neck, balaclava head, goggles, helmet with brim, lamp and team band.
  part(neck, new T.CylinderGeometry(0.07, 0.085, 0.14, 10), skin, 0, 0.09, 0);
  const headMesh = part(
    head,
    new T.SphereGeometry(0.115, 14, 12),
    vest,
    0,
    0.045,
    0.01,
  );
  headMesh.scale.set(0.92, 1.08, 1);
  box(head, skin, 0, 0.06, 0.095, 0.15, 0.045, 0.05);
  box(head, visor, 0, 0.06, 0.108, 0.16, 0.05, 0.02);
  const helmet = part(
    head,
    new T.SphereGeometry(0.135, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
    shell,
    0,
    0.1,
    0.005,
  );
  helmet.scale.set(1, 0.9, 1.08);
  part(head, new T.TorusGeometry(0.132, 0.018, 6, 24), shell, 0, 0.085, 0.005, [
    Math.PI / 2,
    0,
    0,
  ]);
  part(head, new T.TorusGeometry(0.128, 0.012, 6, 24), band, 0, 0.125, 0.005, [
    Math.PI / 2,
    0,
    0,
  ]);
  box(head, shell, 0, 0.155, 0.12, 0.05, 0.04, 0.05);
  const lampMesh = box(head, lamp, 0, 0.155, 0.15, 0.036, 0.03, 0.012);
  lampMesh.castShadow = false;

  // Arms: sleeves, elbow pads, gloves; a team band on the left arm.
  for (const [i, s] of [-1, 1].entries()) {
    capsule(arms[i], fabric, 0, -0.15, 0, 0.058, 0.2);
    const armband = part(
      arms[i],
      new T.CylinderGeometry(0.066, 0.066, 0.05, 12),
      band,
      0,
      -0.1,
      0,
    );
    armband.visible = i === 0;
    capsule(elbows[i], fabric, 0, -0.14, 0, 0.05, 0.18);
    box(elbows[i], leather, 0, -0.02, 0.03, 0.09, 0.09, 0.09);
    box(wrists[i], leather, 0, -0.045, 0.01, 0.075, 0.1, 0.06);
    for (let f = 0; f < 3; f++)
      box(wrists[i], leather, (f - 1) * 0.024, -0.11, 0.015, 0.02, 0.05, 0.02);
    // Legs: trousers, knee pads, boots.
    capsule(legs[i].root, camo, 0, -0.21, 0, 0.078, 0.3);
    box(legs[i].root, strap, 0, -0.14, 0.055, 0.1, 0.12, 0.06);
    capsule(legs[i].shin, camo, 0, -0.17, 0, 0.062, 0.26);
    box(legs[i].shin, leather, 0, -0.03, 0.045, 0.1, 0.1, 0.07);
    box(legs[i].foot, leather, 0, 0.03, 0.05, 0.12, 0.1, 0.27);
    box(legs[i].foot, leather, 0, 0.1, -0.02, 0.11, 0.08, 0.13);
    void s;
  }

  // Weapon mount: yaw flips the view-model barrel to face forward, pitch
  // follows the aim, the weapon itself hangs from the pitch node.
  const mountYaw = new T.Object3D();
  mountYaw.position.set(0.12, -0.04, 0.2);
  mountYaw.rotation.y = Math.PI;
  torso.add(mountYaw);
  const mount = new T.Object3D();
  mountYaw.add(mount);

  g.userData = {
    hips,
    spine,
    torso,
    neck,
    head,
    arms,
    elbows,
    wrists,
    legs,
    mount,
    band,
    gun: null,
    gunId: null,
    grip: new T.Vector3(0.013, -0.171, 0.075),
    foreGrip: new T.Vector3(0.0, -0.075, -0.34),
  };
  return g;
}

export function survivorWeapon(g, id, upgraded) {
  const d = g.userData;
  if (d.gunId === `${id}-${upgraded ? 1 : 0}`) return d.gun;
  if (d.gun) {
    d.gun.removeFromParent();
    disposeModel(d.gun);
  }
  const gun = weaponModel(id, upgraded);
  gun.scale.setScalar(0.7);
  d.mount.add(gun);
  // A pistol is held out at arm's length; long guns rest against the chest.
  const pistol = (WEAPONS[id].look || id) === "vigil";
  d.mount.parent.position.set(
    pistol ? 0.06 : 0.12,
    pistol ? 0.0 : -0.04,
    pistol ? 0.42 : 0.2,
  );
  d.gun = gun;
  d.gunId = `${id}-${upgraded ? 1 : 0}`;
  // Where the hands go, in the weapon's own frame.
  const long = !pistol;
  d.grip.set(0.013, -0.171, long ? 0.075 : 0.02);
  d.foreGrip.set(0.0, -0.075, long ? -0.34 : -0.12);
  return gun;
}

// Two-bone reach: aim the upper arm at the target, bend the elbow to close
// the distance, roll the shoulder so the bend plane contains the target.
function reach(arm, elbow, target, pole) {
  v1.copy(target).sub(arm.position);
  const distance = T.MathUtils.clamp(
    v1.length(),
    0.08,
    UPPER_ARM + FOREARM - 0.01,
  );
  v1.normalize();
  const cosElbow = T.MathUtils.clamp(
    (UPPER_ARM ** 2 + FOREARM ** 2 - distance ** 2) / (2 * UPPER_ARM * FOREARM),
    -1,
    1,
  );
  const bend = Math.PI - Math.acos(cosElbow);
  const cosShoulder = T.MathUtils.clamp(
    (UPPER_ARM ** 2 + distance ** 2 - FOREARM ** 2) /
      (2 * UPPER_ARM * distance),
    -1,
    1,
  );
  const offset = Math.acos(cosShoulder);
  axis.crossVectors(v1, pole).normalize();
  if (axis.lengthSq() < 1e-6) axis.set(1, 0, 0);
  q1.setFromUnitVectors(DOWN, v1);
  q2.setFromAxisAngle(axis, offset);
  q1.premultiply(q2);
  // Roll around the upper arm so its local X matches the bend axis.
  v2.set(1, 0, 0).applyQuaternion(q1);
  v3.copy(DOWN).applyQuaternion(q1); // upper arm direction
  const roll = Math.atan2(v3.dot(v2.clone().cross(axis)), v2.dot(axis));
  q2.setFromAxisAngle(v3, roll);
  q1.premultiply(q2);
  arm.quaternion.copy(q1);
  // Bend toward the target: check both senses and keep the closer wrist.
  let best = Infinity,
    bestSign = -1;
  for (const sign of [-1, 1]) {
    elbow.rotation.set(sign * bend, 0, 0);
    arm.updateMatrixWorld(true);
    const wrist = elbow.children.find((c) => c.isBone);
    wrist.getWorldPosition(v2);
    arm.parent.worldToLocal(v2);
    const err = v2.distanceTo(target);
    if (err < best) {
      best = err;
      bestSign = sign;
    }
  }
  elbow.rotation.set(bestSign * bend, 0, 0);
}

const RIGHT_POLE = new T.Vector3(0.9, -0.6, -0.2).normalize();
const LEFT_POLE = new T.Vector3(-0.9, -0.7, -0.1).normalize();
const target = new T.Vector3();

export function animateSurvivor(
  g,
  t,
  speed,
  { crouch = false, pitch = 0, firing = false } = {},
) {
  const d = g.userData;
  const moving = Math.min(1, speed);
  const phase = t * (5.5 + moving * 2.5);
  d.hips.position.y =
    0.88 - (crouch ? 0.3 : 0) + Math.abs(Math.sin(phase)) * 0.02 * moving;
  d.hips.rotation.set(crouch ? 0.12 : 0, Math.sin(phase) * 0.05 * moving, 0);
  d.spine.rotation.set(crouch ? 0.18 : 0.02, 0, 0);
  d.torso.rotation.set(0.05 + (crouch ? 0.22 : 0), 0, 0);
  d.head.rotation.set(-pitch * 0.55 - (crouch ? 0.25 : 0), 0, 0);
  const stride = 0.55 * moving;
  d.legs.forEach((leg, i) => {
    const p = phase + i * Math.PI;
    if (crouch) {
      leg.root.rotation.x = -0.95 + Math.sin(p) * stride * 0.3;
      leg.shin.rotation.x = 1.55;
      leg.foot.rotation.x = -0.6;
    } else {
      leg.root.rotation.x = Math.sin(p) * stride;
      leg.shin.rotation.x = Math.max(0, -Math.sin(p)) * 0.8 * moving;
      leg.foot.rotation.x = -Math.max(0, Math.cos(p)) * 0.2 * moving;
    }
  });
  // Weapon follows the aim; a small kick while firing.
  d.mount.rotation.x = pitch;
  d.mount.position.z = firing ? -0.02 : 0;
  if (d.gun) {
    d.gun.updateMatrixWorld(true);
    // Right hand on the grip, left hand on the fore-end, both in torso space.
    target.copy(d.grip).multiplyScalar(0.7);
    d.gun.localToWorld(target);
    d.torso.worldToLocal(target);
    reach(d.arms[1], d.elbows[1], target, RIGHT_POLE);
    target.copy(d.foreGrip).multiplyScalar(0.7);
    d.gun.localToWorld(target);
    d.torso.worldToLocal(target);
    reach(d.arms[0], d.elbows[0], target, LEFT_POLE);
    d.wrists[1].rotation.set(0.35, 0, 0);
    d.wrists[0].rotation.set(0.25, 0.45, -0.2);
  } else {
    d.arms[1].rotation.set(-1.2, 0.3, -0.2);
    d.arms[0].rotation.set(-1.4, -0.5, 0.3);
    d.elbows[1].rotation.set(-0.8, 0, 0);
    d.elbows[0].rotation.set(-0.4, 0, 0);
  }
}
