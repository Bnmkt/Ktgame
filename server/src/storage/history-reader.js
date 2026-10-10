export function historyDecoder(sqlite) {
  const players = sqlite.prepare("SELECT player FROM history_members WHERE history_id = ? AND player_order >= 0 ORDER BY player_order");
  return (row) => {
    const data = JSON.parse(row.data);
    if (Array.isArray(data.players)) data.players = players.all(data.id).map((entry) => JSON.parse(entry.player));
    return data;
  };
}
