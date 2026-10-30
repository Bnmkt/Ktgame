import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import express from "express";
import { DatabaseSync } from "node:sqlite";
import { createChatStore } from "../src/services/chat.js";
import { registerChatModerationRoutes } from "../src/services/chat-moderation.js";

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ktga-chat-clear-")), filename = path.join(directory, "chat.sqlite");
  const store = createChatStore({ filename });
  t.after(() => { store.close(); assert.equal(path.dirname(directory), path.resolve(os.tmpdir())); assert.ok(path.basename(directory).startsWith("ktga-chat-clear-")); fs.rmSync(directory, { recursive: true, force: true }); });
  return { store, filename };
}
test("global purge preserves private/table messages and records a monotonic durable audit", t => {
  const { store, filename } = fixture(t);
  const add = (channelType, channelId) => store.add({ channelType, channelId, senderId: "player", content: "Message" });
  assert.equal(add("global", "global").revision, 0); add("direct", "private"); add("room", "table");
  const result = store.purgeGlobal("admin");
  assert.equal(result.removed, 1); assert.equal(result.revision, 1); assert.equal(store.list("global", "global").length, 0);
  assert.equal(store.list("direct", "private").length, 1); assert.equal(store.list("room", "table").length, 1);
  assert.equal(add("global", "global").revision, 1); assert.equal(store.purgeGlobal("admin").revision, 2);
  const db = new DatabaseSync(filename, { readOnly: true });
  try { assert.equal(db.prepare("SELECT COUNT(*) AS n FROM chat_purges WHERE actor_id='admin'").get().n, 2); assert.equal(db.prepare("SELECT value FROM chat_control WHERE key='global_revision'").get().value, 2); } finally { db.close(); }
});
test("a failed audit rolls back both deletion and revision", t => {
  const { store, filename } = fixture(t);
  store.add({ channelType: "global", channelId: "global", senderId: "player", content: "À conserver" });
  const db = new DatabaseSync(filename); db.exec("CREATE TRIGGER refuse_audit BEFORE INSERT ON chat_purges BEGIN SELECT RAISE(ABORT,'test'); END"); db.close();
  assert.throws(() => store.purgeGlobal("admin"));
  assert.equal(store.globalRevision(), 0); assert.equal(store.list("global", "global").length, 1);
});
test("purge HTTP endpoint requires an administrator and explicit confirmation before publishing", async t => {
  const { store } = fixture(t), app = express(), events = [], audits = [];
  app.use(express.json());
  const auth = (req, res, next) => { const id = req.get("X-Test-User"); if (!id) return res.sendStatus(401); req.auth = { id }; next(); };
  const requireAdmin = (req, res, next) => req.auth.id === "admin" ? next() : res.sendStatus(403);
  registerChatModerationRoutes({ app, auth, requireAdmin, store, publish: event => events.push(event), audit: entry => audits.push(entry) });
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/admin/chat/global`;
  const purge = (user, body = {}) => fetch(url, { method: "DELETE", headers: { "Content-Type": "application/json", ...(user ? { "X-Test-User": user } : {}) }, body: JSON.stringify(body) });
  store.add({ channelType: "global", channelId: "global", senderId: "player", content: "À effacer" });
  for (const [user, status] of [[null, 401], ["player", 403], ["editor", 403], ["admin", 400]]) assert.equal((await purge(user)).status, status);
  assert.equal(store.list("global", "global").length, 1); assert.equal(events.length, 0);
  const response = await purge("admin", { confirm: true, channelId: "private" }); assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), events[0]); assert.equal(events[0].channelId, "global"); assert.equal(audits[0].userId, "admin");
});
