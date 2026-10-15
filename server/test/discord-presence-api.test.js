import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createDiscordPresence, registerDiscordPresence } from "../src/services/discord-presence.js";

test("presence permissions persist, update the live companion and never bypass table access", async () => {
  const user = { id: "player", active: true, profile: { birthDate: "1990-01-01" }, discordPresenceEnabled: true };
  const room = { id: "table", code: "AB1234", isPublic: true, gameId: "yahtzee", players: [{ id: user.id }], state: null };
  const db = { users: [user], rooms: [room] }, presence = createDiscordPresence();
  const connection = presence.connect(presence.pair(user).code);
  let writes = 0;
  const app = express(); app.use(express.json());
  registerDiscordPresence({ app, auth: (req, res, next) => { req.auth = { id: user.id }; next(); }, readDb: () => db,
    writeDb: (_db, changed) => { writes++; assert.deepEqual(changed, { users: [user.id], rooms: [] }); }, isUnder13: () => false, accountBlocked: () => false,
    onlinePresence: new Map([[user.id, true]]), roomPresence: new Map([[room.id, new Set(["socket"])]]), io: { sockets: { sockets: new Map([["socket", { data: { userId: user.id } }]]) } },
    configuredGames: () => [{ id: "yahtzee", name: "Yahtzee", maxPlayers: 6, coverImage: "/api/game-images/test.png" }],
    configuration: () => ({ available: true, clientId: "123456789012345678", redirectUri: "https://api.ktga.me/api/auth/discord/callback" }), presence });
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const read = async () => { const response = await fetch(`${origin}/api/discord/presence/activity`, { headers: { Authorization: `Bearer ${connection.token}` } }); return { status: response.status, data: await response.json() }; };
  const change = body => fetch(`${origin}/api/me/discord/presence`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  try {
    const first = await read(); assert.equal(first.status, 200); assert.equal(first.data.activity.buttons.length, 1);
    assert.equal(first.data.activity.assets.large_image, "https://api.ktga.me/api/game-images/test.png");
    assert.equal((await change({ joinEnabled: "yes" })).status, 400); assert.equal(writes, 0);
    const saved = await change({ joinEnabled: true }); assert.equal(saved.status, 200); assert.equal((await saved.json()).joinEnabled, true);
    assert.equal(user.discordPresenceJoinEnabled, true); assert.equal(writes, 1);
    const shared = await read(); assert.equal(shared.status, 200); assert.equal(shared.data.activity.buttons[0].url, "https://www.ktga.me/table/AB1234");
    assert.equal(shared.data.context, first.data.context, "permission changes must not restart elapsed time");
    room.state = { players: room.players, currentPlayerIndex: 0 }; room.activityMatchId = "match-one";
    const playing = await read(); assert.equal(playing.data.activity.buttons.length, 1); assert.notEqual(playing.data.context, first.data.context);
    room.state = null; room.passwordHash = "private"; assert.equal((await read()).data.activity.buttons.length, 1);
    delete room.passwordHash;
    await change({ joinEnabled: false }); assert.equal((await read()).data.activity.buttons.length, 1);
    await change({ enabled: false }); assert.equal((await read()).status, 401);
  } finally { await new Promise(resolve => server.close(resolve)); presence.close(); }
});
