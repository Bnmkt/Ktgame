import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createCustomPageStore, renderCustomHtml, registerCustomPageRoutes } from "../src/services/custom-pages.js";

const document = { title: "Le club", slug: "le-club", format: "markdown", content: "## Bienvenue\nUne partie ?", showFooter: true };
const fixture = (t) => { const store = createCustomPageStore({ filename: ":memory:" }); t.after(() => store.close()); return store; };

test("HTML keeps readable layout and images while stripping active content and unsafe URLs", () => {
  const html = renderCustomHtml('<section style="display:flex;gap:20px;position:fixed;background-image:url(https://bad.test/x)"><h2>Le club</h2><img src="/api/media/image.png" onerror="alert(1)"><a href="jav&#x61;script:alert(1)">Lien</a><script>alert(2)</script><iframe src="https://bad.test"></iframe><svg onload="alert(3)"></svg><p style="color:#fff;text-align:center">Texte</p></section>');
  for (const forbidden of ["onerror", "onload", "javascript:", "alert", "iframe", "svg", "position", "background-image"]) assert.ok(!html.includes(forbidden), forbidden);
  assert.match(html, /display:flex;gap:20px/);
  assert.match(html, /src="\/api\/media\/image.png"/);
  assert.match(html, /noopener noreferrer/);
  assert.match(html, /color:#fff;text-align:center/);
});

test("draft edits never replace the published page until explicit publication", (t) => {
  const store = fixture(t);
  let draft = store.save(document);
  assert.equal(store.published(document.slug), null);
  assert.deepEqual(store.list(true), []);
  draft = store.save(draft, { id: draft.id, publish: true });
  const published = store.published(document.slug);
  draft = store.save({ ...draft, title: "Nouveau titre", content: "Brouillon privé" }, { id: draft.id });
  assert.equal(store.published(document.slug).title, published.title);
  assert.ok(store.list()[0].hasChanges);
  assert.equal(store.list(true)[0].content, undefined);
  draft = store.save(draft, { id: draft.id, publish: true });
  assert.equal(store.published(document.slug).content, "Brouillon privé");
  assert.equal(draft.hasChanges, false);
});

test("live URLs stay reserved while renaming a draft and stale edits are rejected", (t) => {
  const store = fixture(t);
  const first = store.save(document, { publish: true });
  const changed = store.save({ ...first, slug: "nouveau-club" }, { id: first.id });
  assert.ok(store.published("le-club"));
  assert.throws(() => store.save(document), error => error.status === 409);
  assert.throws(() => store.save(first, { id: first.id }), error => error.status === 409);
  assert.throws(() => store.remove(first.id, first.revision), error => error.status === 409);
  const next = store.save(changed, { id: first.id, publish: true });
  assert.equal(store.published("le-club"), null);
  assert.ok(store.published("nouveau-club"));
  store.unpublish(first.id, next.revision);
  assert.deepEqual(store.list(true), []);
});

test("only sanitized HTML leaves the public endpoint and admin routes require a back-office account", async (t) => {
  const store = fixture(t), app = express();
  app.use(express.json());
  const auth = (req, res, next) => { if (!req.get("X-Test-Role")) return res.sendStatus(401); req.auth = { id: "editor" }; next(); };
  const requireBackOffice = (req, res, next) => ["admin", "editor"].includes(req.get("X-Test-Role")) ? next() : res.sendStatus(403);
  registerCustomPageRoutes({ app, store, auth, requireBackOffice });
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(origin + "/api/admin/pages")).status, 401);
  assert.equal((await fetch(origin + "/api/admin/pages", { headers: { "X-Test-Role": "player" } })).status, 403);
  const response = await fetch(origin + "/api/admin/pages", { method: "POST", headers: { "Content-Type": "application/json", "X-Test-Role": "editor" }, body: JSON.stringify({ ...document, format: "html", content: '<p>Hello</p><script>privateRawContent()</script>', publish: true }) });
  assert.equal(response.status, 201);
  const publicPage = await (await fetch(origin + "/api/pages/le-club")).json();
  assert.equal(publicPage.html, "<p>Hello</p>");
  assert.equal(publicPage.content, undefined);
  assert.ok(!JSON.stringify(await (await fetch(origin + "/api/pages")).json()).includes("privateRawContent"));
});
