# Survivor character

`survivor.glb` is the Soldier / Vanguard character with Idle, Walk and Run animations from the Three.js r185 example assets, originally provided by Mixamo. Vesper supplies the weapon attachments, arm aiming, team visor tint, crouch and rescue presentation.

- Source: https://github.com/mrdoob/three.js/blob/r185/examples/models/gltf/Soldier.glb
- Three.js example and Mixamo attribution: https://github.com/mrdoob/three.js/blob/r185/examples/webgl_animation_skinning_blending.html
- Adobe Mixamo usage terms: https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html

Adobe permits the characters and animations in personal and commercial games. Keep the asset part of the game; do not redistribute it as a standalone asset library.

# Zombie horde — version 4.0.0

`horde/` holds 18 zombie characters and the shared animation library `horde-anims.glb`. Each character exists as a desktop pack (`<id>.glb`: full/lite/far levels, 2048×1024 colour atlas) and a mobile pack (`<id>-mobile.glb`: lite/far, 1024×512). Every pack keeps the same 23-bone Rocketbox Biped skeleton, so one clip library animates all of them.

The bodies are modified [Microsoft Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox) avatars (MIT license, © 2020 Microsoft; notice in `public/licenses/ROCKETBOX-MIT.txt`). Their textures are repainted offline as decayed, bloodied corpses by `scripts/horde/build-characters.mjs`. The clips are retargeted from the CMU Graphics Lab Motion Capture Database (mocap.cs.cmu.edu, funded by NSF EIA-0196217) and the Quaternius Universal Animation Library 1 and 2 (CC0 1.0) by `scripts/horde/build-animations.mjs`, then extended with authored attacks, crawls and deaths.

| Type    | Packs                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------ |
| Walker  | civilian-08, civilian-05, civilian-13, civilian-12, worker-01, business-01, civilian-f08, civilian-f04 |
| Runner  | runner-04, runner-10, runner-sports, runner-f12                                                        |
| Brute   | brute-swat, brute-fire                                                                                 |
| Spitter | spitter-doctor, spitter-nurse                                                                          |
| Wraith  | wraith-hood                                                                                            |
| Archon  | archon-soldier                                                                                         |

The avatar behind each pack, the motion-capture trials and all tools are listed in the root `ASSETS.md`. Keep these files part of the game; do not redistribute them as a standalone asset library.

# First-person armory — version 5.0.0

`armory/` holds the six first-person weapons (`<id>.glb` with baked wear maps `<id>-wear-{1024,512}.webp`) and the first-person arms (`arms.glb`, `arms.json` landmarks, colour, normal and roughness maps at 1024 and 512 px).

The weapons are original models authored for this project by the Blender scripts in `scripts/armory/blender/`. The arms are a modified [Microsoft Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox) avatar, Professions/Military_Male_01 (MIT license, © 2020 Microsoft; notice in `public/licenses/ROCKETBOX-MIT.txt`): sleeves and gloves only, textures recoloured by `scripts/armory/build-arms.mjs`. Keep these files part of the game; do not redistribute them as a standalone asset library.

# Supply objects and service machines — versions 5.3.0 / 5.4.0

`supplies/` holds four pickups, seven machines and a tonic bottle, each with full/mobile GLBs and baked wear maps. These are original Vesper designs authored in `scripts/supplies/build.py` and exported with the project’s Blender modelling kit. Labels and signs are original Canvas compositions using the bundled Barlow Condensed font. Runtime materials reuse the credited Poly Haven metal normal map. The first-person drinking animation uses the armory’s credited Rocketbox-derived hands; see the root `ASSETS.md`.
