# VESPER — Les derniers vivants

FPS de survie par vagues, jouable dans le navigateur sur ordinateur et mobile, en solo ou en coopération à quatre. Quatre cartes : l’Abbaye des Cendres, le Complexe Boréal, les Jardins Abyssaux et LACUNA — La Dernière Crue.

## Jouer en local

Avec **Node.js 24**, depuis ce dossier :

```sh
npm ci
npm run build
npm start
```

Le jeu s’ouvre sur `http://localhost:4173` ; si ce port est occupé, le lanceur choisit le suivant. Garder le terminal ouvert. Sur Mac, `Jouer.command` lance aussi le dernier build. Après une modification du code, refaire `npm run build`.

Pour jouer entre amis, ouvrir un second terminal :

```sh
npm run relay
```

Le relais écoute sur le port 8787. Ouvrir **Jouer entre amis**, créer un salon et partager son code. L’hôte choisit carte et difficulté. Tous les participants doivent avoir terminé leur chargement pour que la partie démarre. Si l’hôte quitte, les autres reviennent au menu ; le salon permet de relancer une partie.

`npm run dev` sert les sources avec rechargement automatique sur `http://localhost:5180` et écoute aussi sur le réseau local. Le port de développement est fixé à 5180 pour éviter de tomber sur un autre jeu lancé sur le port 5173 ; si 5180 est occupé, Vite signale l’erreur. Le serveur `npm start` écoute uniquement sur cet ordinateur. Pour un essai sur téléphone en Wi-Fi, utiliser l’adresse réseau affichée par Vite et laisser également tourner le relais. WebGL 2 et l’accélération graphique sont nécessaires ; sur mobile, jouer en paysage.

## Commandes

| Action                          | Ordinateur                                          |
| ------------------------------- | --------------------------------------------------- |
| Déplacement                     | ZQSD / WASD, selon la position physique des touches |
| Tir / visée                     | Clic gauche / droit                                 |
| Course / accroupissement / saut | Maj / C / Espace                                    |
| Recharger / interagir           | R / E                                               |
| Changer d’arme                  | 1, 2 ou molette                                     |
| Couteau / grenade               | V / G                                               |
| Inspecter l’arme                | T                                                   |
| Retenir son souffle (lunette)   | Maj maintenu en visée                               |
| Lampe / vague suivante / pause  | F / N / Échap                                       |

Le guide intégré décrit les commandes tactiles. Les réglages et records sont enregistrés dans le navigateur. Armes, atouts et essences appartiennent à chaque joueur ; portes, courant, Reliquaire et extraction sont partagés. Un joueur à terre revient à la vague suivante ; la partie se termine si toute l’équipe tombe.

## Version 5.2 — La Horde vivante

Les assauts arrivent par groupes, avec des poussées frontales, des pinces et du harcèlement à partir de la manche 4. Certains Affamés anticipent brièvement votre trajectoire : changer de direction peut les tromper. Les Rémanents débordent et les Porte-peste prennent temporairement position. Les bonds et crachats s’espacent, les cibles sont plus stables en coopération et les nouvelles actions spéciales laissent un court répit après des dégâts ou une mise à terre.

Pour essayer la mise à jour, recharger la page et lancer une nouvelle partie sur `http://localhost:5180`. Les manches 4 à 10 montrent les différentes compositions ; les Rémanents apparaissent à partir de la manche 6. Les deux derniers zombies conservent leur course de fin de manche.

## Développer et vérifier

Le point d’entrée pour reprendre le code est **[ARCHITECTURE.md](ARCHITECTURE.md)** : responsabilités des modules, ajout d’une carte, d’un ennemi ou d’une arme, fonctionnement de la coopération et règles de nettoyage.

```sh
# Une fois, installer les navigateurs de test.
npx playwright install chromium webkit

# Vérification courante, avec ses propres serveurs temporaires.
npm run verify

# Avant de livrer : ajoute les audits graphiques, ressources et navigateurs.
npm run verify:full
```

`verify` vérifie formatage, imports et dépendances, tests unitaires/réseau, build de production, menu, combat, assauts et intentions des zombies, tactile Chrome/WebKit, coopération, relances et 260 vagues simulées. `verify:full` ajoute les suites de sensations, livraison, parcours navigateur, mémoire graphique, zombies et locomotion, Néréide, rendu et sang. Les mesures GPU s’exécutent successivement. Ces commandes ferment leurs propres serveurs et n’utilisent pas une partie déjà ouverte.

Commandes rapides : `npm test`, `npm run lint`, `npm run format`. Les scripts `test:*` permettent de cibler un audit sur un serveur déjà lancé ; définir `VESPER_URL` vers le build et, au besoin, `VESPER_RELAY` vers un relais de test. `CHROME_PATH` permet de choisir Chrome. Sur Linux, installer aussi les bibliothèques système avec `npx playwright install --with-deps chromium webkit`.

La CI utilise `npm run verify -- menu-check waves-check` : formatage, architecture, tests unitaires et réseau, build, menus et vagues simulées. Les essais de commandes en temps réel, de coopération dans le navigateur et de rendu nécessitent une machine graphique ; exécuter `npm run verify` sur cette machine avant une livraison. Les rapports et captures sont produits dans `artifacts/`, exclu de Git. Les résultats et limites des vérifications sont consignés dans [VERIFICATION.md](VERIFICATION.md).

`npm run profile:thermal -- mon-essai` mesure le build dans son propre navigateur : trois cartes avec et sans horde, pause, 30/60 images/s et fin de partie. Il produit les temps CPU, appels de rendu et compteurs graphiques bruts dans `artifacts/thermal-mon-essai/`. Ne pas lancer d'autre audit graphique en même temps. Les compteurs ne mesurent ni la température ni les watts. `npm run test:thermal` vérifie la mise au repos et l'identité du rendu.

`npm run test:relay-load` lance séparément un essai local borné de 1 000 clients synthétiques dans 250 salons. Il vérifie la livraison des messages et mesure la latence du relais, sans tester une infrastructure distante. Pour relancer quelques suites avec leurs serveurs isolés : `npm run verify -- coop-check foundation-check`.

## Mise en ligne

La version du jeu vient de `package.json` et apparaît dans le menu, la pause et les paramètres, y compris sur mobile. Un clic sur la version ouvre le **journal des versions**. Ses notes sont dans `src/content/changelog.js` : à chaque livraison, augmenter la version et ajouter son entrée en tête de liste (un test vérifie la correspondance). `version.json` est généré automatiquement avec l'identifiant de la publication, le titre et les points forts de la version. Un jeu déjà ouvert peut ainsi annoncer les nouveautés avant de recharger. Après une mise à jour, un joueur qui connaissait une version précédente voit une fois la carte « Nouveau » au menu. Ce numéro est distinct de la version du protocole réseau.

Une app déjà ouverte vérifie les nouvelles publications à son retour au premier plan, au menu et avant une nouvelle partie ou connexion coopérative. La mise à jour recharge la page avec une adresse renouvelée et conserve les sauvegardes/réglages locaux. Une partie en cours n'est pas rechargée. Les paramètres permettent également de vérifier manuellement. HTML, manifeste et métadonnées de version ne sont pas conservés en cache ; les ressources du jeu gardent leur cache normal.

Pour les utilisateurs restés sur 3.0.0, fermer complètement l'app depuis le sélecteur d'applications puis la rouvrir une fois : cette ancienne version ne possédait pas encore ce contrôle. Il n'est pas nécessaire de supprimer l'icône ou les données du jeu.

Le client est un site statique : `npm ci`, `npm run build`, publier `dist/`. La configuration Vercel est dans `vercel.json`. Les ressources sont locales ; le personnage coopératif et les cinq morceaux sont dans `public/models/` et `public/music/`. Provenance : [ASSETS.md](ASSETS.md), [personnage](public/models/ASSETS.md) et [musique](public/music/ASSETS.md).

La coopération nécessite un relais WebSocket distinct. `railway.json` et `nixpacks.toml` lancent `node server/index.js`, avec le port fourni par `PORT`. Le dossier `server/` peut également être déployé seul. La route HTTP `/` donne l’état du relais. Définir **`VITE_RELAY_URL=wss://adresse-du-relais` avant le build du client**. Sans cette variable, la coopération distante n’est pas configurée ; le solo reste disponible.

Client et relais doivent utiliser la même version de protocole, actuellement **4**. La version 3.2.0 synchronise les gestes et contacts des zombies avec leur présentation chez les invités ; publier le client et le relais ensemble. La version 4.0.0 conserve le protocole 4 : les nouveaux champs (rampants, zombie à l’origine d’un coup) sont facultatifs et ignorés par les anciens clients. Publier le client suffit ; republier le relais ajoute seulement leur validation. Une ancienne page ouverte doit être rechargée après cette mise à jour. Le relais garde ses salons en mémoire : un redémarrage les ferme. Il héberge la communication ; la simulation reste sur le navigateur de l’hôte. Les essais locaux ne mesurent pas la capacité d’une infrastructure déployée ni les performances d’un téléphone physique.

## LACUNA — 5.1.0

La quatrième destination est une ville thermale alpine en quarantaine, de nuit, dominée par un barrage. Trois vannes déclenchent des purges locales ; le Carillon des Absents attire la horde vers le quai. Après avoir utilisé les trois vannes, la Grande Décrue enchaîne les trois quartiers et récompense chaque joueur une seule fois. Les fortes purges rétractent la passerelle centrale ; deux ponts permanents permettent toujours de traverser. Le parcours et les commandes de vérification sont dans [docs/lacuna/PLAYTEST.md](docs/lacuna/PLAYTEST.md).

La coopération conserve le protocole 4. L’état hydraulique est un champ facultatif des snapshots, transmis tel quel par le relais existant. La mise à jour du relais ajoute sa validation ; elle n’est pas requise pour jouer à LACUNA avec le nouveau client. Tous les participants doivent charger la version 5.1.0 pour choisir cette destination.

## L’armurerie — 5.0.0

Les six armes sont refaites de A à Z, avec l’ambition d’un jeu AAA : vraies armes à l’échelle, tenues par de vrais bras.

- **Modèles.** Vigile .45, Spectre 9, Marauder, Requiem-12, Longinus et Éclipse sont modélisés pièce par pièce (glissière et chien, culasse et levier d’armement, pompe, verrou, chargeurs, détente, organes de visée, cartouches du porte-cartouches) avec chanfreins et arêtes adoucies. Chaque arme a une carte d’usure précalculée : peinture usée sur les arêtes, crasse dans les creux, traces de doigts, grain d’usinage, quadrillage des plaquettes, noyer veiné. Les armes passées par la Transfiguration portent un camouflage animé propre à leur palier.
- **Bras et mains.** Manches et gants d’un soldat Rocketbox (licence MIT) : chaque main se pose sur sa poignée et les doigts se referment au contact de l’arme. Le poignet reste droit et l’avant-bras suit la main. La main d’appui enveloppe le garde-main, pouce le long du flanc.
- **Animations.** Rechargements complets et visibles : chargeur qui tombe, nouveau chargeur tiré de la ceinture et enfoncé, arrêtoir de culasse ou levier d’armement quand l’arme est vide ; cartouches du fusil à pompe glissées une à une ; pompe et verrou manœuvrés après chaque tir ; sortie de l’arme à la première prise, changement d’arme, course (arme en travers, pistolet relevé), inspection (**T**), coup de couteau porté par la main.
- **Visée.** Viseur point rouge, viseur holographique et réticule de l’Éclipse projetés à l’infini : le point reste sur la cible même quand l’arme bouge. Lunette du Longinus avec distorsion, franges colorées, ombre quand l’œil se décale et réticule gravé ; **Espace** retient le souffle pour stabiliser l’image.
- **Commandes.** Sur ordinateur, **Espace** fait courir et **Maj** sauter. Sur mobile, viser et sauter sont de petits boutons côte à côte en haut à droite.
- **Sensations.** Recul propre à chaque arme (montée qui se récupère, dispersion qui s’élargit en rafale), balancement du regard, pas, respiration, réceptions ; flamme de bouche, étuis éjectés par la fenêtre d’éjection, fumée après une rafale. Les balles traversent les corps en perdant de l’énergie : le Marauder en traverse un, le Longinus jusqu’à trois ; les dégâts diminuent avec la distance.
- **Son.** Tirs enregistrés (sources CC0), renforcés d’un impact grave et d’une réverbération propre à chaque carte ; chaque geste de rechargement a son bruit, synchronisé avec l’animation. Les tirs des coéquipiers s’entendent à leur position, étouffés par la distance. Les coéquipiers tiennent les mêmes modèles, et le Reliquaire présente l’arme réelle.

Le téléphone charge des textures deux fois plus petites. Les armes et les bras coûtent environ 0,2 ms de calcul et une vingtaine d’appels de rendu par image. Tant qu’un modèle n’est pas chargé, ou s’il échoue, l’arme procédurale d’origine prend le relais.

Reconstruire les ressources (facultatif, les fichiers générés sont dans `public/`) : `node scripts/armory/build-weapons.mjs` (Blender 4.5 requis, variable `BLENDER`), `build-arms.mjs`, `build-textures.mjs` et `build-sounds.mjs`. `node scripts/armory-check.mjs` vérifie chaque arme dans une vraie partie. Provenance et licences : [ASSETS.md](ASSETS.md).

## La horde — 4.0.0

Les zombies sont entièrement refaits : 18 corps réalistes, animés par capture de mouvement, avec voix et bruitages enregistrés.

- **Corps.** Avatars Microsoft Rocketbox (licence MIT) repeints hors ligne en cadavres : peau livide, veines, pourriture, ecchymoses, sang séché et frais, vêtements déchirés. Huit civils pour les marcheurs, quatre coureurs, deux brutes (policier d’intervention, ouvrier), deux cracheurs (médecin, infirmière), le Rémanent encapuchonné et le soldat de l’Archonte. Le corps de chaque zombie est choisi à partir de son identifiant réseau : hôte et invités voient le même.
- **Mouvements.** Démarches, courses, attentes, sorties de terre, réactions et morts issues de la base de capture CMU et des bibliothèques Quaternius, adaptées au squelette commun. La vitesse d’animation suit le déplacement réel ; les pieds en appui restent plantés, talons et orteils épousent le sol. Les premières vagues traînent les pieds, les suivantes accélèrent.
- **Attaques.** Coups de griffes, saisies et frappes lourdes des brutes, calés sur l’instant exact des dégâts, y compris chez les invités. Côté joueur : griffures à l’écran, arc indiquant la direction du coup, recul de caméra.
- **Blessures.** Chaque balle laisse un impact sanglant sur le trajet du projectile ; un tir à la tête fait exploser le crâne. Les tirs dans les jambes s’additionnent.
- **Rampants.** Une grenade proche ou assez de dégâts dans les jambes arrachent le bas des jambes des marcheurs, coureurs et cracheurs : le zombie s’effondre, puis rampe sur ses moignons et griffe les jambes (portée et dégâts réduits). En coopération, l’état rampant est transmis aux invités.
- **Présence.** Yeux lumineux propres à chaque type, visibles de loin dans le noir. Râles, grognements, cris d’attaque, douleur, chutes, pas et respirations enregistrés (81 enregistrements CC0), spatialisés en 3D (HRTF sur ordinateur) avec une rumeur de horde qui monte avec le nombre de zombies.

Sur mobile, les packs sont deux fois plus légers (deux niveaux de détail, textures 1024 px), la moitié des variantes de sons est chargée et la spatialisation est moins coûteuse. Premier chargement : environ 9 Mo sur mobile, 20 Mo sur ordinateur, puis cache du navigateur. Un pack qui ne se charge pas laisse la place au zombie procédural d’origine, sans bloquer la partie.

Reconstruire les ressources (facultatif, les fichiers générés sont dans `public/`) :

```sh
node scripts/horde/fetch-sources.mjs   # captures CMU et bibliothèques Quaternius
npm run horde:characters               # 18 corps, Blender 4.5 requis (variable BLENDER)
npm run horde:animations               # bibliothèque d’animations
npm run horde:sounds                   # banque de sons
```

`npm run test:horde` vérifie les packs, les clips et la banque de sons ; `npm run test:zombies`, `npm run test:locomotion` et `npm run test:crawlers` inspectent le jeu compilé dans le navigateur. Provenance et licences : [ASSETS.md](ASSETS.md).

## Corps à corps et démembrement — 4.1.0

- **Encerclement.** Les zombies s'arrêtent à bout de bras et se répartissent autour de vous au lieu de s'empiler ; la horde est solide, on ne la traverse plus. Pendant leurs attaques, leurs mains balaient l'écran sans que le buste ne traverse la caméra.
- **Démembrement.** Assez de dégâts dans un bras l'arrachent au coude ou à l'épaule : le zombie continue avec l'autre. Un tir à la tête puissant mais non mortel peut emporter la mâchoire. Grenades et dégâts aux jambes arrachent le bas des jambes. Chaque membre perdu est projeté, rebondit et reste au sol quelques secondes ; les moignons montrent chair et os.
- **Obstacles bas.** Près de leur proie, les zombies enjambent bancs et caisses (jusqu'à 1,3 m) au lieu de les contourner : mains posées sur le dessus, genoux repliés, réception lourde. Les brutes, l'Archonte et les rampants contournent toujours.
- **Coureurs qui bondissent.** Dès la vague 4, un coureur à quelques mètres peut vous sauter dessus, griffes en avant, puis se réceptionner accroupi.
- **Impacts.** Un bras touché est rejeté en arrière ; une explosion projette en arrière les zombies qui y survivent. Tuer ou démembrer de près projette du sang sur l'écran. Chaque zombie arrive avec ses propres blessures.
- **Dans le noir.** Les yeux des zombies rapides laissent une traînée lumineuse (sur ordinateur).

L'état des membres est transmis aux invités en coopération (champ facultatif, protocole 4 inchangé).

## Réanimation et bande-son

En coopération, un joueur à terre reste visible et peut être réanimé pendant 45 secondes. Approchez-vous à moins de 2,5 m, puis maintenez **E** sur ordinateur ou le bouton de réanimation sur mobile pendant trois secondes. Relâcher, tirer, quitter la portée ou recevoir des dégâts interrompt la progression. Le joueur revient sur place avec la moitié de sa santé et trois secondes de protection. Après élimination, il revient à la prochaine vague si son équipe survit.

Les cinq morceaux originaux sont dans `public/music/`. Une nouvelle partie choisit aléatoirement un morceau différent du précédent. Le menu Réglages permet de choisir un titre et son volume pendant la partie ; un titre choisi reste sélectionné. La musique est diffusée par un seul lecteur, sans décoder les cinq morceaux en mémoire.
