import { currentPlayer, nextTurn, rollDice } from "../shared.js";
import { normalizeGameModifiers } from "../modifiers.js";
import { appendLog, diceText, publicPlayers } from "../engine-context.js";

export function rank421(dice) {
  const sorted = [...dice].sort((left, right) => right - left);
  const key = sorted.join("");
  if (key === "421") return 800;
  if (key === "221") return 650;
  if (sorted[1] === 1 && sorted[2] === 1) return 640 + sorted[0];
  if (new Set(dice).size === 1) return 700 + dice[0];
  if (["654", "543", "432", "321"].includes(key)) return 600 + sorted[0];
  const pair = sorted.find((die) => dice.filter((candidate) => candidate === die).length === 2);
  if (pair) return 300 + pair * 10 + sorted.find((die) => die !== pair);
  return Number(key);
}

export function label421(dice) {
  const sorted = [...dice].sort((left, right) => right - left);
  const key = sorted.join("");
  if (key === "421") return "421";
  if (key === "221") return "Nénette";
  if (sorted[1] === 1 && sorted[2] === 1) return `${sorted[0]} fiches`;
  if (new Set(dice).size === 1) return `Brelan de ${dice[0]}`;
  if (["654", "543", "432", "321"].includes(key)) return "Suite";
  return "Points";
}

export function paidRerollPrice421(state, playerId) {
  const used = Number(state.paidRerollsUsed?.[playerId]) || 0;
  return Math.max(1, Math.floor(Number(state.modifiers?.paidRerollPrice) || 25)) * (2 ** used);
}

export function create421State(players, options = {}) {
  const modifiers = normalizeGameModifiers("421", options.gameModifiers);
  return {
    gameId: "421",
    players: publicPlayers(players),
    modifiers,
    currentPlayerIndex: 0,
    dice: [],
    kept: [],
    rollsLeft: modifiers.rollsPerTurn,
    round: 1,
    maxRounds: modifiers.rounds,
    scores: Object.fromEntries(publicPlayers(players).map((player) => [player.id, 0])),
    results: [],
    roundHistory: [],
    currentCombination: null,
    paidRerollsUsed: {},
    lastDiceByPlayer: {},
    logs: [],
    finished: false,
    winners: []
  };
}

export function apply421Action(state, actorId, action) {
  if (currentPlayer(state).id !== actorId) throw new Error("Ce n'est pas ton tour.");
  if (action.type === "roll" && state.rollsLeft > 0) {
    const keepIndexes = new Set(action.keepIndexes ?? []);
    const currentDice = state.dice.length ? state.dice : Array(3).fill(null);
    state.dice = currentDice.map((value, index) => (keepIndexes.has(index) && value ? value : rollDice(1)[0]));
    (state.lastDiceByPlayer ??= {})[actorId] = [...state.dice];
    state.kept = [...keepIndexes];
    state.rollsLeft -= 1;
    state.currentCombination = { label: label421(state.dice), rank: rank421(state.dice) };
    appendLog(state, actorId, `lance ${diceText(state.dice)}${state.kept.length ? ` avec ${state.kept.length} dé(s) gardé(s)` : ""}.`);
  }
  if (action.type === "buy-reroll") {
    if (!state.modifiers?.paidRerollsEnabled) throw new Error("Les relances payantes sont désactivées.");
    if (state.dice.length !== 3) throw new Error("Lance d’abord les dés.");
    if (state.rollsLeft > 0) throw new Error("Utilise d’abord tes relances gratuites.");
    const used = Number(state.paidRerollsUsed?.[actorId]) || 0;
    if (used >= (state.modifiers?.paidRerollsPerTurn ?? 2)) throw new Error("Limite de relances payantes atteinte pour ce tour.");
    const price = paidRerollPrice421(state, actorId);
    (state.paidRerollsUsed ??= {})[actorId] = used + 1;
    state.rollsLeft = 1;
    appendLog(state, actorId, `achète une relance supplémentaire pour ${price} jetons.`, "bet");
  }
  if (action.type === "bank") {
    if (state.dice.length !== 3) throw new Error("Il faut lancer les dés.");
    const result = { playerId: actorId, dice: state.dice, rank: rank421(state.dice), label: label421(state.dice) };
    state.results.push(result);
    state.scores[actorId] = (state.scores[actorId] ?? 0) + result.rank;
    appendLog(state, actorId, `valide ${diceText(result.dice)}: ${result.label}.`, "score");
    state.dice = [];
    state.kept = [];
    state.currentCombination = null;
    state.paidRerollsUsed[actorId] = 0;
    state.rollsLeft = state.modifiers?.rollsPerTurn ?? 3;
    if (state.results.length >= state.players.length) {
      state.roundHistory.push({ round: state.round, results: state.results.map((entry) => ({ ...entry, dice: [...entry.dice] })) });
      if (state.round >= state.maxRounds) {
        const best = Math.max(...Object.values(state.scores));
        state.winners = state.players.filter((player) => state.scores[player.id] === best).map((player) => player.id);
        state.finished = true;
      } else {
        state.round += 1;
        state.results = [];
        state.currentPlayerIndex = 0;
      }
    } else nextTurn(state);
  }
  return state;
}

export function fourTwentyOneBotAction(state) {
  return state.rollsLeft > 0 ? { type: "roll", keepIndexes: [] } : { type: "bank" };
}
