// Names of the 23 Biped joints every horde body keeps (see
// scripts/horde/blender-character.py), keyed by role.
const BONE = (name) => `Bip01_${name.replace(/ /g, "_")}`;
export const HORDE_BONES = {
  pelvis: BONE("Pelvis"),
  spine: BONE("Spine"),
  spine1: BONE("Spine1"),
  chest: BONE("Spine2"),
  neck: BONE("Neck"),
  head: BONE("Head"),
  jaw: BONE("MJaw"),
  clavicleL: BONE("L Clavicle"),
  clavicleR: BONE("R Clavicle"),
  armL: BONE("L UpperArm"),
  armR: BONE("R UpperArm"),
  forearmL: BONE("L Forearm"),
  forearmR: BONE("R Forearm"),
  handL: BONE("L Hand"),
  handR: BONE("R Hand"),
  thighL: BONE("L Thigh"),
  thighR: BONE("R Thigh"),
  calfL: BONE("L Calf"),
  calfR: BONE("R Calf"),
  footL: BONE("L Foot"),
  footR: BONE("R Foot"),
  toeL: BONE("L Toe0"),
  toeR: BONE("R Toe0"),
};
