/** Frame intervals include deliberate presentation throttling (30 or 60 Hz). */
export function resolutionForFrameTime(
  current,
  frameMs,
  recoverySeconds,
  frameRate = 60,
) {
  const budget = 1000 / frameRate;
  if (frameMs > budget * 1.104) return Math.max(0.65, current - 0.1);
  if (frameMs < budget * 1.032 && recoverySeconds > 12)
    return Math.min(1, current + 0.04);
  return current;
}
