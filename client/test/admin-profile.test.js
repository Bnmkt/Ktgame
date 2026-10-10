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

test("la fiche admin valide les totaux XP et les Elo sans accepter les champs vides", () => {
  const original = { login: "ancien", displayName: "Alice", tokens: 0 };
  assert.equal(accountDraftError({ ...original, gameXp: { yahtzee: 0 }, gameElo: { yahtzee: 1016.34 } }, original), "");
  for (const value of ["", -1, 1.5, Infinity, 1000000000001]) assert.ok(accountDraftError({ ...original, gameXp: { yahtzee: value } }, original));
  for (const value of ["", -10000001, 1.111, Infinity, 10000001]) assert.ok(accountDraftError({ ...original, gameElo: { yahtzee: value } }, original));
});
