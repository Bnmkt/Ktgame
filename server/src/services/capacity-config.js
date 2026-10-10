import { games } from "../games/shared.js";

export const testLimits = {
  clients: [2, 2000], seconds: [10, 1800], rampMs: [50, 5000], roomRampMs: [80, 5000],
  actionMs: [250, 30000], browseMs: [5000, 120000], setupConcurrency: [1, 16],
  loopLimitMs: [100, 2000], freeMemoryMb: [150, 2048], errorLimit: [1, 100]
};
export const testDefaults = {
  clients: 10, seconds: 60, rampMs: 300, roomRampMs: 500, actionMs: 1000, browseMs: 5000,
  setupConcurrency: 1, loopLimitMs: 500, freeMemoryMb: 300, errorLimit: 10,
  routinePolls: true, liveState: true, ranked: false, chat: true, events: true, reconnect: true,
  games: games.map((game) => game.id)
};
export function validateTestConfig(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Configuration invalide.");
  if (Object.keys(input).some((key) => !Object.hasOwn(testDefaults, key))) throw new Error("Parametre de test inconnu.");
  const config = { ...testDefaults, ...input };
  for (const [key, [min, max]] of Object.entries(testLimits)) {
    if (!Number.isInteger(config[key]) || config[key] < min || config[key] > max) throw new Error(`${key} : ${min} a ${max}.`);
  }
  for (const key of ["routinePolls", "liveState", "ranked", "chat", "events", "reconnect"]) {
    if (typeof config[key] !== "boolean") throw new Error(`${key} doit etre un booleen.`);
  }
  if (!Array.isArray(config.games) || !config.games.length || config.games.length > games.length || config.games.some((id) => !games.some((game) => game.id === id))) throw new Error("Selectionne au moins un jeu valide.");
  config.games = [...new Set(config.games)];
  const minimum = Math.max(...games.filter((game) => config.games.includes(game.id)).map((game) => Math.max(2, game.minPlayers)));
  if (config.clients < minimum) throw new Error(`Ces jeux necessitent au moins ${minimum} joueurs.`);
  const ttl = config.seconds + config.clients * (config.rampMs + 300) / 1000 + Math.ceil(config.clients / 2) * config.roomRampMs / 1000 + 240;
  if (ttl > 6900) throw new Error("Preparation trop longue : reduis les joueurs ou les delais.");
  return config;
}

// Forward only runtime settings, never the production environment or its credentials.
export function testProcessEnvironment(env = process.env) {
  const keys = ["PATH", "Path", "SystemRoot", "WINDIR", "TEMP", "TMP", "TMPDIR", "HOME", "USERPROFILE", "COMSPEC", "LANG", "TZ", "CASINO_TIME_ZONE", "PASSWORD_WORKERS", "READING_WORKERS", "SQLITE_SYNCHRONOUS", "ACCOUNTS_PROCESS_ENABLED"];
  return { ...Object.fromEntries(keys.filter((key) => env[key] !== undefined).map((key) => [key, env[key]])), KTGA_TEST_CHILD: "1" };
}

export function testMetadata() {
  return { defaults: testDefaults, limits: testLimits, games: games.map(({ id, name, minPlayers, maxPlayers }) => ({ id, name, minPlayers, maxPlayers })), retentionDays: 30, retainedRuns: 50 };
}

export function sanitizeTestReport(report) {
  const output = {};
  if (Number.isInteger(report.credentialWorkFactor) && report.credentialWorkFactor >= 4 && report.credentialWorkFactor <= 14) output.credentialWorkFactor = report.credentialWorkFactor;
  for (const key of ["runId", "startedAt", "loadStartedAt", "finishedAt", "clients", "seated", "seconds", "rampMs", "roomRampMs", "setupConcurrency", "actionMs", "browseMs", "routinePolls", "liveState", "rateLimits", "counters", "statuses", "latency", "phases", "coverage", "health", "generator", "passed", "incomplete", "sampledHealth", "diagnostics"]) {
    if (report[key] !== undefined) output[key] = report[key];
  }
  output.stopReason = ["duration", "interrupted", "setup failed", "preparation failed", "runner-failed"].includes(report.stopReason) ? report.stopReason : "safety";
  output.routes = report.routes ?? {};
  output.failures = Object.entries(report.failures ?? {}).slice(0, 100).map(([reason, count]) => ({
    route: /^(GET|POST|DELETE|PATCH) \/api\/[a-zA-Z0-9/:-]+/.exec(reason)?.[0]?.replace(/:$/, "") ?? "Scenario",
    category: /^(?:GET|POST|DELETE|PATCH) \/api\/\S+:\s*(4\d\d|5\d\d)\b/.exec(reason)?.[1] ?? (/timeout|timed out/i.test(reason) ? "TIMEOUT" : /^REPORT_[A-Z_]+$/.test(reason) ? reason : "NETWORK_OR_SCENARIO"), count
  }));
  if (report.integrity) output.integrity = { checks: report.integrity.checks, counts: report.integrity.counts, xp: report.integrity.xp, passed: report.integrity.passed, xpDifferenceCount: report.integrity.xpDifferences?.length ?? 0 };
  // Defence in depth for future telemetry fields; error text and fixture credentials are not exported.
  return JSON.parse(JSON.stringify(output, (key, value) => /password|token|secret|cookie|email|authorization|manifest|database|userId|friendId/i.test(key) ? undefined : value));
}
