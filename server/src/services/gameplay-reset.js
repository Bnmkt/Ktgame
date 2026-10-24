import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { defaultCosmetics } from "./account-domain.js";
import { defaultCommunityEvent } from "./community-events.js";
import { casinoDateKey } from "./time.js";

export const RESET_CONFIRMATION = "REINITIALISER LE CASINO";
export const resetPendingPath = filename => `${filename}.reset-pending.json`;
const clearTables = ["ranked_results", "ranked_settlements", "history_members", "history", "transactions", "rooms", "community_event_actions", "community_event_pot_entries", "community_event_rewards", "community_event_effects", "community_event_participants", "user_ranked_placements", "user_game_elo", "user_game_xp", "achievement_reward_receipts", "achievement_progress", "user_achievements", "user_inventory", "leaderboard_entries", "leaderboard_boards", "leaderboard_seasons"];
const count = (db, table) => Number(db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n);

export function resetSummary(filename) {
  const db = new DatabaseSync(filename, { readOnly: true });
  try {
    const settings = JSON.parse(db.prepare("SELECT value FROM meta WHERE key='admin-settings'").get()?.value ?? "{}");
    const signupTokens = Math.max(0, Math.min(10000000, Math.floor(Number(settings.platform?.signupTokens ?? 10000))));
    return { accounts: Number(db.prepare("SELECT count(*) AS n FROM users WHERE guest=0").get().n), rooms: count(db, "rooms"), history: count(db, "history"), transactions: count(db, "transactions"), participants: count(db, "community_event_participants"), events: count(db, "community_events"), signupTokens,
      lastReset: JSON.parse(db.prepare("SELECT value FROM meta WHERE key='last-gameplay-reset'").get()?.value ?? "null") };
  } finally { db.close(); }
}

function writeExclusiveJson(filename, value) {
  const temporary = `${filename}.${randomUUID()}.tmp`;
  const fd = fs.openSync(temporary, "wx", 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(value)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  try { fs.linkSync(temporary, filename); } finally { fs.unlinkSync(temporary); }
}

export function queueGameplayReset(filename, actorId, summary, now = Date.now()) {
  const { lastReset, ...counts } = summary;
  const job = { version: 1, id: randomUUID(), actorId, requestedAt: new Date(now).toISOString(), requestedPid: process.pid, summary: counts };
  writeExclusiveJson(resetPendingPath(filename), job);
  return job;
}

function processRunning(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { if (error.code === "ESRCH") return false; throw error; }
}

function snapshotDatabase(source, destination) {
  if (fs.lstatSync(source).isSymbolicLink()) throw new Error("A reset database must not be a symbolic link.");
  if (fs.existsSync(destination) && fs.lstatSync(destination).isSymbolicLink()) throw new Error("A reset backup must not be a symbolic link.");
  if (!fs.existsSync(destination)) {
    const db = new DatabaseSync(source);
    try { db.prepare("VACUUM INTO ?").run(destination); } finally { db.close(); }
    fs.chmodSync(destination, 0o600);
  }
  const check = new DatabaseSync(destination, { readOnly: true });
  try { if (Object.values(check.prepare("PRAGMA quick_check").get())[0] !== "ok") throw new Error("Reset backup validation failed."); }
  finally { check.close(); }
}

export function applyPendingGameplayReset({ filename, chatFilename, isRunning = processRunning, afterCore = () => {}, now = Date.now() }) {
  const pending = resetPendingPath(filename);
  if (!fs.existsSync(pending)) return null;
  if (fs.lstatSync(pending).isSymbolicLink() || fs.statSync(pending).size > 16384) throw new Error("Invalid reset request file.");
  const job = JSON.parse(fs.readFileSync(pending, "utf8"));
  if (job.version !== 1 || !/^[a-f0-9-]{36}$/.test(job.id) || typeof job.actorId !== "string" || !Number.isSafeInteger(job.requestedPid) || job.requestedPid <= 0) throw new Error("Invalid reset request.");
  if (isRunning(job.requestedPid)) throw new Error("Reset postponed: the previous server is still running.");
  if (path.resolve(filename) === path.resolve(chatFilename)) throw new Error("Main and chat databases must be distinct.");
  const backupDirectory = path.join(path.dirname(filename), "reset-backups", job.id);
  for (const directory of [path.dirname(backupDirectory), backupDirectory]) {
    if (fs.existsSync(directory) && fs.lstatSync(directory).isSymbolicLink()) throw new Error("A reset backup directory must not be a symbolic link.");
  }
  fs.mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
  fs.chmodSync(backupDirectory, 0o700);
  // Never mutate either database before every required snapshot has been verified.
  snapshotDatabase(filename, path.join(backupDirectory, "main.sqlite"));
  const chatExists = fs.existsSync(chatFilename);
  if (chatExists) snapshotDatabase(chatFilename, path.join(backupDirectory, "chat.sqlite"));
  const manifest = path.join(backupDirectory, "manifest.json");
  if (!fs.existsSync(manifest)) writeExclusiveJson(manifest, { ...job, databases: ["main.sqlite", ...(chatExists ? ["chat.sqlite"] : [])] });

  const db = new DatabaseSync(filename);
  try {
    db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000");
    db.exec("BEGIN IMMEDIATE");
    try {
      const receipt = JSON.parse(db.prepare("SELECT value FROM meta WHERE key='last-gameplay-reset'").get()?.value ?? "null");
      if (receipt?.id !== job.id) {
        if (receipt && Date.parse(receipt.completedAt) > Date.parse(job.requestedAt)) throw new Error("Refusing an older reset request.");
        const current = resetSummary(filename);
        if (!Number.isSafeInteger(current.signupTokens)) throw new Error("Invalid initial balance.");
        for (const table of clearTables) db.exec(`DELETE FROM ${table}`);
        db.exec("DELETE FROM users WHERE guest=1");
        const update = db.prepare("UPDATE users SET data=? WHERE id=?");
        const item = db.prepare("INSERT OR IGNORE INTO item_catalog(type,id) VALUES(?,?)");
        const inventory = db.prepare("INSERT INTO user_inventory(user_id,type,item_id,position) VALUES(?,?,?,?)");
        const columns = new Set(db.prepare("PRAGMA table_info(transactions)").all().map(row => row.name));
        const fields = ["id", "user_id", "game_id", "event_id", "request_id", "created_at", "data", "amount", "balance", "reason", "day"].filter(key => columns.has(key));
        const transaction = db.prepare(`INSERT INTO transactions(${fields.join(",")}) VALUES(${fields.map(() => "?").join(",")})`);
        for (const row of db.prepare("SELECT id,data FROM users").all()) {
          const user = JSON.parse(row.data);
          for (const key of ["gameXp", "gameElo", "achievementProgress", "achievementRewards", "siteActivity", "secretTimers", "statistics", "publicStats", "profileStats", "passwordReset"]) delete user[key];
          user.tokens = current.signupTokens;
          user.lastDailyClaim = null;
          user.achievements = {};
          user.roomInvites = [];
          user.notifications = (user.notifications ?? []).filter(entry => ["moderation-decision", "parental-decision"].includes(entry.type));
          user.sessionVersion = (Number(user.sessionVersion) || 0) + 1;
          user.profile ??= {};
          for (const key of ["titleGameId", "titleLevel", "titleHidden", "rankedBadgeGameId"]) delete user.profile[key];
          user.cosmetics = structuredClone(defaultCosmetics);
          for (const [type, values] of Object.entries(defaultCosmetics)) {
            if (!Array.isArray(values)) continue;
            user.cosmetics[type] = [];
            values.forEach((id, position) => { item.run(type, id); inventory.run(user.id, type, id, position); });
          }
          // A gameplay reset must never destroy cosmetics purchased with premium currency.
          if (db.prepare("SELECT 1 FROM sqlite_master WHERE name='koin_cosmetic_grants'").get()) {
            const restore = db.prepare("INSERT OR IGNORE INTO user_inventory(user_id,type,item_id,position) VALUES(?,?,?,?)");
            for (const grant of db.prepare("SELECT item_type,item_value FROM koin_cosmetic_grants WHERE user_id=?").all(user.id)) {
              item.run(grant.item_type, grant.item_value);
              const position = db.prepare("SELECT COALESCE(MAX(position),-1)+1 AS n FROM user_inventory WHERE user_id=? AND type=?").get(user.id, grant.item_type).n;
              restore.run(user.id, grant.item_type, grant.item_value, position);
            }
          }
          update.run(JSON.stringify(user), user.id);
          const initial = { id: randomUUID(), userId: user.id, amount: current.signupTokens, balance: current.signupTokens, reason: "signup-bonus", note: "Réinitialisation globale du casino", createdAt: new Date(now).toISOString() };
          const record = { id: initial.id, user_id: user.id, game_id: null, event_id: null, request_id: null, created_at: initial.createdAt, data: JSON.stringify(initial), amount: initial.amount, balance: initial.balance, reason: initial.reason, day: casinoDateKey(now) };
          transaction.run(...fields.map(key => record[key]));
        }
        const eventUpdate = db.prepare("UPDATE community_events SET status='draft',data=? WHERE id=?");
        for (const row of db.prepare("SELECT id,data FROM community_events").all()) {
          const event = JSON.parse(row.data);
          event.status = "draft"; event.runtime = defaultCommunityEvent(new Date(now)).runtime;
          eventUpdate.run(JSON.stringify(event), row.id);
        }
        db.prepare("DELETE FROM meta WHERE key='leaderboard-active-season'").run();
        const result = { id: job.id, actorId: job.actorId, requestedAt: job.requestedAt, completedAt: new Date(now).toISOString(), summary: current, backupId: job.id };
        delete result.summary.lastReset;
        db.prepare("INSERT OR REPLACE INTO meta(key,value) VALUES('last-gameplay-reset',?)").run(JSON.stringify(result));
      }
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
    afterCore();
    // The receipt makes retries safe if auxiliary cleanup or process startup fails.
    if (chatExists) {
      const chat = new DatabaseSync(chatFilename);
      try {
        chat.exec("BEGIN IMMEDIATE; DELETE FROM chat_messages WHERE channel_type='room'; DELETE FROM chat_reads WHERE channel_type='room'; COMMIT");
      } finally { chat.close(); }
    }
    fs.unlinkSync(pending);
    return JSON.parse(db.prepare("SELECT value FROM meta WHERE key='last-gameplay-reset'").get().value);
  } finally { db.close(); }
}
