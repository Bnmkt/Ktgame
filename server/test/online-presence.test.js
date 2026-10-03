import test from "node:test";
import assert from "node:assert/strict";
import { createOnlinePresence } from "../src/services/online-presence.js";

test("presence counts multiple sockets and tolerates short reconnects", () => {
  const changes = [];
  const callbacks = new Map();
  let sequence = 0;
  const presence = createOnlinePresence({ onChange: (id) => changes.push(id), schedule: (callback) => { callbacks.set(++sequence, callback); return sequence; }, cancel: (id) => callbacks.delete(id) });
  presence.connect("alice", "one");
  presence.connect("alice", "two");
  presence.connect("alice", "two");
  assert.deepEqual(changes, ["alice"]);
  presence.disconnect("alice", "one");
  assert.equal(callbacks.size, 0);
  presence.disconnect("alice", "two");
  assert.equal(presence.has("alice"), true);
  presence.connect("alice", "three");
  assert.equal(callbacks.size, 0);
  presence.disconnect("alice", "three");
  for (const callback of callbacks.values()) callback();
  assert.equal(presence.has("alice"), false);
  assert.deepEqual(changes, ["alice", "alice"]);
  presence.disconnect("alice", "unknown");
  presence.close();
});
