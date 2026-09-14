import { chromium, webkit } from "@playwright/test";
import { chromiumOptions } from "./browser.mjs";
import { openGameAudit } from "./game-audit.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";

const url = process.env.VESPER_URL || "http://localhost:4173";
const releaseResponse = await fetch(new URL("/version.json", url));
assert.match(releaseResponse.headers.get("cache-control"), /no-store/);
const current = await releaseResponse.json();
const out = `artifacts/updates-${Date.now()}`;
fs.mkdirSync(out, { recursive: true });
const report = { version: current.version, checks: [], errors: [] };
for (const touch of [false, true]) {
  const browser = touch
    ? await webkit.launch({ headless: true })
    : await chromium.launch({ headless: true, ...chromiumOptions });
  const label = touch ? "WebKit tactile" : "Chrome";
  const check = (message, condition) => {
    assert(condition, message);
    report.checks.push(`${label}: ${message}`);
    console.log("PASS", label, message);
  };
  try {
    const page = await browser.newPage({
      viewport: touch
        ? { width: 844, height: 390 }
        : { width: 1280, height: 720 },
      isMobile: touch,
      hasTouch: touch,
    });
    page.on("pageerror", (e) => report.errors.push(e.message));
    let available = current;
    let unavailable = false;
    await page.route("**/version.json", (route) =>
      route.fulfill({ status: unavailable ? 503 : 200, json: available }),
    );
    await openGameAudit(page);
    await page.evaluate(() =>
      localStorage.setItem("update-proof", "saved-settings"),
    );
    for (const size of touch
      ? [
          { width: 320, height: 568 },
          { width: 568, height: 320 },
          { width: 844, height: 390 },
        ]
      : [{ width: 1280, height: 720 }]) {
      await page.setViewportSize(size);
      const version = page.locator(".menu-footer .app-version");
      await version.scrollIntoViewIfNeeded();
      check(
        `version visible at ${size.width}×${size.height}`,
        (await version.isVisible()) &&
          (await version.innerText()) === `v${current.version}`,
      );
      check(
        "version does not create horizontal overflow",
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
    }
    if (touch) await page.locator("#play-button").tap();
    else await page.click("#play-button");
    await page.waitForFunction(() => window.__vesper?.state === "playing");
    await page.evaluate(() => {
      window.__vesper.phaseTimer = 9000;
      window.__vesper.player.invulnerable = 1e9;
    });
    available = { version: "3.2.0", build: "test-next-release" };
    await page.evaluate(() =>
      window.dispatchEvent(
        new PageTransitionEvent("pageshow", { persisted: true }),
      ),
    );
    await page.waitForFunction(() =>
      document.querySelector("#update-message").textContent.includes("3.2.0"),
    );
    check(
      "a resumed app detects a new release without interrupting play",
      await page.evaluate(
        () =>
          window.__vesper.state === "playing" &&
          document.querySelector("#update-notice").hidden,
      ),
    );
    if (touch) await page.locator("#hud-pause").tap();
    else await page.keyboard.press("Escape");
    await page.waitForSelector("#pause:not(.hidden)");
    check(
      "version remains visible in pause",
      await page.locator("#pause .build-version").isVisible(),
    );
    await page.click("#pause-settings");
    check(
      "settings defer the update until the menu",
      (await page.locator("#update-check-status").innerText()).includes(
        "retour au menu",
      ),
    );
    await page.click("#close-panel");
    await page.click("#quit-button");
    await page.click("#confirm-quit");
    await page.locator("#update-notice").waitFor({ state: "visible" });
    await page.screenshot({
      path: `${out}/${touch ? "mobile" : "desktop"}-update.png`,
    });
    // The navigation simulates obtaining the newly published page.
    available = current;
    await page.click("#update-now");
    await page.waitForURL(/updated=test-next-release/);
    check(
      "update navigates once and preserves saved data",
      await page.evaluate(
        () => localStorage.getItem("update-proof") === "saved-settings",
      ),
    );
    // A deploy between opening the menu and pressing Play is also caught.
    await page.waitForSelector("#play-button");
    available = { version: "3.2.1", build: "test-before-launch" };
    await page.click("#play-button");
    await page.waitForURL(/updated=test-before-launch/);
    check(
      "an obsolete page updates before starting a new game",
      await page
        .locator("#hud")
        .evaluate((el) => el.classList.contains("hidden")),
    );
    available = current;
    unavailable = true;
    await page.reload();
    await page.click("#settings-button");
    await page.click("#check-update");
    await page.waitForFunction(() =>
      document
        .querySelector("#update-check-status")
        .textContent.includes("impossible"),
    );
    check(
      "an unavailable update endpoint leaves the menu usable",
      await page.locator("#close-panel").isVisible(),
    );
    check("no JavaScript errors", report.errors.length === 0);
  } catch (error) {
    report.failure = error.stack;
    throw error;
  } finally {
    await browser.close();
    fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
  }
}
console.log(out);
