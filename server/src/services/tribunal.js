import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

export const tribunalCategories = Object.freeze([
  { id: "harassment", label: "Harcèlement ou intimidation" },
  { id: "cheating", label: "Triche ou exploitation" },
  { id: "game-sabotage", label: "Sabotage d’une partie" },
  { id: "identity", label: "Pseudo ou profil inapproprié" },
  { id: "spam", label: "Spam ou sollicitations" },
  { id: "other", label: "Autre comportement" }
]);

export const defaultTribunalSettings = Object.freeze({
  enabled: true,
  votingDurationHours: 72,
  minimumVotes: 5,
  assignmentsPerJuror: 3,
  minimumGames: 5,
  minimumBehaviorScore: 60,
  automaticReportThreshold: 3,
  automaticReviewEnabled: false,
  maximumReward: 1000,
  socialBanDays: 7,
  hardBanDays: 7,
  revealAccusedIdentity: false,
  behaviorPenaltyThreshold: 60,
  behaviorPenaltyMaximum: 1.5,
  priorSanctionPenalty: 0.2,
  administrativeSoftBanPenalty: 5,
  administrativeHardBanPenalty: 15,
  verdictRules: [
    { id: "permanent-ban", maximumScore: 0, outcome: "permanent-ban-review", label: "Bannissement définitif à confirmer", defaultDays: 0 },
    { id: "hard-ban", maximumScore: 1, outcome: "hard-ban-review", label: "Bannissement temporaire à confirmer", defaultDays: 7 },
    { id: "social-ban", maximumScore: 2, outcome: "social-ban", label: "Restriction sociale à confirmer", defaultDays: 7 },
    { id: "warning", maximumScore: 2.49, outcome: "warning", label: "Avertissement à confirmer", defaultDays: 0 },
    { id: "not-guilty", maximumScore: 5, outcome: "not-guilty", label: "Non coupable", defaultDays: 0 }
  ]
});

const clean = (value, maximum = 500) => String(value ?? "").trim().slice(0, maximum);
const json = (value, fallback) => {
  try { return JSON.parse(value); } catch { return fallback; }
};
const iso = (value = Date.now()) => new Date(value).toISOString();
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, Number(value) || 0));

export function normalizeTribunalSettings(value = {}) {
  const allowedOutcomes = new Set(["permanent-ban-review", "hard-ban-review", "social-ban", "warning", "not-guilty"]);
  const sourceRules = Array.isArray(value.verdictRules) && value.verdictRules.length ? value.verdictRules : defaultTribunalSettings.verdictRules;
  const verdictRules = sourceRules.slice(0, 10).map((rule, index) => ({
    id: clean(rule?.id, 50) || `rule-${index + 1}`,
    maximumScore: Math.round(clamp(rule?.maximumScore ?? 5, -1, 5) * 100) / 100,
    outcome: allowedOutcomes.has(rule?.outcome) ? rule.outcome : "warning",
    label: clean(rule?.label, 100) || "Décision à confirmer",
    defaultDays: Math.round(clamp(rule?.defaultDays ?? 0, 0, 3650))
  })).sort((left, right) => left.maximumScore - right.maximumScore);
  if (!verdictRules.some((rule) => rule.maximumScore >= 5)) verdictRules.push({ ...defaultTribunalSettings.verdictRules.at(-1) });
  return {
    enabled: value.enabled !== false,
    votingDurationHours: Math.round(clamp(value.votingDurationHours ?? 72, 1, 720)),
    minimumVotes: Math.round(clamp(value.minimumVotes ?? 5, 1, 100)),
    assignmentsPerJuror: Math.round(clamp(value.assignmentsPerJuror ?? 3, 1, 20)),
    minimumGames: Math.round(clamp(value.minimumGames ?? 5, 0, 10000)),
    minimumBehaviorScore: Math.round(clamp(value.minimumBehaviorScore ?? 60, 0, 100)),
    automaticReportThreshold: Math.round(clamp(value.automaticReportThreshold ?? 3, 2, 100)),
    automaticReviewEnabled: Boolean(value.automaticReviewEnabled),
    maximumReward: Math.round(clamp(value.maximumReward ?? 1000, 0, 100000)),
    socialBanDays: Math.round(clamp(value.socialBanDays ?? 7, 1, 30)),
    hardBanDays: Math.round(clamp(value.hardBanDays ?? 7, 1, 3650)),
    revealAccusedIdentity: false,
    behaviorPenaltyThreshold: Math.round(clamp(value.behaviorPenaltyThreshold ?? 60, 1, 100)),
    behaviorPenaltyMaximum: Math.round(clamp(value.behaviorPenaltyMaximum ?? 1.5, 0, 3) * 100) / 100,
    priorSanctionPenalty: Math.round(clamp(value.priorSanctionPenalty ?? 0.2, 0, 1) * 100) / 100,
    administrativeSoftBanPenalty: Math.round(clamp(value.administrativeSoftBanPenalty ?? 5, 1, 100)),
    administrativeHardBanPenalty: Math.round(clamp(value.administrativeHardBanPenalty ?? 15, 1, 100)),
    verdictRules
  };
}

export function tribunalReward(vote, finalScore, maximumReward = 1000) {
  const accuracy = Math.max(0, 1 - Math.abs(clamp(vote, 1, 5) - clamp(finalScore, -1, 5)) / 5);
  return Math.round((Math.max(0, Number(maximumReward) || 0) * accuracy ** 2) / 10) * 10;
}

export function tribunalVerdict(rawScore, behaviorScore = 100, settingsInput = defaultTribunalSettings, priorSanctions = 0) {
  const settings = normalizeTribunalSettings(settingsInput);
  const threshold = settings.behaviorPenaltyThreshold;
  const behaviorPenalty = Math.max(0, threshold - clamp(behaviorScore, 0, 100)) / threshold * settings.behaviorPenaltyMaximum;
  const sanctionPenalty = Math.max(0, Math.floor(Number(priorSanctions) || 0)) * settings.priorSanctionPenalty;
  const finalScore = Math.round(clamp(Number(rawScore) - behaviorPenalty - sanctionPenalty, -1, 5) * 100) / 100;
  const rule = settings.verdictRules.find((entry) => finalScore <= entry.maximumScore) ?? settings.verdictRules.at(-1);
  return { finalScore, outcome: rule.outcome, label: rule.label, behaviorPenalty: Math.round(behaviorPenalty * 100) / 100, sanctionPenalty: Math.round(sanctionPenalty * 100) / 100, ruleId: rule.id };
}

function mapReport(row) {
  return row ? {
    id: row.id,
    reporterId: row.reporter_id,
    accusedId: row.accused_id,
    category: row.category,
    description: row.description,
    evidence: json(row.evidence_json, []),
    context: json(row.context_json, {}),
    status: row.status,
    caseId: row.case_id ?? "",
    reviewNote: row.review_note ?? "",
    reviewedBy: row.reviewed_by ?? "",
    reviewedAt: row.reviewed_at ?? "",
    createdAt: row.created_at
  } : null;
}

function mapCase(row) {
  return row ? {
    id: row.id,
    code: row.public_code,
    accusedId: row.accused_id,
    title: row.title,
    summary: row.summary,
    evidence: json(row.evidence_json, []),
    status: row.status,
    source: row.source,
    reportCount: Number(row.report_count) || 0,
    minimumVotes: Number(row.minimum_votes) || 1,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    rawScore: row.raw_score === null ? null : Number(row.raw_score),
    finalScore: row.final_score === null ? null : Number(row.final_score),
    behaviorBefore: row.behavior_before === null ? null : Number(row.behavior_before),
    behaviorAfter: row.behavior_after === null ? null : Number(row.behavior_after),
    outcome: row.outcome ?? "",
    resolvedAt: row.resolved_at ?? "",
    resolvedBy: row.resolved_by ?? "",
    settlementApplied: Boolean(row.settlement_applied),
    sanctionApplied: Boolean(row.sanction_applied),
    hardBanDays: Number(row.hard_ban_days) || 0,
    socialBanDays: Number(row.social_ban_days) || 0,
    createdAt: row.created_at
  } : null;
}

export function createTribunalStore({ filename, random = Math.random }) {
  const databasePath = path.resolve(filename);
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS tribunal_settings (id INTEGER PRIMARY KEY CHECK(id = 1), data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS tribunal_reports (
      id TEXT PRIMARY KEY, reporter_id TEXT NOT NULL, accused_id TEXT NOT NULL, category TEXT NOT NULL,
      description TEXT NOT NULL, evidence_json TEXT NOT NULL, context_json TEXT NOT NULL,
      status TEXT NOT NULL, case_id TEXT, review_note TEXT, reviewed_by TEXT, reviewed_at TEXT, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tribunal_reports_review ON tribunal_reports(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tribunal_reports_accused ON tribunal_reports(accused_id, status, created_at DESC);
    CREATE TABLE IF NOT EXISTS tribunal_cases (
      id TEXT PRIMARY KEY, public_code TEXT NOT NULL UNIQUE, accused_id TEXT NOT NULL, title TEXT NOT NULL,
      summary TEXT NOT NULL, evidence_json TEXT NOT NULL, status TEXT NOT NULL, source TEXT NOT NULL,
      report_count INTEGER NOT NULL, minimum_votes INTEGER NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL,
      raw_score REAL, final_score REAL, behavior_before INTEGER, behavior_after INTEGER, outcome TEXT,
      resolved_at TEXT, resolved_by TEXT, settlement_applied INTEGER NOT NULL DEFAULT 0,
      sanction_applied INTEGER NOT NULL DEFAULT 0, hard_ban_days INTEGER NOT NULL, social_ban_days INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tribunal_cases_status ON tribunal_cases(status, ends_at);
    CREATE TABLE IF NOT EXISTS tribunal_assignments (
      case_id TEXT NOT NULL, juror_id TEXT NOT NULL, assigned_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
      PRIMARY KEY(case_id, juror_id), FOREIGN KEY(case_id) REFERENCES tribunal_cases(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_tribunal_assignments_juror ON tribunal_assignments(juror_id, status, assigned_at DESC);
    CREATE TABLE IF NOT EXISTS tribunal_votes (
      case_id TEXT NOT NULL, juror_id TEXT NOT NULL, score INTEGER NOT NULL, rationale TEXT NOT NULL,
      reward INTEGER, reward_paid INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
      PRIMARY KEY(case_id, juror_id), FOREIGN KEY(case_id) REFERENCES tribunal_cases(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS tribunal_behavior (
      user_id TEXT PRIMARY KEY, score INTEGER NOT NULL DEFAULT 100, cases INTEGER NOT NULL DEFAULT 0,
      sanctions INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL
    );
  `);
  if (!db.prepare("PRAGMA table_info(tribunal_behavior)").all().some((column) => column.name === "sanctions")) {
    db.exec("ALTER TABLE tribunal_behavior ADD COLUMN sanctions INTEGER NOT NULL DEFAULT 0");
  }
  if (!db.prepare("SELECT 1 FROM tribunal_settings WHERE id = 1").get()) {
    db.prepare("INSERT INTO tribunal_settings(id, data) VALUES(1, ?)").run(JSON.stringify(defaultTribunalSettings));
  }

  const store = {
    settings() {
      return normalizeTribunalSettings(json(db.prepare("SELECT data FROM tribunal_settings WHERE id = 1").get()?.data, {}));
    },
    updateSettings(value) {
      const next = normalizeTribunalSettings({ ...store.settings(), ...value });
      db.prepare("UPDATE tribunal_settings SET data = ? WHERE id = 1").run(JSON.stringify(next));
      return next;
    },
    behavior(userId) {
      const row = db.prepare("SELECT score, cases, sanctions FROM tribunal_behavior WHERE user_id = ?").get(userId);
      return { score: row ? Number(row.score) : 100, cases: row ? Number(row.cases) : 0, sanctions: row ? Number(row.sanctions) : 0 };
    },
    recordAdministrativeDecision({ id, userId, adminId, kind, reason, startsAt, endsAt, durationDays = 0 }, now = Date.now()) {
      const caseId = clean(id, 100) || randomUUID();
      const existing = db.prepare("SELECT * FROM tribunal_cases WHERE id = ?").get(caseId);
      if (existing) return mapCase(existing);
      if (!userId || !adminId || !["softBan", "hardBan"].includes(kind)) throw new Error("INVALID_ADMINISTRATIVE_DECISION");
      const settings = store.settings();
      const behaviorBefore = store.behavior(userId).score;
      const penalty = kind === "softBan" ? settings.administrativeSoftBanPenalty : settings.administrativeHardBanPenalty;
      const behaviorAfter = Math.max(0, behaviorBefore - penalty);
      const outcome = kind === "softBan" ? "social-ban" : "hard-ban-review";
      const label = kind === "softBan" ? "Restriction sociale" : "Bannissement temporaire";
      const at = iso(now);
      const begins = Number.isFinite(Date.parse(startsAt)) ? new Date(startsAt).toISOString() : at;
      const expires = Number.isFinite(Date.parse(endsAt)) ? new Date(endsAt).toISOString() : "";
      const days = Math.round(clamp(durationDays, 0, 3650));
      const sanitizedReason = clean(reason, 240) || "Décision administrative";
      const evidence = [
        { type: "moderation", label: "Sanction appliquée", value: label, occurredAt: begins },
        { type: "moderation", label: "Motif administratif", value: sanitizedReason, occurredAt: begins },
        { type: "moderation", label: "Échéance", value: expires || "Durée indéterminée", occurredAt: begins }
      ];
      const code = `49.3-${randomUUID().slice(0, 8).toUpperCase()}`;
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare(`INSERT INTO tribunal_cases(
          id, public_code, accused_id, title, summary, evidence_json, status, source, report_count, minimum_votes,
          starts_at, ends_at, raw_score, final_score, behavior_before, behavior_after, outcome, resolved_at, resolved_by,
          settlement_applied, sanction_applied, hard_ban_days, social_ban_days, created_at
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(caseId, code, userId, "Décision administrative 49,3", `${label} appliqué directement par l’administration. ${sanitizedReason}`, JSON.stringify(evidence), "resolved", "administrative-49-3", 0, 0, begins, begins, null, null, behaviorBefore, behaviorAfter, outcome, at, adminId, 1, 1, kind === "hardBan" ? days : 0, kind === "softBan" ? Math.min(days, 30) : 0, begins);
        db.prepare("INSERT INTO tribunal_behavior(user_id, score, cases, sanctions, updated_at) VALUES(?, ?, 1, 1, ?) ON CONFLICT(user_id) DO UPDATE SET score = excluded.score, cases = cases + 1, sanctions = sanctions + 1, updated_at = excluded.updated_at")
          .run(userId, behaviorAfter, at);
        db.exec("COMMIT");
      } catch (error) { db.exec("ROLLBACK"); throw error; }
      return mapCase(db.prepare("SELECT * FROM tribunal_cases WHERE id = ?").get(caseId));
    },
    reportStats(userId) {
      const row = db.prepare("SELECT count(*) AS total, count(DISTINCT reporter_id) AS reporters, sum(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending FROM tribunal_reports WHERE accused_id = ?").get(userId);
      return { total: Number(row?.total) || 0, reporters: Number(row?.reporters) || 0, pending: Number(row?.pending) || 0 };
    },
    createReport(input, now = Date.now()) {
      if (!input.reporterId || !input.accusedId || input.reporterId === input.accusedId) throw new Error("INVALID_REPORT_TARGET");
      if (!tribunalCategories.some((entry) => entry.id === input.category)) throw new Error("INVALID_REPORT_CATEGORY");
      const description = clean(input.description, 1200);
      if (description.length < 20) throw new Error("REPORT_DESCRIPTION_TOO_SHORT");
      const since = iso(now - 24 * 60 * 60 * 1000);
      const duplicate = db.prepare("SELECT id FROM tribunal_reports WHERE reporter_id = ? AND accused_id = ? AND category = ? AND created_at >= ? AND status != 'dismissed'").get(input.reporterId, input.accusedId, input.category, since);
      if (duplicate) throw new Error("DUPLICATE_REPORT");
      const report = {
        id: randomUUID(), reporterId: input.reporterId, accusedId: input.accusedId, category: input.category,
        description, evidence: Array.isArray(input.evidence) ? input.evidence.slice(0, 50) : [],
        context: input.context && typeof input.context === "object" ? input.context : {}, status: "pending", createdAt: iso(now)
      };
      db.prepare("INSERT INTO tribunal_reports(id, reporter_id, accused_id, category, description, evidence_json, context_json, status, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(report.id, report.reporterId, report.accusedId, report.category, report.description, JSON.stringify(report.evidence), JSON.stringify(report.context), report.status, report.createdAt);
      return report;
    },
    dismissReport(reportId, adminId, note = "", now = Date.now()) {
      const result = db.prepare("UPDATE tribunal_reports SET status = 'dismissed', review_note = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ? AND status = 'pending'")
        .run(clean(note, 500), adminId, iso(now), reportId);
      return result.changes > 0;
    },
    pendingReportIds(accusedId) {
      return db.prepare("SELECT id FROM tribunal_reports WHERE accused_id = ? AND status = 'pending' ORDER BY created_at").all(accusedId).map((row) => row.id);
    },
    pendingReporterCount(accusedId) {
      return Number(db.prepare("SELECT count(DISTINCT reporter_id) AS count FROM tribunal_reports WHERE accused_id = ? AND status = 'pending'").get(accusedId)?.count) || 0;
    },
    openCaseFromReports({ reportIds, adminId, title, summary, votingDurationHours, minimumVotes, hardBanDays, socialBanDays, source = "admin" }, now = Date.now()) {
      const ids = [...new Set((Array.isArray(reportIds) ? reportIds : []).map(String))];
      if (!ids.length) throw new Error("REPORT_REQUIRED");
      const placeholders = ids.map(() => "?").join(",");
      const reports = db.prepare(`SELECT * FROM tribunal_reports WHERE id IN (${placeholders}) AND status = 'pending'`).all(...ids).map(mapReport);
      if (!reports.length || reports.length !== ids.length) throw new Error("REPORT_NOT_AVAILABLE");
      const accusedId = reports[0].accusedId;
      if (reports.some((report) => report.accusedId !== accusedId)) throw new Error("REPORT_TARGET_MISMATCH");
      const settings = store.settings();
      const startedAt = iso(now);
      const hours = Math.round(clamp(votingDurationHours ?? settings.votingDurationHours, 1, 720));
      const caseRow = {
        id: randomUUID(), code: `TRI-${randomUUID().slice(0, 8).toUpperCase()}`, accusedId,
        title: clean(title, 120) || "Comportement en partie", summary: clean(summary, 2000) || reports.map((entry) => entry.description).join("\n\n"),
        evidence: reports.flatMap((entry) => entry.evidence).slice(0, 80), status: "voting", source: source === "automatic" ? "automatic" : "admin",
        reportCount: reports.length, minimumVotes: Math.round(clamp(minimumVotes ?? settings.minimumVotes, 1, 100)),
        startsAt: startedAt, endsAt: iso(now + hours * 60 * 60 * 1000), hardBanDays: Math.round(clamp(hardBanDays ?? settings.hardBanDays, 1, 3650)),
        socialBanDays: Math.round(clamp(socialBanDays ?? settings.socialBanDays, 1, 30)), createdAt: startedAt
      };
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare("INSERT INTO tribunal_cases(id, public_code, accused_id, title, summary, evidence_json, status, source, report_count, minimum_votes, starts_at, ends_at, hard_ban_days, social_ban_days, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .run(caseRow.id, caseRow.code, accusedId, caseRow.title, caseRow.summary, JSON.stringify(caseRow.evidence), caseRow.status, caseRow.source, caseRow.reportCount, caseRow.minimumVotes, caseRow.startsAt, caseRow.endsAt, caseRow.hardBanDays, caseRow.socialBanDays, caseRow.createdAt);
        const attach = db.prepare("UPDATE tribunal_reports SET status = 'accepted', case_id = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?");
        for (const report of reports) attach.run(caseRow.id, adminId, startedAt, report.id);
        db.exec("COMMIT");
      } catch (error) { db.exec("ROLLBACK"); throw error; }
      return caseRow;
    },
    assign(jurorId, eligibleCaseIds = [], now = Date.now()) {
      const active = db.prepare("SELECT case_id FROM tribunal_assignments WHERE juror_id = ? AND status = 'pending'").all(jurorId).map((row) => row.case_id);
      const candidates = [...new Set(eligibleCaseIds)].filter((caseId) => !active.includes(caseId));
      for (let index = candidates.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(random() * (index + 1));
        [candidates[index], candidates[swap]] = [candidates[swap], candidates[index]];
      }
      const insert = db.prepare("INSERT OR IGNORE INTO tribunal_assignments(case_id, juror_id, assigned_at, status) VALUES(?, ?, ?, 'pending')");
      for (const caseId of candidates) insert.run(caseId, jurorId, iso(now));
      return db.prepare("SELECT case_id FROM tribunal_assignments WHERE juror_id = ? AND status = 'pending'").all(jurorId).map((row) => row.case_id);
    },
    jurorCases(jurorId) {
      const rows = db.prepare("SELECT c.*, a.assigned_at, v.score AS vote_score, v.rationale AS vote_rationale, v.reward FROM tribunal_assignments a JOIN tribunal_cases c ON c.id = a.case_id LEFT JOIN tribunal_votes v ON v.case_id = c.id AND v.juror_id = a.juror_id WHERE a.juror_id = ? ORDER BY CASE c.status WHEN 'voting' THEN 0 ELSE 1 END, c.ends_at DESC LIMIT 100").all(jurorId);
      return rows.map((row) => ({ ...mapCase(row), assignedAt: row.assigned_at, vote: row.vote_score ? { score: Number(row.vote_score), rationale: row.vote_rationale, reward: row.reward === null ? null : Number(row.reward) } : null }));
    },
    openCases() {
      return db.prepare("SELECT * FROM tribunal_cases WHERE status = 'voting' ORDER BY ends_at").all().map(mapCase);
    },
    vote(caseId, jurorId, score, rationale = "", now = Date.now()) {
      const numericScore = Math.round(Number(score));
      if (numericScore < 1 || numericScore > 5) throw new Error("INVALID_VOTE");
      const assignment = db.prepare("SELECT c.status, c.ends_at, c.accused_id FROM tribunal_assignments a JOIN tribunal_cases c ON c.id = a.case_id WHERE a.case_id = ? AND a.juror_id = ? AND a.status = 'pending'").get(caseId, jurorId);
      if (!assignment) throw new Error("CASE_NOT_ASSIGNED");
      if (assignment.accused_id === jurorId || assignment.status !== "voting" || Date.parse(assignment.ends_at) <= now) throw new Error("VOTING_CLOSED");
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare("INSERT INTO tribunal_votes(case_id, juror_id, score, rationale, created_at) VALUES(?, ?, ?, ?, ?)").run(caseId, jurorId, numericScore, clean(rationale, 500), iso(now));
        db.prepare("UPDATE tribunal_assignments SET status = 'voted' WHERE case_id = ? AND juror_id = ?").run(caseId, jurorId);
        db.exec("COMMIT");
      } catch (error) { db.exec("ROLLBACK"); throw error; }
      return { caseId, score: numericScore };
    },
    resolveDue(now = Date.now(), forceCaseId = "") {
      const rows = forceCaseId
        ? db.prepare("SELECT * FROM tribunal_cases WHERE id = ? AND status = 'voting'").all(forceCaseId)
        : db.prepare("SELECT * FROM tribunal_cases WHERE status = 'voting' AND ends_at <= ?").all(iso(now));
      const resolved = [];
      for (const row of rows) {
        const votes = db.prepare("SELECT * FROM tribunal_votes WHERE case_id = ? ORDER BY created_at").all(row.id);
        if (votes.length < Number(row.minimum_votes) && !forceCaseId) {
          db.prepare("UPDATE tribunal_cases SET ends_at = ? WHERE id = ? AND status = 'voting'").run(iso(now + 24 * 60 * 60 * 1000), row.id);
          continue;
        }
        if (!votes.length) continue;
        const rawScore = votes.reduce((sum, vote) => sum + Number(vote.score), 0) / votes.length;
        const behavior = store.behavior(row.accused_id);
        const behaviorBefore = behavior.score;
        const settings = store.settings();
        const verdict = tribunalVerdict(rawScore, behaviorBefore, settings, behavior.sanctions);
        const behaviorAfter = verdict.finalScore < 2.5 ? Math.max(0, behaviorBefore - Math.max(1, Math.round((2.5 - verdict.finalScore) * 10))) : behaviorBefore;
        const status = verdict.outcome === "not-guilty" ? "resolved" : "awaiting-enforcement";
        db.exec("BEGIN IMMEDIATE");
        try {
          db.prepare("UPDATE tribunal_cases SET status = ?, raw_score = ?, final_score = ?, behavior_before = ?, behavior_after = ?, outcome = ?, resolved_at = ? WHERE id = ? AND status = 'voting'")
            .run(status, Math.round(rawScore * 100) / 100, verdict.finalScore, behaviorBefore, behaviorAfter, verdict.outcome, iso(now), row.id);
          db.prepare("INSERT INTO tribunal_behavior(user_id, score, cases, sanctions, updated_at) VALUES(?, ?, 1, 0, ?) ON CONFLICT(user_id) DO UPDATE SET cases = cases + 1, updated_at = excluded.updated_at")
            .run(row.accused_id, behaviorBefore, iso(now));
          const reward = db.prepare("UPDATE tribunal_votes SET reward = ? WHERE case_id = ? AND juror_id = ?");
          for (const vote of votes) reward.run(tribunalReward(vote.score, verdict.finalScore, store.settings().maximumReward), row.id, vote.juror_id);
          db.exec("COMMIT");
        } catch (error) { db.exec("ROLLBACK"); throw error; }
        resolved.push({ ...mapCase(db.prepare("SELECT * FROM tribunal_cases WHERE id = ?").get(row.id)), votes: store.votes(row.id) });
      }
      return resolved;
    },
    votes(caseId) {
      return db.prepare("SELECT juror_id, score, rationale, reward, reward_paid, created_at FROM tribunal_votes WHERE case_id = ? ORDER BY created_at").all(caseId).map((row) => ({ jurorId: row.juror_id, score: Number(row.score), rationale: row.rationale, reward: row.reward === null ? null : Number(row.reward), rewardPaid: Boolean(row.reward_paid), createdAt: row.created_at }));
    },
    casesAwaitingSettlement() {
      return db.prepare("SELECT * FROM tribunal_cases WHERE status = 'resolved' AND settlement_applied = 0 ORDER BY resolved_at").all().map((row) => ({ ...mapCase(row), votes: store.votes(row.id) }));
    },
    markSettlement(caseId) {
      db.prepare("UPDATE tribunal_cases SET settlement_applied = 1 WHERE id = ?").run(caseId);
    },
    markRewardPaid(caseId, jurorId) {
      db.prepare("UPDATE tribunal_votes SET reward_paid = 1 WHERE case_id = ? AND juror_id = ?").run(caseId, jurorId);
    },
    confirmDecision(caseId, adminId, { outcome, days = 0 } = {}, now = Date.now()) {
      const row = db.prepare("SELECT * FROM tribunal_cases WHERE id = ? AND status = 'awaiting-enforcement'").get(caseId);
      if (!row) return null;
      const allowed = new Set(["permanent-ban-review", "hard-ban-review", "social-ban", "warning", "not-guilty"]);
      const decision = allowed.has(outcome) ? outcome : row.outcome;
      const sanctionApplied = ["permanent-ban-review", "hard-ban-review", "social-ban"].includes(decision);
      const settings = store.settings();
      const behaviorBefore = Number(row.behavior_before);
      const minimumPenalty = decision === "social-ban" ? settings.administrativeSoftBanPenalty : ["permanent-ban-review", "hard-ban-review"].includes(decision) ? settings.administrativeHardBanPenalty : 0;
      const currentBehavior = store.behavior(row.accused_id).score;
      const penalty = Math.max(minimumPenalty, behaviorBefore - Number(row.behavior_after));
      const behaviorAfter = decision === "not-guilty" ? currentBehavior : Math.max(0, currentBehavior - penalty);
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare("UPDATE tribunal_cases SET status = 'resolved', outcome = ?, behavior_after = ?, sanction_applied = ?, hard_ban_days = ?, social_ban_days = ?, resolved_by = ?, resolved_at = ? WHERE id = ?")
          .run(decision, behaviorAfter, sanctionApplied ? 1 : 0, decision === "hard-ban-review" ? Math.round(clamp(days || row.hard_ban_days, 1, 3650)) : Number(row.hard_ban_days), decision === "social-ban" ? Math.round(clamp(days || row.social_ban_days, 1, 30)) : Number(row.social_ban_days), adminId, iso(now), caseId);
        db.prepare("UPDATE tribunal_behavior SET score = ?, sanctions = sanctions + ?, updated_at = ? WHERE user_id = ?")
          .run(behaviorAfter, sanctionApplied ? 1 : 0, iso(now), row.accused_id);
        db.exec("COMMIT");
      } catch (error) { db.exec("ROLLBACK"); throw error; }
      return mapCase(db.prepare("SELECT * FROM tribunal_cases WHERE id = ?").get(caseId));
    },
    dismissCase(caseId, adminId, note = "", now = Date.now()) {
      const result = db.prepare("UPDATE tribunal_cases SET status = 'dismissed', outcome = ?, resolved_by = ?, resolved_at = ? WHERE id = ? AND status IN ('voting','awaiting-enforcement')")
        .run(clean(note, 500) || "Dossier classé sans suite", adminId, iso(now), caseId);
      return result.changes > 0;
    },
    adminSnapshot() {
      const reports = db.prepare("SELECT * FROM tribunal_reports ORDER BY created_at DESC LIMIT 500").all().map(mapReport);
      const cases = db.prepare("SELECT c.*, (SELECT count(*) FROM tribunal_votes v WHERE v.case_id = c.id) AS vote_count FROM tribunal_cases c ORDER BY c.created_at DESC LIMIT 500").all().map((row) => ({ ...mapCase(row), voteCount: Number(row.vote_count) || 0 }));
      const count = (table, status) => Number(db.prepare(`SELECT count(*) AS count FROM ${table} WHERE status = ?`).get(status)?.count) || 0;
      return { settings: store.settings(), reports, cases, counts: { pendingReports: count("tribunal_reports", "pending"), voting: count("tribunal_cases", "voting"), awaitingEnforcement: count("tribunal_cases", "awaiting-enforcement"), resolved: count("tribunal_cases", "resolved") } };
    },
    reportIdsForCase(caseId) {
      return db.prepare("SELECT id FROM tribunal_reports WHERE case_id = ?").all(caseId).map((row) => row.id);
    },
    reporterIdsForCase(caseId) {
      return db.prepare("SELECT DISTINCT reporter_id FROM tribunal_reports WHERE case_id = ?").all(caseId).map((row) => row.reporter_id);
    },
    deleteForUser(userId, now = Date.now()) {
      const anonymousId = `deleted-${randomUUID()}`;
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare("DELETE FROM tribunal_reports WHERE status = 'pending' AND (reporter_id = ? OR accused_id = ?)").run(userId, userId);
        db.prepare("UPDATE tribunal_reports SET reporter_id = ? WHERE reporter_id = ?").run(anonymousId, userId);
        db.prepare("UPDATE tribunal_reports SET accused_id = ? WHERE accused_id = ?").run(anonymousId, userId);
        db.prepare("UPDATE tribunal_cases SET accused_id = ?, status = CASE WHEN status IN ('voting','awaiting-enforcement') THEN 'dismissed' ELSE status END, outcome = CASE WHEN status IN ('voting','awaiting-enforcement') THEN 'Compte supprimé' ELSE outcome END, resolved_at = CASE WHEN status IN ('voting','awaiting-enforcement') THEN ? ELSE resolved_at END WHERE accused_id = ?").run(anonymousId, iso(now), userId);
        db.prepare("UPDATE tribunal_assignments SET juror_id = ? WHERE juror_id = ?").run(anonymousId, userId);
        db.prepare("UPDATE tribunal_votes SET juror_id = ? WHERE juror_id = ?").run(anonymousId, userId);
        db.prepare("DELETE FROM tribunal_behavior WHERE user_id = ?").run(userId);
        db.exec("COMMIT");
      } catch (error) { db.exec("ROLLBACK"); throw error; }
    },
    close() { db.close(); }
  };
  return store;
}
