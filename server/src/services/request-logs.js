import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";

const clean = (value, max = 160) => String(value ?? "").replace(/[\x00-\x1f\x7f]/g, " ").slice(0, max);
const dateIso = (value) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
export function safeLogPath(value) {
  return clean(String(value ?? "").split(/[?#]/)[0], 250)
    .replace(/[^/]*@[^/]*/g, ":redacted")
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":id")
    .replace(/\b[A-F0-9]{6}\b/g, ":code")
    .replace(/\/[^/]{40,}/g, "/:redacted");
}
function safeOrigin(value) {
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url.origin : ""; } catch { return ""; }
}
function browserName(value = "") {
  if (/Edg\//.test(value)) return "Edge";
  if (/Firefox\//.test(value)) return "Firefox";
  if (/Chrome\//.test(value)) return "Chrome";
  if (/Safari\//.test(value)) return "Safari";
  return "Autre / inconnu";
}
export function requestOutcome(status, aborted = false, cors = false) {
  if (aborted) return { level: "warning", category: "interrupted", message: "Connexion interrompue avant la fin de la réponse." };
  if (cors) return { level: "warning", category: "cors", message: "Origine du site non autorisée (CORS)." };
  if (status === 401) return { level: "warning", category: "authentication", message: "Authentification absente, invalide ou expirée." };
  if (status === 403) return { level: "warning", category: "access", message: "Accès refusé : droits insuffisants ou compte désactivé." };
  if (status === 429) return { level: "warning", category: "rate-limit", message: "Trop de requêtes : limite temporaire atteinte." };
  if (status >= 500) return { level: "error", category: "server", message: "Erreur interne du serveur pendant le traitement." };
  if (status >= 400) return { level: "warning", category: "request", message: status === 404 ? "Ressource introuvable." : "Requête refusée ou données invalides." };
  if (status === 304) return { level: "info", category: "cache", message: "Réponse inchangée : réutilisation du cache (pas une erreur)." };
  return { level: "info", category: "success", message: "Requête traitée avec succès." };
}

export function createRequestLogStore({ filename, retentionDays = 14, maxRows = 100000, flushMs = 2000, now = () => Date.now() }) {
  if (filename !== ":memory:") mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=1000;
    CREATE TABLE IF NOT EXISTS request_logs (
      id INTEGER PRIMARY KEY, at TEXT NOT NULL, level TEXT NOT NULL, category TEXT NOT NULL,
      method TEXT NOT NULL, route TEXT NOT NULL, status INTEGER NOT NULL, duration REAL NOT NULL,
      user_id TEXT NOT NULL, request_id TEXT NOT NULL, origin TEXT NOT NULL, browser TEXT NOT NULL, message TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS request_logs_at ON request_logs(at);
    CREATE INDEX IF NOT EXISTS request_logs_category_at ON request_logs(category, at);
    CREATE INDEX IF NOT EXISTS request_logs_status_at ON request_logs(status, at);`);
  const insert = db.prepare("INSERT INTO request_logs(at,level,category,method,route,status,duration,user_id,request_id,origin,browser,message) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)");
  let queue = [];
  let dropped = 0;
  let storageError = false;
  let lastPruned = 0;
  function prune() {
    db.prepare("DELETE FROM request_logs WHERE at < ?").run(new Date(now() - retentionDays * 86400000).toISOString());
    db.prepare("DELETE FROM request_logs WHERE id <= COALESCE((SELECT id FROM request_logs ORDER BY id DESC LIMIT 1 OFFSET ?), -1)").run(maxRows);
    lastPruned = now();
  }
  function flush() {
    if (!queue.length) return;
    const batch = queue;
    queue = [];
    try {
      db.exec("BEGIN");
      for (const row of batch) insert.run(row.at, row.level, row.category, row.method, row.route, row.status, row.duration, row.userId, row.requestId, row.origin, row.browser, row.message);
      if (!lastPruned || now() - lastPruned >= 60000) prune();
      db.exec("COMMIT");
      storageError = false;
    } catch {
      try { db.exec("ROLLBACK"); } catch { /* Transaction already rolled back. */ }
      dropped += batch.length;
      if (!storageError) console.error("Request history storage unavailable; some diagnostic entries were lost.");
      storageError = true;
    }
  }
  function append(row) {
    if (queue.length >= 1000) { dropped += 1; return; }
    queue.push({
      at: dateIso(row.at) ?? new Date(now()).toISOString(),
      level: ["info", "warning", "error"].includes(row.level) ? row.level : "info",
      category: clean(row.category, 30), method: clean(row.method, 12), route: safeLogPath(row.route),
      status: Math.max(0, Math.min(599, Math.trunc(Number(row.status) || 0))),
      duration: Math.max(0, Number(row.duration) || 0), userId: clean(row.userId, 80),
      requestId: clean(row.requestId || randomUUID(), 80), origin: safeOrigin(row.origin),
      browser: clean(row.browser, 30), message: clean(row.message, 300)
    });
  }
  function query(filters = {}) {
    flush();
    if (now() - lastPruned >= 60000) prune();
    const conditions = ["1=1"], values = [];
    const add = (condition, value) => { conditions.push(condition); values.push(value); };
    const from = dateIso(filters.from), to = dateIso(filters.to);
    if (from) add("at >= ?", from);
    if (to) add("at <= ?", to);
    if (["info", "warning", "error"].includes(filters.level)) add("level = ?", filters.level);
    if (filters.category) add("category = ?", clean(filters.category, 30));
    if (/^[1-5][0-9]{2}$/.test(filters.status)) add("status = ?", Number(filters.status));
    if (["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"].includes(filters.method)) add("method = ?", filters.method);
    if (filters.search) {
      const search = `%${clean(filters.search, 100).replace(/[\\%_]/g, "\\$&")}%`;
      conditions.push("(route LIKE ? ESCAPE '\\' OR user_id LIKE ? ESCAPE '\\' OR request_id LIKE ? ESCAPE '\\')");
      values.push(search, search, search);
    }
    const where = conditions.join(" AND ");
    const summary = db.prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(status BETWEEN 400 AND 499),0) AS clientErrors, COALESCE(SUM(status >= 500),0) AS serverErrors, COALESCE(SUM(category='interrupted'),0) AS interrupted, COALESCE(AVG(duration),0) AS averageMs FROM request_logs WHERE ${where}`).get(...values);
    const limit = 50;
    const pageCount = Math.max(1, Math.ceil(summary.total / limit));
    const page = Math.min(pageCount, Math.max(1, Math.trunc(Number(filters.page) || 1)));
    const rows = db.prepare(`SELECT id,at,level,category,method,route,status,duration,user_id AS userId,request_id AS requestId,origin,browser,message FROM request_logs WHERE ${where} ORDER BY at DESC,id DESC LIMIT ? OFFSET ?`).all(...values, limit, (page - 1) * limit);
    return { rows, summary, page, pageCount, retentionDays, maxRows, dropped, storageError, generatedAt: new Date(now()).toISOString() };
  }
  prune();
  const timer = flushMs > 0 ? setInterval(flush, flushMs) : null;
  timer?.unref();
  return { append, query, flush, close() { if (timer) clearInterval(timer); flush(); db.close(); } };
}

export function requestLogMiddleware(store) {
  return (req, res, next) => {
    const started = performance.now();
    const at = new Date().toISOString();
    const originalPath = safeLogPath(req.path);
    const requestId = randomUUID();
    res.setHeader("X-Request-Id", requestId);
    let recorded = false;
    function record() {
      if (recorded) return;
      recorded = true;
      // Keep failures on monitoring routes, but omit successful self-polling.
      if (/\/api\/admin\/health(?:\/|$)/.test(originalPath) && res.statusCode < 400 && res.writableFinished) return;
      const aborted = !res.writableFinished;
      const outcome = requestOutcome(res.statusCode, aborted, res.locals.logCorsDenied);
      store.append({ at, ...outcome, requestId, method: req.method, route: req.route?.path ? String(req.route.path) : originalPath,
        status: aborted ? 0 : res.statusCode, duration: performance.now() - started,
        userId: req.auth?.id, origin: req.headers.origin, browser: browserName(req.headers["user-agent"])
      });
    }
    res.once("finish", record);
    res.once("close", record);
    next();
  };
}
