import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { claimMascotGift, syncMascotPackOwners } from "../src/services/mascot-gift.js";
import { defaultCosmetics } from "../src/services/account-domain.js";
import { createNormalizedStorage } from "../src/storage/normalized.js";

test("the welcome receipt and future items survive normalized storage and roll back together", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ktga-mascot-gift-"));
  const filename = path.join(directory, "main.sqlite");
  process.env.SQLITE_PATH = filename;
  const { readDb, updateDb, closeDatabase } = await import("../src/db.js");
  const normalize = (value = {}) => ({ ...structuredClone(defaultCosmetics), ...structuredClone(value) });
  const item = { id: "owl", value: "owl", type: "icons", packs: ["lucky"] };
  const future = { id: "future", value: "future", type: "cardSkins", packs: ["lucky"] };
  let connection;
  try {
    updateDb((db) => { db.users = [{ id: "owner", pseudo: "owner", tokens: 1234, cosmetics: normalize() }]; db.settings.customShopItems = [item]; });
    updateDb((db) => claimMascotGift(db.users.find((user) => user.id === "owner"), "lucky", db.settings.customShopItems, normalize), { users: ["owner"], rooms: [], settings: false });
    updateDb((db) => { db.settings.customShopItems.push(future); syncMascotPackOwners(db, db.settings.customShopItems, normalize); });
    assert.throws(() => updateDb((db) => {
      db.settings.customShopItems.push({ id: "rollback", value: "rollback", type: "icons", packs: ["lucky"] });
      syncMascotPackOwners(db, db.settings.customShopItems, normalize);
      throw new Error("Cancelled edit");
    }), /Cancelled edit/);
    assert.equal(readDb().users[0].cosmetics.icons.includes("rollback"), false);
    connection = new DatabaseSync(filename, { readOnly: true });
    const storage = createNormalizedStorage(connection, { readOnly: true });
    const user = storage.hydrateUser(connection.prepare("SELECT data FROM users WHERE id=?").get("owner"));
    assert.equal(user.mascotGift.packId, "lucky");
    assert.equal(user.tokens, 1234);
    assert.deepEqual(user.cosmetics.icons, ["chip", "owl"]);
    assert.deepEqual(user.cosmetics.cardSkins, ["default", "future"]);
    assert.equal(claimMascotGift(user, "midnight", [], normalize).status, "conflict");
  } finally {
    connection?.close(); closeDatabase();
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith("ktga-mascot-gift-"));
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
