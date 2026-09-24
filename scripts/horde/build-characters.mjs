// Builds the zombie character packs in public/models/horde/ from the
// Microsoft Rocketbox avatars (MIT licence).
//
//   node scripts/horde/build-characters.mjs [id ...] [--force]
//
// Per character: download sources, convert the FBX with Blender
// (blender-character.py), build a body/head texture atlas, paint the zombie
// surface from 3D texel positions (zombify.mjs), generate three LODs and
// write a desktop pack (full/lite/far, 2048x1024 atlas) and a mobile pack
// (lite/far, 1024x512 atlas).
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTTextureWebP } from "@gltf-transform/extensions";
import { MeshoptSimplifier } from "meshoptimizer";
import { ROSTER, ROCKETBOX_REPO } from "./roster.mjs";
import { readTga } from "./tga.mjs";
import { rasterizeUV } from "./uvraster.mjs";
import { zombify, zombifyHair } from "./zombify.mjs";

const ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../..",
);
const CACHE = path.join(ROOT, ".cache");
const SRC = path.join(CACHE, "horde-sources/rocketbox");
const BUILD = path.join(CACHE, "horde-build/characters");
const OUT = path.join(ROOT, "public/models/horde");
const BLENDER =
  process.env.BLENDER ||
  path.join(CACHE, "tools/Blender.app/Contents/MacOS/Blender");
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const args = process.argv.slice(2);
const force = args.includes("--force");
const only = args.filter((a) => !a.startsWith("--"));
// atlas: half-width of the colour atlas (body | head). Normal and mask maps
// are half resolution: GPU memory stays around 18 MiB per desktop body and
// 4.6 MiB per mobile body.
const PROFILES = {
  desktop: {
    atlas: 1024,
    normal: 512,
    mask: 512,
    hair: 512,
    lods: ["full", "lite", "far"],
    jpeg: 84,
  },
  mobile: {
    atlas: 512,
    normal: 256,
    mask: 256,
    hair: 256,
    lods: ["lite", "far"],
    jpeg: 80,
  },
};
const LOD_RATIO = { full: 1, lite: 0.5, far: 0.2 };

fs.mkdirSync(BUILD, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------------------
// Sources

async function treeFiles() {
  const file = path.join(CACHE, "horde-sources/rocketbox-tree.json");
  if (!fs.existsSync(file)) {
    const res = await fetch(
      "https://api.github.com/repos/microsoft/Microsoft-Rocketbox/git/trees/master?recursive=1",
    );
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return JSON.parse(fs.readFileSync(file)).tree.map((e) => e.path);
}

async function download(url, file) {
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url);
    if (res.ok) {
      fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      return;
    }
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
  }
  throw new Error(`download failed: ${url}`);
}

async function fetchAvatar(entry, tree) {
  const prefix = `Assets/Avatars/${entry.avatar}/`;
  const name = entry.avatar.split("/").pop();
  const files = tree.filter(
    (p) =>
      p.startsWith(prefix) &&
      (p === `${prefix}Export/${name}.fbx` || /Textures\/.*\.tga$/.test(p)),
  );
  await Promise.all(
    files.map((p) =>
      download(
        `${ROCKETBOX_REPO}/${p.slice("Assets/Avatars/".length)}`,
        path.join(SRC, p.slice("Assets/Avatars/".length)),
      ),
    ),
  );
  const dir = path.join(SRC, entry.avatar);
  const textures = fs.readdirSync(path.join(dir, "Textures"));
  const find = (suffix) => {
    const f = textures.find((t) => t.toLowerCase().endsWith(suffix));
    return f ? path.join(dir, "Textures", f) : null;
  };
  return {
    fbx: path.join(dir, "Export", `${name}.fbx`),
    bodyColor: find("_body_color.tga"),
    bodyNormal: find("_body_normal.tga"),
    bodySpec: find("_body_specular.tga"),
    headColor: find("_head_color.tga"),
    headNormal: find("_head_normal.tga"),
    headSpec: find("_head_specular.tga"),
    opacity: find("_opacity_color.tga"),
  };
}

function convert(entry, sources) {
  const glb = path.join(BUILD, `${entry.id}.glb`);
  const json = path.join(BUILD, `${entry.id}.json`);
  const script = path.join(ROOT, "scripts/horde/blender-character.py");
  const stale =
    !fs.existsSync(glb) ||
    fs.statSync(glb).mtimeMs < fs.statSync(script).mtimeMs;
  if (force || stale) {
    execFileSync(
      BLENDER,
      [
        "-b",
        "--factory-startup",
        "--python",
        script,
        "--",
        sources.fbx,
        glb,
        json,
        String(entry.claw ?? 0.55),
      ],
      { stdio: ["ignore", "ignore", "inherit"] },
    );
  }
  return { glb, meta: JSON.parse(fs.readFileSync(json)) };
}

// ---------------------------------------------------------------------------
// Images

async function loadRaw(file, size) {
  if (!file) return null;
  const { width, height, data } = readTga(file);
  const img = sharp(data, { raw: { width, height, channels: 4 } });
  const buf = await img
    .resize(size, size, { kernel: "lanczos3" })
    .raw()
    .toBuffer();
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.length);
}

/** Two square maps side by side: body on the left, head on the right. */
function atlas(body, head, size, fill = [128, 128, 255, 255]) {
  const out = new Uint8Array(size * 2 * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size * 2; x++) {
      const o = (y * size * 2 + x) * 4;
      const src = x < size ? body : head;
      const i = (y * size + (x % size)) * 4;
      if (src) out.set(src.subarray(i, i + 4), o);
      else out.set(fill, o);
    }
  return out;
}

const encode = {
  jpeg: (data, w, h, quality) =>
    sharp(Buffer.from(data.buffer, data.byteOffset, data.length), {
      raw: { width: w, height: h, channels: 4 },
    })
      .removeAlpha()
      .jpeg({ quality, mozjpeg: true, chromaSubsampling: "4:2:0" })
      .toBuffer(),
  webp: (data, w, h, quality, lossless = false, alphaQuality = 90) =>
    sharp(Buffer.from(data.buffer, data.byteOffset, data.length), {
      raw: { width: w, height: h, channels: 4 },
    })
      .webp({ quality, alphaQuality, lossless, effort: 5, exact: true })
      .toBuffer(),
};

async function resizeRaw(data, w, h, W, H) {
  const buf = await sharp(
    Buffer.from(data.buffer, data.byteOffset, data.length),
    {
      raw: { width: w, height: h, channels: 4 },
    },
  )
    .resize(W, H, { kernel: "lanczos3" })
    .raw()
    .toBuffer();
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.length);
}

// ---------------------------------------------------------------------------
// Geometry

function readPrimitive(prim) {
  const get = (s) => prim.getAttribute(s);
  const idx = prim.getIndices();
  return {
    positions: get("POSITION").getArray().slice(),
    normals: get("NORMAL").getArray().slice(),
    uvs: get("TEXCOORD_0").getArray().slice(),
    joints: get("JOINTS_0").getArray().slice(),
    weights: get("WEIGHTS_0").getArray().slice(),
    indices: idx
      ? Uint32Array.from(idx.getArray())
      : Uint32Array.from({ length: get("POSITION").getCount() }, (_, i) => i),
  };
}

function concat(parts) {
  const out = {};
  for (const key of ["positions", "normals", "uvs", "joints", "weights"]) {
    const total = parts.reduce((s, p) => s + p[key].length, 0);
    const Ctor = parts[0][key].constructor;
    out[key] = new Ctor(total);
    let o = 0;
    for (const p of parts) {
      out[key].set(p[key], o);
      o += p[key].length;
    }
  }
  const indexCount = parts.reduce((s, p) => s + p.indices.length, 0);
  out.indices = new Uint32Array(indexCount);
  let io2 = 0,
    base = 0;
  for (const p of parts) {
    for (let i = 0; i < p.indices.length; i++)
      out.indices[io2++] = p.indices[i] + base;
    base += p.positions.length / 3;
  }
  return out;
}

/** Seam-aware simplification: lock vertices shared by several UV islands. */
function simplify(mesh, ratio) {
  if (ratio >= 1) return mesh;
  const vertexCount = mesh.positions.length / 3;
  const key = (i) =>
    `${Math.round(mesh.positions[i * 3] * 1e4)},${Math.round(mesh.positions[i * 3 + 1] * 1e4)},${Math.round(mesh.positions[i * 3 + 2] * 1e4)}`;
  const seen = new Map();
  const lock = new Uint8Array(vertexCount);
  for (let i = 0; i < vertexCount; i++) {
    const k = key(i);
    if (seen.has(k)) {
      lock[i] = 1;
      lock[seen.get(k)] = 1;
    } else seen.set(k, i);
  }
  // Attributes: uv (x2, strong) and normal (x3, weak).
  const attrs = new Float32Array(vertexCount * 5);
  for (let i = 0; i < vertexCount; i++) {
    attrs[i * 5] = mesh.uvs[i * 2];
    attrs[i * 5 + 1] = mesh.uvs[i * 2 + 1];
    attrs[i * 5 + 2] = mesh.normals[i * 3];
    attrs[i * 5 + 3] = mesh.normals[i * 3 + 1];
    attrs[i * 5 + 4] = mesh.normals[i * 3 + 2];
  }
  const target = Math.floor((mesh.indices.length * ratio) / 3) * 3;
  const [indices] = MeshoptSimplifier.simplifyWithAttributes(
    mesh.indices,
    mesh.positions,
    3,
    attrs,
    5,
    [2, 2, 0.4, 0.4, 0.4],
    lock,
    target,
    0.05,
    ["Permissive"],
  );
  // Keep only referenced vertices.
  const remap = new Int32Array(vertexCount).fill(-1);
  let count = 0;
  for (const i of indices) if (remap[i] < 0) remap[i] = count++;
  const pick = (arr, size) => {
    const out = new arr.constructor(count * size);
    for (let i = 0; i < vertexCount; i++)
      if (remap[i] >= 0)
        for (let k = 0; k < size; k++)
          out[remap[i] * size + k] = arr[i * size + k];
    return out;
  };
  return {
    positions: pick(mesh.positions, 3),
    normals: pick(mesh.normals, 3),
    uvs: pick(mesh.uvs, 2),
    joints: pick(mesh.joints, 4),
    weights: pick(mesh.weights, 4),
    indices: Uint32Array.from(indices, (i) => remap[i]),
  };
}

// ---------------------------------------------------------------------------

async function buildEntry(entry, tree) {
  const t0 = Date.now();
  const sources = await fetchAvatar(entry, tree);
  const { glb, meta } = convert(entry, sources);
  const doc = await io.read(glb);
  const root = doc.getRoot();
  const skin = root.listSkins()[0];
  const meshNode = root.listNodes().find((n) => n.getMesh());
  const prims = meshNode.getMesh().listPrimitives();
  const byMat = (suffix) =>
    prims.find((p) =>
      p.getMaterial()?.getName().toLowerCase().endsWith(suffix),
    );
  const bodyPrim = byMat("_body"),
    headPrim = byMat("_head"),
    hairPrim = byMat("_opacity");
  if (!bodyPrim || !headPrim)
    throw new Error(`${entry.id}: body/head materials missing`);
  const body = readPrimitive(bodyPrim),
    head = readPrimitive(headPrim);
  for (let i = 0; i < body.uvs.length; i += 2) body.uvs[i] *= 0.5;
  for (let i = 0; i < head.uvs.length; i += 2)
    head.uvs[i] = 0.5 + head.uvs[i] * 0.5;
  const merged = concat([body, head]);
  const headParts = splitHead(head, meta.landmarks);
  const hair = hairPrim ? readPrimitive(hairPrim) : null;

  // Joint rest positions (world, metres) for the painter.
  const jointWorld = new Map();
  {
    const walk = (node, parentMatrix) => {
      const m = multiply(parentMatrix, node.getMatrix());
      jointWorld.set(node.getName(), [m[12], m[13], m[14]]);
      for (const c of node.listChildren()) walk(c, m);
    };
    const joints = skin.listJoints();
    const rootJoint = joints.find(
      (j) => !joints.some((p) => p.listChildren().includes(j)),
    );
    walk(rootJoint, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  }
  const J = (n) => jointWorld.get(`Bip01 ${n}`);

  // Paint at the desktop resolution; mobile maps are downsampled from it.
  const size = PROFILES.desktop.atlas;
  const [bc, hc, bn, hn, bs, hs] = await Promise.all([
    loadRaw(sources.bodyColor, size),
    loadRaw(sources.headColor, size),
    loadRaw(sources.bodyNormal, size),
    loadRaw(sources.headNormal, size),
    loadRaw(sources.bodySpec, size),
    loadRaw(sources.headSpec, size),
  ]);
  const W = size * 2,
    H = size;
  const map = rasterizeUV({
    width: W,
    height: H,
    primitives: [
      {
        indices: body.indices,
        positions: body.positions,
        normals: body.normals,
        uvs: body.uvs,
      },
      ...["skin", "eyes", "mouth"].map((k) => ({
        indices: headParts[k],
        positions: head.positions,
        normals: head.normals,
        uvs: head.uvs,
      })),
    ],
  });
  const painted = zombify({
    width: W,
    height: H,
    color: atlas(bc, hc, size, [90, 90, 90, 255]),
    normal: atlas(bn, hn, size),
    spec: atlas(bs, hs, size, [30, 30, 30, 255]),
    map,
    headPart: 1,
    eyePart: 2,
    mouthPart: 3,
    landmarks: meta.landmarks,
    joints: {
      handL: J("L Hand"),
      handR: J("R Hand"),
      neck: J("Neck"),
      head: J("Head"),
      pelvis: J("Pelvis"),
    },
    style: entry.style,
  });
  let hairRaw = null;
  if (hair && sources.opacity) {
    const h = await loadRaw(sources.opacity, PROFILES.desktop.hair);
    hairRaw = zombifyHair(h, PROFILES.desktop.hair, PROFILES.desktop.hair, {
      seed: entry.style?.seed,
    });
  }
  // Mask layout for glTF: R fresh-blood potential, G roughness, B unused
  // (metallicFactor is 0), A = 1 - eye glow. The alpha plane is compressed
  // apart from the colour planes, so lossy chroma never leaks into the glow;
  // it stays opaque almost everywhere because encoders and resamplers
  // discard (or premultiply away) the colour of transparent pixels.
  const mask = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    mask[i * 4] = painted.mask[i * 4];
    mask[i * 4 + 1] = painted.mask[i * 4 + 3];
    mask[i * 4 + 2] = 0;
    mask[i * 4 + 3] = 255 - painted.mask[i * 4 + 2];
  }

  const lodMeshes = {};
  for (const lod of ["full", "lite", "far"])
    lodMeshes[lod] = simplify(merged, LOD_RATIO[lod]);
  const hairLods = {
    full: hair,
    lite: hair && simplify(hair, 0.6),
    far: null,
  };

  const report = {
    id: entry.id,
    avatar: entry.avatar,
    types: entry.types,
    seconds: 0,
    packs: {},
  };
  for (const [profile, cfg] of Object.entries(PROFILES)) {
    const scale = cfg.atlas / size;
    const cW = W * scale,
      cH = H * scale;
    const color =
      scale === 1
        ? painted.color
        : await resizeRaw(painted.color, W, H, cW, cH);
    const nW = (cfg.normal / size) * W,
      nH = (cfg.normal / size) * H;
    const normal = await resizeRaw(painted.normal, W, H, nW, nH);
    const mW = (cfg.mask / size) * W,
      mH = (cfg.mask / size) * H;
    const maskRaw = mW === W ? mask : await resizeRaw(mask, W, H, mW, mH);
    const images = {
      color: await encode.jpeg(color, cW, cH, cfg.jpeg),
      normal: await encode.jpeg(normal, nW, nH, Math.min(92, cfg.jpeg + 6)),
      mask: await encode.webp(maskRaw, mW, mH, 86, false, 100),
      hair:
        hairRaw &&
        (await encode.webp(
          cfg.hair === PROFILES.desktop.hair
            ? hairRaw
            : await resizeRaw(
                hairRaw,
                PROFILES.desktop.hair,
                PROFILES.desktop.hair,
                cfg.hair,
                cfg.hair,
              ),
          cfg.hair,
          cfg.hair,
          82,
        )),
    };
    const file = path.join(
      OUT,
      `${entry.id}${profile === "mobile" ? "-mobile" : ""}.glb`,
    );
    const stats = await writePack(file, {
      source: doc,
      skin,
      lods: cfg.lods,
      lodMeshes,
      hairLods,
      images,
      meta: {
        id: entry.id,
        types: entry.types,
        landmarks: meta.landmarks,
        height: meta.height,
        hipHeight: J("Pelvis")[1],
        wounds: painted.wounds.map((w) => ({
          p: w.p.map((v) => +v.toFixed(4)),
          r: +w.radius.toFixed(4),
        })),
        profile,
      },
    });
    report.packs[profile] = stats;
  }
  report.seconds = (Date.now() - t0) / 1000;
  // Review images (not shipped).
  const review = path.join(BUILD, `${entry.id}-atlas.jpg`);
  await sharp(Buffer.from(painted.color.buffer), {
    raw: { width: W, height: H, channels: 4 },
  })
    .removeAlpha()
    .resize(1024, 512)
    .jpeg({ quality: 85 })
    .toFile(review);
  return report;
}

/**
 * Separate the head primitive into skin, eyeballs and mouth interior using
 * connected components (vertices welded by position across UV seams).
 */
function splitHead(head, landmarks) {
  const count = head.positions.length / 3;
  const parent = Int32Array.from({ length: count }, (_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  const union = (a, b) => {
    a = find(a);
    b = find(b);
    if (a !== b) parent[a] = b;
  };
  const weld = new Map();
  for (let i = 0; i < count; i++) {
    const k = `${Math.round(head.positions[i * 3] * 2e4)},${Math.round(head.positions[i * 3 + 1] * 2e4)},${Math.round(head.positions[i * 3 + 2] * 2e4)}`;
    if (weld.has(k)) union(i, weld.get(k));
    else weld.set(k, i);
  }
  for (let t = 0; t < head.indices.length; t += 3) {
    union(head.indices[t], head.indices[t + 1]);
    union(head.indices[t], head.indices[t + 2]);
  }
  const comps = new Map();
  for (let t = 0; t < head.indices.length; t += 3) {
    const c = find(head.indices[t]);
    if (!comps.has(c)) comps.set(c, { tris: [], sum: [0, 0, 0], n: 0 });
    const e = comps.get(c);
    e.tris.push(t);
    for (const v of [
      head.indices[t],
      head.indices[t + 1],
      head.indices[t + 2],
    ]) {
      e.sum[0] += head.positions[v * 3];
      e.sum[1] += head.positions[v * 3 + 1];
      e.sum[2] += head.positions[v * 3 + 2];
      e.n++;
    }
  }
  const largest = [...comps.values()].sort(
    (a, b) => b.tris.length - a.tris.length,
  )[0];
  const out = { skin: [], eyes: [], mouth: [] };
  const d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  for (const e of comps.values()) {
    const c = e.sum.map((v) => v / e.n);
    let kind = "skin";
    if (e !== largest) {
      if (Math.min(d(c, landmarks.eyeL), d(c, landmarks.eyeR)) < 0.03)
        kind = "eyes";
      else if (landmarks.mouth && d(c, landmarks.mouth) < 0.08) kind = "mouth";
    }
    for (const t of e.tris)
      out[kind].push(head.indices[t], head.indices[t + 1], head.indices[t + 2]);
  }
  return Object.fromEntries(
    Object.entries(out).map(([k, v]) => [k, Uint32Array.from(v)]),
  );
}

function multiply(a, b) {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return out;
}

async function writePack(
  file,
  { source, skin, lods, lodMeshes, hairLods, images, meta },
) {
  const doc = new Document();
  const webp = doc.createExtension(EXTTextureWebP).setRequired(true);
  const buffer = doc.createBuffer();
  const scene = doc.createScene("horde-character");
  // Joints: copy hierarchy and rest transforms.
  const joints = skin.listJoints();
  const nodes = new Map();
  const copy = (n) => {
    const node = doc
      .createNode(n.getName())
      .setTranslation(n.getTranslation())
      .setRotation(n.getRotation())
      .setScale(n.getScale());
    nodes.set(n, node);
    for (const c of n.listChildren())
      if (joints.includes(c)) node.addChild(copy(c));
    return node;
  };
  const rootJoint = joints.find(
    (j) => !joints.some((p) => p.listChildren().includes(j)),
  );
  const armature = doc.createNode("Armature");
  armature.addChild(copy(rootJoint));
  scene.addChild(armature);
  const newSkin = doc
    .createSkin("horde")
    .setSkeleton(nodes.get(rootJoint))
    .setInverseBindMatrices(
      doc
        .createAccessor()
        .setType("MAT4")
        .setArray(skin.getInverseBindMatrices().getArray().slice())
        .setBuffer(buffer),
    );
  for (const j of joints) newSkin.addJoint(nodes.get(j));

  const tex = (name, bytes, mime) =>
    doc.createTexture(name).setImage(bytes).setMimeType(mime);
  const colorTex = tex("color", images.color, "image/jpeg");
  const normalTex = tex("normal", images.normal, "image/jpeg");
  const maskTex = tex("mask", images.mask, "image/webp");
  const skinMat = doc
    .createMaterial("zombie")
    .setBaseColorTexture(colorTex)
    .setNormalTexture(normalTex)
    .setMetallicRoughnessTexture(maskTex)
    .setMetallicFactor(0)
    .setRoughnessFactor(1);
  let hairMat = null;
  if (images.hair) {
    hairMat = doc
      .createMaterial("hair")
      .setBaseColorTexture(tex("hair", images.hair, "image/webp"))
      .setAlphaMode("MASK")
      .setAlphaCutoff(0.42)
      .setDoubleSided(true)
      .setRoughnessFactor(0.85)
      .setMetallicFactor(0);
  }
  const stats = {};
  const accessor = (type, array) =>
    doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  const primitive = (m, material) => {
    const weights = new Float32Array(m.weights);
    return doc
      .createPrimitive()
      .setAttribute("POSITION", accessor("VEC3", new Float32Array(m.positions)))
      .setAttribute("NORMAL", accessor("VEC3", new Float32Array(m.normals)))
      .setAttribute("TEXCOORD_0", accessor("VEC2", new Float32Array(m.uvs)))
      .setAttribute("JOINTS_0", accessor("VEC4", new Uint8Array(m.joints)))
      .setAttribute("WEIGHTS_0", accessor("VEC4", weights))
      .setIndices(
        accessor(
          "SCALAR",
          m.positions.length / 3 > 65535
            ? new Uint32Array(m.indices)
            : new Uint16Array(m.indices),
        ),
      )
      .setMaterial(material);
  };
  for (const lod of lods) {
    const mesh = doc.createMesh(`body-${lod}`);
    mesh.addPrimitive(primitive(lodMeshes[lod], skinMat));
    let tris = lodMeshes[lod].indices.length / 3;
    if (hairMat && hairLods[lod]) {
      mesh.addPrimitive(primitive(hairLods[lod], hairMat));
      tris += hairLods[lod].indices.length / 3;
    }
    const node = doc.createNode(`body-${lod}`).setMesh(mesh).setSkin(newSkin);
    node.setExtras({ vesperDetail: lod });
    scene.addChild(node);
    stats[lod] = tris;
  }
  doc.getRoot().setExtras({ vesperHorde: meta });
  await io.write(file, doc);
  stats.bytes = fs.statSync(file).size;
  stats.images = Object.fromEntries(
    Object.entries(images).map(([k, v]) => [k, v ? v.length : 0]),
  );
  return stats;
}

// ---------------------------------------------------------------------------

await MeshoptSimplifier.ready;
const tree = await treeFiles();
const entries = ROSTER.filter((e) => !only.length || only.includes(e.id));
const reports = [];
for (const entry of entries) {
  const report = await buildEntry(entry, tree);
  reports.push(report);
  console.log(
    entry.id.padEnd(16),
    `${report.seconds.toFixed(1)}s`,
    Object.entries(report.packs)
      .map(
        ([p, s]) =>
          `${p}: ${(s.bytes / 1024).toFixed(0)}KiB tris ${Object.entries(s)
            .filter(([k]) => ["full", "lite", "far"].includes(k))
            .map(([k, v]) => `${k}=${v}`)
            .join(" ")}`,
      )
      .join(" | "),
  );
}
const manifestFile = path.join(CACHE, "horde-build/characters-report.json");
const previous = fs.existsSync(manifestFile)
  ? JSON.parse(fs.readFileSync(manifestFile))
  : [];
const merged = [
  ...previous.filter((p) => !reports.some((r) => r.id === p.id)),
  ...reports,
];
fs.writeFileSync(manifestFile, JSON.stringify(merged, null, 1));
