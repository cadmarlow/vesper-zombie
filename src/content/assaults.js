// Shared tuning and stable presentation codes. The simulation stays on the host.
export const ASSAULTS = {
  front: {
    firstWave: 1,
    roster: ["walker", "walker", "runner", "walker", "brute", "spitter"],
  },
  pincer: {
    firstWave: 4,
    roster: ["walker", "runner", "walker", "wraith", "runner", "brute"],
  },
  harry: {
    firstWave: 4,
    roster: ["walker", "spitter", "runner", "walker", "wraith", "spitter"],
  },
};
export const INTENT = { pursue: 0, intercept: 1, flank: 2, support: 3 };
export const TACTICS = {
  thinkInterval: 0.3,
  targetLock: 3.2,
  targetAdvantage: 3,
  leadSeconds: 0.85,
  maxLead: 3,
  interceptTime: 1.35,
  flankTime: 3.4,
  flankOffset: 4.5,
  maxTactical: 4,
  tacticalRange: 22,
  supportTime: 1.65,
  supportCooldown: 7,
  reliefTime: 2.5,
  cueCooldown: 4,
};
