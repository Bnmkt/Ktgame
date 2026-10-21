import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import rateLimit from "express-rate-limit";
import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } from "@simplewebauthn/server";
import { createPasskeyStore, MAX_PASSKEYS } from "./passkey-store.js";
import { authLockStatus, recordAuthFailure, mfaSummary, verifyUserMfa, mfaChallengeAccount, consumePasskeyMfaChallenge } from "./account-security.js";

const TTL = 5 * 60 * 1000;
const hash = value => createHash("sha256").update(String(value)).digest("hex");
const equal = (a, b) => typeof a === "string" && typeof b === "string" && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const cleanName = value => String(value ?? "").replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, 64) || "Passkey";
const userHandle = id => createHash("sha256").update(`ktga:passkey:${id}`).digest();
const failure = (message, status = 400) => Object.assign(new Error(message), { status });

export function passkeyConfiguration(website) {
  const url = new URL(website);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) throw failure("Les passkeys nécessitent une connexion HTTPS.", 503);
  return { origin: url.origin, rpID: url.hostname };
}

export function registerPasskeyRoutes({ app, auth, filename, readDb, writeDb, website, siteName, bcrypt, secret, fingerprint, requestCookie, sendCode, emailAvailable, beginAccountLogin, sendAuthLocked, cookiePath = "/", secureCookies = true, verifier = { verifyRegistrationResponse, verifyAuthenticationResponse } }) {
  const store = createPasskeyStore(filename), pending = new Map(), lastEmail = new Map();
  const prune = () => {
    for (const [id, entry] of pending) if (entry.expires <= Date.now()) pending.delete(id);
    for (const [id, at] of lastEmail) if (Date.now() - at > TTL) lastEmail.delete(id);
  };
  const timer = setInterval(prune, 30000); timer.unref();
  function origin(req) {
    const configuration = passkeyConfiguration(website());
    if (req.headers.origin !== configuration.origin) throw failure("Ouvre KTGA dans ton navigateur pour utiliser une passkey.", 403);
    return configuration;
  }
  function binding(req, res, create = false) {
    let token = requestCookie(req, "ktga_passkey");
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
      if (!create) throw failure("Cette demande de passkey a expiré.");
      token = randomBytes(32).toString("base64url");
      res.append("Set-Cookie", `ktga_passkey=${token}; Path=${cookiePath}; HttpOnly; SameSite=Lax; Max-Age=600${secureCookies ? "; Secure" : ""}`);
    }
    return hash(`${token}|${fingerprint(req)}`);
  }
  function challenge(req, res, type, data) {
    prune();
    if (pending.size >= 10000) throw failure("Trop de demandes de passkey. Réessaie dans un instant.", 429);
    const id = randomBytes(24).toString("base64url");
    pending.set(id, { ...data, type, binding: binding(req, res, true), origin: origin(req).origin, expires: Date.now() + TTL, attempts: 0 });
    return id;
  }
  function take(req, res, id, type, consume = true) {
    const entry = pending.get(String(id ?? ""));
    if (!entry || entry.type !== type || entry.expires <= Date.now() || entry.origin !== origin(req).origin || !equal(entry.binding, binding(req, res))) throw failure("Cette demande de passkey a expiré.");
    if (consume) pending.delete(id);
    return entry;
  }
  const current = req => {
    const user = readDb().users.find(row => row.id === req.auth?.id && !row.guest);
    if (!user) throw failure("Les invités ne disposent pas de passkeys.", 403);
    return user;
  };
  function locked(user, res) {
    const lock = authLockStatus(user);
    if (!lock.locked) return false;
    sendAuthLocked(res, lock); return true;
  }
  function saveCount(userId) {
    const db = readDb(), user = db.users.find(row => row.id === userId);
    if (user) { user.passkeyCount = store.count(userId); writeDb(db, { users: [user.id], rooms: [] }); }
    return user;
  }
  function rejected(user, res) {
    const db = readDb(), latest = user && db.users.find(row => row.id === user.id);
    const lock = recordAuthFailure(latest, latest ? "" : "passkey-unknown");
    if (latest) writeDb(db, { users: [latest.id], rooms: [] });
    if (lock.locked) return sendAuthLocked(res, lock);
    return res.status(401).json({ error: "La vérification de la passkey a échoué." });
  }
  const wrap = action => async (req, res, next) => {
    res.set("Cache-Control", "no-store");
    req.body ??= {};
    try { await action(req, res); }
    catch (error) {
      if (res.headersSent) return next(error);
      if (error.status) return res.status(error.status).json({ error: error.message });
      next(error);
    }
  };
  async function proof(req, res, user, purpose, target = "") {
    const snapshot = { version: Number(user.sessionVersion) || 0, passwordHash: user.passwordHash };
    let valid = false;
    if (req.body.method === "email") {
      const entry = take(req, res, req.body.authorizationId, "email", false);
      entry.attempts++;
      const codeHash = createHmac("sha256", secret).update(String(req.body.code ?? "")).digest("hex");
      valid = entry.userId === user.id && entry.version === snapshot.version && entry.email === user.email && entry.purpose === purpose && entry.target === target && entry.attempts <= 5 && emailAvailable(user) && equal(entry.codeHash, codeHash);
      if (valid || entry.attempts >= 5) pending.delete(req.body.authorizationId);
    } else if (req.body.method === "totp") valid = verifyUserMfa(user, "totp", req.body.code, secret, Date.now(), false);
    else if (req.body.method === "password" && typeof req.body.password === "string" && req.body.password.length <= 128) valid = Boolean(user.passwordHash && await bcrypt.compare(req.body.password, user.passwordHash));
    const latest = current(req);
    if ((Number(latest.sessionVersion) || 0) !== snapshot.version || latest.passwordHash !== snapshot.passwordHash) throw failure("La sécurité du compte a changé. Reconnecte-toi.", 401);
    if (locked(latest, res)) return null;
    if (!valid) { rejected(latest, res); return null; }
    return latest;
  }
  app.use("/api/me/passkeys", auth, rateLimit({ windowMs: 15 * 60000, limit: 60, standardHeaders: "draft-7", legacyHeaders: false }));
  app.get("/api/me/passkeys", wrap((req, res) => {
    const user = current(req);
    res.json({ passkeys: store.list(user.id), emailAvailable: emailAvailable(user), totpEnabled: Boolean(user.mfa?.totpSecret), limit: MAX_PASSKEYS });
  }));
  app.post("/api/me/passkeys/email", wrap(async (req, res) => {
    origin(req);
    const user = current(req);
    if (locked(user, res)) return;
    if (!emailAvailable(user)) throw failure("Une adresse email vérifiée et disponible est nécessaire.", 409);
    const purpose = req.body.purpose === "delete" ? "delete" : "register";
    const target = purpose === "delete" ? String(req.body.id ?? "").slice(0, 64) : "";
    if (Date.now() - (lastEmail.get(user.id) || 0) < 60000) throw failure("Un code a déjà été envoyé récemment.", 429);
    lastEmail.set(user.id, Date.now());
    const code = String(randomInt(0, 1000000)).padStart(6, "0");
    const id = challenge(req, res, "email", { userId: user.id, email: user.email, version: Number(user.sessionVersion) || 0, purpose, target, codeHash: createHmac("sha256", secret).update(code).digest("hex") });
    try { await sendCode(user, code, purpose); }
    catch { pending.delete(id); throw failure("Le code de vérification n’a pas pu être envoyé.", 503); }
    res.json({ authorizationId: id });
  }));
  app.post("/api/me/passkeys/register/options", wrap(async (req, res) => {
    const configuration = origin(req), user = current(req);
    if (locked(user, res)) return;
    if (store.count(user.id) >= MAX_PASSKEYS) throw failure("La limite de dix passkeys est atteinte.", 409);
    const verified = await proof(req, res, user, "register");
    if (!verified) return;
    const options = await generateRegistrationOptions({ rpName: siteName(), rpID: configuration.rpID, userName: verified.email || verified.pseudo, userDisplayName: verified.profile?.displayName || verified.pseudo, userID: userHandle(verified.id), attestationType: "none", authenticatorSelection: { residentKey: "required", userVerification: "required" }, excludeCredentials: store.credentials(user.id), supportedAlgorithmIDs: [-7, -257], timeout: 60000 });
    const challengeId = challenge(req, res, "register", { userId: user.id, version: Number(verified.sessionVersion) || 0, challenge: options.challenge, name: cleanName(req.body.name) });
    res.json({ options, challengeId });
  }));
  app.post("/api/me/passkeys/register/verify", wrap(async (req, res) => {
    const configuration = origin(req), user = current(req);
    if (locked(user, res)) return;
    const entry = take(req, res, req.body.challengeId, "register");
    if (entry.userId !== user.id || entry.version !== (Number(user.sessionVersion) || 0)) throw failure("Cette demande de passkey a expiré.");
    let result;
    try { result = await verifier.verifyRegistrationResponse({ response: req.body.response, expectedChallenge: entry.challenge, expectedOrigin: configuration.origin, expectedRPID: configuration.rpID, requireUserVerification: true, supportedAlgorithmIDs: [-7, -257] }); }
    catch { return rejected(user, res); }
    const latest = current(req);
    if (!result.verified || !result.registrationInfo?.userVerified) return rejected(latest, res);
    if (entry.version !== (Number(latest.sessionVersion) || 0)) throw failure("La sécurité du compte a changé. Reconnecte-toi.", 401);
    if (locked(latest, res)) return;
    try { store.add(user.id, entry.name, result.registrationInfo); }
    catch { throw failure("Cette passkey est déjà enregistrée ou la limite est atteinte.", 409); }
    const updated = saveCount(user.id);
    res.json({ passkeys: store.list(user.id), security: mfaSummary(updated) });
  }));
  app.patch("/api/me/passkeys/:id", wrap((req, res) => {
    origin(req);
    const user = current(req);
    if (!store.rename(user.id, req.params.id, cleanName(req.body.name))) throw failure("Passkey introuvable.", 404);
    res.json({ passkeys: store.list(user.id) });
  }));
  app.delete("/api/me/passkeys/:id", wrap(async (req, res) => {
    origin(req);
    const user = current(req);
    if (locked(user, res)) return;
    const verified = await proof(req, res, user, "delete", req.params.id);
    if (!verified) return;
    if (verified.admin && store.count(user.id) <= 1 && !verified.mfa?.totpSecret && !emailAvailable(verified)) throw failure("Conserve une autre méthode de double authentification avant de supprimer la dernière passkey.", 409);
    if (!store.remove(user.id, req.params.id)) throw failure("Passkey introuvable.", 404);
    const updated = saveCount(user.id);
    res.json({ passkeys: store.list(user.id), security: mfaSummary(updated) });
  }));
  app.post("/api/auth/passkeys/options", wrap(async (req, res) => {
    const configuration = origin(req);
    let user, mfaId = "";
    if (req.body.mfaChallengeId) {
      mfaId = String(req.body.mfaChallengeId);
      const context = mfaChallengeAccount(mfaId, fingerprint(req));
      user = context && readDb().users.find(row => row.id === context.userId);
      if (!user || context.sessionVersion !== (Number(user.sessionVersion) || 0) || !store.count(user.id)) throw failure("Cette tentative de connexion a expiré.");
      if (locked(user, res)) return;
    }
    const options = await generateAuthenticationOptions({ rpID: configuration.rpID, userVerification: "required", ...(user ? { allowCredentials: store.credentials(user.id) } : {}), timeout: 60000 });
    const challengeId = challenge(req, res, "login", { challenge: options.challenge, userId: user?.id, version: user ? Number(user.sessionVersion) || 0 : null, mfaId });
    res.json({ options, challengeId });
  }));
  app.post("/api/auth/passkeys/verify", wrap(async (req, res) => {
    const configuration = origin(req), entry = take(req, res, req.body.challengeId, "login");
    const response = req.body.response;
    const credential = typeof response?.id === "string" && response.id.length <= 1500 ? store.credential(response.id) : null;
    const user = credential && readDb().users.find(row => row.id === credential.user_id && !row.guest);
    if (!user || entry.userId && entry.userId !== user.id) return rejected(null, res);
    if (locked(user, res)) return;
    const version = Number(user.sessionVersion) || 0;
    if (entry.version !== null && entry.version !== version) throw failure("Cette tentative de connexion a expiré.");
    // A discoverable credential's user handle must match its server-side owner.
    if (response.response?.userHandle && response.response.userHandle !== userHandle(user.id).toString("base64url")) return rejected(user, res);
    let result;
    try { result = await verifier.verifyAuthenticationResponse({ response, expectedChallenge: entry.challenge, expectedOrigin: configuration.origin, expectedRPID: configuration.rpID, credential: { id: credential.credential_id, publicKey: new Uint8Array(credential.public_key), counter: credential.counter, transports: JSON.parse(credential.transports) }, requireUserVerification: true }); }
    catch { return rejected(user, res); }
    const db = readDb(), latest = db.users.find(row => row.id === user.id && !row.guest);
    if (!result.verified || !result.authenticationInfo?.userVerified) return rejected(latest, res);
    if (!latest || version !== (Number(latest.sessionVersion) || 0)) throw failure("La sécurité du compte a changé. Recommence la connexion.", 401);
    if (locked(latest, res)) return;
    if (!store.used(credential, result.authenticationInfo)) throw failure("Cette passkey a changé. Recommence la connexion.", 401);
    if (entry.mfaId && !consumePasskeyMfaChallenge(entry.mfaId, fingerprint(req), latest)) throw failure("Cette tentative de connexion a expiré.");
    latest.passkeyCount = store.count(latest.id);
    await beginAccountLogin(req, res, db, latest, "passkey", "", { verifiedPasskey: true });
  }));
  return { ...store, close() { clearInterval(timer); pending.clear(); store.close(); } };
}
