/** Shared presentation timing. The host alone chooses and grants the reward. */
export const RELIQUARY = Object.freeze({
  drawDuration: 4.8,
  offerDuration: 18,
  // Mechanical clicks accelerate, then slow to a deliberate final stop.
  ticks: Object.freeze([
    0.85, 1.04, 1.2, 1.34, 1.47, 1.6, 1.73, 1.87, 2.03, 2.22, 2.45, 2.74, 3.1,
    3.55, 4.12,
  ]),
  colors: Object.freeze({
    RARE: 0x81d9eb,
    ÉPIQUE: 0xbda0ff,
    LÉGENDAIRE: 0xffc678,
  }),
});

export function reliquaryCycle(elapsed) {
  let cycle = -1;
  while (
    cycle + 1 < RELIQUARY.ticks.length &&
    elapsed >= RELIQUARY.ticks[cycle + 1]
  )
    cycle++;
  return cycle;
}

export function reliquaryPhase(box) {
  if (!box.busy) return "idle";
  if (box.offered) return "offered";
  const elapsed = RELIQUARY.drawDuration - box.timer;
  return elapsed < 0.85 ? "awakening" : elapsed < 3.1 ? "cycling" : "binding";
}
