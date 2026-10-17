import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import rateLimit from "express-rate-limit";

export const sourceHash = text => createHash("sha256").update(text).digest("hex");
export const sourceFileAllowed = name => typeof name === "string" && name.length < 240 && path.posix.normalize(name) === name && /^client\/src\/[a-zA-Z0-9_./-]+\.(?:js|jsx|css|json)$/.test(name) && !name.split("/").some(part => part.startsWith(".") || ["node_modules", "data", "test", "tests"].includes(part));
export async function sourceTarget(root, name) {
  if (!sourceFileAllowed(name)) throw new Error("Fichier source non autorisé.");
  let target = root;
  for (const part of name.split("/")) { target = path.join(target, part); if ((await fs.lstat(target)).isSymbolicLink()) throw new Error("Liens symboliques interdits."); }
  const stat = await fs.stat(target);
  if (!stat.isFile() || stat.size > 512 * 1024) throw new Error("Fichier trop volumineux ou non éditable.");
  return target;
}

export async function createSourceEditor({ root, directory }) {
  await fs.mkdir(path.join(directory, "queue"), { recursive: true, mode: 0o750 });
  await fs.mkdir(path.join(directory, "results"), { recursive: true, mode: 0o750 });
  await fs.mkdir(path.join(directory, "drafts"), { recursive: true, mode: 0o750 });
  const filename = path.join(directory, "drafts", "workspace.json");
  let state;
  try { state = JSON.parse(await fs.readFile(filename, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; state = { files: [], history: [], revision: randomUUID() }; }
  let queue = Promise.resolve();
  const change = operation => { const task = queue.then(async () => { const next = structuredClone(state), result = await operation(next); next.revision = randomUUID(); const temporary = `${filename}.tmp`; await fs.writeFile(temporary, JSON.stringify(next), { mode: 0o640 }); await fs.rename(temporary, filename); state = next; return { ...result, revision: state.revision }; }); queue = task.catch(() => {}); return task; };
  const file = async name => { const target = await sourceTarget(root, name), original = await fs.readFile(target, "utf8"), draft = state.files.find(row => row.path === name && row.content !== original); return { path: name, original, content: draft?.content ?? original, baseHash: sourceHash(original), draftBaseHash: draft?.baseHash, revision: state.revision, history: state.history.filter(row => row.path === name).map(({ content, ...row }) => row) }; };
  return {
    async list() { const names = []; async function walk(relative) { for (const entry of await fs.readdir(path.join(root, relative), { withFileTypes: true })) { if (entry.isSymbolicLink() || entry.name.startsWith(".")) continue; const name = `${relative}/${entry.name}`; if (entry.isDirectory()) await walk(name); else if (sourceFileAllowed(name)) names.push(name); } } await walk("client/src"); const changes = []; for (const row of state.files) { const current = await fs.readFile(await sourceTarget(root, row.path), "utf8"); if (current !== row.content) { const { content, original, ...metadata } = row; changes.push(metadata); } } return { files: names.sort(), changes, revision: state.revision }; },
    file,
    save: (input, actor) => change(async next => {
      if (input.revision !== state.revision) throw Object.assign(new Error("Les sources ont changé. Recharge le fichier."), { status: 409 });
      const current = await file(input.path);
      if (current.baseHash !== input.baseHash || current.draftBaseHash && current.draftBaseHash !== input.baseHash) throw Object.assign(new Error("Le fichier déployé a changé. Recharge et rapproche les modifications."), { status: 409 });
      if (typeof input.content !== "string" || Buffer.byteLength(input.content) > 512 * 1024 || input.content.includes("\0")) throw new Error("Contenu source invalide.");
      if (input.path.endsWith(".json")) JSON.parse(input.content);
      next.history.unshift({ id: randomUUID(), path: input.path, content: current.content, actor, createdAt: new Date().toISOString() });
      next.history = next.history.slice(0, 30);
      next.files = next.files.filter(row => row.path !== input.path);
      if (input.content !== current.original) next.files.push({ path: input.path, baseHash: current.baseHash, content: input.content, actor, updatedAt: new Date().toISOString() });
      if (next.files.length > 20 || Buffer.byteLength(JSON.stringify(next)) > 20 * 1024 * 1024) throw new Error("L’espace de travail dépasse sa limite de 20 fichiers ou 20 Mo.");
      return {};
    }),
    discard: (name, revision) => change(async next => { await sourceTarget(root, name); if (revision !== state.revision) throw Object.assign(new Error("L’espace de travail a changé."), { status: 409 }); next.files = next.files.filter(row => row.path !== name); return {}; }),
    history: id => state.history.find(row => row.id === id),
    export: () => ({ revision: state.revision, files: structuredClone(state.files) }),
    async enqueue(revision, actor) {
      if (revision !== state.revision || !state.files.length) throw Object.assign(new Error("Aucun brouillon actuel à appliquer."), { status: 409 });
      const snapshot = structuredClone(state.files);
      if ((await fs.readdir(path.join(directory, "queue"))).length) throw Object.assign(new Error("Une reconstruction est déjà en attente."), { status: 409 });
      const files = [];
      for (const row of snapshot) { const text = await fs.readFile(await sourceTarget(root, row.path), "utf8"); if (text === row.content) continue; if (sourceHash(text) !== row.baseHash) throw Object.assign(new Error("Les sources déployées ont changé."), { status: 409 }); files.push(row); }
      if (revision !== state.revision || !files.length) throw Object.assign(new Error("L’espace de travail a changé."), { status: 409 });
      const job = { id: randomUUID(), revision, actor, status: "queued", createdAt: new Date().toISOString(), files };
      const target = path.join(directory, "queue", `${job.id}.json`);
      const temporary = path.join(directory, "drafts", `${job.id}.tmp`);
      await fs.writeFile(temporary, JSON.stringify(job), { mode: 0o640, flag: "wx" }); await fs.rename(temporary, target);
      return { id: job.id, status: "queued" };
    },
    async job(id) { if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Opération inconnue."); for (const folder of ["results", "queue"]) { try { const { files, ...job } = JSON.parse(await fs.readFile(path.join(directory, folder, `${id}.json`), "utf8")); return job; } catch (error) { if (error.code !== "ENOENT") throw error; } } return null; }
  };
}

export async function registerSourceEditorRoutes({ app, auth, requireAdmin, root, directory, readUser, verifyCredential, hasOpenTables }) {
  const store = await createSourceEditor({ root, directory });
  const enabled = async () => { try { await fs.access("/etc/ktga/source-editor.enabled"); return true; } catch { return false; } };
  const wrap = handler => async (req, res) => { try { res.set("Cache-Control", "no-store"); await handler(req, res); } catch (error) { res.status(error.status || 400).json({ error: error.message }); } };
  const limiter = rateLimit({ windowMs: 15 * 60000, limit: 5, standardHeaders: "draft-7", legacyHeaders: false });
  app.get("/api/admin/source", auth, requireAdmin, wrap(async (_req, res) => res.json({ ...await store.list(), canApply: await enabled() })));
  app.get("/api/admin/source/file", auth, requireAdmin, wrap(async (req, res) => res.json(await store.file(req.query.path))));
  app.put("/api/admin/source/file", auth, requireAdmin, wrap(async (req, res) => res.json(await store.save(req.body, req.auth.id))));
  app.delete("/api/admin/source/file", auth, requireAdmin, wrap(async (req, res) => res.json(await store.discard(req.body.path, req.body.revision))));
  app.get("/api/admin/source/history/:id", auth, requireAdmin, wrap(async (req, res) => res.json(store.history(req.params.id) || null)));
  app.get("/api/admin/source/export", auth, requireAdmin, wrap(async (_req, res) => res.attachment("ktga-source-patch.json").json(store.export())));
  app.get("/api/admin/source/jobs/:id", auth, requireAdmin, wrap(async (req, res) => res.json(await store.job(req.params.id))));
  app.post("/api/admin/source/apply", auth, requireAdmin, limiter, wrap(async (req, res) => {
    if (!await enabled()) throw new Error("La reconstruction sécurisée n’est pas activée sur ce serveur.");
    if (req.body.confirmation !== "APPLIQUER ET RECONSTRUIRE") throw new Error("Recopie la phrase de confirmation.");
    const user = readUser(req.auth.id), version = user?.sessionVersion ?? 0;
    if (!await verifyCredential(user, req.body.method, req.body.credential)) throw Object.assign(new Error("Vérification administrateur incorrecte."), { status: 403 });
    const current = readUser(req.auth.id);
    if (!current?.admin || current.active === false || version !== (current.sessionVersion ?? 0)) throw Object.assign(new Error("Les accès du compte ont changé."), { status: 403 });
    if (hasOpenTables()) throw Object.assign(new Error("Ferme les tables avant d’appliquer les sources."), { status: 409 });
    res.status(202).json(await store.enqueue(req.body.revision, req.auth.id));
  }));
  return store;
}
