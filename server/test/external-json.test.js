import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { externalUrl, publicAddress, resolveExternal, fetchExternalJson } from "../src/services/external-json.js";

test("SSRF validation blocks non-public addresses, alternate encodings, credentials and unsafe URL schemes", async () => {
  for (const ip of ["127.0.0.1", "10.0.0.2", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "198.18.0.1", "::1", "::ffff:127.0.0.1", "fc00::1", "fe80::1", "2001:db8::1", "2002:7f00:1::", "64:ff9b::7f00:1"]) assert.equal(publicAddress(ip), false, ip);
  for (const url of ["http://provider.com", "file:///etc/passwd", "https://localhost", "https://foo.internal/", "https://user:pass@provider.com", "https://provider.com:8443", "https://127.1", "https://2130706433", "https://0x7f000001", "https://[::1]", "https://[::ffff:127.0.0.1]", "https://provider.com./", "https://provider.com\\@localhost"]) assert.throws(() => externalUrl(url), undefined, url);
  assert.equal(publicAddress("8.8.8.8"), true);
  assert.equal(publicAddress("2606:4700:4700::1111"), true);
  await assert.rejects(resolveExternal("https://provider.com", async () => [{ address: "8.8.8.8", family: 4 }, { address: "10.0.0.1", family: 4 }]), /Internet public/);
  assert.equal((await resolveExternal("https://provider.com", async () => [{ address: "8.8.8.8", family: 4 }])).addresses.length, 1);
});

function transport({ status = 200, type = "application/json", body = '{"views":42}', encoding, inspect = () => {} } = {}) {
  return (url, options, callback) => {
    inspect(url, options);
    const req = new EventEmitter();
    req.destroy = error => { req.emit("error", error); req.emit("close"); };
    req.end = () => queueMicrotask(() => {
      const response = new PassThrough(); response.statusCode = status; response.headers = { "content-type": type, ...(encoding ? { "content-encoding": encoding } : {}) };
      response.on("end", () => req.emit("close")); callback(response); response.end(body);
    });
    return req;
  };
}
test("HTTPS sockets pin validated DNS results; redirects, oversized and invalid responses are rejected", async () => {
  let lookups = 0;
  const options = { resolve: async () => { lookups++; return [{ address: "8.8.8.8", family: 4 }]; }, request: transport({ inspect: (_url, config) => { assert.equal(config.agent, false); config.lookup("provider.com", { all: true }, (error, addresses) => { assert.equal(error, null); assert.equal(addresses[0].address, "8.8.8.8"); }); } }) };
  assert.deepEqual(await fetchExternalJson("https://provider.com/stats", options), { views: 42 });
  assert.equal(lookups, 1);
  for (const config of [{ status: 302 }, { type: "text/html" }, { body: "invalid" }, { body: JSON.stringify({ huge: "x".repeat(600000) }) }, { encoding: "gzip" }]) await assert.rejects(fetchExternalJson("https://provider.com", { ...options, request: transport(config) }));
});
