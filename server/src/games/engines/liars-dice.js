import { currentPlayer, nextTurn, rollDice } from "../shared.js";
import { normalizeGameModifiers } from "../modifiers.js";
import { appendLog, playerLabel, publicPlayers } from "../engine-context.js";

function rollHands(state) {
  state.hands = {};
  for (const player of state.players) state.hands[player.id] = rollDice(state.diceCounts[player.id] ?? 0);
}

export function createLiarsDiceState(players, options = {}) {
  const modifiers = normalizeGameModifiers("liars-dice", options.gameModifiers);
  const state = { gameId: "liars-dice", players: publicPlayers(players), modifiers, currentPlayerIndex: 0, diceCounts: {}, hands: {}, bid: null, lastBidderId: null, round: 1, lastReveal: null, logs: [], finished: false, winners: [] };
  players.forEach((player) => (state.diceCounts[player.id] = modifiers.startingDice));
  rollHands(state);
  return state;
}

export function applyLiarsDiceAction(state, actorId, action) {
  if (currentPlayer(state).id !== actorId) throw new Error("Ce n'est pas ton tour.");
  if (action.type === "bid") {
    const quantity = Math.max(1, Number(action.quantity || 1));
    const face = Math.min(6, Math.max(1, Number(action.face || 1)));
    if (state.bid && (quantity < state.bid.quantity || (quantity === state.bid.quantity && face <= state.bid.face))) throw new Error("L'enchère doit augmenter.");
    state.bid = { quantity, face };
    state.lastBidderId = actorId;
    appendLog(state, actorId, `annonce ${quantity} dé(s) de ${face}.`, "bid");
    nextTurn(state);
  }
  if (action.type === "challenge") {
    if (!state.bid || !state.lastBidderId) throw new Error("Aucune enchère à contester.");
    const count = Object.values(state.hands).flat().filter((die) => die === state.bid.face).length;
    const challengerWins = count < state.bid.quantity;
    const loserId = challengerWins ? state.lastBidderId : actorId;
    state.diceCounts[loserId] -= 1;
    if (state.diceCounts[loserId] === 0) (state.eliminationOrder ??= []).push(loserId);
    state.lastReveal = { ...state.bid, actual: count, loserId, challengerWins, hands: state.hands };
    appendLog(state, actorId, `conteste: ${count} dé(s) de ${state.bid.face} révélé(s), ${playerLabel(state, loserId)} perd un dé.`, "result");
    const alive = state.players.filter((player) => state.diceCounts[player.id] > 0);
    if (alive.length === 1) {
      state.winners = [alive[0].id];
      state.finished = true;
    } else {
      state.players = alive;
      state.currentPlayerIndex = Math.max(0, state.players.findIndex((player) => player.id === loserId));
      if (state.currentPlayerIndex < 0) state.currentPlayerIndex = 0;
      state.bid = null;
      state.lastBidderId = null;
      state.round += 1;
      rollHands(state);
    }
  }
  return state;
}

export function liarsDiceBotAction(state) {
  if (!state.bid) return { type: "bid", quantity: 1, face: 3 };
  const totalDice = Object.values(state.diceCounts).reduce((sum, count) => sum + count, 0);
  if (state.bid.quantity >= Math.max(2, Math.ceil(totalDice * 0.55))) return { type: "challenge" };
  return { type: "bid", quantity: state.bid.face < 6 ? state.bid.quantity : state.bid.quantity + 1, face: state.bid.face < 6 ? state.bid.face + 1 : 1 };
}
