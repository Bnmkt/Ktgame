import test from "node:test";
import assert from "node:assert/strict";
import { createGameRoomKernel } from "../src/services/game-room-kernel.js";
import { games } from "../src/games/shared.js";
import { normalizeProgressionConfig } from "../src/services/game-progression.js";
import { normalizeRankedConfig, RANKED_GAMES } from "../src/services/ranked.js";

const platform = { minRoomStake: 10, minPokerBuyIn: 100, signupTokens: 10000, pokerDefaultBigBlind: 10,
  pokerTurnSeconds: 300, botThinkingSeconds: 0, turnEndDelaySeconds: 1, roundResultsSeconds: 0,
  minorRestrictions: [], gameProgression: normalizeProgressionConfig() };
const user = { id: "player", pseudo: "Player", tokens: 10000, active: true, profile: { birthDate: "1990-01-01" } };
function fixture(gameId = "yahtzee") {
  const kernel = createGameRoomKernel(); kernel.configure({ id: "1", platform, games });
  kernel.register({ roomId: "room", epoch: "epoch", version: 0, room: null });
  let version = 0, sequence = 0;
  const context = { actor: { id: user.id }, users: [user] };
  return { kernel, context,
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

test("personal completion receipts survive worker commits and clear on a new game", async () => {
  const f = fixture();
  const created = await f.command("POST /api/rooms", {}, false);
  const receipt = { player: { xp: { amount: 50, level: 2 } } };
  f.kernel.commit({ ...created.input, version: created.result.version, financial: { completionByUser: receipt } });
  const input = { ...created.input, version: created.result.version, commandId: "inspect", command: "tick" };
  const draft = await f.kernel.prepare(input);
  assert.deepEqual(draft.room.completionByUser, receipt);
  f.kernel.abort(input);
  const start = { ...input, commandId: "new-game", command: "POST /api/rooms/:code/start", params: { code: created.result.room.code } };
  const started = await f.kernel.prepare(start);
  assert.equal(started.status, 200);
  assert.equal(started.room.completionByUser, undefined);
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

test("workers enforce live softban policies for room controls and games while keeping the exit available", async () => {
  const f = fixture(); await f.command("POST /api/rooms");
  const moderation = { softBan: { active: true, reason: "Fixture", restrictions: null } };
  f.context.users = [{ ...user, moderation }];
  f.kernel.configure({ id: "1", platform: { ...platform, softBanRestrictions: ["rooms:create"] }, games });
  assert.equal((await f.command("POST /api/rooms/:code/bot")).result.status, 403);
  assert.equal((await f.command("POST /api/rooms/:code/start")).result.status, 403);
  f.context.users = [{ ...user, moderation: { softBan: { ...moderation.softBan, restrictions: [] } } }];
  assert.equal((await f.command("POST /api/rooms/:code/start")).result.status, 200);
  f.context.users = [{ ...user, moderation }];
  f.kernel.configure({ id: "1", platform: { ...platform, softBanRestrictions: ["game:yahtzee"] }, games });
  assert.equal((await f.command("POST /api/rooms/:code/action", { type: "roll" })).result.status, 403);
  assert.equal((await f.command("POST /api/rooms/:code/leave")).result.status, 200);
});

test("the worker accepts authorized virtual bots in every ranked engine but rejects ordinary bot injection",async()=> {
  for (const gameId of RANKED_GAMES) {
    const config=normalizeRankedConfig().games[gameId],f=fixture(gameId);
    f.context.users=[{...user,admin:true}];
    const players=[{...user},...Array.from({length:config.players-1},(_,i)=>({id:`bot-${i}`,pseudo:`Bot ${i+1}`,isBot:true,guest:true,tokens:10000}))];
    const template={id:"room",code:"BOTTEST",gameId,ownerId:"ranked-server",stake:config.preset.stake,players,readyPlayerIds:players.map((p)=>p.id),gameModifiers:config.preset.gameModifiers,ranked:{config,botCompletion:{by:user.id},roster:players.map((p,i)=>({id:p.id,isBot:Boolean(p.isBot),...(gameId==="belote"?{team:i%2}:{})})),forfeits:{},actionAt:Date.now()}};
    const input={roomId:"room",epoch:"epoch",version:0,commandId:"start",configurationId:"1",command:"start-ranked",context:f.context,template};
    const result=await f.kernel.prepare(input);
    assert.equal(result.status,200,`${gameId}: ${JSON.stringify(result.response)}`);
    assert.equal(result.room.state.players.filter((p)=>p.isBot).length,players.length-1);
    f.kernel.commit({...input,version:result.version});
    const cancelled=await f.kernel.prepare({...input,version:result.version,commandId:'cancel',command:'cancel-ranked',reason:'Technical test cancellation'});
    assert.equal(cancelled.status,200);
    assert.deepEqual(cancelled.effects.filter(effect=>effect.kind==='tokens').map(effect=>effect.userId),template.stake>0 ? [user.id] : [],'Cancellation refunds real accounts only');
    const denied=fixture(gameId);input.context=denied.context;input.commandId="forbidden";
    assert.equal((await denied.kernel.prepare(input)).status,400);
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

test("an idle tick and activity recording do not publish room or lobby snapshots", async () => {
  const f = fixture(); await f.command("POST /api/rooms"); await f.command("POST /api/rooms/:code/start");
  const tick = await f.command("tick"); assert.equal(tick.result.written, false); assert.equal(tick.result.publishRoom, false); assert.equal(tick.result.publishLobby, false);
  const activity = await f.command("activity"); assert.equal(activity.result.publishRoom, false); assert.equal(activity.result.publishLobby, false);
});

test("account presentation refreshes in the owner's draft without losing game state", async () => {
  const f = fixture(); await f.command("POST /api/rooms"); await f.command("POST /api/rooms/:code/start");
  f.context.users = [{ ...user, roomPlayer: { id: user.id, pseudo: "Updated player", cosmetics: { equipped: { nameEffect: "gold" } } } }];
  const roll = (await f.command("POST /api/rooms/:code/action", { type: "roll" })).result;
  assert.equal(roll.room.players[0].pseudo, "Updated player"); assert.equal(roll.room.state.players[0].pseudo, "Updated player");
  assert.equal(roll.room.state.players[0].cosmetics.equipped.nameEffect, "gold");
  assert.equal(roll.room.state.dice.length, 5); assert.equal(roll.room.state.rollsLeft, 2);
});
