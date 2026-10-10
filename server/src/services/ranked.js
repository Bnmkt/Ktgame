import { games } from "../games/shared.js";
import { normalizeGameModifiers } from "../games/modifiers.js";
import { totalYahtzee, YAHTZEE_CATEGORIES } from "../games/engines/yahtzee.js";
import { calculateElo, normalizeEloConfig } from "./ranked-elo.js";
import { midnightContractOffers } from "../games/engines/midnight-dice.js";
import { UNRANKED, placementElo, placementEvidence, placementStatus, recordPlacement } from "./ranked-placement.js";

export const RANKED_GAMES = ["belote", "texas-holdem", "president", "liars-dice", "velvet-ruse", "yahtzee", "midnight-dice"];
export const RANK_TIERS = [
  ["wood", "Bois", 0, 500], ["copper", "Cuivre", 500, 600],
  ["bronze", "Bronze", 600, 800], ["silver", "Argent", 800, 1100],
  ["gold", "Or", 1100, 1400], ["platinum", "Platine", 1400, 1700],
  ["diamond", "Diamant", 1700, 2000], ["master", "Maître", 2000, 2300],
  ["grandmaster", "Grand Maître", 2300, 2600], ["legend", "Légende", 2600, Infinity]
];
export const RANK_DIVISIONS = ["I","II","III","IV","V","VI","VII","VIII","IX","X"];
export const DEFAULT_RANKS = RANK_TIERS.map(([id,name,minimum],index)=>({id,name,minimum,divisions:index<=7 ? 3 : 1,insignia:"shield",divisionInsignia:{}}));
function normalizeRankInsignia(input, fallback = "shield") {
  const insignia=String(input.insignia??fallback).trim() || fallback,insigniaImage=String(input.insigniaImage??"").trim();
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(insignia) || insignia.length>80) throw new Error("Insigne invalide : choisis une icône du catalogue.");
  if (insigniaImage && !/^[a-f0-9]{64}$/.test(insigniaImage)) throw new Error("Image d’insigne invalide.");
  return {insignia,insigniaImage};
}
export function normalizeRanks(input = DEFAULT_RANKS) {
  if (!Array.isArray(input) || input.length < 2 || input.length > 30) throw new Error("Définis entre 2 et 30 rangs.");
  const rows=input.map((row)=>({id:String(row.id??"").trim(),name:String(row.name??"").trim(),minimum:Number(row.minimum),divisions:Number(row.divisions),...normalizeRankInsignia(row)}));
  if (rows.some((row)=>!/^[-a-z0-9]{1,50}$/.test(row.id) || !row.name || row.name.length>40 || !Number.isSafeInteger(row.minimum) || row.minimum<0 || row.minimum>100000 || !Number.isSafeInteger(row.divisions) || row.divisions<1 || row.divisions>10)) throw new Error("Rang invalide : nom, seuil entier et 1 à 10 divisions requis.");
  if (new Set(rows.map((row)=>row.id)).size!==rows.length || rows[0].minimum!==0 || rows.some((row,index)=>index>0 && row.minimum<=rows[index-1].minimum) || rows.at(-1).divisions!==1) throw new Error("Les seuils des rangs doivent être croissants, commencer à zéro et le dernier rang doit avoir une seule division.");
  rows.forEach((row,index)=>{
    const overrides=input[index].divisionInsignia ?? {};
    if (typeof overrides!=="object" || Array.isArray(overrides) || Object.keys(overrides).some((division)=>row.divisions===1 || !RANK_DIVISIONS.slice(0,row.divisions).includes(division))) throw new Error("Division d’insigne invalide.");
    row.divisionInsignia=Object.fromEntries(Object.entries(overrides).map(([division,value])=>{
      if (!value || typeof value!=="object" || Array.isArray(value)) throw new Error("Insigne de division invalide.");
      return [division,normalizeRankInsignia(value,row.insignia)];
    }));
  });
  return rows;
}
export function rankFor(elo, ranks = DEFAULT_RANKS) {
  const rating = Number.isFinite(elo) ? elo : 0;
  const index = Math.max(0, ranks.findLastIndex((tier) => rating >= tier.minimum));
  const {id,name,minimum,divisions}=ranks[index],maximum=ranks[index+1]?.minimum??Infinity;
  const step=Number.isFinite(maximum) ? Math.min(divisions-1, Math.floor(Math.max(0,rating-minimum)/((maximum-minimum)/divisions)+1e-10)) : 0;
  const division=divisions>1 ? RANK_DIVISIONS[step] : "";
  const {insignia="shield",insigniaImage=""}=ranks[index].divisionInsignia?.[division] ?? ranks[index];
  return {id,name,division,insignia,insigniaImage,label:`${name}${division ? ` ${division}` : ""}`,order:ranks.slice(0,index).reduce((n,row)=>n+row.divisions,0)+step};
}
export function rankProgress(elo, ranks = DEFAULT_RANKS) {
  const rank=rankFor(elo,ranks),index=ranks.findIndex((row)=>row.id===rank.id),tier=ranks[index];
  const width=((ranks[index+1]?.minimum??Infinity)-tier.minimum)/tier.divisions;
  const step=rank.order-ranks.slice(0,index).reduce((n,row)=>n+row.divisions,0);
  const minimum=tier.minimum+(Number.isFinite(width)?step*width:0),maximum=minimum+width;
  return { ...rank, minimum, maximum: Number.isFinite(maximum) ? maximum : null,
    progress: Number.isFinite(maximum) ? Math.max(0, Math.min(100, (elo - minimum) / width * 100)) : 100,
    next: Number.isFinite(maximum) ? rankFor(maximum,ranks).label : null };
}
export function competitiveFor(user, gameId, config, privateView = false) {
  const rating = eloFor(user, gameId, config);
  const placement = placementStatus(rating, config);
  return { games: rating.games, wins: rating.wins, placement, rank: placement.completed ? privateView ? rankProgress(rating.elo,config.ranks) : rankFor(rating.elo,config.ranks) : { ...UNRANKED, placementGames:placement.games,placementRequired:placement.required }, ...(privateView && placement.completed ? { elo: rating.elo } : {}) };
}
export function rankedResultFor(row, viewerId, ranks) {
  return { userId: row.userId, position: row.position, team: row.team, beforeRank: row.beforeRank ?? rankFor(row.before,ranks), afterRank: row.afterRank ?? rankFor(row.after,ranks),
    ...(row.userId === viewerId ? { ...(row.placement && !row.placement.completed ? {} : { before: row.before, after: row.after, delta: row.delta }), placement:row.placement, cancelled:row.cancelled, penalty: row.penalty, reason: row.reason, progression: row.progression ?? (row.placement && !row.placement.completed ? null : rankProgress(row.after,ranks)) } : {}) };
}
export function equippedRankedBadge(user, config) {
  const gameId=user?.profile?.rankedBadgeGameId;
  if (!RANKED_GAMES.includes(gameId) || !config.games[gameId]) return null;
  return {gameId,rank:competitiveFor(user,gameId,config.games[gameId]).rank};
}
export function rankedTurnTiming(room, now = Date.now()) {
  const {ranked,state}=room;
  if (!ranked || !state || room.finished || state.finished || room.pacing || state.nextHandAt) return null;
  const actorId=state.players[state.currentPlayerIndex]?.id;
  if (!actorId || !Number.isFinite(ranked.actionAt)) return null;
  const offlineAt=ranked.offline?.[actorId];
  const reconnect=Number.isFinite(offlineAt);
  const durationMs=(reconnect ? ranked.config.reconnectSeconds : ranked.config.afkSeconds)*1000;
  const deadline=reconnect ? offlineAt+durationMs : Math.min(ranked.actionAt+durationMs,room.gameId==="texas-holdem" ? state.turnDeadline ?? Infinity : Infinity);
  return {actorId,deadline,serverTime:now,type:reconnect ? "reconnect" : "turn"};
}
export function publicRanked(room, viewerId) {
  if (!room.ranked) return null;
  const { config, matchId, roster, results, cancelled } = room.ranked;
  return { matchId, turn: rankedTurnTiming(room), config: { abandonPenalty: config.abandonPenalty, afkPenalty: config.afkPenalty, abandonPolicy:config.abandonPolicy ?? "penalty", disconnectPolicy:config.disconnectPolicy ?? "penalty", spectators: config.spectators },
    roster: roster.map(({ id, pseudo, team, rank }) => ({ id, pseudo, team, rank })),
    ...(results ? { results: results.map((row) => rankedResultFor(row, viewerId,config.ranks)) } : {}),
    ...(cancelled ? { cancelled: { reason: cancelled.reason, at: cancelled.at } } : {}) };
}
const defaults = { minimumGames: 3, initialWindow: 3, windowStep: 2, wideningSeconds: 30,
  maximumWindow: 9, queueSeconds: 0, fillWaitSeconds: 60, readyWaitSeconds: 30, readyTimeoutSeconds: 90, reconnectSeconds: 120, afkSeconds: 180, spectators: true };
const bounds = { minimumGames: [0,1000], initialWindow: [1,101], windowStep: [2,100],
  wideningSeconds: [5,600], maximumWindow: [1,101], queueSeconds: [0,7200], fillWaitSeconds: [0,600], readyWaitSeconds: [30,300], readyTimeoutSeconds: [45,600], reconnectSeconds: [15,1800], afkSeconds: [30,1800] };
function integer(value, fallback, min, max) {
  const n = Number(value ?? fallback);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error(`Valeur classée invalide (${min} à ${max}).`);
  return n;
}
function validateSearch(config) {
  if (config.maximumWindow < config.initialWindow || config.initialWindow%2!==1 || config.maximumWindow%2!==1 || config.windowStep%2!==0) throw new Error("La fenêtre doit être impaire, couvrir la fenêtre initiale et s'élargir par paires de divisions.");
  if (config.readyTimeoutSeconds <= config.readyWaitSeconds) throw new Error("Le délai de confirmation doit dépasser le temps de préparation.");
}
export function normalizeRankedConfig(input = {}, catalog = games, platform = {}) {
  const common = {};
  for (const [key,[min,max]] of Object.entries(bounds)) common[key] = integer(input[key], defaults[key], min, max);
  validateSearch(common);
  common.spectators = input.spectators !== false;
  Object.assign(common, normalizeEloConfig(input));
  const ranks=normalizeRanks(input.ranks);
  const result = { enabled: input.enabled !== false, ...common, ranks, games: {} };
  for (const id of RANKED_GAMES) {
    const game = catalog.find((row) => row.id === id) ?? games.find((row) => row.id === id), row = input.games?.[id] ?? {};
    const config = { ...common, ranks, enabled: row.enabled !== false && game.enabled !== false };
    for (const [key,[min,max]] of Object.entries(bounds)) if (row[key] !== undefined) config[key] = integer(row[key], common[key], min, max);
    config.spectators = row.spectators === undefined ? common.spectators : row.spectators === true;
    Object.assign(config, normalizeEloConfig({ ...common, ...row }));
    validateSearch(config);
    const minPlayers = Math.max(2, game.minPlayers), maxPlayers = game.maxPlayers;
    config.players = integer(row.players, id === "yahtzee" ? 2 : 4, minPlayers, maxPlayers);
    config.maximumPlayers = integer(row.maximumPlayers, config.players, config.players, maxPlayers);
    if (config.calculation === "duel" && config.maximumPlayers !== 2) throw new Error("Le calcul duel nécessite une salle de deux joueurs.");
    if (config.calculation === "teams" && id !== "belote") throw new Error("Ce jeu ne propose pas de classement par équipe.");
    const raw = row.preset ?? {}, modifiers = raw.gameModifiers ?? game.defaultModifiers ?? {};
    // Reject invalid competitive settings, rather than silently clamping a preset.
    const normalized = normalizeGameModifiers(id, modifiers);
    for (const [key,value] of Object.entries(modifiers)) if (!(key in normalized) || normalized[key] !== value) throw new Error(`Preset invalide : ${id}.${key}`);
    const stake = id === "texas-holdem" ? integer(raw.stake, platform.minPokerBuyIn ?? 1000, 1000, 10000000) : 0;
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
export function matchmakingElo(user, gameId, config) {
  const rating=eloFor(user,gameId,config);
  return !placementStatus(rating,config).completed && rating.placement?.games ? placementElo(rating.placement,config) : rating.elo;
}
export function searchRange(entry, config, now = Date.now()) {
  if (entry.placementPending) return Math.floor(config.maximumWindow / 2);
  return Math.floor(Math.min(config.maximumWindow, config.initialWindow + Math.floor(Math.max(0, now - entry.joinedAt) / (config.wideningSeconds * 1000)) * config.windowStep)/2);
}
export function matchQueue(entries, config, now = Date.now(), updatePool) {
  const sorted = [...entries].sort((a,b) => a.joinedAt - b.joinedAt || a.userId.localeCompare(b.userId));
  const maximum = config.maximumPlayers ?? config.players;
  let fallback = [];
  for (const anchor of sorted) {
    const group = queueGroupFor(anchor,sorted,config,now);
    updatePool?.(anchor,group);
    if (group.length === maximum) return group;
    if (!fallback.length && group.length >= config.players && now >= (anchor.fillStartedAt ?? now)+(config.fillWaitSeconds ?? 60)*1000) fallback = group;
  }
  return fallback;
}
export function queueGroupFor(anchor, entries, config, now = Date.now()) {
  const distance=(a,b)=>Math.abs(rankFor(a.elo,config.ranks).order-rankFor(b.elo,config.ranks).order);
  const candidates=entries.filter((row)=>row.userId!==anchor.userId).sort((a,b)=>distance(a,anchor)-distance(b,anchor) || Math.abs(a.elo-anchor.elo)-Math.abs(b.elo-anchor.elo) || a.joinedAt-b.joinedAt || a.userId.localeCompare(b.userId));
  const canRelocate=(row)=>row.placementPending && now-row.joinedAt>=config.wideningSeconds*1000;
  function collect(relocate) {
    const group=[anchor];
    for (const row of candidates) {
      if (group.every((other)=>{
        const placement=other.placementPending || row.placementPending;
        if (relocate && (canRelocate(other) || canRelocate(row))) return true;
        const range=placement ? Math.floor(config.maximumWindow/2) : Math.min(searchRange(other,config,now),searchRange(row,config,now));
        return distance(other,row)<=range;
      })) group.push(row);
      if (group.length===(config.maximumPlayers ?? config.players)) break;
    }
    return group;
  }
  const group=collect(false);
  // Only placement pairs can move outside the window, when no playable group exists.
  return group.length<config.players ? collect(true) : group;
}
export function validateRankedAction(state, actorId, action) {
  const types={belote:["take","pass","play","next-deal"],"texas-holdem":["fold","check","call","raise","all-in","show","auto-check-fold"],president:["play","pass"],"liars-dice":["bid","challenge"],"velvet-ruse":["draw","discard","declare","trust","challenge"],yahtzee:["roll","score"],"midnight-dice":["choose-contract","draft","discard-market"]};
  if (!types[state.gameId]?.includes(action.type) || action.automatic !== undefined) throw new Error("Action classée invalide.");
  const numeric=(value,min,max)=>Number.isSafeInteger(value) && value>=min && value<=max;
  if (state.gameId === "yahtzee") {
    if (action.type === "score" && !YAHTZEE_CATEGORIES.includes(action.category)) throw new Error("Catégorie inconnue.");
    if (action.type === "roll" && (state.rollsLeft<=0 || !Array.isArray(action.keepIndexes ?? []) || (action.keepIndexes ?? []).some((n)=>!numeric(n,0,4)))) throw new Error("Lancer indisponible.");
  }
  if (state.gameId === "liars-dice" && action.type === "bid" && (!numeric(action.quantity,1,10000)||!numeric(action.face,1,6))) throw new Error("Enchère invalide.");
  if (state.gameId === "midnight-dice") {
    if (action.type === "choose-contract" && (typeof action.contract!=="string" || !midnightContractOffers(state,actorId).includes(action.contract))) throw new Error("Mandat indisponible.");
    if (action.type!=="choose-contract" && !numeric(action.index,0,(state.market?.length ?? 0)-1)) throw new Error("Dé du marché introuvable.");
  }
  if (state.gameId === "texas-holdem" && action.type === "raise" && !numeric(action.amount,1,state.maximumBet)) throw new Error("Mise invalide.");
  if (state.gameId === "president" && action.type === "play" && (action.cards ? !Array.isArray(action.cards)||action.cards.length<1||action.cards.length>4 : !numeric(action.count ?? 1,1,4))) throw new Error("Combinaison invalide.");
}
export function balancedBeloteSeats(players) {
  const sorted = [...players].sort((a,b) => b.elo-a.elo || a.userId.localeCompare(b.userId));
  return [sorted[0].userId, sorted[1].userId, sorted[3].userId, sorted[2].userId];
}
export function eloChanges(participants, k, teams = false) {
  // Compatibility entry point for consumers of the former fixed-K engine.
  return calculateElo(participants, { k, provisional: [], gamma: 1, calculation: teams ? "teams" : "ranking" });
}
export function competitivePositions(room) {
  const state=room.state, roster=room.ranked.roster, forfeits=room.ranked.forfeits ?? {};
  if (!state?.finished) throw new Error("La partie classée n'est pas terminée.");
  const scores = roster.map((player) => {
    let score;
    if (room.gameId === "belote") score=state.teamScores[player.team] ?? 0;
    else if (room.gameId === "yahtzee") score=totalYahtzee(state.scores[player.id]);
    else if (room.gameId === "midnight-dice") score=state.scores[player.id] ?? 0;
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
export function settleRanked(room, users, history, previousSettlement = null) {
  if (!room.ranked || room.ranked.settled || room.ranked.cancelled) return [];
  if (previousSettlement) {
    room.ranked.settled = true;
    room.ranked.results = previousSettlement.results ?? [];
    return [];
  }
  const config=room.ranked.config;
  const positions=competitivePositions(room).map((row)=>{
    const user=users.find((u)=>u.id===row.id),previous=eloFor(user,room.gameId,config);
    return {...row,elo:matchmakingElo(user,room.gameId,config),placementPending:!placementStatus(previous,config).completed,games:previous.games,reason:room.ranked.forfeits?.[row.id] ?? "result"};
  });
  const changes=calculateElo(positions,config,room.gameId);
  const results=changes.map((row)=> {
    const user=users.find((u)=>u.id===row.id);
    const previous=eloFor(user,room.gameId,config), beforePlacement=placementStatus(previous,config);
    const evidence=!beforePlacement.completed && !row.cancelled ? recordPlacement(previous.placement,placementEvidence(row,positions,row.format,config),config) : previous.placement;
    const placement=!beforePlacement.completed ? { ...placementStatus({games:previous.games,placement:evidence},config), wins:evidence?.wins ?? 0,losses:evidence?.losses ?? 0,draws:evidence?.draws ?? 0 } : undefined;
    const after=beforePlacement.completed ? row.after : evidence?.completed ? placementElo(evidence,config) : previous.elo;
    if (user && !row.cancelled) (user.gameElo ??= {})[room.gameId]={...previous,elo:after,games:previous.games+1,wins:previous.wins+Number(row.position===1 && !row.forfeited),...(evidence ? {placement:evidence} : {})};
    return { userId:row.id, before:previous.elo, delta:Math.round((after-previous.elo)*100)/100, after, beforeRank:beforePlacement.completed ? rankFor(previous.elo,config.ranks) : UNRANKED,afterRank:!beforePlacement.completed && !evidence?.completed ? UNRANKED : rankFor(after,config.ranks),progression:!beforePlacement.completed && !evidence?.completed ? null : rankProgress(after,config.ranks),...(placement ? {placement} : {}),position:row.position, penalty:beforePlacement.completed ? row.penalty : 0, reason:row.reason, team:row.team ?? null,
      gameId:room.gameId,matchId:room.ranked.matchId,finishedAt:history.finishedAt ?? new Date().toISOString(),playerCount:row.playerCount,averageElo:row.averageElo,k:row.k,format:row.format,scale:row.scale,cancelled:row.cancelled };
  });
  history.ranked={matchId:room.ranked.matchId,results,participants:room.ranked.roster.map((row)=>({id:row.id,team:row.team ?? null})),config};
  room.ranked.settled=true;
  room.ranked.results=results;
  return results;
}
