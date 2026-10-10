import test from "node:test";
import assert from "node:assert/strict";
import { createRoomDirectory } from "../src/services/room-directory.js";
test("room projections update memberships without keeping stale state after rollback", () => {
  const first = { id: "one", code: "ONE", players: [{ id: "a" }] };
  let rows = [first]; const directory = createRoomDirectory(() => rows);
  assert.equal(directory.get("one"), first);
  const next = { ...first, players: [{ id: "b" }] }; rows[0] = next; directory.committed(next);
  assert.deepEqual(directory.related(new Set(["a"])), []); assert.equal(directory.related(new Set(["b"]))[0], next);
  rows = [structuredClone(first)]; assert.equal(directory.get("one"), rows[0]);
  rows.push({ id: "two", code: "TWO", players: [], ranked: { roster: [{ id: "a" }] } });
  assert.equal(directory.related(new Set(["a"])).length, 2); assert.equal(directory.code("TWO").id, "two");
  rows = []; assert.equal(directory.get("one"), undefined); assert.deepEqual(directory.related(new Set(["a"])), []);
});
