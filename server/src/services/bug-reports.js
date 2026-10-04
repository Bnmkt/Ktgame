import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { redactBugPublicText, sanitizeBugDiagnostics } from "./bug-diagnostics.js";
import { sanitizeBugImage } from "./bug-images.js";

export const bugMetadata = {
  statuses: { received: "Reçu", analyzing: "En analyse", reproduced: "Reproduit", planned: "Correction prévue", fixed: "Corrigé", closed: "Fermé" },
  priorities: { low: "Basse", normal: "Normale", high: "Haute", critical: "Critique" },
  categories: { interface: "Interface", game: "Jeu", account: "Compte / connexion", email: "Email", shop: "Boutique", community: "Communauté", performance: "Performance", other: "Autre" },
  frequencies: { once: "Une seule fois", intermittent: "Parfois", often: "Souvent", always: "À chaque fois", unknown: "Je ne sais pas" },
  impacts: { cosmetic: "Visuel uniquement", minor: "Gênant", major: "Fonction inutilisable", blocking: "Accès ou partie bloqué" },
  relations: { depends_on: "Dépend de", similar: "Similaire à", duplicate: "Doublon de", related: "Lié à" }
};
const clean = (value, max = 6000) => String(value ?? "").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "").trim().slice(0, max);
const hash = (value) => createHash("sha256").update(String(value)).digest("hex");
const equalHash = (stored, value) => typeof stored === "string" && stored.length === 64 && typeof value === "string" && value.length <= 200 && timingSafeEqual(Buffer.from(stored, "hex"), Buffer.from(hash(value), "hex"));
const valid = (map, value, label) => { if (!Object.hasOwn(map, value)) throw new Error(`${label} invalide.`); return value; };
export function bugId(value) {
  const match = String(value ?? "").match(/^(?:BUG[ -]*)?(\d{1,10})$/i);
  const id = match ? Number(match[1]) : 0;
  if (!id || id > 2147483647) throw new Error("Identifiant de bug invalide.");
  return id;
}
const contextFor = (input) => Object.fromEntries(["page", "zone", "game", "match", "room", "event", "other"].map((key) => {
  let value = clean(input?.[key], 240);
  if (/^(?:\/|https?:\/\/)/i.test(value)) {
    try { const url = new URL(value, "https://local.invalid"); value = value.startsWith("/") ? url.pathname : `${url.protocol}//${url.host}${url.pathname}`; } catch { value = ""; }
  }
  return [key, redactBugPublicText(value, 240)];
}));
const terminal = (state) => ["fixed", "closed"].includes(state);

export function createBugReportStore({ filename, uploadDirectory, version = () => "", now = () => Date.now() }) {
  if (filename !== ":memory:") fs.mkdirSync(path.dirname(filename), { recursive: true });
  if (uploadDirectory) fs.mkdirSync(uploadDirectory, { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=1000; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS bug_groups(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS bug_reports(
      id INTEGER PRIMARY KEY AUTOINCREMENT,receipt_hash TEXT NOT NULL UNIQUE,reporter_id TEXT,
      title TEXT NOT NULL,category TEXT NOT NULL,description TEXT NOT NULL,expected TEXT NOT NULL,actual TEXT NOT NULL,steps TEXT NOT NULL,
      frequency TEXT NOT NULL,impact TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'received',priority TEXT NOT NULL DEFAULT 'normal',assignee TEXT NOT NULL DEFAULT '',
      group_id INTEGER REFERENCES bug_groups(id) ON DELETE SET NULL,visible INTEGER NOT NULL DEFAULT 0,
      public_title TEXT NOT NULL DEFAULT '',public_description TEXT NOT NULL DEFAULT '',
      public_expected TEXT NOT NULL DEFAULT '',public_actual TEXT NOT NULL DEFAULT '',public_steps TEXT NOT NULL DEFAULT '',context TEXT NOT NULL DEFAULT '{}',diagnostics TEXT,
      consent_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL
    );
    INSERT INTO sqlite_sequence(name,seq) SELECT 'bug_reports',1000 WHERE NOT EXISTS(SELECT 1 FROM sqlite_sequence WHERE name='bug_reports');
    CREATE INDEX IF NOT EXISTS bug_reports_public_at ON bug_reports(visible,created_at DESC);
    CREATE INDEX IF NOT EXISTS bug_reports_reporter_at ON bug_reports(reporter_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS bug_reports_status_at ON bug_reports(status,updated_at DESC);
    CREATE INDEX IF NOT EXISTS bug_reports_group ON bug_reports(group_id);
    CREATE TABLE IF NOT EXISTS bug_images(
      id TEXT PRIMARY KEY,upload_hash TEXT NOT NULL,filename TEXT NOT NULL UNIQUE,bytes INTEGER NOT NULL,
      bug_id INTEGER REFERENCES bug_reports(id) ON DELETE CASCADE,visible INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS bug_images_bug ON bug_images(bug_id);
    CREATE TABLE IF NOT EXISTS bug_comments(id INTEGER PRIMARY KEY AUTOINCREMENT,bug_id INTEGER NOT NULL REFERENCES bug_reports(id) ON DELETE CASCADE,
      author_id TEXT,kind TEXT NOT NULL,body TEXT NOT NULL,visible INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS bug_comments_bug ON bug_comments(bug_id,created_at);
    CREATE TABLE IF NOT EXISTS bug_links(source_id INTEGER NOT NULL REFERENCES bug_reports(id) ON DELETE CASCADE,
      target_id INTEGER NOT NULL REFERENCES bug_reports(id) ON DELETE CASCADE,type TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(source_id,target_id,type),CHECK(source_id!=target_id));
    CREATE INDEX IF NOT EXISTS bug_links_target ON bug_links(target_id,type);
    CREATE UNIQUE INDEX IF NOT EXISTS bug_links_duplicate ON bug_links(source_id) WHERE type='duplicate';
    CREATE TABLE IF NOT EXISTS bug_actions(id INTEGER PRIMARY KEY AUTOINCREMENT,bug_id INTEGER NOT NULL REFERENCES bug_reports(id) ON DELETE CASCADE,
      actor_id TEXT NOT NULL,kind TEXT NOT NULL,body TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS bug_actions_bug ON bug_actions(bug_id,created_at);
  `);
  const columns = new Set(db.prepare("PRAGMA table_info(bug_reports)").all().map((column) => column.name));
  for (const column of ["public_expected", "public_actual", "public_steps"]) {
    if (!columns.has(column)) db.exec(`ALTER TABLE bug_reports ADD COLUMN ${column} TEXT NOT NULL DEFAULT ''`);
  }
  const timestamp = () => new Date(now()).toISOString();
  const rowFor = (id) => db.prepare("SELECT * FROM bug_reports WHERE id=?").get(bugId(id));
  let transactionDepth = 0;
  const transaction = (action) => {
    if (transactionDepth) return action();
    db.exec("BEGIN IMMEDIATE"); transactionDepth++;
    try { const result = action(); db.exec("COMMIT"); return result; }
    catch (error) { db.exec("ROLLBACK"); throw error; }
    finally { transactionDepth--; }
  };
  const audit = (id, actor, kind, body) => db.prepare("INSERT INTO bug_actions(bug_id,actor_id,kind,body,created_at) VALUES(?,?,?,?,?)").run(id, String(actor ?? ""), kind, clean(body, 8000), timestamp());
  const owns = (row, viewer, receipt) => Boolean(row && (viewer?.id && row.reporter_id === viewer.id || equalHash(row.receipt_hash, receipt)));
  function get(id, { viewer, receipt, admin = false } = {}) {
    const row = rowFor(id);
    if (!row) return null;
    const privateView = admin || owns(row, viewer, receipt);
    const report = {
      id: row.id, code: `BUG ${row.id}`, title: privateView ? row.title : row.visible ? row.public_title : "Signalement en attente de relecture", category: row.category,
      description: privateView ? row.description : row.visible ? row.public_description : "", status: row.status, priority: row.priority,
      visible: Boolean(row.visible), awaitingReview: !row.visible,
      expected: privateView ? row.expected : row.visible ? row.public_expected : "", actual: privateView ? row.actual : row.visible ? row.public_actual : "", steps: privateView ? row.steps : row.visible ? row.public_steps : "",
      createdAt: row.created_at, updatedAt: row.updated_at, privateView,
      images: db.prepare(`SELECT id,visible FROM bug_images WHERE bug_id=? ${privateView ? "" : "AND visible=1"}`).all(row.id).map((entry) => ({ id: entry.id, visible: Boolean(entry.visible) })),
      comments: db.prepare(`SELECT id,kind,body,visible,created_at FROM bug_comments WHERE bug_id=? ${admin ? "" : privateView ? "AND kind!='internal'" : row.visible ? "AND visible=1 AND kind!='internal'" : "AND 1=0"} ORDER BY id DESC LIMIT 100`).all(row.id).reverse().map((entry) => ({ id: entry.id, kind: entry.kind, body: entry.body, visible: Boolean(entry.visible), createdAt: entry.created_at })),
      links: db.prepare(`SELECT l.source_id,l.target_id,l.type,b.id,b.public_title,b.title,b.visible,b.status FROM bug_links l JOIN bug_reports b ON b.id=CASE WHEN l.source_id=? THEN l.target_id ELSE l.source_id END WHERE (l.source_id=? OR l.target_id=?) ${privateView ? "" : "AND b.visible=1"} ORDER BY b.id LIMIT 100`).all(row.id, row.id, row.id)
        .filter((entry) => admin || entry.visible)
        .map((entry) => ({ id: entry.id, title: admin ? entry.title : entry.public_title, status: entry.status, type: entry.type, direction: entry.source_id === row.id ? "outgoing" : "incoming", sourceId: entry.source_id, targetId: entry.target_id }))
    };
    if (privateView) Object.assign(report, { frequency: row.frequency, impact: row.impact, context: JSON.parse(row.context), diagnostics: row.diagnostics ? JSON.parse(row.diagnostics) : null, consentAt: row.consent_at });
    if (admin) Object.assign(report, { reporterId: row.reporter_id, assignee: row.assignee, groupId: row.group_id, publicTitle: row.public_title, publicDescription: row.public_description, publicExpected: row.public_expected, publicActual: row.public_actual, publicSteps: row.public_steps, actions: db.prepare("SELECT kind,body,created_at,actor_id FROM bug_actions WHERE bug_id=? ORDER BY id DESC LIMIT 100").all(row.id) });
    return report;
  }
  function list(input = {}, { admin = false, viewer, mine = false } = {}) {
    const clauses = [], params = [];
    if (mine) { clauses.push("reporter_id=?"); params.push(viewer?.id ?? ""); }
    const titleColumn = admin || mine ? "title" : "CASE WHEN visible=1 THEN public_title ELSE 'Signalement en attente de relecture' END";
    for (const [field, values] of [["status", bugMetadata.statuses], ["priority", bugMetadata.priorities], ["category", bugMetadata.categories]]) {
      if (input[field] && input[field] !== "all") { valid(values, input[field], field); clauses.push(`${field}=?`); params.push(input[field]); }
    }
    if (admin && input.visibility && input.visibility !== "all") { clauses.push("visible=?"); params.push(input.visibility === "public" ? 1 : 0); }
    if (admin && input.assignee) { clauses.push("assignee=?"); params.push(clean(input.assignee, 80)); }
    if (admin && input.group) { clauses.push("group_id=?"); params.push(bugId(input.group)); }
    const query = clean(input.search, 100);
    if (query) { clauses.push(`(${titleColumn} LIKE ? ESCAPE '\\' OR CAST(id AS TEXT)=?)`); params.push(`%${query.replace(/[\\%_]/g, "\\$&")}%`, query.replace(/^BUG\s*/i, "")); }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const totalItems = db.prepare(`SELECT COUNT(*) AS count FROM bug_reports ${where}`).get(...params).count;
    const pageSize = [20, 50, 100].includes(Number(input.pageSize)) ? Number(input.pageSize) : 20;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const page = Math.max(1, Math.min(totalPages, Math.trunc(Number(input.page) || 1)));
    const rows = db.prepare(`SELECT id,${titleColumn} AS title,category,status,priority,visible,created_at,updated_at${admin ? ",assignee,group_id,(SELECT COUNT(*) FROM bug_comments c WHERE c.bug_id=bug_reports.id AND c.visible=0 AND c.kind!='internal') AS pending_comments" : ""} FROM bug_reports ${where} ORDER BY updated_at DESC,id DESC LIMIT ? OFFSET ?`).all(...params, pageSize, (page - 1) * pageSize).map((row) => ({ ...row, code: `BUG ${row.id}`, visible: Boolean(row.visible) }));
    return { rows, totalItems, totalPages, page, pageSize };
  }
  function stageImage(body) {
    if (!uploadDirectory) throw new Error("Stockage des captures indisponible.");
    prune();
    const data = sanitizeBugImage(body);
    const pendingBytes = db.prepare("SELECT COALESCE(SUM(bytes),0) AS bytes FROM bug_images WHERE bug_id IS NULL").get().bytes;
    if (pendingBytes + data.length > 100 * 1024 * 1024) throw new Error("Trop de captures en attente. Réessaie plus tard.");
    const id = randomUUID(), key = randomBytes(32).toString("hex"), filename = `${id}.png`;
    const target = path.join(uploadDirectory, filename);
    fs.writeFileSync(target, data, { flag: "wx" });
    try { db.prepare("INSERT INTO bug_images(id,upload_hash,filename,bytes,created_at) VALUES(?,?,?,?,?)").run(id, hash(key), filename, data.length, timestamp()); }
    catch (error) { fs.unlinkSync(target); throw error; }
    return { id, key };
  }
  function create(input, viewer) {
    if (!/^[a-f0-9-]{36}$/i.test(input.submissionId ?? "")) throw new Error("Identifiant d'envoi invalide.");
    const receiptHash = hash(input.submissionId);
    const existing = db.prepare("SELECT id,reporter_id FROM bug_reports WHERE receipt_hash=?").get(receiptHash);
    if (existing) {
      if ((existing.reporter_id ?? "") !== (viewer?.id ?? "")) throw new Error("Cet envoi appartient à une autre session.");
      return { report: get(existing.id, { viewer, receipt: input.submissionId }), receipt: input.submissionId, created: false };
    }
    const title = clean(input.title, 160), description = clean(input.description, 6000);
    if (title.length < 4 || description.length < 20) throw new Error("Ajoute un titre de 4 caractères et une description de 20 caractères minimum.");
    const category = valid(bugMetadata.categories, input.category, "Catégorie"), frequency = valid(bugMetadata.frequencies, input.frequency, "Fréquence"), impact = valid(bugMetadata.impacts, input.impact, "Impact");
    const refs = input.images ?? [];
    if (!Array.isArray(refs) || refs.length > 6 || new Set(refs.map((ref) => ref?.id)).size !== refs.length) throw new Error("Ajoute au maximum 6 captures différentes.");
    const diagnostics = input.diagnosticConsent === true ? sanitizeBugDiagnostics(input.diagnostics, { userId: viewer?.id ?? "", version: version() }) : null;
    const id = transaction(() => {
      const images = refs.map((ref) => db.prepare("SELECT * FROM bug_images WHERE id=? AND bug_id IS NULL").get(clean(ref?.id, 80)));
      if (images.some((image, index) => !image || !equalHash(image.upload_hash, refs[index].key) || Date.parse(image.created_at) < now() - 3600000)) throw new Error("Une capture a expiré ou ne t'appartient pas. Ajoute-la à nouveau.");
      if (images.reduce((sum, image) => sum + image.bytes, 0) > 12 * 1024 * 1024) throw new Error("Les captures dépassent 12 Mo au total.");
      const at = timestamp();
      const result = db.prepare(`INSERT INTO bug_reports(receipt_hash,reporter_id,title,category,description,expected,actual,steps,frequency,impact,context,diagnostics,consent_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(receiptHash, viewer?.id ?? null, title, category, description, clean(input.expected, 3000), clean(input.actual, 3000), clean(input.steps, 5000), frequency, impact, JSON.stringify(contextFor(input.context)), diagnostics ? JSON.stringify(diagnostics) : null, input.diagnosticConsent === true ? at : null, at, at);
      const id = Number(result.lastInsertRowid);
      for (const image of images) db.prepare("UPDATE bug_images SET bug_id=?,upload_hash='' WHERE id=?").run(id, image.id);
      audit(id, viewer?.id, "received", "Signalement reçu. Publication soumise à relecture.");
      return id;
    });
    return { report: get(id, { viewer, receipt: input.submissionId }), receipt: input.submissionId, created: true };
  }
  function update(id, input, actor) {
    const row = rowFor(id);
    if (!row) throw new Error("Bug introuvable.");
    const status = valid(bugMetadata.statuses, input.status ?? row.status, "Statut"), priority = valid(bugMetadata.priorities, input.priority ?? row.priority, "Priorité");
    const category = valid(bugMetadata.categories, input.category ?? row.category, "Catégorie");
    const group = input.groupId === undefined ? row.group_id : input.groupId ? bugId(input.groupId) : null;
    if (group && !db.prepare("SELECT 1 FROM bug_groups WHERE id=?").get(group)) throw new Error("Groupe introuvable.");
    transaction(() => {
      db.prepare("UPDATE bug_reports SET status=?,priority=?,category=?,assignee=?,group_id=?,updated_at=? WHERE id=?").run(status, priority, category, clean(input.assignee ?? row.assignee, 80), group, timestamp(), row.id);
      if (clean(input.internalNote)) addComment(row.id, { body: input.internalNote, kind: "internal" }, { id: actor }, true);
      if (clean(input.response)) addComment(row.id, { body: input.response, kind: "staff", visible: input.responsePublic === true }, { id: actor }, true);
      audit(row.id, actor, "updated", `${bugMetadata.statuses[row.status]} → ${bugMetadata.statuses[status]} · ${bugMetadata.priorities[priority]} · assignation : ${clean(input.assignee ?? row.assignee, 80) || "aucune"}`);
    });
    return get(row.id, { admin: true });
  }
  function publish(id, input, actor) {
    const row = rowFor(id);
    if (!row) throw new Error("Bug introuvable.");
    const visible = input.visible === true;
    const title = redactBugPublicText(input.title, 160), description = redactBugPublicText(input.description, 6000);
    const expected = redactBugPublicText(input.expected ?? row.public_expected, 3000), actual = redactBugPublicText(input.actual ?? row.public_actual, 3000), steps = redactBugPublicText(input.steps ?? row.public_steps, 5000);
    if (visible && (input.reviewed !== true || title.length < 4 || description.length < 20)) throw new Error("Relis et valide les textes publics avant publication.");
    const images = Array.isArray(input.imageIds) ? [...new Set(input.imageIds)] : [];
    if (images.length > 6 || images.some((image) => !db.prepare("SELECT 1 FROM bug_images WHERE id=? AND bug_id=?").get(image, row.id))) throw new Error("Capture invalide.");
    transaction(() => {
      db.prepare("UPDATE bug_reports SET visible=?,public_title=?,public_description=?,public_expected=?,public_actual=?,public_steps=?,updated_at=? WHERE id=?").run(visible ? 1 : 0, title, description, expected, actual, steps, timestamp(), row.id);
      db.prepare("UPDATE bug_images SET visible=0 WHERE bug_id=?").run(row.id);
      if (visible) for (const image of images) db.prepare("UPDATE bug_images SET visible=1 WHERE id=?").run(image);
      audit(row.id, actor, "publication", visible ? "Version publique relue et publiée ; diagnostics et contexte privés." : "Publication retirée.");
    });
    return get(row.id, { admin: true });
  }
  function addComment(id, input, viewer, admin = false, receipt) {
    const row = rowFor(id);
    const owned = owns(row, viewer, receipt);
    if (!row || !admin && !row.visible && !owned) throw new Error("Bug introuvable.");
    if (!admin && !owned && (!viewer?.id || viewer.guest)) throw new Error("Connecte-toi pour commenter ce bug.");
    const kind = admin ? input.kind === "internal" ? "internal" : "staff" : owned ? "reporter" : "player";
    const body = kind === "internal" ? clean(input.body, 4000) : redactBugPublicText(input.body, 4000);
    if (body.length < 3) throw new Error("Le message est trop court.");
    const visible = admin && kind !== "internal" && input.visible === true ? 1 : 0;
    db.prepare("INSERT INTO bug_comments(bug_id,author_id,kind,body,visible,created_at) VALUES(?,?,?,?,?,?)").run(row.id, viewer?.id ?? null, kind, body, visible, timestamp());
    db.prepare("UPDATE bug_reports SET updated_at=? WHERE id=?").run(timestamp(), row.id);
  }
  function moderateComment(id, commentId, visible, actor) {
    const row = db.prepare("SELECT * FROM bug_comments WHERE id=? AND bug_id=? AND kind!='internal'").get(bugId(commentId), bugId(id));
    if (!row) throw new Error("Commentaire introuvable.");
    db.prepare("UPDATE bug_comments SET visible=? WHERE id=?").run(visible === true ? 1 : 0, row.id);
    audit(bugId(id), actor, "comment", visible ? "Commentaire publié après relecture." : "Commentaire masqué.");
  }
  function relate(id, targetId, type, actor) {
    let source = bugId(id), target = bugId(targetId);
    valid(bugMetadata.relations, type, "Relation");
    if (source === target || !rowFor(source) || !rowFor(target)) throw new Error("Choisis deux bugs différents et existants.");
    if (["similar", "related"].includes(type) && source > target) [source, target] = [target, source];
    if (["duplicate", "depends_on"].includes(type)) {
      const visited = new Set(), pending = [target];
      while (pending.length) {
        const next = pending.pop();
        if (next === source) throw new Error("Cette relation créerait une boucle de dépendances.");
        if (visited.has(next)) continue;
        visited.add(next);
        if (visited.size > 1000) throw new Error("La chaîne de dépendances est trop longue.");
        pending.push(...db.prepare("SELECT target_id FROM bug_links WHERE source_id=? AND type IN ('duplicate','depends_on')").all(next).map((row) => row.target_id));
      }
      if (type === "duplicate" && db.prepare("SELECT 1 FROM bug_links WHERE source_id=? AND type='duplicate' AND target_id!=?").get(source, target)) throw new Error("Ce bug a déjà un bug principal. Retire l'ancienne relation avant de le changer.");
    }
    db.prepare("INSERT OR IGNORE INTO bug_links VALUES(?,?,?,?)").run(source, target, type, timestamp());
    audit(bugId(id), actor, "relation", `${bugMetadata.relations[type]} BUG ${targetId}`);
  }
  function unlink(sourceId, targetId, type, actor) {
    valid(bugMetadata.relations, type, "Relation");
    db.prepare("DELETE FROM bug_links WHERE source_id=? AND target_id=? AND type=?").run(bugId(sourceId), bugId(targetId), type);
    audit(bugId(sourceId), actor, "relation", `Relation retirée avec BUG ${bugId(targetId)}.`);
  }
  function resolutionPlan(id) {
    const root = rowFor(id);
    if (!root) throw new Error("Bug introuvable.");
    const duplicates = new Set(), pending = [root.id];
    while (pending.length) {
      const parent = pending.pop();
      for (const row of db.prepare("SELECT source_id FROM bug_links WHERE target_id=? AND type='duplicate'").all(parent)) {
        if (duplicates.has(row.source_id)) continue;
        if (duplicates.size >= 100) throw new Error("Plus de 100 doublons : traite les groupes séparément.");
        duplicates.add(row.source_id); pending.push(row.source_id);
      }
    }
    const related = new Map();
    for (const parent of [root.id, ...duplicates]) for (const row of db.prepare("SELECT source_id,target_id,type FROM bug_links WHERE source_id=? OR target_id=?").all(parent, parent)) {
      const other = row.source_id === parent ? row.target_id : row.source_id;
      if (other === root.id) continue;
      const candidate = rowFor(other);
      if (!terminal(candidate.status)) related.set(other, { id: other, title: candidate.title, status: candidate.status, type: duplicates.has(other) ? "duplicate" : row.type, suggested: duplicates.has(other) });
    }
    return { principal: root.id, rows: [...related.values()].slice(0, 100) };
  }
  function resolve(id, { status = "fixed", linkedIds = [], response = "" } = {}, actor) {
    if (!terminal(status)) throw new Error("Choisis Corrigé ou Fermé.");
    if (!Array.isArray(linkedIds) || linkedIds.length > 100) throw new Error("Au maximum 100 bugs liés.");
    const plan = resolutionPlan(id), allowed = new Set(plan.rows.map((row) => row.id));
    const ids = [...new Set([bugId(id), ...linkedIds.map(bugId)])];
    if (ids.some((entry) => entry !== bugId(id) && !allowed.has(entry))) throw new Error("Un bug sélectionné n'appartient pas à ce plan de résolution.");
    return transaction(() => {
      for (const entry of ids) {
        db.prepare("UPDATE bug_reports SET status=?,updated_at=? WHERE id=?").run(status, timestamp(), entry);
        if (clean(response)) addComment(entry, { body: response, kind: "staff", visible: true }, { id: actor }, true);
        audit(entry, actor, "resolution", `Résolution confirmée avec BUG ${bugId(id)} · ${bugMetadata.statuses[status]}.`);
      }
      return { updated: ids.length };
    });
  }
  function groups() { return db.prepare("SELECT g.id,g.name,COUNT(b.id) AS count FROM bug_groups g LEFT JOIN bug_reports b ON b.group_id=g.id GROUP BY g.id ORDER BY g.name").all(); }
  function createGroup(name, actor) {
    const label = clean(name, 120);
    if (label.length < 3) throw new Error("Le nom du groupe est trop court.");
    db.prepare("INSERT OR IGNORE INTO bug_groups(name,created_at) VALUES(?,?)").run(label, timestamp());
    return db.prepare("SELECT id,name FROM bug_groups WHERE name=?").get(label);
  }
  function batch(ids, input, actor) {
    if (!Array.isArray(ids) || !ids.length || ids.length > 100) throw new Error("Sélectionne entre 1 et 100 bugs.");
    return transaction(() => {
      const unique = [...new Set(ids.map(bugId))];
      for (const id of unique) update(id, input, actor);
      return { updated: unique.length };
    });
  }
  function suggestions(id) {
    const row = rowFor(id);
    if (!row) return [];
    const words = new Set(row.title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/[a-z0-9]{4,}/g) ?? []);
    return db.prepare("SELECT id,title,status FROM bug_reports WHERE category=? AND id!=? ORDER BY id DESC LIMIT 200").all(row.category, row.id).map((candidate) => ({ ...candidate, score: (candidate.title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/[a-z0-9]{4,}/g) ?? []).filter((word) => words.has(word)).length })).filter((candidate) => candidate.score >= 2).sort((a, b) => b.score - a.score).slice(0, 8);
  }
  function image(id, options) {
    const row = db.prepare("SELECT * FROM bug_images WHERE id=? AND bug_id IS NOT NULL").get(clean(id, 80));
    if (!row) return null;
    const report = get(row.bug_id, options);
    if (!report || !report.privateView && (!report.visible || !row.visible)) return null;
    return { path: path.resolve(uploadDirectory, row.filename), mimeType: "image/png" };
  }
  function prune() {
    const rows = db.prepare("SELECT id,filename FROM bug_images WHERE bug_id IS NULL AND created_at<?").all(new Date(now() - 3600000).toISOString());
    for (const row of rows) { fs.rmSync(path.join(uploadDirectory, row.filename), { force: true }); db.prepare("DELETE FROM bug_images WHERE id=?").run(row.id); }
    db.prepare("UPDATE bug_reports SET diagnostics=NULL WHERE diagnostics IS NOT NULL AND consent_at<?").run(new Date(now() - 90 * 86400000).toISOString());
  }
  function summary() { return db.prepare("SELECT COUNT(*) AS total,COALESCE(SUM(status NOT IN ('fixed','closed')),0) AS pending,COALESCE(SUM(visible=0),0) AS private FROM bug_reports").get(); }
  function deleteForUser(userId) {
    const files = db.prepare("SELECT i.filename FROM bug_images i JOIN bug_reports b ON b.id=i.bug_id WHERE b.reporter_id=?").all(userId);
    transaction(() => {
      db.prepare("DELETE FROM bug_comments WHERE author_id=?").run(userId);
      db.prepare("DELETE FROM bug_images WHERE bug_id IN (SELECT id FROM bug_reports WHERE reporter_id=?)").run(userId);
      db.prepare("DELETE FROM bug_comments WHERE bug_id IN (SELECT id FROM bug_reports WHERE reporter_id=?) AND visible=0").run(userId);
      db.prepare("DELETE FROM bug_reports WHERE reporter_id=? AND visible=0").run(userId);
      db.prepare("UPDATE bug_reports SET reporter_id=NULL,receipt_hash=lower(hex(randomblob(32))),title=public_title,description=public_description,expected='',actual='',steps='',context='{}',diagnostics=NULL,consent_at=NULL WHERE reporter_id=?").run(userId);
      db.prepare("UPDATE bug_reports SET assignee='' WHERE assignee=?").run(userId);
      db.prepare("UPDATE bug_actions SET actor_id='' WHERE actor_id=?").run(userId);
    });
    for (const file of files) fs.rmSync(path.join(uploadDirectory, file.filename), { force: true });
  }
  prune();
  return { get, list, create, update, publish, stageImage, addComment, moderateComment, relate, unlink, resolutionPlan, resolve, groups, createGroup, batch, suggestions, image, prune, summary, deleteForUser, close: () => db.close() };
}
