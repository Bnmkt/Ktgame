import { cardValue, createDeck, shuffle } from "../shared.js";
import { appendLog, publicPlayers } from "../engine-context.js";

export const POKER_HAND_NAMES = ["Carte haute", "Paire", "Deux paires", "Brelan", "Suite", "Couleur", "Full", "Carré", "Quinte flush"];
const POKER_RESOLUTION_DELAY_MS = 7000;

export function pokerFiveRank(cards) {
  const values = cards.map((card) => cardValue(card.rank)).sort((left, right) => right - left);
  const counts = [...new Set(values)].map((value) => ({ value, count: values.filter((entry) => entry === value).length })).sort((left, right) => right.count - left.count || right.value - left.value);
  const flush = cards.every((card) => card.suit === cards[0].suit);
  const unique = [...new Set(values)];
  if (unique.includes(14)) unique.push(1);
  let straightHigh = 0;
  for (let index = 0; index <= unique.length - 5; index += 1) if (unique.slice(index, index + 5).every((value, offset, list) => offset === 0 || list[offset - 1] - value === 1)) straightHigh = Math.max(straightHigh, unique[index]);
  if (flush && straightHigh) return [8, straightHigh];
  if (counts[0].count === 4) return [7, counts[0].value, counts.find((entry) => entry.count === 1).value];
  if (counts[0].count === 3 && counts[1]?.count === 2) return [6, counts[0].value, counts[1].value];
  if (flush) return [5, ...values];
  if (straightHigh) return [4, straightHigh];
  if (counts[0].count === 3) return [3, counts[0].value, ...counts.filter((entry) => entry.count === 1).map((entry) => entry.value).sort((left, right) => right - left)];
  const pairs = counts.filter((entry) => entry.count === 2).sort((left, right) => right.value - left.value);
  if (pairs.length >= 2) return [2, pairs[0].value, pairs[1].value, counts.find((entry) => entry.count === 1).value];
  if (pairs.length === 1) return [1, pairs[0].value, ...counts.filter((entry) => entry.count === 1).map((entry) => entry.value).sort((left, right) => right - left)];
  return [0, ...values];
}

export function comparePokerRanks(left, right) {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) if ((left[index] ?? 0) !== (right[index] ?? 0)) return (left[index] ?? 0) - (right[index] ?? 0);
  return 0;
}

export function bestPokerHand(cards) {
  let best = null;
  for (let a = 0; a < cards.length - 4; a += 1) for (let b = a + 1; b < cards.length - 3; b += 1) for (let c = b + 1; c < cards.length - 2; c += 1) for (let d = c + 1; d < cards.length - 1; d += 1) for (let e = d + 1; e < cards.length; e += 1) {
    const rank = pokerFiveRank([cards[a], cards[b], cards[c], cards[d], cards[e]]);
    if (!best || comparePokerRanks(rank, best) > 0) best = rank;
  }
  return best ?? [0];
}

export function currentPokerHand(cards = []) {
  if (cards.length >= 5) return bestPokerHand(cards);
  const values = cards.map((card) => cardValue(card.rank)).sort((left, right) => right - left);
  const counts = [...new Set(values)].map((value) => ({ value, count: values.filter((entry) => entry === value).length })).sort((left, right) => right.count - left.count || right.value - left.value);
  if (counts[0]?.count === 4) return [7, counts[0].value];
  if (counts[0]?.count === 3 && counts[1]?.count === 2) return [6, counts[0].value, counts[1].value];
  if (counts[0]?.count === 3) return [3, counts[0].value, ...counts.slice(1).map((entry) => entry.value).sort((left, right) => right - left)];
  const pairs = counts.filter((entry) => entry.count === 2).sort((left, right) => right.value - left.value);
  if (pairs.length >= 2) return [2, pairs[0].value, pairs[1].value];
  if (pairs.length === 1) return [1, pairs[0].value, ...counts.filter((entry) => entry.count === 1).map((entry) => entry.value).sort((left, right) => right - left)];
  return [0, ...values];
}

function pokerValueLabel(value) {
  return ({ 14: "As", 13: "Roi", 12: "Dame", 11: "Valet" })[value] ?? String(value || "–");
}

export function pokerHandLabel(rank = [0]) {
  const name = POKER_HAND_NAMES[rank[0]] ?? POKER_HAND_NAMES[0];
  if (rank[0] === 8 || rank[0] === 4) return `${name} · ${pokerValueLabel(rank[1])} haut`;
  if (rank[0] === 7) return `${name} de ${pokerValueLabel(rank[1])}`;
  if (rank[0] === 6) return `${name} · ${pokerValueLabel(rank[1])} par ${pokerValueLabel(rank[2])}`;
  if (rank[0] === 5 || rank[0] === 0) return `${name} · ${pokerValueLabel(rank[1])} haut`;
  if (rank[0] === 3) return `${name} de ${pokerValueLabel(rank[1])}`;
  if (rank[0] === 2) return `${name} · ${pokerValueLabel(rank[1])} et ${pokerValueLabel(rank[2])}`;
  if (rank[0] === 1) return `${name} de ${pokerValueLabel(rank[1])}`;
  return name;
}

export function pokerHandPreview(cards = []) {
  const rank = currentPokerHand(cards);
  const suitCounts = cards.reduce((counts, card) => ({ ...counts, [card.suit]: (counts[card.suit] ?? 0) + 1 }), {});
  const values = [...new Set(cards.map((card) => cardValue(card.rank)))].sort((left, right) => left - right);
  if (values.includes(14)) values.unshift(1);
  let straightRun = 1;
  let bestRun = values.length ? 1 : 0;
  for (let index = 1; index < values.length; index += 1) {
    straightRun = values[index] === values[index - 1] + 1 ? straightRun + 1 : 1;
    bestRun = Math.max(bestRun, straightRun);
  }
  const draws = [];
  if (cards.length < 7 && Math.max(0, ...Object.values(suitCounts)) === 4) draws.push("tirage couleur");
  if (cards.length < 7 && bestRun === 4) draws.push("tirage suite");
  return { rank, name: POKER_HAND_NAMES[rank[0]], label: pokerHandLabel(rank), draws };
}

function activeIds(state) {
  return state.players.filter((player) => (state.hands[player.id]?.length ?? 0) > 0 && !state.foldedPlayerIds.includes(player.id)).map((player) => player.id);
}

function nextPlayerIndex(state, fromIndex) {
  for (let offset = 1; offset <= state.players.length; offset += 1) {
    const index = (fromIndex + offset) % state.players.length;
    const id = state.players[index].id;
    if ((state.stacks[id] ?? 0) > 0 && !state.foldedPlayerIds.includes(id) && !state.allInPlayerIds.includes(id)) return index;
  }
  return -1;
}

function settle(state) {
  const playingIds = activeIds(state);
  state.handRanks = {};
  state.players.filter((player) => state.hands[player.id]?.length).forEach((player) => { state.handRanks[player.id] = bestPokerHand([...(state.hands[player.id] ?? []), ...state.community]); });
  const levels = [...new Set(Object.values(state.contributions).filter((amount) => amount > 0))].sort((left, right) => left - right);
  let previous = 0;
  state.pots = [];
  state.payouts = {};
  for (const level of levels) {
    const contributors = state.players.filter((player) => (state.contributions[player.id] ?? 0) >= level);
    const amount = (level - previous) * contributors.length;
    const eligible = contributors.filter((player) => playingIds.includes(player.id));
    if (amount && eligible.length) {
      const best = eligible.reduce((rank, player) => !rank || comparePokerRanks(state.handRanks[player.id], rank) > 0 ? state.handRanks[player.id] : rank, null);
      const winners = eligible.filter((player) => comparePokerRanks(state.handRanks[player.id], best) === 0);
      const share = Math.floor(amount / winners.length);
      winners.forEach((winner, index) => {
        const gain = share + (index < amount % winners.length ? 1 : 0);
        state.stacks[winner.id] += gain;
        state.payouts[winner.id] = (state.payouts[winner.id] ?? 0) + gain;
      });
      state.pots.push({ amount, winnerIds: winners.map((winner) => winner.id) });
    }
    previous = level;
  }
  const bestOverall = playingIds.reduce((rank, id) => !rank || comparePokerRanks(state.handRanks[id], rank) > 0 ? state.handRanks[id] : rank, null);
  const handWinners = playingIds.filter((id) => comparePokerRanks(state.handRanks[id], bestOverall) === 0);
  state.lastHandWinners = handWinners;
  state.showdown = true;
  state.shownPlayerIds = [...new Set([...(state.shownPlayerIds ?? []), ...playingIds])];
  handWinners.forEach((id) => appendLog(state, id, `gagne avec ${POKER_HAND_NAMES[state.handRanks[id][0]]}.`, "result"));
  state.currentPlayerIndex = -1;
  state.turnStartedAt = null;
  state.turnDeadline = null;
  state.resolutionStartedAt = Date.now();
  state.nextHandAt = state.resolutionStartedAt + POKER_RESOLUTION_DELAY_MS;
}

function setPokerTurn(state, playerIndex, now = Date.now()) {
  state.currentPlayerIndex = playerIndex;
  state.turnStartedAt = playerIndex >= 0 ? now : null;
  state.turnDeadline = playerIndex >= 0 ? now + (state.turnDurationMs ?? 300000) : null;
}

function resolveAutoCheckFold(state, now = Date.now()) {
  let guard = state.players.length * 5 + 2;
  let changed = false;
  while (guard > 0 && !state.finished && !state.nextHandAt && state.currentPlayerIndex >= 0) {
    guard -= 1;
    const player = state.players[state.currentPlayerIndex];
    if (!player || player.isBot || !(state.autoCheckFoldPlayerIds ?? []).includes(player.id)) break;
    const enabledAt = state.autoCheckFoldEnabledAt?.[player.id] ?? 0;
    const triggerAt = Math.max(state.turnStartedAt ?? now, enabledAt) + 10000;
    if (now < triggerAt) break;
    const toCall = Math.max(0, state.currentBet - (state.streetBets?.[player.id] ?? 0));
    applyTexasHoldemAction(state, player.id, { type: toCall ? "fold" : "check", automatic: true });
    changed = true;
  }
  return changed;
}

function startNextHand(state) {
  const recorded = new Set((state.eliminationGroups ?? []).flat());
  const eliminated = state.players.filter((player)=>(state.stacks[player.id] ?? 0) <= 0 && !recorded.has(player.id)).map((player)=>player.id);
  if (eliminated.length) (state.eliminationGroups ??= []).push(eliminated);
  const eligibleIndexes = state.players.map((player, index) => (state.stacks[player.id] ?? 0) > 0 ? index : -1).filter((index) => index >= 0);
  if (eligibleIndexes.length < 2) {
    state.winners = eligibleIndexes.length ? [state.players[eligibleIndexes[0]].id] : state.lastHandWinners ?? [];
    state.finished = true;
    return;
  }
  let dealerIndex = state.dealerIndex;
  do dealerIndex = (dealerIndex + 1) % state.players.length; while (!eligibleIndexes.includes(dealerIndex));
  const nextEligible = (from) => { let index = from; do index = (index + 1) % state.players.length; while (!eligibleIndexes.includes(index)); return index; };
  const smallBlindIndex = eligibleIndexes.length === 2 ? dealerIndex : nextEligible(dealerIndex);
  const bigBlindIndex = nextEligible(smallBlindIndex);
  const deck = shuffle(createDeck());
  state.hands = Object.fromEntries(state.players.map((player) => [player.id, eligibleIndexes.includes(state.players.indexOf(player)) ? [deck.pop(), deck.pop()] : []]));
  state.deck = deck;
  state.community = [];
  state.dealerIndex = dealerIndex;
  state.smallBlindIndex = smallBlindIndex;
  state.bigBlindIndex = bigBlindIndex;
  state.streetBets = Object.fromEntries(state.players.map((player) => [player.id, 0]));
  state.contributions = Object.fromEntries(state.players.map((player) => [player.id, 0]));
  state.pot = 0;
  const post = (index, amount) => {
    const id = state.players[index].id;
    const paid = Math.min(amount, state.stacks[id]);
    state.stacks[id] -= paid;
    state.streetBets[id] += paid;
    state.contributions[id] += paid;
    state.pot += paid;
    if (!state.stacks[id]) state.allInPlayerIds.push(id);
    return paid;
  };
  state.foldedPlayerIds = [];
  state.allInPlayerIds = [];
  post(smallBlindIndex, state.smallBlind);
  const big = post(bigBlindIndex, state.bigBlind);
  state.currentBet = big;
  state.minRaise = state.bigBlind;
  state.street = "preflop";
  state.actedPlayerIds = [];
  setPokerTurn(state, eligibleIndexes.length === 2 ? dealerIndex : nextEligible(bigBlindIndex));
  state.showdown = false;
  state.resolutionStartedAt = null;
  state.shownPlayerIds = [];
  state.handRanks = {};
  state.pots = [];
  state.handNumber = (state.handNumber ?? 1) + 1;
  appendLog(state, "dealer", `lance la main ${state.handNumber}.`, "dealer");
  resolveAutoCheckFold(state);
}

export function tickPokerState(state, now = Date.now()) {
  if (state?.gameId !== "texas-holdem" || state.finished) return false;
  let changed = false;
  if (state.nextHandAt && now >= state.nextHandAt) {
    state.nextHandAt = null;
    state.resolutionStartedAt = null;
    startNextHand(state);
    changed = true;
  }
  if (resolveAutoCheckFold(state, now)) changed = true;
  return changed;
}

function advanceStreet(state) {
  const playingIds = activeIds(state);
  if (playingIds.length === 1) {
    const winnerId = playingIds[0];
    state.stacks[winnerId] += state.pot;
    state.payouts = { [winnerId]: state.pot };
    state.lastHandWinners = [winnerId];
    state.handRanks = Object.fromEntries(state.players.filter((player) => state.hands[player.id]?.length).map((player) => [player.id, currentPokerHand([...(state.hands[player.id] ?? []), ...state.community])]));
    appendLog(state, winnerId, `remporte le pot de ${state.pot}, tous les adversaires se sont couchés.`, "result");
    state.currentPlayerIndex = -1;
    state.turnStartedAt = null;
    state.turnDeadline = null;
    state.resolutionStartedAt = Date.now();
    state.nextHandAt = state.resolutionStartedAt + POKER_RESOLUTION_DELAY_MS;
    return;
  }
  const actionable = playingIds.filter((id) => !state.allInPlayerIds.includes(id));
  const roundDone = actionable.every((id) => state.actedPlayerIds.includes(id) && (state.streetBets[id] ?? 0) === state.currentBet);
  if (!roundDone) return;
  if (state.street === "river" || actionable.length <= 1) {
    while (state.community.length < 5) state.community.push(state.deck.pop());
    settle(state);
    return;
  }
  const dealCount = state.street === "preflop" ? 3 : 1;
  state.deck.pop();
  for (let index = 0; index < dealCount; index += 1) state.community.push(state.deck.pop());
  state.street = ({ preflop: "flop", flop: "turn", turn: "river" })[state.street];
  state.streetBets = Object.fromEntries(state.players.map((player) => [player.id, 0]));
  state.currentBet = 0;
  state.minRaise = state.bigBlind;
  state.actedPlayerIds = [];
  setPokerTurn(state, nextPlayerIndex(state, state.dealerIndex));
  appendLog(state, "dealer", `distribue le ${state.street}.`, "dealer");
}

export function createTexasHoldemState(players, options = {}) {
  const tablePlayers = publicPlayers(players);
  const deck = shuffle(createDeck());
  const hands = Object.fromEntries(tablePlayers.map((player) => [player.id, [deck.pop(), deck.pop()]]));
  const dealerIndex = 0;
  const smallBlindIndex = tablePlayers.length === 2 ? dealerIndex : (dealerIndex + 1) % tablePlayers.length;
  const bigBlindIndex = (smallBlindIndex + 1) % tablePlayers.length;
  const buyIn = Math.max(1000, Number(options.buyIn) || 1000);
  const stacks = Object.fromEntries(tablePlayers.map((player) => [player.id, buyIn]));
  const streetBets = Object.fromEntries(tablePlayers.map((player) => [player.id, 0]));
  const contributions = Object.fromEntries(tablePlayers.map((player) => [player.id, 0]));
  let configuredBigBlind = Math.max(2, Math.floor(Number(options.bigBlind) || 20));
  if (configuredBigBlind % 2) configuredBigBlind += 1;
  const maximumBet = Math.max(configuredBigBlind, Math.floor(Number(options.maximumBet) || Math.max(configuredBigBlind, buyIn)));
  const smallBlind = configuredBigBlind / 2;
  const turnDurationMs = Math.max(30000, Math.min(600000, Math.floor(Number(options.turnDurationMs) || 300000)));
  const postBlind = (index, amount) => {
    const id = tablePlayers[index].id;
    const paid = Math.min(amount, stacks[id]);
    stacks[id] -= paid;
    streetBets[id] += paid;
    contributions[id] += paid;
    return paid;
  };
  const postedSmallBlind = postBlind(smallBlindIndex, smallBlind);
  const bigBlind = postBlind(bigBlindIndex, configuredBigBlind);
  const firstIndex = tablePlayers.length === 2 ? dealerIndex : (bigBlindIndex + 1) % tablePlayers.length;
  const now = Date.now();
  return { gameId: "texas-holdem", players: tablePlayers, deck, hands, community: [], buyIn, realBankroll: buyIn * tablePlayers.filter((player) => !player.isBot).length, dealerIndex, smallBlindIndex, bigBlindIndex, smallBlind, bigBlind: configuredBigBlind, maximumBet, stacks, streetBets, contributions, pot: postedSmallBlind + bigBlind, currentBet: bigBlind, minRaise: configuredBigBlind, street: "preflop", handNumber: 1, turnDurationMs, turnStartedAt: now, turnDeadline: now + turnDurationMs, resolutionStartedAt: null, actedPlayerIds: [], foldedPlayerIds: [], allInPlayerIds: [], autoCheckFoldPlayerIds: [], autoCheckFoldEnabledAt: {}, shownPlayerIds: [], currentPlayerIndex: firstIndex, logs: [], finished: false, showdown: false, winners: [], payouts: {}, pots: [], departedPayouts: {}, departedPlayers: [] };
}

export function applyTexasHoldemAction(state, actorId, action) {
  if (action.type === "auto-check-fold") {
    if (!state.players.some((player) => player.id === actorId)) throw new Error("Joueur introuvable.");
    state.autoCheckFoldPlayerIds ??= [];
    state.autoCheckFoldEnabledAt ??= {};
    state.autoCheckFoldPlayerIds = action.enabled === false
      ? state.autoCheckFoldPlayerIds.filter((id) => id !== actorId)
      : [...new Set([...state.autoCheckFoldPlayerIds, actorId])];
    if (action.enabled === false) delete state.autoCheckFoldEnabledAt[actorId];
    else state.autoCheckFoldEnabledAt[actorId] = Date.now();
    return state;
  }
  if (action.type === "show") {
    if (!state.hands?.[actorId]?.length) throw new Error("Tu n’as pas de cartes à montrer.");
    if (!state.showdown && !state.nextHandAt && !state.finished) throw new Error("Tu pourras montrer ta main à la fin de la donne.");
    state.shownPlayerIds = [...new Set([...(state.shownPlayerIds ?? []), actorId])];
    state.handRanks ??= {};
    state.handRanks[actorId] = currentPokerHand([...(state.hands[actorId] ?? []), ...(state.community ?? [])]);
    appendLog(state, actorId, `montre sa main : ${pokerHandLabel(state.handRanks[actorId])}.`, "reveal");
    return state;
  }
  const playerIndex = state.players.findIndex((player) => player.id === actorId);
  if (playerIndex !== state.currentPlayerIndex) throw new Error("Ce n'est pas ton tour.");
  if (state.foldedPlayerIds.includes(actorId) || state.allInPlayerIds.includes(actorId)) throw new Error("Tu ne peux plus agir dans cette main.");
  const toCall = Math.max(0, state.currentBet - (state.streetBets[actorId] ?? 0));
  const commit = (requested) => {
    const paid = Math.min(Math.max(0, requested), state.stacks[actorId]);
    state.stacks[actorId] -= paid;
    state.streetBets[actorId] = (state.streetBets[actorId] ?? 0) + paid;
    state.contributions[actorId] = (state.contributions[actorId] ?? 0) + paid;
    state.pot += paid;
    if (state.stacks[actorId] === 0) state.allInPlayerIds = [...new Set([...state.allInPlayerIds, actorId])];
    return paid;
  };
  if (action.type === "fold") {
    state.foldedPlayerIds.push(actorId);
    appendLog(state, actorId, "se couche.");
  } else if (action.type === "check") {
    if (toCall > 0) throw new Error(`Il faut suivre ${toCall} jetons ou se coucher.`);
    appendLog(state, actorId, "parole.");
  } else if (action.type === "call") {
    const paid = commit(toCall);
    appendLog(state, actorId, `suit pour ${paid}.`, "bet");
  } else if (action.type === "raise") {
    const target = Number(action.amount);
    if (!Number.isFinite(target) || target < state.currentBet + state.minRaise) throw new Error(`Relance minimale: ${state.currentBet + state.minRaise}.`);
    if (target > state.maximumBet) throw new Error(`La mise maximale par tour est de ${state.maximumBet} jetons.`);
    const oldBet = state.currentBet;
    commit(target - state.streetBets[actorId]);
    if (state.streetBets[actorId] <= oldBet) throw new Error("Jetons insuffisants pour relancer.");
    state.minRaise = state.streetBets[actorId] - oldBet;
    state.currentBet = state.streetBets[actorId];
    state.actedPlayerIds = [];
    appendLog(state, actorId, `relance à ${state.currentBet}.`, "bet");
  } else if (action.type === "all-in") {
    if ((state.streetBets[actorId] ?? 0) + state.stacks[actorId] > state.maximumBet) throw new Error(`Le tapis dépasse la mise maximale de ${state.maximumBet} jetons.`);
    const oldBet = state.currentBet;
    commit(state.stacks[actorId]);
    if (state.streetBets[actorId] > oldBet) {
      const raiseSize = state.streetBets[actorId] - oldBet;
      if (raiseSize >= state.minRaise) state.actedPlayerIds = [];
      state.minRaise = Math.max(state.minRaise, raiseSize);
      state.currentBet = state.streetBets[actorId];
    }
    appendLog(state, actorId, `fait tapis à ${state.streetBets[actorId]}.`, "bet");
  } else throw new Error("Action de poker inconnue.");
  state.actedPlayerIds = [...new Set([...state.actedPlayerIds, actorId])];
  advanceStreet(state);
  if (state.finished || state.nextHandAt || state.currentPlayerIndex < 0) return state;
  if (!state.finished && !state.actedPlayerIds.length) {
    if (!action.automatic) resolveAutoCheckFold(state);
    return state;
  }
  const next = nextPlayerIndex(state, playerIndex);
  if (next >= 0) {
    setPokerTurn(state, next);
  }
  advanceStreet(state);
  if (!action.automatic) resolveAutoCheckFold(state);
  return state;
}

export function texasHoldemBotAction(state, bot) {
  const toCall = Math.max(0, state.currentBet - (state.streetBets?.[bot.id] ?? 0));
  if (!toCall) return { type: "check" };
  if (toCall > (state.stacks?.[bot.id] ?? 0)) return { type: "all-in" };
  return Math.random() < 0.14 ? { type: "fold" } : { type: "call" };
}
