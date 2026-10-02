import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEmailVerificationMessage,
  consumeEmailVerification,
  consumePasswordReset,
  emailDeliveryConfigured,
  emailVerificationCanBeResent,
  emailVerificationUrl,
  issueEmailVerification,
  issuePasswordReset,
  normalizeEmail,
  passwordResetCanBeResent,
  passwordResetUrl,
  reservedPublicEmail,
  validEmail
} from "../src/services/email-verification.js";

test("email normalization and SMTP configuration require complete values", () => {
  assert.equal(normalizeEmail("  Player@Example.BE "), "player@example.be");
  assert.equal(validEmail("player@example.be"), true);
  assert.equal(validEmail("not-an-email"), false);
  assert.equal(reservedPublicEmail("player@netdis.org"), true);
  assert.equal(reservedPublicEmail("PLAYER@KTGA.ME"), true);
  assert.equal(reservedPublicEmail("player@mail.netdis.org"), false);
  assert.equal(reservedPublicEmail("player@example.be"), false);
  assert.equal(emailDeliveryConfigured({ SMTP_HOST: "smtp.example.be", EMAIL_FROM: "casino@example.be" }), true);
  assert.equal(emailDeliveryConfigured({ SMTP_HOST: "smtp.example.be", EMAIL_FROM: "casino@example.be", SMTP_USER: "user" }), false);
  assert.equal(emailDeliveryConfigured({ SMTP_HOST: "smtp.example.be", EMAIL_FROM: "casino@example.be", SMTP_USER: "user", SMTP_PASS: "secret" }), true);
});

test("password reset tokens expire, are single-use and are never stored in clear text", () => {
  const now = Date.parse("2026-09-29T10:00:00Z");
  const user = { id: "player", email: "player@example.be" };
  const token = issuePasswordReset(user, now);
  assert.notEqual(user.passwordReset.tokenHash, token);
  assert.equal(passwordResetCanBeResent(user, now + 59_000), false);
  assert.equal(passwordResetCanBeResent(user, now + 60_000), true);
  assert.equal(consumePasswordReset([user], token, now + 29 * 60 * 1000), user);
  assert.equal(user.passwordReset, undefined);
  assert.equal(consumePasswordReset([user], token, now + 29 * 60 * 1000), null);

  const expired = { id: "expired", email: "expired@example.be" };
  const expiredToken = issuePasswordReset(expired, now);
  assert.equal(consumePasswordReset([expired], expiredToken, now + 30 * 60 * 1000), null);
});

test("verification tokens expire, are single-use and are never stored in clear text", () => {
  const now = Date.parse("2026-09-29T10:00:00Z");
  const user = { id: "player", email: "player@example.be" };
  const token = issueEmailVerification(user, now);
  assert.notEqual(user.emailVerification.tokenHash, token);
  assert.equal(emailVerificationCanBeResent(user, now + 59_000), false);
  assert.equal(emailVerificationCanBeResent(user, now + 60_000), true);
  assert.equal(consumeEmailVerification([user], token, now + 23 * 60 * 60 * 1000), user);
  assert.equal(user.emailVerifiedAt, new Date(now + 23 * 60 * 60 * 1000).toISOString());
  assert.equal(consumeEmailVerification([user], token, now + 23 * 60 * 60 * 1000), null);

  const expired = { id: "expired", email: "expired@example.be" };
  const expiredToken = issueEmailVerification(expired, now);
  assert.equal(consumeEmailVerification([expired], expiredToken, now + 24 * 60 * 60 * 1000), null);
});

test("verification links preserve the absolute client base path", () => {
  const url = new URL(emailVerificationUrl("token-value", { PUBLIC_APP_URL: "https://netdis.org/ktga" }));
  assert.equal(url.origin, "https://netdis.org");
  assert.equal(url.pathname, "/ktga");
  assert.equal(url.searchParams.get("verify-email"), "token-value");

  const resetUrl = new URL(passwordResetUrl("reset-token", { PUBLIC_APP_URL: "https://netdis.org/ktga" }));
  assert.equal(resetUrl.origin, "https://netdis.org");
  assert.equal(resetUrl.pathname, "/ktga");
  assert.equal(resetUrl.searchParams.get("reset-password"), "reset-token");
});

test("verification email is branded, accessible without images and escapes user content", () => {
  const message = buildEmailVerificationMessage({
    user: { email: "player@example.be", pseudo: "fallback", profile: { displayName: '<Bnmkt & "friends">' } },
    token: "preview-token",
    siteName: "KTGA.ME"
  }, { PUBLIC_APP_URL: "https://netdis.org/ktga" });

  assert.equal(message.subject, "Valide ton adresse email sur KTGA.ME");
  assert.match(message.text, /expire dans 24 heures/);
  assert.match(message.html, /Valider mon adresse email/);
  assert.match(message.html, /https:\/\/netdis\.org\/ktga\?verify-email=preview-token/);
  assert.match(message.html, /&lt;Bnmkt &amp; &quot;friends&quot;&gt;/);
  assert.doesNotMatch(message.html, /<img\b/i);
  assert.doesNotMatch(message.html, /<Bnmkt/);
});
