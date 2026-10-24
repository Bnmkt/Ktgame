import PDFDocument from "pdfkit";
import { sendTransactionalEmail } from "../email-verification.js";
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export async function koinReceiptPdf({ number, order, refund = false }) {
  const pdf = new PDFDocument({
      size: "A4",
      margin: 48,
      info: {
        Title: refund
          ? "Justificatif de remboursement KTGA"
          : "Justificatif Koins KTGA",
      },
    }),
    chunks = [];
  const completed = new Promise((resolve, reject) => {
    pdf.on("data", (chunk) => chunks.push(chunk));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);
  });
  pdf.fontSize(25).fillColor("#6e3bb0").text("KTGA.ME · Koins");
  pdf
    .moveDown()
    .fontSize(17)
    .fillColor("#171d1a")
    .text(
      refund
        ? "Justificatif de remboursement"
        : order.provider === "code"
          ? "Justificatif d’attribution gratuite"
          : "Justificatif d’attribution Discord",
    );
  const lines = [
    `Référence : ${number}`,
    `Date : ${order.createdAt}`,
    `Bénéficiaire : ${order.customer?.name ?? order.userId}`,
    `Compte : ${order.customer?.email ?? order.userId}`,
    `Koins : ${order.koins}`,
    `Fournisseur : ${order.provider}`,
    `Référence fournisseur : ${order.providerRef ?? order.codeReference ?? order.id}`,
  ];
  if (order.provider === "code")
    lines.push(
      `Campagne : ${order.campaign ?? ""}`,
      "Montant payé : 0,00 EUR",
      "Attribution gratuite, sans vente. Ce document n’est pas une facture.",
    );
  else
    lines.push(
      "Le montant payé et les taxes figurent sur le document du fournisseur.",
      "Ce justificatif ne remplace ni une facture ni un avoir du fournisseur.",
    );
  if (order.issuer?.legalName)
    lines.push(
      `Émetteur KTGA : ${order.issuer.legalName}`,
      order.issuer.address ?? "",
      order.issuer.contactEmail ?? "",
    );
  pdf.moveDown().fontSize(11);
  for (const line of lines) pdf.text(line, { lineGap: 7 });
  pdf.end();
  return completed;
}
export function createKoinDelivery({
  store,
  providers,
  send = sendTransactionalEmail,
  getUser,
}) {
  let busy = false;
  async function run() {
    if (busy) return;
    busy = true;
    try {
      for (const task of store.pendingJobs()) {
        try {
          const order = store.order(task.order_id);
          if (!order) throw Error("Commande introuvable.");
          if (task.kind === "stripe-reconcile") {
            if (!order.credited) {
              const session = await providers.session(order.providerRef);
              if (session.payment_status === "paid")
                store.complete(order.id, {
                  provider: "stripe",
                  providerRef: session.id,
                  paymentRef:
                    typeof session.payment_intent === "string"
                      ? session.payment_intent
                      : session.payment_intent?.id,
                  amountCents: session.amount_total,
                  currency: session.currency,
                  test: !session.livemode,
                  invoiceId:
                    typeof session.invoice === "string"
                      ? session.invoice
                      : session.invoice?.id,
                });
              else if (session.status === "expired")
                store.atomic(() =>
                  store.saveOrder({
                    ...store.order(order.id),
                    status: "cancelled",
                  }),
                );
              else {
                store.deferJob(task.id, Date.now() + 60000);
                continue;
              }
            }
          } else if (task.kind === "discord-audit") {
            const entitlement = await providers.entitlement(order.providerRef);
            if (
              entitlement.application_id !== order.discordAppId ||
              entitlement.user_id !== order.discordUserId ||
              entitlement.sku_id !== order.offer.discordSkuId
            )
              throw Error("Droit Discord incohérent.");
            if (entitlement.deleted) store.revokeDiscord(order.id);
            else {
              store.deferJob(task.id, Date.now() + 3600000);
              continue;
            }
          } else if (task.kind === "discord-consume") {
            const entitlement = await providers.entitlement(order.providerRef);
            if (
              entitlement.application_id !== order.discordAppId ||
              entitlement.user_id !== order.discordUserId ||
              entitlement.sku_id !== order.offer.discordSkuId
            )
              throw Error("Droit Discord incohérent.");
            if (entitlement.deleted) store.revokeDiscord(order.id);
            else if (!entitlement.consumed)
              await providers.consume(order.providerRef);
          } else if (task.kind === "document") {
            const eventKey = task.data.eventKey,
              number = store.reserveDocumentNumber(eventKey);
            let body,
              kind =
                order.provider === "code"
                  ? "free_receipt"
                  : "allocation_receipt",
              providerNumber = null,
              providerAmounts = null,
              documentKoins = task.data.refund
                ? (task.data.revokedKoins ?? order.revokedKoins)
                : order.koins;
            if (order.provider === "stripe" && !task.data.refund) {
              const session = await providers.session(order.providerRef),
                invoice =
                  typeof session.invoice === "object"
                    ? session.invoice
                    : await providers.invoice(session.invoice);
              if (!invoice?.invoice_pdf || invoice.status !== "paid")
                throw Error("Facture Stripe en attente.");
              body = await providers.invoicePdf(invoice);
              kind = "provider_invoice";
              providerNumber = invoice.number;
              providerAmounts = {
                subtotal: invoice.subtotal_excluding_tax,
                total: invoice.total,
                currency: invoice.currency,
                taxes: invoice.total_taxes ?? invoice.total_tax_amounts,
              };
            } else if (task.data.creditNoteId) {
              const note = await providers.creditNote(task.data.creditNoteId);
              body = await providers.invoicePdf({ invoice_pdf: note.pdf });
              kind = "provider_credit_note";
              providerNumber = note.number;
              documentKoins = order.amountCents
                ? Math.ceil((order.koins * note.total) / order.amountCents)
                : order.revokedKoins;
              providerAmounts = {
                subtotal: note.total_excluding_tax,
                total: note.total,
                currency: note.currency,
                taxes: note.total_taxes,
              };
            } else {
              body = await koinReceiptPdf({
                number,
                order: task.data.refund
                  ? {
                      ...order,
                      koins: task.data.revokedKoins ?? order.revokedKoins,
                      createdAt: task.data.createdAt,
                    }
                  : order,
                refund: task.data.refund,
              });
              if (task.data.refund) kind = "refund_receipt";
            }
            const documentId = store.saveDocument(
              eventKey,
              order.userId,
              {
                kind,
                orderId: order.id,
                providerNumber,
                providerAmounts,
                koins: documentKoins,
                amountCents:
                  order.amountKnown === false
                    ? null
                    : task.data.refund
                      ? (providerAmounts?.total ??
                        task.data.refundedCents ??
                        order.refundedCents)
                      : order.amountCents,
                currency: order.currency,
                issuer: order.issuer,
                customer: order.customer,
              },
              body,
            );
            const recipient =
              order.customer?.email ?? getUser(order.userId)?.email;
            if (recipient)
              store.job(`mail:${documentId}:player`, "email", order.id, {
                documentId,
                to: recipient,
                refund: Boolean(task.data.refund),
              });
            if (order.issuer?.administrativeEmail)
              store.job(`mail:${documentId}:office`, "email", order.id, {
                documentId,
                to: order.issuer.administrativeEmail,
                refund: Boolean(task.data.refund),
              });
          } else if (task.kind === "email") {
            const document = store.document(task.data.documentId);
            if (!document) throw Error("Document introuvable.");
            const balance = store.wallet(order.userId).balance;
            const documentData = JSON.parse(document.data);
            const title = task.data.refund
              ? "Remboursement Koins"
              : "Ton récapitulatif Koins";
            const text = `${title}\n${documentData.koins} Koins · ${document.number}\nSolde actuel : ${balance} Koins.\nLe document est disponible dans ton espace personnel.`;
            await send({
              to: task.data.to,
              subject: `KTGA.ME · ${title}`,
              text,
              html: `<div style="background:#10221c;padding:32px;color:#f9efd8;font-family:Arial,sans-serif"><h1 style="color:#c499f4">KTGA.ME · Koins</h1><h2>${escape(title)}</h2><p>${escape(order.customer?.name ?? "Joueur")},</p><p><strong>${documentData.koins} Koins</strong> · ${escape(document.number)}</p><p>Solde actuel : <strong>${balance} Koins</strong></p><p>Ton document est joint et reste disponible dans ton espace personnel.</p></div>`,
              messageId: `<koins-${document.id}-${task.id.endsWith("office") ? "office" : "player"}@ktga.me>`,
              attachments: [
                {
                  filename: `${document.number}.pdf`,
                  content: Buffer.from(document.body),
                  contentType: "application/pdf",
                },
              ],
            });
            store.mailSuccess(task.id);
          } else
            throw Error("Traitement Koins inconnu : intervention nécessaire.");
          store.finishJob(task.id);
        } catch (error) {
          store.failJob(task, error);
        }
      }
    } finally {
      busy = false;
    }
  }
  const timer = setInterval(() => void run(), 30000);
  timer.unref();
  return { run, close: () => clearInterval(timer) };
}
