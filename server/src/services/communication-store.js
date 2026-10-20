import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const failure = (message, status = 400) => Object.assign(new Error(message), { status });

export function createCommunicationStore(filename, now = Date.now) {
  if (filename !== ":memory:") fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=1000;
    CREATE TABLE IF NOT EXISTS communication_documents (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, data TEXT NOT NULL,
      revision INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS communication_kind_date ON communication_documents(kind, updated_at DESC);`);
  db.exec("CREATE TABLE IF NOT EXISTS communication_platform_cache(id TEXT PRIMARY KEY, data TEXT NOT NULL)");
  const decode = row => row && ({ ...JSON.parse(row.data), id: row.id, revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at });
  const get = (kind, id) => decode(db.prepare("SELECT * FROM communication_documents WHERE kind=? AND id=?").get(kind, id));
  return {
    get,
    platformCache: id => { const row = db.prepare("SELECT data FROM communication_platform_cache WHERE id=?").get(id); return row ? JSON.parse(row.data) : null; },
    savePlatformCache: (id, value) => db.prepare("INSERT INTO communication_platform_cache VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").run(id, JSON.stringify(value)),
    deletePlatformCache: id => db.prepare("DELETE FROM communication_platform_cache WHERE id=?").run(id),
    reorderPlatforms(items) {
      if (!Array.isArray(items)) throw failure("Ordre invalide.");
      db.exec("BEGIN IMMEDIATE");
      try {
        const current = db.prepare("SELECT id,revision,data FROM communication_documents WHERE kind='platform'").all();
        if (items.length !== current.length || new Set(items.map(item => item.id)).size !== current.length || current.some(row => !items.some(item => item.id === row.id && item.revision === row.revision))) throw failure("La liste a changé. Recharge les plateformes.", 409);
        for (const [position, item] of items.entries()) { const row = current.find(row => row.id === item.id); db.prepare("UPDATE communication_documents SET data=?,revision=revision+1 WHERE id=?").run(JSON.stringify({ ...JSON.parse(row.data), position }), row.id); }
        db.exec("COMMIT");
      } catch (error) { db.exec("ROLLBACK"); throw error; }
    },
    list(kind) {
      return db.prepare("SELECT * FROM communication_documents WHERE kind=? ORDER BY updated_at DESC,id").all(kind).map(decode).map(row => kind === "kit" ? { id: row.id, name: row.name, locale: row.locale, updatedAt: row.updatedAt, assetCount: row.assets.length } : row);
    },
    save(kind, id, input, revision) {
      const date = new Date(now()).toISOString();
      if (!id) {
        // Limit creation and write atomically, including when another process uses this database.
        db.exec("BEGIN IMMEDIATE");
        try {
          if (db.prepare("SELECT count(*) AS n FROM communication_documents WHERE kind=?").get(kind).n >= (kind === "platform" ? 50 : kind === "kit" ? 100 : 500)) throw failure("La limite de documents est atteinte.");
          id = randomUUID();
          db.prepare("INSERT INTO communication_documents VALUES(?,?,?,?,?,?)").run(id, kind, JSON.stringify(input), 1, date, date);
          db.exec("COMMIT");
        } catch (error) { db.exec("ROLLBACK"); throw error; }
      } else {
        if (!Number.isInteger(revision)) throw failure("Recharge le document avant d’enregistrer.", 409);
        const changed = db.prepare("UPDATE communication_documents SET data=?,revision=revision+1,updated_at=? WHERE id=? AND kind=? AND revision=?").run(JSON.stringify(input), date, id, kind, revision);
        if (!changed.changes) throw failure(get(kind, id) ? "Ce document a changé. Recharge-le avant d’enregistrer." : "Document introuvable.", get(kind, id) ? 409 : 404);
      }
      return get(kind, id);
    },
    remove(kind, id, revision) {
      if (!Number.isInteger(revision)) throw failure("Recharge le document avant de le supprimer.", 409);
      if (!db.prepare("DELETE FROM communication_documents WHERE kind=? AND id=? AND revision=?").run(kind, id, revision).changes) throw failure("Le document a changé ou n’existe plus. Recharge la liste.", 409);
    },
    close: () => db.close()
  };
}
