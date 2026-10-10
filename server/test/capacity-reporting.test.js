import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { childDiagnostic, collectReport, MAX_REPORT_BYTES } from "../scripts/capacity/reporting.mjs";
import { sanitizeTestReport } from "../src/services/capacity-config.js";

test("diagnostic credential work factors are visible without exporting credentials", () => {
  const result = sanitizeTestReport({ credentialWorkFactor: 4, password: "private", passed: false });
  assert.equal(result.credentialWorkFactor, 4);
  assert.ok(!JSON.stringify(result).includes("private"));
  assert.equal(sanitizeTestReport({ credentialWorkFactor: "secret" }).credentialWorkFactor, undefined);
});

test("missing final reports retain measurements and never fabricate a pass", () => {
  const report = collectReport("missing-capacity-report.json", [{ clients: 200, requests: 50000, actions: 18000, errors: 0, health: { cpu: 80 } }], childDiagnostic(1, null, "TypeError: password=private"));
  assert.equal(report.passed, false); assert.equal(report.incomplete, true);
  assert.equal(report.counters.actions, 18000); assert.equal(report.diagnostics.generator.error, "TypeError");
  assert.equal(sanitizeTestReport(report).stopReason, "runner-failed");
  assert.ok(!JSON.stringify(report).includes("private"));
});

test("large reports are compacted for IPC while retaining the last health sample", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ktga-capacity-report-"));
  try {
    const filename = path.join(directory, "report.json"), health = Array.from({ length: 25 }, (_, i) => ({ at: i, payload: "x".repeat(400000) }));
    fs.writeFileSync(filename, JSON.stringify({ passed: true, health, counters: { errors: 0 } }));
    const report = collectReport(filename, [], childDiagnostic(0));
    assert.equal(report.passed, true); assert.equal(report.sampledHealth, true);
    assert.equal(report.health.at(-1).at, 24); assert.ok(Buffer.byteLength(JSON.stringify(report)) <= MAX_REPORT_BYTES);
    assert.ok(report.diagnostics.reportBytes > 8 * 1024 * 1024);
    fs.writeFileSync(filename, "{");
    assert.equal(collectReport(filename, [], childDiagnostic(1)).diagnostics.issue, "REPORT_INVALID");
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("diagnostics disclose only exit metadata and known error codes", () => {
  assert.deepEqual(childDiagnostic(null, "SIGKILL", "some email secret"), { exitCode: null, signal: "SIGKILL", error: null });
  assert.equal(childDiagnostic(1, null, "fatal heap out of memory").error, "OUT_OF_MEMORY");
  assert.equal(sanitizeTestReport({ failures: { "Game worker 421 failed": 1 } }).failures[0].category, "NETWORK_OR_SCENARIO");
  assert.equal(sanitizeTestReport({ failures: { "Game worker: 421: POST /api/rooms/ABC/action timed out": 53 } }).failures[0].category, "TIMEOUT");
  assert.equal(sanitizeTestReport({ failures: { "GET /api/rooms/ABC: 503": 2 } }).failures[0].category, "503");
});
