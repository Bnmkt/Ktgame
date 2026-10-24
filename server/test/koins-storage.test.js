import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createKoinStore } from "../src/services/koins/store.js";
import { defaultCosmetics } from "../src/services/account-domain.js";
import {
  queueGameplayReset,
  applyPendingGameplayReset,
  resetSummary,
} from "../src/services/gameplay-reset.js";

test("premium debits commit with normalized inventory and survive gameplay resets", async () => {
  const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "ktga-koins-storage-"),
    ),
    filename = path.join(directory, "main.sqlite");
  process.env.SQLITE_PATH = filename;
  const { updateDb, readDb, useDatabase, closeDatabase } = await import(
    "../src/db.js"
  );
  let connection,
    closed = false;
  try {
    const store = useDatabase(createKoinStore);
    updateDb((db) => {
      db.users = [
        {
          id: "owner",
          pseudo: "Owner",
          tokens: 1234,
          cosmetics: structuredClone(defaultCosmetics),
        },
      ];
    });
    const { codes } = store.generate({ amount: 50, count: 1 });
    store.redeem("owner", codes[0]);
    const grant = { id: "premium", type: "icons", value: "premium" };
    const edit = (value) => (db) =>
      db.users.find((user) => user.id === "owner").cosmetics.icons.push(value);
    assert.throws(() =>
      updateDb(edit("unaffordable"), {
        users: ["owner"],
        rooms: [],
        settings: false,
        atomic: () => store.spend("owner", 51, "failed:balance", [grant]),
      }),
    );
    assert.equal(
      readDb()
        .users.find((user) => user.id === "owner")
        .cosmetics.icons.includes("unaffordable"),
      false,
    );
    useDatabase((db) =>
      db.exec(
        "CREATE TRIGGER fail_premium_test BEFORE INSERT ON user_inventory WHEN NEW.item_id='rejected' BEGIN SELECT RAISE(ABORT,'forced inventory failure'); END",
      ),
    );
    assert.throws(
      () =>
        updateDb(edit("rejected"), {
          users: ["owner"],
          rooms: [],
          settings: false,
          atomic: () =>
            store.spend("owner", 5, "failed:inventory", [
              { ...grant, value: "rejected" },
            ]),
        }),
      /forced inventory/,
    );
    assert.equal(store.wallet("owner").balance, 50);
    assert.equal(store.ledger("owner").length, 1);
    updateDb(edit("premium"), {
      users: ["owner"],
      rooms: [],
      settings: false,
      atomic: () => store.spend("owner", 25, "success:premium", [grant]),
    });
    assert.equal(store.wallet("owner").balance, 25);
    assert.equal(
      readDb().users.find((user) => user.id === "owner").tokens,
      1234,
    );
    useDatabase((db) => {
      assert.equal(
        db
          .prepare("SELECT COUNT(*) n FROM transactions WHERE user_id='owner'")
          .get().n,
        0,
      );
      assert.equal(
        db.prepare("SELECT COUNT(*) n FROM koin_cosmetic_grants").get().n,
        1,
      );
    });
    closeDatabase();
    closed = true;
    connection = new DatabaseSync(filename);
    for (const table of [
      "ranked_results",
      "ranked_settlements",
      "user_ranked_placements",
    ])
      connection.exec(`CREATE TABLE IF NOT EXISTS ${table}(id TEXT)`);
    connection.close();
    connection = null;
    queueGameplayReset(filename, "owner", resetSummary(filename));
    applyPendingGameplayReset({
      filename,
      chatFilename: path.join(directory, "absent-chat.sqlite"),
      isRunning: () => false,
    });
    connection = new DatabaseSync(filename, { readOnly: true });
    assert.equal(
      connection
        .prepare("SELECT balance FROM koin_wallets WHERE user_id='owner'")
        .get().balance,
      25,
    );
    assert.ok(
      connection
        .prepare(
          "SELECT 1 FROM user_inventory WHERE user_id='owner' AND item_id='premium'",
        )
        .get(),
    );
    assert.equal(
      connection.prepare("SELECT COUNT(*) n FROM koin_ledger").get().n,
      2,
    );
  } finally {
    connection?.close();
    if (!closed) closeDatabase();
    assert.equal(
      path.dirname(path.resolve(directory)),
      path.resolve(os.tmpdir()),
    );
    assert.ok(path.basename(directory).startsWith("ktga-koins-storage-"));
    fs.rmSync(directory, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  }
});
