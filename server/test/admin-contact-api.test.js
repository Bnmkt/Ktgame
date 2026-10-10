import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import test, { before, after } from "node:test";
import jwt from "jsonwebtoken";
import { createRequire } from "node:module";
const { io } = createRequire(new URL("../../client/package.json", import.meta.url))("socket.io-client");

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ktga-contact-api-"));
const secret = "isolated-contact-configuration-test-secret";
let child, url, port, output = "";
async function request(id, route, method = "GET", body, origin = "https://www.ktga.me") {
  const response = await fetch(`${url}${route}`, { method, headers: { Origin: origin, "Content-Type": "application/json", ...(id ? { Authorization: `Bearer ${jwt.sign({ id, sessionVersion: 0 }, secret, { expiresIn: "1h" })}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const text = await response.text();
  return { status: response.status, headers: response.headers, data: response.headers.get("content-type")?.includes("json") ? JSON.parse(text) : text };
}
async function start(accountsProcess = "1") {
  child = spawn(process.execPath, ["src/index.js"], { cwd: new URL("../", import.meta.url), windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env,
    NODE_ENV: "production", DOTENV_CONFIG_PATH: path.join(directory, "disabled.env"), ACCOUNTS_PROCESS_ENABLED: accountsProcess ?? undefined, PORT: String(port), HOST: "127.0.0.1", TLS_TERMINATION: "proxy", TRUST_PROXY: "loopback", APP_BASE_PATH: "", JWT_SECRET: secret, CLIENT_DIST: "", CLIENT_ORIGIN: "https://www.ktga.me", PUBLIC_APP_URL: "https://www.ktga.me", CONTACT_EMAIL: "environment@example.com", HTTPS_KEY_PATH: "", HTTPS_CERT_PATH: "", HTTPS_PFX_PATH: "", SMTP_HOST: "", SMTP_USER: "", SMTP_PASS: "", EMAIL_FROM: "",
    SQLITE_PATH: path.join(directory, "main.sqlite"), PATCHNOTES_UPLOAD_DIR: path.join(directory, "note-images"), BUG_REPORT_UPLOAD_DIR: path.join(directory, "bug-images"),
    ...Object.fromEntries(["PARENTAL_DB_PATH", "TRIBUNAL_DB_PATH", "CHAT_DB_PATH", "STATUS_DB_PATH", "REQUEST_LOG_PATH", "HELP_DB_PATH", "DATA_REQUEST_DB_PATH", "BUG_REPORT_DB_PATH", "PATCHNOTES_DB_PATH", "CONTACT_NOTICE_DB_PATH"].map((key) => [key, path.join(directory, `${key}.sqlite`)]))
  } });
  child.stdout.on("data", (data) => output += data); child.stderr.on("data", (data) => output += data);
  for (let attempt = 0; attempt < 150; attempt++) {
    try { if ((await fetch(`${url}/api/health`)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Startup failed: ${output.slice(-2000)}`);
}
async function stop() {
  if (child && child.exitCode === null) {
    const exited = new Promise((resolve) => child.once("exit", resolve)); child.kill(); await exited;
  }
}
before(async () => {
  const db = new DatabaseSync(path.join(directory, "main.sqlite"));
  db.exec("CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); INSERT INTO meta VALUES('legacy-json-migrated','true'); CREATE TABLE users(id TEXT PRIMARY KEY,data TEXT NOT NULL,pseudo TEXT NOT NULL,email TEXT,guest INTEGER)");
  for (const id of ["player", "editor", "admin"]) {
    const user = { id, pseudo: id, email: `${id}@example.com`, emailVerifiedAt: new Date().toISOString(), active: true, admin: id === "admin", editor: id === "editor", tokens: 1000, passwordHash: "unused-test-hash", profile: { birthDate: "1990-01-01" }, createdAt: new Date().toISOString() };
    db.prepare("INSERT INTO users VALUES(?,?,?,?,0)").run(id, JSON.stringify(user), id, user.email);
  }
  db.close();
  const listener = net.createServer(); await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
  port = listener.address().port; await new Promise((resolve) => listener.close(resolve)); url = `http://127.0.0.1:${port}`;
  await start();
});
after(async () => {
  await stop(); assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
  assert.ok(path.basename(directory).startsWith("ktga-contact-api-")); fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});
test("only administrators can change the contact, with strict validation and live public/data-request updates", async () => {
  assert.equal((await request(null, "/api/config")).data.contactEmail, "environment@example.com");
  for (const id of [null, "player", "editor"]) assert.equal((await request(id, "/api/admin/settings", "PATCH", { contactEmail: "other@example.com" })).status, id ? 403 : 401);
  for (const contactEmail of ["", "invalid", "mailto:x@example.com", "x@example.com\r\nBcc: victim@example.com", ["x@example.com"], null]) {
    assert.equal((await request("admin", "/api/admin/settings", "PATCH", { contactEmail })).status, 400);
  }
  const saved = await request("admin", "/api/admin/settings", "PATCH", { contactEmail: " Updated@Example.com " });
  assert.equal(saved.status, 200); assert.equal(saved.data.contactEmail, "updated@example.com"); assert.equal(saved.data.supportEmail, saved.data.contactEmail);
  assert.match(saved.headers.get("set-cookie"), /Secure/); assert.match(saved.headers.get("set-cookie"), /HttpOnly/);
  const publicConfig = await request(null, "/api/config");
  assert.equal(publicConfig.data.supportEmail, saved.data.contactEmail); assert.ok(!JSON.stringify(publicConfig.data).includes(secret));
  assert.equal((await request("player", "/api/me/data-requests")).data.contactEmail, saved.data.contactEmail);
  await stop(); await start();
  assert.equal((await request(null, "/api/config")).data.contactEmail, saved.data.contactEmail);
});
test("capacity test routes are private, admin-only and strictly configured", async () => {
  for (const id of [null, "player", "editor"]) {
    for (const [route, method] of [["/api/admin/tests", "GET"], ["/api/admin/tests", "POST"], ["/api/admin/tests/unknown/export", "GET"], ["/api/admin/tests/unknown/stop", "POST"]]) assert.equal((await request(id, route, method, method === "POST" ? { confirm: true, config: {} } : undefined)).status, id ? 403 : 401);
  }
  const result = await request("admin", "/api/admin/tests"); assert.equal(result.status, 200); assert.equal(result.headers.get("cache-control"), "no-store"); assert.equal(result.data.games.length, 15);
  assert.equal((await request("admin", "/api/admin/tests", "POST", { config: {} })).status, 400);
  assert.equal((await request("admin", "/api/admin/tests", "POST", { confirm: true, config: { target: "https://api.ktga.me" } })).status, 400);
  assert.equal((await request("admin", "/api/admin/tests/unknown/export")).status, 404);
});
test("compressed API responses retain their complete JSON contract", async () => {
  const result = await request("player", "/api/achievements");
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("content-encoding"), "gzip");
  assert.ok(result.data.length > 100);
  assert.ok(result.data.every((row) => row.id && typeof row.title === "string"));
});

test("desktop supervision authenticates admins and editors without widening administrator privileges", async () => {
  for (const route of ["/api/desktop/overview", "/api/desktop/metrics?days=90", "/api/desktop/status?days=7"]) {
    assert.equal((await request(null, route)).status, 401);
    assert.equal((await request("player", route)).status, 403);
    for (const id of ["editor", "admin"]) {
      const result = await request(id, route);
      assert.equal(result.status, 200); assert.equal(result.headers.get("cache-control"), "no-store");
      const serialized = JSON.stringify(result.data);
      for (const privateValue of [secret, "player@example.com", "editor@example.com", "admin@example.com", "unused-test-hash", directory.replaceAll("\\", "\\\\")]) assert.ok(!serialized.includes(privateValue));
    }
  }
  const editor = (await request("editor", "/api/desktop/overview")).data;
  assert.deepEqual(editor.viewer, {name:"editor",role:"editor"}); assert.equal(editor.schemaVersion, 1);
  assert.ok(editor.health.process.memory.rss > 0); assert.equal(editor.health.system.hostname, undefined);
  assert.equal(editor.health.database.path, undefined); assert.equal(editor.health.traffic.routes, undefined);
  assert.equal((await request("editor", "/api/admin/health")).status, 403);
  assert.equal((await request("editor", "/api/desktop/metrics?days=invalid")).data.days, 30);
});
test("new domain CORS and root Socket.IO work without the legacy prefix", async () => {
  const response = await request(null, "/api/health");
  assert.equal(response.status, 200); assert.equal(response.headers.get("access-control-allow-origin"), "https://www.ktga.me");
  assert.equal(response.headers.get("access-control-allow-credentials"), "true");
  const denied = await request(null, "/api/health", "GET", null, "https://unrelated.example.com");
  assert.ok(denied.status >= 400); assert.equal(denied.headers.get("access-control-allow-origin"), null);
  const polling = await fetch(`${url}/socket.io/?EIO=4&transport=polling`, { headers: { Origin: "https://www.ktga.me" } });
  assert.equal(polling.status, 200); assert.match(await polling.text(), /^0\{"sid":/);
  const socket = new WebSocket(`${url.replace("http:", "ws:")}/socket.io/?EIO=4&transport=websocket`);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.close(); reject(new Error("WebSocket handshake timed out.")); }, 5000);
    socket.addEventListener("error", (error) => { clearTimeout(timer); reject(error); }, { once: true });
    socket.addEventListener("message", (event) => { clearTimeout(timer); assert.match(String(event.data), /^0\{"sid":/); socket.close(); resolve(); }, { once: true });
  });
});

test("lobby lists are not broadcast to chat and table streams, including legacy seated clients", async () => {
  const token = jwt.sign({ id: "player", sessionVersion: 0 }, secret, { expiresIn: "1h" });
  const streams = ["lobby", "conversation", "table", undefined];
  const connections = streams.map((stream) => ({ updates: [], patches: [], messages: [], socket: io(url, { auth: { token, stream, lobbyDeltas:stream === "lobby" }, transports: ["websocket"], autoConnect: false, extraHeaders: { Origin: "https://www.ktga.me" } }) }));
  const wait = (socket, event) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(event, done); reject(new Error(`${event} timed out`)); }, 3000);
    const done = (data) => { clearTimeout(timer); resolve(data); };
    socket.once(event, done);
  });
  let room;
  try {
    for (const entry of connections) { entry.socket.on("rooms", (rows) => entry.updates.push(rows)); entry.socket.on("rooms-patch", (patch) => entry.patches.push(patch)); entry.socket.on("chat-message", (message) => entry.messages.push(message)); const connected = wait(entry.socket, "connect"); entry.socket.connect(); await connected; }
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal((await request("player", "/api/chat/messages", "POST", {channelType:"global",content:"Stream isolation"})).status, 201);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual(connections.map((entry) => entry.messages.length), [0, 1, 0, 1]);
    for (const entry of connections) entry.updates.length = 0;
    const created = await request("player", "/api/rooms", "POST", { gameId: "yahtzee", name: "Capacity subscriptions", stake: 10, isPublic: true });
    assert.equal(created.status, 200); room = created.data;
    await new Promise((resolve) => setTimeout(resolve, 2600));
    assert.equal(connections[0].updates.length, 0);
    assert.ok(connections[0].patches.at(-1).upsert.some((row) => row.id === room.id));
    assert.equal(connections[1].updates.length, 0); assert.equal(connections[2].updates.length, 0);
    assert.ok(connections[3].updates.length > 0);
    for (const index of [2, 3]) {
      const received = wait(connections[index].socket, "room");
      connections[index].socket.emit("watch-room", { roomId: room.id, token });
      const projected = await received;
      assert.equal(projected.id, room.id);
      assert.ok(projected.players[0].cosmetics.equipped.diceSkin);
      assert.equal(projected.players[0].cosmetics.icons, undefined);
    }
    for (const entry of connections) entry.updates.length = 0;
    assert.equal((await request("player", `/api/rooms/${room.code}`, "DELETE")).status, 200); room = null;
    await new Promise((resolve) => setTimeout(resolve, 2600));
    assert.deepEqual(connections[0].patches.at(-1), {upsert:[],remove:[created.data.id]});
    assert.equal(connections[0].updates.length, 0);
    for (const entry of connections.slice(1)) assert.equal(entry.updates.length, 0);
  } finally {
    for (const entry of connections) entry.socket.disconnect();
    if (room) await request("player", `/api/rooms/${room.code}`, "DELETE");
  }
});

test("shared chat broadcasts still exclude muted recipients and preserve viewer-specific links", async () => {
  const connections = ["player", "editor"].map((id) => ({ messages: [], socket: io(url, { auth: { token: jwt.sign({id,sessionVersion:0},secret), stream:"conversation" }, transports:["websocket"], autoConnect:false, extraHeaders:{Origin:"https://www.ktga.me"} }) }));
  let room;
  try {
    for (const entry of connections) {
      entry.socket.on("chat-message", (message) => entry.messages.push(message));
      const ready = new Promise((resolve) => entry.socket.once("chat-ready", resolve));
      entry.socket.connect(); await ready;
    }
    assert.equal((await request("editor", "/api/connections/muted/player", "POST", {})).status, 200);
    assert.equal((await request("player", "/api/chat/messages", "POST", {channelType:"global",content:"Shared visibility regression"})).status, 201);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual(connections.map((row) => row.messages.length), [1,0]);
    assert.equal((await request("editor", "/api/connections/muted/player", "DELETE")).status, 200);
    room = (await request("player", "/api/rooms", "POST", {gameId:"yahtzee",name:"Private link context",stake:10,isPublic:false})).data;
    await new Promise((resolve) => setTimeout(resolve, 1100));
    assert.equal((await request("player", "/api/chat/messages", "POST", {channelType:"global",content:`https://www.ktga.me/table/${room.code}`})).status, 201);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(connections[0].messages.at(-1).links[0].detail, room.name);
    assert.equal(connections[1].messages.at(-1).links[0].detail, "");
  } finally {
    for (const entry of connections) entry.socket.disconnect();
    if (room) await request("player", `/api/rooms/${room.code}`, "DELETE");
    await request("editor", "/api/connections/muted/player", "DELETE");
  }
});

test("chat sender reuse retains visibility rules and muting does not expose unread messages", async () => {
  assert.equal((await request("player", "/api/friends/request", "POST", {userId:"editor"})).status, 200);
  assert.equal((await request("editor", "/api/friends/player/accept", "POST", {})).status, 200);
  const sent = await request("editor", "/api/chat/messages", "POST", {channelType:"direct",friendId:"player",content:"Private capacity regression"});
  assert.equal(sent.status, 201);
  const unread = await request("player", "/api/chat/unread");
  assert.equal(unread.data.channels.find((row)=>row.friendId === "editor").count, 1);
  const messages = await request("player", "/api/chat/messages?channelType=direct&friendId=editor");
  assert.equal(messages.data.messages.length, 1); assert.equal(messages.data.messages[0].sender.id, "editor");
  assert.equal((await request("player", "/api/connections/muted/editor", "POST", {})).status, 200);
  assert.equal((await request("player", "/api/chat/unread")).data.channels.find((row)=>row.friendId === "editor").count, 0);
  assert.equal((await request("player", "/api/chat/messages?channelType=direct&friendId=editor")).data.messages.length, 0);
  assert.equal((await request("player", "/api/connections/muted/editor", "DELETE")).status, 200);
  assert.equal((await request("player", "/api/chat/unread")).data.channels.find((row)=>row.friendId === "editor").count, 1);
  assert.equal((await request("player", "/api/friends/editor", "DELETE")).status, 200);
});

test("focused friend repair persists both ends without rewriting unrelated accounts", async () => {
  await stop();
  const db = new DatabaseSync(path.join(directory, "main.sqlite"));
  const player = JSON.parse(db.prepare("SELECT data FROM users WHERE id='player'").get().data);
  const editor = JSON.parse(db.prepare("SELECT data FROM users WHERE id='editor'").get().data);
  player.friendRequests = { incoming: [], outgoing: ["editor", "missing", "player"] };
  editor.friendRequests = { incoming: [], outgoing: [] };
  const update = db.prepare("UPDATE users SET data=? WHERE id=?");
  update.run(JSON.stringify(player), "player"); update.run(JSON.stringify(editor), "editor");
  db.close(); await start();
  const snapshot = new DatabaseSync(path.join(directory, "main.sqlite"), { readOnly: true });
  const adminBefore = snapshot.prepare("SELECT data FROM users WHERE id='admin'").get().data;
  snapshot.close();
  const outgoing = await request("player", "/api/friends");
  assert.equal(outgoing.status, 200); assert.deepEqual(outgoing.data.outgoing.map((row) => row.id), ["editor"]);
  const persisted = new DatabaseSync(path.join(directory, "main.sqlite"), { readOnly: true });
  assert.equal(persisted.prepare("SELECT data FROM users WHERE id='admin'").get().data, adminBefore);
  assert.deepEqual(JSON.parse(persisted.prepare("SELECT data FROM users WHERE id='editor'").get().data).friendRequests.incoming, ["player"]);
  persisted.close();
  await stop(); await start();
  assert.deepEqual((await request("editor", "/api/friends")).data.incoming.map((row) => row.id), ["player"]);
  assert.equal((await request("editor", "/api/friends/player/accept", "POST", {})).status, 200);
  assert.deepEqual((await request("player", "/api/friends")).data.friends.map((row) => row.id), ["editor"]);
  assert.deepEqual((await request("editor", "/api/friends")).data.friends.map((row) => row.id), ["player"]);
  assert.equal((await request("player", "/api/friends/editor", "DELETE")).status, 200);
});

test("account refresh persists its own profile without rewriting other accounts", async () => {
  const db = new DatabaseSync(path.join(directory, "main.sqlite"));
  db.exec("CREATE TABLE account_write_audit(id TEXT); CREATE TRIGGER account_write_check AFTER UPDATE ON users BEGIN INSERT INTO account_write_audit VALUES(new.id); END;");
  try {
    const before = db.prepare("SELECT id,data FROM users WHERE id!='player' ORDER BY id").all();
    const response = await request("player", "/api/me");
    assert.equal(response.status, 200); assert.equal(response.data.id, "player");
    assert.deepEqual(db.prepare("SELECT id,data FROM users WHERE id!='player' ORDER BY id").all(), before);
    assert.ok(db.prepare("SELECT id FROM account_write_audit").all().every((row) => row.id === "player"));
    await stop(); await start();
    assert.equal((await request("player", "/api/me")).data.id, "player");
  } finally {
    db.exec("DROP TRIGGER account_write_check; DROP TABLE account_write_audit;");
    db.close();
  }
});

test("cached achievement metrics refresh after balance, XP and rule changes", async () => {
  const account = (await request("player", "/api/me")).data;
  const created = await request("admin", "/api/admin/achievements", "POST", {
    title:"Capacity metric", description:"Cache regression", type:"site", group:"Tests", target:100000,
    rule:{source:"metric",metric:"tokens"}
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const metric = async () => (await request("player", "/api/achievements")).data.find((row) => row.id === created.data.id);
  assert.equal((await metric()).progress, account.tokens);
  assert.equal((await request("admin", "/api/admin/users/player", "PATCH", {tokens:account.tokens+1})).status, 200);
  assert.equal((await metric()).progress, account.tokens+1);
  assert.equal((await request("admin", `/api/admin/achievements/${created.data.id}`, "PATCH", {rule:{source:"metric",metric:"gameXp.yahtzee"}})).status, 200);
  assert.equal((await metric()).progress, 0);
  assert.equal((await request("admin", "/api/admin/users/player", "PATCH", {gameXp:{yahtzee:10},progressionExpected:{gameXp:{yahtzee:0}}})).status, 200);
  assert.equal((await metric()).progress, 10);
  assert.equal((await request("admin", "/api/admin/users/player", "PATCH", { profileStats: { memberCardStats: ["customAchievement", "hidden"], customAchievementIds: [created.data.id, ""] } })).status, 200);
  const stats = async () => (await request("player", "/api/me")).data.profileStats.publicStats;
  assert.equal((await stats())[0].value, "Capacity metric");
  assert.equal((await stats())[0].value, "Capacity metric");
  assert.equal((await request("admin", `/api/admin/achievements/${created.data.id}`, "PATCH", {title:"Updated metric"})).status, 200);
  assert.equal((await stats())[0].value, "Updated metric");
  assert.equal((await request("admin", "/api/admin/users/player", "PATCH", { profileStats: { memberCardStats: ["hidden", "hidden"] } })).status, 200);
  assert.deepEqual(await stats(), []);
});

test("execution telemetry is admin-only, anonymous and included in bounded health history", async () => {
  for (const id of [null, "player", "editor"]) assert.equal((await request(id, "/api/admin/health")).status, id ? 403 : 401);
  for (const id of [null, "player", "editor"]) assert.equal((await request(id, "/api/admin/execution-history")).status, id ? 403 : 401);
  const persisted = await request("admin", "/api/admin/execution-history?days=999999");
  assert.equal(persisted.status, 200); assert.equal(persisted.data.days, 30);
  await request("player", "/api/me"); await request("player", "/api/me");
  for (const route of ["/api/history?paged=1&limit=5", "/api/transactions?paged=1&limit=5", "/api/me/statistics"]) {
    assert.equal((await request("player", route)).status, 200);
    assert.equal((await request(null, route)).status, 401);
  }
  const response = await request("admin", "/api/admin/health?points=30");
  assert.equal(response.status, 200);
  const { workers, caches, history } = response.data;
  assert.equal(workers.password.started, 1); assert.equal(workers.password.submitted, 0);
  assert.equal(workers.password.sharedProcess, true);
  assert.equal(workers.password.queueCapacity, 512); assert.equal(workers.password.wait.p95Ms, null);
  assert.deepEqual(Object.keys(caches), ["configuration", "statistics", "achievements", "memberStats"]);
  assert.ok(caches.configuration.hits > 0); assert.ok(caches.statistics.hits > 0);
  assert.equal(caches.statistics.capacity, 2048); assert.equal(caches.achievements.capacity, 2048);
  assert.equal(caches.memberStats.capacity, 2048); assert.ok(caches.memberStats.hits > 0);
  assert.ok(history.length > 0 && history.length <= 30); assert.equal(history.at(-1).workerQueued, 0);
  assert.ok(Object.hasOwn(history.at(-1), "cacheConfigurationHitRate"));
  assert.ok(!/unused-test-hash|private-setting|passwordHash|monitorToken/.test(JSON.stringify({workers,caches})));
  assert.equal(workers.reading.started, 1); assert.equal(workers.reading.queueCapacity, 512);
  assert.equal(response.data.services.history.mode, "accounts-process");
  assert.equal(response.data.services.account.mode, "accounts-process");
  assert.ok(response.data.services.account.completed >= 2);
  assert.notEqual(response.data.processes.site.pid, response.data.processes.accounts.pid);
  assert.ok(Object.hasOwn(history.at(-1), "accountsCpu"));
  assert.equal(response.data.services.history.completed, 1);
  assert.equal(response.data.executionHistory.retentionDays, 30);
  assert.ok(!/unused-test-hash|private-setting|passwordHash|monitorToken/.test(JSON.stringify(response.data.services)));
});

test("in-flight account projections are not delivered after revocation", { skip: process.platform === "win32" ? "SIGSTOP is unavailable on Windows; exercised on Debian." : false }, async () => {
  const pid = (await request("admin", "/api/admin/health")).data.processes.accounts.pid;
  let privateRead;
  process.kill(pid, "SIGSTOP");
  try {
    privateRead = request("player", "/api/me");
    let admitted = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      const health = await request("admin", "/api/admin/health");
      if (health.data.services.account.busy) { admitted = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.equal(admitted, true);
    assert.equal((await request("admin", "/api/admin/users/player", "PATCH", { active: false })).status, 200);
  } finally { process.kill(pid, "SIGCONT"); }
  const rejected = await privateRead;
  assert.ok([401, 403].includes(rejected.status));
  assert.ok(!Object.hasOwn(rejected.data, "email"));
});

test("accounts separation remains opt-in and legacy reads stay available", async () => {
  await stop();
  for (const flag of [null, "0"]) {
    await start(flag);
    assert.equal((await request("editor", "/api/me")).status, 200);
    assert.equal((await request("editor", "/api/history?paged=1&limit=5")).status, 200);
    const response = await request("admin", "/api/admin/health");
    assert.equal(response.status, 200);
    assert.equal(response.data.processes.accounts.status, "disabled");
    assert.equal(response.data.services.account.mode, "main");
    assert.equal(response.data.services.history.mode, "read-worker");
    await stop();
  }
});
