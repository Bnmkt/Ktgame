import test from "node:test";
import assert from "node:assert/strict";
import { applyVariableLines, variableLines } from "../src/features/pages/variable-lines.js";

test("bulk input adds many variables and preserves existing configuration", () => {
  const original = { key: "count", label: "Montant", type: "number", required: true, help: "Utile", options: [], defaultValue: 2 };
  const result = applyVariableLines("{count} : 42\n{image} : https://www.ktga.me/image.png\n{intro} : Bonjour : bienvenue", [original]);
  assert.deepEqual(result[0], { ...original, defaultValue: 42 });
  assert.equal(result[1].defaultValue, "https://www.ktga.me/image.png");
  assert.equal(result[2].defaultValue, "Bonjour : bienvenue");
  assert.equal(applyVariableLines(Array.from({ length: 100 }, (_, n) => `{variable_${n}} : Valeur ${n}`).join("\n")).length, 100);
  assert.throws(() => applyVariableLines(Array.from({ length: 129 }, (_, n) => `{variable_${n}} : x`).join("\n")), /128/);
});
test("bulk variables retain multiline text, booleans, omitted fields and reject ambiguous input", () => {
  const fields = [{ key: "message", type: "textarea", defaultValue: "Ligne 1\nLigne 2", required: false }, { key: "visible", type: "boolean", defaultValue: false }];
  assert.deepEqual(applyVariableLines(variableLines(fields), fields), fields);
  assert.equal(applyVariableLines("{visible} : oui", fields)[1].defaultValue, true);
  assert.equal(applyVariableLines("{visible} : non", fields)[1].defaultValue, false);
  assert.equal(applyVariableLines("", fields).length, 2);
  for (const source of ["invalid line", "{name}: x\n{name}: y", "{__proto__}: x", "{title}: x", '{x}: "incomplete']) assert.throws(() => applyVariableLines(source));
});
