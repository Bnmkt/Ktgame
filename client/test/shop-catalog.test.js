import test from "node:test";
import assert from "node:assert/strict";
import { defaultCatalogFilters, filterShopItems, ownsShopItem, pricePack } from "../src/features/shop/catalog.js";

const user = { tokens: 100, cosmetics: { icons: ["owned"] } };
const items = [
  { id: "1", type: "icons", value: "owned", name: "Crown", category: "classic", price: 20, packs: ["neon"] },
  { id: "2", type: "diceSkins", value: "new", name: "Dés azur", description: "Bleu", category: "premium", price: 90, packs: ["neon"] },
  { id: "3", type: "icons", value: "new", name: "Chat", category: "classic", price: 200 },
  { id: "4", type: "icons", value: "reward", name: "Secret", category: "premium", price: 0, rewardOnly: true }
];
const filter = (changes = {}) => filterShopItems(items, user, { ...defaultCatalogFilters, ...changes }, { neon: { name: "Néon" } }).map((item) => item.id);
test("catalog hides acquired objects by default across items and collections", () => {
  assert.deepEqual(filter(), ["4", "2", "3"]);
  assert.deepEqual(filter({ ownership: "owned" }), ["1"]);
  assert.equal(ownsShopItem(user, items[0]), true);
  assert.deepEqual(filter({ ownership: "all", search: "néon" }), ["1", "2"]);
});
test("catalog combines type, range, budget, balance and sorting without changing source data", () => {
  assert.deepEqual(filter({ affordable: true }), ["2"]);
  assert.deepEqual(filter({ maxPrice: "80" }), []);
  assert.deepEqual(filter({ type: "diceSkins", category: "premium", search: "bleu" }), ["2"]);
  assert.deepEqual(filter({ sort: "price-desc" }), ["3", "2", "4"]);
  assert.deepEqual(filter({ sort: "name" }), ["3", "2", "4"]);
  assert.equal(items[0].id, "1");
});
test("pack pricing follows server discount and rounds upwards", () => {
  assert.deepEqual(pricePack([]), { subtotal: 0, discount: 0, total: 0 });
  assert.deepEqual(pricePack([{ price: 21 }, { price: 20 }]), { subtotal: 41, discount: 5, total: 39 });
  assert.equal(pricePack(Array.from({ length: 10 }, () => ({ price: 100 }))).discount, 35);
});
