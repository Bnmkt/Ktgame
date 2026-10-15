import { currentPlayer, rollDice, shuffle } from "../shared.js";
import { normalizeGameModifiers } from "../modifiers.js";
import { appendLog, publicPlayers } from "../engine-context.js";

export const MIDNIGHT_CONTRACT_DEFINITIONS = {
  spectrum: { tier: "bronze", bonus: 18 },
  duo: { tier: "bronze", bonus: 18 },
  "middle-road": { tier: "bronze", bonus: 18 },
  extremes: { tier: "silver", bonus: 30 },
  odd: { tier: "silver", bonus: 30 },
  even: { tier: "silver", bonus: 30 },
  straight: { tier: "gold", bonus: 45 },
  balance: { tier: "gold", bonus: 45 },
  "lucky-thirteen": { tier: "gold", bonus: 45 },
  summit: { tier: "platinum", bonus: 65 },
  cellar: { tier: "platinum", bonus: 65 },
  triple: { tier: "diamond", bonus: 100 }
};

export const MIDNIGHT_CONTRACTS = Object.keys(MIDNIGHT_CONTRACT_DEFINITIONS);

function contractRotation(previous = []) {
  const freshPool = MIDNIGHT_CONTRACTS.filter((contract) => !previous.includes(contract));
  const pool = freshPool.length >= 4 ? freshPool : MIDNIGHT_CONTRACTS;
  return shuffle(pool).slice(0, 4);
}
export function midnightContractOffers(state, playerId) {
  const offers = state.modifiers?.individualContracts ? state.privateContractOffers?.[playerId] ?? state.contractOffers ?? [] : state.contractOffers ?? [];
  const used = state.usedContracts?.[playerId] ?? [];
  return offers.filter((contract) => !used.includes(contract));
}

const contractPotentials = Object.fromEntries(MIDNIGHT_CONTRACTS.map((contract) => {
  let maximum = 0;
  for (let first = 1; first <= 6; first++) for (let second = 1; second <= 6; second++) for (let third = 1; third <= 6; third++) {
    maximum = Math.max(maximum, scoreMidnightContract(contract, [first, second, third]));
  }
  return [contract, maximum];
}));

export function midnightContractPotential(contract) { return contractPotentials[contract] ?? 0; }

// Cache the 495 possible offers, valued from the scoring rules (base + bonus).
const balancedOffers = [];
for (let first = 0; first < MIDNIGHT_CONTRACTS.length - 3; first++) {
  for (let second = first + 1; second < MIDNIGHT_CONTRACTS.length - 2; second++) {
    for (let third = second + 1; third < MIDNIGHT_CONTRACTS.length - 1; third++) {
      for (let fourth = third + 1; fourth < MIDNIGHT_CONTRACTS.length; fourth++) {
        const indices = [first, second, third, fourth], contracts = indices.map((index) => MIDNIGHT_CONTRACTS[index]);
        const points = contracts.map(midnightContractPotential).sort((left, right) => right - left);
        balancedOffers.push({ contracts, points, mask: indices.reduce((mask, index) => mask | (1 << index), 0), total: points.reduce((sum, value) => sum + value, 0) });
      }
    }
  }
}

function renewIndividualOffers(state, firstRound = state.round) {
  if (!state.players.length) { state.privateContractOffers = {}; return; }
  const previous = state.privateContractOffers ?? {};
  const rounds = Math.min(4, state.modifiers.rounds - firstRound + 1);
  const valuedOffers = balancedOffers.map((offer) => ({ ...offer, potential: offer.points.slice(0, rounds).reduce((sum, value) => sum + value, 0) }));
  const candidates = state.players.map((player) => {
    const mask = (previous[player.id] ?? []).reduce((value, contract) => {
      const index = MIDNIGHT_CONTRACTS.indexOf(contract);
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

export function evaluateMidnightContract(contract, dice = []) {
  const sorted = [...dice].sort((a, b) => a - b);
  const total = sorted.reduce((sum, die) => sum + die, 0);
  const counts = sorted.reduce((result, die) => ({ ...result, [die]: (result[die] ?? 0) + 1 }), {});
  const highestCount = Math.max(0, ...Object.values(counts));
  const complete = sorted.length === 3;
  let achieved = false;
  if (contract === "straight") achieved = complete && new Set(sorted).size === 3 && sorted[2] - sorted[0] === 2;
  if (contract === "triple") achieved = complete && highestCount === 3;
  if (contract === "balance") achieved = complete && total === 10;
  if (contract === "spectrum") achieved = complete && new Set(sorted).size === 3;
  if (contract === "duo") achieved = complete && highestCount === 2;
  if (contract === "summit") achieved = complete && total >= 15;
  if (contract === "cellar") achieved = complete && total <= 7;
  if (contract === "odd") achieved = complete && sorted.every((die) => die % 2 === 1);
  if (contract === "even") achieved = complete && sorted.every((die) => die % 2 === 0);
  if (contract === "extremes") achieved = complete && sorted.includes(1) && sorted.includes(6);
  if (contract === "lucky-thirteen") achieved = complete && total === 13;
  if (contract === "middle-road") achieved = complete && sorted.every((die) => [2, 3, 4, 5].includes(die));
  const definition = MIDNIGHT_CONTRACT_DEFINITIONS[contract] ?? { tier: "bronze", bonus: 0 };
  return { achieved, base: total, bonus: achieved ? definition.bonus : 0, points: total + (achieved ? definition.bonus : 0), tier: definition.tier };
}

export function scoreMidnightContract(contract, dice = []) {
  return evaluateMidnightContract(contract, dice).points;
}

function nextEligiblePlayer(state, predicate) {
  for (let offset = 1; offset <= state.players.length; offset += 1) {
    const index = (state.currentPlayerIndex + offset) % state.players.length;
    if (predicate(state.players[index])) return index;
  }
  return -1;
}

function prepareRound(state) {
  if (!Array.isArray(state.contractOffers) || state.contractOffers.length !== 4) state.contractOffers = contractRotation();
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
    const evaluation = evaluateMidnightContract(contract, dice);
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
    else state.contractOffers = contractRotation(state.contractOffers);
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
  if (!Array.isArray(state.contractOffers) || state.contractOffers.length !== 4) state.contractOffers = contractRotation();
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
  const choices = (state.market ?? []).map((die, index) => ({ index, value: scoreMidnightContract(contract, [...tray, die]) })).sort((a, b) => b.value - a.value);
  if (!choices.length) return null;
  if ((state.discardRemaining?.[bot.id] ?? 0) > 0 && Math.random() < 0.15 && state.market[choices.at(-1).index] <= 2) return { type: "discard-market", index: choices.at(-1).index };
  return { type: "draft", index: choices[0].index };
}
