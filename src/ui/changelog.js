import { RELEASES } from "../content/changelog.js";
import { escapeHtml, icon } from "./dom.js";

// Release notes: the journal panel, the one-time "what's new" card after an
// update, and the version the player has already seen.
const SEEN_KEY = "vesper-seen-version";
const MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];
const formatDate = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d === 1 ? "1er" : d} ${MONTHS[m - 1]} ${y}`;
};
const read = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

export const currentRelease = () => RELEASES[0];

/**
 * What the player has not seen yet. A fresh install has nothing to catch up
 * on: only players who played an earlier version get the card.
 */
export function unseenRelease(version) {
  const seen = read(SEEN_KEY);
  if (seen === version) return null;
  const returning =
    seen !== null || read("vesper-save") !== null || read("vesper-settings");
  if (!returning) {
    markSeen(version);
    return null;
  }
  return RELEASES.find((r) => r.version === version) || null;
}
export function markSeen(version) {
  try {
    localStorage.setItem(SEEN_KEY, version);
  } catch {}
}

/** The card shown once on the menu after an update. */
export function whatsNewCard(release) {
  return `<div class="whats-new-art" style="background-image:url(${release.art})"></div><div class="whats-new-copy"><span class="eyebrow">${icon("bolt")} NOUVEAU · VERSION ${release.version}</span><h3>${escapeHtml(release.title)}</h3><p>${escapeHtml(release.tagline)}</p><ul>${release.highlights
    .slice(0, 3)
    .map((h) => `<li>${escapeHtml(h)}</li>`)
    .join(
      "",
    )}</ul><div class="whats-new-actions"><button class="primary-button" id="whats-new-open">VOIR LES NOUVEAUTÉS ${icon("arrow")}</button><button class="text-button" id="whats-new-close">PLUS TARD</button></div></div>`;
}

/** Update status block: where the player follows what is coming. */
function followBlock(version, status) {
  const latest = status.latest;
  const line = status.checking
    ? "Recherche d’une nouvelle version…"
    : latest
      ? `<b>Vesper ${escapeHtml(latest.version)}${latest.title ? ` · ${escapeHtml(latest.title)}` : ""}</b> est disponible.`
      : status.error
        ? "Vérification impossible pour le moment. Réessayez avec une connexion."
        : "Vous jouez à la dernière version.";
  const upcoming =
    latest?.highlights?.length && latest.version !== version
      ? `<ul class="changelog-upcoming">${latest.highlights
          .slice(0, 4)
          .map((h) => `<li>${escapeHtml(h)}</li>`)
          .join("")}</ul>`
      : "";
  return `<section class="changelog-follow${latest ? " has-update" : ""}"><div class="changelog-follow-status"><span class="live-dot"></span><div><span class="tiny">VOTRE VERSION · v${escapeHtml(version)}</span><p id="changelog-status">${line}</p>${upcoming}</div></div><div class="changelog-follow-actions">${latest ? `<button class="primary-button" id="changelog-update">METTRE À JOUR ${icon("arrow")}</button>` : `<button class="secondary-button" id="changelog-check">VÉRIFIER</button>`}</div><p class="changelog-follow-note">Le jeu cherche seul les nouvelles versions à chaque retour au menu. Dès qu’une mise à jour sort, ses nouveautés s’affichent ici et en bas de l’écran, sans jamais interrompre une partie.</p></section>`;
}

function releaseCard(release, index, version) {
  const current = release.version === version;
  return `<article class="release${index === 0 ? " release-lead" : ""}"><header>${index === 0 ? `<div class="release-art" style="background-image:url(${release.art})"></div>` : ""}<div class="release-head"><span class="release-version">v${release.version}</span>${current ? `<span class="release-current">VOTRE VERSION</span>` : ""}<time datetime="${release.date}">${formatDate(release.date)}</time></div><h3>${escapeHtml(release.title)}</h3><p class="release-tagline">${escapeHtml(release.tagline)}</p><ul class="release-highlights">${release.highlights
    .map((h) => `<li>${escapeHtml(h)}</li>`)
    .join(
      "",
    )}</ul></header><details${index === 0 ? " open" : ""}><summary>${index === 0 ? "TOUS LES CHANGEMENTS" : "DÉTAILS"} ${icon("chevron")}</summary>${release.sections
    .map(
      (s) =>
        `<section><h4>${escapeHtml(s.title)}</h4><ul>${s.items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul></section>`,
    )
    .join("")}</details></article>`;
}

export function changelogPanel(version, status) {
  return `<div class="eyebrow">JOURNAL DES VERSIONS</div><h2>Ce qui a changé.</h2><p class="panel-description">Chaque nuit, Vesper grandit. Voici tout ce qui a changé, version après version.</p>${followBlock(version, status)}<div class="release-list">${RELEASES.map(
    (r, i) => releaseCard(r, i, version),
  ).join("")}</div>`;
}

/** Only the status line, refreshed while the panel stays open. */
export function changelogStatusBlock(version, status) {
  return followBlock(version, status);
}
