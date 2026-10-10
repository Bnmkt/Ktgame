import assert from "node:assert/strict";
import test from "node:test";
import { featuredGame, gameImageUrl } from "../src/features/games/presentation.js";

test("game images allow HTTPS and absolute local paths, not executable or credential-bearing URLs", () => {
  for (const value of [null, "", "N/A", "na", "javascript:alert(1)", "data:image/svg+xml,x", "//external.test/x", "https://user:secret@example.com/x", "http://example.com/x", "relative/x", "/\\external.test/x", "/x\ny"]) assert.equal(gameImageUrl(value), "", String(value));
  assert.equal(gameImageUrl("/images/dice.webp"), "/images/dice.webp");
  assert.equal(gameImageUrl("https://example.com/dice.webp"), "https://example.com/dice.webp");
});

test("a single featured game falls back to the first available, never a disabled game", () => {
  const games = [{ id: "hidden", enabled: false }, { id: "yahtzee" }, { id: "421" }];
  assert.equal(featuredGame(games, "421").id, "421");
  for (const id of ["hidden", "missing", ""]) assert.equal(featuredGame(games, id).id, "yahtzee");
  assert.equal(featuredGame([], "421"), null);
});
