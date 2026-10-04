import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { deflateSync } from "node:zlib";
import express from "express";
import { createBugReportStore } from "../src/services/bug-reports.js";
import { sanitizeBugDiagnostics, safeDiagnosticRoute, redactBugPublicText } from "../src/services/bug-diagnostics.js";
import { sanitizeBugImage } from "../src/services/bug-images.js";
import { registerBugReportRoutes } from "../src/services/bug-report-routes.js";

function chunk(type, bytes) {
  const data = Buffer.concat([Buffer.from(type), bytes]); let crc = 0xffffffff;
  for (const byte of data) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  const length = Buffer.alloc(4), checksum = Buffer.alloc(4); length.writeUInt32BE(bytes.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, data, checksum]);
}
function png(metadata = false) {
  const header = Buffer.alloc(13); header.writeUInt32BE(1); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", header), ...(metadata ? [chunk("tEXt", Buffer.from("Author\0private@example.com")), chunk("eXIf", Buffer.from("secret-location"))] : []), chunk("IDAT", deflateSync(Buffer.from([0,255,100,50,255]))), chunk("IEND", Buffer.alloc(0))]);
}
const input = (extra = {}) => ({ submissionId: randomUUID(), title: "Bouton de lancer bloqué", description: "Le bouton ne se réactive pas après le lancer.", category: "game", frequency: "always", impact: "major", context: { page: "/table/TABLE1?password=private", room: "TABLE1" }, ...extra });
function fixture(t, options = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), "ktga-bug-unit-"));
  const store = createBugReportStore({ filename: path.join(directory, "bugs.sqlite"), uploadDirectory: path.join(directory, "images"), version: () => "0.1.0", ...options });
  t.after(() => { store.close(); assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir())); assert.ok(path.basename(directory).startsWith("ktga-bug-unit-")); rmSync(directory, { recursive: true, force: true }); });
  return store;
}
test("diagnostics: allowlist excludes secrets, bodies, raw messages and URL parameters", () => {
  const data = sanitizeBugDiagnostics({ token: "SECRET", cookie: "SECRET", userId: "spoofed", browser: "Firefox", system: "Windows", capturedAt: "bad date", javascript: [{ kind: "TypeError", code: "missing_value", message: "SECRET", stack: "SECRET", file: "https://mail/password.js?token=SECRET" }], api: [{ route: "https://name:SECRET@site/ktga/api/rooms/SECRET/actions?token=SECRET", body: { password: "SECRET" }, status: 500 }], websocket: [{ code: "transport_close", message: "SECRET" }] }, { userId: "actual", version: "0.1.0" });
  assert.equal(data.userId, "actual"); assert.equal(data.capturedAt, ""); assert.equal(data.javascript[0].file, ""); assert.equal(data.api[0].route, "/api/rooms/:id/:id"); assert.ok(!JSON.stringify(data).includes("SECRET"));
  assert.equal(safeDiagnosticRoute("/api/users/private@example.com?password=x"), "/api/users/:id");
  assert.ok(!redactBugPublicText("mail private@example.com token=SECRET https://name:SECRET@site/page?token=SECRET").includes("SECRET"));
});
test("PNG: removes metadata and trailing payload, rejects damaged or oversized images", () => {
  assert.deepEqual(sanitizeBugImage(Buffer.concat([png(true), Buffer.from("secret payload")])), png());
  assert.throws(() => sanitizeBugImage(Buffer.from("<svg/>")));
  assert.throws(() => sanitizeBugImage(png().subarray(0, 30)));
  const corrupted = png(); corrupted[32] ^= 1; assert.throws(() => sanitizeBugImage(corrupted), /endommagée/);
  assert.throws(() => sanitizeBugImage(Buffer.alloc(4 * 1024 * 1024)));
});
test("reports remain private; receipt and owner access do not expose other dossiers", (t) => {
  const s = fixture(t), a = s.create(input(), { id: "alice" }), b = s.create(input(), { id: "bob" });
  assert.match(a.report.code, /^BUG \d+$/); assert.equal(s.list().totalItems, 0);
  assert.equal(a.report.context.page, "/table/TABLE1");
  assert.equal(s.get(a.report.id), null); assert.equal(s.get(a.report.id, { viewer: { id: "bob" } }), null);
  assert.equal(s.get(a.report.id, { receipt: a.receipt }).privateView, true);
  assert.equal(s.get(a.report.id, { receipt: b.receipt }), null);
  s.relate(a.report.id, b.report.id, "related", "staff");
  assert.equal(s.get(a.report.id, { viewer: { id: "alice" } }).links.length, 0);
  assert.equal(s.get(a.report.id, { admin: true }).links.length, 1);
  assert.equal(s.list({}, { mine: true, viewer: { id: "alice" } }).totalItems, 1);
  assert.throws(() => s.publish(a.report.id, { visible: true, title: a.report.title, description: a.report.description }, "staff"), /Relis/);
  s.publish(a.report.id, { visible: true, reviewed: true, title: "Titre relu", description: "Une description publique relue sans information personnelle." }, "staff");
  const publicData = s.get(a.report.id); assert.equal(publicData.title, "Titre relu"); assert.equal(publicData.privateView, false);
  for (const key of ["context", "diagnostics", "reporterId", "expected", "assignee", "actions"]) assert.ok(!Object.hasOwn(publicData, key));
  assert.equal(s.list().totalItems, 1);
});
test("diagnostic consent is enforced by the server and retained at most 90 days", (t) => {
  let time = Date.parse("2026-01-01T00:00:00Z"); const s = fixture(t, { now: () => time });
  const no = s.create(input({ diagnosticConsent: false, diagnostics: { browser: "Chrome", password: "SECRET" } }));
  assert.equal(no.report.diagnostics, null); assert.equal(no.report.consentAt, null);
  const yes = s.create(input({ diagnosticConsent: true, diagnostics: { browser: "Firefox", system: "Windows", userId: "spoofed" } }), { id: "alice" });
  assert.equal(yes.report.diagnostics.userId, "alice"); assert.equal(yes.report.diagnostics.version, "0.1.0");
  time += 91 * 86400000; s.prune(); assert.equal(s.get(yes.report.id, { admin: true }).diagnostics, null);
});
test("images require upload ownership and individual publication", (t) => {
  const s = fixture(t), one = s.stageImage(png(true)), two = s.stageImage(png());
  assert.throws(() => s.create(input({ images: [{ ...one, key: "wrong" }] })), /appartient/);
  const result = s.create(input({ images: [one, two] }), { id: "alice" });
  assert.equal(s.image(one.id), null); assert.deepEqual(readFileSync(s.image(one.id, { receipt: result.receipt }).path), png());
  s.publish(result.report.id, { visible: true, reviewed: true, title: result.report.title, description: result.report.description, imageIds: [one.id] }, "staff");
  assert.equal(s.get(result.report.id).images.length, 1); assert.ok(s.image(one.id)); assert.equal(s.image(two.id), null);
  assert.ok(s.image(two.id, { admin: true }));
  assert.throws(() => s.create(input({ images: [one] })), /appartient/);
});
test("comments and internal notes are moderated; originals are not public", (t) => {
  const s = fixture(t), a = s.create(input(), { id: "alice" });
  s.addComment(a.report.id, { body: "Informations supplémentaires" }, { id: "alice" });
  s.addComment(a.report.id, { kind: "internal", body: "Secret réservé au traitement" }, { id: "staff" }, true);
  s.publish(a.report.id, { visible: true, reviewed: true, title: a.report.title, description: a.report.description }, "staff");
  assert.equal(s.get(a.report.id).comments.length, 0); assert.equal(s.get(a.report.id, { viewer: { id: "alice" } }).comments.length, 1);
  const comment = s.get(a.report.id, { admin: true }).comments[0]; s.moderateComment(a.report.id, comment.id, true, "staff");
  assert.equal(s.get(a.report.id).comments.length, 1);
  assert.throws(() => s.moderateComment(a.report.id, s.get(a.report.id, { admin: true }).comments[1].id, true, "staff"), /introuvable/);
});
test("duplicate chains propose resolution without automatically resolving dependencies", (t) => {
  const s = fixture(t), [a, b, c, d] = Array.from({ length: 4 }, () => s.create(input()).report.id);
  s.relate(b, a, "duplicate", "staff"); s.relate(c, b, "duplicate", "staff"); s.relate(d, a, "depends_on", "staff");
  assert.throws(() => s.relate(a, c, "depends_on", "staff"), /boucle/);
  const plan = s.resolutionPlan(a); assert.equal(plan.rows.filter((row) => row.suggested).length, 2); assert.equal(plan.rows.find((row) => row.id === d).suggested, false);
  s.resolve(a, { linkedIds: plan.rows.filter((row) => row.suggested).map((row) => row.id), response: "La correction est déployée." }, "staff");
  assert.equal(s.get(c, { admin: true }).status, "fixed"); assert.equal(s.get(d, { admin: true }).status, "received");
  const e = s.create(input()).report.id; assert.throws(() => s.resolve(a, { linkedIds: [e] }, "staff"), /plan/);
});
test("batch updates are atomic, grouping and pagination use bounded queries", (t) => {
  const s = fixture(t), a = s.create(input()).report.id, b = s.create(input()).report.id, group = s.createGroup("Lancers de dés", "staff");
  s.batch([a, b], { status: "analyzing", groupId: group.id, internalNote: "À reproduire" }, "staff");
  assert.equal(s.groups()[0].count, 2); assert.equal(s.get(a, { admin: true }).comments.length, 1);
  assert.throws(() => s.batch([a, 9999999], { status: "fixed" }, "staff"), /introuvable/);
  assert.equal(s.get(a, { admin: true }).status, "analyzing");
  assert.equal(s.list({ search: "%' OR 1=1--" }, { admin: true }).totalItems, 0);
  assert.equal(s.list({ search: "BUG " + a }, { admin: true }).totalItems, 1);
  assert.equal(s.list({ pageSize: 1000000 }, { admin: true }).pageSize, 20);
});
test("submission retries are idempotent and stale unattached images are pruned", (t) => {
  let time = Date.now(); const s = fixture(t, { now: () => time }), body = input();
  const first = s.create(body, { id: "alice" }); assert.equal(s.create(body, { id: "alice" }).report.id, first.report.id);
  assert.throws(() => s.create(body, { id: "bob" }), /autre session/);
  const image = s.stageImage(png()); time += 3600001; s.prune(); assert.throws(() => s.create(input({ images: [image] })), /expiré/);
});
test("account deletion erases original reports and captures, preserving reviewed anonymous publications", (t) => {
  const s = fixture(t), privateReport = s.create(input(), { id: "alice" }), image = s.stageImage(png()), published = s.create(input({ images: [image], diagnosticConsent: true, diagnostics: { browser: "Firefox" } }), { id: "alice" });
  s.publish(published.report.id, { visible: true, reviewed: true, title: "Bouton désactivé", description: "Un bouton de lancer ne se réactive pas correctement." }, "staff");
  s.addComment(published.report.id, { body: "Ma précision" }, { id: "alice" });
  s.deleteForUser("alice");
  assert.equal(s.get(privateReport.report.id, { admin: true }), null);
  const remaining = s.get(published.report.id, { admin: true }); assert.equal(remaining.reporterId, null); assert.equal(remaining.diagnostics, null); assert.equal(remaining.images.length, 0); assert.equal(remaining.comments.length, 0);
  assert.equal(remaining.title, "Bouton désactivé"); assert.equal(s.get(published.report.id, { receipt: published.receipt }).privateView, false);
});
test("public endpoints reveal private details only to verified staff or owners", async (t) => {
  const s = fixture(t), app = express(); app.use(express.json());
  const identify = (req) => ({ alice: { id: "alice" }, bob: { id: "bob" }, editor: { id: "editor", editor: true }, admin: { id: "admin", admin: true } })[req.get("X-Test-User")];
  const auth = (req, res, next) => { const user = identify(req); if (!user) return res.status(401).json({ error: "auth" }); req.auth = user; next(); };
  const guard = (req, res, next) => req.auth.admin || req.auth.editor ? next() : res.status(403).json({ error: "staff" });
  registerBugReportRoutes({ app, auth, requireBackOffice: guard, store: s, identify, staff: () => [{ id: "editor", name: "Editor" }], version: () => "0.1.0" });
  const server = app.listen(0, "127.0.0.1"); await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve))); const origin = `http://127.0.0.1:${server.address().port}`;
  const a = s.create(input(), { id: "alice" });
  const read = (user, suffix = "") => fetch(`${origin}/api/bugs/${a.report.id}${suffix}`, { headers: user ? { "X-Test-User": user } : {} });
  assert.equal((await read()).status, 404); assert.equal((await read("bob")).status, 404);
  assert.equal((await (await read("editor")).json()).reporterId, "alice");
  assert.equal((await (await read("alice")).json()).privateView, true);
  assert.equal((await fetch(`${origin}/api/admin/bugs`, { headers: { "X-Test-User": "alice" } })).status, 403);
  s.publish(a.report.id, { visible: true, reviewed: true, title: "Version publique", description: "Description publique de ce problème sans détail privé." }, "admin");
  const publicView = await (await read()).json(); assert.equal(publicView.privateView, false); assert.equal(publicView.description, "Description publique de ce problème sans détail privé.");
  assert.equal((await (await read("admin")).json()).description, a.report.description);
});
