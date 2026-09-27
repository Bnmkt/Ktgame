import { createDeck, shuffle } from "../shared.js";
import { normalizeGameModifiers } from "../modifiers.js";
import { appendLog, cardText, publicPlayers } from "../engine-context.js";

export function canGolfPlay(card, waste, modifiers = {}) {
  if (!card || !waste) return false;
  const value = (rank) => ({ A: 1, J: 11, Q: 12, K: 13 })[rank] ?? Number(rank);
  const difference = Math.abs(value(card.rank) - value(waste.rank));
  return difference === 1 || (modifiers.wrapRanks && difference === 12);
}

export function createGolfSolitaireState(players, options = {}) {
  const deck = shuffle(createDeck());
  const tableau = Array.from({ length: 7 }, (_, column) => deck.slice(column * 5, column * 5 + 5));
  return { gameId: "golf-solitaire", players: publicPlayers(players.slice(0, 1)), modifiers: normalizeGameModifiers("golf-solitaire", options.gameModifiers), tableau, stock: deck.slice(35, 51), waste: deck[51], logs: [], finished: false, winners: [], score: null };
}

export function applyGolfSolitaireAction(state, actorId, action) {
  if (state.players[0].id !== actorId) throw new Error("Ce n'est pas ta partie.");
  if (action.type === "play") {
    const column = Number(action.column);
    const card = state.tableau[column]?.at(-1);
    if (!canGolfPlay(card, state.waste, state.modifiers)) throw new Error("Carte non jouable.");
    state.waste = state.tableau[column].pop();
    appendLog(state, actorId, `joue ${cardText(state.waste)} depuis la colonne ${column + 1}.`);
  }
  if (action.type === "draw") {
    if (!state.stock.length) throw new Error("Pioche vide.");
    state.waste = state.stock.pop();
    appendLog(state, actorId, `pioche ${cardText(state.waste)}.`, "draw");
  }
  const remaining = state.tableau.reduce((sum, column) => sum + column.length, 0);
  if (remaining === 0 || (!state.stock.length && !state.tableau.some((column) => canGolfPlay(column.at(-1), state.waste, state.modifiers)))) {
    state.score = remaining;
    state.winners = remaining === 0 ? [actorId] : [];
    state.finished = true;
  }
  return state;
}
