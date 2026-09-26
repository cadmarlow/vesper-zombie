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
- Base : 112 tests passés avant ajout des tests du relais et du carillon ; vérification finale à relancer après les dernières modifications.
- Coop : premier test interrompu par une valeur de délai artificielle hors limites réseau dans le script de test (corrigée de 1 000 000 à 6 000 secondes). Les essais coopératifs doivent être terminés.
