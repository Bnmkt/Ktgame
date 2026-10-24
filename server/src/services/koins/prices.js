export function premiumShopFields(input, current = {}, admin = false) {
  if (!admin)
    return {
      tokenPriceEnabled: current.tokenPriceEnabled !== false,
      koinPrice: current.koinPrice ?? null,
    };
  const tokenPriceEnabled =
    input.tokenPriceEnabled === undefined
      ? current.tokenPriceEnabled !== false
      : input.tokenPriceEnabled === true;
  const koinPrice =
    input.koinPrice === undefined
      ? (current.koinPrice ?? null)
      : input.koinPrice;
  if (
    koinPrice !== null &&
    (!Number.isSafeInteger(koinPrice) ||
      koinPrice < 0 ||
      koinPrice > 1000000000)
  )
    throw Object.assign(Error("Prix Koins invalide."), { code: "KOINS_PRICE" });
  if (!tokenPriceEnabled && koinPrice === null)
    throw Object.assign(Error("Choisis au moins une monnaie pour cet objet."), {
      code: "KOINS_PRICE",
    });
  return { tokenPriceEnabled, koinPrice };
}
