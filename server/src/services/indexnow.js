import { DatabaseSync } from "node:sqlite";
import { createHash, randomBytes } from "node:crypto";

export function createIndexNow({ filename, website, catalog, enabled = false, send = fetch, now = Date.now }) {
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=1000; CREATE TABLE IF NOT EXISTS indexnow_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS indexnow_urls(url TEXT PRIMARY KEY,desired TEXT NOT NULL,sent TEXT,changed_at INTEGER NOT NULL)");
  const columns = new Set(db.prepare("PRAGMA table_info(indexnow_urls)").all().map(row => row.name));
  for (const [name, type] of Object.entries({ attempted_hash: "TEXT", attempted_at: "INTEGER", http_status: "INTEGER", accepted_at: "INTEGER", last_error: "TEXT" })) {
    if (!columns.has(name)) db.exec(`ALTER TABLE indexnow_urls ADD COLUMN ${name} ${type}`);
  }
  const meta = key => { const row = db.prepare("SELECT value FROM indexnow_meta WHERE key=?").get(key); return row ? JSON.parse(row.value) : null; };
  const set = (key, value) => db.prepare("INSERT INTO indexnow_meta VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, JSON.stringify(value));
  if (!meta("key")) set("key", randomBytes(24).toString("hex"));
  const canSubmit = () => { const base = new URL(website()); return base.protocol === "https:" && base.hostname.includes(".") && !/(?:^|\.)(?:localhost|local|test|invalid)$/.test(base.hostname); };
  if (meta("enabled") === null) set("enabled", Boolean(enabled && canSubmit()));
  let busy = false, scanTimer, flushTimer, interval, closed = false;
  const key = meta("key"), keyLocation = () => new URL(`${key}.txt`, website().replace(/\/?$/, "/")).href;
  function reconcile() {
    if (closed) return;
    const incoming = new Map(catalog().filter(row => row.indexable && row.status === 200).map(row => [row.url, createHash("sha256").update(JSON.stringify(row.content ?? null)).digest("hex")]));
    const existing = new Map(db.prepare("SELECT * FROM indexnow_urls").all().map(row => [row.url, row]));
    db.exec("BEGIN IMMEDIATE");
    try {
      const upsert = db.prepare("INSERT INTO indexnow_urls(url,desired,changed_at) VALUES(?,?,?) ON CONFLICT(url) DO UPDATE SET desired=excluded.desired,changed_at=excluded.changed_at");
      for (const [url, hash] of incoming) if (existing.get(url)?.desired !== hash) upsert.run(url, hash, now());
      for (const [url, row] of existing) if (!incoming.has(url) && row.desired !== "deleted") upsert.run(url, "deleted", now());
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  }
  function status() {
    return { enabled: meta("enabled"), pending: db.prepare("SELECT count(*) AS n FROM indexnow_urls WHERE sent IS NULL OR sent<>desired").get().n, keyLocation: keyLocation(), ...(meta("delivery") ?? {}), busy };
  }
  function urlStatuses() {
    const enabled = meta("enabled");
    return Object.fromEntries(db.prepare("SELECT * FROM indexnow_urls").all().map(row => {
      const pending = row.sent !== row.desired;
      const currentAttempt = row.attempted_hash === row.desired;
      const state = pending ? !enabled ? "disabled" : currentAttempt && row.last_error ? "error" : "pending"
        : row.http_status === 200 ? "ok" : row.http_status === 202 ? "validating" : "sent";
      return [row.url, { state, httpStatus: currentAttempt ? row.http_status : null, attemptedAt: row.attempted_at, acceptedAt: row.accepted_at, error: currentAttempt ? row.last_error : "" }];
    }));
  }
  async function flush() {
    if (closed || busy || !meta("enabled") || !canSubmit() || (meta("delivery")?.nextAttempt || 0) > now()) return;
    const batch = db.prepare("SELECT url,desired FROM indexnow_urls WHERE sent IS NULL OR sent<>desired ORDER BY changed_at LIMIT 1000").all();
    if (!batch.length) return;
    const base = new URL(website()), prefix = base.pathname.replace(/\/?$/, "/");
    // Only authoritative canonical paths are submitted; no visitor-provided URLs are accepted.
    const allowed = batch.filter(row => { const url = new URL(row.url); return url.origin === base.origin && url.pathname.startsWith(prefix); });
    if (!allowed.length) return;
    busy = true;
    const previous = meta("delivery") ?? {};
    try {
      const response = await send("https://api.indexnow.org/indexnow", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(8000), body: JSON.stringify({ host: base.host, key, keyLocation: keyLocation(), urlList: allowed.map(row => row.url) }) });
      await response.body?.cancel();
      if (![200, 202].includes(response.status)) {
        const error = new Error(`IndexNow a répondu HTTP ${response.status}.`); error.httpStatus = response.status;
        const retry = response.headers?.get("Retry-After"); error.retryAfter = /^\d+$/.test(retry || "") ? Number(retry) * 1000 : Math.max(0, Date.parse(retry) - now()) || 0; throw error;
      }
      const ack = db.prepare("UPDATE indexnow_urls SET sent=?,attempted_hash=?,attempted_at=?,http_status=?,accepted_at=?,last_error='' WHERE url=?");
      db.exec("BEGIN IMMEDIATE");
      try { for (const row of allowed) ack.run(row.desired, row.desired, now(), response.status, now(), row.url); set("delivery", { lastAttempt: now(), lastSuccess: now(), httpStatus: response.status, submitted: allowed.length, failures: 0, error: "", nextAttempt: 0 }); db.exec("COMMIT"); }
      catch (error) { db.exec("ROLLBACK"); throw error; }
    } catch (error) {
      const failures = (previous.failures || 0) + 1;
      const delay = Math.min(86400000, Math.max(error.retryAfter || 0, [400, 403, 422].includes(error.httpStatus) ? 3600000 : 60000 * 2 ** Math.min(failures - 1, 8)));
      const message = error.httpStatus ? error.message : "IndexNow est momentanément injoignable.";
      const failed = db.prepare("UPDATE indexnow_urls SET attempted_hash=?,attempted_at=?,http_status=?,last_error=? WHERE url=?");
      db.exec("BEGIN IMMEDIATE");
      try {
        for (const row of allowed) failed.run(row.desired, now(), error.httpStatus || null, message, row.url);
        set("delivery", { ...previous, lastAttempt: now(), httpStatus: error.httpStatus || null, failures, error: message, nextAttempt: now() + delay });
        db.exec("COMMIT");
      } catch (failure) { db.exec("ROLLBACK"); throw failure; }
    } finally { busy = false; if (closed) db.close(); }
  }
  function schedule() {
    if (closed) return;
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => { try { reconcile(); } catch { set("delivery", { ...meta("delivery"), error: "Impossible de préparer le catalogue public." }); } flush().catch(() => {}); }, 5000); scanTimer.unref?.();
  }
  return {
    key, keyLocation, reconcile, flush, status, urlStatuses, schedule,
    setEnabled: value => { if (typeof value !== "boolean" || value && !canSubmit()) throw new Error("IndexNow nécessite un site public en HTTPS."); set("enabled", value); schedule(); },
    start() { interval = setInterval(schedule, 60000); interval.unref?.(); flushTimer = setTimeout(schedule, 15000); flushTimer.unref?.(); },
    close() { closed = true; clearTimeout(scanTimer); clearTimeout(flushTimer); clearInterval(interval); if (!busy) db.close(); }
  };
}

export function registerIndexNowRoutes({ app, auth, requireBackOffice, requireAdmin, service, website }) {
  const basePath = new URL(website()).pathname.replace(/\/$/, "");
  app.get(`${basePath}/${service.key}.txt`, (_req, res) => res.type("text/plain").set("Cache-Control", "public, max-age=3600").send(service.key));
  app.get("/api/admin/communication/indexnow", auth, requireBackOffice, (_req, res) => res.set("Cache-Control", "no-store").json({ ...service.status(), urls: service.urlStatuses() }));
  app.patch("/api/admin/communication/indexnow", auth, requireAdmin, (req, res) => { try { service.setEnabled(req.body.enabled); res.json(service.status()); } catch (error) { res.status(400).json({ error: error.message }); } });
  app.post("/api/admin/communication/indexnow/check", auth, requireAdmin, (_req, res) => { service.schedule(); res.json(service.status()); });
}
