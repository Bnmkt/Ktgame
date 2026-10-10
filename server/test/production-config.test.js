import assert from "node:assert/strict";
import test from "node:test";
import { checkProductionConfig } from "../src/services/production-config.js";
import { siteContactEmail } from "../src/services/site-contact.js";

const valid = { NODE_ENV: "production", HOST: "127.0.0.1", PORT: "4000", APP_BASE_PATH: "", TLS_TERMINATION: "proxy", TRUST_PROXY: "loopback", JWT_SECRET: "x".repeat(48), CLIENT_ORIGIN: "https://www.ktga.me", PUBLIC_APP_URL: "https://www.ktga.me", SQLITE_PATH: "/var/lib/ktga/ktga.sqlite", SMTP_HOST: "mail.example.com", EMAIL_FROM: "contact@example.com", SMTP_USER: "mailbox", SMTP_PASS: "fixture" };
test("root deployment accepts TLS terminated by a local Nginx proxy", () => {
  assert.deepEqual(checkProductionConfig(valid), { errors: [], warnings: [] });
});

test("accounts process is enabled by default, with an explicit validated rollback flag", () => {
  for (const flag of [undefined, "0", "1"]) assert.equal(checkProductionConfig({ ...valid, ACCOUNTS_PROCESS_ENABLED: flag }).errors.length, 0);
  for (const flag of ["true", "", "2"]) assert.ok(checkProductionConfig({ ...valid, ACCOUNTS_PROCESS_ENABLED: flag }).errors.some((value) => value.includes("ACCOUNTS_PROCESS_ENABLED")));
});
test("direct TLS and legacy prefixes remain supported without hardcoded domains", () => {
  assert.equal(checkProductionConfig({ ...valid, HOST: "0.0.0.0", TLS_TERMINATION: "", HTTPS_KEY_PATH: "/key", HTTPS_CERT_PATH: "/cert", APP_BASE_PATH: "/ktga", CLIENT_ORIGIN: "https://legacy.example.com", PUBLIC_APP_URL: "https://legacy.example.com/ktga" }).errors.length, 0);
});
test("unsafe proxy exposure and invalid public URLs are rejected", () => {
  for (const change of [{ HOST: "0.0.0.0" }, { TRUST_PROXY: "true" }, { HTTPS_PFX_PATH: "/private" }, { JWT_SECRET: "short" }, { PUBLIC_APP_URL: "https://other.example.com" }, { PUBLIC_APP_URL: "https://user:secret@www.ktga.me" }, { PUBLIC_APP_URL: "http://www.ktga.me" }, { PUBLIC_APP_URL: "https://www.ktga.me/?token=x" }, { CLIENT_ORIGIN: "https://www.ktga.me/path" }, { APP_BASE_PATH: "../data" }, { PORT: "NaN" }, { SMTP_PASS: "" }]) {
    assert.ok(checkProductionConfig({ ...valid, ...change }).errors.length, JSON.stringify(change));
  }
});
test("contact configuration is normalized, database-first and never replaces SMTP credentials", () => {
  const environment = { CONTACT_EMAIL: "environment@example.com" };
  assert.equal(siteContactEmail({ contactEmail: " NEW@Example.Com " }, environment), "new@example.com");
  assert.equal(siteContactEmail({}, environment), "environment@example.com");
  assert.equal(siteContactEmail({}, {}), "contact@netdis.org");
  for (const contactEmail of ["x", "x@example.com\r\nBcc: victim@example.com", "mailto:x@example.com ", "x".repeat(255) + "@example.com"]) {
    assert.throws(() => siteContactEmail({ contactEmail }, {}));
    assert.ok(checkProductionConfig({ ...valid, CONTACT_EMAIL: contactEmail }).errors.some((error) => error.includes("CONTACT_EMAIL")));
  }
});
