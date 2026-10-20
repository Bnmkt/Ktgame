import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createCustomPageStore, registerCustomPageRoutes } from "../src/services/custom-pages.js";
import { normalizePageTemplate } from "../src/services/page-template-config.js";

const model = { name: "Article", format: "html", layout: '<section class="cp-article"><h2>{{headline}}</h2>{{content}}</section>', variables: [{ key: "headline", label: "Titre principal", type: "text", required: true, defaultValue: "Bienvenue" }], style: ".cp-article{color:red}", script: "root.dataset.headline = variables.headline;" };
const page = { title: "Le club", slug: "le-club", format: "html", content: "<p>Une partie ?</p>" };
function fixture(t) { let now = Date.parse("2026-10-20T10:00:00Z"); const store = createCustomPageStore({ filename: ":memory:", now: () => now++ }); t.after(() => store.close()); return store; }

test("published templates update linked pages but template and page drafts remain private", t => {
  const store = fixture(t);
  let template = store.saveTemplate(model, { publish: true });
  let saved = store.save({ ...page, templateId: template.id }, { publish: true });
  const original = store.published(page.slug);
  assert.match(original.html, /Bienvenue/);
  assert.match(original.script, /variables.headline/);
  assert.equal(original.variables.headline, "Bienvenue");
  saved = store.save({ ...saved, content: "<p>PRIVATE PAGE DRAFT</p>" }, { id: saved.id });
  template = store.saveTemplate({ ...template, layout: '<aside>{{headline}}</aside>{{content}}', style: "PRIVATE TEMPLATE CSS" }, { id: template.id });
  assert.deepEqual(store.published(page.slug), original);
  template = store.saveTemplate({ ...template, style: ".cp-article{color:blue}" }, { id: template.id, publish: true });
  const published = store.published(page.slug);
  assert.match(published.html, /<aside>Bienvenue<\/aside>/);
  assert.ok(!published.html.includes("PRIVATE PAGE DRAFT"));
  assert.ok(published.scriptUrl !== original.scriptUrl);
  assert.ok(published.updatedAt > original.updatedAt);
  assert.equal(store.list(true)[0].updatedAt, published.updatedAt);
  assert.equal(store.template(template.id).usedPages, 1);
  assert.throws(() => store.removeTemplate(template.id, template.revision), error => error.status === 409);
  assert.throws(() => store.saveTemplate({ ...template, revision: template.revision - 1 }, { id: template.id }), error => error.status === 409);
});

test("invalid shared changes cannot break published pages and deleted templates cannot orphan drafts", t => {
  const store = fixture(t);
  const template = store.saveTemplate(model, { publish: true });
  const saved = store.save({ ...page, templateId: template.id }, { publish: true });
  const previous = store.published(page.slug);
  assert.throws(() => store.saveTemplate({ ...template, variables: [{ ...model.variables[0], defaultValue: "" }] }, { id: template.id, publish: true }), /Publication impossible/);
  assert.deepEqual(store.published(page.slug), previous);
  assert.throws(() => store.save({ ...page, templateId: "missing" }), /publié/);
  const draft = store.saveTemplate({ ...model, name: "Brouillon" });
  assert.throws(() => store.save({ ...page, templateId: draft.id }), /publié/);
  store.unpublish(saved.id, saved.revision);
  assert.throws(() => store.removeTemplate(template.id, template.revision), error => error.status === 409);
});

test("variables are typed and safely interpolated, required values are checked at publication", t => {
  const store = fixture(t);
  const template = store.saveTemplate({ ...model, variables: [{ ...model.variables[0], defaultValue: "" }, { key: "image", label: "Image", type: "image" }, { key: "visible", label: "Visible", type: "boolean", defaultValue: false }, { key: "amount", label: "Montant", type: "number", defaultValue: 0 }] }, { publish: true });
  let draft = store.save({ ...page, templateId: template.id });
  assert.throws(() => store.save(draft, { id: draft.id, publish: true }), /Titre principal/);
  draft = store.save({ ...draft, variableValues: { headline: '<img src=x onerror="alert(1)">', visible: false, amount: 3, unused: "do-not-publish" } }, { id: draft.id, publish: true });
  const published = store.published(page.slug);
  assert.match(published.html, /&lt;img/);
  assert.ok(!published.html.includes('<img src="x"'));
  assert.equal(published.variables.visible, false);
  assert.equal(published.variables.amount, 3);
  assert.equal(published.variableValues, undefined);
  assert.equal(published.variables.unused, undefined);
  for (const image of ["javascript:alert(1)", "data:text/html,x", "//evil.test/img", "https://user:secret@evil.test/x", 'https://evil.test/x\" onerror=x']) assert.throws(() => store.preview({ ...draft, variableValues: { image } }));
  assert.throws(() => store.preview({ ...draft, variableValues: { visible: "false" } }), /oui\/non/);
});

test("schema validation rejects reserved keys, malformed placeholders, oversized output and invalid scripts", t => {
  const store = fixture(t);
  const short = store.saveTemplate({ ...model, layout: "<h2>{headline}</h2>{content}" }, { publish: true });
  assert.match(store.preview({ ...page, templateId: short.id }).html, /<h2>Bienvenue<\/h2>/);
  for (const layout of ["No slot", "{{content}}{{content}}", "{{content}}{{missing}}", "{{content}}{{constructor}}"] ) assert.throws(() => normalizePageTemplate({ ...model, layout }));
  for (const key of ["content", "__proto__", "constructor", "invalid-key"]) assert.throws(() => normalizePageTemplate({ ...model, variables: [{ ...model.variables[0], key }] }));
  assert.throws(() => store.saveTemplate({ ...model, script: "const = ;" }));
  assert.throws(() => store.saveTemplate({ ...model, style: "</style><script>" }));
  assert.throws(() => normalizePageTemplate({ ...model, presentation: { maxWidth: 200 } }));
  const huge = store.saveTemplate({ ...model, layout: '{{headline}}'.repeat(1000) + '{{content}}' }, { publish: true });
  assert.throws(() => store.preview({ ...page, templateId: huge.id, variableValues: { headline: "x".repeat(4000) } }), /150 000/);
});

test("template administration is admin-only while editors can safely use published template code", async t => {
  const store = fixture(t), app = express();
  app.use(express.json());
  const auth = (req, res, next) => { const role = req.get("X-Role"); if (!role) return res.sendStatus(401); req.auth = { id: role }; req.backOfficeUser = { admin: role === "admin" }; next(); };
  registerCustomPageRoutes({ app, store, auth, requireBackOffice: (_req, _res, next) => next() });
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = (path, body, role = "admin") => fetch(origin + path, { method: "POST", headers: { "Content-Type": "application/json", "X-Role": role }, body: JSON.stringify(body) });
  assert.equal((await request("/api/admin/page-templates", model, "editor")).status, 403);
  const response = await request("/api/admin/page-templates", { ...model, publish: true }); assert.equal(response.status, 201);
  const template = await response.json();
  assert.equal((await request("/api/admin/pages", { ...page, templateId: template.id, publish: true }, "editor")).status, 201);
  const published = await (await fetch(origin + "/api/pages/le-club")).json();
  assert.match(published.html, /Bienvenue/);
  const script = await (await fetch(origin + published.scriptUrl)).text();
  assert.match(script, /"headline":"Bienvenue"/);
  assert.equal((await request("/api/admin/pages/preview", { ...page, script: "alert(1)" }, "editor")).status, 403);
  const preview = await (await request("/api/admin/pages/preview", { ...page, templateId: template.id, variableValues: { headline: "Aperçu" } }, "editor")).json();
  assert.match(preview.html, /Aperçu/);
});
