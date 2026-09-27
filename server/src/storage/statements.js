const caches = new WeakMap();

// Keep a strong reference while iterating: early Node 22 SQLite iterators do
// not retain their statement and can otherwise fail during garbage collection.
export function prepared(sqlite, sql) {
  let cache = caches.get(sqlite);
  if (!cache) { cache = new Map(); caches.set(sqlite, cache); }
  if (!cache.has(sql)) {
    if (cache.size >= 128) cache.delete(cache.keys().next().value);
    cache.set(sql, sqlite.prepare(sql));
  }
  return cache.get(sql);
}
