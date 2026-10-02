import assert from "node:assert/strict";
import test from "node:test";
import { insertPatchnoteBlock } from "../src/features/patchnotes/editor.js";

test("un nouveau bloc est insere apres le bloc actif sans modifier la liste source", () => {
  const source = [{ id: "section" }, { id: "change" }, { id: "image" }];
  const inserted = { id: "paragraph" };
  const result = insertPatchnoteBlock(source, "change", inserted);
  assert.deepEqual(result.map((block) => block.id), ["section", "change", "paragraph", "image"]);
  assert.deepEqual(source.map((block) => block.id), ["section", "change", "image"]);
});

test("sans bloc actif, le nouveau bloc est ajoute a la fin", () => {
  const result = insertPatchnoteBlock([{ id: "section" }], "absent", { id: "change" });
  assert.deepEqual(result.map((block) => block.id), ["section", "change"]);
});
