// Blood thrown onto the view by close kills and torn limbs: painted splatters
// that land at once, run down a little and fade. DOM and CSS only, no WebGL
// pass; the few splatter images are drawn once per session.

const VARIANTS = 4;
let images = null;

function paint(seed) {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d");
  let state = seed * 9973 + 17;
  const random = () => (state = (state * 16807) % 2147483647) / 2147483647;
  const blob = (x, y, radius, alpha) => {
    g.beginPath();
    for (let i = 0; i <= 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const r = radius * (0.72 + random() * 0.5);
      const px = x + Math.cos(a) * r,
        py = y + Math.sin(a) * r;
      if (i) g.lineTo(px, py);
      else g.moveTo(px, py);
    }
    g.closePath();
    g.fillStyle = `rgba(${(62 + random() * 38) | 0}, 0, ${(random() * 5) | 0}, ${alpha})`;
    g.fill();
  };
  const cx = 128,
    cy = 112;
  blob(cx, cy, 40 + random() * 20, 0.94);
  blob(cx + (random() - 0.5) * 30, cy + (random() - 0.5) * 24, 26, 0.9);
  // Streaks thrown outward, each ending in a drop.
  g.lineCap = "round";
  for (let i = 0; i < 11; i++) {
    const a = random() * Math.PI * 2,
      from = 30 + random() * 20,
      to = from + 25 + random() * 60;
    g.strokeStyle = `rgba(95, 0, 0, ${0.6 + random() * 0.3})`;
    g.lineWidth = 1.5 + random() * 3.5;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * from, cy + Math.sin(a) * from);
    g.lineTo(cx + Math.cos(a) * to, cy + Math.sin(a) * to);
    g.stroke();
    blob(cx + Math.cos(a) * to, cy + Math.sin(a) * to, 2 + random() * 5, 0.9);
  }
  // Satellite droplets.
  for (let i = 0; i < 30; i++) {
    const a = random() * Math.PI * 2,
      d = 45 + random() * 75;
    blob(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1 + random() * 5, 0.85);
  }
  // Runs dripping down from the main splash.
  for (let i = 0; i < 5; i++) {
    const x = cx - 28 + random() * 56,
      top = cy + 10 + random() * 20,
      length = 25 + random() * 75;
    g.strokeStyle = "rgba(92, 0, 0, 0.88)";
    g.lineWidth = 3 + random() * 4;
    g.beginPath();
    g.moveTo(x, top);
    g.lineTo(x + (random() - 0.5) * 5, top + length);
    g.stroke();
    blob(x, top + length, 3 + random() * 3, 0.92);
  }
  return canvas.toDataURL("image/png");
}

/** Splash `strength` (0..1) worth of blood on the view, inside `layer`. */
export function splashScreen(layer, strength = 1) {
  if (!layer || typeof document === "undefined") return;
  images ||= Array.from({ length: VARIANTS }, (_, i) => paint(i + 1));
  const count = strength > 0.7 ? 2 : 1;
  for (let k = 0; k < count; k++) {
    const splat = document.createElement("div");
    splat.className = "screen-blood";
    splat.style.backgroundImage = `url(${images[Math.floor(Math.random() * VARIANTS)]})`;
    // Toward the edges: the crosshair stays readable.
    const side = Math.random() < 0.5 ? -1 : 1;
    splat.style.setProperty("--x", `${50 + side * (18 + Math.random() * 28)}%`);
    splat.style.setProperty("--y", `${22 + Math.random() * 46}%`);
    splat.style.setProperty(
      "--size",
      `${((22 + Math.random() * 20) * (0.7 + strength * 0.4)).toFixed(1)}vmin`,
    );
    splat.style.setProperty("--tilt", `${(Math.random() * 360) | 0}deg`);
    splat.style.setProperty("--alpha", (0.36 + strength * 0.36).toFixed(2));
    layer.append(splat);
    setTimeout(() => splat.remove(), 2700);
  }
  while (layer.querySelectorAll(".screen-blood").length > 4)
    layer.querySelector(".screen-blood").remove();
}
