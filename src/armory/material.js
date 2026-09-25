import * as T from "three";

// Weapon surfaces. Each weapon has a wear map baked offline in its unique
// UV atlas (scripts/armory/blender/kit.py): R ambient occlusion, G convex
// edges, B cavities. The standard PBR material turns it into edge wear,
// grime and crevice darkening, adds tiling detail normals and fingerprints
// on the second UV set, and hosts the animated transfiguration camouflage.
// One shader program serves every finish; finishes differ by uniforms/maps.

const UV_RANGE = 16; // matches kit.UV_RANGE
const MAPS = ["grunge", "micro", "stipple", "checker", "wood"];
let library = null;
let libraryKey = "";

export function prepareArmoryMaps(mobile = false) {
  const size = mobile ? 256 : 512;
  const key = String(size);
  if (library && libraryKey === key) return library;
  libraryKey = key;
  const loader = new T.TextureLoader();
  library = Promise.all(
    MAPS.map((name) =>
      loader
        .loadAsync(`/textures/armory/${name}-${size}.webp`)
        .then((texture) => {
          texture.wrapS = texture.wrapT = T.RepeatWrapping;
          texture.colorSpace =
            name === "wood" ? T.SRGBColorSpace : T.NoColorSpace;
          texture.anisotropy = 8;
          texture.userData.sharedSurface = true;
          return [name, texture];
        })
        .catch((error) => {
          console.warn(`Armory detail map unavailable: ${name}`, error);
          return [name, null];
        }),
    ),
  ).then((entries) => {
    const maps = Object.fromEntries(entries);
    if (entries.some(([, t]) => !t)) library = null;
    return maps;
  });
  return library;
}

/** Surface presets, keyed by the material names written by the Blender kit. */
export const FINISHES = {
  // Black nitride slide and carbon steel parts.
  steel: {
    color: 0x2f3235,
    metalness: 0.9,
    roughness: 0.36,
    detail: "micro",
    tile: 1.2,
    normal: 0.32,
    edge: 0xc7cacb,
    edgeMetal: 1,
    edgeRough: 0.22,
    wear: 0.85,
    cavity: 0.6,
    smudge: 0.45,
    ao: 1,
  },
  steel_dark: {
    color: 0x17191b,
    metalness: 0.85,
    roughness: 0.42,
    detail: "micro",
    tile: 1.2,
    normal: 0.3,
    edge: 0xaeb2b4,
    edgeMetal: 1,
    edgeRough: 0.25,
    wear: 0.75,
    cavity: 0.55,
    smudge: 0.45,
    ao: 1,
  },
  // Stainless: barrels, bushings, triggers, screws.
  steel_bright: {
    color: 0xaeb2b5,
    metalness: 1,
    roughness: 0.22,
    detail: "micro",
    tile: 1.6,
    normal: 0.22,
    edge: 0xe3e5e6,
    edgeMetal: 1,
    edgeRough: 0.14,
    wear: 0.4,
    cavity: 0.7,
    smudge: 0.55,
    ao: 1,
  },
  // Cerakoted aluminium: frames and receivers.
  alloy: {
    color: 0x1d1e20,
    metalness: 0.18,
    roughness: 0.58,
    detail: "micro",
    tile: 1.0,
    normal: 0.22,
    edge: 0x9ea2a6,
    edgeMetal: 0.95,
    edgeRough: 0.3,
    wear: 0.9,
    cavity: 0.5,
    smudge: 0.3,
    ao: 1,
  },
  // Gunmetal cerakote: sniper chassis.
  alloy_grey: {
    color: 0x3b3f43,
    metalness: 0.22,
    roughness: 0.5,
    detail: "micro",
    tile: 1.0,
    normal: 0.22,
    edge: 0xa9adb1,
    edgeMetal: 0.95,
    edgeRough: 0.3,
    wear: 0.85,
    cavity: 0.55,
    smudge: 0.3,
    ao: 1,
  },
  polymer: {
    color: 0x1b1c1d,
    metalness: 0,
    roughness: 0.62,
    detail: "stipple",
    tile: 0.6,
    normal: 0.18,
    edge: 0x3b3e41,
    edgeMetal: 0,
    edgeRough: 0.45,
    wear: 0.6,
    cavity: 0.45,
    smudge: 0.35,
    ao: 1,
  },
  polymer_grip: {
    color: 0x1a1b1c,
    metalness: 0,
    roughness: 0.74,
    detail: "stipple",
    tile: 1.4,
    normal: 0.75,
    edge: 0x35383b,
    edgeMetal: 0,
    edgeRough: 0.55,
    wear: 0.5,
    cavity: 0.4,
    smudge: 0.2,
    ao: 1,
  },
  polymer_tan: {
    color: 0x6f5e47,
    metalness: 0,
    roughness: 0.64,
    detail: "stipple",
    tile: 0.6,
    normal: 0.16,
    edge: 0x9a8a72,
    edgeMetal: 0,
    edgeRough: 0.5,
    wear: 0.6,
    cavity: 0.55,
    smudge: 0.3,
    ao: 1,
  },
  rubber: {
    color: 0x151515,
    metalness: 0,
    roughness: 0.86,
    detail: "stipple",
    tile: 1.8,
    normal: 0.5,
    edge: 0x262626,
    edgeMetal: 0,
    edgeRough: 0.8,
    wear: 0.3,
    cavity: 0.35,
    smudge: 0.1,
    ao: 1,
  },
  g10: {
    color: 0x2c2f29,
    metalness: 0,
    roughness: 0.55,
    detail: "checker",
    tile: 1.3,
    normal: 0.85,
    edge: 0x585c52,
    edgeMetal: 0,
    edgeRough: 0.4,
    wear: 0.5,
    cavity: 0.5,
    smudge: 0.25,
    ao: 1,
  },
  wood: {
    color: 0xffffff,
    metalness: 0,
    roughness: 0.38,
    map: "wood",
    mapTile: 0.22,
    detail: "micro",
    tile: 0.8,
    normal: 0.1,
    edge: 0x5a3219,
    edgeMetal: 0,
    edgeRough: 0.28,
    wear: 0.45,
    cavity: 0.55,
    smudge: 0.3,
    ao: 1,
  },
  brass: {
    color: 0xc4943f,
    metalness: 1,
    roughness: 0.28,
    detail: "micro",
    tile: 2,
    normal: 0.12,
    edge: 0xf0cd84,
    edgeMetal: 1,
    edgeRough: 0.18,
    wear: 0.4,
    cavity: 0.6,
    smudge: 0.4,
    ao: 1,
  },
  copper: {
    color: 0xc0714a,
    metalness: 1,
    roughness: 0.3,
    detail: "micro",
    tile: 2,
    normal: 0.1,
    edge: 0xe9a07a,
    edgeMetal: 1,
    edgeRough: 0.2,
    wear: 0.3,
    cavity: 0.5,
    smudge: 0.3,
    ao: 1,
  },
  shell_red: {
    color: 0x8a1a14,
    metalness: 0,
    roughness: 0.46,
    detail: "micro",
    tile: 2,
    normal: 0.25,
    edge: 0xb8392c,
    edgeMetal: 0,
    edgeRough: 0.35,
    wear: 0.4,
    cavity: 0.5,
    smudge: 0.3,
    ao: 1,
  },
  gold: {
    color: 0xd29a3c,
    metalness: 1,
    roughness: 0.22,
    detail: "micro",
    tile: 1.5,
    normal: 0.12,
    edge: 0xffdc8f,
    edgeMetal: 1,
    edgeRough: 0.14,
    wear: 0.4,
    cavity: 0.6,
    smudge: 0.35,
    ao: 1,
  },
  bone: {
    color: 0xd6d0bf,
    metalness: 0,
    roughness: 0.5,
    detail: "micro",
    tile: 1,
    normal: 0.1,
    edge: 0xefe9d8,
    edgeMetal: 0,
    edgeRough: 0.4,
    wear: 0.2,
    cavity: 0.6,
    smudge: 0.2,
    ao: 1,
  },
  cloth: {
    color: 0x2d2f28,
    metalness: 0,
    roughness: 0.92,
    detail: "stipple",
    tile: 2,
    normal: 0.3,
    edge: 0x3d4036,
    edgeMetal: 0,
    edgeRough: 0.9,
    wear: 0.2,
    cavity: 0.4,
    smudge: 0,
    ao: 1,
  },
  obsidian: {
    color: 0x07080a,
    metalness: 0.4,
    roughness: 0.14,
    detail: "micro",
    tile: 1,
    normal: 0.12,
    edge: 0x2a2e36,
    edgeMetal: 0.6,
    edgeRough: 0.1,
    wear: 0.3,
    cavity: 0.4,
    smudge: 0.3,
    ao: 1,
  },
  // Self-lit parts: sights, fibres, energy.
  tritium: {
    color: 0x0c140a,
    emissive: 0x7dff4a,
    emissiveIntensity: 2.4,
    roughness: 0.3,
    ao: 0,
  },
  fiber: {
    color: 0x2a0c02,
    emissive: 0xff5a14,
    emissiveIntensity: 1.8,
    roughness: 0.3,
    ao: 0,
  },
  emitter: {
    color: 0x04100d,
    emissive: 0x5dffd8,
    emissiveIntensity: 2.6,
    roughness: 0.3,
    ao: 0,
  },
  lens: { color: 0x020303, metalness: 0.2, roughness: 0.04, ao: 0.4 },
  glass: { color: 0x0a0f0e, metalness: 0.1, roughness: 0.05, ao: 0.4 },
};

const shared = {
  time: { value: 0 },
};
/** Advance the animated finishes (camouflage, energy). */
export function tickArmory(time) {
  shared.time.value = time;
}

// Transfiguration tiers: vein colour, glow, base tint.
export const CAMO = [
  null,
  { vein: 0xffa53a, glow: 2.2, base: 0x14100d, rim: 0xff7a1a },
  { vein: 0xc050ff, glow: 2.3, base: 0x100c14, rim: 0x8a3dff },
  { vein: 0x6ff6ff, glow: 2.5, base: 0x0a1215, rim: 0x3fd8ff },
];

const VERTEX_HEAD = `
#ifndef USE_UV1
attribute vec2 uv1;
#endif
varying vec2 vWearUv;
varying vec2 vArmoryUv;
varying vec3 vArmoryPos;
`;
const VERTEX_BODY = `
vWearUv = uv;
vArmoryUv = uv1 * ${UV_RANGE.toFixed(1)};
vArmoryPos = position;
`;
const FRAGMENT_HEAD = `
varying vec2 vWearUv;
varying vec2 vArmoryUv;
#ifdef USE_WEAR
uniform sampler2D wearMap;
#endif
varying vec3 vArmoryPos;
uniform sampler2D grungeMap;
uniform vec4 wearParams; // wear, cavity, smudge, ao
uniform vec3 edgeColor;
uniform vec2 edgeSurface; // metalness, roughness of the worn edge
uniform float grungeTile;
uniform float armoryTime;
#ifdef USE_CAMO
uniform vec3 camoVein;
uniform vec3 camoBase;
uniform vec3 camoRim;
uniform float camoGlow;
float camoHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float camoNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(camoHash(i), camoHash(i + vec3(1,0,0)), f.x), mix(camoHash(i + vec3(0,1,0)), camoHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(camoHash(i + vec3(0,0,1)), camoHash(i + vec3(1,0,1)), f.x), mix(camoHash(i + vec3(0,1,1)), camoHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
#endif
`;
const FRAGMENT_COLOR = `
vec4 grunge = texture2D(grungeMap, vArmoryUv * grungeTile);
#ifdef USE_WEAR
vec3 armoryBake = texture2D(wearMap, vWearUv).rgb;
float armoryAo = armoryBake.r;
float armoryEdge = armoryBake.g;
float armoryCavity = armoryBake.b;
#else
float armoryAo = 1.0, armoryEdge = 0.0, armoryCavity = 0.0;
#endif
// Edge wear follows convex edges, broken up by grain and mottling.
float armoryWear = smoothstep(0.25, 0.75, armoryEdge * wearParams.x * (0.45 + grunge.a * 1.1) + (grunge.b - 0.5) * 0.35);
// Fine scratches catch light over the whole finish, stronger near edges.
armoryWear = max(armoryWear, grunge.g * wearParams.x * (0.12 + armoryEdge * 0.5));
float armoryGrime = clamp(armoryCavity * 1.3 + (1.0 - armoryAo) * 0.45, 0.0, 1.0) * wearParams.y;
diffuseColor.rgb = mix(diffuseColor.rgb, edgeColor, armoryWear);
diffuseColor.rgb *= 1.0 - armoryGrime * 0.55;
diffuseColor.rgb *= 0.92 + grunge.a * 0.16;
#ifdef USE_CAMO
// Transfiguration: blackened, faintly iridescent metal crossed by thin
// cracks of light that drift slowly along the weapon.
vec3 cp = vArmoryPos * 13.0 + vec3(0.0, 0.0, armoryTime * 0.12);
float warp = camoNoise(cp * 0.5 + armoryTime * 0.05);
float veins = camoNoise(cp + warp * 1.8);
veins = 1.0 - abs(veins * 2.0 - 1.0);
veins = smoothstep(0.9, 0.985, veins);
float pulse = 0.55 + 0.45 * sin(armoryTime * 1.4 + vArmoryPos.z * 18.0);
vec3 sheen = 0.5 + 0.5 * cos(6.2832 * (vec3(0.0, 0.33, 0.67) + dot(vArmoryPos, vec3(3.0, 5.0, 2.0))));
diffuseColor.rgb = mix(camoBase + sheen * 0.02, diffuseColor.rgb * 0.6, 0.45);
#endif
`;
const FRAGMENT_SURFACE = `
roughnessFactor = mix(roughnessFactor, edgeSurface.y, armoryWear);
metalnessFactor = mix(metalnessFactor, edgeSurface.x, armoryWear);
roughnessFactor = mix(roughnessFactor, 0.92, armoryGrime * 0.6);
// Smudges and fingerprints polish or dull the finish in patches.
roughnessFactor *= mix(1.0, 0.72 + grunge.r * 0.62, wearParams.z);
roughnessFactor = clamp(roughnessFactor, 0.04, 1.0);
`;
const FRAGMENT_EMISSIVE = `
#ifdef USE_CAMO
float camoFresnel = pow(1.0 - saturate(dot(normalize(vNormal), normalize(vViewPosition))), 3.0);
totalEmissiveRadiance += camoVein * veins * camoGlow * pulse * (1.0 - armoryGrime * 0.5);
totalEmissiveRadiance += camoRim * camoFresnel * 0.12 * camoGlow;
#endif
`;
const FRAGMENT_OCCLUSION = `
{
  float occlusion = mix(1.0, armoryAo, wearParams.w);
  reflectedLight.indirectDiffuse *= occlusion;
  reflectedLight.indirectSpecular *= occlusion * occlusion;
  // No shadow maps on the view model: occlusion also grounds direct light
  // in crevices, under the slide and inside the guard.
  reflectedLight.directDiffuse *= mix(1.0, occlusion, 0.7);
  reflectedLight.directSpecular *= mix(1.0, occlusion, 0.55);
}
`;

const cache = new Map();

/**
 * Material for one finish. Materials are cached per finish, camouflage tier
 * and wear availability, and shared by every weapon model of a session.
 */
export function armoryMaterial(name, maps, { camo = 0, wearMap = null } = {}) {
  const base = name.replace(/\.\d+$/, "");
  const f = FINISHES[base] || FINISHES.steel;
  const tier = f.emissive ? 0 : camo;
  const wear = !!wearMap;
  const key = `${base}|${tier}|${wearMap?.uuid || "-"}`;
  if (cache.has(key)) return cache.get(key);
  const material = new T.MeshStandardMaterial({
    color: f.color,
    metalness: f.metalness ?? 0,
    roughness: f.roughness ?? 0.5,
    emissive: f.emissive ?? 0x000000,
    emissiveIntensity: f.emissiveIntensity ?? 1,
  });
  material.name = `armory-${base}`;
  const detail = f.detail && maps?.[f.detail];
  if (detail) {
    const n = detail.clone();
    n.channel = 1;
    n.repeat.setScalar(UV_RANGE * f.tile);
    n.userData.sharedSurface = true;
    material.normalMap = n;
    material.normalScale.setScalar(f.normal);
  }
  if (f.map && maps?.[f.map]) {
    const m = maps[f.map].clone();
    m.channel = 1;
    m.repeat.setScalar(UV_RANGE * f.mapTile);
    m.userData.sharedSurface = true;
    material.map = m;
  }
  const camoTier = CAMO[tier];
  const uniforms = {
    wearMap: { value: wearMap },
    grungeMap: { value: maps?.grunge || null },
    wearParams: {
      value: new T.Vector4(
        f.wear ?? 0,
        f.cavity ?? 0,
        f.smudge ?? 0,
        f.ao ?? 1,
      ),
    },
    edgeColor: { value: new T.Color(f.edge ?? f.color) },
    edgeSurface: {
      value: new T.Vector2(
        f.edgeMetal ?? f.metalness ?? 0,
        f.edgeRough ?? f.roughness ?? 0.5,
      ),
    },
    grungeTile: { value: 0.45 },
    armoryTime: shared.time,
    camoVein: { value: new T.Color(camoTier?.vein ?? 0) },
    camoBase: { value: new T.Color(camoTier?.base ?? 0) },
    camoRim: { value: new T.Color(camoTier?.rim ?? 0) },
    camoGlow: { value: camoTier?.glow ?? 0 },
  };
  material.userData.armory = { finish: base, uniforms };
  material.userData.sharedSurface = true;
  if (wear) material.defines = { ...material.defines, USE_WEAR: "" };
  if (camoTier) material.defines = { ...material.defines, USE_CAMO: "" };
  const usable = !!uniforms.grungeMap.value;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    if (!usable) shader.defines.ARMORY_NO_GRUNGE = "";
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${VERTEX_HEAD}`)
      .replace("#include <uv_vertex>", `#include <uv_vertex>\n${VERTEX_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${FRAGMENT_HEAD}`)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>\n${usable ? FRAGMENT_COLOR : FRAGMENT_COLOR.replace("texture2D(grungeMap, vArmoryUv * grungeTile)", "vec4(0.5)")}`,
      )
      .replace(
        "#include <metalnessmap_fragment>",
        `#include <metalnessmap_fragment>\n${FRAGMENT_SURFACE}`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>\n${FRAGMENT_EMISSIVE}`,
      )
      .replace(
        "#include <aomap_fragment>",
        `#include <aomap_fragment>\n${FRAGMENT_OCCLUSION}`,
      );
  };
  material.customProgramCacheKey = () => `vesper-armory-3|${usable ? 1 : 0}`;
  cache.set(key, material);
  return material;
}

export function releaseArmoryMaterials() {
  for (const material of cache.values()) {
    material.userData.sharedSurface = false;
    material.normalMap?.dispose();
    material.map?.dispose();
    material.dispose();
  }
  cache.clear();
}

// ---------------------------------------------------------------- sights
// Reflex and holographic reticles are collimated: they appear at infinity,
// on the sight's axis. On the glass, a fragment shows the reticle where its
// view ray, measured in angle from that axis, meets the pattern. The dot
// stays on target when the weapon sways; aiming centres it exactly.
const RETICLES = { dot: 0, holo: 1, eclipse: 2 };
const reticleCache = new Map();
export function reticleMaterial(
  kind = "dot",
  { color = 0xff2b1c, mobile = false } = {},
) {
  const key = `${kind}|${color}|${mobile}`;
  if (reticleCache.has(key)) return reticleCache.get(key);
  const material = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      reticleColor: { value: new T.Color(color) },
      kind: { value: RETICLES[kind] ?? 0 },
      scale: { value: mobile ? 1.8 : 1 },
      brightness: { value: 1 },
      time: shared.time,
    },
    vertexShader: `
      varying vec3 vView, vF, vR, vU, vN;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = mv.xyz;
        vF = normalize((modelViewMatrix * vec4(0.0, 0.0, -1.0, 0.0)).xyz);
        vR = normalize((modelViewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
        vU = normalize((modelViewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
        vN = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 reticleColor; uniform float kind, scale, brightness, time;
      varying vec3 vView, vF, vR, vU, vN;
      float ring(float r, float radius, float width, float aa) {
        return 1.0 - smoothstep(width * 0.5 - aa, width * 0.5 + aa, abs(r - radius));
      }
      void main() {
        vec3 d = normalize(vView);
        float z = max(dot(d, vF), 1e-3);
        // Angular offset from the sight axis, in milliradians.
        vec2 a = vec2(dot(d, vR), dot(d, vU)) / z * 1000.0 / scale;
        float r = length(a);
        float aa = max(fwidth(r), 0.04);
        float m = 0.0;
        if (kind < 0.5) {
          m = 1.0 - smoothstep(1.1 - aa, 1.1 + aa, r);
          m += (1.0 - smoothstep(0.0, 3.2, r)) * 0.18;
        } else if (kind < 1.5) {
          m = 1.0 - smoothstep(0.55 - aa, 0.55 + aa, r);
          m = max(m, ring(r, 9.5, 0.9, aa));
          // Four ticks on the circle, the bottom one longer.
          float tick = step(abs(a.x), 0.45) * step(9.5, abs(a.y)) * step(abs(a.y), 12.0);
          tick += step(abs(a.y), 0.45) * step(9.5, abs(a.x)) * step(abs(a.x), 11.5);
          m = max(m, clamp(tick, 0.0, 1.0));
          m += (1.0 - smoothstep(0.0, 1.5, r)) * 0.2;
        } else {
          // Eclipse: a dark disc with a burning corona.
          float corona = ring(r, 4.5, 1.2, aa) + ring(r, 4.5, 3.5, aa * 3.0) * 0.35;
          float flicker = 0.85 + 0.15 * sin(time * 9.0 + atan(a.y, a.x) * 5.0);
          m = corona * flicker + (1.0 - smoothstep(0.35 - aa, 0.35 + aa, r));
        }
        // Coated glass: faint tint, brighter toward grazing angles.
        float fresnel = pow(1.0 - abs(dot(normalize(vN), -d)), 3.0);
        vec3 glass = mix(vec3(0.05, 0.09, 0.11), vec3(0.35, 0.5, 0.55), fresnel);
        float alpha = 0.08 + fresnel * 0.25;
        vec3 color = glass * alpha + reticleColor * m * 3.2 * brightness;
        gl_FragColor = vec4(color, clamp(alpha + m, 0.0, 1.0));
      }`,
  });
  material.name = `armory-reticle-${kind}`;
  material.userData.sharedSurface = true;
  material.extensions = { derivatives: true };
  reticleCache.set(key, material);
  return material;
}

/** Plain see-through glass (front element of a sight, scope lenses). */
let glassMaterial = null;
export function sightGlass() {
  glassMaterial ||= new T.MeshStandardMaterial({
    color: 0x0c1416,
    metalness: 0.1,
    roughness: 0.04,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    envMapIntensity: 1.6,
  });
  glassMaterial.userData.sharedSurface = true;
  return glassMaterial;
}
