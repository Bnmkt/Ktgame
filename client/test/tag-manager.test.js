import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

test("standard Tag Manager snippets use the requested container and a scoped CSP hash", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8").replaceAll("\r\n", "\n");
  const policy = readFileSync(new URL("../../deploy/debian/nginx-https.conf", import.meta.url), "utf8");
  const script = html.match(/<script>(.*?)<\/script>/s)[1];
  const digest = createHash("sha256").update(script).digest("base64");
  assert.ok(html.indexOf("<!-- Google Tag Manager -->") < html.indexOf('<meta charset="UTF-8"'));
  assert.match(script, /'GTM-NV3T6P8X'/);
  assert.match(html, /<body>\s*<!-- Google Tag Manager \(noscript\) -->\s*<noscript><iframe src="https:\/\/www\.googletagmanager\.com\/ns\.html\?id=GTM-NV3T6P8X"/);
  assert.ok(policy.includes(`'sha256-${digest}'`));
  assert.ok(policy.includes("frame-src https://www.googletagmanager.com;"));
  assert.ok(!policy.match(/script-src[^;]*(?:unsafe-inline|unsafe-eval)/));
});
