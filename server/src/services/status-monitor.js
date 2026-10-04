import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createStatusDetections } from "./status-detections.js";

export const STATUS_SLOT_MS = 15 * 60 * 1000;
export const publicStatusComponents = [
  { id: "website", name: "Site web", description: "Interface publique et ressources du casino." },
  { id: "api", name: "API et comptes", description: "Connexion, profils et services applicatifs." },
  { id: "realtime", name: "Temps réel", description: "Mises à jour instantanées des salles et parties." },
  { id: "games", name: "Tables de jeu", description: "Création et exécution des mini-jeux." },
  { id: "database", name: "Données", description: "Stockage des comptes, parties et progressions." },
  { id: "email", name: "Emails", description: "Envoi des messages de validation de compte." }
];

const componentIds = new Set(publicStatusComponents.map((component) => component.id));
const probeStatuses = new Set(["operational", "degraded", "outage", "unknown"]);
const incidentTypes = new Set(["maintenance", "warning", "outage"]);
const incidentStates = new Set(["scheduled", "in_progress", "completed"]);
const allowedDisplayIntervals = new Set([15, 30, 60, 180, 360, 720, 1440]);
const defaultStatusSettings = Object.freeze({ historyDays: 90, displayIntervalMinutes: 360 });
const SHORT_RANGE_DAYS = 7;
const SHORT_RANGE_INTERVAL_MINUTES = 60;
const incidentStateOrder = { scheduled: 0, in_progress: 1, completed: 2 };
const statusWeight = { unknown: 0, operational: 1, maintenance: 2, degraded: 3, outage: 4 };
const clean = (value, max = 500) => String(value ?? "").replace(/[\x00-\x1f\x7f]/g, " ").trim().slice(0, max);
const cleanMarkdown = (value, max = 4000) => String(value ?? "").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "").trim().slice(0, max);
const incidentDate = (value, label) => {
  if (value == null || value === "") return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error(`${label} invalide.`);
  return new Date(timestamp).toISOString();
};
const validateIncidentPeriod = (startedAt, completedAt) => {
  if (startedAt && completedAt && Date.parse(completedAt) < Date.parse(startedAt)) {
    throw new Error("L’heure de résolution doit être postérieure au début de l’incident.");
  }
};
const bucketAt = (value = Date.now()) => new Date(Math.floor(Number(value) / STATUS_SLOT_MS) * STATUS_SLOT_MS).toISOString();
const dayAt = (value) => new Date(value).toISOString().slice(0, 10);
const worstStatus = (left, right) => statusWeight[right] > statusWeight[left] ? right : left;

function normalizeComponents(values) {
  const rows = Array.isArray(values) ? values : [];
  return [...new Set(rows.map(String).filter((id) => componentIds.has(id)))];
}

function normalizeIncidentUpdates(values, fallbackAt) {
  const byState = new Map();
  for (const entry of Array.isArray(values) ? values : []) {
    if (!incidentStates.has(entry?.state)) continue;
    const message = cleanMarkdown(entry.message);
    if (!message) continue;
    byState.set(entry.state, {
      id: clean(entry.id, 80) || randomUUID(),
      state: entry.state,
      message,
      createdAt: incidentDate(entry.createdAt, `Date ${entry.state}`) ?? fallbackAt
    });
  }
  return [...byState.values()].sort((left, right) => incidentStateOrder[left.state] - incidentStateOrder[right.state]);
}

function publicIncident(row) {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    state: row.state,
    components: JSON.parse(row.components || "[]"),
    message: row.message,
    scheduledAt: row.scheduled_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updates: []
  };
}

export function createStatusMonitor({ filename, now = () => Date.now() }) {
  if (filename !== ":memory:") mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=1000;
    CREATE TABLE IF NOT EXISTS status_slots (
      bucket_at TEXT NOT NULL,
      component_id TEXT NOT NULL,
      latest_status TEXT NOT NULL,
      worst_status TEXT NOT NULL,
      sample_count INTEGER NOT NULL DEFAULT 0,
      latency_sum REAL NOT NULL DEFAULT 0,
      latency_max REAL NOT NULL DEFAULT 0,
      message TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (bucket_at, component_id)
    );
    CREATE INDEX IF NOT EXISTS idx_status_slots_component_at ON status_slots(component_id, bucket_at);
    CREATE TABLE IF NOT EXISTS status_incidents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      state TEXT NOT NULL,
      components TEXT NOT NULL,
      message TEXT NOT NULL,
      scheduled_at TEXT,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      created_by TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_status_incidents_updated ON status_incidents(updated_at DESC);
    CREATE TABLE IF NOT EXISTS status_incident_updates (
      id TEXT PRIMARY KEY,
      incident_id TEXT NOT NULL,
      state TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_status_updates_incident_at ON status_incident_updates(incident_id, created_at);
    CREATE TABLE IF NOT EXISTS status_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const detections = createStatusDetections(db, publicStatusComponents, now);
  const readSlot = db.prepare("SELECT * FROM status_slots WHERE bucket_at = ? AND component_id = ?");
  const upsertSlot = db.prepare(`INSERT INTO status_slots(bucket_at,component_id,latest_status,worst_status,sample_count,latency_sum,latency_max,message,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?)
    ON CONFLICT(bucket_at,component_id) DO UPDATE SET latest_status=excluded.latest_status,worst_status=excluded.worst_status,sample_count=excluded.sample_count,latency_sum=excluded.latency_sum,latency_max=excluded.latency_max,message=excluded.message,updated_at=excluded.updated_at`);

  function statusSettings() {
    const values = Object.fromEntries(db.prepare("SELECT key,value FROM status_settings").all().map((row) => [row.key, Number(row.value)]));
    return {
      historyDays: Math.max(7, Math.min(365, Math.trunc(values.historyDays || defaultStatusSettings.historyDays))),
      displayIntervalMinutes: allowedDisplayIntervals.has(values.displayIntervalMinutes) ? values.displayIntervalMinutes : defaultStatusSettings.displayIntervalMinutes
    };
  }

  function updateStatusSettings(input = {}) {
    const historyDays = Math.max(7, Math.min(365, Math.trunc(Number(input.historyDays) || 0)));
    const displayIntervalMinutes = Math.trunc(Number(input.displayIntervalMinutes) || 0);
    if (!allowedDisplayIntervals.has(displayIntervalMinutes)) throw new Error("Intervalle d’affichage invalide.");
    if (historyDays * 1440 / displayIntervalMinutes > 10000) throw new Error("Cette durée contient trop de segments. Augmente l’intervalle d’affichage.");
    const write = db.prepare("INSERT INTO status_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
    db.exec("BEGIN IMMEDIATE");
    try {
      write.run("historyDays", String(historyDays));
      write.run("displayIntervalMinutes", String(displayIntervalMinutes));
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return statusSettings();
  }

  function recordComponent(component, timestamp = now()) {
    if (!componentIds.has(component.id)) return;
    const bucket = bucketAt(timestamp);
    const current = readSlot.get(bucket, component.id);
    const status = probeStatuses.has(component.status) ? component.status : "unknown";
    const latency = Math.max(0, Number(component.latencyMs) || 0);
    upsertSlot.run(
      bucket,
      component.id,
      status,
      current ? worstStatus(current.worst_status, status) : status,
      Number(current?.sample_count || 0) + 1,
      Number(current?.latency_sum || 0) + latency,
      Math.max(Number(current?.latency_max || 0), latency),
      clean(component.message, 300),
      new Date(timestamp).toISOString()
    );
    detections.observe(component, timestamp);
  }

  function recordSnapshot(components, timestamp = now()) {
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const component of components) recordComponent(component, timestamp);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  function backfillDowntime(timestamp = now()) {
    const latest = db.prepare("SELECT MAX(bucket_at) AS at FROM status_slots").get()?.at;
    if (!latest) return 0;
    const currentBucket = Date.parse(bucketAt(timestamp));
    const lastBucket = Date.parse(latest);
    if (!Number.isFinite(lastBucket) || currentBucket - lastBucket <= STATUS_SLOT_MS) return 0;
    const first = Math.max(lastBucket + STATUS_SLOT_MS, currentBucket - statusSettings().historyDays * 86400000);
    let count = 0;
    db.exec("BEGIN IMMEDIATE");
    try {
      for (let at = first; at < currentBucket; at += STATUS_SLOT_MS) {
        for (const component of publicStatusComponents) {
          const status = ["website", "email"].includes(component.id) ? "unknown" : "outage";
          recordComponent({ id: component.id, status, message: status === "outage" ? "Aucun relevé reçu pendant cette période." : "État non mesurable pendant l’interruption." }, at);
        }
        count += 1;
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return count;
  }

  function prune(timestamp = now()) {
    detections.prune(timestamp);
    db.prepare("DELETE FROM status_slots WHERE bucket_at < ?").run(new Date(timestamp - (statusSettings().historyDays + 10) * 86400000).toISOString());
    db.prepare("DELETE FROM status_incident_updates WHERE incident_id IN (SELECT id FROM status_incidents WHERE updated_at < ?)").run(new Date(timestamp - 400 * 86400000).toISOString());
    db.prepare("DELETE FROM status_incidents WHERE updated_at < ?").run(new Date(timestamp - 400 * 86400000).toISOString());
  }

  function incidentRows({ includeFutureUpdates = true } = {}) {
    const incidents = db.prepare("SELECT * FROM status_incidents ORDER BY COALESCE(scheduled_at, created_at) DESC, created_at DESC LIMIT 100").all().map(publicIncident);
    const updates = db.prepare("SELECT id,incident_id,state,message,created_at FROM status_incident_updates ORDER BY created_at ASC").all();
    const byId = new Map(incidents.map((incident) => [incident.id, incident]));
    for (const update of updates) {
      const incident = byId.get(update.incident_id);
      if (!incident || !includeFutureUpdates && incidentStateOrder[update.state] > incidentStateOrder[incident.state]) continue;
      incident.updates.push({ id: update.id, state: update.state, message: update.message, createdAt: update.created_at });
    }
    return incidents;
  }

  function createIncident(input, userId) {
    const createdAt = new Date(now()).toISOString();
    const title = clean(input.title, 120);
    const message = cleanMarkdown(input.message);
    const type = incidentTypes.has(input.type) ? input.type : "warning";
    const state = incidentStates.has(input.state) ? input.state : "scheduled";
    const components = normalizeComponents(input.components);
    if (!title || !message || !components.length) throw new Error("Titre, message et service concerné sont requis.");
    const id = randomUUID();
    const scheduledAt = incidentDate(input.scheduledAt, "Date prévue") ?? createdAt;
    const startedAt = state === "in_progress" || state === "completed" ? incidentDate(input.startedAt, "Heure de début") ?? createdAt : null;
    const completedAt = state === "completed" ? incidentDate(input.completedAt, "Heure de résolution") ?? createdAt : null;
    validateIncidentPeriod(startedAt, completedAt);
    const configuredUpdates = normalizeIncidentUpdates(input.updates, createdAt);
    if (!configuredUpdates.some((entry) => entry.state === state)) configuredUpdates.push({ id: randomUUID(), state, message, createdAt });
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("INSERT INTO status_incidents(id,title,type,state,components,message,scheduled_at,started_at,completed_at,created_at,updated_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(id, title, type, state, JSON.stringify(components), message, scheduledAt, startedAt, completedAt, createdAt, createdAt, clean(userId, 80));
      const insertUpdate = db.prepare("INSERT INTO status_incident_updates(id,incident_id,state,message,created_at) VALUES(?,?,?,?,?)");
      for (const update of configuredUpdates) insertUpdate.run(update.id, id, update.state, update.message, update.createdAt);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return incidentRows().find((incident) => incident.id === id);
  }

  function updateIncident(id, input) {
    const row = db.prepare("SELECT * FROM status_incidents WHERE id = ?").get(id);
    if (!row) return null;
    const state = incidentStates.has(input.state) ? input.state : row.state;
    const type = incidentTypes.has(input.type) ? input.type : row.type;
    const title = clean(input.title ?? row.title, 120);
    const message = cleanMarkdown(input.message ?? row.message);
    const components = Object.hasOwn(input, "components") ? normalizeComponents(input.components) : JSON.parse(row.components || "[]");
    if (!title || !message || !components.length) throw new Error("Titre, message et service concerné sont requis.");
    const updatedAt = new Date(now()).toISOString();
    const scheduledAt = Object.hasOwn(input, "scheduledAt") ? incidentDate(input.scheduledAt, "Date prévue") ?? row.scheduled_at : row.scheduled_at;
    let startedAt = Object.hasOwn(input, "startedAt") ? incidentDate(input.startedAt, "Heure de début") : row.started_at;
    let completedAt = Object.hasOwn(input, "completedAt") ? incidentDate(input.completedAt, "Heure de résolution") : row.completed_at;
    if (state === "in_progress") {
      startedAt ||= updatedAt;
      completedAt = null;
    } else if (state === "completed") {
      startedAt ||= updatedAt;
      completedAt ||= updatedAt;
    } else {
      startedAt = null;
      completedAt = null;
    }
    validateIncidentPeriod(startedAt, completedAt);
    const configuredUpdates = Array.isArray(input.updates) ? normalizeIncidentUpdates(input.updates, updatedAt) : null;
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("UPDATE status_incidents SET title=?,type=?,state=?,components=?,message=?,scheduled_at=?,started_at=?,completed_at=?,updated_at=? WHERE id=?")
        .run(title, type, state, JSON.stringify(components), message, scheduledAt, startedAt, completedAt, updatedAt, id);
      const insertUpdate = db.prepare("INSERT INTO status_incident_updates(id,incident_id,state,message,created_at) VALUES(?,?,?,?,?)");
      if (configuredUpdates) {
        if (!configuredUpdates.some((entry) => entry.state === state)) configuredUpdates.push({ id: randomUUID(), state, message, createdAt: updatedAt });
        db.prepare("DELETE FROM status_incident_updates WHERE incident_id=?").run(id);
        for (const update of configuredUpdates) insertUpdate.run(update.id, id, update.state, update.message, update.createdAt);
      } else if (state !== row.state || message !== row.message) {
        const existingUpdate = db.prepare("SELECT id FROM status_incident_updates WHERE incident_id=? AND state=? ORDER BY created_at DESC LIMIT 1").get(id, state);
        if (existingUpdate) {
          if (Object.hasOwn(input, "message")) db.prepare("UPDATE status_incident_updates SET message=? WHERE id=?").run(message, existingUpdate.id);
        } else insertUpdate.run(randomUUID(), id, state, message, updatedAt);
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return incidentRows().find((incident) => incident.id === id);
  }

  function timelinePeriod(days) {
    const settings = statusSettings();
    const rangeDays = Math.max(1, Math.min(settings.historyDays, Math.trunc(Number(days) || settings.historyDays)));
    const timestamp = now();
    const start = new Date(timestamp - (rangeDays - 1) * 86400000);
    start.setUTCHours(0, 0, 0, 0);
    const displayIntervalMinutes = rangeDays <= SHORT_RANGE_DAYS
      ? Math.min(settings.displayIntervalMinutes, SHORT_RANGE_INTERVAL_MINUTES)
      : settings.displayIntervalMinutes;
    const intervalMs = displayIntervalMinutes * 60000;
    const timelineStart = Math.floor(start.getTime() / intervalMs) * intervalMs;
    const timelineEnd = Math.floor(timestamp / intervalMs) * intervalMs;
    return { settings, rangeDays, timestamp, start, displayIntervalMinutes, intervalMs, timelineStart, timelineEnd };
  }

  function payload(days, { includeFutureUpdates = false } = {}) {
    const { settings, rangeDays, timestamp, start, displayIntervalMinutes, intervalMs, timelineStart, timelineEnd } = timelinePeriod(days);
    const rows = db.prepare("SELECT * FROM status_slots WHERE bucket_at >= ? ORDER BY bucket_at ASC").all(start.toISOString());
    const monitoringSince = db.prepare("SELECT MIN(bucket_at) AS at FROM status_slots").get()?.at ?? null;
    const incidents = incidentRows({ includeFutureUpdates });
    const activeIncidents = incidents.filter((incident) => incident.state === "in_progress");
    const dates = Array.from({ length: rangeDays }, (_, index) => new Date(start.getTime() + index * 86400000).toISOString().slice(0, 10));
    const timeline = [];
    for (let at = timelineStart; at <= timelineEnd; at += intervalMs) timeline.push({ at: new Date(at).toISOString(), components: {} });
    const investigationRanges = detections.publicRanges(new Date(timelineStart).toISOString(), new Date(timelineEnd + intervalMs).toISOString());
    const timelineIncidents = incidents.filter((incident) => {
      if (!["in_progress", "completed"].includes(incident.state) || !incident.scheduledAt) return false;
      const affectedAt = Date.parse(incident.scheduledAt);
      return Number.isFinite(affectedAt) && affectedAt >= timelineStart && affectedAt < timelineEnd + intervalMs;
    });
    const componentData = publicStatusComponents.map((definition) => {
      const componentRows = rows.filter((row) => row.component_id === definition.id);
      const latest = componentRows.at(-1);
      let currentStatus = latest?.latest_status ?? "unknown";
      let currentMessage = latest?.message ?? "Collecte en cours.";
      const incident = activeIncidents.find((entry) => entry.components.includes(definition.id));
      if (incident) {
        currentStatus = incident.type === "outage" ? "outage" : incident.type === "maintenance" ? "maintenance" : "degraded";
        currentMessage = incident.title;
      } else if (latest && timestamp - Date.parse(latest.updated_at) > 3 * 60 * 1000 && !["website", "email"].includes(definition.id)) {
        currentStatus = "outage";
        currentMessage = "La sonde ne transmet plus de relevés.";
      }
      const daily = dates.map((date) => {
        const dayRows = componentRows.filter((row) => dayAt(row.bucket_at) === date);
        if (!dayRows.length) return { date, status: "no_data", uptime: null, slots: 0, averageLatencyMs: null };
        const known = dayRows.filter((row) => row.worst_status !== "unknown");
        const outages = known.filter((row) => row.worst_status === "outage").length;
        const degraded = known.filter((row) => row.worst_status === "degraded").length;
        const samples = dayRows.reduce((sum, row) => sum + Number(row.sample_count || 0), 0);
        return {
          date,
          status: outages ? "outage" : degraded ? "degraded" : known.length ? "operational" : "no_data",
          uptime: known.length ? (known.length - outages) / known.length * 100 : null,
          slots: dayRows.length,
          averageLatencyMs: samples ? dayRows.reduce((sum, row) => sum + Number(row.latency_sum || 0), 0) / samples : null
        };
      });
      const knownRows = componentRows.filter((row) => row.worst_status !== "unknown");
      const outageRows = knownRows.filter((row) => row.worst_status === "outage");
      const latencySamples = componentRows.reduce((sum, row) => sum + Number(row.sample_count || 0), 0);
      const timelineRows = new Map();
      for (const row of componentRows) {
        const at = Math.floor(Date.parse(row.bucket_at) / intervalMs) * intervalMs;
        const key = new Date(at).toISOString();
        const grouped = timelineRows.get(key) ?? [];
        grouped.push(row);
        timelineRows.set(key, grouped);
      }
      for (const point of timeline) {
        const slotRows = timelineRows.get(point.at) ?? [];
        const known = slotRows.filter((row) => row.worst_status !== "unknown");
        const outages = known.filter((row) => row.worst_status === "outage").length;
        const degraded = known.filter((row) => row.worst_status === "degraded").length;
        const samples = slotRows.reduce((sum, row) => sum + Number(row.sample_count || 0), 0);
        point.components[definition.id] = {
          status: outages ? "outage" : degraded ? "degraded" : known.length ? "operational" : "no_data",
          uptime: known.length ? (known.length - outages) / known.length * 100 : null,
          samples,
          latencyMs: samples ? slotRows.reduce((sum, row) => sum + Number(row.latency_sum || 0), 0) / samples : null,
          investigation: Boolean(outages || degraded) && investigationRanges.some((entry) => entry.component_id === definition.id && Date.parse(entry.first_at) < Date.parse(point.at) + intervalMs && Date.parse(entry.last_at) >= Date.parse(point.at)),
          incidentIds: timelineIncidents.filter((entry) => {
            if (!entry.components.includes(definition.id)) return false;
            const pointStart = Date.parse(point.at);
            const pointEnd = pointStart + intervalMs;
            const affectedAt = Date.parse(entry.scheduledAt);
            return affectedAt >= pointStart && affectedAt < pointEnd;
          }).map((entry) => entry.id)
        };
      }
      return {
        ...definition,
        status: currentStatus,
        message: currentMessage,
        updatedAt: latest?.updated_at ?? null,
        latencyMs: latest?.sample_count ? Number(latest.latency_sum) / Number(latest.sample_count) : null,
        uptime: knownRows.length ? (knownRows.length - outageRows.length) / knownRows.length * 100 : null,
        averageLatencyMs: latencySamples ? componentRows.reduce((sum, row) => sum + Number(row.latency_sum || 0), 0) / latencySamples : null,
        days: daily
      };
    });
    const measurableComponents = componentData.filter((component) => component.status !== "unknown");
    const currentWorst = measurableComponents.length ? measurableComponents.reduce((status, component) => worstStatus(status, component.status), "operational") : "unknown";
    return {
      generatedAt: new Date(timestamp).toISOString(),
      monitoringSince,
      rangeDays,
      configuredRangeDays: settings.historyDays,
      slotMinutes: STATUS_SLOT_MS / 60000,
      displayIntervalMinutes,
      configuredDisplayIntervalMinutes: settings.displayIntervalMinutes,
      settings,
      status: currentWorst,
      components: componentData,
      timeline,
      justifications: timelineIncidents,
      incidents: incidents.filter((incident) => incident.state !== "completed"),
      history: incidents.filter((incident) => incident.state === "completed").slice(0, 30)
    };
  }

  function investigate({ component, at, days } = {}) {
    if (!componentIds.has(component) || typeof at !== "string" || !Number.isFinite(Date.parse(at))) throw new Error("Relevé invalide.");
    const { intervalMs, timelineStart, timelineEnd } = timelinePeriod(days);
    const timestamp = Date.parse(at);
    if (timestamp < timelineStart || timestamp > timelineEnd || timestamp % intervalMs || new Date(timestamp).toISOString() !== at) throw new Error("Relevé invalide.");
    const end = new Date(timestamp + intervalMs).toISOString();
    const anomaly = db.prepare("SELECT 1 FROM status_slots WHERE component_id=? AND bucket_at>=? AND bucket_at<? AND worst_status IN ('outage','degraded') LIMIT 1").get(component, at, end);
    const affected = anomaly && detections.publicRanges(at, end).some((row) => row.component_id === component);
    if (!affected) throw new Error("Ce relevé ne correspond pas à un dossier classé sans suite.");
    return detections.reopenPublic(component, at, end);
  }

  prune();
  return { recordSnapshot, backfillDowntime, prune, payload, investigate, statusSettings, updateStatusSettings, incidentRows, createIncident, updateIncident, detections, close: () => db.close() };
}

