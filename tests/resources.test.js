import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { disposeModel } from "../src/resources.js";
import { prepareSurfaces } from "../src/surfaces.js";
import { survivorWeapon } from "../src/survivor.js";

test("disposing a model releases instance buffers and preserves shared textures", () => {
  const geometry = new T.BoxGeometry();
  const shared = new T.Texture();
  shared.userData.sharedSurface = true;
  const owned = new T.Texture();
  const material = new T.MeshBasicMaterial({ map: shared, alphaMap: owned });
  const model = new T.InstancedMesh(geometry, material, 2);
  const events = [];
  for (const [name, object] of Object.entries({
    model,
    geometry,
    material,
    shared,
    owned,
  }))
    object.addEventListener("dispose", () => events.push(name));
  disposeModel(model);
  assert.deepEqual(events.sort(), ["geometry", "material", "model", "owned"]);
});
test("failed surface channels are retried on the next load", async (t) => {
  let calls = 0;
  t.mock.method(console, "warn", () => {});
  t.mock.method(T.TextureLoader.prototype, "loadAsync", async () => {
    calls++;
    throw new Error("offline");
  });
  await prepareSurfaces(false, "station");
  const initial = calls;
  assert.equal(initial, 24);
  await prepareSurfaces(false, "station");
  assert.equal(calls, initial * 2);
});
test("switching a teammate weapon releases the old model instead of orphaning it", (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  const gradient = () => ({ addColorStop() {} });
  const context = new Proxy(
    {
      measureText: (text) => ({ width: text.length * 8 }),
      createLinearGradient: gradient,
      createRadialGradient: gradient,
      createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    },
    { get: (target, key) => target[key] || (() => {}) },
  );
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { createElement: () => ({ getContext: () => context }) },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "document", previous);
    else delete globalThis.document;
  });
  const survivor = new T.Group(),
    mount = new T.Group();
  survivor.add(mount);
  survivor.userData = {
    mount,
    grip: new T.Vector3(),
    foreGrip: new T.Vector3(),
  };
  const first = survivorWeapon(survivor, "vigil", false);
  let disposed = 0;
  first.traverse((object) =>
    object.geometry?.addEventListener("dispose", () => disposed++),
  );
  const next = survivorWeapon(survivor, "marauder", false);
  assert.notEqual(next, first);
  assert.equal(first.parent, null);
  assert.ok(disposed > 0);
  assert.equal(survivorWeapon(survivor, "marauder", false), next);
  disposeModel(survivor);
});
