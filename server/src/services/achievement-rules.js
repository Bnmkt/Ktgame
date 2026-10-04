import { playerContextFields, sitePages, browserFamilies, tableTimeMetrics } from "./site-achievements.js";
import { normalizeAchievementRewards } from "./game-progression.js";
const operators = new Set(["eq", "neq", "gt", "gte", "lt", "lte", "in", "notIn", "contains", "containsAny", "containsAll", "exists", "startsWith", "endsWith"]);
const aggregates = new Set(["match", "count", "sum", "max", "distinct", "streak"]);
const scopes = new Set(["event", "game", "career"]);

export const achievementEventSchema = {
  "game.action": {
    label: "Action effectuée dans une partie",
    fields: {
      gameId: "Jeu", action: "Type d'action", playerId: "Joueur", roomId: "Table", phase: "Phase",
      dice: "Valeurs des dés", diceCount: "Nombre de dés", rollScore: "Score du lancer", selectedDice: "Dés sélectionnés",
      turnScore: "Score du tour", totalScore: "Score total", cards: "Cartes visibles", handSize: "Nombre de cartes",
      handTotal: "Valeur de la main", category: "Catégorie", categoryScore: "Score de la catégorie",
      logTexts: "Nouveaux messages structurés", flags: "Marqueurs du moteur"
    }
  },
  "game.finished": {
    label: "Partie terminée",
    fields: {
      gameId: "Jeu", playerId: "Joueur", roomId: "Table", won: "Victoire", rank: "Classement", score: "Score final",
      gain: "Gain", pot: "Pot", playerCount: "Nombre de joueurs", signals: "Résultats remarquables",
      zeroScores: "Scores à zéro", completedCategories: "Catégories complétées", handSize: "Nombre de cartes",
      handTotal: "Valeur de la main", dealerTotal: "Valeur du croupier", maxRollScore: "Meilleur lancer",
      maxTurnScore: "Meilleur tour", contractsAttempted: "Mandats tentés", contractsCompleted: "Mandats réussis",
      completedContractIds: "Mandats distincts réussis", marketDiscards: "Dés écartés", bluffsCaught: "Bluffs démasqués"
    }
  },
  transaction: { label: "Transaction de jetons", fields: { amount: "Montant", balance: "Nouveau solde", reason: "Motif", gameId: "Jeu", roomId: "Table" } },
  "shop.purchase": { label: "Achat en boutique", fields: { itemId: "Objet", itemType: "Type d'objet", itemCategory: "Collection", price: "Prix", quantity: "Quantité" } },
  "daily.claimed": { label: "Bonus journalier récupéré", fields: { amount: "Montant", claims: "Nombre de bonus", streak: "Série", multiplier: "Multiplicateur" } },
  "account.browser": { label: "Navigateur détecté", fields: { browser: "Navigateur" } },
  "achievement.unlocked": { label: "Succès débloqué", fields: { achievementId: "Succès", group: "Groupe", unlockedCount: "Nombre débloqué" } },
  "site.random": { label: "Tirage aléatoire du site", fields: { roll: "Valeur tirée", maximum: "Maximum" } }
};

const activityFields = { page: "Page visitee", browser: "Famille du navigateur", markers: "Indices dans l'URL (secret:valeur ou challenge:valeur)", seconds: "Secondes actives depuis le dernier signal", activeSeconds: "Secondes actives cumulees", visitDays: "Jours de visite (UTC)", pageCount: "Types de pages visites" };
const tableFields = { gameId: "Jeu", roomId: "Table", phase: "Etat de la table (waiting, playing, finished)", roundNumber: "Numero de manche / main", seconds: "Secondes actives depuis le dernier signal", tableSeconds: "Temps actif sur cette table (secondes)", roundSeconds: "Temps actif dans cette manche (secondes)", tableActiveSeconds: "Temps actif cumule aux tables (secondes)", roundActiveSeconds: "Temps actif cumule en manches (secondes)" };
Object.assign(achievementEventSchema, {
  "game.xp": { label: "XP de jeu reçue", fields: { gameId: "Jeu", amount: "XP reçue", xp: "XP totale dans le jeu", level: "Niveau dans le jeu", previousLevel: "Niveau précédent", title: "Titre obtenu", reason: "Origine de l’XP" } },
  "game.level": { label: "Niveau de jeu atteint", fields: { gameId: "Jeu", xp: "XP totale dans le jeu", level: "Nouveau niveau", previousLevel: "Niveau précédent", title: "Titre obtenu" } },
  "table.activity": { label: "Temps actif sur une table (facultatif)", fields: tableFields },
  "game.round.activity": { label: "Temps actif dans une manche (facultatif)", fields: tableFields },
  "site.visit": { label: "Visite d'une page (facultatif)", fields: activityFields },
  "site.activity": { label: "Temps actif sur le site (facultatif)", fields: activityFields },
  "account.login": { label: "Connexion au compte", fields: { method: "Methode" } },
  "inventory.checked": { label: "Inventaire verifie (connexion, achat ou equipement)", fields: { reason: "Motif" } },
  "player.updated": { label: "Profil modifie", fields: { changed: "Champs modifies" } },
  "inventory.equipped": { label: "Equipement modifie", fields: { changed: "Emplacements modifies" } }
});
for (const schema of Object.values(achievementEventSchema)) schema.fields = { ...schema.fields, ...playerContextFields };

export const achievementMetricSchema = {
  ...tableTimeMetrics,
  accountAgeDays: "Anciennete du compte (jours)",
  tokens: "Solde de jetons", friendCount: "Nombre d'amis",
  highestGameLevel: "Plus haut niveau de jeu", totalGameXp: "XP totale dans tous les jeux",
  gamesPlayed: "Parties terminées",
  wins: "Victoires",
  staked: "Jetons misés",
  dailyClaims: "Bonus récupérés",
  dailyStreak: "Meilleure série de bonus",
  shopPurchases: "Achats en boutique",
  shopSpent: "Jetons dépensés en boutique",
  cosmeticCount: "Objets possédés",
  cosmeticTypes: "Types cosmétiques possédés",
  midnightContractsCompleted: "Mandats de Dés de Minuit distincts réussis",
  achievementsUnlocked: "Succès débloqués",
  visibleAchievementsUnlocked: "Succès non secrets débloqués"
};

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

export function getRuleValue(source, path) {
  return String(path ?? "").split(".").filter(Boolean).reduce((value, key) => value == null ? undefined : value[key], source);
}

function comparable(value) {
  if (typeof value === "number" || typeof value === "boolean") return value;
  const number = Number(value);
  return value !== "" && Number.isFinite(number) ? number : String(value ?? "").toLocaleLowerCase("fr");
}

export function evaluateAchievementCondition(condition, payload) {
  if (!condition) return true;
  if (Array.isArray(condition.all)) return condition.all.every((entry) => evaluateAchievementCondition(entry, payload));
  if (Array.isArray(condition.any)) return condition.any.some((entry) => evaluateAchievementCondition(entry, payload));
  if (condition.not) return !evaluateAchievementCondition(condition.not, payload);
  const actual = getRuleValue(payload, condition.field);
  const expected = condition.valueField ? getRuleValue(payload, condition.valueField) : condition.value;
  const operator = condition.operator ?? "eq";
  if (operator === "exists") return condition.value === false ? actual == null : actual != null;
  if (operator === "contains") return Array.isArray(actual) ? actual.some((value) => comparable(value) === comparable(expected)) : String(actual ?? "").includes(String(expected ?? ""));
  if (operator === "containsAny") return Array.isArray(actual) && (Array.isArray(expected) ? expected : [expected]).some((value) => actual.some((entry) => comparable(entry) === comparable(value)));
  if (operator === "containsAll") return Array.isArray(actual) && (Array.isArray(expected) ? expected : [expected]).every((value) => actual.some((entry) => comparable(entry) === comparable(value)));
  if (operator === "in") return (Array.isArray(expected) ? expected : [expected]).some((value) => comparable(actual) === comparable(value));
  if (operator === "notIn") return !(Array.isArray(expected) ? expected : [expected]).some((value) => comparable(actual) === comparable(value));
  if (operator === "startsWith") return String(actual ?? "").startsWith(String(expected ?? ""));
  if (operator === "endsWith") return String(actual ?? "").endsWith(String(expected ?? ""));
  const left = comparable(actual), right = comparable(expected);
  if (operator === "eq") return left === right;
  if (operator === "neq") return left !== right;
  if (operator === "gt") return left > right;
  if (operator === "gte") return left >= right;
  if (operator === "lt") return left < right;
  if (operator === "lte") return left <= right;
  return false;
}

function normalizeCondition(input, allowedFields, depth = 0, counter = { count: 0 }) {
  if (depth > 4 || ++counter.count > 30) throw new Error("La règle contient trop de niveaux ou de conditions.");
  if (Array.isArray(input?.all) || Array.isArray(input?.any)) {
    const mode = Array.isArray(input.all) ? "all" : "any";
    const rows = input[mode];
    if (!rows.length) throw new Error("Un groupe de conditions ne peut pas être vide.");
    return { [mode]: rows.map((row) => normalizeCondition(row, allowedFields, depth + 1, counter)) };
  }
  if (input?.not) return { not: normalizeCondition(input.not, allowedFields, depth + 1, counter) };
  const field = String(input?.field ?? "");
  const operator = String(input?.operator ?? "eq");
  if (!allowedFields.has(field)) throw new Error(`Champ de condition inconnu : ${field || "vide"}.`);
  if (!operators.has(operator)) throw new Error(`Opérateur inconnu : ${operator}.`);
  const valueField = input?.valueField ? String(input.valueField) : "";
  if (valueField && !allowedFields.has(valueField)) throw new Error(`Champ comparé inconnu : ${valueField}.`);
  let value = input?.value;
  if (["containsAny", "containsAll", "in", "notIn"].includes(operator) && !Array.isArray(value)) value = String(value ?? "").split(",").map((entry) => entry.trim()).filter(Boolean);
  if (field === "markers" && (valueField || !["contains", "containsAny", "containsAll"].includes(operator) || !(Array.isArray(value) ? value : [value]).every((marker) => /^(secret|challenge):[a-z0-9-]{1,48}$/.test(marker)))) throw new Error("Indice attendu : secret:valeur ou challenge:valeur, avec la comparaison contient (lettres minuscules, chiffres et tirets uniquement).");
  return { field, operator, ...(valueField ? { valueField } : { value }) };
}

export function normalizeAchievementRule(input = {}) {
  const source = input.source === "metric" ? "metric" : "event";
  if (source === "metric") {
    const metric = String(input.metric ?? "");
    const valid = /^(gameWins|gameLevel|gameXp)\.[a-z0-9-]{1,60}$/.test(metric) || Object.hasOwn(achievementMetricSchema, metric);
    if (!valid) throw new Error("Métrique de succès inconnue.");
    return { source, metric };
  }
  const event = String(input.event ?? "");
  const schema = achievementEventSchema[event];
  if (!schema) throw new Error("Événement de succès inconnu.");
  const scope = scopes.has(input.scope) ? input.scope : "event";
  const aggregate = aggregates.has(input.aggregate) ? input.aggregate : "match";
  const fields = new Set(Object.keys(schema.fields));
  const valueField = input.valueField ? String(input.valueField) : "";
  if (["sum", "max", "distinct"].includes(aggregate) && !fields.has(valueField)) throw new Error("Choisis un champ de valeur valide pour cet agrégat.");
  const condition = normalizeCondition(input.condition ?? { all: [{ field: Object.keys(schema.fields)[0], operator: "exists", value: true }] }, fields);
  return {
    source, event, scope, aggregate, condition,
    ...(valueField ? { valueField } : {}),
    ...(input.gameId ? { gameId: String(input.gameId) } : {}),
    ...(input.legacyResultId ? { legacyResultId: String(input.legacyResultId) } : {})
  };
}

export function normalizeAchievementDefinition(input, existing = {}) {
  const id = String(existing.id ?? input.id ?? "").trim().toLocaleLowerCase("fr").replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  if (!id) throw new Error("L'identifiant du succès est obligatoire.");
  const type = ["site", "games", "milestone"].includes(input.type) ? input.type : "site";
  const target = Math.max(1, Math.min(1000000000, Number(input.target) || 1));
  return {
    ...existing,
    id,
    title: String(input.title ?? existing.title ?? "Nouveau succès").trim().slice(0, 100),
    description: String(input.description ?? existing.description ?? "").trim().slice(0, 300),
    group: String(input.group ?? existing.group ?? "Personnalisés").trim().slice(0, 60),
    type,
    target,
    gameId: input.gameId ? String(input.gameId).slice(0, 60) : null,
    milestone: input.milestone === true,
    secret: input.secret === true,
    enabled: input.enabled !== false,
    rewards: normalizeAchievementRewards(input.rewards ?? existing.rewards),
    rule: normalizeAchievementRule(input.rule ?? existing.rule)
  };
}

export function consumeAchievementEvent(rule, event, previous = {}) {
  if (rule.source !== "event" || rule.event !== event.type) return { matched: false, progress: previous };
  if (rule.gameId && rule.gameId !== event.payload?.gameId) return { matched: false, progress: previous };
  const matched = evaluateAchievementCondition(rule.condition, event.payload ?? {});
  let value = Number(previous.value) || 0;
  let values = Array.isArray(previous.values) ? previous.values.slice(0, 1000) : [];
  if (rule.aggregate === "streak") value = matched ? value + 1 : 0;
  else if (!matched) return { matched: false, progress: previous };
  else if (rule.aggregate === "match") value = 1;
  else if (rule.aggregate === "count") value += 1;
  else if (rule.aggregate === "sum") value += Number(getRuleValue(event.payload, rule.valueField)) || 0;
  else if (rule.aggregate === "max") value = Math.max(value, Number(getRuleValue(event.payload, rule.valueField)) || 0);
  else if (rule.aggregate === "distinct") {
    const raw = getRuleValue(event.payload, rule.valueField);
    for (const item of Array.isArray(raw) ? raw : [raw]) if (item != null && !values.some((entry) => comparable(entry) === comparable(item)) && values.length < 1000) values.push(item);
    value = values.length;
  }
  return { matched, progress: { value, ...(values.length ? { values } : {}), updatedAt: new Date().toISOString() } };
}

export function achievementRuleSchemas(games = [], shop = [], achievements = []) {
  const choices = { page: Object.entries(sitePages).map(([value, label]) => ({ value, label })), browser: Object.entries(browserFamilies).map(([value, label]) => ({ value, label })) };
  for (const field of ["player.ownedItemIds", "player.equippedItemIds"]) choices[field] = shop.map((item) => ({ value: item.id, label: item.name }));
  choices["player.favoriteGameIds"] = games.map((game) => ({ value: game.id, label: game.name }));
  choices["player.achievementIds"] = achievements.map((entry) => ({ value: entry.id, label: entry.title }));
  choices.achievementId = choices["player.achievementIds"];
  choices.itemId = choices["player.ownedItemIds"];
  choices.gameId = choices["player.favoriteGameIds"];
  return {
    events: Object.entries(achievementEventSchema).map(([id, value]) => ({ id, ...value, fields: Object.entries(value.fields).map(([field, label]) => ({ field, label, ...(choices[field] ? { choices: choices[field] } : {}) })) })),
    metrics: [...Object.entries(achievementMetricSchema).map(([id, label]) => ({ id, label })), ...games.flatMap((game) => [{ id: `gameWins.${game.id}`, label: `Victoires - ${game.name}` }, { id: `gameLevel.${game.id}`, label: `Niveau - ${game.name}` }, { id: `gameXp.${game.id}`, label: `XP - ${game.name}` }])],
    operators: [...operators],
    aggregates: [...aggregates],
    scopes: [...scopes]
  };
}
