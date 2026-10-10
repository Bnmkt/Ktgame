import test from "node:test";
import assert from "node:assert/strict";
import { capacityConfiguration, backendConfiguration } from "../../deploy/debian/nginx-capacity.mjs";

test("Nginx capacity tuning preserves unrelated configuration and is idempotent", () => {
  const source = '# events { worker_connections 1; }\nuser www-data;\nevents {\n  worker_connections 768; # existing limit\n}\nhttp { log_format custom "events { ; } #"; }\n';
  const result = capacityConfiguration(source);
  assert.equal(result, "worker_rlimit_nofile 65536;\n" + source.replace("worker_connections 768;", "worker_connections 8192;"));
  assert.equal(capacityConfiguration(result), result);
});

test("Nginx capacity tuning respects larger operator limits", () => {
  const source = "worker_rlimit_nofile 100000; events { worker_connections 10000; }";
  assert.equal(capacityConfiguration(source), source);
  assert.equal(capacityConfiguration("worker_rlimit_nofile 1024; events { worker_connections 768; }"), "worker_rlimit_nofile 65536; events { worker_connections 8192; }");
});

test("Nginx capacity tuning refuses ambiguous or incomplete configurations", () => {
  for (const source of ["events {}", "events { worker_connections 768; worker_connections 1024; }", "events { worker_connections $limit; }", "events { worker_connections 768; } events { worker_connections 768; }", "events { worker_connections 768;", "http { worker_connections 768; }"]) {
    assert.throws(() => capacityConfiguration(source));
  }
});

test("backend keepalive preserves headers and custom directives, with an idempotent upgrade map", () => {
  const common = "map $http_upgrade $ktga_connection_upgrade { default upgrade; '' close; }\n# keep my comment\n";
  const site = 'server { location / { proxy_pass http://127.0.0.1:4000; proxy_http_version 1.1; proxy_set_header Host $host; add_header Example "{} #"; } }';
  const next = backendConfiguration(common, site);
  assert.match(next.common, /'' '';/); assert.match(next.common, /keepalive 256;/); assert.ok(next.common.includes("# keep my comment"));
  assert.match(next.site, /proxy_pass http:\/\/ktga_backend;/); assert.match(next.site, /Connection \$ktga_connection_upgrade;/);
  assert.ok(next.site.includes('add_header Example "{} #";'));
  assert.deepEqual(backendConfiguration(next.common, next.site), next);
  assert.equal(backendConfiguration(next.common.replace("keepalive 256", "keepalive 512"), next.site).common, next.common.replace("keepalive 256", "keepalive 512"));
  assert.throws(() => backendConfiguration(common, site.replace("1.1", "1.0")));
  assert.throws(() => backendConfiguration(common, site.replace("proxy_set_header Host $host;", "proxy_set_header Connection close;")));
  assert.throws(() => backendConfiguration(next.common.replace("127.0.0.1:4000", "127.0.0.1:9999"), next.site));
});
