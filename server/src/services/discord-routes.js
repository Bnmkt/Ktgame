import { createDiscordOAuth, discordConfiguration, discordAgeAllowed } from "./discord-oauth.js";

const cookieName = "ktga_discord_flow";

export function registerDiscordRoutes({ app, auth, platformSettings, readDb, sanitizeUser, bcrypt, isUnder13,
  requestCookie, publicWebsiteUrl, beginAccountLogin, authFailureKey, authLockStatus, recordAuthFailure, sendAuthLocked,
  writeDb, secureCookies, oauth = createDiscordOAuth(), configuration = () => discordConfiguration() }) {
  const available = () => platformSettings().discordLoginEnabled && configuration().available;
  app.get("/api/me/discord", auth, (req, res) => {
    const user = readDb().users.find((entry) => entry.id === req.auth.id);
    res.setHeader("Cache-Control", "no-store");
    res.json({ available: available() && Boolean(user && !user.guest && !isUnder13(user) && discordAgeAllowed(user)), ageAllowed: discordAgeAllowed(user), linked: Boolean(user?.discord?.id), username: user?.discord?.username ?? "" });
  });
  function cookie(res, value, clear = false) {
    res.append("Set-Cookie", `${cookieName}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : 600}${secureCookies ? "; Secure" : ""}`);
    res.setHeader("Cache-Control", "no-store");
  }
  function start(res, binding) {
    if (!available()) return res.status(503).json({ error: "La connexion Discord n’est pas encore configurée." });
    try {
      const flow = oauth.start(binding);
      cookie(res, flow.state);
      res.json({ url: flow.url });
    } catch { res.status(503).json({ error: "La connexion Discord est temporairement indisponible." }); }
  }
  app.post("/api/auth/discord/start", (req, res) => start(res, { intent: "login", roomCode: typeof req.body.roomCode === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(req.body.roomCode) ? req.body.roomCode : "" }));
  app.get("/api/auth/discord/callback", async (req, res) => {
    let result = { intent: "login", roomCode: "" };
    try { result = await oauth.callback(req.query.state, requestCookie(req, cookieName), req.query.code, Boolean(req.query.error)); }
    catch { /* The completion endpoint reports a generic expired/invalid flow. */ }
    const url = new URL(publicWebsiteUrl());
    if (result.intent === "link") url.pathname = `${url.pathname.replace(/\/$/, "")}/profil`;
    else if (result.roomCode) url.pathname = `${url.pathname.replace(/\/$/, "")}/table/${result.roomCode}`;
    url.search = "?discord=complete";
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.redirect(303, url.href);
  });
  app.post("/api/me/discord/link", auth, async (req, res) => {
    let db = readDb();
    let user = db.users.find((entry) => entry.id === req.auth.id);
    if (!user || user.guest || isUnder13(user) || !discordAgeAllowed(user)) return res.status(403).json({ error: "L’association Discord nécessite une date de naissance renseignée et un âge de 13 ans ou plus." });
    const key = authFailureKey(user.email || user.pseudo, req);
    const lock = authLockStatus(user, key);
    if (lock.locked) return sendAuthLocked(res, lock);
    const hash = user.passwordHash;
    const verified = await bcrypt.compare(String(req.body.password ?? ""), hash);
    db = readDb();
    user = db.users.find((entry) => entry.id === req.auth.id);
    if (!user || user.passwordHash !== hash || (Number(user.sessionVersion) || 0) !== (Number(req.auth.sessionVersion) || 0)) return res.status(401).json({ error: "La session a changé. Reconnecte-toi." });
    const refreshedLock = authLockStatus(user, key);
    if (refreshedLock.locked) return sendAuthLocked(res, refreshedLock);
    if (!verified) {
      const failure = recordAuthFailure(user, key);
      writeDb(db, { users: [user.id], rooms: [] });
      if (failure.locked) return sendAuthLocked(res, failure);
      return res.status(401).json({ error: "Mot de passe incorrect." });
    }
    start(res, { intent: "link", userId: user.id, sessionVersion: Number(user.sessionVersion) || 0, passwordHash: hash });
  });
  app.post("/api/auth/discord/complete", async (req, res) => {
    const flow = oauth.consume(requestCookie(req, cookieName));
    cookie(res, "", true);
    if (!available()) return res.status(503).json({ error: "La connexion Discord est indisponible." });
    if (!flow || flow.error || !flow.profile) return res.status(400).json({ error: flow?.error === "DISCORD_CANCELLED" ? "Connexion Discord annulée." : "La connexion Discord a expiré ou échoué. Réessaie." });
    if (flow.intent === "link") return auth(req, res, () => {
      const db = readDb();
      const user = db.users.find((entry) => entry.id === req.auth.id);
      if (!user || user.guest || isUnder13(user) || !discordAgeAllowed(user) || user.id !== flow.userId || (Number(user.sessionVersion) || 0) !== flow.sessionVersion || user.passwordHash !== flow.passwordHash) return res.status(403).json({ error: "L’association a expiré. Recommence depuis ton profil." });
      if (db.users.some((entry) => entry.id !== user.id && entry.discord?.id === flow.profile.id)) return res.status(409).json({ error: "Ce compte Discord est déjà associé à un autre joueur." });
      if (user.discord?.id && user.discord.id !== flow.profile.id) return res.status(409).json({ error: "Dissocie d’abord le compte Discord actuel." });
      user.discord = { ...flow.profile, linkedAt: new Date().toISOString() };
      writeDb(db, { users: [user.id], rooms: [] });
      res.json({ linked: true, user: sanitizeUser(user) });
    });
    const db = readDb();
    const user = db.users.find((entry) => !entry.guest && entry.discord?.id === flow.profile.id);
    if (!user) return res.status(404).json({ code: "DISCORD_NOT_LINKED", error: "Ce Discord n’est pas encore associé. Crée un compte ou connecte-toi avec ton email, puis associe Discord dans Profil > Connexion et sécurité." });
    if (isUnder13(user) || !discordAgeAllowed(user)) return res.status(403).json({ error: "La connexion Discord est réservée aux comptes de 13 ans et plus avec une date de naissance renseignée." });
    const key = authFailureKey(user.email || user.pseudo, req);
    const lock = authLockStatus(user, key);
    if (lock.locked) return sendAuthLocked(res, lock);
    return beginAccountLogin(req, res, db, user, "discord", key);
  });
  app.delete("/api/me/discord", auth, async (req, res) => {
    let db = readDb();
    let user = db.users.find((entry) => entry.id === req.auth.id);
    if (!user || user.guest) return res.status(403).json({ error: "Compte joueur nécessaire." });
    const key = authFailureKey(user.email || user.pseudo, req);
    const lock = authLockStatus(user, key);
    if (lock.locked) return sendAuthLocked(res, lock);
    const hash = user.passwordHash;
    const verified = await bcrypt.compare(String(req.body.password ?? ""), hash);
    db = readDb(); user = db.users.find((entry) => entry.id === req.auth.id);
    if (!user || user.passwordHash !== hash || (Number(user.sessionVersion) || 0) !== (Number(req.auth.sessionVersion) || 0)) return res.status(401).json({ error: "La session a changé. Reconnecte-toi." });
    const refreshedLock = authLockStatus(user, key);
    if (refreshedLock.locked) return sendAuthLocked(res, refreshedLock);
    if (!verified) {
      const failure = recordAuthFailure(user, key);
      writeDb(db, { users: [user.id], rooms: [] });
      if (failure.locked) return sendAuthLocked(res, failure);
      return res.status(401).json({ error: "Mot de passe incorrect." });
    }
    delete user.discord;
    writeDb(db, { users: [user.id], rooms: [] });
    res.json({ user: sanitizeUser(user) });
  });
}
