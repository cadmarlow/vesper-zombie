import * as T from "three";
import { smoother } from "./springs.js";

// Keyframed tracks for view-model actions (reloads, bolt and pump cycles,
// draws, inspection). Time is normalized to the action's duration so a
// perk that shortens a reload keeps every key in place.

const tmp = new T.Vector3();

/** Value of a numeric or vector track [[t, v], ...] at t, eased per span. */
export function sampleTrack(track, t, out = null) {
  if (!track?.length) return out ? out.set(0, 0, 0) : 0;
  const n = track.length;
  let a, b, f;
  if (t <= track[0][0]) {
    a = b = track[0][1];
    f = 0;
  } else if (t >= track[n - 1][0]) {
    a = b = track[n - 1][1];
    f = 0;
  } else {
    let i = 0;
    while (t > track[i + 1][0]) i++;
    a = track[i][1];
    b = track[i + 1][1];
    f = smoother((t - track[i][0]) / (track[i + 1][0] - track[i][0]));
  }
  if (!Array.isArray(a)) return a + (b - a) * f;
  return (out || tmp).set(
    a[0] + (b[0] - a[0]) * f,
    a[1] + (b[1] - a[1]) * f,
    a[2] + (b[2] - a[2]) * f,
  );
}

/** Discrete state track [[t, state], ...]: last key at or before t. */
export function sampleState(track, t, fallback = null) {
  let state = fallback;
  for (const [k, s] of track || []) if (t >= k) state = s;
  return state;
}

/** Keys crossed between two normalized times (both inclusive of the end). */
export function crossedEvents(events, from, to) {
  const out = [];
  if (!events) return out;
  for (const [t, name] of events) if (t > from && t <= to) out.push(name);
  return out;
}

/**
 * Hand track: [{ t, ...target }] where a target is { grip: "rest" } (the
 * weapon's own grip for that hand) or { space, knuckle, forward, lateral,
 * pose }. Returns the two surrounding keys and the eased blend.
 */
export function sampleHand(track, t, out = {}) {
  if (!track?.length) return null;
  const n = track.length;
  if (t <= track[0].t || t >= track[n - 1].t) {
    out.a = out.b = t <= track[0].t ? track[0] : track[n - 1];
    out.k = 0;
    return out;
  }
  let i = 0;
  while (t > track[i + 1].t) i++;
  out.a = track[i];
  out.b = track[i + 1];
  out.k = smoother((t - out.a.t) / (out.b.t - out.a.t));
  return out;
}

const DIGITS = ["index", "middle", "ring", "pinky", "thumb"];
/** Blend two finger poses (objects of arrays); `out` is reused as given. */
export function blendPose(a, b, k, out = {}) {
  for (const key of DIGITS) {
    const pa = a?.[key],
      pb = b?.[key];
    if (!pa && !pb) {
      out[key] = undefined;
      continue;
    }
    const x = pa || pb,
      y = pb || pa;
    const blend = (out[key] ||= []);
    blend.length = x.length;
    for (let j = 0; j < x.length; j++)
      blend[j] = x[j] + ((y[j] ?? x[j]) - x[j]) * k;
  }
  out.spread = (a?.spread ?? 0) + ((b?.spread ?? 0) - (a?.spread ?? 0)) * k;
  return out;
}
