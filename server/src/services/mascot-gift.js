import { mascotGiftPacks } from "../../../client/src/features/shop/mascot-gift.js";

function grantItems(user, items, normalizeCosmetics) {
  const cosmetics = normalizeCosmetics(user.cosmetics);
  let added = 0;
  for (const item of items) {
    if (!cosmetics[item.type].includes(item.value)) { cosmetics[item.type].push(item.value); added++; }
  }
  if (added) user.cosmetics = cosmetics;
  return added;
}

export function claimMascotGift(user, packId, catalog, normalizeCosmetics, now = new Date().toISOString()) {
  if (!user || user.guest) return { status: "forbidden" };
  if (user.mascotGift?.packId) return { status: user.mascotGift.packId === packId ? "claimed" : "conflict", user };
  const pack = mascotGiftPacks(catalog).find((entry) => entry.id === packId);
  if (!pack) return { status: "invalid" };
  const added = grantItems(user, pack.items, normalizeCosmetics);
  user.mascotGift = { packId, claimedAt: now };
  return { status: "claimed", user, added };
}

export function syncMascotPackOwners(db, catalog, normalizeCosmetics) {
  const packs = new Map(mascotGiftPacks(catalog).map((pack) => [pack.id, pack.items]));
  let added = 0;
  for (const user of db.users) {
    const items = !user.guest && packs.get(user.mascotGift?.packId);
    if (items) added += grantItems(user, items, normalizeCosmetics);
  }
  return added;
}

export function registerMascotGiftRoutes({ app, auth, readDb, updateDb, configuredShop, normalizeCosmetics, sanitizeUser }) {
  app.get("/api/me/mascot-gift", auth, (req, res) => {
    res.set("Cache-Control", "no-store");
    const user = readDb().users.find((entry) => entry.id === req.auth.id);
    if (!user || user.guest || req.auth.guest) return res.status(403).json({ error: "Ce cadeau est réservé aux comptes enregistrés." });
    res.json({ claim: user.mascotGift ?? null, packs: user.mascotGift?.packId ? [] : mascotGiftPacks(configuredShop()) });
  });
  app.post("/api/me/mascot-gift", auth, (req, res) => {
    if (req.auth.guest) return res.status(403).json({ error: "Ce cadeau est réservé aux comptes enregistrés." });
    const packId = typeof req.body?.packId === "string" ? req.body.packId : "";
    const result = updateDb((db) => claimMascotGift(db.users.find((entry) => entry.id === req.auth.id), packId, configuredShop(db), normalizeCosmetics), { users: [req.auth.id], rooms: [], settings: false });
    if (result.status === "forbidden") return res.status(403).json({ error: "Ce cadeau est réservé aux comptes enregistrés." });
    if (result.status === "invalid") return res.status(400).json({ error: "Ce pack de mascotte n’est pas disponible." });
    if (result.status === "conflict") return res.status(409).json({ error: "Tu as déjà choisi ton pack de mascotte." });
    res.json({ user: sanitizeUser(result.user), claim: result.user.mascotGift });
  });
}
