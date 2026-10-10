import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import test, { before, after } from "node:test";
import jwt from "jsonwebtoken";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ktga-game-worker-api-"));
const secret = "isolated-game-worker-api-secret-not-production";
let child, url, output = "";
async function request(id, route, method = "GET", body) {
  const response = await fetch(`${url}${route}`, { method, headers: { "Content-Type": "application/json",
    ...(id ? { Authorization: `Bearer ${jwt.sign({ id, sessionVersion: 0 }, secret)}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json() };
}
before(async () => {
  const db = new DatabaseSync(path.join(directory, "main.sqlite"));
  db.exec("CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); INSERT INTO meta VALUES('legacy-json-migrated','true'); CREATE TABLE users(id TEXT PRIMARY KEY,data TEXT NOT NULL,pseudo TEXT NOT NULL,email TEXT,guest INTEGER)");
  for (const id of ["player", "friend", "admin"]) {
    const user = { id, pseudo: id, email: `${id}@example.test`, active: true, admin: id === "admin", tokens: 100000,
      emailVerifiedAt: new Date().toISOString(), passwordHash: "not-used", profile: { birthDate: "1990-01-01" } };
    db.prepare("INSERT INTO users VALUES(?,?,?,?,0)").run(id, JSON.stringify(user), id, user.email);
  }
  db.close();
  const listener = net.createServer(); await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const port = listener.address().port; await new Promise((resolve) => listener.close(resolve)); url = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ["src/index.js"], { cwd: new URL("../", import.meta.url), windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: {
    ...process.env, DOTENV_CONFIG_PATH: path.join(directory, "disabled.env"), NODE_ENV: "production", GAME_WORKERS_ENABLED: "1", GAME_WORKERS: "2", ACCOUNTS_PROCESS_ENABLED: "0",
    HOST: "127.0.0.1", PORT: String(port), APP_BASE_PATH: "", JWT_SECRET: secret, CLIENT_DIST: "", CLIENT_ORIGIN: url, PUBLIC_APP_URL: url,
    CONTACT_EMAIL: "contact@example.test", HTTPS_KEY_PATH: "", HTTPS_CERT_PATH: "", HTTPS_PFX_PATH: "", SMTP_HOST: "", SMTP_USER: "", SMTP_PASS: "", EMAIL_FROM: "",
    SQLITE_PATH: path.join(directory, "main.sqlite"), PATCHNOTES_UPLOAD_DIR: path.join(directory, "images"), BUG_REPORT_UPLOAD_DIR: path.join(directory, "bugs"),
    ...Object.fromEntries(["PARENTAL_DB_PATH", "TRIBUNAL_DB_PATH", "CHAT_DB_PATH", "STATUS_DB_PATH", "REQUEST_LOG_PATH", "HELP_DB_PATH", "DATA_REQUEST_DB_PATH", "BUG_REPORT_DB_PATH", "PATCHNOTES_DB_PATH", "CONTACT_NOTICE_DB_PATH", "EXECUTION_DB_PATH"].map((key) => [key, path.join(directory, `${key}.sqlite`)]))
  } });
  child.stdout.on("data", (data) => output += data); child.stderr.on("data", (data) => output += data);
  for (let attempt = 0; attempt < 150; attempt++) {
    try { if ((await fetch(`${url}/api/health`)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Worker API startup failed: ${output.slice(-2000)}`);
});
after(async () => {
  if (child && child.exitCode === null) { const exited = new Promise((resolve) => child.once("exit", resolve)); child.kill(); await exited; }
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir())); assert.ok(path.basename(directory).startsWith("ktga-game-worker-api-"));
  fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});
test("game images and featured choice persist and invitation preview cannot bypass protected tables", async () => {
  const game = (await request(null, "/api/games")).data.find((entry) => entry.id === "yahtzee");
  for (const actor of [null, "player"]) assert.equal((await request(actor, "/api/admin/games/yahtzee", "PATCH", { ...game, coverImage: "/images/test.webp" })).status, actor ? 403 : 401);
  assert.equal((await request("admin", "/api/admin/games/yahtzee", "PATCH", { ...game, coverImage: "javascript:alert(1)" })).status, 400);
  assert.equal((await request("admin", "/api/admin/games/yahtzee", "PATCH", { ...game, coverImage: "/images/cover.webp", descriptiveImage: "https://example.com/dice.webp" })).status, 200);
  let updated = (await request(null, "/api/games")).data.find((entry) => entry.id === game.id);
  assert.equal(updated.coverImage, "/images/cover.webp"); assert.equal(updated.descriptiveImage, "https://example.com/dice.webp");
  assert.equal((await request("admin", "/api/admin/games/yahtzee", "PATCH", { ...updated, coverImage: "N/A" })).status, 200);
  updated = (await request(null, "/api/games")).data.find((entry) => entry.id === game.id);
  assert.equal(updated.coverImage, "");
  assert.equal((await request("admin", "/api/admin/settings", "PATCH", { featuredGameId: "yahtzee" })).status, 200);
  assert.equal((await request(null, "/api/config")).data.featuredGameId, "yahtzee");
  const created = await request("player", "/api/rooms", "POST", { gameId: "yahtzee", stake: 10, name: "Private invitation", isPublic: false, password: "table-code" });
  assert.equal(created.status, 200, JSON.stringify(created.data));
  const code = created.data.code;
  try {
    const preview = await request(null, `/api/table-entry/${code}`);
    assert.equal(preview.status, 200);
    assert.deepEqual(preview.data, { code, hostName: "player", requiresPassword: true, ranked: false });
    assert.equal((await request(null, `/api/rooms/${code}/join`, "POST")).status, 401);
    assert.equal((await request("friend", `/api/rooms/${code}/join`, "POST", {})).status, 403);
    assert.equal((await request("friend", `/api/rooms/${code}/join`, "POST", { password: "table-code" })).status, 200);
  } finally { await request("player", `/api/rooms/${code}`, "DELETE"); }
  assert.equal((await request(null, `/api/table-entry/${code}`)).status, 404);
});

test("existing room API runs through two Game Workers without exposing worker metadata", async () => {
  const create = async (name) => {
    const result = await request("player", "/api/rooms", "POST", { gameId: "yahtzee", name, stake: 10 });
    assert.equal(result.status, 200, JSON.stringify(result.data)); assert.ok(!result.data.gameWorker); return result.data;
  };
  const first = await create("First worker"), second = await create("Second worker");
  const joined = await request("friend", `/api/rooms/${first.code}/join`, "POST", {}); assert.equal(joined.status, 200);
  assert.equal((await request("friend", `/api/rooms/${first.code}/ready`, "POST", {})).status, 200);
  const started = await request("player", `/api/rooms/${first.code}/start`, "POST", {});
  assert.equal(started.status, 200, JSON.stringify(started.data)); assert.equal(started.data.state.gameId, "yahtzee");
  const roll = await request("player", `/api/rooms/${first.code}/action`, "POST", { type: "roll" });
  assert.equal(roll.status, 200, JSON.stringify(roll.data)); assert.equal(roll.data.state.dice.length, 5);
  const score = await request("player", `/api/rooms/${first.code}/action`, "POST", { type: "score", category: "chance" });
  assert.equal(score.status, 200, JSON.stringify(score.data));
  assert.equal((await request("friend", `/api/rooms/${first.code}/action`, "POST", { type: "roll" })).status, 409);
  if (score.data.pacing) assert.equal((await request("friend", `/api/rooms/${first.code}/pacing/skip`, "POST", { pacingId: score.data.pacing.id })).status, 200);
  const health = await request("admin", "/api/admin/health");
  assert.equal(health.status, 200); assert.equal(health.data.gameWorkers.rooms, 2);
  assert.deepEqual(health.data.gameWorkers.workers.map((worker) => worker.assignedRooms), [1, 1]);
  assert.ok(health.data.gameWorkers.workers.every((worker) => worker.pid && worker.pid !== health.data.process.pid));
  assert.ok(health.data.gameWorkers.actions.count >= 7);
  assert.equal(health.data.services.rooms.mode, "game-process"); assert.ok(health.data.services.rooms.completed >= 7);
  assert.equal((await request("player", "/api/me")).data.tokens, 99990);
  assert.equal((await request("friend", "/api/me")).data.tokens, 99990);
  assert.equal((await request("player", `/api/rooms/${first.code}`, "DELETE")).status, 200);
  assert.equal((await request("player", `/api/rooms/${second.code}`, "DELETE")).status, 200);
});

test("profile, equipment and shop changes never write a worker-owned room directly", async () => {
  const created = await request("player", "/api/rooms", "POST", { gameId: "yahtzee", name: "Profile changes", stake: 10 });
  assert.equal(created.status, 200, JSON.stringify(created.data)); const code = created.data.code;
  try {
    const renamed = await request("player", "/api/me", "PATCH", { displayName: "Updated player" });
    assert.equal(renamed.status, 200, JSON.stringify(renamed.data));
    const purchased = await request("player", "/api/shop/purchase", "POST", { itemId: "name-gold" });
    assert.equal(purchased.status, 200, JSON.stringify(purchased.data));
    const equipment = await request("player", "/api/me/cosmetics", "PATCH", { nameEffect: "gold" });
    assert.equal(equipment.status, 200, JSON.stringify(equipment.data));
    const catalog = (await request("player", "/api/shop")).data;
    const packItem = catalog.filter((item) => !item.rewardOnly && item.packs?.length && item.price < 90000).sort((a, b) => a.price - b.price)[0];
    assert.ok(packItem);
    const packed = await request("player", "/api/shop/purchase-pack", "POST", { packId: packItem.packs[0], itemIds: [packItem.id] });
    assert.equal(packed.status, 200, JSON.stringify(packed.data));
    const beforeStart = (await request("player", `/api/rooms/${code}`)).data;
    assert.equal(beforeStart.players[0].pseudo, "Updated player");
    const started = await request("player", `/api/rooms/${code}/start`, "POST", {});
    assert.equal(started.status, 200, JSON.stringify(started.data));
    assert.equal(started.data.state.players[0].pseudo, "Updated player");
    assert.equal(started.data.state.players[0].cosmetics.equipped.nameEffect, packItem.type === "nameEffects" ? packItem.value : "gold");
    assert.equal((await request("player", `/api/rooms/${code}/action`, "POST", { type: "roll" })).status, 200);
  } finally { assert.equal((await request("player", `/api/rooms/${code}`, "DELETE")).status, 200); }
});
