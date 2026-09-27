import test from "node:test";
import assert from "node:assert/strict";
import { activityChartData } from "../src/features/profile/activity-chart.js";

test("activity graph uses integer ticks and zero peak with no data", () => {
  assert.deepEqual(activityChartData([]), { rows: [], peak: 0, maximum: 1, ticks: [0, 1], total: 0 });
  const result = activityChartData([{ date: "2026-09-01", count: 2 }]);
  assert.deepEqual(result.ticks, [0, 1, 2]); assert.equal(result.total, 2);
});
test("activity range is chronological, includes zero days, and scales to the peak", () => {
  const result = activityChartData([{ date: "2026-09-03", count: 17 }, { date: "2026-09-01", count: 10 }, { date: "2026-09-02", count: 0 }], 2);
  assert.deepEqual(result.rows.map((row) => row.count), [0, 17]);
  assert.equal(result.total, 17); assert.equal(result.peak, 17);
  assert.equal(result.maximum, 20); assert.deepEqual(result.ticks, [0, 5, 10, 15, 20]);
});
