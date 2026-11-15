import assert from "node:assert/strict";
import test from "node:test";
import { compareMidnightPlayers, midnightRankingVector, midnightRoundHistory, midnightRoundWinners, midnightVictoryModes } from "../../client/src/features/games/midnightDice/results.js";
import { classicResults } from "../../client/src/features/games/classic-completion.js";
import { createMidnightDiceState, midnightDiceBotAction, applyMidnightDiceAction } from "../src/games/engines/midnight-dice.js";
import { competitivePositions } from "../src/services/ranked.js";
import { spectatorState } from "../src/games/spectator-state.js";

const players = ["a", "b", "c"].map(id => ({ id, pseudo: id.toUpperCase() }));
const row = (playerId, points, options = {}) => ({ playerId, points, base: points, bonus: 0, achieved: false, tier: "bronze", contract: "spectrum", dice: [1, 2, 3], ...options });
function fixture(victory, left, right, extras = {}) {
  const rounds = Array.from({ length: Math.max(left.length, right.length) }, (_, i) => ({ round: i + 1, results: [typeof left[i] === "number" ? row("a", left[i]) : { ...left[i], playerId: "a" }, typeof right[i] === "number" ? row("b", right[i]) : { ...right[i], playerId: "b" }] }));
  return { gameId: "midnight-dice", players: players.slice(0, 2), resolvedOptions: { victory }, roundHistory: rounds, lastRound: rounds.at(-1), scores: Object.fromEntries(["a", "b"].map(id => [id, rounds.reduce((sum, round) => sum + round.results.find(result => result.playerId === id).points, 0)])), stats: {}, ...extras };
}

test("Score total adds dice points and mandate bonuses over every round", () => {
  const state = fixture("highest", [row("a", 35, { base: 5, bonus: 30, achieved: true }), 10], [40, 4]);
  assert.equal(compareMidnightPlayers(state, "a", "b"), 1);
  assert.equal(midnightRankingVector(state, "a")[0], 45);
});
test("Champion des manches counts every shared first place without using total score as a tiebreak", () => {
  const state = fixture("rounds", [50, 50, 0], [0, 0, 118]);
  assert.equal(compareMidnightPlayers(state, "a", "b"), 1);
  assert.deepEqual(midnightRankingVector(state, "a"), [2]);
  const tied = fixture("rounds", [50, 0, 10], [50, 60, 0]);
  assert.deepEqual(midnightRoundWinners(tied.roundHistory[0]), ["a", "b"]);
  assert.equal(compareMidnightPlayers(tied, "a", "b"), 0);
});
test("Chasseur de prestige compares all five successful tiers lexicographically and ignores failures", () => {
  const success = tier => row("a", 20, { tier, achieved: true, bonus: 18 });
  const state = fixture("prestige", [success("diamond"), 100], [success("platinum"), success("platinum")]);
  assert.equal(compareMidnightPlayers(state, "a", "b"), 1);
  const tiers = ["diamond", "platinum", "gold", "silver", "bronze"];
  for (let i = 0; i < tiers.length; i++) {
    const prefix = tiers.slice(0, i).map(success);
    const next = fixture("prestige", [...prefix, success(tiers[i])], [...prefix, row("b", 118, { tier: tiers[i], achieved: false, bonus: 0 })]);
    assert.equal(compareMidnightPlayers(next, "a", "b"), 1, tiers[i]);
  }
  assert.equal(compareMidnightPlayers(fixture("prestige", [success("gold"), 100], [success("gold"), 0]), "a", "b"), 0);
});
test("Régularité compares the worst round, then every following worst round without precision loss", () => {
  assert.equal(compareMidnightPlayers(fixture("consistency", [35, 40, 42, 47], [30, 55, 60, 70]), "a", "b"), 1);
  assert.equal(compareMidnightPlayers(fixture("consistency", [35, 40, 42, 47], [35, 39, 60, 70]), "a", "b"), 1);
  assert.equal(compareMidnightPlayers(fixture("consistency", [20, 30, 40], [40, 20, 30]), "a", "b"), 0);
  const prefix = [110, 111, 112, 113, 114, 115, 116];
  assert.equal(compareMidnightPlayers(fixture("consistency", [...prefix, 118], [...prefix, 117]), "a", "b"), 1);
});
test("Record de Minuit ignores all other performances, including in an exact tie", () => {
  assert.equal(compareMidnightPlayers(fixture("record", [100, 0, 0], [90, 90, 90]), "a", "b"), 1);
  assert.equal(compareMidnightPlayers(fixture("record", [100, 0, 0], [100, 99, 99]), "a", "b"), 0);
});
test("Chasseur de primes ignores dice values and only sums bonuses of successful mandates", () => {
  const paid = row("b", 21, { base: 3, achieved: true, bonus: 18 });
  const state = fixture("bounties", [18, 18, 18], [paid, 3, 3]);
  assert.equal(compareMidnightPlayers(state, "a", "b"), -1);
  assert.deepEqual(midnightRankingVector(state, "b"), [18]);
  assert.equal(compareMidnightPlayers(fixture("bounties", [paid, 100], [paid, 0]), "a", "b"), 0);
});
test("ranked positions and the classic recap use the full comparator and retain forfeits", () => {
  for (const state of [fixture("consistency", [35, 40], [35, 39]), fixture("prestige", [row("a", 21, { achieved: true, tier: "gold" })], [row("b", 30, { achieved: true, tier: "silver" })]), fixture("record", [100, 0], [100, 99])]) {
    state.finished = true;
    state.winners = state.players.filter(player => compareMidnightPlayers(state, player.id, "a") >= 0).map(player => player.id);
    state.ranking = [...state.players].sort((a, b) => compareMidnightPlayers(state, b.id, a.id)).map(player => ({ ...player, score: state.scores[player.id] }));
    const ranked = { gameId: "midnight-dice", state, ranked: { roster: state.players, forfeits: {} } };
    const positions = competitivePositions(ranked);
    assert.equal(positions.find(row => row.id === "a").position, 1);
    assert.equal(positions.find(row => row.id === "b").position, compareMidnightPlayers(state, "a", "b") === 0 ? 1 : 2);
    const recap = classicResults({ gameId: "midnight-dice", state, players: state.players });
    assert.equal(recap[0].score, state.scores[recap[0].id], "visible points never become an encoded ranking weight");
    assert.equal(recap[1].rank, positions.find(row => row.id === recap[1].id).position);
    ranked.ranked.forfeits.a = true;
    assert.equal(competitivePositions(ranked).find(row => row.id === "a").position, 2);
  }
});

test("the engine keeps every completed round across snapshots and evaluates all six final conditions", () => {
  for (const victory of midnightVictoryModes) {
    let state = createMidnightDiceState(players, { gameModifiers: { victory, rounds: 3, firstPlayer: "first-seat" } });
    let previous = "", previousCount = 0;
    while (!state.finished) {
      const player = state.players[state.currentPlayerIndex];
      applyMidnightDiceAction(state, player.id, state.phase === "contract" ? midnightDiceBotAction(state, player) : { type: "draft", index: 0 });
      if (state.roundHistory.length !== previousCount) {
        assert.equal(JSON.stringify(state.roundHistory.slice(0, previousCount)), previous || "[]");
        previousCount = state.roundHistory.length; previous = JSON.stringify(state.roundHistory);
        state = JSON.parse(JSON.stringify(state));
      }
    }
    assert.equal(state.roundHistory.length, 3);
    assert.deepEqual(midnightRoundHistory(state).map(round => round.round), [1, 2, 3]);
    const leader = state.players.reduce((a, b) => compareMidnightPlayers(state, a.id, b.id) >= 0 ? a : b);
    assert.deepEqual(state.winners, state.players.filter(player => compareMidnightPlayers(state, player.id, leader.id) === 0).map(player => player.id));
    const publicState = spectatorState(state);
    assert.deepEqual(publicState.roundHistory, state.roundHistory); assert.equal(publicState.contractDrawPiles, undefined);
  }
});
test("the previous known round is retained when an old saved game first acquires a history", () => {
  const state = createMidnightDiceState(players.slice(0, 2), { gameModifiers: { firstPlayer: "first-seat" } });
  state.round = 2; state.lastRound = { round: 1, results: [row("a", 25), row("b", 18)] }; delete state.roundHistory;
  while (state.round === 2) { const player = state.players[state.currentPlayerIndex]; applyMidnightDiceAction(state, player.id, state.phase === "contract" ? midnightDiceBotAction(state, player) : { type: "draft", index: 0 }); }
  assert.deepEqual(state.roundHistory.map(round => round.round), [1, 2]);
});
