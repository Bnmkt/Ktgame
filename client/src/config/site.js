

export const defaultPublicSettings = {
  siteName: "KTGA.ME",
  siteIcon: "landmark",
  siteSubtitle: "Casino privé multijoueur, jetons, dés et cartes.",
  registrationsEnabled: true,
  guestAccessEnabled: true,
  emailVerificationRequired: false,
  emailVerificationAvailable: false,
  minorRestrictions: ["shop", "game:texas-holdem", "game:belote"],
  signupTokens: 1000,
  dailyTokens: 250,
  dailyBonusDefaultMultiplier: 1,
  dailyBonusMaxMultiplier: 100,
  dailyBonusRules: [
    { id: "daily", day: 1, operation: "add", value: 0.1, repeat: true, label: "Progression quotidienne" },
    { id: "weekly", day: 7, operation: "add", value: 0.3, repeat: true, label: "Palier hebdomadaire" },
    { id: "monthly", day: 30, operation: "multiply", value: 2, repeat: true, label: "Palier mensuel" }
  ],
  minRoomStake: 10,
  botThinkingSeconds: 1,
  turnEndDelaySeconds: 5,
  roundResultsSeconds: 30,
  minPokerBuyIn: 1000,
  pokerDefaultBigBlind: 20,
  pokerTurnSeconds: 300
};

export const gameRules = {
  belote: {
    goal: "Remporter la partie à deux contre deux, avec 32 cartes du 7 à l'As.",
    sections: [
      { title: "Équipes et prise", items: ["Les places 1 et 3 forment une équipe, les places 2 et 4 l'autre. Une IA reprend la place d'un joueur qui quitte la partie.", "Cinq cartes par joueur et une retournée. Au premier tour, on prend sa couleur; au second, une autre. Le preneur reçoit la retournée, puis chacun complète sa main à huit cartes.", "Variante belge par défaut : après huit passes, les mains sont complétées et le premier joueur choisit obligatoirement parmi les quatre atouts."] },
      { title: "Pli et atout", items: ["Fournir la couleur demandée est obligatoire. À l'atout, il faut monter si possible, même sur son partenaire.", "Sans la couleur demandée, il faut couper et surcouper un adversaire si possible; sinon sous-couper. Sans atout, on défausse.", "Si le partenaire est maître, on peut défausser. Convention belge retenue : s'il tient à l'atout et qu'on ne peut pas monter, la sous-coupe est obligatoire.", "Ordre à l'atout : J, 9, A, 10, K, Q, 8, 7. Ailleurs : A, 10, K, Q, J, 9, 8, 7. Le gagnant du pli entame le suivant."] },
      { title: "Annonces", items: ["Si activées : tierce 20, suite de quatre 50, suite de cinq ou plus 100; carré de valets 200, de neuf 150, autres carrés sauf 7/8 : 100.", "Les annonces sont automatiques au premier pli, puis les cartes sont révélées au début du second. Une carte ne sert qu'à une annonce, sauf la belote. La meilleure annonce départage les équipes; à égalité parfaite, aucune ne compte.", "Roi et dame d'atout dans la même main : belote-rebelote, 20 points conservés même en cas de chute. Dans la variante belge, le roi doit être joué en premier pour marquer ces points."] },
      { title: "Marque et fin", items: ["Valeurs : As 11, dix 10, roi 4, dame 3, valet 2; à l'atout, valet 20 et neuf 14. Dix de der : 10, ou 100 si une équipe remporte les huit plis (capot).", "Le preneur doit dépasser la défense, annonces et belote comprises. En chute, la défense reçoit tous les points hors belote adverse. En litige, les points du preneur sont réservés au vainqueur de la prochaine donne non nulle.", "Variante belge : marque en dizaines, défense arrondie au-dessus à partir de 6, complément de 16 au preneur; capot 25. Objectif 101 par défaut. Il faut finir une donne et départager les équipes.", "Le pot suit la distribution habituelle du casino entre humains classés; les IA ne touchent aucun jeton."] },
      { title: "Option française (désactivée par défaut)", items: ["Huit passes entraînent une redistribution, pas une prise forcée. La belote peut être commencée par le roi ou la dame. Pas de sous-coupe imposée sur un partenaire maître.", "Les scores sont comptés en points non arrondis; l'objectif belge est multiplié par dix (1010 par défaut). Les annonces restent un réglage indépendant."] }
    ]
  },
  yahtzee: {
    goal: "Marquer le plus de points après 13 catégories.",
    sections: [
      { title: "Déroulement", items: ["Chaque joueur joue 13 tours.", "À chaque tour, le joueur lance les 5 dés selon le nombre de tentatives défini dans la salle d'attente.", "Après un lancer, il peut garder certains dés et relancer uniquement les autres.", "Le tour se termine obligatoirement par le choix d'une catégorie libre sur la feuille de score."] },
      { title: "Coups possibles", items: ["Lancer: lance tous les dés non gardés.", "Garder un dé: clique un dé pour le verrouiller avant le prochain lancer.", "Relancer: conserve les dés marqués Gardé et remplace les autres.", "Scorer: choisit une case de score, même si elle vaut 0."] },
      { title: "Cases supérieures", items: ["As, Deux, Trois, Quatre, Cinq, Six: addition des dés de cette valeur.", "Bonus supérieur: +35 points si la somme des six cases supérieures atteint 63 ou plus."] },
      { title: "Combinaisons inférieures", items: ["Brelan: au moins 3 dés identiques, score = somme des 5 dés.", "Carré: au moins 4 dés identiques, score = somme des 5 dés.", "Full: 3 dés d'une valeur et 2 dés d'une autre, score = 25.", "Petite suite: 4 valeurs consécutives, score = 30.", "Grande suite: 5 valeurs consécutives, score = 40.", "Yahtzee: 5 dés identiques, score = 50.", "Chance: n'importe quels dés, score = somme des 5 dés."] },
      { title: "Fin", items: ["Quand tous les joueurs ont rempli les 13 cases, le total le plus élevé gagne.", "Le classement final affiche le total de chaque joueur."] }
    ]
  },
  "421": {
    goal: "Faire la meilleure combinaison avec trois dés.",
    sections: [
      { title: "Déroulement", items: ["Chaque joueur dispose du nombre de lancers gratuits défini dans la salle d'attente.", "Après chaque lancer, il peut garder 0, 1, 2 ou 3 dés.", "Le joueur peut valider sa combinaison avant d'utiliser tous ses lancers.", "Après validation, le tour passe au joueur suivant."] },
      { title: "Coups possibles", items: ["Lancer: lance les dés non gardés.", "Garder: verrouille un dé pour le prochain lancer.", "Relance payante: après les tentatives gratuites, achète une relance; son prix double à chaque achat du tour.", "Valider: enregistre la combinaison actuelle et termine le tour."] },
      { title: "Ordre des combinaisons", items: ["421: combinaison 4, 2, 1, meilleure combinaison.", "Fiches fortes: Nénette 2, 2, 1 puis les combinaisons avec deux 1.", "Brelans: trois dés identiques, classés par valeur.", "Suites: 6-5-4, 5-4-3, 4-3-2 ou 3-2-1.", "Paires: deux dés identiques départagées par le troisième dé.", "Points: toutes les autres combinaisons, classées par les valeurs décroissantes."] },
      { title: "Fin", items: ["Une manche se termine quand tous les joueurs ont validé une combinaison.", "Les rangs obtenus sont additionnés pendant le nombre de manches choisi dans la salle d’attente; le meilleur cumul gagne.", "Le pot de salon est partagé entre joueurs humains classés: 100% s'il n'y a qu'un humain, 70/30 à deux humains, puis 60/30/10 à trois humains ou plus. Les IA ne reçoivent aucun gain."] }
    ]
  },
  "cul-de-chouette": {
    goal: "Obtenir le meilleur total après le nombre de manches choisi.",
    sections: [
      { title: "Déroulement", items: ["Chaque joueur dispose du nombre de lancers réglé par la table avec 3 dés.", "Après le premier lancer, sélectionne uniquement les dés que tu veux relancer; les autres restent sur la table.", "Tu peux valider ta combinaison avant la dernière relance. Ses points sont alors ajoutés au score.", "Quand tous les joueurs ont validé, une nouvelle manche commence jusqu’à la limite configurée."] },
      { title: "Combinaisons", items: ["Cul de Chouette: trois dés identiques, score = 40 + 10 fois la valeur du dé.", "Chouette Velute: une paire et une somme qui forme le troisième dé, score = valeur de la Velute au carré x2.", "Velute: deux dés dont la somme donne le troisième, score = valeur de la Velute au carré.", "Chouette: deux dés identiques, score = valeur de la paire au carré.", "Suite: trois valeurs consécutives, score = 10.", "Néant: aucune figure, score = 0."] },
      { title: "Coups spéciaux", items: ["Les effets de Sirop, Civet, Sirotage et contre-annonces sont résolus par la table dans les règles traditionnelles.", "Dans KTGA.ME, les figures principales sont calculées automatiquement pour éviter les litiges de timing.", "Le tableau de score cumule les points de chaque joueur après validation de sa combinaison."] },
      { title: "Fin", items: ["Le tableau de score affiche les points cumulés sur toutes les manches.", "À la dernière manche, le leaderboard final classe les joueurs par total; les égalités sont conservées."] }
    ]
  },
  blackjack: {
    goal: "Battre le dealer sans dépasser 21.",
    sections: [
      { title: "Déroulement", items: ["Chaque joueur place une mise.", "Chaque joueur reçoit 2 cartes.", "Le dealer reçoit une carte visible et une carte cachée.", "À son tour, chaque joueur choisit Piocher ou Rester.", "Quand les joueurs ont terminé leur main, le dealer révèle sa carte cachée puis tire jusqu'à atteindre au moins 17."] },
      { title: "Valeur des cartes", items: ["2 à 10: valeur indiquée.", "Valet, Dame, Roi: 10 points.", "As: 11 points, ou 1 point si 11 ferait dépasser 21.", "Dépasser 21 signifie perdre immédiatement la main."] },
      { title: "Coups possibles", items: ["Miser: engage un montant compris entre les limites minimale et maximale de la table.", "Piocher: demande une carte supplémentaire.", "Rester: arrête de piocher et conserve ton score actuel.", "Doubler: uniquement avec les deux cartes initiales, ajoute une mise égale à la première, reçoit exactement une carte puis termine la main.", "Se coucher: abandonne la main et la mise déjà engagée.", "Split et assurance ne sont pas encore inclus."] },
      { title: "Résolution", items: ["Si le joueur dépasse 21, il perd sa mise.", "Si le dealer dépasse 21, les joueurs encore en jeu gagnent.", "Si le joueur a plus que le dealer sans dépasser 21, il gagne.", "En cas d'égalité, la mise est remboursée.", "Paiement MVP: victoire payée 1:1, donc une mise de 10 rend 20 jetons au total."] }
    ]
  },
  "texas-holdem": {
    goal: "Former la meilleure main de cinq cartes avec tes deux cartes privées et les cinq cartes communes.",
    sections: [
      { title: "Mise en place", items: ["La cave minimale configurée par le casino devient directement le tapis du joueur.", "Chaque joueur reçoit deux cartes privées.", "La mise minimale choisie pour la table devient la grosse blinde; la petite blinde vaut toujours exactement sa moitié. La mise maximale plafonne l’engagement d’un joueur sur un tour d’enchères.", "L'action commence avant le flop après la grosse blinde, puis à gauche du donneur aux tours suivants."] },
      { title: "Déroulement", items: ["Préflop: premier tour d'enchères avec les cartes privées.", "Flop: trois cartes communes sont révélées.", "Turn: une quatrième carte commune est révélée.", "River: la cinquième carte commune est révélée, puis vient l'abattage."] },
      { title: "Actions", items: ["Parole: rester dans la main sans miser lorsque rien n'est à suivre.", "Suivre: compléter jusqu'à la mise actuelle.", "Relancer: augmenter la mise d'au moins la dernière relance complète, sans dépasser le plafond de table.", "Tapis: engager tous ses jetons disponibles si le plafond l’autorise.", "Se coucher: abandonner la main et les jetons déjà engagés.", "Parole / se coucher auto: joue automatiquement Parole si elle est possible, sinon abandonne la main."] },
      { title: "Combinaisons", items: ["Quinte flush: cinq cartes consécutives de même couleur.", "Carré: quatre cartes de même valeur.", "Full: un brelan et une paire.", "Couleur: cinq cartes de même couleur.", "Suite: cinq valeurs consécutives.", "Brelan: trois cartes de même valeur.", "Deux paires, puis une paire.", "Carte haute: la plus haute combinaison restante."] },
      { title: "Pots et victoire", items: ["Le meilleur jeu de cinq cartes remporte le pot à l'abattage.", "Un joueur à tapis reste éligible jusqu'à la résolution complète des cartes et des pots secondaires.", "Les égalités partagent le pot.", "Les tapis créent automatiquement des pots secondaires selon les contributions de chaque joueur.", "Si tous les adversaires se couchent, le dernier joueur actif gagne sans révéler sa main; chaque joueur peut toutefois montrer volontairement ses cartes et son score à la fin de la donne."] }
    ]
  },
  bataille: {
    goal: "Prendre le contrôle du plateau jusqu’à épuiser le paquet adverse.",
    sections: [
      { title: "Piocher puis choisir", items: ["Le paquet est partagé équitablement entre les deux joueurs.", "À chaque manche, commence par piocher la carte du dessus: tu es le seul à voir sa valeur.", "Choisis ensuite de la poser face cachée sur la pile A ou la pile B.", "L’adversaire voit que tu as pioché ou joué, mais jamais la valeur ni la pile choisie avant une confrontation."] },
      { title: "Confrontation", items: ["Une confrontation part uniquement si les deux joueurs choisissent la même pile pendant la même manche; des cartes posées sur A et B ne peuvent jamais s'affronter.", "Les cartes utiles au calcul restent révélées pendant 10 secondes avant la capture.", "Hauteur de carte: la dernière carte de chaque joueur décide.", "Addition des piles: les deux cartes supérieures de chaque joueur sont additionnées; les cartes plus profondes ne comptent pas.", "Combo Poker: les deux cartes supérieures sont additionnées et reçoivent +0,5 de multiplicateur pour chaque combinaison présente — Paire, Couleur et Suite.", "Ordre croissant: 2, 3, 4, 5, 6, 7, 8, 9, 10, Valet, Dame, Roi, As. L’As peut précéder le 2 dans une Suite."] },
      { title: "Modificateurs de table", items: ["Pile simple concentre tous les choix sur une zone; Pile double ouvre les zones A et B.", "Pioche visible donne une estimation fondée uniquement sur les informations acquises: ✓ indique une présence certaine, ? une présence possible et les cartes à 0 % sont omises.", "Pioche cachée masque entièrement cette estimation."] },
      { title: "Bataille et temporisation", items: ["Si les deux cartes révélées ont la même valeur, une Bataille est déclarée.", "La manche suivante est obligatoirement jouée sur cette pile; la prochaine carte la plus haute emporte tout l’enjeu.", "Une carte sans adversaire reste cachée sur sa pile.", "Le maître règle entre 3 et 20 le nombre de manches sans confrontation avant son retour face cachée dans le paquet de son propriétaire."] },
      { title: "Stratégie", items: ["Observe les cartes restantes et les habitudes de placement de ton adversaire.", "Répartir tes choix protège tes cartes, mais une pile occupée réduit tes options à la manche suivante.", "Provoquer une confrontation peut accélérer la partie; l’éviter permet de récupérer une carte après trois manches."] },
      { title: "Fin", items: ["La partie se termine dès qu’un joueur ne possède plus aucune carte, ni en pioche ni engagée sur une pile.", "L’autre joueur remporte la partie et le tableau récapitule les cartes contrôlées."] }
    ]
  },
  president: {
    goal: "Se débarrasser de toutes ses cartes en premier.",
    sections: [
      { title: "Déroulement", items: ["Toutes les cartes sont distribuées entre les joueurs.", "À son tour, un joueur doit jouer une carte autorisée ou passer.", "Une carte jouée doit être supérieure ou égale à la dernière carte sur la pile.", "Le premier joueur sans carte est classé premier."] },
      { title: "Ordre des cartes", items: ["3 est la plus faible carte.", "Puis 4, 5, 6, 7, 8, 9, 10, Valet, Dame, Roi, As.", "2 est la plus forte carte.", "La couleur n'a pas d'effet.", "En révolution, l'ordre est inversé jusqu'à la fin de la manche."] },
      { title: "Coups possibles", items: ["Jouer: pose une carte seule, une paire, un brelan ou un carré de même rang.", "Répondre: la combinaison doit avoir le même nombre de cartes que la combinaison active.", "Battre: la valeur doit être strictement supérieure, ou strictement inférieure pendant une révolution.", "Passer: laisse la main au joueur suivant.", "Carré: jouer quatre cartes déclenche ou annule la révolution."] },
      { title: "Pli", items: ["Quand tous les autres joueurs actifs passent, la pile est nettoyée.", "Le joueur qui a posé la dernière combinaison relance avec la combinaison de son choix.", "Les joueurs sont classés dans l'ordre où ils vident leur main."] },
      { title: "Fin", items: ["Les joueurs sont classés dans l'ordre où ils se débarrassent de leurs cartes.", "Le leaderboard final met en avant les joueurs sortis."] }
    ]
  },
  farkle: {
    goal: "Atteindre l'objectif de la table en prenant des risques avec six dés.",
    sections: [
      { title: "Déroulement", items: ["À ton tour, lance jusqu'à 6 dés.", "Après chaque lancer, sélectionne uniquement les dés qui forment une combinaison valide.", "Les points sélectionnés alimentent la réserve temporaire du tour.", "Tu peux sécuriser cette réserve ou risquer une relance avec les dés restants.", "Si les six dés marquent, ils deviennent des dés chauds et tu peux relancer les six."] },
      { title: "Combinaisons", items: ["Chaque 1 isolé vaut 100 points et chaque 5 isolé vaut 50 points.", "Trois 1 valent 1 000 points. Un autre brelan vaut la valeur du dé × 100.", "Carré : 1 000 points · cinq identiques : 2 000 · six identiques : 3 000.", "Suite 1–6 : 1 500 points · trois paires : 1 500 points.", "Deux brelans : 2 500 points · carré accompagné d’une paire : 1 500 points."] },
      { title: "Farkle et seuil d’entrée", items: ["Un lancer sans aucune combinaison est un Farkle : confirme 0 point pour terminer le tour.", "Un Farkle efface toute la réserve temporaire du tour, mais jamais les points déjà sécurisés.", "Le seuil d’entrée réglé dans la salle impose le minimum à encaisser lors de ton premier tour marqué."] },
      { title: "Stratégie", items: ["Une petite sélection laisse davantage de dés à relancer, mais augmente le risque de perdre la réserve.", "Les dés chauds permettent de prolonger un très gros tour avec six nouveaux dés.", "Observe l’écart avec l’objectif et les scores adverses avant de choisir entre encaisser et relancer."] },
      { title: "Fin", items: ["Le premier joueur à atteindre l'objectif réglé dans la salle d'attente gagne.", "Seuls les points encaissés sont ajoutés au score total."] }
    ]
  },
  "liars-dice": {
    goal: "Bluffer sur les dés cachés et survivre le plus longtemps.",
    sections: [
      { title: "Déroulement", items: ["Chaque joueur commence avec le nombre de dés cachés défini par la table.", "À son tour, un joueur annonce une quantité et une face.", "Le joueur suivant doit augmenter l'enchère ou contester.", "Après contestation, tous les dés sont révélés."] },
      { title: "Résolution", items: ["Si l'enchère est vraie, le challenger perd un dé.", "Si l'enchère est fausse, le dernier enchérisseur perd un dé.", "Un joueur sans dé est éliminé.", "Le dernier joueur encore en jeu gagne."] }
    ]
  },
  "shut-the-box": {
    goal: "Fermer toutes les tuiles configurées et finir avec le score le plus bas.",
    sections: [
      { title: "Déroulement", items: ["Lance les dés, puis ferme une ou plusieurs tuiles dont la somme correspond au lancer.", "Tant qu'un mouvement est possible, tu continues.", "Si aucun mouvement n'est possible, ton score est la somme des tuiles restantes.", "Fermer toutes les tuiles donne 0 et gagne immédiatement."] },
      { title: "Fin", items: ["En solo, l'objectif est de finir à 0 ou au score le plus bas possible.", "En multi, chaque joueur joue son plateau, puis le plus petit score gagne."] }
    ]
  },
  "golf-solitaire": {
    goal: "Vider le tableau en jouant des cartes à +1 ou -1.",
    sections: [
      { title: "Déroulement", items: ["Le vrai tableau Golf contient 7 colonnes de 5 cartes superposées.", "Tu peux jouer la carte visible d'une colonne si elle vaut une de plus ou une de moins que la défausse.", "Les couleurs n'ont pas d'importance; la variante de table peut aussi relier le Roi et l'As.", "Si aucun coup ne convient, pioche une nouvelle carte."] },
      { title: "Fin", items: ["Tu gagnes si toutes les cartes du tableau sont jouées.", "Si la pioche est vide et qu'aucun coup n'est possible, le score est le nombre de cartes restantes."] }
    ]
  },
  accordion: {
    goal: "Compresser 52 cartes en une seule pile.",
    sections: [
      { title: "Déroulement", items: ["Toutes les cartes forment un ruban de piles numérotées.", "Les distances d'une pile et de trois piles vers la gauche sont activables dans la salle d'attente.", "Le déplacement est autorisé si les cartes du dessus ont le même rang ou la même couleur.", "L'objectif est de réduire le ruban au minimum."] },
      { title: "Fin", items: ["Une seule pile restante = victoire.", "S'il n'y a plus de déplacement possible, le score est le nombre de piles restantes."] }
    ]
  },
  "midnight-dice": {
    goal: "Lire le marché, masquer son mandat et composer les trois dés les plus rentables.",
    sections: [
      { title: "Une manche de draft", items: ["Chaque joueur choisit secrètement un mandat avant l'ouverture du marché.", "Le croupier lance trois dés par joueur, plus les dés supplémentaires configurés.", "À tour de rôle, chaque joueur prend un dé visible et le pose dans son plateau.", "La manche est résolue lorsque chacun possède exactement trois dés."] },
      { title: "Mandats et paliers", items: ["Chaque lancer rapporte toujours la somme des trois dés. Si le mandat est réussi, sa prime de difficulté s'ajoute au total.", "Bronze (+18): Spectre, Duo et Voie médiane.", "Argent (+30): Les Extrêmes, Impair royal et Pair parfait.", "Or (+45): Suite, Équilibre et Treize chanceux.", "Platine (+65): Sommet et Cave.", "Diamant (+100): Brelan.", "Le bouton Voir les 12 mandats ouvre le codex complet avec les conditions, des exemples et le calcul exact de chaque réussite."] },
      { title: "Défausse tactique, bluff et rotations", items: ["Au début de la partie, quatre mandats sont tirés aléatoirement parmi les douze disponibles.", "Après chaque cycle de quatre manches, les quatre mandats sont remplacés par une nouvelle sélection aléatoire.", "Au lieu de prendre immédiatement un dé, tu peux utiliser une défausse pour le retirer du marché et le faire remplacer.", "La défausse ne termine pas ton tour: tu choisis ensuite parmi le nouveau marché.", "Ton mandat reste secret jusqu'à la fin de la manche; un rappel privé reste affiché près du marché.", "Avec la rotation active, un mandat ne peut pas être repris pendant son cycle de quatre manches."] },
      { title: "Fin", items: ["Les points de chaque mandat s'ajoutent au score général.", "Après le nombre de manches choisi dans la salle d'attente, le total le plus élevé gagne.", "En cas d'égalité, les joueurs en tête partagent la victoire."] }
    ]
  },
  "velvet-ruse": {
    goal: "Gagner du prestige en alimentant un dossier de cartes, sans laisser les adversaires lire tes bluffs.",
    sections: [
      { title: "Piocher et défausser", items: ["À ton tour, pioche face cachée ou récupère la carte supérieure de la défausse si cette variante est active.", "Tu dois ensuite défausser une carte face visible ou la glisser face cachée dans le dossier.", "Une défausse sûre ne rapporte rien, mais sa carte devient la nouvelle carte d'influence."] },
      { title: "Déclarer une carte", items: ["Pour alimenter le dossier, annonce un rang et une enseigne puis joue n'importe quelle carte face cachée.", "Selon le réglage de la table, l'annonce doit partager le rang, l'enseigne, ou l'un des deux avec la carte d'influence.", "La carte réelle peut correspondre à l'annonce… ou être un bluff."] },
      { title: "Confiance ou contestation", items: ["Le joueur suivant doit faire confiance ou contester avant de piocher.", "Faire confiance donne immédiatement 1 prestige au déclarant et enferme la carte dans le dossier.", "Une contestation correcte donne 3 prestige au challenger et en retire 1 au bluffeur.", "Une accusation injustifiée donne 3 prestige au déclarant honnête et en retire 1 au challenger."] },
      { title: "Audit du dossier", items: ["Quand le dossier atteint la taille configurée, toutes ses cartes sont révélées.", "Chaque déclaration exacte rapporte encore 1 prestige; chaque bluff passé inaperçu en retire 2.", "Les cartes auditées rejoignent ensuite la défausse et un nouveau dossier commence."] },
      { title: "Fin", items: ["Le premier joueur qui atteint le prestige fixé par la table remporte la partie.", "Le suivi de la défausse, les cartes récupérées et le comportement des adversaires sont les seules informations fiables."] }
    ]
  }
};

export const iconOptions = {
  chip: "Jeton",
  "classic-chip-red": "Jeton rouge",
  "classic-chip-blue": "Jeton bleu",
  "classic-chip-green": "Jeton vert",
  "classic-die": "Dé simple",
  "classic-card": "Carte simple",
  "classic-star": "Étoile simple",
  "classic-heart": "Coeur simple",
  "classic-club": "Trèfle simple",
  "classic-spade": "Pique simple",
  "classic-medal": "Médaille simple",
  "classic-crown": "Couronne simple",
  "classic-shield": "Bouclier simple",
  "classic-flame": "Flamme simple",
  "classic-lightning": "Éclair simple",
  "classic-diamond": "Gemme simple",
  "classic-swords": "Duel simple",
  "classic-rocket": "Rocket simple",
  "classic-badge": "Badge simple",
  "classic-casino": "Casino simple",
  "classic-spark": "Étincelle simple",
  "classic-orbit": "Orbite simple",
  "classic-crest": "Blason simple",
  "classic-ticket": "Ticket simple",
  "classic-award": "Récompense simple",
  "classic-highroller": "High roller simple",
  "classic-lucky": "Chance simple",
  "classic-table": "Table simple",
  "classic-vault": "Coffre simple",
  "classic-marker": "Marqueur simple",
  "classic-token-stack": "Pile simple",
  crown: "Couronne",
  dice: "Dés",
  cards: "As de pique",
  star: "Étoile",
  flame: "Flamme",
  lightning: "Éclair",
  shield: "Bouclier",
  rocket: "Rocket",
  swords: "Duel",
  diamond: "Diamant",
  heart: "Coeur",
  club: "Trèfle",
  spade: "Pique",
  medal: "Médaille",
  badge: "Badge VIP",
  casino: "Casino",
  orbit: "Orbite",
  crest: "Blason",
  cat: "Chat",
  dog: "Chien",
  bird: "Oiseau",
  fish: "Poisson",
  rabbit: "Lapin",
  turtle: "Tortue",
  squirrel: "Écureuil",
  snail: "Escargot",
  "fox-fire": "Renard feu",
  "phoenix-chip": "Jeton phoenix",
  "japanese-traditional": "Torii traditionnel",
  "japanese-sakura": "Sakura vivant"
};

export const nameEffectOptions = {
  none: "Classique",
  "classic-slate": "Ardoise",
  "classic-crimson": "Carmin",
  "classic-amber": "Ambre",
  "classic-emerald": "Émeraude",
  "classic-sapphire": "Saphir",
  "classic-violet": "Violet",
  "classic-rose": "Rose",
  "classic-teal": "Teal",
  "classic-orange": "Orange",
  "classic-lime": "Lime",
  "classic-cyan": "Cyan",
  "classic-indigo": "Indigo",
  "classic-graphite": "Graphite mat",
  "classic-pearl": "Perle",
  "classic-coral": "Corail",
  "classic-mint": "Menthe",
  "classic-steel": "Acier brossé",
  "classic-olive": "Olive",
  "classic-plum": "Prune",
  "classic-mocha": "Mocha",
  gold: "Doré",
  ruby: "Rubis",
  neon: "Néon",
  glitch: "Glitch",
  shiny: "Shiny",
  fire: "Flamme",
  ice: "Ice",
  royal: "Royal",
  emerald: "Émeraude",
  diamond: "Diamant",
  shadow: "Shadow",
  pulse: "Pulse",
  jackpot: "Jackpot",
  chrome: "Chrome",
  cosmic: "Cosmic",
  prism: "Prisme",
  holo: "Holo",
  emberwave: "Emberwave",
  voidpulse: "Void pulse",
  "japanese-traditional": "Encre sumi",
  "japanese-sakura": "Sakura"
};

export const memberCardOptions = {
  default: "Default",
  "classic-slate": "Ardoise",
  "classic-crimson": "Carmin",
  "classic-amber": "Ambre",
  "classic-emerald": "Émeraude",
  "classic-sapphire": "Saphir",
  "classic-violet": "Violet",
  "classic-rose": "Rose",
  "classic-teal": "Teal",
  "classic-orange": "Orange",
  "classic-lime": "Lime",
  "classic-cyan": "Cyan",
  "classic-indigo": "Indigo",
  "classic-graphite": "Graphite mat",
  "classic-pearl": "Perle",
  "classic-coral": "Corail",
  "classic-mint": "Menthe",
  "classic-steel": "Acier brossé",
  "classic-olive": "Olive",
  "classic-plum": "Prune",
  "classic-mocha": "Mocha",
  bronze: "Bronze",
  silver: "Argent",
  emerald: "Émeraude",
  platinum: "Platine",
  diamond: "Diamant",
  master: "Master",
  "onyx-frame": "Onyx Frame",
  "aurora-frame": "Aurora Frame",
  "ember-animated": "Ember Motion",
  "nebula-animated": "Nebula Motion",
  "japanese-traditional": "Washi",
  "japanese-sakura": "Hanami"
};

export const diceSkinOptions = {
  default: "Standard",
  "classic-ivory": "Ivoire",
  "classic-charcoal": "Charbon",
  "classic-crimson": "Carmin",
  "classic-emerald": "Émeraude",
  "classic-sapphire": "Saphir",
  "classic-amber": "Ambre",
  "classic-teal": "Teal",
  "classic-violet": "Violet",
  "classic-pearl": "Perle",
  "classic-copper": "Cuivre",
  "classic-rose": "Rose",
  "classic-navy": "Navy",
  "classic-graphite": "Graphite",
  "classic-mint": "Menthe",
  "premium-gold": "Or",
  "premium-ruby": "Rubis",
  "premium-obsidian": "Obsidienne",
  "premium-diamond": "Diamant",
  "premium-casino": "Casino",
  "premium-neon": "Néon",
  "premium-royal": "Royal",
  "premium-ice": "Ice",
  "premium-meteor": "Météore",
  "premium-beveled": "Biseautés",
  "premium-cutcorner": "Coupe casino",
  "premium-emberflow": "Emberflow",
  "premium-aurora": "Aurora",
  "japanese-traditional": "Netsuke",
  "japanese-sakura": "Sakura"
};

export const cardSkinOptions = {
  default: "Standard",
  "classic-red": "Rouge",
  "classic-blue": "Bleu",
  "classic-green": "Vert",
  "classic-black": "Noir",
  "classic-cream": "Crème",
  "classic-burgundy": "Bordeaux",
  "classic-forest": "Forêt",
  "classic-navy": "Navy",
  "classic-charcoal": "Charbon",
  "classic-ivory": "Ivoire",
  "classic-slate": "Ardoise",
  "classic-copper": "Cuivre",
  "classic-mint": "Menthe",
  "classic-violet": "Violet",
  "premium-gold": "Or",
  "premium-ruby": "Rubis",
  "premium-emerald": "Émeraude",
  "premium-diamond": "Diamant",
  "premium-obsidian": "Obsidienne",
  "premium-royal": "Royal",
  "premium-neon": "Néon",
  "premium-casino": "Casino",
  "premium-celestial": "Céleste",
  "premium-notched": "Notch",
  "premium-frame": "Cadre or",
  "premium-starlight": "Starlight",
  "premium-inferno": "Inferno",
  "japanese-traditional": "Hanafuda",
  "japanese-sakura": "Sakura"
};

export const publicProfileStatOptions = [
  ["age", "Âge"],
  ["gender", "Genre"],
  ["friends", "Nombre d’amis"],
  ["gamesPlayed", "Parties jouées"],
  ["wins", "Victoires"],
  ["winRate", "Taux de victoire"],
  ["achievements", "Succès"]
];

export const ruleDiceExamples = {
  belote: [
    { match: "Ordre à l'atout", cards: [{ rank: "J", suit: "S" }, { rank: "9", suit: "S" }, { rank: "A", suit: "S" }], label: "Atout pique : le valet bat le neuf, qui bat l'as" },
    { match: "Roi et dame", cards: [{ rank: "K", suit: "H" }, { rank: "Q", suit: "H" }], label: "Atout cœur : belote et rebelote, 20 points" }
  ],
  yahtzee: [
    { match: "As, Deux", dice: [1, 1, 3, 5, 6], label: "Case As · 2 points" },
    { match: "Brelan", dice: [4, 4, 4, 2, 6], label: "Brelan · somme des dés: 20" },
    { match: "Carré", dice: [3, 3, 3, 3, 6], label: "Carré · somme des dés: 18" },
    { match: "Full", dice: [5, 5, 5, 2, 2], label: "Full · 25 points" },
    { match: "Petite suite", dice: [2, 3, 4, 5, 5], label: "Petite suite · 30 points" },
    { match: "Grande suite", dice: [2, 3, 4, 5, 6], label: "Grande suite · 40 points" },
    { match: "Yahtzee", dice: [6, 6, 6, 6, 6], label: "Yahtzee · 50 points" },
    { match: "Chance", dice: [1, 3, 4, 5, 6], label: "Chance · somme des dés: 19" }
  ],
  "421": [
    { match: "421:", dice: [4, 2, 1], label: "421 · combinaison maîtresse" },
    { match: "Fiches fortes", dice: [2, 2, 1], label: "Nénette · 2-2-1" },
    { match: "Brelans", dice: [5, 5, 5], label: "Brelan de 5" },
    { match: "Suites", dice: [6, 5, 4], label: "Suite 6-5-4" },
    { match: "Paires", dice: [4, 4, 6], label: "Paire de 4, départagée par le 6" },
    { match: "Points", dice: [6, 4, 2], label: "Combinaison aux points" }
  ],
  "cul-de-chouette": [
    { match: "Cul de Chouette", dice: [3, 3, 3], label: "Cul de Chouette de 3" },
    { match: "Chouette Velute", dice: [2, 2, 4], label: "Chouette Velute" },
    { match: "Velute", dice: [2, 3, 5], label: "Velute de 5" },
    { match: "Chouette:", dice: [4, 4, 1], label: "Chouette de 4" },
    { match: "Suite", dice: [2, 3, 4], label: "Suite · 10 points" },
    { match: "Néant", dice: [1, 3, 6], label: "Néant · 0 point" }
  ],
  farkle: [
    { match: "Chaque 1", dice: [1, 5], label: "1 = 100 · 5 = 50" },
    { match: "Trois 1", dice: [1, 1, 1], label: "Trois 1 · 1 000 points" },
    { match: "Suite 1-6", dice: [1, 2, 3, 4, 5, 6], label: "Suite · 1 500 points" },
    { match: "Carré :", dice: [4, 4, 4, 4], label: "Quatre identiques · 1 000 points" },
    { match: "Un lancer sans", dice: [2, 2, 3, 4, 6, 6], label: "Farkle · aucun dé scorant" }
  ],
  "liars-dice": [
    { match: "Chaque joueur", dice: [5, 5, 2, 3, 6], label: "Main privée · deux 5 réellement présents" },
    { match: "Si l'enchère est vraie", dice: [5, 5, 5, 2, 3], label: "Annonce « trois 5 » correcte · le challenger perd un dé" }
  ],
  "shut-the-box": [
    { match: "Lance les dés", dice: [3, 5], label: "Total 8 · ferme 8, ou 3 + 5, ou 1 + 2 + 5" },
    { match: "Fermer toutes", dice: [4, 6], label: "Dernier total 10 fermé · score parfait de 0" }
  ],
  blackjack: [
    { match: "2 à 10", cards: [{ rank: "8", suit: "H" }, { rank: "Q", suit: "S" }, { rank: "A", suit: "D" }], label: "8 vaut 8 · Dame vaut 10 · As vaut 1 ou 11" },
    { match: "Doubler", cards: [{ rank: "6", suit: "C" }, { rank: "5", suit: "D" }, { rank: "K", suit: "H" }], label: "11 initial · mise doublée · une seule dernière carte" },
    { match: "Si le joueur a plus", cards: [{ rank: "A", suit: "S" }, { rank: "K", suit: "D" }], label: "Blackjack naturel · 21 en deux cartes" }
  ],
  "texas-holdem": [
    { match: "Chaque joueur reçoit", cards: [{ rank: "A", suit: "S" }, { rank: "K", suit: "S" }], label: "Deux cartes privées par joueur" },
    { match: "Quinte flush", cards: [{ rank: "9", suit: "H" }, { rank: "10", suit: "H" }, { rank: "J", suit: "H" }, { rank: "Q", suit: "H" }, { rank: "K", suit: "H" }], label: "Quinte flush au Roi" },
    { match: "Full:", cards: [{ rank: "8", suit: "S" }, { rank: "8", suit: "H" }, { rank: "8", suit: "D" }, { rank: "Q", suit: "C" }, { rank: "Q", suit: "H" }], label: "Full · trois 8 et deux Dames" }
  ],
  bataille: [
    { match: "Une confrontation", cards: [{ rank: "K", suit: "S" }, { rank: "9", suit: "H" }], label: "Même pile · le Roi remporte la confrontation" },
    { match: "Addition des piles", cards: [{ rank: "10", suit: "D" }, { rank: "5", suit: "S" }], label: "Deux cartes supérieures · 10 + 5 = 15 points" },
    { match: "Combo Poker", cards: [{ rank: "5", suit: "H" }, { rank: "5", suit: "D" }], label: "Paire · somme 10 × 1,5 = 15 points" },
    { match: "Si les deux cartes", cards: [{ rank: "Q", suit: "C" }, { rank: "Q", suit: "D" }], label: "Égalité · Bataille forcée à la manche suivante" },
    { match: "Une carte sans", cards: [null], hidden: true, label: "Sans adversaire jusqu’au seuil choisi · retour aléatoire dans la pioche" }
  ],
  president: [
    { match: "3 est la plus", cards: [{ rank: "3", suit: "C" }, { rank: "10", suit: "D" }, { rank: "A", suit: "S" }, { rank: "2", suit: "H" }], label: "Ordre normal · du 3 au 2" },
    { match: "Jouer:", cards: [{ rank: "7", suit: "H" }, { rank: "7", suit: "S" }], label: "Une paire de 7 répond à une autre paire" },
    { match: "Carré:", cards: [{ rank: "9", suit: "S" }, { rank: "9", suit: "H" }, { rank: "9", suit: "D" }, { rank: "9", suit: "C" }], label: "Carré · déclenche ou annule la révolution" }
  ],
  "golf-solitaire": [
    { match: "Tu peux jouer", cards: [{ rank: "6", suit: "H" }, { rank: "7", suit: "S" }], label: "Le 7 se joue sur le 6 : écart de +1" },
    { match: "Si aucun coup", cards: [null, { rank: "J", suit: "D" }], hidden: true, label: "Aucun coup · retourne la prochaine carte de la pioche" }
  ],
  accordion: [
    { match: "Le déplacement est autorisé", cards: [{ rank: "Q", suit: "H" }, { rank: "4", suit: "H" }], label: "Même couleur · déplacement autorisé" },
    { match: "L'objectif est", cards: [{ rank: "K", suit: "C" }], label: "Objectif final · une seule pile" }
  ],
  "midnight-dice": [
    { match: "Suite:", dice: [3, 4, 5], label: "Suite 3–4–5 · 35 points" },
    { match: "Brelan:", dice: [6, 6, 6], label: "Brelan de 6 · 40 points" },
    { match: "Équilibre:", dice: [2, 3, 5], label: "Total exact de 10 · 38 points" },
    { match: "Spectre:", dice: [1, 4, 6], label: "Trois valeurs différentes · 31 points" },
    { match: "Duo:", dice: [4, 4, 1], label: "Paire de 4 · 32 points" },
    { match: "Sommet:", dice: [4, 5, 6], label: "Total 15 · 33 points" },
    { match: "Cave:", dice: [1, 2, 3], label: "Total 6 · 34 points" },
    { match: "Impair royal:", dice: [1, 3, 5], label: "Trois dés impairs · 33 points" },
    { match: "Pair parfait:", dice: [2, 4, 6], label: "Trois dés pairs · 34 points" },
    { match: "Les Extrêmes:", dice: [1, 4, 6], label: "Extrêmes avec un 4 · 32 points" },
    { match: "Treize chanceux:", dice: [3, 4, 6], label: "Total exact de 13 · 40 points" },
    { match: "Voie médiane:", dice: [2, 4, 5], label: "Valeurs médianes · 33 points" }
  ],
  "velvet-ruse": [
    { match: "Pour alimenter", cards: [{ rank: "Q", suit: "H" }, null], label: "Annonce Dame de cœur · carte réelle face cachée" },
    { match: "Une contestation", cards: [{ rank: "Q", suit: "H" }, { rank: "7", suit: "C" }], label: "La Dame annoncée cachait un 7 de trèfle · bluff démasqué" },
    { match: "Quand le dossier", cards: [{ rank: "A", suit: "S" }, { rank: "9", suit: "D" }, { rank: "J", suit: "C" }], label: "L'audit révèle toutes les cartes du dossier" }
  ]
};
