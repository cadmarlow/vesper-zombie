# LACUNA — travail isolé

- Dépôt indépendant : `artifacts/worktrees/lacuna`, branche **`codex/lacuna-v5`**.
- Base actuelle : **production 5.0.0, `f6d9ba751734f24ebb0a4f7e8a953958171ee486`**, vérifiée sur GitHub le 26 septembre 2026. Le commit LACUNA initial a été reporté sur cette version, sans reprendre le correctif provisoire du chantier des armes.
- Ancienne sauvegarde conservée : branche `codex/lacuna`, tag `lacuna-baseline`. Ne pas utiliser ces anciennes bases pour intégrer la carte.
- Aucun déploiement ni fusion dans le dépôt de production.
- Direction retenue : ville thermale alpine, barrage monumental, danger hydraulique, trois quartiers de purge, deux ponts permanents et une passerelle mobile. Le train appartient à une future carte distincte.
- Objectif : carte jouable sur desktop et mobile, mécanique hydraulique synchronisée en coopération, lecture claire des dangers, navigation vérifiée et réglages graphiques adaptés.
- Serveur de test courant : **http://localhost:4195**. Le relais de test utilise un port temporaire et s'arrête après les vérifications.

Les proportions et l'éclairage sont validés dans le moteur. Les concepts illustrent la direction artistique, sans constituer une promesse de rendu ou de performances sur un téléphone réel.

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
