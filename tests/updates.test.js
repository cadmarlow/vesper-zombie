import test from "node:test";
import assert from "node:assert/strict";
import { createUpdates } from "../src/app/updates.js";

test("release checks bypass the cache and share an in-flight request", async (t) => {
  let resolve;
  const changes = [];
  const fetch = t.mock.method(globalThis, "fetch", (_, options) => {
    assert.equal(options.cache, "no-store");
    return new Promise((done) => {
      resolve = done;
    });
  });
  const updates = createUpdates({
    version: "3.1.0",
    build: "old",
    onChange: (s) => changes.push(s),
  });
  const first = updates.check();
  assert.equal(updates.check(), first);
  resolve(Response.json({ version: "3.1.0", build: "new" }));
  await first;
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(updates.available, true);
  assert.equal(changes.at(-1).checking, false);
});
test("the current release needs no update", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ version: "3.1.0", build: "current" }),
  );
  const updates = createUpdates({
    version: "3.1.0",
    build: "current",
    onChange() {},
  });
  assert.equal(await updates.check(), null);
  assert.equal(updates.available, false);
});
test("an unavailable version endpoint does not erase a known update", async (t) => {
  let offline = false;
  t.mock.method(globalThis, "fetch", async () => {
    if (offline) throw new Error("offline");
    return Response.json({ version: "3.2.0", build: "new" });
  });
  let status;
  const updates = createUpdates({
    version: "3.1.0",
    build: "old",
    onChange(s) {
      status = s;
    },
  });
  await updates.check();
  offline = true;
  await updates.check();
  assert.equal(updates.available, true);
  assert.equal(status.error, true);
});
test("malformed release information is ignored", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ version: "<script>", build: "https://example.com" }),
  );
  let status;
  const updates = createUpdates({
    version: "3.1.0",
    build: "old",
    onChange(s) {
      status = s;
    },
  });
  await updates.check();
  assert.equal(updates.available, false);
  assert.equal(status.error, true);
});
