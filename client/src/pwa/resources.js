import "../../public/resource-cache-policy.js";

export const { CACHE: RESOURCE_CACHE, revisionKey, allowed: resourceAllowed } = globalThis.ktgaResourcePolicy;
export const resourceCacheKey = (asset) => { const url = new URL(asset.url); url.searchParams.set(revisionKey, asset.revision); return url.href; };

export function normalizeResources(manifests, origin, apiOrigin = origin) {
  const rows = new Map();
  for (const manifest of manifests) for (const row of manifest?.assets ?? []) {
    let url;
    try { url = new URL(row.url, row.url.startsWith("/api/") ? apiOrigin : origin).href; } catch { continue; }
    if (!resourceAllowed(url, origin) || !/^[a-zA-Z0-9_-]{1,80}$/.test(row.revision)) continue;
    rows.set(url, { ...row, url, bytes: Math.max(0, Number(row.bytes) || 0) });
  }
  return [...rows.values()];
}

export async function prepareResources({ assets, cache, fetcher = fetch, onProgress = () => {}, signal, concurrency = 3, background = () => false }) {
  const state = { total:assets.length, completed:0, cached:0, downloaded:0, bytes:0, failed:0, category:"", storageFull:false };
  const keys = await cache.keys();
  const present = new Set(keys.map(key => key.url));
  let cursor = 0;
  onProgress({ ...state });
  async function work() {
    while (cursor < assets.length && !signal?.aborted && !state.storageFull) {
      const asset = assets[cursor++], key = resourceCacheKey(asset);
      state.category = asset.category;
      if (present.has(key)) state.cached++;
      else {
        const controller = new AbortController(), abort = () => controller.abort();
        signal?.addEventListener("abort", abort, { once:true });
        const timeout = setTimeout(abort, 20000);
        try {
          const source = new URL(asset.url);
          source.searchParams.set("ktga_resource_fill", asset.revision);
          const response = await fetcher(source.href, { credentials:"omit", redirect:"error", signal:controller.signal, cache:"reload", priority:"low" });
          const type = response.headers.get("content-type") ?? "";
          if (!response.ok || response.type === "opaque" || /(?:text\/html|application\/(?:problem\+)?json)/i.test(type) && !asset.url.endsWith(".json")) throw Error("Resource unavailable");
          await cache.put(key, response);
          state.downloaded++; state.bytes += Number(response.headers.get("content-length")) || asset.bytes;
        } catch (error) {
          if (signal?.aborted) break;
          state.failed++;
          if (error.name === "QuotaExceededError") state.storageFull = true;
        } finally { clearTimeout(timeout); signal?.removeEventListener("abort", abort); }
      }
      state.completed++;
      onProgress({ ...state });
      if (background()) await new Promise(resolve => setTimeout(resolve, 150));
    }
  }
  await Promise.all(Array.from({ length:Math.max(1, Math.min(3, concurrency)) }, work));
  if (!signal?.aborted && !state.failed && state.completed === state.total && assets.length) {
    await retainResourceGenerations(cache, assets).catch(() => {});
  }
  return { ...state };
}

export async function retainResourceGenerations(cache, assets) {
  const origin = new URL(assets[0].url).origin;
  const metadata = `${origin}/__ktga_resource_index`;
  const current = assets.map(resourceCacheKey).sort();
  const history = await (await cache.match(metadata))?.json().catch(() => null);
  const previous = Array.isArray(history?.generations) ? history.generations.filter(row => Array.isArray(row)) : [];
  const generations = JSON.stringify(previous[0]) === JSON.stringify(current) ? previous.slice(0, 2) : [current, ...previous].slice(0, 2);
  await cache.put(metadata, new Response(JSON.stringify({ generations }), { headers:{ "content-type":"application/json" } }));
  const retained = new Set([metadata, ...generations.flat()]);
  // One preceding generation keeps an already-open tab working across a deployment.
  for (const key of await cache.keys()) {
    if (!retained.has(key.url)) await cache.delete(key);
  }
}
