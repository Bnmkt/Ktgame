import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

export const MAX_PASSKEYS = 10;
export function createPasskeyStore(filename) {
  if (filename !== ":memory:") fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=1000;
    CREATE TABLE IF NOT EXISTS passkeys (
      id TEXT PRIMARY KEY, credential_id TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL,
      name TEXT NOT NULL, public_key BLOB NOT NULL, counter INTEGER NOT NULL,
      transports TEXT NOT NULL, device_type TEXT NOT NULL, backed_up INTEGER NOT NULL,
      created_at TEXT NOT NULL, last_used_at TEXT, revision INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS passkeys_user ON passkeys(user_id);`);
  if (filename !== ":memory:") fs.chmodSync(filename, 0o600);
  const count = userId => db.prepare("SELECT COUNT(*) AS n FROM passkeys WHERE user_id=?").get(userId).n;
  const metadata = row => ({ id: row.id, name: row.name, createdAt: row.created_at, lastUsedAt: row.last_used_at, synced: Boolean(row.backed_up) });
  return {
    count,
    list: userId => db.prepare("SELECT id,name,created_at,last_used_at,backed_up FROM passkeys WHERE user_id=? ORDER BY created_at DESC").all(userId).map(metadata),
    credentials: userId => db.prepare("SELECT credential_id AS id,transports FROM passkeys WHERE user_id=?").all(userId).map(row => ({ id: row.id, transports: JSON.parse(row.transports) })),
    credential: id => db.prepare("SELECT * FROM passkeys WHERE credential_id=?").get(id),
    add(userId, name, info) {
      const credential = info.credential;
      if (!/^[A-Za-z0-9_-]{1,1500}$/.test(credential?.id) || !(credential.publicKey instanceof Uint8Array) || credential.publicKey.byteLength > 4096 || !Number.isSafeInteger(credential.counter) || credential.counter < 0 || credential.counter > 0xffffffff) throw new Error("Passkey invalide.");
      const transports = [...new Set((Array.isArray(credential.transports) ? credential.transports : []).filter(value => ["usb", "nfc", "ble", "internal", "hybrid", "cable", "smart-card"].includes(value)))];
      db.exec("BEGIN IMMEDIATE");
      try {
        if (count(userId) >= MAX_PASSKEYS) throw new Error("La limite de dix passkeys est atteinte.");
        const id = randomUUID();
        db.prepare("INSERT INTO passkeys (id,credential_id,user_id,name,public_key,counter,transports,device_type,backed_up,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
          .run(id, credential.id, userId, name, Buffer.from(credential.publicKey), credential.counter, JSON.stringify(transports), info.credentialDeviceType, Number(info.credentialBackedUp), new Date().toISOString());
        db.exec("COMMIT");
        return id;
      } catch (error) { db.exec("ROLLBACK"); throw error; }
    },
    used(row, info) {
      return db.prepare("UPDATE passkeys SET counter=?,backed_up=?,last_used_at=?,revision=revision+1 WHERE id=? AND user_id=? AND revision=?")
        .run(info.newCounter, Number(info.credentialBackedUp), new Date().toISOString(), row.id, row.user_id, row.revision).changes === 1;
    },
    rename: (userId, id, name) => db.prepare("UPDATE passkeys SET name=? WHERE user_id=? AND id=?").run(name, userId, id).changes === 1,
    remove: (userId, id) => db.prepare("DELETE FROM passkeys WHERE user_id=? AND id=?").run(userId, id).changes === 1,
    deleteForUser: userId => db.prepare("DELETE FROM passkeys WHERE user_id=?").run(userId),
    close: () => db.close()
  };
}
