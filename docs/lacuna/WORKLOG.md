# LACUNA — travail isolé

- Dépôt indépendant : `artifacts/worktrees/lacuna`, branche **`codex/lacuna-v5`**.
- Base actuelle : **production 5.0.0, `f6d9ba751734f24ebb0a4f7e8a953958171ee486`**, revérifiée sur GitHub le 30 septembre 2026. Le commit LACUNA initial a été reporté sur cette version, sans reprendre le correctif provisoire du chantier des armes.
- Ancienne sauvegarde conservée : branche `codex/lacuna`, tag `lacuna-baseline`. Ne pas utiliser ces anciennes bases pour intégrer la carte.
- Aucun déploiement ni fusion dans le dépôt de production.
- Direction retenue : ville thermale alpine, barrage monumental, danger hydraulique, trois quartiers de purge, deux ponts permanents et une passerelle mobile. Le train appartient à une future carte distincte.
- Objectif : carte jouable sur desktop et mobile, mécanique hydraulique synchronisée en coopération, lecture claire des dangers, navigation vérifiée et réglages graphiques adaptés.
- Serveur de test courant : **http://localhost:4195**. Le relais de test utilise un port temporaire et s'arrête après les vérifications.

Les proportions ont été vérifiées dans le moteur. La première direction lumineuse a été rejetée au playtest : la révision du 30 septembre remplace le matin alpin par une nuit de quarantaine. Les captures de conception initiales ne représentent plus l'ambiance livrée.

## Refonte horreur — 30 septembre

- Nuit à 03:17 ; l'horloge du carillon reste figée à 06:17, heure du sinistre. Ciel d'orage, lune voilée, eau noire, brouillard bas et balises rouges sur le barrage.
- Lumière locale : postes de secours rouges, tubes verdâtres dans les thermes, quais éclairés autour des vannes et des traversées. Le budget existant limite les lumières actives à six sur mobile.
- Quarantaine lisible dès l'arrivée : affiches sanitaires, avertissements, empreintes ensanglantées, traînées au sol, sacs mortuaires, brancards et rideaux d'isolement aux thermes. Façades tachées, fenêtres condamnées ou brisées, végétation morte et câbles affaissés.
- Les nouveaux détails restent à l'écart des grands parcours, au sol ou sur des volumes déjà solides. La navigation et les règles hydrauliques sont conservées.
- Son : vent dans les conduites, tensions du métal, coups sourds espacés et gouttes dans les espaces couverts. Toutes les nouvelles voix passent par le bus audio de LACUNA, avec pause et libération à la sortie.
- La vignette de destination utilise désormais une capture du moteur dans cette ambiance nocturne.
- Revue effectuée à hauteur de joueur et dans WebKit avec un profil iPhone ; les captures de combat incluent deux ennemis pour contrôler leur lisibilité.
- Validation finale : **114 tests unitaires et 56 contrôles LACUNA réussis**, couvrant les interactions sur desktop/mobile, la coopération, la pause et la destruction des voix audio actives, le rechargement et WebKit. Aucune erreur JavaScript/WebGL ; 181 textures et 651 géométries avant comme après rechargement. Rapports : `artifacts/lacuna-night-unit.log` et `artifacts/lacuna-night-final/report.json`.

## État au 26 septembre

- Carte enregistrée et démarrée dans le moteur, desktop et mobile simulé.
- Trois purges, passerelle avec détection d'occupation, deux ponts permanents, Grande Décrue, récompense unique.
- Carillon : leurre temporaire vers le quai ; les ennemis au contact et les boss continuent à combattre.
- Atouts distribués entre les quartiers, trois ravitaillements, archive, extraction.
- Interface hydraulique et direction de l'objectif. Atlas commun aux enseignes, passerelle fusionnée par matériau, détails réglables selon qualité.
- Tests de navigation pour rayons 0,36 et 0,60 m, achats, dégâts, cycles et récompenses : passés sur desktop et mobile simulé.
- Base : **114 tests sur 114 passés**, vérification de format, syntaxe, imports et build de production réussis.
- Menu : **391 combinaisons de viewport** validées, dont le menu à quatre destinations en portrait.
- Régression : **41 contrôles d'intégration**, commandes tactiles Chrome/WebKit et coopération existante validés.
- LACUNA : **70 vagues** dans sept positions, tous les types d'ennemis et l'Archonte, sans apparition invalide ni blocage de progression.
- Coop LACUNA : grille, courant, achats, propriétaire des purges, présence d'un joueur distant sur la passerelle, fermeture, dégâts et pause vérifiés entre deux navigateurs.
- WebKit, profil iPhone 13 : sélection en portrait, rotation, lancement, purge, tir tactile et pause validés, sans erreur JavaScript ni WebGL.
- Rechargement LACUNA : audio précédent libéré ; même nombre de textures et de géométries GPU avant et après rechargement. Le retour à une ancienne carte retire le contrôleur hydraulique et rétablit sa distance de vue.
- Dernière revue visuelle : correction des faces des montagnes, du raccord de terrain et du ciel à grande distance ; captures issues du moteur, pas des concepts.

Les commandes et le parcours sont dans [PLAYTEST.md](PLAYTEST.md). Les rapports détaillés restent dans le dossier local `artifacts/`, ignoré par Git. La fluidité, la chauffe et l'autonomie sur téléphone physique restent à mesurer lors du playtest matériel.
