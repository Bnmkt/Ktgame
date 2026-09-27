export function activityChartData(activity = [], days = 31) {
  const rows = [...activity].sort((a, b) => a.date.localeCompare(b.date)).slice(-days).map((row) => ({ ...row, count: Math.max(0, Math.trunc(Number(row.count) || 0)) }));
  const peak = Math.max(0, ...rows.map((row) => row.count));
  const step = Math.max(1, Math.ceil(peak / 4));
  const maximum = Math.max(1, Math.ceil(peak / step) * step);
  const ticks = Array.from({ length: maximum / step + 1 }, (_, index) => index * step);
  return { rows, peak, maximum, ticks, total: rows.reduce((total, row) => total + row.count, 0) };
}
