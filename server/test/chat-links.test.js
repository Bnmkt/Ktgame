import assert from "node:assert/strict";
import test from "node:test";
import { assertChatLinks, describeChatLinks, detectChatLinks } from "../src/services/chat-links.js";

test("chat accepts only public KTGA links and protects account secrets", () => {
  for (const value of ["**Salut**", "https://www.ktga.me/profil", "ktga.me/shop", "www.ktga.me/table/AB1234", "[Profil](https://www.ktga.me/profil)"])
    assert.doesNotThrow(() => assertChatLinks(value));
  for (const value of ["https://example.com", "example.org/test", "www.example.test", "//example.com", "https://ktga.me.example.com/profil", "https://ktga.me@evil.test", "https://evil.test@ktga.me", "https://ktga.me:9999", "https://api.ktga.me/api/me", "ftp://ktga.me", "javascript:alert(1)", "https://www.ktga.me/?reset-password=private", "https://www.ktga.me/?token=private", "https://ktga.me\\@evil.test"]) assert.throws(() => assertChatLinks(value), /CHAT_EXTERNAL_LINK/, value);
  assert.equal(detectChatLinks("Voir https://www.ktga.me/profil.")[0].pathname, "/profil");
});

test("table descriptions respect each reader's permissions", () => {
  const data = { rooms: [{ id: "id", code: "AB1234", ownerId: "alice", name: "Partie privee" }], users: [{ id: "alice", pseudo: "login", profile: { displayName: "Alice" } }] };
  assert.equal(describeChatLinks("https://www.ktga.me/table/AB1234", data)[0].label, "Table de jeu");
  const visible = describeChatLinks("https://www.ktga.me/table/AB1234", { ...data, canSeeRoom: () => true })[0];
  assert.equal(visible.label, "Table de Alice");
  assert.equal(visible.href, "https://www.ktga.me/table/AB1234");
  assert.equal(describeChatLinks("https://www.ktga.me/profil")[0].label, "Profil");
  assert.equal(describeChatLinks("https://www.ktga.me/?room=AB1234", { ...data, canSeeRoom: () => true })[0].label, "Table de Alice");
});

test("closed, finished and missing tables have no actionable link", () => {
  const room = { id: "room-id", code: "AB1234", finished: true, name: "Private name" };
  for (const suffix of ["/table/AB1234", "/observer/AB1234", "/table/room-id", "/?room=AB1234"]) {
    for (const rooms of [[], [room]]) {
      const link = describeChatLinks(`https://www.ktga.me${suffix}`, { rooms, canSeeRoom: () => true })[0];
      assert.equal(link.label, "Partie terminée");
      assert.equal(link.active, false);
      assert.equal(link.href, null);
      assert.equal(link.detail, "");
    }
  }
  assert.equal(describeChatLinks("https://www.ktga.me/table/AB1234", { rooms: [{ ...room, finished: false }] })[0].active, true);
});

test("bug identifiers and patchnote versions remain visible in link cards", () => {
  assert.equal(describeChatLinks("https://www.ktga.me/bugs/1842")[0].label, "BUG 1842");
  for (const suffix of ["/patchnotes?version=0.2.1", "/patchnotes/0.2.1"]) {
    const link = describeChatLinks(`https://www.ktga.me${suffix}`)[0];
    assert.equal(link.label, "Patchnote 0.2.1");
    assert.equal(link.href, "https://www.ktga.me/patchnotes?version=0.2.1");
    assert.equal(link.path, suffix);
  }
  assert.equal(describeChatLinks("https://www.ktga.me/patchnotes")[0].label, "Patchnotes");
  assert.equal(describeChatLinks("https://www.ktga.me/bugs")[0].label, "Signalements de bugs");
});
