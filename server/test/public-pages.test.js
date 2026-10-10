import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import express from "express";
import { createPublicPageService, registerPublicPages } from "../src/services/public-pages.js";
import { pageMetadata } from "../../client/src/seo/metadata.js";

const game = { id: "yahtzee", name: "Yahtzee", type: "dice", minPlayers: 1, maxPlayers: 6, enabled: true, privateRule: "do-not-expose" };
const release = { id: "published", version: "0.2.0", versionGroup: "0.2", status: "published", title: "Nouveautés", summary: "Des nouveautés", updatedAt: "2026-10-01T15:00:00Z", authorId: "private-author", blocks: [{ id: "text", type: "text", content: "Les nouveaux jeux", metadata: {} }] };
const sources = {
  settings: () => ({ siteName: "KTGA.ME", siteSubtitle: "Jeux gratuits", siteIcon: "landmark", supportEmail: "contact@example.com", smtpPassword: "do-not-expose" }),
  games: () => [game, { ...game, id: "hidden-game", enabled: false }],
  help: () => ({ entries: [{ id: "answer", kind: "faq", title: "Comment jouer ?", category: "Jeux", body: "Créez une table gratuite." }] }),
  catalog: () => ({ currentVersion: "0.3.0", notes: [release, { ...release, version: "0.3.0", status: "draft", title: "Hidden draft" }] }),
  note: (version) => version === release.version ? release : null
};
const template = '<html lang="fr"><head><title>KTGA.ME</title></head><body><div id="root"></div></body></html>';
const fixture = (extra = {}) => createPublicPageService({ ...sources, template, render: (data) => `<main>${data.meta.title}</main>`, ...extra });

test("public metadata is specific, canonical, and does not index private or sensitive routes", () => {
  for (const route of ["/", "/jeux", "/faq", "/guide", "/conditions", "/parents"]) assert.equal(fixture().metadata(route).indexable, true, route);
  for (const route of ["/admin", "/profil", "/table/ABC123", "/shop", "/bugs/1842", "/parents?parental-access=private", "/?reset-password=private", "/?room=ABC123"]) assert.equal(fixture().metadata(route).indexable, false, route);
  assert.match(fixture().metadata("/jeux/yahtzee").title, /Yahtzee/);
  assert.equal(fixture().metadata("/faq?irrelevant=1").canonicalPath, "/faq");
  assert.equal(fixture().metadata("/patchnotes/0.2.0").canonicalPath, "/patchnotes?version=0.2.0");
  assert.equal(pageMetadata({ pathname: "/ktga/faq", basePath: "/ktga" }).canonicalPath, "/ktga/faq");
});
test("unknown routes, disabled games and unpublished releases are real 404 pages", () => {
  for (const route of ["/unknown", "/jeux/hidden-game", "/patchnotes?version=0.3.0", "/faq/extra", "/table"]) {
    const result = fixture().document(route); assert.equal(result.meta.status, 404, route); assert.equal(result.meta.indexable, false);
  }
});
test("bootstrap data and JSON-LD never expose secrets, drafts, authors or arbitrary query values", () => {
  const html = fixture().document("/patchnotes?version=0.2.0&token=do-not-expose").html;
  for (const secret of ["do-not-expose", "Hidden draft", "private-author", "smtpPassword", "hidden-game", "privateRule"]) assert.ok(!html.includes(secret), secret);
  assert.match(html, /name="robots" content="noindex, follow"/);
  assert.ok(!html.includes("application/ld+json"));
  assert.match(fixture().document("/jeux/yahtzee").html, /"@type":"VideoGame"/);
});
test("HTML metadata and inert JSON resist script injection", () => {
  const service = fixture({ settings: () => ({ siteName: '</script><script>unsafe()</script>"', siteSubtitle: "Unsafe" }), render: () => "<main>Safe React output</main>" });
  const html = service.document("/").html;
  assert.ok(!html.includes("<script>unsafe()"));
  assert.match(html, /\\u003c\/script/);
  const data = JSON.parse(html.match(/id="ktga-page-data">(.*?)<\/script>/s)[1]);
  assert.match(data.settings.siteName, /unsafe/);
});
test("sitemap contains only public canonical URLs, real update dates and no drafts", () => {
  const sitemap = fixture().sitemap();
  for (const text of ["/jeux/yahtzee", "/faq", "version=0.2.0", "2026-10-01T15:00:00.000Z"]) assert.ok(sitemap.includes(text), text);
  for (const text of ["hidden-game", "version=0.3.0", "/admin", "/profil", "/bugs"]) assert.ok(!sitemap.includes(text), text);
  assert.match(fixture().robots(), /Sitemap: https:\/\/www.ktga.me\/sitemap.xml/);
});
test("public caches expire and do not multiply for tracking or verification queries", () => {
  let time = 0, count = 0;
  const service = fixture({ now: () => time, render: () => { count++; return "<main>Public content</main>"; } });
  for (let index = 0; index < 100; index++) service.document(`/faq?ignored=${index}`);
  assert.equal(count, 1);
  time = 30001; service.document("/faq"); assert.equal(count, 2);
});
test("built renderer sends real content without JavaScript and preserves HTTP semantics", { skip: !fs.existsSync(new URL("../../client/dist-ssr/render.js", import.meta.url)) }, async () => {
  const app = express();
  await registerPublicPages({ app, clientDist: new URL("../../client/dist/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"), ...sources });
  app.use((_req, res) => res.sendStatus(404));
  const server = app.listen(0, "127.0.0.1"); await new Promise((resolve) => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const route of ["/", "/jeux/yahtzee", "/faq", "/guide", "/patchnotes?version=0.2.0", "/conditions", "/mentions-legales", "/parents", "/cookies", "/confidentialite"]) {
      const response = await fetch(origin + route); const html = await response.text(); assert.equal(response.status, 200, route);
      assert.match(html, /<main/); assert.match(html, /rel="canonical"/);
      const crawler = await fetch(origin + route, { headers: { "User-Agent": "Googlebot" } }); assert.equal(await crawler.text(), html);
      if (route === "/faq") assert.match(html, /Créez une table gratuite/);
      if (route.startsWith("/patchnotes?")) assert.match(html, /Les nouveaux jeux/);
      if (route === "/jeux/yahtzee") assert.match(html, /Combinaisons inférieures/);
    }
    assert.equal((await fetch(origin + "/does-not-exist")).status, 404);
    assert.match((await fetch(origin + "/admin")).headers.get("x-robots-tag"), /noindex/);
    assert.equal((await fetch(origin + "/faq/", { redirect: "manual" })).status, 308);
    assert.equal((await fetch(origin + "//outside.example/faq/", { redirect: "manual" })).headers.get("location"), "/outside.example/faq");
    assert.equal((await fetch(origin + "/index.html", { redirect: "manual" })).headers.get("location"), "/");
    assert.match((await fetch(origin + "/sitemap.xml")).headers.get("content-type"), /application\/xml/);
    assert.match((await fetch(origin + "/robots.txt")).headers.get("content-type"), /text\/plain/);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
