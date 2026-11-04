// Shared, declarative contract rules. Used by the server, previews and administration.
export const midnightContractTiers = {
  bronze: { label: "Bronze", bonus: 18, accent: "#c7834a", order: 0 },
  silver: { label: "Argent", bonus: 30, accent: "#c7d0d8", order: 1 },
  gold: { label: "Or", bonus: 45, accent: "#f0c44f", order: 2 },
  platinum: { label: "Platine", bonus: 65, accent: "#72ddc5", order: 3 },
  diamond: { label: "Diamant", bonus: 100, accent: "#82c9ff", order: 4 }
};
export const midnightCatalogLimits = { minimum: 6, maximum: 24 };
export const midnightSpecialConditions = {
  "sum-two": "Un dé est égal à la somme des deux autres",
  distinct: "Trois valeurs toutes différentes",
  pair: "Exactement une paire",
  triple: "Trois valeurs identiques",
  straight: "Trois valeurs consécutives",
  odd: "Trois valeurs impaires",
  even: "Trois valeurs paires",
  contains: "Présence de certaines valeurs",
  range: "Chaque dé appartient à un intervalle"
};
export const defaultMidnightContracts = [
  { id: "spectrum", label: "Spectre", hint: "Obtenir trois valeurs toutes différentes", tier: "bronze", rule: { type: "special", condition: "distinct" }, example: [1, 3, 5] },
  { id: "duo", label: "Duo", hint: "Obtenir exactement une paire", tier: "bronze", rule: { type: "special", condition: "pair" }, example: [4, 4, 2] },
  { id: "middle-road", label: "Voie médiane", hint: "Garder trois valeurs comprises entre 2 et 5", tier: "bronze", rule: { type: "special", condition: "range", minimum: 2, maximum: 5 }, example: [2, 3, 5] },
  { id: "extremes", label: "Les Extrêmes", hint: "Réunir au moins un 1 et un 6", tier: "silver", rule: { type: "special", condition: "contains", values: [1, 6] }, example: [1, 4, 6] },
  { id: "odd", label: "Impair royal", hint: "Obtenir trois dés impairs", tier: "silver", rule: { type: "special", condition: "odd" }, example: [1, 3, 5] },
  { id: "even", label: "Pair parfait", hint: "Obtenir trois dés pairs", tier: "silver", rule: { type: "special", condition: "even" }, example: [2, 4, 6] },
  { id: "straight", label: "Suite", hint: "Former trois valeurs consécutives", tier: "gold", rule: { type: "special", condition: "straight" }, example: [2, 3, 4] },
  { id: "balance", label: "Équilibre", hint: "Atteindre exactement un total de 10", tier: "gold", rule: { type: "sum", comparison: "eq", value: 10 }, example: [2, 3, 5] },
  { id: "lucky-thirteen", label: "Treize chanceux", hint: "Atteindre exactement un total de 13", tier: "gold", rule: { type: "sum", comparison: "eq", value: 13 }, example: [3, 4, 6] },
  { id: "summit", label: "Sommet", hint: "Atteindre un total de 15 ou plus", tier: "platinum", rule: { type: "sum", comparison: "gte", value: 15 }, example: [4, 5, 6] },
  { id: "cellar", label: "Cave", hint: "Rester à un total de 7 ou moins", tier: "platinum", rule: { type: "sum", comparison: "lte", value: 7 }, example: [1, 2, 4] },
  { id: "triple", label: "Brelan", hint: "Obtenir trois valeurs identiques", tier: "diamond", rule: { type: "special", condition: "triple" }, example: [6, 6, 6] }
];
export const midnightContractInfo = Object.fromEntries(defaultMidnightContracts.map(contract => [contract.id, contract]));
export const midnightCatalogFor = state => state?.contractCatalog ?? midnightContractInfo;

export function evaluateMidnightDefinition(definition, dice = []) {
  const valid = Array.isArray(dice) && dice.length <= 3 && dice.every(value => Number.isInteger(value) && value >= 1 && value <= 6);
  const values = valid ? dice : [], sorted = [...values].sort((a, b) => a - b), base = values.reduce((sum, die) => sum + die, 0);
  const complete = valid && values.length === 3, rule = definition?.rule;
  let achieved = false;
  if (complete && rule) {
    if (rule.type === "ordered") achieved = values.every((die, i) => die === rule.values[i]);
    if (rule.type === "unordered") achieved = sorted.every((die, i) => die === [...rule.values].sort((a, b) => a - b)[i]);
    if (rule.type === "sum") achieved = rule.comparison === "eq" ? base === rule.value : rule.comparison === "gte" ? base >= rule.value : rule.comparison === "lte" ? base <= rule.value : rule.comparison === "between" && base >= rule.value && base <= rule.maximum;
    if (rule.type === "special") {
      const distinct = new Set(values).size;
      switch (rule.condition) {
        case "sum-two": achieved = values.some(die => die === base - die); break;
        case "distinct": achieved = distinct === 3; break;
        case "pair": achieved = distinct === 2; break;
        case "triple": achieved = distinct === 1; break;
        case "straight": achieved = distinct === 3 && sorted[2] - sorted[0] === 2; break;
        case "odd": achieved = values.every(die => die % 2 === 1); break;
        case "even": achieved = values.every(die => die % 2 === 0); break;
        case "contains": { const remaining = [...values]; achieved = rule.values.every(die => { const index = remaining.indexOf(die); if (index < 0) return false; remaining.splice(index, 1); return true; }); break; }
        case "range": achieved = values.every(die => die >= rule.minimum && die <= rule.maximum); break;
      }
    }
  }
  const tier = definition?.tier ?? "bronze", bonus = achieved ? midnightContractTiers[tier]?.bonus ?? 0 : 0;
  return { achieved, base, bonus, points: base + bonus, tier };
}

export function midnightRuleDescription(rule) {
  if (!rule) return "Condition à définir";
  if (rule.type === "ordered") return `Obtenir ${rule.values.join(" → ")} dans cet ordre de prise`;
  if (rule.type === "unordered") return `Obtenir ${rule.values.join(", ")} dans n’importe quel ordre`;
  if (rule.type === "sum") return `Somme ${rule.comparison === "between" ? `entre ${rule.value} et ${rule.maximum}` : `${({ eq: "égale à", gte: "au moins", lte: "au plus" })[rule.comparison]} ${rule.value}`}`;
  if (rule.condition === "contains") return `Réunir ${rule.values.join(", ")}`;
  if (rule.condition === "range") return `Chaque dé vaut entre ${rule.minimum} et ${rule.maximum}`;
  return midnightSpecialConditions[rule.condition] ?? "Condition à définir";
}

const integer = (value, min, max) => { if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Valeur attendue entre ${min} et ${max}.`); return value; };
export function normalizeMidnightRule(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Condition de mandat invalide.");
  const values = (count, minimum = count) => {
    if (!Array.isArray(input.values) || input.values.length < minimum || input.values.length > count) throw new Error("Choisis les valeurs des dés du mandat.");
    return input.values.map(value => integer(value, 1, 6));
  };
  if (["ordered", "unordered"].includes(input.type)) return { type: input.type, values: values(3) };
  if (input.type === "sum" && ["eq", "gte", "lte", "between"].includes(input.comparison)) {
    const rule = { type: "sum", comparison: input.comparison, value: integer(input.value, 3, 18) };
    if (input.comparison === "between") rule.maximum = integer(input.maximum, rule.value, 18);
    return rule;
  }
  if (input.type === "special" && Object.hasOwn(midnightSpecialConditions, input.condition)) {
    const rule = { type: "special", condition: input.condition };
    if (input.condition === "contains") rule.values = values(3, 1);
    if (input.condition === "range") { rule.minimum = integer(input.minimum, 1, 6); rule.maximum = integer(input.maximum, rule.minimum, 6); }
    return rule;
  }
  throw new Error("Type de condition de mandat inconnu.");
}

export function midnightExample(definition) {
  if (definition.example && evaluateMidnightDefinition(definition, definition.example).achieved) return [...definition.example];
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) for (let c = 1; c <= 6; c++) if (evaluateMidnightDefinition(definition, [a, b, c]).achieved) return [a, b, c];
  throw new Error("Cette condition ne peut être obtenue avec trois dés à six faces.");
}

export function normalizeMidnightContracts(input = defaultMidnightContracts) {
  if (!Array.isArray(input) || input.length < midnightCatalogLimits.minimum || input.length > midnightCatalogLimits.maximum) throw new Error(`Le catalogue doit contenir entre ${midnightCatalogLimits.minimum} et ${midnightCatalogLimits.maximum} mandats.`);
  const ids = new Set();
  return input.map(entry => {
    if (!entry || typeof entry !== "object" || typeof entry.id !== "string" || !/^[a-z][a-z0-9-]{1,63}$/.test(entry.id) || ["constructor", "prototype"].includes(entry.id) || ids.has(entry.id)) throw new Error("Identifiant de mandat invalide ou déjà utilisé.");
    ids.add(entry.id);
    if (typeof entry.label !== "string" || !entry.label.trim() || entry.label.trim().length > 60) throw new Error("Le nom du mandat doit contenir de 1 à 60 caractères.");
    if (!Object.hasOwn(midnightContractTiers, entry.tier)) throw new Error("Palier de mandat invalide.");
    const rule = normalizeMidnightRule(entry.rule), hint = typeof entry.hint === "string" ? entry.hint.trim() : "";
    if (hint.length > 200) throw new Error("La description du mandat ne peut dépasser 200 caractères.");
    const definition = { id: entry.id, label: entry.label.trim(), hint: hint || midnightRuleDescription(rule), tier: entry.tier, rule };
    definition.example = midnightExample({ ...definition, example: entry.example });
    return definition;
  });
}
