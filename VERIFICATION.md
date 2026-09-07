# VESPER — Vérification

Les rapports et captures mentionnés dans l’historique sont des fichiers de travail locaux, exclus de Git. Les scripts conservés dans `scripts/` permettent de générer de nouveaux rapports dans `artifacts/`.

## Version 2.4.0 — sang et headshots

Vérifiée le 7 septembre 2026 sur la compilation locale avec Node.js 24.20.0. Les captures montrent les effets dans le jeu, avec situations préparées par l’outil de diagnostic. Aucun déploiement Vercel effectué.

- **60 contrôles spécifiques réussis**, sur Chrome ordinateur/mobile émulé et WebKit mobile émulé : tirs réels au corps, headshots non mortels et mortels, destruction de la tête sur les cinq types sans toucher aux voisins, récompenses attribuées une fois, protection des murs, projections sur une surface visible, exclusion des limites invisibles, trois cartes, expiration et libération des ressources. Rapport : `artifacts/blood-1788809175027/report.json`.
- **Charge de 28 zombies**, avec un effet de sang toutes les 80 ms pendant 12 secondes à Néréide : médiane arrondie de 60 images/s, 95e percentile de 18 ms sur ordinateur et 17,9 ms sur mobile émulé. Résolution adaptative active, ratios observés 1,35 et 2. Cette charge déclenche les effets et conserve les ennemis pour maintenir la horde ; elle ne simule pas 28 éliminations simultanées. Ces chiffres sont mesurés sur ce Mac et ne mesurent pas un téléphone physique.
- **600 projections consécutives par profil** sans croissance des allocations GPU après chauffe. Réserves : 180 gouttes/fragments, 12 brumes et 80 traces sur ordinateur ; 96, 6 et 40 sur mobile. Trois géométries et deux textures réutilisées ; les traces durent 18–26 secondes et s’effacent progressivement. Toutes les ressources propres au sang sont libérées au menu.
- **29 contrôles de mémoire/effets** et **34 contrôles de combat/audio** réussis : headshots répétés, disparition des corps, changements de qualité, couteau, collisions et commandes tactiles. Les textures GPU restent à 84 sur ordinateur et 78 sur mobile après chacun des trois cycles de horde. Rapports : `artifacts/graphics-lifecycle-1788809244154/` et `artifacts/feel-1788809273836/`.
- Une erreur WebKit de texture d’ombre pendant le chargement a été corrigée : la boucle d’affichage attend désormais que la scène soit prête. Aucun message d’erreur JavaScript ou shader dans les rapports finaux. Les captures WebKit attendent trois images rendues pour éviter de photographier l’image précédente après un changement diagnostic ; **20 contrôles WebKit rejoués** avec ces captures : `artifacts/blood-1788809539855/`.
- Compilation finale **2.4.0**, **12 tests unitaires**, formatage des fichiers de code modifiés et `git diff --check` réussis. Aucun ajout de dépendance ou d’asset externe. Le module du jeu passe à environ 54 Ko compressés ; l’avertissement de taille du module Three.js préexistant reste présent.

Reproduction : `npm run build`, `npm start`, puis `npm run test:blood`. `VESPER_BLOOD_PROFILE=webkit-mobile npm run test:blood` limite le contrôle à WebKit. Les suites GPU se lancent séquentiellement.

## Version 2.3.0 — architecture, matières et fluidité

Vérifiée le 7 septembre 2026 sur la compilation locale, construite avec Node.js 24.20.0 et servie sur `http://localhost:4173`. Les captures montrent le rendu WebGL du jeu. Galerie des trois cartes et de la horde : `artifacts/remaster-1788797399714/gallery.html` ; gros plans des personnages : `artifacts/zombies-1788797322619/gallery.html`.

### Rendu et charge

Le nouveau contrôle `npm run test:remaster` couvre **18 scénarios**, soit trois cartes × trois qualités × ordinateur/mobile émulé, avec 28 ennemis de cinq types, portes ouvertes et électricité rétablie. Les mesures portent sur 90 images, après 12 secondes de charge en qualité élevée. La résolution adaptative est active : ses ratios effectifs figurent dans le rapport, ce ne sont pas des mesures à résolution fixe.

| Carte | Ordinateur élevé | Ordinateur équilibré / performance | Mobile émulé élevé / équilibré / performance |
| --- | --- | --- | --- |
| Abbaye | 56 images/s | 60 / 60 | 60 / 60 / 60 |
| Boréal | 53 images/s | 60 / 60 | 60 / 60 / 60 |
| Néréide | 60 images/s | 60 / 60 | 61 / 61 / 60 |

Valeurs médianes arrondies sur ce Mac. Ordinateur : 1440 × 900 CSS, DPR 1,5, ratios élevés observés 1,13 / 1,27 / 1,42, GTAO actif. Mobile : 844 × 390 CSS, DPR 3, rendu plafonné à 2× en élevé, GTAO désactivé. Le 95e percentile atteint **22,3 ms** sur ordinateur élevé et **18,6 ms** sur mobile émulé. Le mode élevé ne tient donc pas constamment 60 images/s sur les deux premières cartes dans cette charge ; les modes équilibré et performance restent à environ 60.

En élevé, environ 740 / 804 / 915 appels de dessin et 3,27 / 3,26 / 3,40 millions de triangles par image sur ordinateur ; 368 / 389 / 449 appels et 0,96 / 0,93 / 1,02 million de triangles sur mobile. Les chiffres incluent les différentes passes. Les lampes sont plafonnées à dix sur les deux premières cartes, huit à Néréide et six sur mobile. Les géométries de zombies sont indexées : environ 23 500–29 700 sommets sur ordinateur et 13 700–15 900 sur mobile, soit environ 70–75 % de sommets en moins à animer que les mêmes modèles non indexés. Les triangles et les attributs des coutures restent conservés.

**28 contrôles de rendu réussis** : sonde de reflet propre à chaque carte, exclusion et restauration des sprites dans l’occlusion, regroupement des grilles, calcul unique des ombres par image, réponse de la résolution adaptative desktop, désactivation volontaire de celle-ci, libération de la sonde et des ombres de contact au retour au menu. Aucune erreur JavaScript ou shader dans ce rapport.

### Personnages, mémoire et jeu

- **22 contrôles des zombies** réussis sur la compilation finale, avec 50 captures : cinq modèles, ordinateur/mobile, gros plans, poses d’attaque et captures de combat. Mâchoires indépendantes, ouverture pendant l’attaque, impacts à la tête et chargement des textures dans les qualités élevée et performance. Les yeux, dents, silhouette, semelles et plusieurs vues de combat ont été inspectés visuellement. Rapport : `artifacts/zombies-1788797322619/report.json`.
- **29 contrôles de mémoire et effets** réussis sur la compilation finale : trois cycles de dix zombies sur chaque profil, disparition des corps, squelettes indépendants, 8 000 particules réutilisant les réserves, tir réel avec douille et impact au sol, changements de qualité. Après chaque cycle : 198 géométries / 82 textures GPU sur ordinateur ; 163 / 76 sur mobile. Rapport : `artifacts/graphics-lifecycle-1788797370872/report.json`.
- **190 vagues terminées**, dans 19 scénarios couvrant les trois cartes, sans apparition invalide ni blocage : `artifacts/waves-regression-1788796547200.json`.
- **75 contrôles tactiles**, dont déplacement/caméra/tir simultanés sur les trois cartes, annulation des contacts, rotation, actions et profils WebKit iPhone/iPad : `artifacts/touch-native-1788796401878/report.json`.
- **34 contrôles de sensations et audio**, **21 contrôles de livraison** et **41 contrôles de Néréide** réussis. Rapports : `artifacts/feel-1788796381646/`, `artifacts/release-1788796548235/`, `artifacts/abyss-1788796765874/`. Le contrôle des changements de carte chauffe les deux ensembles de textures avant la première mesure ; leur premier chargement ne constitue pas une fuite. Après trois retours à Néréide : 105 textures sur ordinateur et 99 sur mobile, sans progression.
- Compilation, **12 tests unitaires**, formatage des sources/scripts et `git diff --check` réussis. L’avertissement Vite sur le module Three.js reste présent : environ 589 Ko minifiés, 149 Ko compressés. Aucun ajout de dépendance.

Les contrôles de vagues, commandes, audio, livraison et Néréide ont été exécutés pendant la refonte. Les suites de personnages, mémoire et charge ont été rejouées après les dernières retouches de géométrie, l’indexation et le réglage des lumières.

### Ressources et limites

Quatre matériaux scannés supplémentaires et un vitrail original sont fournis localement, en 512px et 1024px selon le profil. Les nouveaux fichiers publics occupent ensemble environ 4 Mio pour les deux résolutions ; seuls ceux nécessaires à la carte et au profil sont chargés. Sources, licences et prompt imagegen : `ASSETS.md` et `artwork/architecture/PROMPTS.md`.

Les personnages et armes restent des modèles procéduraux : cette version ne constitue pas une production photoréaliste AAA équivalente à Call of Duty. Les reflets du décor proviennent d’une capture au chargement, sans mise à jour des ennemis ou de l’électricité ; il ne s’agit pas de ray tracing. Les essais mobiles sont des émulations sur Mac, sans validation de chauffe ou de fluidité sur téléphone physique. Les contrôles de cette version portent sur le build local ; **aucun commit, push ou déploiement Vercel n’a été effectué**.

## Contrôle avant mise en ligne — 7 septembre 2026

La compilation 2.2.0 a été reconstruite avec Node.js 24.20.0 puis testée sur `http://localhost:4173`, avec les commandes et interfaces de production, sans accès de diagnostic au moteur. La suite `scripts/online-check.mjs` couvre maintenant les trois cartes.

- **267 contrôles réussis**, soit 21 démarrages (trois cartes × sept profils) : Chrome ordinateur et Pixel 7 émulé ; WebKit ordinateur, iPhone SE, iPhone 13, iPhone paysage et iPad émulés. Tir/recharge/visée lorsque la capture souris ou le tactile est disponible, grenades, accroupissement, audio, pause, réglages graphiques, rotation, retour au menu et sauvegarde. Rapport : `artifacts/online-1788788810917/report.json`.
- Aucune erreur JavaScript/WebGL, aucune ressource en échec et aucune requête tierce. Compilation, douze tests unitaires, formatage du script et `git diff --check` réussis.
- **Limites** : WebKit automatisé refuse la capture souris sur ordinateur ; le tir et la visée à la souris sur Safari desktop restent à confirmer. Les téléphones/tablettes sont émulés sur Mac : fluidité, chauffe et comportement prolongé sur appareils physiques restent à vérifier. Ces essais portent sur la compilation locale et ne valident pas encore une URL publique déployée.

Le dépôt contient encore des fichiers nouveaux non suivis, notamment les modules 3D et les textures sous `src/` et `public/`. Ils doivent être inclus avec les modifications existantes dans le commit envoyé. Aucun commit, push ou déploiement public n’a été effectué pendant ce contrôle.

## Version 2.2.0 — Néréide, Les Jardins Abyssaux

Vérifiée le 7 septembre 2026 sur la compilation locale avec Node.js 24.20.0. La troisième carte est intégrée au menu, à la progression, aux archives et aux commandes ordinateur/mobile. Emprise : 72 × 88 mètres contre 48 × 58 pour chacune des deux cartes existantes ; cinq secteurs, trois sas et trois journaux facultatifs.

- **41 contrôles spécifiques et 24 captures**, sur ordinateur Retina et mobile paysage émulé : sélection et illustration, grille de navigation élargie à 96 cellules, achats des trois sas, refus si le solde est insuffisant, collisions, points d’apparition, accès à toutes les machines et archives pour les deux tailles d’ennemis, allumage des quatre circuits, extraction à la balise propre à Néréide, victoire enregistrée et retour au menu. Captures des différents secteurs inspectées. Rapport final : `artifacts/abyss-1788780535161/report.json`.
- **190 vagues terminées**, soit 19 scénarios de dix vagues sur les trois cartes, dont sept scénarios de Néréide. Les cinq types de zombies sont couverts ; aucune apparition invalide, aucun blocage et aucun ennemi restant. Le défenseur de test élimine uniquement les ennemis à moins de 3,2 mètres avec une ligne de tir libre. Les configurations comprennent les secteurs fermés, l’Atelier ouvert et le Belvédère ouvert avec l’Atelier fermé. Rapport : `artifacts/waves-regression-1788779996665.json`.
- **75 contrôles tactiles** : déplacements, caméra et tirs simultanés par événements CDP sur les trois cartes, relâchement, annulation système, saut, course, accroupissement, recharge et rotation avec pause. Néréide démarre et répond au tir, à la recharge, à la pause et à l’aide sur WebKit aux formats iPhone SE, iPhone 13 et iPad. Rapport : `artifacts/touch-native-1788780032648/report.json`.
- **391 formats de menu** validés après correction des textes dans les cartes : aucun débordement horizontal, aucun chevauchement entre lancement, destinations et pied de page, titres contenus dans les cartes et numéros dégagés. Rapport final : `artifacts/menu-audit-1788780528465/report.json`.
- **Horde mixte de 28 ennemis**, six scénarios (trois qualités × ordinateur/mobile émulé). Sur ce Mac : médianes de 58 / 60 / 60 images/s sur ordinateur, 60 / 60 / 60 sur mobile émulé. Temps au 95e percentile : 19 ms au maximum sur ordinateur, 17,7 ms sur mobile émulé. En qualité élevée, environ 4,41 millions de triangles toutes passes incluses sur ordinateur et 1,32 million sur mobile ; plafonds respectifs de huit et six lumières ponctuelles. Les spécimens sont regroupés par matériau et le feuillage est instancié. Ces valeurs proviennent du rapport final Néréide ci-dessus.
- **Mémoire stable après changements de carte** : trois chargements de Néréide alternés avec le Complexe Boréal, sur chaque profil. Après chaque retour : 197 géométries / 76 textures GPU sur ordinateur ; 200 / 71 sur mobile. Le contrôle a permis de corriger la libération des cibles de rendu des ombres lorsque l’ancienne carte est détruite. Aucune erreur JavaScript, shader ou ressource lors du contrôle final.
- **41 contrôles d’intégration et 34 de sensations/audio** réussis : `artifacts/verification-1788780004713/test-results.json`, `artifacts/feel-1788780097011/report.json`. Les trois musiques ont été rendues hors ligne et sont différentes. La nouvelle composition a un signal non nul et une crête de 0,482 avant volume général ; ce contrôle numérique ne remplace pas une écoute sur téléphone.
- Compilation de production, douze tests unitaires, formatage et `git diff --check` réussis. L’illustration WebP de Néréide ajoute 259 Kio aux fichiers publics ; sa source et son prompt sont dans `artwork/abyss/`. Les textures PBR et de personnages sont réutilisées. L’avertissement de taille du module Three.js demeure. Aucun déploiement public effectué.

Les tests de progression, gestes et musique précèdent les derniers ajustements du menu, le regroupement des spécimens et la correction de libération des ombres ; les contrôles du menu, de rendu, d’interaction et de changement de carte ont été rejoués sur la compilation finale. Les mesures mobiles sont des émulations sur Mac, pas des mesures sur iPhone ou Android physique. Les visuels du menu sont des illustrations ; les captures de `artifacts/abyss-1788780535161/` montrent le rendu 3D du jeu.

Reproduction : `npm run build`, `npm start`, puis `npm run test:abyss`. Le regroupement `npm run test:upgrade` inclut maintenant Néréide. Les contrôles GPU sont exécutés séquentiellement.

## Version 2.1.0 — correction et refonte des zombies

Vérifiée le 6 septembre 2026 sur la compilation locale avec Node.js 24.20.0. Le défaut signalé était réel : les dents et la cavité étaient partiellement enfouies dans le crâne fermé. Les anciennes captures de groupe ne constituaient pas un contrôle suffisant des visages.

- **50 captures des cinq types**, sur ordinateur et mobile émulé : face, trois quarts avec mâchoire ouverte, corps entier et distance de combat dans les deux cartes. Les images rapprochées et les captures en jeu ont été inspectées ; une excroissance du Porte-peste qui empiétait sur la bouche a été déplacée après inspection. Galerie finale : `artifacts/zombies-1788711826390/gallery.html`, résultats : `artifacts/zombies-1788711826390/report.json`.
- **20 scénarios spécifiques**, cinq types × deux qualités (élevée/Performance) × ordinateur/mobile : l’attaque ouvre la mâchoire, un tir dirigé vers la tête visible produit un headshot, et les deux textures de personnage sont présentes à la bonne résolution. Les cinq mâchoires bougent indépendamment pendant le jeu. Aucune erreur JavaScript, shader ou ressource.
- **41 contrôles d’intégration**, **60 contrôles tactiles** (Chrome et WebKit émulant iPhone/iPad) et **29 contrôles de mémoire/effets** réussis. Rapports : `artifacts/verification-1788711635537/`, `artifacts/touch-native-1788711664411/`, `artifacts/graphics-lifecycle-1788711609241/`. Ces suites ont précédé l’ultime déplacement des excroissances du Porte-peste ; les captures, attaques/headshots des cinq types et mesures de charge ont été rejoués après ce déplacement.
- **Mémoire stable** après trois cycles de dix zombies : 62 textures GPU sur ordinateur et 56 sur mobile à chaque cycle après disparition des corps/bonus. Les squelettes sont indépendants et libérés. Les matériaux et les deux nouvelles textures restent partagés dans la horde.
- **12 scènes avec 28 ennemis de types mélangés** : deux cartes × trois qualités × ordinateur/mobile émulé. Médianes arrondies de **60–61 images/s**, 95e percentile de **18,5 ms au maximum** sur ce Mac. Rapport : `artifacts/visual-1788711863330/report.json`. En qualité élevée, environ 4,00 / 3,94 millions de triangles par image sur ordinateur et 1,14 / 1,08 million sur mobile (abbaye/station, toutes passes incluses). Le scénario contient maintenant une horde mixte, ce qui diffère du remplissage surtout composé d’Égarés utilisé auparavant.
- **Géométries mobiles** : environ 14 300–17 800 triangles par personnage contre 29 500–39 700 sur ordinateur, six surfaces regroupées par personnage. Les bouches, dents et textures de visage sont conservées dans les variantes légères.
- **Chargement local** : dix-sept cartes de texture par profil, dont les deux albedos des personnages. Leur ajout représente 132 Kio en 512px sur mobile ou 546 Kio en 1024px sur ordinateur. Les images originales et prompts se trouvent dans `artwork/creatures/`, hors du dossier public.
- Compilation, douze tests unitaires, formatage des sources modifiées et `git diff --check` réussis. Version du menu et des manifestes : **2.1.0**. Aucun déploiement public effectué.

Les performances mobiles ci-dessus sont des émulations sur Mac, pas des mesures sur téléphone physique. Le rendu utilise toujours les modèles procéduraux du jeu ; les textures générées ne constituent pas des personnages scannés. Les portraits de contrôle emploient un éclairage de studio, explicitement distingué des captures de combat dans la galerie.

## Version 2.0.0 — refonte graphique

Vérifiée le 6 septembre 2026 sur la compilation locale, construite avec **Node.js 24.20.0**. Les ressources 3D, shaders et textures sont ceux du build distribué, avec observation dans la page de test uniquement. Aucun déploiement public n’a été effectué.

- **383 contrôles** au total : 12 tests unitaires, 41 contrôles d’intégration, 33 de sensations, 60 tactiles, 21 de livraison, 187 Chrome/WebKit et 29 de mémoire/effets. Les suites gameplay/tactile/progression ont été validées pendant la refonte ; l’intégration, Chrome/WebKit et la mémoire ont été rejoués après la dernière optimisation des matériaux et du modèle du Reliquaire.
- **120 vagues** terminées sur les deux cartes, grille ouverte/fermée et plusieurs positions du joueur : aucune apparition invalide ou vague bloquée. Rapport : `artifacts/waves-regression-1788707928339.json`.
- **12 scénarios graphiques avec 28 ennemis**, deux cartes × trois qualités × ordinateur/mobile émulé. Ordinateur : 1440 × 900 CSS, DPR 2, rendu élevé plafonné à 2,6 millions de pixels, GTAO à demi-résolution. Mobile : 844 × 390 CSS, DPR 3, rendu élevé à 2×, textures de 512px, géométrie réduite, six lumières ponctuelles et GTAO désactivé. Résultats : médianes arrondies de **60–61 images/s**, temps d’image au 95e percentile de **18,7 ms au maximum**, sans erreur de shader. Rapport : `artifacts/visual-1788708374166/report.json`.
- En qualité élevée, environ **734 000 / 692 000 triangles** par image pour les scènes mobiles de l’abbaye/station, contre environ 1,74 million avant l’allégement de cette refonte. Le regroupement des teintes des personnages réduit également les appels de dessin. Ces valeurs incluent les passes de rendu du scénario testé.
- **Mémoire GPU stable après les hordes** : trois cycles de dix zombies sur chaque profil. Après disparition des corps et bonus, 61 textures GPU sur ordinateur et 55 sur mobile à chaque cycle. 8 000 éclats par profil réutilisent les géométries existantes. Tirs vers le sol, douilles, marques d’impact, indépendance des squelettes et changements de qualité validés. Rapport : `artifacts/graphics-lifecycle-1788708133881/report.json`.
- **Ressources locales** : quinze cartes de texture chargées par profil ; 896 Kio de WebP en 512px sur mobile et 3 777 Kio en 1024px sur ordinateur. Aucune requête tierce ni ressource en échec pendant les 187 contrôles finaux. Provenance CC0 documentée dans `ASSETS.md`.
- **Commandes tactiles** : deux contacts CDP simultanés pour marcher, regarder et tirer ; annulation système, rotation, sprint, accroupissement, rechargement et reprise vérifiés. Cibles accessibles de 568 × 320 à 1080 × 810, encoche et indicateur d’accueil simulés. WebKit couvre les formats iPhone SE, iPhone 13 et iPad. Rapport : `artifacts/touch-native-1788707825454/report.json`.
- Six armes et animations de chargeur capturées sur ordinateur/mobile, deux cartes inspectées. Le fusil de précision disparaît correctement dans la lunette ; le modèle proposé par le Reliquaire n’inclut pas les mains du joueur.
- Galerie finale, qualité élevée explicitement rétablie avant chaque carte : `artifacts/visual-1788708745298/` (ordinateur Retina et mobile paysage, six armes, rechargement et cinq types d’ennemis).
- Compilation de production, contrôle de formatage et `git diff --check` réussis. L’avertissement Vite sur la taille du module Three.js demeure (environ 149 Ko compressés), sans erreur de build. Les outils d’audit ne sont pas distribués.

Rapports complémentaires : `artifacts/verification-1788708163079/test-results.json`, `artifacts/feel-1788707810158/report.json`, `artifacts/release-1788707878569/report.json`, `artifacts/online-1788708191813/report.json`.

**Limites de mesure :** les performances sont celles de Chrome sur ce Mac, avec émulation pour le mobile. Elles ne mesurent pas un GPU de téléphone, la chauffe ou une partie prolongée sur appareil physique. Le WebKit automatisé refuse toujours la capture souris sur ordinateur : tir/visée à la souris y restent non validés, mais sont couverts par Chrome ; les équivalents tactiles passent sur WebKit. Les corps utilisent une animation de chute, les ombres de contact au sol sont simulées et les flaques utilisent l’environnement ; il ne s’agit pas de ragdolls physiques, de lumière globale temps réel ou de reflets SSR.

Reproduction : `npm run build`, serveurs `node scripts/serve.mjs` et `npm run dev`, puis `npm run test:upgrade` et `npm run test:visual` (séquentiellement pour les mesures GPU).

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
