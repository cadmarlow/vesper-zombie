import "./lacuna.css";

/** Lacuna's compact instrument panel consumes serializable map data only. */
export function createLacunaHUD(onDismiss = () => {}) {
  const panel = document.createElement("aside");
  panel.className = "lacuna-status hidden";
  panel.hidden = true;
  panel.setAttribute("aria-label", "État hydraulique de Lacuna");
  panel.innerHTML = `<div class="lacuna-status-head"><span>RÉSEAU HYDRAULIQUE</span><span class="lacuna-valves" aria-label="Vannes activées"><i></i><i></i><i></i></span></div><strong></strong><div class="lacuna-route"></div><div class="lacuna-meter"><i></i></div><div class="lacuna-guide"><b>↑</b><span></span></div>`;
  const close = document.createElement("button");
  close.className = "lacuna-close";
  close.type = "button";
  close.textContent = "×";
  close.setAttribute("aria-label", "Masquer les aides de LACUNA");
  close.title = "Masquer les aides · Réactivation dans les paramètres";
  close.onclick = () => {
    panel.hidden = true;
    onDismiss();
  };
  panel.append(close);
  document.body.append(panel);
  const title = panel.querySelector("strong"),
    route = panel.querySelector(".lacuna-route"),
    meter = panel.querySelector(".lacuna-meter i"),
    guide = panel.querySelector(".lacuna-guide span"),
    arrow = panel.querySelector(".lacuna-guide b"),
    dots = [...panel.querySelectorAll(".lacuna-valves i")];
  return (status, enabled = true) => {
    panel.hidden = !status || !enabled;
    if (panel.hidden) return;
    panel.dataset.phase = status.phase;
    panel.classList.toggle("in-danger", status.danger);
    title.textContent = status.danger
      ? "SORTEZ DE LA ZONE DE PURGE"
      : status.phase === 1
        ? status.waiting
          ? "LIBÉREZ LA PASSERELLE"
          : `PURGE DANS ${status.timer} S`
        : status.phase === 2
          ? `PURGE EN COURS · ${status.timer} S`
          : status.phase === 3
            ? "DÉPRESSURISATION"
            : !status.power
              ? "RÉTABLISSEZ LE COURANT"
              : status.armed
                ? `PROCHAINE PURGE · ${status.timer} S`
                : "PURGES AUTOMATIQUES · VAGUE 3";
    route.textContent =
      status.bell > 0
        ? `CARILLON · HORDE ATTIRÉE AU QUAI · ${status.bell} S`
        : status.phase === 1 || status.phase === 2
          ? `${status.zone} · PONTS EN PIERRE OUVERTS`
          : status.bridge
            ? "PASSERELLE EN RÉOUVERTURE"
            : "DEUX PONTS · PASSERELLE OUVERTE";
    meter.style.width = `${status.phase === 2 ? 100 : status.phase === 1 ? Math.max(5, (1 - status.timer / 12) * 100) : status.power && status.armed ? Math.max(2, (1 - status.timer / 90) * 100) : 0}%`;
    dots.forEach((dot, i) => dot.classList.toggle("active", i < status.used));
    panel
      .querySelector(".lacuna-valves")
      .setAttribute("aria-label", `${status.used} vannes activées sur 3`);
    guide.textContent = status.mastered
      ? "GRANDE DÉCRUE ACCOMPLIE"
      : `${status.guide} · ${status.distance} M`;
    arrow.hidden = status.mastered;
    arrow.style.display = status.mastered ? "none" : "block";
    arrow.style.transform = `rotate(${-status.bearing}rad)`;
  };
}
