import test from "node:test";
import assert from "node:assert/strict";
import { groupHelpEntries } from "../src/features/help/content.js";

test("FAQ groups categories once, preserving question and category order without mutating entries", () => {
  const entries = [
    { id: "one", category: "Compte" }, { id: "two", category: "Tables" },
    { id: "three", category: "Compte" }, { id: "four", category: "" }
  ];
  const groups = groupHelpEntries(entries);
  assert.deepEqual(groups.map((group) => group.category), ["Compte", "Tables", "Général"]);
  assert.deepEqual(groups[0].entries.map((entry) => entry.id), ["one", "three"]);
  assert.equal(entries[1].id, "two");
  assert.equal(entries[3].category, "");
});

test("empty FAQ searches leave no orphan section titles", () => {
  assert.deepEqual(groupHelpEntries([]), []);
  assert.equal(groupHelpEntries([{ category: " Tables " }, { category: "Tables" }]).length, 1);
});
