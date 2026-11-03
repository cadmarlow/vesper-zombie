import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  dedup,
  prune,
  quantize,
  meshopt,
  simplify,
} from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "../..");
const build = path.join(root, ".cache/supply-build");
const out = path.join(root, "public/models/supplies");
const blender =
  process.env.BLENDER ||
  path.join(root, ".cache/tools/Blender.app/Contents/MacOS/Blender");
fs.mkdirSync(build, { recursive: true });
fs.mkdirSync(out, { recursive: true });
const mobileOnly = process.argv.includes("--mobile-only");
const reuse = process.argv.includes("--reuse");
const ids = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const assets = ids.length
  ? ids
  : [
      "pickup-health",
      "pickup-ammo",
      "pickup-double",
      "pickup-insta",
      "machine-health",
      "machine-speed",
      "machine-rate",
      "machine-focus",
    ];
await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder });
const manifestFile = path.join(out, "manifest.json");
const manifest = fs.existsSync(manifestFile)
  ? JSON.parse(fs.readFileSync(manifestFile))
  : { version: 1, assets: {} };
for (const id of mobileOnly ? [] : assets) {
  const prefix = path.join(build, id);
  if (!reuse)
    execFileSync(
      blender,
      [
        "-b",
        "--factory-startup",
        "--python-exit-code",
        "1",
        "--python",
        path.join(root, "scripts/supplies/build.py"),
        "--",
        id,
        prefix,
      ],
      { stdio: ["ignore", "ignore", "inherit"] },
    );
  const report = JSON.parse(fs.readFileSync(prefix + ".json"));
  const doc = await io.read(prefix + ".glb");
  await doc.transform(
    dedup({ keepUniqueNames: true }),
    prune({ keepLeaves: true, keepExtras: true, keepAttributes: true }),
    quantize({
      quantizePosition: 16,
      quantizeNormal: 10,
      quantizeTexcoord: 12,
    }),
    meshopt({ encoder: MeshoptEncoder, level: "medium" }),
  );
  await io.write(path.join(out, id + ".glb"), doc);
  const maps = await Promise.all(
    ["ao", "edge", "cavity"].map((key) =>
      sharp(report.maps[key])
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true }),
    ),
  );
  const { width, height } = maps[0].info;
  const packed = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    const open = maps[2].data[i] / 255;
    packed[i * 3] = maps[0].data[i];
    packed[i * 3 + 1] = Math.round(maps[1].data[i] * open * open);
    packed[i * 3 + 2] = Math.round((1 - open) * 255);
  }
  for (const size of id.startsWith("machine-") ? [1024, 512] : [512, 256])
    await sharp(packed, { raw: { width, height, channels: 3 } })
      .resize(size, size)
      .webp({ quality: 90 })
      .toFile(path.join(out, `${id}-wear-${size}.webp`));
  manifest.assets[id] = {
    triangles: report.triangles,
    meshes: report.meshes,
    bytes: fs.statSync(path.join(out, id + ".glb")).size,
  };
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
  console.log(id, JSON.stringify(manifest.assets[id]));
}
await MeshoptSimplifier.ready;
for (const id of assets) {
  const doc = await io.read(path.join(build, id + ".glb"));
  await doc.transform(
    simplify({ simplifier: MeshoptSimplifier, ratio: 0.5, error: 0.004 }),
    dedup({ keepUniqueNames: true }),
    prune({ keepLeaves: true, keepExtras: true, keepAttributes: true }),
    quantize({
      quantizePosition: 16,
      quantizeNormal: 10,
      quantizeTexcoord: 12,
    }),
    meshopt({ encoder: MeshoptEncoder, level: "medium" }),
  );
  const triangles = doc
    .getRoot()
    .listMeshes()
    .reduce(
      (sum, m) =>
        sum +
        m
          .listPrimitives()
          .reduce(
            (n, p) =>
              n +
              (p.getIndices()?.getCount() ||
                p.getAttribute("POSITION").getCount()) /
                3,
            0,
          ),
      0,
    );
  const file = path.join(out, id + "-mobile.glb");
  await io.write(file, doc);
  Object.assign(manifest.assets[id], {
    mobileTriangles: triangles,
    mobileBytes: fs.statSync(file).size,
  });
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
  console.log(id + "-mobile", triangles);
}
