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
  const birthDate = String(input.birthDate ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) throw new Error("Saisissez une date de naissance valide.");
  const born = new Date(`${birthDate}T00:00:00.000Z`);
  const today = new Date(now);
  if (Number.isNaN(born.getTime()) || born.toISOString().slice(0, 10) !== birthDate || born > today) throw new Error("Saisissez une date de naissance valide.");
  let age = today.getUTCFullYear() - born.getUTCFullYear();
  if (today.getUTCMonth() < born.getUTCMonth() || (today.getUTCMonth() === born.getUTCMonth() && today.getUTCDate() < born.getUTCDate())) age -= 1;
  if (age < 0 || age > 120) throw new Error("Saisissez une date de naissance valide.");
  const ageBand = age < 13 ? "under13" : "13plus";
  if (ageBand === "13plus") return { ageBand, birthDate, termsVersion: PRIVACY_VERSION, acceptedAt: new Date(now).toISOString() };
  const hash = digest(String(input.parentalCode ?? "").trim());
  const row = (db.settings?.parentalApprovals ?? []).find((entry) => entry.hash === hash && Date.parse(entry.expiresAt) > now && entry.version === PRIVACY_VERSION);
  if (!row) throw new Error("Une autorisation parentale valide est necessaire avant l'inscription.");
  db.settings.parentalApprovals = db.settings.parentalApprovals.filter((entry) => entry.id !== row.id);
  const { hash: _hash, expiresAt: _expiry, ...approval } = row;
  return { ageBand, birthDate, termsVersion: PRIVACY_VERSION, acceptedAt: new Date(now).toISOString(), parentalApproval: approval };
}
