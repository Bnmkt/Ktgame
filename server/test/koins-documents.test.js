import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { koinReceiptPdf } from "../src/services/koins/documents.js";
import { createDocumentLogoLoader } from "../src/services/koins/document-assets.js";
import { defaultDocumentTemplate } from "../../client/src/features/koins/document-template.js";

const order = {
  id: "example",
  provider: "code",
  createdAt: "2026-10-24T10:00:00Z",
  koins: 25,
  amountCents: 0,
  currency: "eur",
  customer: { name: "Joueur exemple", email: "joueur@example.invalid" },
  issuer: { legalName: "KTGA.ME", contactEmail: "contact@example.invalid" },
};
const publicDirectory = fileURLToPath(
  new URL("../../client/public", import.meta.url),
);
test("the accounting layout includes the real logo and remains bounded with long notes", async () => {
  const logo = await fs.readFile(
    new URL("../../client/public/pwa/icon-192.png", import.meta.url),
  );
  const body = await koinReceiptPdf({
    number: "EXAMPLE",
    order,
    logo,
    specimen: true,
  });
  assert.ok(body.subarray(0, 5).equals(Buffer.from("%PDF-")));
  assert.match(body.toString("latin1"), /\/Subtype \/Image/);
  const long = await koinReceiptPdf({
    number: "EXAMPLE-LONG",
    order: {
      ...order,
      issuer: {
        ...order.issuer,
        address: "Une longue adresse administrative ".repeat(18),
      },
      documentTemplate: {
        ...defaultDocumentTemplate,
        brandName:
          "Un nom particulièrement long pour vérifier les limites du modèle KTGA",
        footer: "Mention de pied de page\n".repeat(50),
      },
    },
    logo,
  });
  const pages = long.toString("latin1").match(/\/Type \/Page\b/g) ?? [];
  assert.ok(pages.length >= 1 && pages.length <= 8, `${pages.length} pages`);
});
test("PDF logos use local vetted assets and never fetch a URL", async () => {
  const loader = createDocumentLogoLoader({
    publicDirectory,
    settings: () => ({}),
    mediaLibrary: { get: () => null },
  });
  const logo = await loader();
  assert.ok(logo.length > 0);
  await assert.rejects(
    loader("https://internal.invalid/private"),
    /introuvable/,
  );
});

test("the deployment CSP permits private PDF previews without permitting arbitrary frames", async () => {
  const nginx = await fs.readFile(
    new URL("../../deploy/debian/nginx-https.conf", import.meta.url),
    "utf8",
  );
  assert.match(
    nginx,
    /frame-src 'self' blob: https:\/\/www\.googletagmanager\.com;/,
  );
  assert.match(nginx, /object-src 'none'/);
  assert.match(nginx, /frame-ancestors 'none'/);
});
