import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_THEME, validateTheme, themeVariables, importTheme } from "../src/features/theme/config.js";

test("legacy themes keep the published reading surface without adding blur or shadow", () => {
  const legacy = { ...DEFAULT_THEME, tokens: { primary: "#e8c777" } };
  const theme = validateTheme(legacy);
  assert.equal(theme.tokens.contentOpacity, .94);
  assert.equal(theme.tokens.contentBlur, 0);
  assert.equal(theme.tokens.contentShadowOpacity, 0);
  assert.equal(themeVariables(theme)["--site-content-backdrop"], "none");
});

test("reading effects are validated, exported and emitted as bounded CSS tokens", () => {
  const theme = validateTheme({ ...DEFAULT_THEME, tokens: { ...DEFAULT_THEME.tokens, contentOpacity: .65, contentBlur: 12, contentShadowColor: "#123456", contentShadowOpacity: .6, contentShadowX: -12, contentShadowY: 20, contentShadowBlur: 40, contentShadowSpread: -8 } });
  assert.deepEqual(importTheme(JSON.stringify({ version: 1, theme })), theme);
  const css = themeVariables(theme);
  assert.equal(css["--site-content-opacity"], "0.65");
  assert.equal(css["--site-content-blur"], "12px");
  assert.equal(css["--site-content-backdrop"], "blur(12px)");
  assert.equal(css["--site-content-shadow-color"], "#123456");
  assert.equal(css["--site-content-shadow-x"], "-12px");
  assert.equal(css["--site-content-shadow-spread"], "-8px");
  for (const [key, value] of [["contentOpacity", 1.1], ["contentBlur", 25], ["contentShadowOpacity", -.1], ["contentShadowColor", "red;position:fixed"], ["contentShadowX", -65], ["contentShadowBlur", Infinity], ["contentShadowSpread", "8px"]]) assert.throws(() => validateTheme({ ...theme, tokens: { ...theme.tokens, [key]: value } }));
});
