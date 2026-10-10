import "dotenv/config";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { decryptTotpSecret } from "../src/services/account-security.js";

const data = fileURLToPath(new URL("../data/", import.meta.url));
const main = path.resolve(process.env.SQLITE_PATH || path.join(data, "ktga.sqlite"));
const stores = {
  SQLITE_PATH: main, PARENTAL_DB_PATH: path.join(data, "parental.sqlite"),
  TRIBUNAL_DB_PATH: path.join(data, "tribunal.sqlite"), CHAT_DB_PATH: path.join(data, "chat.sqlite"),
  STATUS_DB_PATH: path.join(data, "status.sqlite"), REQUEST_LOG_PATH: path.join(data, "request-logs.sqlite"),
  PATCHNOTES_DB_PATH: path.join(data, "patchnotes.sqlite"), HELP_DB_PATH: `${main}.help.sqlite`,
  DATA_REQUEST_DB_PATH: `${main}.rights.sqlite`, BUG_REPORT_DB_PATH: `${main}.bugs.sqlite`,
  CONTACT_NOTICE_DB_PATH: `${main}.contact-notices.sqlite`
};
const results = [];
for (const [key, fallback] of Object.entries(stores)) {
  const filename = path.resolve(process.env[key] || fallback);
  assert.ok(fs.existsSync(filename), `Missing database: ${key}`);
  const db = new DatabaseSync(filename, { readOnly: true });
  try {
    assert.deepEqual(db.prepare("PRAGMA quick_check").all().map((row) => row.quick_check), ["ok"], `Corrupt database: ${key}`);
    assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0, `Foreign key violations: ${key}`);
    const counts = {};
    for (const { name } of db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()) {
      const identifier = '"' + name.replaceAll('"', '""') + '"';
      counts[name] = db.prepare(`SELECT count(*) AS n FROM ${identifier}`).get().n;
    }
    let verifiedMfa;
    if (key === "SQLITE_PATH") {
      verifiedMfa = 0;
      for (const row of db.prepare("SELECT data FROM users").all()) {
        const user = JSON.parse(row.data);
        if (!user.mfa?.totpSecret) continue;
        assert.ok(decryptTotpSecret(user.mfa.totpSecret, process.env.JWT_SECRET), "An existing MFA secret cannot be decrypted. Preserve the original JWT secret.");
        verifiedMfa++;
      }
    }
    results.push({ key, filename: path.basename(filename), integrity: "ok", counts, ...(verifiedMfa === undefined ? {} : { verifiedMfa }) });
  } finally { db.close(); }
}
console.log(JSON.stringify({ ok: true, stores: results }, null, 2));
