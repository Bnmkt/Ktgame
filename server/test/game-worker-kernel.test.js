import test from "node:test";
import assert from "node:assert/strict";
import { createGameRoomKernel } from "../src/services/game-room-kernel.js";
import { games } from "../src/games/shared.js";
import { normalizeProgressionConfig } from "../src/services/game-progression.js";
import { normalizeRankedConfig, RANKED_GAMES } from "../src/services/ranked.js";
import { ROOM_INACTIVITY_MS } from "../src/services/room-lifecycle.js";

const platform = { minRoomStake: 10, minPokerBuyIn: 100, signupTokens: 10000, pokerDefaultBigBlind: 10,
  pokerTurnSeconds: 300, botThinkingSeconds: 0, turnEndDelaySeconds: 1, roundResultsSeconds: 0,
  minorRestrictions: [], gameProgression: normalizeProgressionConfig() };
const user = { id: "player", pseudo: "Player", tokens: 10000, active: true, profile: { birthDate: "1990-01-01" } };
function fixture(gameId = "yahtzee", initialRoom = null) {
  const kernel = createGameRoomKernel(); kernel.configure({ id: "1", platform, games });
  kernel.register({ roomId: "room", epoch: "epoch", version: 0, room: initialRoom });
  let version = 0, sequence = 0;
  const context = { actor: { id: user.id }, users: [user] };
  return { kernel, context, code: initialRoom?.code,
    async command(command, body = {}, commit = true, now) {
      const input = { roomId: "room", epoch: "epoch", version, commandId: String(++sequence), configurationId: "1", command, context,
        params: { code: this.code }, body: command === "POST /api/rooms" ? { gameId, name: "Test table", ...body } : body, now };
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

test("guests can start every classic game without a stake debit or economic effects", async () => {
  for (const game of games) {
    const f = fixture(game.id);
    f.context.users = [{ ...user, guest: true, tokens: 123, roomPlayer: { ...user, guest: false } }];
    assert.equal((await f.command("POST /api/rooms")).result.status, 200);
    const started = (await f.command("POST /api/rooms/:code/start")).result;
    assert.equal(started.status, 200, `${game.id}: ${JSON.stringify(started.response)}`);
    assert.equal(started.room.players.find(({ id }) => id === user.id).tokens, 10000);
    assert.equal(started.room.players.find(({ id }) => id === user.id).guest, true);
    assert.equal(started.effects.filter((effect) => effect.kind === "tokens").length, 0);
    const expired = (await f.command("tick", {}, true, Date.parse(started.room.lastActionAt) + ROOM_INACTIVITY_MS)).result;
    assert.equal(expired.room, null);
    assert.equal(expired.effects.filter((effect) => effect.kind === "tokens").length, 0);
  }
});

test("guest blackjack betting and doubling never produce transferable token effects", async () => {
  const f = fixture("blackjack");
  f.context.users = [{ ...user, guest: true }];
  await f.command("POST /api/rooms");
  const started = (await f.command("POST /api/rooms/:code/start")).result;
  const bet = (await f.command("POST /api/rooms/:code/action", { type: "bet", amount: started.room.state.modifiers.minimumBet, guest: false, tokens: 1000000 })).result;
  assert.equal(bet.status, 200, JSON.stringify(bet.response));
  assert.equal(bet.effects.filter((effect) => effect.kind === "tokens").length, 0);
  assert.equal(bet.room.players[0].tokens, 10000);
  bet.room.state.hands.player = [{ rank: "5" }, { rank: "6" }];
  const recovered = fixture("blackjack", bet.room); recovered.context.users = [{ ...user, guest: true }];
  const doubled = (await recovered.command("POST /api/rooms/:code/action", { type: "double" })).result;
  assert.equal(doubled.status, 200, JSON.stringify(doubled.response));
  assert.equal(doubled.effects.filter((effect) => effect.kind === "tokens").length, 0);
  assert.equal(doubled.room.players[0].tokens, 10000);
  const stopped = (await recovered.command("DELETE /api/rooms/:code")).result;
  assert.equal(stopped.effects.filter((effect) => effect.kind === "tokens").length, 0);
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
test("an administrator outside a ranked room can close it through its owner worker", async () => {
  const f = fixture(), config = normalizeRankedConfig().games.yahtzee;
  f.context.users = [{ ...user, admin: true }, { ...user, id: "other" }];
  const players = f.context.users.map(({ id, pseudo, tokens }) => ({ id, pseudo, tokens }));
  const template = { id: "room", code: "RANKED", gameId: "yahtzee", ownerId: "ranked-server", stake: 10, players,
    readyPlayerIds: players.map(({ id }) => id), ranked: { config, roster: players, forfeits: {}, actionAt: Date.now() } };
  const input = { roomId: "room", epoch: "epoch", version: 0, commandId: "start", configurationId: "1", command: "start-ranked", context: f.context, template };
  const started = await f.kernel.prepare(input);
  assert.equal(started.status, 200);
  f.kernel.commit({ ...input, version: started.version });
  const close = { ...input, version: started.version, commandId: "close", command: "DELETE /api/rooms/:code", params: { code: template.code } };
  const closed = await f.kernel.prepare(close);
  assert.equal(closed.status, 200);
  assert.equal(closed.room, null);
  assert.equal(closed.deletedRoom.ranked.cancelled.by, user.id);
  assert.deepEqual(closed.effects.filter((effect) => effect.kind === "tokens").map(({ userId, amount }) => ({ userId, amount })), [{ userId: user.id, amount: 10 }, { userId: "other", amount: 10 }]);
  assert.equal(closed.effects.filter((effect) => effect.kind === "settle").length, 1);
  assert.ok(closed.events.some((event) => event.event === "room-closed"));
  f.kernel.commit({ ...close, version: closed.version });
  assert.equal(f.kernel.health().rooms, 0);
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

test("waiting and active rooms expire after one hour even with connected players, and release their owner", async () => {
  for (const playing of [false, true]) {
    const f = fixture(); let result = (await f.command("POST /api/rooms")).result;
    if (playing) result = (await f.command("POST /api/rooms/:code/start")).result;
    f.context.sockets = [{ id: "socket", data: { userId: user.id, roomId: "room" } }];
    const deadline = Date.parse(result.room.lastActionAt) + ROOM_INACTIVITY_MS;
    assert.deepEqual(f.kernel.due(deadline - 1), []);
    assert.deepEqual(f.kernel.due(deadline), ["room"]);
    const before = await f.command("tick", {}, true, deadline - 1);
    assert.ok(before.result.room);
    const closed = (await f.command("tick", {}, true, deadline)).result;
    assert.equal(closed.room, null);
    assert.equal(closed.effects.filter((effect) => effect.kind === "notification").length, 1);
    assert.deepEqual(closed.effects.filter((effect) => effect.kind === "tokens").map(({ amount }) => amount), playing ? [10] : []);
    assert.equal(closed.events.find((event) => event.event === "room-closed").payload.reason, "inactivity");
    assert.equal(f.kernel.health().rooms, 0); assert.deepEqual(f.kernel.due(deadline + 1000), []);
  }
});

test("passive events and invalid actions do not renew room inactivity", async () => {
  const f = fixture(); await f.command("POST /api/rooms");
  const original = (await f.command("POST /api/rooms/:code/start")).result.room.lastActionAt;
  const passive = await f.command("activity"); assert.equal(passive.result.room.lastActionAt, original);
  const invalid = await f.command("POST /api/rooms/:code/action", { type: "score", category: "chance" });
  assert.equal(invalid.result.status, 400); assert.equal(invalid.result.room.lastActionAt, original);
});

test("a finished room is scheduled for expiration without issuing rewards or warnings again", async () => {
  const f = fixture("yahtzee", { id: "room", code: "FINISH", players: [user], finished: true, createdAt: new Date(Date.now() - ROOM_INACTIVITY_MS - 1).toISOString(), state: { finished: true } });
  assert.deepEqual(f.kernel.due(), ["room"]);
  const closed = (await f.command("tick")).result;
  assert.equal(closed.room, null); assert.deepEqual(closed.effects, []);
  assert.equal(closed.events.find((event) => event.event === "room-closed").payload.unfinished, false);
});

test("a successful human action renews the deadline on a recovered room", async () => {
  const original = fixture(); await original.command("POST /api/rooms");
  const room = (await original.command("POST /api/rooms/:code/start")).result.room;
  room.lastActionAt = new Date(Date.now() - ROOM_INACTIVITY_MS + 10000).toISOString();
  const f = fixture("yahtzee", room);
  const roll = (await f.command("POST /api/rooms/:code/action", { type: "roll", lastActionAt: "2000-01-01" })).result;
  assert.equal(roll.status, 200);
  assert.ok(Date.parse(roll.room.lastActionAt) > Date.parse(room.lastActionAt));
  assert.deepEqual(f.kernel.due(Date.now() + 20000), []);
});

test("an abandoned guest table can expire after its in-memory session disappeared", async () => {
  const original = fixture(); await original.command("POST /api/rooms");
  const room = (await original.command("POST /api/rooms/:code/start")).result.room;
  room.lastActionAt = new Date(Date.now() - ROOM_INACTIVITY_MS - 1).toISOString();
  const f = fixture("yahtzee", room); f.context.users = [];
  const closed = (await f.command("tick")).result;
  assert.equal(closed.room, null); assert.deepEqual(closed.effects, []);
  assert.ok(closed.events.some((event) => event.event === "room-closed"));
  assert.equal(f.kernel.health().rooms, 0);
});

test("account presentation refreshes in the owner's draft without losing game state", async () => {
  const f = fixture(); await f.command("POST /api/rooms"); await f.command("POST /api/rooms/:code/start");
  f.context.users = [{ ...user, roomPlayer: { id: user.id, pseudo: "Updated player", cosmetics: { equipped: { nameEffect: "gold" } } } }];
  const roll = (await f.command("POST /api/rooms/:code/action", { type: "roll" })).result;
  assert.equal(roll.room.players[0].pseudo, "Updated player"); assert.equal(roll.room.state.players[0].pseudo, "Updated player");
  assert.equal(roll.room.state.players[0].cosmetics.equipped.nameEffect, "gold");
  assert.equal(roll.room.state.dice.length, 5); assert.equal(roll.room.state.rollsLeft, 2);
});
