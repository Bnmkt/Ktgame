import { randomUUID } from "node:crypto";

const clean = (value, max) => String(value ?? "").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "").trim().slice(0, max);
const states = new Set(["open", "in_progress", "closed", "dismissed"]);
export const dismissalPresets = [
  { id: "provider", label: "Connexion refusée par le fournisseur mail", text: "Le fournisseur mail refuse la connexion. Aucune action corrective locale identifiée à ce stade ; le service reste surveillé et le suivi pourra être rouvert." },
  { id: "external", label: "Incident chez un prestataire externe", text: "Le problème dépend d'un prestataire externe. Aucune intervention locale possible en l'état ; la surveillance reste active." },
  { id: "transient", label: "Anomalie ponctuelle, non reproduite", text: "Anomalie ponctuelle non reproduite après vérification. Aucun dysfonctionnement persistant confirmé ; surveillance maintenue." },
  { id: "expected", label: "Interruption attendue / maintenance", text: "Le relevé correspond à une interruption attendue ou à une maintenance connue. Aucun suivi correctif supplémentaire nécessaire." },
  { id: "duplicate", label: "Déjà suivi dans un autre dossier", text: "Le problème est déjà pris en charge dans un autre dossier. Ce relevé est conservé pour référence." }
];

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
  const columns = new Set(db.prepare("PRAGMA table_info(status_detections)").all().map((column) => column.name));
  for (const [name, type] of [["dismissal_reason", "TEXT NOT NULL DEFAULT ''"], ["dismissed_at", "TEXT"], ["public_reopened_at", "TEXT"]]) {
    if (!columns.has(name)) db.exec(`ALTER TABLE status_detections ADD COLUMN ${name} ${type}`);
  }
  db.exec(`CREATE INDEX IF NOT EXISTS status_detections_component_at ON status_detections(component_id,first_at DESC);
    CREATE TABLE IF NOT EXISTS status_detection_actions (
      id TEXT PRIMARY KEY, detection_id TEXT NOT NULL, previous_state TEXT NOT NULL,
      state TEXT NOT NULL, notes TEXT NOT NULL, dismissal_reason TEXT NOT NULL,
      created_at TEXT NOT NULL, created_by TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS status_detection_actions_record ON status_detection_actions(detection_id,created_at DESC);`);
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
      Number(component.latencyMs) > 0 ? `Temps de réponse mesuré : ${Number(component.latencyMs) < 1 ? "moins de 1" : Math.round(component.latencyMs)} ms.` : "",
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

  function list({ state = "pending", component = "all", severity = "all", page = 1, pageSize = 20 } = {}) {
    if (!names.has(component) && component !== "all") throw new Error("Service invalide.");
    if (!["all", "outage", "degraded"].includes(severity)) throw new Error("Gravité invalide.");
    if (!["pending", "all", ...states].includes(state)) throw new Error("État invalide.");
    const clauses = [state === "all" ? "1=1" : state === "pending" ? "state NOT IN ('closed','dismissed')" : "state=?"];
    const params = state === "all" || state === "pending" ? [] : [state];
    if (severity !== "all") { clauses.push("severity=?"); params.push(severity); }
    const counts = db.prepare(`SELECT component_id,COUNT(*) AS count FROM status_detections WHERE ${clauses.join(" AND ")} GROUP BY component_id`).all(...params);
    if (component !== "all") { clauses.push("component_id=?"); params.push(component); }
    const filter = clauses.join(" AND ");
    const totalItems = db.prepare(`SELECT COUNT(*) AS count FROM status_detections WHERE ${filter}`).get(...params).count;
    pageSize = [20, 50, 100].includes(Number(pageSize)) ? Number(pageSize) : 20;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    page = Math.max(1, Math.min(totalPages, Math.trunc(Number(page) || 1)));
    return { rows: db.prepare(`SELECT * FROM status_detections WHERE ${filter} ORDER BY first_at DESC,id DESC LIMIT ? OFFSET ?`).all(...params, pageSize, (page - 1) * pageSize), totalItems, totalPages, page, pageSize, counts: Object.fromEntries(counts.map((row) => [row.component_id, row.count])), dismissalPresets };
  }
  function summary() {
    return db.prepare("SELECT COUNT(*) AS pending,COALESCE(SUM(recovered_at IS NULL),0) AS ongoing FROM status_detections WHERE state NOT IN ('closed','dismissed')").get();
  }
  function validate(row, input) {
    const title = clean(input.title ?? row.title, 160);
    if (input.notesMode != null && !["append", "replace"].includes(input.notesMode)) throw new Error("Mode de notes invalide.");
    const incomingNotes = clean(input.notes, 8000);
    const combinedNotes = [row.notes, incomingNotes].filter(Boolean).join("\n\n");
    if (input.notesMode === "append" && combinedNotes.length > 8000) throw new Error("Les notes cumulées dépassent 8 000 caractères. Modifie ce dossier individuellement ou choisis de remplacer ses notes.");
    const notes = input.notesMode === "append" ? combinedNotes : clean(input.notes ?? row.notes, 8000);
    const state = input.state ?? row.state;
    const reason = clean(input.dismissal_reason ?? row.dismissal_reason, 4000);
    if (!title || !states.has(state)) throw new Error("Titre ou état invalide.");
    if (state === "closed" && !notes) throw new Error("Ajoute une conclusion avant de clôturer cet incident.");
    if (state === "dismissed" && !reason) throw new Error("Ajoute un justificatif avant de classer cet incident sans suite.");
    return { title, notes, state, reason };
  }
  function write(row, values, userId, publicReopen = false) {
    const at = new Date(now()).toISOString();
    db.prepare("UPDATE status_detections SET title=?,notes=?,state=?,dismissal_reason=?,dismissed_at=?,public_reopened_at=?,closed_at=?,updated_at=?,updated_by=? WHERE id=?")
      .run(values.title, values.notes, values.state, values.reason, values.state === "dismissed" ? row.state === "dismissed" ? row.dismissed_at || at : at : row.dismissed_at,
        publicReopen ? at : values.state === "dismissed" ? null : row.public_reopened_at,
        values.state === "closed" ? row.closed_at || at : null, at, String(userId), row.id);
    db.prepare("INSERT INTO status_detection_actions VALUES(?,?,?,?,?,?,?,?)").run(randomUUID(), row.id, row.state, values.state, values.notes, values.reason, at, String(userId));
  }
  function transaction(action) {
    db.exec("BEGIN IMMEDIATE");
    try { const result = action(); db.exec("COMMIT"); return result; }
    catch (error) { db.exec("ROLLBACK"); throw error; }
  }
  function update(id, input, userId) {
    const row = db.prepare("SELECT * FROM status_detections WHERE id=?").get(id);
    if (!row) return null;
    const values = validate(row, input);
    transaction(() => write(row, values, userId));
    return db.prepare("SELECT * FROM status_detections WHERE id=?").get(id);
  }
  function batch(ids, input, userId) {
    if (!Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some((id) => typeof id !== "string")) throw new Error("Sélectionne entre 1 et 100 incidents.");
    if (Object.hasOwn(input, "title")) throw new Error("Les titres se modifient individuellement.");
    if (!["state", "notes", "dismissal_reason"].some((key) => Object.hasOwn(input, key))) throw new Error("Choisis une modification à appliquer.");
    return transaction(() => {
      const rows = [...new Set(ids)].map((id) => db.prepare("SELECT * FROM status_detections WHERE id=?").get(id));
      if (rows.some((row) => !row)) throw new Error("Un incident sélectionné n'existe plus. Aucun changement enregistré.");
      const changes = rows.map((row) => validate(row, { ...input, notesMode: input.notesMode ?? "append" }));
      rows.forEach((row, index) => write(row, changes[index], userId));
      return { updated: rows.length };
    });
  }
  function publicRanges(start, end) {
    return db.prepare(`SELECT component_id,first_at,last_at FROM status_detections
      WHERE (state='dismissed' OR (state='in_progress' AND public_reopened_at IS NOT NULL))
      AND first_at<? AND last_at>=?`).all(end, start);
  }
  function reopenPublic(component, start, end) {
    return transaction(() => {
      const rows = db.prepare("SELECT * FROM status_detections WHERE component_id=? AND state='dismissed' AND first_at<? AND last_at>=?").all(component, end, start);
      for (const row of rows) write(row, validate(row, { state: "in_progress" }), "public-status", true);
      return { state: "in_progress" };
    });
  }
  function history(id) {
    return db.prepare("SELECT * FROM status_detection_actions WHERE detection_id=? ORDER BY created_at DESC,rowid DESC LIMIT 50").all(id);
  }
  function prune(timestamp) {
    transaction(() => {
      db.prepare("DELETE FROM status_detections WHERE state IN ('closed','dismissed') AND recovered_at IS NOT NULL AND updated_at<?").run(new Date(timestamp - 400 * 86400000).toISOString());
      db.exec("DELETE FROM status_detection_actions WHERE detection_id NOT IN (SELECT id FROM status_detections)");
    });
  }
  return { observe, list, summary, update, batch, publicRanges, reopenPublic, history, prune };
}
