import "dotenv/config";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { normalizeEmail, validEmail } from "../src/services/email-verification.js";

const email = normalizeEmail(process.argv[process.argv.indexOf("--email") + 1]);
assert.ok(process.argv.includes("--email") && validEmail(email), "Usage: node scripts/grant-admin.mjs --email existing@example.com [--apply]. Stop the server first.");
const filename = path.resolve(process.env.SQLITE_PATH || "data/ktga.sqlite");
assert.ok(fs.existsSync(filename), "Existing database not found. Check SQLITE_PATH before proceeding.");
const db = new DatabaseSync(filename);
try {
  const rows = db.prepare("SELECT id,data FROM users WHERE guest=0").all().filter((row) => normalizeEmail(JSON.parse(row.data).email) === email);
  assert.equal(rows.length, 1, "Exactly one existing registered account must match this email.");
  const user = JSON.parse(rows[0].data);
  assert.ok(user.active !== false, "Reactivate this account explicitly before granting administrator access.");
  if (user.admin) console.log("This account is already administrator.");
  else if (!process.argv.includes("--apply")) console.log("One account found. Dry run: no rights changed. Stop the server and add --apply to grant administrator access.");
  else {
    const backup = `${filename}.before-admin-${Date.now()}.bak`;
    db.prepare("VACUUM INTO ?").run(backup);
    const result = db.prepare("UPDATE users SET data=json_set(data,'$.admin',json('true')) WHERE id=? AND data=?").run(rows[0].id, rows[0].data);
    assert.equal(result.changes, 1, "Account changed during preparation. No promotion applied.");
    console.log(`Administrator granted. MFA remains mandatory. Backup: ${backup}`);
  }
} finally { db.close(); }
