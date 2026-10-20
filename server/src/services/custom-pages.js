import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import sanitizeHtml from "sanitize-html";
import { Script } from "node:vm";
import { normalizePageTemplate, resolveTemplatePage } from "./page-template-config.js";

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

export function normalizeCustomPage(input, { allowEmpty = false } = {}) {
  const title = clean(input?.title, 120), slug = clean(input?.slug, 80);
  if (!title) throw new Error("Indique un titre pour cette page.");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("L’URL doit contenir des lettres minuscules, des chiffres et des tirets.");
  if (!["markdown", "html"].includes(input.format)) throw new Error("Choisis le format HTML ou Markdown.");
  if (typeof input.content !== "string" || input.content.length > 150000 || !allowEmpty && !input.content.trim()) throw new Error("Ajoute un contenu de 150 000 caractères maximum.");
  const content = input.content.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
  const html = input.format === "html" ? renderCustomHtml(content) : "";
  if (!allowEmpty && input.format === "html" && !html.trim()) throw new Error("Ajoute du contenu HTML visible.");
  const { style, script } = pageCode(input);
  const templateId = input.templateId ?? "", variableValues = input.variableValues ?? {};
  if (typeof templateId !== "string" || templateId && !/^[a-zA-Z0-9-]{1,80}$/.test(templateId)) throw new Error("Modèle invalide.");
  if (!variableValues || typeof variableValues !== "object" || Array.isArray(variableValues) || Object.keys(variableValues).length > 128 || JSON.stringify(variableValues).length > 64000 || Object.values(variableValues).some(value => value !== null && !["string", "boolean", "number"].includes(typeof value))) throw new Error("Valeurs de variables invalides.");
  return { title, slug, description: clean(input.description, 280), format: input.format, content, html, style, script, templateId, variableValues, showFooter: input.showFooter === true, footerLabel: clean(input.footerLabel, 60), indexable: input.indexable !== false, position: Math.max(0, Math.min(999, Math.trunc(Number(input.position) || 0))) };
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

function wrapPageScript(script, variables = {}) {
  return `(function(root, variables) { if (!root || !root.isConnected) return; const onCleanup = callback => root.addEventListener('ktga-page-dispose', callback, {once:true}); try {\n${script}\n} catch(error) { console.error('Custom page:', error); } })(document.currentScript.parentElement, ${JSON.stringify(variables).replace(/</g, "\\u003c")});`;
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
    );
    CREATE TABLE IF NOT EXISTS custom_page_templates (
      id TEXT PRIMARY KEY, draft_json TEXT NOT NULL, published_json TEXT, revision INTEGER NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, published_at TEXT, updated_by TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS custom_pages_draft_template ON custom_pages(json_extract(draft_json,'$.templateId'));
    CREATE INDEX IF NOT EXISTS custom_pages_published_template ON custom_pages(json_extract(published_json,'$.templateId'));`);
  let revision = 0;
  let publicCache;
  const row = id => typeof id === "string" ? db.prepare("SELECT * FROM custom_pages WHERE id=?").get(id) : null;
  const templateRow = id => typeof id === "string" ? db.prepare("SELECT * FROM custom_page_templates WHERE id=?").get(id) : null;
  const liveTemplate = id => { const record = templateRow(id); return record?.published_json ? { ...JSON.parse(record.published_json), publishedAt: record.published_at } : null; };
  const templateUsage = id => db.prepare("SELECT count(*) AS total FROM custom_pages WHERE json_extract(draft_json,'$.templateId')=? OR json_extract(published_json,'$.templateId')=?").get(id, id).total;
  function render(input, { strict = false, template } = {}) {
    let result = input;
    if (template || input.templateId) {
      const model = template ?? liveTemplate(input.templateId);
      if (!model) throw fail("Ce modèle n’est pas publié ou n’existe plus.");
      result = resolveTemplatePage(input, model, { strict });
    }
    return { ...result, html: result.format === "html" ? renderCustomHtml(result.content) : "" };
  }
  const summary = record => {
    const draft = JSON.parse(record.draft_json);
    return { id: record.id, title: draft.title, slug: draft.slug, format: draft.format, status: record.published_json ? "published" : "draft", hasChanges: Boolean(record.published_json && record.draft_json !== record.published_json), revision: record.revision, updatedAt: record.updated_at, publishedAt: record.published_at, liveSlug: record.published_slug };
  };
  const publicDocument = record => {
    if (!record?.published_json) return null;
    const { content, variableValues, ...document } = render(JSON.parse(record.published_json));
    return { ...document, ...(document.format === "markdown" ? { content } : {}), scriptUrl: document.script?.trim() ? `/api/pages/${document.slug}/script.js?v=${encodeURIComponent(`${record.published_at}-${document.templateVersion ?? 0}`)}` : "", updatedAt: document.templateUpdatedAt > record.published_at ? document.templateUpdatedAt : record.published_at };
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
      max(published_at,coalesce((SELECT published_at FROM custom_page_templates WHERE id=json_extract(custom_pages.published_json,'$.templateId')),published_at)) AS updatedAt FROM custom_pages WHERE published_json IS NOT NULL ORDER BY position, title`).all().map(record => ({ ...record, showFooter: Boolean(record.showFooter), indexable: Boolean(record.indexable) }));
    publicCache = { revision, rows }; return rows;
  }
  function get(id) {
    const record = row(id);
    return record ? { ...JSON.parse(record.draft_json), ...summary(record) } : null;
  }
  function published(slug) { return publicDocument(db.prepare("SELECT * FROM custom_pages WHERE published_slug=?").get(slug)); }
  function save(input, { id = randomUUID(), actorId = "", publish = false } = {}) {
    const document = normalizeCustomPage(input);
    render(document, { strict: publish });
    const data = JSON.stringify(document);
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
  function template(id) {
    const record = templateRow(id);
    return record ? { ...JSON.parse(record.draft_json), id, revision: record.revision, status: record.published_json ? "published" : "draft", hasChanges: Boolean(record.published_json && record.draft_json !== record.published_json), usedPages: templateUsage(id) } : null;
  }
  function listTemplates(publishedOnly = false) {
    return db.prepare(`SELECT * FROM custom_page_templates ${publishedOnly ? "WHERE published_json IS NOT NULL" : ""} ORDER BY updated_at DESC`).all().map(record => {
      const model = JSON.parse(publishedOnly ? record.published_json : record.draft_json);
      const { layout, style, script, ...summary } = model;
      return { ...summary, id: record.id, revision: record.revision, status: record.published_json ? "published" : "draft", usedPages: templateUsage(record.id) };
    });
  }
  function saveTemplate(input, { id = randomUUID(), actorId = "", publish = false } = {}) {
    const model = normalizePageTemplate(input);
    pageCode(model);
    db.exec("BEGIN IMMEDIATE");
    try {
      const previous = templateRow(id);
      if (previous && input.revision !== previous.revision) throw fail("Ce modèle a été modifié ailleurs. Recharge-le avant d’enregistrer.", 409);
      const version = (previous?.revision ?? 0) + 1;
      if (publish) {
        const dependents = db.prepare("SELECT published_json FROM custom_pages WHERE json_extract(published_json,'$.templateId')=?").all(id);
        for (const record of dependents) {
          const page = JSON.parse(record.published_json);
          try { render(page, { strict: true, template: model }); }
          catch (error) { throw fail(`Publication impossible pour la page « ${page.title} » : ${error.message}`); }
        }
      }
      const timestamp = new Date(now()).toISOString(), data = JSON.stringify({ ...model, version });
      db.prepare(`INSERT INTO custom_page_templates VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET draft_json=excluded.draft_json,
        published_json=excluded.published_json, revision=excluded.revision, updated_at=excluded.updated_at, published_at=excluded.published_at, updated_by=excluded.updated_by`).run(
        id, data, publish ? data : previous?.published_json ?? null, version, previous?.created_at ?? timestamp, timestamp, publish ? timestamp : previous?.published_at ?? null, String(actorId)
      );
      db.exec("COMMIT"); revision++; return template(id);
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  }
  function removeTemplate(id, expected) {
    const previous = templateRow(id);
    if (!previous) throw fail("Modèle introuvable.", 404);
    if (previous.revision !== expected) throw fail("Le modèle a changé. Recharge-le avant de continuer.", 409);
    if (templateUsage(id)) throw fail("Ce modèle est utilisé par des pages. Détache-les avant de le supprimer.", 409);
    db.prepare("DELETE FROM custom_page_templates WHERE id=? AND revision=?").run(id, expected);
    revision++;
  }
  function preview(input, template) {
    const document = normalizeCustomPage({ ...input, title: input.title?.trim() || "Aperçu", slug: /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug ?? "") ? input.slug : "apercu", content: input.content ?? "" }, { allowEmpty: true });
    return render(document, { template });
  }
  return { list, get, published, save, unpublish, remove, render, preview, template, listTemplates, saveTemplate, removeTemplate, revision: () => revision, close: () => db.close() };
}

export function registerCustomPageRoutes({ app, store, auth, requireBackOffice }) {
  const action = handler => (req, res) => { try { handler(req, res); } catch (error) { res.status(error.status ?? 400).json({ error: error.message }); } };
  const previews = new Map();
  const previewScript = (script, variables = {}) => {
    if (!script?.trim()) return "";
    for (const [key, entry] of previews) if (entry.expires <= Date.now()) previews.delete(key);
    if (previews.size >= 64) previews.delete(previews.keys().next().value);
    const key = randomUUID();
    previews.set(key, { script, variables, expires: Date.now() + 300000 });
    return `/api/page-code-preview/${key}.js`;
  };
  const authorizeCode = req => {
    const previous = req.params.id ? store.get(req.params.id) : null;
    if ((req.body.style?.trim() || req.body.script?.trim() || previous?.style?.trim() || previous?.script?.trim()) && !req.backOfficeUser?.admin) throw fail("Les blocs CSS et JavaScript sont réservés aux administrateurs.", 403);
  };
  const administrator = (req, res, next) => req.backOfficeUser?.admin ? next() : res.status(403).json({ error: "Accès administrateur requis." });
  app.get("/api/admin/page-templates", auth, requireBackOffice, (req, res) => res.set("Cache-Control", "no-store").json(store.listTemplates(req.query.published === "1" || !req.backOfficeUser?.admin)));
  app.get("/api/admin/page-templates/:id", auth, requireBackOffice, administrator, (req, res) => {
    const model = store.template(req.params.id);
    if (!model) return res.status(404).json({ error: "Modèle introuvable." });
    res.set("Cache-Control", "no-store").json(model);
  });
  app.post("/api/admin/page-templates/preview", auth, requireBackOffice, administrator, action((req, res) => {
    const model = normalizePageTemplate(req.body);
    pageCode(model);
    const page = store.preview({ title: req.body.previewTitle || model.name, slug: "apercu-modele", format: model.format, content: req.body.previewContent ?? (model.format === "html" ? "<p>Contenu de la page.</p>" : "Contenu de la page."), variableValues: req.body.previewValues ?? {} }, model);
    res.set("Cache-Control", "no-store").json({ ...page, scriptUrl: previewScript(page.script, page.variables) });
  }));
  app.post("/api/admin/page-templates", auth, requireBackOffice, administrator, action((req, res) => res.status(201).json(store.saveTemplate(req.body, { actorId: req.auth.id, publish: req.body.publish === true }))));
  app.put("/api/admin/page-templates/:id", auth, requireBackOffice, administrator, action((req, res) => {
    if (!store.template(req.params.id)) throw fail("Modèle introuvable.", 404);
    res.json(store.saveTemplate(req.body, { id: req.params.id, actorId: req.auth.id, publish: req.body.publish === true }));
  }));
  app.delete("/api/admin/page-templates/:id", auth, requireBackOffice, administrator, action((req, res) => { store.removeTemplate(req.params.id, req.body.revision); res.json({ deleted: true }); }));
  app.get("/api/page-code-preview/:key.js", (req, res) => {
    const entry = previews.get(req.params.key);
    if (!entry || entry.expires <= Date.now()) return res.sendStatus(404);
    res.set("Cache-Control", "no-store").type("application/javascript").send(wrapPageScript(entry.script, entry.variables));
  });
  app.get("/api/pages/:slug/script.js", (req, res) => {
    const document = store.published(req.params.slug);
    if (!document?.script?.trim()) return res.sendStatus(404);
    res.set("Cache-Control", "no-cache").type("application/javascript").send(wrapPageScript(document.script, document.variables));
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
    const result = req.query.render === "1" ? store.render(document) : document;
    res.set("Cache-Control", "no-store").json({ ...result, scriptUrl: previewScript(result.script, result.variables) });
  });
  app.post("/api/admin/pages/preview", auth, requireBackOffice, action((req, res) => {
    authorizeCode(req);
    const page = store.preview({ ...req.body, format: req.body.format ?? "html" });
    res.set("Cache-Control", "no-store").json({ ...page, scriptUrl: previewScript(page.script, page.variables) });
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
