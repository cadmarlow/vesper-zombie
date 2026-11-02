import { spawn } from "node:child_process";
import fs from "node:fs";

// Run against the actual distribution. Keep GPU tests sequential for meaningful results.
const scripts = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      "menu-check",
      "updates-check",
      "smoke",
      "input-check",
      "pacing-check",
      "assault-check",
      "armory-check",
      "feel-check",
      "touch-native-check",
      "release-check",
      "waves-check",
      "online-check",
      "coop-check",
      "foundation-check",
      "stability-check",
      "graphics-lifecycle-check",
      "thermal-check",
      "zombie-check",
      "locomotion-check",
      "abyss-check",
      "remaster-check",
      "blood-check",
      "crawler-check",
    ];
const allowed = new Set([
  "updates-check",
  "foundation-check",
  "stability-check",
  "coop-check",
  "abyss-check",
  "menu-check",
  "zombie-check",
  "locomotion-check",
  "visual-check",
  "smoke",
  "input-check",
  "pacing-check",
  "assault-check",
  "armory-check",
  "feel-check",
  "touch-native-check",
  "release-check",
  "waves-check",
  "online-check",
  "graphics-lifecycle-check",
  "thermal-check",
  "remaster-check",
  "blood-check",
  "crawler-check",
  "lacuna-check",
]);
const report = {
  started: new Date().toISOString(),
  node: process.version,
  url: process.env.VESPER_URL || "http://localhost:4173",
  suites: [],
};
for (const script of scripts) {
  if (!allowed.has(script))
    throw new Error(`Unknown verification suite: ${script}`);
  console.log(`Running ${script}`);
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [`scripts/${script}.mjs`], {
      stdio: "inherit",
      env: { ...process.env, VESPER_URL: report.url },
    });
    child.on("error", reject);
    child.on("exit", resolve);
  });
  report.suites.push({ script, exitCode: code });
  if (code !== 0) {
    process.exitCode = code || 1;
    break;
  }
}
fs.mkdirSync("artifacts", { recursive: true });
fs.writeFileSync(
  `artifacts/upgrade-${Date.now()}.json`,
  JSON.stringify(report, null, 2),
);
