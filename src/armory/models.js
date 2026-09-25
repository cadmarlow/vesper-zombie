import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import {
  armoryMaterial,
  prepareArmoryMaps,
  reticleMaterial,
  sightGlass,
} from "./material.js";

// First-person and world weapon models built by scripts/armory/. A template
// is loaded once per weapon; instances clone the node tree and share
// geometry and materials. Moving parts are empties tagged with a `part`
// extra, attachment points are empties named socket_*.

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const templates = new Map();

export function weaponUrl(id) {
  return `/models/armory/${id}.glb`;
}

export function loadWeaponTemplate(id) {
  if (!templates.has(id)) {
    templates.set(
      id,
      loader.loadAsync(weaponUrl(id)).then(
        (gltf) => {
          gltf.scene.traverse((o) => {
            if (o.isMesh) o.geometry.userData.sharedSurface = true;
          });
          return gltf.scene;
        },
        (error) => {
          templates.delete(id);
          throw error;
        },
      ),
    );
  }
  return templates.get(id);
}

/** True once the template is in memory (a switch can then be instant). */
export function weaponTemplateReady(id) {
  return templates.get(id)?.settled === true;
}

export async function preloadWeapons(ids, mobile) {
  await prepareArmoryMaps(mobile);
  await Promise.all(
    ids.map((id) =>
      loadWeaponTemplate(id).then((scene) => {
        templates.get(id).settled = true;
        return scene;
      }),
    ),
  );
}

/**
 * A weapon instance: clone of the template with finish materials. The
 * returned group exposes its parts, sockets and part rest transforms.
 */
const wearMaps = new Map();
function loadWearMap(id, mobile) {
  const key = `${id}-${mobile ? 512 : 1024}`;
  if (!wearMaps.has(key))
    wearMaps.set(
      key,
      new T.TextureLoader()
        .loadAsync(`/models/armory/${key.replace(/-(\d+)$/, "-wear-$1")}.webp`)
        .then((texture) => {
          texture.colorSpace = T.NoColorSpace;
          texture.flipY = false;
          texture.anisotropy = 4;
          texture.userData.sharedSurface = true;
          return texture;
        })
        .catch((error) => {
          console.warn(`Weapon wear map unavailable: ${key}`, error);
          wearMaps.delete(key);
          return null;
        }),
    );
  return wearMaps.get(key);
}

// Resolved resources, for synchronous instancing (teammates, displays).
const resolved = { templates: new Map(), maps: new Map(), wear: new Map() };

export async function createWeapon(id, { camo = 0, mobile = false } = {}) {
  const [template, maps, wearMap] = await Promise.all([
    loadWeaponTemplate(id),
    prepareArmoryMaps(mobile),
    loadWearMap(id, mobile),
  ]);
  templates.get(id).settled = true;
  resolved.templates.set(id, template);
  resolved.maps.set(mobile, maps);
  resolved.wear.set(`${id}-${mobile}`, wearMap);
  return instantiate(id, template, maps, wearMap, camo, mobile);
}

/**
 * A weapon whose resources are already loaded (the view model streams every
 * weapon in at the start of a run), or null: callers keep a stand-in.
 */
export function createWeaponSync(id, { camo = 0, mobile = false } = {}) {
  const template = resolved.templates.get(id);
  const maps = resolved.maps.get(mobile) || resolved.maps.get(!mobile);
  if (!template || !maps) return null;
  const wearMap =
    resolved.wear.get(`${id}-${mobile}`) ||
    resolved.wear.get(`${id}-${!mobile}`) ||
    null;
  return instantiate(id, template, maps, wearMap, camo, mobile);
}

function instantiate(id, template, maps, wearMap, camo, mobile) {
  const root = template.clone(true);
  root.name = `armory-${id}`;
  const parts = {},
    sockets = {},
    meshes = [];
  root.traverse((o) => {
    if (o.userData.part) parts[o.userData.part] = o;
    if (o.name.startsWith("socket_")) sockets[o.name.slice(7)] = o;
    if (o.isMesh) {
      const name = o.material?.name || "steel";
      // Collimated sights carry their reticle kind as a node extra.
      const reticle = o.userData.reticle || o.parent?.userData.reticle;
      if (reticle) {
        o.material = reticleMaterial(reticle, {
          mobile,
          color: reticle === "eclipse" ? 0x6fffe0 : 0xff2b1c,
        });
        o.renderOrder = 2;
      } else if (name.startsWith("glass")) {
        o.material = sightGlass();
        o.renderOrder = 1;
      } else o.material = armoryMaterial(name, maps, { camo, wearMap });
      o.castShadow = false;
      o.receiveShadow = false;
      meshes.push(o);
    }
  });
  const rest = new Map();
  for (const p of Object.values(parts))
    rest.set(p, {
      position: p.position.clone(),
      quaternion: p.quaternion.clone(),
    });
  root.userData.armory = { id, camo, parts, sockets, meshes, rest };
  return root;
}

/** True once a weapon can be instanced synchronously. */
export function weaponLoaded(id) {
  return resolved.templates.has(id);
}

/** Restore every moving part to its modelled pose. */
export function resetParts(weapon) {
  const a = weapon.userData.armory;
  for (const [p, r] of a.rest) {
    p.position.copy(r.position);
    p.quaternion.copy(r.quaternion);
  }
}

/** Socket position in the weapon root's frame. */
export function socketPosition(weapon, name, target = new T.Vector3()) {
  const s = weapon.userData.armory.sockets[name];
  if (!s) return null;
  target.set(0, 0, 0);
  let o = s;
  const m = new T.Matrix4();
  // Accumulate local transforms up to (excluding) the weapon root.
  m.identity();
  const chain = [];
  while (o && o !== weapon) {
    chain.push(o);
    o = o.parent;
  }
  for (let i = chain.length - 1; i >= 0; i--) {
    chain[i].updateMatrix();
    m.multiply(chain[i].matrix);
  }
  return target.setFromMatrixPosition(m);
}
