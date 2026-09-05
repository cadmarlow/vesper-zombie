# VESPER — Asset provenance

All gameplay geometry, materials, texture patterns, rigs, animations, particle systems, UI symbols and audio synthesis were authored for this project. No Call of Duty asset, map, logo or audio sample is included.

## Original key art

Generated using the built-in imagegen tool, then copied into this workspace. These illustrations are menu artwork; the playable maps are rendered by Three.js from the authored geometry in `src/world.js`.

- `public/art/abbey.png`
- `public/art/station.png`

### Abbey prompt

Use case: stylized-concept. Asset type: original premium dark survival videogame key art, 16:9 wide cinematic background for VESPER. A haunting ruined French gothic abbey at night, brutalist occult architecture mixed with ancient cathedral, a huge blood-red solar eclipse suspended over the broken nave in dense storm clouds. Foreground right: three detailed undead silhouettes in torn military coats with tiny ember eyes, imposing but not close, standing in wet courtyard reflecting ember-orange candles and moonlight. Center-right: large pointed gothic arch and towering columns, shattered rose window glowing faint red. Left third relatively dark atmospheric negative space for menu typography. Desaturated blue slate, black stone, pale moonlit fog, restrained fiery orange accents. Ultra detailed painted photorealistic game concept art, volumetric haze, rain, dust, film grain, beautiful architectural scale, eerie sophisticated art direction, dramatic chiaroscuro. No text, no logos, no watermark, no UI, no modern firearms visible. Landscape image.

### Station prompt

Use case: stylized-concept. Asset type: original premium survival video game map key art, wide landscape 16:9. A vast abandoned secret arctic research station at night, 1980s retrofuturistic brutalist concrete and ribbed steel buildings in heavy snow. Center-right enormous circular reactor apparatus with glowing turquoise rings and bright cyan column of energy, seen through a tall open industrial arch. Pipes, gangways, frost coated steel, warning lamps amber orange, an antenna radar dome above. A few ominous humanoid undead silhouettes in the foreground. Beautiful aurora borealis in deep navy sky, majestic polar mountains. Left third dark negative space for a game menu. Photorealistic cinematic concept painting, sophisticated moody lighting, volumetric fog, detailed wet and icy surfaces, cold muted blue palette and luminous turquoise accents. No text, no logos, no watermark, no UI. Landscape.

## Fonts and engine

Barlow, Barlow Condensed and Rajdhani are bundled locally through Fontsource under their SIL Open Font License. Three.js uses the MIT license. See `public/licenses/` for included notices. The soundscape uses Web Audio synthesis, without downloaded samples.

## Version 1.1.0 additions

- `src/music.js`: original procedural scores **Office des absents** (abbey) and **Fréquence sous la glace** (station). An eight-bar motif at 62.5 BPM, detuned synthesized string pads, additive prepared bells, a sub pulse reacting to waves and a generated stereo convolution reverb. All notes, envelopes and variations are authored here; no third-party recording or music sample is used.
- `src/assets.js`: original bevelled field knife, brushed-steel canvas texture, brass guard, wrapped grip, gloved hand and sleeve. Animation is authored in `src/game.js`.
- `src/world.js`: suspended electrical fixtures, their supports and floor conductors, with four sequential circuits on each map.
- `src/audio.js`: original generator startup, knife draw, swipe and material-impact synthesis.
