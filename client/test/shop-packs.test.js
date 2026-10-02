import test from "node:test";
import assert from "node:assert/strict";
import { shopPackDefinitions, shopPackName } from "../src/utils/shop-packs.js";

test("pack definitions retain built-in labels and discover administrator packs", () => {
  const definitions = shopPackDefinitions([
    { id: "old", packs: ["japanese-traditional"] },
    { id: "new-a", packs: ["soiree-neon"], packName: "Soirée Néon" },
    { id: "new-b", packs: ["soiree-neon"], packName: "Nom ignoré après le premier" }
  ]);
  assert.equal(definitions["japanese-traditional"].name, "Japon traditionnel");
  assert.equal(definitions["soiree-neon"].name, "Soirée Néon");
  assert.deepEqual(Object.keys(definitions), ["japanese-traditional", "soiree-neon"]);
  assert.equal(shopPackName("pack-sans-libelle"), "Pack sans libelle");
});
