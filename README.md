# VESPER — Les derniers vivants

Un FPS solo de survie occulte, jouable dans le navigateur. Deux lieux, une dernière nuit. Création originale inspirée du principe de survie par vagues.

## Jouer

Installez **Node.js 24**, puis lancez ces commandes depuis le dossier du dépôt :

```sh
npm ci
npm run build
npm start
```

Le jeu s’ouvre sur `http://localhost:4173` (le port suivant est utilisé si celui-ci est occupé). Gardez le terminal ouvert pendant la partie. Après cette première compilation, vous pouvez aussi double-cliquer sur `Jouer.command` sur Mac. Le lanceur utilise Node.js et le dossier `dist/`. Après une mise à jour du code, relancez `npm ci` et `npm run build`.

Les illustrations et polices sont livrées avec le jeu ; les modèles et sons sont générés localement. Aucune ressource distante n’est chargée pendant la partie.

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
- Vagues progressives sans limite, trois difficultés et cinq types de zombies : Égaré, Affamé, Pénitent, Porte-peste, Rémanent.
- Six armes, deux emplacements d’inventaire, visée, recul, headshots, rechargement, couteau et grenades.
- Le Reliquaire : boîte mystère avec tirage animé, raretés et récupération de l’arme.
- Zones à débloquer, générateur, ravitaillement, atouts Sang de fer et Nerfs d’acier, amélioration d’arme par Transfiguration.
- Régénération de santé, endurance, bonus de soins, munitions, essences doubles et mort instantanée.
- Extraction après la dixième vague ou poursuite de la survie ; écrans de victoire et de défaite.
- Menu, arsenal, bestiaire, guide, réglages, pause et archives locales.
- Ombres, matériaux texturés, reflets, halos lumineux, particules, vêtements animés, animations d’armes et ambiance sonore synthétisée.

Le jeu est solo. Les archives enregistrent les résultats terminés et les meilleurs scores par carte sur cet appareil ; elles ne sauvegardent pas une partie en cours. Cette réalisation indépendante a une direction artistique stylisée et ne constitue pas une production AAA équivalente à Call of Duty.

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

Vous commencez avec 650 essences et le Vigile .45. Les éliminations et headshots donnent des essences. La grille centrale coûte 750, le Reliquaire 950. Une arme tirée doit être récupérée avec E dans les 18 secondes. Le générateur, au fond dans l’aile gauche, alimente les machines gratuitement. Les atouts coûtent 2 000 et 1 500 essences ; la Transfiguration, 3 000. Après avoir terminé la vague 10, activez la balise au point d’arrivée et restez à moins de 4,5 mètres pendant 20 secondes. Quitter le rayon suspend le décompte.

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
- `src/assets.js` : modèles, textures et animation des créatures / armes.
- `src/logic.js` : navigation, collisions, vagues et inventaire.
- `src/audio.js` : synthèse sonore originale.
- `src/music.js` : compositions musicales et ambiance adaptative.
- `src/main.js`, `src/style.css` : interfaces et HUD ordinateur.
- `src/touch.js`, `src/mobile.css` : contrôleur multitactile, interface mobile et orientation.
- `public/manifest.webmanifest`, `public/icons/` : lancement depuis l’écran d’accueil.

Les tests d’intégration utilisent Playwright et Chrome local. `CHROME_PATH` permet de choisir le binaire. Le serveur de développement doit tourner sur le port 5173. Les tests utilisent un accès de diagnostic présent uniquement en développement (`window.__vesper`) pour préparer des situations précises, puis vérifient les actions et les transitions. Cet accès est absent du build distribué.

Les captures et les rapports de chaque exécution se trouvent dans les sous-dossiers datés de `artifacts/`. Le bilan de livraison est dans `VERIFICATION.md`. Voir `ASSETS.md` et `public/licenses/` pour la provenance des ressources.

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
