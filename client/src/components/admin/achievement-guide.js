const scoreGames = new Set(["yahtzee", "cul-de-chouette", "farkle", "midnight-dice"]);

export function achievementGoals(gameId = "") {
  const goals = [
    { id: "wins", label: "Gagner des parties", example: "10 victoires", icon: "trophy", amount: 10, unit: "Victoires à obtenir" },
    { id: "plays", label: "Terminer des parties", example: "50 parties terminées", icon: "gamepad", amount: 50, unit: "Parties à terminer" },
    { id: "streak", label: "Gagner plusieurs fois de suite", example: "3 victoires consécutives", icon: "flame", amount: 3, unit: "Victoires consécutives" },
    { id: "gain", label: "Remporter un gros gain", example: "5 000 jetons dans une partie", icon: "coins", amount: 5000, unit: "Gain minimum, en jetons", repeatable: true },
    { id: "tableTime", label: "Passer du temps sur une table", example: "10 minutes actives sur une même table", icon: "calendar", amount: 10, unit: "Minutes actives sur une même table" },
    { id: "roundTime", label: "Passer du temps dans une manche", example: "5 minutes actives dans une même manche", icon: "calendar", amount: 5, unit: "Minutes actives dans une même manche" }
  ];
  if (scoreGames.has(gameId)) goals.push({ id: "score", label: "Atteindre un score", example: gameId === "yahtzee" ? "300 points dans une partie" : "1 000 points dans une partie", icon: "target", amount: gameId === "yahtzee" ? 300 : 1000, unit: "Score minimum", repeatable: true });
  if (gameId === "farkle") goals.push({ id: "roll", label: "Réussir un lancer exceptionnel", example: "3 000 points en un lancer", icon: "dice", amount: 3000, unit: "Points minimum en un lancer", repeatable: true });
  if (gameId === "blackjack") goals.push({ id: "tie21", label: "Faire égalité à 21", example: "21 pour le joueur et le croupier", icon: "target", repeatable: true });
  if (gameId) goals.push({ id: "feat", label: "Réaliser un exploit du jeu", example: "Une combinaison ou un résultat particulier", icon: "badge", repeatable: true });
  else goals.push(
    { id: "siteVisit", label: "Visiter une page", example: "Une page, un objet equipe, un indice secret...", icon: "target" },
    { id: "ownItem", label: "Posseder un objet precis", example: "Un objet choisi dans la boutique", icon: "shop" },
    { id: "activeTime", label: "Passer du temps au casino", example: "60 minutes actives, suivi facultatif", icon: "calendar", amount: 60, unit: "Minutes actives cumulees" },
    { id: "visitDays", label: "Visiter plusieurs jours", example: "30 jours distincts, suivi facultatif", icon: "calendar", amount: 30, unit: "Jours de visite (UTC)" },
    { id: "dailyStreak", label: "Revenir plusieurs jours de suite", example: "7 bonus quotidiens consécutifs", icon: "calendar", amount: 7, unit: "Jours consécutifs avec bonus récupéré" },
    { id: "dailyClaims", label: "Récupérer des bonus", example: "50 bonus quotidiens", icon: "gift", amount: 50, unit: "Bonus à récupérer" },
    { id: "shopPurchases", label: "Acheter dans la boutique", example: "10 achats", icon: "shop", amount: 10, unit: "Achats à effectuer" },
    { id: "shopSpent", label: "Dépenser dans la boutique", example: "100 000 jetons dépensés", icon: "coins", amount: 100000, unit: "Jetons à dépenser" },
    { id: "cosmeticCount", label: "Collectionner des objets", example: "25 objets possédés", icon: "badge", amount: 25, unit: "Objets à posséder" },
    { id: "staked", label: "Cumuler des mises", example: "50 000 jetons misés", icon: "coins", amount: 50000, unit: "Jetons à miser au total" }
  );
  return goals;
}

function hasSignal(condition) {
  return condition?.field === "signals" || (condition?.all ?? condition?.any ?? []).some(hasSignal) || (condition?.not ? hasSignal(condition.not) : false);
}

export function gameFeats(achievements, gameId) {
  return achievements.filter((entry) => entry.builtIn && entry.rule?.event === "game.finished" && entry.rule.aggregate === "match" && (entry.gameId ?? entry.rule.gameId) === gameId && hasSignal(entry.rule.condition));
}

export function buildGuidedAchievement(config, games, achievements = []) {
  const { gameId = "", objective, featId } = config;
  const goal = achievementGoals(gameId).find((entry) => entry.id === objective);
  if (!goal) throw new Error("Choisis un objectif.");
  const amount = Number(config.amount);
  const repetitions = Number(config.repetitions ?? 1);
  if (goal.amount && (!Number.isInteger(amount) || amount < 1 || amount > 1000000000)) throw new Error("Le nombre à atteindre doit être compris entre 1 et 1 000 000 000.");
  if (goal.repeatable && (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 1000000000)) throw new Error("Le nombre de parties doit être compris entre 1 et 1 000 000 000.");
  const game = games.find((entry) => entry.id === gameId);
  if (gameId && !game) throw new Error("Choisis un jeu disponible.");
  const suffix = game ? ` à ${game.name}` : ", tous jeux confondus";
  const n = new Intl.NumberFormat("fr").format(amount);
  let rule, target = amount, description;
  const finished = (condition, aggregate = "count", scope = "career") => ({ source: "event", event: "game.finished", scope, aggregate, ...(gameId ? { gameId } : {}), condition });
  if (["tableTime", "roundTime"].includes(objective)) {
    const table = objective === "tableTime";
    target = amount * 60;
    if (target > 1000000000) throw new Error("La durée dépasse le maximum de 16 666 666 minutes.");
    rule = { source: "event", event: table ? "table.activity" : "game.round.activity", aggregate: "max", scope: "career", valueField: table ? "tableSeconds" : "roundSeconds", ...(gameId ? { gameId } : {}), condition: { field: "seconds", operator: "gt", value: 0 } };
    description = `Passer ${n} minute(s) actives ${table ? "sur une même table" : "dans une même manche"}${game ? ` à ${game.name}` : ""}, en tant que joueur.`;
  } else if (["siteVisit", "ownItem", "activeTime", "visitDays"].includes(objective)) {
    const all = [];
    if (objective === "siteVisit") {
      all.push({ field: "page", operator: "eq", value: config.page || "lobby" });
      if (config.equippedItem) all.push({ field: "player.equippedItemIds", operator: "contains", value: config.equippedItem });
      if (config.browser) all.push({ field: "browser", operator: "eq", value: config.browser });
      if (config.marker) {
        if (!/^[a-z0-9-]{1,48}$/.test(config.marker)) throw new Error("L'indice contient uniquement des lettres minuscules, chiffres et tirets (48 maximum).");
        all.push({ field: "markers", operator: "contains", value: `${config.markerKey === "challenge" ? "challenge" : "secret"}:${config.marker}` });
      }
    } else if (objective === "ownItem") {
      if (!config.ownedItem) throw new Error("Choisis un objet de la boutique.");
      all.push({ field: "player.ownedItemIds", operator: "contains", value: config.ownedItem });
    } else all.push({ field: "page", operator: "exists", value: true });
    const cumulative = ["activeTime", "visitDays"].includes(objective);
    target = objective === "activeTime" ? amount * 60 : objective === "visitDays" ? amount : 1;
    if (target > 1000000000) throw new Error("La durée dépasse le maximum de 16 666 666 minutes.");
    rule = { source: "event", event: objective === "ownItem" ? "inventory.checked" : objective === "activeTime" ? "site.activity" : "site.visit", scope: cumulative ? "career" : "event", aggregate: cumulative ? "max" : "match", ...(cumulative ? { valueField: objective === "activeTime" ? "activeSeconds" : "visitDays" } : {}), condition: { all } };
    description = objective === "activeTime" ? `Cumuler ${n} minutes actives au casino.` : objective === "visitDays" ? `Visiter le casino sur ${n} jours distincts.` : objective === "ownItem" ? "Posseder l'objet choisi dans la boutique." : `Visiter la page choisie${config.equippedItem ? " avec l'objet choisi equipe" : ""}${config.browser ? ` depuis ${config.browser}` : ""}${config.marker ? " en suivant l'indice secret" : ""}.`;
  } else if (objective === "wins") {
    rule = { source: "metric", metric: gameId ? `gameWins.${gameId}` : "wins" };
    description = `Gagner ${n} partie(s)${suffix}.`;
  } else if (objective === "plays") {
    rule = gameId ? finished({ field: "gameId", operator: "eq", value: gameId }) : { source: "metric", metric: "gamesPlayed" };
    description = `Terminer ${n} partie(s)${suffix}.`;
  } else if (objective === "streak") {
    rule = finished({ field: "won", operator: "eq", value: true }, "streak");
    description = `Gagner ${n} partie(s) consécutive(s)${suffix}.`;
  } else if (goal.repeatable) {
    let condition;
    if (objective === "feat") {
      const feat = gameFeats(achievements, gameId).find((entry) => entry.id === featId);
      if (!feat) throw new Error("Choisis un exploit.");
      condition = structuredClone(feat.rule.condition);
      description = feat.description;
    } else if (objective === "tie21") {
      condition = { all: [{ field: "handTotal", operator: "eq", value: 21 }, { field: "dealerTotal", operator: "eq", value: 21 }] };
      description = "Terminer à égalité avec le croupier, tous les deux à 21, au Blackjack.";
    } else {
      const field = { score: "score", roll: "maxRollScore", gain: "gain" }[objective];
      condition = { field, operator: "gte", value: amount };
      description = objective === "roll" ? `Marquer au moins ${n} points en un seul lancer à Farkle.` : objective === "score" ? `Terminer une partie avec au moins ${n} points${suffix}.` : `Recevoir au moins ${n} jetons de gains dans une partie${suffix}.`;
    }
    target = repetitions;
    rule = finished(condition, repetitions === 1 ? "match" : "count", repetitions === 1 ? "event" : "career");
    if (repetitions > 1) description += ` Réussir dans ${new Intl.NumberFormat("fr").format(repetitions)} parties différentes.`;
  } else {
    rule = { source: "metric", metric: objective };
    description = {
      dailyStreak: `Récupérer le bonus quotidien ${n} jours d'affilée.`,
      dailyClaims: `Récupérer ${n} bonus quotidiens au total.`,
      shopPurchases: `Effectuer ${n} achats dans la boutique.`,
      shopSpent: `Dépenser ${n} jetons dans la boutique.`,
      cosmeticCount: `Posséder ${n} objets cosmétiques.`,
      staked: `Miser ${n} jetons au total.`
    }[objective];
  }
  return { rule, target, description, gameId: gameId || null, type: gameId ? "games" : "site", group: game?.name ?? (objective.startsWith("shop") || objective === "cosmeticCount" ? "Boutique" : "Site") };
}

export function describeAchievementRule(entry, schemas, games = [], achievements = []) {
  const rule = entry.rule;
  if (!rule) return "Aucune condition définie.";
  const count = new Intl.NumberFormat("fr").format(entry.target);
  if (rule.source === "metric") return `${schemas?.metrics?.find((metric) => metric.id === rule.metric)?.label ?? rule.metric} : ${count}.`;
  const fields = schemas?.events?.find((event) => event.id === rule.event)?.fields ?? [];
  const labels = { eq: "=", neq: "≠", gt: ">", gte: "≥", lt: "<", lte: "≤", contains: "contient", containsAll: "contient toutes les valeurs", containsAny: "contient une des valeurs", in: "parmi", notIn: "hors", startsWith: "commence par", endsWith: "se termine par" };
  const fieldName = (field) => fields.find((item) => item.field === field)?.label ?? field;
  const conditionText = (node) => {
    if (!node) return "";
    if (node.all) return `(${node.all.map(conditionText).join(" et ")})`;
    if (node.any) return `(${node.any.map(conditionText).join(" ou ")})`;
    if (node.not) return `sauf si ${conditionText(node.not)}`;
    if (node.operator === "exists") return `${fieldName(node.field)} ${node.value === false ? "absent" : "présent"}`;
    const value = (raw) => node.field === "gameId" ? games.find((game) => game.id === raw)?.name ?? raw : node.field === "signals" ? achievements.find((achievement) => achievement.id === raw)?.title ?? raw : raw === true ? "oui" : raw === false ? "non" : String(raw ?? "");
    return `${fieldName(node.field)} ${labels[node.operator] ?? node.operator} ${node.valueField ? fieldName(node.valueField) : Array.isArray(node.value) ? node.value.map(value).join(", ") : value(node.value)}`;
  };
  const mode = { match: "Valider une fois", count: `Réussir ${count} fois`, sum: `Cumuler ${count} (${fieldName(rule.valueField)})`, max: `Atteindre ${count} (${fieldName(rule.valueField)})`, distinct: `Obtenir ${count} valeurs différentes (${fieldName(rule.valueField)})`, streak: `Réussir ${count} fois de suite` }[rule.aggregate];
  const scope = { event: "sur un événement", game: "dans une même partie", career: "sur l'ensemble des parties" }[rule.scope];
  const game = games.find((item) => item.id === rule.gameId);
  return `${mode}, ${scope}${game ? ` à ${game.name}` : ""} : ${conditionText(rule.condition)}.`;
}
