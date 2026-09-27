import { randomUUID } from "node:crypto";
import { casinoDateKey } from "./time.js";
import { archiveRows } from "../storage/archives.js";
import { eventActionUsage } from "../storage/event-usage.js";
import { cardsCombinationMatches, validateDrawCombinations, valuesMatch } from "./event-combinations.js";

export const communityEventStatuses = ["draft", "scheduled", "active", "finished", "cancelled"];
export const communityEventGameTypes = ["dice", "cards"];
export const communityEffectTypes = ["none", "damageFixed", "damageMultiplier", "damageBonus", "contribution", "pot", "tokens", "extraAction", "personalMultiplier", "communityMultiplier", "temporaryBonus", "temporaryMalus", "special"];

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
const integer = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => Math.trunc(clamp(value, min, max));
const text = (value, max = 160) => String(value ?? "").replace(/<[^>]*>/g, "").trim().slice(0, max);
const unique = (values) => [...new Set(Array.isArray(values) ? values.map(String) : [])];
const iso = (value, fallback = null) => {
  const date = new Date(value ?? "");
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
};

export function defaultCommunityEvent(now = new Date()) {
  const startsAt = new Date(now);
  startsAt.setMinutes(startsAt.getMinutes() + 15);
  const endsAt = new Date(startsAt);
  endsAt.setDate(endsAt.getDate() + 7);
  return {
    id: randomUUID(),
    internalName: "Nouvel événement",
    name: "Nouvel événement communautaire",
    slug: `evenement-${randomUUID().slice(0, 8)}`,
    shortDescription: "Un objectif temporaire à accomplir tous ensemble.",
    description: "Chaque action fait progresser l’objectif communautaire et votre contribution personnelle.",
    status: "draft",
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    autoStart: true,
    autoFinish: true,
    showBeforeStart: true,
    objective: { name: "Objectif communautaire", description: "Progressez ensemble avant la fin du temps imparti.", max: 100000, startValue: 100000, minimum: 0, finishAtMinimum: true, continueAfterCompletion: false, milestones: [{ id: randomUUID(), percent: 25, label: "Premier palier", effects: [] }, { id: randomUUID(), percent: 50, label: "Mi-parcours", effects: [] }, { id: randomUUID(), percent: 75, label: "Dernier effort", effects: [] }, { id: randomUUID(), percent: 100, label: "Objectif atteint", effects: [] }] },
    participation: { entryCost: 10, potContributionMode: "fixed", potContributionValue: 8 },
    actions: { mode: "daily", freeCount: 3, periodMinutes: 60, allowPurchase: true, purchasePrice: 10, purchaseMaxTotal: 20, purchaseMaxDaily: 5, allowOverflowPurchase: true, overflowPriceMultiplier: 10, overflowExponentBase: 1.25, purchasePotContributionMode: "percentage", purchasePotContributionValue: 80 },
    game: {
      type: "dice",
      critical: { enabled: false, chancePercent: 5, extraDraws: 1, damageMultiplier: 1, contributionBonus: 0, label: "Action critique", effects: [] },
      dice: { count: 3, faces: 6, weighted: false, weights: {}, baseDamageMode: "sum", baseDamageMultiplier: 1, faceEffects: { "4": [{ type: "damageBonus", value: 4 }], "5": [{ type: "contribution", value: 5 }], "6": [{ type: "damageMultiplier", value: 1.25 }] }, combinations: [{ id: randomUUID(), name: "Triple 6", condition: { type: "tripleValue", value: 6 }, effects: [{ type: "damageMultiplier", value: 2 }, { type: "contribution", value: 25 }] }] },
      cards: { decks: 1, jokers: false, cardsPerAction: 3, replaceAfterDraw: true, deckMode: "personal", baseDamageMode: "values", baseDamageMultiplier: 1, useSuitEffects: true, useValueEffects: true, useSpecificEffects: true, suitEffects: {}, valueEffects: {}, specificEffects: {}, combinations: [] }
    },
    contribution: { damageRatio: 1, dailyParticipation: 0, communityEffect: 0, rareEvent: 0 },
    pot: { initial: 1000, remainderRule: "top", rolloverTargetEventId: "" },
    rewards: { participationReward: 20, tiers: [{ id: randomUUID(), name: "Bronze", score: 100, fixed: 10, potPercent: 0, multiplier: 1, cosmeticId: "" }, { id: randomUUID(), name: "Argent", score: 500, fixed: 25, potPercent: 0, multiplier: 1.05, cosmeticId: "" }, { id: randomUUID(), name: "Or", score: 1500, fixed: 50, potPercent: 0, multiplier: 1.1, cosmeticId: "" }], communityMultiplierEnabled: true, communityMultipliers: [{ minPercent: 0, multiplier: .5 }, { minPercent: 25, multiplier: .75 }, { minPercent: 50, multiplier: 1 }, { minPercent: 75, multiplier: 1.1 }, { minPercent: 100, multiplier: 1.25 }], distribution: { equalPercent: 40, proportionalPercent: 50, tierPercent: 0, rankingPercent: 10, rankingWeights: [50, 30, 20] } },
    rankings: { contribution: true, damage: true, actions: true, communityEffects: true, potAdded: true, bestAction: true, limit: 20 },
    theme: { name: "Casino communautaire", title: "Nouvel événement communautaire", subtitle: "Unissez vos forces", icon: "sparkles", heroImage: "", heroPositionX: 50, heroPositionY: 50, heroScale: 100, backgroundImage: "", primary: "#9f2434", secondary: "#173f35", accent: "#f0bd48", healthUnit: "points", actionName: "Agir" },
    texts: { beforeJoin: "Rejoins l’événement communautaire.", afterJoin: "Ta place est assurée. À toi de jouer.", success: "Votre action fait progresser la communauté !", failure: "Cette action n’a produit aucun effet.", completed: "L’objectif communautaire est atteint !" },
    limits: { minimumContribution: 0, maximumActionsPerUser: 10000, recentActivityLimit: 30 },
    runtime: { currentValue: null, pot: 0, participantCount: 0, actionCount: 0, damage: 0, contribution: 0, reachedMilestones: [], activeEffects: [], lastActionAt: null, finalizedAt: null }
  };
}

function normalizeEffect(effect = {}) {
  return { id: text(effect.id, 80) || randomUUID(), type: communityEffectTypes.includes(effect.type) ? effect.type : "none", value: Number(effect.value) || 0, target: ["player", "community", "objective", "pot", "nextAction"].includes(effect.target) ? effect.target : "player", stat: ["damage", "contribution", "actionPrice"].includes(effect.stat) ? effect.stat : "damage", duration: integer(effect.duration, 0, 2592000), durationUnit: ["seconds", "minutes", "hours"].includes(effect.durationUnit) ? effect.durationUnit : "minutes", label: text(effect.label, 120), ...(effect.expiresAt ? { expiresAt: iso(effect.expiresAt) } : {}), ...(effect.appliedAt ? { appliedAt: iso(effect.appliedAt) } : {}), ...(effect.sourceEffectId ? { sourceEffectId: text(effect.sourceEffectId, 80) } : {}), ...(effect.milestoneId ? { milestoneId: text(effect.milestoneId, 80) } : {}) };
}

const normalizeEffects = (effects) => (Array.isArray(effects) ? effects : []).slice(0, 20).map(normalizeEffect);
const normalizeCombinations = (rows, kind) => (Array.isArray(rows) ? rows : []).slice(0, 30).map((row) => ({
  id: text(row.id, 80) || randomUUID(), name: text(row.name, 80) || "Combinaison",
  condition: kind === "dice" ? {
    type: ["double", "triple", "straight", "tripleValue", "minTotal", "maxTotal", "customValues", "containsValues"].includes(row.condition?.type) ? row.condition.type : "double",
    value: Number(row.condition?.value) || 0,
    values: Array.isArray(row.condition?.values) ? row.condition.values.slice(0, 40).map(Number) : []
  } : {
    type: row.condition?.type === "exactCards" ? "exactCards" : "containsCards",
    cards: Array.isArray(row.condition?.cards) ? row.condition.cards.slice(0, 40).map((card) => ({ rank: text(card?.rank, 10), suit: text(card?.suit ?? "any", 10) })) : []
  },
  effects: normalizeEffects(row.effects)
}));
const normalizeMilestones = (rows) => (Array.isArray(rows) ? rows : []).slice(0, 20).map((row) => ({ id: text(row.id, 80) || randomUUID(), percent: clamp(row.percent, 0, Number.MAX_SAFE_INTEGER), label: text(row.label, 80), effects: normalizeEffects(row.effects) })).sort((a, b) => a.percent - b.percent);
const normalizeTiers = (rows) => (Array.isArray(rows) ? rows : []).slice(0, 30).map((row) => ({ id: text(row.id, 80) || randomUUID(), name: text(row.name, 50) || "Palier", score: integer(row.score), fixed: integer(row.fixed), potPercent: clamp(row.potPercent, 0, 100), multiplier: clamp(row.multiplier || 1, 0, 100), cosmeticId: text(row.cosmeticId, 120), bonus: text(row.bonus, 160) })).sort((a, b) => a.score - b.score);

export function normalizeCommunityEvent(input = {}, current = null) {
  const systemDefaults = defaultCommunityEvent();
  const defaults = current ?? systemDefaults;
  const event = { ...defaults, ...input };
  const objective = { ...defaults.objective, ...(input.objective ?? {}) };
  const participation = { ...defaults.participation, ...(input.participation ?? {}) };
  const actions = { ...defaults.actions, ...(input.actions ?? {}) };
  const criticalDefaults = { ...systemDefaults.game.critical, ...(defaults.game?.critical ?? {}) };
  const critical = { ...criticalDefaults, ...(input.game?.critical ?? {}), effects: normalizeEffects(input.game?.critical?.effects ?? criticalDefaults.effects) };
  const dice = { ...defaults.game.dice, ...(input.game?.dice ?? {}), faceEffects: Object.fromEntries(Object.entries(input.game?.dice?.faceEffects ?? defaults.game.dice.faceEffects).map(([key, effects]) => [String(integer(key, 1, 100)), normalizeEffects(effects)])), combinations: normalizeCombinations(input.game?.dice?.combinations ?? defaults.game.dice.combinations, "dice") };
  const cards = { ...defaults.game.cards, ...(input.game?.cards ?? {}), suitEffects: Object.fromEntries(Object.entries(input.game?.cards?.suitEffects ?? defaults.game.cards.suitEffects).map(([key, effects]) => [key, normalizeEffects(effects)])), valueEffects: Object.fromEntries(Object.entries(input.game?.cards?.valueEffects ?? defaults.game.cards.valueEffects).map(([key, effects]) => [key, normalizeEffects(effects)])), specificEffects: Object.fromEntries(Object.entries(input.game?.cards?.specificEffects ?? defaults.game.cards.specificEffects).map(([key, effects]) => [key, normalizeEffects(effects)])) };
  cards.combinations = normalizeCombinations(input.game?.cards?.combinations ?? defaults.game.cards.combinations, "cards");
  const rewards = { ...defaults.rewards, ...(input.rewards ?? {}), tiers: normalizeTiers(input.rewards?.tiers ?? defaults.rewards.tiers), communityMultipliers: (input.rewards?.communityMultipliers ?? defaults.rewards.communityMultipliers).slice(0, 20).map((row) => ({ minPercent: clamp(row.minPercent, 0, Number.MAX_SAFE_INTEGER), multiplier: clamp(row.multiplier, 0, 100) })).sort((a, b) => a.minPercent - b.minPercent), distribution: { ...defaults.rewards.distribution, ...(input.rewards?.distribution ?? {}), equalPercent: clamp(input.rewards?.distribution?.equalPercent ?? defaults.rewards.distribution.equalPercent, 0, 100), proportionalPercent: clamp(input.rewards?.distribution?.proportionalPercent ?? defaults.rewards.distribution.proportionalPercent, 0, 100), tierPercent: clamp(input.rewards?.distribution?.tierPercent ?? defaults.rewards.distribution.tierPercent, 0, 100), rankingPercent: clamp(input.rewards?.distribution?.rankingPercent ?? defaults.rewards.distribution.rankingPercent, 0, 100), rankingWeights: (input.rewards?.distribution?.rankingWeights ?? defaults.rewards.distribution.rankingWeights).map((value) => clamp(value, 0, 100)).slice(0, 20) } };
  return {
    ...event,
    id: text(event.id, 80) || randomUUID(), internalName: text(event.internalName, 80), name: text(event.name, 100), slug: text(event.slug, 80).toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, ""), shortDescription: text(event.shortDescription, 180), description: text(event.description, 3000), status: communityEventStatuses.includes(event.status) ? event.status : "draft", startsAt: iso(event.startsAt, defaults.startsAt), endsAt: iso(event.endsAt, defaults.endsAt), autoStart: event.autoStart !== false, autoFinish: event.autoFinish !== false, showBeforeStart: event.showBeforeStart !== false,
    objective: { ...objective, name: text(objective.name, 100), description: text(objective.description, 500), max: integer(objective.max, 1, 1000000000000), startValue: integer(objective.startValue, 0, 1000000000000), minimum: integer(objective.minimum, 0, 1000000000000), finishAtMinimum: objective.finishAtMinimum !== false, continueAfterCompletion: Boolean(objective.continueAfterCompletion), milestones: normalizeMilestones(objective.milestones) },
    participation: { ...participation, entryCost: integer(participation.entryCost, 0, 100000000), potContributionMode: participation.potContributionMode === "percentage" ? "percentage" : "fixed", potContributionValue: clamp(participation.potContributionValue, 0, participation.potContributionMode === "percentage" ? 100 : 100000000) },
    actions: { ...actions, mode: ["total", "daily", "period", "recharge", "unlimited"].includes(actions.mode) ? actions.mode : "daily", freeCount: integer(actions.freeCount, 0, 100000), periodMinutes: integer(actions.periodMinutes, 1, 43200), allowPurchase: Boolean(actions.allowPurchase), purchasePrice: integer(actions.purchasePrice, 0, 100000000), purchaseMaxTotal: integer(actions.purchaseMaxTotal, 0, 100000), purchaseMaxDaily: integer(actions.purchaseMaxDaily, 0, 100000), allowOverflowPurchase: actions.allowOverflowPurchase !== false, overflowPriceMultiplier: clamp(actions.overflowPriceMultiplier ?? 10, 1, 1000), overflowExponentBase: clamp(actions.overflowExponentBase ?? 1.25, 1, 10), purchasePotContributionMode: actions.purchasePotContributionMode === "fixed" ? "fixed" : "percentage", purchasePotContributionValue: clamp(actions.purchasePotContributionValue, 0, actions.purchasePotContributionMode === "fixed" ? 100000000 : 100) },
    game: { type: communityEventGameTypes.includes(input.game?.type ?? event.game?.type) ? (input.game?.type ?? event.game.type) : "dice", critical: { ...critical, enabled: Boolean(critical.enabled), chancePercent: clamp(critical.chancePercent, 0, 100), extraDraws: integer(critical.extraDraws, 1, 20), damageMultiplier: clamp(critical.damageMultiplier ?? 1, 0, 1000), contributionBonus: integer(critical.contributionBonus, 0, 100000000), label: text(critical.label, 100) || "Action critique", effects: normalizeEffects(critical.effects) }, dice: { ...dice, count: integer(dice.count, 1, 20), faces: integer(dice.faces, 2, 100), weighted: Boolean(dice.weighted), baseDamageMode: ["none", "sum", "count"].includes(dice.baseDamageMode) ? dice.baseDamageMode : "sum", baseDamageMultiplier: clamp(dice.baseDamageMultiplier || 1, 0, 1000) }, cards: { ...cards, decks: integer(cards.decks, 1, 20), jokers: Boolean(cards.jokers), cardsPerAction: integer(cards.cardsPerAction, 1, 20), replaceAfterDraw: cards.replaceAfterDraw !== false, deckMode: cards.deckMode === "community" ? "community" : "personal", baseDamageMode: ["none", "values", "count"].includes(cards.baseDamageMode) ? cards.baseDamageMode : "values", baseDamageMultiplier: clamp(cards.baseDamageMultiplier || 1, 0, 1000), useSuitEffects: cards.useSuitEffects !== false, useValueEffects: cards.useValueEffects !== false, useSpecificEffects: cards.useSpecificEffects !== false } },
    contribution: { ...defaults.contribution, ...(input.contribution ?? {}), damageRatio: clamp(input.contribution?.damageRatio ?? defaults.contribution.damageRatio, 0, 1000), dailyParticipation: integer(input.contribution?.dailyParticipation ?? defaults.contribution.dailyParticipation), communityEffect: integer(input.contribution?.communityEffect ?? defaults.contribution.communityEffect), rareEvent: integer(input.contribution?.rareEvent ?? defaults.contribution.rareEvent) },
    pot: { ...defaults.pot, ...(input.pot ?? {}), initial: integer(input.pot?.initial ?? defaults.pot.initial, 0, 1000000000000), remainderRule: ["disappear", "top", "equal", "rollover"].includes(input.pot?.remainderRule) ? input.pot.remainderRule : defaults.pot.remainderRule, rolloverTargetEventId: text(input.pot?.rolloverTargetEventId, 80) }, rewards,
    rankings: { ...defaults.rankings, ...(input.rankings ?? {}), limit: integer(input.rankings?.limit ?? defaults.rankings.limit, 1, 100) },
    theme: { ...defaults.theme, ...(input.theme ?? {}), name: text(input.theme?.name ?? defaults.theme.name, 80), title: text(input.theme?.title ?? event.name, 100), subtitle: text(input.theme?.subtitle ?? defaults.theme.subtitle, 160), icon: text(input.theme?.icon ?? defaults.theme.icon, 1000), heroImage: text(input.theme?.heroImage, 2000), heroPositionX: clamp(input.theme?.heroPositionX ?? defaults.theme.heroPositionX ?? 50, 0, 100), heroPositionY: clamp(input.theme?.heroPositionY ?? defaults.theme.heroPositionY ?? 50, 0, 100), heroScale: clamp(input.theme?.heroScale ?? defaults.theme.heroScale ?? 100, 100, 250), backgroundImage: text(input.theme?.backgroundImage, 2000), primary: text(input.theme?.primary ?? defaults.theme.primary, 30), secondary: text(input.theme?.secondary ?? defaults.theme.secondary, 30), accent: text(input.theme?.accent ?? defaults.theme.accent, 30), healthUnit: text(input.theme?.healthUnit ?? defaults.theme.healthUnit, 30), actionName: text(input.theme?.actionName ?? defaults.theme.actionName, 50) },
    texts: Object.fromEntries(Object.entries({ ...defaults.texts, ...(input.texts ?? {}) }).map(([key, value]) => [key, text(value, 500)])),
    limits: { ...defaults.limits, ...(input.limits ?? {}), minimumContribution: integer(input.limits?.minimumContribution ?? defaults.limits.minimumContribution), maximumActionsPerUser: integer(input.limits?.maximumActionsPerUser ?? defaults.limits.maximumActionsPerUser, 1, 1000000), recentActivityLimit: integer(input.limits?.recentActivityLimit ?? defaults.limits.recentActivityLimit, 5, 100) },
    runtime: { ...defaults.runtime, ...(input.runtime ?? {}), reachedMilestones: unique(input.runtime?.reachedMilestones ?? defaults.runtime.reachedMilestones), activeEffects: (input.runtime?.activeEffects ?? defaults.runtime.activeEffects).map(normalizeEffect) }
  };
}

export function validateCommunityEvent(event) {
  const errors = [];
  const duration = new Date(event.endsAt).getTime() - new Date(event.startsAt).getTime();
  if (!event.internalName) errors.push("Le nom interne est requis.");
  if (!event.name) errors.push("Le nom affiché est requis.");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(event.slug)) errors.push("Le slug doit contenir uniquement des lettres minuscules, chiffres et tirets.");
  if (!Number.isFinite(duration) || duration < 600000 || duration > 2592000000) errors.push("La durée doit être comprise entre 10 minutes et 30 jours.");
  if (event.objective.max <= event.objective.minimum) errors.push("La valeur maximale de l’objectif doit dépasser sa valeur minimale.");
  if (event.objective.startValue > event.objective.max || event.objective.startValue < event.objective.minimum) errors.push("La valeur de départ doit être comprise dans les limites de l’objectif.");
  if (event.participation.potContributionMode === "fixed" && event.participation.potContributionValue > event.participation.entryCost) errors.push("La part fixe de l’entrée versée à la cagnotte dépasse le prix d’entrée.");
  if (event.actions.purchasePotContributionMode === "fixed" && event.actions.purchasePotContributionValue > event.actions.purchasePrice) errors.push("La part fixe d’un achat versée à la cagnotte dépasse son prix.");
  if (event.actions.mode !== "unlimited" && event.actions.freeCount < 1 && !event.actions.allowPurchase) errors.push("Au moins une action gratuite ou achetable est nécessaire.");
  if (event.game.type === "dice" && (event.game.dice.count < 1 || event.game.dice.faces < 2)) errors.push("La configuration des dés est invalide.");
  const maximumDraw = event.game.cards.cardsPerAction + (event.game.critical.enabled ? event.game.critical.extraDraws : 0);
  if (event.game.type === "cards" && maximumDraw > (52 + (event.game.cards.jokers ? 2 : 0)) * event.game.cards.decks && !event.game.cards.replaceAfterDraw) errors.push("Le nombre de cartes tirées, critique inclus, dépasse la taille du paquet.");
  const distribution = event.rewards.distribution;
  if (Math.abs(distribution.equalPercent + distribution.proportionalPercent + distribution.tierPercent + distribution.rankingPercent - 100) > .001) errors.push("La répartition de la cagnotte doit totaliser exactement 100 %.");
  errors.push(...validateDrawCombinations(event.game));
  return errors;
}

function allowsObjectiveOverflow(event) {
  return event.objective.finishAtMinimum === false && event.objective.continueAfterCompletion === true;
}

export function eventProgress(event) {
  const span = Math.max(1, event.objective.max - event.objective.minimum);
  const current = event.runtime.currentValue ?? event.objective.startValue;
  const progress = Math.max(0, (event.objective.max - current) / span * 100);
  return allowsObjectiveOverflow(event) ? progress : Math.min(100, progress);
}

export function individualEventTier(event, participant) {
  const contribution = Math.max(0, Number(participant?.contribution) || 0);
  return (event?.rewards?.tiers ?? []).filter((tier) => Number(tier.score) <= contribution).at(-1) ?? null;
}

function contributionToPot(amount, mode, value) {
  return Math.max(0, Math.min(amount, mode === "percentage" ? Math.floor(amount * value / 100) : Math.floor(value)));
}

export function eventActionPeriodKey(event, now = new Date()) {
  const instant = now instanceof Date ? now : new Date(now);
  if (event.actions.mode === "daily") return `daily:${casinoDateKey(instant)}`;
  if (["period", "recharge"].includes(event.actions.mode)) {
    const periodMs = Math.max(1, Number(event.actions.periodMinutes) || 1) * 60000;
    return `${event.actions.mode}:${Math.floor(instant.getTime() / periodMs)}`;
  }
  return `event:${event.id}`;
}

function refreshExpiringActions(event, participant, now = new Date()) {
  const periodKey = eventActionPeriodKey(event, now);
  if (participant.paidActionsPeriodKey && participant.paidActionsPeriodKey !== periodKey) participant.paidActionsAvailable = 0;
  participant.paidActionsPeriodKey = periodKey;
}

export function appendEventPotEntry(db, event, amount, reason, meta = {}) {
  const value = Math.trunc(Number(amount) || 0);
  if (!value) return null;
  event.runtime.pot = Math.max(0, (Number(event.runtime.pot) || 0) + value);
  const entry = { id: randomUUID(), eventId: event.id, userId: meta.userId ?? null, amount: value, balance: event.runtime.pot, reason, createdAt: new Date().toISOString(), ...meta };
  db.communityEventPotEntries.push(entry);
  return entry;
}

export function eventActionAvailability(event, participant, db, now = new Date()) {
  if (!participant) return { free: 0, paid: 0, total: 0, nextRechargeAt: null };
  refreshExpiringActions(event, participant, now);
  const mode = event.actions.mode;
  const today = casinoDateKey(now);
  const usage = eventActionUsage(db.communityEventActions, event.id, participant.userId, now, event.actions.periodMinutes);
  let free = 0;
  let nextRechargeAt = null;
  if (mode === "unlimited") free = Number.MAX_SAFE_INTEGER;
  if (mode === "total") free = Math.max(0, event.actions.freeCount - usage.totalFree);
  if (mode === "daily") free = Math.max(0, event.actions.freeCount - usage.dailyFree);
  if (mode === "period") {
    const periodMs = event.actions.periodMinutes * 60000;
    const start = Math.floor(now.getTime() / periodMs) * periodMs;
    free = Math.max(0, event.actions.freeCount - usage.periodFree);
    nextRechargeAt = new Date(start + periodMs).toISOString();
  }
  if (mode === "recharge") {
    const interval = event.actions.periodMinutes * 60000;
    const last = new Date(participant.rechargeAt ?? participant.joinedAt).getTime();
    const elapsedUnits = Math.max(0, Math.floor((now.getTime() - last) / interval));
    const stored = Math.min(event.actions.freeCount, Number(participant.rechargeStored ?? event.actions.freeCount) + elapsedUnits);
    participant.rechargeStored = stored;
    participant.rechargeAt = elapsedUnits ? new Date(last + elapsedUnits * interval).toISOString() : new Date(last).toISOString();
    free = stored;
    if (stored < event.actions.freeCount) nextRechargeAt = new Date(new Date(participant.rechargeAt).getTime() + interval).toISOString();
  }
  const paid = Math.max(0, Number(participant.paidActionsAvailable) || 0);
  const limitRemaining = Math.max(0, event.limits.maximumActionsPerUser - participant.actions);
  const purchaseDailyCount = participant.purchaseDaily?.date === today ? Number(participant.purchaseDaily.count) || 0 : 0;
  const purchasesTotal = Number(participant.purchasesTotal) || 0;
  const quote = event.actions.allowPurchase && limitRemaining > paid ? quoteCommunityEventActions(event, participant, 1, now) : null;
  return {
    free: Math.min(free, limitRemaining),
    paid: Math.min(paid, limitRemaining),
    total: Math.min(free + paid, limitRemaining),
    nextRechargeAt,
    purchasePrice: quote?.total ?? eventActionPurchasePrice(event, participant, now),
    purchaseMaxDaily: event.actions.purchaseMaxDaily,
    purchaseMaxTotal: event.actions.purchaseMaxTotal,
    purchasedToday: purchaseDailyCount,
    purchasedTotal: purchasesTotal,
    purchaseRemainingDaily: Math.max(0, event.actions.purchaseMaxDaily - purchaseDailyCount),
    purchaseRemainingTotal: Math.max(0, event.actions.purchaseMaxTotal - purchasesTotal),
    overflowPurchasesTotal: Number(participant.overflowPurchasesTotal) || 0,
    overflowPricingActive: Boolean(quote?.overflowCount)
  };
}

export function eventActionPurchasePrice(event, participant, now = new Date()) {
  const active = [...(event.runtime.activeEffects ?? []), ...(participant?.activeEffects ?? [])].filter((effect) => effect.stat === "actionPrice" && (!effect.expiresAt || new Date(effect.expiresAt) > now));
  let multiplier = 1;
  for (const effect of active) {
    if (effect.type === "temporaryBonus") multiplier *= Math.max(0, 1 - effect.value);
    else if (effect.type === "temporaryMalus") multiplier *= 1 + Math.max(0, effect.value);
    else if (["personalMultiplier", "communityMultiplier"].includes(effect.type)) multiplier *= Math.max(0, effect.value);
  }
  return Math.max(0, Math.round(event.actions.purchasePrice * multiplier));
}

export function quoteCommunityEventActions(event, participant, count = 1, now = new Date()) {
  if (!participant) throw new Error("Rejoins d’abord l’événement.");
  refreshExpiringActions(event, participant, now);
  const quantity = integer(count, 1, 100);
  if ((Number(participant.actions) || 0) + (Number(participant.paidActionsAvailable) || 0) + quantity > event.limits.maximumActionsPerUser) throw new Error("Le maximum d’actions par joueur serait dépassé.");
  const today = casinoDateKey(now);
  const purchasedToday = participant.purchaseDaily?.date === today ? Number(participant.purchaseDaily.count) || 0 : 0;
  const purchasedTotal = Number(participant.purchasesTotal) || 0;
  const previousOverflow = Number(participant.overflowPurchasesTotal) || 0;
  const baseUnitPrice = eventActionPurchasePrice(event, participant, now);
  const unitPrices = [];
  let normalCount = 0;
  let overflowCount = 0;
  for (let index = 0; index < quantity; index += 1) {
    const overDailyQuota = purchasedToday + index + 1 > event.actions.purchaseMaxDaily;
    const overTotalQuota = purchasedTotal + index + 1 > event.actions.purchaseMaxTotal;
    const overflow = overDailyQuota || overTotalQuota;
    if (overflow && !event.actions.allowOverflowPurchase) {
      throw new Error(overDailyQuota ? "Limite quotidienne d’actions supplémentaires atteinte." : "Limite totale d’actions supplémentaires atteinte.");
    }
    if (!overflow) {
      normalCount += 1;
      unitPrices.push(baseUnitPrice);
      continue;
    }
    const exponent = Math.min(50, previousOverflow + overflowCount);
    const escalated = baseUnitPrice * event.actions.overflowPriceMultiplier * (event.actions.overflowExponentBase ** exponent);
    unitPrices.push(Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.round(escalated))));
    overflowCount += 1;
  }
  const total = unitPrices.reduce((sum, value) => Math.min(Number.MAX_SAFE_INTEGER, sum + value), 0);
  return {
    quantity,
    total,
    normalCount,
    overflowCount,
    baseUnitPrice,
    unitPrices,
    nextUnitPrice: unitPrices.at(-1) ?? baseUnitPrice,
    purchaseMaxDaily: event.actions.purchaseMaxDaily,
    purchaseMaxTotal: event.actions.purchaseMaxTotal,
    purchasedToday,
    purchasedTotal,
    remainingDaily: Math.max(0, event.actions.purchaseMaxDaily - purchasedToday),
    remainingTotal: Math.max(0, event.actions.purchaseMaxTotal - purchasedTotal)
  };
}

function weightedDie(faces, weights = {}) {
  const rows = Array.from({ length: faces }, (_, index) => ({ value: index + 1, weight: Math.max(0, Number(weights[index + 1]) || 1) }));
  const total = rows.reduce((sum, row) => sum + row.weight, 0);
  let cursor = Math.random() * total;
  for (const row of rows) { cursor -= row.weight; if (cursor <= 0) return row.value; }
  return faces;
}

function diceCombinationMatches(condition, dice) {
  const counts = new Map(dice.map((value) => [value, dice.filter((candidate) => candidate === value).length]));
  const total = dice.reduce((sum, value) => sum + value, 0);
  if (condition.type === "double") return [...counts.values()].some((count) => count >= 2);
  if (condition.type === "triple") return [...counts.values()].some((count) => count >= 3);
  if (condition.type === "straight") { const sorted = [...new Set(dice)].sort((a, b) => a - b); return sorted.length >= 3 && sorted.every((value, index) => !index || value === sorted[index - 1] + 1); }
  if (condition.type === "tripleValue") return (counts.get(Number(condition.value)) ?? 0) >= 3;
  if (condition.type === "minTotal") return total >= Number(condition.value);
  if (condition.type === "maxTotal") return total <= Number(condition.value);
  if (["customValues", "containsValues"].includes(condition.type)) return valuesMatch(condition.values, dice, condition.type === "customValues");
  return false;
}

const suits = ["hearts", "diamonds", "clubs", "spades"];
const ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
function makeDeck(config) {
  const cards = [];
  for (let deck = 0; deck < config.decks; deck += 1) for (const suit of suits) for (const rank of ranks) cards.push({ id: `${deck}-${suit}-${rank}-${randomUUID().slice(0, 5)}`, suit, rank });
  if (config.jokers) for (let deck = 0; deck < config.decks; deck += 1) cards.push({ id: `${deck}-joker-a-${randomUUID().slice(0, 5)}`, suit: "joker", rank: "JOKER" }, { id: `${deck}-joker-b-${randomUUID().slice(0, 5)}`, suit: "joker", rank: "JOKER" });
  return cards;
}
function shuffle(cards) {
  const result = [...cards];
  for (let index = result.length - 1; index > 0; index -= 1) { const target = Math.floor(Math.random() * (index + 1)); [result[index], result[target]] = [result[target], result[index]]; }
  return result;
}
function cardValue(card) { return card.rank === "A" ? 14 : card.rank === "K" ? 13 : card.rank === "Q" ? 12 : card.rank === "J" ? 11 : card.rank === "JOKER" ? 0 : Number(card.rank); }

function itemEffectWeight(baseDamage, effects = []) {
  let damage = Math.max(0, Number(baseDamage) || 0);
  let contribution = 0;
  for (const effect of effects) {
    const value = Number(effect.value) || 0;
    if (effect.type === "damageFixed") damage = value;
    if (effect.type === "damageBonus") damage += value;
    if (effect.type === "damageMultiplier") damage *= value;
    if (effect.type === "contribution") contribution += value;
  }
  return { damage: Math.max(0, damage), contribution: Math.max(0, contribution) };
}

function allocateEffectiveTotal(total, weights = []) {
  const roundedTotal = Math.max(0, Math.round(Number(total) || 0));
  if (!weights.length) return [];
  const normalized = weights.map((weight) => Math.max(0, Number(weight) || 0));
  const usable = normalized.some((weight) => weight > 0) ? normalized : normalized.map(() => 1);
  const weightTotal = usable.reduce((sum, weight) => sum + weight, 0);
  const raw = usable.map((weight) => roundedTotal * weight / weightTotal);
  const allocated = raw.map(Math.floor);
  let remainder = roundedTotal - allocated.reduce((sum, value) => sum + value, 0);
  const order = raw.map((value, index) => ({ index, fraction: value - allocated[index] })).sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  for (let index = 0; index < remainder; index += 1) allocated[order[index % order.length].index] += 1;
  return allocated;
}

function drawEventResult(event, participant) {
  const criticalConfig = event.game.critical;
  const critical = Boolean(criticalConfig?.enabled) && Math.random() * 100 < criticalConfig.chancePercent;
  const extraDraws = critical ? criticalConfig.extraDraws : 0;
  const criticalEffects = critical ? criticalConfig.effects : [];
  if (event.game.type === "dice") {
    const config = event.game.dice;
    const dice = Array.from({ length: config.count + extraDraws }, () => config.weighted ? weightedDie(config.faces, config.weights) : 1 + Math.floor(Math.random() * config.faces));
    const itemEffects = dice.map((value) => config.faceEffects[String(value)] ?? []);
    const effects = itemEffects.flat();
    const combinations = config.combinations.filter((row) => diceCombinationMatches(row.condition, dice));
    const criticalMultiplier = critical ? criticalConfig.damageMultiplier : 1;
    const itemScores = dice.map((value) => (config.baseDamageMode === "sum" ? value : config.baseDamageMode === "count" ? 1 : 0) * config.baseDamageMultiplier * criticalMultiplier);
    const baseDamage = itemScores.reduce((sum, value) => sum + value, 0);
    const itemWeights = itemScores.map((value, index) => itemEffectWeight(value, itemEffects[index]));
    return { type: "dice", dice, itemScores, itemWeights, critical, criticalLabel: critical ? criticalConfig.label : "", extraDraws, combinations: combinations.map((row) => row.name), effects: [...effects, ...combinations.flatMap((row) => row.effects), ...criticalEffects], baseDamage };
  }
  const config = event.game.cards;
  const cardsToDraw = config.cardsPerAction + extraDraws;
  let cards;
  if (config.replaceAfterDraw) cards = shuffle(makeDeck(config)).slice(0, cardsToDraw);
  else {
    const deckKey = config.deckMode === "community" ? "communityDeck" : "deck";
    const owner = config.deckMode === "community" ? event.runtime : participant;
    if (!Array.isArray(owner[deckKey]) || owner[deckKey].length < cardsToDraw) owner[deckKey] = shuffle(makeDeck(config));
    cards = owner[deckKey].splice(0, cardsToDraw);
  }
  const itemEffects = cards.map((card) => [
    ...(config.useSuitEffects ? config.suitEffects[card.suit] ?? [] : []),
    ...(config.useValueEffects ? config.valueEffects[card.rank] ?? [] : []),
    ...(config.useSpecificEffects ? config.specificEffects[`${card.rank}-${card.suit}`] ?? [] : [])
  ]);
  const effects = itemEffects.flat();
  const criticalMultiplier = critical ? criticalConfig.damageMultiplier : 1;
  const itemScores = cards.map((card) => (config.baseDamageMode === "values" ? cardValue(card) : config.baseDamageMode === "count" ? 1 : 0) * config.baseDamageMultiplier * criticalMultiplier);
  const baseDamage = itemScores.reduce((sum, value) => sum + value, 0);
  const itemWeights = itemScores.map((value, index) => itemEffectWeight(value, itemEffects[index]));
  const combinations = (config.combinations ?? []).filter((row) => cardsCombinationMatches(row.condition, cards));
  return { type: "cards", cards, itemScores, itemWeights, critical, criticalLabel: critical ? criticalConfig.label : "", extraDraws, effects: [...effects, ...combinations.flatMap((row) => row.effects), ...criticalEffects], combinations: combinations.map((row) => row.name), baseDamage };
}

function effectDurationMs(effect) {
  const factor = effect.durationUnit === "hours" ? 3600000 : effect.durationUnit === "seconds" ? 1000 : 60000;
  return effect.duration * factor;
}

function applyEffects(event, participant, effects, db, helpers, context) {
  let damage = context.baseDamage;
  let contribution = 0;
  let damageMultiplier = 1;
  let contributionMultiplier = 1;
  let potAdded = 0;
  let tokensWon = 0;
  let communityEffects = 0;
  let rareEvents = 0;
  const triggered = [];
  const now = Date.now();
  db.communityEventEffects ??= [];
  db.communityEventEffects = db.communityEventEffects.filter((effect) => !effect.expiresAt || new Date(effect.expiresAt).getTime() > now);
  const validCommunity = (event.runtime.activeEffects ?? []).filter((effect) => !effect.expiresAt || new Date(effect.expiresAt).getTime() > now);
  const validPersonal = (participant.activeEffects ?? []).filter((effect) => !effect.expiresAt || new Date(effect.expiresAt).getTime() > now);
  event.runtime.activeEffects = validCommunity.filter((effect) => effect.target !== "nextAction");
  participant.activeEffects = validPersonal.filter((effect) => effect.target !== "nextAction");
  const passive = [...validCommunity, ...validPersonal];
  for (const effect of passive) {
    const multiplier = effect.type === "temporaryMalus" ? Math.max(0, 1 - effect.value) : effect.type === "temporaryBonus" ? 1 + effect.value : effect.value;
    if (effect.stat === "damage") damageMultiplier *= multiplier;
    if (effect.stat === "contribution") contributionMultiplier *= multiplier;
  }
  for (const effect of effects) {
    if (effect.type === "none") continue;
    triggered.push(effect.label || effect.type);
    if (effect.type === "damageFixed") damage = effect.value;
    if (effect.type === "damageBonus") damage += effect.value;
    if (effect.type === "damageMultiplier") damage *= effect.value;
    if (effect.type === "contribution") contribution += effect.value;
    if (effect.type === "pot") { appendEventPotEntry(db, event, Math.trunc(effect.value), "action-effect", { userId: participant.userId }); potAdded += Math.trunc(effect.value); }
    if (effect.type === "tokens" && effect.value > 0) {
      const recipients = effect.target === "community" ? db.communityEventParticipants.filter((row) => row.eventId === event.id) : [participant];
      for (const recipient of recipients) helpers.addTokens(db, recipient.userId, Math.trunc(effect.value), { reason: "community-event-instant", eventId: event.id });
      tokensWon += Math.trunc(effect.value);
    }
    if (effect.type === "extraAction") {
      const recipients = effect.target === "community" ? db.communityEventParticipants.filter((row) => row.eventId === event.id) : [participant];
      for (const recipient of recipients) {
        refreshExpiringActions(event, recipient, now);
        recipient.paidActionsAvailable += Math.max(0, Math.trunc(effect.value));
      }
    }
    if (["personalMultiplier", "communityMultiplier", "temporaryBonus", "temporaryMalus"].includes(effect.type)) {
      const expiresAt = effect.target === "nextAction" ? null : new Date(now + effectDurationMs(effect)).toISOString();
      const stored = { ...effect, id: randomUUID(), sourceEffectId: effect.id, ...(context.milestoneId ? { milestoneId: context.milestoneId } : {}), eventId: event.id, userId: effect.type === "communityMultiplier" || effect.target === "community" ? null : participant.userId, appliedAt: new Date(now).toISOString(), expiresAt };
      if (effect.type === "communityMultiplier" || effect.target === "community") event.runtime.activeEffects.push(stored);
      else participant.activeEffects.push(stored);
      db.communityEventEffects.push(stored);
      if (effect.target === "community") communityEffects += 1;
    }
    if (effect.type === "special") { communityEffects += 1; rareEvents += 1; }
  }
  damage *= damageMultiplier;
  damage = Math.max(0, Math.round(damage));
  contribution += Math.round(damage * event.contribution.damageRatio);
  contribution *= contributionMultiplier;
  contribution = Math.max(0, Math.round(contribution));
  return { damage, contribution, potAdded, tokensWon, communityEffects, rareEvents, triggered };
}

export function joinCommunityEvent(db, event, user, helpers, requestId = "") {
  if (event.status !== "active") throw new Error("Cet événement n’accepte pas de nouvelles participations.");
  let participant = db.communityEventParticipants.find((row) => row.eventId === event.id && row.userId === user.id);
  if (participant) return participant;
  const cost = event.participation.entryCost;
  if ((Number(user.tokens) || 0) < cost) throw new Error("Solde insuffisant pour participer.");
  if (cost) helpers.addTokens(db, user.id, -cost, { reason: "community-event-entry", eventId: event.id, requestId });
  const potPart = contributionToPot(cost, event.participation.potContributionMode, event.participation.potContributionValue);
  if (potPart) appendEventPotEntry(db, event, potPart, "entry", { userId: user.id });
  const now = new Date().toISOString();
  participant = { id: randomUUID(), eventId: event.id, userId: user.id, joinedAt: now, lastActivityAt: now, actions: 0, diceRolls: 0, cardsDrawn: 0, damage: 0, contribution: 0, tokensSpent: cost, potAdded: potPart, bonusesTriggered: 0, communityEffects: 0, bestAction: 0, bestCombination: "", paidActionsAvailable: 0, paidActionsPeriodKey: eventActionPeriodKey(event, new Date(now)), purchasesTotal: 0, overflowPurchasesTotal: 0, purchaseDaily: { date: casinoDateKey(now), count: 0 }, activeEffects: [], rechargeStored: event.actions.freeCount, rechargeAt: now, joinRequestId: requestId, actionRequestIds: [], purchaseRequestIds: [] };
  participant.entryCostPaid = cost;
  db.communityEventParticipants.push(participant);
  event.runtime.participantCount += 1;
  return participant;
}

export function purchaseCommunityEventActions(db, event, participant, count, user, helpers, requestId = "") {
  if (event.status !== "active" || !event.actions.allowPurchase) throw new Error("L’achat d’actions n’est pas disponible.");
  if (requestId && (participant.purchaseRequestIds ?? []).includes(requestId)) return { participant, quote: null, duplicate: true };
  const quantity = integer(count, 1, 100);
  const today = casinoDateKey();
  if (participant.purchaseDaily.date !== today) participant.purchaseDaily = { date: today, count: 0 };
  const quote = quoteCommunityEventActions(event, participant, quantity);
  const cost = quote.total;
  if ((Number(user.tokens) || 0) < cost) throw new Error("Solde insuffisant pour cet achat.");
  if (cost) helpers.addTokens(db, user.id, -cost, { reason: "community-event-action-purchase", eventId: event.id, requestId, eventPurchaseQuantity: quantity, eventOverflowQuantity: quote.overflowCount, eventUnitPrices: quote.unitPrices });
  const potPart = event.actions.purchasePotContributionMode === "fixed"
    ? Math.max(0, Math.min(cost, Math.floor(event.actions.purchasePotContributionValue) * quantity))
    : contributionToPot(cost, "percentage", event.actions.purchasePotContributionValue);
  if (potPart) appendEventPotEntry(db, event, potPart, "action-purchase", { userId: user.id });
  participant.paidActionsAvailable += quantity;
  participant.purchasesTotal += quantity;
  participant.overflowPurchasesTotal = (Number(participant.overflowPurchasesTotal) || 0) + quote.overflowCount;
  participant.purchaseDaily.count += quantity;
  participant.tokensSpent += cost;
  participant.potAdded += potPart;
  if (requestId) participant.purchaseRequestIds = [...(participant.purchaseRequestIds ?? []).slice(-49), requestId];
  return { participant, quote };
}

export function performCommunityEventAction(db, event, participant, helpers, requestId = "") {
  if (event.status !== "active") throw new Error("L’événement n’est pas en cours.");
  if (requestId && (participant.actionRequestIds ?? []).includes(requestId)) return archiveRows(db.communityEventActions, { eventId: event.id, userId: participant.userId, requestId }, { limit: 1 })[0];
  const availability = eventActionAvailability(event, participant, db);
  if (availability.total < 1) throw new Error("Aucune action disponible.");
  const paid = availability.free < 1;
  if (paid) participant.paidActionsAvailable -= 1;
  if (event.actions.mode === "recharge" && !paid) participant.rechargeStored -= 1;
  const today = casinoDateKey();
  const firstActionToday = eventActionUsage(db.communityEventActions, event.id, participant.userId, new Date(), event.actions.periodMinutes).today === 0;
  const draw = drawEventResult(event, participant);
  const result = applyEffects(event, participant, draw.effects, db, helpers, draw);
  if (draw.critical && draw.criticalLabel && !result.triggered.includes(draw.criticalLabel)) result.triggered.unshift(draw.criticalLabel);
  const configuredContributionBonus = (firstActionToday ? event.contribution.dailyParticipation : 0) + result.communityEffects * event.contribution.communityEffect + result.rareEvents * event.contribution.rareEvent + (draw.critical ? event.game.critical.contributionBonus : 0);
  result.contribution += configuredContributionBonus;
  result.contributionBonus = configuredContributionBonus;
  const effectiveDamage = allocateEffectiveTotal(result.damage, draw.itemWeights.map((item) => item.damage));
  const effectiveContribution = allocateEffectiveTotal(result.contribution, draw.itemWeights.map((item, index) => item.contribution + effectiveDamage[index] * event.contribution.damageRatio));
  const itemEffectiveScores = effectiveDamage.map((damage, index) => ({ damage, contribution: effectiveContribution[index] }));
  const previousValue = event.runtime.currentValue ?? event.objective.startValue;
  const nextValue = allowsObjectiveOverflow(event)
    ? previousValue - result.damage
    : Math.max(event.objective.minimum, previousValue - result.damage);
  event.runtime.currentValue = nextValue;
  participant.actions += 1;
  participant.diceRolls += draw.dice?.length ?? 0;
  participant.cardsDrawn += draw.cards?.length ?? 0;
  participant.damage += result.damage;
  participant.contribution += result.contribution;
  participant.potAdded += result.potAdded;
  participant.bonusesTriggered += result.triggered.length;
  participant.communityEffects += result.communityEffects;
  participant.bestAction = Math.max(participant.bestAction, result.damage);
  if (draw.combinations?.[0]) participant.bestCombination = draw.combinations[0];
  participant.lastActivityAt = new Date().toISOString();
  event.runtime.actionCount += 1;
  event.runtime.damage += result.damage;
  event.runtime.contribution += result.contribution;
  event.runtime.lastActionAt = participant.lastActivityAt;
  const beforeProgress = (event.objective.max - previousValue) / Math.max(1, event.objective.max - event.objective.minimum) * 100;
  const afterProgress = eventProgress(event);
  const milestones = event.objective.milestones.filter((row) => row.percent > beforeProgress && row.percent <= afterProgress && !event.runtime.reachedMilestones.includes(row.id));
  for (const milestone of milestones) {
    event.runtime.reachedMilestones.push(milestone.id);
    const milestoneResult = applyEffects(event, participant, milestone.effects, db, helpers, { baseDamage: 0, milestoneId: milestone.id });
    result.potAdded += milestoneResult.potAdded;
    result.tokensWon += milestoneResult.tokensWon;
    result.triggered.push(milestone.label, ...milestoneResult.triggered);
  }
  const { itemWeights, ...publicDraw } = draw;
  const action = { id: randomUUID(), requestId, eventId: event.id, userId: participant.userId, createdAt: participant.lastActivityAt, paid, result: { ...publicDraw, ...result, itemEffectiveScores, previousValue, currentValue: nextValue, progress: afterProgress, milestones: milestones.map((row) => row.label) } };
  db.communityEventActions.push(action);
  if (requestId) participant.actionRequestIds = [...(participant.actionRequestIds ?? []).slice(-49), requestId];
  return action;
}

function eventEntryFeePaid(db, event, participant) {
  if (Number.isFinite(participant.entryCostPaid)) return integer(participant.entryCostPaid);
  // Older participants did not retain the entry price; the ledger is authoritative.
  return archiveRows(db.transactions, { eventId: event.id, userId: participant.userId, reason: "community-event-entry" })
    .reduce((total, transaction) => total + Math.max(0, -(Number(transaction.amount) || 0)), 0);
}

function entryRefundReward(db, event, participant) {
  const amount = eventEntryFeePaid(db, event, participant);
  return {
    eligible: true, rank: null, amount,
    detail: { outcome: "entry-refund", participation: amount, tier: "Frais de participation remboursés", tierFixed: 0, tierMultiplier: 1, communityMultiplier: 1, fixedSubtotal: amount, equalShare: 0, proportionalShare: 0, tierShare: 0, rankingShare: 0, bonus: "", total: amount, progress: eventProgress(event) },
    cosmeticId: ""
  };
}

function refundIncompleteEvent(db, event, helpers) {
  const pot = Math.max(0, Number(event.runtime.pot) || 0);
  const participants = db.communityEventParticipants.filter((row) => row.eventId === event.id);
  const rows = participants.map((participant) => {
    const existing = db.communityEventRewards.find((row) => row.eventId === event.id && row.userId === participant.userId);
    if (existing) return existing;
    const reward = { id: randomUUID(), eventId: event.id, userId: participant.userId, ...entryRefundReward(db, event, participant), distributedAt: new Date().toISOString() };
    if (reward.amount > 0) helpers.addTokens(db, participant.userId, reward.amount, { reason: "community-event-refund", eventId: event.id });
    db.communityEventRewards.push(reward);
    return reward;
  });
  const refunded = rows.reduce((sum, row) => sum + row.amount, 0);
  const refundFromPot = Math.min(pot, refunded);
  if (refundFromPot) appendEventPotEntry(db, event, -refundFromPot, "entry-refunds");
  const remainder = event.runtime.pot;
  // Ranking/equal remainder rules only apply to a successful event.
  if (remainder > 0 && event.pot.remainderRule === "disappear") appendEventPotEntry(db, event, -remainder, "failed-event-pot-expiry");
  if (remainder > 0 && event.pot.remainderRule === "rollover" && event.pot.rolloverTargetEventId !== event.id) {
    const target = db.communityEvents.find((row) => row.id === event.pot.rolloverTargetEventId && ["draft", "scheduled"].includes(row.status));
    if (target) {
      appendEventPotEntry(db, target, remainder, "rollover", { sourceEventId: event.id });
      appendEventPotEntry(db, event, -remainder, "failed-event-rollover", { targetEventId: target.id });
    }
  }
  event.runtime.finalPot = pot;
  event.runtime.unallocatedPot = event.runtime.pot;
  event.runtime.outcome = "incomplete";
  event.runtime.finalizedAt = new Date().toISOString();
  return rows;
}

export function calculateCommunityEventRewards(db, event, helpers) {
  if (event.runtime.finalizedAt) return db.communityEventRewards.filter((row) => row.eventId === event.id);
  if ((event.runtime.currentValue ?? event.objective.startValue) > event.objective.minimum) return refundIncompleteEvent(db, event, helpers);
  const participants = db.communityEventParticipants.filter((row) => row.eventId === event.id && row.actions > 0 && row.contribution >= event.limits.minimumContribution);
  const progress = eventProgress(event);
  const communityMultiplier = event.rewards.communityMultiplierEnabled ? (event.rewards.communityMultipliers.filter((row) => row.minPercent <= progress).at(-1)?.multiplier ?? 1) : 1;
  const pot = Math.max(0, event.runtime.pot);
  const distribution = event.rewards.distribution;
  const pools = { equal: Math.floor(pot * distribution.equalPercent / 100), proportional: Math.floor(pot * distribution.proportionalPercent / 100), tier: Math.floor(pot * distribution.tierPercent / 100), ranking: Math.floor(pot * distribution.rankingPercent / 100) };
  const ranked = [...participants].sort((a, b) => b.contribution - a.contribution || b.damage - a.damage || a.joinedAt.localeCompare(b.joinedAt));
  const contributionTotal = participants.reduce((sum, row) => sum + row.contribution, 0);
  const tierFor = (participant) => individualEventTier(event, participant);
  const tierWeightFor = (participant) => {
    const tier = tierFor(participant);
    return tier?.potPercent > 0 ? tier.potPercent : tier?.multiplier ?? 1;
  };
  const tierWeightTotal = participants.reduce((sum, participant) => sum + tierWeightFor(participant), 0);
  const rankingWeights = event.rewards.distribution.rankingWeights;
  const rankingWeightTotal = rankingWeights.slice(0, ranked.length).reduce((sum, value) => sum + value, 0);
  const rows = ranked.map((participant, index) => {
    const tier = tierFor(participant);
    const base = event.rewards.participationReward;
    const tierFixed = tier?.fixed ?? 0;
    const fixedSubtotal = Math.floor((base + tierFixed) * (tier?.multiplier ?? 1) * communityMultiplier);
    const equalShare = participants.length ? Math.floor(pools.equal / participants.length) : 0;
    const proportionalShare = contributionTotal ? Math.floor(pools.proportional * participant.contribution / contributionTotal) : 0;
    const tierShare = tierWeightTotal ? Math.floor(pools.tier * tierWeightFor(participant) / tierWeightTotal) : 0;
    const rankingShare = rankingWeightTotal && rankingWeights[index] ? Math.floor(pools.ranking * rankingWeights[index] / rankingWeightTotal) : 0;
    const total = fixedSubtotal + equalShare + proportionalShare + tierShare + rankingShare;
    return { id: randomUUID(), eventId: event.id, userId: participant.userId, rank: index + 1, amount: total, distributedAt: null, detail: { participation: base, tier: tier?.name ?? "Participation", tierFixed, tierMultiplier: tier?.multiplier ?? 1, communityMultiplier, fixedSubtotal, equalShare, proportionalShare, tierShare, rankingShare, bonus: tier?.bonus ?? "", total, progress }, cosmeticId: tier?.cosmeticId ?? "" };
  });
  const distributedPot = rows.reduce((sum, row) => sum + row.detail.equalShare + row.detail.proportionalShare + row.detail.tierShare + row.detail.rankingShare, 0);
  let remainder = Math.max(0, pot - distributedPot);
  if (remainder && rows.length && event.pot.remainderRule === "top") { rows[0].amount += remainder; rows[0].detail.remainder = remainder; rows[0].detail.total += remainder; remainder = 0; }
  if (remainder && rows.length && event.pot.remainderRule === "equal") {
    let cursor = 0;
    while (remainder > 0) { rows[cursor % rows.length].amount += 1; rows[cursor % rows.length].detail.remainder = (rows[cursor % rows.length].detail.remainder ?? 0) + 1; rows[cursor % rows.length].detail.total += 1; cursor += 1; remainder -= 1; }
  }
  if (remainder && event.pot.remainderRule === "rollover" && event.pot.rolloverTargetEventId) {
    const target = db.communityEvents.find((row) => row.id === event.pot.rolloverTargetEventId && ["draft", "scheduled"].includes(row.status));
    if (target) { appendEventPotEntry(db, target, remainder, "rollover", { sourceEventId: event.id }); remainder = 0; }
  }
  for (const reward of rows) {
    if (db.communityEventRewards.some((entry) => entry.eventId === event.id && entry.userId === reward.userId)) continue;
    if (reward.amount > 0) helpers.addTokens(db, reward.userId, reward.amount, { reason: "community-event-reward", eventId: event.id });
    if (reward.cosmeticId) helpers.grantCosmetic?.(db, reward.userId, reward.cosmeticId);
    reward.distributedAt = new Date().toISOString();
    db.communityEventRewards.push(reward);
  }
  const potRemainingAfterRewards = event.pot.remainderRule === "rollover" ? remainder : 0;
  const removedFromPot = Math.max(0, pot - potRemainingAfterRewards);
  if (removedFromPot > 0) appendEventPotEntry(db, event, -removedFromPot, event.pot.remainderRule === "disappear" && remainder ? "reward-distribution-and-remainder-expiry" : "reward-distribution");
  event.runtime.finalPot = pot;
  event.runtime.unallocatedPot = remainder;
  event.runtime.finalizedAt = new Date().toISOString();
  return rows;
}

export function potentialCommunityEventReward(db, event, participant) {
  if (event.runtime.finalizedAt) return db.communityEventRewards.find((row) => row.eventId === event.id && row.userId === participant?.userId) ?? { eligible: false, rank: null, amount: 0, detail: null };
  if (participant && (event.runtime.currentValue ?? event.objective.startValue) > event.objective.minimum) return entryRefundReward(db, event, participant);
  if (!participant || participant.actions < 1 || participant.contribution < event.limits.minimumContribution) return { eligible: false, rank: null, amount: 0, detail: null };
  const participants = db.communityEventParticipants.filter((row) => row.eventId === event.id && row.actions > 0 && row.contribution >= event.limits.minimumContribution);
  const ranked = [...participants].sort((a, b) => b.contribution - a.contribution || b.damage - a.damage || a.joinedAt.localeCompare(b.joinedAt));
  const rank = ranked.findIndex((row) => row.userId === participant.userId) + 1;
  const progress = eventProgress(event);
  const communityMultiplier = event.rewards.communityMultiplierEnabled ? (event.rewards.communityMultipliers.filter((row) => row.minPercent <= progress).at(-1)?.multiplier ?? 1) : 1;
  const tierFor = (row) => individualEventTier(event, row);
  const tier = tierFor(participant);
  const pot = Math.max(0, event.runtime.pot);
  const distribution = event.rewards.distribution;
  const pools = { equal: Math.floor(pot * distribution.equalPercent / 100), proportional: Math.floor(pot * distribution.proportionalPercent / 100), tier: Math.floor(pot * distribution.tierPercent / 100), ranking: Math.floor(pot * distribution.rankingPercent / 100) };
  const contributionTotal = participants.reduce((sum, row) => sum + row.contribution, 0);
  const tierWeight = (row) => { const reached = tierFor(row); return reached?.potPercent > 0 ? reached.potPercent : reached?.multiplier ?? 1; };
  const tierWeightTotal = participants.reduce((sum, row) => sum + tierWeight(row), 0);
  const rankingWeights = distribution.rankingWeights;
  const rankingWeightTotal = rankingWeights.slice(0, ranked.length).reduce((sum, value) => sum + value, 0);
  const detail = {
    participation: event.rewards.participationReward,
    tier: tier?.name ?? "Participation",
    tierFixed: tier?.fixed ?? 0,
    tierMultiplier: tier?.multiplier ?? 1,
    communityMultiplier,
    equalShare: participants.length ? Math.floor(pools.equal / participants.length) : 0,
    proportionalShare: contributionTotal ? Math.floor(pools.proportional * participant.contribution / contributionTotal) : 0,
    tierShare: tierWeightTotal ? Math.floor(pools.tier * tierWeight(participant) / tierWeightTotal) : 0,
    rankingShare: rankingWeightTotal && rankingWeights[rank - 1] ? Math.floor(pools.ranking * rankingWeights[rank - 1] / rankingWeightTotal) : 0,
    bonus: tier?.bonus ?? "",
    cosmeticId: tier?.cosmeticId ?? "",
    progress
  };
  const fixedSubtotal = Math.floor((detail.participation + detail.tierFixed) * detail.tierMultiplier * communityMultiplier);
  detail.total = fixedSubtotal + detail.equalShare + detail.proportionalShare + detail.tierShare + detail.rankingShare;
  return { eligible: true, rank, amount: detail.total, detail };
}

export function eventLeaderboard(db, event, users, limit = event.rankings.limit) {
  return db.communityEventParticipants.filter((row) => row.eventId === event.id).sort((a, b) => b.contribution - a.contribution || b.damage - a.damage).slice(0, limit).map((row, index) => ({ ...row, rank: index + 1, pseudo: users.find((user) => user.id === row.userId)?.pseudo ?? "Joueur" }));
}

export function participationPotAmount(event) { return contributionToPot(event.participation.entryCost, event.participation.potContributionMode, event.participation.potContributionValue); }
export function purchasePotAmount(event, count = 1) { const quantity = Math.max(1, Math.trunc(Number(count) || 1)); const cost = event.actions.purchasePrice * quantity; return event.actions.purchasePotContributionMode === "fixed" ? Math.max(0, Math.min(cost, Math.floor(event.actions.purchasePotContributionValue) * quantity)) : contributionToPot(cost, "percentage", event.actions.purchasePotContributionValue); }
