// The horde cast: Microsoft Rocketbox avatars (MIT) turned into zombies.
// `types` lists the enemy ids (src/content/enemies.js) this body can wear.
// Style fields drive scripts/horde/zombify.mjs.
export const ROCKETBOX_REPO =
  "https://raw.githubusercontent.com/microsoft/Microsoft-Rocketbox/master/Assets/Avatars";

export const ROSTER = [
  // --- Égarés: the shambling civilians ------------------------------------
  {
    id: "civilian-08",
    avatar: "Adults/Male_Adult_08",
    types: ["walker"],
    style: {
      seed: 8,
      palette: "ashen",
      mouthBlood: 0.8,
      chestBlood: 0.55,
      wounds: 6,
    },
  },
  {
    id: "civilian-05",
    avatar: "Adults/Male_Adult_05",
    types: ["walker"],
    style: {
      seed: 5,
      palette: "jaundiced",
      mouthBlood: 0.6,
      chestBlood: 0.4,
      wounds: 5,
      rot: 0.8,
    },
  },
  {
    id: "civilian-13",
    avatar: "Adults/Male_Adult_13",
    types: ["walker"],
    style: {
      seed: 13,
      palette: "livid",
      mouthBlood: 0.7,
      chestBlood: 0.6,
      wounds: 6,
    },
  },
  {
    id: "civilian-12",
    avatar: "Adults/Male_Adult_12",
    types: ["walker"],
    style: {
      seed: 12,
      palette: "necrotic",
      mouthBlood: 0.75,
      chestBlood: 0.5,
      wounds: 5,
    },
  },
  {
    id: "worker-01",
    avatar: "Professions/Delivery_Male_01",
    types: ["walker"],
    style: {
      seed: 21,
      palette: "bruised",
      mouthBlood: 0.6,
      chestBlood: 0.45,
      wounds: 7,
      dirt: 0.9,
    },
  },
  {
    id: "business-01",
    avatar: "Professions/Business_Male_01",
    types: ["walker"],
    style: {
      seed: 31,
      palette: "ashen",
      mouthBlood: 0.9,
      chestBlood: 0.7,
      wounds: 5,
      tears: 0.6,
    },
  },
  {
    id: "civilian-f08",
    avatar: "Adults/Female_Adult_08",
    types: ["walker"],
    style: {
      seed: 48,
      palette: "livid",
      mouthBlood: 0.8,
      chestBlood: 0.5,
      wounds: 6,
    },
  },
  {
    id: "civilian-f04",
    avatar: "Adults/Female_Adult_04",
    types: ["walker"],
    style: {
      seed: 44,
      palette: "bruised",
      mouthBlood: 0.7,
      chestBlood: 0.45,
      wounds: 5,
    },
  },
  // --- Affamés: fast, lean, frenzied ------------------------------------------
  {
    id: "runner-04",
    avatar: "Adults/Male_Adult_04",
    types: ["runner"],
    style: {
      seed: 104,
      palette: "necrotic",
      mouthBlood: 1,
      chestBlood: 0.7,
      wounds: 7,
      rot: 0.8,
    },
  },
  {
    id: "runner-10",
    avatar: "Adults/Male_Adult_10",
    types: ["runner"],
    style: {
      seed: 110,
      palette: "livid",
      mouthBlood: 1,
      chestBlood: 0.6,
      wounds: 6,
    },
  },
  {
    id: "runner-sports",
    avatar: "Professions/Sports_Male_04",
    types: ["runner"],
    style: {
      seed: 124,
      palette: "bruised",
      mouthBlood: 1,
      chestBlood: 0.5,
      wounds: 9,
      rot: 0.9,
      veins: 0.9,
    },
  },
  {
    id: "runner-f12",
    avatar: "Adults/Female_Adult_12",
    types: ["runner"],
    style: {
      seed: 112,
      palette: "ashen",
      mouthBlood: 1,
      chestBlood: 0.6,
      wounds: 7,
    },
  },
  // --- Pénitents: armoured heavies ------------------------------------------------
  {
    id: "brute-swat",
    avatar: "Professions/Police_Male_02",
    types: ["brute"],
    style: {
      seed: 202,
      palette: "necrotic",
      mouthBlood: 0.9,
      chestBlood: 0.3,
      wounds: 4,
      tears: 0.2,
    },
  },
  {
    id: "brute-fire",
    avatar: "Professions/Construction_Male_03",
    types: ["brute"],
    style: {
      seed: 212,
      palette: "charred",
      mouthBlood: 0.6,
      chestBlood: 0.25,
      wounds: 4,
      dirt: 1,
      tears: 0.25,
    },
  },
  // --- Porte-peste: the infected medical staff ----------------------------------------
  {
    id: "spitter-doctor",
    avatar: "Professions/Medical_Male_01",
    types: ["spitter"],
    style: {
      seed: 301,
      palette: "jaundiced",
      mouthBlood: 1,
      chestBlood: 0.9,
      wounds: 5,
      rot: 1,
    },
  },
  {
    id: "spitter-nurse",
    avatar: "Professions/Medical_Female_01",
    types: ["spitter"],
    style: {
      seed: 311,
      palette: "jaundiced",
      mouthBlood: 1,
      chestBlood: 0.8,
      wounds: 5,
      rot: 1,
    },
  },
  // --- Rémanent: the pale revenant --------------------------------------------------------
  {
    id: "wraith-hood",
    avatar: "Adults/Male_Adult_18",
    types: ["wraith"],
    style: {
      seed: 418,
      palette: "livid",
      mouthBlood: 0.5,
      chestBlood: 0.3,
      wounds: 4,
      rot: 0.3,
      veins: 1,
    },
  },
  // --- L'Archonte: the giant soldier ---------------------------------------------------------
  {
    id: "archon-soldier",
    avatar: "Professions/Military_Male_03",
    types: ["archon"],
    style: {
      seed: 503,
      palette: "charred",
      mouthBlood: 1,
      chestBlood: 0.6,
      wounds: 8,
      rot: 0.9,
      veins: 1,
    },
  },
];
