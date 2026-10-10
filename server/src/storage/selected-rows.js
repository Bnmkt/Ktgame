const indexes = new WeakMap();

// Collections keep mutable rows. Validate their slots so replacements, removals
// and reordering never return a stale row, even when the length is unchanged.
export function selectedCollectionRows(rows, ids) {
  if (!ids.size) return [];
  let index = indexes.get(rows);
  const rebuild = () => {
    index = { length: rows.length, entries: new Map(rows.map((row, slot) => [row.id, { row, slot }])) };
    indexes.set(rows, index);
  };
  if (!index || index.length !== rows.length) rebuild();
  const selected = [];
  for (const id of ids) {
    let entry = index.entries.get(id);
    if (!entry || rows[entry.slot] !== entry.row || entry.row.id !== id) { rebuild(); entry = index.entries.get(id); }
    if (entry) selected.push(entry.row);
  }
  return selected;
}
