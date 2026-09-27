import assert from "node:assert/strict";
import test from "node:test";
import { friendRoomPresence } from "../src/services/friend-presence.js";

const room = { id: "room", code: "ABC123", name: "Table", gameId: "yahtzee", isPublic: true, players: [{ id: "friend" }], passwordHash: "never-expose" };
test("friend presence requires both membership and a live connection", () => {
  assert.equal(friendRoomPresence([room], "friend", { id: "viewer" }, () => false).inRoom, false);
  assert.equal(friendRoomPresence([room], "other", { id: "viewer" }, () => true).inRoom, false);
  assert.equal(friendRoomPresence([{ ...room, finished: true }], "friend", { id: "viewer" }, () => true).inRoom, false);
  const result = friendRoomPresence([room], "friend", { id: "viewer" }, () => true);
  assert.equal(result.activeRoom.code, "ABC123");
  assert.equal(result.activeRoom.hasPassword, true);
  assert.equal("passwordHash" in result.activeRoom, false);
});
test("private table codes are visible only to invited or seated friends", () => {
  const rooms = [{ ...room, isPublic: false, state: {} }];
  assert.deepEqual(friendRoomPresence(rooms, "friend", { id: "viewer" }, () => true), { inRoom: true, activeRoom: null });
  assert.equal(friendRoomPresence(rooms, "friend", { id: "viewer", roomInvites: [{ code: "ABC123" }] }, () => true).activeRoom.playing, true);
});
