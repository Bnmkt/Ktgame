import test from "node:test";
import assert from "node:assert/strict";
import { roomSoundEvent, roomSoundSnapshot } from "../src/components/game/room-sound-events.js";

const at = Date.now();
const room = (logs = [], match = "a") => ({ code: "ABC", activityMatchId: match, state: { finished: false, logs } });
test("room audio skips initial history and reconnects, but announces a real game start", () => {
  assert.equal(roomSoundEvent(null, room()), null);
  assert.equal(roomSoundEvent(roomSoundSnapshot({ code: "ABC" }), room()), "start");
  assert.equal(roomSoundEvent(roomSoundSnapshot(room()), room([], "b")), "start");
  const old = { id: "old", at: new Date(at - 60000).toISOString(), cue: "dice" };
  assert.equal(roomSoundEvent(roomSoundSnapshot(room()), room([old]), at), null);
});
test("identical rolls have distinct log ids, not duplicate HTTP/socket effects", () => {
  const first = { id: "roll1", at: new Date(at).toISOString(), cue: "dice" };
  const second = { ...first, id: "roll2" };
  assert.equal(roomSoundEvent(roomSoundSnapshot(room()), room([first]), at), "dice");
  assert.equal(roomSoundEvent(roomSoundSnapshot(room([first])), room([first]), at), null);
  assert.equal(roomSoundEvent(roomSoundSnapshot(room([first])), room([first, second]), at), "dice");
});
test("one cue per update and no cue for unrelated score or settings changes", () => {
  const logs = ["card", "card"].map((cue, index) => ({ id: String(index), cue, at: new Date(at).toISOString() }));
  assert.equal(roomSoundEvent(roomSoundSnapshot(room()), room(logs), at), "card");
  assert.equal(roomSoundEvent(roomSoundSnapshot(room(logs)), room([...logs, { id: "score", type: "score" }]), at), null);
});
