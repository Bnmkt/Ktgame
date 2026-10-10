export function gameImageUrl(value) {
  const source = String(value ?? "").trim();
  if (!source || /^n\/?a$/i.test(source)) return "";
  if (source.length > 2048 || /[\s\\\u0000-\u001f]/.test(source)) return "";
  if (source.startsWith("/") && !source.startsWith("//")) return source;
  try {
    const url = new URL(source);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
}

export function featuredGame(games, id) {
  const available = games.filter((game) => game.enabled !== false);
  return available.find((game) => game.id === id) ?? available[0] ?? null;
}
