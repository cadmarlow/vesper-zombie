// Test-only observation of the deployed Game instance. This file is never bundled
// into the game. It changes only the isolated Playwright page, never the server.
export async function openGameAudit(page) {
  const url = process.env.VESPER_URL || "http://localhost:5173";
  await page.goto(url);
  if (!process.env.VESPER_URL) return;
  await page.evaluate(async () => {
    const entry = document.querySelector('script[type="module"][src]').src;
    const source = await fetch(entry).then((response) => response.text());
    const chunk = source.match(/(?:\.\/|\/assets\/)game-[\w-]+\.js/)?.[0];
    if (!chunk) throw new Error("Cannot locate the deployed game module");
    const { Game } = await import(new URL(chunk, entry).href);
    const start = Game.prototype.start;
    Game.prototype.start = function (...args) {
      window.__vesper = this;
      return start.apply(this, args);
    };
  });
}
