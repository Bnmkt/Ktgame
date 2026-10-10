import assert from "node:assert/strict";
import test from "node:test";
import { apiHealthProbe } from "../src/services/api-status-probe.js";

test("client refusals and short CPU spikes do not imply API outages", () => {
  assert.equal(apiHealthProbe({ rows: [{ requestCount: 10, requestErrors: 10, requestServerErrors: 0, cpuProcess: 100, eventLoopP95: 200, requestLatencyAverage: .25 }] }).status, "operational");
  assert.equal(apiHealthProbe({ rows: [] }).latencyMs, null);
  assert.equal(apiHealthProbe({ listening: false }).status, "outage");
});

test("real server errors and sustained load include actionable diagnostics", () => {
  const failed = apiHealthProbe({ rows: [{ requestCount: 30, requestServerErrors: 7, requestLatencyAverage: 2 }] });
  assert.equal(failed.status, "degraded"); assert.match(failed.diagnostic, /7 erreurs serveur/);
  assert.equal(apiHealthProbe({ rows: [{ requestCount: 1000, requestServerErrors: 5 }] }).status, "operational");
  const rows = Array.from({ length: 3 }, () => ({ cpuProcess: 95, eventLoopP95: 250 }));
  assert.match(apiHealthProbe({ rows }).diagnostic, /CPU/);
  const weighted = apiHealthProbe({ rows: [{ requestCount: 1, requestLatencyAverage: 100 }, { requestCount: 9, requestLatencyAverage: 10 }, { requestCount: 0, requestLatencyAverage: 0 }] });
  assert.equal(weighted.latencyMs, 19);
});
