import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

export const LIMITED_EDITOR_IDS = new Set(["4c1acef8-ad29-4120-aadf-42a555a995e8"]);
export const EDITOR_DUPLICATION_INTERVAL = 5 * 60 * 1000;

export function isEditorDuplication(req) {
  const route = req.path.replace(/\/+$/, "").toLowerCase();
  return req.method === "POST" && (route.endsWith("/duplicate") || route === "/shop" && Boolean(req.body?.id));
}

export function createEditorDuplicationLimit({ filename, now = Date.now }) {
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS editor_duplication_limits(user_id TEXT PRIMARY KEY, blocked_until INTEGER NOT NULL, reservation_id TEXT NOT NULL)");
  const reserve = db.prepare(`INSERT INTO editor_duplication_limits VALUES(?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET blocked_until=excluded.blocked_until,reservation_id=excluded.reservation_id
    WHERE editor_duplication_limits.blocked_until<=? RETURNING reservation_id`);
  const blockedUntil = db.prepare("SELECT blocked_until FROM editor_duplication_limits WHERE user_id=?");
  const release = db.prepare("DELETE FROM editor_duplication_limits WHERE user_id=? AND reservation_id=?");
  function middleware(req, res, next) {
    const userId = req.backOfficeUser?.id;
    if (!LIMITED_EDITOR_IDS.has(userId)) return next();
    const time = now(), reservationId = randomUUID();
    // One atomic reservation across all tools and server processes.
    if (!reserve.get(userId, time + EDITOR_DUPLICATION_INTERVAL, reservationId, time)) {
      const seconds = Math.max(1, Math.ceil((blockedUntil.get(userId).blocked_until - time) / 1000));
      res.setHeader("Retry-After", String(seconds));
      return res.status(429).json({ error: `La duplication est limitée à une fois toutes les cinq minutes. Réessaie dans ${seconds} s.`, retryAfterSeconds: seconds });
    }
    res.once("finish", () => { if (res.statusCode >= 400) release.run(userId, reservationId); });
    next();
  }
  middleware.close = () => db.close();
  return middleware;
}
