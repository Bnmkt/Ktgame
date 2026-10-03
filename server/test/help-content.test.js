import test from "node:test";
import assert from "node:assert/strict";
import { createHelpStore, normalizeHelpDocument } from "../src/services/help-content.js";

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
