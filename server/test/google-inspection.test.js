import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { generateKeyPairSync } from "node:crypto";
import jwt from "jsonwebtoken";
import express from "express";
import { createGoogleInspection, GOOGLE_INSPECTION_TTL } from "../src/services/google-inspection.js";
import { createCommunicationStore } from "../src/services/communication-store.js";
import { registerCommunicationRoutes } from "../src/services/communication.js";

const website = () => "https://www.ktga.me/";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const credentials = { type: "service_account", client_email: "ktga@project.iam.gserviceaccount.com", private_key_id: "key", private_key: privateKey.export({ type: "pkcs8", format: "pem" }), token_uri: "https://evil.invalid/token" };

test("Google is explicitly unverified without valid credentials and never makes a request", () => {
  const store = createCommunicationStore(":memory:");
  try {
    const engine = createGoogleInspection({ store, website, credentialFile: "", send: () => { throw new Error("No network"); } });
    assert.equal(engine.configuration().configured, false); assert.equal(engine.view(website()).state, "not-configured");
    const bad = createGoogleInspection({ store, website, credentialFile: "missing-file.json" });
    assert.equal(bad.configuration().configured, false); assert.equal(bad.view(website()).state, "error");
  } finally { store.close(); }
});

test("Google inspection signs readonly JWTs, pins API endpoints, caches 24h and preserves valid results on failure", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ktga-google-")), file = path.join(directory, "key.json");
  await fs.writeFile(file, JSON.stringify(credentials), { mode: 0o600 });
  let time = Date.now(), failure = false, calls = [];
  let store = createCommunicationStore(path.join(directory, "cache.sqlite"), () => time);
  const options = { website, property: "sc-domain:ktga.me", credentialFile: file, now: () => time, send: async (url, config) => {
    calls.push(url); assert.equal(config.redirect, "error");
    if (url === "https://oauth2.googleapis.com/token") {
      const assertion = new URLSearchParams(config.body).get("assertion");
      const claims = jwt.verify(assertion, publicKey, { algorithms: ["RS256"], clockTimestamp: Math.floor(time / 1000), audience: url });
      assert.equal(claims.iss, credentials.client_email); assert.equal(claims.scope, "https://www.googleapis.com/auth/webmasters.readonly");
      return Response.json({ access_token: "private-access-token", expires_in: 3600 });
    }
    assert.equal(url, "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect");
    assert.equal(config.headers.Authorization, "Bearer private-access-token");
    assert.equal(JSON.parse(config.body).siteUrl, "sc-domain:ktga.me");
    return failure ? Response.json({ error: "private-secret" }, { status: 403 }) : Response.json({ inspectionResult: { indexStatusResult: { verdict: "PASS", coverageState: "Indexed", lastCrawlTime: "2026-10-20T12:00:00Z" }, inspectionResultLink: "https://search.google.com/search-console/inspect?id=one" } });
  } };
  try {
    const engine = createGoogleInspection({ ...options, store });
    const [result, duplicate] = await Promise.all([engine.inspect(website()), engine.inspect(website())]);
    assert.equal(result.state, "indexed"); assert.deepEqual(result, duplicate); assert.equal(calls.length, 2);
    await engine.inspect(website()); assert.equal(calls.length, 2);
    await assert.rejects(engine.inspect("https://evil.com/"), /propriété/); assert.equal(calls.length, 2);
    time += GOOGLE_INSPECTION_TTL + 1; failure = true;
    const failed = await engine.inspect(website());
    assert.equal(failed.state, "indexed"); assert.ok(failed.error); assert.equal(failed.checkedAt, result.checkedAt);
    assert.ok(!JSON.stringify(failed).includes("private-secret")); assert.ok(!JSON.stringify(failed).includes("access-token"));
    const count = calls.length; await engine.inspect(website()); assert.equal(calls.length, count);
    store.close(); store = createCommunicationStore(path.join(directory, "cache.sqlite"), () => time);
    assert.deepEqual(createGoogleInspection({ ...options, store }).view(website()), failed);
  } finally { store.close(); await fs.rm(directory, { recursive: true, force: true }); }
});

test("Google returns non-indexed and unknown states without confusing them with successful indexing", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ktga-google-states-")), file = path.join(directory, "key.json");
  await fs.writeFile(file, JSON.stringify(credentials)); const store = createCommunicationStore(":memory:");
  let verdict = "NEUTRAL";
  const engine = createGoogleInspection({ store, website, credentialFile: file, send: async url => url.includes("oauth2") ? Response.json({ access_token: "token", expires_in: 3600 }) : Response.json({ inspectionResult: { indexStatusResult: { verdict }, inspectionResultLink: "https://evil.com/" } }) });
  try {
    assert.equal((await engine.inspect(website())).state, "not-indexed");
    verdict = "VERDICT_UNSPECIFIED"; const result = await engine.inspect(website() + "faq");
    assert.equal(result.state, "unknown"); assert.equal(result.inspectionUrl, "");
  } finally { store.close(); await fs.rm(directory, { recursive: true, force: true }); }
});

test("SEO badges and Google checks are private and only accept indexable canonical destinations", async () => {
  const store = createCommunicationStore(":memory:"), app = express(); app.use(express.json()); let inspected = [];
  const auth = (req, res, next) => req.get("X-Role") ? next() : res.sendStatus(401);
  const requireBackOffice = (req, res, next) => ["editor", "admin"].includes(req.get("X-Role")) ? next() : res.sendStatus(403);
  registerCommunicationRoutes({ app, auth, requireBackOffice, requireAdmin: requireBackOffice, store, mediaLibrary: { list: () => [] }, website, settings: () => ({}), games: () => [], notes: () => [], pages: () => [{ slug: "hidden", title: "Hidden", indexable: false }],
    indexNow: () => ({ reconcile() {}, urlStatuses: () => ({ [website()]: { state: "validating" } }) }),
    googleInspection: { configuration: () => ({ configured: true }), view: () => ({ state: "unknown" }), inspect: async url => { inspected.push(url); return { state: "indexed" }; } } });
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  const root = `http://127.0.0.1:${server.address().port}/api/admin/communication`;
  const send = (url, role = "editor") => fetch(root + "/google/inspect", { method: "POST", headers: { "Content-Type": "application/json", ...(role ? { "X-Role": role } : {}) }, body: JSON.stringify({ url }) });
  try {
    assert.equal((await send(website(), "")).status, 401); assert.equal((await send(website(), "player")).status, 403);
    for (const url of ["https://evil.com/", website() + "profil", website() + "pages/hidden", website() + "?token=secret"]) assert.equal((await send(url)).status, 400);
    assert.equal((await send(website())).status, 200); assert.deepEqual(inspected, [website()]);
    const report = await (await fetch(root + "/seo", { headers: { "X-Role": "editor" } })).json();
    assert.equal(report.pages[0].indexNow.state, "validating");
    assert.equal(report.pages.find(page => page.url.endsWith("/pages/hidden")).google.state, "excluded");
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); store.close(); }
});
