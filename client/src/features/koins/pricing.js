import { pricePack } from "../shop/catalog.js";

export function cosmeticPrice(item, currency = "tokens") {
  if (!["tokens", "koins"].includes(currency)) return null;
  if (currency === "koins")
    return Number.isSafeInteger(item.koinPrice) && item.koinPrice >= 0
      ? item.koinPrice
      : null;
  return item.tokenPriceEnabled === false
    ? null
    : Math.max(0, Math.floor(Number(item.price) || 0));
}
export function cosmeticPackPrice(items, currency = "tokens") {
  const prices = items.map((item) => cosmeticPrice(item, currency));
  if (prices.some((value) => value === null)) return null;
  return { currency, ...pricePack(prices.map((price) => ({ price }))) };
}
