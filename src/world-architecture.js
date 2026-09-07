import * as T from "three";
import { box, cylinder, mesh, mat, label } from "./assets.js";
import { worldSurface, surfaceTexture } from "./surfaces.js";
import { rng } from "./logic.js";

// Architectural details are built before World.batch(). Everything solid sits
// on existing walls/cover, above headroom, or beyond the playable boundary.
function pipe(parent, material, points, radius = 0.045, segments = 28) {
  return mesh(
    new T.TubeGeometry(
      new T.CatmullRomCurve3(points.map((p) => new T.Vector3(...p))),
      segments,
      radius,
      7,
      false,
    ),
    material,
    parent,
  );
}

function lancet(width, height) {
  const s = new T.Shape();
  s.moveTo(-width / 2, -height / 2);
  s.lineTo(width / 2, -height / 2);
  s.lineTo(width / 2, height * 0.19);
  s.quadraticCurveTo(width * 0.42, height * 0.37, 0, height / 2);
  s.quadraticCurveTo(-width * 0.42, height * 0.37, -width / 2, height * 0.19);
  s.closePath();
  const g = new T.ShapeGeometry(s, 18);
  const p = g.attributes.position,
    uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++)
    uv.setXY(i, p.getX(i) / width + 0.5, p.getY(i) / height + 0.5);
  return g;
}

function abbey(world) {
  const { static: stage, materials: m } = world;
  const stone = worldSurface("plaster", 0xb8b09b, 1.45, { roughness: 0.92 });
  const soot = worldSurface("plaster", 0x545851, 2.1, { roughness: 0.98 });
  const glass = new T.MeshStandardMaterial({
    map: surfaceTexture("stainedGlass"),
    emissiveMap: surfaceTexture("stainedGlass"),
    color: 0xcac2aa,
    emissive: 0xffca87,
    emissiveIntensity: 0.85,
    roughness: 0.38,
    metalness: 0.1,
    side: T.DoubleSide,
  });
  // Stone voussoirs give the ribs a constructed silhouette instead of tubes.
  for (const z of [-21, -11, -1, 9, 22]) {
    for (const side of [-1, 1]) {
      for (let j = 0; j < 17; j++) {
        const t = (j + 0.5) / 17,
          x = side * 11 * (1 - t);
        const y = 11.85 + 6.4 * Math.sqrt(t);
        const b = box(stage, stone, x, y, z, 0.57, 0.34, 0.68);
        b.rotation.z = Math.atan((-side * 6.4) / (22 * Math.sqrt(t)));
      }
      for (const y of [1.08, 2.65, 4.22, 5.79, 7.36, 8.93, 10.5]) {
        cylinder(stage, soot, side * 11, y, z, 0.492, 0.018, 0.492, 20);
        cylinder(stage, stone, side * 11, y + 0.04, z, 0.505, 0.05, 0.49, 20);
      }
      // Carved capitals and layered bases, shared in the masonry batch.
      for (let k = 0; k < 3; k++) {
        box(
          stage,
          stone,
          side * 11,
          0.19 + k * 0.15,
          z,
          1.75 - k * 0.16,
          0.14,
          1.75 - k * 0.16,
        );
        cylinder(
          stage,
          stone,
          side * 11,
          11.64 + k * 0.12,
          z,
          0.57 + k * 0.085,
          0.13,
          0.63 + k * 0.085,
          12,
        );
      }
    }
  }
  // Broken quadripartite vaults. Deliberate openings admit the moon and weather.
  for (const [za, zb] of [
    [-28, -21],
    [-21, -11],
    [-11, -1],
    [-1, 9],
    [9, 22],
    [22, 29],
  ]) {
    const pos = [],
      uv = [],
      indices = [],
      nx = 32,
      nz = 10;
    for (let k = 0; k <= nz; k++) {
      for (let i = 0; i <= nx; i++) {
        const x = (i / nx - 0.5) * 22,
          z = T.MathUtils.lerp(za, zb, k / nz);
        const y =
          11.98 +
          6.4 * Math.sqrt(Math.max(0, 1 - Math.abs(x) / 11)) +
          Math.sin((k / nz) * Math.PI) * 0.55;
        pos.push(x, y, z);
        uv.push(x / 3, z / 3);
        if (i < nx && k < nz) {
          // An asymmetric roof collapse above the entrance and crossing.
          const broken =
            (za === 9 && i > 9 && i < 27 && k > 2) ||
            (za === -1 && i > 15 && k < 6) ||
            (za === 22 && i > 4 && i < 24);
          if (!broken) {
            const a = k * (nx + 1) + i,
              b = a + nx + 1;
            indices.push(a, a + 1, b, a + 1, b + 1, b);
          }
        }
      }
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    geometry.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const vault = mesh(geometry, soot, stage);
    vault.material.side = T.DoubleSide;
    for (const side of [-1, 1]) {
      const pts = Array.from({ length: 25 }, (_, i) => {
        const t = i / 24;
        return [
          side * 11 * (1 - t),
          11.85 + 6.4 * Math.sqrt(t),
          T.MathUtils.lerp(za, (za + zb) / 2, t),
        ];
      });
      pipe(stage, stone, pts, 0.1);
    }
  }
  // A continuous upper clerestory grounds the arches in real building mass.
  for (const side of [-1, 1]) {
    for (const z of [-16, -6, 4, 15.5]) {
      const span = z === 15.5 ? 12.8 : 9.8;
      box(stage, soot, side * 11.27, 14.05, z, 0.45, 4.55, span);
      box(stage, stone, side * 11.02, 11.78, z, 0.66, 0.18, span);
      for (const offset of [-2, 2]) {
        const pane = mesh(
          lancet(2.3, 3.3),
          glass,
          stage,
          side * 10.99,
          14.1,
          z + offset,
        );
        pane.rotation.y = (-side * Math.PI) / 2;
      }
    }
    for (let z = -21; z < 28; z += 8) {
      const window = new T.Group();
      window.position.set(side * 22.37, 7.05, z);
      window.rotation.y = (-side * Math.PI) / 2;
      stage.add(window);
      mesh(lancet(4.1, 6.25), glass, window);
      for (const dx of [-2.17, 2.17]) {
        cylinder(window, stone, dx, -0.42, 0.07, 0.11, 5.4, 0.11, 12);
        box(window, stone, dx, -3.1, 0, 0.43, 0.22, 0.42);
      }
      pipe(
        window,
        stone,
        [
          [-2.18, 1.22, 0.08],
          [-1.7, 2.13, 0.08],
          [0, 3.3, 0.08],
          [1.7, 2.13, 0.08],
          [2.18, 1.22, 0.08],
        ],
        0.15,
      );
      for (const dx of [-0.68, 0.68])
        box(window, m.dark, dx, -0.18, 0.045, 0.055, 5.95, 0.06);
      for (const y of [-1.4, 0.2, 1.75])
        box(window, m.dark, 0, y, 0.06, 4, 0.048, 0.07);
      box(window, stone, 0, -3.19, 0.03, 4.6, 0.25, 0.62);
    }
    // Side aisle roof, masonry cornices and buttress steps.
    for (let z = -25; z < 28; z += 8) {
      box(stage, soot, side * 19.9, 10.1, z, 5.8, 0.33, 7.8).rotation.z =
        side * 0.24;
      for (let k = 0; k < 4; k++)
        box(
          stage,
          stone,
          side * (22.2 - k * 0.06),
          3.65 + k * 0.15,
          z,
          0.32 + k * 0.13,
          0.13,
          7.7,
        );
    }
  }
  // The former empty back arch becomes the sanctuary's monumental glass wall.
  box(stage, soot, 0, 6, -29.2, 16, 12, 0.45);
  mesh(lancet(7.7, 10.9), glass, stage, 0, 5.8, -28.93);
  for (const x of [-4.2, 4.2]) {
    box(stage, stone, x, 4.6, -28.5, 0.65, 9.2, 0.7);
    cylinder(stage, stone, x, 9.38, -28.45, 0.43, 0.32, 0.52, 12);
  }
  pipe(
    stage,
    stone,
    [
      [-4.2, 9.2, -28.5],
      [-3.3, 10.7, -28.5],
      [0, 12.8, -28.5],
      [3.3, 10.7, -28.5],
      [4.2, 9.2, -28.5],
    ],
    0.28,
  );
  // Individual horizontal planks, carved ends and bolts on the existing pews.
  for (const z of [15, 10, 1, -14])
    for (const x of [-4.9, 4.9]) {
      for (let j = 0; j < 4; j++)
        box(stage, m.wood, x, 0.22 + j * 0.23, z + 0.424, 3.12, 0.195, 0.055);
      for (const s of [-1, 1]) {
        cylinder(stage, stone, x + s * 1.58, 1.21, z, 0.115, 0.2, 0.072, 10);
        for (const y of [0.3, 0.76])
          mesh(
            new T.SphereGeometry(0.025, 7, 5),
            m.gold,
            stage,
            x + s * 1.42,
            y,
            z + 0.464,
          );
      }
    }
}

function station(world) {
  const { static: stage, materials: m, root } = world;
  const panel = worldSurface("steel", 0xa6b5b2, 2.5, {
    roughness: 0.75,
    metalness: 0.35,
  });
  const concrete = worldSurface("concrete", 0x999e92, 3.2, { roughness: 0.91 });
  const dark = worldSurface("steel", 0x404b4a, 2, {
    roughness: 0.63,
    metalness: 0.6,
  });
  const warning = mat(0xc9a253, 0.78, 0.1);
  // Interrupted roof sheets, skylights and longitudinal steel trusses.
  for (const side of [-1, 1]) {
    for (let z = -24; z <= 26; z += 10) {
      box(stage, panel, side * 18, 10.8, z, 10, 0.2, 9.85).rotation.z =
        side * 0.1;
      if (z !== 16)
        box(stage, dark, side * 7, 12.75, z, 10, 0.18, 9.85).rotation.z =
          -side * 0.18;
      for (let i = 0; i < 9; i++)
        box(stage, dark, side * 18, 10.6, z - 4 + i, 9.8, 0.14, 0.055);
    }
    for (const x of [side * 12.8, side * 21]) {
      box(stage, dark, x, 10.5, 0, 0.32, 0.65, 57);
      for (let z = -26; z <= 26; z += 4) {
        const plate = box(stage, panel, x, 10.28, z, 0.48, 0.12, 0.55);
        plate.rotation.z = side * 0.05;
      }
    }
    // Concrete foundation, panel seams and reinforced skirting.
    box(stage, concrete, side * 22.42, 0.52, 0, 0.28, 1.04, 57);
    box(stage, dark, side * 22.25, 1.1, 0, 0.19, 0.14, 57);
    for (let z = -26; z < 27; z += 3) {
      box(stage, dark, side * 22.43, 3.45, z, 0.045, 4.6, 0.045);
      for (const y of [1.35, 5.45])
        mesh(
          new T.SphereGeometry(0.042, 7, 5),
          m.metal,
          stage,
          side * 22.34,
          y,
          z,
        );
    }
    // Warning strips and substantial conduit brackets sit on existing pillars.
    for (let z = -25; z < 29; z += 10)
      for (let k = 0; k < 5; k++) {
        const stripe = box(
          stage,
          warning,
          side * 13,
          0.5 + k * 0.2,
          z + 0.388,
          0.63,
          0.11,
          0.024,
        );
        stripe.rotation.z = side * -0.3;
      }
  }
  // Inspection gantry high enough for all playable characters, with a ladder
  // attached to the solid perimeter. No invisible obstacles enter the routes.
  for (const z of [-23, -3, 17]) {
    box(stage, dark, 0, 7.75, z, 26, 0.21, 1.8);
    for (const edge of [-0.88, 0.88]) {
      box(stage, m.metal, 0, 8.8, z + edge, 26, 0.065, 0.065);
      box(stage, m.metal, 0, 8.25, z + edge, 26, 0.045, 0.045);
      for (let x = -12.5; x < 13; x += 2)
        box(stage, m.metal, x, 8.27, z + edge, 0.065, 1.1, 0.065);
    }
    for (let x = -12.5; x < 13; x += 0.32)
      box(stage, panel, x, 7.9, z, 0.11, 0.045, 1.7);
  }
  // Cargo doors, hinges, corner protectors and stamped identification.
  for (const [x, z, w, d, n] of [
    [-17, 12, 6, 7, "04"],
    [17, 7, 6, 9, "07"],
    [-17, -15, 6, 7, "12"],
    [17, -21, 6, 7, "09"],
  ]) {
    const front = z + d / 2 + 0.075;
    for (const sx of [-1, 1]) {
      box(stage, dark, x + sx * (w / 2 - 0.15), 2, front, 0.17, 3.85, 0.14);
      cylinder(
        stage,
        m.metal,
        x + sx * 0.95,
        1.8,
        front + 0.07,
        0.035,
        3.25,
        0.035,
        8,
      );
      for (const y of [0.5, 1.8, 3.2]) {
        box(
          stage,
          m.metal,
          x + sx * (w / 2 - 0.38),
          y,
          front + 0.055,
          0.38,
          0.1,
          0.09,
        );
        box(stage, warning, x + sx * 2.3, y, front + 0.02, 0.18, 0.29, 0.015);
      }
    }
    box(stage, dark, x, 1.95, front, 0.055, 3.8, 0.055);
    const sign = label(`BØR / ${n} · BIOCONFINEMENT`, "#c6c6ab", 3.3, 0.3);
    sign.position.set(x, 0.38, front + 0.04);
    root.add(sign);
  }
  const sign = label("BØRÉAL  /  REACTEUR 04", "#c6cfc7", 7.5, 0.7);
  sign.position.set(0, 7.1, -27.2);
  root.add(sign);
  for (const side of [-1, 1]) {
    for (const dx of [-0.36, 0.36])
      cylinder(stage, m.metal, side * 21 + dx, 3.8, -25, 0.04, 7.6, 0.04, 8);
    for (let y = 0.25; y < 7.6; y += 0.32)
      box(stage, m.metal, side * 21, y, -25, 0.82, 0.045, 0.065);
    pipe(
      stage,
      m.black,
      [
        [side * 17, 5, -18],
        [side * 13, 4.7, -17],
        [side * 10, 5.2, -15],
        [side * 4, 5.6, -14],
      ],
      0.03,
    );
  }
}

function abyss(world) {
  const { static: stage, materials: m } = world;
  // Flanged pressure fittings and segmented copper ribs enhance the existing
  // conservatory without compromising its glass canopy and open circulation.
  for (const side of [-1, 1]) {
    for (let z = -35; z <= 35; z += 7) {
      const x = side * 34.6;
      for (const y of [0.3, 0.55]) box(stage, m.gold, x, y, z, 0.32, 0.08, 6.9);
      for (const dy of [-0.18, 0.18])
        for (const dz of [-0.18, 0.18]) {
          mesh(
            new T.SphereGeometry(0.045, 7, 5),
            m.gold,
            stage,
            x - side * 0.12,
            1.7 + dy,
            z + dz,
          );
        }
    }
  }
}

export function buildArchitecture(world) {
  if (world.id === "abbey") abbey(world);
  else if (world.id === "station") station(world);
  else abyss(world);
  // Broken stone and dust clusters use one instanced submission; placement is
  // bounded to existing cover so there are no new collision surprises.
  const random = rng(world.id === "abbey" ? 6182 : 4193),
    count = 260;
  const chunks = new T.InstancedMesh(
    new T.DodecahedronGeometry(1, 0),
    world.materials.trim,
    count,
  );
  const dummy = new T.Object3D();
  const cover = world.obstacles.filter((o) => o.w < 7 && o.d < 8 && o.h < 5);
  for (let i = 0; i < count; i++) {
    const o = cover[i % Math.max(1, cover.length)] || {
      x: 21,
      z: 0,
      w: 1,
      d: 30,
    };
    const side = i % 2 ? 1 : -1,
      size = 0.025 + random() ** 2 * 0.16;
    dummy.position.set(
      o.x + side * (o.w * 0.5 + 0.05 + random() * 0.38),
      size * 0.3,
      o.z + (random() - 0.5) * (o.d + 0.6),
    );
    dummy.rotation.set(random() * 5, random() * 6, random() * 5);
    dummy.scale.set(size * 1.7, size * 0.55, size);
    dummy.updateMatrix();
    chunks.setMatrixAt(i, dummy.matrix);
    chunks.setColorAt(i, new T.Color().setScalar(0.52 + random() * 0.45));
  }
  chunks.receiveShadow = true;
  chunks.computeBoundingSphere();
  world.root.add(chunks);
  world.architectureDebris = chunks;
}
