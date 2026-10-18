import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_THEME, DEFAULT_TOKENS, THEME_FIELDS, validateTheme, normalizeTheme, themeVariables, importTheme, contrastRatio } from "../src/features/theme/config.js";
import { SETTINGS_SECTIONS, matchingSettings } from "../src/components/admin/settings-navigation.js";

test("themes round-trip through export and strip unrecognised declarations", () => {
  const theme = validateTheme({ ...DEFAULT_THEME, tokens: { ...DEFAULT_TOKENS, primary: "#ABCDEF", position: "fixed" }, extra: "ignored" });
  assert.equal(theme.tokens.primary, "#abcdef");
  assert.equal(theme.tokens.position, undefined);
  assert.equal(theme.extra, undefined);
  assert.deepEqual(importTheme(JSON.stringify({ version: 1, theme })), theme);
  assert.deepEqual(normalizeTheme(undefined), DEFAULT_THEME);
  assert.equal(Object.keys(themeVariables(theme)).length, THEME_FIELDS.length + 1);
});

test("themes reject CSS injection, arbitrary URLs, invalid dimensions and malformed imports", () => {
  for (const primary of ["red;display:none", "url(https://evil.test)", "#123456;", "var(--x)", "#fff", null]) {
    assert.throws(() => validateTheme({ ...DEFAULT_THEME, tokens: { ...DEFAULT_TOKENS, primary } }));
  }
  for (const backgroundImage of ["https://example.com/x.png", "javascript:alert(1)", "data:image/svg+xml,test", "/api/media/../secret", '/api/media/x.png");}body{display:none}']) assert.throws(() => validateTheme({ ...DEFAULT_THEME, backgroundImage }));
  for (const radius of [-1, 9, Infinity, NaN, "8"]) assert.throws(() => validateTheme({ ...DEFAULT_THEME, tokens: { ...DEFAULT_TOKENS, radius } }));
  assert.throws(() => validateTheme({ ...DEFAULT_THEME, id: 42 }));
  assert.throws(() => importTheme('{"version":2}'));
  assert.throws(() => importTheme(" ".repeat(50001)));
  const image = `/api/media/${"a".repeat(64)}.webp`;
  assert.equal(themeVariables({ ...DEFAULT_THEME, backgroundImage: image })["--site-image"], `url("${image}")`);
});

test("contrast and settings navigation remain predictable", () => {
  assert.equal(contrastRatio("#000000", "#ffffff"), 21);
  assert.equal(contrastRatio("#ffffff", "#ffffff"), 1);
  assert.equal(new Set(SETTINGS_SECTIONS.map(row => row.id)).size, SETTINGS_SECTIONS.length);
  assert.ok(matchingSettings("pwa").some(row => row.id === "branding"));
  assert.ok(matchingSettings("bonus").some(row => row.id === "bonus"));
  assert.equal(matchingSettings("nonexistent").length, 0);
});
