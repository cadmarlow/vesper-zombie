import { DEFAULT_SETTINGS } from "../content/defaults.js";
import { MUSIC_TRACKS } from "../content/music.js";
const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value);
export function readSettings(storage) {
  const settings = { ...DEFAULT_SETTINGS };
  let saved;
  try {
    saved = JSON.parse((storage || localStorage).getItem("vesper-settings"));
  } catch {
    return settings;
  }
  if (!object(saved)) return settings;
  const ranges = {
    volume: [0, 1],
    musicVolume: [0, 1],
    sensitivity: [0.2, 3],
    touchSensitivity: [0.4, 2.2],
    fov: [65, 105],
  };
  const choices = {
    musicTrack: ["random", ...MUSIC_TRACKS.map((track) => track.id)],
    quality: ["low", "medium", "high"],
    layout: ["azerty", "qwerty"],
    frameRate: [30, 60],
  };
  for (const [key, value] of Object.entries(saved)) {
    if (ranges[key] && Number.isFinite(value))
      settings[key] = Math.max(ranges[key][0], Math.min(ranges[key][1], value));
    else if (choices[key]?.includes(value)) settings[key] = value;
    else if (
      typeof DEFAULT_SETTINGS[key] === "boolean" &&
      typeof value === "boolean"
    )
      settings[key] = value;
  }
  return settings;
}
export function readSave() {
  try {
    const value = JSON.parse(localStorage.getItem("vesper-save"));
    if (!object(value)) return {};
    const records = object(value.records)
      ? Object.fromEntries(
          Object.entries(value.records).filter(
            ([, record]) =>
              object(record) &&
              [record.wave, record.kills, record.time].every(
                (n) => Number.isFinite(n) && n >= 0,
              ),
          ),
        )
      : {};
    return {
      ...value,
      records,
      totalKills: Number.isFinite(value.totalKills) ? value.totalKills : 0,
      runs: Number.isFinite(value.runs) ? value.runs : 0,
    };
  } catch {
    return {};
  }
}
export function saveRecord(record) {
  const old = readSave();
  const key = record.map;
  const previous = old.records?.[key];
  const best =
    !previous ||
    record.wave > previous.wave ||
    (record.wave === previous.wave && record.kills > previous.kills);
  const data = {
    ...old,
    totalKills: (old.totalKills || 0) + record.kills,
    runs: (old.runs || 0) + 1,
    records: { ...old.records, [key]: best ? record : previous },
  };
  try {
    localStorage.setItem("vesper-save", JSON.stringify(data));
  } catch {}
  return data;
}
