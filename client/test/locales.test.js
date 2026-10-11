import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { catalogs, placeholders, translate, validLocale } from "../src/locales/catalog.js";

const french = JSON.parse(fs.readFileSync(new URL("../src/locales/fr.json", import.meta.url)));
test("French and English use a safe original-text fallback and preserve numeric values", () => {
  assert.equal(translate("en", {}, "Créer une table"), "Create a table");
  assert.equal(translate("fr", {}, "Créer une table"), "Créer une table");
  assert.equal(translate("en", {}, "Texte pas encore traduit"), "Texte pas encore traduit");
  assert.equal(translate("en", { "Créer une table": "" }, "Créer une table"), "Créer une table");
  assert.equal(translate("en", {}, "{value0} joueurs", { value0: 0 }), "0 players");
  assert.equal(translate("en", {}, "{value0} joueurs", { value0: "<script>" }), "<script> players");
  assert.equal(translate("fr", {}, null), null);
  assert.equal(translate("en", {}, "toString"), "toString");
  assert.equal(translate("en", {}, "constructor"), "constructor");
  assert.equal(translate("en", {}, "rank::Maître"), "Master");
  assert.equal(translate("fr", {}, "rank::Maître"), "Maître");
  assert.ok(validLocale("fr") && validLocale("en"));
  assert.ok(!validLocale("../../en") && !validLocale("EN"));
});
test("every bundled English text has a French source and identical interpolation markers", () => {
  for (const [key, value] of Object.entries(catalogs.en)) {
    assert.ok(Object.hasOwn(french, key), key);
    assert.deepEqual(placeholders(value), placeholders(french[key]), key);
  }
  assert.ok(Object.keys(french).length > 4000);
});
