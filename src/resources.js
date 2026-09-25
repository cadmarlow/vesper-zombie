/**
 * Dispose resources owned by one model. Shared surfaces (textures, and the
 * armory's geometries and finish materials) belong to the app.
 */
export function disposeModel(root) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  const skeletons = new Set();
  root.traverse((object) => {
    if (object.isInstancedMesh) object.dispose();
    if (object.skeleton) skeletons.add(object.skeleton);
    if (object.geometry) geometries.add(object.geometry);
    for (const material of Array.isArray(object.material)
      ? object.material
      : object.material
        ? [object.material]
        : []) {
      materials.add(material);
      for (const value of Object.values(material))
        if (value?.isTexture) textures.add(value);
    }
  });
  for (const skeleton of skeletons) skeleton.dispose();
  for (const geometry of geometries)
    if (!geometry.userData.sharedSurface) geometry.dispose();
  for (const material of materials)
    if (!material.userData.sharedSurface) material.dispose();
  for (const texture of textures)
    if (!texture.userData.sharedSurface) texture.dispose();
}
