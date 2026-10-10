import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createPatchnoteStore, suggestedVersionGroup } from "../src/services/patchnotes.js";
import { DEFAULT_RANKS } from "../src/services/ranked.js";
import { patchnote021 } from "../scripts/prepare-patchnote-0.2.1.mjs";

test("les versions sont regroupees par branche majeure et mineure", () => {
  assert.equal(suggestedVersionGroup("1.1.2"), "1.1");
  assert.equal(suggestedVersionGroup("v2.4.0-beta.1"), "2.4");
  assert.equal(suggestedVersionGroup("summer-release"), "summer");
});

test("la version courante peut etre modifiee et sert de valeur proposee", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ktga-patchnotes-version-"));
  const filename = path.join(directory, "patchnotes.sqlite");
  const store = createPatchnoteStore({ filename, currentVersion: "1.2.3" });
  assert.equal(store.currentVersion, "1.2.3");
  assert.equal(store.setCurrentVersion("1.3.0"), "1.3.0");
  assert.equal(store.currentVersion, "1.3.0");
  assert.equal(store.create({}, "editor-1").version, "1.3.0");
  assert.throws(() => store.setCurrentVersion("version avec espaces"), /caractères invalides/);
  store.close();
  const reopened = createPatchnoteStore({ filename, currentVersion: "9.9.9" });
  assert.equal(reopened.currentVersion, "1.3.0");
  reopened.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

test("les patchnotes se publient sous forme de blocs normalises sans exposer les reactions", () => {
  const store = createPatchnoteStore({ filename: ":memory:", currentVersion: "1.2.3" });
  const draft = store.create({}, "editor-1");
  assert.equal(draft.version, "1.2.3");
  assert.equal(store.list().length, 0);
  assert.throws(() => store.update(draft.id, { status: "published", blocks: [] }), /au moins un bloc/);
  const published = store.update(draft.id, { status: "published", summary: "Une mise à jour.", blocks: [
    { type: "section", title: "Nouveautés" },
    { type: "change", category: "game", title: "Belote", content: "Nouvelle table." },
    { type: "quote", content: "Enfin !", metadata: { attribution: "La communauté" } }
  ] });
  assert.equal(published.blocks.length, 3);
  store.react(draft.id, "player-1", 1);
  store.react(draft.id, "player-2", -1);
  assert.equal(store.list()[0].reactions, undefined);
  assert.deepEqual(store.list({ includeDrafts: true, includeReactions: true })[0].reactions, { up: 1, down: 1, score: 0 });
  assert.deepEqual(store.reaction(draft.id, "player-1"), { value: 1 });
  store.close();
});

test("une image televersee est liee a sa patchnote et supprimee avec elle", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ktga-patchnotes-"));
  const store = createPatchnoteStore({ filename: ":memory:", uploadDirectory: directory });
  const note = store.create({ version: "1.1.1a" }, "editor-1");
  const image = store.addAttachment(note.id, { body: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), mimeType: "image/png", originalName: "capture.png" });
  assert.ok(fs.existsSync(store.attachment(image.id).path));
  store.update(note.id, { blocks: [{ type: "image", metadata: { attachmentId: image.id, alt: "Capture" } }] });
  assert.equal(store.get(note.id, { includeDrafts: true }).blocks[0].metadata.attachmentId, image.id);
  assert.equal(store.remove(note.id), true);
  assert.equal(fs.readdirSync(directory).length, 0);
  store.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

test("un brouillon date reste prive et conserve sa date lors de la publication manuelle", () => {
  const store = createPatchnoteStore({ filename: ":memory:", currentVersion: "0.2.0", now: () => Date.parse("2026-10-06T12:00:00Z") });
  try {
    const note = store.create({ version: "0.2.1" }, "editor-1");
    const draft = store.update(note.id, { publishedAt: "2026-10-08T16:00:00+02:00", blocks: [{ type: "paragraph", content: "Nouveautés." }] });
    assert.equal(draft.status, "draft");
    assert.equal(draft.publishedAt, "2026-10-08T14:00:00.000Z");
    assert.equal(store.get(note.id), null);
    assert.deepEqual(store.list(), []);
    assert.equal(store.currentVersion, "0.2.0");
    const edited = store.update(note.id, { summary: "Résumé modifié." });
    assert.equal(edited.publishedAt, draft.publishedAt);
    assert.equal(store.update(note.id, { status: "published" }).publishedAt, draft.publishedAt);
    assert.equal(store.list().length, 1);
    assert.equal(store.currentVersion, "0.2.0");
  } finally { store.close(); }
});

test("la date peut etre corrigee ou effacee sans accepter une date ambigue ou invalide", () => {
  const store = createPatchnoteStore({ filename: ":memory:", now: () => Date.parse("2026-10-06T12:00:00Z") });
  try {
    const note = store.create({ version: "0.2.1" }, "editor-1");
    const date = "2026-10-08T14:00:00.000Z";
    store.update(note.id, { publishedAt: date, blocks: [{ type: "paragraph", content: "Nouveautés." }] });
    for (const invalid of ["demain", "2026-10-08", "2026-10-08T16:00:00", "2026-99-08T14:00:00Z", "2026-02-29T14:00:00Z", "2026-04-31T14:00:00Z", 42]) {
      assert.throws(() => store.update(note.id, { publishedAt: invalid }), /date de publication/);
      assert.equal(store.get(note.id, { includeDrafts: true }).publishedAt, date);
    }
    assert.equal(store.update(note.id, { publishedAt: "" }).publishedAt, null);
    assert.equal(store.update(note.id, { status: "published" }).publishedAt, "2026-10-06T12:00:00.000Z");
    assert.equal(store.update(note.id, { publishedAt: date }).publishedAt, date);
  } finally { store.close(); }
});

test("le brouillon 0.2.1 presente 26 insignes sans seuils de classement ni publication automatique", () => {
  const image = "a".repeat(64);
  const ranks = DEFAULT_RANKS.map((rank) => ({ ...rank, insigniaImage: image, divisionInsignia: rank.divisions === 3 ? Object.fromEntries(["I", "II", "III"].map((division) => [division, { insigniaImage: image }])) : {} }));
  const note = patchnote021(ranks);
  assert.equal(note.status, "draft");
  assert.equal(note.publishedAt, "2026-10-08T14:00:00.000Z");
  assert.equal((JSON.stringify(note).match(/insignia-images/g) ?? []).length, 26);
  assert.ok(!/\belo\b/i.test(JSON.stringify(note)));
  assert.ok(note.blocks.every((block) => (block.content?.length ?? 0) <= 4000));
  assert.ok(note.blocks.some((block) => block.content?.includes("**I → II → III**")));
  assert.throws(() => patchnote021(DEFAULT_RANKS), /Insigne manquant/);
});

test("la duplication copie et remappe les images sans partager les fichiers", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ktga-patchnotes-copy-"));
  const store = createPatchnoteStore({ filename: ":memory:", uploadDirectory: directory });
  const source = store.create({ version: "2.1.0" }, "editor-1");
  const image = store.addAttachment(source.id, { body: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), mimeType: "image/png", originalName: "capture.png" });
  store.update(source.id, { blocks: [{ type: "image", metadata: { attachmentId: image.id, alt: "Capture" } }] });

  const copy = store.duplicate(source.id, "editor-2", "2.1.0a");
  const copiedImageId = copy.blocks[0].metadata.attachmentId;
  assert.notEqual(copiedImageId, image.id);
  assert.ok(fs.existsSync(store.attachment(image.id).path));
  assert.ok(fs.existsSync(store.attachment(copiedImageId).path));
  assert.equal(fs.readdirSync(directory).length, 2);

  store.remove(copy.id);
  assert.ok(fs.existsSync(store.attachment(image.id).path));
  assert.equal(fs.readdirSync(directory).length, 1);
  store.close();
  fs.rmSync(directory, { recursive: true, force: true });
});
