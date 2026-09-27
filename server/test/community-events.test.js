import assert from "node:assert/strict";
import test from "node:test";
import {
  appendEventPotEntry,
  calculateCommunityEventRewards,
  defaultCommunityEvent,
  eventActionAvailability,
  eventActionPurchasePrice,
  eventProgress,
  individualEventTier,
  joinCommunityEvent,
  normalizeCommunityEvent,
  performCommunityEventAction,
  potentialCommunityEventReward,
  purchaseCommunityEventActions,
  quoteCommunityEventActions,
  validateCommunityEvent
} from "../src/services/community-events.js";

function fixture(overrides = {}) {
  const event = normalizeCommunityEvent({
    ...defaultCommunityEvent(new Date("2026-01-01T00:00:00.000Z")),
    startsAt: "2026-01-01T00:00:00.000Z",
    endsAt: "2026-01-02T00:00:00.000Z",
    status: "active",
    participation: { entryCost: 10, potContributionMode: "fixed", potContributionValue: 8 },
    actions: { mode: "total", freeCount: 2, periodMinutes: 60, allowPurchase: true, purchasePrice: 5, purchaseMaxTotal: 3, purchaseMaxDaily: 3, purchasePotContributionMode: "percentage", purchasePotContributionValue: 100 },
    objective: { ...defaultCommunityEvent().objective, max: 100, startValue: 100, minimum: 0, milestones: [] },
    rewards: { ...defaultCommunityEvent().rewards, participationReward: 5, tiers: [], communityMultiplierEnabled: false, distribution: { equalPercent: 100, proportionalPercent: 0, tierPercent: 0, rankingPercent: 0, rankingWeights: [] } },
    pot: { initial: 0, remainderRule: "equal", rolloverTargetEventId: "" },
    ...overrides
  });
  event.runtime.currentValue = event.objective.startValue;
  const user = { id: "u1", pseudo: "Alice", tokens: 100 };
  const db = { users: [user], communityEvents: [event], communityEventParticipants: [], communityEventActions: [], communityEventPotEntries: [], communityEventRewards: [], transactions: [] };
  const helpers = { addTokens(currentDb, userId, amount, meta) { const target = currentDb.users.find((row) => row.id === userId); target.tokens += amount; currentDb.transactions.push({ userId, amount, ...meta }); } };
  return { db, event, user, helpers };
}

test("la configuration impose les dates, l’objectif et une répartition complète", () => {
  const { event } = fixture();
  assert.deepEqual(validateCommunityEvent(event), []);
  const invalid = normalizeCommunityEvent({ ...event, endsAt: event.startsAt, rewards: { ...event.rewards, distribution: { ...event.rewards.distribution, equalPercent: 20 } } }, event);
  assert.match(validateCommunityEvent(invalid).join(" "), /durée/);
  assert.match(validateCommunityEvent(invalid).join(" "), /100 %/);
});

test("les paliers et multiplicateurs supérieurs à 100 % survivent à la sauvegarde et se déclenchent une fois", () => {
  const { db, event, user, helpers } = fixture({
    objective: { max: 100, startValue: 100, minimum: 0, finishAtMinimum: false, continueAfterCompletion: true, milestones: [
      { id: "double", percent: 200, label: "Double objectif", effects: [{ type: "pot", value: 50 }] },
      { id: "extra", percent: 125, label: "Dépassement", effects: [{ type: "pot", value: 25 }] }
    ] },
    rewards: { participationReward: 5, tiers: [], communityMultiplierEnabled: true, communityMultipliers: [{ minPercent: 0, multiplier: 1 }, { minPercent: 200, multiplier: 2 }], distribution: { equalPercent: 100, proportionalPercent: 0, tierPercent: 0, rankingPercent: 0, rankingWeights: [] } }
  });
  Object.assign(event, normalizeCommunityEvent(JSON.parse(JSON.stringify(event)), event));
  assert.deepEqual(event.objective.milestones.map((row) => row.percent), [125, 200]);
  assert.equal(event.rewards.communityMultipliers[1].minPercent, 200);
  assert.deepEqual(validateCommunityEvent(event), []);
  Object.assign(event.game.dice, { count: 1, baseDamageMode: "count", baseDamageMultiplier: 125, faceEffects: {}, combinations: [] });
  const participant = joinCommunityEvent(db, event, user, helpers);
  const first = performCommunityEventAction(db, event, participant, helpers, "first");
  assert.deepEqual(first.result.milestones, ["Dépassement"]);
  const second = performCommunityEventAction(db, event, participant, helpers, "second");
  assert.deepEqual(second.result.milestones, ["Double objectif"]);
  performCommunityEventAction(db, event, participant, helpers, "second");
  assert.equal(event.runtime.pot, 83);
  const rewards = calculateCommunityEventRewards(db, event, helpers);
  assert.equal(rewards[0].detail.communityMultiplier, 2);
  assert.equal(rewards[0].amount, 93);
});

test("les événements existants reçoivent les nouveaux réglages sans migration manuelle", () => {
  const legacy = defaultCommunityEvent();
  delete legacy.game.critical;
  delete legacy.actions.allowOverflowPurchase;
  delete legacy.actions.overflowPriceMultiplier;
  delete legacy.actions.overflowExponentBase;
  delete legacy.theme.heroPositionX;
  delete legacy.theme.heroPositionY;
  delete legacy.theme.heroScale;
  const normalized = normalizeCommunityEvent(legacy, legacy);
  assert.equal(normalized.game.critical.enabled, false);
  assert.equal(normalized.game.critical.extraDraws, 1);
  assert.equal(normalized.actions.allowOverflowPurchase, true);
  assert.equal(normalized.actions.overflowPriceMultiplier, 10);
  assert.equal(normalized.theme.heroPositionX, 50);
  assert.equal(normalized.theme.heroPositionY, 50);
  assert.equal(normalized.theme.heroScale, 100);
});

test("participer, agir et acheter une action met à jour le joueur et le pot une seule fois", () => {
  const { db, event, user, helpers } = fixture();
  const participant = joinCommunityEvent(db, event, user, helpers, "join-1");
  assert.equal(user.tokens, 90);
  assert.equal(event.runtime.pot, 8);
  const first = performCommunityEventAction(db, event, participant, helpers, "action-1");
  const duplicate = performCommunityEventAction(db, event, participant, helpers, "action-1");
  assert.equal(duplicate.id, first.id);
  assert.equal(participant.actions, 1);
  purchaseCommunityEventActions(db, event, participant, 1, user, helpers, "purchase-1");
  assert.equal(user.tokens, 85);
  assert.equal(event.runtime.pot, 13);
  assert.equal(eventActionAvailability(event, participant, db).total, 2);
});

test("la progression dépasse 100 % uniquement lorsque les deux options le permettent", () => {
  for (const type of ["dice", "cards"]) {
    for (const finishAtMinimum of [false, true]) {
      for (const continueAfterCompletion of [false, true]) {
        const { db, event, user, helpers } = fixture();
        Object.assign(event.objective, { finishAtMinimum, continueAfterCompletion, milestones: [{ id: "completed", percent: 100, label: "Objectif atteint", effects: [] }] });
        event.game.type = type;
        Object.assign(event.game.dice, { count: 1, baseDamageMode: "count", baseDamageMultiplier: 125, faceEffects: {}, combinations: [] });
        Object.assign(event.game.cards, { cardsPerAction: 1, baseDamageMode: "count", baseDamageMultiplier: 125, useSuitEffects: false, useValueEffects: false, useSpecificEffects: false });
        const participant = joinCommunityEvent(db, event, user, helpers);
        const overflow = !finishAtMinimum && continueAfterCompletion;
        const first = performCommunityEventAction(db, event, participant, helpers, "first");
        assert.equal(first.result.damage, 125);
        assert.equal(first.result.currentValue, overflow ? -25 : 0);
        assert.equal(first.result.progress, overflow ? 125 : 100);
        assert.deepEqual(first.result.milestones, ["Objectif atteint"]);
        const second = performCommunityEventAction(db, event, participant, helpers, "second");
        assert.equal(second.result.progress, overflow ? 250 : 100);
        assert.equal(second.result.currentValue, overflow ? -150 : 0);
        assert.deepEqual(second.result.milestones, []);
        assert.equal(eventProgress(normalizeCommunityEvent(event, event)), overflow ? 250 : 100);
        performCommunityEventAction(db, event, participant, helpers, "second");
        assert.equal(eventProgress(event), overflow ? 250 : 100);
        assert.equal(participant.contribution, 250);
      }
    }
  }
});

test("le dépassement respecte un objectif dont le minimum est non nul", () => {
  const { db, event, user, helpers } = fixture();
  Object.assign(event.objective, { minimum: 20, finishAtMinimum: false, continueAfterCompletion: true });
  Object.assign(event.game.dice, { count: 1, baseDamageMode: "count", baseDamageMultiplier: 100, faceEffects: {}, combinations: [] });
  const participant = joinCommunityEvent(db, event, user, helpers);
  const action = performCommunityEventAction(db, event, participant, helpers);
  assert.equal(action.result.currentValue, 0);
  assert.equal(action.result.progress, 125);
});

test("les actions supplémentaires expirent avec la période configurée", () => {
  const { db, event, user, helpers } = fixture();
  event.actions.mode = "daily";
  const participant = joinCommunityEvent(db, event, user, helpers);
  participant.paidActionsAvailable = 4;
  participant.paidActionsPeriodKey = "daily:2026-01-01";
  const nextDay = eventActionAvailability(event, participant, db, new Date("2026-01-02T12:00:00.000Z"));
  assert.equal(nextDay.paid, 0);
  assert.equal(participant.paidActionsAvailable, 0);

  event.actions.mode = "total";
  participant.paidActionsAvailable = 3;
  participant.paidActionsPeriodKey = `event:${event.id}`;
  assert.equal(eventActionAvailability(event, participant, db, new Date("2026-01-03T12:00:00.000Z")).paid, 3);
});

test("la clôture distribue exactement le pot et reste idempotente", () => {
  const { db, event, user, helpers } = fixture();
  const participant = joinCommunityEvent(db, event, user, helpers);
  performCommunityEventAction(db, event, participant, helpers, "action-final");
  event.runtime.currentValue = event.objective.minimum;
  appendEventPotEntry(db, event, 92, "admin-test");
  const before = user.tokens;
  const rewards = calculateCommunityEventRewards(db, event, helpers);
  assert.equal(rewards.length, 1);
  assert.equal(rewards[0].amount, 105);
  assert.equal(user.tokens, before + 105);
  assert.equal(event.runtime.pot, 0);
  calculateCommunityEventRewards(db, event, helpers);
  assert.equal(user.tokens, before + 105);
  assert.equal(db.communityEventRewards.length, 1);
});

test("sous 100 %, seul le prix d'entrée est remboursé, sans bonus, objet ou part de pot", () => {
  for (const remainderRule of ["top", "equal", "disappear"]) {
    const { db, event, user, helpers } = fixture();
    event.pot.remainderRule = remainderRule;
    event.rewards.participationReward = 1000;
    event.rewards.tiers = [{ name: "Or", score: 0, fixed: 500, multiplier: 10, cosmeticId: "exclusive" }];
    helpers.grantCosmetic = () => assert.fail("Aucun objet ne doit être attribué après un échec");
    const participant = joinCommunityEvent(db, event, user, helpers);
    performCommunityEventAction(db, event, participant, helpers);
    purchaseCommunityEventActions(db, event, participant, 1, user, helpers);
    event.runtime.currentValue = 0.000001;
    appendEventPotEntry(db, event, 100000, "admin-test");
    const before = user.tokens;
    const preview = potentialCommunityEventReward(db, event, participant);
    assert.equal(preview.amount, 10);
    const rows = calculateCommunityEventRewards(db, event, helpers);
    assert.equal(rows[0].amount, 10);
    assert.equal(rows[0].detail.equalShare + rows[0].detail.proportionalShare + rows[0].detail.tierShare + rows[0].detail.rankingShare, 0);
    assert.equal(user.tokens, before + 10);
    assert.equal(user.tokens, 95, "les achats d'actions restent dépensés");
    assert.equal(db.transactions.at(-1).reason, "community-event-refund");
    assert.equal(event.runtime.pot, remainderRule === "disappear" ? 0 : event.runtime.finalPot - 10);
    assert.deepEqual(potentialCommunityEventReward(db, event, participant), rows[0]);
    calculateCommunityEventRewards(db, event, helpers);
    assert.equal(user.tokens, before + 10);
    assert.equal(db.communityEventRewards.length, 1);
  }
});

test("le remboursement couvre tous les inscrits au prix payé, même sans action et après modification du tarif", () => {
  const { db, event, user, helpers } = fixture();
  const first = joinCommunityEvent(db, event, user, helpers);
  delete first.entryCostPaid;
  event.participation.entryCost = 30;
  const secondUser = { id: "u2", tokens: 100 };
  db.users.push(secondUser);
  joinCommunityEvent(db, event, secondUser, helpers);
  event.participation.entryCost = 0;
  const freeUser = { id: "u3", tokens: 100 };
  db.users.push(freeUser);
  joinCommunityEvent(db, event, freeUser, helpers);
  event.participation.entryCost = 500;
  event.limits.minimumContribution = 1000;
  const rows = calculateCommunityEventRewards(db, event, helpers);
  assert.deepEqual(rows.map((row) => row.amount), [10, 30, 0]);
  assert.deepEqual(db.users.map((row) => row.tokens), [100, 100, 100]);
  assert.equal(event.runtime.pot, 0);
});

test("un pot non gagné peut être reporté, mais jamais versé au premier", () => {
  const { db, event, user, helpers } = fixture();
  joinCommunityEvent(db, event, user, helpers);
  appendEventPotEntry(db, event, 1000, "admin-test");
  const next = defaultCommunityEvent();
  db.communityEvents.push(next);
  event.pot.remainderRule = "rollover";
  event.pot.rolloverTargetEventId = next.id;
  const rows = calculateCommunityEventRewards(db, event, helpers);
  assert.equal(rows[0].amount, 10);
  assert.equal(next.runtime.pot, 998);
  assert.equal(event.runtime.pot, 0);
  calculateCommunityEventRewards(db, event, helpers);
  assert.equal(next.runtime.pot, 998);
});

test("le seuil de réussite respecte un minimum non nul", () => {
  for (const currentValue of [21, 20, 19]) {
    const { db, event, user, helpers } = fixture();
    event.objective.minimum = 20;
    const participant = joinCommunityEvent(db, event, user, helpers);
    participant.actions = 1;
    participant.contribution = 1;
    event.runtime.currentValue = currentValue;
    appendEventPotEntry(db, event, 92, "admin-test");
    assert.equal(calculateCommunityEventRewards(db, event, helpers)[0].amount, currentValue > 20 ? 10 : 105);
  }
});

test("les paliers individuels dépendent uniquement de la contribution personnelle", () => {
  const { event } = fixture({
    rewards: {
      ...defaultCommunityEvent().rewards,
      tiers: [
        { id: "bronze", name: "Bronze", score: 100, fixed: 10, multiplier: 1 },
        { id: "or", name: "Or", score: 500, fixed: 50, multiplier: 1.2 }
      ]
    }
  });
  event.runtime.contribution = 100000;
  assert.equal(individualEventTier(event, { contribution: 99 }), null);
  assert.equal(individualEventTier(event, { contribution: 100 })?.name, "Bronze");
  assert.equal(individualEventTier(event, { contribution: 650 })?.name, "Or");
});

test("le moteur cartes utilise le même pipeline d’effets que les dés", () => {
  const { db, event, user, helpers } = fixture({ game: { type: "cards", cards: { ...defaultCommunityEvent().game.cards, cardsPerAction: 3, replaceAfterDraw: false, deckMode: "personal", suitEffects: Object.fromEntries(["hearts", "diamonds", "clubs", "spades"].map((suit) => [suit, [{ type: "damageBonus", value: 4, target: "objective", stat: "damage", duration: 0, durationUnit: "minutes", label: "Impact" }]])) } } });
  const participant = joinCommunityEvent(db, event, user, helpers);
  const action = performCommunityEventAction(db, event, participant, helpers, "cards-1");
  assert.equal(action.result.cards.length, 3);
  assert.equal(action.result.itemScores.length, 3);
  assert.equal(action.result.itemScores.reduce((sum, value) => sum + value, 0), action.result.baseDamage);
  assert.equal(action.result.itemEffectiveScores.length, 3);
  assert.equal(action.result.itemEffectiveScores.reduce((sum, value) => sum + value.damage, 0), action.result.damage);
  assert.equal(action.result.itemEffectiveScores.reduce((sum, value) => sum + value.contribution, 0), action.result.contribution);
  assert.ok(action.result.damage >= 12);
  assert.equal(participant.cardsDrawn, 3);
  assert.equal(participant.diceRolls, 0);
});

test("un effet communautaire persiste et peut réduire le prix d’une action", () => {
  const { db, event, user, helpers } = fixture();
  const second = { id: "u2", pseudo: "Bob", tokens: 100 };
  db.users.push(second);
  const firstParticipant = joinCommunityEvent(db, event, user, helpers);
  const secondParticipant = joinCommunityEvent(db, event, second, helpers);
  event.game.dice.count = 1;
  event.game.dice.faceEffects = Object.fromEntries(Array.from({ length: event.game.dice.faces }, (_, index) => [String(index + 1), [
    { id: `all-${index}`, type: "extraAction", value: 1, target: "community", stat: "damage", duration: 0, durationUnit: "minutes", label: "Action pour tous" },
    { id: `price-${index}`, type: "temporaryBonus", value: .5, target: "community", stat: "actionPrice", duration: 1, durationUnit: "hours", label: "Prix réduit" }
  ]]));
  performCommunityEventAction(db, event, firstParticipant, helpers, "community-effect");
  assert.equal(secondParticipant.paidActionsAvailable, 1);
  assert.equal(eventActionPurchasePrice(event, secondParticipant), Math.round(event.actions.purchasePrice / 2));
  assert.ok(db.communityEventEffects.some((effect) => effect.eventId === event.id && effect.userId === null));
});

test("un effet temporaire conserve le palier qui l’a déclenché", () => {
  const { db, event, user, helpers } = fixture({
    objective: {
      ...defaultCommunityEvent().objective,
      max: 100,
      startValue: 100,
      minimum: 0,
      milestones: [{
        id: "coffre-ouvert",
        percent: 1,
        label: "La salle des coffres est ouverte",
        effects: [{ id: "bonus-coffre", type: "temporaryBonus", value: .5, target: "community", stat: "damage", duration: 1, durationUnit: "hours", label: "Puissance du coffre" }]
      }]
    }
  });
  const participant = joinCommunityEvent(db, event, user, helpers);
  performCommunityEventAction(db, event, participant, helpers, "milestone-timer");
  const activeEffect = event.runtime.activeEffects.find((effect) => effect.sourceEffectId === "bonus-coffre");
  assert.equal(activeEffect?.milestoneId, "coffre-ouvert");
  assert.equal(normalizeCommunityEvent(event, event).runtime.activeEffects[0].milestoneId, "coffre-ouvert");
});

test("un achat groupé franchit le quota normal avec une tarification exponentielle", () => {
  const { db, event, user, helpers } = fixture();
  user.tokens = 1000;
  const participant = joinCommunityEvent(db, event, user, helpers);
  const quote = quoteCommunityEventActions(event, participant, 5);
  assert.deepEqual(quote.unitPrices, [5, 5, 5, 50, 63]);
  assert.equal(quote.normalCount, 3);
  assert.equal(quote.overflowCount, 2);
  assert.equal(quote.total, 128);
  purchaseCommunityEventActions(db, event, participant, 5, user, helpers, "batch-1");
  assert.equal(participant.paidActionsAvailable, 5);
  assert.equal(participant.overflowPurchasesTotal, 2);
  assert.equal(user.tokens, 862);
  assert.equal(quoteCommunityEventActions(event, participant, 1).total, 78);
});

test("une action critique ajoute des dés ou des cartes selon le moteur actif", () => {
  const diceFixture = fixture({ game: { ...defaultCommunityEvent().game, type: "dice", critical: { enabled: true, chancePercent: 100, extraDraws: 2, damageMultiplier: 1, contributionBonus: 7, label: "Critique garanti", effects: [] } } });
  const diceParticipant = joinCommunityEvent(diceFixture.db, diceFixture.event, diceFixture.user, diceFixture.helpers);
  const diceAction = performCommunityEventAction(diceFixture.db, diceFixture.event, diceParticipant, diceFixture.helpers, "critical-dice");
  assert.equal(diceAction.result.critical, true);
  assert.equal(diceAction.result.dice.length, diceFixture.event.game.dice.count + 2);
  assert.equal(diceAction.result.itemScores.length, diceAction.result.dice.length);
  assert.equal(diceAction.result.itemEffectiveScores.reduce((sum, value) => sum + value.damage, 0), diceAction.result.damage);
  assert.equal(diceAction.result.itemEffectiveScores.reduce((sum, value) => sum + value.contribution, 0), diceAction.result.contribution);
  assert.ok(diceAction.result.triggered.includes("Critique garanti"));
  assert.ok(diceAction.result.contributionBonus >= 7);

  const cardFixture = fixture({ game: { ...defaultCommunityEvent().game, type: "cards", critical: { enabled: true, chancePercent: 100, extraDraws: 2, damageMultiplier: 1, contributionBonus: 0, label: "Pioche critique", effects: [] } } });
  const cardParticipant = joinCommunityEvent(cardFixture.db, cardFixture.event, cardFixture.user, cardFixture.helpers);
  const cardAction = performCommunityEventAction(cardFixture.db, cardFixture.event, cardParticipant, cardFixture.helpers, "critical-cards");
  assert.equal(cardAction.result.cards.length, cardFixture.event.game.cards.cardsPerAction + 2);
  assert.equal(cardAction.result.itemScores.length, cardAction.result.cards.length);
  assert.equal(cardAction.result.itemEffectiveScores.reduce((sum, value) => sum + value.damage, 0), cardAction.result.damage);
  assert.equal(cardAction.result.itemEffectiveScores.reduce((sum, value) => sum + value.contribution, 0), cardAction.result.contribution);
});
