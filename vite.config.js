import { defineConfig } from "vite";
import { readFileSync } from "node:fs";
import { RELEASES } from "./src/content/changelog.js";
const { version } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url)),
);
const build = process.env.VERCEL_GIT_COMMIT_SHA || `local-${Date.now()}`;
// The newest notes travel with the version so an open game can announce
// what an update brings before reloading.
const notes = RELEASES.find((r) => r.version === version);
const release = JSON.stringify({
  version,
  build,
  ...(notes && { title: notes.title, highlights: notes.highlights }),
});
export default defineConfig({
  // Local audit worktrees can contain different Three.js versions. Only scan
  // this app and the horde labs, never archived HTML under artifacts/.
  optimizeDeps: {
    entries: [
      "index.html",
      "scripts/horde/lab.html",
      "scripts/horde/live.html",
    ],
  },
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __BUILD_ID__: JSON.stringify(build),
  },
  plugins: [
    {
      name: "release-version",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "version.json",
          source: release,
        });
      },
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.split("?")[0] !== "/version.json") return next();
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.end(release);
        });
      },
    },
  ],
  build: {
    manifest: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: "three-core", test: /node_modules\/three\/build/ },
            { name: "three-effects", test: /node_modules\/three\/examples/ },
          ],
        },
      },
    },
  },
});
