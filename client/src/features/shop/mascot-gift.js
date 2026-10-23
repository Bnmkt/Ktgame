import { mascotSources } from "../mascots/catalog.js";
import { shopPackName } from "../../utils/shop-packs.js";

export const mascotEquippedKeys = { icons: "icon", nameEffects: "nameEffect", memberCards: "memberCard", profileBanners: "profileBanner", profileFrames: "profileFrame", profileEffects: "profileEffect", diceSkins: "diceSkin", cardSkins: "cardSkin" };

export function mascotGiftPacks(catalog) {
  return Object.keys(mascotSources).flatMap((id) => {
    const items = catalog.filter((item) => item.packs?.includes(id) && Object.hasOwn(mascotEquippedKeys, item.type) && typeof item.value === "string" && item.value);
    return items.length ? [{ id, name: shopPackName(id, items[0]), items }] : [];
  });
}

export function mascotPackPreview(user, items) {
  const equipped = { ...user.cosmetics?.equipped };
  const chosen = new Set();
  for (const item of items) {
    if (!Object.hasOwn(mascotEquippedKeys, item.type) || chosen.has(item.type)) continue;
    chosen.add(item.type);
    equipped[mascotEquippedKeys[item.type]] = item.value;
  }
  return { ...user, cosmetics: { ...user.cosmetics, equipped } };
}
