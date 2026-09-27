import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";
import { createRequestLogStore, requestLogMiddleware, requestOutcome } from "../src/services/request-logs.js";

test("les journaux survivent au redémarrage et se filtrent par heure, statut et route", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ktga-request-logs-"));
  const config = { filename: path.join(dir, "test.sqlite"), flushMs: 0, now: () => Date.parse("2026-09-16T15:00:00Z") };
  let store = createRequestLogStore(config);
  try {
    store.append({ at: "2026-09-16T11:30:00Z", method: "GET", route: "/api/me", status: 401, ...requestOutcome(401) });
    store.append({ at: "2026-09-16T14:58:52Z", method: "GET", route: "/api/me", status: 304, ...requestOutcome(304) });
    store.close();
    store = createRequestLogStore(config);
    const filtered = store.query({ from: "2026-09-16T13:25:00+02:00", to: "2026-09-16T13:35:00+02:00", status: "401", search: "/api/me" });
    assert.equal(filtered.summary.total, 1);
    assert.equal(filtered.rows[0].category, "authentication");
    assert.equal(store.query({ category: "cache" }).rows[0].level, "info");
    assert.equal(store.query().summary.clientErrors, 1);
    assert.equal(store.query().summary.serverErrors, 0);
    assert.equal(store.query({ search: "%' OR 1=1 --" }).summary.total, 0);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("rétention et pagination bornent le journal", () => {
  let now = Date.parse("2026-09-16T15:00:00Z");
  const store = createRequestLogStore({ filename: ":memory:", maxRows: 55, retentionDays: 14, flushMs: 0, now: () => now });
  try {
    for (let i = 0; i < 65; i++) store.append({ route: `/api/item/${i}`, status: 200 });
    now += 60001;
    assert.equal(store.query().summary.total, 55);
    assert.equal(store.query().rows.length, 50);
    assert.equal(store.query({ page: 2 }).rows.length, 5);
    assert.equal(store.query({ page: 999 }).page, 2);
    now += 15 * 86400000;
    assert.equal(store.query().summary.total, 0);
  } finally { store.close(); }
});

test("le middleware enregistre une seule entrée sans corps, token, cookie ou paramètres URL", async () => {
  const store = createRequestLogStore({ filename: ":memory:", flushMs: 0 });
  const app = express();
  app.use(requestLogMiddleware(store));
  app.use(express.json());
  app.post("/api/auth/login", (req, res) => res.status(401).json({ error: "Test", body: req.body }));
  app.get("/api/admin/health/logs", (req, res) => res.json({ ok: true }));
  app.get("/cors", (req, res) => { res.locals.logCorsDenied = true; res.sendStatus(500); });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(`${url}/api/auth/login?token=query-secret`, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer token-secret", cookie: "session=cookie-secret", origin: "https://example.org", "user-agent": "Firefox/123" }, body: JSON.stringify({ password: "password-secret" }) });
    await response.text();
    const logs = store.query();
    assert.equal(logs.summary.total, 1);
    assert.equal(logs.rows[0].requestId, response.headers.get("x-request-id"));
    assert.equal(logs.rows[0].browser, "Firefox");
    assert.equal(logs.rows[0].origin, "https://example.org");
    assert.doesNotMatch(JSON.stringify(logs), /query-secret|token-secret|cookie-secret|password-secret/);
    await (await fetch(`${url}/api/admin/health/logs`)).text();
    assert.equal(store.query().summary.total, 1);
    await (await fetch(`${url}/cors`)).text();
    assert.equal(store.query({ category: "cors" }).summary.total, 1);
  } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); store.close(); }
});

test("une connexion interrompue ne devient pas un succès et le cache reste informatif", () => {
  assert.equal(requestOutcome(200, true).category, "interrupted");
  assert.equal(requestOutcome(304).level, "info");
  assert.equal(requestOutcome(500).level, "error");
  assert.equal(requestOutcome(429).category, "rate-limit");
});
