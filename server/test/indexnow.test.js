import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
import { DatabaseSync } from "node:sqlite";
import { createIndexNow, registerIndexNowRoutes } from "../src/services/indexnow.js";
import { indexNowCatalog } from "../src/services/indexnow-catalog.js";

test("IndexNow sends only changed canonical pages and persists tombstones and retry state across restart", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ktga-indexnow-"));
  let time = Date.now(), fail = false, sends = [];
  let rows = [{ url: "https://www.ktga.me/pages/hello", indexable: true, status: 200, content: { text: "Hello" } }, { url: "https://www.ktga.me/admin", indexable: false, status: 200, content: {} }];
  const options = { filename: path.join(directory, "queue.sqlite"), website: () => "https://www.ktga.me/", catalog: () => rows, enabled: true, now: () => time, send: async (_url, config) => { sends.push(JSON.parse(config.body)); return { status: fail ? 429 : 202, headers: new Headers({ "Retry-After": "120" }) }; } };
  let service = createIndexNow(options);
  try {
    const key = service.key; service.reconcile(); await service.flush(); assert.equal(sends[0].urlList.length, 1); assert.match(sends[0].keyLocation, new RegExp(`${key}\\.txt$`));
    assert.equal(service.urlStatuses()[rows[0].url].state, "validating");
    service.reconcile(); await service.flush(); assert.equal(sends.length, 1);
    rows[0].content.text = "Updated"; service.reconcile();
    assert.equal(service.urlStatuses()[rows[0].url].state, "pending");
    fail = true; await service.flush(); assert.equal(service.status().pending, 1);
    assert.equal(service.urlStatuses()[rows[0].url].state, "error");
    await service.flush(); assert.equal(sends.length, 2);
    service.close(); service = createIndexNow(options); assert.equal(service.key, key);
    assert.equal(service.urlStatuses()[rows[0].url].httpStatus, 429);
    fail = false; time += 120001; await service.flush(); assert.equal(service.status().pending, 0);
    rows = []; service.reconcile(); await service.flush(); assert.equal(sends.at(-1).urlList[0], "https://www.ktga.me/pages/hello");
    service.reconcile(); await service.flush(); assert.equal(service.status().pending, 0);
  } finally { service.close(); await fs.rm(directory, { recursive: true, force: true }); }
});

test("per-URL receipts do not spread another batch's error and migrate legacy submissions honestly", async () => {
  let rows = [{ url: "https://www.ktga.me/", indexable: true, status: 200, content: "home" }], fail = false;
  const service = createIndexNow({ filename: ":memory:", website: () => "https://www.ktga.me/", catalog: () => rows, enabled: true, send: async () => new Response(null, { status: fail ? 503 : 200 }) });
  try {
    service.reconcile(); await service.flush();
    rows.push({ ...rows[0], url: "https://www.ktga.me/faq" }); fail = true;
    service.reconcile(); await service.flush();
    assert.equal(service.urlStatuses()[rows[0].url].state, "ok");
    assert.equal(service.urlStatuses()[rows[1].url].state, "error");
    rows[1].content = "new FAQ"; service.reconcile();
    assert.equal(service.urlStatuses()[rows[1].url].state, "pending");
    service.setEnabled(false); assert.equal(service.urlStatuses()[rows[1].url].state, "disabled");
  } finally { service.close(); }
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ktga-indexnow-legacy-"));
  const filename = path.join(directory, "old.sqlite"), db = new DatabaseSync(filename);
  db.exec("CREATE TABLE indexnow_urls(url TEXT PRIMARY KEY,desired TEXT NOT NULL,sent TEXT,changed_at INTEGER NOT NULL); INSERT INTO indexnow_urls VALUES('https://www.ktga.me/','legacy','legacy',1)"); db.close();
  const migrated = createIndexNow({ filename, website: () => "https://www.ktga.me/", catalog: () => [] });
  try { assert.equal(migrated.urlStatuses()["https://www.ktga.me/"].state, "sent"); assert.equal(migrated.urlStatuses()["https://www.ktga.me/"].httpStatus, null); }
  finally { migrated.close(); await fs.rm(directory, { recursive: true, force: true }); }
});
test("in-flight acknowledgements never discard a newer pending change", async () => {
  let release, calls = 0; const rows = [{ url: "https://www.ktga.me/", indexable: true, status: 200, content: "first" }];
  const service = createIndexNow({ filename: ":memory:", website: () => "https://www.ktga.me/", catalog: () => rows, enabled: true, send: async () => { calls++; await new Promise(resolve => { release = resolve; }); return { status: 200 }; } });
  try { service.reconcile(); const pending = service.flush(); rows[0].content = "second"; service.reconcile(); await service.flush(); assert.equal(calls, 1); release(); await pending; assert.equal(service.status().pending, 1); }
  finally { service.close(); }
});
test("catalog ignores drafts and timestamp-only edits but includes live template content", () => {
  const note = { status: "published", version: "1.0", title: "One", summary: "Intro", updatedAt: "one", blocks: [{ id: "id", type: "text", content: "Body" }] };
  const options = { website: () => "https://www.ktga.me/", settings: () => ({ siteName: "KTGA" }), games: () => [], notes: id => id ? note : [note, { version: "9", status: "draft" }], pages: () => [{ slug: "hello", title: "Hello", indexable: true }], page: () => ({ title: "Hello", html: "Template content" }), help: () => ({ entries: [] }) };
  const first = indexNowCatalog(options); note.updatedAt = "two";
  assert.deepEqual(indexNowCatalog(options).map(row => row.content), first.map(row => row.content));
  assert.ok(first.some(row => row.content.page?.html === "Template content"));
  assert.ok(!first.some(row => row.url.includes("version=9")));
  assert.equal(first.find(row => row.view === "lobby").content.presentation, "public-casino-info-v1");
  assert.equal(first.find(row => row.view === "patchnotes" && !row.id).content.presentation, "release-archive-v1");
  assert.equal(first.find(row => row.view === "patchnotes" && row.id).content.presentation, "release-reader-v2");
});

test("key verification is public while IndexNow controls follow back-office permissions", async () => {
  const service = createIndexNow({ filename: ":memory:", website: () => "https://www.ktga.me/", catalog: () => [] });
  const app = express(); app.use(express.json());
  registerIndexNowRoutes({ app, service, website: () => "https://www.ktga.me/",
    auth: (req, res, next) => req.get("X-Role") ? next() : res.sendStatus(401),
    requireBackOffice: (req, res, next) => ["admin", "editor"].includes(req.get("X-Role")) ? next() : res.sendStatus(403),
    requireAdmin: (req, res, next) => req.get("X-Role") === "admin" ? next() : res.sendStatus(403) });
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal(await (await fetch(`${origin}/${service.key}.txt`)).text(), service.key);
    const url = `${origin}/api/admin/communication/indexnow`;
    assert.equal((await fetch(url)).status, 401);
    assert.equal((await fetch(url, { headers: { "X-Role": "editor" } })).status, 200);
    assert.equal((await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json", "X-Role": "editor" }, body: '{"enabled":true}' })).status, 403);
    assert.equal((await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json", "X-Role": "admin" }, body: '{"enabled":true}' })).status, 200);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); service.close(); }
});
