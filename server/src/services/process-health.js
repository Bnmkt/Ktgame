export function accountsProcessHealth(work, now = Date.now()) {
  if (!work) return { role: "accounts", status: "disabled", busy: 0, queued: 0 };
  const health = work.health(), process = health.processes[0];
  const stale = process?.at && now - Date.parse(process.at) > 15000;
  const warning = health.status !== "healthy" || stale || process?.cpuPercent > 90 || process?.eventLoopP95 > 150;
  return { ...process, role: "accounts", status: warning ? "warning" : process?.status ?? "idle",
    busy: health.busy, queued: health.queued, queueCapacity: health.queueCapacity,
    inFlight: health.inFlight, taskCapacity: health.taskCapacity,
    oldestWaitMs: health.oldestWaitMs, stale: Boolean(stale), lastIssueAt: health.lastIssueAt };
}
