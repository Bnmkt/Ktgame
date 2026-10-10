import assert from "node:assert/strict";
import test from "node:test";
import { AUDIENCE_ID, AUDIENCE_VERSION, audienceAllowed, audiencePage, createAudienceClient } from "../src/privacy/audience.js";
import { CONSENT_DURATION, PRIVACY_VERSION } from "../src/privacy/consent.js";

const time = Date.now();
const consent = () => ({ version: PRIVACY_VERSION, chosenAt: time, ageConfirmed: true, enabled: false, audienceVersion: AUDIENCE_VERSION, audience: true });
function fixture() {
  const scripts = [], erased = [], timers = new Map();
  const document = { get cookie() { return "_ga=test; _ga_YK0459SVPW=test; ktga_session=keep"; }, set cookie(value) { erased.push(value); }, head: { append(script) { scripts.push(script); } }, createElement() { return { remove() { this.removed = true; } }; } };
  const window = { location: { hostname: "www.ktga.me", search: "" }, setTimeout(fn, ms) { const id = timers.size + 1; timers.set(id, { fn, ms }); return id; }, clearTimeout(id) { timers.delete(id); } };
  const client = createAudienceClient(window, document, { enabled: true, now: () => time });
  return { client, window, scripts, erased, timers, update: (extra = {}) => client.update({ choice: consent(), route: { view: "lobby" }, user: null, accountReady: true, ...extra }) };
}
test("only fresh, specific and age-confirmed consent authorizes Google", () => {
  assert.equal(audienceAllowed(consent(), time), true);
  for (const changed of [{ audience: false }, { audienceVersion: "old" }, { ageConfirmed: false }, { chosenAt: time - CONSENT_DURATION }, { chosenAt: time + 1 }]) assert.equal(audienceAllowed({ ...consent(), ...changed }, time), false);
  assert.equal(audienceAllowed({ version: PRIVACY_VERSION, chosenAt: time, enabled: true, ageConfirmed: true }, time), false);
});
test("page payloads contain curated categories, never arbitrary identifiers or URL values", () => {
  const room = audiencePage({ view: "room", id: "SECRET_TABLE" }, "?unused=PRIVATE");
  assert.equal(room.page_location, "https://www.ktga.me/table"); assert.ok(!JSON.stringify(room).includes("SECRET")); assert.ok(!JSON.stringify(room).includes("PRIVATE"));
  assert.equal(audiencePage({ view: "games", id: "yahtzee" }).page_location, "https://www.ktga.me/jeux/yahtzee");
  assert.equal(audiencePage({ view: "games", id: "my-email@example.com" }).page_location, "https://www.ktga.me/jeux");
  for (const view of ["parents", "profile", "admin", "tribunal", "not-found"]) assert.equal(audiencePage({ view }), null);
  for (const search of ["?verify-email=secret", "?reset-password=secret", "?parental-access=secret", "?receipt=secret"]) assert.equal(audiencePage({ view: "lobby" }, search), null);
});
test("nothing loads before consent, identity validation, or for a restricted minor", () => {
  const f = fixture();
  for (const state of [{ choice: null }, { choice: { ...consent(), audience: false } }, { accountReady: false }]) f.update(state);
  assert.deepEqual(f.scripts, []); assert.equal(f.window.dataLayer, undefined);
  f.update({ user: { minor: { restricted: true } } }); f.update({ user: null });
  assert.deepEqual(f.scripts, []);
});
test("initialization disables ads, uses manual safe page views and loads the requested tag once", () => {
  const f = fixture(); f.update(); f.update();
  assert.equal(f.scripts.length, 1); assert.equal(f.scripts[0].src, `https://www.googletagmanager.com/gtag/js?id=${AUDIENCE_ID}`);
  const commands = f.window.dataLayer.map((command) => Array.from(command));
  assert.equal(commands.filter((command) => command[0] === "event").length, 1);
  const config = commands.find((command) => command[0] === "config")[2];
  assert.equal(config.send_page_view, false); assert.equal(config.allow_google_signals, false); assert.equal(config.cookie_update, false);
  assert.equal(config.page_referrer, ""); assert.equal(config.cookie_expires, 180 * 86400);
  f.scripts[0].onload(); f.update({ route: { view: "shop" } });
  assert.equal(f.scripts.length, 1); assert.equal(f.window.dataLayer.filter((command) => command[0] === "event").length, 2);
});
test("withdrawal disables a loaded tag, erases only analytics cookies and supports a new explicit grant", () => {
  const f = fixture(); f.update(); f.scripts[0].onload(); f.update({ choice: { ...consent(), audience: false } });
  assert.equal(f.window[`ga-disable-${AUDIENCE_ID}`], true);
  assert.ok(f.erased.some((cookie) => cookie.startsWith("_ga="))); assert.ok(!f.erased.some((cookie) => cookie.startsWith("ktga_session=")));
  assert.ok(f.window.dataLayer.some((command) => command[0] === "consent" && command[2].analytics_storage === "denied"));
  f.update(); assert.equal(f.window[`ga-disable-${AUDIENCE_ID}`], false);
  assert.equal(f.scripts.length, 1); assert.equal(f.window.dataLayer.at(-1)[2].page_location, "https://www.ktga.me/");
});
test("withdrawal while the script is pending clears its queue and removes its element", () => {
  const f = fixture(); f.update(); f.update({ choice: null });
  assert.equal(f.scripts[0].removed, true); assert.equal(f.window.dataLayer.length, 0);
  f.update(); assert.equal(f.scripts.length, 2);
});

test("private routes pause collection without deleting consent cookies", () => {
  const f = fixture(); f.update(); f.scripts[0].onload();
  f.update({ route: { view: "profile", id: "private-user" } });
  assert.equal(f.window[`ga-disable-${AUDIENCE_ID}`], true);
  assert.equal(f.erased.length, 0);
  assert.equal(f.window.dataLayer.filter((command) => command[0] === "event").length, 1);
  f.update({ route: { view: "faq" } });
  assert.equal(f.window[`ga-disable-${AUDIENCE_ID}`], false);
  assert.equal(f.scripts.length, 1);
  assert.equal(f.window.dataLayer.at(-1)[2].page_location, "https://www.ktga.me/faq");
});

test("expiry is scheduled even when it exceeds the browser timer limit", () => {
  const f = fixture(); f.update();
  assert.equal([...f.timers.values()][0].ms, 2147483647);
});
