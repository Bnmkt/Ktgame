import assert from "node:assert/strict";
import test from "node:test";
import { parseMarkdownToken, remarkKtgaTokens, resolveMarkdownRank } from "../src/components/patchnotes/markdown-tokens.js";

test("custom markdown accepts valid dice, cards and ranks only", () => {
  assert.deepEqual(parseMarkdownToken("@!ktga-dice-6"), { kind: "dice", value: 6 });
  assert.deepEqual(parseMarkdownToken("@!ktga-card-AH"), { kind: "card", card: { rank: "A", suit: "H" } });
  assert.deepEqual(parseMarkdownToken("@!ktga-card-10-S"), { kind: "card", card: { rank: "10", suit: "S" } });
  assert.equal(parseMarkdownToken("@!ktga-dice-7"), null);
  assert.equal(parseMarkdownToken("@!ktga-card-evil"), null);
  assert.equal(parseMarkdownToken("@!ktga-rank-diamant3").division, 3);
});

test("rank names use configured division artwork without exposing Elo", () => {
  const ranks = [{ id: "diamond", name: "Diamant", divisions: 3, insignia: "shield", divisionInsignia: { III: { insignia: "gem", insigniaImage: "division-image" } } }];
  const rank = resolveMarkdownRank(parseMarkdownToken("@!ktga-rank-diamant3"), ranks);
  assert.equal(rank.label, "Diamant III");
  assert.equal(rank.insignia, "gem");
  assert.equal(rank.insigniaImage, "division-image");
  assert.equal(resolveMarkdownRank(parseMarkdownToken("@!ktga-rank-diamant4"), ranks), null);
});

test("tokens transform text in paragraphs but not code or link targets", () => {
  const tree = { type: "root", children: [{ type: "paragraph", children: [{ type: "text", value: "De @!ktga-dice-4 et @!ktga-dice-66" }, { type: "inlineCode", value: "@!ktga-dice-4" }, { type: "link", url: "https://example.com", children: [{ type: "text", value: "@!ktga-dice-2" }] }] }] };
  remarkKtgaTokens()(tree);
  const nodes = tree.children[0].children;
  assert.equal(nodes.filter((node) => node.type === "ktgaToken").length, 1);
  assert.equal(nodes.find((node) => node.type === "inlineCode").value, "@!ktga-dice-4");
  assert.equal(nodes.find((node) => node.type === "link").children[0].type, "text");
});
