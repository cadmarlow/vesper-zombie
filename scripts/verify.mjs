import { spawn } from "node:child_process";
import fs from "node:fs";
import { createRelay } from "../server/index.js";
import { createStaticServer } from "./serve.mjs";

function run(args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: "inherit", env });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(args.join(" ") + ": exit " + code)),
    );
  });
}
await run([
  "node_modules/prettier/bin/prettier.cjs",
  "--check",
  "src",
  "server",
  "tests",
  "scripts",
  "index.html",
  "package.json",
  "vite.config.js",
]);
await run(["scripts/architecture-check.mjs"]);
await run([
  "--test",
  ...fs
    .readdirSync("tests")
    .filter((f) => f.endsWith(".test.js"))
    .map((f) => "tests/" + f),
]);
await run(["node_modules/vite/bin/vite.js", "build"]);

const server = createStaticServer();
const relay = createRelay({ port: 0, host: "127.0.0.1" });
try {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = await relay.ready;
  const env = {
    ...process.env,
    VESPER_URL: `http://127.0.0.1:${server.address().port}`,
    VESPER_RELAY: `ws://127.0.0.1:${address.port}`,
  };
  const requested = process.argv.slice(2).filter((arg) => arg !== "--full");
  const suites = requested.length
    ? requested
    : process.argv.includes("--full")
      ? []
      : [
          "menu-check",
          "updates-check",
          "smoke",
          "input-check",
          "supplies-check",
          "tonic-check",
          "pacing-check",
          "assault-check",
          "armory-check",
          "touch-native-check",
          "coop-check",
          "foundation-check",
          "stability-check",
          "crawler-check",
          "thermal-check",
          "waves-check",
        ];
  await run(["scripts/upgrade-check.mjs", ...suites], env);
} finally {
  await relay.close();
  await new Promise((resolve) => server.close(resolve));
}
