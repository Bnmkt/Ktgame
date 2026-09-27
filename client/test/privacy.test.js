import test from "node:test";
import assert from "node:assert/strict";
import { CONSENT_DURATION, PRIVACY_VERSION, extractMarkers, readConsent } from "../src/privacy/consent.js";
import { appPath, readRoute } from "../src/navigation/routes.js";
import { buildGuidedAchievement } from "../src/components/admin/achievement-guide.js";
import { normalizeAchievementRule, consumeAchievementEvent } from "../../server/src/services/achievement-rules.js";

test("privacy storage expires safely and ignores invalid storage", () => {
  const now = Date.now();
  const choice = { version: PRIVACY_VERSION, chosenAt: now, enabled: false };
  const storage = { getItem: () => JSON.stringify(choice) };
  assert.deepEqual(readConsent(storage, now), choice);
  assert.equal(readConsent(storage, now + CONSENT_DURATION), null);
  assert.equal(readConsent({ getItem() { throw new Error("blocked"); } }), null);
});
test("only explicitly authorized URL markers are transmitted", () => {
  assert.deepEqual(extractMarkers("?secret=answer-42&password=private&email=a@b.be&challenge=unlisted", ["secret:answer-42", "password:private"]), ["secret:answer-42"]);
});
test("public legal routes respect deployment under /ktga", () => {
  for (const view of ["terms", "legal", "privacy", "cookies", "parents"]) {
    const pathname = appPath(view, "", "/ktga/");
    assert.ok(pathname.startsWith("/ktga/"));
    assert.deepEqual(readRoute({ pathname, search: "" }, "/ktga/"), { view });
  }
});
test("guided visit plus equipment generates executable conditions", () => {
  const entry = buildGuidedAchievement({ objective: "siteVisit", page: "shop", equippedItem: "fox", marker: "answer-42" }, []);
  const rule = normalizeAchievementRule(entry.rule);
  assert.equal(consumeAchievementEvent(rule, { type: "site.visit", payload: { page: "shop", markers: ["secret:answer-42"], player: { equippedItemIds: ["fox"] } } }).matched, true);
  assert.equal(consumeAchievementEvent(rule, { type: "site.visit", payload: { page: "shop", markers: [], player: { equippedItemIds: ["fox"] } } }).matched, false);
});
test("guided active time uses minutes converted to server-counted seconds", () => {
  const entry = buildGuidedAchievement({ objective: "activeTime", amount: 60 }, []);
  assert.equal(entry.target, 3600);
  assert.equal(normalizeAchievementRule(entry.rule).valueField, "activeSeconds");
  assert.equal(buildGuidedAchievement({ objective: "ownItem", ownedItem: "fox" }, []).rule.event, "inventory.checked");
});
