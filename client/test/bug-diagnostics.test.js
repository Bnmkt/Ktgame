import test from "node:test";
import assert from "node:assert/strict";
import { createDiagnosticCollector, diagnosticRoute } from "../src/features/bugs/diagnostics.js";
import { issueIdentifier } from "../src/features/bugs/identifiers.js";

test("no environment reads, errors or listeners until explicit consent, revocation clears all", () => {
  let reads = 0; const listeners = new Map();
  const win = { addEventListener: (key, handler) => listeners.set(key, handler), removeEventListener: (key) => listeners.delete(key), navigator: { get userAgent() { reads++; return "Mozilla/5.0 Windows Firefox/144.0"; } }, screen: { width: 1920, height: 1080 }, innerWidth: 1200, innerHeight: 900 };
  const collector = createDiagnosticCollector(() => { reads++; return win; });
  const socketListeners = new Map(), socket = { on: (key, callback) => socketListeners.set(key, callback), off: (key) => socketListeners.delete(key) };
  const unregister = collector.registerSocket(socket);
  collector.recordApiFailure("/api/auth/login?password=SECRET", "POST", 403);
  assert.equal(collector.snapshot(), null); assert.equal(reads, 0); assert.equal(listeners.size, 0); assert.equal(socketListeners.size, 0);
  collector.start(); assert.equal(listeners.size, 2); assert.equal(socketListeners.size, 2);
  listeners.get("error")({ type: "error", error: { name: "TypeError", message: "SECRET password", stack: "SECRET" }, filename: "https://site/assets/app.js?token=SECRET", lineno: 42 });
  for (let n = 0; n < 20; n++) collector.recordApiFailure("/ktga/api/rooms/SECRET/actions?token=SECRET", "POST", 500);
  socketListeners.get("connect_error")({ message: "SECRET" });
  const data = collector.snapshot("0.1.0"); assert.equal(data.browser, "Firefox"); assert.equal(data.system, "Windows"); assert.equal(data.javascript[0].line, 42); assert.equal(data.api.length, 10); assert.ok(!JSON.stringify(data).includes("SECRET"));
  collector.stop(); assert.equal(collector.snapshot(), null); assert.equal(listeners.size, 0); assert.equal(socketListeners.size, 0);
  collector.start(); assert.equal(collector.snapshot().api.length, 0); collector.stop(); unregister();
});
test("diagnostic routes hide IDs, queries, credentials and non-API paths", () => {
  assert.equal(diagnosticRoute("https://user:password@site/api/rooms/private-id?token=secret"), "/api/rooms/:id");
  assert.equal(diagnosticRoute("/reset-password/secret"), "/:page");
});
test("private report receipts retain cryptographic UUIDs on local HTTP browsers", () => {
  const id = issueIdentifier({ getRandomValues: (bytes) => { for (let i = 0; i < bytes.length; i++) bytes[i] = i; return bytes; } });
  assert.match(id, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
});
