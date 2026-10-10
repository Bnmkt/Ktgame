import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import bcrypt from "bcryptjs";
import { DatabaseSync } from "node:sqlite";
import { createAccountsWork } from "../src/services/accounts-work.js";
import { ProcessWorker } from "../src/services/process-worker.js";
import { createTaskPool } from "../src/services/task-pool.js";
import { createNormalizedStorage } from "../src/storage/normalized.js";
import { createAccountTasks } from "../src/services/account-tasks.js";
import { createAccountDomain, defaultCosmetics } from "../src/services/account-domain.js";
import { ConfigurationCache } from "../src/services/configuration-cache.js";
import { playerStatistics } from "../src/services/player-statistics.js";
import { normalizeRankedConfig } from "../src/services/ranked.js";
import { normalizeProgressionConfig } from "../src/services/game-progression.js";
import { accountsProcessHealth } from "../src/services/process-health.js";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ktga-accounts-process-"));
const filename = path.join(directory, "main.sqlite");
process.env.SQLITE_PATH = filename;
const { readDb, updateDb, closeDatabase } = await import("../src/db.js");
const config = { platform: { siteName: "KTGA Test", dailyBonus: 1000, gameProgression: normalizeProgressionConfig({}) },
  ranked: normalizeRankedConfig({}), shop: [{ id: "dice", type: "diceSkins", name: "Test" }],
  catalog: [{ id: "winner", title: "Winner", group: "Yahtzee", target: 1, rule: { source: "metric", metric: "wins" } }] };
const timestamp = new Date().toISOString();
updateDb((db) => {
  db.users = ["alice", "bob", "hidden"].map((id) => ({ id, pseudo: id, active: true, email: `${id}@example.com`,
    passwordHash: "never-expose-password", emailVerifiedAt: timestamp, createdAt: timestamp, tokens: 1500,
    profile: { birthDate: "1990-01-01", displayName: id === "bob" ? "Éclair" : id },
    cosmetics: structuredClone(defaultCosmetics), gameXp: { yahtzee: 4000 },
    achievements: { unlocked: ["winner"], suppressed: [], unlockedAt: { winner: timestamp } },
    achievementRewards: ["winner"], gameElo: { yahtzee: { elo: 1234, games: 30, wins: 15 } },
    blockedUsers: id === "alice" ? ["hidden"] : [],
    mfa: { totpSecret: "never-expose-totp" }, notifications: [{ id: `notice-${id}`, message: `Only ${id}`, createdAt: timestamp }] }));
  db.history.push({ id: "game-one", gameId: "yahtzee", players: [{ id: "alice", pseudo: "alice" }, { id: "bob", pseudo: "bob" }],
    winners: ["alice"], ranking: [{ id: "alice", score: 250 }, { id: "bob", score: 100 }], payouts: { alice: 20 }, finishedAt: timestamp });
  db.transactions.push({ id: "tx-one", userId: "alice", amount: 20, balance: 1500, reason: "room-payout", createdAt: timestamp });
});
after(() => {
  closeDatabase();
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
  assert.ok(path.basename(directory).startsWith("ktga-accounts-process-"));
  fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});
const setup = (work) => work.configure(config, Object.values(config));
const parsed = (result) => { assert.equal(result.status, 200); return JSON.parse(result.json); };

test("separate process preserves account/public contracts, normalized state and privacy", async () => {
  const work = createAccountsWork(filename), configuration = setup(work), db = readDb();
  const domain = createAccountDomain({ configurationCache: new ConfigurationCache(), platformSettings: () => config.platform,
    rankedConfig: () => config.ranked, achievementCatalog: () => config.catalog, playerStatistics });
  try {
    const expected = structuredClone(db.users.find((row) => row.id === "alice"));
    domain.refreshPublicProfileStats(expected, db);
    const account = parsed(await work.run("account", { userId: "alice", configuration }));
    assert.deepEqual(account, JSON.parse(JSON.stringify(domain.serializeUserInternal(expected, db))));
    assert.equal(account.gameProgression.find((row) => row.gameId === "yahtzee").xp, 4000);
    const profile = parsed(await work.run("public-profile", { userId: "alice", targetId: "bob", configuration }));
    assert.deepEqual(profile, JSON.parse(JSON.stringify(domain.publicUserPayload(structuredClone(db.users[1]), db, "alice"))));
    assert.ok(!/bob@example.com|passwordHash|never-expose|birthDate|"elo"/.test(JSON.stringify(profile)));
    assert.ok(!/never-expose/.test(JSON.stringify(account)));
    const notices = parsed(await work.run("notifications", { userId: "alice", configuration }));
    assert.equal(notices[0].id, "notice-alice"); assert.ok(!JSON.stringify(notices).includes("Only bob"));
    assert.deepEqual(parsed(await work.run("shop", { configuration })), config.shop);
    assert.deepEqual(parsed(await work.run("achievement-list", { userId: "alice", configuration })),
      JSON.parse(JSON.stringify(domain.achievementStatus(expected, db))));
    assert.notEqual(work.health().processes[0].pid, process.pid);
    assert.ok(!/alice@example.com|never-expose|passwordHash/.test(JSON.stringify(work.health())));
  } finally { await work.close(); }
});

test("Unicode search, blocking, missing users and ephemeral guests retain their contracts", async () => {
  const work = createAccountsWork(filename), configuration = setup(work);
  try {
    const rows = parsed(await work.run("user-search", { userId: "alice", query: "écl", configuration }));
    assert.equal(rows[0].pseudo, "Éclair"); assert.equal(rows.length, 1);
    assert.deepEqual(parsed(await work.run("user-search", { userId: "alice", query: "hidden", configuration })), []);
    assert.equal((await work.run("public-profile", { userId: "alice", targetId: "absent", configuration })).status, 404);
    assert.equal((await work.run("account", { userId: "absent", configuration })).status, 404);
    const guest = { id: "guest-only", guest: true, pseudo: "Guest", tokens: 10 };
    assert.equal(parsed(await work.run("account", { userId: guest.id, guest, configuration })).tokens, 10);
    assert.equal(readDb().users.some((user) => user.id === guest.id), false);
    assert.equal((await work.run("account", { userId: "absent", guest, configuration })).status, 404);
  } finally { await work.close(); }
});

test("readonly hydration never runs migrations, and committed writes invalidate projections", async () => {
  const work = createAccountsWork(filename), configuration = setup(work), inspection = new DatabaseSync(filename, { readOnly: true });
  try {
    assert.ok(createNormalizedStorage(inspection, { readOnly: true }).hydrateUser(inspection.prepare("SELECT data FROM users WHERE id='alice'").get()).gameXp);
    assert.throws(() => inspection.exec("UPDATE users SET pseudo='broken'"), /readonly/i);
    assert.equal(parsed(await work.run("public-profile", { userId: "bob", targetId: "alice", configuration })).stats.gamesPlayed, 1);
    updateDb((db) => {
      db.users.find((row) => row.id === "alice").tokens = 777;
      db.history.push({ id: "game-two", gameId: "yahtzee", players: [{ id: "alice" }], winners: ["alice"], finishedAt: timestamp });
    });
    assert.equal(parsed(await work.run("account", { userId: "alice", configuration })).tokens, 777);
    assert.equal(parsed(await work.run("public-profile", { userId: "bob", targetId: "alice", configuration })).stats.gamesPlayed, 2);
    const tasks = createAccountTasks(filename);
    try { assert.throws(() => tasks.run("write-user", { userId: "alice" })); } finally { tasks.close(); }
    await assert.rejects(work.run("write-user", {}), { code: "TASK_WORK_UNSUPPORTED" });
  } finally { inspection.close(); await work.close(); }
});

test("password work is compatible and uses the same single process as history and statistics", async () => {
  const work = createAccountsWork(filename);
  try {
    const hash = await work.passwords.hash("Private-Test!123", 4);
    assert.equal(bcrypt.compareSync("Private-Test!123", hash), true);
    assert.equal(await work.passwords.compare("Private-Test!123", hash), true);
    assert.equal(await work.passwords.compare("wrong", hash), false);
    assert.equal((await work.reading.run("history", { userId: "alice", query: { limit: "1" } })).total, 2);
    assert.equal((await work.reading.run("statistics", { userId: "alice" })).gamesPlayed, 2);
    assert.equal(work.health().started, 1);
    assert.equal(work.passwords.health().processes[0].pid, work.reading.health().processes[0].pid);
    assert.ok(!/Private-Test|\$2[aby]\$/.test(JSON.stringify(work.health())));
  } finally { await work.close(); }
});

test("configuration crosses IPC once per change and no parent secrets are inherited", async () => {
  const previous = { SMTP_PASS: process.env.SMTP_PASS, JWT_SECRET: process.env.JWT_SECRET, NODE_OPTIONS: process.env.NODE_OPTIONS };
  Object.assign(process.env, { SMTP_PASS: "private", JWT_SECRET: "private", NODE_OPTIONS: "--no-warnings" });
  const pool = createTaskPool({ workerUrl: new URL("./fixtures/process-transport.js", import.meta.url),
    services: ["probe"], WorkerClass: ProcessWorker, workerEnv: { CASINO_TIME_ZONE: "Europe/Brussels" } });
  try {
    const one = await pool.run("probe", { configuration: { id: "one", private: "configuration" } });
    assert.equal(one.configuration, "one"); assert.equal(one.inheritedSecret, false); assert.equal(one.timeZone, "Europe/Brussels");
    assert.equal((await pool.run("probe", { configuration: { id: "one" } })).configuration, null);
    assert.equal((await pool.run("probe", { configuration: { id: "two" } })).configuration, "two");
    assert.equal((await pool.run("probe", { configuration: { id: "one" } })).configuration, "one");
    assert.notEqual(one.pid, process.pid);
  } finally {
    await pool.close();
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

test("failed process does not replay a task and its replacement receives configuration", async () => {
  const work = createAccountsWork(filename), configuration = setup(work);
  try {
    await work.run("account", { userId: "alice", configuration });
    const pid = work.health().processes[0].pid;
    const failed = assert.rejects(work.passwords.hash("expensive", 14), { code: "TASK_WORK_UNAVAILABLE" });
    process.kill(pid, "SIGKILL"); await failed;
    const account = parsed(await work.run("account", { userId: "alice", configuration }));
    assert.equal(account.id, "alice"); assert.notEqual(work.health().processes[0].pid, pid);
    assert.equal(work.health().services["password-hash"].failed, 1);
    assert.equal(work.health().unexpectedExits + work.health().workerErrors, 1);
  } finally { await work.close(); }
});

test("process health distinguishes idle, disabled, stalled and saturated accounts", () => {
  assert.equal(accountsProcessHealth(null).status, "disabled");
  const health = { status: "healthy", busy: 0, queued: 0, processes: [] };
  const work = { health: () => health };
  assert.equal(accountsProcessHealth(work).status, "idle");
  health.processes = [{ status: "healthy", at: new Date(1000).toISOString(), cpuPercent: 2, eventLoopP95: 20 }];
  assert.equal(accountsProcessHealth(work, 16001).stale, true);
  health.processes[0].cpuPercent = 95;
  assert.equal(accountsProcessHealth(work, 1000).status, "warning");
  health.processes[0].cpuPercent = 2; health.processes[0].eventLoopP95 = 200;
  assert.equal(accountsProcessHealth(work, 1000).status, "warning");
});

test("an initialization failure rejects batched reads instead of waiting for their deadline", async () => {
  const work = createAccountsWork(`${filename}-missing`, { timeoutMs: 5000 });
  try {
    await assert.rejects(work.run("history", { userId: "alice" }), { code: "TASK_WORK_UNAVAILABLE" });
    assert.equal(work.health().services.history.timedOut, 0);
  } finally { await work.close(); }
});

test("real IPC pipelines and correlates independent account reads without extra processes", async () => {
  const work = createAccountsWork(filename), configuration = setup(work);
  try {
    await work.run("account", { userId: "alice", configuration });
    const hashing = work.passwords.hash("Busy-Pipeline!123", 14);
    const reads = Array.from({ length: 12 }, (_, index) => work.run("notifications", { userId: index % 2 ? "alice" : "bob", configuration }));
    assert.ok(work.health().inFlight > 1); assert.equal(work.health().started, 1);
    const [results] = await Promise.all([Promise.all(reads), hashing]);
    assert.ok(results.every((row) => row.status === 200));
    assert.ok(results.every((row, index) => parsed(row)[0].id === `notice-${index % 2 ? "alice" : "bob"}`));
    assert.equal(work.health().started, 1);
  } finally { await work.close(); }
});

test("a burst of batched account reads remains bounded and isolated per guest", async () => {
  const work = createAccountsWork(filename), configuration = setup(work);
  try {
    const reads = Array.from({ length: 300 }, (_, index) => {
      const id = `transient-${index}`;
      return work.run("notifications", { userId: id, configuration,
        guest: { id, guest: true, notifications: [{ id: `notice-${index}`, type: "info", message: id }] } });
    });
    assert.equal(work.health().inFlight, 256);
    assert.equal(work.health().queued, 44);
    const results = await Promise.all(reads);
    for (const [index, result] of results.entries()) {
      assert.equal(result.status, 200);
      assert.equal(parsed(result)[0].id, `notice-${index}`);
      assert.equal(parsed(result)[0].message, `transient-${index}`);
    }
    assert.equal(work.health().inFlight, 0);
    assert.equal(work.health().services.notifications.completed, 300);
    assert.equal(work.health().started, 1);
  } finally { await work.close(); }
});
