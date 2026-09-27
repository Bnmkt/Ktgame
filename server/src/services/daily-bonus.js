import { casinoDateKey, shiftDateKey } from "./time.js";

export const defaultDailyBonusRules = Object.freeze([
  Object.freeze({ id: "daily", day: 1, operation: "add", value: 0.1, repeat: true, label: "Progression quotidienne" }),
  Object.freeze({ id: "weekly", day: 7, operation: "add", value: 0.3, repeat: true, label: "Palier hebdomadaire" }),
  Object.freeze({ id: "monthly", day: 30, operation: "multiply", value: 2, repeat: true, label: "Palier mensuel" })
]);

const roundMultiplier = (value) => Math.round((Number(value) || 0) * 1000) / 1000;

export function normalizeDailyBonusConfig(config = {}) {
  const defaultMultiplier = Math.max(0.1, Math.min(1000000, Number(config.defaultMultiplier) || 1));
  const maxMultiplier = Math.max(defaultMultiplier, Math.min(1000000, Number(config.maxMultiplier) || 100));
  const source = Array.isArray(config.rules) ? config.rules : defaultDailyBonusRules;
  const rules = source.slice(0, 50).map((rule, index) => ({
    id: String(rule.id || `bonus-rule-${index + 1}`).slice(0, 80),
    day: Math.max(1, Math.min(3650, Math.floor(Number(rule.day) || 1))),
    operation: ["add", "multiply", "set"].includes(rule.operation) ? rule.operation : "add",
    value: Math.max(0, Math.min(1000000, Number(rule.value) || 0)),
    repeat: rule.repeat !== false,
    label: String(rule.label || `Palier ${index + 1}`).trim().slice(0, 60) || `Palier ${index + 1}`
  })).sort((left, right) => left.day - right.day);
  return { defaultMultiplier: roundMultiplier(defaultMultiplier), maxMultiplier: roundMultiplier(maxMultiplier), rules };
}

function ruleApplies(rule, streak) {
  return rule.repeat ? streak % rule.day === 0 : streak === rule.day;
}

function advanceWithConfig(multiplier, streak, normalized) {
  let next = Number(multiplier);
  if (!Number.isFinite(next)) next = normalized.defaultMultiplier;
  const appliedRules = [];
  for (const rule of normalized.rules) {
    if (!ruleApplies(rule, streak)) continue;
    if (rule.operation === "multiply") next *= rule.value;
    else if (rule.operation === "set") next = rule.value;
    else next += rule.value;
    appliedRules.push(rule);
  }
  return {
    multiplier: roundMultiplier(Math.min(normalized.maxMultiplier, Math.max(0, next))),
    appliedRules,
    capped: next >= normalized.maxMultiplier
  };
}

export function advanceDailyBonus(multiplier, streak, config = {}) {
  return advanceWithConfig(multiplier, streak, normalizeDailyBonusConfig(config));
}

export function calculateDailyBonusStatus(claimDates, baseTokens, now = new Date(), config = {}) {
  const normalized = normalizeDailyBonusConfig(config);
  const dates = [...new Set(claimDates.filter(Boolean))].sort();
  let multiplier = normalized.defaultMultiplier;
  let streak = 0;
  let previous = null;
  for (const date of dates) {
    const consecutive = previous && shiftDateKey(date, -1) === previous;
    streak = consecutive ? streak + 1 : 1;
    multiplier = advanceWithConfig(consecutive ? multiplier : normalized.defaultMultiplier, streak, normalized).multiplier;
    previous = date;
  }
  const today = casinoDateKey(now);
  const claimedToday = previous === today;
  const activeStreak = previous && (claimedToday || previous === shiftDateKey(today, -1)) ? streak : 0;
  if (!activeStreak) multiplier = normalized.defaultMultiplier;
  const nextStreak = activeStreak + 1;
  const next = advanceWithConfig(multiplier, nextStreak, normalized);
  return {
    claims: dates.length,
    streak: activeStreak,
    multiplier,
    nextMultiplier: next.multiplier,
    nextReward: Math.max(0, Math.round(baseTokens * next.multiplier)),
    nextTierRules: next.appliedRules,
    nextCapped: next.capped,
    nextWeeklyBoost: next.appliedRules.some((rule) => rule.id === "weekly"),
    nextMonthlyDouble: next.appliedRules.some((rule) => rule.id === "monthly"),
    claimedToday
  };
}
