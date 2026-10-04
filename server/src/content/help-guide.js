const question = (prompt, choices, answer, explanation) => ({
  question: prompt,
  options: choices.map((text, index) => ({ id: String(index + 1), text })),
  answerId: String(answer),
  explanation
});

export const guideIntroduction = "Installe-toi, on fait un petit tour ensemble ? Tu peux suivre les étapes, répondre à quelques mises en situation ou aller directement au sujet qui t’intéresse. Rien à réussir, rien à perdre : les tables t’attendent.";

export const guideContent = {
  "guide-start": {
    title: "Bienvenue, prends place !",
    lead: "Des cartes, des dés et des gens avec qui passer un bon moment. Le reste, tu vas le découvrir à ton rythme.",
    body: "Ici, on joue **gratuitement**, en solo, avec des bots ou entre joueurs. Tu n’as pas besoin de connaître tous les jeux pour commencer.\n\nLes jetons font partie du jeu : **aucun argent réel**, aucun achat de jetons et aucun gain à retirer ou à échanger contre un prix.\n\nTon point de départ, c’est **Casino**. Repère un jeu qui te tente ; ses **Règles** sont là si tu hésites. Ton **Profil**, la **Boutique** et les **Classements** resteront à portée de clic.",
    challenge: question("Avant de choisir une table : les jetons, c’est…", ["De l’argent qu’on peut retirer", "Une monnaie virtuelle, juste pour jouer"], 2, "Exactement : les jetons restent dans le site et n’ont aucune valeur réelle. La seule chose à miser ici, c’est un peu de ton temps.")
  },
  "guide-table": {
    title: "Créer ou rejoindre une table",
    lead: "Tu invites la bande ou tu rejoins une table déjà ouverte ? Les deux portes sont juste devant toi.",
    body: "**Tu veux organiser la partie ?** Sur la fiche du jeu, clique sur **Créer une table**. Choisis la mise, la visibilité et, si tu veux, un nom et un code d’accès. Termine avec **Créer la table**.\n\n**Tu préfères rejoindre ?** Le bouton **Rejoindre** affiche les tables publiques de ce jeu. Avec une invitation, utilise **Rejoindre avec un code** ou **J’ai un code**. Le code d’accès n’est demandé que si la table est protégée.\n\nUn petit réflexe utile : le nom de la table est public. Ton email et tes mots de passe n’ont rien à y faire.",
    challenge: question("Un ami t’envoie le code de sa table. Tu choisis quoi ?", ["Créer une nouvelle table", "Rejoindre avec un code", "Acheter un pack"], 2, "Le code t’emmène à la bonne table. Si la partie est déjà lancée, tu arrives en spectateur.")
  },
  "guide-play": {
    title: "La salle d’attente et la partie",
    lead: "On s’installe, on choisit les règles… puis chacun son tour.",
    body: "Dans la salle d’attente, le maître de table prépare les options, invite les joueurs et ajoute des bots quand le jeu le permet. Confirme ta participation lorsque la table te le demande.\n\nUne fois en jeu, regarde **à qui est le tour** et les actions disponibles. Après un clic, laisse le serveur confirmer ton action : un bouton momentanément grisé ne veut pas dire que tu es bloqué.\n\nLes pauses des bots et les résumés de manche te laissent regarder ce qui vient de se passer. Les commandes pour passer l’attente dépendent des réglages et de tes droits. Après la partie, **Rejouer** ramène en salle d’attente.",
    challenge: question("Tu viens de lancer les dés et le bouton devient gris. Le bon réflexe ?", ["Attendre la réponse du serveur", "Cliquer partout très vite", "Créer un autre compte"], 1, "Le serveur valide le lancer avant de rendre les prochaines actions disponibles. Pour les pauses de partie, utilise les commandes affichées.")
  },
  "guide-spectate": {
    title: "Regarder avant de se lancer",
    lead: "Envie de comprendre un jeu sans te jeter dans le grand bain ? Installe-toi en spectateur.",
    body: "Rejoins une table **déjà lancée** : tu passes automatiquement en spectateur, sans mise et sans prendre le tour de quelqu’un.\n\nTu peux suivre les actions publiques, les scores et les lancers de dés. Les mains et les decks cachés restent cachés ; tu n’es pas un espion de table !\n\nAu retour en salle d’attente, tu peux demander une place pour la prochaine partie, si elle est disponible et si ton compte y a accès.",
    challenge: question("En spectateur, qu’est-ce que tu peux voir ?", ["Les cartes cachées de tout le monde", "Les actions publiques et les scores"], 2, "Tu suis la partie, mais les informations privées restent privées. Pour les jeux de dés, les lancers publics sont visibles.")
  },
  "guide-tokens": {
    title: "Tes jetons, sans prise de tête",
    lead: "Un bonus à récupérer, une mise à vérifier, un historique pour comprendre : tu gardes la main sur ton solde.",
    body: "Ton solde est dans le menu. Avec **Bonus**, récupère le bonus disponible : son montant dépend des réglages du casino et de ta série de récupérations **consécutives**. Un jour manqué interrompt la série.\n\nAvant de participer, regarde la mise et la zone des gains. Les jeux qui partagent un pot tiennent compte du classement des humains ; **les bots ne gagnent pas de jetons**. Le poker et le blackjack ont leur propre fonctionnement.\n\nUn montant te surprend ? **Profil → Transactions** raconte les entrées et les sorties. Et rappelle-toi : tout cela reste virtuel."
  },
  "guide-progress": {
    title: "Il n’y a pas que la victoire",
    lead: "Un beau lancer, une découverte inattendue, un objectif à faire ensemble… tu peux progresser de plusieurs façons.",
    body: "Les **Succès** gardent la trace de tes exploits et de tes découvertes. Certains sont secrets ; les milestones peuvent même s’afficher sur ta member card.\n\nPour comparer les performances, les **Classements** proposent la journée, la saison de trois mois ou toute la carrière. Tu peux regarder un jeu et une catégorie plutôt que tout mélanger.\n\nLes **Événements communautaires** sont des objectifs à partager. Lis leurs règles, leurs tickets et leurs récompenses avant d’agir. Si un ticket se recharge, son prochain retour est indiqué ; les récompenses dépendent de la progression collective."
  },
  "guide-profile": {
    title: "Une carte qui te ressemble",
    lead: "On aimerait savoir qui joue avec nous, pas connaître ton adresse de connexion.",
    body: "Dans **Profil → Compte**, choisis ton pseudo affiché et quelques mots de bio. Ajoute jusqu’à **cinq jeux favoris** : ils seront mis en avant dans le casino. Le genre est facultatif ; la date de naissance complète reste privée et sert aux règles d’accès liées à l’âge.\n\nAvec **Carte et confidentialité**, choisis les deux statistiques de ta member card et les indicateurs publics. Tu peux aussi y afficher tes milestones.\n\nClique sur le pseudo d’un joueur pour voir sa fiche. Ton email, tes codes de sécurité et les données parentales n’y apparaissent pas.",
    challenge: question("Que voit un autre joueur sur ton profil ?", ["Ton email de connexion", "Ton mot de passe", "Ton pseudo et les informations publiques choisies"], 3, "Tu partages ton profil de joueur, pas tes moyens de connexion. Les statistiques publiques se règlent dans Carte et confidentialité.")
  },
  "guide-shop": {
    title: "Un peu de style, à ta façon",
    lead: "Une icône discrète ou des dés qui en jettent ? Regarde le rendu avant de dépenser tes jetons.",
    body: "La **Boutique** rassemble les icônes, effets de pseudo, member cards, éléments de profil, dés et cartes. Clique sur un **aperçu**, joue avec les filtres et compare ce qui te plaît.\n\nLes objets acquis sont masqués par défaut. Le filtre **Inventaire** les retrouve. Dans un **Pack**, coche seulement les objets qui t’intéressent : la remise et le total suivent ta sélection. Tu confirmes toujours avant l’achat.\n\nTes objets sont ensuite dans **Profil → Style**, prêts à être équipés. Certains sont des récompenses de succès : impossible de les acheter directement.",
    challenge: question("Tu coches deux objets dans un pack qui en contient huit. Tu achètes…", ["Les huit objets du pack", "Uniquement les deux objets cochés"], 2, "La sélection décide de l’achat. Les objets déjà acquis ne sont pas facturés à nouveau ; vérifie le total avant de confirmer.")
  },
  "guide-friends": {
    title: "C’est encore mieux à plusieurs",
    lead: "Retrouve tes amis, lance une conversation, puis rejoins-les à leur table.",
    body: "L’icône **Social** ouvre les conversations et la liste d’amis. Tu peux rechercher un joueur, lui envoyer une demande ou passer par son profil public.\n\nDans la liste d’amis, **Discuter** ouvre le privé. **Rejoindre** t’emmène à sa table, même si tu arrives en spectateur. Les conversations récentes remontent et les indicateurs t’aident à repérer les messages non lus.\n\nLe chat sépare **Journal**, **Global**, conversations privées et **Table**. Pour les demandes et les invitations, regarde aussi les **Notifications**.",
    challenge: question("Tu veux écrire seulement aux personnes de ta table. Quel canal ?", ["Global", "Table", "Le journal"], 2, "Le canal Table est celui de la partie. Global s’adresse au site et le journal raconte les actions de jeu.")
  },
  "guide-safety": {
    title: "À toi de jouer, sereinement",
    lead: "Le but, c’est de passer un bon moment. Tu n’as pas à tout connaître aujourd’hui.",
    body: "Un mot de passe unique, une adresse email vérifiée et la **double authentification** dans **Connexion et sécurité** protègent ton compte. Ne partage jamais tes codes, même avec quelqu’un qui prétend vouloir t’aider.\n\nUn comportement te gêne ? Utilise le signalement et, si nécessaire, le blocage. Les preuves montrées au tribunal sont anonymisées ; les recours se font par email.\n\nAvant 13 ans, le parcours parental et les limites de compte s’appliquent. Les parents ont leur espace de suivi et de gestion d’accès.\n\nLa **FAQ**, l’**État des services**, les **Patchnotes** et les pages légales restent dans le bas de page. Tu peux aussi revenir à ce guide quand tu veux. **Maintenant, choisis un jeu qui te tente.**"
  }
};
