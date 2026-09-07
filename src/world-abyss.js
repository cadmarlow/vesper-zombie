import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  box,
  cylinder,
  sphere,
  mesh,
  mat,
  glow,
  glowSprite,
  label,
} from "./assets.js";
import { worldSurface } from "./surfaces.js";
import { rng } from "./logic.js";

function livingLeaf() {
  // Curved blade with a raised midrib, thin veins and mottled leaf tissue.
  // One local texture and one instanced mesh cover all of the vegetation.
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d"),
    random = rng(27194);
  const tissue = ctx.createImageData(256, 256);
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 256; x++) {
      const i = (y * 256 + x) * 4;
      const edge = Math.abs(x - 128) / 128;
      const variation =
        Math.sin(y * 0.12 + Math.abs(x - 128) * 0.16) * 0.14 + random() * 0.2;
      const value = 0.5 + 0.35 * (1 - edge) + variation;
      tissue.data[i] = 32 * value;
      tissue.data[i + 1] = 128 * value;
      tissue.data[i + 2] = 100 * value;
      tissue.data[i + 3] = 255;
    }
  ctx.putImageData(tissue, 0, 0);
  ctx.strokeStyle = "rgba(151,224,176,.6)";
  ctx.lineWidth = 1.5;
  for (let y = 28; y < 248; y += 18)
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(128, y);
      ctx.bezierCurveTo(
        128 + s * 38,
        y - 8,
        128 + s * 82,
        y - 33,
        128 + s * 121,
        y - 48,
      );
      ctx.stroke();
    }
  ctx.strokeStyle = "#9bd2a0";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(128, 256);
  ctx.lineTo(128, 0);
  ctx.stroke();
  const map = new T.CanvasTexture(canvas);
  map.colorSpace = T.SRGBColorSpace;
  const positions = [],
    uv = [],
    indices = [];
  for (let row = 0; row <= 8; row++)
    for (let col = 0; col <= 4; col++) {
      const t = row / 8,
        u = (col / 4) * 2 - 1,
        breadth = Math.pow(Math.sin(t * Math.PI), 0.72);
      positions.push(
        u * breadth * 0.32,
        t,
        0.12 * Math.sin(t * Math.PI) * (1 - u * u) + t * t * 0.14,
      );
      uv.push(col / 4, t);
      if (row < 8 && col < 4) {
        const i = row * 5 + col;
        indices.push(i, i + 1, i + 5, i + 1, i + 6, i + 5);
      }
    }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return { geometry, map };
}

function combineSpecimen(group) {
  const byMaterial = new Map();
  for (const child of [...group.children]) {
    child.updateMatrix();
    const copy = child.geometry.clone().applyMatrix4(child.matrix);
    const geometry = copy.index ? copy.toNonIndexed() : copy;
    if (geometry !== copy) copy.dispose();
    if (!byMaterial.has(child.material)) byMaterial.set(child.material, []);
    byMaterial.get(child.material).push(geometry);
    child.geometry.dispose();
    group.remove(child);
  }
  for (const [material, geometries] of byMaterial) {
    group.add(new T.Mesh(mergeGeometries(geometries, false), material));
    geometries.forEach((g) => g.dispose());
  }
}

// Néréide has its own authored layout. All gameplay stays on the dry deck;
// the ocean, flooded beds and overhead structures are bounded scenery.
export const ABYSS_LAYOUT = {
  bounds: { x: 36, z: 44 },
  spawn: [0, 1.7, 36],
  machines: [
    ["box", [-28, 34]],
    ["ammo", [28, 36]],
    ["ammo", [-29, 4]],
    ["power", [-30, -14]],
    ["upgrade", [27, -35]],
    ["health", [15, 16]],
    ["speed", [29, -11]],
    ["extract", [0, 40]],
  ],
  spawns: [
    [-31, 40],
    [31, 40],
    [-32, 28],
    [32, 28],
    [-15, 19],
    [16, 20],
    [-15, -17],
    [14, -18],
    [31, 9],
    [-25, 18],
    [-31, -19],
    [-29, -39],
    [29, -40],
    [0, -40],
  ],
  sectors: [
    { id: "dock", name: "Sas des plongeurs", x: 0, z: 34 },
    { id: "garden", name: "La Canopée noyée", x: 0, z: 10 },
    { id: "engine", name: "Atelier des marées", x: -28, z: -10 },
    { id: "lab", name: "Herbier interdit", x: 28, z: 0 },
    { id: "observatory", name: "Le Belvédère", x: 0, z: -33 },
  ],
};

export function buildAbyss(w) {
  const { root, static: stage, materials: m } = w,
    random = rng(31073);
  w.bounds = { ...ABYSS_LAYOUT.bounds };
  w.spawn.set(...ABYSS_LAYOUT.spawn);
  w.spawnPoints = ABYSS_LAYOUT.spawns;
  w.machineLocations = ABYSS_LAYOUT.machines;
  w.viewPitch = 0.1;
  w.maxLights = 8;
  w.sectors = ABYSS_LAYOUT.sectors;
  w.sectorAt = ({ x, z }) =>
    ABYSS_LAYOUT.sectors[
      z > 24 ? 0 : z < -23 ? 4 : x < -20 ? 2 : x > 21 ? 3 : 1
    ].name;
  w.lighting = {
    ambient: 0.82,
    powerAmbient: 0.18,
    fill: 0.24,
    powerFill: 0.35,
    poweredBrightness: 0.64,
  };
  const metal = worldSurface("metal", 0x546e6b, 2.5, {
    roughness: 0.67,
    metalness: 0.65,
  });
  const bronze = worldSurface("metal", 0xb19968, 1.8, {
    roughness: 0.49,
    metalness: 0.73,
  });
  const ceramic = worldSurface("floor", 0x405e61, 2.7, {
    roughness: 0.58,
    metalness: 0.2,
  });
  const bark = worldSurface("wood", 0x3f5141, 1.2, {
    roughness: 0.98,
    metalness: 0,
  });
  const soil = worldSurface("stone", 0x263b36, 1.4, {
    roughness: 1,
    metalness: 0,
  });
  const pale = mat(0x94aba0, 0.63, 0.35);
  const turquoise = glow(0x62f1d3, 0.45);
  const sign = (text, x, y, z, width = 5, rotation = 0, color = "#b1dacf") => {
    const s = label(text, color, width, width * 0.12);
    s.position.set(x, y, z);
    s.rotation.y = rotation;
    s.material.side = T.FrontSide;
    // Real two-faced signboards keep lettering readable from either route.
    const reverse = new T.Mesh(s.geometry, s.material);
    reverse.rotation.y = Math.PI;
    reverse.position.z = -0.025;
    s.add(reverse);
    root.add(s);
    return s;
  };
  const tube = (
    points,
    material,
    radius = 0.1,
    parent = stage,
    segments = 28,
    sides = 6,
  ) =>
    mesh(
      new T.TubeGeometry(
        new T.CatmullRomCurve3(points.map((p) => new T.Vector3(...p))),
        segments,
        radius,
        sides,
        false,
      ),
      material,
      parent,
    );
  const ring = (
    parent,
    material,
    x,
    y,
    z,
    radius,
    thick = 0.07,
    rotation = 0,
  ) => {
    const o = mesh(
      new T.TorusGeometry(radius, thick, 6, 64),
      material,
      parent,
      x,
      y,
      z,
    );
    o.rotation.x = rotation;
    return o;
  };

  // Soft blue ocean light, with a warm secondary source from the arrival dock.
  w.scene.background = new T.Color(0x052733);
  w.scene.fog = new T.FogExp2(0x092c35, 0.011);
  w.hemi = new T.HemisphereLight(0x8ed8db, 0x213932, 0.82);
  root.add(w.hemi);
  root.add(new T.AmbientLight(0x729eaa, 0.18));
  w.sun = new T.DirectionalLight(0x8ad5e3, 1.9);
  w.sun.position.set(-23, 45, 12);
  w.sun.castShadow = true;
  Object.assign(w.sun.shadow.camera, {
    left: -49,
    right: 49,
    top: 51,
    bottom: -51,
    near: 1,
    far: 150,
  });
  w.sun.shadow.mapSize.setScalar(2048);
  w.sun.shadow.normalBias = 0.07;
  w.sun.shadow.bias = -0.0002;
  root.add(w.sun);
  w.fill = new T.DirectionalLight(0xe4b47a, 0.24);
  w.fill.position.set(13, 12, 38);
  root.add(w.fill);
  const oceanTime = { value: 0 };
  const oceanMat = new T.ShaderMaterial({
    side: T.BackSide,
    depthWrite: false,
    uniforms: { time: oceanTime },
    vertexShader: `varying vec3 vP; void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec3 vP;uniform float time;void main(){float h=smoothstep(-28.,95.,vP.y);float s=pow(max(0.,sin(vP.x*.045+vP.z*.023+time*.012)),16.)*.1*h;vec3 c=mix(vec3(.008,.035,.047),vec3(.065,.28,.34),h);gl_FragColor=vec4(c+s*vec3(.1,.48,.45),1.);#include <tonemapping_fragment>\n#include <colorspace_fragment>}`,
  });
  // Shader preprocessor directives must start on their own line.
  oceanMat.fragmentShader = oceanMat.fragmentShader.replace(
    ";#include",
    ";\n#include",
  );
  const ocean = new T.Mesh(new T.SphereGeometry(135, 40, 24), oceanMat);
  root.add(ocean);

  box(stage, ceramic, 0, -0.25, 0, 74, 0.48, 90);
  for (const x of [-37, 37]) w.obstacle(x, 0, 2, 92, 12);
  for (const z of [-45, 45]) w.obstacle(0, z, 76, 2, 12);
  // Drainage channels, brass expansion joints and an unbroken central route.
  for (const x of [-8, 8, -21, 21]) {
    box(stage, m.dark, x, 0.008, 0, 0.43, 0.018, 87);
    for (let z = -42; z < 43; z += 0.85)
      box(stage, bronze, x, 0.024, z, 0.42, 0.022, 0.035);
  }
  for (let z = -42; z < 44; z += 4)
    box(stage, bronze, 0, 0.017, z, 71, 0.018, 0.035);
  for (const x of [-35.5, 35.5]) {
    w.solid(metal, x, 0.65, 0, 0.9, 1.3, 88);
    box(stage, bronze, x, 1.38, 0, 1, 0.12, 88);
  }

  // Seven pressure ribs span the entire 72-metre conservatory.
  for (const z of [-42, -28, -14, 0, 14, 28, 42]) {
    const points = Array.from({ length: 49 }, (_, i) => {
      const a = -Math.PI / 2 + (i / 48) * Math.PI;
      return [Math.sin(a) * 35.5, 4 + Math.cos(a) * 25, z];
    });
    tube(points, bronze, 0.24, stage, 48, 8);
    for (const x of [-35.5, 35.5]) {
      w.solid(metal, x, 2, z, 1.25, 4, 1.5);
      for (let y = 1.6; y < 4; y += 0.8)
        box(stage, bronze, x, y, z, 1.4, 0.09, 1.65);
    }
  }
  for (let i = 0; i <= 8; i++) {
    const a = -Math.PI / 2 + (i / 8) * Math.PI;
    box(
      stage,
      metal,
      Math.sin(a) * 35.5,
      4 + Math.cos(a) * 25,
      0,
      0.14,
      0.14,
      85,
    );
  }
  const glassGeo = new T.BufferGeometry(),
    gp = [],
    gu = [],
    gi = [];
  for (let row = 0; row < 2; row++)
    for (let i = 0; i <= 64; i++) {
      const a = -Math.PI / 2 + (i / 64) * Math.PI;
      gp.push(Math.sin(a) * 35.7, 4 + Math.cos(a) * 25.2, row ? 44 : -44);
      gu.push(i / 64, row);
      if (!row && i < 64) gi.push(i, i + 1, i + 65, i + 1, i + 66, i + 65);
    }
  glassGeo.setAttribute("position", new T.Float32BufferAttribute(gp, 3));
  glassGeo.setAttribute("uv", new T.Float32BufferAttribute(gu, 2));
  glassGeo.setIndex(gi);
  glassGeo.computeVertexNormals();
  const glass = new T.Mesh(
    glassGeo,
    new T.MeshStandardMaterial({
      color: 0x5b9f9a,
      roughness: 0.2,
      metalness: 0.2,
      transparent: true,
      opacity: 0.055,
      depthWrite: false,
      side: T.DoubleSide,
    }),
  );
  root.add(glass);
  for (const z of [-44, 44]) {
    w.solid(metal, -25, 3.8, z, 22, 7.6, 0.9);
    w.solid(metal, 25, 3.8, z, 22, 7.6, 0.9);
    box(stage, metal, 0, 18, z, 28, 2, 0.8);
    for (const radius of [12, 12.4, 13])
      ring(stage, bronze, 0, 8, z + 0.2, radius, 0.16);
    for (let j = 0; j < 12; j++) {
      const a = (j * Math.PI) / 6;
      const brace = box(
        stage,
        metal,
        Math.cos(a) * 7,
        8 + Math.sin(a) * 7,
        z,
        0.13,
        10,
        0.16,
      );
      brace.rotation.z = a - Math.PI / 2;
    }
  }

  const bulkhead = (x, z, width, rotation, name, cost) => {
    const g = new T.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rotation;
    root.add(g);
    const bars = new T.Group();
    g.add(bars);
    for (const dx of [-width / 2 - 0.4, width / 2 + 0.4])
      box(g, metal, dx, 3, 0, 0.8, 6, 1.1);
    box(g, bronze, 0, 6, 0, width + 1.6, 0.4, 1.2);
    for (let xx = -width / 2 + 0.25; xx < width / 2; xx += 0.65)
      box(bars, metal, xx, 2.7, 0, 0.17, 5.4, 0.24);
    for (const y of [0.5, 2.6, 4.8])
      box(bars, bronze, 0, y, 0, width, 0.16, 0.35);
    const sig = label(
      `${name.toUpperCase()} · ${cost}`,
      "#e9bd80",
      Math.min(width - 1, 6),
      0.55,
    );
    sig.position.set(0, 3.45, 0.23);
    g.add(sig);
    const position = new T.Vector3(0, 1, 1)
      .applyAxisAngle(new T.Vector3(0, 1, 0), rotation)
      .add(new T.Vector3(x, 0, z));
    const obstacle = w.obstacle(
      x,
      z,
      rotation ? 0.65 : width,
      rotation ? width : 0.65,
      5.5,
    );
    const d = {
      kind: "door",
      name,
      cost,
      position,
      root: g,
      bars,
      obstacle,
      sign: sig,
      open: false,
    };
    w.doors.push(d);
    w.interactions.push(d);
  };
  for (const z of [24, -23])
    for (const s of [-1, 1]) {
      w.solid(metal, s * 21, 2.4, z, 30, 4.8, 0.9);
      box(stage, bronze, s * 21, 4.9, z, 30, 0.13, 1);
      for (let x = 9; x < 35; x += 5) {
        const hatch = ring(stage, bronze, s * x, 2.8, z + 0.5, 0.72, 0.065);
        mesh(
          new T.CircleGeometry(0.64, 24),
          mat(0x1c525c, 0.2, 0.35),
          stage,
          s * x,
          2.8,
          z + 0.52,
        );
      }
    }
  bulkhead(0, 24, 12, 0, "Canopée noyée", 750);
  bulkhead(-20, 3, 8, Math.PI / 2, "Atelier des marées", 1000);
  bulkhead(0, -23, 12, 0, "Le Belvédère", 1250);
  w.solid(metal, -20, 3, 15.5, 0.85, 6, 17);
  w.solid(metal, -20, 3, -12, 0.85, 6, 22);
  // The eastern herbarium has two entrances, creating a second combat loop.
  for (const [z, d] of [
    [18, 12],
    [0, 8],
    [-17, 10],
  ])
    w.solid(metal, 21, 1.7, z, 0.65, 3.4, d);
  sign("NÉRÉIDE / JARDINS ABYSSAUX", 0, 7.25, 23.9, 12);
  sign("01 — SAS DES PLONGEURS", -21, 4.5, 39, 8);
  sign("02 — LA CANOPÉE NOYÉE", 0, 6.8, -22.4, 10);
  sign("03 — ATELIER DES MARÉES", -19.35, 4.8, 3, 6, Math.PI / 2);
  sign("04 — HERBIER INTERDIT", 20.6, 4.4, 11, 6, -Math.PI / 2);
  sign("05 — LE BELVÉDÈRE", 0, 12, -43.35, 9);

  const leaf = livingLeaf();
  const leafMaterial = new T.MeshStandardMaterial({
    color: 0xc7ecd9,
    map: leaf.map,
    emissiveMap: leaf.map,
    emissive: 0x72f9ce,
    emissiveIntensity: 0.3,
    roughness: 0.7,
    metalness: 0.05,
    side: T.DoubleSide,
  });
  const plantTime = { value: 0 };
  leafMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.plantTime = plantTime;
    shader.vertexShader = "uniform float plantTime;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>\ntransformed.x+=sin(plantTime*.7+instanceMatrix[3].x*.6+position.y*3.)*.075*position.y;`,
    );
  };
  leafMaterial.customProgramCacheKey = () => "nereid-leaf-sway-v1";
  const leafGeo = leaf.geometry,
    foliage = [];
  const addLeaf = (x, y, z, scale, a = 0, tilt = 0) =>
    foliage.push({ x, y, z, scale, a, tilt });
  const planter = (x, z, width = 5, depth = 4, seed = 0) => {
    w.solid(metal, x, 0.4, z, width, 0.8, depth);
    box(stage, soil, x, 0.81, z, width - 0.25, 0.12, depth - 0.25);
    for (const sx of [-1, 1])
      box(
        stage,
        bronze,
        x + sx * (width / 2 - 0.06),
        0.89,
        z,
        0.12,
        0.15,
        depth,
      );
    for (let i = 0; i < 8; i++) {
      const px = x + (random() - 0.5) * (width - 0.8),
        pz = z + (random() - 0.5) * (depth - 0.8),
        h = 0.5 + random() * 1.2;
      tube(
        [
          [px, 0.84, pz],
          [px + 0.13, 1.05 + h * 0.45, pz - 0.1],
          [px + 0.18, 0.9 + h, pz],
        ],
        bark,
        0.025,
        stage,
        6,
        4,
      );
      for (let j = 0; j < 5; j++)
        addLeaf(
          px,
          1 + (j * h) / 5,
          pz,
          0.6 + random() * 0.5,
          j * 2.4 + seed,
          0.65,
        );
    }
  };
  for (const [x, z, ww, dd] of [
    [-13, 14, 5, 4],
    [12, 7, 5, 4],
    [-13, -13, 5, 5],
    [13, -14, 5, 4],
    [28, 14, 5, 4],
    [28, -1, 5, 5],
    [-15, -34, 5, 6],
    [15, -34, 5, 6],
  ])
    planter(x, z, ww, dd);

  // The tree is the landmark: broad roots, twisted trunk, tiered canopy and
  // copper astrolabe. Its entire floor footprint has matching collision.
  w.solid(metal, 0, 0.45, -3, 13, 0.9, 13);
  cylinder(stage, bronze, 0, 0.98, -3, 6.7, 0.2, 6.7, 64);
  cylinder(stage, soil, 0, 1.14, -3, 6.35, 0.25, 6.35, 64);
  ring(stage, bronze, 0, 1.33, -3, 6.65, 0.1, Math.PI / 2);
  const trunk = new T.LatheGeometry(
    Array.from({ length: 42 }, (_, i) => {
      const y = 1.2 + (i / 41) * 18.8;
      return new T.Vector2(0.1 + 1.6 * Math.pow(1 - i / 41, 1.7), y);
    }),
    24,
  );
  const tp = trunk.attributes.position;
  for (let i = 0; i < tp.count; i++) {
    const y = tp.getY(i);
    const a = Math.atan2(tp.getZ(i), tp.getX(i));
    const rib = 1 + Math.sin(a * 7 + y * 0.4) * 0.13;
    tp.setX(i, tp.getX(i) * rib + Math.sin(y * 0.4) * 0.62);
    tp.setZ(i, tp.getZ(i) * rib + Math.sin(y * 0.28) * 0.48);
  }
  trunk.computeVertexNormals();
  mesh(trunk, bark, stage, 0, 0, -3);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2,
      r = 5.5;
    tube(
      [
        [Math.cos(a) * r, 1.25, -3 + Math.sin(a) * r],
        [Math.cos(a) * 3, 1.4, -3 + Math.sin(a) * 3],
        [Math.cos(a) * 1.2, 3, -3 + Math.sin(a)],
        [0.4, 6, -2.7],
      ],
      bark,
      0.23,
      stage,
      16,
      7,
    );
  }
  for (let i = 0; i < 27; i++) {
    const a = i * 2.4,
      h = 8 + (i % 5) * 2.2,
      r = 5 + random() * 6.5;
    const end = [Math.cos(a) * r, h + 2 + random() * 2, -3 + Math.sin(a) * r];
    tube(
      [
        [Math.sin(h * 0.4) * 0.6, h - 2, -3],
        [Math.cos(a) * r * 0.35, h, -3 + Math.sin(a) * r * 0.35],
        end,
      ],
      bark,
      0.075 + (20 - h) * 0.015,
      stage,
      17,
      6,
    );
    for (let j = 0; j < 44; j++)
      addLeaf(
        end[0] + (random() - 0.5) * 4,
        end[1] + (random() - 0.5) * 2,
        end[2] + (random() - 0.5) * 4,
        1 + random() * 1.6,
        random() * 6.28,
        -0.6 + random() * 1.8,
      );
    if (i % 2 === 0)
      tube(
        [
          end,
          [end[0] + 0.5, end[1] - 2, end[2]],
          [end[0] - 0.3, end[1] - 4 - random() * 3, end[2] + 0.5],
        ],
        turquoise,
        0.022,
        stage,
        10,
        4,
      );
  }
  const foliageMesh = new T.InstancedMesh(
      leafGeo,
      leafMaterial,
      foliage.length,
    ),
    dummy = new T.Object3D();
  foliage.forEach((p, i) => {
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(p.tilt, p.a, Math.sin(i) * 0.6);
    dummy.scale.setScalar(p.scale);
    dummy.updateMatrix();
    foliageMesh.setMatrixAt(i, dummy.matrix);
    foliageMesh.setColorAt(
      i,
      new T.Color().setHSL(
        0.4 + (i % 9) * 0.014,
        0.35 + (0.25 * (i % 3)) / 2,
        0.45 + (i % 4) * 0.04,
      ),
    );
  });
  foliageMesh.castShadow = false;
  foliageMesh.receiveShadow = true;
  foliageMesh.computeBoundingSphere();
  root.add(foliageMesh);
  const astrolabe = new T.Group();
  astrolabe.position.set(0, 9, -3);
  root.add(astrolabe);
  for (let i = 0; i < 3; i++) {
    const o = ring(
      astrolabe,
      i === 1 ? turquoise : bronze,
      0,
      0,
      0,
      5.5 + i * 0.47,
      i === 1 ? 0.045 : 0.09,
    );
    o.rotation.set(0.45 + i * 0.67, i * 0.9, 0.3 + i * 0.5);
  }
  const heart = mesh(new T.IcosahedronGeometry(0.85, 2), turquoise, astrolabe);
  heart.position.y = 0.2;
  w.coreHalo = glowSprite(0x63ffd1, 8);
  w.coreHalo.position.set(0, 9, -3);
  w.coreHalo.material.opacity = 0.16;
  root.add(w.coreHalo);

  // Research apparatus, readable consoles, specimen tanks and diving equipment.
  const specimenGlass = mat(0x68b1a0, 0.13, 0.18, {
    transparent: true,
    opacity: 0.14,
    depthWrite: false,
    side: T.DoubleSide,
  });
  const specimens = [];
  for (const [index, z] of [-17, -6, 6, 18].entries()) {
    const x = 33;
    box(stage, metal, x, 0.45, z, 3.4, 0.9, 3.6);
    w.obstacle(x, z, 3.4, 3.6, 3.7);
    cylinder(stage, bronze, x, 1, z, 1.15, 0.18, 1.15, 24);
    const vessel = mesh(
      new T.CylinderGeometry(1.01, 1.01, 2.4, 32, 1, true),
      specimenGlass,
      root,
      x,
      2.2,
      z,
    );
    vessel.castShadow = false;
    for (let j = 0; j < 8; j++) {
      const a = (j * Math.PI) / 4;
      cylinder(
        stage,
        bronze,
        x + Math.cos(a) * 1.1,
        2.2,
        z + Math.sin(a) * 1.1,
        0.028,
        2.5,
        0.028,
        5,
      );
    }
    const specimen = new T.Group();
    specimen.position.set(x, 2.2, z);
    root.add(specimen);
    sphere(specimen, turquoise, 0, 0.2, 0, 0.33, 0.8, 1.25 + index * 0.15, 0.8);
    for (let j = 0; j < 7; j++) {
      const a = (j * Math.PI * 2) / 7;
      tube(
        [
          [0, 0.25, 0],
          [Math.cos(a) * 0.55, -0.05, Math.sin(a) * 0.55],
          [Math.cos(a + 0.4) * 0.36, -0.65, Math.sin(a + 0.4) * 0.36],
        ],
        j % 2 ? turquoise : pale,
        0.023,
        specimen,
        10,
        5,
      );
      if (index % 2)
        sphere(
          specimen,
          turquoise,
          Math.cos(a) * 0.48,
          0.18,
          Math.sin(a) * 0.48,
          0.12,
          0.7,
          1.7,
          0.7,
        );
    }
    combineSpecimen(specimen);
    specimens.push(specimen);
    cylinder(stage, bronze, x, 3.5, z, 1.2, 0.17, 1.2, 24);
    for (const y of [1.15, 3.3])
      ring(stage, turquoise, x, y, z, 1.015, 0.025, Math.PI / 2);
    sign(`N-${41 + z} / SPÉCIMEN`, x - 1.74, 0.6, z, 2.4, -Math.PI / 2);
  }
  for (const [x, z] of [
    [-31, 17],
    [-31, -5],
    [-27, -20],
  ]) {
    w.solid(metal, x, 1, z, 4, 2, 3);
    for (let j = 0; j < 3; j++) {
      const c = cylinder(
        stage,
        bronze,
        x - 1.1 + j * 1.1,
        2.5,
        z,
        0.32,
        2,
        0.32,
        12,
      );
      ring(stage, m.dark, x - 1.1 + j * 1.1, 2.8, z + 0.33, 0.21, 0.03);
      tube(
        [
          [x - 1.1 + j * 1.1, 3.5, z],
          [x - 1.1 + j * 1.1, 4.2, z],
          [x - 1.1 + j * 1.1, 4.2, z - 2],
        ],
        metal,
        0.085,
        stage,
        10,
        6,
      );
    }
  }
  for (const x of [-33.8, -24]) {
    const pipe = cylinder(stage, bronze, x, 5, -1, 0.19, 43, 0.19, 12);
    pipe.rotation.x = Math.PI / 2;
    for (let z = -20; z < 23; z += 4) {
      const collar = cylinder(stage, metal, x, 5, z, 0.25, 0.15, 0.25, 12);
      collar.rotation.x = Math.PI / 2;
    }
  }
  // Brass valves, pipe gauges and instrument panels are fixed to existing cover.
  for (const z of [-18, -7, 12, 20]) {
    box(stage, bronze, -19.5, 2.2, z, 0.12, 1.6, 1.3);
    const gauge = new T.Group();
    gauge.position.set(-19.38, 2.4, z);
    gauge.rotation.y = Math.PI / 2;
    stage.add(gauge);
    mesh(new T.CircleGeometry(0.36, 24), pale, gauge, 0, 0, 0.04);
    ring(gauge, bronze, 0, 0, 0.06, 0.4, 0.045);
    const hand = box(gauge, m.dark, 0, 0.09, 0.08, 0.018, 0.29, 0.02);
    hand.rotation.z = 0.7;
    for (let j = 0; j < 10; j++) {
      const a = (j / 10) * Math.PI * 2;
      sphere(gauge, m.dark, Math.sin(a) * 0.3, Math.cos(a) * 0.3, 0.06, 0.014);
    }
    for (const s of [-1, 1])
      box(
        gauge,
        s > 0 ? turquoise : m.dark,
        s * 0.3,
        -0.58,
        0.08,
        0.15,
        0.09,
        0.03,
      );
  }
  for (const z of [-12, 8, 19]) {
    const valve = new T.Group();
    valve.position.set(-34.7, 1.3, z);
    valve.rotation.y = Math.PI / 2;
    stage.add(valve);
    w.obstacle(-34.7, z, 1, 1.2, 1.9);
    ring(valve, bronze, 0, 0, 0, 0.52, 0.065);
    for (let j = 0; j < 4; j++) {
      const spoke = box(valve, metal, 0, 0, 0, 0.055, 1, 0.06);
      spoke.rotation.z = (j * Math.PI) / 4;
    }
    cylinder(valve, metal, 0, -0.4, 0.23, 0.09, 1.2, 0.09, 8);
  }
  // Debris stays below ankle height; fallen leaves and specimen labels add scale.
  const litter = new T.InstancedMesh(
    new T.DodecahedronGeometry(1, 0),
    soil,
    240,
  );
  for (let i = 0; i < 240; i++) {
    const side = i % 2 ? -1 : 1,
      z = -41 + random() * 82,
      size = 0.035 + random() * 0.14;
    dummy.position.set(
      side * (i % 3 ? 33 + random() : 8.8 + random() * 5),
      0.025,
      z,
    );
    dummy.rotation.set(random() * 6, random() * 6, random() * 6);
    dummy.scale.set(size * 1.8, size * 0.3, size);
    dummy.updateMatrix();
    litter.setMatrixAt(i, dummy.matrix);
  }
  litter.receiveShadow = true;
  litter.computeBoundingSphere();
  root.add(litter);
  for (let i = 0; i < 48; i++) {
    const p = box(
      stage,
      pale,
      (random() - 0.5) * 65,
      0.02,
      (random() - 0.5) * 81,
      0.15,
      0.006,
      0.23,
    );
    p.rotation.y = random() * 6;
  }
  for (const [x, z, angle] of [
    [-15, 30, 0.13],
    [15, 37, -0.1],
    [25, 27, 0.08],
    [-12, -29, 0.06],
    [29, -29, -0.17],
  ]) {
    w.solid(metal, x, 0.63, z, 3.3, 1.26, 2.1);
    for (const dx of [-1.3, 1.3])
      box(stage, bronze, x + dx, 0.68, z, 0.12, 1.35, 2.2);
    const lid = box(stage, pale, x, 1.3, z, 3.4, 0.11, 2.2);
    lid.rotation.y = angle;
    for (let j = 0; j < 5; j++)
      box(stage, m.dark, x - 0.8 + j * 0.4, 1.369, z, 0.22, 0.018, 0.8);
  }
  // Diving bell at the dock, with a porthole and a suspended recovery cable.
  w.obstacle(-23, 39, 5.8, 5.8, 5.5);
  cylinder(stage, bronze, -23, 2.1, 39, 2.3, 3.8, 2.3, 32);
  sphere(stage, metal, -23, 4, 39, 2.3, 1, 0.6, 1);
  ring(stage, bronze, -23, 2.4, 41.3, 1, 0.13);
  mesh(
    new T.CircleGeometry(0.84, 32),
    glow(0x396e75, 0.5),
    stage,
    -23,
    2.4,
    41.34,
  );
  cylinder(stage, m.dark, -23, 12, 39, 0.05, 14, 0.05, 6);
  sign("CLOCHE 07 / PROFONDEUR 2 840 M", -23, 5.9, 39, 6);
  // Observation table and a second copper orrery at the far end.
  w.solid(metal, 0, 1, -36, 7, 2, 3.5);
  box(stage, bronze, 0, 2.1, -36, 7.2, 0.2, 3.7);
  for (const x of [-2.2, 0, 2.2]) {
    const c = box(stage, m.dark, x, 2.5, -36, 1.7, 0.8, 1.1);
    c.rotation.x = 0.24;
    box(stage, turquoise, x, 2.85, -35.76, 1.43, 0.03, 0.72);
  }
  const globe = mesh(
    new T.IcosahedronGeometry(2.2, 2),
    mat(0x457d81, 0.5, 0.5, {
      wireframe: true,
      emissive: 0x286c65,
      emissiveIntensity: 0.7,
    }),
    root,
    0,
    7,
    -37,
  );
  ring(stage, bronze, 0, 7, -37, 2.8, 0.06, 0.9);

  // Optional exploration: three authored recordings, without blocking survival.
  for (const [index, x, z, title, text] of [
    [
      0,
      24,
      32,
      "Journal 01 — La descente",
      "2 840 mètres. L’arbre pousse sans soleil. Aujourd’hui, ses racines ont frappé contre la vitre.",
    ],
    [
      1,
      27,
      5,
      "Journal 02 — L’herbier",
      "Les spores conservent les souvenirs. Nous pensions sauver des espèces. Nous avons réveillé les nôtres.",
    ],
    [
      2,
      -26,
      -34,
      "Journal 03 — Le dehors",
      "Ce n’est pas un océan autour de nous. C’est une cage. Et quelque chose vient de comprendre comment l’ouvrir.",
    ],
  ]) {
    const g = new T.Group();
    g.position.set(x, 0, z);
    root.add(g);
    cylinder(g, metal, 0, 0.65, 0, 0.34, 1.3, 0.34, 10);
    box(g, bronze, 0, 1.38, 0, 0.7, 0.2, 0.55);
    const data = sphere(g, turquoise, 0, 1.66, 0, 0.19);
    const sig = label("ARCHIVE", "#a1dfc6", 1.5, 0.24);
    sig.position.set(0, 2.2, 0);
    g.add(sig);
    w.obstacle(x, z, 0.9, 0.9, 1.9);
    w.interactions.push({
      kind: "recording",
      name: title,
      text,
      cost: 0,
      position: new T.Vector3(x, 1, z),
      root: g,
      data,
      read: false,
      index,
    });
  }
  // Sequential circuits lead the player from the engine room to the canopy.
  for (const [index, x, z] of [
    [0, -28, -9],
    [1, 0, 14],
    [2, 0, -9],
    [3, 0, -34],
  ]) {
    const material = glow(0x6bffe0, 0);
    material.color.set(0x193534);
    for (const dx of [-8, 8])
      for (let k = -5; k < 6; k += 2)
        box(stage, material, x + dx, 0.035, z + k, 0.1, 0.04, 1.3);
    const light = new T.PointLight(0x67e8cf, 0, 28, 1.65);
    light.position.set(x, 5, z);
    root.add(light);
    w.circuits.push({ material, light, delay: index * 0.65, level: 0 });
  }
  for (const [x, y, z, powered] of [
    [-8, 2.3, 34, false],
    [8, 2.3, 34, false],
    [-16, 3, 21, false],
    [16, 3, 21, false],
    [-28, 3, -12, true],
    [29, 3, -8, true],
    [-11, 3, -18, true],
    [11, 3, -18, true],
    [-14, 3, -37, true],
    [14, 3, -37, true],
  ])
    w.lantern(
      x,
      y,
      z,
      powered ? 0x74ebca : 0xffb566,
      powered ? 18 : 11,
      powered,
    );

  const waterTime = { value: 0 };
  const causticMaterial = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
    uniforms: { time: waterTime, strength: { value: 0.11 } },
    vertexShader: `varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader: `varying vec3 vW;uniform float time;uniform float strength;void main(){vec2 p=vW.xz*.72;float a=sin(p.x+sin(p.y*.63+time*.22))*sin(p.y+cos(p.x*.82-time*.18));float b=pow(1.-abs(a),14.);float fade=exp(-length(vW.xz-cameraPosition.xz)*.018);gl_FragColor=vec4(.22,.79,.68,b*strength*fade);}`,
  });
  const caustics = new T.Mesh(new T.PlaneGeometry(72, 88), causticMaterial);
  caustics.rotation.x = -Math.PI / 2;
  caustics.position.y = 0.046;
  root.add(caustics);
  const moteCount = 1600,
    mp = new Float32Array(moteCount * 3);
  for (let i = 0; i < moteCount; i++) {
    mp[i * 3] = (random() - 0.5) * 70;
    mp[i * 3 + 1] = random() * 22;
    mp[i * 3 + 2] = (random() - 0.5) * 86;
  }
  const moteGeo = new T.BufferGeometry();
  moteGeo.setAttribute("position", new T.BufferAttribute(mp, 3));
  w.particles = new T.Points(
    moteGeo,
    new T.PointsMaterial({
      color: 0x92e5d1,
      size: 0.052,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      map: glowSprite().material.map,
      blending: T.AdditiveBlending,
    }),
  );
  root.add(w.particles);

  // A giant ray moves outside the pressure glass, using 97 animated vertices.
  const leviathan = new T.Group();
  root.add(leviathan);
  const controlOutline = [
    [0, 0.7, 0],
    [-3, 0.2, 5],
    [-8, 0.3, 4],
    [-16, 0, -1],
    [-9, -0.3, -3],
    [-3, 0, -2],
    [0, 0.2, -6],
    [3, 0, -2],
    [9, -0.3, -3],
    [16, 0, -1],
    [8, 0.3, 4],
    [3, 0.2, 5],
    [0, 0.5, 7],
  ];
  const outline = [
    controlOutline[0],
    ...new T.CatmullRomCurve3(
      controlOutline.slice(1).map((p) => new T.Vector3(...p)),
      true,
      "catmullrom",
      0.28,
    )
      .getSpacedPoints(96)
      .slice(0, -1)
      .map((p) => p.toArray()),
  ];
  const rayGeo = new T.BufferGeometry();
  rayGeo.setAttribute(
    "position",
    new T.Float32BufferAttribute(outline.flat(), 3),
  );
  const ri = [];
  for (let i = 1; i < outline.length; i++)
    ri.push(0, i, i === outline.length - 1 ? 1 : i + 1);
  rayGeo.setIndex(ri);
  rayGeo.computeVertexNormals();
  const rayMat = mat(0x143b46, 0.72, 0.1, { side: T.DoubleSide });
  const animal = new T.Mesh(rayGeo, rayMat);
  leviathan.add(animal);
  sphere(leviathan, rayMat, 0, 0.15, 0, 1, 2.6, 0.65, 5.5);
  tube(
    [
      [0, 0.1, -4],
      [0, 0, -10],
      [1, -0.6, -19],
    ],
    rayMat,
    0.11,
    leviathan,
    12,
    5,
  );
  for (const s of [-1, 1]) sphere(leviathan, turquoise, s * 1.65, 0.8, 4, 0.12);
  leviathan.position.set(-8, 33, -16);
  leviathan.rotation.y = -0.5;
  // External seabed silhouettes establish depth through the viewing windows.
  const rockMaterials = [mat(0x183b41, 1, 0), mat(0x123039, 1, 0)];
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2,
      h = 9 + random() * 21;
    const rock = mesh(
      new T.DodecahedronGeometry(1, 0),
      rockMaterials[i % 2],
      stage,
      Math.sin(a) * 65,
      h / 2 - 8,
      Math.cos(a) * 72,
    );
    rock.scale.set(5 + random() * 8, h, 5 + random() * 7);
    rock.rotation.y = random() * 5;
  }
  const fishGeo = new T.ConeGeometry(0.12, 0.8, 3);
  fishGeo.rotateX(Math.PI / 2);
  const fish = new T.InstancedMesh(fishGeo, mat(0x4c7f84, 0.6, 0.35), 110);
  const fishSeeds = Array.from({ length: 110 }, () => [
    random() * 6.28,
    random() * 8,
    random() * 6,
  ]);
  root.add(fish);

  return {
    update(dt, time) {
      oceanTime.value = plantTime.value = waterTime.value = time;
      const power = w.powerLevel;
      leafMaterial.emissiveIntensity = 0.3 + power * 0.8;
      turquoise.emissiveIntensity = 0.4 + power * 1.7;
      astrolabe.rotation.y = time * (0.014 + power * 0.035);
      astrolabe.children.forEach((o, i) => {
        if (o.geometry?.type === "TorusGeometry")
          o.rotation.z += dt * (i % 2 ? -1 : 1) * (0.015 + power * 0.065);
      });
      globe.rotation.y = time * 0.055;
      specimens.forEach((s, i) => {
        s.rotation.y = time * 0.12 + i;
        s.position.y = 2.2 + Math.sin(time * 0.7 + i) * 0.08;
      });
      leviathan.position.set(
        Math.sin(time * 0.026 - 0.32) * 25,
        33 + Math.sin(time * 0.06) * 2,
        -16 + Math.cos(time * 0.025) * 9,
      );
      leviathan.rotation.y = -0.5 + Math.sin(time * 0.022) * 0.7;
      const p = rayGeo.attributes.position;
      for (let i = 0; i < p.count; i++)
        p.setY(
          i,
          outline[i][1] +
            Math.sin(time * 0.55) *
              Math.pow(Math.abs(outline[i][0]) / 16, 1.5) *
              2,
        );
      p.needsUpdate = true;
      rayGeo.computeVertexNormals();
      fishSeeds.forEach(([a, r, h], i) => {
        const angle = a + time * 0.06;
        dummy.position.set(
          Math.cos(angle) * (9 + r) + 10,
          19 + h,
          Math.sin(angle) * 7 - 29,
        );
        dummy.rotation.set(0, -angle, 0);
        dummy.scale.setScalar(0.8 + (i % 3) * 0.25);
        dummy.updateMatrix();
        fish.setMatrixAt(i, dummy.matrix);
      });
      fish.instanceMatrix.needsUpdate = true;
      fish.computeBoundingSphere();
      for (const i of w.interactions)
        if (i.kind === "recording" && !i.read) {
          i.data.rotation.y = time;
          i.data.position.y = 1.66 + Math.sin(time * 1.5 + i.index) * 0.07;
        }
    },
    setQuality(quality, mobile) {
      caustics.visible = quality !== "low";
      causticMaterial.uniforms.strength.value = mobile ? 0.065 : 0.105;
      glass.visible = quality !== "low";
      // The giant tree and ray remain visible at every quality level.
      fish.count = quality === "low" ? 30 : mobile ? 60 : 110;
      foliageMesh.count = foliage.length;
    },
  };
}
