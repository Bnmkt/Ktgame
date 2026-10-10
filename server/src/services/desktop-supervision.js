const pick = (row, keys) => Object.fromEntries(keys.filter((key) => row?.[key] !== undefined).map((key) => [key, row[key]]));
const timing = (row) => pick(row, ["count", "recentSamples", "averageMs", "p95Ms", "maxMs", "totalMs"]);
const counters = ["submitted", "completed", "failed", "rejected", "cancelled", "timedOut", "busy", "queued"];

export function desktopHealth(source) {
  const service = (row) => ({ ...pick(row, ["name", "mode", ...counters]), processing: timing(row.processing), wait: timing(row.wait) });
  const worker = (row) => ({ ...pick(row, ["status", "capacity", "started", "busy", "idle", "queued", "queueCapacity", "oldestWaitMs", ...counters]), processing: timing(row.processing), wait: timing(row.wait) });
  return {
    ...pick(source, ["generatedAt", "sampleIntervalSeconds", "status"]),
    processes: Object.fromEntries(Object.entries(source.processes ?? {}).map(([key, row]) => [key,
      pick(row, ["role", "status", "uptimeSeconds", "cpuPercent", "memoryRss", "memoryHeap", "eventLoopP95", "eventLoopMax", "busy", "inFlight", "taskCapacity", "queued", "queueCapacity", "oldestWaitMs", "stale"])])),
    processTotals: pick(source.processTotals, ["cpuPercent", "memoryRss"]),
    process: { ...pick(source.process, ["uptimeSeconds", "startedAt", "cpuPercent", "eventLoopUtilization"]), memory: pick(source.process?.memory, ["rss", "heapUsed", "heapTotal", "heapLimit"]) },
    system: pick(source.system, ["cpuCount", "cpuPercent", "totalMemory", "freeMemory"]),
    eventLoop: pick(source.eventLoop, ["meanMs", "p95Ms", "maxMs"]),
    traffic: pick(source.traffic, ["activeRequests", "totalRequests", "totalErrors", "requestsPerSecond", "averageDurationMs", "maxDurationMs"]),
    realtime: pick(source.realtime, ["sockets", "watchedConnections", "activeRooms", "playingRooms", "waitingRooms", "seatedHumans", "seatedBots"]),
    database: pick(source.database, ["fileBytes", "walBytes", "pageCount", "pageSize"]),
    workers: Object.fromEntries(Object.entries(source.workers ?? {}).map(([key, row]) => [key, worker(row)])),
    services: Object.fromEntries(Object.entries(source.services ?? {}).map(([key, row]) => [key, service(row)])),
    caches: Object.fromEntries(Object.entries(source.caches ?? {}).map(([key, row]) => [key, pick(row, ["entries", "capacity", "hits", "misses", "hitRate", "invalidations", "evictions"])])),
    history: (source.history ?? []).slice(-720).map((row) => ({
      ...pick(row, ["at", "cpuProcess", "cpuSystem", "memoryRss", "memoryHeap", "memorySystemUsed", "eventLoopP95", "eventLoopMax", "accountsCpu", "accountsRss", "accountsLoopP95", "accountsLoopMax", "accountsBusy", "accountsQueued", "requestsPerSecond", "requestLatencyAverage", "requestLatencyMax", "requestCount", "requestErrors", "sockets", "playingRooms", "waitingRooms", "seatedHumans", "workerBusy", "workerQueued", "readingWorkerBusy", "readingWorkerQueued"]),
      services: Object.fromEntries(Object.entries(row.services ?? {}).map(([key, entry]) => [key, pick(entry, ["completed", "failed", "queued", "busy", "processingP95", "waitP95"])]))
    }))
  };
}

export function desktopMetrics(source) {
  return {
    ...pick(source, ["generatedAt", "days"]),
    summary: pick(source.summary, ["accounts", "activeAccounts", "newAccounts", "activePlayers", "games", "totalGames", "transactions", "circulation"]),
    activity: { ...pick(source.activity, ["active1d", "active7d", "active30d", "averageGamesPerDay"]), daily: (source.activity?.daily ?? []).map((row) => pick(row, ["date", "games", "activePlayers", "signups", "transactions", "eventActions", "eventParticipants"])) },
    games: (source.games ?? []).map((row) => pick(row, ["id", "name", "type", "games", "uniquePlayers", "realSeats", "botSeats", "averagePlayers", "botRate"])),
    shop: pick(source.shop, ["catalogItems", "customItems", "purchases"]),
    achievements: pick(source.achievements, ["catalog", "unlocked", "averagePerUser", "completionRate"]),
    communityEvents: { summary: pick(source.communityEvents?.summary, ["total", "active", "scheduled", "actions", "uniqueParticipants"]) },
    rooms: pick(source.rooms, ["active", "playing", "waiting", "public", "private", "seatedPlayers", "seatedBots"])
  };
}

export function registerDesktopSupervision({ app, auth, requireBackOffice, health, metrics, status, version, viewerName, connectedUsers }) {
  let cachedMetrics = new Map();
  const route = (path, handler) => app.get(`/api/desktop/${path}`, auth, requireBackOffice, (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Vary", "Authorization, Cookie");
    handler(req, res);
  });
  route("overview", (req, res) => res.json({
    schemaVersion: 1, generatedAt: new Date().toISOString(), version: version(), timeZone: "Europe/Brussels",
    viewer: { name: viewerName(req.backOfficeUser), role: req.backOfficeUser.admin ? "admin" : "editor" },
    connectedUsers: connectedUsers(), health: desktopHealth(health(req.query.points))
  }));
  route("metrics", (req, res) => {
    const days = [30, 90, 365].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
    let entry = cachedMetrics.get(days);
    if (!entry || Date.now() - entry.at >= 60000) { entry = { at: Date.now(), data: desktopMetrics(metrics(days)) }; cachedMetrics.set(days, entry); }
    res.json({ ...entry.data, cachedAt: new Date(entry.at).toISOString(), refreshIntervalSeconds: 60 });
  });
  // Public incident contents only: private notes/diagnostics and moderation never reach editors.
  route("status", (req, res) => res.json(status(req.query.days)));
}
