# VESPER — Les derniers vivants

Un FPS solo de survie occulte, jouable dans le navigateur. Trois lieux, une dernière nuit. Création originale inspirée du principe de survie par vagues.

## Version 3.0.0 — jouer entre amis

Le bouton **Jouer entre amis** du menu ouvre un salon coopératif de deux à quatre survivants. Le créateur du salon reçoit un code de quatre lettres à partager ; il choisit la carte et la difficulté et lance la nuit. Chacun garde ses essences, ses armes et ses atouts ; les grilles, le générateur, le Reliquaire et la balise sont partagés. Les ennemis traquent le survivant le plus proche. Un joueur qui tombe attend la vague suivante pour revenir au point d’arrivée ; la nuit s’achève quand tout le monde est à terre. Les coéquipiers apparaissent en jeu sous les traits d’un soldat (casque à lampe frontale, cagoule, gilet tactique, sac, brassard à la couleur du joueur) qui tient son arme à deux mains et la pointe où il vise ; leur nom flotte au-dessus d’eux et leur santé figure dans le HUD.

Techniquement, le créateur du salon **héberge** la simulation (vagues, ennemis, objets) et diffuse l’état vingt fois par seconde ; les autres joueurs commandent leurs propres déplacements, tirs et santé et envoient leurs impacts. Le serveur `server/index.js` est un simple relais WebSocket : il tient les salons et transmet les messages, sans base de données ni logique de jeu. `npm run test:coop` lance deux navigateurs sur un relais local et vérifie salon, démarrage, synchronisation des ennemis, impacts, achats partagés, chute et retour.

### Mettre le relais en ligne

1. **Railway** : créez un projet depuis ce dépôt GitHub. Les fichiers `railway.json` et `nixpacks.toml` installent les dépendances, sautent la compilation du site et démarrent `node server/index.js` sur le port fourni par Railway. Générez un domaine public (Settings → Networking) et notez l’adresse, par exemple `vesper-relay.up.railway.app` ; `https://<adresse>/` doit répondre `{"service":"vesper-relay",…}`. En cas de souci, définissez le dossier racine du service sur `server/` (il a son propre `package.json`).
2. **Vercel** : ajoutez la variable d’environnement `VITE_RELAY_URL` avec la valeur `wss://vesper-relay.up.railway.app` (adresse Railway en `wss://`), puis redéployez. Sans cette variable, le salon indique que le relais n’est pas configuré.
3. En local, `npm run relay` démarre le relais sur le port 8787 ; le jeu servi sur `localhost` ou en réseau local s’y connecte automatiquement.

Aucune base de données n’est nécessaire pour jouer. Neon ou une autre base pourra servir plus tard à des classements en ligne.

## Version 2.6.0 — progression et Archonte

- **Transfiguration en trois paliers** : 3 000, 5 000 puis 7 500 essences pour des dégâts ×2,5, ×4 et ×6, un chargeur et une réserve agrandis à chaque palier. Le HUD affiche le palier (✦I, ✦II, ✦III) et la machine annonce le prix suivant.
- **Deux nouveaux atouts** : Main de fer (cadence +25 %, recul réduit) et Œil du Veilleur (tirs à la tête ×3,2, visée plus stable). Leurs machines se trouvent au fond de l’aile gauche et à droite de la nef dans l’abbaye et Boréal, dans la Canopée et au Belvédère à Néréide. Elles demandent le courant, comme les autres.
- **L’Archonte** : toutes les cinq vagues, un boss bâti sur le Pénitent, presque deux fois plus grand, cendreux, aux yeux rouges, rejoint la horde en plus du compte habituel ; deux à partir de la vague 15. Sa barre de vie apparaît sous la boussole. Sa chute rapporte 1 500 essences, deux grenades, des munitions et une relique (mort instantanée ou essences doubles).
- **Records** : chaque carte du menu affiche votre meilleure vague et vos éliminations ; l’écran de fin signale un nouveau record.
- Le bestiaire, l’arsenal et le guide décrivent ces ajouts. `npm run test:waves` couvre désormais l’Archonte des vagues 5 et 10 sur les trois cartes.

## Version 2.5.0 — correctifs et allègement du rendu

Le rendu est inchangé à l’image près ; le travail demandé au GPU baisse fortement.

- **Correctifs** : navigation clavier des menus (Tab, Espace) rétablie après une première partie ; un chargement échoué ramène au menu au lieu de bloquer le lancement ; une texture manquante dégrade vers un matériau de secours au lieu d’annuler la partie ; rails de l’Éclipse construits une seule fois ; réserves d’instances libérées au retour au menu ; souffles longs (vague, générateur) non tronqués ; tempo musical stable après une image lente ; un seul pouce par zone tactile ; scripts `release` et `performance` respectant `VESPER_URL`.
- **Décor** : la scène statique est fusionnée par matériau et par cellule de 20 mètres, ce qui laisse la caméra ignorer les cellules hors champ. Un maillage par matériau, invisible aux caméras du jeu, sert uniquement au calcul des ombres. Les sols et les incrustations plates ne participent plus à l’ombre. Les barreaux, lattes et joints emploient un cube simple à la place du cube biseauté (neuf fois moins de triangles pour un biseau invisible).
- **Zombies** : trois niveaux de détail au lieu de deux. Le niveau lointain (au-delà de 18 mètres sur ordinateur, 13 sur mobile) descend à environ 6 000 triangles, sans dents ni doigts détaillés. Sur ordinateur, seuls les pans de manteau, la capuche et l’étole restent double face.
- **Armes et effets** : les modèles d’armes en vue subjective et les armes affichées par le Reliquaire sont construits une seule fois par partie. Les traceurs, débris et douilles n’envoient plus leurs matrices au GPU quand ils sont inactifs. Le canvas n’est plus multi-échantillonné (l’anticrénelage vient déjà de la passe FXAA).
- **Processeur** : la navigation des ennemis consulte uniquement les obstacles proches du segment testé ; le HUD ne réécrit plus ses listes quand elles n’ont pas changé ; le son est suspendu quand l’onglet est caché.
- **Réglage** : une cadence maximale de 30 images par seconde peut être choisie dans les paramètres pour limiter la chauffe et la batterie sur téléphone. Elle est désactivée par défaut.
- **Ressources** : illustrations de menu en WebP (330 Ko au lieu de 4 Mo), version affichée injectée depuis `package.json`, workflow GitHub Actions (formatage, tests unitaires, compilation, contrôle du menu).

Mesures sur ce Mac, qualité élevée, horde de 28 ennemis à moins de 14 mètres : Abbaye desktop 2,80 → 2,30 millions de triangles par image (47 → 60 images/s), Abbaye mobile émulé 1,36 → 0,89 million, Boréal mobile émulé 0,69 → 0,48 million. Scène vide : −47 % à −75 % de triangles selon la carte. Détails dans [VERIFICATION.md](VERIFICATION.md).

## Version 2.4.0 — sang et headshots

Les impacts sur les zombies produisent une projection de sang dans la direction du tir, une brume brève et des gouttes qui retombent. Un **headshot mortel fait éclater la tête**, avec fragments et blessure au cou ; les tirs non mortels conservent la tête. Les éclaboussures marquent temporairement le sol et les surfaces pleines proches, avec un son d’impact organique.

Les effets emploient trois groupes de rendu et des réserves fixes, allégées sur mobile : les anciennes particules sont recyclées et les traces disparaissent progressivement. Aucun téléchargement ou moteur supplémentaire. `npm run test:blood` vérifie les tirs réels, les cinq types de zombies, les trois cartes, les effets répétés et leur libération sur Chrome et WebKit.

## Version 2.3.0 — architecture, matières et fluidité

- L’abbaye reçoit des voûtes partiellement effondrées, un étage de fenêtres, des vitraux originaux, des colonnes à joints et des bancs détaillés. Boréal gagne une toiture technique, des passerelles et des conteneurs équipés de renforts et de ferrures.
- Quatre nouveaux matériaux scannés différencient pierre taillée, enduit, béton et métal peint. L’humidité et l’usure varient à l’échelle du décor ; un reflet du lieu est calculé au chargement. Néréide conserve sa géographie, avec une végétation moins lumineuse et des raccords de structure supplémentaires.
- Les armes utilisent des microtextures de métal et de polymère, des arêtes usées, des marquages et une lumière liée à l’orientation et aux lampes proches. Les zombies ont des visages et dents mieux proportionnés, des manches longues selon le type et des mouvements plus asymétriques.
- Les pièces des grilles et machines sont regroupées sans supprimer leurs animations. Les zombies lointains emploient une géométrie allégée ; les ombres de contact restent visibles sur mobile. Les ombres du soleil sont calculées une fois par image sur desktop et au maximum 30 fois par seconde sur mobile, indépendamment de la cadence du jeu.
- La **fluidité adaptative desktop**, désactivable dans les paramètres, complète celle du mobile. Elle réduit progressivement la résolution en cas de ralentissement prolongé et la remonte plus lentement lorsque la marge revient. Sur les ordinateurs les plus limités, elle peut aussi désactiver l’occlusion ambiante pour le reste de la partie. L’interface reste à sa résolution native.

Les captures et mesures se génèrent avec `npm run test:remaster` (compilation servie sur le port 4173). Ce contrôle couvre les trois cartes, les trois qualités et une horde de 28 ennemis sur desktop et mobile émulé. Les limites et résultats observés sont consignés dans [VERIFICATION.md](VERIFICATION.md). Cette version pousse les modèles procéduraux et le rendu WebGL ; elle n’est pas présentée comme une production photoréaliste AAA.

## Jouer

Installez **Node.js 24**, puis lancez ces commandes depuis le dossier du dépôt :

```sh
npm ci
npm run build
npm start
```

Le jeu s’ouvre sur `http://localhost:4173` (le port suivant est utilisé si celui-ci est occupé). Gardez le terminal ouvert pendant la partie. Après cette première compilation, vous pouvez aussi double-cliquer sur `Jouer.command` sur Mac. Le lanceur utilise Node.js et le dossier `dist/`. Après une mise à jour du code, relancez `npm ci` et `npm run build`.

Les illustrations, textures et polices sont livrées avec le jeu ; les modèles et sons sont générés localement. Aucune ressource distante n’est chargée pendant la partie.

**Conseillé :** ordinateur avec souris, navigateur récent prenant en charge WebGL 2 et accélération graphique active. Sur téléphone et tablette, le jeu utilise une interface dédiée à deux pouces et se joue en paysage. Trois niveaux graphiques sont disponibles. Le mode équilibré ou performance convient aux appareils moins puissants.

## Mettre en ligne sur Vercel

Importez le dépôt GitHub `cadmarlow/vesper-zombie` dans un nouveau projet Vercel, branche `main`, dossier racine du dépôt (`./`), puis lancez le déploiement. Les réglages sont déjà enregistrés dans `vercel.json` et `package.json` :

| Réglage                   | Valeur          |
| ------------------------- | --------------- |
| Framework                 | Vite            |
| Node.js                   | 24.x            |
| Installation              | `npm ci`        |
| Compilation               | `npm run build` |
| Dossier publié            | `dist`          |
| Variables d’environnement | Aucune          |

Le jeu est entièrement statique : aucun serveur de jeu ni base de données à configurer. Vercel compile le projet et publie uniquement `dist/`. Les sources, tests et documents du dépôt ne font pas partie des fichiers servis aux joueurs. Voir les documentations officielles [Vite sur Vercel](https://vercel.com/docs/frameworks/frontend/vite) et [version de Node.js](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).

`node_modules/`, `dist/`, les ZIP de livraison, les captures, rapports de test, caches et fichiers locaux sont exclus de Git. Les tests reproductibles et les notices de licences sont conservés. Après le déploiement, ouvrez l’adresse HTTPS Vercel sur votre téléphone pour essayer les commandes tactiles. Les scores restent enregistrés localement dans ce navigateur.

## Le jeu

- **L’Abbaye des Cendres** : architecture gothique, nef scellée, éclipse rouge et autel rituel.
- **Le Complexe Boréal** : station arctique, réacteur anormal, neige et aurore boréale.
- **Les Jardins Abyssaux — Néréide** : sanctuaire botanique englouti à 2 840 mètres, verrière monumentale, arbre vivant, astrolabe et raie géante. Cinq secteurs, trois sas, cuves de spécimens animés, cloche de plongée et trois journaux à découvrir.
- Vagues progressives sans limite, trois difficultés et cinq types de zombies : Égaré, Affamé, Pénitent, Porte-peste, Rémanent. Toutes les cinq vagues, l’Archonte, présence majeure bâtie sur le Pénitent, rejoint la horde (deux à partir de la vague 15).
- Six armes, deux emplacements d’inventaire, visée, recul, headshots, rechargement, couteau et grenades.
- Le Reliquaire : boîte mystère avec tirage animé, raretés et récupération de l’arme.
- Zones à débloquer, générateur, ravitaillement, quatre atouts (Sang de fer, Nerfs d’acier, Main de fer, Œil du Veilleur), Transfiguration d’arme en trois paliers.
- Régénération de santé, endurance, bonus de soins, munitions, essences doubles et mort instantanée.
- Extraction après la dixième vague ou poursuite de la survie ; écrans de victoire et de défaite.
- Menu, arsenal, bestiaire, guide, réglages, pause et archives locales.
- Coopération en ligne de deux à quatre survivants via un salon à code (voir « Jouer entre amis »).
- Ombres, matériaux texturés, reflets, halos lumineux, particules, vêtements animés, animations d’armes et ambiance sonore synthétisée.

Le jeu se joue seul ou en coopération jusqu’à quatre. Les archives enregistrent les résultats terminés et les meilleurs scores par carte sur cet appareil ; elles ne sauvegardent pas une partie en cours. Cette réalisation indépendante a une direction artistique stylisée et ne constitue pas une production AAA équivalente à Call of Duty.

## Commandes

| Action                                 | Commande                                                        |
| -------------------------------------- | --------------------------------------------------------------- |
| Se déplacer                            | ZQSD en AZERTY / WASD en QWERTY ; flèches également disponibles |
| Regarder                               | Souris                                                          |
| Tirer                                  | Clic gauche ; maintenir pour les armes automatiques             |
| Viser                                  | Clic droit                                                      |
| Courir                                 | Maj                                                             |
| S’accroupir / se relever               | C                                                               |
| Sauter                                 | Espace                                                          |
| Recharger                              | R                                                               |
| Interagir / acheter / prendre une arme | E                                                               |
| Changer d’arme                         | 1 / 2 ou molette                                                |
| Couteau                                | V                                                               |
| Grenade                                | G                                                               |
| Lampe torche                           | F                                                               |
| Appeler la prochaine vague             | N pendant le répit                                              |
| Pause / libérer la souris              | Échap                                                           |

Les déplacements suivent la position physique des touches. Le réglage AZERTY/QWERTY adapte les indications affichées.

### Téléphone et tablette

- **Paysage** : le lancement attend la rotation. Repasser en portrait met la partie en pause et libère tous les doigts actifs ; la reprise est explicite.
- **Pouce gauche** : posez-le dans la zone gauche pour placer le joystick flottant. Petit déplacement pour marcher ; poussez franchement vers l’avant pour courir. Relâchez pour vous arrêter.
- **Pouce droit** : glissez dans la partie droite pour regarder. Maintenez le grand bouton de tir et glissez dessus pour suivre la cible tout en tirant. Le tir maintenu répète les coups, y compris avec le pistolet.
- **Arme** : touchez le compteur de munitions en bas pour recharger. La flèche voisine change d’arme dès que vous en possédez deux.
- **Actions** : icônes pour visée précise, saut, accroupissement, couteau et grenade. Les achats et activations apparaissent uniquement à proximité de l’objet, avec leur prix.
- **Réglages** : sensibilité tactile indépendante de la souris, ralentissement de la visée près des ennemis désactivable, résolution adaptative désactivable. Le guide tactile est accessible depuis la pause.

Sur iPhone, utilisez **Partager → Sur l’écran d’accueil**, puis ouvrez l’icône VESPER pour jouer sans les barres du navigateur. Le manifeste propose aussi le mode autonome en paysage aux navigateurs compatibles. Une connexion reste nécessaire au chargement ; aucune prise en charge hors ligne n’est annoncée.

## Progression

Vous commencez avec 650 essences et le Vigile .45. Les éliminations et headshots donnent des essences. La grille centrale coûte 750, le Reliquaire 950. Une arme tirée doit être récupérée avec E dans les 18 secondes. Le générateur, au fond dans l’aile gauche, alimente les machines gratuitement. Les atouts coûtent 2 000, 1 500, 2 500 et 2 500 essences ; la Transfiguration a trois paliers à 3 000, 5 000 et 7 500 essences (dégâts ×2,5, ×4 puis ×6, chargeur agrandi à chaque palier). Après avoir terminé la vague 10, activez la balise au point d’arrivée et restez à moins de 4,5 mètres pendant 20 secondes. Quitter le rayon suspend le décompte.

## Développement

```sh
npm ci
npm run dev
npm test
npm run test:e2e
npm run test:waves
npm run build
npm start
```

- `src/game.js` : simulation, combat, progression et rendu.
- `src/world.js` : cartes et machines.
- `src/world-abyss.js` : Néréide, sa géographie, sa végétation instanciée, ses spécimens et son océan animé.
- `src/assets.js` : modèles, textures et animation des créatures / armes.
- `src/creatures.js` : zombies déformés par squelette, variantes de géométrie mobile et animations.
- `src/weapons.js` : six armes, mains, pièces mobiles et rechargements.
- `src/surfaces.js`, `public/textures/` : chargement des matériaux PBR, projection à l’échelle du monde et profils graphiques.
- `src/world-architecture.js` : voûtes, vitraux, toitures et détails de construction.
- `src/rendering.js` : occlusion, sonde de reflets, ombres de contact et traitement final.
- `src/weapon-finish.js` : microtextures, usure des arêtes et marquages des armes.
- `src/world-detail.js` : usure, débris, accessoires, brumes et faisceaux.
- `src/combat-effects.js` : particules, douilles, fumée et impacts à allocations bornées.
- `src/blood-effects.js` : sang, fragments et éclaboussures à réserves fixes.
- `src/logic.js` : navigation, collisions, vagues et inventaire.
- `src/audio.js` : synthèse sonore originale.
- `src/music.js` : compositions musicales et ambiance adaptative.
- `src/main.js`, `src/style.css` : interfaces et HUD ordinateur.
- `src/touch.js`, `src/mobile.css` : contrôleur multitactile, interface mobile et orientation.
- `public/manifest.webmanifest`, `public/icons/` : lancement depuis l’écran d’accueil.

Les tests d’intégration utilisent Playwright et Chrome local. `CHROME_PATH` permet de choisir le binaire. Le serveur de développement doit tourner sur le port 5173. Les tests utilisent un accès de diagnostic présent uniquement en développement (`window.__vesper`) pour préparer des situations précises, puis vérifient les actions et les transitions. Cet accès est absent du build distribué.

Les captures et les rapports de chaque exécution se trouvent dans les sous-dossiers datés de `artifacts/`. Le bilan de livraison est dans `VERIFICATION.md`. Voir `ASSETS.md` et `public/licenses/` pour la provenance des ressources.

### Carte 03 — Néréide (version 2.2.0)

Sélectionnez **Les Jardins Abyssaux** dans le menu. Son emprise de 72 × 88 mètres est 2,28 fois celle de chacune des cartes précédentes (48 × 58 mètres). Les secteurs se parcourent sur un seul pont, avec deux circuits de contournement autour de la Canopée et de l’Herbier. Le nom du secteur apparaît dans le HUD.

Le premier sas ouvre la Canopée pour 750 essences. À l’ouest, le sas de l’Atelier coûte 1 000 essences et conduit au générateur ; son activation rallume progressivement les circuits et intensifie la lumière de l’arbre. Au nord, le Belvédère coûte 1 250 essences et donne accès à la Transfiguration. Deux postes de munitions couvrent le quai et l’Atelier. Trois terminaux **ARCHIVE** proposent des journaux à lire ; ils sont facultatifs. Après la vague 10, l’extraction se fait à la balise du quai d’arrivée.

Une composition musicale originale accompagne la carte. Le menu utilise une illustration dédiée, distincte du rendu 3D en jeu. Le profil mobile conserve l’arbre, les cuves et la raie, réduit le banc de poissons et limite les lumières à six ; le mode Performance supprime les effets de vitre et de caustiques. Les détails de surface et personnages réutilisent les textures locales des autres cartes.

`npm run test:abyss` vérifie les trois sas, l’accès aux machines, les journaux, l’extraction, le rendu des secteurs et une horde mixte de 28 ennemis dans les trois qualités, sur ordinateur et mobile émulé. Il utilise la compilation servie sur `http://localhost:4173`. `npm run test:waves` couvre également sept configurations de Néréide, dont le sas de l’Atelier fermé avec le Belvédère ouvert.

`npm run test:release` vérifie le menu et le démarrage de la compilation servie sur le port 4173, puis la lunette de précision sur le serveur de développement 5173. Lancez `node scripts/serve.mjs` et `npm run dev` dans deux terminaux avant ce contrôle.

## Tester le site déployé

```sh
npx playwright install webkit
VESPER_URL=https://vesper-zombie.vercel.app npm run test:online
VESPER_URL=https://vesper-zombie.vercel.app npm run test:menu
VESPER_URL=https://vesper-zombie.vercel.app npm run test:mobile
VESPER_URL=https://vesper-zombie.vercel.app npm run test:e2e
VESPER_URL=https://vesper-zombie.vercel.app npm run test:feel
VESPER_URL=https://vesper-zombie.vercel.app npm run test:waves
```

Les contrôles `online` et `menu` testent les écrans et commandes du site sans accès au moteur. `mobile` teste de vrais événements multitactiles CDP simultanés, l’orientation, les annulations de contact, les cibles de 44 pixels, les zones protégées de l’écran et les commandes WebKit. Il prépare certaines situations avec le même crochet d’observation que les tests de combat. `online` couvre Chrome et WebKit, avec des profils tactiles Android, iPhone et iPad, et vérifie également le signal audio réel, les erreurs et les requêtes de ressources.

Pour les scénarios précis de combat, d’économie et de vagues, `e2e`, `feel` et `waves` chargent le module de jeu effectivement publié. Un crochet d’observation dans la page de test permet de préparer les situations ; il ne modifie ni le serveur ni le jeu des autres visiteurs. Ces scénarios assistés complètent les essais des commandes normales. Les rapports restent dans `artifacts/`, hors de Git.

L’émulation ne mesure pas les performances d’un téléphone physique. Le navigateur WebKit fourni à l’automatisation refuse la capture de souris sur ce Mac, y compris dans une page de test minimale : le tir et la visée à la souris y sont signalés comme non vérifiés. Ils sont testés dans Chrome ; les équivalents tactiles sont testés dans WebKit.

## Version 2.1.0 — refonte des cinq zombies

- Les bouches auparavant partiellement enfouies dans le crâne sont remplacées par une ouverture réelle, une cavité, des lèvres et deux rangées de dents ébréchées. La mâchoire, le menton et les dents inférieures bougent avec les grognements et les attaques.
- Chaque type possède des proportions de visage distinctes. Orbites creuses, nez, pommettes, oreilles en relief et textures originales de peau/visage détaillent les gros plans. L’émission est concentrée sur les iris.
- Égaré : veste rapiécée et insigne de manche. Affamé : côtes exposées et ongles allongés. Pénitent : armure segmentée, rivets et casque à rebord. Porte-peste : gorge gonflée et excroissances visibles de face. Rémanent : capuche continue à ouverture frontale et pans de tissu déchirés.
- Manches et pantalons ont des profils plissés et effilés ; les mains montrent les articulations et les ongles, avec une pose de préhension animée. Les textures sont communes à toute la horde, en 1024px sur ordinateur et 512px sur mobile. Les deux tailles sont servies depuis le jeu ; aucune requête externe.
- `npm run test:zombies` capture les cinq types de face, de trois quarts, en entier et dans les deux cartes sur les profils ordinateur/mobile. Le script vérifie aussi l’animation de mâchoire, les impacts à la tête et la présence des textures en qualités élevée et Performance. Les captures nécessitent une inspection visuelle : les seuls tests fonctionnels ne garantissent pas la qualité des visages.

Les sources et prompts des textures générées sont documentés dans `ASSETS.md`. Ce changement améliore les modèles procéduraux existants ; il ne remplace pas le jeu par des personnages scannés ou un moteur AAA.

## Version 2.0.0 — refonte du rendu

- Les deux cartes utilisent des surfaces scannées de pierre, sol, métal, bois et tissu, avec couleur, normales, rugosité et occlusion indépendantes. Les textures sont fournies sous licence CC0 et restent servies localement ; leur provenance figure dans `ASSETS.md`.
- Les cinq types de zombies ont des corps animés par squelette, des visages sculptés, des vêtements déformables et déchirés, des mouvements asymétriques et une chute prolongée. Les téléphones utilisent une géométrie allégée. Les squelettes GPU sont libérés à la disparition des corps.
- Les six armes sont remodelées avec des profils biseautés, des organes de visée, des mains gantées, des pièces mobiles et un chargeur animé. Elles partagent le traitement de couleur du décor.
- Usure des sols, flaques irrégulières, gravats, ombres de contact simulées sous les obstacles, détails gothiques et équipements industriels. Nuages animés, nappes de brume et faisceaux légers selon la qualité choisie.
- Douilles, fumée et éclats sont recyclés dans des réserves de taille fixe ; les impacts persistent dans une réserve circulaire. Les tirs dirigés vers le sol produisent des impacts au sol.
- Sur ordinateur : netteté Retina corrigée, anticrénelage du post-traitement, occlusion ambiante en qualité élevée et budget de 2,6 millions de pixels pour le rendu du décor et de l’arme.
- Sur mobile : textures de 512px, zombies allégés, jusqu’à six lumières ponctuelles sélectionnées selon leur contribution, moins de couches transparentes et conservation de la résolution adaptative. L’occlusion ambiante coûteuse est réservée au profil élevé sur ordinateur. Les commandes à deux pouces, l’orientation, l’aide à la visée et la mise en pause restent disponibles.
- Le mode Performance désactive les halos, la brume, les nuages et les textures de relief/occlusion ; il réduit les ombres et les particules. Le changement de qualité s’applique immédiatement aux effets et matériaux. Les nouvelles apparitions adoptent la géométrie correspondant au profil.

Pour reproduire les captures des armes et des deux cartes, ainsi que les mesures avec 28 ennemis sur les trois profils graphiques, lancez `npm run build`, `node scripts/serve.mjs`, puis `npm run test:visual`. La commande `npm run test:upgrade` exécute les suites fonctionnelles et les contrôles de mémoire ; le serveur Vite sur 5173 est aussi requis pour le scénario de lunette de `test:release`. Les essais de performances mobiles sur Mac sont des émulations ; ils ne mesurent pas la chauffe ou le GPU d’un téléphone physique.

## Correctif 1.2.1 — éclairage de l’abbaye

Les sources électriques et leurs halos dans l’Abbaye des Cendres sont atténués d’environ 14 %. L’éclairage ambiant conserve la lisibilité du décor et les quatre circuits gardent leur allumage progressif. Le réglage du Complexe Boréal est conservé.

## Version 1.2.0 — refonte mobile

L’interface en portrait, le HUD de bureau surdimensionné et les touches R/E/G/V superposées sont remplacés par les commandes à deux pouces décrites ci-dessus. Le bouton de tir permet aussi de tourner la caméra ; le joystick est analogique avec zone morte et sprint vers l’avant. Chaque doigt conserve sa propre capture jusqu’au relâchement ou à l’annulation.

Le rendu des effets utilisait auparavant un tampon à 1×, étiré sur les écrans Retina : il suit désormais la résolution du moteur sur mobile, jusqu’à 2× avec un budget de 1,6 million de pixels en qualité élevée. Le filtrage des textures au sol est amélioré. Une régulation progressive réduit la résolution si les images ralentissent, puis la remonte quand la charge baisse. Le cadrage de l’arme et le champ de vision sont adaptés au paysage large ; la géométrie et les éclairages des cartes sont conservés.

Le contrôle reprend les principes décrits dans les guides officiels [Call of Duty: Mobile](https://blog.activision.com/call-of-duty/2019-10/Getting-a-Grip-on-the-Call-of-Duty-Mobile-Controls) et [Apple — Game controls](https://developer.apple.com/design/human-interface-guidelines/game-controls) : zones des pouces, caméra par glissement, commandes contextuelles et cibles tactiles accessibles. L’interface, les icônes et le code sont originaux.

## Correctif 1.1.3 — audit du site en ligne

- Le menu garde le titre, le lancement, les destinations et le pied de page dans un flux commun sur les fenêtres intermédiaires et les petits formats paysage. Les chevauchements reproduits, notamment en 900 × 780, sont corrigés.
- Les commandes tactiles sont reconnues à partir du pointeur principal ou d’un toucher sur le bouton de lancement, même quand le navigateur annonce zéro point de contact. Un lancement tactile reste également reconnu sur un appareil hybride avec souris.
- Des scripts reproductibles permettent de vérifier le déploiement, les seuils de mise en page et les scénarios du jeu en ligne.

## Correctif 1.1.2 — éclairage et préparation Vercel

Les néons, l’éclairage direct et les halos alimentés du Complexe Boréal sont atténués d’environ 16 %. L’éclairage ambiant reste identique pour garder les décors lisibles ; les quatre circuits conservent leur allumage progressif. Le dépôt contient la configuration Vercel et le verrouillage des dépendances pour une installation reproductible.

## Correctif 1.1.1 — espacement du menu

Le titre, le bouton de lancement, les indications de partie et les cartes suivent maintenant une même colonne sur ordinateur. L’espacement reste d’au moins 32 pixels entre les blocs. La typographie des écrans larges mais peu hauts est adaptée ; le pied de page ne recouvre plus le texte en paysage compact.

## Version 1.1.0 — atmosphère et sensations

- **Musique originale** : deux compositions, « Office des absents » dans l’abbaye et « Fréquence sous la glace » dans la station. Nappes désaccordées, cloches réverbérées, motif évolutif et pulsations pendant les vagues. Le curseur Musique est indépendant du volume général ; il est conservé sur l’appareil. Le son démarre après l’entrée en partie.
- **Électricité** : quatre circuits se rallument en séquence pendant environ trois secondes. Les luminaires suspendus, les conducteurs au sol, les écrans et le cœur des lieux s’illuminent. Démarrage du générateur accompagné de relais et d’une montée sonore. L’ambiance reste nocturne.
- **Course et accroupissement** : maintenir Maj pour courir, C pour se baisser/se relever, avec commandes tactiles dédiées. Vitesses : marche 3,65 m/s, course 7,15 m/s, accroupi 1,8 m/s. La caméra descend progressivement de 65 cm ; les pas accroupis sont plus discrets. Courir consomme l’endurance et modifie la posture de l’arme et le champ de vision. Après épuisement, il faut récupérer 25 % d’endurance. Viser, tirer et donner un coup de couteau interrompent le sprint.
- **Couteau** : lame biseautée en acier brossé, garde en laiton, poignée et main gantée. Animation de sortie, frappe et retour sur 0,78 s ; impact à 0,30 s. Son de coupe, son d’impact, particules et léger mouvement de caméra. Une seule cible à portée par frappe, sans traverser les murs. La commande reste V.

`npm run test:feel` vérifie les nouvelles mécaniques, les commandes tactiles et le rendu sonore ; `npm run test:mobile` vérifie les formats d’écran. Les tests navigateur sont effectués sur Mac avec émulation tactile, sans validation sur téléphone physique.

## Correctif 1.0.2 — commandes mobiles

Les boutons Pause et Aide restent accessibles au-dessus de la zone tactile de la caméra, y compris en paysage. Les boutons d’action et de pause mesurent au moins 44 pixels CSS. Le menu est compacté sur les écrans paysage très courts pour garder le bouton de lancement accessible.

`npm run test:mobile` vérifie les deux cartes sur neuf formats tactiles émulés, le tir, le rechargement, la pause, l’aide et la rotation en cours de partie, contre la version compilée servie sur le port 4173. Ces contrôles ne mesurent pas les performances d’un téléphone physique ni Safari sur iPhone.

## Correctif 1.0.1

Les apparitions sont validées contre les obstacles et la zone accessible. Les zombies contournent les coins en tenant compte de leur largeur, et peuvent reculer pour se dégager. Les impacts ne peuvent plus les pousser dans le décor. Le test `npm run test:waves` vérifie douze scénarios allant chacun jusqu’à la vague 10 sur les deux cartes ; il élimine uniquement les ennemis arrivés à portée du défenseur et en ligne de tir.
