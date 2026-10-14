import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createDiscordPresence } from "../src/services/discord-presence.js";

test("remembered companion sessions survive restart without storing raw tokens and remain revocable", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ktga-presence-store-"));
  const filename = path.join(directory, "presence.sqlite");
  let now = Date.now(), store = createDiscordPresence({ filename, now: () => now });
  const user = { id: "fixture-user", sessionVersion: 4 };
  try {
    const pair = store.pair(user, true), connection = store.connect(pair.code);
    assert.equal(connection.remember, true);
    assert.equal(Date.parse(connection.expiresAt) - now, 30 * 86400000);
    store.close(); store = createDiscordPresence({ filename, now: () => now });
    assert.equal(store.session(connection.token).userId, user.id);
    assert.equal(store.session(connection.token).sessionVersion, 4);
    const db = new DatabaseSync(filename, { readOnly: true });
    const rows = db.prepare("SELECT * FROM companion_sessions").all(); db.close();
    assert.ok(!JSON.stringify(rows).includes(connection.token));
    assert.equal(rows[0].token_hash.length, 64);
    store.revoke(user.id); assert.equal(store.session(connection.token), null);
    const next = store.connect(store.pair(user, true).code);
    store.disconnect(next.token); assert.equal(store.session(next.token), null);
    const temporary = store.connect(store.pair(user).code);
    assert.equal(Date.parse(temporary.expiresAt) - now, 12 * 3600000);
    store.close(); store = createDiscordPresence({ filename, now: () => now });
    assert.equal(store.session(temporary.token), null);
    const expired = store.connect(store.pair(user, true).code);
    now += 30 * 86400000 + 1; assert.equal(store.session(expired.token), null);
  } finally { store.close(); assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir())); fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});
