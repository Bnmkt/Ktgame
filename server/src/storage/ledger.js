// All filters are applied before LIMIT, so older matches stay searchable without
// downloading a player's entire financial or game history.
export function ledgerPage(archive, userId, query = {}) {
  const history = archive.table === "history";
  const limit = Math.max(1, Math.min(100, Math.trunc(Number(query.limit) || 100)));
  const offset = Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.trunc(Number(query.offset) || 0)));
  const clauses = [history ? "id IN (SELECT history_id FROM history_members WHERE user_id = ?)" : "user_id = ?"];
  const params = [userId];
  if (query.game && query.game !== "all") {
    if (!history && query.game === "global") clauses.push("game_id IS NULL");
    else { clauses.push(history ? "json_extract(data, '$.gameId') = ?" : "game_id = ?"); params.push(String(query.game)); }
  }
  if (history && ["won", "played"].includes(query.result)) {
    clauses.push(`id IN (SELECT history_id FROM history_members WHERE user_id = ? AND won = ?)`);
    params.push(userId, Number(query.result === "won"));
  }
  if (!history && query.event && query.event !== "all") { clauses.push("reason = ?"); params.push(String(query.event)); }
  if (!history && ["credit", "debit"].includes(query.direction)) clauses.push(query.direction === "credit" ? "amount >= 0" : "amount < 0");
  const search = String(query.search ?? "").trim().toLowerCase().slice(0, 160);
  if (search) {
    if (history) {
      clauses.push("(instr(lower(coalesce(json_extract(data, '$.name'),'') || ' ' || coalesce(json_extract(data, '$.code'),'') || ' ' || coalesce(json_extract(data, '$.gameId'),'')), ?) > 0 OR id IN (SELECT history_id FROM history_members WHERE instr(lower(coalesce(json_extract(player, '$.pseudo'),'')), ?) > 0))");
      params.push(search, search);
    } else {
      const reasons = String(query.searchReasons ?? "").slice(0, 2000).split(",").filter(Boolean).slice(0, 50);
      clauses.push(`(instr(lower(coalesce(reason,'') || ' ' || coalesce(json_extract(data, '$.note'),'') || ' ' || coalesce(game_id,'') || ' ' || coalesce(json_extract(data, '$.roomId'),'') || ' ' || coalesce(event_id,'')), ?) > 0${reasons.length ? ` OR reason IN (${reasons.map(() => "?").join(",")})` : ""})`);
      params.push(search, ...reasons);
    }
  }
  const where = clauses.join(" AND ");
  const total = archive.sqlite.prepare(`SELECT count(*) AS n FROM ${archive.table} WHERE ${where}`).get(...params).n;
  const rows = archive.sqlite.prepare(`SELECT * FROM ${archive.table} WHERE ${where} ORDER BY ${history ? "finished_at" : "created_at"} DESC, rowid DESC LIMIT ? OFFSET ?`).all(...params, limit, offset).map(archive.decode);
  return { rows, total, offset, limit, hasMore: offset + rows.length < total };
}
