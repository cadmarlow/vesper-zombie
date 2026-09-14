/** Presentation cadence independent of the display's refresh rate. */
export class FrameClock {
  reset() {
    this.next = undefined;
  }
  accept(now, rate = 60) {
    const interval = 1000 / rate;
    if (this.rate !== rate || this.next === undefined) {
      this.rate = rate;
      this.next = now;
    }
    // Browser timestamps can land just below the deadline. Preserve the
    // fractional deadline instead of drifting to 48 FPS on a 144 Hz display.
    if (now + 0.5 < this.next) return false;
    this.next += interval;
    // A long interruption must not create a burst of catch-up renders.
    if (this.next <= now) this.next = now + interval;
    return true;
  }
}
