import { cardValue, createDeck, currentPlayer, shuffle } from "../shared.js";
import { normalizeGameModifiers } from "../modifiers.js";
import { appendLog, cardsText, publicPlayers } from "../engine-context.js";

export function presidentValue(rank, revolution = false) {
  const values = { "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10, J: 11, Q: 12, K: 13, A: 14, "2": 15 };
  const value = values[rank] ?? Number(rank);
  return revolution ? 18 - value : value;
}

function activePlayers(state) {
  return state.players.filter((player) => !state.finishedOrder.includes(player.id));
}

function advanceTurn(state, fromIndex = state.currentPlayerIndex) {
  const activeIds = new Set(activePlayers(state).map((player) => player.id));
  if (activeIds.size <= 1) return;
  let index = fromIndex;
  do index = (index + 1) % state.players.length; while (!activeIds.has(state.players[index].id));
  state.currentPlayerIndex = index;
}

function clearTrick(state, starterId) {
  state.pile = [];
  state.currentSet = null;
  state.passes = [];
  const remaining = activePlayers(state);
  if (remaining.length <= 1) {
    if (remaining.length === 1 && !state.finishedOrder.includes(remaining[0].id)) state.finishedOrder.push(remaining[0].id);
    state.finished = true;
    return;
  }
  if (!remaining.some((player) => player.id === starterId)) {
    state.currentPlayerIndex = state.players.findIndex((player) => player.id === remaining[0].id);
    return;
  }
  const starterIndex = state.players.findIndex((player) => player.id === starterId);
  state.currentPlayerIndex = starterIndex >= 0 ? starterIndex : 0;
}

export function createPresidentState(players, options = {}) {
  const deck = shuffle(createDeck());
  const hands = Object.fromEntries(players.map((player) => [player.id, []]));
  deck.forEach((card, index) => hands[players[index % players.length].id].push(card));
  Object.values(hands).forEach((hand) => hand.sort((left, right) => cardValue(left.rank) - cardValue(right.rank)));
  return { gameId: "president", players: publicPlayers(players), modifiers: normalizeGameModifiers("president", options.gameModifiers), hands, pile: [], currentSet: null, passes: [], finishedOrder: [], revolution: false, logs: [], currentPlayerIndex: 0, finished: false, winners: [] };
}

export function applyPresidentAction(state, actorId, action) {
  if (currentPlayer(state).id !== actorId) throw new Error("Ce n'est pas ton tour.");
  if (action.type === "play") {
    const hand = state.hands[actorId];
    const requestedCards = Array.isArray(action.cards) ? action.cards.slice(0, 4) : [];
    const rank = String(requestedCards[0]?.rank ?? action.rank ?? "");
    if (requestedCards.some((card) => String(card.rank) !== rank)) throw new Error("Toutes les cartes jouées doivent avoir la même valeur.");
    const count = requestedCards.length || Math.max(1, Number(action.count || 1));
    const usedIndexes = new Set();
    const indexes = requestedCards.length
      ? requestedCards.map((requested) => {
        const index = hand.findIndex((card, handIndex) => !usedIndexes.has(handIndex) && card.rank === requested.rank && card.suit === requested.suit);
        if (index >= 0) usedIndexes.add(index);
        return index;
      })
      : hand.map((card, index) => card.rank === rank ? index : -1).filter((index) => index >= 0).slice(0, count);
    if (indexes.length !== count) throw new Error("Cartes absentes.");
    if (indexes.some((index) => index < 0)) throw new Error("Une des cartes sélectionnées n'est plus dans ta main.");
    if (state.currentSet && count !== state.currentSet.count) throw new Error(`Il faut jouer ${state.currentSet.count} carte(s).`);
    if (state.currentSet && presidentValue(rank, state.revolution) <= presidentValue(state.currentSet.rank, state.revolution)) throw new Error(state.revolution ? "Il faut jouer une combinaison supérieure dans l'ordre inversé de la révolution." : "Il faut jouer une combinaison supérieure.");
    const cards = indexes.reverse().map((index) => hand.splice(index, 1)[0]).reverse();
    state.pile.push({ playerId: actorId, cards });
    state.currentSet = { playerId: actorId, rank, count };
    state.passes = [];
    appendLog(state, actorId, `pose ${cardsText(cards)}${count > 1 ? ` (${count} cartes)` : ""}.`);
    const clearsWithRevolution = count === 4 && state.modifiers?.revolutionEnabled !== false;
    if (clearsWithRevolution) {
      state.revolution = !state.revolution;
      appendLog(state, actorId, `${state.revolution ? "déclenche" : "annule"} la révolution.`, "result");
      clearTrick(state, actorId);
    }
    if (hand.length === 0) {
      state.finishedOrder.push(actorId);
      state.winners = [state.finishedOrder[0]];
      const remaining = activePlayers(state);
      if (remaining.length === 1) {
        state.finishedOrder.push(remaining[0].id);
        state.finished = true;
      } else if (remaining.length > 1 && count === 4) state.currentPlayerIndex = state.players.findIndex((player) => player.id === remaining[0].id);
    }
    if (!state.finished && !clearsWithRevolution) advanceTurn(state);
  }
  if (action.type === "pass") {
    if (!state.currentSet) {
      appendLog(state, actorId, "laisse l'ouverture au joueur suivant.");
      advanceTurn(state);
      return state;
    }
    state.passes = [...new Set([...(state.passes ?? []), actorId])];
    appendLog(state, actorId, "passe.");
    const remaining = activePlayers(state);
    if (state.passes.length >= remaining.length - 1) {
      appendLog(state, state.currentSet.playerId, "remporte le pli et relance.", "result");
      clearTrick(state, state.currentSet.playerId);
    } else advanceTurn(state);
  }
  return state;
}

export function presidentBotAction(state, bot) {
  const count = state.currentSet?.count ?? 1;
  const ranks = [...new Set((state.hands[bot.id] ?? []).map((card) => card.rank))].sort((left, right) => presidentValue(left, state.revolution) - presidentValue(right, state.revolution));
  const rank = ranks.find((candidate) => (state.hands[bot.id] ?? []).filter((card) => card.rank === candidate).length >= count && (!state.currentSet || presidentValue(candidate, state.revolution) > presidentValue(state.currentSet.rank, state.revolution)));
  return rank ? { type: "play", rank, count } : { type: "pass" };
}
