import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { roomCredentialsError } from "../src/services/room-credentials.js";

test("room creation rejects autofilled account credentials without weakening account policy", async () => {
  const secret = "AccountSecret123!";
  const user = { email: "private@example.com", passwordHash: await bcrypt.hash(secret, 4) };
  const validate = (name = "", password = "") => roomCredentialsError({ name, password, user }, bcrypt.compare);
  assert.match(await validate("Table Private@Example.com"), /adresse email/);
  assert.match(await validate("another@example.org"), /adresse email/);
  assert.match(await validate(secret), /mot de passe/);
  assert.match(await validate("Table entre amis", secret), /différent/);
  assert.match(await validate("table-code", "table-code"), /mot de passe/);
  assert.equal(await validate("Table entre amis", "RoomCode123!"), "");
  assert.equal(await validate(), "");
  assert.equal(await validate("Un pseudo public"), "");
  assert.match(await validate("ab"), /3 et 80/);
  assert.match(await validate("x".repeat(81)), /3 et 80/);
  assert.match(await validate("Une table", "abc"), /4 et 128/);
});

test("guests can use a table access code without an account password", async () => {
  assert.equal(await roomCredentialsError({ name: "Table invitée", password: "room-code", user: { guest: true } }, bcrypt.compare), "");
});
