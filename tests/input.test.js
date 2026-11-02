import test from "node:test";
import assert from "node:assert/strict";
import { DesktopControls } from "../src/game/input.js";

function fixture(t) {
  const originals = new Map();
  const win = new EventTarget(),
    doc = new EventTarget(),
    canvas = new EventTarget();
  canvas.clientHeight = 720;
  doc.pointerLockElement = canvas;
  for (const [name, value] of [
    ["window", win],
    ["document", doc],
  ]) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { value, configurable: true });
  }
  const run = { state: "playing", slot: 0, touch: false };
  const input = { keys: new Set(), mouse: { fire: false, aim: false } };
  const changes = [];
  const controls = new DesktopControls(run, { canvas }, input, {
    switchWeapon: (slot) => {
      run.slot = slot;
      changes.push(slot);
    },
    pause: () => {
      run.state = "paused";
    },
    requestFrame: () => {},
  });
  t.after(() => {
    controls.dispose();
    for (const [name, descriptor] of originals)
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
  });
  const wheel = (init, at) => {
    const event = new Event("wheel", { cancelable: true });
    Object.assign(event, { deltaX: 0, deltaY: 0, deltaMode: 0, ...init });
    Object.defineProperty(event, "timeStamp", { value: at });
    canvas.dispatchEvent(event);
    return event;
  };
  return { run, input, changes, wheel, doc, win, canvas };
}

test("tiny, horizontal and zoom wheel events never change a captured weapon", (t) => {
  const { wheel, changes } = fixture(t);
  assert.equal(wheel({ deltaY: 1 }, 0).defaultPrevented, true);
  wheel({ deltaY: 0 }, 400);
  wheel({ deltaX: 80 }, 800);
  wheel({ deltaX: 80, deltaY: 2 }, 1200);
  wheel({ deltaY: 100, ctrlKey: true }, 1600);
  wheel({ deltaY: NaN }, 2000);
  assert.deepEqual(changes, []);
});

test("a vertical gesture and its inertia tail select once, then a new gesture can switch back", (t) => {
  const { wheel, changes } = fixture(t);
  wheel({ deltaY: 100 }, 0);
  for (const [i, y] of [60, 30, 12, 3, 1, -1].entries())
    wheel({ deltaY: y }, 30 + i * 35);
  assert.deepEqual(changes, [1]);
  wheel({ deltaY: -100 }, 600);
  assert.deepEqual(changes, [1, 0]);
});

test("precise wheel deltas accumulate, with line and page notches normalized", (t) => {
  const { wheel, changes } = fixture(t);
  for (let i = 0; i < 8; i++) wheel({ deltaY: 2 }, i * 10);
  assert.deepEqual(changes, [1]);
  wheel({ deltaY: -1, deltaMode: 1 }, 500);
  assert.deepEqual(changes, [1, 0]);
  wheel({ deltaY: 1, deltaMode: 2 }, 1000);
  assert.deepEqual(changes, [1, 0, 1]);
});

test("unrelated impulses and direction reversals cannot build a delayed weapon switch", (t) => {
  const { wheel, changes } = fixture(t);
  for (let i = 0; i < 12; i++) wheel({ deltaY: 2 }, i * 300);
  for (let i = 0; i < 20; i++) wheel({ deltaY: i & 1 ? -2 : 2 }, 4000 + i * 10);
  assert.deepEqual(changes, []);
});

test("wheel input requires gameplay pointer lock and resets across focus loss", (t) => {
  const { run, wheel, changes, doc, win, canvas } = fixture(t);
  doc.pointerLockElement = null;
  wheel({ deltaY: 100 }, 0);
  assert.deepEqual(changes, []);
  doc.pointerLockElement = canvas;
  wheel({ deltaY: 8 }, 400);
  win.dispatchEvent(new Event("blur"));
  run.state = "playing";
  wheel({ deltaY: 8 }, 410);
  assert.deepEqual(changes, []);
  wheel({ deltaY: 8 }, 420);
  assert.deepEqual(changes, [1]);
  run.state = "paused";
  wheel({ deltaY: 100 }, 800);
  assert.deepEqual(changes, [1]);
});
