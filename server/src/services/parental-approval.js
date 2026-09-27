import { createHash, randomBytes, randomUUID } from "node:crypto";
import { PRIVACY_VERSION } from "./site-achievements.js";
const digest = (code) => createHash("sha256").update(String(code)).digest("hex");

export function createParentalApproval(db, input, reviewerId, now = Date.now()) {
  if (input.verified !== true) throw new Error("Confirmez la verification du representant legal et de son autorisation.");
  const reference = String(input.reference ?? "").trim();
  if (!/^[a-zA-Z0-9_-]{3,60}$/.test(reference)) throw new Error("Reference de dossier requise (3 a 60 lettres, chiffres ou tirets).");
  db.settings ??= {};
  const rows = (db.settings.parentalApprovals ?? []).filter((row) => Date.parse(row.expiresAt) > now);
  if (rows.length >= 100) throw new Error("Trop d'autorisations en attente.");
  const code = randomBytes(24).toString("base64url");
  const row = { id: randomUUID(), reference, reviewerId, version: PRIVACY_VERSION, approvedAt: new Date(now).toISOString(), expiresAt: new Date(now + 72 * 3600000).toISOString(), hash: digest(code) };
  db.settings.parentalApprovals = [...rows, row];
  return { id: row.id, code, expiresAt: row.expiresAt };
}

export function registrationAuthorization(db, input, now = Date.now()) {
  if (input.termsVersion !== PRIVACY_VERSION) throw new Error("Veuillez accepter les conditions d'utilisation actuelles.");
  if (!["13plus", "under13"].includes(input.ageBand)) throw new Error("Choisissez votre tranche d'age.");
  if (input.ageBand === "13plus") return { ageBand: "13plus", termsVersion: PRIVACY_VERSION, acceptedAt: new Date(now).toISOString() };
  const hash = digest(String(input.parentalCode ?? "").trim());
  const row = (db.settings?.parentalApprovals ?? []).find((entry) => entry.hash === hash && Date.parse(entry.expiresAt) > now && entry.version === PRIVACY_VERSION);
  if (!row) throw new Error("Une autorisation parentale valide est necessaire avant l'inscription.");
  db.settings.parentalApprovals = db.settings.parentalApprovals.filter((entry) => entry.id !== row.id);
  const { hash: _hash, expiresAt: _expiry, ...approval } = row;
  return { ageBand: "under13", termsVersion: PRIVACY_VERSION, acceptedAt: new Date(now).toISOString(), parentalApproval: approval };
}
