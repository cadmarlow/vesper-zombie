import { clamp } from "../logic.js";
const WHEEL_THRESHOLD = 12; // CSS pixels; also accepts one line-mode notch.
const WHEEL_QUIET = 180; // A quiet gap separates gestures from an inertia tail.
/** Keyboard and mouse produce the same commands as TouchControls. */
export class DesktopControls {
  constructor(run, view, input, commands) {
    Object.assign(this, { run, view, input, commands });
    this.abort = new AbortController();
    this.wheelGesture = null;
    this.bind();
  }
  bind() {
    const listen = (target, type, handler, options = {}) => {
      target.addEventListener(type, handler, {
        ...options,
        signal: this.abort.signal,
      });
    };
    listen(window, "resize", () => this.commands.resize());
    listen(window, "keydown", (e) => {
      if (e.target.matches("input,select,textarea")) return;
      // Only swallow navigation keys during play. Menus and panels keep
      // keyboard focus traversal and button activation.
      if (
        this.run.state === "playing" &&
        [
          "Space",
          "Tab",
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
        ].includes(e.code)
      )
        e.preventDefault();
      this.input.keys.add(e.code);
      if (e.repeat) return;
      if (this.run.state === "playing") {
        switch (e.code) {
          case "KeyR":
            this.commands.reload();
            break;
          case "KeyE":
            this.commands.interact();
            break;
          case "KeyG":
            this.commands.grenade();
            break;
          case "KeyV":
            this.commands.melee();
            break;
          case "KeyC":
            this.commands.toggleCrouch();
            break;
          // Space runs (held, see player.js), Shift jumps.
          case "Space":
            this.run.player.crouched = false;
            break;
          case "KeyF":
            this.view.flashlight.visible = !this.view.flashlight.visible;
            break;
          case "Digit1":
            this.commands.switchWeapon(0);
            break;
          case "Digit2":
            this.commands.switchWeapon(1);
            break;
          case "KeyT":
            this.commands.inspectWeapon?.();
            break;
          case "KeyN":
            if (this.run.phase === "rest" && !this.run.session?.peer)
              this.run.phaseTimer = Math.min(this.run.phaseTimer, 0.2);
            break;
          case "Escape":
            this.commands.pause();
            break;
          case "ShiftLeft":
          case "ShiftRight":
            this.commands.jump();
            break;
        }
      } else if (e.code === "Escape" && this.run.state === "paused")
        this.commands.resume();
    });
    listen(window, "keyup", (e) => this.input.keys.delete(e.code));
    listen(window, "blur", () => {
      this.wheelGesture = null;
      this.input.keys.clear();
      if (this.run.state === "playing") this.commands.pause();
    });
    listen(document, "visibilitychange", () => {
      if (document.hidden) this.wheelGesture = null;
      if (document.hidden && this.run.state === "playing")
        this.commands.pause();
      if (!document.hidden) this.view.needsRender = true;
      this.commands.requestFrame();
    });
    listen(document, "pointerlockchange", () => {
      this.wheelGesture = null;
      if (
        document.pointerLockElement !== this.view.canvas &&
        this.run.state === "playing" &&
        !this.run.touch
      )
        this.commands.pause();
    });
    listen(document, "mousemove", (e) => {
      if (this.run.state !== "playing") return;
      if (document.pointerLockElement === this.view.canvas) {
        this.input.yaw -= e.movementX * 0.0018 * this.run.settings.sensitivity;
        this.input.pitch = clamp(
          this.input.pitch -
            e.movementY * 0.0018 * this.run.settings.sensitivity,
          -1.38,
          1.38,
        );
      }
    });
    listen(this.view.canvas, "mousedown", (e) => {
      if (this.run.state !== "playing") return;
      if (document.pointerLockElement !== this.view.canvas && !this.run.touch) {
        this.commands.lock();
        return;
      }
      if (e.button === 0) {
        this.input.mouse.fire = true;
        this.commands.shoot();
      }
      if (e.button === 2) this.input.mouse.aim = true;
    });
    listen(window, "mouseup", (e) => {
      if (e.button === 0) this.input.mouse.fire = false;
      if (e.button === 2) this.input.mouse.aim = false;
    });
    listen(this.view.canvas, "contextmenu", (e) => e.preventDefault());
    listen(this.view.canvas, "wheel", (e) => this.wheelWeapon(e), {
      passive: false,
    });
  }
  wheelWeapon(e) {
    if (
      this.run.state !== "playing" ||
      document.pointerLockElement !== this.view.canvas
    ) {
      this.wheelGesture = null;
      return;
    }
    e.preventDefault();
    const mode = e.deltaMode,
      x = e.deltaX,
      y = e.deltaY;
    if (
      e.ctrlKey ||
      !Number.isFinite(y) ||
      !Number.isFinite(x) ||
      Math.abs(y) <= Math.abs(x)
    )
      return;
    const scale =
      mode === 1 ? 16 : mode === 2 ? this.view.canvas.clientHeight : 1;
    const amount = y * scale;
    const now = e.timeStamp;
    let gesture = this.wheelGesture;
    if (!gesture || now - gesture.at > WHEEL_QUIET || now < gesture.at)
      gesture = this.wheelGesture = {
        at: now,
        amount: 0,
        direction: Math.sign(amount),
        consumed: false,
      };
    gesture.at = now;
    if (gesture.consumed) return;
    if (gesture.direction !== Math.sign(amount)) {
      gesture.amount = 0;
      gesture.direction = Math.sign(amount);
    }
    gesture.amount += Math.abs(amount);
    if (gesture.amount < WHEEL_THRESHOLD) return;
    // A physical notch can deliver many events. Its tail must never swap back.
    gesture.consumed = true;
    this.commands.switchWeapon(1 - this.run.slot);
  }
  dispose() {
    this.abort.abort();
    this.wheelGesture = null;
    this.input.keys.clear();
    this.input.mouse.fire = this.input.mouse.aim = false;
  }
}

/** Small common input API for touch; no renderer or enemy state is exposed. */
export function createInputPort(run, input, actions) {
  const port = { ...actions };
  for (const name of [
    "keys",
    "mouse",
    "yaw",
    "pitch",
    "touchMove",
    "touchSprint",
    "touchRun",
    "touchInteract",
  ])
    Object.defineProperty(port, name, {
      get: () => input[name],
      set: (value) => {
        input[name] = value;
      },
    });
  for (const name of ["state", "touch", "slot"])
    Object.defineProperty(port, name, { get: () => run[name] });
  return port;
}
