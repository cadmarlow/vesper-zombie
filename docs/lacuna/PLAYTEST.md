# LACUNA — La Dernière Crue

Carte ajoutée avec la version 5.1.0. Son développement a été isolé dans le dépôt indépendant `artifacts/worktrees/lacuna`, branche `codex/lacuna-v5`, sur la production 5.0.0 (`f6d9ba7`).

## Jouer

Serveur local de cette session : **http://localhost:4195**. Choisir la destination **04 — Lacuna** puis entrer dans la partie.

Pour relancer depuis ce dossier :

```sh
npm run build
VESPER_PORT=4195 node scripts/serve.mjs
```

Le port peut changer si un autre serveur l'utilise ; consulter l'adresse affichée. Les commandes du jeu restent celles de la version 5 : interaction avec **E** ou le bouton tactile contextuel.

La révision du 30 septembre se déroule de nuit, dans une ville dont la quarantaine a échoué. Les thermes servent de morgue improvisée. Les éclairages de secours rouges et les tubes verdâtres balisent les lieux ; la lampe du joueur éclaire les menaces proches. Le courant remet les machines en service sans transformer la nuit en plein jour. L'horloge arrêtée à 06:17 commémore le sinistre, pas l'heure actuelle.

## Le parcours

1. Survivez dans la gare, puis ouvrez la grille d'évacuation pour 750 essences.
2. Rejoignez le Poste des Vannes au nord-ouest pour rétablir le courant.
3. Explorez les deux rives. Sang de Fer est aux thermes, le ravitaillement est réparti sur trois points, la Transfiguration se trouve sous le barrage.
4. Une purge automatique peut se déclencher à partir de la vague 3, une fois le courant rétabli. La pression monte pendant les vagues. Sirène et bandeaux annoncent le quartier touché.
5. Quittez les bandes jaunes avant la purge. Les ponts en pierre et les rues périphériques restent hors des zones de dégâts hydrauliques.

L'empreinte extérieure mesure 144 × 160 mètres. Le canal est inaccessible ; il se traverse par les deux ponts fixes et la passerelle centrale. Le barrage et les reliefs au-delà de la ville sont du décor. Les parcours jouables restent sur un sol continu pour conserver le déplacement et le contrôle tactile du jeu existant.

## Actions propres à LACUNA

| Action                      |                           Coût | Effet                                                                                                   |
| --------------------------- | -----------------------------: | ------------------------------------------------------------------------------------------------------- |
| Vanne 01 — Quai du Carillon |                            350 | 4 secondes d'avertissement, puis 8 secondes de purge locale                                             |
| Vanne 02 — Thermes          |                            350 | Purge de la bande traversant les bains                                                                  |
| Vanne 03 — Ateliers         |                            350 | Purge de la cour de maintenance                                                                         |
| Carillon des Absents        |                            200 | Attire pendant 16 secondes les ennemis alentour vers le quai ; recharge de 70 secondes                  |
| Grande Décrue               | Gratuit après les trois vannes | Enchaîne les trois quartiers, puis accorde 1 000 essences et 2 grenades à chaque joueur, une seule fois |

Les vannes rechargent pendant 58 secondes. Le carillon peut être combiné à une purge. Les boss et les ennemis à moins de quatre mètres d'un joueur restent concentrés sur le combat.

Une purge endommage aussi les joueurs : l'action doit être préparée depuis un endroit sûr. Les éliminations d'une purge manuelle reviennent à son opérateur, y compris en coopération.

Les fortes purges rétractent la passerelle centrale. Sa fermeture attend que les joueurs — y compris les coéquipiers à terre — et les ennemis l'aient libérée. Les deux autres ponts restent utilisables. À la réouverture, la collision ne disparaît qu'une fois le tablier revenu.

L'extraction utilise les règles habituelles : survivez à la vague 10, puis revenez à la balise dans la gare.

## Vérifier

```sh
node --test tests/lacuna.test.js
VESPER_URL=http://localhost:4195 node scripts/lacuna-check.mjs
VESPER_URL=http://localhost:4195 VESPER_WAVE_MAP=lacuna node scripts/waves-check.mjs
node scripts/verify.mjs menu-check smoke touch-native-check coop-check
```

Le test LACUNA contrôle les achats, la navigation, les dégâts, les chemins de secours, le carillon, la récompense unique, la coopération et le cycle de la passerelle. Il produit les captures et un rapport dans `artifacts/lacuna-*`. Le test des vagues inclut sept positions de LACUNA, dont l'arrivée avant ouverture et les quartiers après mise sous tension.

La simulation mobile vérifie le rendu WebGL et l'interface tactile dans Chrome et WebKit sur cet ordinateur. Elle ne mesure pas la fluidité, la chauffe ou l'autonomie d'un téléphone physique.

Après publication, vérifier les interactions en ligne et le relais réellement configuré dans le client avec `VESPER_URL=https://vesper-zombie.vercel.app LACUNA_LIVE_RELAY=1 node scripts/lacuna-check.mjs`. Ce contrôle crée son propre salon et ferme ses deux clients à la fin. Sans cette option explicite, la coopération utilise toujours un relais local temporaire.

Pour reproduire uniquement la revue visuelle, le contrôle de rechargement et le parcours tactile WebKit :

```sh
VESPER_URL=http://localhost:4195 LACUNA_REVIEW_ONLY=1 node scripts/lacuna-check.mjs
```

## Périmètre d’intégration

Les changements de carte commencent au commit `8ff3ff9`, directement après `f6d9ba7`. Le développement précédent, fondé sur une copie de travaux non publiés, est conservé sur l'ancienne branche `codex/lacuna` mais ne fait pas partie de cette nouvelle base.

La carte possède ses modules dans `src/maps/lacuna`. Ses points de raccordement sont limités à l'enregistrement des cartes, au cycle de vie de la partie, aux interactions, à la cible sonore des ennemis, au HUD et à un champ réseau facultatif `mapState`. Les autres cartes ne créent aucun contrôleur LACUNA. Aucun protocole de messages distinct ni commande tactile supplémentaire n'est nécessaire.

Les captures de conception sont une direction artistique. Le rendu joué et testé est celui du moteur Three.js ; les captures de conception ne sont pas des captures du jeu.
