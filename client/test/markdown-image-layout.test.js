import assert from "node:assert/strict";
import test from "node:test";
import { markdownImageLayout } from "../src/components/patchnotes/markdown-image-layout.js";
test("Markdown floats only accept explicit directions and bounded widths", () => {
  assert.deepEqual(markdownImageLayout("float:right width:35%"), { side: "right", width: 35 });
  assert.deepEqual(markdownImageLayout("float:left width:99%"), { side: "left", width: 60 });
  for (const title of ["A caption", "float:fixed", "float:left;position:fixed", "float:right width:expression(x)"]) assert.equal(markdownImageLayout(title), null);
});
