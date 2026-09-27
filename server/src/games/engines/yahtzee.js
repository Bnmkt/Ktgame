import { currentPlayer, nextTurn, rollDice } from "../shared.js";
import { normalizeGameModifiers } from "../modifiers.js";
import { appendLog, diceText, publicPlayers } from "../engine-context.js";

export const YAHTZEE_CATEGORIES = [
  "upper-1", "upper-2", "upper-3", "upper-4", "upper-5", "upper-6",
  "three-kind", "four-kind", "full-house", "small-straight", "large-straight", "yahtzee", "chance"
];

export function scoreYahtzee(dice, category) {
  const counts = [1, 2, 3, 4, 5, 6].map((face) => dice.filter((die) => die === face).length);
  const sum = dice.reduce((total, die) => total + die, 0);
  if (category?.startsWith("upper-")) {
    const face = Number(category.split("-")[1]);
    return dice.filter((die) => die === face).reduce((total, die) => total + die, 0);
  }
  if (category === "three-kind") return counts.some((count) => count >= 3) ? sum : 0;
  if (category === "four-kind") return counts.some((count) => count >= 4) ? sum : 0;
  if (category === "full-house") return counts.includes(3) && counts.includes(2) ? 25 : 0;
  if (category === "small-straight") return ["1234", "2345", "3456"].some((sequence) => [...sequence].every((face) => dice.includes(Number(face)))) ? 30 : 0;
  if (category === "large-straight") return ["12345", "23456"].some((sequence) => [...sequence].every((face) => dice.includes(Number(face)))) ? 40 : 0;
  if (category === "yahtzee") return counts.includes(5) ? 50 : 0;
  return sum;
}

export function totalYahtzee(scores = {}) {
  const upper = YAHTZEE_CATEGORIES.slice(0, 6).reduce((sum, key) => sum + (scores[key] ?? 0), 0);
  const base = Object.values(scores).reduce((sum, score) => sum + score, 0);
  return base + (upper >= 63 ? 35 : 0);
}

export function createYahtzeeState(players, options = {}) {
  const modifiers = normalizeGameModifiers("yahtzee", options.gameModifiers);
  return {
    gameId: "yahtzee",
    players: publicPlayers(players),
    modifiers,
    currentPlayerIndex: 0,
    dice: [],
    kept: [],
    rollsLeft: modifiers.rollsPerTurn,
    scores: {},
    lastDiceByPlayer: {},
    logs: [],
    finished: false,
    winners: []
  };
}

export function applyYahtzeeAction(state, actorId, action) {
  if (currentPlayer(state).id !== actorId) throw new Error("Ce n'est pas ton tour.");
  if (action.type === "roll" && state.rollsLeft > 0) {
    const keepIndexes = new Set(action.keepIndexes ?? []);
    const currentDice = state.dice.length ? state.dice : Array(5).fill(null);
    state.dice = currentDice.map((value, index) => (keepIndexes.has(index) && value ? value : rollDice(1)[0]));
    (state.lastDiceByPlayer ??= {})[actorId] = [...state.dice];
    state.kept = [...keepIndexes];
    state.rollsLeft -= 1;
    appendLog(state, actorId, `lance les dés: ${diceText(state.dice)}${state.kept.length ? ` (${state.kept.length} gardé${state.kept.length > 1 ? "s" : ""})` : ""}.`);
  }
  if (action.type === "score") {
    if (state.dice.length !== 5) throw new Error("Il faut lancer les dés avant de scorer.");
    const playerScores = state.scores[actorId] ?? {};
    if (playerScores[action.category] !== undefined) throw new Error("Catégorie déjà utilisée.");
    playerScores[action.category] = scoreYahtzee(state.dice, action.category);
    appendLog(state, actorId, `marque ${playerScores[action.category]} point(s) dans ${action.category}.`, "score");
    state.scores[actorId] = playerScores;
    state.dice = [];
    state.kept = [];
    state.rollsLeft = state.modifiers?.rollsPerTurn ?? 3;
    const allComplete = state.players.every((player) => Object.keys(state.scores[player.id] ?? {}).length >= YAHTZEE_CATEGORIES.length);
    if (allComplete) {
      const totals = Object.entries(state.scores).map(([id, scores]) => [id, totalYahtzee(scores)]);
      state.winners = [totals.sort((left, right) => right[1] - left[1])[0][0]];
      state.finished = true;
    } else nextTurn(state);
  }
  return state;
}

export function yahtzeeBotAction(state, bot) {
  if (state.rollsLeft > 0) return { type: "roll", keepIndexes: [] };
  const used = state.scores[bot.id] ?? {};
  return { type: "score", category: YAHTZEE_CATEGORIES.find((category) => used[category] === undefined) ?? "chance" };
}
