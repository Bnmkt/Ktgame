import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const origin = process.env.SEO_ORIGIN || "https://www.ktga.me";
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const output = new URL(`../../docs/previews/seo-audit-20261023/${Date.now()}/`, import.meta.url);
await fs.mkdir(output, { recursive: true });
const report = { auditDate: "2026-10-23", at: new Date().toISOString(), origin, pages: [], resources: [], links: [], rendered: [], controls: [], findings: [] };
try {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const parser = await context.newPage();
  const sitemapResponse = await context.request.get(`${origin}/sitemap.xml`);
  const sitemap = await sitemapResponse.text();
  const urls = await parser.evaluate((xml) => [...new DOMParser().parseFromString(xml, "application/xml").querySelectorAll("url > loc")].map((node) => node.textContent), sitemap);
  if (sitemapResponse.status() !== 200 || !urls.includes(`${origin}/`)) throw new Error("Sitemap unavailable or missing its canonical homepage");
  report.sitemap = { status: sitemapResponse.status(), urls: urls.length, unique: new Set(urls).size };
  report.robots = { status: 0, text: "" };
  const robots = await context.request.get(`${origin}/robots.txt`);
  report.robots = { status: robots.status(), text: await robots.text() };
  const resources = new Set(), links = new Set(), fingerprints = new Map();
  for (const url of urls) {
    if (new URL(url).origin !== origin) { report.findings.push({ kind: "foreign-sitemap-url", url }); continue; }
    const response = await context.request.get(url, { maxRedirects: 0 });
    const html = await response.text();
    const data = await parser.evaluate(({ html, url }) => {
      const doc = new DOMParser().parseFromString(html, "text/html");
      const resolve = (value) => { try { return new URL(value, url).href; } catch { return ""; } };
      const anchors = [...doc.querySelectorAll("a[href]")].map((node) => ({ href: resolve(node.getAttribute("href")), text: node.textContent.trim() }));
      const brokenFragments = anchors.filter(({ href }) => {
        try { const parsed = new URL(href), current = new URL(url); return parsed.origin === current.origin && parsed.pathname === current.pathname && parsed.search === current.search && parsed.hash && !doc.getElementById(decodeURIComponent(parsed.hash.slice(1))) && !["connexion", ""].includes(parsed.hash.slice(1)); } catch { return false; }
      });
      const images = [...doc.querySelectorAll("img")].map((node) => ({ src: resolve(node.getAttribute("src")), alt: node.getAttribute("alt"), width: node.getAttribute("width"), height: node.getAttribute("height") }));
      const assets = [...doc.querySelectorAll('script[src], link[rel="stylesheet"][href]')].map((node) => resolve(node.getAttribute("src") || node.getAttribute("href")));
      const structured = [...doc.querySelectorAll('script[type="application/ld+json"]')].map((node) => { try { return JSON.parse(node.textContent); } catch { return { invalid: true }; } });
      const headings = [...doc.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((node) => ({ level: Number(node.tagName[1]), text: node.textContent.trim() }));
      const title = doc.title, descriptions = [...doc.querySelectorAll('meta[name="description"]')].map((node) => node.content);
      const robots = [...doc.querySelectorAll('meta[name="robots"]')].map((node) => node.content), canonical = [...doc.querySelectorAll('link[rel="canonical"]')].map((node) => resolve(node.getAttribute("href")));
      for (const node of doc.querySelectorAll("script,style,noscript")) node.remove();
      const text = doc.body.textContent.replace(/\s+/g, " ").trim();
      return { title, descriptions, robots, canonical, headings, lang: doc.documentElement.lang, words: text.split(/\s+/).length, text, anchors, images, assets, brokenFragments, structured };
    }, { html, url });
    const row = { url, status: response.status(), xRobots: response.headers()["x-robots-tag"], bytes: Buffer.byteLength(html), ...data };
    report.pages.push(row);
    if (row.status !== 200) report.findings.push({ kind: "sitemap-status", url, status: row.status });
    if (row.canonical.length !== 1 || row.canonical[0] !== url) report.findings.push({ kind: "canonical", url, actual: row.canonical });
    if (row.robots.some((value) => /noindex/i.test(value)) || /noindex/i.test(row.xRobots || "")) report.findings.push({ kind: "noindex-in-sitemap", url });
    if (row.headings.filter((heading) => heading.level === 1).length !== 1) report.findings.push({ kind: "h1-count", url, headings: row.headings.filter((heading) => heading.level === 1) });
    if (!row.title || row.descriptions.length !== 1 || !row.descriptions[0]) report.findings.push({ kind: "missing-metadata", url });
    if (row.words < 100) report.findings.push({ kind: "little-public-text-review", url, words: row.words });
    if (row.brokenFragments.length) report.findings.push({ kind: "broken-fragments", url, fragments: row.brokenFragments });
    if (row.structured.some((value) => value.invalid)) report.findings.push({ kind: "invalid-json-ld", url });
    const textHash = createHash("sha256").update(row.text).digest("hex");
    if (fingerprints.has(textHash)) report.findings.push({ kind: "identical-body", url, other: fingerprints.get(textHash) });
    fingerprints.set(textHash, url);
    for (const asset of [...row.assets, ...row.images.map((image) => image.src)]) if (asset.startsWith(`${origin}/`)) resources.add(asset);
    for (const anchor of row.anchors) {
      if (!anchor.href.startsWith(`${origin}/`)) continue;
      const target = new URL(anchor.href); target.hash = "";
      if (!/token|password|verify|secret|preview|parental|code/i.test(target.search)) links.add(target.href);
    }
    console.log(JSON.stringify({ page: new URL(url).pathname + new URL(url).search, status: row.status, words: row.words, h1: row.headings.filter((heading) => heading.level === 1).length }));
  }
  for (const url of resources) {
    const response = await context.request.head(url);
    const row = { url, status: response.status(), type: response.headers()["content-type"], bytes: Number(response.headers()["content-length"]) || 0 };
    report.resources.push(row);
    if (row.status >= 400) report.findings.push({ kind: "broken-resource", ...row });
  }
  for (const url of links) {
    if (urls.includes(url) || /\/(api|table|observer|evenement|profil|admin|shop|classements|tribunal|bugs)(\/|$)/.test(new URL(url).pathname)) continue;
    const response = await context.request.get(url, { maxRedirects: 0 });
    const row = { url, status: response.status(), location: response.headers().location };
    report.links.push(row);
    if (row.status >= 400) report.findings.push({ kind: "broken-link", ...row });
  }
  for (const path of ["/missing-seo-audit-page", "/jeux/missing-seo-audit-game", "/pages/missing-seo-audit-page", "/patchnotes?version=missing-seo-audit-version", "/admin", "/profil", "/parents?parental-access=audit-placeholder"]) {
    const response = await context.request.get(origin + path, { maxRedirects: 0 });
    report.controls.push({ path, status: response.status(), robots: response.headers()["x-robots-tag"] });
  }
  await context.close();
  const rendered = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await rendered.newPage();
  if (process.env.BLOCKER_MODULE) {
    const { PlaywrightBlocker } = await import(pathToFileURL(process.env.BLOCKER_MODULE).href);
    await (await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch)).enableBlockingInPage(page);
    report.contentBlocker = true;
  }
  const errors = []; page.on("pageerror", (error) => errors.push(error.message));
  for (const path of ["/", "/jeux", "/jeux/yahtzee", "/parents", "/pages/nos-mascottes", "/patchnotes", "/patchnotes?version=0.2.1"]) {
    const response = await page.goto(origin + path, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1400);
    const state = await page.evaluate(() => ({ url: location.href, title: document.title, canonical: document.querySelector('link[rel="canonical"]')?.href, robots: document.querySelector('meta[name="robots"]')?.content, overflow: document.documentElement.scrollWidth > innerWidth + 1, brokenImages: [...document.images].filter((image) => image.complete && !image.naturalWidth && image.getAttribute("src")).map((image) => image.getAttribute("src")) }));
    report.rendered.push({ path, status: response.status(), ...state });
    if (path === "/" && process.env.EXPECT_SEO_IMPROVEMENTS) {
      if (!(await page.locator(".public-casino-info").isVisible())) report.findings.push({ kind: "public-introduction-missing", path });
    }
    const before = report.pages.find((row) => row.url === origin + path);
    if (before && before.canonical[0] !== state.canonical) report.findings.push({ kind: "javascript-canonical-change", path, before: before.canonical[0], after: state.canonical });
    if (state.brokenImages.length) report.findings.push({ kind: "rendered-broken-images", path, images: state.brokenImages });
    if (state.overflow) report.findings.push({ kind: "desktop-overflow", path });
  }
  for (const path of ["/", "/jeux", "/jeux/yahtzee"]) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(origin + path, { waitUntil: "domcontentloaded" }); await page.waitForTimeout(1000);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    if (overflow) report.findings.push({ kind: "mobile-overflow", path });
    await page.screenshot({ path: fileURLToPath(new URL(`mobile-${path.replaceAll("/", "-") || "home"}.png`, output)), fullPage: false });
  }
  report.errors = errors;
  await rendered.close();
} finally {
  await fs.writeFile(new URL("report.json", output), JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(JSON.stringify({ report: fileURLToPath(new URL("report.json", output)), pages: report.pages.length, resources: report.resources.length, links: report.links.length, findings: report.findings, errors: report.errors }, null, 2));
