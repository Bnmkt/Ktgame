import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import http from "node:http";
import https from "node:https";
import { spawn, spawnSync } from "node:child_process";
import { Server } from "socket.io";

const templates = new URL("../../deploy/debian/", import.meta.url);
async function unusedPort() {
  const server = net.createServer(); await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port; await new Promise((resolve) => server.close(resolve)); return port;
}
test("Linux Nginx templates serve root routes, preserve API cookies and forward WebSocket upgrades safely", { skip: process.platform !== "linux" || spawnSync("nginx", ["-v"]).error }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ktga-nginx-test-"));
  const backend = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json"); res.setHeader("Set-Cookie", "fixture=value; HttpOnly; Secure; SameSite=Lax");
    res.end(JSON.stringify({ path: req.url, forwardedFor: req.headers["x-forwarded-for"], protocol: req.headers["x-forwarded-proto"], connection: req.socket.remotePort }));
  });
  const realtime = new Server(backend);
  let nginx, output = "";
  try {
    const www = path.join(directory, "www"), certificate = path.join(directory, "certificate");
    fs.mkdirSync(path.join(www, "assets"), { recursive: true }); fs.mkdirSync(certificate);
    fs.writeFileSync(path.join(www, "index.html"), "KTGA fixture route"); fs.writeFileSync(path.join(www, "assets/app.js"), "/* fixture */");
    const generated = spawnSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=www.ktga.me", "-keyout", path.join(certificate, "privkey.pem"), "-out", path.join(certificate, "fullchain.pem")], { encoding: "utf8" });
    assert.equal(generated.status, 0, generated.stderr);
    await new Promise((resolve) => backend.listen(0, "127.0.0.1", resolve));
    const tlsPort = await unusedPort(), httpPort = await unusedPort();
    const config = fs.readFileSync(new URL("nginx-https.conf", templates), "utf8")
      .replaceAll("listen 80;", `listen ${httpPort};`).replaceAll("listen [::]:80;", `listen [::]:${httpPort};`)
      .replaceAll("listen 443 ssl;", `listen ${tlsPort} ssl;`).replaceAll("listen [::]:443 ssl;", `listen [::]:${tlsPort} ssl;`)
      .replaceAll("/etc/letsencrypt/live/ktga.me", certificate).replaceAll("/var/www/ktga", www)
      .replaceAll("/var/log/nginx/ktga-access.log", path.join(directory, "access.log")).replaceAll("/var/log/nginx/ktga-error.log", path.join(directory, "error.log"))
      .replaceAll("127.0.0.1:4000", `127.0.0.1:${backend.address().port}`);
    const common = fs.readFileSync(new URL("nginx-common.conf", templates), "utf8").replaceAll("127.0.0.1:4000", `127.0.0.1:${backend.address().port}`);
    const filename = path.join(directory, "nginx.conf");
    fs.writeFileSync(filename, `pid ${directory}/nginx.pid; error_log ${directory}/error.log; events {} http { ${common}\n${config}\n }`);
    const syntax = spawnSync("nginx", ["-t", "-p", directory + "/", "-c", filename], { encoding: "utf8" });
    assert.equal(syntax.status, 0, syntax.stderr);
    nginx = spawn("nginx", ["-p", directory + "/", "-c", filename, "-g", "daemon off;"], { stdio: ["ignore", "pipe", "pipe"] });
    nginx.stdout.on("data", (data) => output += data); nginx.stderr.on("data", (data) => output += data);
    function call(host, route, headers = {}) {
      return new Promise((resolve, reject) => {
        const request = https.get({ hostname: "127.0.0.1", port: tlsPort, servername: host, path: route, rejectUnauthorized: false, headers: { Host: host, ...headers } }, (response) => {
          let body = ""; response.on("data", (data) => body += data); response.on("end", () => resolve({ status: response.statusCode, headers: response.headers, body }));
        }); request.on("error", reject);
      });
    }
    let ready = false;
    for (let i = 0; i < 50; i++) { try { ready = (await call("www.ktga.me", "/")).status === 200; if (ready) break; } catch {} await new Promise((resolve) => setTimeout(resolve, 50)); }
    assert.ok(ready, output);
    const route = await call("www.ktga.me", "/profil?token=fixture-secret-not-to-log");
    assert.equal(JSON.parse(route.body).path, "/profil?token=fixture-secret-not-to-log"); assert.match(route.headers["content-security-policy"], /wss:\/\/api.ktga.me/);
    assert.equal((await call("www.ktga.me", "/assets/missing.js")).status, 404);
    assert.match((await call("www.ktga.me", "/assets/app.js")).headers["cache-control"], /max-age=/);
    assert.match((await call("www.ktga.me", "/ktga/guide")).headers.location, /\/guide$/);
    assert.match((await call("www.ktga.me", "/ktga?verify-email=fixture-token")).headers.location, /\/\?verify-email=fixture-token$/);
    assert.equal((await call("ktga.me", "/faq")).headers.location, "https://www.ktga.me/faq");
    const api = await call("api.ktga.me", "/api/health", { "X-Forwarded-For": "forged-address" });
    const diagnostic = JSON.parse(api.body); assert.equal(diagnostic.path, "/api/health"); assert.equal(diagnostic.protocol, "https"); assert.equal(diagnostic.forwardedFor, "127.0.0.1");
    assert.match(api.headers["x-robots-tag"], /noindex/);
    assert.match(api.headers["set-cookie"][0], /HttpOnly; Secure/);
    const nextApi = await call("api.ktga.me", "/api/health");
    assert.equal(JSON.parse(nextApi.body).connection, diagnostic.connection);
    await new Promise((resolve, reject) => {
      const request = https.request({ hostname: "127.0.0.1", port: tlsPort, servername: "api.ktga.me", path: "/socket.io/?EIO=4&transport=websocket", rejectUnauthorized: false, headers: { Host: "api.ktga.me", Upgrade: "websocket", Connection: "Upgrade", "Sec-WebSocket-Version": "13", "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==", Origin: "https://www.ktga.me" } });
      request.setTimeout(5000, () => request.destroy(new Error("Upgrade timed out.")));
      request.on("error", reject); request.on("response", (response) => { response.resume(); reject(new Error(`Upgrade refused: ${response.statusCode}`)); });
      request.on("upgrade", (response, socket) => { assert.equal(response.statusCode, 101); socket.destroy(); resolve(); }); request.end();
    });
    assert.ok(!fs.readFileSync(path.join(directory, "access.log"), "utf8").includes("fixture-secret-not-to-log"));
  } finally {
    if (nginx && nginx.exitCode === null) { const exited = new Promise((resolve) => nginx.once("exit", resolve)); nginx.kill("SIGTERM"); await exited; }
    await new Promise((resolve) => realtime.close(resolve));
    assert.equal(path.dirname(directory), os.tmpdir()); assert.ok(path.basename(directory).startsWith("ktga-nginx-test-")); fs.rmSync(directory, { recursive: true, force: true });
  }
});
