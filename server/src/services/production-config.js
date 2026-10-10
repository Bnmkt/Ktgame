import { normalizeContactEmail } from "./site-contact.js";
import { sqliteSettings } from "../storage/sqlite-settings.js";

export function checkProductionConfig(environment) {
  const errors = [], warnings = [];
  try { sqliteSettings(environment); } catch (error) { errors.push(error.message); }
  if (environment.ACCOUNTS_PROCESS_ENABLED !== undefined && !["0", "1"].includes(environment.ACCOUNTS_PROCESS_ENABLED)) errors.push("ACCOUNTS_PROCESS_ENABLED must be 0 or 1.");
  if (environment.GAME_WORKERS_ENABLED !== undefined && !["0", "1"].includes(environment.GAME_WORKERS_ENABLED)) errors.push("GAME_WORKERS_ENABLED must be 0 or 1.");
  if (environment.GAME_WORKERS !== undefined && !/^[1-4]$/.test(environment.GAME_WORKERS)) errors.push("GAME_WORKERS must be 1..4.");
  for (const key of ["NODE_ENV", "HOST", "PORT", "JWT_SECRET", "CLIENT_ORIGIN", "SQLITE_PATH", "PUBLIC_APP_URL"]) {
    if (!String(environment[key] || "").trim()) errors.push(`${key} is missing.`);
  }
  if (environment.NODE_ENV !== "production") errors.push("NODE_ENV must be production.");
  if (String(environment.JWT_SECRET || "").length < 32 || environment.JWT_SECRET === "replace-with-a-long-random-secret") errors.push("JWT_SECRET must be a private random secret of at least 32 characters.");
  const port = Number(environment.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) errors.push("PORT must be between 1 and 65535.");
  const prefix = String(environment.APP_BASE_PATH || "");
  if (prefix && !/^\/(?:[a-zA-Z0-9_-]+\/?)+$/.test(prefix)) errors.push("APP_BASE_PATH must be empty or an absolute URL prefix.");
  const origins = String(environment.CLIENT_ORIGIN || "").split(",").map((value) => value.trim()).filter(Boolean);
  for (const origin of origins) {
    try {
      const parsed = new URL(origin);
      if (parsed.protocol !== "https:" || parsed.origin !== origin) throw new Error();
    } catch { errors.push("CLIENT_ORIGIN must contain HTTPS origins without paths or credentials."); }
  }
  try {
    const url = new URL(environment.PUBLIC_APP_URL);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error();
    if (!origins.includes(url.origin)) errors.push("PUBLIC_APP_URL must belong to an allowed CLIENT_ORIGIN.");
  } catch { errors.push("PUBLIC_APP_URL must be an absolute HTTPS URL without credentials, query or fragment."); }
  const hasPem = Boolean(environment.HTTPS_KEY_PATH && environment.HTTPS_CERT_PATH);
  const hasPfx = Boolean(environment.HTTPS_PFX_PATH);
  const proxy = environment.TLS_TERMINATION === "proxy";
  if (proxy) {
    if (!["127.0.0.1", "::1", "localhost"].includes(environment.HOST)) errors.push("With TLS_TERMINATION=proxy, Node must listen on loopback only.");
    if (!["loopback", "1"].includes(String(environment.TRUST_PROXY || ""))) errors.push("With a local TLS proxy, TRUST_PROXY must be loopback or 1.");
    if (environment.HTTPS_KEY_PATH || environment.HTTPS_CERT_PATH || hasPfx) errors.push("With TLS_TERMINATION=proxy, leave Node HTTPS paths empty.");
  } else if (!hasPem && !hasPfx) errors.push("Configure HTTPS certificates or TLS_TERMINATION=proxy behind a local HTTPS proxy.");
  if (Boolean(environment.HTTPS_KEY_PATH) !== Boolean(environment.HTTPS_CERT_PATH)) errors.push("HTTPS_KEY_PATH and HTTPS_CERT_PATH must be configured together.");
  if (hasPem && hasPfx) errors.push("Choose PEM or PFX certificates, not both.");
  if (Boolean(environment.SMTP_USER) !== Boolean(environment.SMTP_PASS)) errors.push("SMTP_USER and SMTP_PASS must be supplied together.");
  if (!environment.SMTP_HOST || !environment.EMAIL_FROM) warnings.push("Email delivery is disabled: verification, password reset and contact alerts need SMTP.");
  if (environment.CONTACT_EMAIL) {
    try { normalizeContactEmail(environment.CONTACT_EMAIL); }
    catch { errors.push("CONTACT_EMAIL must be a valid email address."); }
  }
  return { errors, warnings };
}
