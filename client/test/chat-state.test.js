import assert from "node:assert/strict";
import test from "node:test";
import { chatRevision, mergeChatSnapshot } from "../src/components/social/chat-state.js";
const message = (id, createdAt, channelType = "global") => ({ id, createdAt, channelType, channelId: channelType === "global" ? "global" : "private" });
test("a snapshot from before a purge cannot restore deleted messages", () => {
  assert.equal(mergeChatSnapshot([], { revision: 1, channel: { type: "global", id: "global" }, messages: [message("old", "2030")] }, 2), null);
  assert.deepEqual(mergeChatSnapshot([message("old", "9999")], { revision: 2, channel: { type: "global", id: "global" }, messages: [] }, 1), []);
});
test("same-revision snapshots retain a newer socket message, including a timestamp tie", () => {
  const live = message("live", "2026-10-29T10:00:00Z");
  assert.deepEqual(mergeChatSnapshot([live], { revision: 2, channel: { type: "global", id: "global" }, messages: [], readAt: live.createdAt }, 2), [live]);
});
test("global revision changes do not clear direct conversations", () => {
  const direct = message("private", "2026-10-29T10:00:00Z", "direct");
  assert.deepEqual(mergeChatSnapshot([], { channel: { type: "direct", id: "private" }, messages: [direct] }, 20), [direct]);
  assert.equal(chatRevision({ revision: -1 }), 0); assert.equal(chatRevision({ revision: "2" }), 0); assert.equal(chatRevision({ revision: 2 }), 2);
});
