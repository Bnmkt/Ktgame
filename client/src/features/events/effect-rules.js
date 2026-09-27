const targets = { player: "ce joueur", community: "toute la communauté", objective: "l’objectif", pot: "la cagnotte", nextAction: "la prochaine action" };
const stats = { damage: "les dégâts", contribution: "la contribution", actionPrice: "le prix des actions" };
const suits = { hearts: "Cœur", diamonds: "Carreau", clubs: "Trèfle", spades: "Pique" };
const ranks = { J: "Valet", Q: "Dame", K: "Roi", A: "As", JOKER: "Joker" };

export function eventEffectDescription(effect) {
  const value = Number(effect.value) || 0;
  const number = value.toLocaleString("fr-BE");
  const stat = stats[effect.stat] ?? effect.stat ?? "les dégâts";
  const descriptions = {
    none: "Aucun effet automatique", damageFixed: `Fixe les dégâts à ${number}`,
    damageBonus: `Ajoute ${number} dégâts`, damageMultiplier: `Multiplie les dégâts par ${number}`,
    contribution: `Ajoute ${number} points de contribution`, pot: `Ajoute ${number} jetons à la cagnotte`,
    tokens: `Attribue ${number} jetons`, extraAction: `Ajoute ${Math.trunc(value)} action(s)`,
    personalMultiplier: `Multiplie ${stat} par ${number}`, communityMultiplier: `Multiplie ${stat} par ${number}`,
    temporaryBonus: `${effect.stat === "actionPrice" ? "Réduit" : "Augmente"} ${stat} de ${(value * 100).toLocaleString("fr-BE")} %`,
    temporaryMalus: `${effect.stat === "actionPrice" ? "Augmente" : "Réduit"} ${stat} de ${(value * 100).toLocaleString("fr-BE")} %`, special: effect.label || "Effet spécial"
  };
  const duration = effect.duration && effect.target !== "nextAction" ? ` pendant ${effect.duration} ${effect.durationUnit === "hours" ? "heure(s)" : effect.durationUnit === "seconds" ? "seconde(s)" : "minute(s)"}` : "";
  return `${descriptions[effect.type] ?? effect.label ?? effect.type} · cible : ${targets[effect.target ?? "player"] ?? effect.target}${duration}`;
}

export function combinationCondition(condition = {}) {
  const cards = (condition.cards ?? []).map((card) => `${ranks[card.rank] ?? card.rank}${card.rank === "JOKER" ? "" : card.suit === "any" ? " (toute enseigne)" : ` de ${suits[card.suit] ?? card.suit}`}`).join(", ");
  return ({ double: "Au moins deux dés identiques", triple: "Au moins trois dés identiques", straight: "Au moins trois valeurs distinctes, toutes consécutives", tripleValue: `Au moins trois dés de valeur ${condition.value}`, minTotal: `Somme supérieure ou égale à ${condition.value}`, maxTotal: `Somme inférieure ou égale à ${condition.value}`, customValues: `Tirage exact, sans ordre imposé : ${(condition.values ?? []).join(", ")}`, containsValues: `Le tirage contient, sans ordre imposé : ${(condition.values ?? []).join(", ")}`, exactCards: `Tirage exact, sans ordre imposé : ${cards}`, containsCards: `Le tirage contient, sans ordre imposé : ${cards}` })[condition.type] ?? "Condition personnalisée";
}

export function eventEffectRules(game) {
  const rules = [];
  if (game.type === "dice") {
    for (const [face, effects] of Object.entries(game.dice.faceEffects ?? {}).sort(([a], [b]) => Number(a) - Number(b))) {
      if (Number(face) >= 1 && Number(face) <= game.dice.faces && effects.length) rules.push({ key: `face-${face}`, label: `Face ${face}`, condition: "Pour chaque dé de cette valeur", effects });
    }
    for (const row of game.dice.combinations ?? []) rules.push({ key: `combo-${row.id}`, label: row.name, condition: combinationCondition(row.condition), effects: row.effects ?? [] });
  } else {
    for (const row of game.cards.combinations ?? []) rules.push({ key: `card-combo-${row.id}`, label: row.name, condition: combinationCondition(row.condition), effects: row.effects ?? [] });
    for (const [enabled, field, label] of [["useSuitEffects", "suitEffects", "Enseigne"], ["useValueEffects", "valueEffects", "Valeur"], ["useSpecificEffects", "specificEffects", "Carte"]]) {
      if (!game.cards[enabled]) continue;
      for (const [key, effects] of Object.entries(game.cards[field] ?? {})) {
        if (!effects.length) continue;
        const [rank, suit] = key.split("-");
        const name = field === "suitEffects" ? suits[key] ?? key : field === "valueEffects" ? ranks[key] ?? key : `${ranks[rank] ?? rank}${suit && rank !== "JOKER" ? ` de ${suits[suit] ?? suit}` : ""}`;
        rules.push({ key: `${field}-${key}`, label: `${label} : ${name}`, condition: "Pour chaque carte correspondante", effects });
      }
    }
  }
  if (game.critical?.enabled && game.critical.effects?.length) rules.push({ key: "critical", label: game.critical.label || "Action critique", condition: "En plus des effets du tirage, en cas d’action critique", effects: game.critical.effects });
  return rules;
}
