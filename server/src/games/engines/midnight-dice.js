import { currentPlayer, rollDice, shuffle } from "../shared.js";
import { normalizeGameModifiers } from "../modifiers.js";
import { appendLog, publicPlayers } from "../engine-context.js";
import { midnightContractInfo, midnightContractTiers, midnightCatalogFor, normalizeMidnightContracts, evaluateMidnightDefinition } from "../../../../client/src/features/games/midnightDice/contracts.js";

export const MIDNIGHT_CONTRACT_DEFINITIONS = Object.fromEntries(Object.entries(midnightContractInfo).map(([id, definition]) => [id, { ...definition, bonus: midnightContractTiers[definition.tier].bonus }]));
export const MIDNIGHT_CONTRACTS = Object.keys(MIDNIGHT_CONTRACT_DEFINITIONS);
const offerCache = new Map();
function contractModel(catalog = midnightContractInfo) {
  const key = JSON.stringify(catalog);
  if (offerCache.has(key)) { const model = offerCache.get(key); offerCache.delete(key); offerCache.set(key, model); return model; }
  const ids = Object.keys(catalog), potentials = {}, balancedOffers = [];
  for (const id of ids) {
    let maximum = 0;
    for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) for (let c = 1; c <= 6; c++) maximum = Math.max(maximum, evaluateMidnightDefinition(catalog[id], [a, b, c]).points);
    potentials[id] = maximum;
  }
  for (let a = 0; a < ids.length - 3; a++) for (let b = a + 1; b < ids.length - 2; b++) for (let c = b + 1; c < ids.length - 1; c++) for (let d = c + 1; d < ids.length; d++) {
    const indices = [a, b, c, d], contracts = indices.map(index => ids[index]), points = contracts.map(id => potentials[id]).sort((a, b) => b - a);
    balancedOffers.push({ contracts, points, mask: indices.reduce((mask, index) => mask | (1 << index), 0), total: points.reduce((sum, value) => sum + value, 0) });
  }
  const model = { ids, potentials, balancedOffers }; offerCache.set(key, model);
  if (offerCache.size > 8) offerCache.delete(offerCache.keys().next().value);
  return model;
}
export function midnightContractPotential(contract, catalog = midnightContractInfo) { return contractModel(catalog && typeof catalog === "object" && !Array.isArray(catalog) ? catalog : midnightContractInfo).potentials[contract] ?? 0; }
function contractRotation(previous = [], catalog = midnightContractInfo) {
  const ids = Object.keys(catalog), fresh = ids.filter(id => !previous.includes(id));
  return shuffle(fresh.length >= 4 ? fresh : ids).slice(0, 4);
}
export function midnightContractOffers(state, playerId) {
  const offers = state.modifiers?.individualContracts ? state.privateContractOffers?.[playerId] ?? state.contractOffers ?? [] : state.contractOffers ?? [];
  const used = state.usedContracts?.[playerId] ?? [];
  return offers.filter(id => Object.hasOwn(midnightCatalogFor(state), id) && !used.includes(id));
}

function renewIndividualOffers(state, firstRound = state.round) {
  const { ids, balancedOffers } = contractModel(midnightCatalogFor(state));
  if (!state.players.length) { state.privateContractOffers = {}; return; }
  const previous = state.privateContractOffers ?? {};
  const rounds = Math.min(4, state.modifiers.rounds - firstRound + 1);
  const valuedOffers = balancedOffers.map((offer) => ({ ...offer, potential: offer.points.slice(0, rounds).reduce((sum, value) => sum + value, 0) }));
  const candidates = state.players.map((player) => {
    const mask = (previous[player.id] ?? []).reduce((value, contract) => {
      const index = ids.indexOf(contract);
      return index < 0 ? value : value | (1 << index);
    }, 0);
    const fresh = valuedOffers.filter((offer) => !(offer.mask & mask));
    return shuffle(fresh.length ? fresh : valuedOffers).sort((left, right) => left.potential - right.potential);
  });
  const playerOrder = shuffle(state.players.map((_, index) => index)).sort((left, right) => candidates[left].length - candidates[right].length);
  const potentials = [...new Set(candidates.flat().map((offer) => offer.potential))].sort((left, right) => left - right);
  const target = valuedOffers.reduce((total, offer) => total + offer.potential, 0) / valuedOffers.length;
  function assign(lower, upper) {
    const owners = new Map(), selected = [];
    function place(player, visited) {
      for (const offer of candidates[player]) {
        if (offer.potential < lower) continue;
        if (offer.potential > upper) break;
        if (visited.has(offer.mask)) continue;
        visited.add(offer.mask);
        const owner = owners.get(offer.mask);
        if (owner === undefined || place(owner, visited)) {
          owners.set(offer.mask, player); selected[player] = offer;
          return true;
        }
      }
      return false;
    }
    return playerOrder.every((player) => place(player, new Set())) ? selected : null;
  }
  // Find the narrowest feasible score interval while keeping offers distinct and
  // excluding each player's previous rotation. Randomness only breaks ties.
  let best = null, upper = 0;
  for (let lower = 0; lower < potentials.length; lower++) {
    upper = Math.max(upper, lower);
    let selected = null;
    while (upper < potentials.length && !(selected = assign(potentials[lower], potentials[upper]))) upper++;
    if (!selected) break;
    const spread = potentials[upper] - potentials[lower];
    const distance = Math.abs((potentials[upper] + potentials[lower]) / 2 - target);
    if (!best || spread < best.spread || spread === best.spread && distance < best.distance) best = { spread, distance, selected };
  }
  if (!best) throw new Error("Impossible de proposer des mandats distincts.");
  state.privateContractOffers = Object.fromEntries(state.players.map((player, index) => [player.id, shuffle(best.selected[index].contracts)]));
}


export function evaluateMidnightContract(contract, dice = [], catalog = midnightContractInfo) { return evaluateMidnightDefinition(catalog[contract], dice); }
export function scoreMidnightContract(contract, dice = [], catalog = midnightContractInfo) { return evaluateMidnightContract(contract, dice, catalog).points; }

export function midnightDraftPotential(contract, dice, catalog = midnightContractInfo) {
  if (dice.length >= 3) return scoreMidnightContract(contract, dice, catalog);
  let maximum = 0;
  for (let value = 1; value <= 6; value++) maximum = Math.max(maximum, midnightDraftPotential(contract, [...dice, value], catalog));
  return maximum;
}

function nextEligiblePlayer(state, predicate) {
  for (let offset = 1; offset <= state.players.length; offset += 1) {
    const index = (state.currentPlayerIndex + offset) % state.players.length;
    if (predicate(state.players[index])) return index;
  }
  return -1;
}

function prepareRound(state) {
  if (!Array.isArray(state.contractOffers) || state.contractOffers.length !== 4) state.contractOffers = contractRotation([], midnightCatalogFor(state));
  if (state.modifiers.individualContracts && !state.privateContractOffers) renewIndividualOffers(state);
  state.phase = "contract";
  state.currentPlayerIndex = state.startingPlayerIndex;
  state.market = [];
  state.trays = Object.fromEntries(state.players.map((player) => [player.id, []]));
  state.secretContracts = {};
  state.discardRemaining = Object.fromEntries(state.players.map((player) => [player.id, state.modifiers.discardsPerRound]));
  state.discardTray = [];
}

function resolveRound(state) {
  const results = state.players.map((player) => {
    const dice = [...(state.trays[player.id] ?? [])];
    const contract = state.secretContracts[player.id];
    const evaluation = evaluateMidnightContract(contract, dice, midnightCatalogFor(state));
    const stats = state.stats[player.id] ??= { perfectContracts: 0, marketDiscards: 0, contractsAttempted: 0, contractsCompleted: 0, completedContractIds: [] };
    stats.contractsAttempted = (stats.contractsAttempted ?? 0) + 1;
    if (evaluation.achieved) {
      stats.contractsCompleted = (stats.contractsCompleted ?? 0) + 1;
      stats.completedContractIds = [...new Set([...(stats.completedContractIds ?? []), contract])];
      if (["gold", "platinum", "diamond"].includes(evaluation.tier)) stats.perfectContracts = (stats.perfectContracts ?? 0) + 1;
    }
    state.scores[player.id] = (state.scores[player.id] ?? 0) + evaluation.points;
    return { playerId: player.id, dice, contract, ...evaluation, total: state.scores[player.id] };
  });
  state.lastRound = { round: state.round, results, discarded: [...state.discardTray], contractOffers: state.modifiers.individualContracts ? [] : [...state.contractOffers] };
  appendLog(state, "dealer", `révèle les mandats de la manche ${state.round}.`, "result");
  if (state.round >= state.modifiers.rounds) {
    const best = Math.max(...Object.values(state.scores));
    state.winners = state.players.filter((player) => state.scores[player.id] === best).map((player) => player.id);
    state.finished = true;
    return;
  }
  if (state.round % 4 === 0) {
    if (state.modifiers.individualContracts) renewIndividualOffers(state, state.round + 1);
    else state.contractOffers = contractRotation(state.contractOffers, midnightCatalogFor(state));
    state.usedContracts = Object.fromEntries(state.players.map((player) => [player.id, []]));
    appendLog(state, "dealer", state.modifiers.individualContracts ? "renouvelle secrètement les quatre mandats de chaque joueur." : `renouvelle les quatre mandats: ${state.contractOffers.join(", ")}.`);
  }
  state.round += 1;
  state.startingPlayerIndex = (state.startingPlayerIndex + 1) % state.players.length;
  prepareRound(state);
}

export function createMidnightDiceState(players, options = {}) {
  const tablePlayers = publicPlayers(players.slice(0, 8));
  const state = {
    gameId: "midnight-dice",
    players: tablePlayers,
    contractCatalog: Object.fromEntries(normalizeMidnightContracts(options.midnightContracts).map(definition => [definition.id, definition])),
    modifiers: normalizeGameModifiers("midnight-dice", options.gameModifiers),
    round: 1,
    startingPlayerIndex: 0,
    currentPlayerIndex: 0,
    phase: "contract",
    market: [],
    trays: {},
    secretContracts: {},
    usedContracts: Object.fromEntries(tablePlayers.map((player) => [player.id, []])),
    discardRemaining: {},
    discardTray: [],
    scores: Object.fromEntries(tablePlayers.map((player) => [player.id, 0])),
    stats: Object.fromEntries(tablePlayers.map((player) => [player.id, { perfectContracts: 0, marketDiscards: 0, contractsAttempted: 0, contractsCompleted: 0, completedContractIds: [] }])),
    lastRound: null,
    logs: [],
    finished: false,
    winners: []
  };
  prepareRound(state);
  return state;
}

export function applyMidnightDiceAction(state, actorId, action) {
  if (!Array.isArray(state.contractOffers) || state.contractOffers.length !== 4) state.contractOffers = contractRotation([], midnightCatalogFor(state));
  state.usedContracts ??= Object.fromEntries(state.players.map((player) => [player.id, []]));
  if (currentPlayer(state).id !== actorId) throw new Error("Ce n'est pas ton tour.");
  if (action.type === "choose-contract") {
    if (state.phase !== "contract") throw new Error("Les mandats ont déjà été choisis pour cette manche.");
    const contract = String(action.contract ?? "");
    const offers=midnightContractOffers(state,actorId);
    const used = state.usedContracts[actorId] ?? [];
    if (used.includes(contract)) throw new Error("Ce mandat a déjà été utilisé dans ce cycle.");
    if (!offers.includes(contract)) throw new Error("Ce mandat n'est pas proposé pendant cette rotation.");
    state.secretContracts[actorId] = contract;
    state.usedContracts[actorId] = [...new Set([...(state.usedContracts[actorId] ?? []), contract])];
    appendLog(state, actorId, "choisit secrètement son mandat.");
    const next = nextEligiblePlayer(state, (player) => !state.secretContracts[player.id]);
    if (next >= 0) state.currentPlayerIndex = next;
    else {
      state.phase = "draft";
      state.currentPlayerIndex = state.startingPlayerIndex;
      state.market = rollDice(state.players.length * 3 + state.modifiers.marketExtra);
      appendLog(state, "dealer", `ouvre le marché avec ${state.market.length} dés.`);
    }
    return state;
  }
  if (state.phase !== "draft") throw new Error("Choisis d'abord ton mandat.");
  if (action.type === "discard-market") {
    const index = Number(action.index);
    if (!Number.isInteger(index) || index < 0 || index >= state.market.length) throw new Error("Dé du marché introuvable.");
    if ((state.discardRemaining[actorId] ?? 0) <= 0) throw new Error("Tu n'as plus de défausse pour cette manche.");
    const discarded = state.market[index];
    const replacement = rollDice(1)[0];
    state.market[index] = replacement;
    state.discardRemaining[actorId] -= 1;
    state.discardTray.push({ playerId: actorId, die: discarded, replacement });
    state.stats[actorId].marketDiscards += 1;
    appendLog(state, actorId, `écarte un ${discarded}; le croupier révèle un ${replacement}.`);
    return state;
  }
  if (action.type !== "draft") throw new Error("Prends un dé du marché ou écartes-en un.");
  const index = Number(action.index);
  if (!Number.isInteger(index) || index < 0 || index >= state.market.length) throw new Error("Dé du marché introuvable.");
  const [die] = state.market.splice(index, 1);
  state.trays[actorId].push(die);
  appendLog(state, actorId, `prend un ${die} dans le marché.`);
  const next = nextEligiblePlayer(state, (player) => (state.trays[player.id]?.length ?? 0) < 3);
  if (next >= 0) state.currentPlayerIndex = next;
  else {
    resolveRound(state);
  }
  return state;
}

export function resumeMidnightAfterDeparture(state) {
  if (state.finished || !state.players.length) return;
  state.startingPlayerIndex %= state.players.length;
  const eligible=state.phase==="contract" ? (player)=>!state.secretContracts[player.id] : (player)=>(state.trays[player.id]?.length ?? 0)<3;
  if (eligible(state.players[state.currentPlayerIndex])) return;
  const next=nextEligiblePlayer(state,eligible);
  if (next>=0) {state.currentPlayerIndex=next;return;}
  if (state.phase==="contract") {
    state.phase="draft";
    state.currentPlayerIndex=state.startingPlayerIndex;
    state.market=rollDice(state.players.length*3+state.modifiers.marketExtra);
    appendLog(state,"dealer",`ouvre le marché avec ${state.market.length} dés.`);
  } else resolveRound(state);
}

export function midnightDiceBotAction(state, bot) {
  if (state.phase === "contract") {
    const contracts = midnightContractOffers(state,bot.id);
    return contracts.length ? { type: "choose-contract", contract: contracts[Math.floor(Math.random() * contracts.length)] } : null;
  }
  const contract = state.secretContracts?.[bot.id];
  const tray = state.trays?.[bot.id] ?? [];
  const choices = (state.market ?? []).map((die, index) => ({ index, value: midnightDraftPotential(contract, [...tray, die], midnightCatalogFor(state)) })).sort((a, b) => b.value - a.value);
  if (!choices.length) return null;
  if ((state.discardRemaining?.[bot.id] ?? 0) > 0 && Math.random() < 0.15 && state.market[choices.at(-1).index] <= 2) return { type: "discard-market", index: choices.at(-1).index };
  return { type: "draft", index: choices[0].index };
}
