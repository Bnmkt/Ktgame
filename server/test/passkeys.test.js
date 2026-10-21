import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import bcrypt from "bcryptjs";
import { registerPasskeyRoutes, passkeyConfiguration } from "../src/services/passkeys.js";
import { createPasskeyStore } from "../src/services/passkey-store.js";
import { createMfaChallenge, mfaChallengeAccount } from "../src/services/account-security.js";
import { virtualPasskey } from "./fixtures/passkey-credential.js";
import { verifyRegistrationResponse, verifyAuthenticationResponse } from "@simplewebauthn/server";

const password = "FixturePassword1!", origin = "https://www.ktga.me";
async function fixture(options = {}) {
  const users = ["player", "other"].map(id => ({ id, pseudo: id, email: `${id}@example.test`, emailVerifiedAt: "2026-01-01", passwordHash: bcrypt.hashSync(password, 4), sessionVersion: 0 }));
  const db = { users }, emails = [], logins = [];
  const app = express(); app.use(express.json());
  const cookie = (req, name) => req.headers.cookie?.split("; ").find(value => value.startsWith(`${name}=`))?.slice(name.length + 1) || "";
  const auth = (req, res, next) => { const user = users.find(user => user.id === req.get("X-User")); if (!user) return res.sendStatus(401); req.auth = { id: user.id }; next(); };
  const store = registerPasskeyRoutes({ app, auth, filename: ":memory:", readDb: () => db, writeDb() {}, website: () => origin, siteName: () => "KTGA", bcrypt, secret: "test-passkey-secret", fingerprint: req => req.get("User-Agent") || "", requestCookie: cookie, emailAvailable: () => true, sendCode: async (user, code, purpose) => emails.push({ userId: user.id, code, purpose }), sendAuthLocked: (res, lock) => res.status(429).json(lock), beginAccountLogin: async (req, res, db, user, method, key, trusted) => { logins.push({ id: user.id, method, trusted }); res.json({ token: "test-token", user: { id: user.id } }); }, ...options });
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  let browserCookie = "";
  async function request(path, body, { method = "POST", user = "player", from = origin, cookies = browserCookie } = {}) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method, headers: { Origin: from, "User-Agent": "passkey-test", "Content-Type": "application/json", ...(cookies ? { Cookie: cookies } : {}), ...(user ? { "X-User": user } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const setCookie = response.headers.get("set-cookie"); if (setCookie) browserCookie = setCookie.split(";")[0];
    return { status: response.status, data: response.headers.get("content-type")?.includes("json") ? await response.json() : null };
  }
  return { store, users, emails, logins, request, async close() { store.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}

test("passkeys use only configured origins and HTTPS (or local development)", () => {
  assert.deepEqual(passkeyConfiguration("https://www.ktga.me/path"), { origin, rpID: "www.ktga.me" });
  assert.equal(passkeyConfiguration("http://localhost:5173").rpID, "localhost");
  assert.throws(() => passkeyConfiguration("http://ktga.me"));
});

test("real WebAuthn registration and authentication enforce proof, UV, signature, origin and single use", async () => {
  const f = await fixture(), key = virtualPasskey("player");
  try {
    assert.equal((await f.request("/api/me/passkeys", null, { method: "GET", user: "" })).status, 401);
    assert.equal((await f.request("/api/me/passkeys/register/options", { method: "password", password }, { from: "https://evil.test" })).status, 403);
    assert.equal((await f.request("/api/me/passkeys/register/options", { method: "password", password: "wrong" })).status, 401);
    delete f.users[0].authSecurity;
    const setup = (await f.request("/api/me/passkeys/register/options", { method: "password", password, name: "Mon appareil" })).data;
    const registration = { challengeId: setup.challengeId, response: key.registration(setup.options) };
    assert.equal((await f.request("/api/me/passkeys/register/verify", registration, { cookies: "" })).status, 400);
    const added = await f.request("/api/me/passkeys/register/verify", registration);
    assert.equal(added.status, 200, JSON.stringify(added.data));
    assert.equal(added.data.security.passkeyCount, 1);
    assert.equal(added.data.passkeys[0].public_key, undefined);
    assert.equal(f.users[0].passkeyCount, 1);
    assert.equal((await f.request("/api/me/passkeys/register/verify", registration)).status, 400);
    for (const alteration of [{ uv: false }, { origin: "https://evil.test" }, { rpID: "evil.test" }]) {
      const options = (await f.request("/api/auth/passkeys/options", {}, { user: "" })).data;
      assert.equal((await f.request("/api/auth/passkeys/verify", { challengeId: options.challengeId, response: key.assertion(options.options, alteration) }, { user: "" })).status, 401);
      delete f.users[0].authSecurity;
    }
    const options = (await f.request("/api/auth/passkeys/options", {}, { user: "" })).data;
    const response = key.assertion(options.options); response.response.signature = "AAAA";
    assert.equal((await f.request("/api/auth/passkeys/verify", { challengeId: options.challengeId, response }, { user: "" })).status, 401);
    delete f.users[0].authSecurity;
    const valid = (await f.request("/api/auth/passkeys/options", {}, { user: "" })).data;
    const assertion = { challengeId: valid.challengeId, response: key.assertion(valid.options) };
    assert.equal((await f.request("/api/auth/passkeys/verify", assertion, { user: "" })).status, 200);
    assert.equal(f.logins[0].trusted.verifiedPasskey, true);
    assert.equal((await f.request("/api/auth/passkeys/verify", assertion, { user: "" })).status, 400);
    assert.equal(f.store.credential(key.credential.id).counter, 1);
    assert.equal((await f.request(`/api/me/passkeys/${added.data.passkeys[0].id}`, { name: "other" }, { method: "PATCH", user: "other" })).status, 404);
    assert.equal((await f.request(`/api/me/passkeys/${added.data.passkeys[0].id}`, { method: "password", password: "wrong" }, { method: "DELETE" })).status, 401);
    delete f.users[0].authSecurity;
    assert.equal((await f.request(`/api/me/passkeys/${added.data.passkeys[0].id}`, { method: "password", password }, { method: "DELETE" })).status, 200);
    assert.equal(f.users[0].passkeyCount, 0);
  } finally { await f.close(); }
});

test("email proofs are bound to their operation; MFA passkeys are tied to the correct account", async () => {
  const f = await fixture(), key = virtualPasskey("player"), other = virtualPasskey("other");
  try {
    const email = (await f.request("/api/me/passkeys/email", { purpose: "register" })).data;
    assert.equal(f.emails[0].purpose, "register");
    const proof = { method: "email", authorizationId: email.authorizationId, code: f.emails[0].code };
    assert.equal((await f.request("/api/me/passkeys/unknown", proof, { method: "DELETE" })).status, 401);
    delete f.users[0].authSecurity;
    const setup = (await f.request("/api/me/passkeys/register/options", proof)).data;
    assert.equal((await f.request("/api/me/passkeys/register/verify", { challengeId: setup.challengeId, response: key.registration(setup.options) })).status, 200);
    assert.equal((await f.request("/api/me/passkeys/register/options", proof)).status, 400);
    f.store.add("other", "Other", other.info); f.users[1].passkeyCount = 1;
    const mfa = createMfaChallenge(f.users[0], "passkey-test", false);
    const options = (await f.request("/api/auth/passkeys/options", { mfaChallengeId: mfa.id }, { user: "" })).data;
    assert.equal((await f.request("/api/auth/passkeys/verify", { challengeId: options.challengeId, response: other.assertion(options.options) }, { user: "" })).status, 401);
    const next = (await f.request("/api/auth/passkeys/options", { mfaChallengeId: mfa.id }, { user: "" })).data;
    assert.equal((await f.request("/api/auth/passkeys/verify", { challengeId: next.challengeId, response: key.assertion(next.options) }, { user: "" })).status, 200);
    assert.equal(mfaChallengeAccount(mfa.id, "passkey-test"), null);
  } finally { await f.close(); }
});

test("credential limits and optimistic updates protect revocation and concurrent changes", () => {
  const store = createPasskeyStore(":memory:"), key = virtualPasskey("user");
  try {
    const id = store.add("user", "One", key.info), snapshot = store.credential(key.credential.id);
    assert.equal(store.used(snapshot, { newCounter: 1, credentialBackedUp: false }), true);
    assert.equal(store.used(snapshot, { newCounter: 2, credentialBackedUp: false }), false);
    store.remove("user", id);
    assert.equal(store.used(snapshot, { newCounter: 3, credentialBackedUp: false }), false);
    for (let i = 0; i < 10; i++) store.add("user", String(i), virtualPasskey("user").info);
    assert.throws(() => store.add("user", "Eleven", virtualPasskey("user").info));
    store.deleteForUser("user"); assert.equal(store.count("user"), 0);
  } finally { store.close(); }
});

test("expired ceremonies and security changes during asynchronous verification cannot authenticate", async () => {
  let changed = () => {};
  const f = await fixture({ verifier: { verifyRegistrationResponse, verifyAuthenticationResponse: async input => { const result = await verifyAuthenticationResponse(input); changed(); return result; } } });
  const key = virtualPasskey("player");
  const id = f.store.add("player", "Device", key.info); f.users[0].passkeyCount = 1;
  try {
    let options = (await f.request("/api/auth/passkeys/options", {}, { user: "" })).data;
    changed = () => { f.users[0].sessionVersion++; };
    assert.equal((await f.request("/api/auth/passkeys/verify", { challengeId: options.challengeId, response: key.assertion(options.options) }, { user: "" })).status, 401);
    assert.equal(f.store.credential(key.credential.id).counter, 0);
    options = (await f.request("/api/auth/passkeys/options", {}, { user: "" })).data;
    changed = () => f.store.remove("player", id);
    assert.equal((await f.request("/api/auth/passkeys/verify", { challengeId: options.challengeId, response: key.assertion(options.options) }, { user: "" })).status, 401);
    assert.equal(f.logins.length, 0);
    options = (await f.request("/api/auth/passkeys/options", {}, { user: "" })).data;
    const now = Date.now;
    try {
      const future = now() + 6 * 60000; Date.now = () => future;
      assert.equal((await f.request("/api/auth/passkeys/verify", { challengeId: options.challengeId, response: key.assertion(options.options) }, { user: "" })).status, 400);
    } finally { Date.now = now; }
  } finally { await f.close(); }
});
