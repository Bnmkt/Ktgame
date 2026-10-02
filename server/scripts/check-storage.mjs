import "dotenv/config";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const serverDir = fileURLToPath(new URL("../", import.meta.url));
const sourcePath = path.resolve(process.argv[2] || process.env.SQLITE_PATH || path.join(serverDir, "data", "ktga.sqlite"));
const folder = fs.mkdtempSync(path.join(os.tmpdir(), "ktga-migration-check-"));
const target = path.join(folder, "check.sqlite");
let source, baseline, storage, migrated;
function comparable(value, type) {
  if (type !== "users") return value;
  if (value.profileStats) delete value.profileStats.publicStats;
  if (value.achievements) value.achievements = { ...value.achievements, unlocked: [...new Set(value.achievements.unlocked ?? [])], suppressed: [...new Set(value.achievements.suppressed ?? [])], unlockedAt: value.achievements.unlockedAt ?? {} };
  return value;
}

function compactRoomPlayer(player = {}) {
  return { id: player.id, pseudo: player.pseudo ?? player.profile?.displayName ?? "Joueur", tokens: Math.max(0, Number(player.tokens) || 0), ...(player.isBot ? { isBot: true } : {}), ...(player.guest ? { guest: true } : {}), ...(player.cosmetics?.equipped ? { cosmetics: { equipped: player.cosmetics.equipped } } : {}) };
}
function comparableRoom(room) {
  return { ...room, players: (room.players ?? []).map(compactRoomPlayer), ...(room.state?.players ? { state: { ...room.state, players: room.state.players.map(compactRoomPlayer) } } : {}) };
}

try {
  source = new DatabaseSync(sourcePath, { readOnly: true });
  source.exec("PRAGMA busy_timeout = 5000");
  source.prepare("VACUUM INTO ?").run(target);
  source.close(); source = null;
  const snapshot = new DatabaseSync(target, { readOnly: true });
  const version = snapshot.prepare("SELECT value FROM meta WHERE key = 'storage-version'").get()?.value;
  snapshot.close();
  if (version) throw new Error("This audit expects a pre-v2 database (use the migration backup after upgrading).");
  process.env.SQLITE_PATH = target;
  storage = await import("../src/db.js");
  const backup = fs.readdirSync(folder).find((name) => name.includes("before-v2"));
  baseline = new DatabaseSync(backup ? path.join(folder, backup) : target, { readOnly: true });
  const tableNames = { users: "users", rooms: "rooms", history: "history", transactions: "transactions", communityEvents: "community_events", communityEventParticipants: "community_event_participants", communityEventActions: "community_event_actions", communityEventPotEntries: "community_event_pot_entries", communityEventRewards: "community_event_rewards", communityEventEffects: "community_event_effects" };
  const counts = {};
  const documentBytes = {};
  migrated = new DatabaseSync(target, { readOnly: true });
  const db = storage.readDb();
  for (const [key, table] of Object.entries(tableNames)) {
    const expected = baseline.prepare(`SELECT count(*) AS n FROM ${table}`).get().n;
    const beforeBytes = Number(baseline.prepare(`SELECT coalesce(sum(length(data)), 0) AS n FROM ${table}`).get().n);
    const original = baseline.prepare(`SELECT data FROM ${table} WHERE id = ?`);
    let count = 0;
    for (const row of db[key]) {
      const previous = original.get(row.id);
      assert.ok(previous, `Missing original ${table} record`);
      const current = key === "rooms" ? comparableRoom(structuredClone(row)) : comparable(structuredClone(row), key);
      const before = key === "rooms" ? comparableRoom(JSON.parse(previous.data)) : comparable(JSON.parse(previous.data), key);
      assert.deepEqual(current, before, `Changed ${table} record`);
      count++;
    }
    assert.equal(count, expected, `Changed ${table} count`);
    counts[key] = count;
    const afterBytes = Number(migrated.prepare(`SELECT coalesce(sum(length(data)), 0) AS n FROM ${table}`).get().n);
    documentBytes[key] = { before: beforeBytes, after: afterBytes, saved: beforeBytes - afterBytes };
  }
  migrated.close(); migrated = null;
  const check = new DatabaseSync(target, { readOnly: true });
  assert.equal(check.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  assert.equal(check.prepare("PRAGMA foreign_key_check").get(), undefined);
  check.close();
  console.log(JSON.stringify({ ok: true, sourceUnchanged: true, integrity: "ok", counts, documentBytes, archiveCacheRows: storage.databaseHealth().archiveCacheRows }));
} finally {
  source?.close(); baseline?.close(); migrated?.close(); storage?.closeDatabase();
  assert.equal(path.dirname(path.resolve(folder)), path.resolve(os.tmpdir()));
  assert.ok(path.basename(folder).startsWith("ktga-migration-check-"));
  fs.rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
