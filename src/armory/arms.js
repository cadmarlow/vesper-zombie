import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";

// First-person arms: sleeves and gloves of a Rocketbox soldier (MIT), built by
// scripts/armory/build-arms.mjs. The upper body is seated so the eyes are at
// the view origin; each hand is placed on a weapon grip frame by a two-bone
// IK (the forearm takes the wrist twist, as a radius rolls around the ulna)
// and its fingers follow per-weapon curl poses.

const loader = new GLTFLoader();
let template = null;
export function loadArmsTemplate() {
  template ||= Promise.all([
    loader.loadAsync("/models/armory/arms.glb"),
    fetch("/models/armory/arms.json").then((r) => r.json()),
  ]).catch((error) => {
    template = null;
    throw error;
  });
  return template;
}

const textures = new Map();
function armsTexture(name, size, color) {
  const key = `${name}-${size}`;
  if (!textures.has(key)) {
    textures.set(
      key,
      new T.TextureLoader()
        .loadAsync(`/models/armory/arms-${name}-${size}.webp`)
        .then((t) => {
          t.flipY = false;
          t.colorSpace = color ? T.SRGBColorSpace : T.NoColorSpace;
          t.anisotropy = 4;
          t.userData.sharedSurface = true;
          return t;
        })
        .catch(() => {
          textures.delete(key);
          return null;
        }),
    );
  }
  return textures.get(key);
}

const SIDES = { right: "R", left: "L" };
const FINGERS = [1, 2, 3, 4];
const DIGIT_NAMES = { 1: "index", 2: "middle", 3: "ring", 4: "pinky" };
const JOINTS = {
  1: ["1", "11", "12"],
  2: ["2", "21", "22"],
  3: ["3", "31", "32"],
  4: ["4", "41", "42"],
};
const DEFAULT_CURL = [0.2, 0.2, 0.2];
const DEFAULT_THUMB = [0.2, 0, 0.2, 0.2];
// Longest reach as a share of the arm length: a straight elbow looks locked.
const REACH = 0.97;
// A hand on a grip keeps its wrist within ~15 degrees of neutral.
const WRIST_LIMIT = (15 * Math.PI) / 180;
const v1 = new T.Vector3(),
  v2 = new T.Vector3(),
  v3 = new T.Vector3(),
  v4 = new T.Vector3(),
  q1 = new T.Quaternion(),
  q2 = new T.Quaternion(),
  q3 = new T.Quaternion(),
  m1 = new T.Matrix4(),
  m2 = new T.Matrix4();
// Scratch for solve(), which runs twice a frame: no allocation per frame.
const S = {
  wrist: new T.Vector3(),
  offset: new T.Vector3(),
  fore: new T.Vector3(),
  handAxis: new T.Vector3(),
  bendAxis: new T.Vector3(),
  upperAxis: new T.Vector3(),
  moved: new T.Vector3(),
  axis: new T.Vector3(),
  desired: new T.Vector3(),
  local: new T.Vector3(),
  rootQ: new T.Quaternion(),
  rootInv: new T.Quaternion(),
  parent: new T.Quaternion(),
  world: new T.Quaternion(),
  hand: new T.Quaternion(),
  fromFore: new T.Quaternion(),
  delta: new T.Quaternion(),
  twist: new T.Quaternion(),
  bone: new T.Quaternion(),
  frame: { f: new T.Vector3(), l: new T.Vector3(), n: new T.Vector3() },
};

/** Rotation mapping an orthonormal frame (f, l, n) to (F, L, N). */
function frameRotation(f, l, n, F, L, N, target) {
  const a = m1.makeBasis(f, l, n);
  const b = m2.makeBasis(F, L, N);
  return target.setFromRotationMatrix(b.multiply(a.transpose()));
}

/**
 * Hand frame from the wrist -> middle knuckle direction (forward) and the
 * pinky -> index knuckle direction (lateral). The palm normal follows
 * anatomy: lateral x forward for a right hand, forward x lateral for a left.
 */
function orthoFrame(
  forward,
  lateral,
  side,
  out = { f: new T.Vector3(), l: new T.Vector3(), n: new T.Vector3() },
) {
  const f = out.f.copy(forward).normalize();
  const l = out.l.copy(lateral).addScaledVector(f, -lateral.dot(f)).normalize();
  if (side === "right") out.n.crossVectors(l, f).normalize();
  else out.n.crossVectors(f, l).normalize();
  return out;
}

/** Rotation of `bone` in the arms root frame (rootInv: inverse root rotation). */
function rootRotation(bone, rootInv, out) {
  return out.copy(rootInv).multiply(bone.getWorldQuaternion(S.bone));
}

export class Arms {
  constructor(gltf, meta, maps) {
    this.root = new T.Group();
    this.root.name = "fp-arms";
    this.body = cloneSkinned(gltf.scene);
    this.root.add(this.body);
    this.material = new T.MeshStandardMaterial({
      map: maps.color,
      normalMap: maps.normal,
      roughnessMap: maps.rough,
      roughness: 1,
      metalness: 0,
      color: 0xffffff,
    });
    this.material.normalScale.set(0.9, -0.9);
    this.bones = {};
    this.body.traverse((o) => {
      if (o.isBone) this.bones[o.name] = o;
      if (o.isSkinnedMesh) {
        o.material = this.material;
        o.frustumCulled = false;
        o.castShadow = o.receiveShadow = false;
        this.mesh = o;
      }
    });
    // Seat the eyes at the origin, looking down -z (the avatar faces +z).
    const eyes = new T.Vector3()
      .fromArray(meta.landmarks.eyeL)
      .add(new T.Vector3().fromArray(meta.landmarks.eyeR))
      .multiplyScalar(0.5);
    this.body.rotation.y = Math.PI;
    eyes.applyAxisAngle(new T.Vector3(0, 1, 0), Math.PI);
    this.body.position.copy(eyes).negate();
    this.root.updateMatrixWorld(true);
    this.sides = {};
    for (const [side, s] of Object.entries(SIDES))
      this.sides[side] = this.rest(s, side);
    this.shoulderOffset = { right: new T.Vector3(), left: new T.Vector3() };
    // Largest angle between forearm and hand (radians), see solve().
    this.wristLimit = WRIST_LIMIT;
  }

  /** Rest data of one arm, in the arms root frame. */
  rest(s, side) {
    // GLTFLoader sanitizes node names: spaces become underscores.
    const b = (n) => this.bones[`Bip01_${s}_${n}`];
    const upper = b("UpperArm"),
      fore = b("Forearm"),
      hand = b("Hand");
    const inv = new T.Matrix4().copy(this.root.matrixWorld).invert();
    const pos = (bone) =>
      bone.getWorldPosition(new T.Vector3()).applyMatrix4(inv);
    const rootQ = this.root.getWorldQuaternion(new T.Quaternion()).invert();
    const quat = (bone) =>
      rootQ.clone().multiply(bone.getWorldQuaternion(new T.Quaternion()));
    const shoulder = pos(upper),
      elbow = pos(fore),
      wrist = pos(hand);
    const knuckle = (f) => pos(b(`Finger${f}`));
    const frame = orthoFrame(
      knuckle(2).sub(wrist),
      knuckle(1).sub(knuckle(4)),
      side,
    );
    const handQ = quat(hand);
    const invHand = handQ.clone().invert();
    const local = {
      f: frame.f.clone().applyQuaternion(invHand),
      l: frame.l.clone().applyQuaternion(invHand),
      n: frame.n.clone().applyQuaternion(invHand),
    };
    const fingers = {};
    for (const f of [0, 1, 2, 3, 4])
      for (const j of ["", "1", "2"]) {
        const bone = b(`Finger${f}${j}`);
        if (!bone) continue;
        const wq = quat(bone),
          iq = wq.clone().invert();
        const dir = (() => {
          const child = bone.children.find((c) => c.isBone);
          if (child) return child.position.clone().normalize();
          return bone.position
            .clone()
            .normalize()
            .applyQuaternion(bone.quaternion.clone().invert());
        })();
        fingers[`${f}${j}`] = {
          bone,
          rest: bone.quaternion.clone(),
          // Curl axis: the hand's lateral axis in this joint's frame.
          lateral: frame.l.clone().applyQuaternion(iq).normalize(),
          palm: frame.n.clone().applyQuaternion(iq).normalize(),
          forward: frame.f.clone().applyQuaternion(iq).normalize(),
          dir,
        };
      }
    return {
      upper,
      fore,
      hand,
      restUpper: upper.quaternion.clone(),
      restUpperPosition: upper.position.clone(),
      restFore: fore.quaternion.clone(),
      restHand: hand.quaternion.clone(),
      shoulder,
      a: shoulder.distanceTo(elbow),
      b: elbow.distanceTo(wrist),
      upperAxis: fore.position.clone().normalize(),
      foreAxis: hand.position.clone().normalize(),
      handFrame: local,
      handLength: knuckle(2).distanceTo(wrist),
      fingers,
      side,
    };
  }

  /**
   * Place one hand. target: position of the wrist and frame of the hand in
   * the arms root frame ({ position, forward, lateral }), pole: elbow hint
   * direction, pose: finger curls.
   */
  solve(side, target, pole, pose) {
    const r = this.sides[side];
    const root = this.root;
    // A grip may give the middle knuckle instead of the wrist.
    const reach = target.knuckle
      ? S.wrist
          .copy(S.axis.copy(target.forward).normalize())
          .multiplyScalar(-r.handLength)
          .add(target.knuckle)
      : S.wrist.copy(target.position);
    // Everything below is expressed in the arms root frame.
    const offset = S.offset.copy(this.shoulderOffset[side]);
    const shoulder = v1.copy(r.shoulder).add(offset);
    const toTarget = v2.copy(reach).sub(shoulder);
    let d = toTarget.length();
    const a = r.a,
      b = r.b;
    // The virtual shoulders sit far back to keep the forearms out of the
    // sights; when that leaves the grip out of reach, the shoulder follows
    // the hand rather than the hand stopping short of the grip.
    const longest = (a + b) * REACH;
    if (d > longest) {
      const excess = d - longest;
      toTarget.multiplyScalar(1 / d);
      offset.addScaledVector(toTarget, excess);
      shoulder.addScaledVector(toTarget, excess);
      toTarget.multiplyScalar(longest);
      d = longest;
    }
    d = T.MathUtils.clamp(d, Math.abs(a - b) + 1e-4, a + b - 1e-4);
    toTarget.normalize();
    const cosA = T.MathUtils.clamp(
      (a * a + d * d - b * b) / (2 * a * d),
      -1,
      1,
    );
    const bend = v3
      .copy(pole)
      .addScaledVector(toTarget, -pole.dot(toTarget))
      .normalize();
    const elbow = v4
      .copy(shoulder)
      .addScaledVector(toTarget, cosA * a)
      .addScaledVector(bend, Math.sqrt(1 - cosA * cosA) * a);
    const wrist = S.wrist.copy(shoulder).addScaledVector(toTarget, d);
    // Wrist limit: a gripping hand stays nearly in line with its forearm.
    // Past the limit the elbow comes in behind the hand and the shoulder
    // joint follows the upper arm, as the whole arm would.
    const limit = target.wristLimit ?? this.wristLimit;
    const fore = S.fore.copy(wrist).sub(elbow).normalize();
    const hand = S.handAxis.copy(target.forward).normalize();
    const bent = Math.acos(T.MathUtils.clamp(fore.dot(hand), -1, 1));
    if (bent > limit) {
      const axis = S.bendAxis.crossVectors(hand, fore);
      if (axis.lengthSq() < 1e-10) axis.copy(bend);
      axis.normalize();
      fore.copy(hand).applyAxisAngle(axis, limit);
      elbow.copy(wrist).addScaledVector(fore, -b);
      const upper = S.upperAxis.copy(shoulder).sub(elbow).normalize();
      const moved = S.moved.copy(elbow).addScaledVector(upper, a);
      offset.add(moved).sub(shoulder);
      shoulder.copy(moved);
    }
    // Reset the chain, move the shoulder joint, then aim each bone.
    r.upper.quaternion.copy(r.restUpper);
    r.fore.quaternion.copy(r.restFore);
    r.hand.quaternion.copy(r.restHand);
    root.updateMatrixWorld(true);
    const rootQ = root.getWorldQuaternion(S.rootQ);
    {
      // The offset is given in the arms root frame; bones live in their
      // parent's frame (the skeleton has unit scale after the build).
      const parentWorld = r.upper.parent.getWorldQuaternion(S.parent).invert();
      const local = S.local
        .copy(offset)
        .applyQuaternion(rootQ)
        .applyQuaternion(parentWorld);
      r.upper.position.copy(r.restUpperPosition).add(local);
      r.upper.updateMatrixWorld(true);
    }
    const rootInv = S.rootInv.copy(rootQ).invert();
    const desired = S.desired;
    // Upper arm: swing its axis onto shoulder -> elbow.
    let wq = rootRotation(r.upper, rootInv, S.world);
    desired.copy(elbow).sub(shoulder).normalize();
    wq = q1
      .setFromUnitVectors(S.axis.copy(r.upperAxis).applyQuaternion(wq), desired)
      .multiply(wq);
    r.upper.quaternion.copy(
      rootRotation(r.upper.parent, rootInv, S.parent).invert().multiply(wq),
    );
    r.upper.updateMatrixWorld(true);
    // Forearm: swing onto elbow -> wrist, then roll to follow the hand.
    wq = rootRotation(r.fore, rootInv, S.world);
    desired.copy(wrist).sub(elbow).normalize();
    wq = q2
      .setFromUnitVectors(S.axis.copy(r.foreAxis).applyQuaternion(wq), desired)
      .multiply(wq);
    const handTarget = this.handRotation(r, target, S.hand);
    const handFromFore = S.fromFore.copy(wq).multiply(r.restHand);
    // Twist of the target about the forearm axis, relative to the forearm.
    const delta = S.delta.copy(handTarget).multiply(handFromFore.invert());
    const along =
      desired.x * delta.x + desired.y * delta.y + desired.z * delta.z;
    const twist = S.twist
      .set(desired.x * along, desired.y * along, desired.z * along, delta.w)
      .normalize();
    // Keep the shortest twist, and give the forearm most of it.
    if (twist.w < 0) twist.set(-twist.x, -twist.y, -twist.z, -twist.w);
    const sine = Math.hypot(twist.x, twist.y, twist.z);
    const dot = twist.x * desired.x + twist.y * desired.y + twist.z * desired.z;
    const angle = 2 * Math.atan2(sine, twist.w) * Math.sign(dot || 1);
    wq = q3.setFromAxisAngle(desired, angle * 0.85).multiply(wq);
    r.fore.quaternion.copy(
      rootRotation(r.fore.parent, rootInv, S.parent).invert().multiply(wq),
    );
    r.fore.updateMatrixWorld(true);
    // Hand: exact target frame.
    r.hand.quaternion.copy(
      rootRotation(r.hand.parent, rootInv, S.parent)
        .invert()
        .multiply(handTarget),
    );
    r.hand.updateMatrixWorld(true);
    this.pose(r, pose);
  }

  handRotation(r, target, out) {
    const { f, l, n } = orthoFrame(
      target.forward,
      target.lateral,
      r.side,
      S.frame,
    );
    return frameRotation(
      r.handFrame.f,
      r.handFrame.l,
      r.handFrame.n,
      f,
      l,
      n,
      out,
    );
  }

  /** Finger curls: { thumb: [base, swing, j1, j2], index: [j0, j1, j2], ... } */
  pose(r, pose = {}) {
    const spread = pose.spread ?? 0;
    // The hand axes (lateral, palm, forward) of the two hands are mirror
    // images, and a mirrored rotation turns the other way: the angles are
    // authored for the left hand and negated for the right one.
    const m = r.side === "right" ? -1 : 1;
    for (const f of FINGERS) {
      const curls = pose[DIGIT_NAMES[f]] || DEFAULT_CURL;
      for (let i = 0; i < 3; i++) {
        const joint = r.fingers[JOINTS[f][i]];
        if (!joint) continue;
        joint.bone.quaternion
          .copy(joint.rest)
          .multiply(q1.setFromAxisAngle(joint.lateral, -m * (curls[i] || 0)));
        // Slight fan: outer fingers splay away from the middle one.
        if (i === 0 && spread)
          joint.bone.quaternion.multiply(
            q2.setFromAxisAngle(joint.palm, m * spread * (2.5 - f) * 0.12),
          );
      }
    }
    const thumb = pose.thumb || DEFAULT_THUMB;
    const base = r.fingers["0"],
      mid = r.fingers["01"],
      tip = r.fingers["02"];
    if (base) {
      base.bone.quaternion
        .copy(base.rest)
        .multiply(q1.setFromAxisAngle(base.forward, m * thumb[0]))
        .multiply(q2.setFromAxisAngle(base.palm, m * thumb[1]));
    }
    if (mid)
      mid.bone.quaternion
        .copy(mid.rest)
        .multiply(q1.setFromAxisAngle(mid.lateral, -m * thumb[2]));
    if (tip)
      tip.bone.quaternion
        .copy(tip.rest)
        .multiply(q1.setFromAxisAngle(tip.lateral, -m * thumb[3]));
  }

  dispose() {
    // Geometry and textures are shared with the template.
    this.root.removeFromParent();
    this.material.dispose();
  }
}

export async function createArms(mobile = false) {
  const size = mobile ? 512 : 1024;
  const [[gltf, meta], color, normal, rough] = await Promise.all([
    loadArmsTemplate(),
    armsTexture("color", size, true),
    armsTexture("normal", size, false),
    armsTexture("rough", size, false),
  ]);
  return new Arms(gltf, meta, { color, normal, rough });
}
