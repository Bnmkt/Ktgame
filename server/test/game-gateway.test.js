import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createGameGateway } from "../src/services/game-gateway.js";
import { createGameRoomKernel } from "../src/services/game-room-kernel.js";
import { games } from "../src/games/shared.js";
import { normalizeProgressionConfig } from "../src/services/game-progression.js";

test("a pre-commit account conflict retries from fresh data and charges only once", async () => {
  const user = { id: "player", pseudo: "Player", tokens: 10000, active: true, email: "private@example.test", passwordHash: "private-hash",
    profile: { birthDate: "1990-01-01", privateNotes: "private-profile" }, registrationAuthorization: { ageBand: "adult", code: "private-code" },
    parentalAccess: { status: "approved", parentEmail: "parent@example.test", approvalToken: "private-token" } };
  const db = { users: [user], rooms: [], history: { pending: [] }, transactions: { pending: [] } }, ledger = [];
  let revision = 0, conflictOnce = false, updates = 0;
  class Transport extends EventEmitter {
    constructor() { super(); this.kernel = createGameRoomKernel(); }
    async request(command, payload) {
      if (command === "prepare") {
        const account = payload.context.users.find((row) => row.id === user.id);
        assert.equal(account.email, undefined); assert.equal(account.passwordHash, undefined);
        assert.equal(account.profile.privateNotes, undefined); assert.equal(account.registrationAuthorization.code, undefined);
        assert.equal(account.parentalAccess.parentEmail, undefined); assert.equal(account.parentalAccess.approvalToken, undefined);
      }
      const result = await this.kernel[command](structuredClone(payload));
      if (conflictOnce && command === "prepare") { conflictOnce = false; user.tokens += 100; revision++; }
      return structuredClone(result);
    }
    health() { return {}; }
    async close() { this.closed = true; }
  }
  const gateway = createGameGateway({ size: 1, transportFactory: () => new Transport(), readDb: () => db,
    updateDb: (mutator) => { mutator(db); updates++; revision++; }, revision: () => revision, settingsRevision: () => "1",
    configuration: () => ({ id: "1", games, platform: { minRoomStake: 10, botThinkingSeconds: 0, turnEndDelaySeconds: 1,
      roundResultsSeconds: 0, minorRestrictions: [], gameProgression: normalizeProgressionConfig() } }),
    getUser: (id) => db.users.find((row) => row.id === id), sessions: new Map(), roomPlayerFor: (row) => ({ id: row.id, pseudo: row.pseudo, tokens: row.tokens }),
    addTokens: (_db, id, amount) => { assert.equal(id, user.id); user.tokens += amount; ledger.push(amount); },
    processAchievementEvent: () => [], unlockEligibleAchievements: () => [], appendRoomAchievementUnlocks: () => {},
    triggerRandomAchievement: () => {}, finishRoomIfNeeded: () => {}, consumeRoomAchievementUnlocks: () => [],
    roomWriteScope: () => ({ users: [user.id], rooms: [] }), sanitizeRoom: (room) => ({ code: room.code, finished: room.finished }),
    emitRoomUpdate: () => {}, broadcastRooms: () => {}, grantSpectatorAccess: () => {}, maySpectate: () => false,
    ensureUserSocial: () => {}, invalidateInbox: () => {}, io: { sockets: { sockets: new Map() } }, roomPresence: new Map() });
  try {
    await gateway.execute("room", "POST /api/rooms", { actor: { id: user.id }, body: { gameId: "yahtzee", name: "Concurrent account" } });
    conflictOnce = true;
    const started = await gateway.execute("room", "POST /api/rooms/:code/start", { actor: { id: user.id }, params: { code: db.rooms[0].code }, body: {} });
    assert.equal(started.status, 200); assert.equal(user.tokens, 10090); assert.deepEqual(ledger, [-10]);
    assert.equal(updates, 2); assert.equal(db.rooms[0].gameWorker.version, 2);
  } finally { await gateway.close(); }
});
