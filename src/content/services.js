export const SERVICES = {
  power: {
    name: "Générateur",
    title: "GÉNÉRATEUR",
    color: 0xa4d29c,
    paint: 0x53634d,
    notice: "MISE SOUS TENSION",
    serial: "VE–01 / ÉLECTROTECHNIQUE",
    price: "ACTIVER",
  },
  ammo: {
    name: "Ravitaillement",
    title: "RAVITAILLEMENT",
    color: 0xe3c181,
    paint: 0x42565d,
    notice: "RÉSERVES · GRENADES",
    serial: "VA–02 / INTENDANCE",
    price: "350  ESSENCES",
  },
  upgrade: {
    name: "La Transfiguration",
    title: "TRANSFIGURATION",
    color: 0xbc9df2,
    paint: 0x514267,
    notice: "CHAMBRE DE TRANSFIGURATION",
    serial: "VT–03 / RECHERCHE",
    price: "3 000 / 5 000 / 7 500",
  },
};

// The visual and gameplay clocks share these contact markers.
export const TONIC = {
  duration: 2.75,
  lower: 0.22,
  grasp: 0.48,
  open: 0.91,
  consume: 1.52,
  secondSip: 1.78,
  recover: 2.3,
};
