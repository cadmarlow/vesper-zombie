import * as T from "three";
import { cylinder, mesh } from "../../assets.js";
import {
  architect,
  thermalBaths,
  hotel,
  clocktower,
  dam,
  mergeMovingParts,
} from "./architecture.js";
import { atmosphere } from "./atmosphere.js";
import { dressLacuna } from "./dressing.js";
import { LACUNA, PURGE_ZONES, sectorAt } from "./data.js";

export function buildLacuna(w) {
  w.bounds = { ...LACUNA.bounds };
  w.spawn.set(...LACUNA.spawn);
  w.spawnPoints = LACUNA.spawns;
  w.machineLocations = LACUNA.machines;
  w.sectors = LACUNA.sectors;
  w.sectorAt = sectorAt;
  w.viewDistance = 430;
  w.viewPitch = 0.06;
  w.lacunaLamps = [];
  const a = architect(w),
    { m, block, solid, sign, column, arch, rail, lamp, bench, window } = a;
  const ambience = atmosphere(w, a);

  for (const x of [-40.5, 40.5])
    block(m.ground, x, -0.3, 0, 63, 0.6, 160).castShadow = false;
  block(m.ground, 0, -0.3, 64, 18, 0.6, 32).castShadow = false;
  block(m.ground, 0, -0.3, -71, 18, 0.6, 18).castShadow = false;
  for (const x of [-72.5, 72.5]) solid(m.stone, x, 2, 0, 1, 4, 162);
  for (const z of [-80.5, 80.5]) solid(m.stone, 0, 2, z, 144, 4, 1);
  // The steep canal is physically inaccessible; bridges are the only crossings.
  for (const [z, depth] of [
    [-55.5, 13],
    [-21.5, 35],
    [18, 28],
  ]) {
    w.obstacle(0, z, 18, depth, 10);
    for (const x of [-9.1, 9.1]) {
      block(m.stone, x, -3.5, z, 0.8, 7, depth);
      rail(x, z, depth, Math.PI / 2);
    }
  }
  w.lacunaBridgeObstacle = w.obstacle(0, 0, 18, 8, 10, { active: false });
  const mobileBridge = new T.Group();
  w.root.add(mobileBridge);
  for (const x of [-4.5, 4.5]) {
    const leaf = new T.Group();
    leaf.position.x = x;
    block(m.iron, 0, -0.22, 0, 9, 0.44, 8, leaf);
    for (let z = -3.8; z < 4; z += 0.4)
      block(m.rust, 0, 0.012, z, 8.8, 0.02, 0.07, leaf);
    for (const z of [-3.95, 3.95]) rail(0, z, 9, 0, leaf);
    mobileBridge.add(leaf);
    mergeMovingParts(leaf);
  }
  // Permanent stone bridges carry broad routes on either end of the canal.
  for (const [z, depth] of [
    [-44, 10],
    [40, 16],
  ]) {
    block(m.stone, 0, -0.8, z, 19.2, 1.6, depth);
    for (const edge of [-1, 1]) {
      if (z === 40 && edge === 1) continue;
      const rz = z + edge * (depth / 2 - 0.2);
      solid(m.stone, 0, 0.55, rz, 18.5, 1.1, 0.5);
      arch(0, -10, rz, 8.6);
      for (const x of [-8.6, 8.6]) lamp(x, rz, 4.2);
    }
  }
  // Promenade seams and bronze guide lines make the two river banks legible.
  for (const x of [-13, 13, -65, 65]) {
    block(m.trim, x, 0.014, 0, 0.2, 0.025, 148);
    for (let z = -73; z < 47; z += 8)
      block(m.dark, x + 1, 0.016, z, 4, 0.027, 0.055);
  }
  for (const z of [-73, 40]) block(m.trim, 0, 0.015, z, 131, 0.025, 0.22);

  // Arrival court: the starting gate is a real perimeter, not a bypassable wall.
  for (const x of [-42, 42]) {
    solid(m.stone, x, 2.5, 48, 60, 5, 1.2);
    solid(m.wall, x, 6, 67, 36, 12, 26);
    block(m.slate, x, 13, 67, 38, 2, 28);
    for (const z of [58, 64, 70, 76])
      window(
        x < 0 ? -23.85 : 23.85,
        7.5,
        z,
        2,
        3,
        x < 0 ? Math.PI / 2 : -Math.PI / 2,
        true,
      );
  }
  for (const x of [-12.6, 12.6]) solid(m.stone, x, 4, 48, 1.4, 8, 2);
  const gateRoot = new T.Group(),
    bars = new T.Group();
  w.root.add(gateRoot);
  gateRoot.add(bars);
  for (let x = -11.7; x < 12; x += 0.7)
    block(m.iron, x, 2.1, 48, 0.11, 4.2, 0.11, bars);
  for (const y of [0.5, 2.7, 4.1])
    block(m.iron, 0, y, 48, 24, 0.12, 0.15, bars);
  const gateSign = sign("LACUNA · ÉVACUATION", 0, 6, 48.3, 16);
  w.root.attach(gateSign);
  const gate = {
    kind: "door",
    id: "lacuna:evacuation",
    root: gateRoot,
    bars,
    sign: gateSign,
    position: new T.Vector3(0, 1, 48),
    name: "Grille de l’Évacuation",
    cost: 750,
    open: false,
    obstacle: w.obstacle(0, 48, 24, 1.3, 5),
  };
  w.doors.push(gate);
  w.interactions.push(gate);
  sign("LES EAUX SE SOUVIENNENT", 0, 3.2, 79.7, 13, Math.PI);
  for (const x of [-20, 20]) {
    bench(x, 65, x < 0 ? Math.PI / 2 : -Math.PI / 2);
    lamp(x, 53);
    lamp(x, 73);
  }
  // Abandoned luggage, barricade and evacuation notices tell the arrival story.
  for (let i = 0; i < 8; i++) {
    const x = (i % 2 ? -1 : 1) * (12 + (i % 3) * 2),
      z = 73 + Math.floor(i / 3);
    const suitcase = block(m.wood, x, 0.32, z, 0.8, 0.6, 0.45);
    suitcase.rotation.y = i * 0.63;
    block(m.iron, x, 0.65, z, 0.22, 0.06, 0.05);
  }
  sign("ABRIS  ←  THERMES     /     ATELIERS  →", 0, 3.2, 46, 14);

  thermalBaths(w, a);
  hotel(w, a);
  clocktower(w, a);
  dam(w, a);

  // Market: an airy iron hall, broken awnings and waist-high merchant stalls.
  for (const x of [-58, -34]) for (const z of [25, 39]) column(x, z, 5.2, 0.14);
  block(m.copper, -46, 5.3, 32, 28, 0.24, 18);
  for (let x = -58; x <= -34; x += 6) {
    const beam = block(m.iron, x, 5.8, 32, 0.11, 0.1, 20);
    beam.rotation.x = 0.12;
  }
  for (const x of [-57, -36]) {
    solid(m.wood, x, 0.55, 31, 3, 1.1, 4);
    for (let i = 0; i < 4; i++) block(m.wood, x, 1.2, 29.5 + i, 2.6, 0.24, 0.7);
  }
  sign("MARCHÉ DES ABSENTS", -46, 4.3, 41.3, 17);

  // Valve house: a through passage framed by huge pipes and analogue gauges.
  solid(m.stone, -60, 4, -45, 1, 8, 27);
  for (const z of [-58, -32])
    for (const x of [-54, -34]) solid(m.stone, x, 3.5, z, 11, 7, 1);
  block(m.copper, -44, 8, -45, 34, 0.6, 28);
  for (const x of [-54, -34]) column(x, -31, 7.5, 0.4);
  for (let x = -52; x <= -36; x += 8) {
    cylinder(w.static, m.rust, x, 6.3, -49, 0.65, 12, 0.65, 12).rotation.z =
      Math.PI / 2;
    block(m.iron, x, 6.3, -48.5, 0.17, 1.7, 1.7);
  }
  sign("POSTE DES VANNES · COURANT", -44, 5.3, -30.9, 18);

  // The turbine cathedral sits directly below the wall of water.
  for (const x of [-23, 23]) solid(m.stone, x, 5, -70, 1, 10, 18);
  for (const x of [-18, 18]) column(x, -60, 9.5, 0.6);
  block(m.iron, 0, 10, -69, 48, 0.5, 23);
  for (const x of [-16, 16]) {
    solid(m.iron, x, 1.3, -70, 4.2, 2.6, 7);
    const turbine = cylinder(w.static, m.copper, x, 2.7, -70, 2, 6, 2, 20);
    turbine.rotation.x = Math.PI / 2;
    for (const z of [-73, -67]) {
      const ring = mesh(
        new T.TorusGeometry(2.1, 0.18, 7, 24),
        m.rust,
        w.static,
        x,
        2.7,
        z,
      );
      ring.castShadow = false;
    }
  }
  sign("CATHÉDRALE DES TURBINES", 0, 8, -57.4, 24);

  // Workshops: two broad doorways, a maintenance court, exposed pressure pipes.
  solid(m.stone, 62, 4, 18, 1, 8, 32);
  for (const z of [2, 34])
    for (const x of [37, 56]) solid(m.stone, x, 3.6, z, 10, 7.2, 1);
  block(m.slate, 48, 8.2, 18, 30, 0.6, 34);
  for (const z of [5, 18, 31]) {
    cylinder(w.static, m.rust, 60, 5.5, z, 0.4, 8, 0.4, 10).rotation.z =
      Math.PI / 2;
    window(61.4, 4.5, z, 3.5, 2.5, -Math.PI / 2);
  }
  for (const x of [39, 54]) solid(m.wood, x, 0.6, 9, 3.5, 1.2, 2);
  sign("ATELIERS DE LA CRUE", 46, 6, 35, 20);

  // A few believable covers occupy edges; the routes remain broad enough for a
  // moving horde and touch controls. No decorative collider blocks a doorway.
  for (const [x, z] of [
    [-20, 25],
    [-20, -27],
    [20, -30],
    [49, 42],
    [-60, -65],
    [59, -70],
  ]) {
    solid(m.stone, x, 0.5, z, 3.2, 1, 1.3);
    for (let i = -1; i <= 1; i++) {
      cylinder(w.static, m.moss, x + i * 0.85, 1.2, z, 0.58, 1.2, 0.22, 7);
    }
  }
  for (const x of [-12, 12]) for (const z of [-58, -29, 18, 45]) lamp(x, z);
  for (const [x, z] of [
    [-66, -20],
    [-66, 23],
    [66, 39],
    [65, -33],
    [-22, -62],
    [23, -65],
  ])
    lamp(x, z);
  for (const [x, z, rot] of [
    [-20, 18, 0],
    [17, -22, Math.PI / 2],
    [-65, -5, Math.PI / 2],
    [20, 43, 0],
  ])
    bench(x, z, rot);
  sign("PONT HAUT  ↑   ·   TURBINES", -14, 3.2, -28, 10);
  sign("PONT BAS  ↓   ·   ÉVACUATION", 14, 3.2, 29, 10, Math.PI);
  sign("PURGE = QUAI FERMÉ · PONTS EN PIERRE OUVERTS", 0, 3, -4.7, 15);

  const valves = PURGE_ZONES.map((zone, index) => {
    const [x, z] = zone.valve,
      root = new T.Group();
    w.root.add(root);
    block(m.iron, x, 0.9, z, 1.1, 1.8, 0.7, root);
    const wheel = mesh(
      new T.TorusGeometry(0.48, 0.085, 8, 24),
      m.rust,
      root,
      x,
      1.5,
      z + 0.5,
    );
    for (let i = 0; i < 4; i++) {
      const spoke = block(m.rust, 0, 0, 0, 0.08, 0.9, 0.06, wheel);
      spoke.rotation.z = (i * Math.PI) / 4;
    }
    sign(
      `${String(index + 1).padStart(2, "0")} · ${zone.name}`,
      x,
      2.8,
      z + 0.45,
      5.5,
    );
    const interaction = {
      kind: "map",
      id: `lacuna:valve:${index}`,
      action: index,
      name: `Purge · ${zone.name}`,
      cost: 350,
      root,
      wheel,
      position: new T.Vector3(x, 1, z),
    };
    w.obstacle(x, z, 1.1, 0.7, 1.8);
    w.interactions.push(interaction);
    return interaction;
  });
  const releaseRoot = new T.Group();
  w.root.add(releaseRoot);
  block(m.copper, 19, 1.1, -2.5, 1.6, 2.2, 0.65, releaseRoot);
  sign("GRANDE DÉCRUE · 3 VANNES", 19, 2.5, -1.9, 5);
  w.obstacle(19, -2.5, 1.6, 0.65, 2.2);
  w.interactions.push({
    kind: "map",
    id: "lacuna:release",
    action: "release",
    name: "La Grande Décrue",
    cost: 0,
    root: releaseRoot,
    position: new T.Vector3(19, 1, -2.5),
  });
  const bellRoot = new T.Group();
  w.root.add(bellRoot);
  block(m.copper, 23, 1, -8, 0.75, 2, 0.6, bellRoot);
  const bellSwitch = mesh(
    new T.TorusGeometry(0.25, 0.05, 6, 16),
    m.gold,
    bellRoot,
    23,
    1.5,
    -7.65,
  );
  sign("CARILLON · LEURRE SONORE", 23, 2.7, -7.5, 4.5);
  w.obstacle(23, -8, 0.75, 0.6, 2);
  w.interactions.push({
    kind: "map",
    id: "lacuna:bell",
    action: "bell",
    name: "Carillon des Absents",
    cost: 200,
    root: bellRoot,
    wheel: bellSwitch,
    position: new T.Vector3(23, 1, -8),
  });
  const story = sign("AVIS D’ÉVACUATION · 17 JUIN 1936", -17, 2.3, 57, 5.5);
  w.interactions.push({
    kind: "recording",
    id: "lacuna:archive",
    name: "Le dernier télégramme",
    position: new T.Vector3(-17, 1, 57),
    root: story,
    text: "06 h 17. Les trois régulateurs répondent encore. Faites chanter chaque vanne, puis revenez au carillon. La Grande Décrue nous donnera un dernier répit. Si les sirènes sonnent, quittez les bandes jaunes : les deux ponts de pierre tiendront. — Lucie, service des eaux",
  });

  let hydraulicState;
  const dressing = dressLacuna(w, a);
  return {
    get bridgeOpen() {
      return mobileBridge.children.every(
        (leaf) => Math.abs(leaf.position.x) < 4.65,
      );
    },
    setHydraulics(state) {
      hydraulicState = state;
      ambience.setState(state);
    },
    update(dt, time) {
      ambience.update(dt, time);
      mobileBridge.children.forEach((leaf, index) => {
        const side = index ? 1 : -1;
        leaf.position.x = T.MathUtils.damp(
          leaf.position.x,
          side * (hydraulicState?.bridgeClosed ? 13.6 : 4.5),
          2.2,
          dt,
        );
      });
      for (const v of valves) {
        const active =
          hydraulicState?.zone === v.action &&
          hydraulicState?.phase > 0 &&
          hydraulicState?.phase < 3;
        if (active) v.wheel.rotation.z += dt * 0.7;
      }
    },
    setQuality(quality, mobile) {
      ambience.setQuality(quality, mobile);
      dressing.setQuality(quality, mobile);
    },
  };
}
