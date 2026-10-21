import test from "node:test";
import assert from "node:assert/strict";
import { ROOM_INACTIVITY_MS, lastRoomActionAt, roomIsInactive, touchRoom, closeRoom } from "../src/services/room-lifecycle.js";

test("inactivity uses accepted actions, not presence, bot logs, or an arbitrary client timestamp", () => {
  const now = Date.now();
  const room = { createdAt: new Date(now - 2 * ROOM_INACTIVITY_MS).toISOString(), players: [{ id: "human" }, { id: "bot", isBot: true }],
    state: { logs: [{ actorId: "human", at: new Date(now - 1000).toISOString() }, { actorId: "bot", at: new Date(now).toISOString() }] } };
  assert.equal(lastRoomActionAt(room), now - 1000);
  touchRoom(room, now - ROOM_INACTIVITY_MS);
  assert.equal(roomIsInactive(room, now - 1), false);
  assert.equal(roomIsInactive(room, now), true);
  touchRoom(room, now);
  assert.equal(roomIsInactive(room, now), false);
});

function fixture({ finished = false, waiting = false, ranked = false, gameId = "yahtzee" } = {}) {
  const user = { id: "human" }, bot = { id: "bot", isBot: true }, messages = [], ledger = [], notifications = [], writes = [];
  const room = { id: "room", code: "ABC123", name: "Test", gameId, stake: 10, finished, players: [user, bot],
    state: waiting ? null : { gameId, finished, bets: { human: 40 } }, ...(ranked ? { ranked: { roster: [user, bot] } } : {}) };
  const db = { rooms: [room] };
  let left = 0;
  const socket = { data: { roomId: room.id }, leave() { left++; } }, presence = new Map([[room.id, new Set(["socket"])]]);
  const dependencies = { addTokens: (_db, id, amount) => ledger.push({ id, amount }), getUser: () => user,
    cashOutPokerPlayer(target) { ledger.push({ poker: true }); target.players = []; },
    finishRoomIfNeeded(target) { target.finished = true; },
    pushNotification: (_user, value) => notifications.push(value), writeRoomDb: () => writes.push(true), broadcastRooms() {}, roomPresence: presence,
    io: { sockets: { sockets: new Map([["socket", socket]]) }, to: () => ({ emit: (event, payload) => messages.push({ event, payload }) }) } };
  return { room, db, ledger, messages, notifications, writes, socket, presence, get left() { return left; }, close: () => closeRoom(room, db, dependencies, { reason: "inactivity" }) };
}

test("a completed table closes quietly without modifying settled balances", () => {
  const f = fixture({ finished: true }); f.close();
  assert.deepEqual(f.ledger, []); assert.deepEqual(f.notifications, []);
  assert.deepEqual(f.messages, [{ event: "room-closed", payload: { code: "ABC123", reason: "inactivity", unfinished: false } }]);
  assert.equal(f.db.rooms.length, 0); assert.equal(f.presence.size, 0); assert.equal(f.socket.data.roomId, undefined); assert.equal(f.left, 2);
});

test("an unfinished classic table refunds committed stakes and notifies human players", () => {
  const f = fixture(); f.close();
  assert.deepEqual(f.ledger, [{ id: "human", amount: 10 }]);
  assert.equal(f.notifications.length, 1); assert.equal(f.notifications[0].type, "room-inactivity");
  assert.equal(f.messages[0].payload.unfinished, true); assert.equal(f.writes.length, 1);
  assert.equal(f.close(), false); assert.equal(f.notifications.length, 1); assert.equal(f.ledger.length, 1);
});

test("waiting rooms never receive uncharged stakes, and blackjack returns pending bets", () => {
  const waiting = fixture({ waiting: true }); waiting.close(); assert.deepEqual(waiting.ledger, []);
  const blackjack = fixture({ gameId: "blackjack" }); blackjack.close(); assert.deepEqual(blackjack.ledger, [{ id: "human", amount: 50 }]);
});

test("ranked inactivity cancels the match without winners, and poker closure still notifies its former roster", () => {
  const ranked = fixture({ ranked: true }); ranked.close();
  assert.equal(ranked.room.ranked.cancelled.by, "system"); assert.deepEqual(ranked.room.state.winners, []);
  assert.deepEqual(ranked.ledger, [{ id: "human", amount: 10 }]);
  const poker = fixture({ gameId: "texas-holdem" }); poker.close();
  assert.equal(poker.notifications.length, 1);
});
