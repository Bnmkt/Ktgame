import assert from "node:assert/strict";
import test from "node:test";
import { accountDraftError } from "../src/features/accounts/admin-profile.js";

test("la fiche admin conserve le login historique et valide les nouvelles valeurs", () => {
  const original = { login: "ancien", displayName: "Alice", tokens: 0, birthDate: "2000-01-01" };
  assert.equal(accountDraftError(original, original), "");
  assert.ok(accountDraftError({ ...original, login: "invalide" }, original));
  assert.ok(accountDraftError({ ...original, birthDate: "2000-02-30" }, original));
  assert.ok(accountDraftError({ ...original, tokens: -1 }, original));
  assert.ok(accountDraftError({ ...original, moderation: { softBan: { active: true, reason: "" } } }, original));
});
