import fs from "node:fs";
import os from "node:os";
import { fork } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { testMetadata, testProcessEnvironment, validateTestConfig, sanitizeTestReport } from "./capacity-config.js";

const ACTIVE = new Set(["starting", "running", "stopping"]);
export function createCapacityTests(filename, { guard = () => ({ rooms: 0, loopP95: 0 }), version = () => "unknown", spawn = fork, now = Date.now, enabled = process.env.KTGA_TEST_CHILD !== "1" } = {}) {
  if (!enabled) return { available: false, close: async () => {} };
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=1000;
    CREATE TABLE IF NOT EXISTS test_runs(id TEXT PRIMARY KEY, created_at TEXT NOT NULL, state TEXT NOT NULL, data TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_test_runs_created ON test_runs(created_at);`);
  for (const row of db.prepare("SELECT * FROM test_runs WHERE state IN ('starting','running','stopping')").all()) {
    const data = JSON.parse(row.data); data.state = "interrupted"; data.finishedAt = new Date(now()).toISOString(); data.stopReason = "server-restarted";
    db.prepare("UPDATE test_runs SET state=?,data=? WHERE id=?").run(data.state, JSON.stringify(data), row.id);
  }
  let active = null, closing = false;
  const save = (run) => {
    let json = JSON.stringify(run);
    // Retain metrics, not unbounded snapshots. Persistence must never crash the live server.
    while (Buffer.byteLength(json) > 7 * 1024 * 1024 && run.samples.length > 1) {
      run.samples = run.samples.filter((_row, index) => index % 2 === 0); run.sampledHistory = true; json = JSON.stringify(run);
    }
    while (Buffer.byteLength(json) > 7 * 1024 * 1024 && run.report?.health?.length > 1) {
      run.report.health = run.report.health.filter((_row, index) => index % 2 === 0); run.sampledHistory = true; json = JSON.stringify(run);
    }
    db.prepare("INSERT INTO test_runs VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,data=excluded.data").run(run.id, run.createdAt, run.state, json);
  };
  const prune = () => {
    db.prepare("DELETE FROM test_runs WHERE state NOT IN ('starting','running','stopping') AND (created_at < ? OR id NOT IN (SELECT id FROM test_runs ORDER BY created_at DESC LIMIT 50))").run(new Date(now() - 30 * 86400000).toISOString());
  };
  prune();
  const get = (id) => { const row = db.prepare("SELECT data FROM test_runs WHERE id=?").get(id); return row ? JSON.parse(row.data) : null; };
  const safety = (config) => {
    const real = guard();
    if (real.rooms > 0) return "Une vraie table est ouverte. Ferme les tables avant un test.";
    if (os.freemem() < config.freeMemoryMb * 1024 * 1024) return "Memoire libre insuffisante pour lancer ce test.";
    if (real.loopP95 > config.loopLimitMs) return "Le serveur est deja surcharge.";
    return null;
  };
  function stop(id, reason = "admin-stop") {
    if (!active || active.run.id !== id) return get(id);
    if (active.run.state !== "stopping") {
      active.run.state = "stopping"; active.run.stopReason = reason; save(active.run);
      if (active.child.connected) active.child.send({ type: "stop" });
    }
    return get(id);
  }
  return {
    available: true,
    list() {
      prune();
      return { ...testMetadata(), activeId: active?.run.id ?? null,
        safety: guard(), host: { cpus: os.availableParallelism(), totalMemory: os.totalmem(), freeMemory: os.freemem() },
        runs: db.prepare("SELECT data FROM test_runs ORDER BY created_at DESC LIMIT 50").all().map((row) => {
          const run = JSON.parse(row.data);
          const { health, ...progress } = run.progress ?? {};
          return { id: run.id, createdAt: run.createdAt, finishedAt: run.finishedAt, state: run.state, config: run.config, progress, passed: run.report?.passed, stopReason: run.stopReason };
        }) };
    },
    get, stop,
    start(input) {
      if (closing || active) throw Object.assign(new Error("Un test est deja en cours ou le serveur s'arrete."), { status: 409 });
      let config;
      try { config = validateTestConfig(input); } catch (error) { error.status = 400; throw error; }
      const blocked = safety(config);
      if (blocked) throw Object.assign(new Error(blocked), { status: 409 });
      const runner = new URL("../../scripts/capacity/admin-runner.mjs", import.meta.url);
      if (!fs.existsSync(runner)) throw Object.assign(new Error("Le moteur de test n'est pas installe."), { status: 503 });
      const run = { id: randomUUID(), createdAt: new Date(now()).toISOString(), state: "starting", config, siteVersion: version(),
        host: { cpus: os.availableParallelism(), totalMemory: os.totalmem(), freeMemory: os.freemem(), platform: os.platform(), node: process.version },
        scope: "Instance isolee sur le meme serveur ; genere aussi sa propre charge. Ne mesure pas le reseau public, TLS, nginx ou l'anti-DDoS OVH.", progress: null, samples: [], report: null };
      save(run);
      let child;
      try { child = spawn(runner, [], { env: testProcessEnvironment(), execArgv: [], windowsHide: true, stdio: ["ignore", "ignore", "ignore", "ipc"] }); }
      catch { run.state = "failed"; run.stopReason = "runner-start-failed"; run.finishedAt = new Date(now()).toISOString(); save(run); throw Object.assign(new Error("Impossible de lancer le moteur de test."), { status: 503 }); }
      let finish;
      const exited = new Promise((resolve) => { finish = resolve; });
      const entry = { run, child, exited }; active = entry;
      const monitor = setInterval(() => {
        const real = guard();
        if (real.rooms > 0) stop(run.id, "real-room-opened");
        else if (os.freemem() < config.freeMemoryMb * 1024 * 1024 || real.loopP95 > config.loopLimitMs) stop(run.id, "live-server-safety");
      }, 5000); monitor.unref();
      child.on("message", (message) => {
        if (!message || typeof message !== "object" || JSON.stringify(message).length > 8 * 1024 * 1024) return;
        if (message.type === "progress" && ACTIVE.has(run.state)) {
          if (run.state !== "stopping") run.state = "running";
          const allowed = ["phase", "clients", "connected", "requests", "errors", "actions", "completed", "p95Ms", "loadStartedAt", "at", "health"];
          run.progress = Object.fromEntries(allowed.filter((key) => message.data?.[key] !== undefined).map((key) => [key, message.data[key]]));
          if (run.samples.length < 1500) run.samples.push(run.progress);
          save(run);
        } else if (message.type === "result") {
          run.report = sanitizeTestReport(message.data);
          run.samples = run.samples.map(({ health, ...sample }) => sample); save(run);
        } else if (message.type === "cleanup-warning") {
          run.cleanupWarning = true; save(run);
        }
      });
      let settled = false;
      const complete = () => {
        if (settled) return; settled = true;
        clearInterval(monitor);
        run.finishedAt = new Date(now()).toISOString();
        const stopped = run.state === "stopping";
        run.state = stopped ? "stopped" : run.report?.passed ? "passed" : "failed";
        run.stopReason ??= run.report?.stopReason ?? "runner-failed";
        save(run); if (active === entry) active = null; prune(); finish();
      };
      child.once("error", complete); child.once("exit", complete);
      child.send({ type: "start", config }, () => {});
      return get(run.id);
    },
    async close() {
      closing = true;
      if (active) {
        const entry = active; stop(entry.run.id, "server-shutdown");
        // IPC disconnect tells the supervisor to close its direct children, including on Windows.
        entry.child.disconnect?.();
        await entry.exited;
      }
      db.close();
    }
  };
}

export function registerCapacityTestRoutes({ app, auth, requireAdmin, tests }) {
  const route = (method, suffix, handler) => app[method](`/api/admin/tests${suffix}`, auth, requireAdmin, (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!tests.available) return res.status(503).json({ error: "Tests desactives dans cette instance." });
    try { handler(req, res); } catch (error) { res.status(error.status ?? 500).json({ error: error.status ? error.message : "Operation de test impossible." }); }
  });
  route("get", "", (_req, res) => res.json(tests.list()));
  route("post", "", (req, res) => {
    if (req.body?.confirm !== true) return res.status(400).json({ error: "Confirme le lancement du test." });
    res.status(202).json(tests.start(req.body.config));
  });
  route("get", "/:id", (req, res) => { const run = tests.get(req.params.id); run ? res.json(run) : res.status(404).json({ error: "Test introuvable." }); });
  route("post", "/:id/stop", (req, res) => { const run = tests.stop(req.params.id); run ? res.json(run) : res.status(404).json({ error: "Test introuvable." }); });
  route("get", "/:id/export", (req, res) => {
    const run = tests.get(req.params.id);
    if (!run) return res.status(404).json({ error: "Test introuvable." });
    res.setHeader("Content-Disposition", `attachment; filename="ktga-test-${run.id}.json"`);
    res.json({ schemaVersion: 1, exportedAt: new Date().toISOString(), ...run });
  });
}
