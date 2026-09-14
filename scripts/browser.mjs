import { existsSync } from "node:fs";

const macChrome =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
// Let Playwright select its supported headless shell in CI and on Linux.
export const chromiumOptions = {
  executablePath:
    process.env.CHROME_PATH ||
    (!process.env.CI && existsSync(macChrome) ? macChrome : undefined),
};
