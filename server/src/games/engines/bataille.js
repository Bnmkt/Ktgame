import { cardValue, createDeck, shuffle } from "../shared.js";
import { normalizeBattleModifiers } from "../modifiers.js";
import { appendLog, cardText, publicPlayers } from "../engine-context.js";

function insertCardsRandomly(deck, cards = []) {
  for (const source of shuffle(cards)) {
    const card = { rank: source.rank, suit: source.suit, ...(source.unseenAcquiredBy ? { unseenAcquiredBy: source.unseenAcquiredBy } : {}) };
    deck.splice(Math.floor(Math.random() * (deck.length + 1)), 0, card);
  }
}

function cardKey(card) {
  return `${card.rank}-${card.suit}`;
}

function ensureKnowledge(state) {
  state.deckKnowledge ??= {};
  for (const viewer of state.players) {
    state.deckKnowledge[viewer.id] ??= {};
    for (const owner of state.players) state.deckKnowledge[viewer.id][owner.id] ??= [];
  }
}

function rememberDeckCards(state, viewerId, deckOwnerId, cards) {
  ensureKnowledge(state);
  const keys = cards.map(cardKey);
  for (const ownerId of Object.keys(state.deckKnowledge[viewerId])) state.deckKnowledge[viewerId][ownerId] = state.deckKnowledge[viewerId][ownerId].filter((key) => !keys.includes(key));
  state.deckKnowledge[viewerId][deckOwnerId] = [...new Set([...state.deckKnowledge[viewerId][deckOwnerId], ...keys])];
}

function updateKnowledgeAfterDraw(state, actorId, card) {
  ensureKnowledge(state);
  const key = cardKey(card);
  for (const ownerId of Object.keys(state.deckKnowledge[actorId])) state.deckKnowledge[actorId][ownerId] = state.deckKnowledge[actorId][ownerId].filter((entry) => entry !== key);
}

function laneLabel(laneId) {
  if (laneId === "center") return "centrale";
  return laneId === "left" ? "A" : "B";
}

function comboScore(cards) {
  const base = cards.reduce((total, card) => total + cardValue(card.rank), 0);
  const rankCounts = cards.reduce((counts, card) => ({ ...counts, [card.rank]: (counts[card.rank] ?? 0) + 1 }), {});
  const pair = cards.length >= 2 && Object.values(rankCounts).some((count) => count >= 2);
  const flush = cards.length >= 2 && cards.every((card) => card.suit === cards[0].suit);
  const values = [...new Set(cards.map((card) => card.rank === "A" ? 1 : cardValue(card.rank)))].sort((left, right) => left - right);
  const straight = values.length >= 2 && values.some((value, index) => index > 0 && value === values[index - 1] + 1);
  const combos = [pair && "Paire", flush && "Couleur", straight && "Suite"].filter(Boolean);
  const multiplier = 1 + combos.length * 0.5;
  return { base, multiplier, total: base * multiplier, combos };
}

export function battleScoreFor(cards, scoringMode) {
  const scoringCards = scoringMode === "high-card" ? cards.slice(-1) : cards.slice(-2);
  const latest = scoringCards.at(-1);
  if (scoringMode === "pile-sum") {
    const total = scoringCards.reduce((sum, card) => sum + cardValue(card.rank), 0);
    return { base: total, multiplier: 1, total, combos: [], cardCount: scoringCards.length, label: scoringCards.length === 2 ? `${cardText(scoringCards[0])} + ${cardText(scoringCards[1])} = ${total}` : `${cardText(latest)} = ${total}` };
  }
  if (scoringMode === "poker-combo") {
    const score = comboScore(scoringCards);
    return { ...score, cardCount: scoringCards.length, label: score.combos.length ? `${score.base} × ${score.multiplier}` : `Somme ${score.base}` };
  }
  const total = cardValue(latest.rank);
  return { base: total, multiplier: 1, total, combos: [], cardCount: 1, label: `${cardText(latest)} · ${total} pts` };
}

function ownedCardCount(state, playerId) {
  const inDeck = state.piles?.[playerId]?.length ?? 0;
  const onLanes = (state.battleLanes ?? []).reduce((total, lane) => total + lane.cards.filter((card) => card.ownerId === playerId).length, 0);
  const committed = Object.values(state.pendingChoices ?? {}).filter((choice) => choice.playerId === playerId).length;
  const drawn = state.drawnCards?.[playerId] ? 1 : 0;
  return inDeck + onLanes + committed + drawn;
}

function refreshCardCounts(state) {
  state.cardCounts = Object.fromEntries(state.players.map((player) => [player.id, ownedCardCount(state, player.id)]));
}

function playableLanes(state) {
  const forcedLane = (state.battleLanes ?? []).find((lane) => lane.tie)?.id;
  return forcedLane ? [forcedLane] : (state.battleLanes ?? []).map((lane) => lane.id);
}

function setNextActor(state) {
  const nextIndex = state.players.findIndex((player) => !(state.submittedPlayerIds ?? []).includes(player.id) && ((state.piles?.[player.id]?.length ?? 0) > 0 || state.drawnCards?.[player.id]));
  state.currentPlayerIndex = nextIndex >= 0 ? nextIndex : 0;
}

function resolveRound(state) {
  const resolution = { round: state.round, events: [] };
  const transfers = [];
  const scoringMode = state.modifiers?.scoringMode ?? "high-card";
  const choicesByLane = new Map();
  for (const choice of Object.values(state.pendingChoices)) {
    const lane = state.battleLanes.find((entry) => entry.id === choice.laneId);
    lane.cards.push({ ...choice.card, ownerId: choice.playerId, placedRound: state.round });
    choicesByLane.set(choice.laneId, [...(choicesByLane.get(choice.laneId) ?? []), choice.playerId]);
  }
  for (const lane of state.battleLanes) {
    const owners = [...new Set(lane.cards.map((card) => card.ownerId))];
    const facingOwners = [...new Set(choicesByLane.get(lane.id) ?? [])];
    // Une confrontation exige que les deux camps aient choisi la même pile
    // pendant cette manche, indépendamment des cartes déjà présentes ailleurs.
    if (facingOwners.length >= 2) {
      const [firstId, secondId] = owners;
      const cardsByOwner = Object.fromEntries(owners.map((ownerId) => [ownerId, lane.cards.filter((card) => card.ownerId === ownerId)]));
      const calculations = Object.fromEntries(owners.map((ownerId) => [ownerId, battleScoreFor(cardsByOwner[ownerId], scoringMode)]));
      const revealedByOwner = Object.fromEntries(owners.map((ownerId) => [ownerId, cardsByOwner[ownerId].slice(-(calculations[ownerId].cardCount ?? 1))]));
      for (const cards of Object.values(revealedByOwner)) for (const card of cards) card.revealedToAll = true;
      const revealedCards = Object.fromEntries(owners.map((ownerId) => [ownerId, revealedByOwner[ownerId].map((card) => ({ rank: card.rank, suit: card.suit }))]));
      if (calculations[firstId].total === calculations[secondId].total) {
        lane.tie = true;
        lane.idleRounds = 0;
        lane.resolving = "tie";
        resolution.events.push({ type: "tie", laneId: lane.id, cards: revealedCards, calculations, stake: lane.cards.length });
        appendLog(state, firstId, `déclenche une bataille sur la pile ${laneLabel(lane.id)}: ${calculations[firstId].label} contre ${calculations[secondId].label}.`, "result");
      } else {
        const winnerId = calculations[firstId].total > calculations[secondId].total ? firstId : secondId;
        const wonCards = lane.cards.length;
        const unseenWonCards = lane.cards.filter((card) => card.ownerId !== winnerId && !card.revealedToAll).length;
        transfers.push({ type: "capture", laneId: lane.id, winnerId });
        lane.resolving = "capture";
        resolution.events.push({ type: "battle", laneId: lane.id, cards: revealedCards, calculations, winnerId, wonCards, unseenWonCards });
        appendLog(state, winnerId, `remporte ${wonCards} carte(s) sur la pile ${laneLabel(lane.id)} avec ${calculations[winnerId].label}.`, "result");
        lane.idleRounds = 0;
        lane.tie = false;
      }
    } else if (lane.cards.length) {
      lane.idleRounds += 1;
      if (lane.idleRounds >= (state.modifiers?.returnAfterRounds ?? 3)) {
        const ownerId = lane.cards[0].ownerId;
        const returned = lane.cards.length;
        transfers.push({ type: "return", laneId: lane.id });
        lane.resolving = "return";
        resolution.events.push({ type: "return", laneId: lane.id, reason: "timeout", ownerId, count: returned });
        appendLog(state, ownerId, `récupère ${returned} carte(s) restée(s) ${state.modifiers?.returnAfterRounds ?? 3} manche(s) sans adversaire sur la pile ${laneLabel(lane.id)}.`, "result");
        lane.idleRounds = 0;
        lane.tie = false;
      }
    } else {
      lane.idleRounds = 0;
      lane.tie = false;
    }
  }
  state.pendingChoices = {};
  refreshCardCounts(state);
  for (const player of state.players) {
    if ((state.piles[player.id]?.length ?? 0) > 0 || ownedCardCount(state, player.id) <= 0) continue;
    for (const lane of state.battleLanes) {
      const owners = [...new Set(lane.cards.map((card) => card.ownerId))];
      if (owners.length !== 1 || owners[0] !== player.id || transfers.some((transfer) => transfer.laneId === lane.id)) continue;
      transfers.push({ type: "return", laneId: lane.id });
      lane.resolving = "return";
      resolution.events.push({ type: "return", laneId: lane.id, reason: "no-draw", ownerId: player.id, count: lane.cards.length });
      appendLog(state, player.id, `récupère les cartes de la pile ${laneLabel(lane.id)}, faute de pioche disponible.`, "result");
    }
  }
  state.lastResolution = resolution;
  if (resolution.events.length) {
    state.pendingTransfers = transfers;
    state.resolutionEndsAt = Date.now() + (state.resolutionDurationMs ?? 5000);
    state.botThinking = {};
    return;
  }
  state.submittedPlayerIds = [];
  state.round += 1;
  setNextActor(state);
}

export function tickBattleState(state, now = Date.now()) {
  if (state?.gameId !== "bataille" || !state.resolutionEndsAt || now < state.resolutionEndsAt) return false;
  ensureKnowledge(state);
  for (const transfer of state.pendingTransfers ?? []) {
    const lane = state.battleLanes.find((entry) => entry.id === transfer.laneId);
    if (!lane) continue;
    if (transfer.type === "capture") {
      const publicCards = lane.cards.filter((card) => card.revealedToAll);
      const previousOwners = [...new Set(lane.cards.map((card) => card.ownerId).filter((ownerId) => ownerId !== transfer.winnerId))];
      for (const viewer of state.players) for (const ownerId of previousOwners) state.deckKnowledge[viewer.id][ownerId] = [];
      for (const viewer of state.players) rememberDeckCards(state, viewer.id, transfer.winnerId, publicCards);
      rememberDeckCards(state, transfer.winnerId, transfer.winnerId, lane.cards.filter((card) => card.ownerId === transfer.winnerId));
      for (const ownerId of previousOwners) rememberDeckCards(state, ownerId, transfer.winnerId, lane.cards.filter((card) => card.ownerId === ownerId));
      for (const card of lane.cards) {
        if (card.ownerId !== transfer.winnerId && !card.revealedToAll) card.unseenAcquiredBy = transfer.winnerId;
        else delete card.unseenAcquiredBy;
      }
      insertCardsRandomly(state.piles[transfer.winnerId], lane.cards);
    } else {
      const cardsByOwner = new Map();
      for (const card of lane.cards) cardsByOwner.set(card.ownerId, [...(cardsByOwner.get(card.ownerId) ?? []), card]);
      for (const [ownerId, cards] of cardsByOwner) {
        rememberDeckCards(state, ownerId, ownerId, cards);
        insertCardsRandomly(state.piles[ownerId], cards);
      }
    }
    lane.cards = [];
    lane.idleRounds = 0;
    lane.tie = false;
    delete lane.resolving;
  }
  for (const lane of state.battleLanes) delete lane.resolving;
  state.pendingTransfers = [];
  state.resolutionEndsAt = null;
  state.submittedPlayerIds = [];
  state.round += 1;
  if (state.lastResolution) state.lastResolution.events = state.lastResolution.events.map((event) => {
    const { cards: _cards, ...summary } = event;
    return summary;
  });
  refreshCardCounts(state);
  const eliminated = state.players.find((player) => state.cardCounts[player.id] <= 0);
  if (eliminated) {
    state.winners = state.players.filter((player) => player.id !== eliminated.id).map((player) => player.id);
    state.finished = true;
  }
  setNextActor(state);
  return true;
}

export function createBattleState(players, options = {}) {
  const tablePlayers = publicPlayers(players.slice(0, 2));
  if (tablePlayers.length !== 2) throw new Error("La Bataille nécessite exactement deux joueurs.");
  const deck = shuffle(createDeck());
  const modifiers = normalizeBattleModifiers(options.battleModifiers);
  const laneIds = modifiers.pileMode === "single" ? ["center"] : ["left", "right"];
  const state = { gameId: "bataille", players: tablePlayers, modifiers, piles: { [tablePlayers[0].id]: deck.slice(0, 26), [tablePlayers[1].id]: deck.slice(26) }, battleLanes: laneIds.map((id) => ({ id, cards: [], idleRounds: 0, tie: false })), drawnCards: {}, pendingChoices: {}, submittedPlayerIds: [], pendingTransfers: [], resolutionEndsAt: null, resolutionDurationMs: 5000, deckKnowledge: Object.fromEntries(tablePlayers.map((viewer) => [viewer.id, Object.fromEntries(tablePlayers.map((owner) => [owner.id, []]))])), botThinking: {}, round: 1, lastResolution: null, currentPlayerIndex: 0, logs: [], finished: false, winners: [] };
  refreshCardCounts(state);
  return state;
}

function migrateLegacyState(state) {
  if (state.battleLanes) return;
  state.battleLanes = [{ id: "left", cards: [], idleRounds: 0, tie: false }, { id: "right", cards: [], idleRounds: 0, tie: false }];
  state.pendingChoices = {};
  state.submittedPlayerIds = [];
  state.drawnCards = {};
  state.botThinking = {};
  state.round = 1;
  state.lastResolution = null;
  for (const [index, card] of (state.warPile ?? []).entries()) state.piles[state.players[index % state.players.length].id].push(card);
  delete state.warPile;
  delete state.lastBattle;
  refreshCardCounts(state);
}

export function applyBattleAction(state, actorId, action) {
  migrateLegacyState(state);
  state.modifiers = normalizeBattleModifiers(state.modifiers);
  state.pendingTransfers ??= [];
  state.resolutionEndsAt ??= null;
  state.resolutionDurationMs ??= 5000;
  ensureKnowledge(state);
  if (state.resolutionEndsAt) throw new Error("La confrontation est en cours de résolution.");
  if (!state.players.some((player) => player.id === actorId)) throw new Error("Joueur absent de cette partie.");
  if (state.submittedPlayerIds.includes(actorId)) throw new Error("Ton choix est déjà enregistré pour cette manche.");
  state.drawnCards ??= {};
  state.botThinking ??= {};
  if (action.type === "draw") {
    if (state.drawnCards[actorId]) throw new Error("Tu as déjà pioché ta carte.");
    const card = state.piles[actorId].shift();
    if (!card) throw new Error("Tu n'as plus de carte à piocher.");
    updateKnowledgeAfterDraw(state, actorId, card);
    delete card.unseenAcquiredBy;
    state.drawnCards[actorId] = card;
    delete state.botThinking[actorId];
    appendLog(state, actorId, "pioche la carte du dessus et réfléchit à son placement.");
    refreshCardCounts(state);
    setNextActor(state);
    return state;
  }
  if (action.type !== "place") throw new Error("Pioche d'abord une carte, puis choisis une des deux piles.");
  const card = state.drawnCards[actorId];
  if (!card) throw new Error("Pioche d'abord ta carte avant de choisir une pile.");
  const laneId = String(action.laneId ?? "");
  if (!playableLanes(state).includes(laneId)) throw new Error("Cette pile n'est pas disponible pour ce choix.");
  state.pendingChoices[actorId] = { playerId: actorId, laneId, card };
  delete state.drawnCards[actorId];
  delete state.botThinking[actorId];
  state.submittedPlayerIds.push(actorId);
  appendLog(state, actorId, `engage une carte face cachée sur la pile ${laneLabel(laneId)}.`);
  refreshCardCounts(state);
  if (state.submittedPlayerIds.length >= state.players.length) resolveRound(state);
  else setNextActor(state);
  return state;
}

export function battleBotAction(state, bot) {
  if (!state.drawnCards?.[bot.id]) return { type: "draw" };
  const forcedLane = state.battleLanes?.find((lane) => lane.tie)?.id;
  const available = forcedLane ? [forcedLane] : (state.battleLanes ?? []).map((lane) => lane.id);
  return available.length ? { type: "place", laneId: available[Math.floor(Math.random() * available.length)] } : null;
}
