import { DatabaseSync } from "node:sqlite";
import { Archive } from "../storage/archives.js";
import { historyDecoder } from "../storage/history-reader.js";
import { ledgerPage } from "../storage/ledger.js";
import { playerStatistics } from "./player-statistics.js";

export const readingServices = ["history", "transactions", "statistics"];

// Never import db.js here: workers must not migrate data or own account writes.
export function createReadingTasks(filename) {
  const sqlite = new DatabaseSync(filename, { readOnly: true });
  sqlite.exec("PRAGMA query_only = ON; PRAGMA busy_timeout = 1000; PRAGMA cache_size = -4000;");
  const db = {
    history: new Archive(sqlite, "history", historyDecoder(sqlite)),
    transactions: new Archive(sqlite, "transactions", (row) => JSON.parse(row.data))
  };
  let revision = 0;
  db.history.revisionFor = db.transactions.revisionFor = () => String(revision);
  return {
    run(service, payload) {
      if (!readingServices.includes(service) || typeof payload?.userId !== "string" || payload.userId.length > 200) throw new Error("Invalid reading task.");
      sqlite.exec("BEGIN");
      try {
        revision = sqlite.prepare("PRAGMA data_version").get().data_version;
        const result = service === "statistics" ? playerStatistics(db, payload.userId)
          : ledgerPage(db[service], payload.userId, payload.query);
        sqlite.exec("COMMIT");
        return result;
      } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
    close() { sqlite.close(); }
  };
}
