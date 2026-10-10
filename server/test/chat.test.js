import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createChatStore, directChannelId } from "../src/services/chat.js";

test("les conversations directes ont un identifiant stable quel que soit l'ordre", () => {
  assert.equal(directChannelId("alice", "bob"), directChannelId("bob", "alice"));
});

test("les messages sont bornés, ordonnés et marqués comme lus", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "ktga-chat-"));
  const store = createChatStore({ filename: path.join(directory, "chat.sqlite") });
  try {
    store.add({ channelType: "global", channelId: "global", senderId: "alice", content: "Premier" }, 1000);
    store.add({ channelType: "global", channelId: "global", senderId: "bob", content: "Second" }, 2000);
    assert.deepEqual(store.list("global", "global").map((row) => row.content), ["Premier", "Second"]);
    assert.equal(store.unread("alice", [{ channelType: "global", channelId: "global" }])["global:global"], 1);
    store.markRead("alice", "global", "global", 3000);
    assert.equal(store.unread("alice", [{ channelType: "global", channelId: "global" }])["global:global"], 0);
    assert.throws(() => store.add({ channelType: "unknown", channelId: "x", senderId: "alice", content: "Non" }), /INVALID_CHAT_CHANNEL/);
    assert.throws(() => store.add({ channelType: "global", channelId: "global", senderId: "alice", content: "https://example.com" }, 3000), /CHAT_EXTERNAL_LINK/);
    assert.equal(store.list("global", "global").length, 2);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("les compteurs excluent les messages masqués et conservent les messages arrivés après la lecture", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "ktga-chat-read-"));
  const store = createChatStore({ filename: path.join(directory, "chat.sqlite") });
  try {
    const channels = [{ channelType: "direct", channelId: "private" }, { channelType: "room", channelId: "table" }];
    store.add({ ...channels[0], senderId: "bob", content: "Premier message privé" }, 1000);
    store.add({ ...channels[1], senderId: "muted", content: "Message masqué" }, 1000);
    store.add({ ...channels[1], senderId: "alice", content: "Mon message" }, 1500);
    store.add({ ...channels[0], senderId: "bob", content: "Arrivé pendant la lecture" }, 3000);
    store.markRead("alice", "direct", "private", 2000);
    store.markRead("alice", "direct", "private", 500);
    assert.deepEqual(store.unread("alice", channels, ["muted"]), { "direct:private": 1, "room:table": 0 });
    assert.equal(store.unread("alice", channels)["room:table"], 1);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("l'activité distingue les conversations ouvertes des amis sans échange", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "ktga-chat-activity-"));
  const store = createChatStore({ filename: path.join(directory, "chat.sqlite") });
  try {
    const channels = ["opened", "recent", "none"].map((channelId) => ({ channelType: "direct", channelId }));
    store.markRead("alice", "direct", "opened", 1000);
    store.add({ ...channels[1], senderId: "bob", content: "Échange récent" }, 2000);
    const activity = store.conversationActivity("alice", channels);
    assert.deepEqual(activity["direct:opened"], { opened: true, lastMessageAt: "" });
    assert.deepEqual(activity["direct:none"], { opened: false, lastMessageAt: "" });
    assert.equal(activity["direct:recent"].lastMessageAt, new Date(2000).toISOString());
    assert.equal(activity["direct:recent"].opened, true);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});
