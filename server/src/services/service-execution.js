import { performance } from "node:perf_hooks";
import { DurationTelemetry } from "./duration-telemetry.js";

export const serviceNames = {
  interface: "Interface et API", rooms: "Moteurs de table", information: "Informations joueur",
  transactions: "Transactions", history: "Historique", statistics: "Statistiques",
  achievements: "Succès et récompenses", ranked: "Classement", persistence: "Écritures en base",
  account: "Compte personnel", "public-profile": "Profil public", "user-search": "Recherche de joueurs",
  notifications: "Notifications", "achievement-list": "Catalogue et progression des succès", shop: "Catalogue boutique"
};

export function createServiceExecution() {
  const entries = new Map(Object.keys(serviceNames).map((name) => [name, { submitted: 0, completed: 0, failed: 0, busy: 0, processing: new DurationTelemetry() }]));
  return {
    record(name, duration, ok = true) {
      const entry = entries.get(name);
      if (!entry) throw new Error("Unknown execution service.");
      entry.submitted++; entry[ok ? "completed" : "failed"]++; entry.processing.record(duration);
    },
    measure(name, operation) {
      const entry = entries.get(name);
      if (!entry) throw new Error("Unknown execution service.");
      const started = performance.now();
      entry.submitted++; entry.busy++;
      const done = (ok) => { entry.busy--; entry[ok ? "completed" : "failed"]++; entry.processing.record(performance.now() - started); };
      try {
        const result = operation();
        if (result && typeof result.then === "function") return Promise.resolve(result).then((value) => { done(true); return value; }, (error) => { done(false); throw error; });
        done(true);
        return result;
      } catch (error) { done(false); throw error; }
    },
    health(workerHealth, gameHealth) {
      return Object.fromEntries([...entries].map(([name, entry]) => [name, {
        name: serviceNames[name], mode: workerHealth?.services[name] ? "read-worker" : "main",
        ...entry, processing: entry.processing.snapshot(), queued: 0, rejected: 0, cancelled: 0, timedOut: 0,
        ...(workerHealth?.services[name] ?? {}),
        ...(name === "rooms" && gameHealth?.enabled ? { name: "Transitions de table", mode: "game-process",
          queued: gameHealth.queued, rejected: gameHealth.rejected,
          timedOut: (gameHealth.retired?.timeouts ?? 0) + gameHealth.workers.reduce((sum, worker) => sum + (worker.timeouts ?? 0), 0) } : {})
      }]));
    }
  };
}
