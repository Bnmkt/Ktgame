import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { codeLanguage, codeDiagnostics, sourceLanguage } from "../src/components/common/code-languages.js";
const diagnose = (language, doc) => codeDiagnostics({ state: EditorState.create({ doc, extensions: [codeLanguage(language)] }) }, language);

test("code editors select source languages and diagnose syntax without running code", () => {
  assert.equal(sourceLanguage("x.jsx"), "jsx");
  assert.equal(sourceLanguage("x.css"), "css");
  assert.equal(sourceLanguage("x.json"), "json");
  assert.equal(diagnose("json", '{"safe":true}').length, 0);
  assert.ok(diagnose("json", '{"safe":}').length);
  assert.equal(diagnose("jsx", 'const value = <div title="safe"/>;').length, 0);
  assert.ok(diagnose("javascript", "const = ;").length);
  assert.equal(diagnose("svg", "crown").length, 0);
  assert.equal(diagnose("svg", '<svg viewBox="0 0 24 24"><path d="M0 0"/></svg>').length, 0);
  assert.ok(diagnose("svg", '<svg><path></svg>').length);
  assert.equal(diagnose("css-declarations", "color: red; background: blue;").length, 0);
});
