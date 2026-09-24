// Builds public/audio/horde/: the zombie sound bank. Sources are CC0
// recordings from Freesound (public HQ previews); every one-shot is cut from
// its recording by energy envelope, cleaned, loudness-matched and encoded as
// mono MP3. A manifest lists the files per category with their provenance.
//
//   node scripts/horde/build-sounds.mjs
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../..",
);
const CACHE = path.join(ROOT, ".cache/horde-sources/freesound");
const OUT = path.join(ROOT, "public/audio/horde");
const FFMPEG =
  process.env.FFMPEG ||
  path.join(ROOT, ".cache/tools/ffmpeg/node_modules/ffmpeg-static/ffmpeg");
const RATE = 44100;
const catalog = JSON.parse(fs.readFileSync(path.join(CACHE, "catalog.json")));

// Category -> sources. `cut`: split the recording into separate one-shots.
// Loudness targets are RMS dBFS of the voiced part; peaks stay below -1 dBFS.
const BANK = {
  moan: {
    target: -20,
    min: 0.5,
    max: 3.6,
    ids: [
      426628, 445995, 754438, 754441, 346626, 559558, 235796, 242069, 847400,
      58626, 213200, 483592, 393749,
    ],
  },
  growl: {
    target: -19,
    min: 0.35,
    max: 3,
    ids: [
      323819, 555417, 555413, 221688, 804461, 133974, 426627, 346625, 181068,
      732390, 196722, 196723,
    ],
  },
  scream: {
    target: -16,
    min: 0.3,
    max: 2.6,
    ids: [
      213509, 435651, 179345, 144002, 245223, 678437, 791958, 516704, 614674,
    ],
  },
  pain: {
    target: -18,
    min: 0.15,
    max: 1.4,
    ids: [163447, 555420, 555423, 555426, 633193, 426627, 346625],
  },
  death: {
    target: -18,
    min: 0.4,
    max: 3.2,
    ids: [555412, 445986, 744096, 534602, 612699, 426637],
  },
  female: {
    target: -19,
    min: 0.35,
    max: 3,
    ids: [238644, 347349, 338267],
  },
  breath: {
    target: -24,
    min: 0.8,
    max: 4,
    ids: [189281, 426229, 394941],
  },
  eat: {
    target: -20,
    min: 0.4,
    max: 3.5,
    ids: [155973, 448089, 445987, 518155, 467701, 457475],
  },
  roar: {
    target: -16,
    min: 0.8,
    max: 4,
    ids: [398908, 489901, 265554, 42201],
  },
  vomit: {
    target: -18,
    min: 0.3,
    max: 3,
    ids: [232540, 388525, 446001, 383334],
  },
  step: {
    target: -22,
    min: 0.08,
    max: 0.6,
    ids: [459964, 521590, 50725],
  },
  run: {
    target: -21,
    min: 0.08,
    max: 0.5,
    ids: [443218, 361072, 32939],
  },
  fall: {
    target: -16,
    min: 0.25,
    max: 2.2,
    ids: [417994, 504626, 346695, 181177, 447922],
  },
  flesh: {
    target: -16,
    min: 0.1,
    max: 1.4,
    ids: [423301, 55234, 360942, 323526, 390462, 104183],
  },
  gore: {
    target: -15,
    min: 0.2,
    max: 2.2,
    ids: [345985, 134025, 176745, 55234],
  },
  dirt: {
    target: -18,
    min: 0.4,
    max: 3.2,
    ids: [222521, 82722, 336023, 522099, 260130],
  },
  whoosh: {
    target: -19,
    min: 0.12,
    max: 1.2,
    ids: [60013, 683101, 346373],
  },
};
// Continuous beds (not cut): the distant horde.
const BEDS = {
  horde: { target: -24, ids: [111044, 798923, 616998], seconds: 24 },
};
const MAX_PER_SOURCE = 8;
const MAX_PER_CATEGORY = 18;

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
    { maxBuffer: 1 << 30 },
  );
  return new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
}

const db = (x) => 20 * Math.log10(Math.max(1e-9, x));
function rms(a, s = 0, e = a.length) {
  let sum = 0;
  for (let i = s; i < e; i++) sum += a[i] * a[i];
  return Math.sqrt(sum / Math.max(1, e - s));
}

/** Split by energy: 10 ms windows, hysteresis threshold, short gaps merged. */
function segments(pcm, { min, max }) {
  const win = Math.round(RATE * 0.01);
  const env = [];
  for (let i = 0; i + win <= pcm.length; i += win)
    env.push(rms(pcm, i, i + win));
  const sorted = [...env].sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.1)] || 1e-5;
  const peak = sorted[Math.floor(sorted.length * 0.995)] || 1e-3;
  const on = Math.max(floor * 5, peak * 0.1);
  const off = Math.max(floor * 3, peak * 0.05);
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
      quiet++;
      if (quiet > 14) {
        out.push([start, i - quiet]);
        start = -1;
      }
    } else quiet = 0;
  }
  if (start >= 0) out.push([start, env.length - 1]);
  return out
    .map(([a, b]) => [
      Math.max(0, a - 3) * win,
      Math.min(pcm.length, (b + 8) * win),
    ])
    .filter(([a, b]) => (b - a) / RATE >= min)
    .map(([a, b]) => [a, Math.min(b, a + Math.round(max * RATE))]);
}

function clean(pcm, target) {
  const out = Float32Array.from(pcm);
  // DC removal and a gentle 60 Hz high-pass (one-pole).
  let mean = 0;
  for (const v of out) mean += v;
  mean /= out.length;
  let prevIn = 0,
    prevOut = 0;
  const a = Math.exp((-2 * Math.PI * 60) / RATE);
  for (let i = 0; i < out.length; i++) {
    const x = out[i] - mean;
    const y = a * (prevOut + x - prevIn);
    prevIn = x;
    prevOut = y;
    out[i] = y;
  }
  // Loudness of the voiced part (top 60 % of 10 ms windows).
  const win = Math.round(RATE * 0.01);
  const levels = [];
  for (let i = 0; i + win <= out.length; i += win)
    levels.push(rms(out, i, i + win));
  levels.sort((x, y) => y - x);
  const voiced = levels.slice(0, Math.max(1, Math.floor(levels.length * 0.6)));
  const level = Math.sqrt(
    voiced.reduce((s, v) => s + v * v, 0) / voiced.length,
  );
  let gain = Math.pow(10, (target - db(level)) / 20);
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  gain = Math.min(gain, 0.89 / Math.max(1e-6, peak));
  const fadeIn = Math.round(RATE * 0.004),
    fadeOut = Math.round(RATE * 0.04);
  for (let i = 0; i < out.length; i++) {
    let g = gain;
    if (i < fadeIn) g *= i / fadeIn;
    if (i > out.length - fadeOut) g *= (out.length - i) / fadeOut;
    out[i] *= g;
  }
  return { pcm: out, level: db(level) + db(gain), peak: db(peak * gain) };
}

function clipped(pcm) {
  let n = 0;
  for (const v of pcm) if (Math.abs(v) > 0.985) n++;
  return n / pcm.length > 0.002;
}

function encode(pcm, file, bitrate = "80k") {
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
const manifest = { version: 1, categories: {}, beds: {}, credits: [] };
const credited = new Set();
const credit = (entry) => {
  if (credited.has(entry.id)) return;
  credited.add(entry.id);
  manifest.credits.push({
    id: entry.id,
    title: entry.title,
    author: entry.user,
    license: "CC0 1.0",
    url: `https://freesound.org/people/${entry.user}/sounds/${entry.id}/`,
  });
};
for (const [category, spec] of Object.entries(BANK)) {
  const files = [];
  const candidates = [];
  for (const id of spec.ids) {
    let source;
    try {
      source = await fetchSource(id);
    } catch (error) {
      console.warn(`${category}: skip ${id}: ${error.message}`);
      continue;
    }
    const pcm = decode(source.file);
    const cuts = segments(pcm, spec);
    let taken = 0;
    for (const [a, b] of cuts) {
      if (taken >= MAX_PER_SOURCE) break;
      const piece = pcm.subarray(a, b);
      if (clipped(piece)) continue;
      const { pcm: cleaned, level } = clean(piece, spec.target);
      candidates.push({
        source: source.entry,
        pcm: cleaned,
        seconds: (b - a) / RATE,
        level,
      });
      taken++;
    }
  }
  // Round-robin across sources so every recording contributes variety.
  const bySource = new Map();
  for (const c of candidates) {
    if (!bySource.has(c.source.id)) bySource.set(c.source.id, []);
    bySource.get(c.source.id).push(c);
  }
  const picked = [];
  while (
    picked.length < MAX_PER_CATEGORY &&
    [...bySource.values()].some((l) => l.length)
  )
    for (const list of bySource.values())
      if (list.length && picked.length < MAX_PER_CATEGORY)
        picked.push(list.shift());
  fs.mkdirSync(path.join(OUT, category), { recursive: true });
  picked.forEach((c, i) => {
    const name = `${category}/${category}-${String(i + 1).padStart(2, "0")}.mp3`;
    encode(
      c.pcm,
      path.join(OUT, name),
      category === "step" || category === "run" ? "64k" : "80k",
    );
    files.push({
      file: name,
      seconds: +c.seconds.toFixed(3),
      source: c.source.id,
    });
    credit(c.source);
  });
  manifest.categories[category] = files;
  console.log(
    category.padEnd(8),
    `${files.length} one-shots from ${bySource.size} recordings`,
  );
}
for (const [name, spec] of Object.entries(BEDS)) {
  const parts = [];
  for (const id of spec.ids) {
    try {
      const { file, entry } = await fetchSource(id);
      const pcm = decode(file);
      const n = Math.min(pcm.length, Math.round(spec.seconds * RATE));
      const start = Math.min(Math.round(RATE * 2), Math.max(0, pcm.length - n));
      const { pcm: cleaned } = clean(
        pcm.subarray(start, start + n),
        spec.target,
      );
      // Seamless loop: crossfade the tail into the head.
      const fade = Math.round(RATE * 1.5);
      const loop = cleaned.slice(0, cleaned.length - fade);
      for (let i = 0; i < fade; i++) {
        const t = i / fade;
        loop[i] = loop[i] * t + cleaned[cleaned.length - fade + i] * (1 - t);
      }
      const out = `beds/${name}-${parts.length + 1}.mp3`;
      fs.mkdirSync(path.join(OUT, "beds"), { recursive: true });
      encode(loop, path.join(OUT, out), "64k");
      parts.push({
        file: out,
        seconds: +(loop.length / RATE).toFixed(2),
        source: id,
      });
      credit(entry);
    } catch (error) {
      console.warn(`bed ${name}: skip ${id}: ${error.message}`);
    }
  }
  manifest.beds[name] = parts;
  console.log(`bed ${name}: ${parts.length}`);
}
fs.writeFileSync(
  path.join(OUT, "manifest.json"),
  JSON.stringify(manifest, null, 1),
);
// Human-readable credits next to the bank (CC0 needs none; they are kept).
fs.writeFileSync(
  path.join(OUT, "CREDITS.md"),
  [
    "# Horde sound bank — sources",
    "",
    "Every sound in this folder is cut from a CC0 1.0 recording published on",
    "Freesound, then cleaned, loudness-matched and encoded by",
    "`scripts/horde/build-sounds.mjs`.",
    "",
    "| Recording | Author | Source |",
    "| --- | --- | --- |",
    ...manifest.credits.map(
      (c) => `| ${c.title.replace(/\|/g, "/")} | ${c.author} | <${c.url}> |`,
    ),
    "",
  ].join("\n"),
);
let total = 0;
const walk = (d) => {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else total += fs.statSync(p).size;
  }
};
walk(OUT);
console.log(
  `bank: ${(total / 1024 / 1024).toFixed(2)} MiB, ${manifest.credits.length} CC0 recordings`,
);
