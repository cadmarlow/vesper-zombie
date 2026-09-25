// Builds public/audio/armory/: the weapon sound bank. Sources are CC0
// recordings from Freesound (public HQ previews), listed below with the part
// of each file that is used. Shots keep their natural decay; mechanical
// sequences (reloads, pump and bolt cycles, slide racks, brass drops) are
// split into one-shots by energy envelope. Everything is cleaned,
// loudness-matched and encoded as mono MP3; the manifest lists the files per
// category with their provenance.
//
//   node scripts/armory/build-sounds.mjs
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../..",
);
const CACHE = path.join(ROOT, ".cache/armory-sources/freesound");
const OUT = path.join(ROOT, "public/audio/armory");
const FFMPEG =
  process.env.FFMPEG ||
  path.join(ROOT, ".cache/tools/ffmpeg/node_modules/ffmpeg-static/ffmpeg");
const RATE = 44100;
const catalog = JSON.parse(
  fs.readFileSync(path.join(CACHE, "catalog.json"), "utf8"),
);

/**
 * take: "whole" (from the onset, up to max seconds) or segment indices
 * ("all", [i, j], or { loudest: n }) after energy segmentation.
 * target: peak dBFS for shots, RMS dBFS for everything else.
 */
const BANK = {
  // ---------------------------------------------------------- shots
  shot_vigil: {
    mode: "peak",
    target: -1.5,
    max: 1.4,
    sources: [
      [427592, "whole"],
      [217805, "whole"],
      [386745, "whole"],
    ],
  },
  shot_spectre: {
    mode: "peak",
    target: -2,
    max: 1.1,
    sources: [
      [390663, "whole"],
      [344143, "whole"],
      [427592, "whole", { rate: 1.08 }],
    ],
  },
  shot_marauder: {
    mode: "peak",
    target: -1.5,
    max: 1.5,
    sources: [
      [427596, "whole"],
      [433858, "whole"],
      [484036, "whole"],
      [404562, "whole"],
    ],
  },
  shot_requiem: {
    mode: "peak",
    target: -1,
    max: 1.7,
    sources: [
      [427595, "whole"],
      [405504, "whole"],
      [660299, "whole"],
      [773873, "whole"],
    ],
  },
  shot_longinus: {
    mode: "peak",
    target: -0.8,
    max: 2.3,
    sources: [
      [514228, "whole"],
      [668071, "whole"],
      [816114, "whole"],
    ],
  },
  shot_eclipse: {
    mode: "peak",
    target: -2,
    max: 1.3,
    sources: [
      [519414, "whole"],
      [450768, "whole"],
      [466867, "whole"],
    ],
  },
  // ------------------------------------------------------ mechanics
  magout: {
    mode: "rms",
    target: -20,
    max: 0.5,
    sources: [
      [396331, [0]],
      [725397, [0]],
      [677160, [0]],
      [693124, [0]],
      [815879, [0]],
      [616757, [0]],
    ],
  },
  magin: {
    mode: "rms",
    target: -18,
    max: 0.55,
    sources: [
      [396331, [1]],
      [379977, "whole"],
      [677160, [2]],
      [693124, [2]],
      [815879, [2]],
      [616757, [2]],
    ],
  },
  slide: {
    mode: "rms",
    target: -18,
    max: 0.45,
    sources: [
      [674744, "all"],
      [442560, { loudest: 1 }],
    ],
  },
  charge: {
    mode: "rms",
    target: -18,
    max: 0.5,
    sources: [
      [263513, { loudest: 4 }],
      [855598, "whole"],
      [725397, { last: 1 }],
      [815879, { last: 1 }],
    ],
  },
  pump: {
    mode: "rms",
    target: -16,
    max: 0.6,
    sources: [
      [370344, { loudest: 6 }],
      [449614, "whole"],
      [613801, "whole"],
    ],
  },
  bolt: {
    mode: "rms",
    target: -17,
    max: 1.2,
    sources: [[370345, { loudest: 5 }]],
  },
  shell: { mode: "rms", target: -19, max: 0.35, sources: [[108793, "all"]] },
  dryfire: {
    mode: "rms",
    target: -22,
    max: 0.3,
    sources: [
      [171211, { loudest: 1 }],
      [427603, { loudest: 1 }],
      [523087, { loudest: 2 }],
    ],
  },
  brass: {
    mode: "rms",
    target: -27,
    max: 0.7,
    sources: [
      [210102, { loudest: 6 }],
      [318964, { loudest: 8 }],
    ],
  },
  hulls: { mode: "rms", target: -26, max: 1.2, sources: [[620929, "whole"]] },
  raise: {
    mode: "rms",
    target: -24,
    max: 0.9,
    sources: [
      [415304, "whole"],
      [388819, "whole"],
    ],
  },
  energy: { mode: "rms", target: -22, max: 1.4, sources: [[610361, "whole"]] },
};
const GAP = { bolt: 0.18, pump: 0.12, slide: 0.12 };

fs.mkdirSync(path.join(CACHE, "raw"), { recursive: true });
async function fetchSource(id) {
  const entry = catalog[id];
  if (!entry) throw new Error(`sound ${id} missing from catalog`);
  if (entry.license !== "Creative Commons 0")
    throw new Error(`sound ${id} is not CC0`);
  const file = path.join(CACHE, "raw", `${id}.mp3`);
  if (!fs.existsSync(file)) {
    const res = await fetch(entry.mp3);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${entry.mp3}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return { file, entry };
}

function decode(file) {
  const raw = execFileSync(
    FFMPEG,
    [
      "-v",
      "error",
      "-i",
      file,
      "-ac",
      "1",
      "-ar",
      String(RATE),
      "-f",
      "f32le",
      "-",
    ],
    {
      maxBuffer: 1 << 30,
    },
  );
  return new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
}
const db = (x) => 20 * Math.log10(Math.max(1e-9, x));
function rms(a, s = 0, e = a.length) {
  let sum = 0;
  for (let i = s; i < e; i++) sum += a[i] * a[i];
  return Math.sqrt(sum / Math.max(1, e - s));
}

/** Energy segmentation: 5 ms windows, hysteresis, gaps shorter than gap merged. */
function segments(pcm, gap = 0.06) {
  const win = Math.round(RATE * 0.005);
  const env = [];
  for (let i = 0; i + win <= pcm.length; i += win)
    env.push(rms(pcm, i, i + win));
  const sorted = [...env].sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.2)] || 1e-5;
  const peak = sorted[Math.floor(sorted.length * 0.998)] || 1e-3;
  const on = Math.max(floor * 6, peak * 0.12);
  const off = Math.max(floor * 3, peak * 0.04);
  const quietMax = Math.round(gap / 0.005);
  const out = [];
  let start = -1,
    quiet = 0;
  for (let i = 0; i < env.length; i++) {
    if (start < 0) {
      if (env[i] > on) {
        start = i;
        quiet = 0;
      }
    } else if (env[i] < off) {
      if (++quiet > quietMax) {
        out.push([start, i - quiet]);
        start = -1;
      }
    } else quiet = 0;
  }
  if (start >= 0) out.push([start, env.length - 1]);
  return out.map(([a, b]) => {
    const s = Math.max(0, a - 2) * win,
      e = Math.min(pcm.length, (b + 14) * win);
    let energy = 0;
    for (let i = s; i < e; i++) energy += pcm[i] * pcm[i];
    return { start: s, end: e, energy };
  });
}

/** Onset of the first transient, a couple of milliseconds early. */
function onset(pcm) {
  let peak = 0;
  for (const v of pcm) peak = Math.max(peak, Math.abs(v));
  const threshold = peak * 0.08;
  for (let i = 0; i < pcm.length; i++)
    if (Math.abs(pcm[i]) > threshold)
      return Math.max(0, i - Math.round(RATE * 0.002));
  return 0;
}

function resample(pcm, rate) {
  if (rate === 1) return pcm;
  const out = new Float32Array(Math.floor(pcm.length / rate));
  for (let i = 0; i < out.length; i++) {
    const x = i * rate,
      j = Math.floor(x),
      f = x - j;
    out[i] = (pcm[j] || 0) * (1 - f) + (pcm[j + 1] || 0) * f;
  }
  return out;
}

function clean(pcm, { mode, target }) {
  const out = Float32Array.from(pcm);
  let mean = 0;
  for (const v of out) mean += v;
  mean /= out.length;
  // DC removal, 40 Hz high-pass (one-pole).
  let prevIn = 0,
    prevOut = 0;
  const a = Math.exp((-2 * Math.PI * 40) / RATE);
  for (let i = 0; i < out.length; i++) {
    const x = out[i] - mean;
    const y = a * (prevOut + x - prevIn);
    prevIn = x;
    prevOut = y;
    out[i] = y;
  }
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  let gain;
  if (mode === "peak") gain = Math.pow(10, target / 20) / Math.max(1e-6, peak);
  else {
    const win = Math.round(RATE * 0.01);
    const levels = [];
    for (let i = 0; i + win <= out.length; i += win)
      levels.push(rms(out, i, i + win));
    levels.sort((x, y) => y - x);
    const voiced = levels.slice(
      0,
      Math.max(1, Math.floor(levels.length * 0.5)),
    );
    const level = Math.sqrt(
      voiced.reduce((s, v) => s + v * v, 0) / voiced.length,
    );
    gain = Math.min(
      Math.pow(10, (target - db(level)) / 20),
      0.89 / Math.max(1e-6, peak),
    );
  }
  const fadeIn = Math.round(RATE * 0.0015),
    fadeOut = Math.round(RATE * (mode === "peak" ? 0.25 : 0.03));
  for (let i = 0; i < out.length; i++) {
    let g = gain;
    if (i < fadeIn) g *= i / fadeIn;
    if (i > out.length - fadeOut)
      g *= Math.max(0, (out.length - i) / fadeOut) ** 2;
    out[i] *= g;
  }
  return out;
}

function encode(pcm, file, bitrate) {
  const tmp = `${file}.f32`;
  fs.writeFileSync(
    tmp,
    Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength),
  );
  execFileSync(FFMPEG, [
    "-v",
    "error",
    "-y",
    "-f",
    "f32le",
    "-ar",
    String(RATE),
    "-ac",
    "1",
    "-i",
    tmp,
    "-codec:a",
    "libmp3lame",
    "-b:a",
    bitrate,
    file,
  ]);
  fs.unlinkSync(tmp);
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const manifest = { version: 1, categories: {}, credits: [] };
const credited = new Set();
for (const [category, spec] of Object.entries(BANK)) {
  const files = [];
  for (const [id, take, options = {}] of spec.sources) {
    let source;
    try {
      source = await fetchSource(id);
    } catch (error) {
      console.warn(`${category}: skip ${id}: ${error.message}`);
      continue;
    }
    const pcm = resample(decode(source.file), options.rate || 1);
    let cuts = [];
    if (take === "whole") {
      const s = onset(pcm);
      cuts = [[s, Math.min(pcm.length, s + Math.round(spec.max * RATE))]];
    } else {
      const segs = segments(pcm, GAP[category] ?? 0.06);
      let chosen = [];
      if (take === "all") chosen = segs;
      else if (Array.isArray(take))
        chosen = take.map((i) => segs[i]).filter(Boolean);
      else if (take.loudest)
        chosen = [...segs]
          .sort((a, b) => b.energy - a.energy)
          .slice(0, take.loudest)
          .sort((a, b) => a.start - b.start);
      else if (take.last) chosen = segs.slice(-take.last);
      cuts = chosen.map((s) => [
        s.start,
        Math.min(s.end, s.start + Math.round(spec.max * RATE)),
      ]);
    }
    for (const [a, b] of cuts) {
      if (b - a < RATE * 0.03) continue;
      const out = clean(pcm.subarray(a, b), spec);
      const name = `${category}-${files.length + 1}.mp3`;
      encode(
        out,
        path.join(OUT, name),
        category.startsWith("shot") ? "128k" : "96k",
      );
      files.push({
        file: name,
        source: id,
        seconds: +((b - a) / RATE).toFixed(3),
      });
    }
    if (!credited.has(id)) {
      credited.add(id);
      const e = source.entry;
      manifest.credits.push({
        id,
        title: e.title,
        author: e.user,
        license: "CC0 1.0",
        url: `https://freesound.org/people/${e.user}/sounds/${id}/`,
      });
    }
  }
  manifest.categories[category] = files;
  console.log(category, files.length);
}
fs.writeFileSync(
  path.join(OUT, "manifest.json"),
  JSON.stringify(manifest, null, 1) + "\n",
);
const lines = [
  "# Weapon sounds",
  "",
  "All recordings are CC0 1.0 (public domain dedication), from Freesound. Cut, cleaned and loudness-matched by `scripts/armory/build-sounds.mjs`.",
  "",
  "| Freesound id | Title | Author |",
  "| --- | --- | --- |",
];
for (const c of manifest.credits)
  lines.push(
    `| [${c.id}](${c.url}) | ${c.title.replace(/\|/g, "/")} | ${c.author} |`,
  );
fs.writeFileSync(path.join(OUT, "CREDITS.md"), lines.join("\n") + "\n");
