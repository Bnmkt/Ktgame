import assert from "node:assert/strict";
import test from "node:test";
import { appPath, readRoute } from "../src/navigation/routes.js";
import { eventProgressDisplay } from "../src/features/events/progress.js";

test("routes absolues sous /ktga, y compris lors d'un acces direct", () => {
  for (const [view, id, path] of [["lobby", "", "/ktga/"], ["profile", "", "/ktga/profil"], ["shop", "", "/ktga/shop"], ["admin", "", "/ktga/admin"], ["room", "ABC123", "/ktga/table/ABC123"], ["event", "ete-2026", "/ktga/evenement/ete-2026"]]) {
    assert.equal(appPath(view, id, "/ktga/"), path);
    assert.deepEqual(readRoute({ pathname: path, search: "" }, "/ktga/"), { view, ...(id ? { id } : {}) });
  }
  assert.equal(appPath("shop", "", "/"), "/shop");
  assert.equal(appPath("leaderboard", "", "/ktga/"), "/ktga/classements");
  assert.deepEqual(readRoute({ pathname: "/ktga/classements", search: "" }, "/ktga/"), { view: "leaderboard" });
  assert.equal(appPath("spectator", "ABC123", "/ktga/"), "/ktga/observer/ABC123");
  assert.deepEqual(readRoute({ pathname: "/ktga/observer/abc123", search: "" }, "/ktga/"), { view: "spectator", id: "ABC123" });
  assert.deepEqual(readRoute({ pathname: "/ktga", search: "" }, "/ktga/"), { view: "lobby" });
  assert.deepEqual(readRoute({ pathname: "/ktga/table/abc123", search: "" }, "/ktga/"), { view: "room", id: "ABC123" });
});

test("les anciens liens d'invitation restent accessibles", () => {
  assert.deepEqual(readRoute({ pathname: "/ktga/", search: "?room=a1b2c3" }, "/ktga/"), { view: "room", id: "A1B2C3" });
  assert.deepEqual(readRoute({ pathname: "/ktga/", search: "?event=challenge" }, "/ktga/"), { view: "event", id: "challenge" });
});

test("les routes inconnues, hors base et mal encodees sont rejetees", () => {
  for (const path of ["/autre/shop", "/ktgashop", "/ktga/table", "/ktga/table/%", "/ktga/table/a%2Fb", "/ktga/profil/autre", "/ktga/inconnue"]) {
    assert.equal(readRoute({ pathname: path, search: "" }, "/ktga/").view, "not-found", path);
  }
});

const makeEvent = (lastPercent = 250) => ({ objective: { milestones: [50, 100, 150, lastPercent].map((percent) => ({ id: String(percent), percent })) }, runtime: { reachedMilestones: [] } });

test("les paliers au-dela de 100% apparaissent a leur obtention", () => {
  for (const [progress, percentages, hidden] of [[40, [50, 100], true], [100, [50, 100], true], [149.9, [50, 100], true], [150, [50, 100, 150], true], [250, [50, 100, 150, 250], false]]) {
    const display = eventProgressDisplay(makeEvent(), progress);
    assert.deepEqual(display.visible.map((row) => row.percent), percentages);
    assert.equal(display.hasHiddenBonus, hidden);
    if (hidden) assert.ok(display.fill <= 88);
    else assert.equal(display.fill, 100);
  }
});

test("la reserve de progression ne revele pas le prochain seuil cache", () => {
  const near = eventProgressDisplay(makeEvent(200), 175);
  const far = eventProgressDisplay(makeEvent(10000), 175);
  assert.equal(near.scale, far.scale);
  assert.equal(near.fill, far.fill);
  assert.deepEqual(near.visible, far.visible);
  const normal = eventProgressDisplay({ objective: { milestones: [{ id: "goal", percent: 100 }] } }, 100);
  assert.equal(normal.hasHiddenBonus, false);
  assert.equal(normal.fill, 100);
});
