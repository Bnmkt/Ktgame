import rateLimit from "express-rate-limit";
import { koinAccountAllowed, validateKoinConfig } from "./config.js";
import { createKoinDelivery, koinReceiptPdf } from "./documents.js";
import { exchangeDiscordCode } from "../discord-oauth.js";

export function registerKoinRoutes({
  app,
  auth,
  requireAdmin,
  store,
  providers,
  getUser,
  shopAccess,
  website,
  environment = process.env,
  sendEmail,
  imageAllowed,
  getLogo = async () => null,
}) {
  const delivery = createKoinDelivery({
    store,
    providers,
    getUser,
    getLogo,
    ...(sendEmail ? { send: sendEmail } : {}),
  });
  const userFor = (req, purchase = false) => {
    const user = getUser(req.auth.id);
    if (!koinAccountAllowed(user, { purchase }) || !shopAccess(user))
      throw Error(
        purchase
          ? "Les achats payants nécessitent un compte majeur autorisé."
          : "Cette fonctionnalité n’est pas disponible pour ce compte.",
      );
    return user;
  };
  const details = (user) => ({
    customer: {
      name: user.profile?.displayName ?? user.pseudo,
      email: user.email,
    },
    issuer: structuredClone(store.config().billing),
    test: store.config().testMode,
    documentTemplate: structuredClone(store.config().documents),
  });
  const run = (handler) => async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    try {
      await handler(req, res);
    } catch (error) {
      res.status(error.status ?? 400).json({ error: error.message });
    }
  };
  const limited = rateLimit({
    windowMs: 15 * 60000,
    limit: 10,
    keyGenerator: (req) => req.auth.id,
    standardHeaders: true,
    legacyHeaders: false,
  });
  const publicOrder = (row) => ({
    id: row.id,
    provider: row.provider,
    status: row.status,
    createdAt: row.createdAt,
    koins: row.koins,
    amountCents: row.amountKnown === false ? null : row.amountCents,
    currency: row.currency,
    refundedCents: row.refundedCents ?? 0,
    offerName: row.offer?.name ?? row.campaign ?? "Code",
    test: row.test,
  });
  app.get("/api/koins/config", (_req, res) => {
    const config = store.config();
    res.set("Cache-Control", "no-store").json({
      iconImage: config.iconImage,
      shopEnabled: config.shopEnabled,
      purchasesEnabled: config.purchasesEnabled,
      codesEnabled: config.codesEnabled,
      testMode: config.testMode,
      termsUrl: config.billing.termsUrl,
      offers: config.offers
        .filter((row) => row.enabled)
        .sort((a, b) => a.position - b.position)
        .map((row) => ({
          ...row,
          methods: row.methods.filter((method) => providers.available[method]),
        })),
    });
  });
  app.get(
    "/api/me/koins",
    auth,
    run((req, res) => {
      userFor(req);
      res.json({
        ...store.wallet(req.auth.id),
        purchaseAllowed:
          (!store.config().testMode || Boolean(getUser(req.auth.id)?.admin)) &&
          koinAccountAllowed(getUser(req.auth.id), {
            purchase: true,
          }),
        transactions: store.ledger(req.auth.id, Number(req.query.offset) || 0),
        orders: store.orders({ userId: req.auth.id }).map(publicOrder),
        documents: store
          .documents(req.auth.id)
          .map(({ issuer, customer, ...row }) => row),
      });
    }),
  );
  app.post(
    "/api/me/koins/redeem",
    auth,
    limited,
    run((req, res) => {
      const user = userFor(req);
      if (!store.config().codesEnabled)
        throw Error("Les codes sont désactivés.");
      const receipt = store.redeem(user.id, req.body.code, details(user));
      void delivery.run();
      res.json({ order: publicOrder(receipt), ...store.wallet(user.id) });
    }),
  );
  app.get(
    "/api/me/koins/history",
    auth,
    run((req, res) => {
      const kind = req.query.kind,
        offset = Math.max(0, Math.floor(Number(req.query.offset) || 0));
      if (kind === "transactions")
        return res.json(store.ledger(req.auth.id, offset));
      if (kind === "orders")
        return res.json(
          store.orders({ userId: req.auth.id, offset }).map(publicOrder),
        );
      if (kind === "documents")
        return res.json(
          store
            .documents(req.auth.id, "", offset)
            .map(({ issuer, customer, ...row }) => row),
        );
      res.status(400).json({ error: "Historique inconnu." });
    }),
  );
  app.post(
    "/api/me/koins/checkout",
    auth,
    limited,
    run(async (req, res) => {
      const user = userFor(req, true),
        config = store.config();
      if (!config.purchasesEnabled)
        throw Error("Les achats de Koins sont désactivés.");
      if (config.testMode && !user.admin)
        throw Error("Les achats de test sont réservés aux administrateurs.");
      if (!user.emailVerifiedAt)
        throw Error("Valide ton email avant tout achat payant.");
      if (
        !config.testMode &&
        (config.billing.status !== "professional" || !config.legalReviewed)
      )
        throw Error("La facturation des ventes réelles n’est pas activée.");
      if (req.body.acceptedTerms !== true)
        throw Error("Accepte les conditions d’achat avant de poursuivre.");
      const offer = config.offers.find(
        (row) => row.id === req.body.offerId && row.enabled,
      );
      const provider = req.body.provider;
      if (
        !offer ||
        !["stripe", "discord"].includes(provider) ||
        !offer.methods.includes(provider) ||
        !providers.available[provider]
      )
        throw Error("Offre ou moyen de paiement indisponible.");
      if (provider === "discord") {
        if (!offer.discordSkuId || !user.discord?.id)
          throw Error("Associe Discord et configure le SKU de cette offre.");
        const sku = await providers.sku(offer.discordSkuId);
        if (
          sku?.type !== 3 ||
          sku.application_id !== environment.DISCORD_CLIENT_ID
        )
          throw Error(
            "Configure un SKU Discord Consumable de cette application.",
          );
        const intent = store.createOrder(user.id, "discord", offer, {
          ...details(user),
          discordUserId: user.discord.id,
          discordAppId: environment.DISCORD_CLIENT_ID,
          amountCents: 0,
          amountKnown: false,
          currency: "",
          terms: {
            version: config.billing.termsVersion,
            acceptedAt: new Date().toISOString(),
          },
        });
        return res.json({ skuId: offer.discordSkuId, orderId: intent.id });
      }
      const order = store.createOrder(user.id, provider, offer, {
        ...details(user),
        terms: {
          version: config.billing.termsVersion,
          acceptedAt: new Date().toISOString(),
        },
      });
      try {
        const session = await providers.checkout(order, website());
        store.atomic(() => {
          store.saveOrder({
            ...store.order(order.id),
            providerRef: session.id,
          });
          store.job(`reconcile:${order.id}`, "stripe-reconcile", order.id);
        });
        res.json({ orderId: order.id, url: session.url });
      } catch (error) {
        store.atomic(() => {
          const current = store.order(order.id);
          if (!current.credited)
            store.saveOrder({
              ...current,
              status: "failed",
              error: error.message,
            });
        });
        throw error;
      }
    }),
  );
  app.post(
    "/api/me/koins/discord/sync",
    auth,
    limited,
    run(async (req, res) => {
      const user = userFor(req, true),
        config = store.config();
      if (!user.discord?.id) throw Error("Associe ton compte Discord.");
      let entitlements;
      if (req.body.entitlementId) {
        if (!/^\d{16,22}$/.test(req.body.entitlementId))
          throw Error("Identifiant invalide.");
        entitlements = [await providers.entitlement(req.body.entitlementId)];
      } else
        entitlements = await providers.entitlements(
          user.discord.id,
          /^\d{16,22}$/.test(req.body.after ?? "") ? req.body.after : "",
        );
      let delivered = 0;
      for (const entitlement of entitlements) {
        if (
          entitlement.application_id !== environment.DISCORD_CLIENT_ID ||
          entitlement.user_id !== user.discord.id
        )
          continue;
        const previous = store.findByRef(entitlement.id);
        if (previous) {
          if (previous.userId !== user.id)
            throw Error("Droit déjà attribué à un autre compte.");
          if (entitlement.deleted) store.revokeDiscord(previous.id);
          else if (!previous.credited)
            store.complete(previous.id, {
              provider: "discord",
              providerRef: entitlement.id,
              amountCents: 0,
              currency: "",
              test: entitlement.type === 4,
            });
          continue;
        }
        if (
          entitlement.deleted ||
          (entitlement.ends_at &&
            Date.parse(entitlement.ends_at) <= Date.now()) ||
          (entitlement.starts_at &&
            Date.parse(entitlement.starts_at) > Date.now())
        )
          continue;
        const test = entitlement.type === 4;
        if (test ? !config.testMode || !user.admin : entitlement.type !== 1)
          continue;
        if (
          !test &&
          (!config.purchasesEnabled ||
            config.testMode ||
            !config.legalReviewed ||
            config.billing.status !== "professional")
        )
          continue;
        if (entitlement.consumed) continue;
        const offer = store.sku(entitlement.sku_id);
        if (!offer) continue;
        const sku = await providers.sku(entitlement.sku_id);
        if (
          sku?.type !== 3 ||
          sku.application_id !== environment.DISCORD_CLIENT_ID
        )
          continue;
        // Discord is the seller; never infer a localized payment amount from the website offer.
        const intent = store.pendingDiscordIntent(
          user.id,
          entitlement.sku_id,
          test,
        );
        const order = intent
          ? store.atomic(() =>
              store.saveOrder({ ...intent, providerRef: entitlement.id }),
            )
          : store.createOrder(user.id, "discord", offer, {
              ...details(user),
              test,
              discordUserId: user.discord.id,
              discordAppId: environment.DISCORD_CLIENT_ID,
              providerRef: entitlement.id,
              amountCents: 0,
              amountKnown: false,
              currency: "",
            });
        store.complete(order.id, {
          provider: "discord",
          providerRef: entitlement.id,
          amountCents: 0,
          currency: "",
          test,
        });
        delivered++;
      }
      void delivery.run();
      res.json({
        delivered,
        ...store.wallet(user.id),
        nextCursor:
          !req.body.entitlementId && entitlements.length === 100
            ? entitlements.reduce(
                (max, row) => (BigInt(row.id) > BigInt(max) ? row.id : max),
                "0",
              )
            : null,
      });
    }),
  );
  app.post(
    "/api/me/koins/discord/authorize",
    auth,
    limited,
    run(async (req, res) => {
      const user = userFor(req, true);
      if (
        req.get("origin") !==
        `https://${environment.DISCORD_CLIENT_ID}.discordsays.com`
      )
        throw Error("Cette autorisation doit provenir de l’activité Discord.");
      const identity = await exchangeDiscordCode(req.body.code, {
        embedded: true,
        returnAccessToken: true,
      });
      if (identity.id !== user.discord?.id)
        throw Error("Ce compte Discord ne correspond pas au compte connecté.");
      res.json({ accessToken: identity.accessToken });
    }),
  );
  app.post(
    "/api/koins/stripe/webhook",
    run(async (req, res) => {
      let event;
      try {
        event = providers.stripeEvent(req.body, req.get("stripe-signature"));
      } catch {
        return res.status(400).json({ error: "Signature Stripe invalide." });
      }
      const object = event.data.object;
      if (
        [
          "checkout.session.completed",
          "checkout.session.async_payment_succeeded",
        ].includes(event.type)
      ) {
        if (object.payment_status !== "paid")
          return res.json({ received: true });
        const order = store.order(object.metadata?.ktga_order);
        if (!order) return res.json({ received: true });
        if (!getUser(order.userId))
          throw Object.assign(Error("Compte absent : livraison à examiner."), {
            status: 503,
          });
        store.complete(order.id, {
          provider: "stripe",
          providerRef: object.id,
          paymentRef:
            typeof object.payment_intent === "string"
              ? object.payment_intent
              : object.payment_intent?.id,
          amountCents: object.amount_total,
          currency: object.currency,
          test: !event.livemode,
          invoiceId:
            typeof object.invoice === "string"
              ? object.invoice
              : object.invoice?.id,
        });
      } else if (
        [
          "checkout.session.expired",
          "checkout.session.async_payment_failed",
        ].includes(event.type)
      ) {
        const order = store.order(object.metadata?.ktga_order);
        if (
          order &&
          !order.credited &&
          order.provider === "stripe" &&
          Boolean(order.test) === !event.livemode &&
          (!order.providerRef || order.providerRef === object.id)
        )
          store.atomic(() =>
            store.saveOrder({
              ...order,
              status: event.type.endsWith("expired") ? "cancelled" : "failed",
            }),
          );
      } else if (
        event.type === "charge.refunded" ||
        event.type.startsWith("charge.dispute.")
      ) {
        const paymentRef =
          typeof object.payment_intent === "string"
            ? object.payment_intent
            : object.payment_intent?.id;
        let order = store.findByRef(paymentRef ?? "");
        if (!order && paymentRef) {
          const payment = await providers.payment(paymentRef);
          order = store.order(payment.metadata?.ktga_order);
        }
        if (order) {
          if (Boolean(order.test) !== !event.livemode)
            throw Error("Mode de remboursement incohérent.");
          if (event.type === "charge.refunded")
            store.reverse(order.id, object.amount_refunded);
          else {
            const dispute = await providers.dispute(object.id);
            store.setDispute(
              order.id,
              !["won", "lost", "warning_closed"].includes(dispute.status),
            );
            if (dispute.status === "lost")
              store.reverse(order.id, order.amountCents);
          }
        }
      } else if (event.type === "credit_note.created") {
        const invoice = await providers.invoice(
            typeof object.invoice === "string"
              ? object.invoice
              : object.invoice.id,
          ),
          order = store.order(invoice.metadata?.ktga_order);
        if (
          order &&
          order.provider === "stripe" &&
          Boolean(order.test) === !event.livemode
        )
          store.job(`credit-note:${object.id}`, "document", order.id, {
            eventKey: `credit-note:${object.id}`,
            creditNoteId: object.id,
            refund: true,
          });
      }
      void delivery.run();
      res.json({ received: true });
    }),
  );
  app.get(
    "/api/me/koins/documents/:id",
    auth,
    run((req, res) => {
      const document = store.document(req.params.id);
      if (!document || document.user_id !== req.auth.id)
        return res.sendStatus(404);
      res
        .type("application/pdf")
        .attachment(`${document.number}.pdf`)
        .send(Buffer.from(document.body));
    }),
  );
  app.get(
    "/api/admin/monetization",
    auth,
    requireAdmin,
    run((req, res) =>
      res.json({
        config: store.config(),
        providers: providers.available,
        orders: store.orders({
          userId: req.query.userId || undefined,
          provider: req.query.provider || "",
          status: req.query.status || "",
          search: req.query.search ?? "",
          offset: Number(req.query.offset) || 0,
        }),
        documents: store.documents(
          undefined,
          req.query.search ?? "",
          Number(req.query.offset) || 0,
        ),
        transactions: store.ledger(
          req.query.userId || undefined,
          Number(req.query.offset) || 0,
        ),
        statistics: store.statistics(),
        batches: store.batches(),
        jobs: store.jobs(),
        mailLog: store.mailLog(),
      }),
    ),
  );
  app.put(
    "/api/admin/monetization",
    auth,
    requireAdmin,
    run(async (req, res) => {
      if (imageAllowed)
        for (const image of [
          req.body.iconImage,
          req.body.documents?.logoImage,
          ...(req.body.offers ?? []).map((offer) => offer.image),
        ])
          if (image && !imageAllowed(image))
            throw Error("Image introuvable ou archivée dans la médiathèque.");
      if (req.body.documents?.logoImage)
        await getLogo(req.body.documents.logoImage);
      res.json(store.saveConfig(req.body));
    }),
  );
  app.post(
    "/api/admin/monetization/documents/preview",
    auth,
    requireAdmin,
    run(async (req, res) => {
      const previewConfig = validateKoinConfig({
        ...store.config(),
        documents: req.body.documents,
        billing: req.body.billing ?? store.config().billing,
        purchasesEnabled: false,
        codesEnabled: false,
      });
      const documentTemplate = previewConfig.documents;
      if (
        documentTemplate.logoImage &&
        imageAllowed &&
        !imageAllowed(documentTemplate.logoImage)
      )
        throw Error("Logo PDF introuvable.");
      const order = {
        id: "EXEMPLE-NON-EMIS",
        provider: "code",
        koins: 25,
        amountCents: 0,
        currency: "eur",
        createdAt: new Date().toISOString(),
        customer: { name: "Joueur exemple", email: "joueur@example.invalid" },
        issuer: previewConfig.billing,
        documentTemplate,
      };
      const body = await koinReceiptPdf({
        number: "APERÇU-NON-ÉMIS",
        order,
        logo: await getLogo(documentTemplate.logoImage),
        specimen: true,
      });
      res
        .type("application/pdf")
        .attachment("KTGA-modele-document.pdf")
        .send(body);
    }),
  );
  app.get(
    "/api/admin/monetization/history",
    auth,
    requireAdmin,
    run((req, res) => {
      const kind = req.query.kind;
      if (!["jobs", "mailLog"].includes(kind))
        return res.status(400).json({ error: "Historique inconnu." });
      res.json(store[kind](Number(req.query.offset) || 0));
    }),
  );
  app.post(
    "/api/admin/monetization/codes",
    auth,
    requireAdmin,
    run((req, res) => res.json(store.generate(req.body))),
  );
  app.post(
    "/api/admin/monetization/jobs/:id/retry",
    auth,
    requireAdmin,
    run((req, res) => {
      store.retry(req.params.id);
      void delivery.run();
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/admin/monetization/orders/:id/refund",
    auth,
    requireAdmin,
    run(async (req, res) => {
      const order = store.order(req.params.id);
      if (!order || order.provider !== "stripe" || !order.paymentRef)
        throw Error("Remboursement à gérer auprès du fournisseur.");
      const note = await providers.refund(order);
      if (note?.id)
        store.job(`credit-note:${note.id}`, "document", order.id, {
          eventKey: `credit-note:${note.id}`,
          creditNoteId: note.id,
          refund: true,
        });
      void delivery.run();
      res.json({ ok: true, status: "refund_requested" });
    }),
  );
  app.get(
    "/api/admin/monetization/documents/:id",
    auth,
    requireAdmin,
    run((req, res) => {
      const document = store.document(req.params.id);
      if (!document) return res.sendStatus(404);
      res
        .type("application/pdf")
        .attachment(`${document.number}.pdf`)
        .send(Buffer.from(document.body));
    }),
  );
  app.post(
    "/api/admin/monetization/documents/:id/resend",
    auth,
    requireAdmin,
    run((req, res) => {
      const document = store.document(req.params.id);
      if (!document) throw Error("Document introuvable.");
      for (const role of ["player", "office"])
        store.retry(`mail:${document.id}:${role}`);
      void delivery.run();
      res.json({ ok: true });
    }),
  );
  return delivery;
}
