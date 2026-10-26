import test from "node:test";
import assert from "node:assert/strict";
import { defaultCatalogFilters, filterShopItems, ownsShopItem, pricePack } from "../src/features/shop/catalog.js";
import { itemPurchaseOptions, packPurchaseOptions } from "../src/features/shop/purchase-options.js";

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

const wallet = { balance: 30, blocked: false, config: { shopEnabled: true } };
const dualItem = { ...items[1], price: 200, koinPrice: 20 };
const currencyFilter = (rows, changes = {}, state = wallet) => {
  const filters = { ...defaultCatalogFilters, ...changes };
  return filterShopItems(rows, user, filters, {}, (item) => itemPurchaseOptions(item, user, state).filter((option) => filters[option.currency])).map((item) => item.id);
};

test("same item quotes both currencies against their own balances and never rebuy owned items", () => {
  assert.deepEqual(itemPurchaseOptions(dualItem, user, wallet), [
    { currency: "tokens", price: 200, affordable: false, purchasable: false },
    { currency: "koins", price: 20, affordable: true, purchasable: true },
  ]);
  assert.ok(itemPurchaseOptions({ ...items[0], koinPrice: 2 }, user, wallet).every((option) => !option.purchasable));
  assert.deepEqual(itemPurchaseOptions({ ...dualItem, rewardOnly: true }, user, wallet), []);
  assert.deepEqual(itemPurchaseOptions({ ...dualItem, tokenPriceEnabled: false }, user, wallet).map((option) => option.currency), ["koins"]);
  assert.deepEqual(itemPurchaseOptions(dualItem, user, { ...wallet, config: { shopEnabled: false } }).map((option) => option.currency), ["tokens"]);
  assert.equal(itemPurchaseOptions({ ...dualItem, koinPrice: 0 }, user, { ...wallet, blocked: true })[1].purchasable, false);
});

test("currency checkboxes, budget and affordability all match the same quote", () => {
  const tokenItem = { ...items[2], price: 50 };
  const koinItem = { ...items[0], id: "koin", value: "new", tokenPriceEnabled: false, koinPrice: 60 };
  assert.deepEqual(currencyFilter([dualItem, tokenItem, koinItem]), ["2", "3", "koin"]);
  assert.deepEqual(currencyFilter([dualItem, tokenItem, koinItem], { koins: false }), ["3", "2"]);
  assert.deepEqual(currencyFilter([dualItem, tokenItem, koinItem], { tokens: false }), ["2", "koin"]);
  assert.deepEqual(currencyFilter([dualItem, tokenItem, koinItem], { affordable: true }), ["2", "3"]);
  assert.deepEqual(currencyFilter([dualItem], { maxPrice: "30", affordable: true }), ["2"]);
  assert.deepEqual(currencyFilter([{ ...dualItem, price: 50, koinPrice: 40 }], { maxPrice: "40", affordable: true }), []);
  assert.deepEqual(currencyFilter([dualItem, tokenItem, items[3]], { tokens: false, koins: false }), []);
  assert.deepEqual(currencyFilter([dualItem], { tokens: false }, { ...wallet, config: { shopEnabled: false } }), []);
});

test("pack quotes preserve discounts in each currency and reject mixed unavailable currencies", () => {
  const second = { ...items[2], price: 20, koinPrice: 5 };
  const quotes = packPurchaseOptions([dualItem, second], user, wallet);
  assert.deepEqual(quotes[0], { currency: "tokens", pricing: { currency: "tokens", subtotal: 220, discount: 5, total: 209 }, purchasable: false });
  assert.deepEqual(quotes[1], { currency: "koins", pricing: { currency: "koins", subtotal: 25, discount: 5, total: 24 }, purchasable: true });
  assert.equal(packPurchaseOptions([dualItem, second], user, { ...wallet, blocked: true })[1].purchasable, false);
  assert.equal(packPurchaseOptions([dualItem, { ...second, koinPrice: null }], user, wallet)[1].pricing, null);
  assert.ok(packPurchaseOptions([{ ...dualItem, tokenPriceEnabled: false }, { ...second, koinPrice: null }], user, wallet).every((option) => option.pricing === null && !option.purchasable));
  assert.ok(packPurchaseOptions([dualItem, items[0]], user, wallet).every((option) => !option.purchasable));
  assert.ok(packPurchaseOptions([], user, wallet).every((option) => !option.purchasable));
});
