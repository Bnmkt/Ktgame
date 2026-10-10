import assert from "node:assert/strict";
import test from "node:test";
import { createStatusMonitor, STATUS_SLOT_MS } from "../src/services/status-monitor.js";

const allOperational = () => ["website", "api", "realtime", "games", "database", "email"].map((id) => ({ id, status: "operational", latencyMs: 10 }));

test("une latence non mesuree n'est pas presentee comme zero", () => {
  const timestamp = Date.parse("2026-10-07T12:00:00Z");
  const monitor = createStatusMonitor({ filename: ":memory:", now: () => timestamp });
  try {
    monitor.recordSnapshot([{ id: "email", status: "operational" }, { id: "api", status: "operational", latencyMs: null }], timestamp);
    assert.equal(monitor.payload(1).components.find((row) => row.id === "email").latencyMs, null);
    assert.equal(monitor.payload(1).timeline.at(-1).components.api.latencyMs, null);
    monitor.recordSnapshot([{ id: "api", status: "operational", latencyMs: 4 }], timestamp);
    assert.equal(monitor.payload(1).components.find((row) => row.id === "api").latencyMs, 4);
  } finally { monitor.close(); }
});

test("les sondes sont consolidees par tranches de 15 minutes en conservant le pire etat", () => {
  let timestamp = Date.parse("2026-09-29T10:02:00.000Z");
  const monitor = createStatusMonitor({ filename: ":memory:", now: () => timestamp });
  monitor.recordSnapshot(allOperational(), timestamp);
  timestamp += 5 * 60 * 1000;
  monitor.recordSnapshot([{ id: "api", status: "degraded", latencyMs: 90 }], timestamp);

  const api = monitor.payload(1).components.find((component) => component.id === "api");
  assert.equal(api.days[0].slots, 1);
  assert.equal(api.days[0].status, "degraded");
  assert.equal(api.days[0].averageLatencyMs, 50);
  monitor.close();
});

test("les interruptions entre deux demarrages sont retro-remplies sans inventer le statut externe", () => {
  let timestamp = Date.parse("2026-09-29T10:00:00.000Z");
  const monitor = createStatusMonitor({ filename: ":memory:", now: () => timestamp });
  monitor.recordSnapshot(allOperational(), timestamp);
  timestamp += STATUS_SLOT_MS * 3;
  assert.equal(monitor.backfillDowntime(timestamp), 2);

  const status = monitor.payload(1);
  assert.equal(status.components.find((component) => component.id === "api").days[0].status, "outage");
  assert.equal(status.components.find((component) => component.id === "website").days[0].status, "operational");
  assert.equal(status.components.find((component) => component.id === "api").days[0].slots, 3);
  monitor.close();
});

test("un incident admin suit son cycle et surcharge temporairement le statut public", () => {
  let timestamp = Date.parse("2026-09-29T10:00:00.000Z");
  const monitor = createStatusMonitor({ filename: ":memory:", now: () => timestamp });
  monitor.recordSnapshot(allOperational(), timestamp);
  const incident = monitor.createIncident({ title: "Maintenance API", message: "Intervention planifiee.", type: "maintenance", state: "scheduled", components: ["api"] }, "admin");
  assert.equal(monitor.payload(90).status, "operational");

  timestamp += 60000;
  monitor.updateIncident(incident.id, { state: "in_progress", message: "Intervention en cours." });
  assert.equal(monitor.payload(90).components.find((component) => component.id === "api").status, "maintenance");

  timestamp += 60000;
  monitor.updateIncident(incident.id, { state: "completed", message: "Intervention terminee." });
  const result = monitor.payload(90);
  assert.equal(result.components.find((component) => component.id === "api").status, "operational");
  assert.equal(result.history[0].updates.length, 3);
  monitor.close();
});

test("les jours anterieurs au debut de la collecte restent sans donnees", () => {
  const timestamp = Date.parse("2026-09-29T10:00:00.000Z");
  const monitor = createStatusMonitor({ filename: ":memory:", now: () => timestamp });
  monitor.recordSnapshot(allOperational(), timestamp);
  const days = monitor.payload(3).components[0].days;
  assert.deepEqual(days.map((day) => day.status), ["no_data", "no_data", "operational"]);
  monitor.close();
});

test("un historique encore vide ne pretend pas que les services sont operationnels", () => {
  const monitor = createStatusMonitor({ filename: ":memory:" });
  const result = monitor.payload(1);
  assert.equal(result.status, "unknown");
  assert.ok(result.components.every((component) => component.status === "unknown"));
  monitor.close();
});

test("la duree et l'intervalle publics sont configurables sans modifier les slots sources", () => {
  const timestamp = Date.parse("2026-09-29T10:00:00.000Z");
  const monitor = createStatusMonitor({ filename: ":memory:", now: () => timestamp });
  assert.deepEqual(monitor.updateStatusSettings({ historyDays: 30, displayIntervalMinutes: 60 }), { historyDays: 30, displayIntervalMinutes: 60 });
  monitor.recordSnapshot(allOperational(), timestamp);
  const result = monitor.payload(7);
  assert.equal(result.rangeDays, 7);
  assert.equal(result.configuredRangeDays, 30);
  assert.equal(result.displayIntervalMinutes, 60);
  assert.ok(result.timeline.length <= 7 * 24 + 1);
  assert.equal(result.timeline.at(-1).components.api.status, "operational");
  assert.throws(() => monitor.updateStatusSettings({ historyDays: 365, displayIntervalMinutes: 15 }), /trop de segments/);
  monitor.close();
});

test("la vue sur sept jours conserve une granularite horaire avec un intervalle long", () => {
  const timestamp = Date.parse("2026-09-29T10:00:00.000Z");
  const monitor = createStatusMonitor({ filename: ":memory:", now: () => timestamp });
  monitor.updateStatusSettings({ historyDays: 90, displayIntervalMinutes: 1440 });
  monitor.recordSnapshot(allOperational(), timestamp);

  const week = monitor.payload(7);
  assert.equal(week.displayIntervalMinutes, 60);
  assert.equal(week.configuredDisplayIntervalMinutes, 1440);
  assert.ok(week.timeline.length > 7 * 20);
  assert.ok(week.timeline.length <= 7 * 24 + 1);

  const history = monitor.payload(90);
  assert.equal(history.displayIntervalMinutes, 1440);
  assert.equal(history.configuredDisplayIntervalMinutes, 1440);
  monitor.close();
});

test("un incident justifie uniquement le segment explicitement indique", () => {
  let timestamp = Date.parse("2026-09-30T12:00:00.000Z");
  const monitor = createStatusMonitor({ filename: ":memory:", now: () => timestamp });
  const incident = monitor.createIncident({
    title: "Dégradation expliquée",
    message: "Une dépendance externe a ralenti le site.",
    type: "warning",
    state: "in_progress",
    components: ["website"],
    scheduledAt: "2026-09-29T22:00:00.000Z",
    startedAt: "2026-09-29T23:00:00.000Z"
  }, "admin");
  timestamp += 60000;
  const completed = monitor.updateIncident(incident.id, {
    state: "completed",
    completedAt: "2026-09-30T01:00:00.000Z"
  });

  assert.equal(completed.startedAt, "2026-09-29T23:00:00.000Z");
  assert.equal(completed.completedAt, "2026-09-30T01:00:00.000Z");
  const result = monitor.payload(7);
  assert.deepEqual(result.timeline.find((point) => point.at === "2026-09-29T22:00:00.000Z").components.website.incidentIds, [incident.id]);
  assert.deepEqual(result.timeline.find((point) => point.at === "2026-09-29T23:00:00.000Z").components.website.incidentIds, []);
  assert.deepEqual(result.timeline.find((point) => point.at === "2026-09-30T00:00:00.000Z").components.website.incidentIds, []);
  assert.equal(result.justifications[0].id, incident.id);
  assert.throws(() => monitor.updateIncident(incident.id, { startedAt: "2026-09-30T02:00:00.000Z" }), /postérieure/);
  monitor.close();
});

test("les etapes futures restent editables par l'admin mais masquees au public", () => {
  let timestamp = Date.parse("2026-09-30T12:00:00.000Z");
  const monitor = createStatusMonitor({ filename: ":memory:", now: () => timestamp });
  const incident = monitor.createIncident({
    title: "Maintenance préparée",
    message: "Résumé **public**\n\nsur deux lignes.",
    type: "maintenance",
    state: "scheduled",
    components: ["api"],
    updates: [
      { state: "scheduled", createdAt: "2026-09-30T12:00:00.000Z", message: "Intervention *planifiée*." },
      { state: "in_progress", createdAt: "2026-09-30T13:00:00.000Z", message: "Intervention **en cours**." },
      { state: "completed", createdAt: "2026-09-30T14:00:00.000Z", message: "Service rétabli." }
    ]
  }, "admin");

  assert.equal(incident.updates.length, 3);
  assert.match(incident.message, /\n\n/);
  assert.deepEqual(monitor.payload(7).incidents[0].updates.map((entry) => entry.state), ["scheduled"]);
  assert.equal(monitor.payload(7, { includeFutureUpdates: true }).incidents[0].updates.length, 3);

  timestamp += 60000;
  monitor.updateIncident(incident.id, { state: "in_progress", startedAt: "2026-09-30T13:00:00.000Z" });
  assert.deepEqual(monitor.payload(7).incidents[0].updates.map((entry) => entry.state), ["scheduled", "in_progress"]);
  monitor.close();
});
