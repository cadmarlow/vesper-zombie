import * as T from "three";

// Scanned, CC0 surfaces, bundled locally. Mobile decodes a quarter of the pixels.
// Textures are shared for the lifetime of the renderer, never disposed by a prop.
const libraries = new Map();
let active = null;
const qualityMaps = new WeakMap();
export async function prepareSurfaces(mobile = false) {
  const size = mobile ? 512 : 1024;
  if (!libraries.has(size)) {
    const loader = new T.TextureLoader();
    libraries.set(
      size,
      Promise.all(
        ["stone", "floor", "metal", "wood", "cloth"].map(async (name) => {
          const maps = await Promise.all(
            ["color", "normal", "arm"].map(async (channel) => {
              const texture = await loader.loadAsync(
                `/textures/${name}-${channel}-${size}.webp`,
              );
              texture.colorSpace =
                channel === "color" ? T.SRGBColorSpace : T.NoColorSpace;
              texture.wrapS = texture.wrapT = T.RepeatWrapping;
              texture.anisotropy = 4;
              texture.userData.sharedSurface = true;
              return texture;
            }),
          );
          return [name, maps];
        }),
      )
        .then((entries) => new Map(entries))
        .catch((error) => {
          libraries.delete(size);
          throw error;
        }),
    );
  }
  active = await libraries.get(size);
}

export function surface(name, color = 0xffffff, options = {}) {
  const maps = active?.get(name);
  const m = new T.MeshStandardMaterial({
    color,
    roughness: 1,
    metalness: name === "metal" ? 0.8 : 0,
    ...(maps
      ? {
          map: maps[0],
          normalMap: maps[1],
          roughnessMap: maps[2],
          metalnessMap: name === "metal" ? maps[2] : null,
          aoMap: maps[2],
          aoMapIntensity: 0.7,
          normalScale: new T.Vector2(0.75, 0.75),
        }
      : {}),
    ...options,
  });
  return m;
}

export function worldSurface(name, color, meters, options = {}) {
  const m = surface(name, color, options);
  m.userData.worldMeters = meters;
  return m;
}

// Project in world metres before batching: a thirty-metre wall must not stretch
// the same UV square as a small brick. No per-pixel triplanar shader is needed.
export function projectSurfaceUV(geometry, meters) {
  const pos = geometry.attributes.position,
    normal = geometry.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(normal.getX(i)),
      ny = Math.abs(normal.getY(i)),
      nz = Math.abs(normal.getZ(i));
    if (ny >= nx && ny >= nz) {
      uv[i * 2] = pos.getX(i) / meters;
      uv[i * 2 + 1] = -pos.getZ(i) / meters;
    } else {
      uv[i * 2] = (nx > nz ? -pos.getZ(i) : pos.getX(i)) / meters;
      uv[i * 2 + 1] = pos.getY(i) / meters;
    }
  }
  geometry.setAttribute("uv", new T.BufferAttribute(uv, 2));
}

export function setSurfaceQuality(root, quality) {
  root.traverse((o) => {
    for (const m of Array.isArray(o.material)
      ? o.material
      : o.material
        ? [o.material]
        : []) {
      if (!m.isMeshStandardMaterial) continue;
      if (!qualityMaps.has(m))
        qualityMaps.set(m, {
          normalMap: m.normalMap,
          aoMap: m.aoMap,
          bumpMap: m.bumpMap,
        });
      const original = qualityMaps.get(m);
      for (const name of ["normalMap", "aoMap", "bumpMap"]) {
        const next = quality === "low" ? null : original[name];
        if (m[name] !== next) {
          m[name] = next;
          m.needsUpdate = true;
        }
      }
    }
  });
}
