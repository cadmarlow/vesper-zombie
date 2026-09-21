import * as T from "three";

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
