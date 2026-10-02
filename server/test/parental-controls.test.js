import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  activeModeration,
  activeParentalRevocation,
  createParentalControlStore,
  exactAge,
  featureAccess,
  isUnder13,
  registrationMarker,
  turnsThirteenAt
} from "../src/services/parental-controls.js";

const now = Date.UTC(2026, 9, 1, 12);
const minor = () => ({
  id: "child-1",
  profile: { birthDate: "2015-10-02" },
  registrationAuthorization: { ageBand: "under13", parentalApproval: { code: "PAR-TEST" } },
  parentalAccess: { status: "active" }
});

test("l’âge et la date de passage à treize ans suivent la date civile", () => {
  assert.equal(exactAge("2013-10-01", now), 13);
  assert.equal(exactAge("2013-10-02", now), 12);
  assert.equal(exactAge("date-invalide", now), null);
  assert.equal(turnsThirteenAt("2015-10-02"), "2028-10-02T00:00:00.000Z");
  assert.equal(isUnder13(minor(), now), true);
  assert.equal(isUnder13({ ...minor(), profile: { birthDate: "" } }, now), false);
});

test("les restrictions mineur, softban, hardban et suspension parentale restent distinctes", () => {
  const user = minor();
  assert.equal(featureAccess(user, "shop", ["shop"], now).code, "MINOR_RESTRICTION");
  assert.equal(featureAccess(user, "rooms:create", ["shop"], now).allowed, true);

  user.moderation = { softBan: { active: true, reason: "Test", endsAt: new Date(now + 3600000).toISOString() } };
  assert.equal(activeModeration(user, now).type, "soft");
  assert.equal(featureAccess(user, "rooms:join", [], now).code, "SOFT_BAN");
  assert.equal(featureAccess(user, "rooms:create", [], now).allowed, true);

  user.moderation.hardBan = { active: true, reason: "Sécurité", endsAt: new Date(now + 3600000).toISOString() };
  assert.equal(featureAccess(user, "rooms:create", [], now).code, "HARD_BAN");

  delete user.moderation;
  user.parentalAccess = { status: "revoked", reason: "Pause", revokedUntil: new Date(now + 86400000).toISOString() };
  assert.equal(activeParentalRevocation(user, now).reason, "Pause");
  assert.equal(featureAccess(user, "rooms:create", [], now).code, "PARENTAL_ACCESS_REVOKED");
});

test("un dossier parental valide les liens signés, agrège l’activité et retient les signaux sept jours", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "ktga-parental-"));
  const store = createParentalControlStore({ filename: path.join(directory, "parental.sqlite"), secret: "test-secret" });
  try {
    const markers = registrationMarker({ deviceId: "browser_identifier_123456", ip: "192.168.10.42", userAgent: "Firefox/120" }, "test-secret");
    const request = store.createRequest({ childEmail: "child@example.test", childPseudo: "PetitJoueur", childBirthDate: "2017-05-04", passwordHash: "hashed-password", parentEmail: "parent@example.test" }, markers, now);
    assert.match(request.code, /^PAR-/);
    assert.equal(store.hasRecentMinorRisk({ markers, email: "other@example.test", pseudo: "Autre" }, now), true);
    assert.equal(store.hasRecentMinorRisk({ markers: {}, email: "child@example.test", pseudo: "Autre" }, now), true);
    assert.equal(store.hasRecentMinorRisk({ markers, email: "child@example.test", pseudo: "PetitJoueur" }, now + 8 * 86400000), false);

    assert.equal(store.requestForVerification(request.verificationToken, now).id, request.id);
    assert.equal(store.consent(request.verificationToken, now).status, "admin_pending");
    const approved = store.approve(request.id, "admin-1", "child-1", now);
    assert.ok(approved.portalToken.includes("."));
    assert.equal(store.portalRequest(approved.portalToken).userId, "child-1");
    assert.equal(store.portalRequest(`${approved.portalToken}broken`), null);
    assert.equal(store.getInternal(request.id).passwordHash, "");

    store.recordActivity("child-1", { day: "2026-10-01", category: "navigation", label: "Accueil", count: 1, durationSeconds: 30 }, now);
    store.recordActivity("child-1", { day: "2026-10-01", category: "navigation", label: "Accueil", count: 0, durationSeconds: 20 }, now + 30000);
    assert.deepEqual(store.activity("child-1", "2026-10-01").map((entry) => [entry.count, entry.durationSeconds]), [[1, 50]]);
    store.markMailSent("child-1", "daily", "2026-10-01", now);
    assert.equal(store.mailKindWasSent("child-1", "daily"), true);
    store.deleteForUser("child-1");
    assert.equal(store.portalRequest(approved.portalToken), null);
    assert.deepEqual(store.activity("child-1", "2026-10-01"), []);
    assert.equal(store.mailWasSent("child-1", "daily", "2026-10-01"), false);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
