import test from "node:test";
import assert from "node:assert/strict";
import { createHelpStore, normalizeHelpDocument } from "../src/services/help-content.js";
import { defaultHelpEntries, legacyHelpEntries, upgradeDefaultGuides } from "../src/content/help-defaults.js";
import { guideIntroduction } from "../src/content/help-guide.js";
import { progressionGuideEntries, rankedFaqEntries, withProgressionHelp } from "../src/content/help-ranked.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

test("help defaults cover the site and drafts never appear in public documents", () => {
  const store = createHelpStore({ filename: ":memory:" });
  try {
    const doc = store.read();
    assert.ok(doc.entries.filter((entry) => entry.kind === "guide").length >= 10);
    assert.ok(doc.entries.filter((entry) => entry.kind === "faq").length >= 15);
    store.save({ ...doc, entries: doc.entries.map((entry, index) => ({ ...entry, published: index !== 0 })) });
    assert.equal(store.read(true).entries.length, doc.entries.length - 1);
    assert.equal(store.read().revision, 2);
    assert.equal(store.read().launchedAt, doc.launchedAt);
  } finally { store.close(); }
});

test("optional guide scenarios round-trip with one valid answer and bounded choices", () => {
  const guide = defaultHelpEntries.find((entry) => entry.challenge);
  const store = createHelpStore({ filename: ":memory:" });
  try {
    store.save({ ...store.read(), entries: [guide] });
    assert.deepEqual(store.read(true).entries[0].challenge, guide.challenge);
    assert.equal(store.read(true).entries[0].lead, guide.lead);
    for (const changes of [
      { answerId: "missing" }, { options: [guide.challenge.options[0]] },
      { options: Array.from({ length: 5 }, (_, index) => ({ id: String(index), text: "Choix" })) },
      { options: [guide.challenge.options[0], guide.challenge.options[0]] },
      { question: "" }, { explanation: "" },
      { options: [{ id: "one", text: "" }, { id: "two", text: "Choix" }] }
    ]) assert.throws(() => store.save({ entries: [{ ...guide, challenge: { ...guide.challenge, ...changes } }] }));
    assert.equal(store.read().entries.length, 1, "invalid scenarios do not erase existing content");
    store.save({ ...store.read(), entries: [{ ...guide, challenge: null }] });
    assert.equal(store.read().entries[0].challenge, null, "interaction can be removed");
  } finally { store.close(); }
});

test("humanized guide upgrade keeps customized content, publication choices and entry order", () => {
  const entries = structuredClone(legacyHelpEntries);
  entries[0].published = false;
  entries[1].body = "Mon texte personnel.";
  const document = { intro: "Mon introduction.", entries };
  const upgraded = upgradeDefaultGuides(document);
  assert.equal(upgraded.entries[0].title, "Bienvenue, prends place !");
  assert.equal(upgraded.entries[0].published, false);
  assert.deepEqual(upgraded.entries[1], entries[1]);
  assert.equal(upgraded.intro, document.intro);
  assert.deepEqual(upgraded.entries.map((entry) => entry.id), entries.map((entry) => entry.id));
  assert.equal(document.entries[0].title, legacyHelpEntries[0].title, "source is not mutated");
});

test("persisted legacy guide upgrade is one-time and never restarts welcome onboarding", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "ktga-help-upgrade-"));
  const filename = path.join(directory, "help.sqlite");
  let store = createHelpStore({ filename });
  try {
    const user = { id: "reader", createdAt: new Date(Date.now() + 10000).toISOString() };
    store.dismiss(user.id);
    store.close(); store = null;
    const db = new DatabaseSync(filename);
    const settings = JSON.parse(db.prepare("SELECT data FROM help_settings WHERE id=1").get().data);
    delete settings.guideFormatVersion;
    db.prepare("UPDATE help_settings SET data=? WHERE id=1").run(JSON.stringify(settings));
    const insert = db.prepare("UPDATE help_entries SET data=? WHERE id=?");
    for (const entry of legacyHelpEntries) insert.run(JSON.stringify(entry), entry.id);
    db.close();
    store = createHelpStore({ filename });
    assert.equal(store.read().guideFormatVersion, 1);
    assert.equal(store.read().entries[0].title, "Bienvenue, prends place !");
    assert.equal(store.needsWelcome(user), false);
    const revision = store.read().revision;
    store.close();
    store = createHelpStore({ filename });
    assert.equal(store.read().revision, revision);
    assert.equal(store.read().intro, guideIntroduction);
  } finally {
    store?.close();
    assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep));
    rmSync(directory, { recursive: true, force: true });
  }
});
test("new accounts see onboarding once, including after verification, not again after content edits", () => {
  const store = createHelpStore({ filename: ":memory:", now: () => Date.parse("2026-10-04T10:00:00Z") });
  try {
    const user = { id: "new", createdAt: "2026-10-04T10:00:01Z" };
    assert.equal(store.needsWelcome(user), true);
    assert.equal(store.needsWelcome({ ...user, createdAt: "2026-10-01T10:00:00Z" }), false);
    assert.equal(store.needsWelcome({ ...user, guest: true }), false);
    store.dismiss(user.id);
    store.save(store.read());
    assert.equal(store.needsWelcome(user), false);
    store.save({ ...store.read(), welcomeEnabled: false });
    assert.equal(store.needsWelcome({ ...user, id: "other" }), false);
  } finally { store.close(); }
});
test("help validation bounds content and rejects tracking images, invalid identities and empty sections", () => {
  const entry = { id: "one", kind: "faq", title: "Question", body: "Réponse", image: "/guides/account.png" };
  assert.equal(normalizeHelpDocument({ entries: [entry] }).entries[0].image, entry.image);
  for (const image of ["https://example.com/image.png", "data:image/png;base64,test", "/guides/../secret.png", "javascript:alert(1)"]) assert.throws(() => normalizeHelpDocument({ entries: [{ ...entry, image }] }));
  assert.throws(() => normalizeHelpDocument({ entries: [entry, entry] }));
  assert.throws(() => normalizeHelpDocument({ entries: [{ ...entry, title: "" }] }));
  assert.throws(() => normalizeHelpDocument({ entries: Array.from({ length: 101 }, () => entry) }));
  const store = createHelpStore({ filename: ":memory:" });
  try {
    const before = store.read();
    assert.throws(() => store.save({ entries: [{ ...entry, kind: "unknown" }] }));
    assert.deepEqual(store.read(), before, "invalid updates are atomic");
    assert.throws(() => store.upload(Buffer.from("not-an-image"), "image/png"));
    assert.equal(store.image("../../passwords"), null);
  } finally { store.close(); }
});

test("ranked help adds a dedicated topic and illustrated interactive progression chapters", () => {
  const store = createHelpStore({ filename: ":memory:" });
  try {
    const entries = store.read(true).entries;
    assert.equal(entries.filter((entry) => rankedFaqEntries.some((ranked) => ranked.id === entry.id)).length, 17);
    for (const guide of progressionGuideEntries) {
      const saved = entries.find((entry) => entry.id === guide.id);
      assert.ok(saved.published);
      assert.match(saved.image, /^\/guides\/[a-z-]+\.png$/);
      assert.ok(saved.imageAlt);
      assert.equal(saved.challenge.options.length, 3);
      assert.ok(saved.challenge.options.some((option) => option.id === saved.challenge.answerId));
    }
    const content = JSON.stringify([...rankedFaqEntries, ...progressionGuideEntries]);
    assert.ok(!/\belo\b|chiffres? priv[ée]|classement chiffr[ée]/i.test(content));
    assert.ok(content.includes("I → II → III"));
    assert.ok(content.includes("niveau 101"));
  } finally { store.close(); }
});

test("ranked additions preserve custom text, hidden entries, images, settings and previous ordering", () => {
  const customized = { ...rankedFaqEntries[0], body: "Ma réponse personnelle.", published: false, image: "/guides/account.png" };
  const guide = { ...progressionGuideEntries[0], title: "Mon chapitre", body: "Mon contenu." };
  const document = { title: "Mon guide", intro: "Mon introduction", welcomeEnabled: false, entries: [legacyHelpEntries[0], customized, guide, { ...legacyHelpEntries.find((entry) => entry.id === "faq-join"), body: "Ma réponse sur les tables." }] };
  const before = structuredClone(document);
  const added = withProgressionHelp(document);
  assert.deepEqual(document, before);
  for (const entry of document.entries) assert.deepEqual(added.entries.find((row) => row.id === entry.id), entry);
  assert.deepEqual(added.entries.filter((entry) => document.entries.some((old) => old.id === entry.id)), document.entries);
  assert.equal(added.welcomeEnabled, false);
  assert.deepEqual(withProgressionHelp(added), added, "reapplying cannot duplicate chapters or questions");
});

test("an existing equivalent question with an admin-generated identifier is not duplicated", () => {
  const question = { ...rankedFaqEntries[0], id: "custom-question", title: `  ${rankedFaqEntries[0].title.toLocaleUpperCase("fr")}  `, body: "Texte modifié." };
  const document = withProgressionHelp({ entries: [question] });
  assert.equal(document.entries.filter((entry) => entry.id === rankedFaqEntries[0].id).length, 0);
  assert.deepEqual(document.entries.find((entry) => entry.id === "custom-question"), question);
});
