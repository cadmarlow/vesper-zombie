export const PERKS = {
  health: {
    name: "Sang de fer",
    title: "SANG DE FER",
    cost: 2000,
    color: 0xcf534e,
    icon: "cross",
    description: "Santé maximale portée à 180.",
  },
  speed: {
    name: "Nerfs d’acier",
    title: "NERFS D’ACIER",
    cost: 1500,
    color: 0xe9be61,
    icon: "bolt",
    description: "Rechargement 35 % plus rapide, endurance améliorée.",
  },
  rate: {
    name: "Main de fer",
    title: "MAIN DE FER",
    cost: 2500,
    color: 0xe07a4c,
    icon: "bullet",
    description: "Cadence de tir +25 %, recul réduit d’un tiers.",
  },
  focus: {
    name: "Œil du Veilleur",
    title: "ŒIL DU VEILLEUR",
    cost: 2500,
    color: 0x7fd0e8,
    icon: "target",
    description: "Tirs à la tête ×3,2 au lieu de ×2,35, visée plus stable.",
  },
};
export const UPGRADE = {
  costs: [3000, 5000, 7500],
  damage: [1, 2.5, 4, 6],
  capacity: [1, 1.5, 1.75, 2],
  names: ["", "I", "II", "III"],
};
export const DIFFICULTIES = {
  story: {
    name: "Éclaireur",
    desc: "Pour découvrir la nuit.",
    damage: 0.65,
    health: 0.8,
    count: 0.8,
  },
  normal: {
    name: "Survivant",
    desc: "La véritable expérience Vesper.",
    damage: 1,
    health: 1,
    count: 1,
  },
  nightmare: {
    name: "Cauchemar",
    desc: "La nuit ne vous fera aucun cadeau.",
    damage: 1.4,
    health: 1.2,
    count: 1.25,
  },
};
