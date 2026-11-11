import * as T from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { surface, projectSurfaceUV } from "./surfaces.js";
import { RELIQUARY } from "./content/reliquary.js";
import { WEAPONS } from "./content/weapons.js";

const TAU = Math.PI * 2;
const smooth = (a, b, x) => T.MathUtils.smoothstep(x, a, b);

function part(parent, geometry, material, x = 0, y = 0, z = 0) {
  const mesh = new T.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = mesh.receiveShadow = !material.transparent;
  parent.add(mesh);
  return mesh;
}
function block(p, m, x, y, z, w, h, d, bevel = 0.012) {
  const geo = new RoundedBoxGeometry(
    w,
    h,
    d,
    1,
    Math.min(bevel, w / 4, h / 4, d / 4),
  );
  projectSurfaceUV(geo, m.userData.grain || 0.65);
  return part(p, geo, m, x, y, z);
}
function ring(p, m, x, y, z, r, tube = 0.015, arc = TAU) {
  return part(p, new T.TorusGeometry(r, tube, 6, 48, arc), m, x, y, z);
}
function rod(p, m, a, b, radius = 0.02) {
  const start = new T.Vector3(...a),
    end = new T.Vector3(...b);
  const mesh = part(
    p,
    new T.CylinderGeometry(radius, radius, start.distanceTo(end), 10),
    m,
  );
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(
    new T.Vector3(0, 1, 0),
    end.sub(start).normalize(),
  );
  return mesh;
}
// Hundreds of physical details become a handful of draws per moving assembly.
function bake(group) {
  const buckets = new Map();
  for (const mesh of [...group.children]) {
    if (!mesh.isMesh) continue;
    mesh.updateMatrix();
    const geo = mesh.geometry.clone().applyMatrix4(mesh.matrix);
    const flat = geo.index ? geo.toNonIndexed() : geo;
    if (flat !== geo) geo.dispose();
    if (!buckets.has(mesh.material)) buckets.set(mesh.material, []);
    buckets.get(mesh.material).push(flat);
    mesh.geometry.dispose();
    group.remove(mesh);
  }
  for (const [material, geometries] of buckets) {
    part(group, mergeGeometries(geometries), material);
    geometries.forEach((g) => g.dispose());
  }
}
function inscription() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const c = canvas.getContext("2d");
  c.fillStyle = "#151c1c";
  c.fillRect(0, 0, 1024, 256);
  c.strokeStyle = "#8b7957";
  c.lineWidth = 3;
  c.strokeRect(13, 13, 998, 230);
  c.strokeRect(22, 22, 980, 212);
  c.textAlign = "center";
  c.fillStyle = "#cbb895";
  c.font = "500 26px Georgia";
  c.fillText("VESPER  /  DIVISION DES PHÉNOMÈNES", 512, 64);
  c.font = "bold 74px Georgia";
  c.fillText("LE RELIQUAIRE", 512, 149);
  c.font = "24px monospace";
  c.fillStyle = "#9eaa9e";
  c.fillText("PROJET IX   ·   NE RIEN PROMETTRE AU VIDE", 512, 206);
  // Etched wear is deterministic, so reloading doesn't repaint the object.
  for (let i = 0; i < 170; i++) {
    c.fillStyle = i % 3 ? "#111b1b45" : "#d7c6a41a";
    c.fillRect((i * 173.3) % 1024, (i * 49.7) % 256, 2 + (i % 31), 1);
  }
  const map = new T.CanvasTexture(canvas);
  map.colorSpace = T.SRGBColorSpace;
  map.anisotropy = 4;
  return new T.MeshStandardMaterial({ map, roughness: 0.73, metalness: 0.45 });
}

function fieldMaterial(kind) {
  return new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    blending: T.AdditiveBlending,
    uniforms: {
      time: { value: 0 },
      progress: { value: 1 },
      power: { value: 0 },
      tint: { value: new T.Color(0x82cdd5) },
    },
    vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `
      varying vec2 vUv; uniform float time,power,progress; uniform vec3 tint;
      #define TAU 6.2831853
      void main(){
        vec2 p=(vUv-.5)*2.; float r=length(p); float a=atan(p.y,p.x);
        float alpha=0.;
        ${
          kind === "well"
            ? `
          float spiral=sin(a*5.+r*22.-time*2.8)*.5+.5;
          float rim=exp(-abs(r-.82)*50.);
          float iris=pow(max(0.,1.-r),2.);
          alpha=(rim*.8+spiral*.14+iris*.32)*(1.-smoothstep(.8,1.,r));
          alpha+=exp(-abs(r-.68)*80.)*.23;
        `
            : kind === "seal"
              ? `
          float ticks=pow(max(0.,cos(a*48.)),18.);
          alpha=exp(-abs(r-.8)*150.)*.55+exp(-abs(r-.88)*160.)*.2;
          alpha+=ticks*step(.71,r)*step(r,.77)*.65;
          alpha*=1.-smoothstep(.94,1.,r);
          alpha*=mix(.15,1.,step(fract(a/TAU+.75),progress));
        `
              : `
          float strands=pow(max(0.,sin(vUv.x*TAU*7.+vUv.y*5.-time*.7)),14.);
          float wisps=sin(vUv.x*TAU*3.-vUv.y*9.+time)*.5+.5;
          alpha=(strands*.24+wisps*.08)*pow(1.-vUv.y,2.)*smoothstep(0.,.12,vUv.y);
        `
        }
        gl_FragColor=vec4(tint*1.8,alpha*power);
      }`,
  });
}

export function createReliquary(root) {
  const body = new T.Group();
  root.add(body);
  root.name = "reliquary-project-ix";
  const wood = surface("wood", 0xc1a587, { roughness: 0.88 });
  wood.userData.grain = 0.9;
  const iron = surface("metal", 0x606b6c, { roughness: 0.72, metalness: 0.82 });
  const bronze = surface("metal", 0xb19663, {
    roughness: 0.57,
    metalness: 0.8,
  });
  const edge = surface("metal", 0x9da5a2, { roughness: 0.42, metalness: 0.86 });
  const dark = new T.MeshStandardMaterial({
    color: 0x0a1317,
    roughness: 0.86,
    metalness: 0.35,
  });
  const lightMaterial = new T.MeshStandardMaterial({
    color: 0x74bfbd,
    emissive: 0x67d5d8,
    emissiveIntensity: 1.1,
    roughness: 0.3,
    metalness: 0.3,
  });

  // A real hollow case, with end-grain planks and a recessed induction chamber.
  block(body, iron, 0, 0.22, 0, 2.87, 0.19, 1.35);
  block(body, dark, 0, 0.35, 0, 2.63, 0.12, 1.13);
  for (const z of [-0.57, 0.57]) {
    for (let row = 0; row < 3; row++)
      block(body, wood, 0, 0.43 + row * 0.235, z, 2.62, 0.223, 0.12);
    block(body, iron, 0, 0.99, z, 2.87, 0.1, 0.15);
    block(body, bronze, 0, 1.054, z, 2.87, 0.025, 0.165);
    for (const x of [-1.32, -0.91, 0.91, 1.32]) {
      block(body, iron, x, 0.64, z * 1.12, 0.105, 0.77, 0.06);
      block(body, bronze, x - 0.033, 0.64, z * 1.18, 0.012, 0.77, 0.008);
      for (const y of [0.33, 0.55, 0.83, 0.98]) {
        const rivet = part(
          body,
          new T.CylinderGeometry(0.026, 0.029, 0.019, 8),
          edge,
          x,
          y,
          z * 1.19,
        );
        rivet.rotation.x = Math.PI / 2;
      }
    }
  }
  for (const x of [-1.3, 1.3]) {
    block(body, wood, x, 0.64, 0, 0.12, 0.63, 1.02);
    block(body, iron, x, 0.98, 0, 0.17, 0.1, 1.16);
    for (const z of [-0.48, 0.48]) {
      block(body, iron, x, 0.12, z, 0.24, 0.23, 0.3);
      block(body, bronze, x, 0.055, z, 0.27, 0.06, 0.32);
    }
    const handle = ring(body, iron, x * 1.062, 0.63, 0, 0.16, 0.028);
    handle.rotation.y = Math.PI / 2;
    rod(body, bronze, [x * 1.06, 0.78, -0.18], [x * 1.06, 0.78, 0.18], 0.035);
  }
  // Brass conduits and ceramic coil insulators inside the cavity.
  for (const x of [-1.03, 1.03]) {
    rod(body, bronze, [x, 0.52, -0.43], [x, 0.52, 0.43], 0.036);
    for (let n = 0; n < 11; n++) {
      const coil = ring(body, edge, x, 0.52, -0.35 + n * 0.07, 0.07, 0.012);
      coil.rotation.z = Math.PI / 2;
    }
    block(body, dark, x, 0.42, 0, 0.22, 0.1, 0.97);
  }
  for (let i = 0; i < 12; i++) {
    block(body, iron, -0.84 + i * 0.153, 0.43, 0, 0.055, 0.12, 0.85);
    block(
      body,
      lightMaterial,
      -0.81 + i * 0.147,
      0.995,
      0.665,
      0.047,
      0.022,
      0.012,
    );
  }
  block(body, iron, 0, 0.71, 0.671, 1.46, 0.43, 0.045);
  part(body, new T.PlaneGeometry(1.39, 0.348), inscription(), 0, 0.72, 0.697);
  for (const x of [-0.69, 0.69])
    for (const y of [0.55, 0.88])
      part(body, new T.SphereGeometry(0.014, 6, 4), bronze, x, y, 0.703);
  bake(body);

  const lid = new T.Group();
  lid.position.set(0, 1.07, -0.59);
  root.add(lid);
  const lidSkin = new T.Group();
  lid.add(lidSkin);
  // Slightly vaulted lid: independent slats catch the light at different angles.
  for (let n = 0; n < 9; n++) {
    const z = 0.065 + n * 0.131;
    const y = 0.065 + Math.sin((z / 1.18) * Math.PI) * 0.13;
    const plank = block(lidSkin, wood, 0, y, z, 2.76, 0.115, 0.125);
    plank.rotation.x = Math.cos((z / 1.18) * Math.PI) * 0.28;
    for (const x of [-1.29, -0.91, 0.91, 1.29]) {
      const band = block(lidSkin, bronze, x, y + 0.066, z, 0.085, 0.025, 0.139);
      band.rotation.x = plank.rotation.x;
      if (n % 2 === 0)
        part(lidSkin, new T.SphereGeometry(0.021, 6, 4), edge, x, y + 0.09, z);
    }
  }
  block(lidSkin, iron, 0, 0.005, 0.59, 2.8, 0.06, 1.22);
  block(lidSkin, dark, 0, -0.033, 0.59, 2.46, 0.027, 0.98);
  for (const x of [-0.9, 0.9])
    rod(lidSkin, edge, [x - 0.14, 0, 0], [x + 0.14, 0, 0], 0.055);
  for (const z of [0.19, 0.99])
    block(lidSkin, bronze, 0, -0.052, z, 2.22, 0.02, 0.023);
  const seal = ring(lidSkin, bronze, 0, -0.055, 0.59, 0.33, 0.012);
  seal.rotation.x = Math.PI / 2;
  const innerSeal = ring(lidSkin, lightMaterial, 0, -0.057, 0.59, 0.26, 0.006);
  innerSeal.rotation.x = Math.PI / 2;
  for (let n = 0; n < 8; n++) {
    const a = (n * TAU) / 8;
    rod(
      lidSkin,
      bronze,
      [Math.cos(a) * 0.36, -0.057, 0.59 + Math.sin(a) * 0.36],
      [Math.cos(a) * 0.41, -0.057, 0.59 + Math.sin(a) * 0.41],
      0.009,
    );
  }
  bake(lidSkin);

  const latches = [];
  for (const x of [-0.91, 0.91]) {
    const latch = new T.Group();
    latch.position.set(x, 1.08, 0.69);
    root.add(latch);
    block(latch, bronze, 0, -0.14, 0, 0.15, 0.29, 0.055);
    block(latch, iron, 0, -0.2, 0.04, 0.075, 0.1, 0.06);
    rod(latch, edge, [-0.09, 0, 0], [0.09, 0, 0], 0.028);
    bake(latch);
    latches.push(latch);
  }
  const dial = new T.Group();
  dial.position.set(0, 0.395, 0.674);
  root.add(dial);
  ring(dial, bronze, 0, 0, 0, 0.092, 0.018);
  for (let i = 0; i < 8; i++) {
    const a = (i * TAU) / 8;
    rod(
      dial,
      edge,
      [Math.cos(a) * 0.04, Math.sin(a) * 0.04, 0],
      [Math.cos(a) * 0.08, Math.sin(a) * 0.08, 0],
      0.009,
    );
  }
  bake(dial);

  const well = part(
    root,
    new T.PlaneGeometry(1.98, 0.88),
    fieldMaterial("well"),
    0,
    0.63,
    0,
  );
  well.rotation.x = -Math.PI / 2;
  const veil = part(
    root,
    new T.CylinderGeometry(0.78, 0.45, 2.7, 48, 1, true),
    fieldMaterial("veil"),
    0,
    1.94,
    0,
  );
  const ground = part(
    root,
    new T.PlaneGeometry(4.1, 4.1),
    fieldMaterial("seal"),
    0,
    0.035,
    0,
  );
  ground.rotation.x = -Math.PI / 2;
  const wave = part(
    root,
    new T.RingGeometry(0.95, 1, 72),
    new T.MeshBasicMaterial({
      color: 0x98deed,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: T.AdditiveBlending,
      side: T.DoubleSide,
    }),
    0,
    0.04,
    0,
  );
  wave.rotation.x = -Math.PI / 2;
  // Narrow locator, deliberately quiet at rest; the chamber supplies the spectacle.
  const beacon = part(
    root,
    new T.CylinderGeometry(0.055, 0.2, 16, 16, 1, true),
    fieldMaterial("veil"),
    0,
    9.1,
    -0.17,
  );

  const geometry = new T.BufferGeometry();
  const seeds = new Float32Array(96 * 3);
  for (let i = 0; i < 96; i++) {
    seeds[i * 3] = (i * 0.618034) % 1;
    seeds[i * 3 + 1] = (i * 0.754878) % 1;
    seeds[i * 3 + 2] = (i * 0.56984) % 1;
  }
  geometry.setAttribute("position", new T.BufferAttribute(seeds, 3));
  const motes = new T.Points(
    geometry,
    new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
      uniforms: {
        time: { value: 0 },
        power: { value: 0 },
        tint: { value: new T.Color(0x9bdce0) },
      },
      vertexShader: `uniform float time,power; varying float alpha; void main(){
      float life=fract(position.y+time*(.12+position.z*.08));
      float a=position.x*6.283+time*(.4+position.z)*power;
      float r=(.22+position.z*.65)*(1.-life*.5);
      vec3 p=vec3(cos(a)*r, .65+life*(.55+power*2.5), sin(a)*r*.6);
      vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv;
      gl_PointSize=clamp((10.+position.z*12.)/max(1.,-mv.z),1.,7.);
      alpha=sin(life*3.14159)*power;
    }`,
      fragmentShader: `uniform vec3 tint; varying float alpha; void main(){float d=length(gl_PointCoord-.5)*2.;gl_FragColor=vec4(tint*2.,pow(max(0.,1.-d),2.)*alpha);}`,
    }),
  );
  motes.frustumCulled = false;
  root.add(motes);
  const light = new T.PointLight(0x89dce5, 0.8, 6, 2);
  light.position.set(0, 1.85, 1.05);
  root.add(light);
  return {
    lid,
    latches,
    dial,
    lightMaterial,
    well,
    veil,
    ground,
    wave,
    beacon,
    motes,
    light,
    open: 0,
    revealAge: 100,
    closeAge: 100,
    wasBusy: false,
    offered: null,
    color: new T.Color(0x88d8dc),
    targetColor: new T.Color(),
    elapsed: 0,
  };
}

export function updateReliquary(box, dt, time, quality) {
  const v = box.reliquary;
  if (!v) return;
  const elapsed = Math.max(0, RELIQUARY.drawDuration - (box.timer || 0));
  const offered = !!box.offered;
  const isNewOffer = offered && v.offered !== box.offered;
  if (isNewOffer) v.revealAge = 0;
  if (v.wasBusy && !box.busy) v.closeAge = 0;
  v.revealAge += dt;
  v.closeAge += dt;
  v.wasBusy = !!box.busy;
  v.offered = box.offered;
  const openTarget = box.busy ? smooth(0.22, 0.96, elapsed) : 0;
  v.open += (openTarget - v.open) * (1 - Math.exp(-dt * (box.busy ? 16 : 5)));
  v.lid.rotation.x = -v.open * 1.72;
  v.lid.rotation.z =
    box.busy && !offered
      ? Math.sin(time * 31) * 0.0018 * (1 - smooth(3.8, 4.8, elapsed))
      : 0;
  v.latches.forEach((latch, i) => {
    latch.rotation.x =
      -(box.busy ? smooth(0.05 + i * 0.06, 0.31 + i * 0.06, elapsed) : v.open) *
      1.15;
  });
  const pulse = Math.exp(-v.revealAge * 3.5);
  const urgent = offered && box.offerTimer < 5;
  const breathe = 0.5 + 0.5 * Math.sin(time * (urgent ? 7 : 2));
  const active =
    v.open *
    (offered ? 0.7 + breathe * 0.1 : 0.6 + smooth(1, 4.7, elapsed) * 0.4);
  v.targetColor.setHex(
    offered
      ? RELIQUARY.colors[WEAPONS[box.offered]?.rarity] || 0x81d9eb
      : 0x85d4d5,
  );
  v.color.lerp(v.targetColor, 1 - Math.exp(-dt * 5));
  v.dial.rotation.z +=
    dt * (box.busy && !offered ? 2 + smooth(0, 3, elapsed) * 8 : 0.06);
  v.lightMaterial.emissive.copy(v.color);
  v.lightMaterial.emissiveIntensity = 0.6 + active * 2 + pulse * 2;
  v.light.color.copy(v.color);
  v.light.intensity = 2.8 + active * 11 + pulse * 12;
  for (const o of [v.well, v.veil, v.ground, v.beacon, v.motes]) {
    o.material.uniforms.time.value = time;
    o.material.uniforms.tint.value.copy(v.color);
  }
  v.well.material.uniforms.power.value = 0.2 + active * 1.4 + pulse;
  v.veil.material.uniforms.power.value = active * 0.65 + pulse * 0.65;
  v.ground.material.uniforms.power.value = 0.06 + active * 0.35 + pulse * 0.4;
  v.beacon.material.uniforms.power.value = 0.14 + active * 0.2;
  v.motes.material.uniforms.power.value = active;
  v.motes.geometry.setDrawRange(
    0,
    quality === "low" ? 32 : quality === "medium" ? 56 : 96,
  );
  v.veil.visible = v.motes.visible = v.open > 0.025;
  v.ground.material.uniforms.progress.value = offered
    ? box.offerTimer / RELIQUARY.offerDuration
    : 1;
  v.wave.material.color.copy(v.color);
  const shockAge = Math.min(v.revealAge, v.closeAge);
  v.wave.visible = shockAge < 0.8;
  v.wave.scale.setScalar(1 + shockAge * 4);
  v.wave.material.opacity = Math.max(0, 1 - shockAge / 0.8) * 0.38;
  if (box.display) {
    const rise = offered
      ? smooth(0, 0.55, v.revealAge)
      : smooth(0.72, 1.3, elapsed);
    box.display.visible = v.open > 0.55;
    box.display.position.set(
      0,
      1.55 + rise * 0.46 + Math.sin(time * 2) * 0.045,
      0.08,
    );
    // Present the actual silhouette broadside; don't spin the reward out of view.
    box.display.rotation.set(
      0.06 * Math.sin(time),
      Math.PI / 2 +
        Math.sin(time * (offered ? 0.55 : 1.5)) * (offered ? 0.23 : 0.6),
      0,
    );
    box.display.position.y += pulse * 0.12;
    if (offered)
      box.display.position.y -= (1 - smooth(0, 3, box.offerTimer)) * 0.38;
  }
}
