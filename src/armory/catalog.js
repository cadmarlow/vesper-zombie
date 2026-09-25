// Rig data of each first-person weapon: where the weapon sits in the view,
// how the hands hold it and how its mechanism moves. Positions are metres
// in the weapon's own frame (bore along -z, breech face at the origin)
// unless stated otherwise. Tuned in scripts/armory/lab.html.

const deg = Math.PI / 180;

/**
 * Pistol reload: muzzle up and in, the magazine well turned toward the eye;
 * the magazine drops, a fresh one comes from the belt and is seated and,
 * when the slide is locked back, the thumb trips the slide stop.
 */
function pistolReload(empty) {
  const seatAt = 0.6;
  // The support hand pushes the magazine in from below, palm up.
  const seat = {
    t: seatAt,
    knuckle: [-0.01, -0.152, 0.026],
    forward: [0.1, 0.35, -0.93],
    lateral: [-1, 0.1, 0],
    pose: "grab",
    pole: [-0.4, -1, 0.3],
  };
  const left = [
    { t: 0, grip: "rest" },
    { t: 0.08, grip: "rest" },
    {
      t: 0.2,
      space: "view",
      knuckle: [-0.1, -0.3, -0.28],
      forward: [0.3, -0.5, -0.8],
      lateral: [-0.2, 0.8, -0.5],
      pose: "relaxed",
    },
    {
      t: 0.33,
      space: "view",
      knuckle: [-0.12, -0.4, -0.22],
      forward: [0.2, 0.6, -0.8],
      lateral: [-1, 0, 0],
      pose: "grab",
    },
    { ...seat, t: 0.5, knuckle: [-0.012, -0.21, 0.045] },
    seat,
    {
      ...seat,
      t: seatAt + 0.05,
      knuckle: [-0.01, -0.142, 0.023],
      pose: "slap",
    },
    { t: 0.84, grip: "rest" },
    { t: 1, grip: "rest" },
  ];
  // Muzzle up and in: the magazine well turns toward the eye.
  const up = [0.55, 0.28, -0.3];
  const rot = [
    [0, [0, 0, 0]],
    [0.12, up],
    [0.5, [0.58, 0.3, -0.32]],
    [seatAt, [0.5, 0.26, -0.28]],
    [seatAt + 0.03, [0.6, 0.28, -0.3]],
    [0.68, [0.52, 0.26, -0.28]],
  ];
  const pos = [
    [0, [0, 0, 0]],
    [0.12, [-0.045, 0.06, 0.035]],
    [0.5, [-0.05, 0.065, 0.04]],
    [seatAt, [-0.045, 0.062, 0.038]],
    [seatAt + 0.03, [-0.045, 0.07, 0.034]],
    [0.68, [-0.045, 0.062, 0.036]],
  ];
  if (empty) {
    // Thumb on the slide stop: the slide slams home, the weapon jumps.
    rot.push(
      [0.73, [0.5, 0.26, -0.28]],
      [0.75, [0.38, 0.22, -0.2]],
      [0.8, [0.46, 0.24, -0.26]],
    );
    pos.push(
      [0.73, [-0.045, 0.06, 0.036]],
      [0.75, [-0.04, 0.066, 0.05]],
      [0.8, [-0.042, 0.06, 0.04]],
    );
  }
  rot.push([1, [0, 0, 0]]);
  pos.push([1, [0, 0, 0]]);
  return {
    weaponPosition: pos,
    weaponRotation: rot,
    left,
    seat,
    mag: [
      [0, "in"],
      [0.1, "drop"],
      [0.32, "hand"],
      [seatAt, "in"],
    ],
    action: empty
      ? [
          [0, 0.82],
          [0.73, 0.82],
          [0.745, 0],
        ]
      : null,
    events: [
      [0.1, "magout"],
      [seatAt, "magin"],
      ...(empty ? [[0.73, "release"]] : []),
    ],
  };
}

/**
 * SMG reload: roll the weapon, the magazine drops, a fresh one is rocked in;
 * empty: the support hand pulls the cocking handle back and slaps it home.
 */
function smgReload(empty) {
  const seatAt = empty ? 0.5 : 0.62;
  const seat = {
    t: seatAt,
    knuckle: [0.008, -0.225, -0.06],
    forward: [0.2, 0.35, -0.9],
    lateral: [-1, 0.1, -0.1],
    pose: "grab",
    pole: [-0.5, -1, 0.1],
  };
  const left = [
    { t: 0, grip: "rest" },
    { t: 0.06, grip: "rest" },
    {
      t: 0.18,
      space: "view",
      knuckle: [-0.12, -0.3, -0.3],
      forward: [0.3, -0.5, -0.8],
      lateral: [-0.2, 0.8, -0.5],
      pose: "relaxed",
    },
    {
      t: seatAt - 0.2,
      space: "view",
      knuckle: [-0.13, -0.42, -0.26],
      forward: [0.2, 0.6, -0.8],
      lateral: [-1, 0, 0],
      pose: "grab",
    },
    { ...seat, t: seatAt - 0.08, knuckle: [0.006, -0.29, -0.066] },
    seat,
    {
      ...seat,
      t: seatAt + 0.05,
      knuckle: [0.006, -0.214, -0.058],
      pose: "slap",
    },
  ];
  // Raised and rolled clockwise: the magazine well turns to the support
  // hand and into view, so the swap is seen, not guessed.
  const rot = [
    [0, [0, 0, 0]],
    [0.12, [0.28, 0.18, -0.6]],
    [seatAt, [0.3, 0.2, -0.62]],
    [seatAt + 0.03, [0.38, 0.2, -0.6]],
    [seatAt + 0.08, [0.3, 0.2, -0.62]],
  ];
  const pos = [
    [0, [0, 0, 0]],
    [0.12, [-0.02, 0.07, 0.01]],
    [seatAt, [-0.02, 0.075, 0.015]],
    [seatAt + 0.03, [-0.02, 0.082, 0.01]],
    [seatAt + 0.08, [-0.02, 0.075, 0.014]],
  ];
  const charging = empty
    ? [
        [0, 0],
        [0.68, 0],
        [0.76, 1],
        [0.82, 1],
        [0.84, 0],
      ]
    : null;
  if (empty) {
    // HK slap: grab the handle, pull it back, slap it out of its notch.
    const handle = {
      space: "charging_handle",
      forward: [0.2, 0.6, -0.75],
      lateral: [0.2, 0.7, 0.65],
      pose: "pinch",
      pole: [-0.6, -0.8, 0.2],
    };
    left.push(
      {
        t: 0.62,
        space: "view",
        knuckle: [-0.1, -0.18, -0.4],
        forward: [0.4, 0.3, -0.85],
        lateral: [-0.3, 0.9, 0.1],
        pose: "relaxed",
      },
      { ...handle, t: 0.68, knuckle: [-0.045, 0.01, -0.006] },
      { ...handle, t: 0.76, knuckle: [-0.045, 0.01, -0.006] },
      { t: 0.8, ...handle, knuckle: [-0.04, 0.03, 0.01], pose: "slap" },
      { t: 0.84, ...handle, knuckle: [-0.03, 0.02, -0.02], pose: "slap" },
    );
    rot.push(
      [0.68, [0.08, 0.2, 0.3]],
      [0.8, [0.1, 0.22, 0.34]],
      [0.84, [0.02, 0.18, 0.26]],
      [0.88, [0.08, 0.2, 0.3]],
    );
    pos.push([0.68, [-0.04, 0.03, 0.05]], [0.84, [-0.04, 0.026, 0.056]]);
  }
  left.push({ t: 0.92, grip: "rest" }, { t: 1, grip: "rest" });
  rot.push([1, [0, 0, 0]]);
  pos.push([1, [0, 0, 0]]);
  return {
    weaponPosition: pos,
    weaponRotation: rot,
    left,
    seat,
    mag: [
      [0, "in"],
      [0.1, "drop"],
      [seatAt - 0.22, "hand"],
      [seatAt, "in"],
    ],
    charging_handle: charging,
    events: [
      [0.1, "magout"],
      [seatAt, "magin"],
      ...(empty
        ? [
            [0.76, "charge"],
            [0.84, "release"],
          ]
        : []),
    ],
  };
}

/**
 * Carbine reload: cant the rifle, the magazine drops free, a fresh one is
 * seated and tapped; empty: the support palm slaps the bolt catch.
 */
function rifleReload(empty) {
  const seatAt = empty ? 0.52 : 0.62;
  const seat = {
    t: seatAt,
    knuckle: [-0.004, -0.228, -0.05],
    forward: [0.15, 0.3, -0.94],
    lateral: [-1, 0.1, -0.05],
    pose: "grab",
    pole: [-0.5, -1, 0.1],
  };
  const left = [
    { t: 0, grip: "rest" },
    { t: 0.06, grip: "rest" },
    {
      t: 0.18,
      space: "view",
      knuckle: [-0.12, -0.3, -0.3],
      forward: [0.3, -0.5, -0.8],
      lateral: [-0.2, 0.8, -0.5],
      pose: "relaxed",
    },
    {
      t: seatAt - 0.2,
      space: "view",
      knuckle: [-0.13, -0.42, -0.26],
      forward: [0.2, 0.6, -0.8],
      lateral: [-1, 0, 0],
      pose: "grab",
    },
    { ...seat, t: seatAt - 0.08, knuckle: [-0.006, -0.3, -0.058] },
    seat,
    {
      ...seat,
      t: seatAt + 0.05,
      knuckle: [-0.004, -0.214, -0.048],
      pose: "slap",
    },
  ];
  // Raised and rolled clockwise: the magazine well and the bolt catch
  // (left side) turn toward the support hand and into view.
  const rot = [
    [0, [0, 0, 0]],
    [0.12, [0.26, 0.16, -0.55]],
    [seatAt, [0.28, 0.18, -0.58]],
    [seatAt + 0.03, [0.34, 0.18, -0.55]],
    [seatAt + 0.08, [0.28, 0.18, -0.58]],
  ];
  const pos = [
    [0, [0, 0, 0]],
    [0.12, [-0.02, 0.065, 0.015]],
    [seatAt, [-0.02, 0.07, 0.02]],
    [seatAt + 0.03, [-0.02, 0.077, 0.015]],
    [seatAt + 0.08, [-0.02, 0.07, 0.019]],
  ];
  if (empty) {
    // Palm on the bolt catch: the carrier slams home.
    const slap = {
      space: "weapon",
      forward: [0.15, 0.95, -0.2],
      lateral: [0, 0.2, -1],
      pose: "slap",
      pole: [-0.6, -0.8, 0.1],
    };
    left.push(
      { ...slap, t: 0.66, knuckle: [-0.05, -0.02, -0.03] },
      { ...slap, t: 0.72, knuckle: [-0.032, 0.002, -0.012] },
      { ...slap, t: 0.76, knuckle: [-0.04, -0.012, -0.02] },
    );
    rot.push(
      [0.7, [0.24, 0.16, -0.5]],
      [0.72, [0.19, 0.12, -0.44]],
      [0.76, [0.24, 0.15, -0.5]],
    );
    pos.push([0.72, [-0.02, 0.064, 0.028]]);
  }
  left.push({ t: 0.9, grip: "rest" }, { t: 1, grip: "rest" });
  rot.push([1, [0, 0, 0]]);
  pos.push([1, [0, 0, 0]]);
  return {
    weaponPosition: pos,
    weaponRotation: rot,
    left,
    seat,
    mag: [
      [0, "in"],
      [0.1, "drop"],
      [seatAt - 0.22, "hand"],
      [seatAt, "in"],
    ],
    action: empty
      ? [
          [0, 0.9],
          [0.72, 0.9],
          [0.74, 0],
        ]
      : null,
    events: [
      [0.1, "magout"],
      [seatAt, "magin"],
      ...(empty ? [[0.72, "release"]] : []),
    ],
  };
}

/** Pump stroke after a shot: the support hand rides the fore-end. */
const PUMP = {
  pump: [
    [0, 0],
    [0.1, 0],
    [0.42, 1],
    [0.52, 1],
    [0.86, 0],
  ],
  bolt: [
    [0, 0],
    [0.1, 0],
    [0.42, 1],
    [0.52, 1],
    [0.86, 0],
  ],
  weaponRotation: [
    [0, [0, 0, 0]],
    [0.35, [0.04, 0.02, 0.08]],
    [0.6, [0.02, 0.01, 0.05]],
    [1, [0, 0, 0]],
  ],
  weaponPosition: [
    [0, [0, 0, 0]],
    [0.42, [0, -0.006, 0.012]],
    [0.86, [0, 0, 0]],
    [1, [0, 0, 0]],
  ],
  events: [
    [0.12, "pumpback"],
    [0.44, "eject"],
    [0.62, "pumpforward"],
  ],
};

/**
 * Shotgun loading, one shell at a time: start (cant the weapon, the hand
 * leaves the pump), shell (fetch, push through the loading port), end
 * (back to the pump; a pump stroke when the weapon was empty).
 */
const SHOTGUN_TILT = { rot: [0.05, 0.1, -0.5], pos: [-0.01, 0.03, 0.02] };
function shotgunLoad() {
  const hand = (t, knuckle, pose = "pinch") => ({
    t,
    space: "weapon",
    knuckle,
    forward: [0.2, 0.55, -0.8],
    lateral: [-0.95, 0.2, -0.2],
    pose,
    pole: [-0.5, -1, 0.1],
  });
  return {
    reloadStart: {
      weaponPosition: [
        [0, [0, 0, 0]],
        [1, SHOTGUN_TILT.pos],
      ],
      weaponRotation: [
        [0, [0, 0, 0]],
        [1, SHOTGUN_TILT.rot],
      ],
      left: [
        { t: 0, grip: "rest" },
        hand(1, [-0.012, -0.09, -0.02], "relaxed"),
      ],
      events: [[0.3, "cloth"]],
      unaim: true,
    },
    reloadShell: {
      weaponPosition: [
        [0, SHOTGUN_TILT.pos],
        [0.55, [-0.01, 0.034, 0.02]],
        [0.62, [-0.01, 0.038, 0.018]],
        [1, SHOTGUN_TILT.pos],
      ],
      weaponRotation: [
        [0, SHOTGUN_TILT.rot],
        [0.55, [0.06, 0.1, -0.52]],
        [0.62, [0.09, 0.1, -0.5]],
        [1, SHOTGUN_TILT.rot],
      ],
      left: [
        hand(0, [-0.012, -0.09, -0.02], "relaxed"),
        {
          t: 0.22,
          space: "view",
          knuckle: [-0.1, -0.3, -0.25],
          forward: [0.2, 0.6, -0.8],
          lateral: [-1, 0, 0],
          pose: "pinch",
          pole: [-0.5, -1, 0.1],
        },
        hand(0.42, [-0.01, -0.105, -0.03]),
        hand(0.6, [-0.004, -0.07, -0.036]),
        hand(0.72, [-0.006, -0.078, -0.04], "relaxed"),
        hand(1, [-0.012, -0.09, -0.02], "relaxed"),
      ],
      // The loose shell rides in the fingers until it enters the port.
      shell: { from: 0.22, to: 0.6, knuckleOffset: [0.012, 0.03, -0.02] },
      events: [
        [0.3, "shellgrab"],
        [0.6, "shell"],
      ],
      unaim: true,
    },
    reloadEnd: {
      weaponPosition: [
        [0, SHOTGUN_TILT.pos],
        [1, [0, 0, 0]],
      ],
      weaponRotation: [
        [0, SHOTGUN_TILT.rot],
        [1, [0, 0, 0]],
      ],
      left: [
        hand(0, [-0.012, -0.09, -0.02], "relaxed"),
        { t: 0.8, grip: "rest" },
        { t: 1, grip: "rest" },
      ],
      unaim: true,
    },
  };
}

const BOLT_SHOULDER = [0.02, 0.05, -0.12];
/** Bolt cycle: lift, pull, push, lower, with the right hand on the knob. */
function boltCycle(start = 0, span = 1, extra = {}) {
  const k = (t) => start + t * span;
  const knob = (t, pose = "grab") => ({
    t: k(t),
    space: "bolt_handle",
    knuckle: [0.05, 0.02, 0.16],
    forward: [-0.25, -0.35, -0.9],
    lateral: [-1, 0, 0.25],
    pose,
    pole: [0.4, -1, 0.1],
  });
  return {
    right: [
      { t: k(0), grip: "rest" },
      { t: k(0.1), grip: "rest" },
      knob(0.24, "relaxed"),
      knob(0.3),
      knob(0.74),
      knob(0.8, "relaxed"),
      { t: k(0.95), grip: "rest" },
    ],
    bolt_handleTurn: [
      [k(0), 0],
      [k(0.3), 0],
      [k(0.38), 1],
      [k(0.64), 1],
      [k(0.72), 0],
    ],
    bolt_handle: [
      [k(0), 0],
      [k(0.38), 0],
      [k(0.48), 1],
      [k(0.55), 1],
      [k(0.64), 0],
    ],
    // The right shoulder where a real one sits: the forearm comes up from
    // the lower right instead of crossing the eye.
    shoulders: {
      right: [
        [k(0), [0, 0, 0]],
        [k(0.2), BOLT_SHOULDER],
        [k(0.82), BOLT_SHOULDER],
        [k(1), [0, 0, 0]],
      ],
    },
    events: [
      [k(0.34), "boltup"],
      [k(0.47), "boltback"],
      [k(0.48), "eject"],
      [k(0.62), "boltforward"],
      [k(0.72), "boltdown"],
    ],
    ...extra,
  };
}
// While the bolt is worked the rifle dips, rolls onto its left side and
// moves off the eye, the bolt turned toward the view.
const BOLT_AWAY = [-0.02, -0.05, -0.085];
const BOLT_ROLL = [0.06, 0.12, 0.4];
function sniperCycle() {
  return {
    ...boltCycle(0, 1),
    weaponPosition: [
      [0, [0, 0, 0]],
      [0.25, BOLT_AWAY],
      [0.72, [BOLT_AWAY[0], BOLT_AWAY[1] - 0.004, BOLT_AWAY[2]]],
      [1, [0, 0, 0]],
    ],
    weaponRotation: [
      [0, [0, 0, 0]],
      [0.25, BOLT_ROLL],
      [0.72, [BOLT_ROLL[0] + 0.01, BOLT_ROLL[1], BOLT_ROLL[2] + 0.02]],
      [1, [0, 0, 0]],
    ],
    unaim: true,
  };
}
function sniperReload(empty) {
  const base = rifleReload(false);
  if (!empty) return { ...base, unaim: true };
  // Magazine first, then the bolt feeds a round.
  const squeeze = (track) => track.map(([t, v]) => [t * 0.62, v]);
  const hand = (list) => list.map((h) => ({ ...h, t: h.t * 0.62 }));
  const cycle = boltCycle(0.62, 0.38);
  return {
    weaponPosition: [
      ...squeeze(base.weaponPosition).slice(0, -1),
      [0.7, BOLT_AWAY],
      [0.9, [BOLT_AWAY[0], BOLT_AWAY[1] - 0.004, BOLT_AWAY[2]]],
      [1, [0, 0, 0]],
    ],
    weaponRotation: [
      ...squeeze(base.weaponRotation).slice(0, -1),
      [0.7, BOLT_ROLL],
      [0.9, [BOLT_ROLL[0] + 0.01, BOLT_ROLL[1], BOLT_ROLL[2] + 0.02]],
      [1, [0, 0, 0]],
    ],
    left: hand(base.left),
    seat: { ...base.seat, t: base.seat.t * 0.62 },
    mag: base.mag.map(([t, v]) => [t * 0.62, v]),
    right: cycle.right,
    shoulders: cycle.shoulders,
    bolt_handleTurn: cycle.bolt_handleTurn,
    bolt_handle: cycle.bolt_handle,
    events: [
      ...base.events.map(([t, n]) => [t * 0.62, n]),
      ...cycle.events.filter(([, n]) => n !== "eject"),
    ],
    unaim: true,
  };
}

/**
 * Inspection: the weapon comes toward the centre, rolls to show its left
 * flank, then turns to show the ejection port side, and settles back.
 */
function inspect({
  yaw = 1.05,
  lift = 0.07,
  near = -0.09,
  side = -0.1,
  roll = 0.15,
} = {}) {
  return {
    weaponPosition: [
      [0, [0, 0, 0]],
      [0.16, [side, lift, near]],
      [0.46, [side - 0.006, lift + 0.006, near]],
      [0.6, [side * 0.8, lift * 0.85, near * 0.8]],
      [0.86, [side * 0.8, lift * 0.9, near * 0.8]],
      [1, [0, 0, 0]],
    ],
    weaponRotation: [
      [0, [0, 0, 0]],
      [0.16, [0.05, yaw, roll]],
      [0.46, [0.08, yaw + 0.06, roll + 0.05]],
      [0.6, [0.3, yaw * 0.7, -0.85]],
      [0.86, [0.36, yaw * 0.68, -0.92]],
      [1, [0, 0, 0]],
    ],
    events: [
      [0.08, "cloth"],
      [0.55, "cloth"],
    ],
  };
}

export const RIGS = {
  vigil: {
    // Weapon root in the view frame (eyes at the origin, looking down -z).
    hip: { position: [0.07, -0.078, -0.36], rotation: [0.02, 0.05, -0.02] },
    // Virtual shoulders behind the eye keep the arms almost straight.
    shoulders: { right: [0, -0.04, 0.18], left: [0, -0.04, 0.18] },
    shouldersAim: { right: [-0.04, -0.2, 0.12], left: [0.04, -0.2, 0.12] },
    flash: "pistol",
    kick: { back: 0.9, rise: 0.1, pitch: 3.2, yaw: 0.5, roll: 1.0, ads: 0.5 },
    // Sprint: high ready, the muzzle up and the pistol by the cheek.
    sprint: { position: [0.11, -0.1, -0.3], rotation: [0.9, 0.25, -0.25] },
    // Eye relief behind the rear sight when aiming.
    relief: 0.4,
    grips: {
      right: {
        // Middle knuckle, forward (wrist -> knuckle), lateral (pinky -> index).
        knuckle: [0.0492, -0.0587, 0.0371],
        forward: [0.2143, 0.5065, -0.8352],
        lateral: [-0.0994, 0.8619, 0.4972],
        pole: [0.7, -0.9, 0.3],
        pose: {
          index: [0.43, 0.42, 0],
          middle: [0.6, 0.22, 1.04],
          ring: [0.26, 0.2, 0.22],
          pinky: [1.2, 0.24, 0.2],
          thumb: [0.63, 0.32, 0.06, 0.63],
        },
      },
      left: {
        knuckle: [-0.0523, -0.0906, 0.005],
        forward: [0.2178, 0.2155, -0.9519],
        lateral: [-0.1231, 0.9736, 0.1922],
        pole: [-0.5, -1, 0.1],
        pose: {
          index: [0.3, 0.3, 0.3],
          middle: [0.62, 0.98, 0.32],
          ring: [0.72, 0.3, 0.3],
          pinky: [1.04, 0.3, 0.34],
          thumb: [0.47, -0.3, -0.2, -0.2],
        },
      },
    },
    muzzle: "muzzle",
    eject: "eject",
    action: { part: "slide", travel: 0.052, lock: 0.82, lockOnEmpty: true },
    actions: {
      inspect: inspect({ yaw: 0.95, lift: 0.05, near: -0.02, side: -0.07 }),
      reload: pistolReload(false),
      reloadEmpty: pistolReload(true),
    },
  },
  spectre: {
    hip: { position: [0.085, -0.112, -0.34], rotation: [0.01, 0.04, -0.03] },
    // Sprint: carried across the chest, canted, the muzzle to the left.
    sprint: { position: [0.12, -0.085, -0.3], rotation: [-0.1, 0.75, 0.7] },
    shoulders: { right: [0, -0.07, 0.14], left: [0.05, -0.12, -0.14] },
    shouldersAim: { right: [-0.03, -0.16, 0.12], left: [0.03, -0.14, -0.04] },
    // Red dot: the tube's axis, eye a hand's breadth behind the rear hood.
    relief: 0.15,
    pivot: [0, -0.05, 0.08],
    flash: "smg",
    kick: {
      back: 0.55,
      rise: 0.06,
      pitch: 1.3,
      yaw: 0.55,
      roll: 0.7,
      ads: 0.45,
    },
    aimRate: 13,
    grips: {
      right: {
        knuckle: [0.0575, -0.0785, 0.0694],
        forward: [0.1653, -0.1168, -0.9793],
        lateral: [-0.0879, 0.9873, -0.1326],
        pole: [0.7, -0.9, 0.3],
        pose: {
          index: [0.2, 0.4, 0.16],
          middle: [0.94, 0.26, 0.32],
          ring: [0.8, 0.2, 0.48],
          pinky: [0.42, 0.2, 0.24],
          thumb: [1.21, 0.84, -0.2, 0.12],
        },
      },
      left: {
        knuckle: [0.0066, -0.0774, -0.1675],
        forward: [0.8248, 0.2872, -0.4871],
        lateral: [-0.559, 0.2846, -0.7788],
        pole: [-0.4, -1, 0.15],
        pose: {
          index: [0.2, 0.2, 0.2],
          middle: [0.42, 0.36, 0.52],
          ring: [0.62, 0.22, 0.24],
          pinky: [0.52, 0.22, 0.22],
          thumb: [-0.3, -0.07, -0.2, 0.2],
        },
      },
    },
    muzzle: "muzzle",
    eject: "eject",
    action: { part: "bolt", travel: 0.042 },
    parts: { charging_handle: { axis: [0, 0, 1], travel: 0.06 } },
    actions: {
      inspect: inspect(),
      reload: smgReload(false),
      reloadEmpty: smgReload(true),
    },
  },
  marauder: {
    hip: { position: [0.09, -0.118, -0.39], rotation: [0.01, 0.035, -0.03] },
    sprint: { position: [0.12, -0.085, -0.3], rotation: [-0.1, 0.75, 0.7] },
    shoulders: { right: [0, -0.07, 0.14], left: [0.05, -0.12, -0.2] },
    shouldersAim: { right: [-0.03, -0.16, 0.12], left: [0.03, -0.14, -0.08] },
    relief: 0.13,
    pivot: [0, -0.05, 0.08],
    flash: "rifle",
    kick: {
      back: 0.75,
      rise: 0.07,
      pitch: 1.6,
      yaw: 0.5,
      roll: 0.8,
      ads: 0.45,
    },
    aimRate: 11,
    grips: {
      right: {
        knuckle: [0.0552, -0.0661, 0.088],
        forward: [0.1653, -0.1168, -0.9793],
        lateral: [-0.0879, 0.9873, -0.1326],
        pole: [0.7, -0.9, 0.3],
        pose: {
          index: [0.45, 0.23, 0.53],
          middle: [0.94, 0.26, 0.62],
          ring: [0.9, 0.2, 0.3],
          pinky: [0.58, 0.28, 0.5],
          thumb: [0.29, -0.77, 1.1, 0.7],
        },
      },
      left: {
        knuckle: [0.0058, -0.0689, -0.2438],
        forward: [0.8248, 0.2872, -0.4871],
        lateral: [-0.559, 0.2846, -0.7788],
        pole: [-0.4, -1, 0.15],
        pose: {
          index: [0.2, 0.2, 0.4],
          middle: [0.56, 0.24, 0.4],
          ring: [0.68, 0.2, 0.22],
          pinky: [0.64, 0.22, 0.2],
          thumb: [-0.3, -0.08, -0.2, 0.5],
        },
      },
    },
    muzzle: "muzzle",
    eject: "eject",
    action: { part: "bolt", travel: 0.08, lock: 0.9, lockOnEmpty: true },
    actions: {
      inspect: inspect(),
      reload: rifleReload(false),
      reloadEmpty: rifleReload(true),
    },
  },
  requiem: {
    hip: { position: [0.09, -0.12, -0.37], rotation: [0.01, 0.035, -0.03] },
    sprint: { position: [0.12, -0.085, -0.3], rotation: [-0.1, 0.75, 0.7] },
    shoulders: { right: [0, -0.07, 0.14], left: [0.05, -0.12, -0.2] },
    shouldersAim: { right: [-0.03, -0.16, 0.12], left: [0.03, -0.14, -0.08] },
    // Cheek on the comb: the eye close behind the ghost ring, the stock
    // below the view.
    relief: 0.075,
    pivot: [0, -0.05, 0.1],
    flash: "shotgun",
    kick: { back: 1.4, rise: 0.12, pitch: 4.2, yaw: 0.7, roll: 1.4, ads: 0.6 },
    aimRate: 10,
    ejectOnCycle: true,
    shellEject: true,
    cycle: { name: "pump", duration: 0.46, delay: 0.1 },
    grips: {
      right: {
        knuckle: [0.065, -0.0905, 0.1384],
        forward: [0.1653, -0.1168, -0.9793],
        lateral: [-0.0879, 0.9873, -0.1326],
        pole: [0.7, -0.9, 0.3],
        pose: {
          index: [0.54, 0, 1.3],
          middle: [0.96, 0.22, 0.22],
          ring: [0.86, 0.24, 0.2],
          pinky: [0.54, 0.2, 0.24],
          thumb: [1.5, 0.9, 0.22, 1.3],
        },
      },
      left: {
        space: "pump",
        knuckle: [0.0101, -0.0566, 0.0038],
        forward: [0.8248, 0.2872, -0.4871],
        lateral: [-0.559, 0.2846, -0.7788],
        pole: [-0.4, -1, 0.15],
        pose: {
          index: [0.2, 0.2, 0.4],
          middle: [0.54, 0.22, 0.64],
          ring: [0.68, 0.22, 0.2],
          pinky: [0.62, 0.2, 0.2],
          thumb: [-0.3, -0.07, -0.2, 0.57],
        },
      },
    },
    muzzle: "muzzle",
    eject: "eject",
    parts: {
      pump: { axis: [0, 0, 1], travel: 0.085 },
      bolt: { axis: [0, 0, 1], travel: 0.085 },
    },
    actions: { pump: PUMP, inspect: inspect(), ...shotgunLoad() },
    shellReload: { start: 0.32, shell: 0.5, end: 0.3 },
  },
  longinus: {
    hip: { position: [0.095, -0.13, -0.42], rotation: [0.01, 0.03, -0.03] },
    sprint: { position: [0.12, -0.085, -0.3], rotation: [-0.1, 0.75, 0.7] },
    shoulders: { right: [0, -0.07, 0.14], left: [0.05, -0.12, -0.22] },
    shouldersAim: { right: [-0.03, -0.16, 0.12], left: [0.03, -0.14, -0.1] },
    relief: 0.09,
    pivot: [0, -0.05, 0.08],
    flash: "sniper",
    kick: { back: 1.6, rise: 0.1, pitch: 3.6, yaw: 0.5, roll: 1.2, ads: 0.35 },
    aimRate: 7.5,
    ejectOnCycle: true,
    cycle: { name: "bolt", duration: 0.78, delay: 0.16, unaim: true },
    grips: {
      right: {
        knuckle: [0.0594, -0.086, 0.078],
        forward: [0.1653, -0.1168, -0.9793],
        lateral: [-0.0879, 0.9873, -0.1326],
        pole: [0.7, -0.9, 0.3],
        pose: {
          index: [0.41, 1.7, 1.3],
          middle: [0.36, 0.22, 0.28],
          ring: [0.88, 0.22, 0.26],
          pinky: [0.54, 0.24, 0.28],
          thumb: [1.21, 0.75, 0.13, 1.3],
        },
      },
      left: {
        knuckle: [0.0041, -0.0855, -0.2372],
        forward: [0.6518, 0.1024, -0.7515],
        lateral: [-0.7535, 0.2006, -0.6262],
        pole: [-0.4, -1, 0.15],
        pose: {
          index: [0.2, 0.2, 0.2],
          middle: [0.5, 0.2, 0.86],
          ring: [0.84, 0.2, 0.24],
          pinky: [0.94, 0.22, 0.2],
          thumb: [-0.3, -0.42, 0.02, 1.17],
        },
      },
    },
    muzzle: "muzzle",
    eject: "eject",
    parts: {
      bolt_handle: {
        axis: [0, 0, 1],
        travel: 0.1,
        turnAxis: [0, 0, 1],
        turn: 1.1,
      },
    },
    actions: {
      inspect: inspect({ yaw: 1.0, lift: 0.08, near: -0.14, side: -0.12 }),
      bolt: sniperCycle(),
      reload: sniperReload(false),
      reloadEmpty: sniperReload(true),
    },
  },
  eclipse: {
    hip: { position: [0.09, -0.115, -0.36], rotation: [0.01, 0.035, -0.03] },
    sprint: { position: [0.12, -0.085, -0.3], rotation: [-0.1, 0.75, 0.7] },
    shoulders: { right: [0, -0.07, 0.14], left: [0.05, -0.12, -0.08] },
    shouldersAim: { right: [-0.03, -0.16, 0.12], left: [0.03, -0.14, 0.0] },
    relief: 0.14,
    pivot: [0, -0.05, 0.08],
    flash: "energy",
    kick: { back: 0.8, rise: 0.08, pitch: 2.2, yaw: 0.5, roll: 1.1, ads: 0.5 },
    aimRate: 11,
    grips: {
      right: {
        knuckle: [0.0564, -0.0691, 0.0855],
        forward: [0.1653, -0.1168, -0.9793],
        lateral: [-0.0879, 0.9873, -0.1326],
        pole: [0.7, -0.9, 0.3],
        pose: {
          index: [0.47, 0, 1.3],
          middle: [0.86, 0.24, 0.68],
          ring: [0.76, 0.2, 0.26],
          pinky: [0.44, 0.2, 0.2],
          thumb: [0.27, -0.35, 0.92, 0.83],
        },
      },
      left: {
        knuckle: [0.0074, -0.1014, -0.1064],
        forward: [0.8248, 0.2872, -0.4871],
        lateral: [-0.559, 0.2846, -0.7788],
        pole: [-0.4, -1, 0.15],
        pose: {
          index: [1.14, 0.22, 0.22],
          middle: [0.64, 0.32, 0.2],
          ring: [0.86, 0.2, 0.22],
          pinky: [0.76, 0.24, 0.38],
          thumb: [-0.3, -0.07, -0.2, -0.1],
        },
      },
    },
    muzzle: "muzzle",
    spin: {
      ring_a: { axis: [1, 0, 0], speed: 1.3, boost: 5 },
      ring_b: { axis: [0, 1, 0], speed: -0.9, boost: 5 },
      corona: { axis: [0, 0, 1], speed: 0.6, boost: 2 },
    },
    actions: {
      inspect: inspect(),
      reload: rifleReload(false),
      reloadEmpty: rifleReload(false),
    },
  },
};

export const deg2rad = deg;
