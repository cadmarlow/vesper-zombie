# VESPER — Asset provenance

Apart from the third-party assets documented below (surface scans, horde characters, motion capture and sound recordings), gameplay geometry, rigs, animations, particle systems, UI symbols, procedural skin/weapon texture patterns and audio synthesis are authored for this project. No Call of Duty asset, map, logo or audio sample is included.

## Version 5.0.0 — the armory

The six first-person weapons, their arms, surfaces and sounds are rebuilt from scripted modelling and open assets. Nothing is generated at runtime and the game calls no external service.

**Weapons.** Vigile .45, Spectre 9, Marauder, Requiem-12, Longinus and Éclipse are original designs modelled for this project by Blender scripts in `scripts/armory/blender/` (`kit.py` holds the modelling kit: filleted profiles, lathes, sweeps, exact booleans, bevels with weighted normals). They follow the general layout of real weapon families (a single-action pistol, a roller-delayed SMG, a direct-impingement carbine, a pump shotgun, a chassis bolt-action rifle), with no manufacturer marking, trademark or copied dimension drawing. `scripts/armory/build-weapons.mjs` unwraps every weapon into one atlas, bakes its wear map with Cycles (ambient occlusion, convex edges and cavities, 1024 px desktop and 512 px phone WebP) and writes a meshopt-compressed GLB in `public/models/armory/`.

**Arms.** `public/models/armory/arms*` is derived from the [Microsoft Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox) avatar Professions/Military_Male_01 (MIT license, © 2020 Microsoft; notice in `public/licenses/ROCKETBOX-MIT.txt`). `scripts/armory/build-arms.mjs` keeps the sleeves and gloves in Blender (`arms.py`), crops the body textures to the arms, repaints the camouflage and converts the specular map to roughness. The hands are posed at runtime by original IK and finger-curl code (`src/armory/arms.js`).

**Surface detail.** The tiling grunge, machining, stipple, checkering and walnut maps in `public/textures/armory/` are procedural and original (`scripts/armory/build-textures.mjs`). Edge wear, grime, fingerprints and the animated transfiguration camouflages are shader code in `src/armory/material.js`.

**Sound.** `public/audio/armory/` contains 81 one-shots cut from 44 CC0 1.0 recordings on [Freesound](https://freesound.org) by 29 authors: michorvath, gattoangus, ken788, morganpurkis, Brokenphono, LilMati, SuperPhat, hyperix6, MrGungus, ajhartman42295, qubodup, Iridiuss, Tycoh, MikeE63, nioczkus, serøutōnin--deprivəd, oneshotofficial, nikkolaus, wadaltmon, Zott820, dasBUTCHER84, Krovi, CeebFrack, brianhanson2nd, magnuswaker, GrayJoy, GryffDavid, Metrolynn, BrickDeveloper171. Every file, title and URL is listed in `public/audio/armory/CREDITS.md` and `manifest.json`. `scripts/armory/build-sounds.mjs` cuts, cleans, loudness-matches and encodes them (ffmpeg). At runtime each shot is layered with a synthesized sub-bass punch and a reverb generated per map; reload and action sounds follow the animation keys.

**Tools.** Blender 4.5 LTS (Cycles bakes), glTF Transform, meshoptimizer, Sharp and ffmpeg-static are development tools only; none ships with the game.

## Version 4.0.0 — the horde

The zombies are rebuilt from open assets and offline tooling. Nothing is generated at runtime and the game calls no external service. The earlier generated-model attempt (unreleased 3.3–3.5 work) is not shipped; its files are archived outside the build in `art/zombies/`.

**Bodies.** The 18 character packs in `public/models/horde/` are derived from [Microsoft Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox) avatars, released by Microsoft under the MIT license (notice in `public/licenses/ROCKETBOX-MIT.txt`):

| Pack         | Rocketbox avatar             | Pack           | Rocketbox avatar                 |
| ------------ | ---------------------------- | -------------- | -------------------------------- |
| civilian-08  | Adults/Male_Adult_08         | runner-10      | Adults/Male_Adult_10             |
| civilian-05  | Adults/Male_Adult_05         | runner-sports  | Professions/Sports_Male_04       |
| civilian-13  | Adults/Male_Adult_13         | runner-f12     | Adults/Female_Adult_12           |
| civilian-12  | Adults/Male_Adult_12         | brute-swat     | Professions/Police_Male_02       |
| worker-01    | Professions/Delivery_Male_01 | brute-fire     | Professions/Construction_Male_03 |
| business-01  | Professions/Business_Male_01 | spitter-doctor | Professions/Medical_Male_01      |
| civilian-f08 | Adults/Female_Adult_08       | spitter-nurse  | Professions/Medical_Female_01    |
| civilian-f04 | Adults/Female_Adult_04       | wraith-hood    | Adults/Male_Adult_18             |
| runner-04    | Adults/Male_Adult_04         | archon-soldier | Professions/Military_Male_03     |

`scripts/horde/build-characters.mjs` converts each FBX with Blender (`blender-character.py`: 23-bone Biped kept, claw hand pose, face landmarks), merges body and head into one atlas and repaints it as a corpse from the 3D position of every texel (`zombify.mjs`: pallor, lividity, veins, rot, bruises, dried and fresh blood, torn cloth). It then writes three levels of detail with meshoptimizer and a desktop pack (full/lite/far, 2048×1024 JPEG colour, 1024×512 normal and surface maps) and a mobile pack (lite/far, half resolution). The surface map packs fresh-blood potential, roughness and the eye glow. These are modified versions of the Rocketbox avatars, not new characters.

**Motion.** `public/models/horde/horde-anims.glb` holds 46 clips retargeted by `scripts/horde/build-animations.mjs` onto the shared skeleton:

- [CMU Graphics Lab Motion Capture Database](http://mocap.cs.cmu.edu/) trials 09_01, 104_13, 104_41, 111_03, 120_02, 120_22, 132_17, 133_01, 137_15, 137_16, 139_18, 140_01, 140_03, 35_17, 90_18, 91_05, 91_16, 91_17, 91_25, 91_26, 91_59 (BVH conversion mirrored by [una-dinosauria/cmu-mocap](https://github.com/una-dinosauria/cmu-mocap)). The data used in this project was obtained from mocap.cs.cmu.edu; the database was created with funding from NSF EIA-0196217. CMU allows its use in commercial products; the raw data is not redistributed.
- [Quaternius Universal Animation Library](https://quaternius.com/packs/universalanimationlibrary.html) 1 and 2, Standard (CC0 1.0): idles, flinches, a knock-back, a collapse and the zombie scratch.

Loops are cut, made cyclic and speed-measured; mirrored variants, hunched postures, attacks, crawler moves and deaths are authored on top with keyframes and two-bone IK in `scripts/horde/compose.mjs`. At runtime `src/horde/animator.js` matches playback to the navigation speed, pins planted feet, grounds heels and toes, aligns attack contacts with gameplay and layers look-at, jaw and flinches.

**Sound.** `public/audio/horde/` contains one-shots and ambience beds cut from 81 CC0 1.0 recordings on [Freesound](https://freesound.org) by 64 authors: mrh4hn, Breviceps, OwNathan, bigmonmulgrew, ChuckChuckGoof, indieground, ketamineface, Mr_Maple2678, kathol, maurolupo, haratman, adharca, tonsil5, nigelnix, OozerName, MrPokephile, lolamadeus, ToxicFilmzSRsounds, PaulMorek, soykevin, Wakerone, ArriGD, Thanra, mrsoundguy84859983975479387597, rockittt, LilMati, Sticks5611, VHBC, JollyGreenZ, spootyskater, mvVoiceActing, mazlyn, Huminaatio, derjuli, giddster, LucasDuff, princessemilu, quadraslayer, NicknameLarry, AugustSandberg, SmallQuadruped, arnaump, Anko6, DeezSoundzTho, florianreichelt, Fission9, RutgerMuller, Topschool, moxobna, leonelmail, jmdh, SlykMrByches, gprosser, Kreastricon62, clif_creates, danielrutterfilms, carlito62, adamgryu, SpliceSound, qubodup, denao270, GaryQ, harrisonlace, perrybassin. Every file, title and URL is listed in `public/audio/horde/CREDITS.md` and `manifest.json`. `scripts/horde/build-sounds.mjs` cuts, cleans, loudness-matches and encodes them (ffmpeg).

**Tools.** Blender 4.5 LTS, glTF Transform, meshoptimizer, Sharp and ffmpeg-static are development tools only; none ships with the game. `scripts/horde/fetch-sources.mjs` downloads the motion sources; the character and sound builds fetch their own sources into `.cache/`.

## Version 3.2 — articulated zombie movement

Since 4.0.0 this procedural rig is the fallback used when a horde pack cannot load. The six zombie motion profiles, Hermite pose curves, world-space foot contacts, two-bone leg solver, finger poses, directional reactions and articulated death motion are original project code in `src/creature-motion.js` and `src/game/enemy-presentation.js`. The 42-bone rigs and their skin weights are authored in `src/creatures.js`, including clavicles, toes and two joints per finger/thumb. No paid asset, external animation recording, proprietary motion library, new texture or runtime dependency was added for this work. Three.js remains the existing MIT-licensed rendering dependency. These movements are authored animation and procedural corrections, not motion-capture recordings.

## Version 2.4 — blood impacts

Blood mist and splatter masks are original 256px canvas textures drawn once per session in `src/blood-effects.js`. Droplets and head fragments reuse instanced geometry; the neck wound uses shared original geometry in `src/creatures.js`. The impact sounds are synthesized in `src/audio.js`. No new external image, model or audio recording is used.

## Version 2.3 — architecture and material response

The abbey's vaults, clerestory, lancets, masonry joints and pew details, the station's roof, gantries, cargo hardware and pipe fittings, and the abyssal pressure fittings are original geometry in `src/world-architecture.js`.

Four additional [Poly Haven CC0](https://polyhaven.com/license) scans are shipped locally:

| Local prefix | Original scan                                                            | Use                                    |
| ------------ | ------------------------------------------------------------------------ | -------------------------------------- |
| `ashlar`     | [Large Sandstone Blocks](https://polyhaven.com/a/large_sandstone_blocks) | Abbey blockwork                        |
| `plaster`    | [Grey Plaster](https://polyhaven.com/a/grey_plaster)                     | Carved stone, vaults and cornices      |
| `steel`      | [Rusty Painted Metal](https://polyhaven.com/a/rusty_painted_metal)       | Industrial metal and pressure fittings |
| `concrete`   | [Concrete Floor Worn 02](https://polyhaven.com/a/concrete_floor_worn_02) | Boréal floor and foundations           |

Source channels are the 2K JPEG Diffuse, OpenGL normal and packed AO/roughness/metalness maps. They are resampled with Lanczos into 512px and 1024px WebP files (quality 88 for color, 91 for data). Original download URLs and hashes are recorded in `artwork/architecture/sources.json`. Only the sets needed by the selected map are requested. Together with both stained-glass resolutions, the new runtime assets occupy about 4 MiB; a session loads one resolution and a subset of these files.

The original stained glass was generated with the built-in **imagegen** tool. Exact prompt, source and runtime paths: [`artwork/architecture/PROMPTS.md`](artwork/architecture/PROMPTS.md). Weapon microstructure, normal/roughness maps and worn markings are procedural original assets in `src/weapon-finish.js`.

`src/rendering.js` captures a fixed local environment probe during loading for scene reflections. It is not ray tracing or a live planar reflection; moving enemies and later power changes are not recaptured. The weapon uses a separate studio environment with map-colored directional light and nearby lamp bounce. Occlusion excludes glow sprites and depthless transparency so their rectangles do not occlude the scene. This wrapper uses the visibility hooks of the pinned Three.js 0.185.1 GTAOPass; recheck it when upgrading Three.js.

## Version 2.2 — Néréide, Les Jardins Abyssaux

`src/world-abyss.js` contains the original playable map: its pressure vault, tree, curved leaves with a locally drawn vein texture, astrolabes, specimen rigs, caustic/ocean shaders, manta and instanced fish. Materials reuse the CC0 surface scans below. The three fictional research journals and the new synthesized score in `src/music.js` are authored for this map; journals are displayed as text, not voice recordings.

`public/art/abyss.webp` is original menu key art generated using the built-in **imagegen** tool (259 KiB). The selected source and exact prompt are recorded in [`artwork/abyss/PROMPTS.md`](artwork/abyss/PROMPTS.md). It is an illustration, not a screenshot or an imported 3D environment. The generated source PNG is kept outside `public/`; only the WebP is shipped.

## Version 2.1 — creature faces and skin

Two original albedo images were created with the built-in **imagegen** tool and integrated into the animated meshes. Selected source images and exact prompts: [`artwork/creatures/PROMPTS.md`](artwork/creatures/PROMPTS.md). Runtime files: `public/textures/creatures/face-{512,1024}.webp` and `public/textures/creatures/skin-{512,1024}.webp`.

Phones load 512px variants (132 KiB together); desktop loads 1024px variants (546 KiB together). Images are bundled locally, use sRGB and remain shared across the horde. Detailed/low geometry variants retain the facial albedo and both dental arches. The forehead, orbital sockets, nasal bridge, cheeks and open mouth are authored geometry in `src/creature-head.js`. The jaw, chin, lower dental arch and oral walls have skeleton weights; no face decal or depth-test override conceals the original mesh. The generated skin images replace the generic procedural pattern during normal loading. They are artistic material textures, not scanned human skin or a full scanned character.

## Version 2.0 — scanned surfaces

The following texture sets come from [Poly Haven](https://polyhaven.com/license) and are released under **CC0 1.0**. Their 1K JPEG source maps were resized and encoded to WebP for local delivery. No Poly Haven API or asset CDN is contacted by the game.

| Local prefix | Original asset                                               | Source channels                                       |
| ------------ | ------------------------------------------------------------ | ----------------------------------------------------- |
| `stone`      | [Old Stone Wall](https://polyhaven.com/a/old_stone_wall)     | Diffuse, OpenGL normal, packed AO/roughness/metalness |
| `floor`      | [Large Grey Tiles](https://polyhaven.com/a/large_grey_tiles) | Diffuse, OpenGL normal, packed AO/roughness/metalness |
| `metal`      | [Rusty Metal 04](https://polyhaven.com/a/rusty_metal_04)     | Diffuse, OpenGL normal, packed AO/roughness/metalness |
| `wood`       | [Rough Wood](https://polyhaven.com/a/rough_wood)             | Diffuse, OpenGL normal, packed AO/roughness/metalness |
| `cloth`      | [Denim Fabric](https://polyhaven.com/a/denim_fabric)         | Diffuse, OpenGL normal, packed AO/roughness/metalness |

Files: `public/textures/{prefix}-{color,normal,arm}-{512,1024}.webp`. Phones/tablets load 512px maps; desktop loads 1024px maps. Color maps use sRGB; normal and packed data maps use no color-space conversion. The scans are projected in world metres for architecture to avoid stretched textures. See `public/licenses/POLY-HAVEN.txt`.

The skinned zombies in `src/creatures.js`, first-person weapon rigs in `src/weapons.js`, atmospheric shaders and dressing in `src/world-detail.js`, and pooled impact effects in `src/combat-effects.js` are original code and geometry. They are not downloaded character models or motion-capture recordings. The fog and light shafts use lightweight transparent effects; they are not a volumetric ray-tracing system. Puddles use environment lighting, not screen-space reflections.

## Original key art

Generated using the built-in imagegen tool, then copied into this workspace. These illustrations are menu artwork; the playable maps are rendered by Three.js from the authored geometry in `src/world.js`.

- `public/art/abbey.webp`
- `public/art/station.webp`
- `public/art/abyss.webp` — prompt and source documented above.

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

## Version 1.2.0 additions

- `src/main.js`, `src/mobile.css`: original touch-control SVG symbols and interface styling.
- `public/icons/vesper-192.png`, `public/icons/vesper-512.png`: PNG renderings of the project's original `public/favicon.svg`, used by the home-screen manifest. No external icon pack.
