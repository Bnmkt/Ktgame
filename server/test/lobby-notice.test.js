import test from "node:test";
import assert from "node:assert/strict";
import { normalizeLobbyNotice, updateLobbyNotice } from "../src/services/lobby-notice.js";

test("a revision changes only when the administrator actually changes the notice", () => {
  const original = updateLobbyNotice({}, { enabled: true, title: "Casino", content: "**Bienvenue** @!ktga-dice-6", updatedAt: "2100-01-01T00:00:00Z" }, 1000);
  assert.equal(original.updatedAt, "1970-01-01T00:00:01.000Z");
  assert.deepEqual(updateLobbyNotice(original, { ...original, updatedAt: "2100-01-01T00:00:00Z" }, 2000), original);
  const edited = updateLobbyNotice(original, { ...original, content: "# Nouveau contenu" }, 1000);
  assert.equal(Date.parse(edited.updatedAt), 1001);
  assert.notEqual(updateLobbyNotice(edited, { ...edited, enabled: false }, 1000).updatedAt, edited.updatedAt);
});

test("notice limits and visibility are validated; old settings default to hidden", () => {
  assert.deepEqual(normalizeLobbyNotice(), { enabled: false, title: "", content: "", updatedAt: "" });
  for (const value of [null, [], { enabled: "yes", title: "", content: "ok" }, { enabled: true, title: "", content: " " }, { enabled: false, title: "x".repeat(101), content: "" }, { enabled: false, title: "", content: "x".repeat(20001) }]) assert.throws(() => updateLobbyNotice({}, value));
});
