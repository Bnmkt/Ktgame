import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import express from "express";
import helmet from "helmet";
import { registerDiscordActivity, activityCsp, activityPageCsp, discordActivityOrigin } from "../src/services/discord-activity.js";

test("only dedicated activity documents allow Discord frames; assets and direct room reloads work", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ktga-activity-pages-"));
  fs.mkdirSync(path.join(directory, "discord-activity")); fs.mkdirSync(path.join(directory, "assets"));
  fs.writeFileSync(path.join(directory, "discord-activity/index.html"), "<!doctype html><h1>Activity entry</h1>"); fs.writeFileSync(path.join(directory, "assets/test.js"), "export const loaded=true;");
  const app = express(); app.use(helmet());
  registerDiscordActivity({ app, clientDist: directory }); app.get("/", (_req, res) => res.send("Classic site"));
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const route of ["/discord-activity/", "/discord-activity/table/ABC123", "/discord-activity/patchnotes/0.2.1", "/discord-activity/index.html"]) {
      const response = await fetch(origin + route); assert.equal(response.status, 200, route); assert.match(await response.text(), /Activity entry/); assert.equal(response.headers.get("content-security-policy"), activityCsp); assert.equal(response.headers.get("x-frame-options"), null); assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
    }
    assert.match(await (await fetch(origin + "/discord-activity/assets/test.js")).text(), /loaded=true/);
    assert.equal((await fetch(origin + "/discord-activity/assets/missing.js")).status, 404);
    const classic = await fetch(origin + "/"); assert.equal(classic.headers.get("x-frame-options"), "SAMEORIGIN"); assert.match(classic.headers.get("content-security-policy"), /frame-ancestors 'self'/);
    assert.equal(discordActivityOrigin({ available: false, clientId: "123456789012345678" }), "");
    assert.match(activityPageCsp({ available: true, clientId: "123456789012345678" }), /connect-src 'self' wss:\/\/123456789012345678\.discordsays\.com$/);
  } finally {
    await new Promise(resolve => server.close(resolve));
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir())); assert.ok(path.basename(directory).startsWith("ktga-activity-pages-")); fs.rmSync(directory, { recursive: true, force: true });
  }
});
