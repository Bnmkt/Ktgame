export const eventCardSuits = ["hearts", "diamonds", "clubs", "spades"];
export const eventCardRanks = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

export function valuesMatch(expected, drawn, exact = false) {
  if (!expected?.length || (exact && expected.length !== drawn.length)) return false;
  const remaining = [...drawn];
  return expected.every((value) => {
    const index = remaining.indexOf(value);
    if (index < 0) return false;
    remaining.splice(index, 1);
    return true;
  });
}

export function cardsCombinationMatches(condition, drawn) {
  if (!["containsCards", "exactCards"].includes(condition?.type)) return false;
  const expected = condition.cards ?? [];
  if (!expected.length || (condition.type === "exactCards" && expected.length !== drawn.length)) return false;
  const remaining = [...drawn];
  // Reserve precise cards first so an any-suit requirement cannot consume them.
  const ordered = [...expected].sort((a, b) => Number(a.suit === "any") - Number(b.suit === "any"));
  return ordered.every((card) => {
    const index = remaining.findIndex((candidate) => candidate.rank === card.rank && (card.suit === "any" || card.suit === candidate.suit));
    if (index < 0) return false;
    remaining.splice(index, 1);
    return true;
  });
}

export function validateDrawCombinations(game) {
  const errors = [];
  const kind = game.type;
  const config = game[kind];
  const count = kind === "dice" ? config.count : config.cardsPerAction;
  const critical = game.critical;
  const lengths = [];
  if (!critical?.enabled || critical.chancePercent < 100) lengths.push(count);
  if (critical?.enabled && critical.chancePercent > 0) lengths.push(count + critical.extraDraws);
  for (const row of config.combinations ?? []) {
    const condition = row.condition;
    if (!["containsValues", "customValues", "containsCards", "exactCards"].includes(condition.type)) continue;
    const expected = kind === "dice" ? condition.values : condition.cards;
    const fail = (message) => errors.push(`Combinaison « ${row.name} » : ${message}`);
    if (!expected?.length) { fail("ajoute au moins une valeur."); continue; }
    const exact = ["customValues", "exactCards"].includes(condition.type);
    if (exact ? !lengths.includes(expected.length) : expected.length > Math.max(...lengths)) fail("le nombre de valeurs ne correspond à aucun tirage possible, critiques inclus.");
    if (kind === "dice") {
      if (expected.some((value) => !Number.isInteger(value) || value < 1 || value > config.faces)) fail(`les valeurs doivent être des entiers entre 1 et ${config.faces}.`);
    } else {
      if (expected.some((card) => card.rank === "JOKER" ? !config.jokers || !["any", "joker"].includes(card.suit) : !eventCardRanks.includes(card.rank) || !["any", ...eventCardSuits].includes(card.suit))) {
        fail("une carte est invalide ou les jokers sont désactivés."); continue;
      }
      const available = [];
      for (let deck = 0; deck < config.decks; deck++) {
        for (const suit of eventCardSuits) for (const rank of eventCardRanks) available.push({ rank, suit });
        if (config.jokers) available.push({ rank: "JOKER", suit: "joker" }, { rank: "JOKER", suit: "joker" });
      }
      if (!cardsCombinationMatches({ type: "containsCards", cards: expected }, available)) fail("le paquet ne contient pas assez d’exemplaires des cartes demandées.");
    }
  }
  return errors;
}
