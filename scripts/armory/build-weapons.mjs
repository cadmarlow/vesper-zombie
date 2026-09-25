// Builds public/models/armory/: the first-person weapons. Each weapon is
// modelled by a Blender script (scripts/armory/blender/weapon_<id>.py):
// filleted profiles, lathes and exact booleans, bevelled with weighted
// normals, unwrapped into one atlas whose wear map (ambient occlusion,
// convex edges, cavities) is baked with Cycles, plus box-projected UVs for
// the tiling detail maps. The GLB is then deduplicated, quantized and
// meshopt-compressed. Needs Blender 4.5 LTS: .cache/tools/Blender.app or
// BLENDER=/path/to/Blender.
//
//   node scripts/armory/build-weapons.mjs [id ...] [--preview]
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, quantize, meshopt } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";

/** R occlusion, G convex edges outside creases, B cavities. */
async function packWear(maps, id) {
  const read = async (file) => {
    const { data, info } = await sharp(file)
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  };
  const ao = await read(maps.ao),
    cavity = await read(maps.cavity),
    edge = await read(maps.edge);
  const { width, height } = ao;
  const out = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    const open = cavity.data[i] / 255;
    out[i * 3] = ao.data[i];
    out[i * 3 + 1] = Math.round(edge.data[i] * open * open);
    out[i * 3 + 2] = Math.round((1 - open) * 255);
  }
  for (const size of [1024, 512])
    await sharp(out, { raw: { width, height, channels: 3 } })
      .resize(size, size, { kernel: "lanczos3" })
      .webp({ quality: 92, smartSubsample: true })
      .toFile(path.join(OUT, `${id}-wear-${size}.webp`));
}

const ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../..",
);
const BLENDER =
  process.env.BLENDER ||
  path.join(ROOT, ".cache/tools/Blender.app/Contents/MacOS/Blender");
const BUILD = path.join(ROOT, ".cache/armory-build");
const OUT = path.join(ROOT, "public/models/armory");
export const WEAPON_IDS = [
  "vigil",
  "spectre",
  "marauder",
  "requiem",
  "longinus",
  "eclipse",
];

const args = process.argv.slice(2);
const preview = args.includes("--preview");
const ids = args.filter((a) => !a.startsWith("--"));
const targets = ids.length ? ids : WEAPON_IDS;
fs.mkdirSync(BUILD, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder });

const reports = {};
for (const id of targets) {
  const raw = path.join(BUILD, `${id}.glb`);
  const json = path.join(BUILD, `${id}.json`);
  const views = preview
    ? ["-90:0", "90:0", "-18:12", "-140:10"].map(
        (v, i) => `${path.join(BUILD, `${id}-view${i}.png`)}:${v}`,
      )
    : [];
  const started = Date.now();
  execFileSync(
    BLENDER,
    [
      "-b",
      "--factory-startup",
      "--python",
      path.join(ROOT, "scripts/armory/blender/build.py"),
      "--",
      id,
      raw,
      json,
      ...views,
    ],
    { stdio: ["ignore", "ignore", "inherit"] },
  );
  const doc = await io.read(raw);
  await doc.transform(
    dedup(),
    prune({ keepLeaves: true, keepAttributes: true, keepExtras: true }),
    quantize({
      quantizePosition: 16,
      quantizeNormal: 10,
      quantizeTexcoord: 12,
      quantizeColor: 8,
      quantizeGeneric: 12,
    }),
    meshopt({ encoder: MeshoptEncoder, level: "medium" }),
  );
  const file = path.join(OUT, `${id}.glb`);
  await io.write(file, doc);
  const report = JSON.parse(fs.readFileSync(json, "utf8"));
  await packWear(report.maps, id);
  report.bytes = fs.statSync(file).size;
  report.buildSeconds = Math.round((Date.now() - started) / 100) / 10;
  reports[id] = report;
  console.log(
    `${id}: ${report.total} triangles, ${(report.bytes / 1024).toFixed(0)} KiB, ${report.buildSeconds} s`,
  );
}
const manifestPath = path.join(OUT, "manifest.json");
const manifest = fs.existsSync(manifestPath)
  ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  : { version: 1, weapons: {} };
for (const [id, r] of Object.entries(reports))
  manifest.weapons[id] = { triangles: r.total, bytes: r.bytes };
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1) + "\n");
