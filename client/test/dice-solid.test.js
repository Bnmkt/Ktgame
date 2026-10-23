import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "three";
import { createDieThrowVisual, dieFaces, dieLandingQuaternion, dieMaterialFaces, diePips, dieThrowPose } from "../src/features/games/dice-solid.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { diceScoreRows } from "../src/features/games/dice-scoreboard.js";

test("a physical d6 has six unique faces and opposite faces sum to seven", () => {
  assert.deepEqual(dieFaces.map((face) => face.value).sort(), [1, 2, 3, 4, 5, 6]);
  for (const face of dieFaces) {
    const normal = new Vector3(...face.normal);
    const opposite = dieFaces.find((candidate) => normal.dot(new Vector3(...candidate.normal)) === -1);
    assert.equal(face.value + opposite.value, 7);
    assert.equal(diePips[face.value].length, face.value);
  }
});

test("every throw lands with the authoritative result facing up", () => {
  for (const face of dieFaces) {
    for (let index = 0; index < 8; index += 1) {
      const pose = dieThrowPose(face.value, 1, index);
      const normal = new Vector3(...face.normal).applyQuaternion(pose.quaternion);
      assert.ok(normal.distanceTo(new Vector3(0, 1, 0)) < 1e-10);
      assert.equal(pose.height, 0);
      assert.equal(pose.offset, 0);
      assert.ok(pose.quaternion.angleTo(dieLandingQuaternion(face.value)) < 1e-7);
    }
  }
});

test("rounded geometry retains the physical face numbering", () => {
  const geometry = new RoundedBoxGeometry(2, 2, 2, 4, .24);
  assert.equal(geometry.groups.length, 6);
  const normals = geometry.getAttribute("normal");
  geometry.groups.forEach((group) => {
    const face = dieFaces.find((entry) => entry.value === dieMaterialFaces[group.materialIndex]);
    const expected = new Vector3(...face.normal);
    let flatFaceVertices = 0;
    for (let i = group.start; i < group.start + group.count; i += 1) {
      if (new Vector3().fromBufferAttribute(normals, i).dot(expected) > .999) flatFaceVertices += 1;
    }
    assert.ok(flatFaceVertices > 0, `material ${group.materialIndex} must use face ${face.value}`);
  });
  geometry.dispose();
});

test("the throw visibly rotates and bounces but never changes its result", () => {
  const start = dieThrowPose(5, .15, 1), end = dieThrowPose(5, 1, 1);
  assert.ok(start.height > 0);
  assert.ok(start.quaternion.angleTo(end.quaternion) > .2);
  assert.deepEqual(dieThrowPose(5, 2, 1), end);
});

test("random resting orientations vary without changing the top face", () => {
  const a = createDieThrowVisual(() => .2), b = createDieThrowVisual(() => .8);
  for (const face of dieFaces) {
    const poses = [a, b].map((visual) => dieThrowPose(face.value, 1, 0, visual));
    assert.ok(poses[0].quaternion.angleTo(poses[1].quaternion) > .5);
    for (const pose of poses) {
      assert.ok(new Vector3(...face.normal).applyQuaternion(pose.quaternion).distanceTo(new Vector3(0, 1, 0)) < 1e-10);
      assert.equal(pose.height, 0);
      assert.ok(Math.abs(pose.offset) <= 7 && Math.abs(pose.depth) <= 7);
    }
  }
});

const players = [{ id: "me", pseudo: "Moi" }, { id: "other", pseudo: "Autre" }];
test("Farkle shows banked scores and only the active player's unbanked points", () => {
  const state = { gameId: "farkle", players, currentPlayerIndex: 1, scores: { me: 1000, other: 3000 }, turnScore: 450 };
  const rows = diceScoreRows(state, "me");
  assert.deepEqual(rows.map(({ score, pending, self, current }) => ({ score, pending, self, current })), [
    { score: 3000, pending: 450, self: false, current: true }, { score: 1000, pending: 0, self: true, current: false }
  ]);
  assert.ok(diceScoreRows({ ...state, bust: true }, "me").every((row) => row.pending === 0));
  assert.ok(diceScoreRows({ ...state, finished: true }, "me").every((row) => row.pending === 0 && !row.current));
});

test("421 and Cul de Chouette distinguish the pending roll from the cumulative score", () => {
  const state = { gameId: "421", players, currentPlayerIndex: 0, scores: { me: 700 }, currentCombination: { rank: 800 } };
  assert.equal(diceScoreRows(state, "me")[0].pending, 800);
  const cul = { ...state, gameId: "cul-de-chouette", lastRoll: { playerId: "me", pending: true, points: 60 } };
  assert.equal(diceScoreRows(cul, "me")[0].score, 700);
  assert.equal(diceScoreRows(cul, "me")[0].pending, 60);
  assert.equal(diceScoreRows({ ...cul, lastRoll: { ...cul.lastRoll, playerId: "other" } }, "me")[0].pending, 0);
  assert.deepEqual(diceScoreRows({ ...state, gameId: "blackjack" }, "me"), []);
});
