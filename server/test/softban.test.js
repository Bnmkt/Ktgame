import assert from "node:assert/strict";
import test from "node:test";
import { featureAccess } from "../src/services/parental-controls.js";
import { softBanRequestFeatures } from "../src/services/softban.js";
import { defaultSoftBanRestrictions, softBanOptions, validSoftBanRestrictions, softBanLimited } from "../../client/src/features/accounts/softban.js";

const now = Date.now();
const banned = { pseudo: "Player", moderation: { softBan: { active: true, reason: "Fixture", endsAt: new Date(now + 3600000).toISOString() } } };
const access = (feature, restrictions, user = banned) => featureAccess(user, feature, [], now, restrictions);

test("every configurable action can be blocked, independently, globally or for one account", () => {
  for (const [id] of softBanOptions) {
    assert.equal(access(id, [id]).code, "SOFT_BAN", id);
    assert.equal(access(id, []).allowed, true, id);
    assert.equal(access(id, [id], { ...banned, moderation: { softBan: { ...banned.moderation.softBan, restrictions: [] } } }).allowed, true);
  }
  assert.equal(access("game:yahtzee", ["games"]).code, "SOFT_BAN");
  assert.equal(access("game:belote", ["game:yahtzee"]).allowed, true);
  assert.equal(access("chat:private", ["chat:global"]).allowed, true);
  assert.equal(access("rooms:create", defaultSoftBanRestrictions).allowed, true);
  assert.equal(access("chat:table", defaultSoftBanRestrictions).code, "SOFT_BAN");
  assert.equal(softBanLimited({ moderation: { type: "soft", restrictions: [] } }, "chat:global", now), false);
  assert.equal(softBanLimited({ moderation: { type: "soft", restrictions: ["chat:global"] } }, "chat:global", now), true);
  assert.equal(softBanLimited({ moderation: { type: "soft", restrictions: ["chat:global"] } }, "chat:private", now), false);
  assert.equal(softBanLimited({ moderation: { type: "soft", endsAt: new Date(now).toISOString(), restrictions: ["chat:global"] } }, "chat:global", now), false);
  assert.equal(access("shop", ["shop"], { moderation: { softBan: { ...banned.moderation.softBan, endsAt: new Date(now).toISOString() } } }).allowed, true);
  assert.equal(access("shop", [], { moderation: { hardBan: { active: true } } }).code, "HARD_BAN");
  assert.equal(featureAccess({ registrationAuthorization: { ageBand: "under13" }, profile: { birthDate: "2020-01-01" } }, "chat:table", ["chat"], now, []).code, "MINOR_RESTRICTION");
  assert.equal(validSoftBanRestrictions(["shop", "game:yahtzee"], [{ id: "yahtzee" }]), true);
  for (const value of [null, {}, "all", ["unknown"], ["game:missing"]]) assert.equal(validSoftBanRestrictions(value, []), false);
});

test("request classification covers authoring, rewards and public identity without blocking security or safe exits", () => {
  const features = (path, method = "POST", body = {}, user) => softBanRequestFeatures({ path, method, body }, user);
  assert.deepEqual(features("/api/admin/shop", "POST", { id: "source" }), ["editor:duplicate", "editor:publish"]);
  assert.deepEqual(features("/api/admin/shop", "POST"), ["editor:create", "editor:publish"]);
  assert.deepEqual(features("/api/admin/patchnotes/a", "PATCH", { status: "published" }), ["editor:edit", "editor:publish"]);
  assert.deepEqual(features("/api/admin/COMMUNITY-EVENTS/a/DUPLICATE/"), ["editor:duplicate"]);
  assert.deepEqual(features("/api/admin/games/yahtzee/images/coverImage"), ["editor:upload"]);
  assert.deepEqual(features("/api/admin/patchnotes/a", "DELETE"), ["editor:delete"]);
  assert.deepEqual(features("/api/me/daily-claim"), ["daily-bonus"]);
  assert.deepEqual(features("/api/tribunal/cases/a/vote"), ["tribunal:vote"]);
  assert.deepEqual(features("/api/patchnotes/a/reaction"), ["patchnotes:react"]);
  assert.deepEqual(features("/api/me", "PATCH", { displayName: "Player", titleHidden: false, titleLevel: 0, password: "changed" }, banned), []);
  assert.deepEqual(features("/api/me", "PATCH", { bio: "New bio" }, banned), ["profile:edit"]);
  assert.deepEqual(features("/api/me", "PATCH", { titleLevel: 10 }, banned), ["cosmetics:equip"]);
  for (const path of ["/api/me/email", "/api/me/security/totp/setup", "/api/me/data-requests", "/api/tribunal/reports", "/api/bugs", "/api/rooms/ABC/leave", "/api/connections/muted/player"]) assert.deepEqual(features(path), [], path);
  assert.deepEqual(features("/api/admin/shop", "GET"), []);
});
