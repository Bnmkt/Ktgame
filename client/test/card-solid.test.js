import assert from "node:assert/strict";
import { test } from "node:test";
import { Quaternion, Vector3 } from "three";
import { cardRotation, cardSolidStyle } from "../src/features/games/card-solid.js";

test("card rotation uses a normalized axis and keeps the readable face toward the player", () => {
  const [x, y, z, angle] = cardSolidStyle["--card-solid-rest"].split(" ").map(parseFloat);
  const axis = new Vector3(x, y, z);
  assert.ok(Math.abs(axis.length() - 1) < .00001);
  const normal = new Vector3(0, 0, 1).applyQuaternion(new Quaternion().setFromAxisAngle(axis, angle));
  assert.ok(normal.z > .97);
  assert.ok(normal.x < 0 && normal.y < 0);
  assert.equal(cardRotation(0, 0), "0deg");
});

test("focused cards become flatter without changing their game value or allocating a renderer", () => {
  const angle = (value) => parseFloat(value.split(" ").at(-1));
  assert.ok(angle(cardSolidStyle["--card-solid-focus"]) < angle(cardSolidStyle["--card-solid-rest"]));
  assert.ok(Object.isFrozen(cardSolidStyle));
});
