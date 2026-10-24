import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import express from "express";
import Stripe from "stripe";
import { createKoinStore } from "../src/services/koins/store.js";
import {
  defaultKoinConfig,
  koinAccountAllowed,
  validateKoinConfig,
} from "../src/services/koins/config.js";
import { premiumShopFields } from "../src/services/koins/prices.js";
import {
  cosmeticPackPrice,
  cosmeticPrice,
} from "../../client/src/features/koins/pricing.js";
import {
  createKoinDelivery,
  koinReceiptPdf,
} from "../src/services/koins/documents.js";
import { createKoinProviders } from "../src/services/koins/providers.js";
import { registerKoinRoutes } from "../src/services/koins/routes.js";

const offer = {
  ...defaultKoinConfig.offers[0],
  discordSkuId: "123456789012345678",
};
const customer = { name: "Joueur", email: "player@example.org" };
const issuer = { administrativeEmail: "office@example.org" };
function fixture(t) {
  const db = new DatabaseSync(":memory:"),
    store = createKoinStore(db);
  t.after(() => db.close());
  return { db, store };
}
function paid(store, overrides = {}) {
  const order = store.createOrder("one", "stripe", offer, {
    test: true,
    customer,
    issuer,
    ...overrides,
  });
  const proof = {
    provider: "stripe",
    amountCents: 100,
    currency: "eur",
    test: true,
    providerRef: `cs_${order.id}`,
    paymentRef: `pi_${order.id}`,
  };
  return { order, proof };
}

test("defaults disable every premium feature and real sales require validated billing", (t) => {
  const { store } = fixture(t);
  assert.equal(store.config().purchasesEnabled, false);
  assert.equal(store.config().shopEnabled, false);
  assert.equal(store.config().codesEnabled, false);
  assert.deepEqual(
    store.config().offers.map((o) => [o.priceCents, o.quantity]),
    [
      [100, 25],
      [500, 150],
      [1500, 500],
    ],
  );
  assert.throws(
    () =>
      validateKoinConfig({
        ...defaultKoinConfig,
        billing: {
          ...defaultKoinConfig.billing,
          administrativeEmail: "office@example.org",
          contactEmail: "contact@example.org",
        },
        purchasesEnabled: true,
        testMode: false,
      }),
    /activité déclarée/,
  );
  assert.equal(
    validateKoinConfig({
      ...defaultKoinConfig,
      billing: {
        ...defaultKoinConfig.billing,
        administrativeEmail: "office@example.org",
        contactEmail: "contact@example.org",
      },
      purchasesEnabled: true,
    }).testMode,
    true,
  );
});
test("paid eligibility rejects minors, invalid dates, guests and restricted accounts", () => {
  const adult = { profile: { birthDate: "2000-10-23" } },
    now = Date.parse("2026-10-23T12:00:00Z");
  assert.equal(koinAccountAllowed(adult, { purchase: true, now }), true);
  for (const user of [
    { ...adult, guest: true },
    { ...adult, active: false },
    { ...adult, minor: { restricted: true } },
    { profile: { birthDate: "2008-10-24" } },
    { profile: { birthDate: "2000-02-31" } },
    {},
  ])
    assert.equal(koinAccountAllowed(user, { purchase: true, now }), false);
  assert.equal(
    koinAccountAllowed({ profile: { birthDate: "2011-01-01" } }),
    true,
  );
});
test("custom artwork accepts only canonical media URLs and descriptions remain plain text", () => {
  const config = structuredClone(defaultKoinConfig);
  config.iconImage = `/api/media/${"a".repeat(64)}.png`;
  config.offers[0].image = config.iconImage;
  config.offers[0].description = "Une offre\nsur deux lignes.";
  const saved = validateKoinConfig(config);
  assert.equal(saved.iconImage, config.iconImage);
  assert.equal(saved.offers[0].description, config.offers[0].description);
  for (const bad of [
    "javascript:alert(1)",
    "https://example.com/a.png",
    "/api/media/../secret",
    "data:image/svg+xml,xxx",
  ])
    assert.throws(() => validateKoinConfig({ ...config, iconImage: bad }));
});
test("single-use codes are hashed, global and atomic; redeemed codes cannot be replayed", (t) => {
  const { store, db } = fixture(t),
    result = store.generate({ amount: 75, count: 2, label: "Test" });
  assert.equal(new Set(result.codes).size, 2);
  assert.match(result.codes[0], /^KTGA-/);
  assert.ok(
    !JSON.stringify(db.prepare("SELECT * FROM koin_codes").all()).includes(
      result.codes[0],
    ),
  );
  const receipt = store.redeem("one", result.codes[0].toLowerCase(), {
    customer,
    issuer,
  });
  assert.equal(receipt.amountCents, 0);
  assert.equal(store.wallet("one").balance, 75);
  assert.throws(() => store.redeem("two", result.codes[0]), /indisponible/);
  assert.equal(store.wallet("two").balance, 0);
  assert.equal(store.ledger("one").length, 1);
  assert.throws(() =>
    store.generate({ amount: 1, count: 1, expiresAt: "2020-01-01" }),
  );
  assert.throws(() => store.generate({ amount: 1, count: 501 }));
});
test("expired codes do not credit a wallet", (t) => {
  const { db, store } = fixture(t),
    { codes } = store.generate({ amount: 1, count: 1 });
  db.exec("UPDATE koin_codes SET expires_at='2020-01-01'");
  assert.throws(() => store.redeem("one", codes[0]));
  assert.equal(store.ledger("one").length, 0);
});
test("only matching provider proofs credit once, including after service recreation", (t) => {
  const { db, store } = fixture(t),
    { order, proof } = paid(store);
  assert.equal(store.hasUnsettledPayment("one"), true);
  for (const field of [
    { amountCents: 99 },
    { provider: "discord" },
    { currency: "usd" },
    { test: false },
  ])
    assert.throws(() => store.complete(order.id, { ...proof, ...field }));
  store.complete(order.id, proof);
  assert.equal(store.hasUnsettledPayment("one"), false);
  store.complete(order.id, proof);
  createKoinStore(db).complete(order.id, proof);
  assert.equal(store.wallet("one").balance, 25);
  assert.equal(store.ledger("one").length, 1);
  assert.equal(store.pendingJobs().length, 1);
  assert.throws(() =>
    store.complete(order.id, { ...proof, providerRef: "foreign_session" }),
  );
  const second = paid(store);
  assert.throws(() => store.complete(second.order.id, proof));
  assert.equal(store.wallet("one").balance, 25);
});
test("a purchase's wallet and inventory rollback together", (t) => {
  const { db, store } = fixture(t),
    { codes } = store.generate({ amount: 25, count: 1 });
  store.redeem("one", codes[0]);
  db.exec("CREATE TABLE inventory(item TEXT UNIQUE)");
  assert.throws(() =>
    store.atomic(() => {
      db.exec("INSERT INTO inventory VALUES('card')");
      store.spend("one", 30, "buy:card", ["card"]);
    }),
  );
  assert.equal(db.prepare("SELECT COUNT(*) n FROM inventory").get().n, 0);
  assert.equal(store.wallet("one").balance, 25);
  store.atomic(() => {
    store.spend("one", 10, "buy:card", ["card"]);
    db.exec("INSERT INTO inventory VALUES('card')");
  });
  assert.equal(store.wallet("one").balance, 15);
  assert.throws(() =>
    store.atomic(() => {
      store.spend("one", 10, "buy:second", ["card"]);
      db.exec("INSERT INTO inventory VALUES('card')");
    }),
  );
  assert.equal(store.wallet("one").balance, 15);
});
test("cumulative and out-of-order refunds revoke once, even when Koins were spent", (t) => {
  const { store } = fixture(t),
    { order, proof } = paid(store);
  store.reverse(order.id, 40);
  store.complete(order.id, proof);
  assert.equal(store.wallet("one").balance, 15);
  store.atomic(() => store.spend("one", 15, "cosmetics:one", ["card"]));
  store.reverse(order.id, 100);
  store.reverse(order.id, 40);
  store.reverse(order.id, 100);
  assert.equal(store.wallet("one").balance, -15);
  assert.equal(store.order(order.id).revokedKoins, 25);
  assert.equal(store.order(order.id).refundedCents, 100);
  assert.throws(() =>
    store.atomic(() => store.spend("one", 1, "cosmetics:two", ["die"])),
  );
});
test("disputes suspend spending until every hold is cleared", (t) => {
  const { store } = fixture(t),
    first = paid(store),
    second = paid(store);
  store.complete(first.order.id, first.proof);
  store.complete(second.order.id, second.proof);
  store.setDispute(first.order.id, true);
  store.setDispute(second.order.id, true);
  store.setDispute(first.order.id, false);
  assert.equal(store.wallet("one").blocked, true);
  assert.throws(() => store.atomic(() => store.spend("one", 1, "held", [])));
  store.setDispute(second.order.id, false);
  assert.equal(store.wallet("one").blocked, false);
});
test("Discord SKU mappings are immutable and refunds cannot create duplicate debits", (t) => {
  const { store } = fixture(t);
  const config = structuredClone(defaultKoinConfig);
  config.offers[0] = offer;
  store.saveConfig(config);
  assert.throws(
    () => store.saveConfig({ ...config, offers: [{ ...offer, quantity: 26 }] }),
    /nouveau SKU/,
  );
  store.saveConfig({ ...config, offers: [] });
  assert.equal(store.sku(offer.discordSkuId).quantity, 25);
  const order = store.createOrder("one", "discord", offer, {
    test: true,
    providerRef: "discord-1",
    amountCents: 0,
    amountKnown: false,
    currency: "",
  });
  store.complete(order.id, {
    provider: "discord",
    providerRef: "discord-1",
    test: true,
    amountCents: 0,
    currency: "",
  });
  store.revokeDiscord(order.id);
  store.revokeDiscord(order.id);
  assert.equal(store.wallet("one").balance, 0);
  assert.equal(store.ledger("one").length, 2);
  assert.equal(store.statistics()[0].cents, null);
});
test("currency rules preserve Jetons pricing and disallow mixed-currency packs", () => {
  const items = [
    { price: 100, koinPrice: 10 },
    { price: 100, koinPrice: 20 },
  ];
  assert.equal(cosmeticPackPrice(items, "tokens").total, 190);
  assert.equal(cosmeticPackPrice(items, "koins").total, 29);
  assert.equal(cosmeticPackPrice([...items, { price: 10 }], "koins"), null);
  assert.equal(cosmeticPrice({ price: 10, tokenPriceEnabled: false }), null);
  assert.throws(() =>
    premiumShopFields({ tokenPriceEnabled: false, koinPrice: null }, {}, true),
  );
  assert.deepEqual(
    premiumShopFields(
      { koinPrice: 1, tokenPriceEnabled: false },
      { koinPrice: 200 },
      false,
    ),
    { koinPrice: 200, tokenPriceEnabled: true },
  );
});
test("document numbers and PDFs are immutable; failed mail delivery retries without crediting again", async (t) => {
  const { store } = fixture(t),
    { codes } = store.generate({ amount: 25, count: 1 });
  const order = store.redeem("one", codes[0], { customer, issuer });
  let fail = true,
    sent = 0;
  const delivery = createKoinDelivery({
    store,
    providers: {},
    getUser: () => ({}),
    send: async (mail) => {
      assert.ok(
        mail.attachments[0].content.subarray(0, 5).equals(Buffer.from("%PDF-")),
      );
      if (fail) throw Error("SMTP indisponible");
      sent++;
    },
  });
  t.after(() => delivery.close());
  await delivery.run();
  assert.equal(store.documents("one").length, 1);
  await delivery.run();
  assert.equal(
    store.mailLog().filter((row) => row.status === "failed").length,
    2,
  );
  const document = store.documents("one")[0],
    original = Buffer.from(store.document(document.id).body);
  store.saveDocument(
    `order:${order.id}`,
    "one",
    { altered: true },
    Buffer.from("replacement"),
  );
  assert.deepEqual(Buffer.from(store.document(document.id).body), original);
  fail = false;
  for (const job of store.jobs().filter((row) => row.kind === "email"))
    store.retry(job.id);
  await delivery.run();
  assert.equal(sent, 2);
  assert.equal(store.wallet("one").balance, 25);
  assert.equal(store.documents("one").length, 1);
  assert.equal(
    store.reserveDocumentNumber(`order:${order.id}`),
    document.number,
  );
  assert.notEqual(store.reserveDocumentNumber("next-event"), document.number);
});
test("Stripe invoice and credit-note PDFs are obtained from the provider, not regenerated", async (t) => {
  const { store } = fixture(t),
    { order, proof } = paid(store);
  store.complete(order.id, proof);
  const body = await koinReceiptPdf({ number: "provider-test", order });
  const providers = {
    session: async () => ({
      invoice: {
        number: "INV-1",
        status: "paid",
        invoice_pdf: "https://pay.stripe.com/a",
        total: 100,
        subtotal_excluding_tax: 83,
        currency: "eur",
      },
    }),
    invoicePdf: async () => body,
    creditNote: async () => ({
      number: "CN-1",
      pdf: "https://pay.stripe.com/b",
      total: 100,
    }),
  };
  const delivery = createKoinDelivery({
    store,
    providers,
    getUser: () => ({}),
    send: async () => {},
  });
  t.after(() => delivery.close());
  await delivery.run();
  store.job("credit-note:1", "document", order.id, {
    eventKey: "credit-note:1",
    creditNoteId: "cn_1",
    refund: true,
  });
  await delivery.run();
  const documents = store.documents("one");
  assert.ok(
    documents.some(
      (row) =>
        row.kind === "provider_invoice" && row.providerNumber === "INV-1",
    ),
  );
  assert.ok(
    documents.some(
      (row) =>
        row.kind === "provider_credit_note" && row.providerNumber === "CN-1",
    ),
  );
});
test("Stripe signatures and PDF host/content restrictions reject forgery and SSRF", async () => {
  const secret = "whsec_testing_only",
    stripe = new Stripe("sk_test_placeholder");
  const providers = createKoinProviders({
    environment: {
      STRIPE_SECRET_KEY: "sk_test_placeholder",
      STRIPE_WEBHOOK_SECRET: secret,
    },
    fetcher: async () =>
      new Response("not a PDF", {
        headers: { "content-type": "application/pdf" },
      }),
  });
  const payload = JSON.stringify({ id: "evt_1", type: "test" }),
    header = stripe.webhooks.generateTestHeaderString({ payload, secret });
  assert.equal(providers.stripeEvent(Buffer.from(payload), header).id, "evt_1");
  assert.throws(() =>
    providers.stripeEvent(Buffer.from(payload + " "), header),
  );
  for (const url of [
    "http://127.0.0.1/private",
    "https://pay.stripe.com.evil.org/a",
    "https://x@pay.stripe.com/a",
  ])
    await assert.rejects(providers.invoicePdf({ invoice_pdf: url }));
  await assert.rejects(
    providers.invoicePdf({ invoice_pdf: "https://pay.stripe.com/a" }),
    /invalide/,
  );
});

async function httpFixture(t) {
  const { store } = fixture(t),
    app = express();
  app.use(
    "/api/koins/stripe/webhook",
    express.raw({ type: "application/json" }),
  );
  app.use(express.json());
  const users = {
    one: {
      id: "one",
      email: customer.email,
      emailVerifiedAt: "now",
      profile: { birthDate: "1990-01-01" },
      discord: { id: "123456789012345679" },
    },
    minor: {
      id: "minor",
      email: customer.email,
      profile: { birthDate: "2012-01-01" },
    },
    admin: { id: "admin", admin: true },
  };
  let entitlements = [],
    event = null;
  const providers = {
    sku: async (id) => ({ id, type: 3, application_id: "123456789012345677" }),
    available: { stripe: true, discord: true },
    stripeEvent: () => {
      if (!event) throw Error("signature");
      return event;
    },
    entitlements: async () => entitlements,
    entitlement: async (id) => entitlements.find((row) => row.id === id),
    consume: async () => {},
    checkout: async (order) => ({
      id: `cs_${order.id}`,
      url: "https://checkout.stripe.com/test",
    }),
  };
  const auth = (req, res, next) => {
    const user = users[req.get("x-user") || "one"];
    if (!user) return res.sendStatus(401);
    req.auth = { id: user.id };
    next();
  };
  const delivery = registerKoinRoutes({
    app,
    auth,
    requireAdmin: (req, res, next) =>
      users[req.auth.id].admin ? next() : res.sendStatus(403),
    store,
    providers,
    getUser: (id) => users[id],
    shopAccess: () => true,
    website: () => "https://www.ktga.me",
    environment: { DISCORD_CLIENT_ID: "123456789012345677" },
    sendEmail: async () => {},
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(async () => {
    delivery.close();
    await new Promise((resolve) => server.close(resolve));
  });
  const request = (path, body, user = "one") =>
    fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", "x-user": user },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  return {
    store,
    users,
    request,
    providers,
    setEvent: (value) => {
      event = value;
    },
    setEntitlements: (value) => {
      entitlements = value;
    },
  };
}
test("HTTP permissions protect finances and documents; paid minors and disabled codes are rejected", async (t) => {
  const { request, store } = await httpFixture(t);
  assert.equal((await request("/api/admin/monetization")).status, 403);
  assert.equal(
    (
      await request(
        "/api/me/koins/checkout",
        { provider: "stripe", offerId: offer.id, acceptedTerms: true },
        "minor",
      )
    ).status,
    400,
  );
  assert.equal(
    (await request("/api/me/koins/redeem", { code: "fake" })).status,
    400,
  );
  const { codes } = store.generate({ amount: 1, count: 1 });
  store.redeem("one", codes[0]);
  const number = store.reserveDocumentNumber("private"),
    id = store.saveDocument("private", "one", {}, Buffer.from("%PDF-test"));
  assert.ok(number);
  assert.equal(
    (await request(`/api/me/koins/documents/${id}`, undefined, "minor")).status,
    404,
  );
  assert.equal((await request(`/api/me/koins/documents/${id}`)).status, 200);
  assert.equal(
    (
      await request(
        `/api/admin/monetization/documents/${id}`,
        undefined,
        "admin",
      )
    ).status,
    200,
  );
});
test("HTTP Checkout and browser return do not credit; verified webhook delivery is idempotent", async (t) => {
  const { request, store, setEvent, users } = await httpFixture(t);
  users.one.admin = true;
  store.saveConfig({
    ...defaultKoinConfig,
    billing: {
      ...defaultKoinConfig.billing,
      administrativeEmail: "office@example.org",
      contactEmail: "contact@example.org",
    },
    purchasesEnabled: true,
  });
  const response = await request("/api/me/koins/checkout", {
    provider: "stripe",
    offerId: offer.id,
    acceptedTerms: true,
  });
  assert.equal(response.status, 200);
  const checkout = await response.json();
  assert.equal(store.wallet("one").balance, 0);
  assert.equal((await request("/api/koins/stripe/webhook", {})).status, 400);
  setEvent({
    type: "checkout.session.completed",
    livemode: false,
    data: {
      object: {
        id: `cs_${checkout.orderId}`,
        payment_status: "paid",
        metadata: { ktga_order: checkout.orderId },
        amount_total: 100,
        currency: "eur",
      },
    },
  });
  assert.equal((await request("/api/koins/stripe/webhook", {})).status, 200);
  assert.equal((await request("/api/koins/stripe/webhook", {})).status, 200);
  assert.equal(store.wallet("one").balance, 25);
});
test("Discord server checks ownership, SKU and test types; repeated sync cannot double-credit", async (t) => {
  const { request, store, users, setEntitlements } = await httpFixture(t);
  users.one.admin = true;
  store.saveConfig({ ...defaultKoinConfig, offers: [offer] });
  const entitlement = {
    id: "123456789012345680",
    application_id: "123456789012345677",
    user_id: users.one.discord.id,
    sku_id: offer.discordSkuId,
    type: 4,
    consumed: false,
    deleted: false,
  };
  setEntitlements([{ ...entitlement, user_id: "foreign" }]);
  await request("/api/me/koins/discord/sync", {});
  assert.equal(store.wallet("one").balance, 0);
  setEntitlements([entitlement]);
  assert.equal((await request("/api/me/koins/discord/sync", {})).status, 200);
  await request("/api/me/koins/discord/sync", {});
  assert.equal(store.wallet("one").balance, 25);
  setEntitlements([{ ...entitlement, deleted: true }]);
  await request("/api/me/koins/discord/sync", {});
  assert.equal(store.wallet("one").balance, 0);
});

test("refund and dispute webhooks reconcile current provider state despite event reordering", async (t) => {
  const { request, store, setEvent, providers } = await httpFixture(t),
    { order, proof } = paid(store);
  store.complete(order.id, proof);
  providers.dispute = async () => ({ status: "won" });
  const event = (type, object) => ({
    type,
    livemode: false,
    data: { object: { payment_intent: proof.paymentRef, ...object } },
  });
  setEvent(
    event("charge.dispute.created", { id: "dp_1", status: "needs_response" }),
  );
  assert.equal((await request("/api/koins/stripe/webhook", {})).status, 200);
  assert.equal(store.wallet("one").blocked, false);
  providers.dispute = async () => ({ status: "needs_response" });
  setEvent(event("charge.dispute.updated", { id: "dp_1" }));
  await request("/api/koins/stripe/webhook", {});
  assert.equal(store.wallet("one").blocked, true);
  providers.dispute = async () => ({ status: "lost" });
  setEvent(event("charge.dispute.closed", { id: "dp_1" }));
  await request("/api/koins/stripe/webhook", {});
  await request("/api/koins/stripe/webhook", {});
  assert.equal(store.wallet("one").balance, 0);
  setEvent(event("charge.refunded", { amount_refunded: 100 }));
  await request("/api/koins/stripe/webhook", {});
  assert.equal(store.wallet("one").balance, 0);
  assert.equal(
    store.ledger("one").filter((row) => row.reason === "refund").length,
    1,
  );
});

test("an unknown non-consumable Discord SKU never credits Koins", async (t) => {
  const { request, store, users, providers, setEntitlements } =
    await httpFixture(t);
  users.one.admin = true;
  store.saveConfig({ ...defaultKoinConfig, offers: [offer] });
  providers.sku = async () => ({
    id: offer.discordSkuId,
    type: 2,
    application_id: "123456789012345677",
  });
  setEntitlements([
    {
      id: "123456789012345680",
      application_id: "123456789012345677",
      user_id: users.one.discord.id,
      sku_id: offer.discordSkuId,
      type: 4,
      deleted: false,
      consumed: false,
    },
  ]);
  await request("/api/me/koins/discord/sync", {});
  assert.equal(store.wallet("one").balance, 0);
});

test("a Checkout response cannot overwrite a payment confirmed during the provider request", async (t) => {
  const { request, store, users, providers } = await httpFixture(t);
  users.one.admin = true;
  store.saveConfig({
    ...defaultKoinConfig,
    purchasesEnabled: true,
    billing: {
      ...defaultKoinConfig.billing,
      administrativeEmail: "office@example.org",
      contactEmail: "contact@example.org",
    },
  });
  providers.checkout = async (order) => {
    store.complete(order.id, {
      provider: "stripe",
      providerRef: `cs_${order.id}`,
      amountCents: 100,
      currency: "eur",
      test: true,
    });
    return { id: `cs_${order.id}`, url: "https://checkout.stripe.com/test" };
  };
  const response = await request("/api/me/koins/checkout", {
    provider: "stripe",
    offerId: offer.id,
    acceptedTerms: true,
  });
  assert.equal(response.status, 200);
  const row = await response.json();
  assert.equal(store.order(row.orderId).credited, true);
  assert.equal(store.wallet("one").balance, 25);
});
