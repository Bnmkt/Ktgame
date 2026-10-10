import { casinoDateKey, CASINO_TIME_ZONE } from "../services/time.js";
import { bestScore } from "../services/leaderboard-score.js";
import { historyDecoder } from "./history-reader.js";

export const inventoryTypes = ["icons", "nameEffects", "memberCards", "profileBanners", "profileFrames", "profileEffects", "diceSkins", "cardSkins"];

export function createNormalizedStorage(sqlite, { readOnly = false } = {}) {
  let rebuildHistoryMembers = false;
  if (!readOnly) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS achievement_catalog (id TEXT PRIMARY KEY, data TEXT);
    CREATE TABLE IF NOT EXISTS user_game_xp (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      game_id TEXT NOT NULL, xp INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(user_id, game_id)
    );
    CREATE TABLE IF NOT EXISTS user_game_elo (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      game_id TEXT NOT NULL, elo REAL NOT NULL, games INTEGER NOT NULL, wins INTEGER NOT NULL,
      PRIMARY KEY(user_id,game_id)
    );
    CREATE INDEX IF NOT EXISTS idx_game_elo_ranking ON user_game_elo(game_id,elo DESC,games DESC,user_id);
    CREATE TABLE IF NOT EXISTS user_ranked_placements (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      game_id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(user_id,game_id)
    );
    CREATE TABLE IF NOT EXISTS ranked_results (
      history_id TEXT NOT NULL REFERENCES history(id) ON DELETE CASCADE, match_id TEXT NOT NULL,
      user_id TEXT NOT NULL, game_id TEXT NOT NULL, finished_at TEXT NOT NULL, data TEXT NOT NULL,
      PRIMARY KEY(history_id,user_id), UNIQUE(match_id,user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_ranked_result_user ON ranked_results(user_id,finished_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ranked_result_game_date ON ranked_results(game_id,finished_at);
    CREATE TABLE IF NOT EXISTS ranked_settlements (
      match_id TEXT PRIMARY KEY, history_id TEXT NOT NULL, game_id TEXT NOT NULL, finished_at TEXT NOT NULL
    );
    INSERT OR IGNORE INTO ranked_settlements SELECT match_id,history_id,game_id,finished_at FROM ranked_results;
    CREATE TABLE IF NOT EXISTS achievement_reward_receipts (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      achievement_id TEXT NOT NULL, PRIMARY KEY(user_id, achievement_id)
    );
    CREATE TABLE IF NOT EXISTS item_catalog (type TEXT NOT NULL, id TEXT NOT NULL, data TEXT, PRIMARY KEY(type, id));
    CREATE TABLE IF NOT EXISTS user_achievements (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      achievement_id TEXT NOT NULL REFERENCES achievement_catalog(id),
      unlocked INTEGER NOT NULL, suppressed INTEGER NOT NULL, unlocked_at TEXT,
      unlock_order INTEGER, suppress_order INTEGER,
      PRIMARY KEY(user_id, achievement_id)
    );
    CREATE TABLE IF NOT EXISTS achievement_progress (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      achievement_id TEXT NOT NULL,
      value REAL NOT NULL DEFAULT 0,
      data TEXT,
      updated_at TEXT,
      PRIMARY KEY(user_id, achievement_id)
    );
    CREATE INDEX IF NOT EXISTS idx_achievement_progress_user ON achievement_progress(user_id);
    CREATE TABLE IF NOT EXISTS user_inventory (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL, item_id TEXT NOT NULL, position INTEGER NOT NULL,
      PRIMARY KEY(user_id, type, item_id),
      FOREIGN KEY(type, item_id) REFERENCES item_catalog(type, id)
    );
    CREATE TABLE IF NOT EXISTS history_members (
      history_id TEXT NOT NULL REFERENCES history(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL, game_id TEXT, day TEXT NOT NULL, won INTEGER NOT NULL,
      player_order INTEGER, player TEXT, result_ids TEXT NOT NULL,
      is_bot INTEGER NOT NULL, gain REAL NOT NULL, score REAL,
      PRIMARY KEY(history_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_history_members_user_day ON history_members(user_id, day, game_id, won);
    CREATE INDEX IF NOT EXISTS idx_history_members_game_day ON history_members(game_id, day);
    CREATE INDEX IF NOT EXISTS idx_history_members_day ON history_members(day);
  `);
  const columns = new Set(sqlite.prepare("PRAGMA table_info(transactions)").all().map((row) => row.name));
  for (const [name, type] of [["amount", "REAL"], ["balance", "REAL"], ["reason", "TEXT"], ["day", "TEXT"]]) {
    if (!columns.has(name)) sqlite.exec(`ALTER TABLE transactions ADD COLUMN ${name} ${type}`);
  }
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_transactions_user_reason_day ON transactions(user_id, reason, day)");
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_transactions_day ON transactions(day)");
  if (!sqlite.prepare("PRAGMA table_info(history)").all().some((row) => row.name === "day")) sqlite.exec("ALTER TABLE history ADD COLUMN day TEXT");
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_history_day ON history(day)");
  const memberColumns = new Set(sqlite.prepare("PRAGMA table_info(history_members)").all().map((row) => row.name));
  for (const [name, type] of [["is_bot", "INTEGER NOT NULL DEFAULT 0"], ["gain", "REAL NOT NULL DEFAULT 0"], ["score", "REAL"]]) {
    if (!memberColumns.has(name)) { sqlite.exec(`ALTER TABLE history_members ADD COLUMN ${name} ${type}`); rebuildHistoryMembers = true; }
  }
  const actionColumns = new Set(sqlite.prepare("PRAGMA table_info(community_event_actions)").all().map((row) => row.name));
  for (const [name, type] of [["day", "TEXT"], ["paid", "INTEGER"], ["request_id", "TEXT"]]) {
    if (!actionColumns.has(name)) sqlite.exec(`ALTER TABLE community_event_actions ADD COLUMN ${name} ${type}`);
  }
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_event_action_usage ON community_event_actions(event_id, user_id, day, paid, created_at)");
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_event_action_request ON community_event_actions(event_id, user_id, request_id)");
  const potColumns = new Set(sqlite.prepare("PRAGMA table_info(community_event_pot_entries)").all().map((row) => row.name));
  if (!potColumns.has("day")) sqlite.exec("ALTER TABLE community_event_pot_entries ADD COLUMN day TEXT");
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_event_pot_day ON community_event_pot_entries(day, event_id)");

  }
  const statements = new Map();
  const stmt = (sql) => {
    if (!statements.has(sql)) statements.set(sql, sqlite.prepare(sql));
    return statements.get(sql);
  };
  const ensureAchievement = (id) => stmt("INSERT OR IGNORE INTO achievement_catalog(id) VALUES (?)").run(id);
  const ensureItem = (type, id) => stmt("INSERT OR IGNORE INTO item_catalog(type, id) VALUES (?, ?)").run(type, id);

  function splitUser(user, previous) {
    const data = { ...user };
    const unchanged = (before, after) => previous && JSON.stringify(before) === JSON.stringify(after);
    if (user.gameElo) {
      for (const [gameId,row] of Object.entries(user.gameElo)) {
        if (unchanged(previous?.gameElo?.[gameId], row)) continue;
        stmt("INSERT INTO user_game_elo VALUES (?,?,?,?,?) ON CONFLICT(user_id,game_id) DO UPDATE SET elo=excluded.elo,games=excluded.games,wins=excluded.wins").run(user.id,gameId,row.elo,row.games,row.wins);
        if (row.placement) stmt("INSERT INTO user_ranked_placements VALUES (?,?,?) ON CONFLICT(user_id,game_id) DO UPDATE SET data=excluded.data").run(user.id,gameId,JSON.stringify(row.placement));
        else stmt("DELETE FROM user_ranked_placements WHERE user_id=? AND game_id=?").run(user.id,gameId);
      }
      delete data.gameElo;
    }
    if (user.gameXp) {
      if (!unchanged(previous?.gameXp, user.gameXp)) {
        for (const [gameId, xp] of Object.entries(user.gameXp)) {
          if (unchanged(previous?.gameXp?.[gameId], xp)) continue;
          stmt("INSERT INTO user_game_xp VALUES (?,?,?) ON CONFLICT(user_id,game_id) DO UPDATE SET xp=excluded.xp").run(user.id, gameId, Math.max(0, Math.min(1000000000000, Math.trunc(Number(xp) || 0))));
        }
        user.gameXp = Object.fromEntries(stmt("SELECT game_id,xp FROM user_game_xp WHERE user_id=?").all(user.id).map((row) => [row.game_id, row.xp]));
      }
      if (Object.keys(user.gameXp).length) delete data.gameXp;
    }
    if (user.achievementRewards) {
      if (!unchanged(previous?.achievementRewards, user.achievementRewards)) {
        for (const id of user.achievementRewards) if (!previous?.achievementRewards?.includes(id)) stmt("INSERT OR IGNORE INTO achievement_reward_receipts VALUES (?,?)").run(user.id, id);
        user.achievementRewards = stmt("SELECT achievement_id FROM achievement_reward_receipts WHERE user_id=?").all(user.id).map((row) => row.achievement_id);
      }
      if (user.achievementRewards.length) delete data.achievementRewards;
    }
    if (user.achievements) {
      const { unlocked = [], suppressed = [], unlockedAt = {}, ...extra } = user.achievements;
      data.achievements = extra;
      if (!unchanged(previous?.achievements, user.achievements)) {
        stmt("DELETE FROM user_achievements WHERE user_id = ?").run(user.id);
        for (const id of new Set([...unlocked, ...suppressed, ...Object.keys(unlockedAt)])) {
          ensureAchievement(id);
          stmt("INSERT INTO user_achievements VALUES (?, ?, ?, ?, ?, ?, ?)").run(user.id, id, Number(unlocked.includes(id)), Number(suppressed.includes(id)), unlockedAt[id] ?? null, unlocked.indexOf(id), suppressed.indexOf(id));
        }
      }
    }
    if (user.achievementProgress) {
      delete data.achievementProgress;
      for (const id of Object.keys(previous?.achievementProgress ?? {})) {
        if (!Object.hasOwn(user.achievementProgress, id)) stmt("DELETE FROM achievement_progress WHERE user_id = ? AND achievement_id = ?").run(user.id, id);
      }
      for (const [achievementId, progress] of Object.entries(user.achievementProgress)) {
        if (unchanged(previous?.achievementProgress?.[achievementId], progress)) continue;
        const value = Number(progress?.value) || 0;
        const extra = { ...progress };
        delete extra.value;
        stmt("INSERT INTO achievement_progress VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, achievement_id) DO UPDATE SET value=excluded.value,data=excluded.data,updated_at=excluded.updated_at").run(user.id, achievementId, value, Object.keys(extra).length ? JSON.stringify(extra) : null, progress?.updatedAt ?? null);
      }
    }
    if (user.cosmetics) {
      data.cosmetics = { ...user.cosmetics };
      for (const type of inventoryTypes) if (!unchanged(previous?.cosmetics?.[type], user.cosmetics[type])) stmt("DELETE FROM user_inventory WHERE user_id = ? AND type = ?").run(user.id, type);
      for (const type of inventoryTypes) {
        if (!Array.isArray(user.cosmetics[type])) continue;
        // An empty array records the category's presence, not its possessions.
        data.cosmetics[type] = [];
        if (unchanged(previous?.cosmetics?.[type], user.cosmetics[type])) continue;
        [...new Set(user.cosmetics[type])].forEach((id, position) => {
          ensureItem(type, id);
          stmt("INSERT INTO user_inventory VALUES (?, ?, ?, ?)").run(user.id, type, id, position);
        });
      }
    }
    // publicStats is a derived cache, rebuilt by the profile serializers.
    if (data.profileStats) { data.profileStats = { ...data.profileStats }; delete data.profileStats.publicStats; }
    return data;
  }

  function hydrateUser(row) {
    const user = JSON.parse(row.data);
    const eloRows = stmt("SELECT game_id,elo,games,wins FROM user_game_elo WHERE user_id=?").all(user.id);
    if (eloRows.length) user.gameElo = Object.fromEntries(eloRows.map((r)=>[r.game_id,{elo:r.elo,games:r.games,wins:r.wins}]));
    for (const placement of stmt("SELECT game_id,data FROM user_ranked_placements WHERE user_id=?").all(user.id)) if (user.gameElo?.[placement.game_id]) user.gameElo[placement.game_id].placement = JSON.parse(placement.data);
    const xpRows = stmt("SELECT game_id,xp FROM user_game_xp WHERE user_id=?").all(user.id);
    if (xpRows.length) user.gameXp = Object.fromEntries(xpRows.map((entry) => [entry.game_id, entry.xp]));
    const rewardRows = stmt("SELECT achievement_id FROM achievement_reward_receipts WHERE user_id=?").all(user.id);
    if (rewardRows.length) user.achievementRewards = rewardRows.map((entry) => entry.achievement_id);
    if (user.achievements) {
      const rows = stmt("SELECT * FROM user_achievements WHERE user_id = ?").all(user.id);
      user.achievements = { ...user.achievements,
        unlocked: rows.filter((r) => r.unlocked).sort((a, b) => a.unlock_order - b.unlock_order).map((r) => r.achievement_id),
        suppressed: rows.filter((r) => r.suppressed).sort((a, b) => a.suppress_order - b.suppress_order).map((r) => r.achievement_id),
        unlockedAt: Object.fromEntries(rows.filter((r) => r.unlocked_at !== null).map((r) => [r.achievement_id, r.unlocked_at]))
      };
    }
    const progressRows = stmt("SELECT achievement_id, value, data, updated_at FROM achievement_progress WHERE user_id = ?").all(user.id);
    if (progressRows.length) user.achievementProgress = Object.fromEntries(progressRows.map((progress) => {
      const extra = progress.data ? JSON.parse(progress.data) : {};
      return [progress.achievement_id, { ...extra, value: progress.value, ...(progress.updated_at ? { updatedAt: progress.updated_at } : {}) }];
    }));
    if (user.cosmetics) for (const item of stmt("SELECT * FROM user_inventory WHERE user_id = ? ORDER BY position").all(user.id)) {
      (user.cosmetics[item.type] ??= []).push(item.item_id);
    }
    return user;
  }

  function compactRoomPlayer(player = {}) {
    return {
      id: player.id,
      pseudo: player.pseudo ?? player.profile?.displayName ?? "Joueur",
      tokens: Math.max(0, Number(player.tokens) || 0),
      ...(player.isBot ? { isBot: true } : {}),
      ...(player.guest ? { guest: true } : {}),
      ...(player.cosmetics?.equipped ? { cosmetics: { equipped: player.cosmetics.equipped } } : {})
    };
  }

  function splitRoom(room) {
    return {
      ...room,
      players: (room.players ?? []).map(compactRoomPlayer),
      ...(room.state?.players ? { state: { ...room.state, players: room.state.players.map(compactRoomPlayer) } } : {})
    };
  }

  function indexHistory(row) {
    if (row.ranked?.results?.length) {
      const receipt = stmt("SELECT history_id FROM ranked_settlements WHERE match_id=?").get(row.ranked.matchId);
      if (receipt && receipt.history_id !== row.id) throw new Error("Cette partie classée a déjà attribué son Elo.");
      stmt("INSERT OR IGNORE INTO ranked_settlements VALUES (?,?,?,?)").run(row.ranked.matchId,row.id,row.gameId,row.finishedAt);
    }
    for (const result of row.ranked?.results ?? []) stmt("INSERT INTO ranked_results VALUES (?,?,?,?,?,?) ON CONFLICT(history_id,user_id) DO UPDATE SET data=excluded.data").run(row.id,row.ranked.matchId,result.userId,row.gameId,row.finishedAt,JSON.stringify({ ...result, participants:row.ranked.participants, roomId:row.roomId }));
    stmt("UPDATE history SET day = ? WHERE id = ?").run(casinoDateKey(row.finishedAt), row.id);
    stmt("DELETE FROM history_members WHERE history_id = ?").run(row.id);
    const ids = new Set([...(row.players ?? []).map((player) => player.id), ...(row.winners ?? [])]);
    for (const id of ids) {
      const position = row.players?.findIndex((player) => player.id === id) ?? -1;
      const gain = [row.payouts?.[id], row.blackjackPayouts?.[id]].reduce((sum, value) => sum + (Number.isFinite(value) ? Math.max(0, value) : 0), 0);
      stmt("INSERT INTO history_members VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(row.id, id, row.gameId ?? null, casinoDateKey(row.finishedAt), Number(row.winners?.includes(id) ?? false), position, position < 0 ? null : JSON.stringify(row.players[position]), JSON.stringify(row.achievementEvents?.[id] ?? []), Number(Boolean(row.players?.[position]?.isBot)), gain, bestScore(row, id));
    }
  }
  const hydrateHistory = historyDecoder(sqlite);
  function indexTransaction(row) {
    stmt("UPDATE transactions SET amount = ?, balance = ?, reason = ?, day = ? WHERE id = ?").run(Number(row.amount) || 0, Number.isFinite(row.balance) ? row.balance : null, row.reason ?? null, casinoDateKey(row.createdAt), row.id);
  }

  function indexEventAction(row) {
    stmt("UPDATE community_event_actions SET day = ?, paid = ?, request_id = ? WHERE id = ?").run(casinoDateKey(row.createdAt), Number(Boolean(row.paid)), row.requestId ?? null, row.id);
  }
  function indexEventPotEntry(row) {
    stmt("UPDATE community_event_pot_entries SET day = ? WHERE id = ?").run(casinoDateKey(row.createdAt), row.id);
  }

  function migrate() {
    for (const row of stmt("SELECT data FROM users").iterate()) {
      const user = JSON.parse(row.data);
      const data = splitUser(user);
      stmt("UPDATE users SET data = ? WHERE id = ?").run(JSON.stringify(data), user.id);
    }
    for (const record of stmt("SELECT data FROM history").iterate()) {
      const row = JSON.parse(record.data);
      indexHistory(row);
      stmt("UPDATE history SET data = ? WHERE id = ?").run(JSON.stringify({ ...row, ...(Array.isArray(row.players) ? { players: [] } : {}) }), row.id);
    }
    for (const record of stmt("SELECT data FROM rooms").iterate()) {
      const room = JSON.parse(record.data);
      stmt("UPDATE rooms SET data = ? WHERE id = ?").run(JSON.stringify(splitRoom(room)), room.id);
    }
    for (const row of stmt("SELECT data FROM transactions").iterate()) indexTransaction(JSON.parse(row.data));
    for (const row of stmt("SELECT data FROM community_event_actions").iterate()) indexEventAction(JSON.parse(row.data));
    for (const row of stmt("SELECT data FROM community_event_pot_entries").iterate()) indexEventPotEntry(JSON.parse(row.data));
    stmt("INSERT OR REPLACE INTO meta VALUES ('statistics-time-zone', ?)").run(CASINO_TIME_ZONE);
  }

  function ensureTimeZone() {
    if (stmt("SELECT value FROM meta WHERE key = 'statistics-time-zone'").get()?.value === CASINO_TIME_ZONE) return;
    // Date indexes must follow the configured casino day, including DST.
    sqlite.exec("BEGIN IMMEDIATE");
    try {
      for (const row of stmt("SELECT id, finished_at FROM history").iterate()) {
        stmt("UPDATE history_members SET day = ? WHERE history_id = ?").run(casinoDateKey(row.finished_at), row.id);
        stmt("UPDATE history SET day = ? WHERE id = ?").run(casinoDateKey(row.finished_at), row.id);
      }
      for (const row of stmt("SELECT id, created_at FROM transactions").iterate()) stmt("UPDATE transactions SET day = ? WHERE id = ?").run(casinoDateKey(row.created_at), row.id);
      for (const row of stmt("SELECT id, created_at FROM community_event_actions").iterate()) stmt("UPDATE community_event_actions SET day = ? WHERE id = ?").run(casinoDateKey(row.created_at), row.id);
      for (const row of stmt("SELECT id, created_at FROM community_event_pot_entries").iterate()) stmt("UPDATE community_event_pot_entries SET day = ? WHERE id = ?").run(casinoDateKey(row.created_at), row.id);
      stmt("INSERT OR REPLACE INTO meta VALUES ('statistics-time-zone', ?)").run(CASINO_TIME_ZONE);
      sqlite.exec("COMMIT");
    } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
  }

  function ensureShape() {
    sqlite.exec("BEGIN IMMEDIATE");
    try {
      if (rebuildHistoryMembers) for (const record of stmt("SELECT data FROM history").iterate()) indexHistory(hydrateHistory(record));
      for (const record of stmt("SELECT data FROM rooms").iterate()) {
        const room = JSON.parse(record.data);
        const compact = JSON.stringify(splitRoom(room));
        if (compact !== record.data) stmt("UPDATE rooms SET data = ? WHERE id = ?").run(compact, room.id);
      }
      for (const record of stmt("SELECT data FROM community_event_actions WHERE day IS NULL").iterate()) indexEventAction(JSON.parse(record.data));
      for (const record of stmt("SELECT data FROM community_event_pot_entries WHERE day IS NULL").iterate()) indexEventPotEntry(JSON.parse(record.data));
      for (const record of stmt("SELECT data FROM transactions WHERE day IS NULL").iterate()) indexTransaction(JSON.parse(record.data));
      for (const record of stmt("SELECT data FROM history WHERE day IS NULL").iterate()) indexHistory(hydrateHistory(record));
      sqlite.exec("COMMIT");
    } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
  }

  function syncCatalog(achievements, items, transaction = true) {
    if (transaction) sqlite.exec("BEGIN IMMEDIATE");
    try {
      for (const entry of achievements) stmt("INSERT INTO achievement_catalog VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data WHERE data IS NOT excluded.data").run(entry.id, JSON.stringify(entry));
      for (const entry of items) stmt("INSERT INTO item_catalog VALUES (?, ?, ?) ON CONFLICT(type, id) DO UPDATE SET data = excluded.data WHERE data IS NOT excluded.data").run(entry.type, entry.value ?? entry.id, JSON.stringify(entry));
      if (transaction) sqlite.exec("COMMIT");
    } catch (error) { if (transaction) sqlite.exec("ROLLBACK"); throw error; }
  }
  return { splitUser, hydrateUser, splitRoom, indexHistory, hydrateHistory, indexTransaction, indexEventAction, indexEventPotEntry, migrate, ensureShape, ensureTimeZone, syncCatalog };
}
