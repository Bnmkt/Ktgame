export const defaultCatalogFilters = { search: "", type: "all", category: "all", ownership: "unowned", sort: "price-asc", maxPrice: "", affordable: false, tokens: true, koins: true };

export function ownsShopItem(user, item) {
  return Boolean(user.cosmetics?.[item.type]?.includes(item.value));
}

export function filterShopItems(items, user, filters, packs = {}, pricesForItem = (item) => [{ price: Number(item.price), affordable: Number(item.price) <= Number(user.tokens) }]) {
  const search = filters.search.trim().toLocaleLowerCase("fr");
  const budget = filters.maxPrice === "" ? Infinity : Math.max(0, Number(filters.maxPrice) || 0);
  const prices = new Map(items.map((item) => [item, pricesForItem(item)]));
  return items.filter((item) => {
    const owned = ownsShopItem(user, item);
    const terms = [item.name, item.description, item.packName, ...(item.packs ?? []).map((id) => packs[id]?.name ?? id)].join(" ").toLocaleLowerCase("fr");
    return (filters.type === "all" || item.type === filters.type)
      && (filters.category === "all" || item.category === filters.category)
      && (filters.ownership === "all" || (filters.ownership === "owned" ? owned : !owned))
      && terms.includes(search)
      && (item.rewardOnly ? (filters.tokens !== false || filters.koins !== false) && !filters.affordable && filters.maxPrice === "" : prices.get(item).some((quote) => quote.price <= budget && (!filters.affordable || quote.affordable)));
  }).sort((left, right) => {
    const lowest = (item) => item.rewardOnly ? 0 : Math.min(...prices.get(item).map((quote) => quote.price));
    const price = lowest(left) - lowest(right);
    return (filters.sort === "price-asc" ? price : filters.sort === "price-desc" ? -price : 0) || left.name.localeCompare(right.name, "fr");
  });
}

export function pricePack(items) {
  const subtotal = items.reduce((sum, item) => sum + Number(item.price), 0);
  const discount = Math.min(35, Math.max(0, items.length - 1) * 5);
  return { subtotal, discount, total: Math.ceil(subtotal * (100 - discount) / 100) };
}
