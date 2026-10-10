import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const quote = (value) => `"${value.replaceAll('"', '""')}"`;
const oldAbsolute = /(?:https?:)?\/\/(?:www\.)?(?:netdis\.org|ktga\.me)\/ktga(?=\/|[?#]|$)[^\s<>"'`]*/gi;

function normalizeAsset(value) {
  return value.replace(/(\/event\/(?:heist-1|dealer-curse-1|30-nights-1))\/banner\.png(?=[?#)\]\s]|$)/g, "$1/cover.png");
}

export function rewriteLegacyText(value) {
  // Match full URLs first so a foreign site's /ktga path is never rewritten.
  const absolute = value.replace(oldAbsolute, (url) => {
    return normalizeAsset(url.replace(/^(?:https?:)?\/\/(?:www\.)?(?:netdis\.org|ktga\.me)\/ktga\/?/i, "https://www.ktga.me/"));
  });
  return absolute.replace(/(^|[\s"'(<`])\/ktga(?:\/|(?=[?#\s"'<>`)\]]|$))[^\s<>"'`]*/g, (url, prefix) => {
    return prefix + normalizeAsset(url.slice(prefix.length).replace(/^\/ktga\/?/, "/"));
  });
}

export function rewriteStoredText(value) {
  let parsed;
  try { parsed = JSON.parse(value); } catch { return rewriteLegacyText(value); }
  let changed = false;
  function visit(entry) {
    if (typeof entry === "string") {
      const next = rewriteLegacyText(entry);
      changed ||= next !== entry;
      return next;
    }
    if (Array.isArray(entry)) return entry.map(visit);
    if (entry && typeof entry === "object") {
      return Object.fromEntries(Object.entries(entry).map(([key, child]) => [key, visit(child)]));
    }
    return entry;
  }
  const next = visit(parsed);
  return changed ? JSON.stringify(next) : value;
}

export function inspectDatabase(db) {
  const changes = [], counts = {}, unmatchedReferences = {};
  for (const { name } of db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()) {
    const columns = db.prepare(`PRAGMA table_info(${quote(name)})`).all();
    const primary = columns.filter((column) => column.pk).sort((a, b) => a.pk - b.pk).map((column) => column.name);
    const selector = primary.length ? "*" : 'rowid AS "__migration_rowid__", *';
    counts[name] = db.prepare(`SELECT count(*) AS n FROM ${quote(name)}`).get().n;
    // Historical request routes are evidence, not navigation links.
    if (name === "request_logs") continue;
    for (const row of db.prepare(`SELECT ${selector} FROM ${quote(name)}`).iterate()) {
      const fields = [];
      for (const column of columns) {
        const before = row[column.name];
        if (typeof before !== "string") continue;
        const after = rewriteStoredText(before);
        if (after === before) {
          if (/\/(?:ktga\/)|\\\/ktga\\\//.test(before)) {
            const key = `${name}.${column.name}`;
            unmatchedReferences[key] = (unmatchedReferences[key] || 0) + 1;
          }
          continue;
        }
        assert.ok(!primary.includes(column.name), `Refusing to alter a primary key in ${name}.`);
        fields.push({ column: column.name, before, after });
      }
      if (fields.length) changes.push({ table: name, keys: primary.length ? primary : ["rowid"], values: primary.length ? primary.map((key) => row[key]) : [row.__migration_rowid__], fields });
    }
  }
  return { changes, counts, unmatchedReferences };
}

function validate(db, expectedCounts) {
  assert.deepEqual(db.prepare("PRAGMA quick_check").all().map((row) => row.quick_check), ["ok"]);
  assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
  if (expectedCounts) {
    for (const [table, count] of Object.entries(expectedCounts)) {
      assert.equal(db.prepare(`SELECT count(*) AS n FROM ${quote(table)}`).get().n, count, `Row count changed: ${table}`);
    }
  }
}

export function applyChanges(db, plan) {
  db.exec("PRAGMA foreign_keys=ON; BEGIN IMMEDIATE");
  try {
    for (const change of plan.changes) {
      const assignments = change.fields.map(({ column }) => `${quote(column)}=?`).join(",");
      const predicates = [...change.keys, ...change.fields.map(({ column }) => column)].map((column) => `${quote(column)} IS ?`).join(" AND ");
      const result = db.prepare(`UPDATE ${quote(change.table)} SET ${assignments} WHERE ${predicates}`).run(
        ...change.fields.map(({ after }) => after), ...change.values, ...change.fields.map(({ before }) => before)
      );
      assert.equal(result.changes, 1, `The source row changed in ${change.table}.`);
    }
    validate(db, plan.counts);
    assert.equal(inspectDatabase(db).changes.length, 0, "Legacy links remain.");
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}

function option(name) {
  const position = process.argv.indexOf(name);
  return position === -1 ? undefined : process.argv[position + 1];
}

function main() {
  const directory = option("--directory"), apply = process.argv.includes("--apply");
  assert.ok(directory && path.isAbsolute(directory), "An explicit absolute --directory is required.");
  const backup = option("--backup-directory");
  if (apply) {
    assert.equal(process.getuid?.(), 0, "Run the production migration as root.");
    assert.equal(spawnSync("systemctl", ["is-active", "--quiet", "ktga"]).status, 3, "Stop ktga before updating its databases.");
    assert.ok(backup && path.isAbsolute(backup), "An absolute --backup-directory is required.");
    assert.ok(!path.resolve(backup).startsWith(path.resolve(directory) + path.sep) && path.resolve(backup) !== path.resolve(directory));
    fs.mkdirSync(backup, { mode: 0o700 });
  }
  const results = [];
  for (const filename of fs.readdirSync(directory).filter((name) => name.endsWith(".sqlite")).sort()) {
    const db = new DatabaseSync(path.join(directory, filename), { readOnly: !apply });
    try {
      validate(db);
      const plan = inspectDatabase(db);
      if (apply && plan.changes.length) {
        const target = path.join(backup, filename);
        db.prepare("VACUUM INTO ?").run(target);
        fs.chmodSync(target, 0o600);
        applyChanges(db, plan);
      }
      const fields = {};
      for (const change of plan.changes) {
        for (const field of change.fields) {
          const key = `${change.table}.${field.column}`;
          fields[key] = (fields[key] || 0) + 1;
        }
      }
      results.push({ database: filename, changedRows: plan.changes.length, fields, unmatchedReferences: plan.unmatchedReferences, integrity: "ok" });
    } finally { db.close(); }
  }
  console.log(JSON.stringify({ applied: apply, results }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
