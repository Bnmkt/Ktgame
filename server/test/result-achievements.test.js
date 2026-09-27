import test from "node:test";
import assert from "node:assert/strict";
import {
  completedMidnightContractCount,
  gameResultAchievementIds,
  midnightContractResultId
} from "../src/services/result-achievements.js";
import { MIDNIGHT_CONTRACTS } from "../src/games/engines/midnight-dice.js";

test("les résultats Yahtzee distinguent les seuils, les ratures et la carte pleine", () => {
  const strongScores = {
    "upper-1": 3,
    "upper-2": 6,
    "upper-3": 9,
    "upper-4": 12,
    "upper-5": 15,
    "upper-6": 18,
    "three-kind": 25,
    "four-kind": 25,
    "full-house": 25,
    "small-straight": 30,
    "large-straight": 40,
    yahtzee: 50,
    chance: 30
  };
  const strong = gameResultAchievementIds({ gameId: "yahtzee", scores: { p1: strongScores } }, "p1");
  assert.ok(strong.includes("yahtzee-score-250"));
  assert.ok(strong.includes("yahtzee-score-300"));
  assert.ok(strong.includes("yahtzee-clean-card"));
  assert.equal(strong.includes("yahtzee-three-zeroes"), false);

  const crossed = gameResultAchievementIds({ gameId: "yahtzee", scores: { p1: { ...strongScores, yahtzee: 0, "large-straight": 0, "full-house": 0 } } }, "p1");
  assert.ok(crossed.includes("yahtzee-three-zeroes"));
  assert.equal(crossed.includes("yahtzee-clean-card"), false);
});

test("l'égalité Blackjack ne se débloque qu'à 21 et détecte une main de cinq cartes", () => {
  const state = {
    gameId: "blackjack",
    hands: { p1: [{ rank: "2" }, { rank: "3" }, { rank: "4" }, { rank: "5" }, { rank: "7" }] },
    dealer: [{ rank: "A" }, { rank: "K" }],
    bets: { p1: 10 },
    payouts: { p1: 10 },
    foldedPlayerIds: [],
    winners: []
  };
  const atTwentyOne = gameResultAchievementIds(state, "p1");
  assert.ok(atTwentyOne.includes("blackjack-push"));
  assert.ok(atTwentyOne.includes("blackjack-five-card-hand"));

  state.hands.p1 = [{ rank: "10" }, { rank: "8" }];
  state.dealer = [{ rank: "10" }, { rank: "8" }];
  assert.equal(gameResultAchievementIds(state, "p1").includes("blackjack-push"), false);
});

test("les performances Farkle utilisent le meilleur lancer et le meilleur tour encaissé", () => {
  const ids = gameResultAchievementIds({
    gameId: "farkle",
    stats: { p1: { maxRollScore: 3000, maxTurnScore: 10000, hotDiceSelections: 1 } },
    logs: [
      { actorId: "p1", text: "lance 1, 1, 2, 2, 3, 3 (Trois paires)." },
      { actorId: "p1", text: "lance 2, 2, 2, 3, 3, 3 (Deux brelans)." }
    ],
    winners: ["p1"]
  }, "p1");
  for (const id of ["farkle-roll-1000", "farkle-roll-3000", "farkle-one-shot-10000", "farkle-hot-dice", "farkle-three-pairs", "farkle-two-triplets"]) assert.ok(ids.includes(id), id);
});

test("Dés de Minuit conserve les mandats réussis sans gonfler le profil joueur", () => {
  const completed = MIDNIGHT_CONTRACTS.slice(0, 4);
  const ids = gameResultAchievementIds({
    gameId: "midnight-dice",
    modifiers: { rounds: 4 },
    stats: { p1: { contractsAttempted: 4, contractsCompleted: 4, completedContractIds: completed, perfectContracts: 1, marketDiscards: 3 } }
  }, "p1");
  assert.ok(ids.includes("midnight-flawless-contracts"));
  for (const contract of completed) assert.ok(ids.includes(midnightContractResultId(contract)));

  const historyResultIds = MIDNIGHT_CONTRACTS.map(midnightContractResultId);
  assert.equal(completedMidnightContractCount(historyResultIds), 12);
  assert.equal(completedMidnightContractCount([...historyResultIds, historyResultIds[0], "unrelated"]), 12);
});
