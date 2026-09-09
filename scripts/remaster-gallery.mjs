import fs from "node:fs";
import { fileURLToPath } from "node:url";
const { version } = JSON.parse(
  fs.readFileSync(new URL("../package.json", import.meta.url)),
);

export function writeRemasterGallery(report) {
  const out = report.out;
  const maps = {
    abbey: "Abbaye des Cendres",
    station: "Complexe Boréal",
    abyss: "Jardins Abyssaux",
  };
  const captures = Object.entries(maps).flatMap(([map, name]) =>
    [false, true].flatMap((mobile) =>
      [false, true].map((horde) => ({
        path: `${map}-${mobile ? "mobile" : "desktop"}${horde ? "-horde-settled" : ""}.png`,
        caption: `${name} · ${mobile ? "Mobile émulé" : "Ordinateur"}${horde ? " · 28 ennemis" : " · Décor"}`,
      })),
    ),
  );
  fs.writeFileSync(
    `${out}/gallery.html`,
    `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>VESPER ${version} · Captures du jeu</title><style>
    *{box-sizing:border-box}body{margin:0;background:#10171b;color:#e4e7dc;font:16px/1.6 system-ui,sans-serif}main{max-width:1500px;margin:auto;padding:48px 24px}h1{font-size:clamp(28px,5vw,56px);line-height:1.1;margin:0 0 24px}p{max-width:880px;color:#b8c2c0}a{color:#dfb589}small{letter-spacing:.16em;color:#dfb589}section{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px;margin-top:40px}figure{margin:0;background:#192328;border:1px solid #2d3b40}img{display:block;width:100%;height:auto}figcaption{padding:14px 18px}table{width:100%;border-collapse:collapse;margin-top:28px;font-size:14px}th,td{padding:10px;text-align:left;border-bottom:1px solid #2d3b40}th{color:#dfb589}.scroll{overflow-x:auto}@media(max-width:780px){section{grid-template-columns:1fr}main{padding:30px 16px}}
    </style><main><small>VESPER · VERSION ${version}</small><h1>Les trois lieux, dans le jeu.</h1>
    <p>Captures du rendu WebGL réel, avec textures et modèles de la compilation locale. Les portes et l’électricité sont activées pour inspecter les décors. La horde est préparée avec 28 ennemis de cinq types. Cliquer sur une image ouvre sa pleine résolution.</p>
    <p>Mesures sur ce Mac, après 12 secondes de charge en qualité élevée, résolution adaptative active. Les mobiles sont émulés : ces résultats ne mesurent ni la chauffe ni la vitesse d’un téléphone physique. <a href="report.json">Rapport brut</a> · ${report.checks.length} contrôles · ${report.errors.length} erreur(s).</p>
    <div class="scroll"><table><thead><tr><th>Carte</th><th>Profil</th><th>Qualité</th><th>Images/s médianes</th><th>95e percentile</th><th>Ratio de rendu</th></tr></thead><tbody>${report.scenes
      .filter((s) => s.fps)
      .map(
        (s) =>
          `<tr><td>${maps[s.map]}</td><td>${s.mobile ? "Mobile émulé" : "Ordinateur"}</td><td>${{ high: "Élevée", medium: "Équilibrée", low: "Performance" }[s.quality]}</td><td>${s.fps}</td><td>${s.p95} ms</td><td>${s.ratio.toFixed(2)}×</td></tr>`,
      )
      .join("")}</tbody></table></div>
    <section>${captures
      .filter((c) => fs.existsSync(`${out}/${c.path}`))
      .map(
        (c) =>
          `<figure><a href="${c.path}"><img src="${c.path}" alt="${c.caption}" loading="lazy"></a><figcaption>${c.caption}</figcaption></figure>`,
      )
      .join("")}</section></main></html>`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = process.argv[2];
  if (!path)
    throw new Error(
      "Usage: node scripts/remaster-gallery.mjs artifacts/remaster-.../report.json",
    );
  writeRemasterGallery(JSON.parse(fs.readFileSync(path, "utf8")));
}
