export function groupHelpEntries(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const category = entry.category?.trim() || "Général";
    if (!groups.has(category)) groups.set(category, { category, entries: [] });
    groups.get(category).entries.push(entry);
  }
  return [...groups.values()];
}
