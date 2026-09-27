import { cardValue, createDeck, shuffle } from "../shared.js";
import { normalizeGameModifiers } from "../modifiers.js";
import { appendLog, cardsText, cardText, publicPlayers } from "../engine-context.js";

export function blackjackTotal(hand = []) {
  let total = 0;
  let aces = 0;
  for (const card of hand) {
    if (card.rank === "A") {
      aces += 1;
      total += 11;
    } else total += Math.min(cardValue(card.rank), 10);
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}

function finishBlackjack(state) {
  appendLog(state, "dealer", "révèle sa carte cachée.", "dealer");
  const bestPlayerTotal = Math.max(0, ...state.players.filter((player) => !player.isBot && !state.foldedPlayerIds?.includes(player.id)).map((player) => blackjackTotal(state.hands[player.id] ?? [])).filter((total) => total <= 21));
  const dealerTarget = state.modifiers?.dealerMode === "classic-17" ? 17 : Math.max(17, bestPlayerTotal);
  while (blackjackTotal(state.dealer) < dealerTarget) state.dealer.push(state.deck.pop());
  const dealerTotal = blackjackTotal(state.dealer);
  appendLog(state, "dealer", `termine à ${dealerTotal} avec ${cardsText(state.dealer)}.`, "dealer");
  state.payouts = {};
  for (const player of state.players.filter((entry) => !entry.isBot)) {
    const total = blackjackTotal(state.hands[player.id] ?? []);
    if (state.foldedPlayerIds?.includes(player.id)) appendLog(state, player.id, "s'est couché et perd sa mise.", "result");
    else if (total <= 21 && (dealerTotal > 21 || total > dealerTotal)) {
      state.winners.push(player.id);
      state.payouts[player.id] = state.bets[player.id] * 2;
      player.tokens += state.payouts[player.id];
      appendLog(state, player.id, `gagne contre le dealer avec ${total}.`, "result");
    } else if (total === dealerTotal && total <= 21) {
      state.payouts[player.id] = state.bets[player.id];
      player.tokens += state.payouts[player.id];
      appendLog(state, player.id, `fait égalité avec le dealer à ${total}.`, "result");
    } else appendLog(state, player.id, `perd contre le dealer avec ${total > 21 ? `${total} (bust)` : total}.`, "result");
  }
  state.finished = true;
}

function advanceTurn(state, actorId) {
  state.completedPlayerIds = [...new Set([...(state.completedPlayerIds ?? []), actorId])];
  const eligibleIds = state.players.filter((player) => !player.isBot && state.bets[player.id]).map((player) => player.id);
  const remainingIds = eligibleIds.filter((id) => !state.completedPlayerIds.includes(id));
  if (!remainingIds.length) {
    finishBlackjack(state);
    return;
  }
  const actorIndex = state.players.findIndex((player) => player.id === actorId);
  for (let offset = 1; offset <= state.players.length; offset += 1) {
    const index = (actorIndex + offset) % state.players.length;
    if (remainingIds.includes(state.players[index].id)) {
      state.currentPlayerIndex = index;
      return;
    }
  }
}

export function createBlackjackState(players, options = {}) {
  const modifiers = normalizeGameModifiers("blackjack", options.gameModifiers);
  modifiers.maximumBet = Math.max(modifiers.minimumBet, modifiers.maximumBet);
  return { gameId: "blackjack", players: publicPlayers(players), modifiers, deck: shuffle(createDeck()), dealer: [], hands: {}, bets: {}, completedPlayerIds: [], foldedPlayerIds: [], shownPlayerIds: [], logs: [], currentPlayerIndex: 0, finished: false, winners: [] };
}

export function applyBlackjackAction(state, actorId, action) {
  if (action.type === "show") {
    if (!state.hands?.[actorId]) throw new Error("Tu dois d'abord recevoir tes cartes.");
    state.shownPlayerIds = [...new Set([...(state.shownPlayerIds ?? []), actorId])];
    appendLog(state, actorId, "montre sa main.", "reveal");
    return state;
  }
  if (state.finished) return state;
  if (action.type === "bet") {
    const minimumBet = Math.max(1, Number(state.modifiers?.minimumBet) || 1);
    const maximumBet = Math.max(minimumBet, Number(state.modifiers?.maximumBet) || minimumBet);
    const amount = Math.max(minimumBet, Math.floor(Number(action.amount) || 0));
    if (amount > maximumBet) throw new Error(`La mise maximale est de ${maximumBet} jetons.`);
    if (state.bets[actorId]) throw new Error("Mise déjà placée.");
    state.bets[actorId] = amount;
    state.hands[actorId] = [state.deck.pop(), state.deck.pop()];
    appendLog(state, actorId, `mise ${amount} jetons et reçoit ${cardsText(state.hands[actorId])}.`, "bet");
    if (Object.keys(state.bets).length === state.players.filter((player) => !player.isBot).length) {
      state.dealer = [state.deck.pop(), state.deck.pop()];
      state.currentPlayerIndex = state.players.findIndex((player) => !player.isBot && state.bets[player.id]);
    }
    return state;
  }
  if (Object.keys(state.bets).length < state.players.filter((player) => !player.isBot).length) throw new Error("Toutes les mises doivent être placées.");
  if ((state.completedPlayerIds ?? []).includes(actorId)) throw new Error("Ta main est déjà terminée.");
  if (action.type === "hit") {
    const card = state.deck.pop();
    state.hands[actorId].push(card);
    appendLog(state, actorId, `pioche ${cardText(card)} et monte à ${blackjackTotal(state.hands[actorId])}.`);
    if (blackjackTotal(state.hands[actorId]) >= 21) advanceTurn(state, actorId);
  }
  if (action.type === "stand") {
    appendLog(state, actorId, `reste à ${blackjackTotal(state.hands[actorId])}.`);
    advanceTurn(state, actorId);
  }
  if (action.type === "double") {
    const hand = state.hands[actorId] ?? [];
    if (hand.length !== 2) throw new Error("Tu ne peux doubler qu’avec tes deux cartes initiales.");
    if (blackjackTotal(hand) === 21) throw new Error("Une main de 21 ne peut pas être doublée.");
    const originalBet = Number(state.bets[actorId]) || 0;
    if (!originalBet) throw new Error("Place d’abord une mise.");
    state.bets[actorId] = originalBet * 2;
    const card = state.deck.pop();
    state.hands[actorId].push(card);
    appendLog(state, actorId, `double sa mise, reçoit ${cardText(card)} et termine à ${blackjackTotal(state.hands[actorId])}.`, "bet");
    advanceTurn(state, actorId);
  }
  if (action.type === "fold") {
    state.foldedPlayerIds = [...new Set([...(state.foldedPlayerIds ?? []), actorId])];
    appendLog(state, actorId, "se couche.");
    advanceTurn(state, actorId);
  }
  return state;
}
