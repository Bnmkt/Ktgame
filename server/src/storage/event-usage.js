import { Archive } from "./archives.js";
import { prepared } from "./statements.js";
import { casinoDateKey } from "../services/time.js";

export function eventActionUsage(collection, eventId, userId, now, periodMinutes = 60) {
  const today = casinoDateKey(now);
  const periodMs = periodMinutes * 60000;
  const start = Math.floor(now.getTime() / periodMs) * periodMs;
  const indexed = collection instanceof Archive;
  const result = { totalFree: 0, dailyFree: 0, periodFree: 0, today: 0 };
  if (indexed) {
    Object.assign(result, prepared(collection.sqlite, `SELECT
      coalesce(sum(paid = 0), 0) AS totalFree,
      coalesce(sum(paid = 0 AND day = ?), 0) AS dailyFree,
      coalesce(sum(paid = 0 AND julianday(created_at) >= julianday(?)), 0) AS periodFree,
      coalesce(sum(day = ?), 0) AS today
      FROM community_event_actions WHERE event_id = ? AND user_id = ?`)
      .get(today, new Date(start).toISOString(), today, eventId, userId));
  }
  for (const row of indexed ? collection.pending : collection) {
    if (row.eventId !== eventId || row.userId !== userId) continue;
    if (casinoDateKey(row.createdAt) === today) { result.today++; if (!row.paid) result.dailyFree++; }
    if (!row.paid) { result.totalFree++; if (Date.parse(row.createdAt) >= start) result.periodFree++; }
  }
  return result;
}
