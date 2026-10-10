import fs from "node:fs";

export const MAX_REPORT_BYTES = 7 * 1024 * 1024;

export function childDiagnostic(code, signal, stderr = "") {
  const error = /\b(ERR_[A-Z_]+|EACCES|ENOMEM|EMFILE|ENOSPC|ECONNREFUSED)\b/.exec(stderr)?.[0]
    ?? (/heap out of memory|allocation failed/i.test(stderr) ? "OUT_OF_MEMORY" : /SyntaxError|TypeError|ReferenceError/.exec(stderr)?.[0] ?? null);
  return { exitCode: Number.isInteger(code) ? code : null, signal: /^SIG[A-Z0-9]+$/.test(signal ?? "") ? signal : null, error };
}

export function collectReport(filename, progress, diagnostic, failures = {}) {
  let report, reportBytes = 0, issue;
  if (fs.existsSync(filename)) {
    reportBytes = fs.statSync(filename).size;
    if (reportBytes <= 32 * 1024 * 1024) {
      try { report = JSON.parse(fs.readFileSync(filename, "utf8")); } catch { issue = "REPORT_INVALID"; }
    } else issue = "REPORT_TOO_LARGE";
  } else issue = "REPORT_MISSING";
  if (!report) {
    const last = progress.at(-1) ?? {};
    report = { passed: false, incomplete: true, stopReason: "runner-failed", clients: last.clients,
      loadStartedAt: last.loadStartedAt, counters: Object.fromEntries(["requests", "errors", "actions", "completed"].map((key) => [key, last[key] ?? 0])),
      health: progress.map((row) => row.health).filter(Boolean), failures: { ...failures, [issue]: 1 } };
  }
  report.diagnostics = { generator: diagnostic, reportBytes, issue: issue ?? null };
  while (Buffer.byteLength(JSON.stringify(report)) > MAX_REPORT_BYTES && report.health?.length > 2) {
    const last = report.health.at(-1);
    report.health = report.health.filter((_row, index) => index % 2 === 0);
    if (report.health.at(-1) !== last) report.health.push(last);
    report.sampledHealth = true;
  }
  if (Buffer.byteLength(JSON.stringify(report)) > MAX_REPORT_BYTES) {
    return { passed: false, incomplete: true, stopReason: "runner-failed", counters: report.counters,
      diagnostics: { ...report.diagnostics, issue: "REPORT_TOO_LARGE" }, failures: { REPORT_TOO_LARGE: 1 } };
  }
  return report;
}
