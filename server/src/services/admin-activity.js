import { archiveDays, archiveRows } from "../storage/archives.js";
import { CASINO_TIME_ZONE, casinoDateKey, recordedDateKey, shiftDateKey } from "./time.js";

export function recordedBefore(value, now = Date.now()) {
  return Boolean(recordedDateKey(value) && new Date(value).getTime() <= Number(now));
}

export function registrationDate(user, transactions, now = Date.now()) {
  if (recordedBefore(user.createdAt, now)) return new Date(user.createdAt).toISOString();
  // A gameplay reset also grants a signup bonus, but does not create an account.
  const rows = archiveRows(transactions, { userId: user.id, reason: "signup-bonus" });
  const dates = rows.filter((row) => row.note !== "Réinitialisation globale du casino" && recordedBefore(row.createdAt, now))
    .map((row) => new Date(row.createdAt).getTime());
  return dates.length ? new Date(dates.reduce((oldest, date) => Math.min(oldest, date), Infinity)).toISOString() : null;
}

export function adminActivity(db, requestedDays = 7, { now = new Date(), isOnline = () => false } = {}) {
  const days = [1, 7, 30].includes(Number(requestedDays)) ? Number(requestedDays) : 7;
  const today = casinoDateKey(now), start = shiftDateKey(today, 1 - days);
  const users = db.users.filter((user) => !user.guest && !user.isBot);
  const userIds = new Set(users.map((user) => user.id));
  const signupDates = new Map(users.map((user) => [user.id, registrationDate(user, db.transactions, now)]));
  const daily = new Map(Array.from({ length: days }, (_, index) => {
    const date = shiftDateKey(start, index);
    return [date, { date, games: 0, signups: 0, players: new Set(), credits: 0, debits: 0, transactions: 0 }];
  }));
  for (const date of signupDates.values()) {
    const bucket = daily.get(recordedDateKey(date));
    if (bucket) bucket.signups++;
  }
  const histories = archiveDays(db.history, start, today).filter((row) => recordedBefore(row.finishedAt, now));
  const completed = histories.filter((row) => !row.ranked?.cancelled);
  const players = new Set(), topGames = new Map();
  for (const row of completed) {
    const bucket = daily.get(recordedDateKey(row.finishedAt));
    bucket.games++;
    const game = topGames.get(row.gameId) ?? { id: row.gameId, games: 0, players: new Set() };
    game.games++;
    for (const player of row.players ?? []) {
      if (player.isBot || player.guest || !userIds.has(player.id)) continue;
      players.add(player.id); bucket.players.add(player.id); game.players.add(player.id);
    }
    topGames.set(row.gameId, game);
  }
  const transactions = archiveDays(db.transactions, start, today)
    .filter((row) => userIds.has(row.userId) && recordedBefore(row.createdAt, now) && Number.isFinite(Number(row.amount)));
  for (const row of transactions) {
    const bucket = daily.get(recordedDateKey(row.createdAt));
    bucket.credits += Math.max(0, Number(row.amount));
    bucket.debits += Math.max(0, -Number(row.amount));
    bucket.transactions++;
  }
  const series = [...daily.values()].map((row) => ({ ...row, players: row.players.size }));
  const current = daily.get(today);
  const rooms = db.rooms.filter((room) => !room.finished);
  const seats = rooms.flatMap((room) => room.players ?? []);
  const registeredSeats = seats.filter((player) => !player.isBot && !player.guest && userIds.has(player.id));
  const countSignups = (from) => [...signupDates.values()].filter((date) => {
    const key = recordedDateKey(date); return key && key >= from && key <= today;
  }).length;
  return {
    generatedAt: new Date(now).toISOString(),
    period: { days, from: start, to: today, timeZone: CASINO_TIME_ZONE },
    users: {
      total: users.length, active: users.filter((user) => user.active !== false).length,
      inactive: users.filter((user) => user.active === false).length,
      online: users.filter((user) => isOnline(user.id)).length,
      unknownRegistrationDates: [...signupDates.values()].filter((date) => !date).length,
      newToday: countSignups(today), new7d: countSignups(shiftDateKey(today, -6)), newInPeriod: countSignups(start)
    },
    rooms: {
      active: rooms.length, playing: rooms.filter((room) => room.state).length,
      waiting: rooms.filter((room) => !room.state).length,
      seatedPlayers: new Set(registeredSeats.map((player) => player.id)).size,
      seatedHumans: seats.filter((player) => !player.isBot).length,
      seatedGuests: seats.filter((player) => !player.isBot && (player.guest || !userIds.has(player.id))).length,
      seatedBots: seats.filter((player) => player.isBot).length
    },
    activity: {
      games: completed.length, gamesToday: current.games, gamesTotal: db.history.length,
      cancelled: histories.length - completed.length, uniquePlayers: players.size, activePlayersToday: current.players.size,
      rankedGames: completed.filter((row) => row.ranked).length,
      daily: series,
      topGames: [...topGames.values()].map((row) => ({ ...row, players: row.players.size })).sort((a, b) => b.games - a.games).slice(0, 5)
    },
    economy: {
      circulatingTokens: users.reduce((sum, user) => sum + Math.max(0, Number(user.tokens) || 0), 0),
      credits: series.reduce((sum, row) => sum + row.credits, 0), debits: series.reduce((sum, row) => sum + row.debits, 0),
      transactions: transactions.length, creditsToday: current.credits, debitsToday: current.debits, transactionsToday: current.transactions
    },
    recentUsers: users.filter((user) => signupDates.get(user.id))
      .sort((a, b) => signupDates.get(b.id).localeCompare(signupDates.get(a.id))).slice(0, 5)
      .map((user) => ({ id: user.id, createdAt: signupDates.get(user.id) }))
  };
}
