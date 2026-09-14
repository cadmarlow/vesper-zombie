import { defineConfig } from "vite";
import { readFileSync } from "node:fs";
const { version } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url)),
);
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
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
