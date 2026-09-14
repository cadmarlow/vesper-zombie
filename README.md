# VESPER — Les derniers vivants

FPS de survie par vagues, jouable dans le navigateur sur ordinateur et mobile, en solo ou en coopération à quatre. Trois cartes : l’Abbaye des Cendres, le Complexe Boréal et les Jardins Abyssaux.

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

`npm run dev` sert les sources avec rechargement automatique et écoute sur le réseau local. Le serveur `npm start` écoute uniquement sur cet ordinateur. Pour un essai sur téléphone en Wi-Fi, utiliser l’adresse réseau affichée par Vite et laisser également tourner le relais. WebGL 2 et l’accélération graphique sont nécessaires ; sur mobile, jouer en paysage.

## Commandes

| Action                          | Ordinateur                                          |
| ------------------------------- | --------------------------------------------------- |
| Déplacement                     | ZQSD / WASD, selon la position physique des touches |
| Tir / visée                     | Clic gauche / droit                                 |
| Course / accroupissement / saut | Maj / C / Espace                                    |
| Recharger / interagir           | R / E                                               |
| Changer d’arme                  | 1, 2 ou molette                                     |
| Couteau / grenade               | V / G                                               |
| Lampe / vague suivante / pause  | F / N / Échap                                       |

Le guide intégré décrit les commandes tactiles. Les réglages et records sont enregistrés dans le navigateur. Armes, atouts et essences appartiennent à chaque joueur ; portes, courant, Reliquaire et extraction sont partagés. Un joueur à terre revient à la vague suivante ; la partie se termine si toute l’équipe tombe.

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

`verify` vérifie formatage, imports et dépendances, tests unitaires/réseau, build de production, menu, combat, tactile Chrome/WebKit, coopération, relances et 190 vagues simulées. `verify:full` ajoute les suites de sensations, livraison, parcours navigateur, mémoire graphique, zombies, Néréide, rendu et sang. Les mesures GPU s’exécutent successivement. Ces commandes ferment leurs propres serveurs et n’utilisent pas une partie déjà ouverte.

Commandes rapides : `npm test`, `npm run lint`, `npm run format`. Les scripts `test:*` permettent de cibler un audit sur un serveur déjà lancé ; définir `VESPER_URL` vers le build et, au besoin, `VESPER_RELAY` vers un relais de test. `CHROME_PATH` permet de choisir Chrome. Sur Linux, installer aussi les bibliothèques système avec `npx playwright install --with-deps chromium webkit`.

La CI utilise `npm run verify -- menu-check waves-check` : formatage, architecture, tests unitaires et réseau, build, menus et vagues simulées. Les essais de commandes en temps réel, de coopération dans le navigateur et de rendu nécessitent une machine graphique ; exécuter `npm run verify` sur cette machine avant une livraison. Les rapports et captures sont produits dans `artifacts/`, exclu de Git. Les résultats et limites des vérifications sont consignés dans [VERIFICATION.md](VERIFICATION.md).

`npm run profile:thermal -- mon-essai` mesure le build dans son propre navigateur : trois cartes avec et sans horde, pause, 30/60 images/s et fin de partie. Il produit les temps CPU, appels de rendu et compteurs graphiques bruts dans `artifacts/thermal-mon-essai/`. Ne pas lancer d'autre audit graphique en même temps. Les compteurs ne mesurent ni la température ni les watts. `npm run test:thermal` vérifie la mise au repos et l'identité du rendu.

`npm run test:relay-load` lance séparément un essai local borné de 1 000 clients synthétiques dans 250 salons. Il vérifie la livraison des messages et mesure la latence du relais, sans tester une infrastructure distante. Pour relancer quelques suites avec leurs serveurs isolés : `npm run verify -- coop-check foundation-check`.

## Mise en ligne

La version du jeu vient de `package.json` et apparaît dans le menu, la pause et les paramètres, y compris sur mobile. Augmenter cette version à chaque livraison ; `version.json` est généré automatiquement avec l'identifiant de la publication. Ce numéro est distinct de la version du protocole réseau.

Une app déjà ouverte vérifie les nouvelles publications à son retour au premier plan, au menu et avant une nouvelle partie ou connexion coopérative. La mise à jour recharge la page avec une adresse renouvelée et conserve les sauvegardes/réglages locaux. Une partie en cours n'est pas rechargée. Les paramètres permettent également de vérifier manuellement. HTML, manifeste et métadonnées de version ne sont pas conservés en cache ; les ressources du jeu gardent leur cache normal.

Pour les utilisateurs restés sur 3.0.0, fermer complètement l'app depuis le sélecteur d'applications puis la rouvrir une fois : cette ancienne version ne possédait pas encore ce contrôle. Il n'est pas nécessaire de supprimer l'icône ou les données du jeu.

Le client est un site statique : `npm ci`, `npm run build`, publier `dist/`. La configuration Vercel est dans `vercel.json`. Les ressources sont locales ; le personnage coopératif et les cinq morceaux sont dans `public/models/` et `public/music/`. Provenance : [ASSETS.md](ASSETS.md), [personnage](public/models/ASSETS.md) et [musique](public/music/ASSETS.md).

La coopération nécessite un relais WebSocket distinct. `railway.json` et `nixpacks.toml` lancent `node server/index.js`, avec le port fourni par `PORT`. Le dossier `server/` peut également être déployé seul. La route HTTP `/` donne l’état du relais. Définir **`VITE_RELAY_URL=wss://adresse-du-relais` avant le build du client**. Sans cette variable, la coopération distante n’est pas configurée ; le solo reste disponible.

Client et relais doivent utiliser la même version de protocole, actuellement **3**. Une ancienne page ouverte doit être rechargée après cette mise à jour. Le relais garde ses salons en mémoire : un redémarrage les ferme. Il héberge la communication ; la simulation reste sur le navigateur de l’hôte. Les essais locaux ne mesurent pas la capacité d’une infrastructure déployée ni les performances d’un téléphone physique.

## Réanimation et bande-son

En coopération, un joueur à terre reste visible et peut être réanimé pendant 45 secondes. Approchez-vous à moins de 2,5 m, puis maintenez **E** sur ordinateur ou le bouton de réanimation sur mobile pendant trois secondes. Relâcher, tirer, quitter la portée ou recevoir des dégâts interrompt la progression. Le joueur revient sur place avec la moitié de sa santé et trois secondes de protection. Après élimination, il revient à la prochaine vague si son équipe survit.

Les cinq morceaux originaux sont dans `public/music/`. Une nouvelle partie choisit aléatoirement un morceau différent du précédent. Le menu Réglages permet de choisir un titre et son volume pendant la partie ; un titre choisi reste sélectionné. La musique est diffusée par un seul lecteur, sans décoder les cinq morceaux en mémoire.
