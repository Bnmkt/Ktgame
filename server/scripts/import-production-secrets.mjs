import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parse } from "dotenv";
import { checkProductionConfig } from "../src/services/production-config.js";

assert.equal(process.getuid?.(), 0, "Run as root on the VPS.");
const sourcePath = process.argv[2], targetPath = process.argv[3] || "/etc/ktga/server.env";
assert.ok(sourcePath, "Usage: sudo node scripts/import-production-secrets.mjs PRIVATE_SOURCE_ENV [TARGET_ENV]");
for (const filename of [sourcePath, targetPath]) {
  const metadata = fs.lstatSync(filename);
  assert.ok(metadata.isFile() && !metadata.isSymbolicLink() && !(metadata.mode & 0o077), "Configuration files must be private regular files (0600).");
}
const source = parse(fs.readFileSync(sourcePath)), target = parse(fs.readFileSync(targetPath));
for (const key of ["JWT_SECRET", "JWT_EXPIRES_IN", "SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM", "CONTACT_EMAIL"]) {
  if (source[key] !== undefined) target[key] = source[key];
}
assert.ok(source.JWT_SECRET?.length >= 32, "The migration requires the existing strong JWT secret to preserve MFA and parental signatures.");
const validation = checkProductionConfig(target);
assert.equal(validation.errors.length, 0, validation.errors.join("\n"));
const contents = Object.entries(target).map(([key, value]) => {
  assert.match(key, /^[A-Z][A-Z0-9_]*$/);
  assert.ok(!/[\x00-\x1f\x7f]/.test(value), "Control characters are not allowed in environment values.");
  return `${key}="${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}).join("\n") + "\n";
const temporary = `${targetPath}.migration-${process.pid}`;
try {
  fs.writeFileSync(temporary, contents, { mode: 0o600, flag: "wx" });
  assert.equal(path.dirname(path.resolve(temporary)), path.dirname(path.resolve(targetPath)));
  fs.renameSync(temporary, targetPath);
} finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
console.log("Private authentication and email configuration imported; deployment domains and storage paths preserved. No secrets printed.");
