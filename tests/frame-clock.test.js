import test from "node:test";
import assert from "node:assert/strict";
import { FrameClock } from "../src/game/frame-clock.js";

test("30 and 60 FPS caps preserve cadence on common high-refresh displays", () => {
  for (const refresh of [60, 90, 120, 144, 165, 240]) {
    for (const rate of [30, 60]) {
      const clock = new FrameClock();
      let frames = 0;
      for (let tick = 0; tick < refresh * 10; tick++)
        if (clock.accept((tick * 1000) / refresh, rate)) frames++;
      assert.ok(
        Math.abs(frames - rate * 10) <= 1,
        `${refresh} Hz, cap ${rate}: ${frames} frames`,
      );
    }
  }
});
test("slow frames and a resumed run do not generate catch-up bursts", () => {
  const clock = new FrameClock();
  assert.equal(clock.accept(0, 60), true);
  assert.equal(clock.accept(4000, 60), true);
  assert.equal(clock.accept(4001, 60), false);
  assert.equal(clock.accept(4017, 60), true);
  clock.reset();
  assert.equal(clock.accept(4020, 60), true);
  assert.equal(clock.accept(4021, 60), false);
  assert.equal(clock.accept(4022, 30), true);
  assert.equal(clock.accept(4039, 30), false);
});
