import path from "node:path";

export const STORE_KEYS = ["PARENTAL_DB_PATH", "TRIBUNAL_DB_PATH", "CHAT_DB_PATH", "STATUS_DB_PATH", "REQUEST_LOG_PATH", "HELP_DB_PATH", "DATA_REQUEST_DB_PATH", "BUG_REPORT_DB_PATH", "PATCHNOTES_DB_PATH", "CONTACT_NOTICE_DB_PATH", "EXECUTION_DB_PATH"];

export function assertTarget(value, manifest) {
  const url = new URL(value);
  if (!/^capacity-[a-f0-9]{12}$/.test(manifest?.runId ?? "") || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
    || url.protocol !== "http:" || !url.port || ["80", "443", "4000"].includes(url.port) || url.pathname !== "/" || url.username || url.password || url.search || url.hash) {
    throw new Error("Only a private loopback test instance on a dedicated port is allowed (SSH tunnel for VPS).");
  }
  return url.origin;
}

export function isolatedEnvironment(directory, port, runId, secret, rateLimits = false) {
  if (!/^ktga-capacity-[\w-]+$/.test(path.basename(directory)) || !path.isAbsolute(directory)
    || !Number.isInteger(port) || port < 1024 || port > 65535 || port === 4000) throw new Error("Invalid isolated fixture directory or port.");
  return {
    ...process.env,
    NODE_ENV: "production", HOST: "127.0.0.1", PORT: String(port), JWT_SECRET: secret,
    DOTENV_CONFIG_PATH: path.join(directory, "disabled.env"),
    SQLITE_PATH: path.join(directory, "test.sqlite"), APP_BASE_PATH: "", CLIENT_DIST: "",
    CLIENT_ORIGIN: `http://127.0.0.1:${port}`, PUBLIC_APP_URL: `http://127.0.0.1:${port}/api/health`,
    CONTACT_EMAIL: "contact@loadtest.invalid", APP_VERSION: runId, TRUST_PROXY: "",
    HTTPS_KEY_PATH: "", HTTPS_CERT_PATH: "", HTTPS_PFX_PATH: "", HTTPS_PFX_PASSPHRASE: "",
    SMTP_HOST: "", SMTP_USER: "", SMTP_PASS: "", EMAIL_FROM: "", TEST_ADMIN_EMAIL: "",
    RATE_LIMIT_MAX: rateLimits ? "300" : "1000000", AUTH_RATE_LIMIT_MAX: rateLimits ? "20" : "1000000",
    ...Object.fromEntries(STORE_KEYS.map((key) => [key, path.join(directory, `${key}.sqlite`)])),
    PATCHNOTES_UPLOAD_DIR: path.join(directory, "note-images"), BUG_REPORT_UPLOAD_DIR: path.join(directory, "bug-images"),
    RANK_INSIGNIA_UPLOAD_DIR: path.join(directory, "rank-images")
  };
}

// Fixed-width histograms bound memory even on long/high-volume runs.
export class Histogram {
  count = 0; total = 0; max = 0; buckets = new Map();
  add(ms) { const value = Math.max(0, ms); this.count++; this.total += value; this.max = Math.max(this.max, value); const bucket = Math.ceil(value / 5) * 5; this.buckets.set(bucket, (this.buckets.get(bucket) ?? 0) + 1); }
  percentile(fraction) { let n = 0; for (const [value, count] of [...this.buckets].sort((a,b) => a[0]-b[0])) { n += count; if (n >= this.count*fraction) return value; } return 0; }
  summary() { return { count: this.count, meanMs: Math.round(this.total / Math.max(1, this.count)), p50Ms: this.percentile(.5), p95Ms: this.percentile(.95), p99Ms: this.percentile(.99), maxMs: Math.round(this.max) }; }
}

export function argumentsFor(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith("--") || argv[i+1] === undefined || argv[i+1].startsWith("--")) throw new Error("Use --name value arguments.");
    result[argv[i].slice(2)] = argv[i+1];
  }
  return result;
}
