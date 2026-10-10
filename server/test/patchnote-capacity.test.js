import assert from "node:assert/strict";
import test from "node:test";
import { completePatchnote021 } from "../scripts/publish-patchnote-0.2.1.mjs";

test("publication adds honest capacity notes without replacing the edited draft", () => {
  const note = { version: "0.2.1", blocks: [
    { id: "intro", type: "paragraph", content: "Original introduction" },
    { id: "custom-recap", type: "change", title: "My recap", content: "My own wording" },
    { id: "ranks", type: "change", content: "![Diamant](/api/ranked/insignia-images/abc)" }
  ] };
  const update = completePatchnote021(note, "2026-10-09T14:00:00.000Z");
  assert.equal(update.status, "published"); assert.equal(update.blocks.length, 8);
  assert.equal(update.blocks[0], note.blocks[0]); assert.deepEqual(update.blocks.slice(-2), note.blocks.slice(1));
  assert.match(update.blocks[3].content, /500 joueurs simulés/);
  assert.match(update.blocks[3].content, /1 000 joueurs actifs restent un objectif à valider/);
  const second = completePatchnote021({ ...note, blocks: update.blocks });
  assert.equal(second.blocks.length, update.blocks.length);
  assert.ok(!/\belo\b/i.test(JSON.stringify(update)));
  assert.throws(() => completePatchnote021({ ...note, version: "0.2.0" }));
});
