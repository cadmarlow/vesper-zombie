// Test-only observation of the deployed Game instance. This file is never bundled
// into the game. It changes only the isolated Playwright page, never the server.
export async function openGameAudit(page) {
  // VESPER_DEV_URL: a dev server on another port (the build is instrumented
  // only through VESPER_URL).
  const url =
    process.env.VESPER_URL ||
    process.env.VESPER_DEV_URL ||
    "http://localhost:5173";
  if (process.env.VESPER_RELAY)
    await page.addInitScript((relay) => {
      const Native = window.WebSocket;
      window.WebSocket = class extends Native {
        constructor(url, protocols) {
          super(/^wss?:/.test(String(url)) ? relay : url, protocols);
        }
      };
    }, process.env.VESPER_RELAY);
  await page.goto(url);
  if (!process.env.VESPER_URL) return;
  await page.evaluate(async () => {
    const manifest = await fetch("/.vite/manifest.json").then((r) => r.json());
    const chunk = manifest["src/game.js"]?.file;
    if (!chunk) throw new Error("Game entry missing from build manifest");
    const { Game } = await import("/" + chunk);
    const start = Game.prototype.start;
    Game.prototype.start = function (...args) {
      window.__vesper = this.debug();
      return start.apply(this, args);
    };
  });
}
