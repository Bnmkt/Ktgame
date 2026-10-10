import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

function tokensFor(source) {
  return [...source.matchAll(/#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[{};]|[^\s{};#"']+/g)]
    .filter((match) => !match[0].startsWith("#"));
}
function applyChanges(source, changes) {
  for (const change of changes.sort((a, b) => b.start - a.start)) source = source.slice(0, change.start) + change.text + source.slice(change.end);
  return source;
}
function directivesFor(source) {
  const root = { children: [] }, stack = [root];
  let tokens = [];
  for (const token of tokensFor(source)) {
    if (token[0] === "{") {
      if (!tokens.length) throw new Error("Missing Nginx block name.");
      const block = { tokens, children: [] };
      stack.at(-1).children.push(block); stack.push(block); tokens = [];
    } else if (token[0] === "}") {
      if (stack.length === 1 || tokens.length) throw new Error("Invalid Nginx block boundary.");
      stack.pop();
    } else if (token[0] === ";") {
      if (!tokens.length) throw new Error("Empty Nginx directive.");
      stack.at(-1).children.push({ tokens, end: token.index + 1 }); tokens = [];
    } else tokens.push(token);
  }
  if (stack.length !== 1 || tokens.length) throw new Error("Incomplete Nginx configuration.");
  return root;
}

// Keep unrelated configuration, comments and quoted values byte-for-byte intact.
export function capacityConfiguration(source) {
  const tokens = tokensFor(source);
  const contexts = [], changes = [], seen = new Set();
  let directive = [], eventBlocks = 0;
  for (const token of tokens) {
    if (token[0] === "{") {
      const name = directive[0]?.[0];
      if (name === "events" && !contexts.length) eventBlocks++;
      contexts.push(name);
      directive = [];
    } else if (token[0] === "}") {
      if (!contexts.length || directive.length) throw new Error("Unexpected Nginx block boundary.");
      contexts.pop();
    } else if (token[0] === ";") {
      const name = directive[0]?.[0];
      const limit = name === "worker_connections" && contexts.length === 1 && contexts[0] === "events"
        ? 8192 : name === "worker_rlimit_nofile" && !contexts.length ? 65536 : null;
      if (limit !== null) {
        if (seen.has(name) || directive.length !== 2 || !/^\d+$/.test(directive[1][0])) throw new Error(`Unsupported ${name} directive.`);
        seen.add(name);
        if (Number(directive[1][0]) < limit) changes.push({ start: directive[1].index, end: directive[1].index + directive[1][0].length, text: String(limit) });
      }
      directive = [];
    } else directive.push(token);
  }
  if (contexts.length || directive.length || eventBlocks !== 1 || !seen.has("worker_connections")) throw new Error("Expected one explicit events/worker_connections block; refusing to guess.");
  if (!seen.has("worker_rlimit_nofile")) changes.push({ start: 0, end: 0, text: "worker_rlimit_nofile 65536;\n" });
  return applyChanges(source, changes);
}

export function backendConfiguration(common, site) {
  const root = directivesFor(common), changes = [], siteChanges = [];
  const maps = root.children.filter((row) => row.tokens[0][0] === "map" && row.tokens[2]?.[0] === "$ktga_connection_upgrade");
  if (maps.length !== 1 || maps[0].tokens[1][0] !== "$http_upgrade") throw new Error("Expected the KTGA WebSocket map.");
  const fallback = maps[0].children.filter((row) => ["''",'""'].includes(row.tokens[0][0]));
  if (fallback.length !== 1 || fallback[0].tokens.length !== 2 || !["close", "''", '""'].includes(fallback[0].tokens[1][0])) throw new Error("Unsupported KTGA connection map.");
  const replace = (list, token, text) => list.push({ start: token.index, end: token.index + token[0].length, text });
  if (fallback[0].tokens[1][0] === "close") replace(changes, fallback[0].tokens[1], "''");
  const upstreams = root.children.filter((row) => row.tokens[0][0] === "upstream" && row.tokens[1]?.[0] === "ktga_backend");
  if (upstreams.length > 1) throw new Error("Duplicate KTGA backend.");
  if (!upstreams.length) changes.push({ start:common.length, end:common.length, text:"\nupstream ktga_backend {\n    server 127.0.0.1:4000;\n    keepalive 256;\n}\n" });
  else {
    const servers = upstreams[0].children.filter((row) => row.tokens[0][0] === "server");
    const keepalive = upstreams[0].children.filter((row) => row.tokens[0][0] === "keepalive");
    if (servers.length !== 1 || servers[0].tokens.length !== 2 || servers[0].tokens[1][0] !== "127.0.0.1:4000" || keepalive.length !== 1 || keepalive[0].tokens.length !== 2 || !/^\d+$/.test(keepalive[0].tokens[1][0])) throw new Error("Unsupported KTGA backend; preserve operator settings.");
    if (Number(keepalive[0].tokens[1][0]) < 256) replace(changes, keepalive[0].tokens[1], "256");
  }
  const visit = (block) => {
    const proxies = block.children.filter((row) => row.tokens[0][0] === "proxy_pass" && ["http://127.0.0.1:4000", "http://ktga_backend"].includes(row.tokens[1]?.[0]));
    if (proxies.length) {
      const version = block.children.find((row) => row.tokens[0][0] === "proxy_http_version");
      const headers = block.children.filter((row) => row.tokens[0][0] === "proxy_set_header" && row.tokens[1]?.[0].toLowerCase() === "connection");
      if (proxies.length !== 1 || proxies[0].tokens.length !== 2 || version?.tokens[1]?.[0] !== "1.1" || headers.length > 1 || headers[0] && headers[0].tokens[2]?.[0] !== "$ktga_connection_upgrade") throw new Error("Unsupported KTGA proxy block.");
      if (proxies[0].tokens[1][0] !== "http://ktga_backend") replace(siteChanges, proxies[0].tokens[1], "http://ktga_backend");
      if (!headers.length) siteChanges.push({ start:version.end, end:version.end, text:"\n        proxy_set_header Connection $ktga_connection_upgrade;" });
    }
    for (const child of block.children) if (child.children) visit(child);
  };
  visit(directivesFor(site));
  return { common:applyChanges(common, changes), site:applyChanges(site, siteChanges) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = "/etc/nginx/nginx.conf";
  const original = fs.readFileSync(file, "utf8"), updated = capacityConfiguration(original);
  const files = [{ file, original, updated }];
  const commonFile = "/etc/nginx/conf.d/ktga-common.conf", siteFile = "/etc/nginx/sites-available/ktga";
  if (fs.existsSync(commonFile) && fs.existsSync(siteFile)) {
    const common = fs.readFileSync(commonFile, "utf8"), site = fs.readFileSync(siteFile, "utf8");
    const next = backendConfiguration(common, site);
    files.push({file:commonFile,original:common,updated:next.common},{file:siteFile,original:site,updated:next.site});
  }
  const changed = files.filter((entry) => entry.original !== entry.updated);
  if (!changed.length) {
    console.log("Nginx connection limits already sufficient.");
  } else if (!process.argv.includes("--apply")) {
    console.log("Would tune connection limits and KTGA backend keepalive. Use --apply; add --reload for a graceful reload.");
  } else {
    if (process.getuid?.() !== 0) throw new Error("Run with sudo.");
    const check = () => spawnSync("nginx", ["-t"], { stdio: "inherit" }).status === 0;
    if (!check()) throw new Error("Existing configuration invalid; no changes made.");
    const suffix = `.ktga-${Date.now()}.bak`;
    for (const entry of changed) { fs.copyFileSync(entry.file, entry.file + suffix, fs.constants.COPYFILE_EXCL); fs.chmodSync(entry.file + suffix, fs.statSync(entry.file).mode & 0o777); }
    try {
      for (const entry of changed) fs.writeFileSync(entry.file, entry.updated);
      if (!check()) throw new Error("Modified configuration invalid.");
      if (process.argv.includes("--reload") && spawnSync("systemctl", ["reload", "nginx"], { stdio: "inherit" }).status !== 0) throw new Error("Graceful reload failed.");
      console.log(`Nginx capacity updated. Backup suffix: ${suffix}`);
    } catch (error) {
      for (const entry of changed) fs.writeFileSync(entry.file, entry.original);
      if (process.argv.includes("--reload") && check()) spawnSync("systemctl", ["reload", "nginx"], { stdio: "inherit" });
      throw error;
    }
  }
}
