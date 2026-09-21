// Shared wire contract. No DOM, Three.js or Node dependencies.
export const PROTOCOL_VERSION = 4;
export const MAX_PLAYERS = 4;
export const MAX_MESSAGE_BYTES = 128 * 1024;
export const PLAYER_FLAGS = Object.freeze({
  CROUCH: 1,
  SPRINT: 2,
  FIRING: 4,
  DOWN: 8,
  AIM: 16,
  DEAD: 32,
  REVIVING: 64,
});
export const HOST_EVENTS = new Set([
  "damage",
  "score",
  "reward",
  "collect",
  "weapon",
  "purchase",
  "announce",
  "toast",
  "wave",
  "explode",
  "end",
  "pause",
  "revived",
  "eliminated",
]);
export const PEER_EVENTS = new Set([
  "input",
  "hit",
  "interact",
  "grenade",
  "pause",
]);
export const isObject = (value) =>
  !!value && typeof value === "object" && !Array.isArray(value);
export const finite = (value, min = -10000, max = 10000) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= min &&
  value <= max;
export const integer = (value, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  Number.isSafeInteger(value) && value >= min && value <= max;
export const contentId = (value) =>
  typeof value === "string" && /^[a-z][a-z0-9_-]{0,47}$/.test(value);
const point = (value) =>
  Array.isArray(value) && value.length === 3 && value.every((v) => finite(v));
const notice = (value) =>
  isObject(value) &&
  ["title", "text", "subtitle", "eyebrow"].every(
    (key) =>
      value[key] === undefined ||
      (typeof value[key] === "string" && value[key].length <= 500),
  ) &&
  (value.duration === undefined || finite(value.duration, 0, 30000));
export function validPlayer(m) {
  return (
    isObject(m) &&
    [m.x, m.y, m.z, m.yaw, m.pitch].every((v) => finite(v)) &&
    contentId(m.w) &&
    integer(m.l, 0, 3) &&
    finite(m.hp, 0, 180) &&
    finite(m.mhp, 1, 180) &&
    integer(m.f, 0, 127) &&
    (m.r === undefined || integer(m.r, 0)) &&
    integer(m.points, 0) &&
    integer(m.grenades, 0, 5)
  );
}
export function validEvent(m) {
  if (!isObject(m)) return false;
  switch (m.k) {
    case "input":
      return validPlayer(m);
    case "hit":
      return (
        integer(m.id, 1) &&
        finite(m.d, 0, 10000000) &&
        integer(m.h, 0, 1) &&
        (m.p == null || point(m.p)) &&
        (m.v == null || point(m.v))
      );
    case "interact":
      return (
        typeof m.id === "string" &&
        m.id.length <= 120 &&
        integer(m.request, 1) &&
        (m.take === undefined || m.take === 1)
      );
    case "grenade":
      return (
        [m.x, m.y, m.z].every((v) => finite(v)) &&
        [m.vx, m.vy, m.vz].every((v) => finite(v, -20, 20))
      );
    case "pause":
      return typeof m.paused === "boolean";
    case "damage":
      return (
        finite(m.amount, 0, 10000) &&
        (m.time === undefined || finite(m.time, 0, 1e9))
      );
    case "score":
      return (
        finite(m.points, 0, 10000000) &&
        typeof m.head === "boolean" &&
        contentId(m.type)
      );
    case "reward":
      return (
        integer(m.reward, 0) &&
        (m.grenades === undefined || integer(m.grenades, 0, 5))
      );
    case "collect":
      return ["health", "ammo", "double", "insta"].includes(m.type);
    case "weapon":
      return contentId(m.id);
    case "purchase":
      return (
        integer(m.request, 1) &&
        integer(m.cost, 0, 100000) &&
        (m.weapon == null || contentId(m.weapon))
      );
    case "announce":
    case "toast":
      return notice(m.a);
    case "wave":
    case "revived":
    case "eliminated":
      return true;
    case "explode":
      return [m.x, m.y, m.z].every((v) => finite(v));
    case "end":
      return typeof m.victory === "boolean";
    default:
      return false;
  }
}
const rows = (value, max, length, check) =>
  Array.isArray(value) &&
  value.length <= max &&
  value.every(
    (row) => Array.isArray(row) && row.length === length && check(row),
  );
export function validSnapshot(s) {
  return (
    isObject(s) &&
    integer(s.n) &&
    (s.time === undefined || finite(s.time, 0, 1e9)) &&
    integer(s.wave) &&
    ["rest", "wave"].includes(s.phase) &&
    finite(s.timer) &&
    integer(s.remaining) &&
    integer(s.power, 0, 1) &&
    finite(s.extraction) &&
    typeof s.paused === "boolean" &&
    (s.rescue === undefined ||
      rows(
        s.rescue,
        MAX_PLAYERS,
        5,
        (r) =>
          integer(r[0], 1) &&
          finite(r[1], 0, 45) &&
          finite(r[2], 0, 1) &&
          integer(r[3], 0) &&
          integer(r[4], 0, 1),
      )) &&
    rows(
      s.doors,
      128,
      2,
      (r) => typeof r[0] === "string" && integer(r[1], 0, 1),
    ) &&
    (s.box === null ||
      (Array.isArray(s.box) &&
        s.box.length === 3 &&
        integer(s.box[0], 0, 1) &&
        s.box.slice(1).every((v) => v === null || contentId(v)))) &&
    rows(
      s.e,
      128,
      16,
      (r) =>
        integer(r[0], 1) &&
        contentId(r[1]) &&
        r.slice(2).every((v) => finite(v, -1e9, 1e9)) &&
        r.slice(6, 10).every((v) => integer(v, 0, 1)) &&
        integer(r[11], 0, 2) &&
        finite(r[12], 0, 1e9) &&
        integer(r[13], 0, 1e9) &&
        finite(r[14]) &&
        finite(r[15], 0, 1e9),
    ) &&
    rows(
      s.p,
      MAX_PLAYERS,
      13,
      (r) =>
        integer(r[0], 1) &&
        validPlayer({
          x: r[1],
          y: r[2],
          z: r[3],
          yaw: r[4],
          pitch: r[5],
          w: r[6],
          l: r[7],
          hp: r[8],
          mhp: r[9],
          f: r[10],
          points: r[11],
          grenades: r[12],
        }),
    ) &&
    rows(
      s.k,
      256,
      4,
      (r) =>
        integer(r[0], 1) &&
        integer(r[1], 0, 3) &&
        r.slice(2).every((v) => finite(v)),
    ) &&
    rows(
      s.j,
      256,
      5,
      (r) =>
        integer(r[0], 1) &&
        integer(r[1], 0, 1) &&
        r.slice(2).every((v) => finite(v)),
    )
  );
}
export function canRelay(message, host) {
  if (!isObject(message)) return false;
  if (message.t === "state") return host && validSnapshot(message);
  return (
    message.t === "ev" &&
    (host ? HOST_EVENTS : PEER_EVENTS).has(message.k) &&
    validEvent(message)
  );
}
