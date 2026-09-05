# VESPER — Vérification

Les rapports et captures mentionnés dans l’historique sont des fichiers de travail locaux, exclus de Git. Les scripts conservés dans `scripts/` permettent de générer de nouveaux rapports dans `artifacts/`.

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
