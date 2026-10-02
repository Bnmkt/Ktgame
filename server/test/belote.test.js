import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, createGameState } from "../src/games/engines.js";
import { applyBeloteAction, beloteAnnouncements, beloteBotAction, beloteLegalCards, createBeloteState, publicBeloteState, replaceBelotePlayer, scoreBeloteDeal } from "../src/games/engines/belote.js";
import { beloteCardPoints, strongestPlay } from "../src/games/vendor/belote-cards.js";
import { createDeck } from "../src/games/shared.js";

const players = Array.from({ length: 4 }, (_, index) => ({ id: `p${index}`, pseudo: `Player ${index}`, isBot: index > 0 }));
const card = (rank, suit = "S") => ({ rank, suit });
const play = (id, rank, suit = "S") => ({ playerId: id, card: card(rank, suit) });
function take(state, suit = state.turnedCard.suit) { return applyBeloteAction(state, state.players[state.currentPlayerIndex].id, { type: "take", suit }); }
function allPass(state) { for (let i = 0; i < 8; i++) applyBeloteAction(state, state.players[state.currentPlayerIndex].id, { type: "pass" }); }
function scenario(hand, trick, frenchRules = false) {
  const state = createBeloteState(players, { gameModifiers: { frenchRules } });
  take(state); state.trump = "S"; state.currentPlayerIndex = 0; state.hands.p0 = hand; state.trick = trick; return state;
}

test("belote integrates into dispatch and requires exactly four seats", () => {
  assert.throws(() => createGameState("belote", players.slice(0, 3)));
  const state = createGameState("belote", players);
  assert.equal(state.modifiers.frenchRules, false);
  assert.equal(state.targetScore, 101);
  assert.deepEqual(Object.values(state.hands).map((hand) => hand.length), [5, 5, 5, 5]);
  applyAction(state, "p0", { type: "take", suit: state.turnedCard.suit });
  const cards = Object.values(state.hands).flat();
  assert.equal(cards.length, 32);
  assert.equal(new Set(cards.map((entry) => `${entry.suit}${entry.rank}`)).size, 32);
  assert.equal(state.deck.length, 0);
});

test("belote enforces two bidding rounds and Belgian forced take", () => {
  const state = createBeloteState(players);
  const otherSuit = ["S", "H", "D", "C"].find((suit) => suit !== state.turnedCard.suit);
  assert.throws(() => take(state, otherSuit));
  for (let i = 0; i < 4; i++) applyBeloteAction(state, players[state.currentPlayerIndex].id, { type: "pass" });
  assert.equal(state.bidRound, 2);
  assert.throws(() => take(state));
  for (let i = 0; i < 4; i++) applyBeloteAction(state, players[state.currentPlayerIndex].id, { type: "pass" });
  assert.equal(state.phase, "forced-bid");
  assert.deepEqual(Object.values(state.hands).map((hand) => hand.length), [8, 8, 8, 8]);
  assert.throws(() => applyBeloteAction(state, "p0", { type: "pass" }));
  take(state, otherSuit);
  assert.equal(state.trump, otherSuit);
});

test("French mode redeals after eight passes without changing scores", () => {
  const state = createBeloteState(players, { gameModifiers: { frenchRules: true } });
  allPass(state);
  assert.equal(state.phase, "bid"); assert.equal(state.round, 2);
  assert.equal(state.currentPlayerIndex, 1); assert.equal(state.targetScore, 1010);
  assert.deepEqual(state.teamScores, [0, 0]);
});

test("trick strength and the 152 points in the deck are correct", () => {
  const cards = createDeck().filter((entry) => ["7", "8", "9", "10", "J", "Q", "K", "A"].includes(entry.rank));
  assert.equal(cards.reduce((sum, entry) => sum + beloteCardPoints(entry, "S"), 0), 152);
  assert.equal(strongestPlay([play("p0", "A", "H"), play("p1", "7"), play("p2", "9"), play("p3", "J")], "S").playerId, "p3");
  assert.equal(strongestPlay([play("p0", "K", "H"), play("p1", "A", "D")], "S").playerId, "p0");
});

test("must follow suit without a non-trump obligation to rise", () => {
  const state = scenario([card("7", "H"), card("A", "H"), card("J")], [play("p1", "10", "H")]);
  assert.deepEqual(beloteLegalCards(state, "p0"), [card("7", "H"), card("A", "H")]);
});

test("a player does not have to overtrump a winning partner", () => {
  const state = scenario([card("7"), card("J"), card("A", "H")], [play("p2", "9")]);
  assert.deepEqual(beloteLegalCards(state, "p0"), [card("7"), card("J")]);
  state.trick = [play("p1", "9")];
  assert.deepEqual(beloteLegalCards(state, "p0"), [card("J")]);
});

test("must cut, overcut, or undercut an opponent", () => {
  const state = scenario([card("7"), card("J"), card("A", "D")], [play("p3", "A", "H"), play("p1", "9")]);
  assert.deepEqual(beloteLegalCards(state, "p0"), [card("J")]);
  state.hands.p0 = [card("7"), card("A", "D")];
  assert.deepEqual(beloteLegalCards(state, "p0"), [card("7")]);
  state.trick = [play("p1", "A", "H")];
  assert.deepEqual(beloteLegalCards(state, "p0"), [card("7")]);
});

test("partner master permits discarding or undertrumping in both rule sets", () => {
  const hand = [card("7"), card("A", "D")];
  const state = scenario(hand, [play("p2", "A", "H")]);
  assert.deepEqual(beloteLegalCards(state, "p0"), hand);
  state.trick = [play("p1", "7", "H"), play("p2", "J")];
  assert.deepEqual(beloteLegalCards(state, "p0"), hand);
  state.modifiers.frenchRules = true;
  assert.deepEqual(beloteLegalCards(state, "p0"), hand);
  state.trick[1] = play("p2", "9"); state.hands.p0.push(card("J"));
  assert.deepEqual(beloteLegalCards(state, "p0"), [card("7"), card("A", "D"), card("J")]);
});

test("invalid actions neither consume a card nor alter the turn", () => {
  const state = scenario([card("7", "H"), card("J")], [play("p1", "A", "H")]);
  const before = structuredClone(state);
  assert.throws(() => applyBeloteAction(state, "p0", { type: "play", card: card("J") }));
  assert.throws(() => applyBeloteAction(state, "p1", { type: "play", card: card("7", "H") }));
  assert.throws(() => applyBeloteAction(state, "p0", { type: "pass" }));
  assert.deepEqual(state, before);
});

test("announcements include squares and disjoint runs, not duplicated cards", () => {
  const square = ["S", "H", "D", "C"].map((suit) => card("J", suit));
  assert.equal(beloteAnnouncements(square, "H")[0].points, 200);
  const hand = [card("7"), card("8"), card("9"), card("10"), card("J"), card("Q"), card("K"), card("A")];
  const announcements = beloteAnnouncements(hand, "S");
  assert.equal(announcements.reduce((sum, entry) => sum + entry.points, 0), 120);
  const used = announcements.flatMap((entry) => entry.cards);
  assert.equal(new Set(used.map((entry) => `${entry.rank}${entry.suit}`)).size, used.length);
});

test("public payload hides deck, opponents' hands, and unrevealed announcements", () => {
  const state = createBeloteState(players);
  const beforeTake = publicBeloteState(state, "p0");
  assert.ok(beforeTake.deck.every((entry) => entry === null));
  take(state); state.announcements.p1 = [{ label: "Tierce", cards: [card("7")] }];
  state.beloteHolders.p1 = { first: null };
  const view = publicBeloteState(state, "p0");
  assert.ok(view.hands.p1.every((entry) => entry === null));
  assert.equal(view.hands.p0.length, 8); assert.equal(view.beloteHolders, undefined);
  assert.deepEqual(view.announcements.p1, []);
  assert.equal(publicBeloteState(state, "spectator").legalCards.length, 0);
  assert.equal(state.announcements.p1.length, 1);
});

test("Belgian belote requires king first; French accepts either order", () => {
  for (const french of [false, true]) for (const first of ["K", "Q"]) {
    const state = scenario([card(first), card(first === "K" ? "Q" : "K")], [], french);
    state.trickNumber = 2; state.beloteHolders = { p0: { first: null } };
    applyBeloteAction(state, "p0", { type: "play", card: card(first) });
    state.trick = []; state.currentPlayerIndex = 0;
    applyBeloteAction(state, "p0", { type: "play", card: state.hands.p0[0] });
    assert.equal(state.belotePoints[0], french || first === "K" ? 20 : 0);
  }
});

function scoring(points, overrides = {}, frenchRules = false) {
  const state = createBeloteState(players, { gameModifiers: { frenchRules } }); take(state);
  Object.assign(state, { cardPoints: points, trickCounts: [4, 4], announcementPoints: [0, 0], belotePoints: [0, 0] }, overrides);
  scoreBeloteDeal(state); return state;
}
test("Belgian rounding, chute, inviolable belote, capot and litige", () => {
  assert.deepEqual(scoring([127, 35]).teamScores, [13, 3]);
  assert.deepEqual(scoring([126, 36]).teamScores, [12, 4]);
  assert.deepEqual(scoring([60, 102], { belotePoints: [20, 0] }).teamScores, [2, 16]);
  assert.deepEqual(scoring([252, 0], { trickCounts: [8, 0], announcementPoints: [50, 0] }).teamScores, [30, 0]);
  const tie = scoring([81, 81]);
  assert.equal(tie.pendingPoints, 8); assert.deepEqual(tie.teamScores, [0, 8]);
  tie.cardPoints = [100, 62]; scoreBeloteDeal(tie);
  assert.deepEqual(tie.teamScores, [18, 14]); assert.equal(tie.pendingPoints, 0);
});

test("French raw scoring, ties, threshold and team winners", () => {
  assert.deepEqual(scoring([127, 35], {}, true).teamScores, [127, 35]);
  const tie = scoring([81, 81], {}, true); assert.equal(tie.pendingPoints, 81);
  const winner = scoring([100, 62], { teamScores: [95, 90] });
  assert.equal(winner.finished, true); assert.deepEqual(winner.winners, ["p0", "p2"]);
  const both = scoring([100, 62], { teamScores: [95, 99] });
  assert.equal(both.finished, false);
});

test("departures preserve hands, seats, teams, contract, and trick ownership", () => {
  const state = createBeloteState(players); take(state);
  applyBeloteAction(state, "p0", { type: "play", card: state.hands.p0[0] });
  const replacement = { id: "replacement", pseudo: "AI", isBot: true };
  replaceBelotePlayer(state, "p0", replacement);
  assert.equal(state.players[0].id, "replacement"); assert.equal(state.takerId, "replacement");
  assert.equal(state.hands.replacement.length, 7); assert.equal(state.trick[0].playerId, "replacement");
  assert.equal(state.hands.p0, undefined);
});

test("100 full Belgian/French AI simulations always terminate with 32 played cards per deal", () => {
  for (let run = 0; run < 100; run++) {
    const state = createBeloteState(players, { gameModifiers: { frenchRules: run % 2 === 0, announcements: run % 3 !== 0 } });
    let actions = 0;
    while (!state.finished && actions++ < 10000) {
      const actor = state.players[state.currentPlayerIndex];
      const action = beloteBotAction(state, actor);
      assert.ok(action, `${state.phase}: no available action`);
      applyBeloteAction(state, actor.id, action);
      if (state.phase === "round-end" || state.finished) {
        assert.equal(Object.values(state.hands).flat().length, 0);
        assert.equal(state.trickCounts[0] + state.trickCounts[1], 8);
        assert.equal(state.cardPoints[0] + state.cardPoints[1], state.trickCounts.includes(8) ? 252 : 162);
      }
    }
    assert.equal(state.finished, true, `run ${run} stalled`);
    assert.equal(state.winners.length, 2);
  }
});
