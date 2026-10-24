import Stripe from "stripe";
import { normalizeDocumentTemplate } from "../../../../client/src/features/koins/document-template.js";
export function createKoinProviders({
  environment = process.env,
  fetcher = fetch,
} = {}) {
  const stripe = environment.STRIPE_SECRET_KEY
    ? new Stripe(environment.STRIPE_SECRET_KEY, {
        timeout: 15000,
        maxNetworkRetries: 2,
      })
    : null;
  let skuCache = { until: 0, rows: [] };
  const discord = async (path, options = {}) => {
    if (
      !environment.DISCORD_BOT_TOKEN ||
      !/^\d{16,22}$/.test(environment.DISCORD_CLIENT_ID ?? "")
    )
      throw Error("Discord Premium Apps n’est pas configuré.");
    const response = await fetcher(
      `https://discord.com/api/v10/applications/${environment.DISCORD_CLIENT_ID}/${path}`,
      {
        ...options,
        headers: {
          Authorization: `Bot ${environment.DISCORD_BOT_TOKEN}`,
          ...options.headers,
        },
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok)
      throw Error(`Discord Premium Apps : erreur ${response.status}.`);
    return response.status === 204 ? null : response.json();
  };
  return {
    async sku(id) {
      if (skuCache.until < Date.now())
        skuCache = { rows: await discord("skus"), until: Date.now() + 900000 };
      return skuCache.rows.find((row) => row.id === id);
    },
    available: {
      stripe: Boolean(stripe && environment.STRIPE_WEBHOOK_SECRET),
      discord: Boolean(
        environment.DISCORD_BOT_TOKEN && environment.DISCORD_CLIENT_ID,
      ),
    },
    stripeEvent: (body, signature) => {
      if (!stripe || !environment.STRIPE_WEBHOOK_SECRET)
        throw Error("Stripe non configuré.");
      return stripe.webhooks.constructEvent(
        body,
        signature,
        environment.STRIPE_WEBHOOK_SECRET,
        300,
      );
    },
    async checkout(order, website) {
      if (!stripe) throw Error("Stripe non configuré.");
      if (order.test !== environment.STRIPE_SECRET_KEY.startsWith("sk_test_"))
        throw Error("Le mode Stripe ne correspond pas au mode configuré.");
      const documentTemplate = normalizeDocumentTemplate(
        order.documentTemplate,
      );
      return stripe.checkout.sessions.create(
        {
          mode: "payment",
          client_reference_id: order.id,
          customer_creation: "always",
          customer_email: order.customer.email,
          billing_address_collection: "required",
          automatic_tax: { enabled: true },
          invoice_creation: {
            enabled: true,
            invoice_data: {
              metadata: { ktga_order: order.id },
              footer: [
                documentTemplate.footer,
                ...documentTemplate.links.map(
                  (link) => `${link.label} : ${link.url}`,
                ),
              ]
                .filter(Boolean)
                .join("\n"),
              description: documentTemplate.note.slice(0, 500),
              custom_fields: [
                { name: "Commande KTGA", value: order.id },
                { name: "Contenu", value: `${order.koins} Koins` },
              ],
            },
          },
          metadata: { ktga_order: order.id },
          payment_intent_data: { metadata: { ktga_order: order.id } },
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: "eur",
                unit_amount: order.amountCents,
                tax_behavior: "inclusive",
                product_data: {
                  name: `KTGA · ${order.koins} Koins`,
                  ...(environment.STRIPE_KOINS_TAX_CODE
                    ? { tax_code: environment.STRIPE_KOINS_TAX_CODE }
                    : {}),
                },
              },
            },
          ],
          success_url: `${website.replace(/\/$/, "")}/profil?koins=confirmation&koinsOrder=${encodeURIComponent(order.id)}`,
          cancel_url: `${website.replace(/\/$/, "")}/profil?koins=annulation&koinsOrder=${encodeURIComponent(order.id)}`,
        },
        { idempotencyKey: `koins-${order.id}` },
      );
    },
    session: (id) =>
      stripe.checkout.sessions.retrieve(id, {
        expand: ["invoice", "payment_intent"],
      }),
    payment: (id) => stripe.paymentIntents.retrieve(id),
    invoice: (id) => stripe.invoices.retrieve(id),
    creditNote: (id) => stripe.creditNotes.retrieve(id),
    dispute: (id) => stripe.disputes.retrieve(id),
    async refund(order) {
      const session = await stripe.checkout.sessions.retrieve(
        order.providerRef,
      );
      const invoice =
        typeof session.invoice === "string"
          ? session.invoice
          : session.invoice?.id;
      const amount = order.amountCents - (order.refundedCents ?? 0);
      if (!invoice || amount <= 0)
        throw Error("Facture en attente ou remboursement déjà complet.");
      return stripe.creditNotes.create(
        {
          invoice,
          amount,
          refund_amount: amount,
          email_type: "none",
          metadata: { ktga_order: order.id },
        },
        { idempotencyKey: `koins-refund-${order.id}-${amount}` },
      );
    },
    async invoicePdf(invoice) {
      const url = new URL(invoice.invoice_pdf);
      if (
        url.protocol !== "https:" ||
        !["pay.stripe.com", "files.stripe.com"].includes(url.hostname) ||
        url.username ||
        url.password
      )
        throw Error("Adresse de facture Stripe non autorisée.");
      const response = await fetcher(url, {
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
      if (
        !response.ok ||
        !response.headers.get("content-type")?.includes("application/pdf")
      )
        throw Error("PDF Stripe indisponible.");
      const chunks = [];
      let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > 5 * 1024 * 1024) throw Error("Facture trop volumineuse.");
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks);
      if (!body.subarray(0, 5).equals(Buffer.from("%PDF-")))
        throw Error("PDF Stripe invalide.");
      return body;
    },
    entitlements: async (userId, after = "") =>
      discord(
        `entitlements?user_id=${encodeURIComponent(userId)}&exclude_deleted=false&limit=100${after ? `&after=${encodeURIComponent(after)}` : ""}`,
      ),
    entitlement: (id) => discord(`entitlements/${id}`),
    consume: (id) => discord(`entitlements/${id}/consume`, { method: "POST" }),
  };
}
