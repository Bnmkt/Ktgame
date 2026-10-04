import { games } from "../games/shared.js";
import { normalizeGameModifiers } from "../games/modifiers.js";
import { totalYahtzee, YAHTZEE_CATEGORIES } from "../games/engines/yahtzee.js";

export const RANKED_GAMES = ["belote", "texas-holdem", "president", "liars-dice", "velvet-ruse", "yahtzee"];
const defaults = { initialElo: 1000, k: 32, minimumGames: 3, initialRange: 100, rangeStep: 50, wideningSeconds: 30,
  maximumRange: 300, queueSeconds: 0, reconnectSeconds: 120, afkSeconds: 180, abandonPenalty: 20, afkPenalty: 15, spectators: true };
const bounds = { initialElo: [100,5000], k: [1,128], minimumGames: [0,1000], initialRange: [0,2000], rangeStep: [1,1000],
  wideningSeconds: [5,600], maximumRange: [0,3000], queueSeconds: [0,7200], reconnectSeconds: [15,1800], afkSeconds: [30,1800], abandonPenalty: [0,500], afkPenalty: [0,500] };
function integer(value, fallback, min, max) {
  const n = Number(value ?? fallback);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error(`Valeur classée invalide (${min} à ${max}).`);
  return n;
}
export function normalizeRankedConfig(input = {}, catalog = games, platform = {}) {
  const common = {};
  for (const [key,[min,max]] of Object.entries(bounds)) common[key] = integer(input[key], defaults[key], min, max);
  common.spectators = input.spectators !== false;
  const result = { enabled: input.enabled !== false, ...common, games: {} };
  for (const id of RANKED_GAMES) {
    const game = catalog.find((row) => row.id === id) ?? games.find((row) => row.id === id), row = input.games?.[id] ?? {};
    const config = { ...common, enabled: row.enabled !== false && game.enabled !== false };
    for (const [key,[min,max]] of Object.entries(bounds)) if (row[key] !== undefined) config[key] = integer(row[key], common[key], min, max);
    config.spectators = row.spectators === undefined ? common.spectators : row.spectators === true;
    if (config.maximumRange < config.initialRange) throw new Error("La plage Elo maximale doit couvrir la plage initiale.");
    const minPlayers = Math.max(2, game.minPlayers), maxPlayers = game.maxPlayers;
    config.players = integer(row.players, id === "yahtzee" ? 2 : 4, minPlayers, maxPlayers);
    config.maximumPlayers = integer(row.maximumPlayers, config.players, config.players, maxPlayers);
    const raw = row.preset ?? {}, modifiers = raw.gameModifiers ?? game.defaultModifiers ?? {};
    // Reject invalid competitive settings, rather than silently clamping a preset.
    const normalized = normalizeGameModifiers(id, modifiers);
    for (const [key,value] of Object.entries(modifiers)) if (!(key in normalized) || normalized[key] !== value) throw new Error(`Preset invalide : ${id}.${key}`);
    const stake = integer(raw.stake, id === "texas-holdem" ? platform.minPokerBuyIn ?? 1000 : platform.minRoomStake ?? 10, 1, 10000000);
    config.preset = { gameModifiers: normalized, stake };
    if (id === "texas-holdem") {
      if (stake < 1000) throw new Error("La cave classée doit être d'au moins 1 000 jetons.");
      const bigBlind = integer(raw.bigBlind, platform.pokerDefaultBigBlind ?? 100, 2, stake);
      if (bigBlind % 2) throw new Error("La grosse blinde classée doit être paire.");
      config.preset = { ...config.preset, bigBlind, maximumBet: integer(raw.maximumBet, stake, bigBlind, stake), turnSeconds: integer(raw.turnSeconds, platform.pokerTurnSeconds ?? 300, 30,600) };
    }
    result.games[id] = config;
  }
  return result;
}
export function eloFor(user, gameId, config) { return user?.gameElo?.[gameId] ?? { elo: config.initialElo, games: 0, wins: 0 }; }
export function searchRange(entry, config, now = Date.now()) {
  return Math.min(config.maximumRange, config.initialRange + Math.floor(Math.max(0, now - entry.joinedAt) / (config.wideningSeconds * 1000)) * config.rangeStep);
}
export function matchQueue(entries, config, now = Date.now()) {
  const sorted = [...entries].sort((a,b) => a.joinedAt - b.joinedAt || a.userId.localeCompare(b.userId));
  for (const anchor of sorted) {
    const group = [anchor];
    const candidates = sorted.filter((row) => row !== anchor).sort((a,b) => Math.abs(a.elo-anchor.elo) - Math.abs(b.elo-anchor.elo) || a.joinedAt-b.joinedAt);
    for (const row of candidates) {
      if (group.every((other) => Math.abs(other.elo-row.elo) <= Math.min(searchRange(other,config,now),searchRange(row,config,now)))) group.push(row);
      if (group.length === (config.maximumPlayers ?? config.players)) break;
    }
    if (group.length >= config.players) return group;
  }
  return [];
}
export function validateRankedAction(state, actorId, action) {
  const types={belote:["take","pass","play","next-deal"],"texas-holdem":["fold","check","call","raise","all-in","show","auto-check-fold"],president:["play","pass"],"liars-dice":["bid","challenge"],"velvet-ruse":["draw","discard","declare","trust","challenge"],yahtzee:["roll","score"]};
  if (!types[state.gameId]?.includes(action.type) || action.automatic !== undefined) throw new Error("Action classée invalide.");
  const numeric=(value,min,max)=>Number.isSafeInteger(value) && value>=min && value<=max;
  if (state.gameId === "yahtzee") {
    if (action.type === "score" && !YAHTZEE_CATEGORIES.includes(action.category)) throw new Error("Catégorie inconnue.");
    if (action.type === "roll" && (state.rollsLeft<=0 || !Array.isArray(action.keepIndexes ?? []) || (action.keepIndexes ?? []).some((n)=>!numeric(n,0,4)))) throw new Error("Lancer indisponible.");
  }
  if (state.gameId === "liars-dice" && action.type === "bid" && (!numeric(action.quantity,1,10000)||!numeric(action.face,1,6))) throw new Error("Enchère invalide.");
  if (state.gameId === "texas-holdem" && action.type === "raise" && !numeric(action.amount,1,state.maximumBet)) throw new Error("Mise invalide.");
  if (state.gameId === "president" && action.type === "play" && (action.cards ? !Array.isArray(action.cards)||action.cards.length<1||action.cards.length>4 : !numeric(action.count ?? 1,1,4))) throw new Error("Combinaison invalide.");
}
export function balancedBeloteSeats(players) {
  const sorted = [...players].sort((a,b) => b.elo-a.elo || a.userId.localeCompare(b.userId));
  return [sorted[0].userId, sorted[1].userId, sorted[3].userId, sorted[2].userId];
}
export function eloChanges(participants, k, teams = false) {
  if (participants.length < 2 || new Set(participants.map((r)=>r.id)).size !== participants.length || participants.some((r)=>!Number.isFinite(r.elo)||!Number.isFinite(r.position))) throw new Error("Résultat classé invalide.");
  const expected = (a,b) => 1/(1+10**((b-a)/400));
  return participants.map((row) => {
    const opponents = participants.filter((other) => other.id !== row.id && (!teams || other.team !== row.team));
    if (!opponents.length) throw new Error("Adversaire classé manquant.");
    const ownRating = teams ? participants.filter((other)=>other.team===row.team).reduce((n,r)=>n+r.elo,0)/participants.filter((r)=>r.team===row.team).length : row.elo;
    const delta = opponents.reduce((sum,other) => {
      const opponentRating = teams ? participants.filter((r)=>r.team===other.team).reduce((n,r)=>n+r.elo,0)/participants.filter((r)=>r.team===other.team).length : other.elo;
      const outcome = row.position < other.position ? 1 : row.position > other.position ? 0 : .5;
      return sum + outcome - expected(ownRating,opponentRating);
    },0)/opponents.length;
    return { ...row, delta: Math.round(k*delta*100)/100 };
  });
}
export function competitivePositions(room) {
  const state=room.state, roster=room.ranked.roster, forfeits=room.ranked.forfeits ?? {};
  if (!state?.finished) throw new Error("La partie classée n'est pas terminée.");
  const scores = roster.map((player) => {
    let score;
    if (room.gameId === "belote") score=state.teamScores[player.team] ?? 0;
    else if (room.gameId === "yahtzee") score=totalYahtzee(state.scores[player.id]);
    else if (room.gameId === "president") score=-(state.finishedOrder.indexOf(player.id) < 0 ? roster.length : state.finishedOrder.indexOf(player.id));
    else if (room.gameId === "liars-dice") score=(state.diceCounts[player.id] ?? 0)>0 ? roster.length : (state.eliminationOrder ?? []).indexOf(player.id);
    else if (room.gameId === "texas-holdem") score=(state.stacks[player.id] ?? 0)>0 ? roster.length : (state.eliminationGroups ?? []).findIndex((group)=>group.includes(player.id));
    else score=state.prestige[player.id] ?? 0;
    return { ...player, score, forfeited: Boolean(forfeits[player.id]) };
  });
  if (room.gameId === "belote" && Object.keys(forfeits).length) {
    const losingTeams=new Set(roster.filter((r)=>forfeits[r.id]).map((r)=>r.team));
    for (const row of scores) row.score=losingTeams.has(row.team) ? 0 : 1;
    return scores.map((row)=>({...row,position:1+scores.filter((other)=>other.score>row.score).length}));
  }
  return scores.map((row)=>({...row,position:1+scores.filter((other)=>Number(other.forfeited)<Number(row.forfeited) || other.forfeited===row.forfeited && other.score>row.score).length}));
}
export function settleRanked(room, users, history) {
  if (!room.ranked || room.ranked.settled || room.ranked.cancelled) return [];
  const config=room.ranked.config;
  const positions=competitivePositions(room).map((row)=>({...row,elo:eloFor(users.find((u)=>u.id===row.id),room.gameId,config).elo}));
  const changes=eloChanges(positions,config.k,room.gameId === "belote");
  const results=changes.map((row)=> {
    const user=users.find((u)=>u.id===row.id);
    const penalty=room.ranked.forfeits?.[row.id] === "afk" ? config.afkPenalty : row.forfeited ? config.abandonPenalty : 0;
    const previous=eloFor(user,room.gameId,config), after=Math.round((previous.elo+row.delta-penalty)*100)/100;
    if (user) (user.gameElo ??= {})[room.gameId]={elo:after,games:previous.games+1,wins:previous.wins+Number(row.position===1 && !row.forfeited)};
    return { userId:row.id, before:previous.elo, delta:after-previous.elo, after, position:row.position, penalty, reason:room.ranked.forfeits?.[row.id] ?? "result", team:row.team ?? null };
  });
  history.ranked={matchId:room.ranked.matchId,results,participants:room.ranked.roster.map((row)=>({id:row.id,team:row.team ?? null})),config};
  room.ranked.settled=true;
  room.ranked.results=results;
  return results;
}
