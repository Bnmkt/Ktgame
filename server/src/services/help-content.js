import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { matchesImageSignature } from "./patchnotes.js";
import { defaultHelpEntries, upgradeDefaultGuides } from "../content/help-defaults.js";
import { guideIntroduction } from "../content/help-guide.js";

const clean = (value, length) => String(value ?? "").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "").trim().slice(0, length);
const imageTypes = new Map([["image/png", "png"], ["image/jpeg", "jpg"], ["image/webp", "webp"], ["image/gif", "gif"]]);
function normalizeChallenge(input) {
  if (!input) return null;
  if (!Array.isArray(input.options) || input.options.length < 2 || input.options.length > 4) throw new Error("La mise en situation doit proposer de 2 à 4 réponses.");
  const options = input.options.map((option, index) => ({ id: clean(option?.id, 40) || String(index + 1), text: clean(option?.text, 160) }));
  const ids = new Set(options.map((option) => option.id));
  const question = clean(input.question, 240), explanation = clean(input.explanation, 800), answerId = clean(input.answerId, 40);
  if (!question || !explanation || options.some((option) => !option.text || !/^[a-zA-Z0-9_-]+$/.test(option.id)) || ids.size !== options.length || !ids.has(answerId)) throw new Error("Complète la question, les réponses, la bonne réponse et son explication.");
  return { question, options, answerId, explanation };
}
export function normalizeHelpDocument(input) {
  if (!Array.isArray(input?.entries) || input.entries.length > 100) throw new Error("Le guide peut contenir jusqu’à 100 rubriques.");
  const ids = new Set();
  const entries = input.entries.map((entry, position) => {
    if (!["faq", "guide"].includes(entry.kind)) throw new Error("Type de rubrique invalide.");
    const id = clean(entry.id, 80) || randomUUID();
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || ids.has(id)) throw new Error("Identifiant de rubrique invalide ou dupliqué.");
    ids.add(id);
    const title = clean(entry.title, 160), body = clean(entry.body, 12000);
    if (!title || !body) throw new Error("Chaque rubrique doit avoir un titre et un texte.");
    const image = clean(entry.image, 180);
    if (image && (!/^\/(?:guides\/|api\/help\/images\/)[a-zA-Z0-9_/-]+\.(?:png|jpg|jpeg|webp|gif)$/.test(image) || image.includes(".."))) throw new Error("L’image doit provenir du site ou de l’éditeur.");
    return { id, kind: entry.kind, title, body, lead: clean(entry.lead, 280), challenge: entry.kind === "guide" ? normalizeChallenge(entry.challenge) : null, category: clean(entry.category, 60) || "Général", image, imageAlt: clean(entry.imageAlt, 200), published: entry.published !== false, position };
  });
  return { title: clean(input.title, 100) || "Bienvenue au casino", intro: clean(input.intro, 1000), welcomeEnabled: input.welcomeEnabled !== false, entries };
}

export function createHelpStore({ filename, uploadDirectory, now = () => Date.now() }) {
  if (filename !== ":memory:") fs.mkdirSync(path.dirname(filename), { recursive: true });
  if (uploadDirectory) fs.mkdirSync(uploadDirectory, { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=1000;
    CREATE TABLE IF NOT EXISTS help_settings(id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS help_entries(id TEXT PRIMARY KEY, position INTEGER NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS help_reads(user_id TEXT PRIMARY KEY, revision INTEGER NOT NULL, dismissed_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS help_images(id TEXT PRIMARY KEY, mime_type TEXT NOT NULL);
  `);
  if (!db.prepare("SELECT 1 FROM help_settings").get()) save({ title: "Bienvenue au casino", intro: guideIntroduction, welcomeEnabled: true, entries: defaultHelpEntries }, true);
  else if (!readSettings().guideFormatVersion) {
    const upgraded = upgradeDefaultGuides(read());
    save(upgraded);
  }
  function readSettings() {
    return JSON.parse(db.prepare("SELECT data FROM help_settings WHERE id=1").get().data);
  }
  function read(publicOnly = false) {
    const settings = readSettings();
    const entries = db.prepare("SELECT data FROM help_entries ORDER BY position").all().map((row) => JSON.parse(row.data));
    return { ...settings, entries: publicOnly ? entries.filter((entry) => entry.published) : entries };
  }
  function save(input, initial = false) {
    const document = normalizeHelpDocument(input);
    const previous = initial ? null : read();
    const timestamp = new Date(now()).toISOString();
    const { entries, ...settings } = document;
    const meta = { ...settings, guideFormatVersion: 1, revision: (previous?.revision ?? 0) + 1, launchedAt: previous?.launchedAt ?? timestamp, updatedAt: timestamp };
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("INSERT OR REPLACE INTO help_settings VALUES(1,?)").run(JSON.stringify(meta));
      db.exec("DELETE FROM help_entries");
      const insert = db.prepare("INSERT INTO help_entries VALUES(?,?,?)");
      for (const entry of entries) insert.run(entry.id, entry.position, JSON.stringify(entry));
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
    return read();
  }
  function needsWelcome(user) {
    const settings = readSettings();
    return Boolean(user && !user.guest && settings.welcomeEnabled && Date.parse(user.createdAt) >= Date.parse(settings.launchedAt) && !db.prepare("SELECT 1 FROM help_reads WHERE user_id=?").get(user.id) && db.prepare("SELECT 1 FROM help_entries WHERE json_extract(data,'$.kind')='guide' AND json_extract(data,'$.published')=1 LIMIT 1").get());
  }
  function dismiss(userId) {
    const document = readSettings();
    db.prepare("INSERT OR REPLACE INTO help_reads VALUES(?,?,?)").run(userId, document.revision, new Date(now()).toISOString());
    return { dismissed: true };
  }
  function upload(body, mimeType) {
    if (!uploadDirectory || !Buffer.isBuffer(body) || body.length < 10 || body.length > 3 * 1024 * 1024 || !imageTypes.has(mimeType) || !matchesImageSignature(body, mimeType)) throw new Error("Image PNG, JPEG, WebP ou GIF requise, de 3 Mo maximum.");
    const id = `${randomUUID()}.${imageTypes.get(mimeType)}`;
    fs.writeFileSync(path.join(uploadDirectory, id), body, { flag: "wx" });
    db.prepare("INSERT INTO help_images VALUES(?,?)").run(id, mimeType);
    return { image: `/api/help/images/${id}` };
  }
  function image(id) {
    const row = db.prepare("SELECT mime_type FROM help_images WHERE id=?").get(id);
    if (!row || !uploadDirectory) return null;
    return { filename: path.join(uploadDirectory, id), mimeType: row.mime_type };
  }
  return { read, save, needsWelcome, dismiss, upload, image, close: () => db.close() };
}
