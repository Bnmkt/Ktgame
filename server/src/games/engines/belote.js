import { createDeck, shuffle } from "../shared.js";
import { normalizeGameModifiers } from "../modifiers.js";
import { appendLog, cardText, publicPlayers } from "../engine-context.js";
import { beloteCardPoints, strongestPlay, strongerCard, trumpOrder } from "../vendor/belote-cards.js";

const suits = ["S", "H", "D", "C"];
const sequenceOrder = ["7", "8", "9", "10", "J", "Q", "K", "A"];
const cardKey = (card) => `${card.rank}-${card.suit}`;
export const beloteTeam = (state, id) => state.players.findIndex((player) => player.id === id) % 2;
const nextSeat = (index) => (index + 1) % 4;

export function beloteLegalCards(state, playerId) {
  if (state.phase !== "play" || state.finished || state.players[state.currentPlayerIndex]?.id !== playerId) return [];
  const hand = state.hands[playerId] ?? [];
  const lead = state.trick[0]?.card;
  if (!lead) return hand;
  const winning = strongestPlay(state.trick, state.trump);
  const partnerWinning = beloteTeam(state, winning.playerId) === beloteTeam(state, playerId);
  const following = hand.filter((card) => card.suit === lead.suit);
  const trumps = hand.filter((card) => card.suit === state.trump);
  const rising = trumps.filter((card) => strongerCard(winning.card, card, state.trump));
  if (following.length) return lead.suit === state.trump && !partnerWinning && rising.length ? rising : following;
  if (!trumps.length) return hand;
  if (!partnerWinning) return rising.length ? rising : trumps;
  return hand;
}

export function beloteAnnouncements(hand, trump) {
  const candidates = [];
  for (const rank of sequenceOrder.filter((value) => !["7", "8"].includes(value))) {
    const cards = hand.filter((card) => card.rank === rank);
    if (cards.length === 4) {
      const points = rank === "J" ? 200 : rank === "9" ? 150 : 100;
      candidates.push({ label: `Carre de ${rank}`, points, strength: 1000 + points * 10 + sequenceOrder.indexOf(rank), cards });
    }
  }
  for (const suit of suits) {
    for (let start = 0; start <= 5; start++) {
      const cards = [];
      for (let end = start; end < 8; end++) {
        const card = hand.find((entry) => entry.suit === suit && entry.rank === sequenceOrder[end]);
        if (!card) break;
        cards.push(card);
        if (cards.length >= 3) candidates.push({ label: cards.length === 3 ? "Tierce" : cards.length === 4 ? "Cinquante" : "Cent", points: cards.length === 3 ? 20 : cards.length === 4 ? 50 : 100, strength: cards.length * 100 + end * 2 + Number(suit === trump), cards: [...cards] });
      }
    }
  }
  // At most eight cards: exhaustively choose non-overlapping announcements.
  let best = [];
  let bestValue = -1;
  function choose(index, selected, used, points) {
    const strength = Math.max(0, ...selected.map((entry) => entry.strength));
    if (points > bestValue || points === bestValue && strength > Math.max(0, ...best.map((entry) => entry.strength))) { best = selected; bestValue = points; }
    for (let i = index; i < candidates.length; i++) {
      const candidate = candidates[i];
      if (candidate.cards.some((card) => used.has(cardKey(card)))) continue;
      choose(i + 1, [...selected, candidate], new Set([...used, ...candidate.cards.map(cardKey)]), points + candidate.points);
    }
  }
  choose(0, [], new Set(), 0);
  return best;
}

function deal(state) {
  state.round += 1;
  state.deck = shuffle(createDeck().filter((card) => sequenceOrder.includes(card.rank)));
  state.hands = Object.fromEntries(state.players.map((player) => [player.id, []]));
  for (const count of [3, 2]) for (let offset = 1; offset <= 4; offset++) {
    state.hands[state.players[(state.dealerIndex + offset) % 4].id].push(...state.deck.splice(0, count));
  }
  state.turnedCard = state.deck.shift();
  state.phase = "bid";
  state.bidRound = 1;
  state.passes = 0;
  state.currentPlayerIndex = nextSeat(state.dealerIndex);
  state.trump = null;
  state.takerId = null;
  state.trick = [];
  state.lastTrick = null;
  state.trickNumber = 1;
  state.trickCounts = [0, 0];
  state.cardPoints = [0, 0];
  state.belotePoints = [0, 0];
  state.beloteHolders = {};
  state.announcements = {};
  state.announcementPoints = [0, 0];
  state.announcementsRevealed = false;
  appendLog(state, state.players[state.dealerIndex].id, `distribue la donne ${state.round}.`, "round");
}

export function createBeloteState(players, options = {}) {
  if (players.length !== 4) throw new Error("La belote exige quatre joueurs, IA comprises.");
  const modifiers = normalizeGameModifiers("belote", options.gameModifiers);
  const state = { gameId: "belote", players: publicPlayers(players), modifiers, targetScore: modifiers.targetScore * (modifiers.frenchRules ? 10 : 1), teamScores: [0, 0], pendingPoints: 0, round: 0, dealerIndex: 3, logs: [], finished: false, winners: [] };
  deal(state);
  return state;
}

function completeHands(state, takerId) {
  state.hands[takerId].push(state.turnedCard);
  for (let offset = 1; offset <= 4; offset++) {
    const hand = state.hands[state.players[(state.dealerIndex + offset) % 4].id];
    hand.push(...state.deck.splice(0, 8 - hand.length));
  }
}

function take(state, actorId, suit) {
  if (!suits.includes(suit)) throw new Error("Atout invalide.");
  if (state.phase === "bid" && (state.bidRound === 1 ? suit !== state.turnedCard.suit : suit === state.turnedCard.suit)) throw new Error("Cet atout n'est pas disponible a ce tour de prise.");
  if (state.phase === "bid") completeHands(state, actorId);
  state.takerId = actorId;
  state.trump = suit;
  state.phase = "play";
  state.currentPlayerIndex = nextSeat(state.dealerIndex);
  for (const player of state.players) {
    const hand = state.hands[player.id];
    state.announcements[player.id] = state.modifiers.announcements ? beloteAnnouncements(hand, suit) : [];
    if (["K", "Q"].every((rank) => hand.some((card) => card.suit === suit && card.rank === rank))) state.beloteHolders[player.id] = { first: null };
  }
  appendLog(state, actorId, `prend a ${cardText({ rank: "", suit })}.`, "result");
}

function revealAnnouncements(state) {
  state.announcementsRevealed = true;
  const strength = [0, 0];
  for (const player of state.players) strength[beloteTeam(state, player.id)] = Math.max(strength[beloteTeam(state, player.id)], ...state.announcements[player.id].map((entry) => entry.strength));
  const bestTeam = strength[0] === strength[1] ? -1 : strength[0] > strength[1] ? 0 : 1;
  for (const player of state.players) for (const announcement of state.announcements[player.id]) {
    announcement.valid = beloteTeam(state, player.id) === bestTeam;
    if (announcement.valid) state.announcementPoints[bestTeam] += announcement.points;
    appendLog(state, player.id, `${announcement.label} : ${announcement.cards.map(cardText).join(", ")} (${announcement.valid ? `+${announcement.points}` : "annule"}).`, "result");
  }
}

export function scoreBeloteDeal(state) {
  const taker = beloteTeam(state, state.takerId), defender = 1 - taker;
  const belote = state.belotePoints;
  const announcements = state.announcementPoints;
  const raw = state.cardPoints.map((points, team) => points + announcements[team] + belote[team]);
  const capotTeam = state.trickCounts.findIndex((count) => count === 8);
  const awarded = [0, 0];
  const french = state.modifiers.frenchRules;
  const unit = french ? 1 : 10;
  const total = capotTeam >= 0 ? (french ? 252 : 25) : (french ? 162 : 16);
  let winner = null;
  let result;
  if (capotTeam >= 0 || raw[taker] < raw[defender]) {
    winner = capotTeam >= 0 ? capotTeam : defender;
    awarded[winner] = total + (announcements[0] + announcements[1]) / unit;
    result = capotTeam >= 0 ? "capot" : "chute";
  } else {
    const defense = french ? state.cardPoints[defender] : Math.floor((state.cardPoints[defender] + 4) / 10);
    awarded[defender] = defense + announcements[defender] / unit;
    awarded[taker] = total - defense + announcements[taker] / unit;
    if (raw[taker] === raw[defender]) {
      state.pendingPoints += awarded[taker];
      awarded[taker] = 0;
      result = "litige";
    } else { winner = taker; result = "reussi"; }
  }
  if (winner !== null) { awarded[winner] += state.pendingPoints; state.pendingPoints = 0; }
  for (let team = 0; team < 2; team++) { awarded[team] += belote[team] / unit; state.teamScores[team] += awarded[team]; }
  state.lastRound = { round: state.round, result, takerTeam: taker, cardPoints: [...state.cardPoints], announcementPoints: [...announcements], belotePoints: [...belote], awarded, pendingPoints: state.pendingPoints };
  appendLog(state, state.takerId, `contrat ${result} : equipe 1 +${awarded[0]}, equipe 2 +${awarded[1]}${state.pendingPoints ? `, ${state.pendingPoints} en litige` : ""}.`, "result");
  const best = Math.max(...state.teamScores);
  if (best >= state.targetScore && state.teamScores[0] !== state.teamScores[1] && result !== "litige") {
    state.finished = true;
    state.phase = "finished";
    state.winners = state.players.filter((player) => state.teamScores[beloteTeam(state, player.id)] === best).map((player) => player.id);
  } else {
    state.phase = "round-end";
    const human = state.players.findIndex((player) => !player.isBot);
    state.currentPlayerIndex = human >= 0 ? human : nextSeat(state.dealerIndex);
  }
}

export function applyBeloteAction(state, actorId, action) {
  if (state.finished) return state;
  if (state.players[state.currentPlayerIndex]?.id !== actorId) throw new Error("Ce n'est pas ton tour.");
  if (state.phase === "round-end" && action.type === "next-deal") { state.dealerIndex = nextSeat(state.dealerIndex); deal(state); return state; }
  if (["bid", "forced-bid"].includes(state.phase) && action.type === "take") { take(state, actorId, action.suit); return state; }
  if (state.phase === "bid" && action.type === "pass") {
    appendLog(state, actorId, "passe la prise.");
    state.passes++;
    state.currentPlayerIndex = nextSeat(state.currentPlayerIndex);
    if (state.passes === 4) state.bidRound = 2;
    if (state.passes === 8) {
      if (state.modifiers.frenchRules) { state.dealerIndex = nextSeat(state.dealerIndex); deal(state); }
      else {
        state.phase = "forced-bid";
        const forcedId = state.players[state.currentPlayerIndex].id;
        completeHands(state, forcedId);
        appendLog(state, forcedId, "doit choisir un atout apres huit passes.", "round");
      }
    }
    return state;
  }
  if (state.phase !== "play" || action.type !== "play") throw new Error("Action indisponible pendant cette phase.");
  const legal = beloteLegalCards(state, actorId);
  const card = legal.find((entry) => entry.rank === action.card?.rank && entry.suit === action.card?.suit);
  if (!card) throw new Error("Carte interdite : fournis la couleur, coupe ou monte a l'atout selon le pli.");
  if (state.trickNumber === 1) for (const announcement of state.announcements[actorId]) appendLog(state, actorId, `annonce ${announcement.label}.`);
  const holder = state.beloteHolders[actorId];
  if (holder && card.suit === state.trump && ["K", "Q"].includes(card.rank)) {
    if (!holder.first) { holder.first = card.rank; appendLog(state, actorId, !state.modifiers.frenchRules && card.rank === "Q" ? "joue la dame avant le roi : belote non marquee." : "annonce belote."); }
    else if (state.modifiers.frenchRules || holder.first === "K") { state.belotePoints[beloteTeam(state, actorId)] += 20; appendLog(state, actorId, "annonce rebelote (+20).", "result"); }
  }
  state.hands[actorId] = state.hands[actorId].filter((entry) => entry !== card);
  state.trick.push({ playerId: actorId, card });
  appendLog(state, actorId, `joue ${cardText(card)}.`);
  state.currentPlayerIndex = nextSeat(state.currentPlayerIndex);
  if (state.trick.length === 4) {
    const winning = strongestPlay(state.trick, state.trump);
    const team = beloteTeam(state, winning.playerId);
    state.trickCounts[team]++;
    const points = state.trick.reduce((sum, play) => sum + beloteCardPoints(play.card, state.trump), 0) + (state.trickNumber === 8 ? state.trickCounts[team] === 8 ? 100 : 10 : 0);
    state.cardPoints[team] += points;
    state.lastTrick = { plays: state.trick, winnerId: winning.playerId, points };
    appendLog(state, winning.playerId, `remporte le pli ${state.trickNumber} (+${points}).`, "result");
    state.trick = [];
    state.currentPlayerIndex = state.players.findIndex((player) => player.id === winning.playerId);
    if (state.trickNumber === 1) revealAnnouncements(state);
    if (state.trickNumber === 8) scoreBeloteDeal(state);
    else state.trickNumber++;
  }
  return state;
}

export function beloteBotAction(state, bot) {
  if (state.phase === "round-end") return { type: "next-deal" };
  if (["bid", "forced-bid"].includes(state.phase)) {
    const choices = suits.filter((suit) => state.phase === "forced-bid" || (state.bidRound === 1 ? suit === state.turnedCard.suit : suit !== state.turnedCard.suit));
    const hand = [...state.hands[bot.id], ...(state.phase === "bid" ? [state.turnedCard] : [])];
    const strength = (suit) => hand.reduce((sum, card) => sum + (card.suit === suit ? beloteCardPoints(card, suit) + 6 : card.rank === "A" ? 8 : 0), 0);
    choices.sort((a, b) => strength(b) - strength(a));
    return state.phase === "forced-bid" || strength(choices[0]) >= 42 ? { type: "take", suit: choices[0] } : { type: "pass" };
  }
  const legal = [...beloteLegalCards(state, bot.id)];
  if (!legal.length) return null;
  const winning = strongestPlay(state.trick, state.trump);
  const partnerWinning = winning && beloteTeam(state, winning.playerId) === beloteTeam(state, bot.id);
  const value = (card) => beloteCardPoints(card, state.trump) + (card.suit === state.trump ? trumpOrder.indexOf(card.rank) : 0);
  const wins = winning ? legal.filter((card) => strongerCard(winning.card, card, state.trump)) : [];
  const choices = !partnerWinning && wins.length ? wins : legal;
  choices.sort((a, b) => (partnerWinning ? -1 : 1) * (value(a) - value(b)));
  // Preserve the Belgian belote when both honours are legally playable.
  let card = choices[0];
  if (!state.modifiers.frenchRules && state.beloteHolders[bot.id]?.first === null && card.suit === state.trump && card.rank === "Q") card = legal.find((entry) => entry.suit === state.trump && entry.rank === "K") ?? card;
  return { type: "play", card };
}

export function replaceBelotePlayer(state, oldId, replacement) {
  const index = state.players.findIndex((player) => player.id === oldId);
  if (index < 0) return;
  state.players[index] = publicPlayers([replacement])[0];
  for (const key of ["hands", "announcements", "beloteHolders"]) if (Object.hasOwn(state[key], oldId)) { state[key][replacement.id] = state[key][oldId]; delete state[key][oldId]; }
  if (state.takerId === oldId) state.takerId = replacement.id;
  for (const play of [...state.trick, ...(state.lastTrick?.plays ?? [])]) if (play.playerId === oldId) play.playerId = replacement.id;
  if (state.lastTrick?.winnerId === oldId) state.lastTrick.winnerId = replacement.id;
  if (state.phase === "round-end") state.currentPlayerIndex = Math.max(0, state.players.findIndex((player) => !player.isBot));
  appendLog(state, replacement.id, "reprend la place du joueur parti.", "round");
}

export function publicBeloteState(state, viewerId) {
  return {
    ...state, deck: Array(state.deck.length).fill(null),
    hands: Object.fromEntries(Object.entries(state.hands).map(([id, hand]) => [id, id === viewerId ? hand : Array(hand.length).fill(null)])),
    beloteHolders: undefined,
    announcements: Object.fromEntries(Object.entries(state.announcements).map(([id, entries]) => [id, state.announcementsRevealed || id === viewerId ? entries : []])),
    legalCards: beloteLegalCards(state, viewerId)
  };
}
