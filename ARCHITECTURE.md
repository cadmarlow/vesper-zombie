# Architecture de VESPER

La base reste une application JavaScript avec Three.js et un relais WebSocket. Cette organisation conserve les décors, les règles et les optimisations existants. Elle donne un emplacement explicite aux évolutions du jeu, sans introduire de moteur générique ou de services supplémentaires.

## Où intervenir

| Besoin                                        | Modules                                                     |
| --------------------------------------------- | ----------------------------------------------------------- |
| Écrans, paramètres, salons, lancement         | `src/main.js`, `src/app/`, `src/ui/`                        |
| Ordre d’une image, commandes publiques        | `src/game.js`                                               |
| Chargement, relance, libération d’une partie  | `src/game/lifecycle.js`                                     |
| Déplacement, santé, état à terre              | `src/game/player.js`                                        |
| Tirs, couteau, dégâts, grenades               | `src/game/combat.js`                                        |
| Apparition, navigation, attaques ennemies     | `src/game/enemies.js`, `enemy-behaviors.js`                 |
| Corps, animations, voix et yeux des zombies   | `src/horde/`, `src/content/horde.js`                        |
| Rampants et démembrement                      | `src/game/crawlers.js`, `src/horde/dismember.js`, `gibs.js` |
| Zombie procédural de repli                    | `src/creature-motion.js`, `creatures.js`                    |
| Construction des ressources de la horde       | `scripts/horde/`                                            |
| Contacts d'attaque et volumes touchables      | `src/game/enemy-actions.js`, `enemy-hitboxes.js`            |
| Vagues, récompenses de transition, extraction | `src/game/survival.js`                                      |
| Achats et machines                            | `src/game/interactions.js`, `interaction-rules.js`          |
| Statistiques, réglages par défaut             | `src/content/`                                              |
| Métadonnées et géométrie d’une carte          | `src/maps/<carte>/`                                         |
| Monde commun, matériaux, modèles procéduraux  | `src/world.js`, `assets.js`, `creatures.js`, `weapons.js`   |
| Rendu, post-traitement, effets                | `src/game/presentation.js`, `rendering.js`, `*-effects.js`  |
| Session coopérative                           | `src/multiplayer.js`, `src/network/`                        |
| Connexion et protocole                        | `src/net.js`, `server/protocol.js`, `server/index.js`       |

Les longs fichiers de géométrie décrivent des décors et modèles. Une extraction supplémentaire se justifie par un élément réutilisable ou une responsabilité distincte, pas par un nombre arbitraire de lignes.

## Limites entre modules

`Game` assemble les systèmes et leur transmet un contexte explicite :

- `run` : état d’une partie, joueur, progression, entités, monde et session ;
- `input` : intentions clavier, souris et tactile ;
- `view` : renderer, scènes, caméras, effets et caches graphiques ;
- `sound` et `emit` : son et notifications vers l’application ;
- `commands` : les opérations précises dont un système a besoin chez un autre.

Les systèmes ne reçoivent pas l’objet `Game` entier et ne doivent pas importer `main.js` ou l’interface. Certains objets de `run` possèdent encore un modèle Three.js : il s’agit d’une séparation des responsabilités, pas d’une simulation entièrement indépendante du rendu.

Le HUD reçoit des données, sans pointeur vers le joueur, les scènes ou les modèles. Les commandes tactiles reçoivent `inputPort`. Le code de diagnostic traduit l’ancienne interface d’observation pour les scripts ; il ne doit pas devenir une API utilisée par le gameplay. `window.__vesper` n’est installé automatiquement qu’en développement. Les tests de production instrumentent uniquement leur propre page.

`npm run lint` vérifie la syntaxe, les imports manquants ou inutilisés, les cycles et les principales directions de dépendance. `src/config.js` conserve les imports publics historiques ; les définitions sont maintenant rangées dans leurs modules dédiés.

## Ajouter une carte

1. Créer `src/maps/<id>/definition.js` en prenant une carte existante comme modèle : identifiant stable, libellés du menu, illustration, thème visuel, graine et ambiance froide.
2. Créer `layout.js`. Le constructeur reçoit `World` et utilise ses primitives pour les murs, collisions, portes, points d’apparition et éléments spécifiques. Copier la structure d’Abbaye ou de Boréal pour réutiliser un thème ; Néréide montre un décor spécifique avec un contrôleur `detail`.
3. Enregistrer les métadonnées dans `maps/catalog.js` et le constructeur dans `maps/builders.js`. Le menu utilise le catalogue. Un nouveau thème visuel demande également ses matériaux et son habillage dans les modules de rendu concernés.
4. Pour le mode survie actuel, fournir un spawn joueur, des ancres ennemies, un générateur, un Reliquaire et une extraction. `validateWorld` refuse les données manquantes et les interactions avec le même identifiant. Donner un `id` explicite aux interactions lorsque leurs positions sont amenées à changer.
5. Ajouter des positions représentatives à `scripts/waves-check.mjs` pour vérifier les passages ouverts/fermés et l’accès aux joueurs. Compléter les listes de cartes des audits concernés, puis tester chargement, achats et relance en coopération.

Ne pas enregistrer les cartes dans le protocole : il transporte leurs identifiants. Le client vérifie qu’il sait construire la carte choisie.

## Ajouter un ennemi

Une variante se définit dans `content/enemies.js`. `look` permet de reprendre un modèle existant, `behavior` choisit son attaque spéciale, `attackInterval` sa cadence. Les statistiques de santé, vitesse, dégâts, score et rayon restent ici. Un nouveau modèle se construit dans `creatures.js` et doit conserver les niveaux de détail et la libération des ressources.

Les attaques spéciales s’enregistrent dans `game/enemy-behaviors.js`. Le déplacement, le choix de cible, les collisions et les dégâts au contact restent communs dans `EnemySystem`. L’attaque `spitter` fournit un exemple complet. Une nouvelle attaque doit prévoir son effet local et sa représentation chez les invités.

`spawn.wave` indique la première vague admissible et `spawn.below` un **seuil cumulatif**, dans l’intervalle `[0, 1]`. Les entrées admissibles sont triées par seuil ; le premier seuil supérieur au tirage gagne. Ce format conserve exactement la distribution historique. Adapter les seuils ensemble et vérifier leurs limites dans `tests/logic.test.js` ou `tests/runtime.test.js`. Les boss ont leur calendrier explicite dans `SurvivalMode`.

Les ennemis utilisent leur identifiant texte sur le réseau. Ajouter une variante n’exige pas de maintenir un second tableau d’indices dans la coopération. Les propriétés visuelles communes des morts et des Rémanents sont partagées entre hôte et invité dans `enemy-presentation.js`.

Les zombies sont des corps Rocketbox (`public/models/horde/`) animés par une bibliothèque de clips partagée. `content/horde.js` associe à chaque type ses corps (`HORDE_CAST`), ses réserves de clips (`HORDE_MOTION`), la couleur de ses yeux et les constantes de sortie de terre, de cadavre et de rampants. Un nouveau type réutilise un `look` existant ou déclare ses packs et réserves ; un nouveau corps s'ajoute dans `scripts/horde/roster.mjs` puis `npm run horde:characters`.

`horde/library.js` charge clips et packs derrière l'écran de chargement, prépare un modèle par corps et niveau de détail, et clone des instances légères : géométries, textures et clips sont partagés ; os, poses, mélangeur et uniformes de matière appartiennent à chaque zombie. `zombieModel(type, detail, seed)` reçoit l'identifiant réseau : le corps, les variations, la démarche et les gestes restent identiques chez l'hôte et les invités. `setZombieDetail` change seulement la géométrie (tête détruite et jambes perdues comprises). Les volumes touchables (tête, torse, bassin, cuisses, mollets) sont mesurés une fois par corps.

`horde/animator.js` pilote un `AnimationMixer` par zombie : boucle d'attente et de marche dont la vitesse de lecture suit la navigation, calque unique pour sortie de terre, attaque, déséquilibre ou chute, réactions additives, puis couche procédurale (regard, mâchoire, crachat). Les attaques sont lues à l'instant du contact défini par `enemy-actions.js`. Au sol, les talons pivotent au lieu de s'enfoncer, le bassin compense le reste, les pieds en appui sont verrouillés par une cinématique inverse à deux segments et les orteils se plient au contact. `horde/material.js` injecte dans la matière standard le sang frais, les impacts de balle en espace de liaison et la lueur des yeux ; `horde/eyes.js` dessine tous les yeux en un appel ; `horde/voice.js` spatialise voix, pas, impacts et rumeur de la horde.

`horde/dismember.js` décrit les membres détachables (jambes, avant-bras, bras, mâchoire) et fabrique, avec un cache par géométrie source et par masque, les maillages découpés et la position des moignons ; `horde/gibs.js` cuit les triangles perdus dans leur dernière pose et les projette. `game/crawlers.js` décide des mutilations chez l'hôte (bras, mâchoire, jambes) ; les invités reçoivent le masque facultatif `x` des instantanés et rejouent les mêmes coupes. `game/vaulting.js` marque les obstacles bas (hauteur ≤ 1,3 m, épaisseur ≤ 1,1 m) : à moins de 7 m de sa proie, un zombie dont la ligne droite n'est barrée que par eux les franchit. Hauteur du corps et phase de l'animation `vault_over` se déduisent de la position au-dessus de l'obstacle, chez l'hôte comme chez les invités, sans donnée réseau. Les bonds des coureurs (`LEAP` dans `content/horde.js`) sont décidés par l'hôte, qui porte le corps vers sa proie entre l'élan et le contact ; la liste facultative `lp` des instantanés indique aux invités quelles attaques sont des bonds. `game/crawlers.js` décide des rampants chez l'hôte (explosion proche, dégâts cumulés aux jambes) ; les invités reçoivent la liste facultative `c` des instantanés et rejouent la même transformation. Le repli procédural de `creatures.js` et `creature-motion.js` (42 os, démarches originales) sert seulement si un pack ne peut pas être chargé.

`enemy-actions.js` définit l'horloge et le contact unique des attaques. L'animation, les dégâts et le départ du projectile utilisent le même marqueur. Les volumes touchables suivent leurs os ; ils sont actualisés une fois par tir, puis réutilisés entre les plombs. Un geste plus ample doit garder ce raccord au combat.

`npm run test:locomotion` inspecte les modèles du build, les semelles réellement déformées, les appuis, les gestes d'attaque et les tirs à la tête ; `npm run test:crawlers` suit un rampant de la grenade à sa mort. Il produit un rapport et une galerie dans `artifacts/`. `node scripts/locomotion-check.mjs --webkit` ajoute le profil mobile WebKit. Les tests unitaires couvrent les appuis en espace monde, les arrêts, les virages, les vitesses et la synchronisation des contacts.

## Ajouter une arme ou une interaction

Une arme se définit dans `content/weapons.js`. `look` réutilise sa géométrie, `adsHeight` règle la position en visée, `scopeFov` active la lunette et `splash` décrit les dégâts de zone. `boxBelow` est le seuil cumulatif du Reliquaire. Pour une géométrie originale, ajouter son constructeur dans `weapons.js`. Vérifier tir, recharge, changement d’arme et représentation chez un coéquipier.

Les machines partagées passent toutes par `InteractionSystem.applySharedInteraction` et `sharedInteractionCost`. Le solo et l’hôte appliquent ainsi les mêmes conditions de distance, état du joueur, prix et disponibilité. Les atouts et améliorations personnelles restent locaux. Pour un nouveau type partagé, compléter aussi les événements et la réplication du réseau, puis tester deux joueurs qui essaient d’acheter simultanément.

## Coopération et messages

Le relais gère les salons de quatre joueurs, la version de protocole, le rôle de l’émetteur, les limites de messages et la présence des clients. L’hôte simule ennemis, vagues, objets et interactions partagées. Chaque joueur contrôle son déplacement, sa santé et ses impacts. Cette autorité est adaptée à la coopération entre amis ; elle ne constitue pas un serveur de simulation anti-triche.

Le démarrage crée un numéro de partie `run`. Chaque client construit sa scène puis envoie `ready`. Le relais envoie `go` seulement après les réponses de tous les participants encore présents. Les messages de gameplay portent leur émetteur et ce numéro ; les messages d’une ancienne partie et les commandes réservées à l’hôte émises par un invité sont rejetés.

Un achat partagé suit `demande → validation par l’hôte → confirmation`. La demande possède un numéro unique, le prix provient des règles de l’hôte, et le débit chez l’invité arrive à confirmation. Une demande répétée ne répète pas l’achat. Les instantanés emploient des identifiants stables pour armes, ennemis et interactions. Les formats de tuples sont décrits par `network/snapshot.js` et validés dans `server/protocol.js`.

`network/rescue.js` fait progresser la réanimation sur l’hôte : intention maintenue, distance et ligne de vue, interruption sur dégâts, expiration à 45 secondes. Les invités reçoivent les jauges dans les instantanés et les confirmations réservées à l’hôte. Les drapeaux distinguent à terre, éliminé et en train de réanimer. Les positions des zombies utilisent deux instantanés horodatés avec 100 ms de retard de présentation ; leur phase de marche s’intègre dans le temps au lieu de multiplier la durée totale de partie par une vitesse variable.

Une pause s’applique à l’équipe. Le départ d’un invité le retire des cibles et des modèles ; la perte de l’hôte ramène les autres au menu. Il n’y a pas de migration de simulation en cours de partie. Les salons restent en mémoire du relais ; leur distribution sur plusieurs serveurs demanderait un travail distinct.

Toute évolution du format des messages doit adapter émetteur, validation et lecteur. Une rupture de compatibilité augmente `PROTOCOL_VERSION` et exige de publier client et relais ensemble. Les bornes du protocole, notamment santé et nombre d’entités, doivent être revues si de nouvelles règles dépassent les valeurs actuelles.

## Ressources et durée de vie

`FrameClock` plafonne les images à 30 ou 60 Hz indépendamment de l'écran. La simulation utilise le temps écoulé entre les images acceptées. En pause et en fin de partie, le rendu s'arrête après la dernière image ; `view.needsRender` et `requestFrame()` permettent un nouveau rendu lors d'un redimensionnement ou d'un changement de réglage. Le menu et la pause conservent seulement un rappel audio à 10 Hz. Un onglet masqué suspend rendu et simulation ; le retour affiche la pause avant reprise explicite.

La passe d'occlusion réutilise les matrices calculées par la passe du monde qui la précède. Conserver cet ordre de rendu. `thermal-check` compare les pixels avec la passe d'origine sur les trois cartes et vérifie pause, reprise, réglages, visibilité et destruction.

`RunLifecycle` possède la construction et le nettoyage des ressources de partie. Un seul chargement peut être actif ; chaque étape asynchrone vérifie que la demande est encore valide. Échec, annulation et retour au menu libèrent les ressources déjà créées. `Game.destroy()` arrête aussi la boucle et les contrôles de la vue.

`survivor.js` charge une seule fois le personnage GLB, puis clone son squelette et ses ressources possédées pour chaque coéquipier. Les textures restent partagées ; `releaseSurvivor` arrête le mélangeur d’animations avant de libérer le modèle. Les armes réutilisent les modèles du jeu. Les attributions des fichiers sont conservées à côté des ressources dans `public/models/ASSETS.md` et `public/music/ASSETS.md`.

La bande-son utilise un unique élément audio branché au bus de musique Web Audio. `content/music.js` contient le catalogue. Le geste de lancement ou d’entrée dans le salon débloque l’audio avant les opérations asynchrones, notamment sur Safari. Les changements de morceau réutilisent ce même lecteur ; masquer la page suspend la lecture.

Les modèles possédés sont libérés via `resources.disposeModel` ; les instances GPU, squelettes, géométries, matériaux et textures propres au modèle sont concernés. Les textures marquées `sharedSurface` appartiennent au cache partagé et restent réutilisables entre parties. Un remplacement de modèle doit libérer l’ancien. Les particules, sang et zombies conservent leurs réserves existantes ; ne pas les reconstruire dans chaque image.

## Étendre au-delà de la survie

Pour un prochain mode, commencer par sa progression dans un module voisin de `SurvivalMode`, puis le sélectionner lors de l’assemblage de `Game`. Un nouveau mode doit définir ses règles de démarrage/fin, ses exigences de carte et les données à répliquer. Les armes, déplacements et présentation peuvent alors être réutilisés là où les règles restent communes.

Une future console multi-jeux mérite son propre point d’entrée quand un second jeu existe. Les systèmes de combat de VESPER n’ont pas besoin de devenir des abstractions universelles dès maintenant.
