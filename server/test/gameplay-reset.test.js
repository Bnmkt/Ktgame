import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { applyPendingGameplayReset, queueGameplayReset, resetPendingPath, resetSummary, RESET_CONFIRMATION } from "../src/services/gameplay-reset.js";
import { defaultCosmetics } from "../src/services/account-domain.js";
import { defaultCommunityEvent } from "../src/services/community-events.js";

test("global gameplay reset is authorized, backed up, offline and restart-safe", { timeout: 120000 }, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ktga-reset-test-"));
  const filename = path.join(directory, "main.sqlite"), chatFilename = path.join(directory, "CHAT_DB_PATH.sqlite");
  const secret = "isolated-reset-jwt-secret-never-used-outside-this-test", password = "Isolated!Password1";
  const passwordHash = bcrypt.hashSync(password, 4), timestamp = new Date().toISOString();
  let child, url, port, output = "";
  const env = { ...process.env, NODE_ENV: "production", DOTENV_CONFIG_PATH: path.join(directory, "absent.env"), HOST: "127.0.0.1", TLS_TERMINATION: "proxy", TRUST_PROXY: "loopback", APP_BASE_PATH: "", JWT_SECRET: secret, CLIENT_DIST: "", CLIENT_ORIGIN: "https://www.ktga.me", PUBLIC_APP_URL: "https://www.ktga.me", CONTACT_EMAIL: "test@example.com", HTTPS_KEY_PATH: "", HTTPS_CERT_PATH: "", HTTPS_PFX_PATH: "", SMTP_HOST: "", SMTP_USER: "", SMTP_PASS: "", EMAIL_FROM: "", ACCOUNTS_PROCESS_ENABLED: "1", GAME_WORKERS_ENABLED: "1", GAME_WORKERS: "1", SQLITE_PATH: filename,
    PATCHNOTES_UPLOAD_DIR: path.join(directory, "note-images"), BUG_REPORT_UPLOAD_DIR: path.join(directory, "bug-images"),
    ...Object.fromEntries(["PARENTAL_DB_PATH", "TRIBUNAL_DB_PATH", "CHAT_DB_PATH", "STATUS_DB_PATH", "REQUEST_LOG_PATH", "HELP_DB_PATH", "DATA_REQUEST_DB_PATH", "BUG_REPORT_DB_PATH", "PATCHNOTES_DB_PATH", "CONTACT_NOTICE_DB_PATH"].map(key => [key, path.join(directory, `${key}.sqlite`)])) };
  const inspect = callback => { const db = new DatabaseSync(filename); try { return callback(db); } finally { db.close(); } };
  const read = id => inspect(db => JSON.parse(db.prepare("SELECT data FROM users WHERE id=?").get(id).data));
  const count = (db, table) => Number(db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n);
  async function start() {
    output = "";
    child = spawn(process.execPath, ["src/index.js"], { cwd: new URL("../", import.meta.url), env: { ...env, PORT: String(port) }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", data => output += data); child.stderr.on("data", data => output += data);
    for (let attempt = 0; attempt < 180; attempt++) {
      try { if ((await fetch(`${url}/api/health`)).ok) return; } catch {}
      if (child.exitCode !== null) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Server failed to start: ${output.slice(-4000)}`);
  }
  async function stop() {
    if (child && child.exitCode === null && child.signalCode === null) { const exited = new Promise(resolve => child.once("exit", resolve)); child.kill(); await exited; }
    child = null;
  }
  async function request(id, method = "GET", body, version = 0, route = "/api/admin/gameplay-reset") {
    const response = await fetch(`${url}${route}`, { method, headers: { Origin: "https://www.ktga.me", "Content-Type": "application/json", ...(id ? { Authorization: `Bearer ${jwt.sign({ id, sessionVersion: version }, secret, { expiresIn: "1h" })}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json(), headers: response.headers };
  }
  try {
    inspect(db => {
      db.exec("CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); INSERT INTO meta VALUES('legacy-json-migrated','true'); CREATE TABLE users(id TEXT PRIMARY KEY,data TEXT NOT NULL,pseudo TEXT NOT NULL,email TEXT,guest INTEGER)");
      db.prepare("INSERT INTO meta VALUES('admin-settings',?)").run(JSON.stringify({ platform: { signupTokens: 4321 }, testRetainedSetting: "retained" }));
      for (const id of ["admin", "editor", "player", "guest"]) {
        const user = { id, pseudo: id, email: id === "guest" ? null : `${id}@example.com`, passwordHash, sessionVersion: 0, active: true, guest: id === "guest", admin: id === "admin", editor: id === "editor", tokens: 999999, emailVerifiedAt: timestamp, createdAt: timestamp, profile: { birthDate: "1990-01-01", displayName: id, bio: "Keep my biography", favoriteGames: ["yahtzee"] }, friends: id === "player" ? ["editor"] : [], mfa: { enabled: true, method: "email" }, registrationAuthorization: { termsVersion: "test" }, parentalAccess: { status: "active" }, privacy: { diagnostics: false }, lastDailyClaim: "2026-01-01", siteActivity: { totalSeconds: 123 }, secretTimers: { test: 456 } };
        db.prepare("INSERT INTO users VALUES(?,?,?,?,?)").run(id, JSON.stringify(user), id, user.email, Number(user.guest));
      }
    });
    const listener = net.createServer(); await new Promise(resolve => listener.listen(0, "127.0.0.1", resolve)); port = listener.address().port; await new Promise(resolve => listener.close(resolve)); url = `http://127.0.0.1:${port}`;
    await start(); await stop();
    inspect(db => {
      db.exec("PRAGMA foreign_keys=ON");
      const player = read("player");
      player.profile.titleGameId = "yahtzee"; player.profile.titleLevel = 100; player.profile.rankedBadgeGameId = "yahtzee";
      player.notifications = [{ type: "moderation-decision", id: "safety" }, { type: "achievement", id: "old" }];
      player.roomInvites = [{ roomId: "old" }];
      db.prepare("UPDATE users SET data=? WHERE id='player'").run(JSON.stringify(player));
      db.prepare("INSERT INTO rooms VALUES('old-room','ABCDEF','yahtzee',1,1,?,?)").run(timestamp, JSON.stringify({ id: "old-room", code: "ABCDEF", gameId: "yahtzee", finished: true, players: [], createdAt: timestamp }));
      db.prepare("INSERT INTO history(id,user_ids,finished_at,data,day) VALUES('old-history',?,?,?,'2026-10-16')").run('["player"]', timestamp, JSON.stringify({ id: "old-history", gameId: "yahtzee", players: [{ id: "player", pseudo: "player" }], resultIds: ["player"], finishedAt: timestamp }));
      db.prepare("INSERT INTO transactions(id,user_id,created_at,data,amount,balance,reason,day) VALUES('old-transaction','player',?,?,999999,999999,'test','2026-10-16')").run(timestamp, JSON.stringify({ id: "old-transaction", userId: "player", amount: 999999, balance: 999999, reason: "test", createdAt: timestamp }));
      db.exec("INSERT INTO user_game_xp VALUES('player','yahtzee',123456); INSERT INTO user_game_elo VALUES('player','yahtzee',1800,30,10); INSERT INTO user_ranked_placements VALUES('player','yahtzee','{}'); INSERT INTO achievement_catalog VALUES('reset-test', '{}'); INSERT INTO user_achievements VALUES('player','reset-test',1,0,NULL,0,-1); INSERT INTO achievement_progress VALUES('player','reset-test',10,'{}',NULL); INSERT INTO achievement_reward_receipts VALUES('player','reset-test'); INSERT INTO item_catalog VALUES('icons','reset-test','{}'); INSERT INTO user_inventory VALUES('player','icons','reset-test',20)");
      db.prepare("INSERT INTO ranked_results VALUES('old-history','old-match','player','yahtzee',?,'{}')").run(timestamp);
      db.prepare("INSERT INTO ranked_settlements VALUES('old-match','old-history','yahtzee',?)").run(timestamp);
      db.exec("INSERT INTO history_members VALUES('old-history','player','yahtzee','2026-10-16',1,0,'{}','[\"player\"]',0,100,300)");
      const event = defaultCommunityEvent();
      Object.assign(event, { id: "old-event", slug: "reset-test", status: "draft" });
      Object.assign(event.runtime, { pot: 50000, finalizedAt: timestamp });
      db.prepare("INSERT INTO community_events VALUES(?,?,?,?,?,?)").run(event.id, event.slug, event.status, event.startsAt, event.endsAt, JSON.stringify(event));
      db.prepare("INSERT INTO community_event_participants VALUES('p','old-event','player',100,200,?,'{}')").run(timestamp);
      db.prepare("INSERT INTO community_event_actions(id,event_id,user_id,created_at,data) VALUES('a','old-event','player',?,'{}')").run(timestamp);
      db.prepare("INSERT INTO community_event_pot_entries(id,event_id,amount,created_at,data) VALUES('p','old-event',50,?,'{}')").run(timestamp);
      db.prepare("UPDATE community_event_actions SET data=? WHERE id='a'").run(JSON.stringify({ id: "a", eventId: "old-event", userId: "player", createdAt: timestamp, paid: false }));
      db.prepare("UPDATE community_event_pot_entries SET data=? WHERE id='p'").run(JSON.stringify({ id: "p", eventId: "old-event", amount: 50, createdAt: timestamp }));
      db.exec("INSERT INTO community_event_rewards VALUES('r','old-event','player',100,NULL,'{}'); INSERT INTO community_event_effects VALUES('e','old-event','player',NULL,'{}'); INSERT INTO leaderboard_seasons VALUES('2026-Q2','2026-07-01','test'); INSERT INTO leaderboard_boards VALUES('2026-Q2','all','tokens',1,'{}'); INSERT INTO leaderboard_entries VALUES('2026-Q2','all','tokens','player',1,999999,30,10,100,300,300,999999,NULL)");
      db.prepare("UPDATE community_event_participants SET data=? WHERE id='p'").run(JSON.stringify({ id: "p", eventId: "old-event", userId: "player", contribution: 100, damage: 200, joinedAt: timestamp, lastActivityAt: timestamp }));
      db.exec("UPDATE community_event_rewards SET data=json_object('id',id,'eventId',event_id,'userId',user_id,'amount',amount); UPDATE community_event_effects SET data=json_object('id',id,'eventId',event_id,'userId',user_id)");
    });
    const chat = new DatabaseSync(chatFilename);
    try { for (const type of ["room", "global", "direct"]) { chat.prepare("INSERT INTO chat_messages VALUES(?,?,?,?,?,?)").run(type, type, "channel", "player", "Test message", timestamp); chat.prepare("INSERT INTO chat_reads VALUES('player',?,'channel',?)").run(type, timestamp); } chat.exec("INSERT INTO chat_direct_members VALUES('player','channel')"); } finally { chat.close(); }
    const beforePlayer = read("player");

    await t.test("backups precede every mutation and live-process reset is refused", () => {
      const job = queueGameplayReset(filename, "admin", resetSummary(filename));
      assert.throws(() => queueGameplayReset(filename, "admin", resetSummary(filename)), { code: "EEXIST" });
      assert.equal(JSON.parse(fs.readFileSync(resetPendingPath(filename))).id, job.id);
      assert.throws(() => applyPendingGameplayReset({ filename, chatFilename }), /still running/);
      const invalid = path.join(directory, "invalid.sqlite"); fs.writeFileSync(invalid, "Not a database");
      assert.throws(() => applyPendingGameplayReset({ filename, chatFilename: invalid, isRunning: () => false }));
      assert.equal(read("player").tokens, 999999); assert.equal(read("player").sessionVersion, 0);
      fs.unlinkSync(resetPendingPath(filename));
    });

    await t.test("a failing account migration rolls back all gameplay deletions", () => {
      const player = read("player");
      inspect(db => db.prepare("UPDATE users SET data=? WHERE id='player'").run(JSON.stringify({ ...player, notifications: {} })));
      queueGameplayReset(filename, "admin", resetSummary(filename));
      assert.throws(() => applyPendingGameplayReset({ filename, chatFilename, isRunning: () => false }), /filter/);
      assert.equal(read("player").tokens, 999999); assert.equal(read("admin").sessionVersion, 0);
      inspect(db => { assert.equal(count(db, "user_game_xp"), 1); assert.equal(count(db, "history"), 1); assert.equal(count(db, "transactions"), 1); db.prepare("UPDATE users SET data=? WHERE id='player'").run(JSON.stringify(player)); });
      fs.unlinkSync(resetPendingPath(filename));
    });

    await start();
    await t.test("only admins can preview and confirmation requires fresh credentials", async () => {
      for (const id of [null, "player", "editor"]) for (const method of ["GET", "POST"]) assert.equal((await request(id, method, method === "POST" ? {} : undefined)).status, id ? 403 : 401);
      const preview = await request("admin"); assert.equal(preview.status, 200); assert.equal(preview.headers.get("cache-control"), "no-store"); assert.equal(preview.data.summary.signupTokens, 4321); assert.equal(preview.data.summary.accounts, 3);
      assert.equal(fs.existsSync(resetPendingPath(filename)), false);
      const body = { token: preview.data.token, confirmation: RESET_CONFIRMATION, acknowledge: true, method: "password", credential: password };
      assert.equal((await request("admin", "POST", { ...body, token: "invalid" })).status, 409);
      assert.equal((await request("admin", "POST", { ...body, confirmation: "RESET" })).status, 400);
      assert.equal((await request("admin", "POST", { ...body, acknowledge: false })).status, 400);
      assert.equal((await request("admin", "POST", { ...body, credential: "wrong" })).status, 403);
      assert.equal(fs.existsSync(resetPendingPath(filename)), false);
      assert.equal(read("player").tokens, 999999);
    });

    await t.test("confirmation schedules a controlled exit, reset occurs before services restart", async () => {
      const preview = (await request("admin")).data;
      const exited = new Promise(resolve => child.once("exit", resolve));
      const response = await request("admin", "POST", { token: preview.token, confirmation: RESET_CONFIRMATION, acknowledge: true, method: "password", credential: password });
      assert.equal(response.status, 202); assert.equal(await exited, 1); assert.equal(read("player").tokens, 999999);
      await start();
      assert.match(output, /Gameplay reset completed/); assert.equal(fs.existsSync(resetPendingPath(filename)), false);
      assert.equal((await request("player", "GET", undefined, 0, "/api/me")).status, 401);
      const me = await request("player", "GET", undefined, 1, "/api/me"); assert.equal(me.status, 200); assert.equal(me.data.tokens, 4321);
      const player = read("player");
      for (const key of ["passwordHash", "email", "emailVerifiedAt", "admin", "editor", "active", "friends", "mfa", "registrationAuthorization", "parentalAccess", "privacy", "createdAt"]) assert.deepEqual(player[key], beforePlayer[key], key);
      assert.equal(player.sessionVersion, 1); assert.equal(player.lastDailyClaim, null); assert.equal(player.profile.bio, beforePlayer.profile.bio); assert.deepEqual(player.profile.favoriteGames, ["yahtzee"]);
      for (const key of ["titleGameId", "titleLevel", "rankedBadgeGameId"]) assert.equal(player.profile[key], undefined);
      for (const key of ["gameXp", "gameElo", "siteActivity", "secretTimers"]) assert.equal(player[key], undefined);
      assert.deepEqual(player.notifications, [{ type: "moderation-decision", id: "safety" }]); assert.deepEqual(player.roomInvites, []);
      inspect(db => {
        for (const table of ["rooms", "history", "history_members", "ranked_results", "ranked_settlements", "user_game_xp", "user_game_elo", "user_ranked_placements", "user_achievements", "achievement_progress", "achievement_reward_receipts", "community_event_participants", "community_event_actions", "community_event_pot_entries", "community_event_rewards", "community_event_effects", "leaderboard_seasons", "leaderboard_boards", "leaderboard_entries"]) assert.equal(count(db, table), 0, table);
        assert.equal(count(db, "users"), 3); assert.equal(count(db, "transactions"), 3);
        assert.ok(db.prepare("SELECT 1 FROM achievement_catalog WHERE id='reset-test'").get()); assert.ok(db.prepare("SELECT 1 FROM item_catalog WHERE id='reset-test'").get());
        assert.equal(db.prepare("SELECT value FROM meta WHERE key='admin-settings'").get().value.includes('"testRetainedSetting":"retained"'), true);
        for (const [type, values] of Object.entries(defaultCosmetics)) if (Array.isArray(values)) assert.deepEqual(db.prepare("SELECT item_id FROM user_inventory WHERE user_id='player' AND type=? ORDER BY position").all(type).map(row => row.item_id), values);
        const event = JSON.parse(db.prepare("SELECT data FROM community_events").get().data); assert.equal(event.status, "draft"); assert.equal(event.runtime.pot, 0); assert.equal(event.runtime.finalizedAt, null);
        const backup = new DatabaseSync(path.join(directory, "reset-backups", response.data.id, "main.sqlite"), { readOnly: true });
        try { assert.equal(JSON.parse(backup.prepare("SELECT data FROM users WHERE id='player'").get().data).tokens, 999999); assert.equal(count(backup, "user_game_xp"), 1); } finally { backup.close(); }
      });
      const chat = new DatabaseSync(chatFilename);
      try { assert.equal(count(chat, "chat_messages"), 2); assert.equal(count(chat, "chat_reads"), 2); assert.equal(count(chat, "chat_direct_members"), 1); assert.equal(chat.prepare("SELECT count(*) AS n FROM chat_messages WHERE channel_type='room'").get().n, 0); } finally { chat.close(); }
    });

    await stop();
    await t.test("retry after committed core never resets users twice", () => {
      queueGameplayReset(filename, "admin", resetSummary(filename));
      assert.throws(() => applyPendingGameplayReset({ filename, chatFilename, isRunning: () => false, afterCore: () => { throw new Error("Simulated auxiliary failure"); } }), /Simulated/);
      assert.equal(read("player").sessionVersion, 2); assert.ok(fs.existsSync(resetPendingPath(filename)));
      inspect(db => { const player = read("player"); player.tokens = 4444; db.prepare("UPDATE users SET data=? WHERE id='player'").run(JSON.stringify(player)); });
      const receipt = applyPendingGameplayReset({ filename, chatFilename, isRunning: () => false });
      assert.equal(receipt.summary.signupTokens, 4321); assert.equal(read("player").tokens, 4444); assert.equal(read("player").sessionVersion, 2); assert.equal(fs.existsSync(resetPendingPath(filename)), false);
      assert.equal(applyPendingGameplayReset({ filename, chatFilename }), null);
    });
  } finally {
    await stop();
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir())); assert.ok(path.basename(directory).startsWith("ktga-reset-test-"));
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
