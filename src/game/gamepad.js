import { clamp } from "../logic.js";

// Indices of the browser's standard gamepad mapping.
const A = 0,
  B = 1,
  X = 2,
  Y = 3,
  RB = 5,
  LT = 6,
  RT = 7,
  MENU = 9,
  LS = 10,
  RS = 11,
  UP = 12,
  LEFT = 14,
  RIGHT = 15;
const bit = (button) => 1 << button;
const triggerMask = bit(LT) | bit(RT);
const actions = [
  [A, "jump"],
  [B, "toggleCrouch"],
  [X, "useOrReload"],
  [RB, "grenade"],
  [RS, "melee"],
  [UP, "nextWave"],
  [LEFT, "inspectWeapon"],
  [RIGHT, "toggleLight"],
];
const isStandard = (pad) => pad?.connected && pad.mapping === "standard";

function readPad(index) {
  try {
    const pads = navigator.getGamepads?.();
    return isStandard(pads?.[index]) ? pads[index] : pads?.find(isStandard);
  } catch {
    // The browser may block gamepads in an embedded or insecure page.
    return null;
  }
}

function stickScale(x, y, deadZone) {
  const length = Math.hypot(x, y);
  return length > deadZone
    ? (Math.min(length, 1) - deadZone) / ((1 - deadZone) * length)
    : 0;
}

export class GamepadControls {
  constructor(run, input, commands) {
    Object.assign(this, { run, input, commands });
    this.state = input.gamepad = { active: false };
    this.buttons = this.blocked = 0;
    this.reset();
  }
  reset() {
    // Held gameplay buttons must be released before they can act again.
    this.blocked = this.buttons & ~bit(MENU);
    Object.assign(this.state, {
      x: 0,
      y: 0,
      aim: false,
      fire: false,
      firePressed: false,
      sprint: false,
      steady: false,
      interact: false,
    });
  }
  update(dt) {
    const { run, state, commands } = this;
    const pad = readPad(this.index);
    if (pad?.index !== this.index) {
      this.index = pad?.index;
      this.buttons = 0;
      state.active = false;
      this.reset();
    }
    if (!pad) return;
    let buttons = 0;
    for (let i = 0; i < 16; i++) {
      const button = pad.buttons[i];
      const down =
        i === LT || i === RT
          ? (button?.value ?? 0) >= 0.3 || button?.pressed
          : button?.pressed;
      if (down) buttons |= bit(i);
    }
    const edges = buttons & ~this.buttons;
    this.buttons = buttons;
    const pressed = (button) => !!(edges & bit(button));
    const focused = document.hasFocus();
    if (!focused || run.state !== "playing" || run.downed) this.reset();
    if (!focused) return;
    if (pressed(MENU) && (run.state === "paused" || run.state === "playing")) {
      state.active = true;
      if (run.state === "paused") commands.resumeWithGamepad();
      else commands.pause();
      return;
    }
    if (run.state !== "playing" || run.downed) return;
    const [mx = 0, my = 0, rx = 0, ry = 0] = pad.axes;
    const move = stickScale(mx, my, 0.18);
    const look = stickScale(rx, ry, 0.16);
    if (edges || move || look) state.active = true;
    state.x = mx * move;
    state.y = -my * move;

    this.blocked &= buttons;
    if (run.tonic) this.blocked |= buttons & triggerMask;
    const held = (button) => !!(buttons & ~this.blocked & bit(button));
    state.aim = held(LT) && !(run.meleeTimer > 0);
    state.fire = held(RT);
    state.firePressed = state.fire && pressed(RT);
    state.interact = held(X);
    state.steady = held(LS);
    const aim = state.aim || this.input.mouse.aim;
    if (state.y <= 0.1 || aim || state.fire || pressed(B)) state.sprint = false;
    else if (pressed(LS)) {
      state.sprint = !state.sprint;
      if (state.sprint) run.player.crouched = false;
    }
    // A softer response near center allows small corrections when aiming.
    const turn = (aim ? 1.55 : 3.5) * look ** 2 * Math.hypot(rx, ry) * dt;
    this.input.yaw -= rx * turn;
    this.input.pitch = clamp(this.input.pitch - ry * turn, -1.38, 1.38);

    for (const [button, action] of actions)
      if (pressed(button)) commands[action]();
    if (pressed(Y)) commands.switchWeapon(1 - run.slot);
  }
}
