import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { koinReceiptPdf } from "../src/services/koins/documents.js";

const root = process.env.PDF_PREVIEW_MODULE_ROOT;
if (!root)
  throw Error(
    "PDF_PREVIEW_MODULE_ROOT doit désigner une installation temporaire de pdfjs-dist et @napi-rs/canvas.",
  );
const require = createRequire(path.join(root, "package.json"));
const canvasModule = require("@napi-rs/canvas");
for (const key of ["DOMMatrix", "ImageData", "Path2D"])
  if (canvasModule[key]) globalThis[key] = canvasModule[key];
const pdfjs = await import(
  pathToFileURL(require.resolve("pdfjs-dist/legacy/build/pdf.mjs")).href
);
const output = path.resolve("../docs/previews/header-documents-20261024");
await fs.mkdir(output, { recursive: true });
const logo = await fs.readFile(
  new URL("../../client/public/pwa/icon-192.png", import.meta.url),
);
const order = {
  id: "EXEMPLE-NON-EMIS",
  provider: "code",
  createdAt: "2026-10-24T10:00:00Z",
  koins: 25,
  amountCents: 0,
  currency: "eur",
  codeReference: "EXEMPLE",
  customer: { name: "Joueur exemple", email: "joueur@example.invalid" },
  issuer: {
    legalName: "KTGA.ME",
    country: "BE",
    contactEmail: "contact@example.invalid",
  },
};
const body = await koinReceiptPdf({
  number: "APERÇU-NON-ÉMIS",
  order,
  logo,
  specimen: true,
});
await fs.writeFile(path.join(output, "modele.pdf"), body);
const loading = pdfjs.getDocument({
  data: new Uint8Array(body),
  standardFontDataUrl:
    path
      .join(root, "node_modules/pdfjs-dist/standard_fonts")
      .replaceAll("\\", "/") + "/",
  useSystemFonts: true,
});
const document = await loading.promise;
assert.equal(document.numPages, 1);
const page = await document.getPage(1),
  viewport = page.getViewport({ scale: 1.5 }),
  canvas = canvasModule.createCanvas(
    Math.ceil(viewport.width),
    Math.ceil(viewport.height),
  );
await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
await fs.writeFile(
  path.join(output, "modele-pdf.png"),
  canvas.toBuffer("image/png"),
);
const content = await page.getTextContent(),
  text = content.items.map((item) => item.str).join(" ");
for (const expected of [
  "BÉNÉFICIAIRE",
  "MONTANT PAYÉ",
  "25 Koins",
  "0,00",
  "n’est pas une facture",
  "MODÈLE SANS VALEUR COMPTABLE",
])
  assert.ok(text.includes(expected), expected);
assert.ok(
  (await page.getAnnotations()).some(
    (annotation) => annotation.url === "https://www.ktga.me/profil",
  ),
);
await fs.writeFile(
  path.join(output, "pdf-checks.json"),
  JSON.stringify(
    {
      pages: document.numPages,
      text,
      links: (await page.getAnnotations())
        .filter((row) => row.url)
        .map((row) => row.url),
    },
    null,
    2,
  ),
);
await loading.destroy();
console.log("PDF rendu, texte et liens contrôlés.");
