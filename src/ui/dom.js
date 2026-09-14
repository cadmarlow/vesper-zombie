export const $ = (selector) => document.querySelector(selector);
export const $$ = (selector) => [...document.querySelectorAll(selector)];
export function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
}
export const formatTime = (t) =>
  String(Math.floor(t / 60)).padStart(2, "0") +
  ":" +
  String(Math.floor(t % 60)).padStart(2, "0");
export const icon = (name, cls = "") => {
  const shapes = {
    eclipse:
      '<circle cx="12" cy="12" r="8"/><path d="M12 1v5m0 12v5M1 12h5m12 0h5"/><path d="m8 8 4 10 4-10"/>',
    arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
    sound:
      '<path d="m4 9 5 0 5-4v14l-5-4H4zM17 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14"/>',
    gear: '<path d="m9 3 1-2h4l1 2 3 2 3 0 2 4-2 2v3l2 2-2 4h-3l-3 2h-5l-2-2H5l-2-4 2-2v-3L3 9l2-4h3z"/><circle cx="12.5" cy="12" r="3.5"/>',
    close: '<path d="m5 5 14 14M5 19 19 5"/>',
    skull:
      '<path d="M5 16C0 7 6 2 12 2s12 5 7 14l-3 1v5H8v-5z"/><path d="m8 10 2 2-3 1zm8 0-2 2 3 1zM10 18v4m4-4v4"/>',
    bolt: '<path d="m14 2-9 12h6l-1 8 9-12h-6z"/>',
    cross: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>',
    target:
      '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 1v5m0 12v5M1 12h5m12 0h5"/>',
    chevron: '<path d="m9 5 7 7-7 7"/>',
    shield:
      '<path d="m12 2 8 3v7c0 5-8 10-8 10S4 17 4 12V5z"/><path d="m8 12 3 3 5-6"/>',
    bullet: '<path d="M9 7 12 2l3 5v14H9zM9 16h6"/>',
    magazine: '<path d="M6 3h12l-1 18H7zM9 7h6m-6 4h6m-6 4h5"/>',
    knife: '<path d="m18 2-2 10-4 4-4-4zM6 14l4 4-4 4-4-4z"/>',
    grenade: '<path d="M10 7V3h6v3l4 3M9 8h7l3 5-1 7-6 2-6-3-1-6zM9 3H6v4"/>',
    jump: '<path d="m7 9 5-6 5 6m-5-6v14M5 21h14"/>',
    phone:
      '<rect x="5" y="3" width="14" height="18" rx="3"/><path d="M10 17h4m6-16 3 3-3 3M1 17l3 3-3 3"/>',
    fullscreen: '<path d="M3 9V3h6m6 0h6v6m0 6v6h-6m-6 0H3v-6"/>',
    run: '<circle cx="15" cy="4" r="2"/><path d="m12 8 4 4 4 1M12 8l-4 4-4-1m8-3-1 7 5 3 2 4m-7-7-4 5H3"/>',
    crouch:
      '<circle cx="13" cy="4" r="2"/><path d="m12 8-4 5 7 2-2 6h6m-7-13 4 4 5 1M8 13l-4 3 3 5"/>',
    radio:
      '<path d="M7 10h10v11H7zM9 14h6m-6 4h4M9 10V5m6 2V3M4 3c-3 3-3 6 0 9m16-9c3 3 3 6 0 9"/>',
  };
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[name] || shapes.eclipse}</svg>`;
};
