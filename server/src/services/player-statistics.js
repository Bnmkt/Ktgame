import { Archive } from "../storage/archives.js";
import { casinoDateKey } from "./time.js";
import { prepared } from "../storage/statements.js";
import { CacheTelemetry } from "./cache-telemetry.js";

const stakeReasons = new Set(["room-stake", "blackjack-bet", "blackjack-double", "421-paid-reroll"]);
const shopReasons = new Set(["shop-purchase", "shop-pack-purchase"]);
const caches = new WeakMap();

export function playerStatisticsCacheHealth(db) {
  const cache = caches.get(db.history);
  return cache?.transactions === db.transactions
    ? cache.telemetry.snapshot(cache.users.size, 2048)
    : new CacheTelemetry().snapshot(0, 2048);
}

// Indexed aggregates, not hydrated match/ledger documents. The bounded cache is
// invalidated only for affected users, including inserts not yet committed.
export function playerStatistics(db, userId) {
  const indexed = db.history instanceof Archive && db.transactions instanceof Archive;
  const revision = indexed ? `${db.history.revisionFor(userId)}:${db.transactions.revisionFor(userId)}` : null;
  let cache;
  if (indexed) {
    cache = caches.get(db.history);
    if (!cache || cache.transactions !== db.transactions) {
      cache = { transactions: db.transactions, users: new Map(), telemetry: new CacheTelemetry() };
      caches.set(db.history, cache);
    }
    const prior = cache.users.get(userId);
    if (prior?.revision === revision) { cache.telemetry.hits++; return prior.stats; }
    cache.telemetry.misses++;
    if (prior) cache.telemetry.invalidations++;
  }
  const stats = { gamesPlayed: 0, wins: 0, gameWins: {}, activity: {}, gameIds: [], transactionGameIds: [], transactionReasons: [], transactions: 0, credits: 0, debits: 0, staked: 0, shopSpent: 0, shopPurchases: 0, dailyClaims: 0, claimDates: [], resultIds: [] };
  const resultIds = new Set(), dates = new Set(), gameIds = new Set(), transactionGames = new Set(), reasons = new Set();
  const addGames = (gameId, day, count, wins) => {
    stats.gamesPlayed += count;
    stats.wins += wins;
    if (gameId) { gameIds.add(gameId); stats.gameWins[gameId] = (stats.gameWins[gameId] ?? 0) + wins; }
    if (day) stats.activity[day] = (stats.activity[day] ?? 0) + count;
  };
  const addLedger = (reason, day, count, credits, debits) => {
    stats.transactions += count;
    stats.credits += credits;
    stats.debits += debits;
    if (reason) reasons.add(reason);
    if (stakeReasons.has(reason)) stats.staked += debits;
    if (shopReasons.has(reason)) { stats.shopSpent += debits; stats.shopPurchases += count; }
    if (reason === "daily-claim") { stats.dailyClaims += count; if (day) dates.add(day); }
  };
  if (indexed) {
    const sql = db.history.sqlite;
    for (const row of prepared(sql, "SELECT game_id, day, count(*) AS games, sum(won) AS wins FROM history_members WHERE user_id = ? GROUP BY game_id, day").iterate(userId)) addGames(row.game_id, row.day, row.games, row.wins);
    for (const row of prepared(sql, "SELECT DISTINCT j.value AS id FROM history_members m, json_each(m.result_ids) j WHERE m.user_id = ?").iterate(userId)) resultIds.add(row.id);
    for (const row of prepared(sql, "SELECT reason, CASE WHEN reason = 'daily-claim' THEN day ELSE '' END AS claim_day, count(*) AS n, sum(max(0, amount)) AS credits, -sum(min(0, amount)) AS debits FROM transactions WHERE user_id = ? GROUP BY reason, claim_day").iterate(userId)) addLedger(row.reason, row.claim_day, row.n, row.credits, row.debits);
    for (const row of prepared(sql, "SELECT DISTINCT game_id FROM transactions WHERE user_id = ? AND game_id IS NOT NULL").iterate(userId)) transactionGames.add(row.game_id);
  }
  for (const row of indexed ? db.history.pending : db.history) {
    if (!row.players?.some((player) => player.id === userId) && !row.winners?.includes(userId)) continue;
    addGames(row.gameId, casinoDateKey(row.finishedAt), 1, Number(row.winners?.includes(userId) ?? false));
    for (const id of row.achievementEvents?.[userId] ?? []) resultIds.add(id);
  }
  for (const row of indexed ? db.transactions.pending : db.transactions) {
    if (row.userId !== userId) continue;
    addLedger(row.reason, casinoDateKey(row.createdAt), 1, Math.max(0, Number(row.amount) || 0), -Math.min(0, Number(row.amount) || 0));
    if (row.gameId) transactionGames.add(row.gameId);
  }
  stats.resultIds = [...resultIds];
  stats.claimDates = [...dates].sort();
  stats.gameIds = [...gameIds].sort();
  stats.transactionGameIds = [...transactionGames].sort();
  stats.transactionReasons = [...reasons].sort();
  if (cache) {
    if (!cache.users.has(userId) && cache.users.size >= 2048) { cache.users.delete(cache.users.keys().next().value); cache.telemetry.evictions++; }
    cache.users.set(userId, { revision, stats });
  }
  return stats;
}
