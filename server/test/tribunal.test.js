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
