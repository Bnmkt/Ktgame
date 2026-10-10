export class CacheTelemetry {
  constructor() { this.hits = 0; this.misses = 0; this.invalidations = 0; this.evictions = 0; }
  snapshot(entries, capacity = null) {
    const requests = this.hits + this.misses;
    return { entries, capacity, requests, hits: this.hits, misses: this.misses,
      invalidations: this.invalidations, evictions: this.evictions,
      hitRate: requests ? this.hits / requests : null };
  }
}
