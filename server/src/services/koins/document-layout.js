import PDFDocument from "pdfkit";
import { normalizeDocumentTemplate } from "../../../../client/src/features/koins/document-template.js";

export async function renderKoinDocument({
  number,
  order,
  refund = false,
  logo = null,
  specimen = false,
}) {
  const style = normalizeDocumentTemplate(order.documentTemplate);
  const title = refund
    ? "Justificatif de remboursement"
    : order.provider === "code"
      ? "Justificatif d’attribution gratuite"
      : "Justificatif d’attribution";
  const pdf = new PDFDocument({
    size: "A4",
    margins: { top: 42, bottom: 70, left: 42, right: 42 },
    bufferPages: true,
    info: { Title: `${title} · ${number}`, Author: style.brandName },
  });
  const chunks = [];
  const completed = new Promise((resolve, reject) => {
    pdf.on("data", (chunk) => chunks.push(chunk));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);
  });
  const left = 42,
    right = 553,
    width = 511;
  const label = (text, x, y, w = width) =>
    pdf
      .font("Helvetica-Bold")
      .fontSize(8)
      .fillColor("#59636a")
      .text(text, x, y, { width: w });
  const body = (text, x, y, w = width, size = 10) =>
    pdf
      .font("Helvetica")
      .fontSize(size)
      .fillColor("#24313a")
      .text(String(text ?? ""), x, y, { width: w, lineGap: 3 });
  const rule = (y) =>
    pdf
      .moveTo(left, y)
      .lineTo(right, y)
      .strokeColor("#dfe3e6")
      .lineWidth(0.6)
      .stroke();
  if (logo)
    pdf.image(logo, left, 40, {
      fit: [50, 50],
      align: "center",
      valign: "center",
    });
  const rgb = style.accentColor
    .slice(1)
    .match(/../g)
    .map((value) => parseInt(value, 16));
  const linear = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const light =
    1.05 /
      (linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722 + 0.05) <
    4.5;
  const ink = light ? "#24313a" : style.accentColor;
  const brandWidth = logo ? 230 : 292;
  let brandSize = 22;
  pdf.font("Helvetica-Bold").fontSize(brandSize);
  while (
    brandSize > 11 &&
    pdf.heightOfString(style.brandName, { width: brandWidth }) > 46
  )
    pdf.fontSize(--brandSize);
  pdf
    .fillColor(ink)
    .text(style.brandName, logo ? 104 : left, 47, { width: brandWidth });
  body("Document personnel", 375, 48, 178, 10);
  body(specimen ? "APERÇU · NON ÉMIS" : number, 350, 65, 203, 9);
  pdf.rect(left, 108, width, 3).fill(style.accentColor);
  pdf
    .font("Helvetica-Bold")
    .fontSize(17)
    .fillColor("#17212b")
    .text(title, left, 128, { width });
  const dated = new Date(order.createdAt);
  body(
    `Date : ${Number.isFinite(dated.getTime()) ? new Intl.DateTimeFormat("fr-BE", { dateStyle: "long", timeZone: "Europe/Brussels" }).format(dated) : "Non renseignée"}`,
    left,
    157,
  );
  label("ÉMETTEUR", left, 192, 245);
  body(
    [
      order.issuer?.legalName || style.brandName,
      order.issuer?.address,
      order.issuer?.country,
      order.issuer?.registrationNumber
        ? `N° entreprise : ${order.issuer.registrationNumber}`
        : "",
      order.issuer?.vatId ? `TVA / régime : ${order.issuer.vatId}` : "",
      order.issuer?.contactEmail,
    ]
      .filter(Boolean)
      .join("\n"),
    left,
    209,
    245,
  );
  const issuerEnd = pdf.y;
  label("BÉNÉFICIAIRE", 310, 192, 243);
  body(
    [order.customer?.name || "Joueur", order.customer?.email]
      .filter(Boolean)
      .join("\n"),
    310,
    209,
    243,
  );
  let y = Math.max(280, issuerEnd + 20, pdf.y + 20);
  label("RÉFÉRENCES", left, y);
  y += 17;
  body(`Commande : ${order.id}`, left, y);
  y = pdf.y + 4;
  body(
    `Origine : ${order.provider === "code" ? "Code gratuit" : order.provider === "stripe" ? "Stripe" : "Discord"} · Référence : ${order.providerRef || order.codeReference || order.id}`,
    left,
    y,
    width,
    9,
  );
  y = pdf.y + 22;
  pdf.rect(left, y, width, 28).fill(style.accentColor);
  pdf
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor(light ? "#000000" : "#ffffff")
    .text("DÉSIGNATION", 54, y + 9, { width: 290 })
    .text("QTÉ", 350, y + 9, { width: 40, align: "center" })
    .text("MONTANT", 410, y + 9, { width: 131, align: "right" });
  y += 42;
  const description =
    order.provider === "code"
      ? `Attribution gratuite · ${order.koins} Koins`
      : `${refund ? "Remboursement · " : ""}${order.koins} Koins`;
  body(description, 54, y, 285, 11);
  const rowEnd = pdf.y;
  body("1", 350, y, 40);
  const unknown = order.amountKnown === false;
  const amount = unknown
    ? null
    : order.provider === "code"
      ? 0
      : refund
        ? (order.refundedCents ?? order.amountCents)
        : order.amountCents;
  const amountLabel =
    amount == null
      ? "Non communiqué"
      : new Intl.NumberFormat("fr-BE", {
          style: "currency",
          currency: (order.currency || "eur").toUpperCase(),
        }).format(amount / 100);
  pdf
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor("#24313a")
    .text(amountLabel, 410, y, { width: 131, align: "right" });
  y = Math.max(rowEnd, pdf.y) + 16;
  rule(y);
  y += 20;
  label(refund ? "MONTANT REMBOURSÉ (CUMUL)" : "MONTANT PAYÉ", 320, y, 233);
  pdf
    .font("Helvetica-Bold")
    .fontSize(19)
    .fillColor(ink)
    .text(amountLabel, 320, y + 17, { width: 233, align: "right" });
  y = pdf.y + 12;
  body(
    order.provider === "code"
      ? "TVA : sans objet (attribution gratuite)."
      : "Montants HT et TVA : voir le document officiel du fournisseur.",
    left,
    y,
    width,
    9,
  );
  y = pdf.y + 10;
  body(
    order.provider === "code"
      ? "Attribution gratuite, sans vente. Ce document n’est pas une facture."
      : "Ce document confirme l’attribution ou le retrait de Koins. Il ne remplace ni une facture ni un avoir du fournisseur.",
    left,
    y,
    width,
    9,
  );
  y = pdf.y + 18;
  if (order.campaign) {
    body(`Campagne : ${order.campaign}`, left, y);
    y = pdf.y + 12;
  }
  if (style.note) {
    body(style.note, left, y);
    y = pdf.y + 16;
  }
  if (style.footer) {
    body(style.footer, left, y, width, 8);
    y = pdf.y + 16;
  }
  for (const link of style.links) {
    if (y > 735) {
      pdf.addPage();
      y = 42;
    }
    pdf
      .font("Helvetica")
      .fontSize(9)
      .fillColor(ink)
      .text(link.label, left, y, { width, link: link.url, underline: true });
    y = pdf.y + 7;
  }
  if (order.issuer?.contactEmail) {
    if (y > 735) {
      pdf.addPage();
      y = 42;
    }
    pdf
      .fontSize(9)
      .fillColor(ink)
      .text(`Contact : ${order.issuer.contactEmail}`, left, y, {
        width,
        link: `mailto:${order.issuer.contactEmail}`,
      });
  }
  const pages = pdf.bufferedPageRange();
  for (let index = 0; index < pages.count; index++) {
    pdf.switchToPage(index);
    pdf.page.margins.bottom = 0;
    rule(795);
    pdf
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#68737b")
      .text(
        `${style.brandName} · ${specimen ? "MODÈLE SANS VALEUR COMPTABLE" : number}`,
        left,
        806,
        { width: 410, lineBreak: false },
      );
    pdf.text(`${index + 1} / ${pages.count}`, 500, 806, {
      width: 53,
      align: "right",
      lineBreak: false,
    });
  }
  pdf.end();
  return completed;
}
