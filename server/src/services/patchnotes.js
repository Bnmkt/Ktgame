import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const noteStatuses = new Set(["draft", "published", "archived"]);
const blockTypes = new Set(["section", "paragraph", "change", "list", "quote", "image"]);
const changeCategories = new Set(["feature", "game", "tool", "fix", "security", "balance", "other"]);
const imageTypes = new Map([["image/png", "png"], ["image/jpeg", "jpg"], ["image/webp", "webp"], ["image/gif", "gif"]]);
const clean = (value, max = 500) => String(value ?? "").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "").trim().slice(0, max);

export function matchesImageSignature(body, mimeType) {
  if (mimeType === "image/png") return body.length >= 8 && body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === "image/jpeg") return body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff;
  if (mimeType === "image/gif") return body.length >= 6 && ["GIF87a", "GIF89a"].includes(body.subarray(0, 6).toString("ascii"));
  if (mimeType === "image/webp") return body.length >= 12 && body.subarray(0, 4).toString("ascii") === "RIFF" && body.subarray(8, 12).toString("ascii") === "WEBP";
  return false;
}

export function suggestedVersionGroup(version) {
  const value = clean(version, 40);
  const segments = value.match(/^v?(\d+)\.(\d+)/i);
  if (segments) return `${segments[1]}.${segments[2]}`;
  return value.split(/[._+-]/)[0] || value;
}

function validVersion(value) {
  return /^[0-9A-Za-z][0-9A-Za-z._+-]{0,39}$/.test(value);
}

function compareVersions(left, right) {
  const parts = (value) => String(value).match(/\d+|[A-Za-z]+/g)?.map((entry) => /^\d+$/.test(entry) ? Number(entry) : entry.toLowerCase()) ?? [];
  const a = parts(left), b = parts(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if (a[index] == null) return 1;
    if (b[index] == null) return -1;
    if (a[index] === b[index]) continue;
    if (typeof a[index] === "number" && typeof b[index] === "number") return b[index] - a[index];
    return String(b[index]).localeCompare(String(a[index]), "fr", { numeric: true });
  }
  return 0;
}

function normalizeBlock(block, position) {
  const type = blockTypes.has(block?.type) ? block.type : "paragraph";
  const title = clean(block?.title, 120);
  const content = clean(block?.content, type === "list" ? 5000 : 4000);
  const category = type === "change" && changeCategories.has(block?.category) ? block.category : "other";
  const metadata = type === "image" ? {
    attachmentId: clean(block?.metadata?.attachmentId, 80),
    alt: clean(block?.metadata?.alt, 180),
    caption: clean(block?.metadata?.caption, 300)
  } : type === "section" ? { level: Number(block?.metadata?.level) === 3 ? 3 : 2 } : type === "quote" ? { attribution: clean(block?.metadata?.attribution, 120) } : {};
  if (type === "section" && !title) throw new Error(`La section ${position + 1} doit avoir un titre.`);
  if (type === "image" && !metadata.attachmentId) throw new Error(`L’image ${position + 1} doit être téléversée.`);
  if (!["section", "image"].includes(type) && !content && !title) throw new Error(`Le bloc ${position + 1} est vide.`);
  return { id: clean(block?.id, 80) || randomUUID(), position, type, category, title, content, metadata };
}

function noteFromRow(row, blocks = []) {
  return {
    id: row.id,
    version: row.version,
    versionGroup: row.version_group,
    title: row.title,
    summary: row.summary,
    status: row.status,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    blocks
  };
}

export function createPatchnoteStore({ filename, uploadDirectory, currentVersion = "0.1.0", now = () => Date.now() }) {
  if (filename !== ":memory:") fs.mkdirSync(path.dirname(filename), { recursive: true });
  if (uploadDirectory) fs.mkdirSync(uploadDirectory, { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=1000; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS patchnotes (
      id TEXT PRIMARY KEY,
      version TEXT NOT NULL UNIQUE,
      version_group TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft',
      published_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      author_id TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_patchnotes_group ON patchnotes(version_group, updated_at DESC);
    CREATE TABLE IF NOT EXISTS patchnote_blocks (
      id TEXT PRIMARY KEY,
      patchnote_id TEXT NOT NULL REFERENCES patchnotes(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      type TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'other',
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      metadata TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_patchnote_blocks_note ON patchnote_blocks(patchnote_id, position);
    CREATE TABLE IF NOT EXISTS patchnote_reactions (
      patchnote_id TEXT NOT NULL REFERENCES patchnotes(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      value INTEGER NOT NULL CHECK(value IN (-1, 1)),
      updated_at TEXT NOT NULL,
      PRIMARY KEY(patchnote_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS patchnote_attachments (
      id TEXT PRIMARY KEY,
      patchnote_id TEXT NOT NULL REFERENCES patchnotes(id) ON DELETE CASCADE,
      filename TEXT NOT NULL UNIQUE,
      mime_type TEXT NOT NULL,
      original_name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_patchnote_attachments_note ON patchnote_attachments(patchnote_id);
    CREATE TABLE IF NOT EXISTS patchnote_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  db.prepare("INSERT INTO patchnote_settings(key,value) VALUES('current_version',?) ON CONFLICT(key) DO NOTHING").run(currentVersion);

  const blocksFor = (id) => db.prepare("SELECT * FROM patchnote_blocks WHERE patchnote_id=? ORDER BY position").all(id).map((row) => ({ id: row.id, type: row.type, category: row.category, title: row.title, content: row.content, metadata: JSON.parse(row.metadata || "{}") }));
  const reactionCounts = () => new Map(db.prepare("SELECT patchnote_id,SUM(CASE WHEN value=1 THEN 1 ELSE 0 END) AS up,SUM(CASE WHEN value=-1 THEN 1 ELSE 0 END) AS down,SUM(value) AS score FROM patchnote_reactions GROUP BY patchnote_id").all().map((row) => [row.patchnote_id, { up: Number(row.up), down: Number(row.down), score: Number(row.score) }]));
  const configuredVersion = () => db.prepare("SELECT value FROM patchnote_settings WHERE key='current_version'").get()?.value || currentVersion;

  function setCurrentVersion(value) {
    const version = clean(value, 40);
    if (!validVersion(version)) throw new Error("Le numéro de version contient des caractères invalides.");
    db.prepare("INSERT INTO patchnote_settings(key,value) VALUES('current_version',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(version);
    return version;
  }

  function list({ includeDrafts = false, includeReactions = false } = {}) {
    const rows = db.prepare(`SELECT * FROM patchnotes ${includeDrafts ? "" : "WHERE status='published'"}`).all().map((row) => noteFromRow(row));
    rows.sort((left, right) => compareVersions(left.version, right.version));
    if (includeReactions) {
      const counts = reactionCounts();
      for (const row of rows) row.reactions = counts.get(row.id) ?? { up: 0, down: 0, score: 0 };
    }
    return rows;
  }

  function get(identifier, { includeDrafts = false, includeReactions = false } = {}) {
    const row = db.prepare(`SELECT * FROM patchnotes WHERE (id=? OR version=?) ${includeDrafts ? "" : "AND status='published'"}`).get(identifier, identifier);
    if (!row) return null;
    const note = noteFromRow(row, blocksFor(row.id));
    if (includeReactions) note.reactions = reactionCounts().get(row.id) ?? { up: 0, down: 0, score: 0 };
    return note;
  }

  function create(input, authorId) {
    const version = clean(input.version || configuredVersion(), 40);
    if (!validVersion(version)) throw new Error("Le numéro de version contient des caractères invalides.");
    const at = new Date(now()).toISOString();
    const id = randomUUID();
    const versionGroup = clean(input.versionGroup || suggestedVersionGroup(version), 40);
    const title = clean(input.title || `Version ${version}`, 120);
    try {
      db.prepare("INSERT INTO patchnotes(id,version,version_group,title,summary,status,published_at,created_at,updated_at,author_id) VALUES(?,?,?,?,?,'draft',NULL,?,?,?)").run(id, version, versionGroup, title, clean(input.summary, 500), at, at, clean(authorId, 80));
    } catch (error) {
      if (String(error.message).includes("UNIQUE")) throw new Error("Une patchnote existe déjà pour cette version.");
      throw error;
    }
    return get(id, { includeDrafts: true, includeReactions: true });
  }

  function update(id, input) {
    const existing = db.prepare("SELECT * FROM patchnotes WHERE id=?").get(id);
    if (!existing) return null;
    const version = clean(input.version ?? existing.version, 40);
    if (!validVersion(version)) throw new Error("Le numéro de version contient des caractères invalides.");
    const versionGroup = clean(input.versionGroup ?? existing.version_group, 40) || suggestedVersionGroup(version);
    const title = clean(input.title ?? existing.title, 120);
    const summary = clean(input.summary ?? existing.summary, 500);
    const status = noteStatuses.has(input.status) ? input.status : existing.status;
    const blocks = Array.isArray(input.blocks) ? input.blocks.slice(0, 100).map(normalizeBlock) : blocksFor(id).map(normalizeBlock);
    if (!title) throw new Error("Le titre de la patchnote est requis.");
    if (status === "published" && !blocks.length) throw new Error("Ajoute au moins un bloc avant de publier la patchnote.");
    const attachmentIds = new Set(db.prepare("SELECT id FROM patchnote_attachments WHERE patchnote_id=?").all(id).map((row) => row.id));
    if (blocks.some((block) => block.type === "image" && !attachmentIds.has(block.metadata.attachmentId))) throw new Error("Une image n’appartient pas à cette patchnote.");
    const at = new Date(now()).toISOString();
    const publishedAt = status === "published" ? existing.published_at || at : existing.published_at;
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("UPDATE patchnotes SET version=?,version_group=?,title=?,summary=?,status=?,published_at=?,updated_at=? WHERE id=?").run(version, versionGroup, title, summary, status, publishedAt, at, id);
      db.prepare("DELETE FROM patchnote_blocks WHERE patchnote_id=?").run(id);
      const insert = db.prepare("INSERT INTO patchnote_blocks(id,patchnote_id,position,type,category,title,content,metadata) VALUES(?,?,?,?,?,?,?,?)");
      for (const block of blocks) insert.run(block.id, id, block.position, block.type, block.category, block.title, block.content, JSON.stringify(block.metadata));
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      if (String(error.message).includes("UNIQUE")) throw new Error("Une patchnote existe déjà pour cette version.");
      throw error;
    }
    return get(id, { includeDrafts: true, includeReactions: true });
  }

  function duplicate(id, authorId, version) {
    const source = get(id, { includeDrafts: true });
    if (!source) return null;
    const copy = create({ version, versionGroup: suggestedVersionGroup(version), title: `${source.title} (copie)`, summary: source.summary }, authorId);
    const attachmentMap = new Map();
    try {
      for (const sourceAttachment of db.prepare("SELECT * FROM patchnote_attachments WHERE patchnote_id=?").all(id)) {
        const attachmentId = randomUUID();
        const extension = path.extname(sourceAttachment.filename);
        const filename = `${attachmentId}${extension}`;
        fs.copyFileSync(path.join(uploadDirectory, sourceAttachment.filename), path.join(uploadDirectory, filename), fs.constants.COPYFILE_EXCL);
        db.prepare("INSERT INTO patchnote_attachments(id,patchnote_id,filename,mime_type,original_name,created_at) VALUES(?,?,?,?,?,?)").run(attachmentId, copy.id, filename, sourceAttachment.mime_type, sourceAttachment.original_name, new Date(now()).toISOString());
        attachmentMap.set(sourceAttachment.id, attachmentId);
      }
      const blocks = source.blocks.map((block) => block.type === "image" ? { ...block, id: randomUUID(), metadata: { ...block.metadata, attachmentId: attachmentMap.get(block.metadata.attachmentId) } } : { ...block, id: randomUUID() });
      return update(copy.id, { blocks });
    } catch (error) {
      remove(copy.id);
      throw error;
    }
  }

  function remove(id) {
    const note = db.prepare("SELECT id FROM patchnotes WHERE id=?").get(id);
    if (!note) return false;
    const attachments = db.prepare("SELECT filename FROM patchnote_attachments WHERE patchnote_id=?").all(id);
    db.prepare("DELETE FROM patchnotes WHERE id=?").run(id);
    if (uploadDirectory) for (const attachment of attachments) {
      const target = path.resolve(uploadDirectory, attachment.filename);
      if (target.startsWith(`${path.resolve(uploadDirectory)}${path.sep}`)) try { fs.unlinkSync(target); } catch { /* Already absent. */ }
    }
    return true;
  }

  function addAttachment(id, { body, mimeType, originalName }) {
    if (!db.prepare("SELECT id FROM patchnotes WHERE id=?").get(id)) return null;
    const extension = imageTypes.get(mimeType);
    if (!extension || !Buffer.isBuffer(body) || !matchesImageSignature(body, mimeType)) throw new Error("Le contenu ne correspond pas à une image PNG, JPEG, WebP ou GIF valide.");
    if (body.length > 5 * 1024 * 1024) throw new Error("L’image ne peut pas dépasser 5 Mo.");
    const attachmentId = randomUUID();
    const filename = `${attachmentId}.${extension}`;
    fs.writeFileSync(path.join(uploadDirectory, filename), body, { flag: "wx" });
    db.prepare("INSERT INTO patchnote_attachments(id,patchnote_id,filename,mime_type,original_name,created_at) VALUES(?,?,?,?,?,?)").run(attachmentId, id, filename, mimeType, clean(originalName, 180), new Date(now()).toISOString());
    return { id: attachmentId, url: `/api/patchnotes/images/${attachmentId}`, mimeType, originalName: clean(originalName, 180) };
  }

  function attachment(id) {
    const row = db.prepare("SELECT * FROM patchnote_attachments WHERE id=?").get(id);
    if (!row) return null;
    return { path: path.join(uploadDirectory, row.filename), mimeType: row.mime_type, filename: row.filename };
  }

  function react(patchnoteId, userId, value) {
    if (!db.prepare("SELECT id FROM patchnotes WHERE id=? AND status='published'").get(patchnoteId)) return null;
    const normalized = Math.sign(Number(value) || 0);
    if (![-1, 0, 1].includes(normalized)) throw new Error("Réaction invalide.");
    if (!normalized) db.prepare("DELETE FROM patchnote_reactions WHERE patchnote_id=? AND user_id=?").run(patchnoteId, userId);
    else db.prepare("INSERT INTO patchnote_reactions(patchnote_id,user_id,value,updated_at) VALUES(?,?,?,?) ON CONFLICT(patchnote_id,user_id) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").run(patchnoteId, userId, normalized, new Date(now()).toISOString());
    return { value: normalized };
  }

  function reaction(patchnoteId, userId) {
    return { value: Number(db.prepare("SELECT value FROM patchnote_reactions WHERE patchnote_id=? AND user_id=?").get(patchnoteId, userId)?.value || 0) };
  }

  return { get currentVersion() { return configuredVersion(); }, setCurrentVersion, list, get, create, update, duplicate, remove, addAttachment, attachment, react, reaction, close: () => db.close() };
}
