import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createLocaleStore } from "../src/services/locales.js";

test("locale files persist independently, guard concurrent edits, and retain placeholders", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ktga-locales-test-"));
  try {
    let store = await createLocaleStore({ directory });
    let snapshot = store.read("en");
    const originalFrench = store.read("fr").revision;
    assert.equal(store.publicRead("en").messages["Créer une table"], undefined, "bundled defaults are not sent repeatedly");
    const saved = await store.save("en", { revision: snapshot.revision, messages: { "Créer une table": "Open a table", "{value0} joueurs": "Players: {value0}" } });
    assert.equal(saved.messages["Créer une table"], "Open a table");
    assert.equal(store.read("fr").revision, originalFrench);
    await assert.rejects(store.save("en", { revision: snapshot.revision, messages: { "Créer une table": "Lost edit" } }), { status: 409 });
    await assert.rejects(store.save("en", { revision: saved.revision, messages: { "{value0} joueurs": "Missing variable" } }), /variables/);
    await assert.rejects(store.save("en", { revision: saved.revision, messages: { "Nouveau texte": "New text" } }), /inconnu/);
    await assert.rejects(store.save("en", { revision: saved.revision, messages: JSON.parse('{"__proto__":"polluted"}'), allowNew: true }), /inconnu/);
    await assert.rejects(store.save("en", { revision: saved.revision, messages: Object.fromEntries(Array.from({ length: 10001 }, (_, index) => [`Texte ${index}`, "Text"])), allowNew: true }), /trop de textes/);
    const accepted = await store.save("en", { revision: saved.revision, messages: { "Nouveau texte": "New text" }, allowNew: true });
    assert.equal(store.sources["Nouveau texte"], "Nouveau texte");
    const parallel = await Promise.allSettled([store.save("en", { revision: accepted.revision, messages: { "Créer une table": "First" } }), store.save("en", { revision: accepted.revision, messages: { "Créer une table": "Second" } })]);
    assert.equal(parallel.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(parallel.find((result) => result.status === "rejected").reason.status, 409);
    store = await createLocaleStore({ directory });
    assert.equal(store.read("en").messages["Créer une table"], "First");
    assert.equal(store.sources["Nouveau texte"], "Nouveau texte");
    const reset = await store.save("en", { revision: store.read("en").revision, messages: { "Créer une table": "" } });
    assert.equal(reset.messages["Créer une table"], "");
    assert.equal(store.publicRead("en").messages["Créer une table"], "");
    const restored = await store.save("en", { revision: reset.revision, messages: { "Créer une table": null } });
    assert.equal(restored.messages["Créer une table"], "Create a table");
    const publicBefore = store.publicRead("en").revision;
    await store.save("fr", { revision: store.read("fr").revision, messages: { "Créer une table": "Ouvrir une table" } });
    assert.notEqual(store.publicRead("en").revision, publicBefore);
    assert.equal(store.publicRead("en").fallback["Créer une table"], "Ouvrir une table");
    const files = await fs.readdir(directory);
    assert.deepEqual(files.sort(), ["en.json", "fr.json"]);
    assert.throws(() => store.read("../en"), /Langue/);
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith("ktga-locales-test-"));
    await fs.rm(directory, { recursive: true, force: true });
  }
});
