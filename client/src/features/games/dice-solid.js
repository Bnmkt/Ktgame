import { Euler, Quaternion, Vector3 } from "three";

import { dieFaces } from "./dice-faces.js";
export { dieFaces, diePips, dieMaterialFaces } from "./dice-faces.js";

export function dieLandingQuaternion(value) {
  const face = dieFaces.find((entry) => entry.value === value);
  return new Quaternion().setFromUnitVectors(new Vector3(...(face?.normal ?? [0, 1, 0])), new Vector3(0, 1, 0));
}

export function createDieThrowVisual(random = Math.random) {
  return {
    yaw: random() * Math.PI * 2,
    turns: [3 + random() * 2, 2 + random() * 2, 2 + random() * 2],
    direction: random() < .5 ? -1 : 1,
    restX: (random() - .5) * 14,
    restZ: (random() - .5) * 14,
    bounce: .8 + random() * .4
  };
}

export function dieThrowPose(value, progress, index = 0, visual = {}) {
  const t = Math.max(0, Math.min(1, progress));
  const remaining = (1 - t) ** 3;
  const direction = visual.direction ?? (index % 2 ? -1 : 1);
  const spin = new Quaternion().setFromEuler(new Euler(
    remaining * Math.PI * (visual.turns?.[0] ?? 4 + index % 3),
    remaining * Math.PI * (visual.turns?.[1] ?? 2) * direction,
    remaining * Math.PI * (visual.turns?.[2] ?? 3) * direction
  ));
  const landing = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), visual.yaw ?? 0).multiply(dieLandingQuaternion(value));
  return {
    quaternion: spin.multiply(landing),
    height: ((1 - t) ** 3 * 55 + Math.abs(Math.sin(t * Math.PI * 3)) * (1 - t) * 30) * (visual.bounce ?? 1),
    offset: (t === 1 ? 0 : Math.sin(t * Math.PI) * (1 - t) * 22 * direction) + (visual.restX ?? 0) * t,
    depth: (visual.restZ ?? 0) * t
  };
}
