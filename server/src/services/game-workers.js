import { randomUUID } from "node:crypto";
import { DurationTelemetry } from "./duration-telemetry.js";
import { performance } from "node:perf_hooks";
import { GameIpcTransport } from "./game-ipc-transport.js";

const fail = (code) => Object.assign(new Error("Room temporarily unavailable."), { code });

export function createGameWorkers({ size = 1, context, configuration, snapshot, commit, onDue,
  transportFactory = (options) => new GameIpcTransport(options), maxQueued = 512, maxPerRoom = 8 }) {
  if (!Number.isInteger(size) || size < 1 || size > 4) throw new Error("GAME_WORKERS must be 1..4.");
  const workers = [], owners = new Map(), chains = new Map(), counts = new Map();
  const timings = new DurationTelemetry(); let closed = false, queued = 0, rejected = 0, failures = 0, recoveries = 0;
  const retired = { errors: 0, timeouts: 0, rejected: 0 };
  function make(index) {
    const transport = transportFactory({ workerId: `game-${index + 1}` });
    const worker = { id: `game-${index + 1}`, transport, configurationId: null, rooms: new Set() };
    transport.on("due", (ids) => { if (!closed) for (const id of ids) if (owners.get(id)?.worker === worker && !counts.get(id)) onDue?.(id); });
    transport.on("stopped", () => { if (!closed) for (const id of worker.rooms) onDue?.(id); });
    return worker;
  }
  for (let index = 0; index < size; index++) workers.push(make(index));
  async function ownership(roomId) {
    let owner = owners.get(roomId);
    if (owner?.worker.transport.closed) {
      const dead = owner.worker;
      await dead.transport.close(); // Old process must be dead before replacing its authority.
      if (workers.includes(dead)) {
        const health = dead.transport.health();
        for (const key of Object.keys(retired)) retired[key] += health[key] ?? 0;
        const index = workers.indexOf(dead), replacement = make(index);
        workers[index] = replacement;
        for (const id of dead.rooms) owners.delete(id);
      }
      owner = owners.get(roomId);
    }
    if (!owner) {
      const worker = [...workers].filter((row) => !row.transport.closed).sort((a, b) => a.rooms.size - b.rooms.size)[0];
      if (!worker) throw fail("GAME_UNAVAILABLE");
      const current = snapshot(roomId);
      owner = { worker, epoch: randomUUID(), version: current?.gameWorker?.version ?? 0, registered: false };
      owners.set(roomId, owner); worker.rooms.add(roomId);
    }
    if (!owner.registered) {
      await owner.worker.transport.request("register", { roomId, epoch: owner.epoch, version: owner.version, room: snapshot(roomId) ?? null });
      owner.registered = true;
    }
    return owner;
  }
  async function run(roomId, command, input, commandId) {
    const owner = await ownership(roomId), transport = owner.worker.transport;
    const config = configuration();
    if (owner.worker.configurationId !== config.id) { await transport.request("configure", config); owner.worker.configurationId = config.id; }
    const state = await context(roomId, input);
    const request = { ...input, roomId, command, commandId, epoch: owner.epoch, version: owner.version, context: state.payload, configurationId: config.id };
    const result = await transport.request("prepare", request);
    if (result.duplicate) return result;
    let durable = false;
    try {
      if (!result.written && result.status >= 400 || ["tick", "expire", "activity"].includes(command) && !result.written) {
        await transport.request("abort", request);
        if (!snapshot(roomId)) { owners.delete(roomId); owner.worker.rooms.delete(roomId); }
        return result;
      }
      const financial = await commit({ ...request, result, guard: state.guard, workerId: owner.worker.id });
      durable = true;
      const acknowledgment = await transport.request("commit", { ...request, version: result.version, financial });
      owner.version = acknowledgment.version;
      if (!result.room) { owners.delete(roomId); owner.worker.rooms.delete(roomId); }
      return result;
    } catch (error) {
      // A post-COMMIT failure is recovered from the durable Gateway checkpoint;
      // never replay a financial callback merely because its acknowledgement was lost.
      if (durable) {
        await transport.close();
        const checkpoint = snapshot(roomId)?.gameWorker;
        if (checkpoint?.commandId === commandId && checkpoint.version === result.version) {
          const recovered = await ownership(roomId);
          if (recovered.version === result.version) { recoveries++; return result; }
        }
      }
      else try { await transport.request("abort", request); if (!snapshot(roomId)) { owners.delete(roomId); owner.worker.rooms.delete(roomId); } } catch {}
      if (!durable && error.code === "GAME_CONFLICT") error.gameRetryable = true;
      failures++; throw error;
    }
  }
  return {
    execute(roomId, command, input = {}, { commandId = randomUUID() } = {}) {
      if (closed) return Promise.reject(fail("GAME_UNAVAILABLE"));
      if (queued >= maxQueued || (counts.get(roomId) ?? 0) >= maxPerRoom) { rejected++; return Promise.reject(fail("GAME_BUSY")); }
      queued++; counts.set(roomId, (counts.get(roomId) ?? 0) + 1);
      const previous = chains.get(roomId) ?? Promise.resolve();
      const task = previous.catch(() => {}).then(async () => {
        const started = performance.now();
        try { return await run(roomId, command, input, commandId); }
        finally { timings.record(performance.now() - started); }
      }).finally(() => { queued--; const count = counts.get(roomId) - 1; if (count) counts.set(roomId, count); else counts.delete(roomId); if (chains.get(roomId) === task) chains.delete(roomId); });
      chains.set(roomId, task); return task;
    },
    owner(roomId) { const owner = owners.get(roomId); return owner ? { workerId: owner.worker.id, epoch: owner.epoch, version: owner.version } : null; },
    health() { return { enabled: true, queued, queueCapacity: maxQueued, rejected, failures, recoveries, retired, actions: timings.snapshot(),
      rooms: owners.size, workers: workers.map((worker) => ({ ...worker.transport.health(), workerId: worker.id, assignedRooms: worker.rooms.size })) }; },
    async close() { closed = true; await Promise.allSettled([...chains.values()]); await Promise.all(workers.map((worker) => worker.transport.close())); }
  };
}
