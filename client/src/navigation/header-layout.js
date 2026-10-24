export function visibleNavigationCount(
  widths,
  available,
  overflowWidth = 40,
  gap = 4,
) {
  if (!widths.length || available <= 0) return 0;
  const total =
    widths.reduce((sum, width) => sum + width, 0) + gap * (widths.length - 1);
  if (total <= available) return widths.length;
  let used = overflowWidth,
    count = 0;
  for (const width of widths) {
    if (used + gap + width > available) break;
    used += gap + width;
    count++;
  }
  return count;
}

export const koinsVisible = (config) =>
  Boolean(
    config?.shopEnabled || config?.codesEnabled || config?.purchasesEnabled,
  );
