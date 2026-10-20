import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { buildRss, registerRssRoute } from "../src/services/rss.js";

const now = Date.parse("2026-10-20T14:00:00Z"), website = "https://www.ktga.me/";
const note = overrides => ({ id: "note-one", status: "published", version: "0.2.1", title: "Cartes & dés", summary: "**Bonjour** [joueurs](https://www.ktga.me/)", publishedAt: "2026-10-19T14:00:00Z", updatedAt: "2026-10-20T10:00:00Z", ...overrides });
test("RSS excludes drafts and future posts, escapes XML and maintains stable identifiers", () => {
  const feed = buildRss({ notes: [note(), note({ id: "private", status: "draft", summary: "PRIVATE" }), note({ id: "future", publishedAt: "2027-01-01", summary: "FUTURE" }), note({ publishedAt: null, summary: "UNDATED" })], website, now });
  assert.match(feed.body, /Cartes &amp; dés/);
  assert.match(feed.body, /Bonjour joueurs/);
  assert.doesNotMatch(feed.body, /PRIVATE|FUTURE|UNDATED/);
  assert.equal((feed.body.match(/<item>/g) || []).length, 1);
  const edited = buildRss({ notes: [note({ summary: "Edited" })], website, now });
  assert.notEqual(feed.etag, edited.etag);
  assert.equal(feed.body.match(/<guid[^>]*>.*?<\/guid>/)[0], edited.body.match(/<guid[^>]*>.*?<\/guid>/)[0]);
  assert.match(buildRss({ notes: [], website, now }).body, /<channel>/);
  assert.equal((buildRss({ notes: Array.from({ length: 65 }, (_, i) => note({ id: String(i) })), website, now }).body.match(/<item>/g) || []).length, 50);
});
test("public feed supports conditional reads and reflects publication without a restart", async () => {
  const app = express(); let notes = [];
  registerRssRoute({ app, notes: () => notes, website: () => website, settings: () => ({ siteName: "KTGA.ME" }), now: () => now });
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/rss.xml`;
    const empty = await fetch(url); assert.match(empty.headers.get("content-type"), /application\/rss\+xml/);
    const tag = empty.headers.get("etag"); await empty.text();
    assert.equal((await fetch(url, { headers: { "If-None-Match": tag } })).status, 304);
    notes = [note()];
    const changed = await fetch(url, { headers: { "If-None-Match": tag } });
    assert.equal(changed.status, 200); assert.match(await changed.text(), /<item>/);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
