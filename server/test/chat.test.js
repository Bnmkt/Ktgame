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
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
