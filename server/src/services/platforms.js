import { externalUrl, resolveExternal, fetchExternalJson } from "./external-json.js";

export const PLATFORM_TTL = 15 * 60 * 1000;
const badKeys = new Set(["__proto__", "constructor", "prototype"]);
export function exploreJson(data) {
  const leaves = []; let visited = 0;
  function visit(value, path) {
    if (++visited > 2000 || path.length > 10 || leaves.length >= 300) return;
    if (value === null || ["string", "number", "boolean"].includes(typeof value)) { leaves.push({ path, value: typeof value === "string" ? value.slice(0, 500) : value }); return; }
    for (const key of Object.keys(value).slice(0, 200)) if (!badKeys.has(key)) visit(value[key], [...path, key]);
  }
  visit(data, []); return leaves;
}
export function normalizePlatform(input) {
  const name = String(input?.name ?? "").trim(), description = String(input?.description ?? "").trim();
  if (!name || name.length > 100 || description.length > 2000) throw new Error("Indique un nom (100 caractères maximum) et une description de 2 000 caractères maximum.");
  const url = externalUrl(input.url).href, apiUrl = input.apiUrl ? externalUrl(input.apiUrl).href : "";
  if (!Array.isArray(input.metrics) || input.metrics.length > 12) throw new Error("Choisis jusqu’à 12 métriques.");
  const metrics = input.metrics.map(metric => {
    if (!Array.isArray(metric.path) || !metric.path.length || metric.path.length > 10 || metric.path.some(key => typeof key !== "string" || key.length > 200 || badKeys.has(key)) || typeof metric.label !== "string" || !metric.label.trim() || metric.label.length > 80) throw new Error("Métrique invalide.");
    return { path: metric.path, label: metric.label.trim() };
  });
  if (new Set(metrics.map(metric => JSON.stringify(metric.path))).size !== metrics.length) throw new Error("Une métrique est sélectionnée plusieurs fois.");
  return { name, description, url, apiUrl, metrics, position: Math.max(0, Math.min(9999, Math.trunc(Number(input.position) || 0))) };
}

export function createPlatformMetrics({ store, fetchJson = fetchExternalJson, now = Date.now }) {
  const pending = new Map();
  async function refresh(platform) {
    const old = store.platformCache(platform.id);
    if (!platform.apiUrl) return null;
    if (old?.apiUrl === platform.apiUrl && old.nextAttempt > now()) return old;
    const key = JSON.stringify([platform.id, platform.apiUrl]);
    if (pending.has(key)) return pending.get(key);
    if (pending.size >= 4) throw Object.assign(new Error("Trop d’actualisations en cours. Réessaie dans un instant."), { status: 429 });
    const work = (async () => {
      let cache;
      try { const leaves = exploreJson(await fetchJson(platform.apiUrl)); cache = { apiUrl: platform.apiUrl, leaves, fetchedAt: now(), attemptedAt: now(), nextAttempt: now() + PLATFORM_TTL, error: "" }; }
      catch (error) { cache = { ...(old?.apiUrl === platform.apiUrl ? old : { leaves: [], fetchedAt: null }), apiUrl: platform.apiUrl, attemptedAt: now(), nextAttempt: now() + PLATFORM_TTL, error: error.message }; }
      if (store.get("platform", platform.id)?.apiUrl === platform.apiUrl) store.savePlatformCache(platform.id, cache);
      return cache;
    })();
    pending.set(key, work);
    try { return await work; } finally { pending.delete(key); }
  }
  function view(platform) {
    const stored = store.platformCache(platform.id), cache = stored?.apiUrl === platform.apiUrl ? stored : null;
    return { ...platform, cache: cache ? { fetchedAt: cache.fetchedAt, attemptedAt: cache.attemptedAt, nextAttempt: cache.nextAttempt, error: cache.error, leaves: cache.leaves } : null };
  }
  return { refresh, view };
}

export function registerPlatformRoutes({ app, auth, requireBackOffice, requireAdmin, store, fetchJson, validateRemote = resolveExternal }) {
  const metrics = createPlatformMetrics({ store, fetchJson });
  const wrap = handler => async (req, res) => { res.set("Cache-Control", "private, no-store"); try { await handler(req, res); } catch (error) { res.status(error.status || 400).json({ error: error.message }); } };
  app.post("/api/admin/communication/platforms/order", auth, requireBackOffice, wrap((req, res) => { store.reorderPlatforms(req.body.items); res.json(store.list("platform").sort((a, b) => a.position - b.position).map(metrics.view)); }));
  app.get("/api/admin/communication/platforms", auth, requireBackOffice, wrap((_req, res) => res.json(store.list("platform").sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)).map(metrics.view))));
  for (const method of ["post", "put"]) app[method](`/api/admin/communication/platforms${method === "put" ? "/:id" : ""}`, auth, requireBackOffice, wrap(async (req, res) => {
    const value = normalizePlatform(req.body);
    // Resolve API destinations when saving as well as before every network request.
    if (value.apiUrl) await validateRemote(value.apiUrl);
    res.status(method === "post" ? 201 : 200).json(metrics.view(store.save("platform", req.params.id || null, value, req.body.revision)));
  }));
  app.post("/api/admin/communication/platforms/:id/refresh", auth, requireBackOffice, wrap(async (req, res) => {
    const platform = store.get("platform", req.params.id); if (!platform) return res.status(404).json({ error: "Plateforme introuvable." });
    await metrics.refresh(platform); res.json(metrics.view(store.get("platform", platform.id) ?? platform));
  }));
  app.delete("/api/admin/communication/platforms/:id", auth, requireAdmin, wrap((req, res) => { store.remove("platform", req.params.id, req.body.revision); store.deletePlatformCache(req.params.id); res.json({ ok: true }); }));
  return metrics;
}
