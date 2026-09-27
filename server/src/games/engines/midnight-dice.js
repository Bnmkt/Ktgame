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
  state.lastRound = { round: state.round, results, discarded: [...state.discardTray], contractOffers: [...state.contractOffers] };
  appendLog(state, "dealer", `révèle les mandats de la manche ${state.round}.`, "result");
  if (state.round >= state.modifiers.rounds) {
    const best = Math.max(...Object.values(state.scores));
    state.winners = state.players.filter((player) => state.scores[player.id] === best).map((player) => player.id);
    state.finished = true;
    return;
  }
  if (state.round % 4 === 0) {
    state.contractOffers = contractRotation(state.contractOffers);
    state.usedContracts = Object.fromEntries(state.players.map((player) => [player.id, []]));
    appendLog(state, "dealer", `renouvelle les quatre mandats: ${state.contractOffers.join(", ")}.`);
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
    if (!state.contractOffers.includes(contract)) throw new Error("Ce mandat n'est pas proposé pendant cette rotation.");
    const used = state.usedContracts[actorId] ?? [];
    if (state.modifiers.uniqueContracts && used.length < state.contractOffers.length && used.includes(contract)) throw new Error("Ce mandat a déjà été utilisé dans ce cycle.");
    if (state.modifiers.uniqueContracts && used.length >= state.contractOffers.length) state.usedContracts[actorId] = [];
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

export function midnightDiceBotAction(state, bot) {
  if (state.phase === "contract") {
    const contracts = state.contractOffers ?? MIDNIGHT_CONTRACTS.slice(0, 4);
    const used = state.usedContracts?.[bot.id] ?? [];
    const available = state.modifiers?.uniqueContracts && used.length < contracts.length ? contracts.filter((contract) => !used.includes(contract)) : contracts;
    return { type: "choose-contract", contract: available[Math.floor(Math.random() * available.length)] };
  }
  const contract = state.secretContracts?.[bot.id];
  const tray = state.trays?.[bot.id] ?? [];
  const choices = (state.market ?? []).map((die, index) => ({ index, value: scoreMidnightContract(contract, [...tray, die]) })).sort((a, b) => b.value - a.value);
  if (!choices.length) return null;
  if ((state.discardRemaining?.[bot.id] ?? 0) > 0 && Math.random() < 0.15 && state.market[choices.at(-1).index] <= 2) return { type: "discard-market", index: choices.at(-1).index };
  return { type: "draft", index: choices[0].index };
}
