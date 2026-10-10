import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";

const INTERVAL = 5 * 60 * 1000;
const RETENTION = 30 * 86400000;

// Anonymous deltas only. No payloads, player identifiers, routes or secrets.
export function createExecutionHistory(filename, { now = Date.now } = {}) {
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 1000;
    CREATE TABLE IF NOT EXISTS execution_samples (
      boot TEXT NOT NULL, at INTEGER NOT NULL, service TEXT NOT NULL,
      completed INTEGER NOT NULL, failed INTEGER NOT NULL, rejected INTEGER NOT NULL,
      cancelled INTEGER NOT NULL, timed_out INTEGER NOT NULL, processing_ms REAL NOT NULL,
      processing_count INTEGER NOT NULL,
      PRIMARY KEY(boot,at,service)
    ); CREATE INDEX IF NOT EXISTS idx_execution_sample_at ON execution_samples(at);`);
  const insert = db.prepare("INSERT INTO execution_samples VALUES (?,?,?,?,?,?,?,?,?,?)");
  const boot = randomUUID();
  let previous = {}, lastAt = now(), cached;
  const summary = (days = 1) => {
    days = Math.max(1, Math.min(30, Math.trunc(Number(days) || 1)));
    const services = {};
    for (const row of db.prepare(`SELECT service,sum(completed) AS completed,sum(failed) AS failed,sum(rejected) AS rejected,
      sum(cancelled) AS cancelled,sum(timed_out) AS timedOut,sum(processing_ms) AS processingMs,sum(processing_count) AS processingCount
      FROM execution_samples WHERE at >= ? GROUP BY service`).all(now() - days * 86400000)) {
      services[row.service] = { ...row, averageMs: row.processingCount ? row.processingMs / row.processingCount : null };
      delete services[row.service].service;
    }
    return { intervalMinutes: 5, retentionDays: 30, days, services };
  };
  cached = summary();
  return {
    sample(services, force = false) {
      const at = now();
      if (!force && at - lastAt < INTERVAL) return;
      if (at <= lastAt) return;
      db.exec("BEGIN IMMEDIATE");
      try {
        for (const [name, row] of Object.entries(services)) {
          const prior = previous[name] ?? {};
          const delta = (key) => Math.max(0, (row[key] ?? 0) - (prior[key] ?? 0));
          const elapsed = Math.max(0, row.processing.totalMs - (prior.processing?.totalMs ?? 0));
          const measurements = Math.max(0, row.processing.count - (prior.processing?.count ?? 0));
          insert.run(boot, at, name, delta("completed"), delta("failed"), delta("rejected"), delta("cancelled"), delta("timedOut"), elapsed, measurements);
        }
        db.prepare("DELETE FROM execution_samples WHERE at < ?").run(at - RETENTION);
        db.exec("COMMIT");
      } catch (error) { db.exec("ROLLBACK"); throw error; }
      previous = structuredClone(services); lastAt = at; cached = summary();
    },
    health() { return cached; },
    summary,
    close() { db.close(); }
  };
}
