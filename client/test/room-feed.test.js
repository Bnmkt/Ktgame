import test from "node:test";
import assert from "node:assert/strict";
import { applyRoomPatch } from "../src/features/games/room-feed.js";

test("incremental room feed adds, changes and removes rooms without reordering unchanged entries", () => {
  const original = [{ id:"a", players:[] }, { id:"b", players:[] }];
  const added = { id:"c", players:[] }, changed = { id:"a", players:[{id:"player"}] };
  const next = applyRoomPatch(original, { upsert:[added,changed], remove:["b","missing"] });
  assert.deepEqual(next, [changed,added]);
  assert.deepEqual(original, [{ id:"a", players:[] }, { id:"b", players:[] }]);
  assert.deepEqual(applyRoomPatch(next, {upsert:[],remove:["a","c"]}), []);
});
