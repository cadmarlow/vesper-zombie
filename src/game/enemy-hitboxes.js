import * as T from "three";
import { LIMBS } from "../horde/dismember.js";

const scale = new T.Vector3();
const parts = [
  { bone: "head", offset: [0, 0.035, 0.005], y: 1.8, radius: 0.21, head: true },
  { bone: "torso", offset: [0, -0.08, 0], y: 1.27, radius: 0.34, head: false },
  { bone: "hips", offset: [0, -0.23, 0], y: 0.65, radius: 0.27, head: false },
];

// Broad, forgiving volumes follow the displayed pose, including the peer's
// interpolated pose. Update once per shot, not once per shotgun pellet.
export function updateEnemyHitVolumes(model) {
  const data = model.userData;
  if (data.hitParts) return updateBodyVolumes(model);
  const volumes = (data.hitVolumes ||= parts.map((part) => ({
    sphere: new T.Sphere(),
    head: part.head,
  })));
  model.updateWorldMatrix(true, true);
  model.getWorldScale(scale);
  const radiusScale = Math.max(scale.x, scale.y, scale.z);
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i],
      bone = data[part.bone],
      sphere = volumes[i].sphere;
    if (bone)
      sphere.center.fromArray(part.offset).applyMatrix4(bone.matrixWorld);
    else sphere.center.set(0, part.y, 0).applyMatrix4(model.matrixWorld);
    sphere.radius = part.radius * radiusScale;
  }
  return volumes;
}

export function enemyImpactPosition(model, head, target) {
  return target.copy(updateEnemyHitVolumes(model)[head ? 0 : 1].sphere.center);
}

// Motion-captured bodies: volumes centred on the vertices each bone drives,
// measured once per character pack (see horde/library.js).
function updateBodyVolumes(model) {
  const data = model.userData;
  const volumes = (data.hitVolumes ||= data.hitParts.map((part) => ({
    sphere: new T.Sphere(),
    head: part.head,
    part,
    bone: model.getObjectByName(part.bone),
  })));
  model.updateWorldMatrix(true, true);
  model.getWorldScale(scale);
  const radiusScale = Math.max(scale.x, scale.y, scale.z);
  for (const volume of volumes) {
    if (!volume.bone) continue;
    volume.sphere.center
      .copy(volume.part.offset)
      .applyMatrix4(volume.bone.matrixWorld);
    volume.sphere.radius = volume.part.radius * radiusScale;
  }
  // A destroyed head or a lost lower leg can no longer be hit.
  if (data.headDestroyed) volumes[0].sphere.radius = 0;
  const cuts = data.cuts || 0;
  if (cuts)
    for (const volume of volumes) {
      const part = volume.part;
      if (
        (part.leg && part.lower && cuts & LIMBS.legs.bit) ||
        (part.arm &&
          (cuts & LIMBS[`arm${part.arm}`].bit ||
            (part.lower && cuts & LIMBS[`forearm${part.arm}`].bit)))
      )
        volume.sphere.radius = 0;
    }
  return volumes;
}
