export const builtInShopPacks = {
  "japanese-traditional": { name: "Japon traditionnel", description: "Encre sumi, papier washi, indigo et vermillon." },
  "japanese-sakura": { name: "Sakura", description: "Une collection rose nacré animée par des pétales." },
  neon: { name: "Néon", description: "Cyan lumineux, halos nocturnes et surfaces futuristes." }
};

export function shopPackName(packId, item) {
  return builtInShopPacks[packId]?.name ?? item?.packName ?? String(packId ?? "").replaceAll("-", " ").replace(/^./, (letter) => letter.toLocaleUpperCase("fr"));
}

export function shopPackDefinitions(shop = []) {
  const definitions = {};
  for (const item of shop) for (const packId of item.packs ?? []) {
    const name = shopPackName(packId, item);
    definitions[packId] ??= builtInShopPacks[packId] ?? { name, description: `Une sélection personnalisable de la collection ${name}.` };
  }
  return definitions;
}
