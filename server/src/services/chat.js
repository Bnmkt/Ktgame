import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const channelTypes = new Set(["global", "direct", "room"]);
const clean = (value, maximum) => String(value ?? "").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "").trim().slice(0, maximum);
const iso = (value = Date.now()) => new Date(value).toISOString();

export function directChannelId(left, right) {
  return createHash("sha256").update([String(left), String(right)].sort().join("|")).digest("hex").slice(0, 32);
}

export function createChatStore({ filename }) {
  const databasePath = path.resolve(filename);
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      channel_type TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chat_channel ON chat_messages(channel_type, channel_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_chat_sender ON chat_messages(sender_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_chat_created_at ON chat_messages(created_at);
    CREATE TABLE IF NOT EXISTS chat_reads (
      user_id TEXT NOT NULL,
      channel_type TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      read_at TEXT NOT NULL,
      PRIMARY KEY(user_id, channel_type, channel_id)
    );
  `);
  let writesSinceCleanup = 0;

  return {
    add({ channelType, channelId, senderId, content }, now = Date.now()) {
      if (!channelTypes.has(channelType)) throw new Error("INVALID_CHAT_CHANNEL");
      const message = {
        id: randomUUID(), channelType, channelId: clean(channelId, 100), senderId: clean(senderId, 100),
        content: clean(content, 500), createdAt: iso(now)
      };
      if (!message.channelId || !message.senderId || !message.content) throw new Error("INVALID_CHAT_MESSAGE");
      db.prepare("INSERT INTO chat_messages(id,channel_type,channel_id,sender_id,content,created_at) VALUES(?,?,?,?,?,?)")
        .run(message.id, message.channelType, message.channelId, message.senderId, message.content, message.createdAt);
      db.prepare("DELETE FROM chat_messages WHERE created_at < ?").run(iso(now - 180 * 86400000));
      writesSinceCleanup += 1;
      if (writesSinceCleanup >= 50) {
        writesSinceCleanup = 0;
        db.prepare("DELETE FROM chat_messages WHERE channel_type=? AND channel_id=? AND id NOT IN (SELECT id FROM chat_messages WHERE channel_type=? AND channel_id=? ORDER BY created_at DESC LIMIT 2000)")
          .run(message.channelType, message.channelId, message.channelType, message.channelId);
      }
      return message;
    },
    list(channelType, channelId, limit = 100) {
      if (!channelTypes.has(channelType)) return [];
      const rows = db.prepare("SELECT id,channel_type AS channelType,channel_id AS channelId,sender_id AS senderId,content,created_at AS createdAt FROM chat_messages WHERE channel_type=? AND channel_id=? ORDER BY created_at DESC LIMIT ?")
        .all(channelType, clean(channelId, 100), Math.max(1, Math.min(100, Math.floor(Number(limit) || 50))));
      return rows.reverse();
    },
    markRead(userId, channelType, channelId, now = Date.now()) {
      if (!channelTypes.has(channelType)) return false;
      db.prepare("INSERT INTO chat_reads(user_id,channel_type,channel_id,read_at) VALUES(?,?,?,?) ON CONFLICT(user_id,channel_type,channel_id) DO UPDATE SET read_at=excluded.read_at")
        .run(clean(userId, 100), channelType, clean(channelId, 100), iso(now));
      return true;
    },
    unread(userId, channels) {
      const statement = db.prepare(`SELECT COUNT(*) AS count FROM chat_messages m
        LEFT JOIN chat_reads r ON r.user_id=? AND r.channel_type=m.channel_type AND r.channel_id=m.channel_id
        WHERE m.channel_type=? AND m.channel_id=? AND m.sender_id!=? AND m.created_at>COALESCE(r.read_at,'1970-01-01T00:00:00.000Z')`);
      return Object.fromEntries(channels.map(({ channelType, channelId }) => [`${channelType}:${channelId}`, Number(statement.get(userId, channelType, channelId, userId)?.count) || 0]));
    },
    deleteForUser(userId) {
      db.prepare("UPDATE chat_messages SET sender_id='deleted-user' WHERE sender_id=?").run(userId);
      db.prepare("DELETE FROM chat_reads WHERE user_id=?").run(userId);
    },
    close() { db.close(); }
  };
}
