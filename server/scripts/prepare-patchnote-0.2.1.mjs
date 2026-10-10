import "dotenv/config";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { normalizeRankedConfig, RANK_DIVISIONS } from "../src/services/ranked.js";
import { createPatchnoteStore } from "../src/services/patchnotes.js";

export function patchnote021(ranks, base = "/ktga") {
  const link = (route) => `${base}${route}`;
  const section = (title) => ({ type: "section", title, metadata: { level: 2 } });
  const change = (category, title, content) => ({ type: "change", category, title, content });
  const badge = (rank, division = "") => {
    const image = (rank.divisionInsignia?.[division] ?? rank).insigniaImage;
    assert.match(image ?? "", /^[a-f0-9]{64}$/, `Insigne manquant pour ${rank.name} ${division}`);
    return `![${rank.name}${division ? ` ${division}` : ""}](${link(`/api/ranked/insignia-images/${image}`)})`;
  };
  const divided = ranks.filter((rank) => rank.divisions > 1);
  assert.ok(divided.every((rank) => rank.divisions === 3), "Relire le tableau si le nombre de divisions change.");
  const divisionTable = [
    "| Rang | Division I | Division II | Division III |",
    "| :--- | :---: | :---: | :---: |",
    ...divided.map((rank) => `| **${rank.name}** | ${RANK_DIVISIONS.slice(0, 3).map((division) => badge(rank, division)).join(" | ")} |`)
  ].join("\n");
  const finalTable = [
    "| Rang | Insigne |",
    "| :--- | :---: |",
    ...ranks.filter((rank) => rank.divisions === 1).map((rank) => `| **${rank.name}** | ${badge(rank)} |`)
  ].join("\n");

  return {
    version: "0.2.1", versionGroup: "0.2", status: "draft",
    publishedAt: "2026-10-08T14:00:00.000Z",
    title: "Le classé entre en jeu, la maîtrise prend le relais",
    summary: "Le classé arrive sur sept jeux, avec des placements, des rangs et des insignes à afficher. La progression continue après le niveau 100 grâce aux maîtrises. Les tables, les mandats des Dés de Minuit et les outils de suivi reçoivent également plusieurs améliorations.",
    blocks: [
      { type: "paragraph", content: `La [0.2.0](${link("/patchnotes?version=0.2.0")}) posait les bases de la progression par jeu. Avec la **0.2.1**, on passe à la suite : jouer pour progresser, mais aussi se mesurer aux autres dans des conditions communes.\n\nLe mode classique reste là pour les parties entre amis. Le classé ajoute un autre défi, sans remplacer les niveaux, les succès ou vos tables habituelles.` },
      section("Le classé arrive au casino"),
      change("game", "Sept jeux pour se mesurer aux autres", `Un sélecteur **Classique / Classé** est maintenant disponible sur [l'accueil](${link("/")}). Le mode classé propose une file de recherche dédiée, avec des règles définies pour chaque jeu.\n\nLes jeux disponibles sont :\n- **Belote**, en équipes ;\n- **Texas Hold'em** ;\n- **Président** ;\n- **Liar's Dice** ;\n- **Velvet Ruse** ;\n- **Yahtzee** ;\n- **Dés de Minuit**.\n\nIl n'est pas nécessaire de créer sa propre table : la file réunit les joueurs puis prépare la partie.`),
      change("feature", "Un placement pour chaque jeu", "Avant de recevoir un rang, le joueur passe par une série de **parties de placement propre à chaque jeu**. Durant cette phase, son profil indique **Non classé** et affiche son avancement.\n\nLe classement définitif n'est révélé qu'une fois le placement terminé. Les résultats et le niveau des adversaires rencontrés servent à déterminer le rang de départ : une victoire n'a pas le même poids selon l'opposition.\n\nLe nombre de parties de placement est réglable par l'administration. Une partie annulée pour une raison technique ne consomme pas un placement ; un abandon reste pris en compte comme une défaite."),
      change("feature", "Une recherche qui essaie de remplir la table", "La recherche privilégie les joueurs les plus proches dans les divisions, puis élargit progressivement sa plage. Lorsque le jeu accepte plusieurs tailles de groupe, elle essaie d'abord de remplir la salle au maximum. Si le délai de complétion est atteint, la partie peut être préparée avec le nombre minimum requis.\n\nLes joueurs attendent dans une **pool d'entrée**, sans occuper de siège dans une table déjà lancée. La salle n'est créée qu'après les confirmations.\n\nPendant les placements, la recherche utilise immédiatement sa plage maximale et peut l'assouplir après un délai si aucun groupe compatible ne se forme."),
      change("feature", "Tout le monde confirme avant de commencer", "Lorsqu'un groupe est trouvé, chaque joueur doit **accepter de rejoindre la partie**. Les silhouettes grises deviennent vertes à mesure que les joueurs se déclarent prêts.\n\nUne préparation d'au moins **30 secondes** laisse le temps de voir la proposition et de confirmer. Le nom du jeu, le rang, le temps d'attente et les places à trouver sont mis en avant.\n\nUne fois les confirmations réunies, le message **« Création de la table… »** remplace le compteur avant l'entrée en jeu. Si quelqu'un ne confirme pas à temps, les autres joueurs peuvent repartir en recherche sans être placés dans une salle incomplète."),
      section("Les rangs et leurs insignes"),
      change("balance", "Du Bois à la Légende", "Les rangs suivent cet ordre : **Bois → Cuivre → Bronze → Argent → Or → Platine → Diamant → Maître → Grand Maître → Légende**.\n\nDu Bois au Maître, chaque rang possède trois divisions. La progression se fait bien dans le sens **I → II → III**, puis vers la division I du rang suivant. **Grand Maître** et **Légende** n'ont pas de divisions.\n\nChaque jeu conserve son propre classement : être bien classé au Yahtzee ne vous donne pas automatiquement le même rang à la Belote."),
      change("game", "Les insignes par division", `Voici les insignes associés à chaque division, dans l'ordre de progression.\n\n${divisionTable}`),
      change("game", "Les derniers rangs", `${finalTable}\n\nCes deux rangs constituent le sommet du classement actuel.`),
      change("feature", "Un insigne à porter, pas un chiffre à comparer", `Dans [le profil](${link("/profil")}), le joueur peut choisir **un insigne de classement à afficher à gauche de son icône cosmétique**. Les insignes sont agrandis pour rester lisibles à côté des éléments de style.\n\nLes profils publics et les tables mettent en avant le **rang et la division**, pas la valeur chiffrée du classement. Votre évolution détaillée reste accessible dans vos propres résultats et votre suivi personnel.\n\nLes titres sont affichés sous le pseudo. Sur le profil public, les jeux favoris et leurs titres restent visibles sans exposer toute la progression de niveau.`),
      section("Des parties classées plus lisibles"),
      change("game", "Le rang au centre de la table", "Dans une table classée, les informations habituelles de mise sont remplacées par les rangs des joueurs lorsque les jetons ne font pas partie du jeu. Le poker conserve ses informations de cave, de mises et de pot.\n\nUn **compteur de tour** permet de suivre le temps restant avant l'action automatique. Les délais de reconnexion sont également distingués du temps de jeu normal.\n\nLes spectateurs ne reçoivent pas les mains, les tirages privés ou les autres informations cachées aux joueurs."),
      change("balance", "Un résultat qui tient compte de l'opposition", "Le calcul du classement est commun aux jeux classés, mais s'adapte à leur format : duel, classement de plusieurs joueurs, gagnant contre tous ou équipes.\n\nBattre une opposition plus forte fait davantage progresser ; une défaite contre une opposition plus faible pèse davantage. Les égalités et la position finale sont prises en compte. Pour les équipes, la force moyenne de l'équipe sert de référence.\n\nLa taille de la salle est prise en compte pour limiter les variations excessives. Le serveur calcule le résultat et ne peut l'attribuer qu'une seule fois pour une même partie."),
      change("feature", "Voir sa progression à la fin de la partie", "Le récapitulatif classé affiche **le rang avant et après la partie**, ainsi que votre évolution personnelle. Il remplace les gains en jetons lorsqu'ils ne sont pas pertinents pour ce mode.\n\nPendant un placement, il présente plutôt l'avancement et le bilan des parties jouées. Une fois le placement terminé, le rang obtenu est révélé.\n\nLes abandons, absences prolongées et déconnexions suivent les règles du jeu classé. Ils ne doivent pas devenir une manière d'éviter un résultat défavorable."),
      section("La progression continue avec les maîtrises"),
      change("feature", "Le niveau 101 ouvre un nouveau cycle", "Les niveaux ne disparaissent pas. Lorsqu'un joueur atteint le **niveau 101**, il revient au **niveau 1** et gagne **une maîtrise supplémentaire** dans ce jeu.\n\nL'expérience totale reste conservée. Ce nouveau cycle ne supprime ni les succès obtenus ni les titres déjà débloqués. Le niveau maximum déjà atteint reste également pris en compte pour les succès de progression.\n\nLa maîtrise indique votre progression de longue durée. Elle est distincte du rang classé, qui dépend des résultats face aux autres joueurs."),
      change("feature", "Des titres avec un chiffre romain", "À **maîtrise 0**, le titre n'a pas de suffixe. À **maîtrise 1**, il reçoit **I**, puis **II**, **III**, **IV** et ainsi de suite.\n\nPar exemple, un titre **Brelan** devient **Brelan I** après la première maîtrise, ou **Brelan IV** à maîtrise 4. Le joueur conserve le choix de son titre parmi ceux qu'il a déjà débloqués."),
      change("balance", "Chaque maîtrise demande plus d'expérience", "Le coût d'un niveau reprend la formule d'expérience configurée pour le jeu, multipliée par **(maîtrise + 1)**.\n\nLe premier cycle utilise donc le coût normal. À maîtrise 1, chaque niveau coûte deux fois plus ; à maîtrise 4, cinq fois plus.\n\nLes gains d'expérience de fin de partie et les bonus de victoire continuent de fonctionner. Les récompenses de succès déjà obtenus ne sont pas redistribuées à chaque nouveau cycle."),
      section("Les succès donnent un coup de pouce"),
      change("balance", "Des récompenses d'expérience selon la difficulté", "Les succès liés aux jeux reçoivent des récompenses d'expérience adaptées à leur difficulté :\n\n| Difficulté | Expérience de base |\n| :--- | ---: |\n| Facile | 30 XP |\n| Moyen | 50 XP |\n| Difficile | 100 XP |\n| Très difficile | 300 XP |\n\nUn succès **milestone** ajoute **200 XP**. Un succès **secret** ajoute **500 XP** supplémentaires. Ces bonus se cumulent lorsqu'un succès remplit les deux conditions.\n\nLa récompense est attribuée dans le jeu concerné, une seule fois à l'obtention du succès. Les récompenses restent ajustables dans l'éditeur."),
      change("feature", "De nouveaux jalons pour chaque jeu", "Trois succès de progression sont prévus pour chacun des **15 jeux**, soit **45 jalons** au total. Les niveaux **10** et **100** ont leur succès milestone ; un troisième défi secret accompagne la progression de fin de cycle.\n\nCes objectifs complètent les succès de score, de combinaisons et de victoires. Un changement de maîtrise ne remet pas leur obtention à zéro."),
      section("Les tables gagnent en confort"),
      change("game", "Dés de Minuit : chacun ses quatre mandats", "Un nouveau modificateur, **activé par défaut**, distribue **quatre mandats aléatoires à chaque joueur**, au lieu d'imposer le même choix à toute la table.\n\nLes offres individuelles sont privées et renouvelées avec la rotation. Le sélecteur affiche uniquement les mandats actuellement sélectionnables : plus besoin de parcourir des contrats indisponibles.\n\nLe jeu peut également être rejoint en classé, avec les règles définies pour ce mode."),
      change("fix", "Le plein écran ne doit plus couper la partie", "La disposition des tables les plus verticales, en particulier **Texas Hold'em** et **Dés de Minuit**, est revue pour les écrans de hauteur classique.\n\nLes informations de table et les blocs d'attente gardent une hauteur adaptée à leur contenu. La zone centrale peut défiler lorsque nécessaire, sans masquer le bas du jeu.\n\nLes cartes du poker sont également **plus grandes sur le tapis en plein écran**, pour faciliter la lecture de la main et des cartes communes."),
      change("fix", "Des profils et des insignes plus clairs", "La présentation sépare mieux le pseudo, le titre, l'icône cosmétique et l'insigne classé. Les deux insignes peuvent être affichés ensemble, sans écraser les statistiques.\n\nLe profil public se concentre sur les jeux favoris, leurs titres et les rangs. L'avancement détaillé des niveaux reste dans le profil personnel."),
      section("De nouveaux outils pour suivre le classé"),
      change("tool", "Des réglages globaux et par jeu", "L'administration dispose de réglages communs ou propres à chaque jeu pour le calcul du classement, les placements, les délais, les tailles de groupe et la recherche par divisions.\n\nLes rangs et leurs divisions peuvent être personnalisés, avec un insigne différent pour chaque division. L'outil d'image permet de recadrer, déplacer et comparer les autres insignes en transparence.\n\nLes valeurs de progression et de classement peuvent aussi être corrigées depuis le dossier d'un joueur. Les modifications de classement sont protégées lorsqu'une recherche ou une partie est en cours."),
      change("tool", "Des métriques pour repérer les déséquilibres", "De nouvelles vues permettent de suivre la **répartition des rangs et divisions**, la population classée, les résultats, les abandons et l'activité des parties.\n\nLes indicateurs de moyenne et de médiane du classement servent au suivi administratif. Les joueurs encore en placement ne sont pas mélangés aux rangs définitifs dans ces statistiques.\n\nL'objectif est de pouvoir ajuster les règles et les files sur des données réelles, plutôt que sur des impressions."),
      section("Correctifs et repères utiles"),
      change("fix", "Les placements ne doivent pas rester bloqués", "La recherche d'un joueur en placement ne dépend plus de la plage étroite d'un adversaire déjà classé. Elle part sur la fenêtre maximale, privilégie les correspondances proches puis peut élargir la recherche lorsque la plage ne permet pas de former un groupe.\n\nLa transition entre la confirmation et la création de la salle utilise désormais un message explicite, au lieu d'un bref compteur trompeur.\n\nL'ordre des divisions est harmonisé : **III est bien supérieur à II, lui-même supérieur à I**."),
      { type: "paragraph", content: `Envie d'essayer ? Le sélecteur **Classique / Classé** vous attend sur [l'accueil](${link("/")}). Les titres et les insignes se choisissent dans [votre profil](${link("/profil")}).\n\nUn problème ou un résultat qui semble incohérent ? Le [suivi des bugs](${link("/bugs")}) permet de consulter les signalements, et le bouton de signalement du site reste disponible pour transmettre le contexte.\n\nLes rangs, les délais et les gains peuvent encore être ajustés : cette mise à jour pose le cadre du classé, pas un équilibrage gravé dans le marbre.` }
    ]
  };
}

async function main() {
  const database = new DatabaseSync(path.resolve(process.env.SQLITE_PATH || "data/ktga.sqlite"), { readOnly: true });
  let settings, authorId;
  try {
    settings = JSON.parse(database.prepare("SELECT value FROM meta WHERE key='admin-settings'").get()?.value || "{}");
    authorId = database.prepare("SELECT id,data FROM users WHERE lower(pseudo)=?").get("bnmkt");
    assert.ok(authorId && JSON.parse(authorId.data).admin, "Le compte auteur doit être administrateur.");
    authorId = authorId.id;
  } finally { database.close(); }
  const plan = patchnote021(normalizeRankedConfig(settings.ranked).ranks, (process.env.APP_BASE_PATH || "").replace(/\/$/, ""));
  for (const block of plan.blocks) assert.ok((block.content?.length ?? 0) <= 4000, `Bloc trop long : ${block.title}`);
  assert.ok(!/\belo\b/i.test(JSON.stringify(plan.blocks)), "Ne pas afficher de valeurs de classement privées.");
  if (!process.argv.includes("--apply")) {
    console.log(JSON.stringify({ version: plan.version, status: plan.status, publishedAt: plan.publishedAt, blocks: plan.blocks.length, images: (JSON.stringify(plan).match(/insignia-images/g) ?? []).length }));
    return;
  }
  const filename = path.resolve(process.env.PATCHNOTES_DB_PATH || "data/patchnotes.sqlite");
  const backupDirectory = path.join(path.dirname(filename), "backups");
  fs.mkdirSync(backupDirectory, { recursive: true });
  const backup = path.join(backupDirectory, `patchnotes-before-0.2.1-${Date.now()}.sqlite`);
  const before = new DatabaseSync(filename, { readOnly: true });
  try {
    assert.equal(before.prepare("SELECT id FROM patchnotes WHERE version=?").get(plan.version), undefined, "Cette version existe déjà : ne pas écraser un brouillon modifié.");
    before.prepare("VACUUM INTO ?").run(backup);
  } finally { before.close(); }
  const store = createPatchnoteStore({ filename, uploadDirectory: path.resolve(process.env.PATCHNOTES_UPLOAD_DIR || "data/patchnote-images") });
  try {
    const previousVersion = store.currentVersion;
    const existing = JSON.stringify(store.list({ includeDrafts: true }).map((row) => store.get(row.id, { includeDrafts: true })));
    const draft = store.create(plan, authorId);
    const note = store.update(draft.id, plan);
    assert.equal(store.get(note.id), null);
    assert.equal(store.currentVersion, previousVersion);
    assert.equal(JSON.stringify(store.list({ includeDrafts: true }).filter((row) => row.id !== note.id).map((row) => store.get(row.id, { includeDrafts: true }))), existing);
    console.log(JSON.stringify({ id: note.id, version: note.version, status: note.status, publishedAt: note.publishedAt, blocks: note.blocks.length, currentVersion: store.currentVersion, backup }));
  } finally { store.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
