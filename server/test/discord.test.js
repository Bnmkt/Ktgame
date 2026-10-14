import assert from "node:assert/strict";
import test from "node:test";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createDiscordOAuth, discordConfiguration } from "../src/services/discord-oauth.js";
import { createDiscordPresence, discordActivityFor } from "../src/services/discord-presence.js";
import { DiscordIPC, rpcFrame, ipcPaths } from "../../desktop/companion/discord-presence.mjs";
import { createMfaChallenge, mfaChallengeAccount, consumeMfaChallenge, encryptTotpSecret, totpCode } from "../src/services/account-security.js";

const config = { clientId: "123456789012345678", clientSecret: "test-only-secret", redirectUri: "https://api.ktga.me/api/auth/discord/callback", available: true };

test("Discord MFA challenge selects its own account, expires on security change, and is one-time", () => {
  const secret = "test-encryption-key", totp = "JBSWY3DPEHPK3PXP";
  const user = { id: "admin", admin: true, sessionVersion: 1, discord: { id: "123456789012345678" }, mfa: { totpSecret: encryptTotpSecret(totp, secret) } };
  const challenge = createMfaChallenge(user, "browser", false, Date.now(), "discord");
  assert.deepEqual(mfaChallengeAccount(challenge.id, "browser"), { userId: "admin", loginMethod: "discord", sessionVersion: 1 });
  assert.equal(mfaChallengeAccount(challenge.id, "another-browser"), null);
  const code = totpCode(totp);
  assert.equal(consumeMfaChallenge(challenge.id, "browser", "totp", code, { ...user, id: "other" }, secret), false);
  assert.equal(consumeMfaChallenge(challenge.id, "browser", "totp", code, { ...user, sessionVersion: 2 }, secret), false);
  assert.equal(consumeMfaChallenge(challenge.id, "browser", "totp", code, { ...user, discord: null }, secret), false);
  assert.equal(consumeMfaChallenge(challenge.id, "browser", "totp", code, user, secret), true);
  assert.equal(consumeMfaChallenge(challenge.id, "browser", "totp", code, user, secret), false);
});

test("Discord configuration rejects invalid/insecure redirects and does not need a bot", () => {
  const env = { NODE_ENV: "production", DISCORD_CLIENT_ID: config.clientId, DISCORD_CLIENT_SECRET: config.clientSecret, DISCORD_REDIRECT_URI: config.redirectUri };
  assert.equal(discordConfiguration(env).available, true);
  for (const uri of ["http://localhost/callback", "https://user:secret@host/callback", "https://host/callback?token=secret", "bad"]) assert.equal(discordConfiguration({ ...env, DISCORD_REDIRECT_URI: uri }).available, false);
  assert.equal(discordConfiguration({ ...env, DISCORD_CLIENT_SECRET: "" }).available, false);
});

test("OAuth is browser-bound, one-time, minimal-scope, and stores no access token", async () => {
  let calls = 0;
  const oauth = createDiscordOAuth({ configuration: () => config, fetcher: async (url, options) => {
    calls++;
    if (url.endsWith("/token")) {
      assert.equal(options.body.get("redirect_uri"), config.redirectUri);
      assert.equal(options.body.get("client_secret"), config.clientSecret);
      return Response.json({ access_token: "temporary-access-token", token_type: "Bearer" });
    }
    assert.equal(options.headers.Authorization, "Bearer temporary-access-token");
    return Response.json({ id: "999999999999999999", username: "fixture", email: "ignored@example.test" });
  } });
  const flow = oauth.start({ intent: "link", userId: "player" });
  const url = new URL(flow.url);
  assert.equal(url.searchParams.get("scope"), "identify");
  assert.ok(!flow.url.includes(config.clientSecret));
  await assert.rejects(oauth.callback(flow.state, "wrong-browser", "code"));
  assert.equal(calls, 0);
  await oauth.callback(flow.state, flow.state, "code");
  await assert.rejects(oauth.callback(flow.state, flow.state, "code"));
  const result = oauth.consume(flow.state);
  assert.equal(result.userId, "player");
  assert.deepEqual(result.profile, { id: "999999999999999999", username: "fixture" });
  assert.ok(!JSON.stringify(result).includes("temporary-access-token"));
  assert.equal(oauth.consume(flow.state), null);
});

test("OAuth expires, bounds pending flows, and handles rejection/failure without leaking credentials", async () => {
  let time = 0;
  const oauth = createDiscordOAuth({ configuration: () => config, now: () => time, limit: 1, fetcher: async () => { throw new Error("secret provider details"); } });
  let flow = oauth.start({ intent: "login" });
  assert.throws(() => oauth.start());
  time += 600001;
  await assert.rejects(oauth.callback(flow.state, flow.state, "code"));
  flow = oauth.start({ intent: "login" });
  await oauth.callback(flow.state, flow.state, "code");
  assert.equal(oauth.consume(flow.state).error, "DISCORD_EXCHANGE_FAILED");
  flow = oauth.start({ intent: "login" });
  await oauth.callback(flow.state, flow.state, "", true);
  assert.equal(oauth.consume(flow.state).error, "DISCORD_CANCELLED");
});

test("companion credentials are one-time, revocable, session-bound and expire", () => {
  let time = 0;
  const presence = createDiscordPresence({ now: () => time });
  const user = { id: "player", sessionVersion: 3 };
  let pair = presence.pair(user);
  assert.equal(presence.connect("invalid"), null);
  const connection = presence.connect(pair.code);
  assert.equal(presence.connect(pair.code), null);
  assert.equal(presence.session(connection.token).sessionVersion, 3);
  assert.equal(presence.session("not-a-companion-token"), null);
  presence.revoke(user.id); assert.equal(presence.session(connection.token), null);
  pair = presence.pair(user); time += 300001; assert.equal(presence.connect(pair.code), null);
  pair = presence.pair(user); const next = presence.connect(pair.code); time += 12 * 3600000 + 1;
  assert.equal(presence.session(next.token), null);
});

test("presence shares no identity, private table data, card, rank, or code", () => {
  const context = { user: { id: "secret-user", email: "secret@example.test", discordPresenceEnabled: true }, online: true,
    room: { id: "secret-room", code: "secret-code", name: "private-name", state: { hand: ["secret-card"] }, elo: 1200 }, game: { name: "Yahtzee" } };
  assert.deepEqual(discordActivityFor(context), { details: "Yahtzee", state: "En partie", type: 0 });
  assert.equal(discordActivityFor({ ...context, online: false }), null);
  assert.equal(discordActivityFor({ ...context, user: { ...context.user, discordPresenceEnabled: false } }), null);
  assert.equal(discordActivityFor({ ...context, user: { ...context.user, guest: true } }), null);
});

test("native IPC supports split frames, activity changes and Discord ping", async () => {
  const address = process.platform === "win32" ? `\\\\.\\pipe\\ktga-rpc-${randomUUID()}` : path.join(os.tmpdir(), `ktga-rpc-${randomUUID()}.sock`);
  const messages = [], sockets = new Set();
  const server = net.createServer((socket) => {
    sockets.add(socket); socket.once("close", () => sockets.delete(socket));
    let buffer = Buffer.alloc(0);
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 8 && buffer.length >= buffer.readUInt32LE(4) + 8) {
        const opcode = buffer.readUInt32LE(), length = buffer.readUInt32LE(4), body = buffer.subarray(8, 8 + length);
        buffer = buffer.subarray(8 + length);
        if (opcode === 0) {
          assert.equal(JSON.parse(body).client_id, config.clientId);
          const ready = rpcFrame(1, { evt: "READY", data: {} });
          socket.write(ready.subarray(0, 5)); setTimeout(() => socket.write(Buffer.concat([ready.subarray(5), rpcFrame(3, { probe: true })])), 5);
        } else messages.push({ opcode, payload: JSON.parse(body) });
      }
    });
  });
  await new Promise((resolve) => server.listen(address, resolve));
  const rpc = new DiscordIPC(config.clientId, [address]);
  try {
    await rpc.connect(); rpc.update({ details: "Yahtzee", state: "En partie" }); rpc.update(null);
    for (let i = 0; i < 100 && messages.length < 3; i++) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.ok(messages.some((message) => message.opcode === 4 && message.payload.probe));
    assert.equal(messages.filter((message) => message.payload.cmd === "SET_ACTIVITY").length, 2);
    assert.ok(messages.some((message) => message.payload.args?.activity === null));
    assert.equal(ipcPaths({}, "win32").length, 10);
  } finally { rpc.close(); for (const socket of sockets) socket.destroy(); await new Promise((resolve) => server.close(resolve)); }
});
