import { cosmeticPackPrice, cosmeticPrice } from "../koins/pricing.js";
import { ownsShopItem } from "./catalog.js";

// A quote always keeps its own currency and balance: no implicit conversion.
export function itemPurchaseOptions(item, user, wallet) {
  if (item.rewardOnly) return [];
  return ["tokens", ...(wallet.config.shopEnabled ? ["koins"] : [])].flatMap((currency) => {
    const price = cosmeticPrice(item, currency);
    if (price === null) return [];
    const balance = currency === "koins" ? wallet.balance : user.tokens;
    const affordable = !(currency === "koins" && wallet.blocked) && price <= Number(balance);
    return [{ currency, price, affordable, purchasable: affordable && !ownsShopItem(user, item) }];
  });
}

export function packPurchaseOptions(items, user, wallet) {
  const available = items.length > 0 && items.every((item) => !item.rewardOnly && !ownsShopItem(user, item));
  return ["tokens", ...(wallet.config.shopEnabled ? ["koins"] : [])].map((currency) => {
    const pricing = available ? cosmeticPackPrice(items, currency) : null;
    const balance = currency === "koins" ? wallet.balance : user.tokens;
    const purchasable = pricing !== null && !(currency === "koins" && wallet.blocked) && pricing.total <= Number(balance);
    return { currency, pricing, purchasable };
  });
}
