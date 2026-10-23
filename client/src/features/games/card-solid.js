import { Euler, MathUtils, Quaternion } from "three";

// Individual CSS rotation composes with the existing deal and flight transforms.
export function cardRotation(x, y) {
  const quaternion = new Quaternion().setFromEuler(new Euler(MathUtils.degToRad(x), MathUtils.degToRad(y), 0));
  const angle = 2 * Math.acos(MathUtils.clamp(quaternion.w, -1, 1));
  const length = Math.sin(angle / 2);
  if (length < .00001) return "0deg";
  return `${quaternion.x / length} ${quaternion.y / length} ${quaternion.z / length} ${angle}rad`;
}

export const cardSolidStyle = Object.freeze({
  "--card-solid-rest": cardRotation(7, -9),
  "--card-solid-focus": cardRotation(2, -3)
});
