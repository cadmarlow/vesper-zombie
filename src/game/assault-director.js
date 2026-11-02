import { ASSAULTS } from "../content/assaults.js";
import { ENEMIES } from "../content/enemies.js";
import { hordeRandom } from "../content/horde.js";

const living = (run) => run.enemies.filter((e) => !e.dead);
const pick = (list, value) =>
  list[Math.min(list.length - 1, Math.floor(value * list.length))];

function packet(state, wave) {
  const choices = Object.keys(ASSAULTS).filter(
    (name) => ASSAULTS[name].firstWave <= wave && name !== state.pattern,
  );
  state.pattern = pick(
    choices.length ? choices : ["front"],
    hordeRandom(state.seed, state.group + 10),
  );
  state.size =
    wave < 4
      ? 4
      : 5 + Math.floor(hordeRandom(state.seed, state.group + 30) * 3);
  state.member = 0;
  state.bearing = hordeRandom(state.seed, state.group + 50) * Math.PI * 2;
  state.history.push(state.pattern);
  if (state.history.length > 8) state.history.shift();
}

/** Fixed wave quotas; only composition, entrances and cadence are orchestrated. */
export function beginAssaultWave(run, random = Math.random) {
  const state = (run.assault = {
    wave: run.wave,
    seed: Math.floor(random() * 1e9),
    group: 0,
    spawned: 0,
    history: [],
    reliefUntil: 0,
  });
  packet(state, run.wave);
  return state;
}

/** Repeated failed spawn attempts return the same plan, without spending quota. */
export function nextAssaultSpawn(run) {
  const s = run.assault;
  if (!s || s.wave !== run.wave || run.phase !== "wave") return null;
  const roster = ASSAULTS[s.pattern].roster;
  const offset = Math.floor(hordeRandom(s.seed, s.group + 80) * roster.length);
  let type = roster[(s.member + offset) % roster.length];
  if (!ENEMIES[type].spawn || ENEMIES[type].spawn.wave > run.wave)
    type = "walker";
  const alive = living(run);
  const cap =
    type === "brute"
      ? 2
      : type === "spitter"
        ? 2
        : type === "wraith"
          ? 3
          : Infinity;
  if (
    alive.filter((e) => e.type === type).length >= cap ||
    (run.time < s.reliefUntil && type !== "walker")
  )
    type = "walker";
  return {
    type,
    group: s.group,
    member: s.member,
    pattern: s.pattern,
    side: s.group & 1 ? -1 : 1,
    bearing:
      s.bearing +
      (s.pattern === "pincer" && s.member % 3 === 2 ? Math.PI * 0.65 : 0),
  };
}
export function commitAssaultSpawn(run) {
  const s = run.assault;
  if (!s || s.wave !== run.wave) return;
  s.spawned++;
  s.member++;
  s.breakAfterSpawn = s.member >= s.size;
  if (s.breakAfterSpawn) {
    s.group++;
    packet(s, run.wave);
  }
}
export function assaultSpawnInterval(run) {
  const base = Math.max(0.35, 1.6 - run.wave * 0.07);
  const s = run.assault;
  if (!s || s.wave !== run.wave || run.wave < 2) return base;
  const alive = living(run).length;
  if (alive === 0 || run.remaining <= 2) return Math.min(base, 0.55);
  if (s.breakAfterSpawn) return Math.min(2.2, base * 1.8 + 0.35);
  return Math.max(0.3, base * (run.time < s.reliefUntil ? 1.15 : 0.72));
}

/** Prefer a shared approach axis, while keeping every entrance physically safe. */
export function assaultSpawnScore(plan, position, prey, people, navigation) {
  let score = 0;
  if (plan) {
    const bearing = Math.atan2(
      position.x - prey.position.x,
      position.z - prey.position.z,
    );
    score += Math.cos(bearing - plan.bearing) * 2.5;
  }
  for (const person of people) {
    const dx = position.x - person.position.x,
      dz = position.z - person.position.z;
    const distance = Math.hypot(dx, dz);
    const forward =
      -dx * Math.sin(person.yaw || 0) - dz * Math.cos(person.yaw || 0);
    if (
      forward > distance * 0.35 &&
      navigation.clear(position, person.position, 0)
    )
      score -= distance < 20 ? 5 : 1.5;
  }
  return score;
}
