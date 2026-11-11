import { WEAPONS } from "../content/weapons.js";
import { RELIQUARY } from "../content/reliquary.js";
import { escapeHtml } from "./dom.js";
import "./reliquary.css";

/** Contextual, data-only panel. Its progress updates never rebuild the content. */
export function createReliquaryHUD() {
  const panel = document.createElement("section");
  panel.id = "reliquary-card";
  panel.className = "reliquary-card hidden";
  panel.setAttribute("aria-label", "Le Reliquaire");
  panel.innerHTML = `<div class="reliquary-heading"><span class="reliquary-emblem" aria-hidden="true">IX</span><div><span>DIVISION DES PHÉNOMÈNES</span><b>LE RELIQUAIRE</b></div><span class="reliquary-index">IX / 950</span></div><div class="reliquary-content" aria-live="polite" aria-atomic="true"></div><div class="reliquary-meter"><i></i></div><div class="reliquary-footer"><span></span><b></b></div>`;
  const feedback = document.querySelector(".hud-feedback");
  feedback.insertBefore(panel, document.querySelector("#interaction"));
  const content = panel.querySelector(".reliquary-content");
  const fill = panel.querySelector(".reliquary-meter i");
  const footer = panel.querySelector(".reliquary-footer span");
  const number = panel.querySelector(".reliquary-footer b");
  let last = "";
  return (data) => {
    panel.classList.toggle("hidden", !data);
    feedback.classList.toggle("has-reliquary", !!data);
    if (!data) return;
    const weapon = WEAPONS[data.weapon];
    const accent = weapon ? RELIQUARY.colors[weapon.rarity] : 0xd3ba8a;
    panel.style.setProperty(
      "--relic-color",
      `#${accent.toString(16).padStart(6, "0")}`,
    );
    panel.dataset.phase = data.phase;
    panel.classList.toggle(
      "is-expiring",
      data.phase === "offered" && data.remaining <= 5,
    );
    const signature = [
      data.phase,
      data.weapon,
      data.replaces,
      data.affordable,
    ].join("/");
    if (signature !== last) {
      last = signature;
      if (weapon) {
        content.innerHTML = `<div class="reliquary-rarity"><i></i>${escapeHtml(weapon.rarity)}<span>${escapeHtml(weapon.class)}</span></div><h3>${escapeHtml(weapon.name)}</h3><p>${escapeHtml(weapon.description)}</p><div class="reliquary-specs"><span><b>${weapon.damage}${weapon.pellets > 1 ? ` × ${weapon.pellets}` : ""}</b>DÉGÂTS</span><span><b>${weapon.mag}</b>CHARGEUR</span><span><b>${weapon.reserve}</b>RÉSERVE</span></div><div class="reliquary-exchange">${data.replaces ? `Remplace <b>${escapeHtml(WEAPONS[data.replaces].name)}</b>` : "Rejoint votre emplacement libre"}</div>`;
      } else if (data.phase === "idle") {
        content.innerHTML = `<div class="reliquary-rarity">CONTENANCE INCONNUE</div><h3>Un pacte avec le hasard.</h3><p>Une arme. Une chance de renverser la nuit.</p><div class="reliquary-odds"><span>RARE</span><span>ÉPIQUE</span><span>LÉGENDAIRE</span></div>`;
      } else {
        const stages = {
          awakening: ["01", "Rupture des sceaux", "Quelque chose s’éveille."],
          cycling: ["02", "Convergence", "Les possibles se bousculent."],
          binding: [
            "03",
            "Le dernier battement",
            "Le hasard s’apprête à répondre.",
          ],
        };
        const [n, title, description] = stages[data.phase];
        content.innerHTML = `<div class="reliquary-rarity">SÉQUENCE ${n} / 03</div><h3>${title}</h3><p>${description}</p><div class="reliquary-stages" aria-hidden="true">${["01", "02", "03"].map((id) => `<i class="${id <= n ? "lit" : ""}"></i>`).join("")}</div>`;
      }
    }
    fill.style.transform = `scaleX(${Math.max(0, Math.min(1, data.progress))})`;
    footer.textContent = weapon
      ? data.remaining <= 5
        ? "LE VIDE RAPPELLE SON DÛ"
        : "ARME À RÉCLAMER"
      : data.phase === "idle"
        ? data.affordable
          ? "OFFRANDE REQUISE"
          : "ESSENCES INSUFFISANTES"
        : "PACTE EN COURS";
    number.textContent = weapon
      ? `${data.remaining} s`
      : data.phase === "idle"
        ? `${data.cost} ESSENCES`
        : `${Math.round(data.progress * 100)} %`;
  };
}
