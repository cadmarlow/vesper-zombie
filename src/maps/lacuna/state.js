// Pure host-authoritative hydraulic state. Seconds, metres, no render objects.
export const PHASE = { IDLE: 0, WARNING: 1, FLOOD: 2, RECOVERY: 3 };
export const MODE = { AUTO: 0, VALVE: 1, RELEASE: 2 };
export function createHydraulics() {
  return {
    phase: PHASE.IDLE,
    timer: 65,
    zone: 0,
    mode: MODE.AUTO,
    cycle: 0,
    used: 0,
    cooldowns: [0, 0, 0],
    mastered: false,
    bridgeClosed: false,
    sequence: 0,
    bell: 0,
    bellCooldown: 0,
  };
}

export function canActivate(state, action, powered) {
  if (!powered) return false;
  if (action === "bell") return state.bellCooldown <= 0;
  if (state.phase !== PHASE.IDLE) return false;
  if (action === "release") return state.used === 7 && !state.mastered;
  return (
    Number.isInteger(action) &&
    action >= 0 &&
    action < 3 &&
    state.cooldowns[action] <= 0
  );
}

export function activate(state, action, powered) {
  if (!canActivate(state, action, powered)) return false;
  if (action === "bell") {
    state.bell = 16;
    state.bellCooldown = 70;
    return true;
  }
  state.phase = PHASE.WARNING;
  state.mode = action === "release" ? MODE.RELEASE : MODE.VALVE;
  state.zone = action === "release" ? 0 : action;
  state.timer = action === "release" ? 12 : 4;
  state.sequence = 0;
  if (action !== "release") {
    state.used |= 1 << action;
    state.cooldowns[action] = 58;
  }
  return true;
}

export function advance(state, dt, { enabled, bridgeClear }) {
  dt = Math.max(0, Math.min(dt, 1));
  state.cooldowns = state.cooldowns.map((value) => Math.max(0, value - dt));
  state.bell = Math.max(0, state.bell - dt);
  state.bellCooldown = Math.max(0, state.bellCooldown - dt);
  if (state.phase === PHASE.IDLE && !enabled) return;
  state.timer = Math.max(0, state.timer - dt);
  if (state.timer > 0) return;
  switch (state.phase) {
    case PHASE.IDLE:
      state.phase = PHASE.WARNING;
      state.mode = MODE.AUTO;
      state.zone = state.cycle++ % 3;
      state.timer = 12;
      break;
    case PHASE.WARNING:
      // Never remove the floor beneath players, downed teammates or enemies.
      // An occupied bridge holds the warning; both stone bridges remain open.
      if (state.mode !== MODE.VALVE && !bridgeClear) return;
      state.bridgeClosed = state.mode !== MODE.VALVE;
      state.phase = PHASE.FLOOD;
      state.timer =
        state.mode === MODE.VALVE ? 8 : state.mode === MODE.RELEASE ? 10 : 24;
      break;
    case PHASE.FLOOD:
      if (state.mode === MODE.RELEASE && state.sequence < 2) {
        state.sequence++;
        state.zone = state.sequence;
        state.phase = PHASE.WARNING;
        state.timer = 5;
      } else {
        state.phase = PHASE.RECOVERY;
        state.timer = 5;
      }
      break;
    case PHASE.RECOVERY:
      if (state.mode === MODE.RELEASE) state.mastered = true;
      state.bridgeClosed = false;
      state.phase = PHASE.IDLE;
      state.timer = state.mastered ? 90 : 65;
      break;
  }
}

export function packHydraulics(state) {
  return {
    id: "lacuna",
    revision: 1,
    data: [
      state.phase,
      state.timer,
      state.zone,
      state.mode,
      state.cycle,
      state.used,
      ...state.cooldowns,
      +state.mastered,
      +state.bridgeClosed,
      state.sequence,
      state.bell,
      state.bellCooldown,
    ],
  };
}

export function unpackHydraulics(packet) {
  if (
    packet?.id !== "lacuna" ||
    packet.revision !== 1 ||
    !Array.isArray(packet.data) ||
    packet.data.length !== 14 ||
    !packet.data.every((n) => Number.isFinite(n) && n >= 0)
  )
    return null;
  const [
    phase,
    timer,
    zone,
    mode,
    cycle,
    used,
    a,
    b,
    c,
    mastered,
    bridgeClosed,
    sequence,
    bell,
    bellCooldown,
  ] = packet.data;
  if (
    ![phase, zone, mode, cycle, used, mastered, bridgeClosed, sequence].every(
      Number.isInteger,
    ) ||
    phase > 3 ||
    zone > 2 ||
    mode > 2 ||
    used > 7 ||
    timer > 120 ||
    Math.max(a, b, c) > 58 ||
    mastered > 1 ||
    bridgeClosed > 1 ||
    sequence > 2 ||
    bell > 16 ||
    bellCooldown > 70
  )
    return null;
  return {
    phase,
    timer,
    zone,
    mode,
    cycle,
    used,
    cooldowns: [a, b, c],
    mastered: !!mastered,
    bridgeClosed: !!bridgeClosed,
    sequence,
    bell,
    bellCooldown,
  };
}
