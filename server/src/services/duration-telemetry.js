import { performance } from "node:perf_hooks";

// Keep only anonymous durations: a fixed ring bounds memory even during a burst.
export class DurationTelemetry {
  constructor() { this.samples = []; this.cursor = 0; this.count = 0; this.total = 0; this.maximum = 0; }
  record(duration, now = performance.now()) {
    const ms = Math.max(0, duration);
    this.count++; this.total += ms; this.maximum = Math.max(this.maximum, ms);
    this.samples[this.cursor] = { ms, at: now };
    this.cursor = (this.cursor + 1) % 256;
  }
  snapshot(now = performance.now()) {
    const values = this.samples.filter((sample) => now - sample.at <= 60000).map((sample) => sample.ms).sort((a, b) => a - b);
    const round = (value) => Number(value.toFixed(3));
    return { count: this.count, totalMs: round(this.total), averageMs: round(this.count ? this.total / this.count : 0), maxMs: round(this.maximum),
      p95Ms: values.length ? round(values[Math.ceil(values.length * .95) - 1]) : null,
      recentSamples: values.length };
  }
}
