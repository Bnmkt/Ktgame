import { awardGameXp, gameProgress, gameXpRules } from "./game-progression.js";

export function backfillHistoricalGameXp(sqlite, userId, config, gameIds, { apply = false } = {}) {
  sqlite.exec(apply ? "BEGIN IMMEDIATE" : "BEGIN");
  try {
    const account = sqlite.prepare("SELECT id,pseudo,guest FROM users WHERE id=?").get(userId);
    if (!account || account.guest) throw new Error("Compte permanent introuvable.");
    const user = { id: account.id, gameXp: Object.fromEntries(sqlite.prepare("SELECT game_id,xp FROM user_game_xp WHERE user_id=?").all(userId).map((row) => [row.game_id, row.xp])) };
    const knownGames = new Set(gameIds), summaries = new Map(), updates = [];
    let alreadyCredited = 0, skipped = 0;
    const history = sqlite.prepare("SELECT h.id,h.data,h.finished_at,m.game_id,m.won,m.is_bot,m.player_order FROM history h JOIN history_members m ON m.history_id=h.id WHERE m.user_id=? ORDER BY h.finished_at,h.id");
    for (const row of history.iterate(userId)) {
      const data = JSON.parse(row.data);
      // The oldest results predate player snapshots but still identify their winning account.
      const legacyWinner = !Object.hasOwn(data, "players") && row.won && data.winners?.includes(userId);
      if (row.is_bot || (!legacyWinner && (row.player_order < 0 || row.player_order === null)) || !row.finished_at || !knownGames.has(row.game_id)) { skipped++; continue; }
      if (data.gameId !== row.game_id) throw new Error(`Jeu incoherent dans la partie ${row.id}.`);
      if (!summaries.has(row.game_id)) summaries.set(row.game_id, { gameId: row.game_id, completed: 0, won: 0, alreadyCredited: 0, beforeXp: user.gameXp[row.game_id] ?? 0, addedXp: 0 });
      const summary = summaries.get(row.game_id);
      summary.completed++; summary.won += Number(Boolean(row.won));
      // The same per-player receipt is used by normal game completion, including zero awards.
      if (Object.hasOwn(data.xpAwards ?? {}, userId)) { alreadyCredited++; summary.alreadyCredited++; continue; }
      const rules = gameXpRules(config, row.game_id);
      const reward = awardGameXp(user, row.game_id, rules.completionXp + (row.won ? rules.victoryXp : 0), config);
      const amount = reward?.amount ?? 0;
      summary.addedXp += amount;
      updates.push({ id: row.id, data: JSON.stringify({ ...data, xpAwards: { ...data.xpAwards, [userId]: amount } }) });
    }
    if (apply) {
      const updateHistory = sqlite.prepare("UPDATE history SET data=? WHERE id=?");
      const updateXp = sqlite.prepare("INSERT INTO user_game_xp(user_id,game_id,xp) VALUES (?,?,?) ON CONFLICT(user_id,game_id) DO UPDATE SET xp=excluded.xp");
      for (const summary of summaries.values()) if (summary.addedXp > 0) updateXp.run(userId, summary.gameId, user.gameXp[summary.gameId]);
      for (const row of updates) updateHistory.run(row.data, row.id);
    }
    const result = {
      user: { id: account.id, pseudo: account.pseudo }, applied: apply, gamesCredited: updates.length, alreadyCredited, skipped,
      addedXp: [...summaries.values()].reduce((total, row) => total + row.addedXp, 0),
      totalXp: Object.values(user.gameXp).reduce((total, xp) => total + xp, 0),
      games: [...summaries.values()].map((summary) => ({ ...summary, ...gameProgress(user, summary.gameId, config) }))
    };
    sqlite.exec("COMMIT");
    return result;
  } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
}
