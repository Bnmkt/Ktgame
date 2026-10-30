import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import express from "express";
import { createBugReportStore } from "../src/services/bug-reports.js";
import { registerBugReportRoutes } from "../src/services/bug-report-routes.js";

const input = (title = "Bouton bloqué") => ({ submissionId: randomUUID(), title, category: "interface", description: "Le bouton reste bloqué après une tentative de validation.", frequency: "always", impact: "minor", context: { page: "/", game: "yahtzee" } });
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ktga-intake-test-"));
  const state = { now: Date.parse("2026-10-29T10:00:00Z") };
  const options = { filename: path.join(directory, "bugs.sqlite"), uploadDirectory: path.join(directory, "images"), now: () => state.now };
  state.store = createBugReportStore(options);
  state.reopen = () => { state.store.close(); state.store = createBugReportStore(options); };
  t.after(() => { state.store.close(); assert.equal(path.dirname(directory), path.resolve(os.tmpdir())); assert.ok(path.basename(directory).startsWith("ktga-intake-test-")); fs.rmSync(directory, { recursive: true, force: true }); });
  return state;
}

test("report cooldown and hourly quota persist, while retries reuse their receipt", t => {
  const f = fixture(t), first = input(), viewer = { id: "alice" }, key = { subjectKey: "alice-key" };
  const saved = f.store.create(first, viewer, key);
  assert.equal(f.store.create(first, viewer, key).created, false);
  assert.throws(() => f.store.create(input("Autre problème"), viewer, key), error => error.code === "BUG_INTAKE_LIMIT" && error.retryAfter === 60);
  f.reopen();
  assert.throws(() => f.store.create(input("Autre problème"), viewer, key), error => error.code === "BUG_INTAKE_LIMIT");
  for (let i = 1; i < 6; i++) { f.now += 60000; f.store.create(input(`Problème ${i}`), viewer, key); }
  f.now += 60000;
  assert.throws(() => f.store.create(input("Septième problème"), viewer, key), error => error.code === "BUG_INTAKE_LIMIT" && error.retryAfter > 60);
  assert.equal(f.store.create(first, viewer, key).report.id, saved.report.id);
  f.now = Date.parse("2026-10-29T11:00:01Z");
  assert.equal(f.store.create(input("Après la fenêtre"), viewer, key).created, true);
});

test("same-subject duplicates are rejected for 24 hours without exposing another reporter's dossier", t => {
  const f = fixture(t), first = input(), result = f.store.create(first, { id: "alice" }, { subjectKey: "alice" });
  f.now += 60000;
  assert.throws(() => f.store.create({ ...input(), title: "  BOUTON   BLOQUÉ " }, { id: "alice" }, { subjectKey: "alice" }), error => error.code === "BUG_INTAKE_DUPLICATE" && error.bugId === result.report.id);
  assert.equal(f.store.create(input(), { id: "bob" }, { subjectKey: "bob" }).created, true);
  f.reopen();
  assert.throws(() => f.store.create(input(), { id: "alice" }, { subjectKey: "alice" }), error => error.code === "BUG_INTAKE_DUPLICATE");
  f.now += 86400000;
  assert.equal(f.store.create(input(), { id: "alice" }, { subjectKey: "alice" }).created, true);
});

test("upload admission is bounded and survives restart", t => {
  const f = fixture(t);
  for (let i = 0; i < 18; i++) f.store.reserveUpload("visitor-key");
  f.reopen();
  assert.throws(() => f.store.reserveUpload("visitor-key"), error => error.code === "BUG_INTAKE_LIMIT" && error.retryAfter === 900);
  assert.doesNotThrow(() => f.store.reserveUpload("another-visitor"));
  f.now += 900001;
  assert.doesNotThrow(() => f.store.reserveUpload("visitor-key"));
});

test("HTTP admission follows the account across IP changes and exposes safe retry/duplicate responses", async t => {
  const f = fixture(t), app = express(), notices = [];
  app.set("trust proxy", "loopback"); app.use(express.json());
  registerBugReportRoutes({ app, store: f.store, intakeSecret: "stable-test-secret", identify: req => req.get("X-Test-User") ? { id: req.get("X-Test-User"), guest: req.get("X-Test-User").startsWith("guest-") } : null,
    auth: (_req, res) => res.sendStatus(401), requireBackOffice: (_req, res) => res.sendStatus(403), staff: () => [], version: () => "test", notifyContact: key => notices.push(key) });
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const send = (body, user, ip) => fetch(origin + "/api/bugs", { method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": ip, ...(user ? { "X-Test-User": user } : {}) }, body: JSON.stringify(body) });
  const first = input(); assert.equal((await send(first, "alice", "192.0.2.1")).status, 201);
  assert.equal((await send(first, "alice", "192.0.2.2")).status, 200);
  const blocked = await send(input("Autre problème"), "alice", "192.0.2.3"); assert.equal(blocked.status, 429); assert.equal(blocked.headers.get("retry-after"), "60"); assert.equal((await blocked.json()).retryAfter, 60);
  const duplicate = await send(input(), "alice", "192.0.2.4"); assert.equal(duplicate.status, 409); assert.equal((await duplicate.json()).code, "BUG_INTAKE_DUPLICATE");
  assert.equal((await send(input(), "bob", "192.0.2.1")).status, 201);
  assert.equal((await send(input(), null, "192.0.2.5")).status, 201);
  assert.equal((await send(input("Anonyme suivant"), null, "192.0.2.5")).status, 429);
  assert.equal((await send(input("Compte invité"), "guest-one", "192.0.2.6")).status, 201);
  assert.equal((await send(input("Nouvel invité, même connexion"), "guest-two", "192.0.2.6")).status, 429);
  assert.equal(notices.length, 4);
});
