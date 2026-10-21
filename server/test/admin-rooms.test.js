import test from "node:test";
import assert from "node:assert/strict";
import { adminRoomList } from "../src/services/admin-rooms.js";
import { createRoomCommands } from "../src/services/room-commands.js";

test("admin room summaries include private and finished tables without game secrets", () => {
  const room = { id: "room", code: "ABC123", name: "Private", gameId: "yahtzee", ownerId: "owner", players: [{ id: "owner", pseudo: "Owner", tokens: 100, cosmetics: {} }],
    passwordHash: "secret", state: { hands: { owner: ["secret"] } }, isPublic: false, finished: false, createdAt: "2026-10-21T10:00:00Z" };
  const db = { users: [{ id: "owner", pseudo: "Owner", email: "private@example.test" }], rooms: [room, { ...room, id: "finished", finished: true }] };
  const result = adminRoomList(db, (user) => user.pseudo);
  assert.equal(result.length, 2);
  assert.equal(result[0].isPublic, false);
  assert.equal(result[0].protected, true);
  assert.equal(result[0].status, "playing");
  assert.equal(result[1].status, "finished");
  assert.deepEqual(result[0].players, [{ id: "owner", pseudo: "Owner", isBot: false }]);
  for (const key of ["state", "passwordHash", "email", "stake"]) assert.equal(result[0][key], undefined);
});

function fixture({ ranked = false, poker = false, finished = false } = {}) {
  const users = [{ id: "owner" }, { id: "admin", admin: true }, { id: "editor", editor: true }, { id: "other" }];
  const room = { id: "room", code: "ABC123", ownerId: "owner", gameId: poker ? "texas-holdem" : "yahtzee", isPublic: false, stake: 10, finished,
    players: [{ id: "owner" }, { id: "bot", isBot: true }], state: { gameId: poker ? "texas-holdem" : "yahtzee" },
    ...(ranked ? { ranked: { roster: [{ id: "owner" }, { id: "bot", isBot: true }] } } : {}) };
  const db = { users, rooms: [room] }, ledger = [], events = [];
  let writes = 0, settlements = 0;
  const command = createRoomCommands({ readDb: () => db, getUser: (id) => users.find((user) => user.id === id),
    addTokens: (_db, userId, amount) => ledger.push({ userId, amount }),
    finishRoomIfNeeded: (target) => { assert.ok(target.ranked.cancelled); target.finished = true; settlements++; },
    cashOutPokerPlayer: (_room, _db, id) => ledger.push({ userId: id, poker: true }),
    writeRoomDb: () => writes++, io: { to: () => ({ emit: (...args) => events.push(args) }) }, broadcastRooms: () => {} }).get("DELETE /api/rooms/:code");
  return { room, db, ledger, events, get writes() { return writes; }, get settlements() { return settlements; }, close(id) {
    let status = 200, data;
    command({ auth: { id, admin: true }, params: { code: "abc123" } }, { status(value) { status = value; return this; }, json(value) { data = value; } });
    return { status, data };
  } };
}

test("only owner or an actual administrator may close a private room", () => {
  const f = fixture();
  for (const id of ["other", "editor", "missing"]) assert.equal(f.close(id).status, 403);
  assert.equal(f.writes, 0);
  assert.equal(f.close("admin").status, 200);
  assert.equal(f.db.rooms.length, 0);
  assert.deepEqual(f.events, [["room-closed", { code: "ABC123" }]]);
  assert.equal(f.close("admin").status, 404);
  assert.equal(f.writes, 1);
  assert.equal(fixture().close("owner").status, 200);
});

test("admin closure cancels ranked play once, refunds humans and preserves the cancellation receipt", () => {
  const f = fixture({ ranked: true });
  assert.equal(f.close("admin").status, 200);
  assert.equal(f.settlements, 1);
  assert.equal(f.room.ranked.cancelled.by, "admin");
  assert.deepEqual(f.ledger, [{ userId: "owner", amount: 10 }]);
  assert.equal(f.room.state.finished, true);
  assert.deepEqual(f.room.state.winners, []);
  assert.equal(f.close("admin").status, 404);
  assert.equal(f.settlements, 1);
  const completed = fixture({ ranked: true, finished: true });
  assert.equal(completed.close("admin").status, 200);
  assert.deepEqual(completed.ledger, []);
  assert.equal(completed.settlements, 0);
});

test("closing poker returns unsettled stacks but never pays settled stacks twice", () => {
  const active = fixture({ poker: true });
  assert.equal(active.close("admin").status, 200);
  assert.equal(active.ledger.length, 2);
  const completed = fixture({ poker: true, finished: true });
  assert.equal(completed.close("admin").status, 200);
  assert.deepEqual(completed.ledger, []);
});
