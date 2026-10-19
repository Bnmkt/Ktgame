import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import sanitizeHtml from "sanitize-html";
import { Script } from "node:vm";

const clean = (value, max) => String(value ?? "").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "").trim().slice(0, max);
const color = /^(?:#[\da-f]{3,8}|[a-z]+|(?:rgb|hsl)a?\([\d.,%\s]+\)|var\(--site-[a-z-]+\))$/i;
const length = /^(?:0|auto|(?:\d{1,4}(?:\.\d{1,2})?)(?:px|rem|em|%|vh|vw))$/;
const lengths = /^(?:0|auto|\d{1,4}(?:\.\d{1,2})?(?:px|rem|em|%))(?:\s+(?:0|auto|\d{1,4}(?:\.\d{1,2})?(?:px|rem|em|%))){0,3}$/;
const htmlOptions = {
  allowedTags: [...sanitizeHtml.defaults.allowedTags, "img", "figure", "figcaption", "details", "summary"],
  allowedAttributes: { "*": ["class", "title", "style", "lang", "dir"], a: ["href", "target", "rel"], img: ["src", "alt", "width", "height", "loading"], th: ["scope", "colspan", "rowspan"], td: ["colspan", "rowspan"], ol: ["start"], li: ["value"] },
  allowedClasses: { "*": [/^cp-[a-z0-9_-]+$/, /^custom-media-(?:left|right)$/] },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: { img: ["http", "https"] },
  allowProtocolRelative: false,
  nonTextTags: ["style", "script", "textarea", "option", "iframe", "object", "embed", "template", "svg", "math", "form"],
  allowedStyles: { "*": {
    color: [color], "background-color": [color], "border-color": [color],
    "text-align": [/^(left|right|center|justify)$/], "font-weight": [/^(normal|bold|[1-9]00)$/], "font-style": [/^(normal|italic)$/],
    "text-decoration": [/^(none|underline|line-through)$/], "font-size": [length], "line-height": [/^(normal|[0-3](?:\.\d{1,2})?|\d{1,3}%)$/],
    display: [/^(block|inline|inline-block|flex|grid)$/], "flex-wrap": [/^(wrap|nowrap)$/],
    "align-items": [/^(start|end|center|stretch|flex-start|flex-end)$/], "justify-content": [/^(start|end|center|space-between|space-around|flex-start|flex-end)$/],
    "grid-template-columns": [/^(?:minmax\(0,\s*1fr\)|[1-9]fr|\d{1,4}px)(?:\s+(?:minmax\(0,\s*1fr\)|[1-9]fr|\d{1,4}px)){0,3}$/],
    gap: [lengths], padding: [lengths], margin: [lengths], width: [length], height: [length], "max-width": [length], "max-height": [length],
    "border-width": [length], "border-style": [/^(solid|dashed|dotted|none)$/], "border-radius": [lengths], float: [/^(left|right|none)$/], clear: [/^(both|left|right|none)$/], "object-fit": [/^(contain|cover)$/]
  } },
  transformTags: {
    a: (_tag, attributes) => ({ tagName: "a", attribs: { ...attributes, target: "_blank", rel: "noopener noreferrer" } }),
    img: (_tag, attributes) => ({ tagName: "img", attribs: { ...attributes, loading: "lazy" } })
  }
};

export function renderCustomHtml(content) {
  if (typeof content !== "string" || content.length > 150000) throw new Error("Le contenu peut contenir jusqu’à 150 000 caractères.");
  return sanitizeHtml(content, htmlOptions);
}

export function normalizeCustomPage(input) {
  const title = clean(input?.title, 120), slug = clean(input?.slug, 80);
  if (!title) throw new Error("Indique un titre pour cette page.");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("L’URL doit contenir des lettres minuscules, des chiffres et des tirets.");
  if (!["markdown", "html"].includes(input.format)) throw new Error("Choisis le format HTML ou Markdown.");
  if (typeof input.content !== "string" || input.content.length > 150000 || !input.content.trim()) throw new Error("Ajoute un contenu de 150 000 caractères maximum.");
  const content = input.content.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
  const html = input.format === "html" ? renderCustomHtml(content) : "";
  if (input.format === "html" && !html.trim()) throw new Error("Ajoute du contenu HTML visible.");
  const { style, script } = pageCode(input);
  return { title, slug, description: clean(input.description, 280), format: input.format, content, html, style, script, showFooter: input.showFooter === true, footerLabel: clean(input.footerLabel, 60), indexable: input.indexable !== false, position: Math.max(0, Math.min(999, Math.trunc(Number(input.position) || 0))) };
}

function pageCode(input) {
  const result = {};
  for (const key of ["style", "script"]) {
    const value = input[key] ?? "";
    if (typeof value !== "string" || value.length > 50000) throw new Error("Chaque bloc CSS ou JavaScript est limité à 50 000 caractères.");
    result[key] = value;
  }
  if (/<\/style/i.test(result.style)) throw new Error("Saisis uniquement le CSS, sans balise style.");
  if (result.script.trim()) new Script(wrapPageScript(result.script));
  return result;
}

function wrapPageScript(script) {
  return `(function(root) { if (!root || !root.isConnected) return; const onCleanup = callback => root.addEventListener('ktga-page-dispose', callback, {once:true}); try {\n${script}\n} catch(error) { console.error('Custom page:', error); } })(document.currentScript.parentElement);`;
}

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
export function createCustomPageStore({ filename, now = Date.now }) {
  if (filename !== ":memory:") fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=1000;
    CREATE TABLE IF NOT EXISTS custom_pages (
      id TEXT PRIMARY KEY, draft_slug TEXT NOT NULL UNIQUE, published_slug TEXT UNIQUE,
      draft_json TEXT NOT NULL, published_json TEXT, revision INTEGER NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, published_at TEXT, updated_by TEXT NOT NULL
    );`);
  let revision = 0;
  let publicCache;
  const row = id => db.prepare("SELECT * FROM custom_pages WHERE id=?").get(id);
  const summary = record => {
    const draft = JSON.parse(record.draft_json);
    return { id: record.id, title: draft.title, slug: draft.slug, format: draft.format, status: record.published_json ? "published" : "draft", hasChanges: Boolean(record.published_json && record.draft_json !== record.published_json), revision: record.revision, updatedAt: record.updated_at, publishedAt: record.published_at, liveSlug: record.published_slug };
  };
  const publicDocument = record => {
    if (!record?.published_json) return null;
    const { content, ...document } = JSON.parse(record.published_json);
    return { ...document, ...(document.format === "markdown" ? { content } : {}), scriptUrl: document.script?.trim() ? `/api/pages/${document.slug}/script.js?v=${encodeURIComponent(record.published_at)}` : "", updatedAt: record.published_at };
  };
  function list(publicOnly = false) {
    if (!publicOnly) return db.prepare(`SELECT id, draft_slug AS slug, json_extract(draft_json,'$.title') AS title,
      json_extract(draft_json,'$.format') AS format, CASE WHEN published_json IS NULL THEN 'draft' ELSE 'published' END AS status,
      published_json IS NOT NULL AND draft_json<>published_json AS hasChanges, revision, updated_at AS updatedAt,
      published_at AS publishedAt, published_slug AS liveSlug FROM custom_pages ORDER BY updated_at DESC`).all().map(record => ({ ...record, hasChanges: Boolean(record.hasChanges) }));
    if (publicCache?.revision === revision) return publicCache.rows;
    const rows = db.prepare(`SELECT published_slug AS slug, json_extract(published_json,'$.title') AS title,
      json_extract(published_json,'$.description') AS description, json_extract(published_json,'$.format') AS format,
      json_extract(published_json,'$.showFooter') AS showFooter, json_extract(published_json,'$.footerLabel') AS footerLabel,
      json_extract(published_json,'$.indexable') AS indexable, json_extract(published_json,'$.position') AS position,
      published_at AS updatedAt FROM custom_pages WHERE published_json IS NOT NULL ORDER BY position, title`).all().map(record => ({ ...record, showFooter: Boolean(record.showFooter), indexable: Boolean(record.indexable) }));
    publicCache = { revision, rows }; return rows;
  }
  function get(id) {
    const record = row(id);
    return record ? { ...JSON.parse(record.draft_json), ...summary(record) } : null;
  }
  function published(slug) { return publicDocument(db.prepare("SELECT * FROM custom_pages WHERE published_slug=?").get(slug)); }
  function save(input, { id = randomUUID(), actorId = "", publish = false } = {}) {
    const document = normalizeCustomPage(input), data = JSON.stringify(document);
    db.exec("BEGIN IMMEDIATE");
    try {
      const previous = row(id);
      if (previous && input.revision !== previous.revision) throw fail("Cette page a été modifiée ailleurs. Recharge-la avant d’enregistrer.", 409);
      if (db.prepare("SELECT 1 FROM custom_pages WHERE id<>? AND (draft_slug=? OR published_slug=?)").get(id, document.slug, document.slug)) throw fail("Cette URL est déjà utilisée par une autre page.", 409);
      const timestamp = new Date(now()).toISOString();
      db.prepare(`INSERT INTO custom_pages VALUES(?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET draft_slug=excluded.draft_slug, published_slug=excluded.published_slug,
        draft_json=excluded.draft_json, published_json=excluded.published_json, revision=excluded.revision,
        updated_at=excluded.updated_at, published_at=excluded.published_at, updated_by=excluded.updated_by`).run(
        id, document.slug, publish ? document.slug : previous?.published_slug ?? null, data,
        publish ? data : previous?.published_json ?? null, (previous?.revision ?? 0) + 1,
        previous?.created_at ?? timestamp, timestamp, publish ? timestamp : previous?.published_at ?? null, String(actorId)
      );
      db.exec("COMMIT"); revision++; return get(id);
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  }
  function check(id, expected) {
    const record = row(id);
    if (!record) throw fail("Page introuvable.", 404);
    if (record.revision !== expected) throw fail("La page a changé. Recharge-la avant de continuer.", 409);
    return record;
  }
  function unpublish(id, expected) {
    check(id, expected);
    if (!db.prepare("UPDATE custom_pages SET published_slug=NULL, published_json=NULL, revision=revision+1, updated_at=? WHERE id=? AND revision=?").run(new Date(now()).toISOString(), id, expected).changes) throw fail("La page a changé. Recharge-la avant de continuer.", 409);
    revision++; return get(id);
  }
  function remove(id, expected) { check(id, expected); if (!db.prepare("DELETE FROM custom_pages WHERE id=? AND revision=?").run(id, expected).changes) throw fail("La page a changé. Recharge-la avant de continuer.", 409); revision++; }
  return { list, get, published, save, unpublish, remove, revision: () => revision, close: () => db.close() };
}

export function registerCustomPageRoutes({ app, store, auth, requireBackOffice }) {
  const action = handler => (req, res) => { try { handler(req, res); } catch (error) { res.status(error.status ?? 400).json({ error: error.message }); } };
  const previews = new Map();
  const previewScript = script => {
    if (!script?.trim()) return "";
    for (const [key, entry] of previews) if (entry.expires <= Date.now()) previews.delete(key);
    if (previews.size >= 64) previews.delete(previews.keys().next().value);
    const key = randomUUID();
    previews.set(key, { script, expires: Date.now() + 300000 });
    return `/api/page-code-preview/${key}.js`;
  };
  const authorizeCode = req => {
    const previous = req.params.id ? store.get(req.params.id) : null;
    if ((req.body.style?.trim() || req.body.script?.trim() || previous?.style?.trim() || previous?.script?.trim()) && !req.backOfficeUser?.admin) throw fail("Les blocs CSS et JavaScript sont réservés aux administrateurs.", 403);
  };
  app.get("/api/page-code-preview/:key.js", (req, res) => {
    const entry = previews.get(req.params.key);
    if (!entry || entry.expires <= Date.now()) return res.sendStatus(404);
    res.set("Cache-Control", "no-store").type("application/javascript").send(wrapPageScript(entry.script));
  });
  app.get("/api/pages/:slug/script.js", (req, res) => {
    const document = store.published(req.params.slug);
    if (!document?.script?.trim()) return res.sendStatus(404);
    res.set("Cache-Control", "no-cache").type("application/javascript").send(wrapPageScript(document.script));
  });
  app.get("/api/pages", (_req, res) => res.set("Cache-Control", "no-cache").json(store.list(true)));
  app.get("/api/pages/:slug", (req, res) => {
    const document = store.published(req.params.slug);
    if (!document) return res.status(404).json({ error: "Page introuvable." });
    res.set("Cache-Control", "no-cache").json(document);
  });
  app.get("/api/admin/pages", auth, requireBackOffice, (_req, res) => res.set("Cache-Control", "no-store").json(store.list()));
  app.get("/api/admin/pages/:id", auth, requireBackOffice, (req, res) => {
    const document = store.get(req.params.id);
    if (!document) return res.status(404).json({ error: "Page introuvable." });
    res.set("Cache-Control", "no-store").json({ ...document, scriptUrl: previewScript(document.script) });
  });
  app.post("/api/admin/pages/preview", auth, requireBackOffice, action((req, res) => {
    authorizeCode(req);
    const code = pageCode(req.body);
    res.set("Cache-Control", "no-store").json({ html: req.body.format === "markdown" ? "" : renderCustomHtml(req.body.content), scriptUrl: previewScript(code.script) });
  }));
  app.post("/api/admin/pages", auth, requireBackOffice, action((req, res) => { authorizeCode(req); res.status(201).json(store.save(req.body, { actorId: req.auth.id, publish: req.body.publish === true })); }));
  app.put("/api/admin/pages/:id", auth, requireBackOffice, action((req, res) => {
    if (!store.get(req.params.id)) throw fail("Page introuvable.", 404);
    authorizeCode(req);
    res.json(store.save(req.body, { id: req.params.id, actorId: req.auth.id, publish: req.body.publish === true }));
  }));
  app.post("/api/admin/pages/:id/unpublish", auth, requireBackOffice, action((req, res) => res.json(store.unpublish(req.params.id, req.body.revision))));
  app.delete("/api/admin/pages/:id", auth, requireBackOffice, action((req, res) => { store.remove(req.params.id, req.body.revision); res.json({ deleted: true }); }));
}
