import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createTribunalStore, tribunalReward, tribunalVerdict } from "../src/services/tribunal.js";

test("la récompense suit les exemples du tribunal", () => {
  assert.equal(tribunalReward(2, 1.6, 1000), 850);
  assert.equal(tribunalReward(1, 4.8, 1000), 60);
});

test("le score comportemental ne peut qu'alourdir une décision future", () => {
  assert.equal(tribunalVerdict(2.6, 100).outcome, "not-guilty");
  assert.equal(tribunalVerdict(2.6, 20).outcome, "social-ban");
  assert.equal(tribunalVerdict(1, 100).outcome, "hard-ban-review");
  assert.ok(tribunalVerdict(1, 0, undefined, 3).finalScore < 1);
});

test("les sanctions administratives 49,3 diminuent le comportement et restent idempotentes", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "ktga-tribunal-admin-"));
  const store = createTribunalStore({ filename: path.join(directory, "tribunal.sqlite") });
  try {
    store.updateSettings({ administrativeSoftBanPenalty: 6, administrativeHardBanPenalty: 18 });
    const soft = store.recordAdministrativeDecision({ id: "admin-soft-1", userId: "accused", adminId: "admin", kind: "softBan", reason: "Interactions suspendues", startsAt: "2026-10-02T10:00:00.000Z", endsAt: "2026-10-09T10:00:00.000Z", durationDays: 7 }, Date.parse("2026-10-02T10:00:00.000Z"));
    assert.match(soft.code, /^49\.3-/);
    assert.equal(soft.source, "administrative-49-3");
    assert.equal(soft.behaviorBefore, 100);
    assert.equal(soft.behaviorAfter, 94);
    assert.equal(soft.settlementApplied, true);
    store.recordAdministrativeDecision({ id: "admin-soft-1", userId: "accused", adminId: "admin", kind: "softBan", reason: "Motif modifié" });
    assert.deepEqual(store.behavior("accused"), { score: 94, cases: 1, sanctions: 1 });
    const hard = store.recordAdministrativeDecision({ id: "admin-hard-1", userId: "accused", adminId: "admin", kind: "hardBan", reason: "Accès suspendu", durationDays: 3 }, Date.parse("2026-10-03T10:00:00.000Z"));
    assert.equal(hard.behaviorBefore, 94);
    assert.equal(hard.behaviorAfter, 76);
    assert.deepEqual(store.behavior("accused"), { score: 76, cases: 2, sanctions: 2 });
    assert.equal(store.adminSnapshot().cases.filter((entry) => entry.source === "administrative-49-3").length, 2);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("une sanction temporaire confirmée impose la baisse minimale configurée", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "ktga-tribunal-override-"));
  const store = createTribunalStore({ filename: path.join(directory, "tribunal.sqlite") });
  try {
    store.updateSettings({ minimumVotes: 1, administrativeHardBanPenalty: 15, verdictRules: [
      { id: "warning", maximumScore: 4, outcome: "warning", label: "Avertissement", defaultDays: 0 },
      { id: "clear", maximumScore: 5, outcome: "not-guilty", label: "Non coupable", defaultDays: 0 }
    ] });
    const report = store.createReport({ reporterId: "reporter", accusedId: "accused", category: "spam", description: "Messages répétés malgré plusieurs demandes d’arrêt explicites." }, 1000);
    const dossier = store.openCaseFromReports({ reportIds: [report.id], adminId: "admin" }, 2000);
    store.assign("juror", [dossier.id], 3000);
    store.vote(dossier.id, "juror", 4, "Les faits justifient un avertissement.", 4000);
    const [resolved] = store.resolveDue(5000, dossier.id);
    assert.equal(resolved.behaviorAfter, 100);
    store.recordAdministrativeDecision({ id: "other-decision", userId: "accused", adminId: "admin", kind: "softBan", reason: "Autres faits constatés après la délibération" }, 5500);
    const enforced = store.confirmDecision(dossier.id, "admin", { outcome: "hard-ban-review", days: 2 }, 6000);
    assert.equal(enforced.behaviorAfter, 80);
    assert.deepEqual(store.behavior("accused"), { score: 80, cases: 2, sanctions: 2 });
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("un signalement devient un dossier assigné, voté puis résolu", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "ktga-tribunal-"));
  const store = createTribunalStore({ filename: path.join(directory, "tribunal.sqlite"), random: () => 0 });
  try {
    store.updateSettings({ minimumVotes: 2, assignmentsPerJuror: 1, maximumReward: 1000 });
    const report = store.createReport({ reporterId: "reporter", accusedId: "accused", category: "harassment", description: "Messages répétés visant un autre joueur pendant la partie." }, 1000);
    assert.throws(() => store.createReport({ reporterId: "reporter", accusedId: "accused", category: "harassment", description: "Messages répétés visant un autre joueur pendant la partie." }, 2000), /DUPLICATE_REPORT/);
    const dossier = store.openCaseFromReports({ reportIds: [report.id], adminId: "admin", title: "Comportement en partie", summary: "Le signalement doit être évalué." }, 3000);
    store.assign("juror-1", [dossier.id], 4000);
    store.assign("juror-2", [dossier.id], 4000);
    store.vote(dossier.id, "juror-1", 2, "Les éléments concordent.", 5000);
    store.vote(dossier.id, "juror-2", 2, "Comportement établi.", 5000);
    const [resolved] = store.resolveDue(6000, dossier.id);
    assert.equal(resolved.outcome, "social-ban");
    assert.equal(resolved.finalScore, 2);
    assert.equal(resolved.votes.length, 2);
    assert.equal(store.casesAwaitingSettlement().length, 0);
    assert.equal(store.reportStats("accused").total, 1);
    store.confirmDecision(dossier.id, "admin", { outcome: "social-ban", days: 7 }, 6500);
    assert.equal(store.casesAwaitingSettlement().length, 1);
    assert.equal(store.behavior("accused").sanctions, 1);
    store.deleteForUser("accused", 7000);
    assert.equal(store.behavior("accused").score, 100);
    assert.match(store.adminSnapshot().cases[0].accusedId, /^deleted-/);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
