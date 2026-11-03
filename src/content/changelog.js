// Player-facing release notes, newest first. The first entry must match the
// version in package.json (tests/changelog.test.js); its title and highlights
// are also published in version.json so an open game can announce them.
export const RELEASES = [
  {
    version: "5.3.0",
    date: "2026-11-03",
    title: "Reliques et Toniques",
    tagline: "Des objets à reconnaître. Des machines à découvrir.",
    art: "/art/abbey.webp",
    highlights: [
      "Quatre bonus remodelés en véritables objets 3D",
      "Quatre distributeurs d’atouts avec leur propre identité",
    ],
    sections: [
      {
        title: "Des reliques dans la nuit",
        items: [
          "La vitalité prend la forme d’une trousse médicale ; les munitions, d’une caisse chargée de cartouches. Les essences doubles deviennent des médaillons ×2 et la mort instantanée, un crâne dans son reliquaire.",
          "Métaux, fermoirs, gravures et surfaces patinées remplacent les losanges. Une lévitation lente et une empreinte lumineuse au sol permettent de repérer chaque bonus.",
        ],
      },
      {
        title: "Les Toniques de Vesper",
        items: [
          "Sang de fer adopte une carrosserie médicale rouge et crème ; Nerfs d’acier, une pompe à tonique ambrée ; Main de fer, un distributeur balistique à tambours ; l’Œil du Veilleur, une console optique turquoise.",
          "Bouteilles, manomètres, monnayeurs, grilles et plaques de prix sont intégrés aux façades. Les emblèmes et témoins s’allument progressivement lorsque le courant revient.",
          "Les modèles sont préparés avant le combat et disposent de versions allégées sur mobile. Les bonus sont également visibles sous leur nouvelle forme en coopération.",
        ],
      },
    ],
  },
  {
    version: "5.2.1",
    date: "2026-11-02",
    title: "Une molette plus fiable",
    tagline: "Gardez la bonne arme en main.",
    art: "/art/abbey.webp",
    highlights: ["Changement d’arme à la molette plus fiable sur ordinateur"],
    sections: [
      {
        title: "Commandes à la souris",
        items: [
          "Les petits mouvements parasites, défilements horizontaux et gestes de zoom sont filtrés avant de changer d’arme.",
          "Un geste de molette sélectionne une seule arme, même s’il produit plusieurs événements ou une traînée d’inertie. Un nouveau geste permet de revenir à l’autre arme.",
          "La molette commande les armes lorsque la souris est capturée dans la partie, en marchant comme en courant.",
        ],
      },
    ],
  },
  {
    version: "5.2.0",
    date: "2026-11-02",
    title: "La Horde vivante",
    tagline: "Lisez leurs approches. Déjouez leurs assauts.",
    art: "/art/abbey.webp",
    highlights: [
      "Assauts composés sur les quatre cartes",
      "Interceptions, débordements et appuis à distance",
      "Cibles plus stables et pression répartie en coopération",
    ],
    sections: [
      {
        title: "Des approches différentes",
        items: [
          "Les vagues alternent poussées frontales, pinces légères et harcèlement, avec des arrivées groupées et de courtes respirations. Les types d’ennemis se débloquent aux mêmes manches.",
          "Certains Affamés interceptent brièvement votre trajectoire ; des Rémanents et Affamés débordent par des passages accessibles. Un changement de direction peut les tromper.",
          "Les Porte-peste prennent temporairement position pour cracher, puis reprennent leur poursuite. La foule tient mieux compte de la taille de chaque corps.",
        ],
      },
      {
        title: "Une pression lisible",
        items: [
          "Les cibles restent stables et les approches tactiques sont limitées par joueur. Les bonds et crachats s’espacent ; après des dégâts ou une mise à terre, les nouvelles menaces spéciales laissent un court répit.",
          "Les apparitions respectent une distance de sécurité par rapport à tous les survivants. Les changements de porte, les purges et le carillon de LACUNA sont pris en compte.",
          "Les deux derniers ennemis reviennent à la poursuite directe, avec leur course de fin de manche. Les intentions et leurs avertissements sonores sont synchronisés en coopération.",
        ],
      },
    ],
  },
  {
    version: "5.1.3",
    date: "2026-11-02",
    title: "Une fin de vague plus nerveuse",
    tagline: "Les derniers égarés vous rejoignent. Le combat reste dégagé.",
    art: "/art/lacuna.webp",
    highlights: [
      "Les deux derniers zombies courent vers les survivants",
      "Messages compacts et brefs en haut à droite",
    ],
    sections: [
      {
        title: "Rythme des manches",
        items: [
          "Une fois tous les ennemis apparus, les deux derniers zombies encore debout passent à la course, dès la première vague, en solo et en coopération. Les boss et les rampants conservent leur déplacement propre.",
          "Le contournement des angles très serrés est corrigé : un dernier ennemi ne reste plus immobilisé à une fraction de millimètre de son prochain point de passage.",
        ],
      },
      {
        title: "Un écran dégagé",
        items: [
          "Les annonces de vague, bonus, achats et ravitaillements partagent une petite notification en haut à droite. Elle disparaît après environ deux secondes et les messages identiques ne prolongent plus son affichage.",
          "Les invites de porte et de machine ainsi que les aides de LACUNA rejoignent la même colonne. Le bouton tactile reste accessible tant que l’action est disponible.",
        ],
      },
    ],
  },
  {
    version: "5.1.2",
    date: "2026-10-03",
    title: "LACUNA — Guidage synchronisé",
    tagline: "Les aides restent masquées lorsque vous les désactivez.",
    art: "/art/lacuna.webp",
    highlights: ["Croix et paramètres des aides correctement synchronisés"],
    sections: [
      {
        title: "Correctif",
        items: [
          "La croix masque durablement le guidage et désactive son option, y compris sur iPhone.",
          "Le réglage agit immédiatement. Les réglages par défaut réactivent les aides ; votre choix est conservé entre les parties.",
        ],
      },
    ],
  },
  {
    version: "5.1.1",
    date: "2026-10-03",
    title: "LACUNA — Aides à la carte",
    tagline: "Choisissez quand afficher le guidage de LACUNA.",
    art: "/art/lacuna.webp",
    highlights: ["Aides masquables avec la croix ou dans les paramètres"],
    sections: [
      {
        title: "Affichage",
        items: [
          "Les aides de LACUNA sont activées par défaut. La croix les masque ; sur ordinateur, appuyez sur Échap pour libérer le curseur.",
          "Activez ou désactivez « Aides de LACUNA » dans les paramètres. Votre choix est conservé sur cet appareil.",
        ],
      },
    ],
  },
  {
    version: "5.1.0",
    date: "2026-10-03",
    title: "LACUNA — La Dernière Crue",
    tagline:
      "Une ville en quarantaine, un barrage sous pression et des morts que les eaux ne retiennent plus.",
    art: "/art/lacuna.webp",
    highlights: [
      "Une quatrième carte : LACUNA, de nuit",
      "Trois vannes et des crues meurtrières",
      "Un carillon pour attirer la horde",
      "La Grande Décrue, en solo ou en coopération",
    ],
    sections: [
      {
        title: "La vallée condamnée",
        items: [
          "Explorez les deux rives d’une ville thermale alpine dominée par un barrage : quais, bains transformés en morgue et ateliers de maintenance.",
          "Nuit d’orage, brouillard bas, éclairages de secours, traces de quarantaine et bruits dans les conduites.",
          "Atouts, ravitaillements et Transfiguration sont répartis dans la ville : préparez vos traversées.",
        ],
      },
      {
        title: "Le barrage se réveille",
        items: [
          "Rétablissez le courant. À partir de la vague 3, la pression monte pendant les combats : les sirènes annoncent le quartier à évacuer.",
          "Actionnez les vannes pour purger les quais, les thermes ou les ateliers. L’eau frappe aussi les survivants : quittez les bandes jaunes.",
          "Les fortes purges rétractent la passerelle centrale une fois libérée ; les deux ponts de pierre restent praticables.",
        ],
      },
      {
        title: "Retourner la ville contre la horde",
        items: [
          "Faites sonner le Carillon des Absents pour attirer les zombies vers le quai, puis déclenchez une purge. Les boss et les ennemis déjà au contact continuent à vous poursuivre.",
          "Utilisez les trois vannes pour débloquer la Grande Décrue au carillon. Elle enchaîne les trois quartiers et récompense une fois chaque survivant : 1 000 essences et 2 grenades, dans la limite de 5.",
          "Les vannes, la passerelle et le carillon sont synchronisés en coopération. L’extraction reste disponible après la vague 10 et le rétablissement du courant.",
        ],
      },
    ],
  },
  {
    version: "5.0.0",
    date: "2026-09-26",
    title: "L’Armurerie",
    tagline:
      "Six armes refaites pièce par pièce, tenues par de vraies mains, avec l’ambition d’un jeu AAA.",
    art: "/art/abbey.webp",
    highlights: [
      "Six armes modélisées à l’échelle réelle",
      "Bras et mains qui tiennent vraiment l’arme",
      "Rechargements complets et visibles",
      "Viseurs, lunette et sons entièrement refaits",
    ],
    sections: [
      {
        title: "Armes",
        items: [
          "Vigile .45, Spectre 9, Marauder, Requiem-12, Longinus et Éclipse modélisés pièce par pièce : glissière, culasse, pompe, verrou, chargeurs, détente et organes de visée.",
          "Usure réaliste : peinture usée sur les arêtes, crasse dans les creux, traces de doigts, noyer veiné. Les armes transfigurées portent un camouflage animé.",
          "Le Spectre 9 retrouve tous ses détails : il s’affichait presque noir.",
        ],
      },
      {
        title: "Prise en main",
        items: [
          "Chaque main se pose sur sa poignée et ses doigts se referment sur l’arme, sans la traverser.",
          "Poignets naturels : l’avant-bras suit la main, la main d’appui enveloppe le garde-main, pouce le long du flanc.",
          "Pistolet tenu à deux mains, pouces vers l’avant, en visée comme à la hanche.",
        ],
      },
      {
        title: "Animations et visée",
        items: [
          "Rechargements visibles : chargeur qui tombe, nouveau chargeur enfoncé, arrêtoir ou levier d’armement à vide, cartouches glissées une à une.",
          "Pompe et verrou manœuvrés après chaque tir, inspection de l’arme avec T.",
          "Point rouge et viseur holographique projetés à l’infini ; lunette du Longinus avec distorsion et ombre de l’œil.",
        ],
      },
      {
        title: "Sensations et son",
        items: [
          "Recul propre à chaque arme, balles qui traversent les corps, dégâts qui baissent avec la distance.",
          "Tirs enregistrés, réverbération propre à chaque carte, bruits de rechargement synchronisés.",
        ],
      },
      {
        title: "Commandes",
        items: [
          "Ordinateur : Espace pour courir (et retenir son souffle en lunette), Maj pour sauter.",
          "Mobile : viser et sauter, plus petits, côte à côte en haut à droite. Le pouce qui tourne la caméra a toute la place.",
          "Nouveau journal des versions, et les nouveautés s’affichent dès qu’une mise à jour est disponible.",
        ],
      },
    ],
  },
  {
    version: "4.1.0",
    date: "2026-09-24",
    title: "Corps à corps",
    tagline: "La horde vous encercle, et elle se brise sous les balles.",
    art: "/art/station.webp",
    highlights: [
      "Démembrement : bras, mâchoires, jambes",
      "Zombies qui enjambent bancs et caisses",
      "Coureurs qui bondissent",
    ],
    sections: [
      {
        title: "Horde",
        items: [
          "Les zombies s’arrêtent à bout de bras et se répartissent autour de vous ; on ne traverse plus la horde.",
          "Ils enjambent bancs et caisses près de leur proie. Dès la vague 4, un coureur peut vous sauter dessus.",
        ],
      },
      {
        title: "Blessures",
        items: [
          "Bras arrachés au coude ou à l’épaule, mâchoires emportées, jambes arrachées par les grenades.",
          "Les membres tombent et restent au sol ; tuer de près projette du sang sur l’écran.",
        ],
      },
    ],
  },
  {
    version: "4.0.0",
    date: "2026-09-22",
    title: "La Horde",
    tagline: "Dix-huit corps réalistes animés par capture de mouvement.",
    art: "/art/abyss.webp",
    highlights: [
      "18 zombies réalistes",
      "Capture de mouvement",
      "Rampants et voix enregistrées",
    ],
    sections: [
      {
        title: "Zombies",
        items: [
          "Civils, coureurs, brutes, cracheurs, Rémanent et soldat de l’Archonte, chacun avec ses blessures et ses yeux lumineux.",
          "Démarches, attaques, réactions et morts issues de la capture de mouvement ; les pieds restent plantés au sol.",
          "Assez de dégâts dans les jambes et le zombie s’effondre, puis rampe vers vous.",
          "Râles, cris et pas enregistrés, spatialisés en 3D.",
        ],
      },
    ],
  },
  {
    version: "3.1.0",
    date: "2026-09-15",
    title: "Relève",
    tagline: "On ne laisse personne derrière.",
    art: "/art/abbey.webp",
    highlights: [
      "Réanimation en coopération",
      "Cinq morceaux originaux",
      "Mises à jour sans perdre sa partie",
    ],
    sections: [
      {
        title: "Nouveautés",
        items: [
          "En coopération, un joueur à terre peut être réanimé pendant 45 secondes.",
          "Les coéquipiers sont des soldats équipés, arme tenue à deux mains.",
          "Cinq morceaux originaux, au choix dans les réglages.",
          "La version s’affiche dans le menu et les nouvelles versions se proposent sans interrompre une partie.",
        ],
      },
    ],
  },
  {
    version: "3.0.0",
    date: "2026-09-09",
    title: "Ensemble",
    tagline: "Jusqu’à quatre survivants dans la même nuit.",
    art: "/art/station.webp",
    highlights: ["Coopération de 2 à 4 joueurs", "Salons avec code à partager"],
    sections: [
      {
        title: "Coopération",
        items: [
          "Créez un salon, partagez son code de quatre lettres et jouez à plusieurs.",
          "Les zombies chassent le survivant le plus proche ; chaque élimination revient à celui qui tire.",
        ],
      },
    ],
  },
  {
    version: "2.6.0",
    date: "2026-09-09",
    title: "L’Archonte",
    tagline: "Toutes les cinq vagues, une présence majeure se lève.",
    art: "/art/abyss.webp",
    highlights: [
      "Boss : l’Archonte",
      "Transfiguration en trois paliers",
      "Records personnels",
    ],
    sections: [
      {
        title: "Nouveautés",
        items: [
          "L’Archonte rejoint la horde toutes les cinq vagues, deux à partir de la quinzième.",
          "La Transfiguration a trois paliers ; deux nouveaux atouts : Main de fer et Œil du Veilleur.",
          "Chaque carte garde votre meilleur record.",
        ],
      },
    ],
  },
  {
    version: "2.5.0",
    date: "2026-09-09",
    title: "Allègement",
    tagline: "Plus fluide, plus frais, surtout sur téléphone.",
    art: "/art/abbey.webp",
    highlights: ["Moins de calcul, même image", "Option 30 images/s"],
    sections: [
      {
        title: "Performances",
        items: [
          "Décors et effets allégés sans changer l’image ; menus plus légers.",
          "Option 30 images par seconde pour les téléphones qui chauffent.",
        ],
      },
    ],
  },
  {
    version: "1.2.0",
    date: "2026-09-05",
    title: "Édition tactile",
    tagline: "Toute la nuit, entre vos mains.",
    art: "/art/station.webp",
    highlights: ["Commandes mobiles repensées", "Rendu Retina"],
    sections: [
      {
        title: "Mobile",
        items: [
          "Joystick libre, tir et visée avec le même pouce, rendu adapté aux écrans Retina.",
        ],
      },
    ],
  },
];
