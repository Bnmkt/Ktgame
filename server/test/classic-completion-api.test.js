import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import jwt from "jsonwebtoken";

for (const worker of [false, true]) test(`classic XP receipt is private, stable and reusable (worker=${worker})`, { timeout: 60000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ktga-classic-recap-"));
  const filename = path.join(directory, "main.sqlite"), secret = "isolated-classic-completion-test-key";
  const seed = new DatabaseSync(filename);
  seed.exec("CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); INSERT INTO meta VALUES('legacy-json-migrated','true'); CREATE TABLE users(id TEXT PRIMARY KEY,data TEXT NOT NULL,pseudo TEXT NOT NULL,email TEXT,guest INTEGER)");
  for (const id of ["self", "observer"]) {
    const user = { id, pseudo: id, email: `${id}@example.com`, emailVerifiedAt: new Date().toISOString(), active: true, tokens: 10000, passwordHash: "isolated-unused-hash", profile: { birthDate: "1990-01-01" }, createdAt: new Date().toISOString() };
    seed.prepare("INSERT INTO users VALUES(?,?,?,?,?)").run(id, JSON.stringify(user), id, user.email, 0);
  }
  seed.prepare("INSERT INTO meta VALUES('admin-settings',?)").run(JSON.stringify({ platform: { roundResultsSeconds: 0, turnEndDelaySeconds: 1 } })); seed.close();
  const listener = net.createServer(); await new Promise(resolve => listener.listen(0, "127.0.0.1", resolve)); const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const isolatedPaths = ["PARENTAL_DB_PATH", "TRIBUNAL_DB_PATH", "CHAT_DB_PATH", "STATUS_DB_PATH", "REQUEST_LOG_PATH", "HELP_DB_PATH", "DATA_REQUEST_DB_PATH", "BUG_REPORT_DB_PATH", "PATCHNOTES_DB_PATH", "CONTACT_NOTICE_DB_PATH"];
  const child = spawn(process.execPath, ["src/index.js"], { cwd: new URL("../", import.meta.url), windowsHide: true,
    env: { ...process.env, SQLITE_PATH: filename, NODE_ENV: "test", PORT: String(port), HOST: "127.0.0.1", JWT_SECRET: secret, APP_BASE_PATH: "", CLIENT_ORIGIN: origin, PUBLIC_APP_URL: origin, CLIENT_DIST: "",
      GAME_WORKERS_ENABLED: worker ? "1" : "0", GAME_WORKERS: "1", ACCOUNTS_PROCESS_ENABLED: "0", HTTPS_KEY_PATH: "", HTTPS_CERT_PATH: "", HTTPS_PFX_PATH: "", SMTP_HOST: "", SMTP_USER: "", SMTP_PASS: "", EMAIL_FROM: "", CONTACT_EMAIL: "contact@example.com",
      ...Object.fromEntries(isolatedPaths.map(key => [key, path.join(directory, `${key}.sqlite`)])), PATCHNOTES_UPLOAD_DIR: path.join(directory, "notes"), BUG_REPORT_UPLOAD_DIR: path.join(directory, "bugs"), RANK_INSIGNIA_UPLOAD_DIR: path.join(directory, "ranks"), GAME_IMAGE_UPLOAD_DIR: path.join(directory, "games") },
    stdio: ["ignore", "pipe", "pipe"] });
  let output = ""; child.stdout.on("data", data => output += data); child.stderr.on("data", data => output += data);
  const request = async (id, route, method = "GET", body) => {
    const response = await fetch(`${origin}${route}`, { method, headers: { Authorization: `Bearer ${jwt.sign({ id, guest: false, sessionVersion: 0 }, secret)}`, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await response.json(); assert.equal(response.status, 200, `${route}: ${JSON.stringify(data)}`); return data;
  };
  try {
    let ready = false;
    for (let i = 0; i < 300; i++) { try { if ((await fetch(`${origin}/api/health`)).ok) { ready = true; break; } } catch {} await new Promise(resolve => setTimeout(resolve, 100)); }
    assert.ok(ready, output);
    const created = await request("self", "/api/rooms", "POST", { gameId: "yahtzee", name: "Recap test", isPublic: true });
    const route = `/api/rooms/${created.code}`;
    let room = await request("self", `${route}/start`, "POST");
    const observing = await request("observer", `${route}/join`, "POST");
    assert.equal(observing.spectator, true);
    assert.equal(observing.players.some(player => player.id === "observer"), false);
    const categories = ["upper-1", "upper-2", "upper-3", "upper-4", "upper-5", "upper-6", "three-kind", "four-kind", "full-house", "small-straight", "large-straight", "yahtzee", "chance"];
    let beforeFinal;
    for (const category of categories) {
      if (room.pacing) room = await request("self", `${route}/pacing/skip`, "POST", { pacingId: room.pacing.id });
      await new Promise(resolve => setTimeout(resolve, Math.max(0, (room.state.rollAvailableAt?.self ?? 0) - Date.now()) + 20));
      await request("self", `${route}/action`, "POST", { type: "roll", keepIndexes: [] });
      if (category === "chance") beforeFinal = (await request("self", "/api/me")).gameProgression.find(row => row.gameId === "yahtzee").xp;
      room = await request("self", `${route}/action`, "POST", { type: "score", category });
    }
    assert.equal(room.finished, true);
    assert.ok(room.completion.xp.amount > 0);
    assert.equal(room.completionByUser, undefined);
    const afterFinal = (await request("self", "/api/me")).gameProgression.find(row => row.gameId === "yahtzee").xp;
    assert.equal(room.completion.xp.amount, afterFinal - beforeFinal);
    assert.deepEqual((await request("self", route)).completion, room.completion);
    const spectating = await request("observer", route);
    assert.equal(spectating.spectator, true); assert.equal(spectating.completion, null); assert.equal(spectating.completionByUser, undefined);
    if (room.pacing) await request("self", `${route}/pacing/skip`, "POST", { pacingId: room.pacing.id });
    assert.equal((await request("self", "/api/me")).gameProgression.find(row => row.gameId === "yahtzee").xp, afterFinal, "Recap actions cannot award XP twice");
    const joined = await request("observer", `${route}/join`, "POST");
    assert.equal(joined.spectator, false); assert.equal(joined.finished, true);
    assert.equal(joined.players.filter(player => player.id === "observer").length, 1);
    assert.equal(joined.state.players.some(player => player.id === "observer"), false, "Joining after settlement must not rewrite the completed roster");
    assert.equal(joined.completion, null);
    const repeat = await request("observer", `${route}/join`, "POST");
    assert.equal(repeat.players.filter(player => player.id === "observer").length, 1);
    const lobby = await request("self", `${route}/replay`, "POST"); assert.equal(lobby.completion, null);
    await request("observer", `${route}/ready`, "POST");
    const replay = await request("self", `${route}/start`, "POST"); assert.equal(replay.completion, null);
  } finally {
    if (child.exitCode === null) { const exit = new Promise(resolve => child.once("exit", resolve)); child.kill(); await exit; }
    const resolved = path.resolve(directory); assert.ok(resolved.startsWith(path.join(os.tmpdir(), "ktga-classic-recap-")));
    fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
