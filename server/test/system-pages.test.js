import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";
import { createCustomPageStore, renderCustomHtml } from "../src/services/custom-pages.js";
import { registerPublicPages } from "../src/services/public-pages.js";
import { pageMetadata } from "../../client/src/seo/metadata.js";
import { publicDestinations } from "../src/services/public-catalog.js";

const seeds = {
  templates: [{ id: "system-layout", name: "Informations", format: "html", layout: "{content}", variables: [{ key: "contact_email", label: "Contact", type: "text", defaultValue: "default@example.com" }] }],
  pages: [{ id: "system-page-terms", systemRoute: "/conditions", slug: "ktga-terms", title: "Conditions", description: "Conditions du casino", format: "html", templateId: "system-layout", content: '<section id="cp-droits"><h2>Droits</h2><a href="mailto:{contact_email}">{contact_email}</a><a href="#cp-droits">Sommaire</a></section>', indexable: true }]
};
test("system pages seed once, retain independent drafts, preserve bindings and protect essential documents", () => {
  let email = "first@example.com";
  const store = createCustomPageStore({ filename: ":memory:", systemContext: () => ({ values: { contact_email: email } }) });
  try {
    store.seedSystemPages(seeds);
    assert.equal(store.list().length, 1); assert.equal(store.list(true)[0].systemRoute, "/conditions");
    assert.match(store.publishedRoute("/conditions").html, /first@example.com/);
    email = "second@example.com"; assert.match(store.publishedRoute("/conditions").html, /second@example.com/);
    let page = store.get("system-page-terms");
    page = store.save({ ...page, content: "<p>Mon nouveau texte</p>" }, { id: page.id });
    assert.ok(!store.publishedRoute("/conditions").html.includes("nouveau texte"));
    store.seedSystemPages(seeds); assert.equal(store.get(page.id).content, "<p>Mon nouveau texte</p>");
    page = store.save(page, { id: page.id, publish: true });
    assert.match(store.publishedRoute("/conditions").html, /nouveau texte/);
    assert.throws(() => store.unpublish(page.id, page.revision), /intégrée/);
    assert.throws(() => store.remove(page.id, page.revision), /intégrée/);
  } finally { store.close(); }
});

test("canonical metadata and sitemap reuse original public addresses without duplicates or private aliases", () => {
  const pages = [{ slug: "ktga-terms", title: "Conditions modifiées", systemRoute: "/conditions", indexable: true }, { slug: "ktga-yahtzee", title: "Yahtzee", systemRoute: "/jeux/yahtzee", indexable: true }];
  const games = [{ id: "yahtzee", name: "Yahtzee", enabled: true }];
  const options = { customPages: pages, games };
  const meta = pageMetadata({ ...options, pathname: "/conditions" });
  assert.equal(meta.view, "page"); assert.equal(meta.id, "ktga-terms"); assert.equal(meta.canonicalPath, "/conditions");
  assert.equal(pageMetadata({ ...options, pathname: "/pages/ktga-terms" }).canonicalPath, "/conditions");
  assert.equal(pageMetadata({ ...options, pathname: "/conditions", search: "?preview=private" }).indexable, false);
  const game = pageMetadata({ ...options, pathname: "/jeux/yahtzee" });
  assert.equal(game.view, "page"); assert.equal(game.gameId, "yahtzee");
  assert.equal(pageMetadata({ ...options, games: [], pathname: "/jeux/yahtzee" }).status, 404);
  const catalog = publicDestinations({ settings: {}, website: "https://www.ktga.me/", games, pages, notes: [] });
  assert.equal(catalog.filter(row => row.path === "/conditions").length, 1);
  assert.ok(!catalog.some(row => row.path.startsWith("/pages/ktga-")));
});

test("custom document anchors survive without enabling generic DOM hooks or unsafe links", () => {
  const html = renderCustomHtml('<h2 id="cp-audience">Confidentialité</h2><p id="ads">Texte</p><a href="#cp-audience">Retour</a><a href="https://example.com/">Externe</a>');
  assert.match(html, /id="cp-audience"/); assert.ok(!html.includes('id="ads"'));
  assert.match(html, /href="#cp-audience" target="_self"/);
  assert.match(html, /href="https:\/\/example.com\/" target="_blank"/);
});

test("built system-page migration serves original URLs, redirects aliases and retains game structured data", { skip: !fs.existsSync(new URL("../../client/dist-ssr/render.js", import.meta.url)) }, async () => {
  const store = createCustomPageStore({ filename: ":memory:" }), app = express();
  await registerPublicPages({ app, clientDist: fileURLToPath(new URL("../../client/dist/", import.meta.url)), settings: () => ({ siteName: "KTGA.ME", supportEmail: "contact@netdis.org" }), games: () => [{ id: "yahtzee", name: "Yahtzee", type: "dice", minPlayers: 1, maxPlayers: 6 }], help: () => ({ entries: [] }), catalog: () => ({ notes: [] }), note: () => null, customPages: () => store.list(true), customPage: slug => store.published(slug), customRevision: store.revision, seedSystemPages: store.seedSystemPages });
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal(store.list().length, 7);
    for (const path of ["/conditions", "/mentions-legales", "/confidentialite", "/cookies", "/parents", "/jeux", "/jeux/yahtzee"]) {
      const response = await fetch(origin + path), html = await response.text();
      assert.equal(response.status, 200, path); assert.match(html, /custom-page-runtime/);
      if (path === "/jeux/yahtzee") assert.match(html, /"@type":"VideoGame"/);
      if (path === "/jeux") assert.match(html, /public-games-grid/);
    }
    const alias = await fetch(origin + "/pages/ktga-terms", { redirect: "manual" }); assert.equal(alias.status, 308); assert.equal(alias.headers.get("location"), "/conditions");
    const sitemap = await (await fetch(origin + "/sitemap.xml")).text(); assert.ok(!sitemap.includes("/pages/ktga-")); assert.equal((sitemap.match(/<loc>https:\/\/www.ktga.me\/conditions<\/loc>/g) || []).length, 1);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); store.close(); }
});
