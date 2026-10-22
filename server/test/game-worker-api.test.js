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
  for (const id of ["player", "friend", "admin", "editor"]) {
    const user = { id, pseudo: id, email: `${id}@example.test`, active: true, admin: id === "admin", tokens: 100000,
      emailVerifiedAt: new Date().toISOString(), editor: id === "editor", passwordHash: "not-used", profile: { birthDate: "1990-01-01" } };
    db.prepare("INSERT INTO users VALUES(?,?,?,?,0)").run(id, JSON.stringify(user), id, user.email);
  }
  db.close();
  const listener = net.createServer(); await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const port = listener.address().port; await new Promise((resolve) => listener.close(resolve)); url = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ["src/index.js"], { cwd: new URL("../", import.meta.url), windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: {
    ...process.env, DOTENV_CONFIG_PATH: path.join(directory, "disabled.env"), NODE_ENV: "production", GAME_WORKERS_ENABLED: process.env.TEST_GAME_WORKERS_ENABLED ?? "1", GAME_WORKERS: "2", ACCOUNTS_PROCESS_ENABLED: "0",
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

test("admin overview is private and missing legacy registration dates never count as recent", async () => {
  for (const actor of [null, "player", "editor"]) assert.equal((await request(actor, "/api/admin/overview")).status, actor ? 403 : 401);
  for (const days of [1, 7, 30]) {
    const response = await request("admin", `/api/admin/overview?days=${days}`);
    assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.equal(response.data.period.days, days);
    assert.equal(response.data.activity.daily.length, days);
    assert.equal(response.data.users.newInPeriod, 0);
    assert.equal(response.data.users.unknownRegistrationDates, 4);
    assert.ok(response.data.health.status);
  }
  assert.equal((await request("admin", "/api/admin/overview?days=100000")).data.period.days, 7);
  const legacy = (await request("admin", "/api/admin")).data;
  assert.equal(legacy.overview.users.new7d, 0);
  assert.ok(legacy.users.every((user) => user.createdAt === null));
  const metrics = (await request("admin", "/api/admin/metrics?days=30")).data;
  assert.equal(metrics.summary.newAccounts, 0);
});

test("ranked bot completion is admin-only and starts and settles through the owning worker", async () => {
  assert.equal((await request("player","/api/ranked/queue/fill-bots","POST")).status,403);
  assert.equal((await request("editor","/api/ranked/queue/fill-bots","POST")).status,403);
  assert.equal((await request(null,"/api/ranked/queue/fill-bots","POST")).status,401);
  const original=(await request("admin","/api/admin/ranked")).data.settings;
  const settings=structuredClone(original);settings.games.yahtzee.players=2;settings.games.yahtzee.maximumPlayers=2;
  await request("admin","/api/admin/ranked","PUT",settings);
  try {
    assert.equal((await request("admin","/api/ranked/queue","POST",{gameId:"yahtzee"})).status,200);
    const filled=await request("admin","/api/ranked/queue/fill-bots","POST");
    assert.equal(filled.status,200);assert.equal(filled.data.proposal.players.filter((row)=>row.isBot).length,1);
    assert.equal(filled.data.proposal.accepted,false);
    const proposal=filled.data.proposal;
    await request("admin","/api/ranked/ready","POST",{proposalId:proposal.id});
    await new Promise((resolve)=>setTimeout(resolve,Math.max(0,proposal.startsAfter-Date.now())+1500));
    let match;
    for (let attempt=0;attempt<50 && !match;attempt++) {match=(await request("admin","/api/ranked")).data.match;if(!match)await new Promise((resolve)=>setTimeout(resolve,200));}
    assert.ok(match,output.slice(-1200));
    const room=(await request("admin",`/api/rooms/${match.code}`)).data;
    assert.ok(room.state);assert.equal(room.ranked.roster.filter((row)=>row.isBot).length,1);
    assert.equal((await request("admin",`/api/rooms/${match.code}/leave`,"POST")).status,200);
    const history=(await request("admin","/api/ranked/history")).data.rows.filter((row)=>row.matchId===room.ranked.matchId);
    assert.equal(history.length,1);assert.equal(history[0].placement.games,1);
    const inspection=new DatabaseSync(path.join(directory,"main.sqlite"),{readOnly:true});
    try { assert.equal(inspection.prepare("SELECT games FROM user_game_elo WHERE user_id='admin' AND game_id='yahtzee'").get().games,1); } finally {inspection.close();}
    const observation=(await request("player",`/api/rooms/${match.code}`)).data;
    assert.ok(observation.ranked.results.every((row)=>row.before===undefined && row.beforeProgression===undefined));
  } finally { await request("admin","/api/ranked/queue","DELETE");await request("admin","/api/admin/ranked","PUT",original); }
});
test("administrators list every private room and close through its worker without widening public access", async () => {
  for (const actor of [null, "player", "editor"]) assert.equal((await request(actor, "/api/admin/rooms")).status, actor ? 403 : 401);
  const codes = [];
  try {
    for (let i = 0; i < 8; i++) {
      const created = await request("player", "/api/rooms", "POST", { gameId: "yahtzee", name: `Private ${i}`, isPublic: false, password: "table-only-secret" });
      assert.equal(created.status, 200, JSON.stringify(created.data));
      codes.push(created.data.code);
    }
    const listing = await request("admin", "/api/admin/rooms");
    assert.equal(listing.status, 200);
    assert.equal(listing.data.filter((room) => codes.includes(room.code)).length, 8);
    assert.ok(listing.data.filter((room) => codes.includes(room.code)).every((room) => !room.isPublic && room.protected && room.state === undefined && room.passwordHash === undefined));
    const publicRooms = await request(null, "/api/rooms");
    assert.ok(publicRooms.data.every((room) => !codes.includes(room.code)));
    for (const actor of [null, "friend", "editor"]) assert.equal((await request(actor, `/api/admin/rooms/${codes[0]}`, "DELETE")).status, actor ? 403 : 401);
    assert.equal((await request("editor", `/api/rooms/${codes[0]}`, "DELETE")).status, 403);
    assert.equal((await request("admin", `/api/admin/rooms/${codes[0]}`, "DELETE")).status, 200);
    assert.equal((await request("admin", `/api/admin/rooms/${codes[0]}`, "DELETE")).status, 404);
    assert.equal((await request("player", `/api/rooms/${codes[0]}`)).status, 404);
    assert.ok(!(await request("admin", "/api/admin/rooms")).data.some((room) => room.code === codes[0]));
  } finally { for (const code of codes) await request("admin", `/api/admin/rooms/${code}`, "DELETE"); }
});

test("lobby notices are admin-managed, versioned and dismissible per account", async () => {
  const old = (await request("admin", "/api/config")).data.lobbyNotice;
  const notice = { enabled: true, title: "Bienvenue", content: "**Annonce** @!ktga-dice-6" };
  try {
    assert.equal((await request("player", "/api/admin/settings", "PATCH", { lobbyNotice: notice })).status, 403);
    const saved = await request("admin", "/api/admin/settings", "PATCH", { lobbyNotice: notice });
    assert.equal(saved.status, 200);
    const version = saved.data.lobbyNotice.updatedAt;
    assert.equal((await request("player", "/api/me/lobby-notice/dismiss", "POST", { updatedAt: version })).status, 200);
    assert.equal((await request("player", "/api/me")).data.lobbyNoticeDismissedAt, version);
    assert.notEqual((await request("friend", "/api/me")).data.lobbyNoticeDismissedAt, version);
    assert.equal((await request("admin", "/api/admin/settings", "PATCH", { lobbyNotice: notice })).data.lobbyNotice.updatedAt, version);
    const edited = await request("admin", "/api/admin/settings", "PATCH", { lobbyNotice: { ...notice, content: "**Annonce modifiée**" } });
    assert.notEqual(edited.data.lobbyNotice.updatedAt, version);
    assert.equal((await request("player", "/api/me/lobby-notice/dismiss", "POST", { updatedAt: version })).status, 409);
    assert.equal((await request("admin", "/api/admin/settings", "PATCH", { lobbyNotice: { ...notice, enabled: false } })).data.lobbyNotice.enabled, false);
  } finally { await request("admin", "/api/admin/settings", "PATCH", { lobbyNotice: old }); }
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

test("locale preferences stay private and only back-office accounts can edit language files", async () => {
  assert.equal((await request(null, "/api/locales/en")).status, 200);
  assert.equal((await request(null, "/api/locales/xx")).status, 404);
  assert.equal((await request(null, "/api/admin/locales/en")).status, 401);
  assert.equal((await request("player", "/api/admin/locales/en")).status, 403);
  const original = await request("editor", "/api/admin/locales/en");
  assert.equal(original.status, 200);
  const updated = await request("editor", "/api/admin/locales/en", "PATCH", { revision: original.data.revision, messages: { "Créer une table": "Open a table" } });
  assert.equal(updated.status, 200);
  assert.equal((await request(null, "/api/locales/en")).data.messages["Créer une table"], "Open a table");
  assert.equal((await request("admin", "/api/admin/locales/en", "PATCH", { revision: original.data.revision, messages: {} })).status, 409);
  assert.equal((await request("player", "/api/me/locale", "PATCH", { locale: "xx" })).status, 400);
  const preference = await request("player", "/api/me/locale", "PATCH", { locale: "en" });
  assert.equal(preference.status, 200, JSON.stringify(preference.data));
  assert.equal(preference.data.profile.locale, "en");
  assert.equal(preference.data.tokens, 100000);
  assert.equal(preference.data.admin, false);
  assert.ok(!Object.hasOwn(preference.data, "passwordHash"));
  assert.equal((await request("player", "/api/me")).data.profile.locale, "en");
  assert.equal((await request("friend", "/api/users/player/public")).data.profile.locale, undefined);
  assert.equal((await request("player", "/api/me", "PATCH", { bio: "Still English" })).data.profile.locale, "en");
});

test("existing room API runs through two Game Workers without exposing worker metadata", async () => {
  const initial=(await request("admin","/api/admin/health")).data.gameWorkers;
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
  assert.equal(health.status, 200); assert.equal(health.data.gameWorkers.rooms, initial.rooms + 2);
  assert.deepEqual(health.data.gameWorkers.workers.map((worker,index) => worker.assignedRooms-initial.workers[index].assignedRooms), [1, 1]);
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

test("guest play cannot transfer its virtual balance into a registered account", async () => {
  const settings = (await request("admin", "/api/config")).data;
  await request("admin", "/api/admin/settings", "PATCH", { guestAccessEnabled: true });
  let code;
  try {
    const signedIn = await request(null, "/api/auth/guest", "POST", { pseudo: "Economy guest" });
    assert.equal(signedIn.status, 200); assert.equal(signedIn.data.user.tokens, 10000);
    const guestId = signedIn.data.user.id;
    const guestRequest = async (path, method = "GET", body) => {
      const response = await fetch(url + path, { method, headers: { Authorization: `Bearer ${signedIn.data.token}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
      return { status: response.status, data: await response.json() };
    };
    const before = (await request("editor", "/api/me")).data.tokens;
    const created = await guestRequest("/api/rooms", "POST", { gameId: "421", name: "Guest economy check", stake: 100 });
    assert.equal(created.status, 200, JSON.stringify(created.data)); code = created.data.code;
    assert.equal((await request("editor", `/api/rooms/${code}/join`, "POST", {})).status, 200);
    assert.equal((await request("editor", `/api/rooms/${code}/ready`, "POST", {})).status, 200);
    assert.equal((await guestRequest(`/api/rooms/${code}/game-settings`, "POST", { rounds: 1, rollsPerTurn: 1 })).status, 200);
    const started = await guestRequest(`/api/rooms/${code}/start`, "POST", {});
    assert.equal(started.status, 200, JSON.stringify(started.data));
    assert.equal((await guestRequest("/api/me")).data.tokens, 10000);
    assert.equal((await request("editor", "/api/me")).data.tokens, before - 100);
    let room = started.data;
    for (let i = 0; i < 20 && !room.finished; i++) {
      if (room.pacing) {
        const skipped = await guestRequest(`/api/rooms/${code}/pacing/skip`, "POST", { pacingId: room.pacing.id });
        assert.equal(skipped.status, 200, JSON.stringify(skipped.data)); room = skipped.data; continue;
      }
      const body = { type: room.state.dice.length ? "bank" : "roll", guest: false, tokens: 999999 };
      const actorId = room.state.players[room.state.currentPlayerIndex].id;
      const acted = actorId === guestId ? await guestRequest(`/api/rooms/${code}/action`, "POST", body) : await request("editor", `/api/rooms/${code}/action`, "POST", body);
      assert.equal(acted.status, 200, JSON.stringify(acted.data)); room = acted.data;
    }
    assert.equal(room.finished, true);
    assert.equal((await guestRequest("/api/me")).data.tokens, 10000);
    assert.equal(room.players.find(({ id }) => id === guestId).tokens, 10000);
    assert.equal(room.state.roomPayouts[guestId], undefined);
    assert.ok(Object.values(room.state.roomPayouts).reduce((sum, value) => sum + value, 0) <= 100);
    assert.ok((await request("editor", "/api/me")).data.tokens <= before);
  } finally {
    if (code) await request("admin", `/api/admin/rooms/${code}`, "DELETE");
    await request("admin", "/api/admin/settings", "PATCH", { guestAccessEnabled: settings.guestAccessEnabled });
  }
});
