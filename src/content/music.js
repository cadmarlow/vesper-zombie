export const MUSIC_TRACKS = [
  { id: "lumiere", title: "Tant qu’une lumière demeure" },
  { id: "derniere-charge", title: "La Dernière Charge" },
  { id: "cloches", title: "Les Cloches des Damnés" },
  { id: "ce-qui-reste", title: "Ce qui nous reste" },
  { id: "chair-acier", title: "Chair et Acier" },
];
export function chooseTrack(selection, previous, random = Math.random) {
  const chosen = MUSIC_TRACKS.find((track) => track.id === selection);
  if (chosen) return chosen;
  const candidates = MUSIC_TRACKS.filter((track) => track.id !== previous);
  return candidates[
    Math.min(candidates.length - 1, Math.floor(random() * candidates.length))
  ];
}
