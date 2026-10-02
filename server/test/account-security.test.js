import assert from "node:assert/strict";
import test from "node:test";
import {
  authLockStatus,
  beginTotpSetup,
  confirmTotpSetup,
  decryptTotpSecret,
  encryptTotpSecret,
  lockDurationMinutes,
  passwordPolicyError,
  recordAuthFailure,
  resetAuthFailures,
  totpCode,
  verifyTotp,
  verifyUserMfa
} from "../src/services/account-security.js";

test("les paliers de verrouillage suivent 3/1, 5/15, 10/60 et 15/1440", () => {
  assert.equal(lockDurationMinutes(2), 0);
  assert.equal(lockDurationMinutes(3), 1);
  assert.equal(lockDurationMinutes(5), 15);
  assert.equal(lockDurationMinutes(10), 60);
  assert.equal(lockDurationMinutes(15), 1440);
  const user = {};
  const now = Date.parse("2026-10-02T10:00:00.000Z");
  recordAuthFailure(user, "", now);
  recordAuthFailure(user, "", now + 1);
  const lock = recordAuthFailure(user, "", now + 2);
  assert.equal(lock.retryAfterSeconds, 60);
  assert.equal(authLockStatus(user, "", now + 30_000).locked, true);
  resetAuthFailures(user);
  assert.equal(authLockStatus(user, "", now + 30_000).failures, 0);
});

test("les secrets TOTP sont chiffrés et les codes tolèrent une fenêtre", () => {
  const secret = "JBSWY3DPEHPK3PXP";
  const key = "test-encryption-key";
  const encrypted = encryptTotpSecret(secret, key);
  assert.notEqual(encrypted, secret);
  assert.equal(decryptTotpSecret(encrypted, key), secret);
  const now = Date.parse("2026-10-02T10:00:00.000Z");
  const code = totpCode(secret, now);
  assert.match(code, /^\d{6}$/);
  assert.equal(verifyTotp(secret, code, now + 30_000), true);
  assert.equal(verifyTotp(secret, code, now + 60_000), false);
});

test("la configuration TOTP crée des codes de secours à usage unique", () => {
  const user = { id: "player-security" };
  const setup = beginTotpSetup(user, "KTGA.ME", "player@example.test", 1_000_000);
  const secret = new URL(setup.uri).searchParams.get("secret");
  const codes = confirmTotpSetup(user, totpCode(secret, 1_000_000), "pepper", 1_000_000);
  assert.equal(codes.length, 10);
  assert.equal(verifyUserMfa(user, "totp", totpCode(secret, 1_000_000), "pepper", 1_000_000), true);
  assert.equal(verifyUserMfa(user, "recovery", codes[0], "pepper", 1_000_000), true);
  assert.equal(verifyUserMfa(user, "recovery", codes[0], "pepper", 1_000_000), false);
});

test("la politique de mot de passe impose chaque condition affichée à l'inscription", () => {
  assert.match(passwordPolicyError("Court1!"), /10 caractères/);
  assert.match(passwordPolicyError("seulementdesminuscules"), /lettre et un chiffre/);
  assert.match(passwordPolicyError("seulement1minuscules"), /majuscule/);
  assert.match(passwordPolicyError("Seulement1minuscules"), /caractère spécial/);
  assert.equal(passwordPolicyError("Casino-2026-Sur"), "");
  assert.equal(passwordPolicyError("Éléphant-2026"), "");
});
