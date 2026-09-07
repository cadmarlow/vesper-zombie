import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../dist",
);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
};
let port = Number(process.env.VESPER_PORT || 4173);
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const pathname = decodeURIComponent(url.pathname);
    const file = path.resolve(
      root,
      "." + (pathname === "/" ? "/index.html" : pathname),
    );
    if (file !== root && !file.startsWith(root + path.sep)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    const info = await stat(file);
    if (!info.isFile()) throw Error("Not a file");
    const data = await readFile(file);
    res.writeHead(200, {
      "Content-Type": mime[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Fichier introuvable. Lancez npm run build si nécessaire.");
  }
});
server.on("error", (error) => {
  if (error.code === "EADDRINUSE" && port < 4200) {
    port++;
    server.listen(port, "127.0.0.1");
  } else {
    console.error(error);
    process.exitCode = 1;
  }
});
server.on("listening", () => {
  const url = `http://localhost:${port}`;
  console.log(
    `\nVESPER — Les derniers vivants\n${url}\n\nGardez cette fenêtre ouverte pendant la partie. Ctrl+C pour arrêter.\n`,
  );
  if (process.argv.includes("--open")) {
    const command =
      process.platform === "darwin"
        ? "open"
        : process.platform === "win32"
          ? "cmd"
          : "xdg-open";
    const args =
      process.platform === "win32" ? ["/c", "start", "", url] : [url];
    spawn(command, args, { stdio: "ignore" }).on("error", () =>
      console.log(`Ouvrez ${url} dans votre navigateur.`),
    );
  }
});
server.listen(port, "127.0.0.1");
