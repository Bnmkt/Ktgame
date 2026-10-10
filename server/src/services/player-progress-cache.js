import { CacheTelemetry } from "./cache-telemetry.js";

export class PlayerProgressCache {
  constructor(limit = 2048) {
    if (!Number.isInteger(limit) || limit < 1) throw new Error("Invalid player cache limit.");
    this.limit = limit;
    this.entries = new Map();
    this.telemetry = new CacheTelemetry();
  }
  health() { return this.telemetry.snapshot(this.entries.size, this.limit); }
  get(userId, references, input, build) {
    const signature = JSON.stringify(input), prior = this.entries.get(userId);
    if (prior?.signature === signature && references.length === prior.references.length && references.every((value, index) => value === prior.references[index])) { this.telemetry.hits++; return prior.value; }
    this.telemetry.misses++;
    if (prior) this.telemetry.invalidations++;
    const value = Object.freeze(build());
    if (!this.entries.has(userId) && this.entries.size >= this.limit) { this.entries.delete(this.entries.keys().next().value); this.telemetry.evictions++; }
    this.entries.set(userId, { signature, references: [...references], value });
    return value;
  }
}
