// Downloads the motion sources read by build-animations.mjs into
// .cache/horde-sources/ (skipping files already present):
//  - CMU Graphics Lab motion capture trials (BVH conversion mirrored by
//    github.com/una-dinosauria/cmu-mocap); free for commercial use;
//  - Quaternius Universal Animation Library 1 and 2, Standard (CC0 1.0).
// Rocketbox avatars and Freesound recordings are fetched by their own build
// scripts.
//
//   node scripts/horde/fetch-sources.mjs
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../..",
);
const SOURCES = path.join(ROOT, ".cache/horde-sources");
const CMU_MIRROR =
  "https://raw.githubusercontent.com/una-dinosauria/cmu-mocap/master/data";
const QUATERNIUS = {
  ual1: "https://opengameart.org/sites/default/files/universal_animation_librarystandard.zip",
  ual2: "https://opengameart.org/sites/default/files/universal_animation_library_2standard.zip",
};

async function download(url, file) {
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return false;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
  return true;
}

// Every trial the animation build reads.
const build = fs.readFileSync(
  path.join(ROOT, "scripts/horde/build-animations.mjs"),
  "utf8",
);
const trials = [
  ...new Set([...build.matchAll(/cmu\("(\d+_\d+)"\)/g)].map((m) => m[1])),
];
for (const id of trials) {
  const subject = String(Number(id.split("_")[0])).padStart(3, "0");
  const fresh = await download(
    `${CMU_MIRROR}/${subject}/${id}.bvh`,
    path.join(SOURCES, "cmu", `${id}.bvh`),
  );
  console.log(`cmu ${id}${fresh ? " downloaded" : " present"}`);
}
for (const [name, url] of Object.entries(QUATERNIUS)) {
  const zip = path.join(SOURCES, "quaternius", `${name}.zip`);
  const fresh = await download(url, zip);
  const dir = path.join(SOURCES, "quaternius", name);
  if (fresh || !fs.existsSync(dir))
    execFileSync("unzip", ["-o", "-q", zip, "-d", dir]);
  console.log(`quaternius ${name}${fresh ? " downloaded" : " present"}`);
}
