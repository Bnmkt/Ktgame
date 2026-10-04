import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { Worker } from "node:worker_threads";
import { Temporal } from "@js-temporal/polyfill";

export function calendarDeadline(value, months = 1) {
  return Temporal.Instant.from(new Date(value).toISOString()).toZonedDateTimeISO("Europe/Brussels")
    .add({ months }).withPlainTime("23:59:59.999").toInstant().toString({ fractionalSecondDigits: 3 });
}

export function createDataRequestStore({ filename, now = () => Date.now() }) {
  if (filename !== ":memory:") fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=1000;
    CREATE TABLE IF NOT EXISTS data_requests (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, email TEXT NOT NULL,
      status TEXT NOT NULL, requested_at TEXT NOT NULL, due_at TEXT NOT NULL,
      approved_at TEXT, approved_by TEXT, sent_at TEXT, error TEXT NOT NULL DEFAULT '',
      extension_reason TEXT NOT NULL DEFAULT '', extended_at TEXT, attempts INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_data_request_user ON data_requests(user_id, requested_at DESC);
    CREATE INDEX IF NOT EXISTS idx_data_request_status ON data_requests(status, due_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_data_request_open ON data_requests(user_id) WHERE status IN ('pending','processing','failed');`);
  // Interrupted jobs require a deliberate retry; never resend silently after a restart.
  db.prepare("UPDATE data_requests SET status='failed', error='Envoi interrompu par un redémarrage. Vérifier la réception avant de réessayer.' WHERE status='processing'").run();
  const get = (id) => db.prepare("SELECT * FROM data_requests WHERE id=?").get(id);
  return {
    get,
    pendingCounts() { return Object.fromEntries(db.prepare("SELECT user_id,COUNT(*) AS count FROM data_requests WHERE status!='sent' GROUP BY user_id").all().map((row) => [row.user_id, row.count])); },
    summary() { return db.prepare("SELECT COUNT(*) AS pending,SUM(CASE WHEN due_at < ? THEN 1 ELSE 0 END) AS overdue FROM data_requests WHERE status!='sent'").get(new Date(now()).toISOString()); },
    list(userId) { return userId ? db.prepare("SELECT * FROM data_requests WHERE user_id=? ORDER BY requested_at DESC").all(userId) : db.prepare("SELECT * FROM data_requests ORDER BY requested_at DESC").all(); },
    create(userId, email) {
      const existing = db.prepare("SELECT * FROM data_requests WHERE user_id=? AND status IN ('pending','processing','failed')").get(userId);
      if (existing) return { request: existing, created: false };
      const at = new Date(now()).toISOString();
      const id = randomUUID();
      db.prepare("INSERT INTO data_requests(id,user_id,email,status,requested_at,due_at) VALUES(?,?,?,'pending',?,?)").run(id, userId, email, at, calendarDeadline(at));
      return { request: get(id), created: true };
    },
    approve(id, adminId, email) {
      const result = db.prepare("UPDATE data_requests SET status='processing',email=?,approved_at=?,approved_by=?,error='',attempts=attempts+1 WHERE id=? AND status IN ('pending','failed')")
        .run(email, new Date(now()).toISOString(), adminId, id);
      if (!result.changes) throw new Error("La demande n’est pas en attente ou est déjà en cours d’envoi.");
      return get(id);
    },
    extend(id, reason) {
      const request = get(id);
      if (!request || !["pending", "failed"].includes(request.status) || request.extended_at || now() > Date.parse(calendarDeadline(request.requested_at))) throw new Error("La prolongation doit être annoncée pendant le premier mois et ne peut être appliquée qu’une fois.");
      const explanation = String(reason ?? "").trim().slice(0, 1000);
      if (explanation.length < 10) throw new Error("Indique un motif précis de prolongation.");
      return { ...request, due_at: calendarDeadline(request.requested_at, 3), extension_reason: explanation, extended_at: new Date(now()).toISOString() };
    },
    commitExtension(request) { db.prepare("UPDATE data_requests SET due_at=?,extension_reason=?,extended_at=? WHERE id=? AND extended_at IS NULL AND status IN ('pending','failed')").run(request.due_at, request.extension_reason, request.extended_at, request.id); },
    sent(id) { db.prepare("UPDATE data_requests SET status='sent',sent_at=?,error='' WHERE id=? AND status='processing'").run(new Date(now()).toISOString(), id); },
    fail(id, error) { db.prepare("UPDATE data_requests SET status='failed',error=? WHERE id=? AND status='processing'").run(String(error).slice(0, 1000), id); },
    close() { db.close(); }
  };
}

export function generatePersonalArchive({ userId, paths, requestId, contactEmail, maxBytes = 18 * 1024 * 1024 }) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./personal-archive-worker.js", import.meta.url), { workerData: { userId, paths, requestId, contactEmail, maxBytes } });
    const timer = setTimeout(() => { worker.terminate(); reject(new Error("La génération de l’archive a dépassé le délai technique. Réessaie ou organise une remise sécurisée.")); }, 120000);
    worker.once("message", (message) => {
      clearTimeout(timer);
      if (message.error) reject(new Error(message.error));
      else resolve({ content: Buffer.from(message.content), counts: message.counts });
    });
    worker.once("error", (error) => { clearTimeout(timer); reject(error); });
    worker.once("exit", (code) => { clearTimeout(timer); if (code !== 0) reject(new Error("La génération de l’archive a échoué.")); });
  });
}
