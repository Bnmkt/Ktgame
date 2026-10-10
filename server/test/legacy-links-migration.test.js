import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { applyChanges, inspectDatabase, rewriteLegacyText, rewriteStoredText } from "../scripts/migrate-legacy-links.mjs";

test("legacy URLs preserve routes, queries and fragments without altering foreign links", () => {
  for (const [before, after] of [
    ["https://netdis.org/ktga/profil?tab=account#security", "https://www.ktga.me/profil?tab=account#security"],
    ["http://www.netdis.org/ktga/?verify-email=fixture", "https://www.ktga.me/?verify-email=fixture"],
    ["//netdis.org/ktga", "https://www.ktga.me/"],
    ["https://www.ktga.me/ktga/shop", "https://www.ktga.me/shop"],
    ["[Profil](/ktga/profil)", "[Profil](/profil)"],
    ["![Capture](/ktga/guides/tutorial.png)", "![Capture](/guides/tutorial.png)"],
    ["/ktga?reset-password=fixture", "/?reset-password=fixture"],
    ["/ktga/event/heist-1/banner.png", "/event/heist-1/cover.png"],
    ["https://foreign.example/ktga/profil", "https://foreign.example/ktga/profil"],
    ["https://netdis.org/ktga-other", "https://netdis.org/ktga-other"],
    ["contact@netdis.org", "contact@netdis.org"]
  ]) {
    assert.equal(rewriteLegacyText(before), after);
    assert.equal(rewriteLegacyText(after), after);
  }
});

test("JSON rewriting handles escaped slashes and nested strings, preserving other data", () => {
  const before = '{ "url": "https:\\/\\/netdis.org\\/ktga\\/shop", "nested": ["/ktga/profil", 5, false], "hash": "unmodified" }';
  assert.deepEqual(JSON.parse(rewriteStoredText(before)), { url: "https://www.ktga.me/shop", nested: ["/profil", 5, false], hash: "unmodified" });
  assert.equal(rewriteStoredText('{ "unchanged": true }'), '{ "unchanged": true }');
});

test("database migration preserves identities, row counts and foreign keys and is idempotent", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys=ON; CREATE TABLE people(id TEXT PRIMARY KEY, data TEXT); CREATE TABLE notes(id INTEGER PRIMARY KEY, person TEXT REFERENCES people(id), text TEXT); CREATE TABLE metadata(value TEXT);");
    db.prepare("INSERT INTO people VALUES(?,?)").run("player", JSON.stringify({ passwordHash: "unchanged", avatar: "/ktga/guides/image.png", balance: 450 }));
    db.prepare("INSERT INTO notes VALUES(1,?,?)").run("player", "[Guide](https://netdis.org/ktga/guide)");
    db.prepare("INSERT INTO metadata VALUES(?)").run("/ktga/shop");
    const plan = inspectDatabase(db);
    assert.equal(plan.changes.length, 3);
    applyChanges(db, plan);
    assert.equal(inspectDatabase(db).changes.length, 0);
    assert.deepEqual(JSON.parse(db.prepare("SELECT data FROM people").get().data), { passwordHash: "unchanged", avatar: "/guides/image.png", balance: 450 });
    assert.equal(db.prepare("SELECT text FROM notes").get().text, "[Guide](https://www.ktga.me/guide)");
    assert.equal(db.prepare("SELECT value FROM metadata").get().value, "/shop");
  } finally { db.close(); }
});

test("stale plans roll back the complete database transaction", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE entries(id INTEGER PRIMARY KEY, value TEXT); INSERT INTO entries VALUES(1,'/ktga/shop'),(2,'/ktga/profil');");
    const plan = inspectDatabase(db);
    db.exec("UPDATE entries SET value='changed' WHERE id=2");
    assert.throws(() => applyChanges(db, plan), /source row changed/);
    assert.equal(db.prepare("SELECT value FROM entries WHERE id=1").get().value, "/ktga/shop");
  } finally { db.close(); }
});

test("historical request routes remain unchanged", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE request_logs(id INTEGER PRIMARY KEY, route TEXT); INSERT INTO request_logs VALUES(1,'/ktga/api/rooms');");
    assert.equal(inspectDatabase(db).changes.length, 0);
    assert.equal(db.prepare("SELECT route FROM request_logs").get().route, "/ktga/api/rooms");
  } finally { db.close(); }
});
