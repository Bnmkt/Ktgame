import assert from "node:assert/strict";
import test from "node:test";
import { markdownImageLayout } from "../src/components/patchnotes/markdown-image-layout.js";
test("Markdown floats only accept explicit directions and bounded widths", () => {
  assert.deepEqual(markdownImageLayout("float:right width:35%"), { side: "right", width: "35%", height: "auto" });
  assert.deepEqual(markdownImageLayout("float:left width:99%"), { side: "left", width: "60%", height: "auto" });
  assert.deepEqual(markdownImageLayout("float:left"), { side: "left", width: "40%", height: "auto" });
  for (const title of ["A caption", "float:fixed", "float:left;position:fixed", "float:right width:expression(x)", "float:left width:20px;", "float:left height:20%", "float:left width:-20px", "float:left height:0px"]) assert.equal(markdownImageLayout(title), null);
});

test("pixel widths and heights preserve units, defaults and safe limits", () => {
  assert.deepEqual(markdownImageLayout("float:left height:100px"), { side: "left", width: "auto", height: "100px" });
  assert.deepEqual(markdownImageLayout("float:right width:300px"), { side: "right", width: "300px", height: "auto" });
  assert.deepEqual(markdownImageLayout("float:left width:300px height:200px"), { side: "left", width: "300px", height: "200px" });
  assert.deepEqual(markdownImageLayout("float:right height:200px width:30%"), { side: "right", width: "30%", height: "200px" });
  assert.deepEqual(markdownImageLayout("float:left width:9999px height:9999px"), { side: "left", width: "2000px", height: "2000px" });
});
