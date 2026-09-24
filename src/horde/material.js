import * as T from "three";

// Zombie surface on top of the pack's MeshStandardMaterial:
// - roughness/metalness map is the painted mask: R fresh-blood potential,
//   G roughness, B unused (metalness factor 0), A eye glow;
// - per instance: skin tint, fresh blood amount, eye glow colour and up to
//   WOUNDS bullet wounds stored in bind space, so they stay on the body
//   whatever the animation does.
// All instances share one program; only uniform values differ.

export const WOUNDS = 8;
const VERSION = "vesper-horde-surface-2";

export function hordeUniforms() {
  return {
    hordeTint: { value: new T.Color(1, 1, 1) },
    hordeBlood: { value: 0 },
    hordeEye: { value: new T.Color(1, 0.5, 0.1) },
    // Bullet paths in bind space: point on the path + radius, direction.
    // Wounds mark the body where it crosses the path (entry and exit).
    hordeWounds: {
      value: Array.from({ length: WOUNDS }, () => new T.Vector4(0, -10, 0, 0)),
    },
    hordeWoundDirs: {
      value: Array.from({ length: WOUNDS }, () => new T.Vector4(0, 0, 1, 0)),
    },
    hordeBurn: { value: 0 },
  };
}

/** Configure a shared template material; instances call instanceMaterial(). */
export function prepareHordeMaterial(material, { mobile = false } = {}) {
  material.userData.hordeMobile = mobile;
  material.onBeforeCompile = function (shader) {
    const u = this.userData.hordeUniforms || hordeUniforms();
    Object.assign(shader.uniforms, u);
    shader.defines ||= {};
    shader.defines.HORDE_WOUNDS = WOUNDS;
    if (this.userData.hordeMobile) shader.defines.HORDE_MOBILE = 1;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vHordeBind;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvHordeBind = position;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vHordeBind;
uniform vec3 hordeTint;
uniform float hordeBlood;
uniform vec3 hordeEye;
uniform vec4 hordeWounds[HORDE_WOUNDS];
uniform vec4 hordeWoundDirs[HORDE_WOUNDS];
uniform float hordeBurn;
float hordeHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float hordeNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hordeHash(i), hordeHash(i + vec3(1,0,0)), f.x),
                 mix(hordeHash(i + vec3(0,1,0)), hordeHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hordeHash(i + vec3(0,0,1)), hordeHash(i + vec3(1,0,1)), f.x),
                 mix(hordeHash(i + vec3(0,1,1)), hordeHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}`,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
vec4 hordeMask = texture2D(roughnessMap, vRoughnessMapUv);
diffuseColor.rgb *= hordeTint;
// Fresh blood grows from the painted potential with the instance level.
float hordeFresh = smoothstep(1.0 - hordeBlood, 1.0 - hordeBlood + 0.1, hordeMask.r);
float hordeClot = hordeNoise(vHordeBind * 38.0);
vec3 hordeBloodColor = mix(vec3(0.05, 0.006, 0.004), vec3(0.13, 0.008, 0.005), hordeClot);
diffuseColor.rgb = mix(diffuseColor.rgb, hordeBloodColor, hordeFresh * 0.9);
float hordeWet = hordeFresh;
// Bullet wounds: dark hole, raw rim, blood running down the body.
for (int i = 0; i < HORDE_WOUNDS; i++) {
  vec4 w = hordeWounds[i];
  if (w.w <= 0.0) continue;
  vec3 dir = hordeWoundDirs[i].xyz;
  vec3 rel = vHordeBind - w.xyz;
  float along = dot(rel, dir);
  // Distance to the bullet path, limited to the stretch crossing the body.
  vec3 d = rel - dir * along;
  d += dir * max(0.0, abs(along - 0.12) - 0.42);
  float r = w.w;
  float edge = hordeNoise(vHordeBind * 90.0 + float(i) * 7.0) * 0.45;
  float k = length(d) / r + edge;
  float hole = 1.0 - smoothstep(0.35, 0.6, k);
  float rim = (1.0 - smoothstep(0.6, 1.0, k)) - hole;
  float splash = (1.0 - smoothstep(1.0, 2.6, k)) * 0.55;
#ifndef HORDE_MOBILE
  float below = w.y - vHordeBind.y;
  float lateral = length(d.xz);
  float drip = (1.0 - smoothstep(r * 0.25, r * 0.9, lateral + hordeNoise(vHordeBind * vec3(60.0, 6.0, 60.0)) * 0.012))
    * step(0.0, below) * exp(-below / (0.09 + r * 2.0));
  splash = max(splash, drip * 0.9);
#endif
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.11, 0.007, 0.004), clamp(splash, 0.0, 1.0));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.22, 0.02, 0.012), clamp(rim, 0.0, 1.0) * 0.9);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.018, 0.002, 0.001), hole);
  hordeWet = max(hordeWet, max(rim, splash));
}
// Burning/charring for fire deaths and the corpse fade.
diffuseColor.rgb *= 1.0 - hordeBurn * 0.85;`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.28, hordeWet * 0.85);`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
totalEmissiveRadiance += hordeEye * pow(1.0 - hordeMask.a, 2.2);`,
      );
  };
  material.customProgramCacheKey = function () {
    return `${VERSION}:${this.userData.hordeMobile ? 1 : 0}`;
  };
  material.needsUpdate = true;
  return material;
}

/** Per-instance clone sharing textures and program. */
export function instanceMaterial(template) {
  const material = template.clone();
  material.onBeforeCompile = template.onBeforeCompile;
  material.customProgramCacheKey = template.customProgramCacheKey;
  material.userData.hordeMobile = template.userData.hordeMobile;
  material.userData.hordeUniforms = hordeUniforms();
  return material;
}

/** Record a bullet path in bind space (ring buffer of WOUNDS). */
export function addWound(material, bindPosition, bindDirection, radius) {
  const u = material.userData.hordeUniforms;
  if (!u) return;
  const index = (material.userData.hordeNextWound || 0) % WOUNDS;
  material.userData.hordeNextWound = index + 1;
  u.hordeWounds.value[index].set(
    bindPosition.x,
    bindPosition.y,
    bindPosition.z,
    radius,
  );
  u.hordeWoundDirs.value[index].set(
    bindDirection.x,
    bindDirection.y,
    bindDirection.z,
    0,
  );
}
