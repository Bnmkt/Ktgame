import test from "node:test";
import assert from "node:assert/strict";
import { createGameRoomKernel } from "../src/services/game-room-kernel.js";
import { games } from "../src/games/shared.js";
import { normalizeProgressionConfig } from "../src/services/game-progression.js";

const platform = { minRoomStake: 10, minPokerBuyIn: 100, signupTokens: 10000, pokerDefaultBigBlind: 10,
  pokerTurnSeconds: 300, botThinkingSeconds: 0, turnEndDelaySeconds: 1, roundResultsSeconds: 0,
  minorRestrictions: [], gameProgression: normalizeProgressionConfig() };
const user = { id: "player", pseudo: "Player", tokens: 10000, active: true, profile: { birthDate: "1990-01-01" } };
function fixture(gameId = "yahtzee") {
  const kernel = createGameRoomKernel(); kernel.configure({ id: "1", platform, games });
  kernel.register({ roomId: "room", epoch: "epoch", version: 0, room: null });
  let version = 0, sequence = 0;
  const context = { actor: { id: user.id }, users: [user] };
  return { kernel,
    async command(command, body = {}, commit = true) {
      const input = { roomId: "room", epoch: "epoch", version, commandId: String(++sequence), configurationId: "1", command, context,
        params: { code: this.code }, body: command === "POST /api/rooms" ? { gameId, name: "Test table", ...body } : body };
      const result = await kernel.prepare(input);
      if (result.room) this.code = result.room.code;
      if (commit) { version = result.version; kernel.commit({ ...input, version }); }
      return { input, result };
    }
  };
}
test("a room is fenced and a prepared action is not committed by a retry", async () => {
  const f = fixture(); const { input, result } = await f.command("POST /api/rooms", {}, false);
  assert.equal(result.status, 200); assert.equal(result.room.id, "room");
  assert.deepEqual(await f.kernel.prepare(input), result);
  await assert.rejects(f.kernel.prepare({ ...input, commandId: "other" }), { code: "GAME_ROOM_BUSY" });
  await assert.rejects(f.kernel.prepare({ ...input, epoch: "wrong" }), { code: "GAME_FENCED" });
  f.kernel.commit({ ...input, version: 1 });
  assert.equal((await f.kernel.prepare(input)).duplicate, true);
  assert.equal(f.kernel.commit({ ...input, version: 1 }).duplicate, true);
});
test("all existing games can start in the same isolated runtime", async () => {
  for (const game of games) {
    const f = fixture(game.id); await f.command("POST /api/rooms");
    const { result } = await f.command("POST /api/rooms/:code/start");
    assert.equal(result.status, 200, `${game.id}: ${JSON.stringify(result.response)}`);
    assert.equal(result.room.state.gameId, game.id);
    assert.ok(result.effects.some((effect) => effect.kind === "tokens"));
  }
});
test("Yahtzee roll and scoring preserve pacing and achievement events", async () => {
  const f = fixture(); await f.command("POST /api/rooms"); await f.command("POST /api/rooms/:code/start");
  const roll = (await f.command("POST /api/rooms/:code/action", { type: "roll" })).result;
  assert.equal(roll.status, 200); assert.equal(roll.room.state.dice.length, 5);
  assert.ok(roll.effects.some((effect) => effect.kind === "achievement" && effect.event.payload.action === "roll"));
  const score = (await f.command("POST /api/rooms/:code/action", { type: "score", category: "chance" })).result;
  assert.equal(score.status, 200); assert.ok(score.room.state.scores.player.chance >= 5);
});
test("invalid commands can be aborted without losing room state", async () => {
  const f = fixture(); await f.command("POST /api/rooms"); await f.command("POST /api/rooms/:code/start");
  const { result, input } = await f.command("POST /api/rooms/:code/action", { type: "score", category: "chance" }, false);
  assert.equal(result.status, 400); assert.deepEqual(result.effects, []);
  f.kernel.abort(input);
  const next = await f.command("POST /api/rooms/:code/action", { type: "roll" }); assert.equal(next.result.status, 200);
});
