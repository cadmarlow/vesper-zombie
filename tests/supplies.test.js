import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { Box3, Vector3, Matrix4 } from "three";

const root = "public/models/supplies/";
const manifest = JSON.parse(fs.readFileSync(root + "manifest.json"));
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const ids = [
  "pickup-health",
  "pickup-ammo",
  "pickup-double",
  "pickup-insta",
  "machine-health",
  "machine-speed",
  "machine-rate",
  "machine-focus",
];

test("every pickup and dispenser ships full and mobile meshes with preserved semantic finishes and UVs", async () => {
  for (const id of ids)
    for (const mobile of [false, true]) {
      const doc = await io.read(`${root}${id}${mobile ? "-mobile" : ""}.glb`);
      const names = new Set(
        doc
          .getRoot()
          .listMaterials()
          .map((m) => m.getName()),
      );
      for (const name of ["paint", "metal", "light"])
        assert.ok(names.has(name), `${id}: ${name} must survive compression`);
      if (id.startsWith("machine-")) assert.ok(names.has("print"));
      assert.ok(
        doc
          .getRoot()
          .listNodes()
          .some((n) => n.getExtras().supply === id),
      );
      for (const mesh of doc.getRoot().listMeshes())
        for (const p of mesh.listPrimitives()) {
          assert.ok(p.getAttribute("POSITION"));
          assert.ok(p.getAttribute("NORMAL"));
          assert.ok(
            p.getAttribute("TEXCOORD_0"),
            `${id}: atlas UVs are required by the runtime finish`,
          );
          if (p.getMaterial().getName() !== "print")
            assert.ok(p.getAttribute("TEXCOORD_1"), `${id}: detail UVs`);
          for (const name of ["POSITION", "NORMAL", "TEXCOORD_0"])
            for (const v of p.getAttribute(name).getArray())
              assert.ok(Number.isFinite(v));
        }
    }
});

test("new machine geometry fits the existing collision footprints and pickups remain readable objects", async () => {
  for (const id of ids) {
    const doc = await io.read(`${root}${id}.glb`),
      bounds = new Box3();
    for (const node of doc.getRoot().listNodes()) {
      if (!node.getMesh()) continue;
      const matrix = new Matrix4().fromArray(node.getWorldMatrix());
      for (const p of node.getMesh().listPrimitives()) {
        const pos = p.getAttribute("POSITION");
        for (let i = 0; i < pos.getCount(); i++)
          bounds.expandByPoint(
            new Vector3().fromArray(pos.getElement(i, [])).applyMatrix4(matrix),
          );
      }
    }
    const size = bounds.getSize(new Vector3());
    if (id.startsWith("machine-")) {
      assert.ok(
        size.x <= 1.6 && size.z <= 1.5 && bounds.max.y <= 2.73,
        `${id}: ${size.toArray()}`,
      );
      assert.ok(size.y > 2.2);
    } else
      assert.ok(
        size.x > 0.4 &&
          size.x < 0.9 &&
          size.y > 0.25 &&
          size.y < 0.8 &&
          size.z < 0.6,
        `${id}: ${size.toArray()}`,
      );
  }
});

test("mobile variants reduce geometry, and each asset has both wear-map resolutions within the download budget", () => {
  let desktop = 0,
    mobile = 0;
  for (const id of ids) {
    const entry = manifest.assets[id];
    assert.ok(
      entry.mobileTriangles < entry.triangles,
      `${id}: mobile complexity`,
    );
    assert.ok(entry.triangles < (id.startsWith("machine-") ? 35000 : 16000));
    assert.ok(entry.meshes <= (id === "machine-focus" ? 8 : 7));
    assert.equal(fs.statSync(`${root}${id}.glb`).size, entry.bytes);
    assert.equal(
      fs.statSync(`${root}${id}-mobile.glb`).size,
      entry.mobileBytes,
    );
    for (const size of id.startsWith("machine-") ? [1024, 512] : [512, 256])
      assert.ok(fs.statSync(`${root}${id}-wear-${size}.webp`).size > 100);
    desktop += entry.bytes;
    mobile += entry.mobileBytes;
  }
  assert.ok(desktop < 4 * 1024 * 1024);
  assert.ok(mobile < 3 * 1024 * 1024);
});
