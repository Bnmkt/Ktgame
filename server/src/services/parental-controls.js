import fs from "node:fs";
import path from "node:path";
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

export const minorRestrictionOptions = Object.freeze([
  { id: "shop", label: "Boutique", description: "Consulter et acheter des objets cosmétiques." },
  { id: "community-events", label: "Événements communautaires", description: "Participer aux événements et à leurs classements." },
  { id: "friends", label: "Amis et invitations", description: "Ajouter, accepter ou rejoindre des amis." },
  { id: "chat", label: "Chat social", description: "Écrire dans les canaux globaux, privés et de table." },
  { id: "rooms", label: "Salons multijoueurs", description: "Créer, rejoindre ou observer des tables." },
  { id: "game:texas-holdem", label: "Texas Hold’em", description: "Créer ou rejoindre une table de poker." },
  { id: "game:belote", label: "Belote", description: "Créer ou rejoindre une table de belote." }
]);

export const defaultMinorRestrictions = Object.freeze(["shop", "game:texas-holdem", "game:belote"]);

const clean = (value, maximum = 254) => String(value ?? "").trim().slice(0, maximum);
const digest = (value) => createHash("sha256").update(String(value)).digest("hex");
const token = () => randomBytes(32).toString("base64url");

export function exactAge(birthDate, now = Date.now()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(birthDate ?? ""))) return null;
  const born = new Date(`${birthDate}T00:00:00.000Z`);
  const today = new Date(now);
  if (Number.isNaN(born.getTime()) || born > today) return null;
  let age = today.getUTCFullYear() - born.getUTCFullYear();
  if (today.getUTCMonth() < born.getUTCMonth() || (today.getUTCMonth() === born.getUTCMonth() && today.getUTCDate() < born.getUTCDate())) age -= 1;
  return age >= 0 && age <= 120 ? age : null;
}

export function turnsThirteenAt(birthDate) {
  const born = new Date(`${birthDate}T00:00:00.000Z`);
  if (Number.isNaN(born.getTime())) return null;
  born.setUTCFullYear(born.getUTCFullYear() + 13);
  return born.toISOString();
}

export function isUnder13(user, now = Date.now()) {
  const age = exactAge(user?.profile?.birthDate, now);
  return user?.registrationAuthorization?.ageBand === "under13" && age !== null && age < 13;
}

export function normalizeMinorRestrictions(value) {
  const allowed = new Set(minorRestrictionOptions.map((entry) => entry.id));
  return [...new Set((Array.isArray(value) ? value : defaultMinorRestrictions).map(String).filter((entry) => allowed.has(entry) || /^game:[a-z0-9-]{2,60}$/.test(entry)))];
}

export function activeModeration(user, now = Date.now()) {
  const moderation = user?.moderation ?? {};
  const active = (entry) => entry?.active === true && (!entry.endsAt || Date.parse(entry.endsAt) > now);
  if (active(moderation.hardBan)) return { type: "hard", ...moderation.hardBan };
  if (active(moderation.softBan)) return { type: "soft", ...moderation.softBan };
  return null;
}

export function activeParentalRevocation(user, now = Date.now()) {
  if (!isUnder13(user, now)) return null;
  const entry = user?.parentalAccess;
  if (entry?.status !== "revoked") return null;
  const until = entry.revokedUntil ? Date.parse(entry.revokedUntil) : Date.parse(turnsThirteenAt(user.profile?.birthDate));
  return Number.isFinite(until) && until > now ? { ...entry, revokedUntil: new Date(until).toISOString() } : null;
}

export function featureAccess(user, feature, restrictions, now = Date.now()) {
  const moderation = activeModeration(user, now);
  if (moderation?.type === "hard") return { allowed: false, code: "HARD_BAN", reason: moderation.reason, until: moderation.endsAt ?? "" };
  const revoked = activeParentalRevocation(user, now);
  if (revoked) return { allowed: false, code: "PARENTAL_ACCESS_REVOKED", reason: revoked.reason, until: revoked.revokedUntil };
  if (moderation?.type === "soft" && ["community-events", "rooms:join", "friends", "chat"].includes(feature)) return { allowed: false, code: "SOFT_BAN", reason: moderation.reason, until: moderation.endsAt ?? "" };
  const configured = normalizeMinorRestrictions(restrictions);
  const normalizedFeature = feature === "rooms:create" || feature === "rooms:join" ? "rooms" : feature;
  if (isUnder13(user, now) && configured.includes(normalizedFeature)) return { allowed: false, code: "MINOR_RESTRICTION", reason: "Cette fonctionnalité est limitée par le contrôle parental.", until: turnsThirteenAt(user.profile?.birthDate) };
  return { allowed: true };
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function registrationMarker({ deviceId, ip, userAgent }, secret) {
  const safeDevice = /^[a-zA-Z0-9_-]{16,100}$/.test(String(deviceId ?? "")) ? String(deviceId) : "";
  const address = String(ip ?? "").replace(/^::ffff:/, "");
  const network = address.includes(":") ? address.split(":").slice(0, 4).join(":") : address.split(".").slice(0, 3).join(".");
  const browser = /Firefox/i.test(userAgent) ? "firefox" : /Edg\//i.test(userAgent) ? "edge" : /Chrome/i.test(userAgent) ? "chrome" : /Safari/i.test(userAgent) ? "safari" : "other";
  const sign = (kind, value) => value ? createHmac("sha256", secret).update(`${kind}|${value}`).digest("hex") : "";
  return {
    device: sign("device", safeDevice),
    network: sign("network", network),
    browserNetwork: sign("browser-network", `${network}|${browser}`)
  };
}

export function createParentalControlStore({ filename, secret }) {
  const databasePath = path.resolve(filename);
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS parental_requests (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      child_email TEXT NOT NULL,
      child_pseudo TEXT NOT NULL,
      child_birth_date TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      parent_email TEXT NOT NULL,
      status TEXT NOT NULL,
      verification_hash TEXT,
      marker TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      parent_verified_at TEXT,
      parent_consent_at TEXT,
      reviewed_at TEXT,
      reviewed_by TEXT,
      rejection_reason TEXT,
      user_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_parental_requests_status ON parental_requests(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_parental_requests_marker ON parental_requests(marker, created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_parental_pending_email ON parental_requests(lower(child_email)) WHERE status IN ('email_pending','admin_pending','approved');
    CREATE TABLE IF NOT EXISTS parental_activity (
      user_id TEXT NOT NULL,
      day TEXT NOT NULL,
      category TEXT NOT NULL,
      label TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      first_at TEXT NOT NULL,
      last_at TEXT NOT NULL,
      PRIMARY KEY(user_id, day, category, label)
    );
    CREATE INDEX IF NOT EXISTS idx_parental_activity_user_day ON parental_activity(user_id, day);
    CREATE TABLE IF NOT EXISTS parental_mail_log (
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      day TEXT NOT NULL,
      sent_at TEXT NOT NULL,
      PRIMARY KEY(user_id, kind, day)
    );
    CREATE TABLE IF NOT EXISTS parental_registration_signals (
      request_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      signal_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(request_id, kind),
      FOREIGN KEY(request_id) REFERENCES parental_requests(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_parental_registration_signals ON parental_registration_signals(kind, signal_hash, created_at DESC);
  `);

  const publicRequest = (row) => row ? ({ id: row.id, code: row.code, childEmail: row.child_email, childPseudo: row.child_pseudo, childBirthDate: row.child_birth_date, parentEmail: row.parent_email, status: row.status, createdAt: row.created_at, expiresAt: row.expires_at, parentVerifiedAt: row.parent_verified_at, parentConsentAt: row.parent_consent_at, reviewedAt: row.reviewed_at, reviewedBy: row.reviewed_by, rejectionReason: row.rejection_reason, userId: row.user_id }) : null;
  const internalRequest = (row) => row ? ({ ...publicRequest(row), passwordHash: row.password_hash, marker: row.marker }) : null;
  const signPortal = (row) => {
    const payload = Buffer.from(JSON.stringify({ requestId: row.id, parentEmail: row.parent_email })).toString("base64url");
    const signature = createHmac("sha256", secret).update(payload).digest("base64url");
    return `${payload}.${signature}`;
  };

  function portalRequest(portalToken) {
    const [payload, signature] = String(portalToken ?? "").split(".");
    if (!payload || !signature) return null;
    const expected = createHmac("sha256", secret).update(payload).digest("base64url");
    if (!safeEqual(signature, expected)) return null;
    let decoded;
    try { decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); } catch { return null; }
    const row = db.prepare("SELECT * FROM parental_requests WHERE id=? AND parent_email=? AND status='approved'").get(decoded.requestId, decoded.parentEmail);
    return row ? { ...publicRequest(row), portalToken: signPortal(row) } : null;
  }

  return {
    createRequest(input, markers, now = Date.now()) {
      const verificationToken = token();
      const id = randomUUID();
      const code = `PAR-${randomBytes(3).toString("hex").toUpperCase()}-${randomBytes(2).toString("hex").toUpperCase()}`;
      const createdAt = new Date(now).toISOString();
      const expiresAt = new Date(now + 14 * 86400000).toISOString();
      db.prepare("DELETE FROM parental_requests WHERE status IN ('email_pending','admin_pending') AND expires_at <= ?").run(createdAt);
      const childEmail = clean(input.childEmail).toLowerCase();
      const childPseudo = clean(input.childPseudo, 32);
      db.prepare("INSERT INTO parental_requests(id,code,child_email,child_pseudo,child_birth_date,password_hash,parent_email,status,verification_hash,marker,created_at,expires_at) VALUES(?,?,?,?,?,?,?,'email_pending',?,?,?,?)")
        .run(id, code, childEmail, childPseudo, input.childBirthDate, input.passwordHash, clean(input.parentEmail).toLowerCase(), digest(verificationToken), markers?.browserNetwork || markers?.network || "", createdAt, expiresAt);
      const insertSignal = db.prepare("INSERT OR IGNORE INTO parental_registration_signals(request_id,kind,signal_hash,created_at) VALUES(?,?,?,?)");
      for (const [kind, signalHash] of Object.entries({ device: markers?.device, network: markers?.network, browserNetwork: markers?.browserNetwork, email: digest(childEmail), pseudo: digest(childPseudo.toLowerCase()) })) {
        if (signalHash) insertSignal.run(id, kind, signalHash, createdAt);
      }
      const row = db.prepare("SELECT * FROM parental_requests WHERE id=?").get(id);
      return { ...publicRequest(row), verificationToken };
    },
    requestForVerification(verificationToken, now = Date.now()) {
      const row = db.prepare("SELECT * FROM parental_requests WHERE verification_hash=? AND status='email_pending' AND expires_at>?").get(digest(verificationToken), new Date(now).toISOString());
      return publicRequest(row);
    },
    consent(verificationToken, now = Date.now()) {
      const hash = digest(verificationToken);
      const row = db.prepare("SELECT * FROM parental_requests WHERE verification_hash=? AND status='email_pending' AND expires_at>?").get(hash, new Date(now).toISOString());
      if (!row) return null;
      const at = new Date(now).toISOString();
      db.prepare("UPDATE parental_requests SET status='admin_pending',parent_verified_at=?,parent_consent_at=?,verification_hash=NULL WHERE id=?").run(at, at, row.id);
      return publicRequest(db.prepare("SELECT * FROM parental_requests WHERE id=?").get(row.id));
    },
    listRequests() { return db.prepare("SELECT * FROM parental_requests ORDER BY created_at DESC LIMIT 250").all().map(publicRequest); },
    getInternal(id) { return internalRequest(db.prepare("SELECT * FROM parental_requests WHERE id=?").get(id)); },
    approve(id, reviewerId, userId, now = Date.now()) {
      const row = db.prepare("SELECT * FROM parental_requests WHERE id=? AND status='admin_pending'").get(id);
      if (!row) return null;
      const at = new Date(now).toISOString();
      db.prepare("UPDATE parental_requests SET status='approved',reviewed_at=?,reviewed_by=?,user_id=?,password_hash='' WHERE id=?").run(at, clean(reviewerId, 80), userId, id);
      const updated = db.prepare("SELECT * FROM parental_requests WHERE id=?").get(id);
      return { ...publicRequest(updated), portalToken: signPortal(updated) };
    },
    reject(id, reviewerId, reason, now = Date.now()) {
      const row = db.prepare("SELECT * FROM parental_requests WHERE id=? AND status IN ('email_pending','admin_pending')").get(id);
      if (!row) return null;
      db.prepare("UPDATE parental_requests SET status='rejected',reviewed_at=?,reviewed_by=?,rejection_reason=?,verification_hash=NULL,password_hash='' WHERE id=?").run(new Date(now).toISOString(), clean(reviewerId, 80), clean(reason, 300), id);
      return publicRequest(db.prepare("SELECT * FROM parental_requests WHERE id=?").get(id));
    },
    hasRecentMinorRisk({ markers, email, pseudo }, now = Date.now()) {
      const candidates = {
        device: markers?.device,
        network: markers?.network,
        browserNetwork: markers?.browserNetwork,
        email: email ? digest(clean(email).toLowerCase()) : "",
        pseudo: pseudo ? digest(clean(pseudo, 32).toLowerCase()) : ""
      };
      const since = new Date(now - 7 * 86400000).toISOString();
      const find = db.prepare("SELECT 1 FROM parental_registration_signals WHERE kind=? AND signal_hash=? AND created_at>? LIMIT 1");
      return Object.entries(candidates).some(([kind, signalHash]) => signalHash && find.get(kind, signalHash, since));
    },
    hasRecentMinorMarker(markers, now = Date.now()) {
      return this.hasRecentMinorRisk({ markers }, now);
    },
    portalRequest,
    portalTokenForUser(userId) {
      const row = db.prepare("SELECT * FROM parental_requests WHERE user_id=? AND status='approved' ORDER BY reviewed_at DESC LIMIT 1").get(userId);
      return row ? signPortal(row) : "";
    },
    approvedGuardians() { return db.prepare("SELECT * FROM parental_requests WHERE status='approved' AND user_id IS NOT NULL").all().map((row) => ({ ...publicRequest(row), portalToken: signPortal(row) })); },
    recordActivity(userId, { day, category, label, count = 1, durationSeconds = 0 }, now = Date.now()) {
      const at = new Date(now).toISOString();
      db.prepare(`INSERT INTO parental_activity(user_id,day,category,label,count,duration_seconds,first_at,last_at) VALUES(?,?,?,?,?,?,?,?)
        ON CONFLICT(user_id,day,category,label) DO UPDATE SET count=count+excluded.count,duration_seconds=duration_seconds+excluded.duration_seconds,last_at=excluded.last_at`)
        .run(userId, day, clean(category, 40), clean(label, 100), Math.max(0, Math.floor(count)), Math.max(0, Math.floor(durationSeconds)), at, at);
    },
    activity(userId, day) {
      return db.prepare("SELECT category,label,count,duration_seconds AS durationSeconds,first_at AS firstAt,last_at AS lastAt FROM parental_activity WHERE user_id=? AND day=? ORDER BY first_at").all(userId, day);
    },
    mailWasSent(userId, kind, day) { return Boolean(db.prepare("SELECT 1 FROM parental_mail_log WHERE user_id=? AND kind=? AND day=?").get(userId, kind, day)); },
    mailKindWasSent(userId, kind) { return Boolean(db.prepare("SELECT 1 FROM parental_mail_log WHERE user_id=? AND kind=? LIMIT 1").get(userId, kind)); },
    markMailSent(userId, kind, day, now = Date.now()) { db.prepare("INSERT OR IGNORE INTO parental_mail_log(user_id,kind,day,sent_at) VALUES(?,?,?,?)").run(userId, kind, day, new Date(now).toISOString()); },
    deleteForUser(userId) {
      const requests = db.prepare("SELECT id FROM parental_requests WHERE user_id=?").all(userId);
      const removeSignals = db.prepare("DELETE FROM parental_registration_signals WHERE request_id=?");
      for (const request of requests) removeSignals.run(request.id);
      db.prepare("DELETE FROM parental_requests WHERE user_id=?").run(userId);
      db.prepare("DELETE FROM parental_activity WHERE user_id=?").run(userId);
      db.prepare("DELETE FROM parental_mail_log WHERE user_id=?").run(userId);
    },
    prune(beforeDay, now = Date.now()) {
      db.prepare("DELETE FROM parental_activity WHERE day<?").run(beforeDay);
      db.prepare("DELETE FROM parental_mail_log WHERE day<?").run(beforeDay);
      db.prepare("DELETE FROM parental_registration_signals WHERE created_at<?").run(new Date(now - 7 * 86400000).toISOString());
      db.prepare("DELETE FROM parental_requests WHERE status IN ('email_pending','admin_pending') AND expires_at<=?").run(new Date(now).toISOString());
      db.prepare("DELETE FROM parental_requests WHERE status='rejected' AND reviewed_at<?").run(new Date(now - 30 * 86400000).toISOString());
    },
    close() { db.close(); }
  };
}
