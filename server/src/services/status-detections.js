import { randomUUID } from "node:crypto";

const clean = (value, max) => String(value ?? "").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "").trim().slice(0, max);
const states = new Set(["open", "in_progress", "closed"]);

export function createStatusDetections(db, components, now) {
  db.exec(`CREATE TABLE IF NOT EXISTS status_detections (
    id TEXT PRIMARY KEY, component_id TEXT NOT NULL, severity TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'open', title TEXT NOT NULL, description TEXT NOT NULL,
    first_at TEXT NOT NULL, last_at TEXT NOT NULL, recovered_at TEXT,
    sample_count INTEGER NOT NULL DEFAULT 1, diagnostic TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT 'probe',
    closed_at TEXT, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL DEFAULT ''
  );
  CREATE UNIQUE INDEX IF NOT EXISTS status_detections_current ON status_detections(component_id) WHERE recovered_at IS NULL;
  CREATE INDEX IF NOT EXISTS status_detections_state_at ON status_detections(state,first_at DESC);`);
  const names = new Map(components.map((entry) => [entry.id, entry.name]));
  const current = db.prepare("SELECT * FROM status_detections WHERE component_id=? AND recovered_at IS NULL");

  function observe(component, timestamp, source = "probe") {
    if (!names.has(component.id)) return;
    const at = new Date(timestamp).toISOString();
    const existing = current.get(component.id);
    if (component.status === "operational") {
      if (existing) db.prepare("UPDATE status_detections SET recovered_at=?,updated_at=? WHERE id=?").run(at, at, existing.id);
      return;
    }
    if (!["degraded", "outage"].includes(component.status)) return;
    const diagnostic = clean(component.diagnostic, 500);
    if (existing) {
      if (at < existing.last_at) return;
      const description = component.status === "outage" && existing.severity !== "outage" ? `${existing.description}\n\nLa sonde a ensuite relevé une indisponibilité.` : existing.description;
      db.prepare("UPDATE status_detections SET severity=?,description=?,last_at=?,sample_count=sample_count+1,diagnostic=CASE WHEN ?='' THEN diagnostic ELSE ? END,updated_at=? WHERE id=?")
        .run(component.status === "outage" ? "outage" : existing.severity, description, at, diagnostic, diagnostic, at, existing.id);
      return;
    }
    const severity = component.status;
    const title = `${names.get(component.id)} : ${severity === "outage" ? "indisponibilité" : "dégradation"} détectée`;
    const description = [
      `La sonde du service « ${names.get(component.id)} » a relevé un état ${severity === "outage" ? "indisponible" : "dégradé"}.`,
      clean(component.message, 300),
      Number(component.latencyMs) > 0 ? `Temps de réponse mesuré : ${Math.round(component.latencyMs)} ms.` : "",
      source === "history" ? "Reconstitué depuis les tranches historiques : les heures sont approximatives et le diagnostic original n’est pas disponible." : "Ce relevé constate un symptôme ; il ne confirme pas la cause ni une interruption continue entre deux sondes."
    ].filter(Boolean).join("\n\n");
    db.prepare("INSERT INTO status_detections(id,component_id,severity,title,description,first_at,last_at,diagnostic,source,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
      .run(randomUUID(), component.id, severity, title, description, at, at, diagnostic, source, at);
  }

  // Replay retained slots once, without inventing an exact SMTP error or outage duration.
  if (!db.prepare("SELECT 1 FROM status_settings WHERE key='detections-migration'").get()) {
    db.exec("BEGIN IMMEDIATE");
    try {
      // Finish each bounded read before writing: temporary SQLite iterators can be finalized by GC.
      const history = db.prepare("SELECT * FROM status_slots WHERE (bucket_at,component_id)>(?,?) ORDER BY bucket_at,component_id LIMIT 500");
      let cursor = ["", ""];
      for (;;) {
        const rows = history.all(...cursor);
        if (!rows.length) break;
        for (const row of rows) {
          if (["degraded", "outage"].includes(row.worst_status)) observe({ id: row.component_id, status: row.worst_status, message: row.latest_status === row.worst_status ? row.message : "Anomalie enregistrée dans cette tranche, puis retour à la normale.", latencyMs: row.latency_max }, Date.parse(row.bucket_at), "history");
          observe({ id: row.component_id, status: row.latest_status, message: row.message }, Date.parse(row.updated_at), "history");
        }
        cursor = [rows.at(-1).bucket_at, rows.at(-1).component_id];
      }
      db.prepare("INSERT INTO status_settings(key,value) VALUES('detections-migration','1')").run();
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  }

  function list({ state = "pending", page = 1, pageSize = 20 } = {}) {
    const filter = state === "closed" ? "state='closed'" : state === "all" ? "1=1" : "state!='closed'";
    const totalItems = db.prepare(`SELECT COUNT(*) AS count FROM status_detections WHERE ${filter}`).get().count;
    pageSize = [20, 50, 100].includes(Number(pageSize)) ? Number(pageSize) : 20;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    page = Math.max(1, Math.min(totalPages, Math.trunc(Number(page) || 1)));
    return { rows: db.prepare(`SELECT * FROM status_detections WHERE ${filter} ORDER BY first_at DESC,id DESC LIMIT ? OFFSET ?`).all(pageSize, (page - 1) * pageSize), totalItems, totalPages, page, pageSize };
  }
  function summary() {
    return db.prepare("SELECT COUNT(*) AS pending,COALESCE(SUM(recovered_at IS NULL),0) AS ongoing FROM status_detections WHERE state!='closed'").get();
  }
  function update(id, input, userId) {
    const row = db.prepare("SELECT * FROM status_detections WHERE id=?").get(id);
    if (!row) return null;
    const title = clean(input.title ?? row.title, 160);
    const notes = clean(input.notes ?? row.notes, 8000);
    const state = input.state ?? row.state;
    if (!title || !states.has(state)) throw new Error("Titre ou état invalide.");
    if (state === "closed" && !notes) throw new Error("Ajoute une conclusion avant de clôturer cet incident.");
    const at = new Date(now()).toISOString();
    db.prepare("UPDATE status_detections SET title=?,notes=?,state=?,closed_at=?,updated_at=?,updated_by=? WHERE id=?")
      .run(title, notes, state, state === "closed" ? row.closed_at || at : null, at, String(userId), id);
    return db.prepare("SELECT * FROM status_detections WHERE id=?").get(id);
  }
  function prune(timestamp) {
    db.prepare("DELETE FROM status_detections WHERE state='closed' AND recovered_at IS NOT NULL AND updated_at<?").run(new Date(timestamp - 400 * 86400000).toISOString());
  }
  return { observe, list, summary, update, prune };
}
