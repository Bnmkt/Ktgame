export function eventProgressDisplay(event, progress) {
  const value = Math.max(0, Number(progress) || 0);
  const milestones = event.objective?.milestones ?? [];
  const reached = new Set(event.runtime?.reachedMilestones ?? []);
  const isReached = (milestone) => reached.has(milestone.id) || value >= milestone.percent;
  const visible = milestones.filter((milestone) => milestone.percent <= 100 || isReached(milestone));
  const hasHiddenBonus = milestones.some((milestone) => milestone.percent > 100 && !isReached(milestone));
  // The reserve has a fixed visual size, independent of undiscovered thresholds.
  const extent = Math.max(100, value, ...visible.map((milestone) => milestone.percent));
  const scale = hasHiddenBonus ? extent / 0.88 : extent;
  return { visible, hasHiddenBonus, scale, fill: Math.min(100, value / scale * 100), isReached };
}
