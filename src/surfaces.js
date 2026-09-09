import * as T from "three";

// Scanned, CC0 surfaces, bundled locally. Mobile decodes a quarter of the pixels.
// Textures are shared for the lifetime of the renderer, never disposed by a prop.
const libraries = new Map();
let active = null;
const qualityMaps = new WeakMap();
const imageCache = new Map();
async function loadTexture(url, color = false) {
  if (!imageCache.has(url)) {
    imageCache.set(
      url,
      new T.TextureLoader()
        .loadAsync(url)
        .then((texture) => {
          texture.colorSpace = color ? T.SRGBColorSpace : T.NoColorSpace;
          texture.wrapS = texture.wrapT = T.RepeatWrapping;
          texture.anisotropy = 8;
          texture.userData.sharedSurface = true;
          return texture;
        })
        .catch((error) => {
          // A missing scan degrades that one surface to its flat material
          // instead of aborting the whole session. Retry on the next load.
          console.warn(`Surface texture unavailable: ${url}`, error);
          imageCache.delete(url);
          return null;
        }),
    );
  }
  return imageCache.get(url);
}
export async function prepareSurfaces(mobile = false, map = "abbey") {
  const size = mobile ? 512 : 1024;
  const key = `${size}-${map}`;
  if (!libraries.has(key)) {
    const names = [
      "stone",
      "floor",
      "metal",
      "wood",
      "cloth",
      ...(map === "abbey"
        ? ["ashlar", "plaster"]
        : map === "station"
          ? ["steel", "concrete", "plaster"]
          : ["steel"]),
    ];
    libraries.set(
      key,
      Promise.all(
        names.map(async (name) => {
          const maps = await Promise.all(
            ["color", "normal", "arm"].map(async (channel) => {
              const texture = await loadTexture(
                `/textures/${name}-${channel}-${size}.webp`,
                channel === "color",
              );
              return texture;
            }),
          );
          return [name, maps.every(Boolean) ? maps : null];
        }),
      )
        .then((entries) => new Map(entries))
        .catch((error) => {
          libraries.delete(key);
          throw error;
        }),
    );
  }
  active = await libraries.get(key);
  if (map === "abbey") {
    const glass = await loadTexture(
      `/textures/architecture/vesper-glass-${size}.webp`,
      true,
    );
    if (glass) {
      glass.wrapS = glass.wrapT = T.ClampToEdgeWrapping;
      active.set("stainedGlass", [glass]);
    }
  }
}

export const surfaceTexture = (name) => active?.get(name)?.[0];

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
  // Metre-scale damp and weathering break repetition independently of the scan.
  // A shared program is used by all architectural surfaces; no extra draw pass.
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vWeatherPosition;",
      )
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        #ifdef USE_INSTANCING
          vWeatherPosition=(modelMatrix*instanceMatrix*vec4(transformed,1.)).xyz;
        #else
          vWeatherPosition=(modelMatrix*vec4(transformed,1.)).xyz;
        #endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
      varying vec3 vWeatherPosition;
      float weatherNoise(vec2 p) { vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
        vec4 h=fract(sin(vec4(dot(i,vec2(127.1,311.7)),dot(i+vec2(1,0),vec2(127.1,311.7)),dot(i+vec2(0,1),vec2(127.1,311.7)),dot(i+1.,vec2(127.1,311.7))))*43758.5453);
        return mix(mix(h.x,h.y,f.x),mix(h.z,h.w,f.x),f.y); }
    `,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
      float macro=weatherNoise(vWeatherPosition.xz*.37+vWeatherPosition.y*.19);
      float damp=(1.-smoothstep(.12,2.6,vWeatherPosition.y))*smoothstep(.25,.78,macro);
      diffuseColor.rgb*=mix(vec3(.70,.73,.68),vec3(1.06,1.035,1.),macro);
      diffuseColor.rgb*=mix(vec3(1.),vec3(.55,.61,.53),damp*.58);
    `,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
      roughnessFactor=mix(roughnessFactor,max(.19,roughnessFactor*.5),damp*.58);
    `,
      );
  };
  m.customProgramCacheKey = () => "vesper-weathering-1";
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
