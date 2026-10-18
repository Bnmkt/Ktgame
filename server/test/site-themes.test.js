import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { registerThemeRoutes, validateThemeLibrary } from "../src/services/site-themes.js";
import { DEFAULT_THEME, normalizeTheme } from "../../client/src/features/theme/config.js";

const custom = () => ({ ...structuredClone(DEFAULT_THEME), id: "theme-test", name: "Test", tokens: { ...DEFAULT_THEME.tokens, primary: "#00aa99" } });

test("theme libraries validate capacity, identifiers and stored images", () => {
  const model = { version: 1, activeId: "theme-test", themes: [custom()] };
  assert.equal(validateThemeLibrary(model).themes.length, 1);
  assert.throws(() => validateThemeLibrary({ ...model, themes: [custom(), custom()] }));
  assert.throws(() => validateThemeLibrary({ ...model, themes: [DEFAULT_THEME] }));
  assert.throws(() => validateThemeLibrary({ ...model, activeId: "unknown" }));
  assert.throws(() => validateThemeLibrary({ ...model, themes: Array.from({ length: 21 }, (_, index) => ({ ...custom(), id: `theme-${index}` })) }));
  const image = `/api/media/${"b".repeat(64)}.png`;
  assert.throws(() => validateThemeLibrary({ ...model, themes: [{ ...custom(), backgroundImage: image }] }, { get: () => undefined }));
  assert.ok(validateThemeLibrary({ ...model, themes: [{ ...custom(), backgroundImage: image }] }, { get: id => id === image.split("/").at(-1) ? { image } : null }));
});

test("admin themes persist drafts, apply explicitly, reject stale writes and protect private routes", async () => {
  let db = { settings: {} };
  const app = express(); app.use(express.json());
  const auth = (req, res, next) => req.get("X-Role") ? next() : res.sendStatus(401);
  const requireAdmin = (req, res, next) => req.get("X-Role") === "admin" ? next() : res.sendStatus(403);
  registerThemeRoutes({ app, auth, requireAdmin, readDb: () => db, updateDb: change => change(db), settings: () => ({ appearance: normalizeTheme(db.settings.platform?.appearance) }) });
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = (method = "GET", body, role = "admin", endpoint = "/api/admin/themes") => fetch(origin + endpoint, { method, headers: { ...(role ? { "X-Role": role } : {}), "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  try {
    assert.equal((await request("GET", null, "")).status, 401);
    assert.equal((await request("GET", null, "editor")).status, 403);
    let catalog = await (await request()).json();
    const firstRevision = catalog.revision;
    catalog = await (await request("PUT", { ...catalog, themes: [custom()] })).json();
    assert.equal(db.settings.siteThemes.themes[0].name, "Test");
    assert.equal(db.settings.platform?.appearance, undefined);
    assert.equal((await request("PUT", { ...catalog, revision: firstRevision })).status, 409);
    assert.equal((await request("PUT", { ...catalog, activeId: "theme-test" })).status, 400);
    catalog = await (await request("PUT", { ...catalog, activeId: "theme-test", apply: true })).json();
    assert.equal(db.settings.platform.appearance.tokens.primary, "#00aa99");
    const css = await request("GET", null, "", "/api/site-theme.css");
    assert.match(css.headers.get("content-type"), /text\/css/);
    assert.match(await css.text(), /--site-primary:#00aa99/);
    catalog.themes[0].tokens.primary = "#112233";
    catalog = await (await request("PUT", catalog)).json();
    assert.equal(db.settings.platform.appearance.tokens.primary, "#00aa99", "saving the active template must not publish edits");
    db = JSON.parse(JSON.stringify(db));
    assert.equal((await (await request()).json()).themes[0].tokens.primary, "#112233");
    catalog = await (await request("PUT", { ...catalog, activeId: DEFAULT_THEME.id, apply: true })).json();
    assert.deepEqual(catalog.appearance, DEFAULT_THEME);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
