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
    monitor.close(); monitor = null;
    const previousSchema = new DatabaseSync(filename);
    previousSchema.exec("ALTER TABLE status_detections DROP COLUMN dismissal_reason; ALTER TABLE status_detections DROP COLUMN dismissed_at; ALTER TABLE status_detections DROP COLUMN public_reopened_at;");
    previousSchema.close();
    monitor = createStatusMonitor({ filename });
    assert.equal(monitor.detections.list({ state: "all" }).totalItems, 1);
    assert.equal(monitor.detections.list({ state: "closed" }).rows[0].notes, "Revue historique");
    assert.equal(monitor.detections.list({ state: "closed" }).rows[0].dismissal_reason, "");
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

test("un refus SMTP transitoire doit etre confirme avant une panne", async () => {
  let attempts = 0;
  const probe = createEmailStatusProbe({ verify: async () => (++attempts < 3 ? { configured: true, ok: false, code: "ETIMEDOUT" } : { configured: true, ok: true }) });
  assert.equal((await probe(0)).status, "unknown");
  assert.equal((await probe(60000)).status, "outage");
  assert.equal((await probe(120000)).status, "operational");
});

test("les filtres par service, gravité et état conservent des comptes cohérents", () => {
  const timestamp = Date.parse("2026-10-04T08:30:00Z");
  const monitor = createStatusMonitor({ filename: ":memory:", now: () => timestamp });
  try {
    monitor.recordSnapshot([{ id: "email", status: "outage" }, { id: "api", status: "degraded" }], timestamp);
    const email = monitor.detections.list({ component: "email" }).rows[0];
    assert.throws(() => monitor.detections.update(email.id, { state: "dismissed" }, "admin"), /justificatif/);
    const dismissed = monitor.detections.update(email.id, { state: "dismissed", dismissal_reason: "Prestataire externe." }, "admin");
    assert.ok(dismissed.dismissed_at);
    assert.equal(dismissed.closed_at, null);
    assert.equal(monitor.detections.summary().pending, 1);
    assert.equal(monitor.detections.list().totalItems, 1);
    assert.equal(monitor.detections.list({ state: "closed" }).totalItems, 0);
    assert.equal(monitor.detections.list({ state: "dismissed" }).totalItems, 1);
    const filtered = monitor.detections.list({ state: "all", component: "email", severity: "outage" });
    assert.deepEqual({ ...filtered.counts }, { email: 1 });
    assert.equal(filtered.totalItems, 1);
    assert.equal(monitor.detections.list({ state: "all", component: "email", severity: "degraded" }).totalItems, 0);
    assert.ok(filtered.dismissalPresets.find((entry) => entry.id === "provider"));
    for (const input of [{ component: "invalid" }, { severity: "invalid" }, { state: "invalid" }]) assert.throws(() => monitor.detections.list(input), /invalide/);
  } finally { monitor.close(); }
});

test("les modifications groupées sont atomiques, conservent les titres et ajoutent les notes par défaut", () => {
  const timestamp = Date.parse("2026-10-04T08:30:00Z");
  const monitor = createStatusMonitor({ filename: ":memory:", now: () => timestamp });
  try {
    monitor.recordSnapshot([{ id: "email", status: "outage" }, { id: "api", status: "degraded" }], timestamp);
    const rows = monitor.detections.list().rows;
    const ids = rows.map((row) => row.id);
    monitor.detections.update(ids[0], { notes: "Vérification initiale." }, "admin");
    assert.throws(() => monitor.detections.batch(ids, { state: "closed" }, "admin"), /conclusion/);
    assert.equal(monitor.detections.list().rows.every((row) => row.state === "open"), true);
    assert.throws(() => monitor.detections.batch([...ids, "missing"], { state: "in_progress" }, "admin"), /Aucun changement/);
    assert.throws(() => monitor.detections.batch(ids, { state: "dismissed", dismissal_reason: " " }, "admin"), /justificatif/);
    assert.throws(() => monitor.detections.batch([], { state: "open" }, "admin"), /100/);
    assert.throws(() => monitor.detections.batch(Array(101).fill(ids[0]), { state: "open" }, "admin"), /100/);
    assert.throws(() => monitor.detections.batch(ids, { title: "Commun" }, "admin"), /individuellement/);
    assert.throws(() => monitor.detections.batch(ids, {}, "admin"), /modification/);
    assert.equal(monitor.detections.history(ids[0]).length, 1);
    assert.deepEqual(monitor.detections.batch([...ids, ids[0]], { state: "dismissed", notes: "Fournisseur sollicité.", dismissal_reason: "Incident externe." }, "admin"), { updated: 2 });
    const dismissed = monitor.detections.list({ state: "dismissed" }).rows;
    assert.equal(dismissed.find((row) => row.id === ids[0]).notes, "Vérification initiale.\n\nFournisseur sollicité.");
    assert.deepEqual(dismissed.map((row) => row.title), rows.map((row) => row.title));
    monitor.detections.batch(ids, { state: "closed", notesMode: "replace", notes: "Conclusion." }, "admin");
    assert.equal(monitor.detections.list({ state: "closed" }).rows.every((row) => row.notes === "Conclusion."), true);
    const history = monitor.detections.history(ids[0]);
    assert.equal(history.length, 3);
    assert.match(history[1].notes, /Vérification initiale/);
    monitor.detections.update(ids[0], { notes: "x".repeat(7999) }, "admin");
    assert.throws(() => monitor.detections.batch(ids, { notes: "Note supplémentaire." }, "admin"), /8 000/);
    assert.equal(monitor.detections.list({ state: "closed" }).rows.find((row) => row.id === ids[1]).notes, "Conclusion.");
  } finally { monitor.close(); }
});

test("un clic public rouvre uniquement les dossiers sans suite du segment anormal, sans exposer leur justification", () => {
  let timestamp = Date.parse("2026-10-03T22:32:00Z");
  const monitor = createStatusMonitor({ filename: ":memory:", now: () => timestamp });
  try {
    monitor.updateStatusSettings({ historyDays: 90, displayIntervalMinutes: 15 });
    monitor.recordSnapshot([{ id: "email", status: "outage", diagnostic: "EAUTH privé" }, { id: "api", status: "degraded" }], timestamp);
    const row = monitor.detections.list().rows.find((entry) => entry.component_id === "email");
    const apiRow = monitor.detections.list().rows.find((entry) => entry.component_id === "api");
    timestamp += 60000;
    monitor.recordSnapshot([{ id: "email", status: "operational" }], timestamp);
    timestamp = Date.parse("2026-10-04T10:00:00Z");
    monitor.recordSnapshot([{ id: "email", status: "operational" }], timestamp);
    monitor.detections.update(row.id, { state: "dismissed", notes: "Analyse privée.", dismissal_reason: "Refus OVH, détail privé." }, "admin");
    monitor.detections.update(apiRow.id, { state: "dismissed", dismissal_reason: "Autre dossier." }, "admin");
    const data = monitor.payload(7);
    assert.equal(data.history.length, 0);
    assert.equal(data.incidents.length, 0);
    const clickable = data.timeline.filter((point) => point.components.email.investigation);
    assert.equal(clickable.length, 1);
    assert.equal(clickable[0].at, "2026-10-03T22:30:00.000Z");
    for (const secret of [row.id, "Analyse privée", "Refus OVH", "EAUTH"]) assert.equal(JSON.stringify(data).includes(secret), false);
    assert.throws(() => monitor.investigate({ component: "games", at: clickable[0].at, days: 7 }), /ne correspond/);
    assert.throws(() => monitor.investigate({ component: "email", at: "2026-10-04T10:00:00.000Z", days: 7 }), /ne correspond/);
    assert.throws(() => monitor.investigate({ component: "invalid", at: "invalid" }), /invalide/);
    assert.equal(monitor.detections.list().totalItems, 0);
    assert.deepEqual(monitor.investigate({ component: "email", at: clickable[0].at, days: 7 }), { state: "in_progress" });
    const reopened = monitor.detections.list().rows[0];
    assert.equal(reopened.dismissal_reason, "Refus OVH, détail privé.");
    assert.equal(reopened.notes, "Analyse privée.");
    assert.equal(reopened.public_reopened_at, new Date(timestamp).toISOString());
    assert.equal(monitor.detections.list({ state: "dismissed" }).rows[0].id, apiRow.id);
    assert.equal(monitor.detections.history(row.id).at(0).created_by, "public-status");
    monitor.investigate({ component: "email", at: clickable[0].at, days: 7 });
    assert.equal(monitor.detections.history(row.id).length, 2);
    assert.equal(monitor.payload(7).timeline.filter((point) => point.components.email.investigation).length, 1);
    monitor.detections.update(row.id, { state: "closed" }, "admin");
    assert.equal(monitor.payload(7).timeline.some((point) => point.components.email.investigation), false);
  } finally { monitor.close(); }
});
