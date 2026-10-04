import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import bcrypt from "bcryptjs";
import { calendarDeadline, createDataRequestStore } from "../src/services/data-requests.js";
import { removePersonalSecrets, personalGame } from "../src/services/personal-archive-data.js";
import { registerDataRequestRoutes } from "../src/services/data-request-routes.js";
import { validDateOnly } from "../src/services/time.js";

test("l’échéance est un mois calendaire avec les fins de mois et années bissextiles", () => {
  assert.equal(calendarDeadline("2026-01-31T15:00:00Z"), "2026-02-28T22:59:59.999Z");
  assert.equal(calendarDeadline("2024-01-31T15:00:00Z"), "2024-02-29T22:59:59.999Z");
  assert.equal(calendarDeadline("2026-12-20T15:00:00Z"), "2027-01-20T22:59:59.999Z");
  assert.equal(calendarDeadline("2026-09-30T22:30:00Z"), "2026-11-01T22:59:59.999Z");
  assert.equal(validDateOnly("2026-02-30"), false);
});
test("les demandes restent en attente avant approbation, sont idempotentes et bornent les prolongations", () => {
  let now = Date.parse("2026-01-31T12:00:00Z");
  const store = createDataRequestStore({ filename: ":memory:", now: () => now });
  try {
    const { request } = store.create("alice", "alice@example.com");
    assert.equal(request.status, "pending");
    assert.equal(store.create("alice", "alice@example.com").created, false);
    assert.deepEqual(store.pendingCounts(), { alice: 1 });
    assert.throws(() => store.extend(request.id, "court"));
    const extension = store.extend(request.id, "Nombreuses archives à vérifier.");
    assert.equal(store.get(request.id).extended_at, null);
    store.commitExtension(extension);
    assert.equal(store.get(request.id).due_at, "2026-04-30T21:59:59.999Z");
    assert.throws(() => store.extend(request.id, "Un second report non autorisé"));
    store.approve(request.id, "admin", request.email);
    assert.throws(() => store.approve(request.id, "admin", request.email));
    store.fail(request.id, "Échec SMTP");
    assert.equal(store.get(request.id).status, "failed");
    store.approve(request.id, "admin", request.email); store.sent(request.id);
    assert.equal(store.get(request.id).status, "sent");
    const second = store.create("alice", "alice@example.com").request;
    now = Date.parse("2026-03-01T12:00:00Z");
    assert.throws(() => store.extend(second.id, "Après expiration du premier mois"));
  } finally { store.close(); }
});
test("l’export masque les secrets et les autres mains sans retirer les données financières", () => {
  assert.deepEqual(removePersonalSecrets({ tokens: 100, tokensWon: 300, accessToken: "private", passwordHash: "private", mfa: { totpSecret: "private", emailEnabled: true }, parentEmail: "private" }), { tokens: 100, tokensWon: 300, mfa: { emailEnabled: true } });
  const game = personalGame({ players: [{ id: "alice", score: 300 }, { id: "bob", cards: ["secret"] }], winners: ["alice"] }, "alice");
  assert.equal(game.player.id, "alice"); assert.equal(game.won, true); assert.equal(JSON.stringify(game).includes("secret"), false);
});
test("les routes protègent l’approbation, les destinataires et n’exportent jamais lors de la demande", async () => {
  const previous = { SMTP_HOST: process.env.SMTP_HOST, EMAIL_FROM: process.env.EMAIL_FROM, SMTP_USER: process.env.SMTP_USER, SMTP_PASS: process.env.SMTP_PASS };
  Object.assign(process.env, { SMTP_HOST: "fixture", EMAIL_FROM: "fixture@example.com", SMTP_USER: "", SMTP_PASS: "" });
  const store = createDataRequestStore({ filename: ":memory:" });
  const user = { id: "alice", email: "alice@example.com", emailVerifiedAt: new Date().toISOString(), passwordHash: await bcrypt.hash("Password123!", 4) };
  const app = express(); app.use(express.json());
  let exports = 0, failEmail = false; const emails = [], notices = [];
  registerDataRequestRoutes({ app, auth: (req, res, next) => { req.auth = { id: req.headers["x-user"] }; next(); }, requireAdmin: (req, res, next) => req.auth.id === "admin" ? next() : res.sendStatus(403), store, readDb: () => ({ users: [user] }), updateDb: (fn) => fn({ users: [user] }), paths: {}, siteName: () => "Fixture", notifyContact: (key, notice) => notices.push({ key, ...notice }), exportArchive: async () => { exports++; return { content: Buffer.from("zip") }; }, sendEmail: async (mail) => { if (failEmail) throw new Error("Fixture SMTP indisponible"); emails.push(mail); } });
  const server = app.listen(0, "127.0.0.1"); await new Promise((resolve) => server.once("listening", resolve));
  const call = (id, path, body, method = "POST") => fetch(`http://127.0.0.1:${server.address().port}${path}`, { method, headers: { "x-user": id, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  try {
    assert.equal((await call("alice", "/api/me/data-requests", { password: "bad" })).status, 403);
    const response = await call("alice", "/api/me/data-requests", { password: "Password123!" }); assert.equal(response.status, 201);
    const { request } = await response.json(); assert.equal(exports, 0); assert.equal(emails.length, 1);
    assert.equal(notices.length, 1); assert.equal(notices[0].kind, "data-request"); assert.equal(notices[0].dueAt, request.due_at);
    assert.equal((await call("alice", "/api/me/data-requests", { password: "Password123!" })).status, 200);
    assert.equal(notices.length, 1); assert.equal(emails.length, 1); assert.equal(exports, 0);
    failEmail = true;
    assert.equal((await call("admin", `/api/admin/users/alice/data-requests/${request.id}/extend`, { reason: "Nombreuses archives nécessitant une revue humaine." })).status, 400);
    assert.equal(store.get(request.id).due_at, request.due_at); assert.equal(store.get(request.id).extended_at, null);
    failEmail = false;
    assert.equal((await call("alice", `/api/admin/users/alice/data-requests/${request.id}/approve`)).status, 403);
    assert.equal((await call("admin", `/api/admin/users/bob/data-requests/${request.id}/approve`)).status, 404);
    user.email = "changed@example.com";
    assert.equal((await call("admin", `/api/admin/users/alice/data-requests/${request.id}/approve`)).status, 409); assert.equal(exports, 0);
    user.email = "alice@example.com";
    assert.equal((await call("admin", `/api/admin/users/alice/data-requests/${request.id}/approve`)).status, 202);
    for (let i = 0; i < 30 && store.get(request.id).status !== "sent"; i++) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(exports, 1); assert.equal(store.get(request.id).status, "sent"); assert.equal(emails[1].to, user.email); assert.equal(emails[1].attachments[0].contentType, "application/zip");
    assert.equal((await call("admin", `/api/admin/users/alice/data-requests/${request.id}/approve`)).status, 409);
  } finally {
    await new Promise((resolve) => server.close(resolve)); store.close();
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
