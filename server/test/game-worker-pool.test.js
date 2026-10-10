import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createGameWorkers } from "../src/services/game-workers.js";
import { createGameRoomKernel } from "../src/services/game-room-kernel.js";
import { games } from "../src/games/shared.js";
import { normalizeProgressionConfig } from "../src/services/game-progression.js";

const configuration = { id: "1", games, platform: { minRoomStake: 10, minPokerBuyIn: 100, pokerDefaultBigBlind: 10, pokerTurnSeconds: 300,
  botThinkingSeconds: 0, turnEndDelaySeconds: 1, roundResultsSeconds: 0, minorRestrictions: [], gameProgression: normalizeProgressionConfig() } };
function fixture(options = {}) {
  let room, commits = 0, balance = 10000;
  const transports = [];
  class Transport extends EventEmitter {
    constructor() { super(); this.kernel = createGameRoomKernel(); this.closed = false; transports.push(this); }
    async request(operation, payload) {
      if (this.closed) throw Object.assign(new Error("Stopped"), { code: "GAME_UNAVAILABLE" });
      if (this.pause && operation === "prepare") await this.pause;
      const result = await this.kernel[operation](structuredClone(payload));
      if (this.loseCommit && operation === "commit") { this.loseCommit = false; throw Object.assign(new Error("Lost acknowledgement"), { code: "GAME_TIMEOUT" }); }
      return structuredClone(result);
    }
    health() { return { status: this.closed ? "stopped" : "healthy" }; }
    async close() { this.closed = true; }
  }
  const pool = createGameWorkers({ size: 1, ...options, transportFactory: () => new Transport(), configuration: () => configuration,
    snapshot: () => room, context: () => ({ payload: { actor: { id: "player" }, users: [{ id: "player", pseudo: "Player", tokens: balance, active: true, profile: { birthDate: "1990-01-01" } }] }, guard: {} }),
    commit({ result, commandId, epoch, workerId }) {
      commits++; room = structuredClone(result.room);
      for (const effect of result.effects) if (effect.kind === "tokens") balance += effect.amount;
      if (room) room.gameWorker = { version: result.version, commandId, epoch, workerId };
      return {};
    } });
  return { pool, transports, get room() { return room; }, get commits() { return commits; }, get balance() { return balance; },
    create: () => pool.execute("room", "POST /api/rooms", { body: { gameId: "yahtzee", name: "Pool test" } }) };
}
test("lost post-transaction acknowledgment recovers one owner without charging twice", async () => {
  const f = fixture();
  try {
    await f.create(); const old = f.transports[0]; old.loseCommit = true;
    const input = { params: { code: f.room.code } };
    assert.equal((await f.pool.execute("room", "POST /api/rooms/:code/start", input, { commandId: "stake-once" })).status, 200);
    assert.equal(f.balance, 9990); assert.equal(f.commits, 2); assert.equal(old.closed, true);
    const retried = await f.pool.execute("room", "POST /api/rooms/:code/start", input, { commandId: "stake-once" });
    assert.equal(retried.duplicate, true); assert.equal(f.balance, 9990); assert.equal(f.commits, 2);
    assert.equal(f.transports.length, 2); assert.notEqual(f.pool.owner("room").epoch, f.room.gameWorker.epoch);
    assert.equal(f.pool.health().rooms, 1);
    assert.equal(f.pool.health().recoveries, 1);
  } finally { await f.pool.close(); }
});
test("room commands are serial and queue limits reject overload", async () => {
  const f = fixture({ maxPerRoom: 2 });
  try {
    await f.create(); let release;
    f.transports[0].pause = new Promise((resolve) => { release = resolve; });
    const input = { params: { code: f.room.code } };
    const first = f.pool.execute("room", "POST /api/rooms/:code/ready", input);
    const second = f.pool.execute("room", "POST /api/rooms/:code/ready", input);
    await assert.rejects(f.pool.execute("room", "POST /api/rooms/:code/ready", input), { code: "GAME_BUSY" });
    assert.equal(f.pool.health().queued, 2); release(); await Promise.all([first, second]);
    assert.equal(f.pool.owner("room").version, 3); assert.equal(f.pool.health().queued, 0); assert.equal(f.pool.health().rejected, 1);
  } finally { await f.pool.close(); }
});
test("invalid room creation releases the registry and prepared state", async () => {
  const f = fixture();
  try {
    const result = await f.pool.execute("room", "POST /api/rooms", { body: { gameId: "unknown" } });
    assert.equal(result.status, 400); assert.equal(f.pool.health().rooms, 0); assert.equal(f.commits, 0);
    await f.create(); assert.equal(f.room.gameWorker.version, 1);
  } finally { await f.pool.close(); }
});
