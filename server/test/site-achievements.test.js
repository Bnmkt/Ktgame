import test from "node:test";
import assert from "node:assert/strict";
import { allowedUrlMarkers, createSiteActivityTracker, playerAchievementContext, setActivityConsent, validActivityConsent, PRIVACY_VERSION } from "../src/services/site-achievements.js";
import { consumeAchievementEvent, normalizeAchievementRule, achievementRuleSchemas } from "../src/services/achievement-rules.js";
import { createParentalApproval, registrationAuthorization } from "../src/services/parental-approval.js";

const now = Date.parse("2026-09-27T12:00:00Z");
const consent = (enabled = true) => ({ version: PRIVACY_VERSION, chosenAt: now, ageConfirmed: true, enabled });
test("inventory context distinguishes equipped and owned catalogue IDs without private fields", () => {
  const user = { tokens: 123, passwordHash: "private", profile: { birthDate: "2000-01-01", favoriteGames: ["farkle"] }, cosmetics: { icons: ["red", "blue"], equipped: { icon: "blue" } }, createdAt: "2026-09-20T12:00:00Z" };
  const context = playerAchievementContext(user, [{ id: "icon-red", value: "red", type: "icons" }, { id: "icon-blue", value: "blue", type: "icons" }], now);
  assert.deepEqual(context.ownedItemIds, ["icon-red", "icon-blue"]);
  assert.deepEqual(context.equippedItemIds, ["icon-blue"]);
  assert.equal(context.accountAgeDays, 7);
  assert.equal(context.birthDate, undefined);
});
test("all game and site events accept trusted inventory conditions", () => {
  const rule = normalizeAchievementRule({ source: "event", event: "game.finished", condition: { all: [{ field: "won", value: true }, { field: "player.equippedItemIds", operator: "contains", value: "fox" }] } });
  assert.equal(consumeAchievementEvent(rule, { type: "game.finished", payload: { won: true, player: { equippedItemIds: ["fox"] } } }).matched, true);
  assert.equal(consumeAchievementEvent(rule, { type: "game.finished", payload: { won: true, player: { equippedItemIds: [] } } }).matched, false);
  assert.throws(() => normalizeAchievementRule({ event: "site.visit", condition: { field: "player.birthDate", operator: "exists" } }));
  assert.ok(achievementRuleSchemas().events.find((event) => event.id === "site.visit").fields.find((field) => field.field === "page").choices.length);
});
test("activity requires explicit current consent and age eligibility", () => {
  const user = { id: "a" };
  assert.equal(validActivityConsent(user, now), false);
  assert.throws(() => setActivityConsent(user, { ...consent(), ageConfirmed: false }, now));
  setActivityConsent(user, consent(), now);
  assert.equal(validActivityConsent(user, now), true);
  assert.equal(validActivityConsent(user, now + 181 * 86400000), false);
  assert.throws(() => setActivityConsent({ profile: { birthDate: "2020-01-01" } }, consent(), now));
  assert.throws(() => setActivityConsent({ registrationAuthorization: { ageBand: "under13" } }, consent(), now));
});
test("withdrawal clears optional counters and rejects stale choices", () => {
  const user = { siteActivity: { activeSeconds: 800 } };
  setActivityConsent(user, { ...consent(false), chosenAt: now + 1 }, now + 1);
  assert.equal(user.siteActivity, undefined);
  assert.throws(() => setActivityConsent(user, consent(), now + 1));
});
test("only declared non-identifying URL marker keys and values are allowed", () => {
  const entry = (value, enabled = true) => ({ enabled, rule: { event: "site.visit", condition: { field: "markers", operator: "contains", value } } });
  assert.deepEqual(allowedUrlMarkers([entry("secret:answer-42"), entry("password:private"), entry("secret:name@example.com"), entry("challenge:disabled", false)]), ["secret:answer-42"]);
});
test("active time uses server clock, filters payload, and cannot be multiplied by duplicate tabs", () => {
  const tracker = createSiteActivityTracker();
  const user = { id: "a" }; setActivityConsent(user, consent(), now);
  const input = { page: "shop", seconds: 999999, markers: ["secret:answer-42", "password:unsafe"], player: { tokens: 999 } };
  const first = tracker.record(user, input, "Chrome Edg/123", ["secret:answer-42"], now);
  assert.equal(first[0].payload.browser, "edge");
  assert.deepEqual(first[0].payload.markers, ["secret:answer-42"]);
  assert.equal(first[0].payload.player, undefined);
  assert.equal(tracker.record(user, input, "", [], now + 100).length, 0);
  tracker.record(user, input, "", [], now + 30000);
  tracker.record(user, input, "", [], now + 30100);
  assert.equal(user.siteActivity.activeSeconds, 30);
  tracker.record(user, input, "", [], now + 200000);
  assert.equal(user.siteActivity.activeSeconds, 30);
  tracker.forget(user.id);
  tracker.record(user, input, "", [], now + 220000);
  assert.equal(user.siteActivity.activeSeconds, 30);
  assert.deepEqual(user.siteActivity.pages, ["shop"]);
  assert.throws(() => tracker.record(user, { page: "arbitrary-private-path" }, "", [], now + 250000));
});
test("no activity accepted after consent withdrawal or for a different user", () => {
  const tracker = createSiteActivityTracker(), user = { id: "a" };
  setActivityConsent(user, consent(), now);
  tracker.record(user, { page: "lobby" }, "", [], now);
  setActivityConsent(user, consent(false), now);
  assert.throws(() => tracker.record(user, { page: "lobby" }, "", [], now + 30000));
  assert.throws(() => tracker.record({ id: "b" }, { page: "lobby" }, "", [], now));
});
test("parental authorizations require verification, expire, and are single-use hashes", () => {
  const db = { settings: {} };
  assert.throws(() => createParentalApproval(db, { reference: "CASE-1" }, "admin", now));
  const result = createParentalApproval(db, { reference: "CASE-1", verified: true }, "admin", now);
  assert.ok(!JSON.stringify(db).includes(result.code));
  const input = { termsVersion: PRIVACY_VERSION, ageBand: "under13", parentalCode: result.code };
  assert.throws(() => registrationAuthorization(db, input, now + 73 * 3600000));
  const approval = registrationAuthorization(db, input, now);
  assert.equal(approval.parentalApproval.reference, "CASE-1");
  assert.equal(approval.parentalApproval.hash, undefined);
  assert.throws(() => registrationAuthorization(db, input, now));
  assert.throws(() => registrationAuthorization(db, { ageBand: "13plus" }, now));
});
