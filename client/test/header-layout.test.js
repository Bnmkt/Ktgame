import test from "node:test";
import assert from "node:assert/strict";
import {
  visibleNavigationCount,
  koinsVisible,
} from "../src/navigation/header-layout.js";
import {
  normalizeDocumentTemplate,
  defaultDocumentTemplate,
  validProviderInvoiceLink,
} from "../src/features/koins/document-template.js";

test("navigation never wraps: keep every destination or reserve space for the overflow menu", () => {
  assert.equal(visibleNavigationCount([100, 110, 120], 338), 3);
  assert.equal(visibleNavigationCount([100, 110, 120], 337), 2);
  assert.equal(visibleNavigationCount([100, 110, 120], 144), 1);
  assert.equal(visibleNavigationCount([100, 110], 100), 0);
  assert.equal(visibleNavigationCount([], 200), 0);
  assert.equal(visibleNavigationCount([100], 0), 0);
});
test("Koins require at least one enabled feature, irrespective of the wallet balance", () => {
  assert.equal(koinsVisible(), false);
  assert.equal(koinsVisible({}), false);
  assert.equal(
    koinsVisible({
      balance: 100,
      shopEnabled: false,
      codesEnabled: false,
      purchasesEnabled: false,
    }),
    false,
  );
  for (const key of ["shopEnabled", "codesEnabled", "purchasesEnabled"])
    assert.equal(koinsVisible({ [key]: true }), true);
});
test("document customization validates images, colors and links without executable content", () => {
  assert.deepEqual(normalizeDocumentTemplate(), defaultDocumentTemplate);
  for (const value of [
    { accentColor: "url(javascript:x)" },
    { logoImage: `/api/media/${"a".repeat(64)}.webp` },
    { links: [{ label: "x", url: "javascript:alert(1)" }] },
    { links: [{ url: "data:text/html,x" }] },
    { links: [{ url: "https://user:password@www.ktga.me/" }] },
  ])
    assert.throws(() => normalizeDocumentTemplate(value));
  assert.equal(
    normalizeDocumentTemplate({
      links: [{ label: "Contact", url: "mailto:contact@example.org" }],
    }).links.length,
    1,
  );
  assert.equal(
    validProviderInvoiceLink("https://invoice.stripe.com/i/test"),
    true,
  );
  assert.equal(
    validProviderInvoiceLink("https://invoice.stripe.com.evil.org/i/test"),
    false,
  );
});
