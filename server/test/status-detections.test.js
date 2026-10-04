import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createStatusMonitor } from "../src/services/status-monitor.js";
import { createEmailStatusProbe, smtpDiagnostic } from "../src/services/email-status-probe.js";

test("les anomalies fusionnent par épisode, le rétablissement ne clôture pas le suivi privé", () => {
  let timestamp = Date.parse("2026-10-04T08:30:00Z");
  const monitor = createStatusMonitor({ filename: ":memory:", now: () => timestamp });
  try {
    const record = (status, diagnostic = "") => monitor.recordSnapshot([{ id: "email", status, message: "Connexion SMTP", diagnostic }], timestamp);
    record("degraded"); timestamp += 60000;
    record("outage", "EAUTH · AUTH · 535");
    assert.equal(monitor.detections.list().totalItems, 1);
    const incident = monitor.detections.list().rows[0];
    assert.equal(incident.severity, "outage");
    assert.equal(incident.sample_count, 2);
    assert.equal(incident.diagnostic, "EAUTH · AUTH · 535");
    monitor.detections.update(incident.id, { notes: "Note **privée**", state: "in_progress" }, "admin");
    timestamp += 60000; record("unknown");
    assert.equal(monitor.detections.list().rows[0].recovered_at, null);
    timestamp += 60000; record("operational");
    assert.equal(monitor.detections.list().rows[0].state, "in_progress");
    assert.equal(monitor.detections.summary().ongoing, 0);
    const publicPayload = JSON.stringify(monitor.payload(7));
    assert.equal(publicPayload.includes("Note **privée**"), false);
    assert.equal(publicPayload.includes("EAUTH"), false);
    assert.equal(monitor.payload(7).incidents.length, 0);
    monitor.detections.update(incident.id, { state: "closed" }, "admin");
    assert.equal(monitor.detections.list().totalItems, 0);
    assert.equal(monitor.detections.list({ state: "closed" }).totalItems, 1);
    timestamp += 60000; record("outage");
    assert.equal(monitor.detections.list().totalItems, 1);
    assert.equal(monitor.detections.list({ state: "all" }).totalItems, 2);
  } finally { monitor.close(); }
});

test("clôturer exige une conclusion et ne falsifie pas l’état de la sonde", () => {
  let timestamp = Date.parse("2026-10-04T08:30:00Z");
  const monitor = createStatusMonitor({ filename: ":memory:", now: () => timestamp });
  try {
    monitor.recordSnapshot([{ id: "api", status: "outage" }], timestamp);
    const row = monitor.detections.list().rows[0];
    assert.throws(() => monitor.detections.update(row.id, { state: "closed" }, "admin"), /conclusion/);
    assert.throws(() => monitor.detections.update(row.id, { state: "invalid" }, "admin"), /invalide/);
    monitor.detections.update(row.id, { state: "closed", notes: "Suivi repris dans un autre dossier." }, "admin");
    assert.equal(monitor.payload(7).components.find((entry) => entry.id === "api").status, "outage");
    timestamp += 60000;
    monitor.recordSnapshot([{ id: "api", status: "outage" }], timestamp);
    assert.equal(monitor.detections.list({ state: "all" }).totalItems, 1);
    assert.equal(monitor.detections.update(row.id, { state: "open" }, "admin").closed_at, null);
    assert.equal(monitor.detections.list().pageSize, 20);
    assert.equal(monitor.detections.list({ page: 999, pageSize: 999 }).page, 1);
  } finally { monitor.close(); }
});

test("les anciens relevés sont repris une seule fois, sans perdre les notes au redémarrage", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "ktga-detections-test-"));
  const filename = path.join(directory, "status.sqlite");
  let monitor;
  try {
    monitor = createStatusMonitor({ filename });
    monitor.recordSnapshot([{ id: "email", status: "outage" }], Date.now() - 600000);
    monitor.recordSnapshot([{ id: "email", status: "operational" }], Date.now());
    monitor.close(); monitor = null;
    const legacy = new DatabaseSync(filename);
    legacy.exec("DROP TABLE status_detections; DELETE FROM status_settings WHERE key='detections-migration'");
    legacy.close();
    monitor = createStatusMonitor({ filename });
    const row = monitor.detections.list().rows[0];
    assert.equal(row.source, "history");
    assert.match(row.description, /approximatives/);
    assert.ok(row.recovered_at);
    monitor.detections.update(row.id, { notes: "Revue historique", state: "closed" }, "admin");
    monitor.close(); monitor = createStatusMonitor({ filename });
    assert.equal(monitor.detections.list({ state: "all" }).totalItems, 1);
    assert.equal(monitor.detections.list({ state: "closed" }).rows[0].notes, "Revue historique");
  } finally {
    monitor?.close();
    const resolved = path.resolve(directory);
    if (path.dirname(resolved) !== path.resolve(tmpdir()) || !path.basename(resolved).startsWith("ktga-detections-test-")) throw new Error("Unsafe fixture cleanup");
    rmSync(resolved, { recursive: true, force: true });
  }
});

test("la reprise volumineuse résiste au ramasse-miettes et traverse les limites des lots", () => {
  const moduleUrl = new URL("../src/services/status-detections.js", import.meta.url).href;
  const script = `
    import assert from "node:assert/strict";
    import { DatabaseSync } from "node:sqlite";
    import { createStatusDetections } from ${JSON.stringify(moduleUrl)};
    const db = new DatabaseSync(":memory:");
    db.exec("CREATE TABLE status_settings(key TEXT PRIMARY KEY,value TEXT); CREATE TABLE status_slots(bucket_at TEXT,component_id TEXT,latest_status TEXT,worst_status TEXT,updated_at TEXT,latency_max REAL,message TEXT,PRIMARY KEY(bucket_at,component_id));");
    const components = ["website", "api", "realtime", "games", "database", "email"].map((id) => ({ id, name: id }));
    const insert = db.prepare("INSERT INTO status_slots VALUES(?,?,?,?,?,0,'fixture')");
    for (let index=0; index<201; index++) for (const component of components) {
      const at = new Date(Date.parse("2026-10-01T00:00:00Z") + index * 900000).toISOString();
      const status = component.id === "email" && index >= 82 && index <= 85 ? "outage" : "operational";
      insert.run(at, component.id, status, status, at);
    }
    const prepare = db.prepare.bind(db);
    let reads = 0;
    db.prepare = (sql) => {
      const statement = prepare(sql);
      return sql.startsWith("SELECT * FROM status_detections WHERE component_id")
        ? { get: (...args) => { if (++reads % 100 === 0) global.gc(); return statement.get(...args); } }
        : statement;
    };
    const detections = createStatusDetections(db, components, () => Date.parse("2026-10-04T00:00:00Z"));
    assert.equal(detections.list().totalItems, 1);
    assert.equal(detections.list().rows[0].component_id, "email");
    assert.ok(detections.list().rows[0].recovered_at);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM status_slots").get().count, 1206);
    assert.equal(db.prepare("SELECT value FROM status_settings WHERE key='detections-migration'").get().value, "1");
    assert.ok(reads > 1000);
    db.close();
  `;
  const result = spawnSync(process.execPath, ["--expose-gc", "--input-type=module", "-e", script], { encoding: "utf8", windowsHide: true, timeout: 30000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
});

test("la sonde SMTP retente les échecs après une minute et garde les succès quinze minutes", async () => {
  let checks = 0, failures = 0;
  const probe = createEmailStatusProbe({ verify: async () => (++checks === 1 ? { configured: true, ok: false, code: "EAUTH", command: "AUTH", responseCode: 535 } : { configured: true, ok: true }), onFailure: () => failures++ });
  const first = await probe(0);
  assert.equal(first.status, "outage");
  assert.match(first.diagnostic, /Authentification refusée/);
  await probe(30000); assert.equal(checks, 1);
  assert.equal((await probe(60000)).status, "operational");
  await probe(899999); assert.equal(checks, 2);
  await probe(960000); assert.equal(checks, 3);
  assert.equal(failures, 1);
  assert.equal(smtpDiagnostic({ code: "secret@example.com", command: "AUTH user:password", error: "secret" }).includes("secret"), false);
  const inactive = createEmailStatusProbe({ verify: async () => ({ configured: false, ok: false }) });
  assert.equal((await inactive()).status, "unknown");
});
