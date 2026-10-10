import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import test, { before, after } from "node:test";
import jwt from "jsonwebtoken";
import { createPatchnoteStore } from "../src/services/patchnotes.js";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ktga-note-preview-api-"));
const secret = "isolated-note-preview-secret";
let child, url, draft, output = "";
async function request(id, route, method = "GET", body) {
  const response = await fetch(`${url}${route}`, { method, headers: { "Content-Type": "application/json", ...(id ? { Authorization: `Bearer ${jwt.sign({ id, sessionVersion: 0 }, secret, { expiresIn: "1h" })}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, cache: response.headers.get("cache-control"), data: await response.json() };
}

before(async () => {
  const db = new DatabaseSync(path.join(directory, "main.sqlite"));
  db.exec("CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); INSERT INTO meta VALUES('legacy-json-migrated','true'); CREATE TABLE users(id TEXT PRIMARY KEY,data TEXT NOT NULL,pseudo TEXT NOT NULL,email TEXT,guest INTEGER)");
  for (const id of ["player", "editor", "admin"]) {
    const user = { id, pseudo: id, email: `${id}@example.com`, emailVerifiedAt: new Date().toISOString(), active: true, admin: id === "admin", editor: id === "editor", tokens: 1000, passwordHash: "unused-test-hash", profile: { birthDate: "1990-01-01" }, createdAt: new Date().toISOString() };
    db.prepare("INSERT INTO users VALUES(?,?,?,?,0)").run(id, JSON.stringify(user), id, user.email);
  }
  db.close();
  const store = createPatchnoteStore({ filename: path.join(directory, "notes.sqlite"), currentVersion: "0.2.0" });
  const published = store.create({ version: "0.2.0" }, "admin");
  store.update(published.id, { status: "published", blocks: [{ type: "paragraph", content: "Version publique." }] });
  draft = store.create({ version: "0.2.1", title: "Brouillon privé" }, "editor");
  store.update(draft.id, { publishedAt: "2026-10-08T14:00:00.000Z", blocks: [{ type: "paragraph", content: "Contenu privé." }] });
  store.close();
  const listener = net.createServer();
  await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  url = `http://127.0.0.1:${port}/ktga`;
  child = spawn(process.execPath, ["src/index.js"], { cwd: new URL("../", import.meta.url), windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env,
    NODE_ENV: "test", PORT: String(port), HOST: "127.0.0.1", APP_BASE_PATH: "/ktga", JWT_SECRET: secret, CLIENT_DIST: "", CLIENT_ORIGIN: "http://localhost:5173", PUBLIC_APP_URL: `${url}/api/health`, HTTPS_KEY_PATH: "", HTTPS_CERT_PATH: "", HTTPS_PFX_PATH: "", SMTP_HOST: "", SMTP_USER: "", SMTP_PASS: "", EMAIL_FROM: "",
    SQLITE_PATH: path.join(directory, "main.sqlite"), PATCHNOTES_DB_PATH: path.join(directory, "notes.sqlite"), PATCHNOTES_UPLOAD_DIR: path.join(directory, "note-images"), BUG_REPORT_UPLOAD_DIR: path.join(directory, "bug-images"),
    ...Object.fromEntries(["PARENTAL_DB_PATH", "TRIBUNAL_DB_PATH", "CHAT_DB_PATH", "STATUS_DB_PATH", "REQUEST_LOG_PATH", "HELP_DB_PATH", "DATA_REQUEST_DB_PATH", "BUG_REPORT_DB_PATH"].map((key) => [key, path.join(directory, `${key}.sqlite`)]))
  } });
  child.stdout.on("data", (data) => output += data);
  child.stderr.on("data", (data) => output += data);
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(`${url}/api/health`)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Server startup failed: ${output.slice(-2000)}`);
});

after(async () => {
  if (child?.exitCode === null) { const exited = new Promise((resolve) => child.once("exit", resolve)); child.kill(); await exited; }
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
  assert.ok(path.basename(directory).startsWith("ktga-note-preview-api-"));
  fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test("les brouillons restent absents des routes publiques, meme pour un administrateur", async () => {
  for (const id of [null, "player", "editor", "admin"]) {
    assert.deepEqual((await request(id, "/api/patchnotes")).data.notes.map((note) => note.version), ["0.2.0"]);
    assert.equal((await request(id, "/api/patchnotes/0.2.1")).status, 404);
  }
});

test("seuls admins et editeurs peuvent consulter le catalogue prive et le brouillon", async () => {
  for (const id of ["admin", "editor"]) {
    const catalog = await request(id, "/api/admin/patchnotes");
    assert.equal(catalog.status, 200);
    assert.equal(catalog.cache, "no-store");
    assert.ok(catalog.data.notes.some((note) => note.version === "0.2.1" && note.status === "draft"));
    const preview = await request(id, `/api/admin/patchnotes/${draft.id}`);
    assert.equal(preview.status, 200);
    assert.equal(preview.cache, "no-store");
    assert.equal(preview.data.blocks[0].content, "Contenu privé.");
    assert.equal(preview.data.publishedAt, "2026-10-08T14:00:00.000Z");
    assert.equal((await request(id, "/api/admin/patchnotes/0.2.1")).status, 200);
  }
  for (const route of ["/api/admin/patchnotes", `/api/admin/patchnotes/${draft.id}`]) {
    assert.equal((await request(null, route)).status, 401);
    assert.equal((await request("player", route)).status, 403);
  }
});

test("la previsualisation ne publie pas le brouillon et ne permet pas d'y voter", async () => {
  assert.equal((await request("editor", `/api/patchnotes/${draft.id}/reaction`, "POST", { value: 1 })).status, 404);
  assert.equal((await request("admin", `/api/admin/patchnotes/${draft.id}`)).data.status, "draft");
  assert.equal((await request("admin", "/api/admin/patchnotes")).data.currentVersion, "0.2.0");
});
