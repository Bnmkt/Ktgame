import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Nginx gives API images precedence over its static file extension rule", () => {
  const config = fs.readFileSync(new URL("../../deploy/debian/nginx-https.conf", import.meta.url), "utf8");
  const website = config.split("server_name www.ktga.me;")[1].split("server_name api.ktga.me;")[0];
  const api = website.match(/location \^~ \/api\/ \{([^}]+)\}/)?.[1];
  assert.ok(api, "A high-priority API route must prevent PNG requests from hitting try_files");
  assert.match(api, /proxy_pass http:\/\/ktga_backend;/);
  assert.match(api, /client_max_body_size 4m;/);
  assert.match(api, /proxy_set_header X-Forwarded-For \$remote_addr;/);
  assert.match(website, /location \^~ \/assets\//, "Static frontend assets must keep their dedicated route");
});
