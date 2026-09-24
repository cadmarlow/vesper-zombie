// Source skeleton maps for the horde retargeting (see retarget.mjs).
// Target joints are the reduced Rocketbox Biped of blender-character.py.

const side = (fn) => ({ ...fn("L", "Left"), ...fn("R", "Right") });

/** CMU motion capture (cgspeed/MotionBuilder-friendly BVH naming). */
export const CMU_MAP = {
  "Bip01 Pelvis": { source: "Hips" },
  "Bip01 Spine": {
    source: "LowerBack",
    aim: "Bip01 Spine1",
    from: "LowerBack",
    to: "Spine",
  },
  "Bip01 Spine1": {
    source: "Spine",
    aim: "Bip01 Spine2",
    from: "Spine",
    to: "Spine1",
  },
  "Bip01 Spine2": {
    source: "Spine1",
    aim: "Bip01 Neck",
    from: "Spine1",
    to: "Neck1",
  },
  "Bip01 Neck": {
    source: "Neck1",
    aim: "Bip01 Head",
    from: "Neck1",
    to: "Head",
  },
  "Bip01 Head": {
    source: "Head",
    aimVector: [0, 1, 0],
    from: "Head",
    to: "Head_end",
  },
  ...side((s, S) => ({
    [`Bip01 ${s} Clavicle`]: {
      source: `${S}Shoulder`,
      aim: `Bip01 ${s} UpperArm`,
      from: `${S}Shoulder`,
      to: `${S}Arm`,
    },
    [`Bip01 ${s} UpperArm`]: {
      source: `${S}Arm`,
      aim: `Bip01 ${s} Forearm`,
      from: `${S}Arm`,
      to: `${S}ForeArm`,
    },
    [`Bip01 ${s} Forearm`]: {
      source: `${S}ForeArm`,
      aim: `Bip01 ${s} Hand`,
      from: `${S}ForeArm`,
      to: `${S}Hand`,
    },
    [`Bip01 ${s} Hand`]: { source: `${S}Hand` },
    [`Bip01 ${s} Thigh`]: {
      source: `${S}UpLeg`,
      aim: `Bip01 ${s} Calf`,
      from: `${S}UpLeg`,
      to: `${S}Leg`,
    },
    [`Bip01 ${s} Calf`]: {
      source: `${S}Leg`,
      aim: `Bip01 ${s} Foot`,
      from: `${S}Leg`,
      to: `${S}Foot`,
    },
    [`Bip01 ${s} Foot`]: {
      source: `${S}Foot`,
      aim: `Bip01 ${s} Toe0`,
      from: `${S}Foot`,
      to: `${S}ToeBase`,
    },
    [`Bip01 ${s} Toe0`]: { source: `${S}ToeBase` },
  })),
};

/** Quaternius Universal Animation Library (Rigify DEF- bones). */
export const UAL_MAP = {
  "Bip01 Pelvis": { source: "DEF-hips" },
  "Bip01 Spine": {
    source: "DEF-spine.001",
    aim: "Bip01 Spine1",
    from: "DEF-spine.001",
    to: "DEF-spine.002",
  },
  "Bip01 Spine1": {
    source: "DEF-spine.002",
    aim: "Bip01 Spine2",
    from: "DEF-spine.002",
    to: "DEF-spine.003",
  },
  "Bip01 Spine2": {
    source: "DEF-spine.003",
    aim: "Bip01 Neck",
    from: "DEF-spine.003",
    to: "DEF-neck",
  },
  "Bip01 Neck": {
    source: "DEF-neck",
    aim: "Bip01 Head",
    from: "DEF-neck",
    to: "DEF-head",
  },
  "Bip01 Head": { source: "DEF-head" },
  ...side((s) => {
    const l = s === "L" ? "L" : "R";
    return {
      [`Bip01 ${s} Clavicle`]: {
        source: `DEF-shoulder.${l}`,
        aim: `Bip01 ${s} UpperArm`,
        from: `DEF-shoulder.${l}`,
        to: `DEF-upper_arm.${l}`,
      },
      [`Bip01 ${s} UpperArm`]: {
        source: `DEF-upper_arm.${l}`,
        aim: `Bip01 ${s} Forearm`,
        from: `DEF-upper_arm.${l}`,
        to: `DEF-forearm.${l}`,
      },
      [`Bip01 ${s} Forearm`]: {
        source: `DEF-forearm.${l}`,
        aim: `Bip01 ${s} Hand`,
        from: `DEF-forearm.${l}`,
        to: `DEF-hand.${l}`,
      },
      [`Bip01 ${s} Hand`]: { source: `DEF-hand.${l}` },
      [`Bip01 ${s} Thigh`]: {
        source: `DEF-thigh.${l}`,
        aim: `Bip01 ${s} Calf`,
        from: `DEF-thigh.${l}`,
        to: `DEF-shin.${l}`,
      },
      [`Bip01 ${s} Calf`]: {
        source: `DEF-shin.${l}`,
        aim: `Bip01 ${s} Foot`,
        from: `DEF-shin.${l}`,
        to: `DEF-foot.${l}`,
      },
      [`Bip01 ${s} Foot`]: {
        source: `DEF-foot.${l}`,
        aim: `Bip01 ${s} Toe0`,
        from: `DEF-foot.${l}`,
        to: `DEF-toe.${l}`,
      },
      [`Bip01 ${s} Toe0`]: { source: `DEF-toe.${l}` },
    };
  }),
};

/** Rocketbox clips already use the Biped names. */
export const BIPED_MAP = Object.fromEntries(
  [
    "Pelvis",
    "Spine",
    "Spine1",
    "Spine2",
    "Neck",
    "Head",
    "MJaw",
    ...["L", "R"].flatMap((s) =>
      [
        "Clavicle",
        "UpperArm",
        "Forearm",
        "Hand",
        "Thigh",
        "Calf",
        "Foot",
        "Toe0",
      ].map((b) => `${s} ${b}`),
    ),
  ].map((b) => [`Bip01 ${b}`, { source: `Bip01 ${b}` }]),
);

/** Unreal-style mannequin names (Quaternius UAL2 "Unreal-Godot" export). */
export const UE_MAP = {
  "Bip01 Pelvis": { source: "pelvis" },
  "Bip01 Spine": {
    source: "spine_01",
    aim: "Bip01 Spine1",
    from: "spine_01",
    to: "spine_02",
  },
  "Bip01 Spine1": {
    source: "spine_02",
    aim: "Bip01 Spine2",
    from: "spine_02",
    to: "spine_03",
  },
  "Bip01 Spine2": {
    source: "spine_03",
    aim: "Bip01 Neck",
    from: "spine_03",
    to: "neck_01",
  },
  "Bip01 Neck": {
    source: "neck_01",
    aim: "Bip01 Head",
    from: "neck_01",
    to: "Head",
  },
  "Bip01 Head": { source: "Head" },
  ...side((s) => {
    const l = s === "L" ? "l" : "r";
    return {
      [`Bip01 ${s} Clavicle`]: {
        source: `clavicle_${l}`,
        aim: `Bip01 ${s} UpperArm`,
        from: `clavicle_${l}`,
        to: `upperarm_${l}`,
      },
      [`Bip01 ${s} UpperArm`]: {
        source: `upperarm_${l}`,
        aim: `Bip01 ${s} Forearm`,
        from: `upperarm_${l}`,
        to: `lowerarm_${l}`,
      },
      [`Bip01 ${s} Forearm`]: {
        source: `lowerarm_${l}`,
        aim: `Bip01 ${s} Hand`,
        from: `lowerarm_${l}`,
        to: `hand_${l}`,
      },
      [`Bip01 ${s} Hand`]: { source: `hand_${l}` },
      [`Bip01 ${s} Thigh`]: {
        source: `thigh_${l}`,
        aim: `Bip01 ${s} Calf`,
        from: `thigh_${l}`,
        to: `calf_${l}`,
      },
      [`Bip01 ${s} Calf`]: {
        source: `calf_${l}`,
        aim: `Bip01 ${s} Foot`,
        from: `calf_${l}`,
        to: `foot_${l}`,
      },
      [`Bip01 ${s} Foot`]: {
        source: `foot_${l}`,
        aim: `Bip01 ${s} Toe0`,
        from: `foot_${l}`,
        to: `ball_${l}`,
      },
      [`Bip01 ${s} Toe0`]: { source: `ball_${l}` },
    };
  }),
};
