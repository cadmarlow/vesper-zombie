# VESPER — Vérification

Les rapports et captures mentionnés dans l’historique sont des fichiers de travail locaux, exclus de Git. Les scripts conservés dans `scripts/` permettent de générer de nouveaux rapports dans `artifacts/`.

## Correctif 1.2.1 — lumières de l’abbaye

- Réduction de 14 % du facteur d’intensité des sources alimentées de l’abbaye ; éclairage ambiant et réglage du Complexe Boréal conservés. Captures de l’abbaye avant/après inspectées.
- Compilation Node.js 24 et 33 contrôles de `test:feel` réussis sur la compilation de production : activation du générateur, allumage des quatre circuits, machines, déplacements, couteau et audio sur les deux cartes. Rapport : `artifacts/feel-1788643476795/report.json`.

## Version 1.2.0 — refonte de l’expérience tactile

Le retour sur téléphone a montré que les anciens contrôles de dimensions ne suffisaient pas à valider le confort de jeu. Cette version remplace les commandes et le HUD mobiles, impose le paysage en partie, corrige le tampon de rendu Retina et ajoute le lancement autonome depuis l’écran d’accueil.

Vérification locale de la compilation de production, le 5 septembre 2026 :

- **60 contrôles tactiles** réussis (`artifacts/touch-native-1788632702075/report.json`). Événements CDP avec deux contacts simultanés sur les deux cartes : déplacement, caméra et tir maintenu ; relâchement, annulation système, absence de dérive au bord de la zone, course, saut, accroupissement et rechargement. Portrait avant lancement sans départ de vague ; rotation en partie avec pause, libération des actions et reprise explicite.
- Commandes et boutons de pause d’au moins 44 pixels sur sept formats paysage, de 568 × 320 à 1080 × 810. Zones d’encoche et d’indicateur d’accueil simulées. Captures inspectées ; guide opaque et lisible, sans texte de pause superposé.
- WebKit avec profils iPhone SE, iPhone 13 et iPad : rotation, tir, rechargement, pause, guide. Manifeste et deux icônes présents. L’installation effective depuis l’écran d’accueil nécessite encore une vérification sur appareil physique.
- Les deux scènes alimentées avec 28 ennemis gardent leur rendu à 2× dans cet essai Mac : environ 60 images/s médianes. Le ralentissement CPU artificiel à 8× déclenche la réduction progressive de résolution ; sa désactivation rétablit le rendu maximal. Sensibilité et options tactiles persistantes. **Ces chiffres ne mesurent pas les performances d’un téléphone.**
- **187 contrôles Chrome/WebKit** réussis sur le build (`artifacts/online-1788631934228/report.json`) : deux cartes, commandes normales, audio, réglages, rotation, archives et ressources ; aucune erreur JavaScript/WebGL ni requête en échec. Le contrôle supplémentaire final des boutons de pause tablette est inclus dans la suite tactile ci-dessus.
- **41 contrôles d’intégration**, **33 contrôles de sensations** et **21 contrôles de livraison** réussis : combat, économie, Reliquaire, courant, animations, musique, progression, lunette et interface ordinateur. Rapports : `artifacts/verification-1788631535375/`, `artifacts/feel-1788631520694/`, `artifacts/release-1788631564203/`.
- **120 vagues** terminées dans douze scénarios sur les deux cartes, cinq types d’ennemis, aucun spawn invalide ni blocage (`artifacts/waves-regression-1788632785306.json`). Scénarios assistés par un défenseur invulnérable : ce test vérifie la progression et la navigation, pas l’équilibrage pour un humain.
- Compilation Node.js 24 et 12 tests unitaires réussis. Les outils d’observation et rapports ne sont pas distribués avec le jeu.

Les essais tactiles sont émulés sur Mac. Ils vérifient les événements et le rendu, mais ne remplacent pas un test ergonomique avec les pouces sur l’iPhone de l’utilisateur. Le refus de capture souris dans le WebKit d’automatisation reste la limite décrite ci-dessous ; Chrome couvre les tirs et la visée sur ordinateur.

## Correctif 1.1.3 — audit du déploiement Vercel

Audit du 5 septembre 2026 sur `https://vesper-zombie.vercel.app/`. Les 29 fichiers de l’application et ressources principales téléchargés correspondaient octet pour octet au build 1.1.2 attendu, soit environ 5,26 Mo.

- Sur l’URL publique : 361 contrôles tactiles sur neuf formats × deux cartes (`artifacts/mobile-1788628199632/report.json`), 40 contrôles d’intégration (`artifacts/verification-1788628418660/test-results.json`) et 33 contrôles des sensations (`artifacts/feel-1788628737059/report.json`) réussis.
- 120 vagues terminées avec le module réellement déployé : douze scénarios de dix vagues, cinq types d’ennemis, aucun spawn invalide ni blocage (`artifacts/waves-regression-1788628645158.json`). Les scénarios utilisent un défenseur invulnérable qui élimine uniquement les ennemis arrivés à portée et en ligne de tir ; les achats et l’extraction utilisent également des situations préparées dans la page de test.
- Deux défauts reproduits : chevauchement du menu sur certaines fenêtres intermédiaires/courtes et commandes tactiles absentes dans WebKit quand `maxTouchPoints` vaut zéro malgré un pointeur tactile.
- Après correction locale : aucun chevauchement sur 391 combinaisons de dimensions (`artifacts/menu-audit-1788628914130/report.json`). Captures inspectées, notamment en 900 × 780 et sur les formats mobiles.
- La compilation 1.1.3 passe 173 contrôles Chrome/WebKit : ordinateur, profil Android, iPhone SE, iPhone 13 portrait/paysage et iPad, sur les deux cartes (`artifacts/online-1788629088587/report.json`). Signal audio réel non nul après le geste de lancement, commandes, réglages, pause, rotation, retour au menu et sauvegardes ; aucune erreur JavaScript/WebGL ni requête de ressource en échec.
- Compilation et 12 tests unitaires réussis. Les scripts d’audit sont exclus du bundle de jeu ; l’accès de diagnostic reste absent de la version publique normale.

Limites : essais mobiles émulés sur Mac, sans mesure sur téléphone physique. Le navigateur WebKit d’automatisation refuse la capture de souris même sur une page minimale indépendante du jeu, en mode visible comme sans fenêtre. Le tir et la visée à la souris n’y sont donc pas validés ; ils passent sur Chrome et leurs équivalents tactiles passent sur WebKit. Cela ne constitue pas une validation complète de Safari sur Mac.

## Correctif 1.1.2 — éclairage et dépôt de production

Vérifié le 5 septembre 2026 depuis le dépôt `vesper-zombie`, après une installation propre des dépendances.

- `npm ci`, les 12 tests unitaires et la compilation de production réussissent sous Node.js 24.20.0. L’audit npm ne signale aucune vulnérabilité dans les dépendances installées.
- 33 contrôles de sensations réussis sur les deux cartes, dont l’activation réelle du générateur, la séquence des quatre circuits, les déplacements, le couteau, la musique et les commandes tactiles. Rapport local : `artifacts/feel-1788627751615/report.json`.
- Captures avant/après alimentation inspectées : les sources électriques et halos du Complexe Boréal sont légèrement atténués ; les décors restent lisibles et l’allumage nettement visible.
- 21 contrôles de livraison réussis : menu sur 12 formats, lancement du build, tir, vague, pause, lunette et ressources locales ; aucune erreur navigateur. Rapport local : `artifacts/release-1788627786586/report.json`.
- Les archives, dépendances, builds et captures sont exclus de Git. La configuration Vercel publie le dossier `dist`, avec Node 24 et installation depuis le fichier de verrouillage.

Ces essais utilisent Chrome sur Mac, avec émulation tactile pour les commandes mobiles. Ils ne remplacent pas un test sur téléphone physique ni la vérification du futur déploiement Vercel. La compilation conserve un avertissement de taille pour le module Three.js (environ 146 Ko compressés), sans échec de build.

## Correctif 1.1.1 — chevauchement du menu

Le chevauchement signalé a été reproduit en 1489 × 855 : les destinations commençaient environ 34 pixels avant la fin du bloc de lancement. Il était plus marqué en 1600 × 900. Les blocs étaient positionnés indépendamment depuis le haut et le bas de la fenêtre.

Le menu utilise maintenant un flux commun pour le titre et les destinations sur les formats ordinateur concernés, avec un écart minimal de 32 pixels. Les grands titres sont compactés quand la hauteur est limitée. L’illustration de fond n’introduit pas de défilement supplémentaire. Les métadonnées du bouton sont masquées en paysage très court pour libérer le pied de page.

- Vérification sur 25 formats, dont les seuils 780/781, 850/851 et 1000/1001 pixels : aucun chevauchement entre le lancement, les destinations et le pied de page, aucun débordement horizontal. Rapport : `artifacts/menu-spacing-1788626735742/report.json`.
- 21 contrôles de livraison réussis : démarrage du jeu, tir, vague, pause, lunette de précision et absence d’erreurs. Rapport : `artifacts/release-1788626691690/report.json`.
- Compilation de production réussie ; captures du menu inspectées.

## Version 1.1.0 — musique, électricité, déplacements et couteau

Vérifiée le 5 septembre 2026 sur ce Mac, Chrome/WebGL 2. Aucun déploiement en ligne effectué.

- 33 contrôles des nouveautés réussis : activation réelle du générateur sur les deux cartes, allumage séquentiel, écrans, absence de redémarrage lors d'une deuxième activation, vitesses marche/course/accroupi, consommation et récupération d'endurance, hauteur de caméra, clavier C, lame visible et arme masquée pendant le coup, contact différé, une seule frappe, retour de l'arme et obstacle bloquant le couteau. Rapport : `artifacts/feel-1788625693432/report.json`.
- Deux compositions rendues hors ligne sur 20 secondes chacune avec le même synthétiseur que le jeu. Signal non nul, crête inférieure à 0,49 avant le volume général, variations différentes. Les extraits et mesures sont dans `artifacts/feel-1788625693432/`. Ce contrôle numérique ne remplace pas une écoute sur les haut-parleurs du téléphone.
- Course, accroupissement et couteau vérifiés par gestes tactiles simulés ; la pause réinitialise la course. Réglage de musique indépendant, enregistré et restauré après rechargement. Le contexte sonore s'ouvre dès le clic/toucher de lancement, avant le chargement du moteur 3D.
- 361 contrôles mobiles réussis : neuf formats × deux cartes, boutons d'au moins 44 pixels CSS, points de contact accessibles, tir, rechargement, pause, aide, rotation. Rapport : `artifacts/mobile-1788625165629/report.json`.
- 40 contrôles d'intégration réussis : `artifacts/verification-1788624965327/test-results.json`.
- 12 tests unitaires réussis. La régression des vagues repasse sur 12 scénarios de 10 vagues : aucune apparition invalide ou vague bloquée. Rapport : `artifacts/waves-regression-1788625488314.json`.
- 17 contrôles de livraison réussis sur la compilation finale : `artifacts/release-1788625686611/report.json`.
- Charge avec 28 zombies, courant rétabli, 1440 × 900 et qualité élevée : environ 59,9 images/s médianes, 17,8 ms au 95e percentile, environ 1 148 appels de dessin par image sur ce Mac.
- Compilation de production réussie. Les ressources restent locales. Vérification visuelle des deux cartes avant/après courant et des poses du couteau, y compris en portrait tactile.

Les mesures de fluidité concernent ce Mac. Les contrôles mobiles utilisent l'émulation Chrome et ne constituent pas une validation sur un iPhone ou Android physique.

## Correctif 1.0.2 — mobile

Audit du 5 septembre 2026, Chrome sur Mac avec écran et gestes tactiles émulés.

- Défaut reproduit : la zone tactile de rotation de la caméra interceptait les boutons Pause et Aide sur les petits écrans et en paysage. Leur ordre de superposition est corrigé.
- Boutons de jeu tactiles et boutons Pause/Aide agrandis à au moins 44 × 44 pixels CSS.
- Menu compacté en paysage très court : le pied de page ne recouvre plus le bouton de lancement en 568 × 320.
- 325 contrôles réussis sur la version compilée : neuf formats × deux cartes, de 320 × 568 à 932 × 430 et tablette 820 × 1180. Débordement horizontal, guide du menu, zones tactiles réellement accessibles, tir, rechargement, pause, aide en partie et rotation de l'écran. Rapport : `artifacts/mobile-1788618890956/report.json`.
- Déplacement et caméra simultanés vérifiés par deux contacts tactiles via Chrome DevTools ; le relâchement arrête le déplacement.
- Compilation de production réussie.

Les gestes sont simulés par le navigateur. Aucun iPhone ou Android physique n'a été testé ; ce bilan ne valide ni Safari iOS, ni la chauffe, ni la fluidité du GPU d'un téléphone, ni les découpes d'écran. Le petit format portrait reste dense.

## Correctif 1.0.1 — blocage des vagues

Le blocage a été reproduit : certains points d’apparition de l’abbaye chevauchaient les colonnes. Le repli vers les coordonnées initiales introduisait un ennemi physiquement coincé, conservé dans le compteur de vague. Des trajectoires calculées pour un point pouvaient également coincer les ennemis aux coins.

- Validation de la position réelle d’apparition et de son accès au joueur.
- Navigation adaptée aux deux tailles d’ennemis, trajets tenant compte des collisions et possibilité de recul pour se dégager.
- Impacts limités par les collisions.
- 12 tests unitaires réussis, dont les régressions des colonnes, coins, positions du joueur proches des murs et zones scellées.
- 12 scénarios × 10 vagues terminées, sur les deux cartes, grille ouverte et fermée, aux points d’arrivée, d’achat et dans la seconde zone. Les cinq types d’ennemis sont couverts. Aucune apparition invalide ou vague bloquée. Rapport : `artifacts/waves-regression-1788617215857.json`.
- Le défenseur de test est invulnérable et élimine uniquement les ennemis qui parviennent à moins de 3,2 mètres avec une ligne de tir libre. La simulation s’exécute à pas fixe ; les ennemis distants ne sont pas supprimés pour finir les vagues.

- Les 40 contrôles d’intégration repassent après correction : `artifacts/verification-1788617438019/test-results.json`.
- Version compilée 1.0.1 : des zombies apparus naturellement atteignent et attaquent le joueur immobile, sans interface de diagnostic.
- Le test de charge conserve environ 60 images/s médianes sur ce Mac avec 28 ennemis.

## Livraison initiale 1.0

Vérifié le 5 septembre 2026 sur ce Mac, avec Chrome et WebGL 2.

- Compilation de production : réussie.
- Tests de logique : 6 réussis (navigation, collisions, rechargement, progression, tirage et génération reproductible).
- Tests d’intégration : 40 réussis, sans erreur JavaScript ou console. Rapport : `artifacts/verification-1788615150621/test-results.json`.
- Contrôles de livraison : 17 réussis. Huit formats d’écran, démarrage du build, tir, vague, pause, ressources locales, absence d’API de diagnostic en production et visée au fusil de précision. Rapport : `artifacts/release-1788615408713/report.json`.
- Écran mobile court (375 × 667) : défilement jusqu’au pied de page et ouverture du guide vérifiés.
- Horde de 28 ennemis, 1440 × 900, qualité élevée : environ 60 images/s médianes sur 100 images mesurées. Le regroupement des éléments des personnages réduit les appels de dessin d’environ 4 889 à 1 152 par image dans cette scène. Ces mesures concernent ce Mac et ce scénario, sans garantie pour d’autres appareils.
- Dépendances de production : aucun avis de sécurité signalé par `npm audit --omit=dev` à la vérification.

Les tests fonctionnels préparent certains états via une interface de diagnostic réservée au développement, puis vérifient les actions et les transitions. Ils ne remplacent pas une campagne exhaustive de tests humains sur tous les navigateurs et matériels.

La compilation signale la taille du module Three.js (environ 572 Ko avant compression, 144 Ko compressés). Le moteur est chargé séparément du menu.
