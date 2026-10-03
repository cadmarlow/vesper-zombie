import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium, webkit, devices, expect } from "@playwright/test";
import { chromiumOptions } from "./browser.mjs";
import { createStaticServer } from "./serve.mjs";

// Exercise real taps and wait through multiple HUD refreshes: an immediate
// visibility assertion misses a dismissed panel that reappears next frame.
const out = `artifacts/lacuna-hints-${Date.now()}`;
fs.mkdirSync(out, { recursive: true });
const server = process.env.VESPER_URL ? null : createStaticServer();
if (server)
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
const url =
  process.env.VESPER_URL || `http://127.0.0.1:${server.address().port}`;
const report = { url, checks: [], errors: [] };
let browser, page;
function check(name, value) {
  assert(value, name);
  report.checks.push(name);
  console.log("PASS", name);
}
try {
  for (const mobile of [true, false]) {
    const name = mobile ? "WebKit iPhone 14" : "Chrome desktop";
    browser = await (mobile ? webkit : chromium).launch({
      headless: true,
      ...(mobile
        ? {}
        : {
            ...chromiumOptions,
            args: ["--enable-webgl", "--ignore-gpu-blocklist"],
          }),
    });
    page = await browser.newPage(
      mobile
        ? devices["iPhone 14 landscape"]
        : { viewport: { width: 1440, height: 900 } },
    );
    page.on("pageerror", (error) => report.errors.push(error.message));
    const press = (selector) =>
      mobile ? page.locator(selector).tap() : page.locator(selector).click();
    const pause = () =>
      mobile ? press("#hud-pause") : page.keyboard.press("Escape");
    const panel = page.locator(".lacuna-status");
    const toggle = page.locator("#setting-lacunaHints");
    const stored = () =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem("vesper-settings")).lacunaHints,
      );
    const remainsHidden = async () => {
      await expect(panel).toBeHidden();
      await page.waitForTimeout(700);
      check(
        `${name}: stays hidden across HUD refreshes`,
        await panel.isHidden(),
      );
    };
    await page.goto(url);
    await press("#settings-button");
    check(`${name}: settings default to ON`, await toggle.isChecked());
    await press("#close-panel");
    await press('[data-map="lacuna"]');
    await press("#play-button");
    await expect(panel).toBeVisible({ timeout: 90000 });
    if (!mobile) await pause();
    await press(".lacuna-close");
    if (!mobile) await press("#resume-button");
    await remainsHidden();
    check(`${name}: cross saves OFF`, (await stored()) === false);
    await pause();
    await press("#pause-settings");
    check(`${name}: cross unchecks settings`, !(await toggle.isChecked()));
    await press("#setting-lacunaHints + span");
    check(
      `${name}: ON restores the panel immediately while paused`,
      (await toggle.isChecked()) && (await panel.isVisible()),
    );
    await press("#setting-lacunaHints + span");
    check(
      `${name}: OFF hides the panel immediately while paused`,
      !(await toggle.isChecked()) && (await panel.isHidden()),
    );
    await press("#close-panel");
    await press("#resume-button");
    await remainsHidden();
    await pause();
    await press("#pause-settings");
    await press("#reset-settings");
    check(
      `${name}: reset defaults restores ON and the panel`,
      (await toggle.isChecked()) &&
        (await panel.isVisible()) &&
        (await stored()) === true,
    );
    await press("#setting-lacunaHints + span");
    await page.reload();
    await press("#settings-button");
    check(`${name}: OFF survives reload`, !(await toggle.isChecked()));
    await press("#close-panel");
    await press('[data-map="lacuna"]');
    await press("#play-button");
    await page.locator("#hud:not(.hidden)").waitFor({ timeout: 90000 });
    await remainsHidden();
    await pause();
    await press("#quit-button");
    await press("#confirm-quit");
    await press("#settings-button");
    await press("#reset-settings");
    check(
      `${name}: resetting in the menu keeps the inactive HUD hidden`,
      (await toggle.isChecked()) && (await panel.isHidden()),
    );
    await browser.close();
    browser = null;
  }
  check("No browser errors", report.errors.length === 0);
} catch (error) {
  await page?.screenshot({ path: `${out}/failure.png` }).catch(() => {});
  throw error;
} finally {
  fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  console.log("REPORT", out);
}
