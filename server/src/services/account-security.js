import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const CHALLENGE_LIFETIME_MS = 10 * 60 * 1000;
const SETUP_LIFETIME_MS = 10 * 60 * 1000;
const FAILURE_RESET_MS = 24 * 60 * 60 * 1000;
const challenges = new Map();
const setups = new Map();
const anonymousFailures = new Map();

const digest = (value, pepper = "") => createHash("sha256").update(`${pepper}:${String(value)}`).digest("hex");
const normalizeCode = (value) => String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const safeEqual = (left, right) => {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
};

function base32Encode(buffer) {
  let bits = "";
  for (const byte of buffer) bits += byte.toString(2).padStart(8, "0");
  let output = "";
  for (let index = 0; index < bits.length; index += 5) output += BASE32_ALPHABET[Number.parseInt(bits.slice(index, index + 5).padEnd(5, "0"), 2)];
  return output;
}

function base32Decode(value) {
  const source = normalizeCode(value);
  let bits = "";
  for (const character of source) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) throw new Error("INVALID_TOTP_SECRET");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}

function encryptionKey(secret) {
  return createHash("sha256").update(`ktga:mfa:${secret}`).digest();
}

export function encryptTotpSecret(value, secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptTotpSecret(value, secret) {
  try {
    const [iv, tag, encrypted] = String(value ?? "").split(".").map((entry) => Buffer.from(entry, "base64url"));
    if (!iv?.length || !tag?.length || !encrypted?.length) return "";
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(secret), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch { return ""; }
}

export function totpCode(secret, timestamp = Date.now()) {
  const counter = Math.floor(timestamp / 30000);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const hash = createHmac("sha1", base32Decode(secret)).update(buffer).digest();
  const offset = hash.at(-1) & 15;
  const number = (hash.readUInt32BE(offset) & 0x7fffffff) % 1000000;
  return String(number).padStart(6, "0");
}

export function verifyTotp(secret, code, timestamp = Date.now()) {
  const candidate = String(code ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(candidate)) return false;
  return [-1, 0, 1].some((offset) => safeEqual(totpCode(secret, timestamp + offset * 30000), candidate));
}

export function passwordPolicyError(value) {
  const password = String(value ?? "");
  if (password.length < 10) return "Le mot de passe doit contenir au moins 10 caractères.";
  if (password.length > 128) return "Le mot de passe ne peut pas dépasser 128 caractères.";
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(password)).length;
  if (classes < 3) return "Utilise au moins trois types de caractères : minuscules, majuscules, chiffres ou symboles.";
  if (/^(.)\1+$/.test(password) || /^(password|motdepasse|azerty|qwerty|1234567890)/i.test(password)) return "Ce mot de passe est trop facile à deviner.";
  return "";
}

export function lockDurationMinutes(failures) {
  if (failures >= 15) return 1440;
  if (failures >= 10) return 60;
  if (failures >= 5) return 15;
  if (failures >= 3) return 1;
  return 0;
}

function normalizedFailureState(state = {}, now = Date.now()) {
  const lastFailedAt = Date.parse(state.lastFailedAt ?? "");
  if (!Number.isFinite(lastFailedAt) || now - lastFailedAt > FAILURE_RESET_MS) return { failures: 0, lockedUntil: "", lastFailedAt: "" };
  return { failures: Math.max(0, Number(state.failures) || 0), lockedUntil: state.lockedUntil ?? "", lastFailedAt: state.lastFailedAt ?? "" };
}

export function authLockStatus(user, anonymousKey = "", now = Date.now()) {
  const state = normalizedFailureState(user?.authSecurity ?? anonymousFailures.get(anonymousKey), now);
  const lockedUntil = Date.parse(state.lockedUntil ?? "");
  return { ...state, locked: Number.isFinite(lockedUntil) && lockedUntil > now, retryAfterSeconds: Number.isFinite(lockedUntil) ? Math.max(0, Math.ceil((lockedUntil - now) / 1000)) : 0 };
}

export function recordAuthFailure(user, anonymousKey = "", now = Date.now()) {
  const state = authLockStatus(user, anonymousKey, now);
  const failures = state.failures + 1;
  const minutes = lockDurationMinutes(failures);
  const next = { failures, lastFailedAt: new Date(now).toISOString(), lockedUntil: minutes ? new Date(now + minutes * 60000).toISOString() : "" };
  if (user) user.authSecurity = next;
  else anonymousFailures.set(anonymousKey, next);
  return { ...next, locked: Boolean(minutes), retryAfterSeconds: minutes * 60 };
}

export function resetAuthFailures(user, anonymousKey = "") {
  if (user) delete user.authSecurity;
  if (anonymousKey) anonymousFailures.delete(anonymousKey);
}

export function mfaSummary(user) {
  const totpEnabled = Boolean(user?.mfa?.totpSecret);
  const emailEnabled = Boolean(user?.mfa?.emailEnabled);
  return {
    required: Boolean(user?.admin), enabled: Boolean(user?.admin || totpEnabled || emailEnabled),
    totpEnabled, emailEnabled, recoveryCodesRemaining: Array.isArray(user?.mfa?.recoveryCodeHashes) ? user.mfa.recoveryCodeHashes.length : 0
  };
}

export function beginTotpSetup(user, issuer, accountName, now = Date.now()) {
  const secret = base32Encode(randomBytes(20));
  setups.set(user.id, { secret, expiresAt: now + SETUP_LIFETIME_MS });
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  const uri = `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
  return { secret: secret.match(/.{1,4}/g).join(" "), uri, expiresAt: new Date(now + SETUP_LIFETIME_MS).toISOString() };
}

function createRecoveryCodes(user, encryptionSecret) {
  const codes = Array.from({ length: 10 }, () => `${randomBytes(3).toString("hex").toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`);
  user.mfa ??= {};
  user.mfa.recoveryCodeHashes = codes.map((entry) => digest(normalizeCode(entry), encryptionSecret));
  return codes;
}

export function confirmTotpSetup(user, code, encryptionSecret, now = Date.now()) {
  const setup = setups.get(user.id);
  if (!setup || setup.expiresAt <= now || !verifyTotp(setup.secret, code, now)) return null;
  setups.delete(user.id);
  user.mfa = {
    ...(user.mfa ?? {}), totpSecret: encryptTotpSecret(setup.secret, encryptionSecret), enabledAt: new Date(now).toISOString()
  };
  return createRecoveryCodes(user, encryptionSecret);
}

export function regenerateRecoveryCodes(user, encryptionSecret) {
  if (!user?.mfa?.totpSecret) return null;
  return createRecoveryCodes(user, encryptionSecret);
}

export function verifyUserMfa(user, method, code, encryptionSecret, now = Date.now(), consumeRecovery = true) {
  if (method === "totp") return verifyTotp(decryptTotpSecret(user?.mfa?.totpSecret, encryptionSecret), code, now);
  if (method === "recovery") {
    const hash = digest(normalizeCode(code), encryptionSecret);
    const index = user?.mfa?.recoveryCodeHashes?.findIndex((entry) => safeEqual(entry, hash)) ?? -1;
    if (index < 0) return false;
    if (consumeRecovery) user.mfa.recoveryCodeHashes.splice(index, 1);
    return true;
  }
  return false;
}

export function createMfaChallenge(user, fingerprint, emailAvailable, now = Date.now()) {
  const summary = mfaSummary(user);
  const methods = [summary.totpEnabled ? "totp" : "", emailAvailable ? "email" : "", summary.recoveryCodesRemaining ? "recovery" : ""].filter(Boolean);
  if (!methods.length) throw new Error("MFA_METHOD_UNAVAILABLE");
  const id = randomBytes(24).toString("base64url");
  challenges.set(id, { userId: user.id, fingerprint: digest(fingerprint), methods, emailCodeHash: "", emailSentAt: 0, attempts: 0, expiresAt: now + CHALLENGE_LIFETIME_MS });
  return { id, methods, expiresAt: new Date(now + CHALLENGE_LIFETIME_MS).toISOString() };
}

export function issueMfaEmailCode(challengeId, fingerprint, pepper, now = Date.now()) {
  const challenge = challenges.get(challengeId);
  if (!challenge || challenge.expiresAt <= now || !challenge.methods.includes("email") || !safeEqual(challenge.fingerprint, digest(fingerprint))) return null;
  if (challenge.emailSentAt && now - challenge.emailSentAt < 60000) return { cooldown: true, userId: challenge.userId };
  const code = String(randomInt(0, 1000000)).padStart(6, "0");
  challenge.emailCodeHash = digest(code, pepper);
  challenge.emailSentAt = now;
  return { code, userId: challenge.userId };
}

export function consumeMfaChallenge(challengeId, fingerprint, method, code, user, encryptionSecret, now = Date.now()) {
  const challenge = challenges.get(challengeId);
  if (!challenge || challenge.userId !== user?.id || challenge.expiresAt <= now || !challenge.methods.includes(method) || !safeEqual(challenge.fingerprint, digest(fingerprint))) return false;
  challenge.attempts += 1;
  if (challenge.attempts > 10) { challenges.delete(challengeId); return false; }
  const valid = method === "email"
    ? Boolean(challenge.emailCodeHash && safeEqual(challenge.emailCodeHash, digest(String(code ?? "").replace(/\s/g, ""), encryptionSecret)))
    : verifyUserMfa(user, method, code, encryptionSecret, now, true);
  if (valid) challenges.delete(challengeId);
  return valid;
}

export function disableTotp(user) {
  if (!user?.mfa) return;
  delete user.mfa.totpSecret;
  delete user.mfa.recoveryCodeHashes;
  if (!user.mfa.emailEnabled) delete user.mfa;
}

export function cleanupSecurityState(now = Date.now()) {
  for (const [id, challenge] of challenges) if (challenge.expiresAt <= now) challenges.delete(id);
  for (const [id, setup] of setups) if (setup.expiresAt <= now) setups.delete(id);
  for (const [key, state] of anonymousFailures) if (now - Date.parse(state.lastFailedAt ?? "") > FAILURE_RESET_MS) anonymousFailures.delete(key);
}
