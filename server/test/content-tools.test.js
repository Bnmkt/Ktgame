import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createSourceEditor, sourceFileAllowed } from "../src/services/source-editor.js";
import { createMediaLibrary, mediaPath, sanitizeMedia } from "../src/services/media-library.js";
import { normalizeBranding, validateBranding } from "../src/services/site-branding.js";

test("source drafts are versioned, do not mutate live files and reject traversal and stale writes", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ktga-source-test-"));
  try {
    await fs.mkdir(path.join(directory, "client/src"), { recursive: true });
    await fs.writeFile(path.join(directory, "client/src/main.js"), "export const value = 1;\n");
    const store = await createSourceEditor({ root: directory, directory: path.join(directory, "drafts") });
    const original = await store.file("client/src/main.js");
    await store.save({ ...original, content: "export const value = 2;\n" }, "admin");
    assert.equal(await fs.readFile(path.join(directory, "client/src/main.js"), "utf8"), original.original);
    assert.equal((await store.file(original.path)).content, "export const value = 2;\n");
    await assert.rejects(store.save({ ...original, content: "lost" }, "other"), { status: 409 });
    assert.equal((await store.list()).changes.length, 1);
    const saved = await store.file(original.path);
    assert.equal(store.history(saved.history[0].id).content, original.original);
    const job = await store.enqueue(saved.revision, "admin"); assert.equal((await store.job(job.id)).status, "queued");
    await assert.rejects(store.enqueue(saved.revision, "admin"), { status: 409 });
    for (const name of ["../server.env", "client/src/../../server/src/index.js", "client/src/.secret.js", "server/src/index.js", "client/src//main.js", "client/src/x.exe", "C:\\secret.js"]) assert.equal(sourceFileAllowed(name), false, name);
    await fs.writeFile(path.join(directory, "client/src/main.js"), "updated outside admin");
    await assert.rejects(store.save({ ...saved, content: "lost" }, "admin"), { status: 409 });
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test("media library preserves PNG alpha, deduplicates, retains published archived assets and validates branding", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ktga-media-test-"));
  try {
    const png = await fs.readFile(new URL("../../client/public/pwa/icon-192.png", import.meta.url));
    const image = sanitizeMedia(png, "image/png"); assert.equal(image.width, 192); assert.equal(image.data[25], png[25]);
    const library = await createMediaLibrary(directory), row = await library.save(png, "image/png", "Icon", "admin");
    assert.equal((await library.save(png, "image/png", "Again", "admin")).id, row.id); assert.equal(library.list().length, 1);
    assert.equal(mediaPath("/api/media/../secret"), ""); assert.equal(normalizeBranding({ faviconImage: "javascript:alert(1)" }).faviconImage, "");
    assert.equal(validateBranding({ pwaIcons: { "192": row.image } }, library).pwaIcons["192"], row.image);
    assert.throws(() => validateBranding({ pwaIcons: { "512": row.image } }, library));
    await library.update(row.id, { archived: true }); assert.equal(library.list().length, 0); assert.ok(library.get(row.id));
    for (const body of [Buffer.from("<svg onload='alert(1)'/>"), Buffer.alloc(4 * 1024 * 1024)]) assert.throws(() => sanitizeMedia(body, "image/png"));
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
