// A single physical numbering shared by the 2D fallback and the 3D mesh.
export const dieFaces = Object.freeze([
  { value: 1, normal: [0, 1, 0] }, { value: 6, normal: [0, -1, 0] },
  { value: 2, normal: [1, 0, 0] }, { value: 5, normal: [-1, 0, 0] },
  { value: 3, normal: [0, 0, 1] }, { value: 4, normal: [0, 0, -1] }
]);
export const diePips = Object.freeze({
  1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9]
});
// BoxGeometry material groups: +X, -X, +Y, -Y, +Z, -Z.
export const dieMaterialFaces = Object.freeze([2, 5, 1, 6, 3, 4]);
