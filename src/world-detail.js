import * as T from "three";
import { box, cylinder, mesh, mat, label } from "./assets.js";
import { rng } from "./logic.js";

const noiseGLSL = `
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
float fbm(vec2 p){return noise(p)*.57+noise(p*2.03+7.)*.28+noise(p*4.1)*.15;}`;

function decalTexture(kind) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d"),
    r = rng(kind === "dirt" ? 190 : 211);
  const image = ctx.createImageData(256, 256);
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 256; x++) {
      const dx = (x - 128) / 128,
        dy = (y - 128) / 128;
      const angle = Math.atan2(dy, dx),
        d = Math.hypot(dx, dy);
      const edge =
        0.68 + Math.sin(angle * 5) * 0.065 + Math.sin(angle * 11 + 2) * 0.045;
      const a =
        kind === "dirt"
          ? Math.max(0, 1 - d) ** 2 * (0.5 + r() * 0.5)
          : T.MathUtils.smoothstep(edge - d, 0, 0.12);
      const i = (y * 256 + x) * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = 255;
      image.data[i + 3] = Math.floor(a * 255);
    }
  ctx.putImageData(image, 0, 0);
  return new T.CanvasTexture(c);
}

function instances(parent, geometry, material, transforms) {
  const group = new T.InstancedMesh(geometry, material, transforms.length);
  const dummy = new T.Object3D();
  transforms.forEach((t, i) => {
    dummy.position.set(t.x, t.y ?? 0.016, t.z);
    dummy.rotation.set(-Math.PI / 2, 0, t.angle || 0);
    dummy.scale.set(t.w, t.h || t.w, 1);
    dummy.updateMatrix();
    group.setMatrixAt(i, dummy.matrix);
  });
  group.receiveShadow = true;
  group.computeBoundingSphere();
  parent.add(group);
  return group;
}

export function enrichWorld(world) {
  const { root, static: stage, materials: m } = world;
  const abbey = world.id === "abbey",
    r = rng(abbey ? 20261 : 20262);
  const effects = new T.Group();
  effects.name = "atmosphere";
  root.add(effects);
  const dressing = new T.Group();
  dressing.name = "surface-details";
  root.add(dressing);
  const dirt = new T.MeshBasicMaterial({
    color: 0x171a17,
    map: decalTexture("dirt"),
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
  });
  const stains = [],
    water = [],
    contacts = [];
  for (let i = 0; i < 58; i++) {
    stains.push({
      x: (r() - 0.5) * 44,
      z: (r() - 0.5) * 54,
      w: 1 + r() * 4,
      h: 1 + r() * 3,
      angle: r() * 6,
    });
    if (i < 20)
      water.push({
        x: (r() - 0.5) * 41,
        z: (r() - 0.5) * 51,
        w: 1.5 + r() * 3.7,
        h: 0.5 + r() * 1.5,
        angle: r() * 6,
        y: 0.019,
      });
  }
  for (const o of world.obstacles) {
    if (o.w > 10 || o.d > 10) continue;
    contacts.push({ x: o.x, z: o.z, w: o.w + 1.7, h: o.d + 1.7, y: 0.012 });
  }
  instances(dressing, new T.PlaneGeometry(1, 1), dirt, [
    ...stains,
    ...contacts,
  ]);
  const wet = new T.MeshStandardMaterial({
    color: abbey ? 0x243332 : 0x35545b,
    roughness: 0.12,
    metalness: 0.3,
    map: decalTexture("water"),
    transparent: true,
    opacity: 0.68,
    depthWrite: false,
    envMapIntensity: 1.8,
  });
  instances(dressing, new T.PlaneGeometry(1, 1), wet, water);

  // Small debris lives at walls and existing cover; paths and collision remain aligned.
  const chipGeo = new T.DodecahedronGeometry(1, 0);
  const debris = new T.InstancedMesh(chipGeo, m.stone, 190);
  const dummy = new T.Object3D();
  for (let i = 0; i < 190; i++) {
    const x = (i % 2 ? -1 : 1) * (19.7 + r() * 2.1),
      z = -26 + r() * 52;
    const size = 0.045 + r() ** 2 * 0.27;
    dummy.position.set(x, size * 0.28, z);
    dummy.rotation.set(r() * 6, r() * 6, r() * 6);
    dummy.scale.set(size * 1.8, size * 0.65, size);
    dummy.updateMatrix();
    debris.setMatrixAt(i, dummy.matrix);
  }
  debris.castShadow = true;
  debris.receiveShadow = true;
  debris.computeBoundingSphere();
  dressing.add(debris);

  const paper = mat(abbey ? 0x9f9581 : 0xa9b0a5, 0.98, 0);
  for (let i = 0; i < 38; i++) {
    const p = box(
      stage,
      paper,
      (r() - 0.5) * 36,
      0.018 + r() * 0.012,
      (r() - 0.5) * 50,
      0.12 + r() * 0.14,
      0.005,
      0.18 + r() * 0.15,
    );
    p.rotation.y = r() * 6;
  }

  if (abbey) {
    // Worn mouldings, broken roof ribs, buttress caps and uneven wall crowns.
    for (const x of [-22.35, 22.35]) {
      for (const y of [0.25, 3.85]) box(stage, m.trim, x, y, 0, 0.17, 0.18, 57);
      for (let z = -26; z < 28; z += 1.05) {
        const h = 0.12 + r() * 0.5;
        const stone = box(
          stage,
          m.stone,
          x,
          4.2 + h / 2,
          z,
          0.9,
          h,
          0.82 + r() * 0.18,
        );
        stone.rotation.z = (r() - 0.5) * 0.14;
      }
      for (const z of [-21, -11, -1, 9, 22]) {
        box(stage, m.trim, x, 1.2, z, 0.34, 0.16, 1.9);
        for (let k = 0; k < 5; k++) {
          const slab = box(
            stage,
            m.stone,
            x * 0.5 + (r() - 0.5) * 0.8,
            11.9 + k * 0.29,
            z,
            1.2 - k * 0.13,
            0.28,
            1.35,
          );
          slab.rotation.y = k * 0.016;
        }
      }
    }
    const chainMat = mat(0x464c49, 0.6, 0.8);
    for (const z of [-14, 14]) {
      for (const x of [-7.8, 7.8]) {
        cylinder(stage, chainMat, x, 8.4, z, 0.018, 6.5, 0.018, 5);
        const cage = new T.Group();
        cage.position.set(x, 5.15, z);
        stage.add(cage);
        cylinder(cage, m.black, 0, -0.08, 0, 0.26, 0.12, 0.26);
        for (let j = 0; j < 6; j++) {
          const a = (j * Math.PI) / 3;
          cylinder(
            cage,
            chainMat,
            Math.sin(a) * 0.23,
            0.22,
            Math.cos(a) * 0.23,
            0.014,
            0.55,
            0.014,
            5,
          );
        }
        cylinder(cage, m.black, 0, 0.54, 0, 0.31, 0.16, 0.08);
      }
    }
    // Tangled roots on perimeter masonry, baked into the static material batches.
    for (let i = 0; i < 18; i++) {
      const x = i % 2 ? -22.35 : 22.35,
        z = -24 + r() * 48;
      const points = Array.from(
        { length: 6 },
        (_, k) =>
          new T.Vector3(
            x + Math.sin(k * 2 + i) * 0.08,
            k * 0.65,
            z + Math.sin(k * 1.6 + i) * 0.32,
          ),
      );
      mesh(
        new T.TubeGeometry(
          new T.CatmullRomCurve3(points),
          14,
          0.025 + r() * 0.028,
          4,
          false,
        ),
        m.wood,
        stage,
      );
    }
  } else {
    // Industrial pipe collars, cable trays, vents, frost and readable local signage.
    for (const side of [-1, 1]) {
      const x = side * 22;
      for (const y of [1.1, 3.35]) {
        const pipe = cylinder(stage, m.rust, x, y, 0, 0.1, 55, 0.1, 12);
        pipe.rotation.x = Math.PI / 2;
        for (let z = -26; z < 27; z += 3) {
          const cuff = cylinder(stage, m.metal, x, y, z, 0.145, 0.13, 0.145);
          cuff.rotation.x = Math.PI / 2;
          box(stage, m.dark, x + side * 0.11, y, z, 0.25, 0.42, 0.075);
        }
      }
      for (let z = -23; z < 26; z += 8) {
        box(stage, m.dark, x - side * 0.15, 2.7, z, 0.12, 1.4, 2.1);
        for (let j = 0; j < 8; j++)
          box(
            stage,
            m.metal,
            x - side * 0.23,
            2.15 + j * 0.15,
            z,
            0.13,
            0.07,
            1.85,
          );
      }
      for (let z = -25; z < 26; z += 2.4) {
        const ice = mesh(
          new T.SphereGeometry(1, 10, 6),
          m.snow,
          stage,
          side * (20.8 + r()),
          0.04,
          z,
        );
        ice.scale.set(0.6 + r() * 0.7, 0.09 + r() * 0.14, 0.7 + r());
      }
    }
    const sign = label("SECTEUR 04  /  CONFINEMENT", "#c1b48b", 3.7, 0.48);
    sign.position.set(8, 3, -27.05);
    root.add(sign);
    for (const z of [-18, -3, 13]) {
      const points = [
        new T.Vector3(-21, 6.9, z),
        new T.Vector3(-14, 5.9, z + 0.5),
        new T.Vector3(-7, 6.8, z),
      ];
      mesh(
        new T.TubeGeometry(new T.CatmullRomCurve3(points), 18, 0.035, 5, false),
        m.black,
        stage,
      );
    }
  }

  const mistMat = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    uniforms: {
      time: { value: 0 },
      tint: { value: new T.Color(abbey ? 0x82928b : 0x83a9b5) },
    },
    vertexShader: `varying vec2 vUv;varying float vDistance;void main(){vUv=uv;vec4 w=modelMatrix*vec4(position,1.);vDistance=distance(cameraPosition,w.xyz);gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader: `${noiseGLSL} uniform float time;uniform vec3 tint;varying vec2 vUv;varying float vDistance;void main(){float n=fbm(vec2(vUv.x*6.-time*.035,vUv.y*3.+time*.012));float edge=sin(vUv.x*3.14159)*pow(sin(vUv.y*3.14159),2.);float a=smoothstep(.32,.76,n)*edge*.2*smoothstep(1.,5.,vDistance);gl_FragColor=vec4(tint,a);}`,
  });
  for (let i = 0; i < 7; i++) {
    const mist = new T.Mesh(new T.PlaneGeometry(24, 2.7), mistMat);
    mist.position.set((i % 2 ? 1 : -1) * 6, 1.05, -24 + i * 8);
    mist.rotation.y = ((i % 3) - 1) * 0.48;
    effects.add(mist);
  }
  const beamMat = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    blending: T.AdditiveBlending,
    uniforms: {
      time: { value: 0 },
      tint: { value: new T.Color(abbey ? 0x7d9ca5 : 0x518e99) },
    },
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `${noiseGLSL}uniform float time;uniform vec3 tint;varying vec2 vUv;void main(){float width=.05+(1.-vUv.y)*.44;float a=(1.-smoothstep(width*.35,width,abs(vUv.x-.5)))*sin(vUv.y*3.14159);a*=.065*(.65+fbm(vec2(vUv.x*9.,vUv.y*3.-time*.02))*.35);gl_FragColor=vec4(tint,a);}`,
  });
  for (const [x, z] of [
    [-7, -15],
    [8, 8],
    [-9, 23],
  ]) {
    const shaft = new T.Mesh(new T.PlaneGeometry(6, 17), beamMat);
    shaft.position.set(x, 8, z);
    shaft.rotation.z = -0.32;
    effects.add(shaft);
  }

  // A low-cost moving cloud ceiling restores scale without hiding the eclipse.
  const skyMat = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    uniforms: {
      time: { value: 0 },
      tint: { value: new T.Color(abbey ? 0x24343d : 0x263f50) },
    },
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `${noiseGLSL}uniform float time;uniform vec3 tint;varying vec2 vUv;void main(){float n=fbm(vUv*8.+vec2(time*.001,0.));float a=smoothstep(.4,.72,n)*.55;gl_FragColor=vec4(tint*(.65+n*.6),a);}`,
  });
  const sky = new T.Mesh(new T.PlaneGeometry(230, 230), skyMat);
  sky.rotation.x = Math.PI / 2;
  sky.position.y = 45;
  root.add(sky);

  return {
    update(dt, time) {
      mistMat.uniforms.time.value =
        beamMat.uniforms.time.value =
        skyMat.uniforms.time.value =
          time;
    },
    setQuality(quality, mobile) {
      effects.visible = quality !== "low";
      // Distant wisps are sufficient on phones; avoid stacking transparent layers.
      effects.children.forEach((o, i) => {
        o.visible = !mobile || i % 2 === 0;
      });
      debris.count = quality === "low" ? 65 : mobile ? 120 : 190;
      sky.visible = quality !== "low";
    },
  };
}
