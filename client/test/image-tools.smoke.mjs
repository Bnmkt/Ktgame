import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const directory = new URL(`../../docs/previews/image-tools-20261018/${Date.now()}/`, import.meta.url);
await mkdir(directory, { recursive: true });
const errors = [], uploads = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", error => errors.push(error.message));
  if (process.env.BLOCKER_MODULE) {
    const { PlaywrightBlocker } = await import(pathToFileURL(process.env.BLOCKER_MODULE).href);
    const blocker = await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch);
    await blocker.enableBlockingInPage(page);
  }
  let sample;
  const image = `/api/media/${"a".repeat(64)}.png`;
  await page.route("**/api/**", async route => {
    const req = route.request(), endpoint = new URL(req.url()).pathname;
    const headers = { "Access-Control-Allow-Origin": req.headers().origin || "http://127.0.0.1:5197", "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (req.method() === "POST") {
      uploads.push({ endpoint, type: req.headers()["content-type"], body: req.postDataBuffer() });
      return route.fulfill({ json: { image, id: "test-insignia" }, headers });
    }
    if (endpoint === image) return route.fulfill({ body: sample, contentType: "image/png", headers });
    if (endpoint === "/api/admin/media") return route.fulfill({ json: [{ id: "test-image", image, name: "Texture", alt: "Texture", width: 100, height: 100, mime: "image/png" }], headers });
    return route.fulfill({ json: [], headers });
  });
  await page.goto(`${process.env.IMAGE_TOOLS_ORIGIN || "http://127.0.0.1:5197"}/test/fixtures/image-tools.html`);
  await page.getByRole("heading", { name: "Images et textures" }).waitFor();
  const pixels = await page.evaluate(async () => {
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 100;
    const context = canvas.getContext("2d");
    for (const [color, x, y] of [["#ff0000", 0, 0], ["#00ff00", 50, 0], ["#0000ff", 0, 50]]) { context.fillStyle = color; context.fillRect(x, y, 50, 50); }
    const data = canvas.toDataURL("image/png");
    const source = new Image(); source.src = data; await source.decode();
    const colors = [];
    for (const rotation of [0, 90, 180, -90]) for (const flipX of [false, true]) for (const flipY of [false, true]) {
      for (const encoder of [window.imageTools.encodeArtworkCrop, window.imageTools.encodeInsigniaCrop]) {
        const blob = await encoder(source, { rotation, flipX, flipY }, { width: 100, height: 100 });
        const decoded = await createImageBitmap(blob);
        const output = document.createElement("canvas"); output.width = output.height = 100;
        const ctx = output.getContext("2d"); ctx.drawImage(decoded, 0, 0, 100, 100); decoded.close();
        const results = [];
        for (const [x, y] of [[25, 25], [75, 25], [25, 75], [75, 75]]) {
          const angle = -rotation * Math.PI / 180;
          const dx = x - 50, dy = y - 50;
          const originalX = (dx * Math.cos(angle) - dy * Math.sin(angle)) * (flipX ? -1 : 1) + 50;
          const originalY = (dx * Math.sin(angle) + dy * Math.cos(angle)) * (flipY ? -1 : 1) + 50;
          const expected = originalY < 50 ? originalX < 50 ? [255,0,0,255] : [0,255,0,255] : originalX < 50 ? [0,0,255,255] : [0,0,0,0];
          const actual = [...ctx.getImageData(x, y, 1, 1).data];
          if (actual.some((value, i) => Math.abs(value - expected[i]) > 1)) throw new Error(`Pixel mismatch ${rotation}/${flipX}/${flipY}: ${actual} != ${expected}`);
          results.push(actual);
        }
        colors.push(results);
      }
    }
    for (const mime of ["image/png", "image/jpeg"]) {
      const blob = await window.imageTools.encodeArtworkCrop(source, { rotation: 45 }, { width: 100, height: 100 }, mime);
      const bitmap = await createImageBitmap(blob);
      const output = document.createElement("canvas"); output.width = output.height = 100;
      const ctx = output.getContext("2d"); ctx.drawImage(bitmap, 0, 0); bitmap.close();
      const pixel = [...ctx.getImageData(0, 0, 1, 1).data];
      if (mime === "image/png" ? pixel[3] !== 0 : pixel.some(value => value < 248)) throw new Error(`Unexpected rotated margin for ${mime}: ${pixel}`);
    }
    return { data: data.split(",")[1], cases: colors.length };
  });
  sample = Buffer.from(pixels.data, "base64");
  const file = { name: "transparent.png", mimeType: "image/png", buffer: sample };
  const firstSlot = page.locator(".shop-artwork-slot").first();
  await firstSlot.getByRole("button", { name: "Importer une image" }).click();
  await page.locator(".game-art-file").setInputFiles(file);
  await page.getByRole("button", { name: "Tourner de 90° à droite", exact: true }).click();
  await page.getByRole("button", { name: "Retourner horizontalement", exact: true }).click();
  assert.match(await page.locator(".game-art-crop img").getAttribute("style"), /rotate\(90deg\) scale\(-1, 1\)/);
  await page.getByLabel("Rotation en degrés", { exact: true }).fill("35");
  await page.getByRole("button", { name: "Grille de cadrage", exact: true }).click();
  assert.equal(await page.locator(".crop-grid-overlay").count(), 0);
  await page.screenshot({ path: new URL("crop-desktop.png", directory).pathname.replace(/^\/(\w:)/, "$1") });
  await page.getByRole("button", { name: "Appliquer le recadrage" }).click();
  await page.locator(".game-art-editor").waitFor({ state: "detached" });
  assert.equal(await page.evaluate(() => window.imageTools.item.design.faceImage), image);
  assert.equal(await page.evaluate(() => window.imageTools.item.design.backImage), "");
  assert.equal(uploads[0].endpoint, "/api/admin/media");
  assert.equal(uploads[0].type, "image/png");
  assert.ok(uploads[0].body.length > 100);
  assert.match(await page.locator(".admin-card-preview .playing-card:not(.card-back)").first().evaluate(element => getComputedStyle(element).backgroundImage), /api\/media/);
  assert.match(await page.evaluate(() => window.imageTools.item.css), /border-color/);
  await page.screenshot({ path: new URL("shop-desktop.png", directory).pathname.replace(/^\/(\w:)/, "$1") });
  await page.getByRole("button", { name: "Insigne de test", exact: true }).click();
  await page.locator(".ranked-image-input").setInputFiles(file);
  await page.getByRole("button", { name: "Tourner de 90° à gauche", exact: true }).click();
  await page.getByRole("button", { name: "Retourner verticalement", exact: true }).click();
  assert.match(await page.locator(".ranked-crop-stage > img").getAttribute("style"), /rotate\(-90deg\) scale\(1, -1\)/);
  const stage = await page.locator(".ranked-crop-stage").boundingBox();
  await page.mouse.move(stage.x + stage.width * 0.5, stage.y + stage.height * 0.5);
  await page.mouse.down(); await page.mouse.move(stage.x + stage.width * 0.75, stage.y + stage.height * 0.5); await page.mouse.up();
  assert.match(await page.locator(".ranked-crop-stage > img").getAttribute("style"), /rotate\(-90deg\)/);
  await page.getByRole("button", { name: "Appliquer", exact: true }).click();
  await page.locator(".ranked-insignia-dialog").waitFor({ state: "detached" });
  assert.equal(uploads.at(-1).endpoint, "/api/admin/ranked/insignia-images");
  for (const type of ["icons", "diceSkins", "memberCards", "profileBanners", "profileFrames", "cardSkins"]) {
    await page.getByRole("tab", { name: /^Fiche/ }).click();
    await page.locator(".shop-studio-section .admin-field-grid select").first().selectOption(type);
    await page.getByRole("tab", { name: /^Apparence/ }).click();
    await page.locator(".shop-artwork-slot").first().getByRole("button", { name: /^Médiathèque/ }).click();
    await page.locator(".media-library-item").click();
    await page.getByRole("button", { name: "Choisir", exact: true }).click();
    if (type === "icons") assert.ok(await page.locator(".shop-preview .cosmetic-icon img").count());
    else assert.match(await page.locator(".shop-preview style").textContent(), /api\/media/);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: new URL("shop-mobile.png", directory).pathname.replace(/^\/(\w:)/, "$1") });
  assert.equal(await page.locator(".shop-admin-editor").evaluate(element => element.getBoundingClientRect().right <= innerWidth), true);
  await firstSlot.getByRole("button", { name: "Recadrer · Face des cartes" }).click();
  await page.getByRole("button", { name: "Retourner verticalement", exact: true }).click();
  await page.screenshot({ path: new URL("crop-mobile.png", directory).pathname.replace(/^\/(\w:)/, "$1") });
  const overflow = await page.locator(".game-art-editor-body").evaluate(element => ({ width: element.clientWidth, scroll: element.scrollWidth, elements: [...element.querySelectorAll("*")].filter(node => node.getBoundingClientRect().right > element.getBoundingClientRect().right + 1).map(node => [node.className, Math.round(node.getBoundingClientRect().width)]) }));
  assert.ok(overflow.scroll <= overflow.width + 1, JSON.stringify(overflow));
  const gif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
  await page.locator(".game-art-file").setInputFiles({ name: "animated.gif", mimeType: "image/gif", buffer: gif });
  await page.getByRole("button", { name: "Importer le GIF animé" }).waitFor();
  assert.equal(await page.locator(".game-art-editor .crop-tools").count(), 0);
  await page.getByRole("button", { name: "Importer le GIF animé" }).click();
  await page.locator(".game-art-editor").waitFor({ state: "detached" });
  assert.equal(uploads.at(-1).type, "image/gif");
  assert.ok(uploads.at(-1).body.equals(gif));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ pixelCases: pixels.cases, uploads: uploads.length, desktopMobile: true, errors }));
} finally { await browser.close(); }
