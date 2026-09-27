import assert from "node:assert/strict";
import test from "node:test";
import { paginate } from "../src/utils/pagination.js";

test("pages partition every entry without altering order or source", () => {
  const rows = Array.from({ length: 53 }, (_, id) => ({ id }));
  const pages = [1, 2, 3].map((page) => paginate(rows, page, 20));
  assert.deepEqual(pages.map((page) => page.rows.length), [20, 20, 13]);
  assert.deepEqual(pages.flatMap((page) => page.rows), rows);
  assert.equal(rows.length, 53);
});
test("empty and shrinking filtered lists always yield a valid page", () => {
  assert.deepEqual(paginate([], 100, 12), { rows: [], page: 1, totalPages: 1, totalItems: 0, pageSize: 12 });
  assert.equal(paginate([1, 2], 20, 12).page, 1);
  assert.equal(paginate([1, 2], -5, 1).page, 1);
  assert.equal(paginate([1, 2], NaN, 0).pageSize, 20);
});
test("leaderboard pagination preserves ties and absolute ranks", () => {
  const rows = Array.from({ length: 100 }, (_, index) => ({ rank: index === 20 ? 20 : index + 1 }));
  assert.equal(paginate(rows, 2, 20).rows[0].rank, 20);
  assert.equal(paginate(rows, 5, 20).rows.at(-1).rank, 100);
});
