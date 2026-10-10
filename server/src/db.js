import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { Archive } from "./storage/archives.js";
import { createNormalizedStorage } from "./storage/normalized.js";
import { queryRankedMetrics } from "./services/ranked-metrics.js";
import { prepared } from "./storage/statements.js";
import { selectedCollectionRows } from "./storage/selected-rows.js";
import { sqliteSettings } from "./storage/sqlite-settings.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");
const configuredSqlitePath = process.env.SQLITE_PATH;
const sqlitePath = configuredSqlitePath
  ? path.resolve(process.cwd(), configuredSqlitePath)
  : path.join(dataDir, "ktga.sqlite");
export const databaseFilename = sqlitePath;
const legacyJsonPath = path.join(dataDir, "db.json");

const initialDb = {
  users: [],
  rooms: [],
  history: [],
  transactions: [],
  communityEvents: [],
  communityEventParticipants: [],
  communityEventActions: [],
  communityEventPotEntries: [],
  communityEventRewards: [],
  communityEventEffects: [],
  settings: {}
};

if (!fs.existsSync(path.dirname(sqlitePath))) fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const sqlite = new DatabaseSync(sqlitePath);
const entityRevisions = new Map();
let entityRevisionEpoch = 0;
export function databaseEntityRevision(collection, id) { return `${entityRevisionEpoch}:${entityRevisions.get(`${collection}:${id}`) ?? 0}`; }
let normalizedStorage;
let catalogSource;
const storageSettings = sqliteSettings();
sqlite.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;
  PRAGMA synchronous = ${storageSettings.synchronous};
  PRAGMA wal_autocheckpoint = ${storageSettings.walAutoCheckpoint};
  PRAGMA cache_size = -20000;
  PRAGMA temp_store = MEMORY;
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    pseudo TEXT NOT NULL,
    email TEXT,
    guest INTEGER NOT NULL DEFAULT 0
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_pseudo_lower ON users(lower(pseudo));

  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    game_id TEXT NOT NULL,
    is_public INTEGER NOT NULL DEFAULT 1,
    finished INTEGER NOT NULL DEFAULT 0,
    created_at TEXT,
    data TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_rooms_public_active ON rooms(is_public, finished, game_id);
  CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms(code);

  CREATE TABLE IF NOT EXISTS history (
    id TEXT PRIMARY KEY,
    user_ids TEXT NOT NULL,
    finished_at TEXT,
    data TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_history_finished_at ON history(finished_at);

  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    game_id TEXT,
    event_id TEXT,
    request_id TEXT,
    created_at TEXT,
    data TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_transactions_user_created ON transactions(user_id, created_at);

  CREATE TABLE IF NOT EXISTS community_events (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL,
    starts_at TEXT,
    ends_at TEXT,
    data TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_community_events_status_dates ON community_events(status, starts_at, ends_at);

  CREATE TABLE IF NOT EXISTS community_event_participants (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    contribution INTEGER NOT NULL DEFAULT 0,
    damage INTEGER NOT NULL DEFAULT 0,
    last_activity_at TEXT,
    data TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_event_participant_unique ON community_event_participants(event_id, user_id);
  CREATE INDEX IF NOT EXISTS idx_event_participant_ranking ON community_event_participants(event_id, contribution DESC, damage DESC);

  CREATE TABLE IF NOT EXISTS community_event_actions (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    data TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_event_actions_recent ON community_event_actions(event_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_event_actions_user ON community_event_actions(event_id, user_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS community_event_pot_entries (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    amount INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    data TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_event_pot_entries ON community_event_pot_entries(event_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS community_event_rewards (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    amount INTEGER NOT NULL DEFAULT 0,
    distributed_at TEXT,
    data TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_event_rewards_unique ON community_event_rewards(event_id, user_id);

  CREATE TABLE IF NOT EXISTS community_event_effects (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    user_id TEXT,
    expires_at TEXT,
    data TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_event_effects_active ON community_event_effects(event_id, expires_at);

  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);
sqlite.exec("PRAGMA optimize");

const transactionColumns = new Set(sqlite.prepare("PRAGMA table_info(transactions)").all().map((column) => column.name));
if (!transactionColumns.has("event_id")) sqlite.exec("ALTER TABLE transactions ADD COLUMN event_id TEXT");
if (!transactionColumns.has("request_id")) sqlite.exec("ALTER TABLE transactions ADD COLUMN request_id TEXT");
sqlite.exec("CREATE INDEX IF NOT EXISTS idx_transactions_event_created ON transactions(event_id, created_at)");
const userColumns = new Set(sqlite.prepare("PRAGMA table_info(users)").all().map((column) => column.name));
if (!userColumns.has("email")) sqlite.exec("ALTER TABLE users ADD COLUMN email TEXT");
for (const row of sqlite.prepare("SELECT id, data FROM users WHERE email IS NULL").all()) {
  const email = parseJson(row.data, {})?.email;
  if (email) sqlite.prepare("UPDATE users SET email = ? WHERE id = ?").run(String(email).trim().toLowerCase(), row.id);
}
sqlite.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users(lower(email)) WHERE email IS NOT NULL");

function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function rowData(row) {
  return parseJson(row.data, null);
}

function normalizeDb(db = {}) {
  return {
    users: Array.isArray(db.users) ? db.users : [],
    rooms: Array.isArray(db.rooms) ? db.rooms : [],
    history: db.history instanceof Archive || Array.isArray(db.history) ? db.history : [],
    transactions: db.transactions instanceof Archive || Array.isArray(db.transactions) ? db.transactions : [],
    communityEvents: Array.isArray(db.communityEvents) ? db.communityEvents : [],
    communityEventParticipants: Array.isArray(db.communityEventParticipants) ? db.communityEventParticipants : [],
    communityEventActions: db.communityEventActions instanceof Archive || Array.isArray(db.communityEventActions) ? db.communityEventActions : [],
    communityEventPotEntries: db.communityEventPotEntries instanceof Archive || Array.isArray(db.communityEventPotEntries) ? db.communityEventPotEntries : [],
    communityEventRewards: Array.isArray(db.communityEventRewards) ? db.communityEventRewards : [],
    communityEventEffects: Array.isArray(db.communityEventEffects) ? db.communityEventEffects : [],
    settings: db.settings && typeof db.settings === "object" ? db.settings : {}
  };
}

function replaceAll(table, rows, insert) {
  sqlite.prepare(`DELETE FROM ${table}`).run();
  for (const row of rows) insert(row);
}

function userIdsForHistory(row) {
  return JSON.stringify([...(row.players?.map((p) => p.id) ?? []), ...(row.winners ?? [])]);
}

function insertUser(user, previous) {
  // Child rows require a parent for new accounts, not a full duplicate update.
  if (normalizedStorage && !previous) prepared(sqlite, "INSERT OR IGNORE INTO users (id,data,pseudo,email,guest) VALUES (?,'{}',?,?,?)").run(user.id, user.pseudo, user.email ?? null, user.guest ? 1 : 0);
  const data = normalizedStorage ? normalizedStorage.splitUser(user, previous) : user;
  prepared(sqlite, "INSERT INTO users (id, data, pseudo, email, guest) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, pseudo=excluded.pseudo, email=excluded.email, guest=excluded.guest").run(
    user.id,
    JSON.stringify(data),
    user.pseudo,
    user.email ?? null,
    user.guest ? 1 : 0
  );
}

function insertRoom(room) {
  prepared(sqlite, "INSERT INTO rooms (id, code, game_id, is_public, finished, created_at, data) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET code=excluded.code,game_id=excluded.game_id,is_public=excluded.is_public,finished=excluded.finished,created_at=excluded.created_at,data=excluded.data").run(
    room.id,
    room.code,
    room.gameId,
    room.isPublic ? 1 : 0,
    room.finished ? 1 : 0,
    room.createdAt ?? null,
    JSON.stringify(normalizedStorage ? normalizedStorage.splitRoom(room) : room)
  );
}

function insertHistory(row) {
  sqlite.prepare("INSERT INTO history (id, user_ids, finished_at, data) VALUES (?, ?, ?, ?)").run(
    row.id,
    userIdsForHistory(row),
    row.finishedAt ?? null,
    JSON.stringify(normalizedStorage && Array.isArray(row.players) ? { ...row, players: [] } : row)
  );
  normalizedStorage?.indexHistory(row);
}

function insertTransaction(row) {
  sqlite.prepare("INSERT INTO transactions (id, user_id, game_id, event_id, request_id, created_at, data) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    row.id,
    row.userId,
    row.gameId ?? null,
    row.eventId ?? null,
    row.requestId ?? null,
    row.createdAt ?? null,
    JSON.stringify(row)
  );
  normalizedStorage?.indexTransaction(row);
}

function insertCommunityEventEffect(row) {
  sqlite.prepare("INSERT INTO community_event_effects (id, event_id, user_id, expires_at, data) VALUES (?, ?, ?, ?, ?)").run(row.id, row.eventId, row.userId ?? null, row.expiresAt ?? null, JSON.stringify(row));
}

function insertCommunityEvent(row) {
  sqlite.prepare("INSERT INTO community_events (id, slug, status, starts_at, ends_at, data) VALUES (?, ?, ?, ?, ?, ?)").run(row.id, row.slug, row.status, row.startsAt ?? null, row.endsAt ?? null, JSON.stringify(row));
}

function insertCommunityEventParticipant(row) {
  sqlite.prepare("INSERT INTO community_event_participants (id, event_id, user_id, contribution, damage, last_activity_at, data) VALUES (?, ?, ?, ?, ?, ?, ?)").run(row.id, row.eventId, row.userId, Number(row.contribution) || 0, Number(row.damage) || 0, row.lastActivityAt ?? null, JSON.stringify(row));
}

function insertCommunityEventAction(row) {
  sqlite.prepare("INSERT INTO community_event_actions (id, event_id, user_id, created_at, data) VALUES (?, ?, ?, ?, ?)").run(row.id, row.eventId, row.userId, row.createdAt, JSON.stringify(row));
  normalizedStorage?.indexEventAction(row);
}

function insertCommunityEventPotEntry(row) {
  sqlite.prepare("INSERT INTO community_event_pot_entries (id, event_id, amount, created_at, data) VALUES (?, ?, ?, ?, ?)").run(row.id, row.eventId, Number(row.amount) || 0, row.createdAt, JSON.stringify(row));
  normalizedStorage?.indexEventPotEntry(row);
}

function insertCommunityEventReward(row) {
  sqlite.prepare("INSERT INTO community_event_rewards (id, event_id, user_id, amount, distributed_at, data) VALUES (?, ?, ?, ?, ?, ?)").run(row.id, row.eventId, row.userId, Number(row.amount) || 0, row.distributedAt ?? null, JSON.stringify(row));
}

function isEmptySqlite() {
  const counts = ["users", "rooms", "history", "transactions"].map((table) => sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count);
  return counts.every((count) => count === 0);
}

function hasMigratedLegacyJson() {
  return sqlite.prepare("SELECT value FROM meta WHERE key = ?").get("legacy-json-migrated")?.value === "true";
}

function markLegacyJsonMigrated() {
  sqlite.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run("legacy-json-migrated", "true");
}

function migrateLegacyJsonIfNeeded() {
  if (!fs.existsSync(legacyJsonPath) || hasMigratedLegacyJson() || !isEmptySqlite()) return;
  const legacyDb = normalizeDb(parseJson(fs.readFileSync(legacyJsonPath, "utf8"), initialDb));
  replaceDatabase(legacyDb);
  markLegacyJsonMigrated();
}

function createArchive(key) {
  const config = {
    history: ["history", normalizedStorage.hydrateHistory, { memberId: true, day: "day" }],
    transactions: ["transactions", rowData, { userId: "user_id", reason: "reason", eventId: "event_id", requestId: "request_id", day: "day" }],
    communityEventActions: ["community_event_actions", rowData, { eventId: "event_id", userId: "user_id", requestId: "request_id", day: "day" }],
    communityEventPotEntries: ["community_event_pot_entries", rowData, { eventId: "event_id", day: "day" }]
  };
  return new Archive(sqlite, ...config[key]);
}

function loadDatabase() {
  return {
    users: sqlite.prepare("SELECT data FROM users ORDER BY rowid").all().map(normalizedStorage.hydrateUser),
    rooms: sqlite.prepare("SELECT data FROM rooms ORDER BY rowid").all().map(rowData).filter(Boolean),
    history: createArchive("history"),
    transactions: createArchive("transactions"),
    communityEvents: sqlite.prepare("SELECT data FROM community_events ORDER BY rowid").all().map(rowData).filter(Boolean),
    communityEventParticipants: sqlite.prepare("SELECT data FROM community_event_participants ORDER BY rowid").all().map(rowData).filter(Boolean),
    communityEventActions: createArchive("communityEventActions"),
    communityEventPotEntries: createArchive("communityEventPotEntries"),
    communityEventRewards: sqlite.prepare("SELECT data FROM community_event_rewards ORDER BY rowid").all().map(rowData).filter(Boolean),
    communityEventEffects: sqlite.prepare("SELECT data FROM community_event_effects ORDER BY rowid").all().map(rowData).filter(Boolean),
    settings: parseJson(sqlite.prepare("SELECT value FROM meta WHERE key = ?").get("admin-settings")?.value, {})
  };
}

function replaceDatabase(db) {
  const normalized = normalizeDb(db);
  sqlite.exec("BEGIN IMMEDIATE");
  try {
    replaceAll("users", normalized.users, insertUser);
    replaceAll("rooms", normalized.rooms, insertRoom);
    replaceAll("history", normalized.history, insertHistory);
    replaceAll("transactions", normalized.transactions, insertTransaction);
    replaceAll("community_events", normalized.communityEvents, insertCommunityEvent);
    replaceAll("community_event_participants", normalized.communityEventParticipants, insertCommunityEventParticipant);
    replaceAll("community_event_actions", normalized.communityEventActions, insertCommunityEventAction);
    replaceAll("community_event_pot_entries", normalized.communityEventPotEntries, insertCommunityEventPotEntry);
    replaceAll("community_event_rewards", normalized.communityEventRewards, insertCommunityEventReward);
    replaceAll("community_event_effects", normalized.communityEventEffects, insertCommunityEventEffect);
    sqlite.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run("admin-settings", JSON.stringify(normalized.settings));
    sqlite.exec("COMMIT");
  } catch (error) {
    sqlite.exec("ROLLBACK");
    throw error;
  }
}

const collectionDefinitions = [
  { key: "users", table: "users", insert: insertUser },
  { key: "rooms", table: "rooms", insert: insertRoom },
  { key: "history", table: "history", insert: insertHistory, appendOnly: true },
  { key: "transactions", table: "transactions", insert: insertTransaction, appendOnly: true },
  { key: "communityEvents", table: "community_events", insert: insertCommunityEvent },
  { key: "communityEventParticipants", table: "community_event_participants", insert: insertCommunityEventParticipant },
  { key: "communityEventActions", table: "community_event_actions", insert: insertCommunityEventAction, appendOnly: true },
  { key: "communityEventPotEntries", table: "community_event_pot_entries", insert: insertCommunityEventPotEntry, appendOnly: true },
  { key: "communityEventRewards", table: "community_event_rewards", insert: insertCommunityEventReward },
  { key: "communityEventEffects", table: "community_event_effects", insert: insertCommunityEventEffect }
];

function snapshotCollections(db, selection = {}) {
  const snapshots = new Map();
  for (const definition of collectionDefinitions) {
    if (definition.appendOnly) continue;
    const selected = Object.hasOwn(selection, definition.key) ? new Set(selection[definition.key]) : null;
    const rows = new Map();
    for (const row of selected ? selectedCollectionRows(db[definition.key] ?? [], selected) : db[definition.key] ?? []) {
      rows.set(row.id, { json: JSON.stringify(row), ref: row });
    }
    snapshots.set(definition.key, rows);
  }
  return snapshots;
}

migrateLegacyJsonIfNeeded();
const schemaVersion = sqlite.prepare("SELECT value FROM meta WHERE key = 'storage-version'").get()?.value;
if (schemaVersion && schemaVersion !== "2") throw new Error(`Unsupported storage version: ${schemaVersion}`);
if (schemaVersion !== "2") {
  // VACUUM INTO produces a consistent snapshot including committed WAL pages.
  // Never overwrite an earlier backup, and never continue if backup fails.
  const hasData = !isEmptySqlite() || sqlite.prepare("SELECT count(*) AS n FROM community_events").get().n > 0;
  if (hasData) {
    const backupPath = `${sqlitePath}.before-v2-${Date.now()}.bak`;
    sqlite.prepare("VACUUM INTO ?").run(backupPath);
    console.info(`Database backup: ${backupPath}`);
  }
  sqlite.exec("BEGIN IMMEDIATE");
  try {
    normalizedStorage = createNormalizedStorage(sqlite);
    normalizedStorage.migrate();
    sqlite.prepare("INSERT INTO meta VALUES ('storage-version', '2')").run();
    if (sqlite.prepare("PRAGMA foreign_key_check").get()) throw new Error("Database migration failed: invalid references");
    sqlite.exec("COMMIT");
  } catch (error) { sqlite.exec("ROLLBACK"); sqlite.close(); throw error; }
} else normalizedStorage = createNormalizedStorage(sqlite);
normalizedStorage.ensureShape();
normalizedStorage.ensureTimeZone();
let cachedDb = loadDatabase();
// Après un redémarrage propre, les anciennes pages WAL ne doivent pas rester
// inutilement attachées au fichier actif.
sqlite.exec("PRAGMA wal_checkpoint(TRUNCATE)");
let persistedCollections = snapshotCollections(cachedDb);
let persistedSettings = JSON.stringify(cachedDb.settings ?? {});
let settingsRevision = 0;
let mutationDepth = 0;
let settingsMutationDepth = 0;
let roomMutationGuard;

export function setRoomMutationGuard(guard) { roomMutationGuard = guard; }

export function databaseSettingsRevision() { return settingsRevision; }
export function databaseSettingsReadRevision() { return settingsMutationDepth ? undefined : settingsRevision; }

// Le coordinateur conserve le modèle actif en mémoire; les autres processus
// ne lisent que les données validées et ne possèdent pas les écritures.
// Toutes les mutations passent ensuite par writeDb/updateDb pour être persistées.
export function readDb() {
  return cachedDb;
}
export function rankedRows(gameId, minimumGames, limit = 100, placementGames = 0) {
  return sqlite.prepare("SELECT e.user_id AS id,e.elo,e.games,e.wins FROM user_game_elo e JOIN users u ON u.id=e.user_id LEFT JOIN user_ranked_placements p ON p.user_id=e.user_id AND p.game_id=e.game_id WHERE e.game_id=? AND e.games>=? AND (?=0 OR json_extract(p.data,'$.completed')=1 OR p.data IS NULL AND e.games>=?) AND u.guest=0 AND json_extract(u.data,'$.active') IS NOT 0 ORDER BY e.elo DESC,e.games DESC,e.user_id LIMIT ?").all(gameId,minimumGames,placementGames,placementGames,limit);
}
export function rankedRecent(userId, limit = 30) {
  return sqlite.prepare("SELECT history_id AS historyId,match_id AS matchId,game_id AS gameId,finished_at AS finishedAt,data FROM ranked_results WHERE user_id=? ORDER BY finished_at DESC LIMIT ?").all(userId,limit).map(({data,...row})=>({...row,...JSON.parse(data)}));
}
export function rankedMetrics(config, filters) {
  return queryRankedMetrics(sqlite, config, filters);
}
export function rankedSettlement(matchId) {
  if (!sqlite.prepare("SELECT 1 FROM ranked_settlements WHERE match_id=?").get(matchId)) return null;
  return { results: sqlite.prepare("SELECT data FROM ranked_results WHERE match_id=? ORDER BY user_id").all(matchId).map((row)=>JSON.parse(row.data)) };
}

export function writeDb(db, selection = {}) {
  mutationDepth++;
  const mayChangeSettings = selection.settings !== false;
  if (mayChangeSettings) settingsMutationDepth++;
  try { return persistDatabase(db, selection); }
  finally { mutationDepth--; if (mayChangeSettings) settingsMutationDepth--; }
}

function persistDatabase(db, selection) {
  const normalized = normalizeDb(db);
  const nextCollections = snapshotCollections(normalized, selection);
  // A trusted entity-only transaction neither edits nor serializes configuration.
  const nextSettings = selection.settings === false ? persistedSettings : JSON.stringify(normalized.settings ?? {});
  const operations = [];

  for (const definition of collectionDefinitions) {
    if (definition.appendOnly) {
      const collection = normalized[definition.key];
      if (!(collection instanceof Archive)) operations.push({ type: "replaceArchive", definition, rows: collection });
      else for (const row of collection.pending) operations.push({ type: "append", definition, row });
      continue;
    }
    const previousRows = persistedCollections.get(definition.key) ?? new Map();
    const nextRows = nextCollections.get(definition.key) ?? new Map();
    const selected = Object.hasOwn(selection, definition.key) ? new Set(selection[definition.key]) : null;
    for (const id of selected ?? previousRows.keys()) {
      if (!nextRows.has(id)) operations.push({ type: "delete", definition, id });
    }
    for (const { ref: row } of nextRows.values()) {
      const previous = previousRows.get(row.id);
      const next = nextRows.get(row.id);
      if (!previous || previous.json !== next.json) operations.push({ type: "upsert", definition, row });
    }
  }

  if (operations.length || nextSettings !== persistedSettings) {
    sqlite.exec("BEGIN IMMEDIATE");
    try {
      for (const operation of operations) if (operation.definition.key === "rooms") roomMutationGuard?.(operation.id ?? operation.row.id);
      for (const operation of operations) {
        if (operation.type === "replaceArchive") replaceAll(operation.definition.table, operation.rows, operation.definition.insert);
        else if (operation.type === "append") operation.definition.insert(operation.row);
        else if (operation.type === "delete") prepared(sqlite, `DELETE FROM ${operation.definition.table} WHERE id = ?`).run(operation.id);
        else {
          if (!["users", "rooms"].includes(operation.definition.key)) prepared(sqlite, `DELETE FROM ${operation.definition.table} WHERE id = ?`).run(operation.row.id);
          const prior = persistedCollections.get(operation.definition.key)?.get(operation.row.id);
          operation.definition.insert(operation.row, operation.definition.key === "users" && prior ? JSON.parse(prior.json) : undefined);
          if (operation.definition.key === "users") nextCollections.get("users").set(operation.row.id, { json: JSON.stringify(operation.row), ref: operation.row });
        }
      }
      if (nextSettings !== persistedSettings) {
        sqlite.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run("admin-settings", nextSettings);
        if (catalogSource) {
          const { achievements, items } = catalogSource(normalized);
          normalizedStorage.syncCatalog(achievements, items, false);
        }
      }
      sqlite.exec("COMMIT");
      for (const operation of operations) {
        if (!["users", "rooms"].includes(operation.definition.key)) continue;
        if (entityRevisions.size >= 8192) { entityRevisions.clear(); entityRevisionEpoch++; }
        const key = `${operation.definition.key}:${operation.id ?? operation.row.id}`;
        entityRevisions.set(key, (entityRevisions.get(key) ?? 0) + 1);
      }
    } catch (error) {
      sqlite.exec("ROLLBACK");
      restoreCommittedState();
      throw error;
    }
  }

  for (const definition of collectionDefinitions.filter((entry) => entry.appendOnly)) {
    if (normalized[definition.key] instanceof Archive) normalized[definition.key].committed();
    else normalized[definition.key] = createArchive(definition.key);
  }

  cachedDb = normalized;
  // Publish sparse snapshots only after COMMIT; rollback retains the prior map.
  for (const definition of collectionDefinitions) {
    if (definition.appendOnly || !Object.hasOwn(selection, definition.key)) continue;
    const merged = persistedCollections.get(definition.key) ?? new Map();
    const patch = nextCollections.get(definition.key);
    for (const id of selection[definition.key]) {
      if (patch.has(id)) merged.set(id, patch.get(id)); else merged.delete(id);
    }
    nextCollections.set(definition.key, merged);
  }
  persistedCollections = nextCollections;
  if (persistedSettings !== nextSettings) settingsRevision++;
  persistedSettings = nextSettings;
}

export function updateDb(mutator, selection) {
  const db = readDb();
  mutationDepth++;
  const mayChangeSettings = selection?.settings !== false;
  if (mayChangeSettings) settingsMutationDepth++;
  try {
    const result = mutator(db);
    writeDb(db, typeof selection === "function" ? selection(db, result) : selection);
    return result;
  } catch (error) { restoreCommittedState(); throw error; }
  finally { mutationDepth--; if (mayChangeSettings) settingsMutationDepth--; }
}

function restoreCommittedState() {
  entityRevisionEpoch++;
  cachedDb = loadDatabase();
  persistedCollections = snapshotCollections(cachedDb);
  persistedSettings = JSON.stringify(cachedDb.settings ?? {});
  settingsRevision++;
}

export function syncCatalogs(achievements, items) { normalizedStorage.syncCatalog(achievements, items); }

export function setCatalogSource(source) {
  catalogSource = source;
  const { achievements, items } = source(readDb());
  syncCatalogs(achievements, items);
}

// Used by maintenance commands and isolated migration tests, never per request.
export function closeDatabase() { sqlite.close(); }

export function databaseHealth() {
  const size = (filePath) => {
    try { return fs.statSync(filePath).size; } catch { return 0; }
  };
  const pageSize = Number(sqlite.prepare("PRAGMA page_size").get().page_size) || 0;
  const pageCount = Number(sqlite.prepare("PRAGMA page_count").get().page_count) || 0;
  const freePages = Number(sqlite.prepare("PRAGMA freelist_count").get().freelist_count) || 0;
  const tables = [
    "users", "rooms", "history", "transactions", "community_events",
    "community_event_participants", "community_event_actions",
    "community_event_pot_entries", "community_event_rewards", "community_event_effects",
    "achievement_catalog", "item_catalog", "user_achievements", "achievement_progress", "user_inventory", "user_game_xp", "achievement_reward_receipts", "history_members"
  ];
  return {
    engine: "SQLite",
    synchronous: storageSettings.synchronous,
    walAutoCheckpoint: storageSettings.walAutoCheckpoint,
    storageVersion: 2,
    archiveCacheRows: Object.fromEntries(collectionDefinitions.filter((entry) => entry.appendOnly).map((entry) => [entry.key, cachedDb[entry.key].pending.length])),
    journalMode: String(sqlite.prepare("PRAGMA journal_mode").get().journal_mode ?? "unknown"),
    fileBytes: size(sqlitePath),
    walBytes: size(`${sqlitePath}-wal`),
    shmBytes: size(`${sqlitePath}-shm`),
    pageSize,
    pageCount,
    freePages,
    usedBytes: Math.max(0, (pageCount - freePages) * pageSize),
    fragmentationRatio: pageCount ? freePages / pageCount : 0,
    rows: Object.fromEntries(tables.map((table) => [table, Number(sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count) || 0]))
  };
}
