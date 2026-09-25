import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { RELEASES } from "../src/content/changelog.js";

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));

test("the newest release notes describe the packaged version", () => {
  assert.equal(RELEASES[0].version, pkg.version);
});

test("release notes are complete, unique and newest first", () => {
  const seen = new Set();
  const key = (v) =>
    v
      .split(".")
      .map((n) => n.padStart(4, "0"))
      .join(".");
  for (const [i, r] of RELEASES.entries()) {
    assert.match(r.version, /^\d+\.\d+\.\d+$/);
    assert.ok(!seen.has(r.version), `duplicate ${r.version}`);
    seen.add(r.version);
    assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(r.title && r.tagline && r.art);
    assert.ok(r.highlights.length >= 1);
    assert.ok(r.sections.every((s) => s.title && s.items.length));
    if (i) {
      assert.ok(key(RELEASES[i - 1].version) > key(r.version));
      assert.ok(RELEASES[i - 1].date >= r.date);
    }
  }
});
