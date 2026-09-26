export const LACUNA = {
  bounds: { x: 72, z: 80 },
  spawn: [0, 1.7, 69],
  machines: [
    ["ammo", [-18, 63]],
    ["extract", [0, 74]],
    ["power", [-54, -44]],
    ["upgrade", [0, -73]],
    ["box", [28, -6]],
    ["health", [-56, -6]],
    ["speed", [-48, 32]],
    ["rate", [57, 18]],
    ["focus", [33, -54]],
    ["ammo", [-25, -40]],
    ["ammo", [30, 31]],
  ],
  spawns: [
    [-18, 71],
    [18, 71],
    [-18, 54],
    [18, 54],
    [-64, 38],
    [-27, 25],
    [-65, 12],
    [-26, -15],
    [-64, -27],
    [-32, -59],
    [-63, -69],
    [0, -77],
    [63, -69],
    [24, -60],
    [64, -24],
    [30, -19],
    [65, 5],
    [33, 26],
    [62, 40],
    [16, 27],
  ],
  sectors: [
    { id: "station", name: "Gare de l’Évacuation", x: 0, z: 65 },
    { id: "market", name: "Marché des Absents", x: -43, z: 32 },
    { id: "baths", name: "Les Thermes de Sainte-Lucie", x: -44, z: -3 },
    { id: "valves", name: "Poste des Vannes", x: -44, z: -44 },
    { id: "turbines", name: "Cathédrale des Turbines", x: 0, z: -69 },
    { id: "hotel", name: "Grand Hôtel des Eaux", x: 43, z: -43 },
    { id: "workshop", name: "Ateliers de la Crue", x: 47, z: 20 },
    { id: "clock", name: "Place du Dernier Matin", x: 22, z: -3 },
  ],
};

// Each marked strip has broad, dry exits on both sides. The permanent bridges
// and the perimeter streets never become hydraulic damage zones.
export const PURGE_ZONES = [
  { name: "QUAI DU CARILLON", x: 18, z: 10, w: 12, d: 25, valve: [24, 27] },
  { name: "THERMES", x: -44, z: 6, w: 27, d: 8, valve: [-28, 12] },
  { name: "ATELIERS", x: 44, z: 20, w: 25, d: 9, valve: [29, 12] },
];

export function inZone(position, zone, margin = 0) {
  return (
    Math.abs(position.x - zone.x) < zone.w / 2 + margin &&
    Math.abs(position.z - zone.z) < zone.d / 2 + margin
  );
}

export const BRIDGE = { x: 0, z: 0, w: 23, d: 11 };

export function sectorAt(position) {
  if (position.z > 48) return LACUNA.sectors[0].name;
  if (position.z < -62) return LACUNA.sectors[4].name;
  if (position.x < -22)
    return LACUNA.sectors[position.z > 20 ? 1 : position.z < -29 ? 3 : 2].name;
  if (position.x > 25)
    return LACUNA.sectors[position.z < -23 ? 5 : position.z > 6 ? 6 : 7].name;
  return LACUNA.sectors[7].name;
}
