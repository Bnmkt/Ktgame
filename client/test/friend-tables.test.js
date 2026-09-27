import test from "node:test";
import assert from "node:assert/strict";
import { friendTables } from "../src/features/games/friend-tables.js";
import { farkleSuggestions } from "../src/features/games/farkle/model.js";

test("live list only contains friends' games, deduplicated and capped at five", () => {
  const rooms = Array.from({ length: 8 }, (_, index) => ({ code: String(index), inProgress: true, players: [{ id: "friend" }] }));
  rooms.unshift({ code: "outsider", inProgress: true, players: [{ id: "unknown" }] });
  rooms.unshift({ code: "waiting", inProgress: false, players: [{ id: "friend" }] });
  assert.deepEqual(friendTables(rooms, [{ id: "friend", activeRoom: { code: "0", playing: true } }]).map((row) => row.code), ["0", "1", "2", "3", "4"]);
  assert.deepEqual(friendTables(rooms, []), []);
  assert.deepEqual(friendTables([], [{ id: "friend", activeRoom: null }]), []);
  assert.equal(friendTables([], [{ id: "friend", activeRoom: { code: "private-invited", playing: true } }])[0].code, "private-invited");
});

test("public Farkle choices use the same scoring as player suggestions", () => {
  assert.deepEqual(farkleSuggestions([]), []);
  assert.deepEqual(farkleSuggestions([2, 3, 4, 6]), []);
  assert.equal(farkleSuggestions([1, 2, 3, 4, 5, 6])[0].points, 1500);
  assert.equal(farkleSuggestions([1, 1, 1])[0].points, 1000);
});
