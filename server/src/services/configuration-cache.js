import { CacheTelemetry } from "./cache-telemetry.js";

function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

// Compare content, not identity: admin editors also mutate settings in place.
export class ConfigurationCache {
  constructor({ revision } = {}) {
    if (revision !== undefined && typeof revision !== "function") throw new Error("Invalid configuration revision provider.");
    this.revision = revision; this.entries = new Map(); this.readScope = null; this.telemetry = new CacheTelemetry();
  }
  health() { return this.telemetry.snapshot(this.entries.size); }
  // Call only around synchronous operations that do not modify configuration.
  read(callback) {
    if (this.readScope) return callback();
    this.readScope = new Map();
    const revision = this.revision?.();
    if (revision !== undefined) for (const [key, entry] of this.entries) {
      if (entry.revision === revision) this.readScope.set(key, entry.value);
    }
    try { return callback(); } finally { this.readScope = null; }
  }
  get(key, input, build) {
    if (this.readScope?.has(key)) { this.telemetry.hits++; return this.readScope.get(key); }
    const previous = this.entries.get(key);
    const revision = this.revision?.();
    // Only read scopes can trust a committed revision. Admin mutations outside
    // those scopes must still compare content before the transaction commits.
    if (this.readScope && revision !== undefined && previous?.revision === revision) {
      this.telemetry.hits++; this.readScope.set(key, previous.value); return previous.value;
    }
    const fingerprint = JSON.stringify(input);
    if (previous && previous.fingerprint === fingerprint) {
      if (revision !== undefined) previous.revision = revision;
      this.telemetry.hits++;
      this.readScope?.set(key, previous.value);
      return previous.value;
    }
    this.telemetry.misses++;
    if (previous) this.telemetry.invalidations++;
    const value = freeze(structuredClone(build()));
    this.entries.set(key, { fingerprint, value, revision });
    this.readScope?.set(key, value);
    return value;
  }
}
