import { defaultPublicSettings } from "../../config/site.js";

const roundMultiplier = (value) => Math.round((Number(value) || 0) * 1000) / 1000;

export function normalizeBonusSettings(settings = {}) {
  const defaultMultiplier = Math.max(0.1, Number(settings.dailyBonusDefaultMultiplier) || defaultPublicSettings.dailyBonusDefaultMultiplier);
  const maxMultiplier = Math.max(defaultMultiplier, Number(settings.dailyBonusMaxMultiplier) || defaultPublicSettings.dailyBonusMaxMultiplier);
  const source = Array.isArray(settings.dailyBonusRules) ? settings.dailyBonusRules : defaultPublicSettings.dailyBonusRules;
  const rules = source.map((rule, index) => ({
    id: String(rule.id || `bonus-rule-${index + 1}`),
    day: Math.max(1, Math.floor(Number(rule.day) || 1)),
    operation: ["add", "multiply", "set"].includes(rule.operation) ? rule.operation : "add",
    value: Math.max(0, Number(rule.value) || 0),
    repeat: rule.repeat !== false,
    label: String(rule.label || `Palier ${index + 1}`)
  })).sort((left, right) => left.day - right.day);
  return { defaultMultiplier, maxMultiplier, rules };
}

export function bonusProgression(settings = {}, days = 365, initialMultiplier, initialStreak = 0) {
  const config = normalizeBonusSettings(settings);
  const baseTokens = Math.max(0, Number(settings.dailyTokens) || 0);
  let multiplier = Number.isFinite(Number(initialMultiplier)) ? Number(initialMultiplier) : config.defaultMultiplier;
  return Array.from({ length: Math.max(1, days) }, (_, index) => {
    const streak = initialStreak + index + 1;
    const appliedRules = config.rules.filter((rule) => rule.repeat ? streak % rule.day === 0 : streak === rule.day);
    for (const rule of appliedRules) {
      if (rule.operation === "multiply") multiplier *= rule.value;
      else if (rule.operation === "set") multiplier = rule.value;
      else multiplier += rule.value;
    }
    multiplier = roundMultiplier(Math.min(config.maxMultiplier, Math.max(0, multiplier)));
    return { day: index + 1, streak, multiplier, amount: Math.round(baseTokens * multiplier), appliedRules, capped: multiplier >= config.maxMultiplier };
  });
}

export function bonusRuleEffect(rule) {
  if (rule.operation === "multiply") return `×${Number(rule.value).toLocaleString("fr-FR")}`;
  if (rule.operation === "set") return `fixer à ×${Number(rule.value).toLocaleString("fr-FR")}`;
  return `+${Number(rule.value).toLocaleString("fr-FR")}`;
}
