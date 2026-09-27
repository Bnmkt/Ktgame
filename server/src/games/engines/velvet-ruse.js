import { createDeck, currentPlayer, nextTurn, shuffle } from "../shared.js";
import { normalizeGameModifiers } from "../modifiers.js";
import { appendLog, cardText, publicPlayers } from "../engine-context.js";

function createVelvetDeck(minimumCards) {
  const decks = Math.max(1, Math.ceil(minimumCards / 52));
  return shuffle(Array.from({ length: decks }, (_, deckId) => createDeck().map((card) => ({ ...card, deckId }))).flat());
}

function claimMatchesEdict(claim, edict, rule) {
  if (!claim || !edict) return false;
  if (rule === "suit-only") return claim.suit === edict.suit;
  if (rule === "rank-only") return claim.rank === edict.rank;
  return claim.suit === edict.suit || claim.rank === edict.rank;
}

function claimIsTruthful(entry) {
  return entry?.actual?.rank === entry?.claim?.rank && entry?.actual?.suit === entry?.claim?.suit;
}

function refillDeck(state) {
  if (state.deck.length || state.discard.length <= 1) return;
  const top = state.discard.pop();
  state.deck = shuffle(state.discard.splice(0));
  state.discard = top ? [top] : [];
  appendLog(state, "dealer", "mélange la défausse pour reformer la pioche.");
}

function checkWinner(state) {
  const best = Math.max(...Object.values(state.prestige));
  if (best < state.modifiers.targetPrestige) return false;
  state.winners = state.players.filter((player) => state.prestige[player.id] === best).map((player) => player.id);
  state.finished = true;
  return true;
}

function auditDossier(state) {
  const entries = state.dossier.map((entry) => ({ ...entry, truthful: claimIsTruthful(entry) }));
  for (const entry of entries) {
    const delta = entry.truthful ? 1 : -2;
    state.prestige[entry.playerId] = Math.max(0, (state.prestige[entry.playerId] ?? 0) + delta);
    state.stats[entry.playerId].truthfulAudits += entry.truthful ? 1 : 0;
    state.stats[entry.playerId].hiddenLies += entry.truthful ? 0 : 1;
    state.discard.push(entry.actual);
  }
  state.lastAudit = { entries: entries.map((entry) => ({ playerId: entry.playerId, actual: entry.actual, claim: entry.claim, truthful: entry.truthful })) };
  state.dossier = [];
  appendLog(state, "dealer", `ouvre le dossier: ${entries.filter((entry) => entry.truthful).length} déclaration(s) exacte(s), ${entries.filter((entry) => !entry.truthful).length} bluff(s).`, "result");
}

function advanceTurn(state) {
  nextTurn(state);
  state.phase = state.pendingClaim ? "decision" : "draw";
  state.drawnFrom = null;
}

export function createVelvetRuseState(players, options = {}) {
  const tablePlayers = publicPlayers(players.slice(0, 8));
  const modifiers = normalizeGameModifiers("velvet-ruse", options.gameModifiers);
  const deck = createVelvetDeck(tablePlayers.length * modifiers.handSize + modifiers.dossierSize + 12);
  const hands = Object.fromEntries(tablePlayers.map((player) => [player.id, Array.from({ length: modifiers.handSize }, () => deck.pop())]));
  const edict = deck.pop();
  const discard = [deck.pop()];
  return {
    gameId: "velvet-ruse",
    players: tablePlayers,
    modifiers,
    deck,
    discard,
    edict,
    hands,
    prestige: Object.fromEntries(tablePlayers.map((player) => [player.id, 0])),
    dossier: [],
    pendingClaim: null,
    phase: "draw",
    drawnFrom: null,
    lastChallenge: null,
    lastAudit: null,
    stats: Object.fromEntries(tablePlayers.map((player) => [player.id, { bluffsCaught: 0, successfulBluffs: 0, truthfulAudits: 0, hiddenLies: 0 }])),
    currentPlayerIndex: 0,
    logs: [],
    finished: false,
    winners: []
  };
}

export function applyVelvetRuseAction(state, actorId, action) {
  if (currentPlayer(state).id !== actorId) throw new Error("Ce n'est pas ton tour.");
  if (state.phase === "decision") {
    const pending = state.pendingClaim;
    if (!pending || pending.playerId === actorId) throw new Error("Aucune déclaration adverse à examiner.");
    if (action.type === "trust") {
      state.dossier.push(pending);
      state.prestige[pending.playerId] = (state.prestige[pending.playerId] ?? 0) + 1;
      if (!claimIsTruthful(pending)) state.stats[pending.playerId].successfulBluffs += 1;
      appendLog(state, actorId, `laisse passer la déclaration ${cardText(pending.claim)}.`);
      state.pendingClaim = null;
      if (state.dossier.length >= state.modifiers.dossierSize) auditDossier(state);
      if (!checkWinner(state)) state.phase = "draw";
      return state;
    }
    if (action.type === "challenge") {
      const truthful = claimIsTruthful(pending);
      const winnerId = truthful ? pending.playerId : actorId;
      const loserId = truthful ? actorId : pending.playerId;
      state.prestige[winnerId] = (state.prestige[winnerId] ?? 0) + 3;
      state.prestige[loserId] = Math.max(0, (state.prestige[loserId] ?? 0) - 1);
      if (!truthful) state.stats[actorId].bluffsCaught += 1;
      state.discard.push(pending.actual);
      state.lastChallenge = { challengerId: actorId, playerId: pending.playerId, actual: pending.actual, claim: pending.claim, truthful };
      appendLog(state, actorId, `${truthful ? "accuse à tort" : "démasque le bluff"}: ${cardText(pending.actual)} avait été annoncée ${cardText(pending.claim)}.`, "result");
      state.pendingClaim = null;
      if (!checkWinner(state)) state.phase = "draw";
      return state;
    }
    throw new Error("Fais confiance à la déclaration ou conteste-la.");
  }
  if (state.phase === "draw") {
    if (action.type !== "draw") throw new Error("Commence par piocher une carte.");
    const source = action.source === "discard" ? "discard" : "deck";
    if (source === "discard" && !state.modifiers.openDiscardDraw) throw new Error("La pioche dans la défausse est désactivée sur cette table.");
    refillDeck(state);
    const card = source === "discard" ? state.discard.pop() : state.deck.pop();
    if (!card) throw new Error(source === "discard" ? "La défausse est vide." : "La pioche est vide.");
    state.hands[actorId].push(card);
    state.drawnFrom = source;
    state.phase = "play";
    appendLog(state, actorId, `pioche ${source === "discard" ? cardText(card) : "une carte face cachée"}.`, "draw");
    return state;
  }
  if (state.phase !== "play") throw new Error("Action indisponible.");
  const cardIndex = Number(action.cardIndex);
  if (!Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex >= state.hands[actorId].length) throw new Error("Carte introuvable dans ta main.");
  const [actual] = state.hands[actorId].splice(cardIndex, 1);
  if (action.type === "discard") {
    state.discard.push(actual);
    state.edict = { ...actual };
    appendLog(state, actorId, `défausse ${cardText(actual)} et change la carte d'influence.`);
    advanceTurn(state);
    return state;
  }
  if (action.type !== "declare") {
    state.hands[actorId].splice(cardIndex, 0, actual);
    throw new Error("Défausse la carte ou glisse-la dans le dossier.");
  }
  const claim = { rank: String(action.claimRank ?? ""), suit: String(action.claimSuit ?? "") };
  if (!createDeck().some((card) => card.rank === claim.rank && card.suit === claim.suit)) {
    state.hands[actorId].splice(cardIndex, 0, actual);
    throw new Error("Déclaration de carte invalide.");
  }
  if (!claimMatchesEdict(claim, state.edict, state.modifiers.claimRule)) {
    state.hands[actorId].splice(cardIndex, 0, actual);
    throw new Error("La carte annoncée ne respecte pas la carte d'influence.");
  }
  state.pendingClaim = { id: `${Date.now()}-${actorId}`, playerId: actorId, actual, claim, edictAtPlay: { ...state.edict } };
  appendLog(state, actorId, `annonce ${cardText(claim)} et glisse une carte face cachée dans le dossier.`, "bid");
  advanceTurn(state);
  return state;
}

export function velvetRuseBotAction(state, bot) {
  if (state.phase === "decision") return Math.random() < 0.27 ? { type: "challenge" } : { type: "trust" };
  if (state.phase === "draw") {
    const top = state.discard?.at(-1);
    return { type: "draw", source: state.modifiers?.openDiscardDraw && claimMatchesEdict(top, state.edict, state.modifiers?.claimRule) && Math.random() < 0.7 ? "discard" : "deck" };
  }
  const hand = state.hands?.[bot.id] ?? [];
  const matchingIndexes = hand.map((card, index) => ({ card, index })).filter(({ card }) => claimMatchesEdict(card, state.edict, state.modifiers?.claimRule));
  if (matchingIndexes.length && Math.random() < 0.78) {
    const choice = matchingIndexes[Math.floor(Math.random() * matchingIndexes.length)];
    return { type: "declare", cardIndex: choice.index, claimRank: choice.card.rank, claimSuit: choice.card.suit };
  }
  if (Math.random() < 0.45) return { type: "discard", cardIndex: Math.floor(Math.random() * hand.length) };
  const candidates = ["S", "H", "D", "C"].flatMap((suit) => ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"].map((rank) => ({ rank, suit }))).filter((card) => claimMatchesEdict(card, state.edict, state.modifiers?.claimRule));
  const actual = hand[0];
  const claims = candidates.filter((card) => card.rank !== actual?.rank || card.suit !== actual?.suit);
  const claim = claims[Math.floor(Math.random() * claims.length)] ?? state.edict;
  return { type: "declare", cardIndex: 0, claimRank: claim.rank, claimSuit: claim.suit };
}
