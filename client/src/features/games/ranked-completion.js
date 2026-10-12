export function rankedCompletion(result) {
  if (!result) return null;
  const placement = Boolean(result.placement && !result.placement.completed);
  const reveal = Boolean(result.placement?.completed && result.beforeRank?.id === "unranked");
  const before = result.beforeRank?.order, after = result.afterRank?.order;
  const direction = result.cancelled ? "unchanged" : placement ? "placement" : reveal ? "reveal" : Number.isFinite(before) && Number.isFinite(after) && after !== before ? after > before ? "promotion" : "demotion" : result.delta > 0 ? "gain" : result.delta < 0 ? "loss" : "unchanged";
  const start = placement ? Math.max(0, result.placement.games - 1) / result.placement.required * 100 : result.beforeProgression?.progress ?? 0;
  const end = placement ? result.placement.games / result.placement.required * 100 : result.progression?.progress ?? start;
  return { direction, changed: ["promotion", "demotion", "reveal"].includes(direction), start, end,
    boundary: direction === "promotion" ? 100 : direction === "demotion" ? 0 : end,
    ranked: !placement && Number.isFinite(result.after), rank: result.afterRank };
}
