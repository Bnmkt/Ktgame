import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { defaultCosmetics } from "../src/services/account-domain.js";
import { mascotGiftPacks, mascotPackPreview } from "../../client/src/features/shop/mascot-gift.js";
import { claimMascotGift, registerMascotGiftRoutes, syncMascotPackOwners } from "../src/services/mascot-gift.js";

const normalize = (value = {}) => ({ ...structuredClone(defaultCosmetics), ...structuredClone(value), equipped: { ...defaultCosmetics.equipped, ...value.equipped } });
const catalog = [
  { id: "owl", type: "icons", value: "owl", packs: ["lucky"], packName: "Lucky" },
  { id: "owl-2", type: "icons", value: "owl-2", packs: ["lucky"], rewardOnly: true },
  { id: "dice", type: "diceSkins", value: "owl-dice", packs: ["lucky"] },
  { id: "fox", type: "icons", value: "fox", packs: ["midnight"] },
  { id: "paid", type: "icons", value: "paid", packs: ["royal"] }
];

test("new and existing players receive a whole mascot pack without spending or equipping", () => {
  for (const user of [{ id: "new", tokens: 100 }, { id: "existing", tokens: 50000, cosmetics: normalize({ icons: ["chip", "owl"], equipped: { icon: "chip" } }) }]) {
    const tokens = user.tokens;
    const result = claimMascotGift(user, "lucky", catalog, normalize, "2026-10-23T15:00:00Z");
    assert.equal(result.status, "claimed");
    assert.equal(user.tokens, tokens);
    assert.deepEqual(user.cosmetics.icons, ["chip", "owl", "owl-2"]);
    assert.ok(user.cosmetics.diceSkins.includes("owl-dice"));
    assert.equal(user.cosmetics.equipped.icon, "chip");
    assert.deepEqual(user.mascotGift, { packId: "lucky", claimedAt: "2026-10-23T15:00:00Z" });
  }
});

test("retries are idempotent, a second choice is rejected and guests cannot claim", () => {
  const user = { id: "one", tokens: 123 };
  claimMascotGift(user, "lucky", catalog, normalize);
  const original = structuredClone(user);
  assert.equal(claimMascotGift(user, "lucky", catalog, normalize).status, "claimed");
  assert.deepEqual(user, original);
  assert.equal(claimMascotGift(user, "midnight", catalog, normalize).status, "conflict");
  assert.deepEqual(user, original);
  assert.equal(claimMascotGift({ guest: true }, "lucky", catalog, normalize).status, "forbidden");
  for (const invalid of ["royal", "__proto__", "unknown"]) assert.equal(claimMascotGift({ id: "u" }, invalid, catalog, normalize).status, "invalid");
});

test("new collection objects are granted once, only to owners of that welcome collection", () => {
  const lucky = { id: "lucky", tokens: 500 }, midnight = { id: "fox", tokens: 100 }, other = { id: "other" };
  claimMascotGift(lucky, "lucky", catalog, normalize);
  claimMascotGift(midnight, "midnight", catalog, normalize);
  const next = [...catalog, { id: "future", type: "cardSkins", value: "future", packs: ["lucky"] }];
  const db = { users: [lucky, midnight, other] };
  assert.equal(syncMascotPackOwners(db, next, normalize), 1);
  assert.deepEqual(lucky.cosmetics.cardSkins, ["default", "future"]);
  assert.deepEqual(midnight.cosmetics.cardSkins, ["default"]);
  assert.equal(other.cosmetics, undefined);
  assert.equal(syncMascotPackOwners(db, next, normalize), 0);
  assert.equal(lucky.tokens, 500);
});

test("previews combine the entire pack without modifying the real inventory", () => {
  const packs = mascotGiftPacks(catalog);
  assert.deepEqual(packs.map((pack) => pack.id), ["lucky", "midnight"]);
  const user = { id: "u", cosmetics: normalize() }, original = structuredClone(user);
  const preview = mascotPackPreview(user, packs[0].items);
  assert.equal(preview.cosmetics.equipped.icon, "owl");
  assert.equal(preview.cosmetics.equipped.diceSkin, "owl-dice");
  assert.deepEqual(user, original);
});

test("authenticated endpoints validate the choice and return the durable claim on later logins", async () => {
  const db = { users: [{ id: "registered", tokens: 1000 }] };
  const app = express(); app.use(express.json());
  const auth = (req, _res, next) => { req.auth = { id: "registered", guest: req.headers["x-test-guest"] === "true" }; next(); };
  registerMascotGiftRoutes({ app, auth, readDb: () => db, updateDb: (change) => change(db), configuredShop: () => catalog, normalizeCosmetics: normalize, sanitizeUser: (user) => ({ id: user.id, tokens: user.tokens, cosmetics: user.cosmetics }) });
  const server = createServer(app); await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/me/mascot-gift`;
  try {
    let response = await fetch(url); assert.equal(response.headers.get("cache-control"), "no-store"); assert.equal((await response.json()).claim, null);
    const post = (packId) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ packId }) });
    response = await post("royal"); assert.equal(response.status, 400); await response.json();
    response = await post("lucky"); assert.equal(response.status, 200); assert.equal((await response.json()).user.tokens, 1000);
    response = await post("midnight"); assert.equal(response.status, 409); await response.json();
    response = await fetch(url); const state = await response.json(); assert.equal(state.claim.packId, "lucky"); assert.deepEqual(state.packs, []);
    response = await fetch(url, { headers: { "x-test-guest": "true" } }); assert.equal(response.status, 403); await response.json();
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
