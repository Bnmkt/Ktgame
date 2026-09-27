import assert from "node:assert/strict";
import test from "node:test";
import { cardsCombinationMatches, valuesMatch } from "../src/services/event-combinations.js";
import { defaultCommunityEvent, normalizeCommunityEvent, validateCommunityEvent, joinCommunityEvent, performCommunityEventAction } from "../src/services/community-events.js";

const card = (rank, suit = "any") => ({ rank, suit });
const combo = (type, values, name = "Prime") => ({ id: name, name, condition: { type, [type.endsWith("Cards") ? "cards" : "values"]: values }, effects: [{ type: "tokens", value: 17 }] });

test("contains dice values respects duplicates, ignores order, and rejects empty patterns", () => {
  assert.ok(valuesMatch([4, 2, 1], [6, 1, 3, 4, 2, 5]));
  assert.ok(!valuesMatch([4, 2, 1], [6, 1, 3, 4, 2, 5], true));
  assert.ok(valuesMatch([4, 2, 1], [1, 4, 2], true));
  assert.ok(!valuesMatch([4, 4, 1], [4, 2, 1]));
  assert.ok(valuesMatch([4, 4, 1], [4, 4, 1, 6]));
  assert.ok(!valuesMatch([], [1, 2, 3]));
});

test("card combinations reserve specific suits before unrestricted ranks", () => {
  const condition = { type: "containsCards", cards: [card("A"), card("A", "hearts")] };
  assert.ok(cardsCombinationMatches(condition, [card("A", "hearts"), card("A", "spades"), card("K", "clubs")]));
  assert.ok(!cardsCombinationMatches(condition, [card("A", "hearts"), card("K", "spades")]));
  assert.ok(!cardsCombinationMatches(condition, [card("A", "spades"), card("A", "clubs")]));
  assert.ok(!cardsCombinationMatches({ ...condition, type: "exactCards" }, [card("A", "hearts"), card("A", "spades"), card("K", "clubs")]));
  assert.ok(cardsCombinationMatches({ ...condition, type: "exactCards" }, [card("A", "spades"), card("A", "hearts")]));
  assert.ok(!cardsCombinationMatches({ type: "containsCards", cards: [] }, []));
  assert.ok(cardsCombinationMatches({ type: "containsCards", cards: [card("JOKER")] }, [card("JOKER", "joker")]));
  assert.ok(!cardsCombinationMatches({ type: "containsCards", cards: [card("A")] }, [card("JOKER", "joker")]));
});

test("normalization preserves legacy exact patterns and card combinations across saves", () => {
  const original = normalizeCommunityEvent({ game: { dice: { combinations: [combo("customValues", [4, 2, 1]), combo("containsValues", [4, 4])] }, cards: { combinations: [combo("containsCards", [card("A"), card("K", "hearts")])] } } });
  const restored = normalizeCommunityEvent(JSON.parse(JSON.stringify(original)));
  assert.deepEqual(restored.game, original.game);
  const legacy = defaultCommunityEvent(); delete legacy.game.cards.combinations;
  assert.deepEqual(normalizeCommunityEvent({}, legacy).game.cards.combinations, []);
});

test("validation rejects empty, out-of-range, impossible-length and impossible-deck conditions", () => {
  const dice = normalizeCommunityEvent({ game: { dice: { count: 6, combinations: [combo("customValues", [4, 2, 1]), combo("containsValues", []), combo("containsValues", [7, 1.5])] } } });
  assert.equal(validateCommunityEvent(dice).length, 3);
  dice.game.dice.combinations = [combo("containsValues", [4, 2, 1])];
  assert.deepEqual(validateCommunityEvent(dice), []);
  const cards = normalizeCommunityEvent({ game: { type: "cards", cards: { combinations: [combo("containsCards", [card("A", "hearts"), card("A", "hearts")])] } } });
  assert.match(validateCommunityEvent(cards).join(" "), /exemplaires/);
  cards.game.cards.decks = 2;
  assert.deepEqual(validateCommunityEvent(cards), []);
  cards.game.cards.combinations = [combo("containsCards", [card("JOKER", "joker")])];
  assert.match(validateCommunityEvent(cards).join(" "), /jokers/);
  cards.game.cards.jokers = true;
  assert.deepEqual(validateCommunityEvent(cards), []);
});

test("exact conditions can target critical draws of up to 40 dice", () => {
  const event = normalizeCommunityEvent({ game: { critical: { enabled: true, chancePercent: 100, extraDraws: 20 }, dice: { count: 20, combinations: [combo("customValues", Array(40).fill(1))] } } });
  assert.equal(event.game.dice.combinations[0].condition.values.length, 40);
  assert.deepEqual(validateCommunityEvent(event), []);
  event.game.critical.chancePercent = 0;
  assert.match(validateCommunityEvent(event).join(" "), /aucun tirage/);
});

function fixture(game) {
  const event = normalizeCommunityEvent({ status: "active", game });
  const user = { id: "test", pseudo: "Test", tokens: 1000 };
  const db = { users: [user], communityEvents: [event], communityEventParticipants: [], communityEventActions: [], communityEventPotEntries: [], communityEventRewards: [] };
  const helpers = { addTokens(_db, _id, value) { user.tokens += value; } };
  const participant = joinCommunityEvent(db, event, user, helpers, "join");
  return { event, user, db, helpers, participant };
}

test("a 421 among six dice pays the combination once and does not trigger an exact 421", (t) => {
  const f = fixture({ dice: { count: 6, faceEffects: {}, combinations: [combo("containsValues", [4, 2, 1], "421 inclus"), combo("customValues", [4, 2, 1], "421 exact")] } });
  const sequence = [4, 2, 1, 4, 2, 1]; let cursor = 0;
  t.mock.method(Math, "random", () => (sequence[cursor++ % sequence.length] - 0.5) / 6);
  const before = f.user.tokens;
  const action = performCommunityEventAction(f.db, f.event, f.participant, f.helpers, "action");
  assert.deepEqual(action.result.combinations, ["421 inclus"]);
  assert.equal(f.user.tokens - before, 17);
});

test("card combinations stack with per-card effects and are logged in results", () => {
  const f = fixture({ type: "cards", cards: { cardsPerAction: 3, replaceAfterDraw: false, suitEffects: { hearts: [{ type: "tokens", value: 3 }] }, combinations: [combo("containsCards", [card("A"), card("K", "hearts")], "Duo"), combo("exactCards", [card("A"), card("K", "hearts")], "Exact")] } });
  f.participant.deck = [card("K", "hearts"), card("2", "clubs"), card("A", "spades")];
  const before = f.user.tokens;
  const action = performCommunityEventAction(f.db, f.event, f.participant, f.helpers, "action");
  assert.deepEqual(action.result.combinations, ["Duo"]);
  assert.equal(f.user.tokens - before, 20);
});
