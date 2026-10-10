import { DatabaseSync } from "node:sqlite";
import { Archive } from "../storage/archives.js";
import { historyDecoder } from "../storage/history-reader.js";
import { createNormalizedStorage } from "../storage/normalized.js";
import { prepared } from "../storage/statements.js";
import { createAccountDomain } from "./account-domain.js";
import { ConfigurationCache } from "./configuration-cache.js";
import { playerStatistics, playerStatisticsCacheHealth } from "./player-statistics.js";
import { createReadingTasks, readingServices } from "./reading-tasks.js";

export const accountViewServices = ["account", "public-profile", "user-search", "notifications", "achievement-list", "shop"];
const identifier = (value) => typeof value === "string" && value.length > 0 && value.length <= 200;
const encoded = (value, status = 200) => ({ status, json: JSON.stringify(value) });

export function createAccountTasks(filename) {
  const sqlite = new DatabaseSync(filename, { readOnly: true });
  sqlite.exec("PRAGMA query_only=ON; PRAGMA busy_timeout=1000; PRAGMA cache_size=-4000;");
  const storage = createNormalizedStorage(sqlite, { readOnly: true });
  const reading = createReadingTasks(filename);
  const db = { users: [], history: new Archive(sqlite, "history", historyDecoder(sqlite)),
    transactions: new Archive(sqlite, "transactions", (row) => JSON.parse(row.data)) };
  let revisions = {}, externalRevision = 0, configId = null, config, domain;
  db.history.revisionFor = (id) => revisions[id]?.history ?? `external:${externalRevision}`;
  db.transactions.revisionFor = (id) => revisions[id]?.transactions ?? `external:${externalRevision}`;
  function configure(input) {
    if (!input?.id || !input.platform || !input.ranked || !Array.isArray(input.catalog) || !Array.isArray(input.shop)) throw new Error("Invalid account configuration.");
    if (input.id === configId) return;
    configId = input.id; config = input;
    domain = createAccountDomain({ configurationCache: new ConfigurationCache(),
      platformSettings: () => config.platform, rankedConfig: () => config.ranked,
      achievementCatalog: () => config.catalog, playerStatistics });
  }
  function user(id, guest) {
    if (!identifier(id)) return null;
    const row = prepared(sqlite, "SELECT data FROM users WHERE id=?").get(id);
    if (row) return storage.hydrateUser(row);
    return guest?.guest === true && guest.id === id ? structuredClone(guest) : null;
  }
  return {
    run(service, payload) {
      if (readingServices.includes(service)) return reading.run(service, payload);
      if (!accountViewServices.includes(service)) throw new Error("Unsupported account task.");
      if (payload?.configuration) configure(payload.configuration);
      if (!domain || payload?.configId !== configId) throw new Error("Missing account configuration.");
      if (service === "shop") return encoded(config.shop);
      if (!identifier(payload.userId)) throw new Error("Invalid account task.");
      revisions = payload.revisions ?? {};
      sqlite.exec("BEGIN");
      try {
        externalRevision = prepared(sqlite, "PRAGMA data_version").get().data_version;
        const viewer = user(payload.userId, payload.guest);
        db.users = viewer ? [viewer] : [];
        let result;
        if (!viewer) result = encoded({ error: "Utilisateur introuvable." }, 404);
        else if (service === "account") {
          domain.refreshPublicProfileStats(viewer, db);
          result = encoded(domain.serializeUserInternal(viewer, db));
        } else if (service === "notifications") {
          result = encoded((viewer.notifications ?? []).map((row) => domain.sanitizeNotification(row, viewer)));
        } else if (service === "achievement-list") result = encoded(domain.achievementStatus(viewer, db));
        else if (service === "public-profile") {
          const target = user(payload.targetId);
          if (target && target.id !== viewer.id) db.users.push(target);
          result = target ? encoded(domain.publicUserPayload(target, db, viewer.id)) : encoded({ error: "Profil introuvable." }, 404);
        } else {
          const query = String(payload.query ?? "").trim().toLowerCase().slice(0, 200);
          if (query.length < 2) result = encoded([]);
          else {
            domain.ensureUserSocial(viewer);
            // SQLite lower() is ASCII-only; preserve Unicode name matching and
            // hydrate the normalized inventory only for actual matches.
            const matches = prepared(sqlite, "SELECT data FROM users WHERE id!=? ORDER BY rowid").iterate(viewer.id);
            const rows = [];
            for (const row of matches) {
              const candidate = JSON.parse(row.data);
              if (!String(candidate.pseudo).toLowerCase().includes(query) &&
                !domain.displayNameFor(candidate).toLowerCase().includes(query) &&
                domain.friendCodeFor(candidate).toLowerCase() !== query.replace(/[^a-z0-9]/g, "")) continue;
              const target = storage.hydrateUser(row); domain.ensureUserSocial(target);
              if (viewer.blockedUsers.includes(target.id) || target.blockedUsers.includes(viewer.id)) continue;
              rows.push({ ...domain.sanitizeFriendUser(target, db), isFriend: viewer.friends.includes(target.id),
                requested: viewer.friendRequests.outgoing.includes(target.id), incoming: viewer.friendRequests.incoming.includes(target.id) });
              if (rows.length === 12) break;
            }
            result = encoded(rows);
          }
        }
        sqlite.exec("COMMIT");
        return result;
      } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
    health() { return { statistics: playerStatisticsCacheHealth(db), achievements: domain?.achievementProgressCache.health(), memberStats: domain?.memberStatsCache.health() }; },
    close() { reading.close(); sqlite.close(); }
  };
}
