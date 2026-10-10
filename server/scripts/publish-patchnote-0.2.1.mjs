import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { createPatchnoteStore } from "../src/services/patchnotes.js";

const prefix = "capacity-021-";
export function completePatchnote021(note, publishedAt = new Date().toISOString()) {
  assert.equal(note.version, "0.2.1");
  const block = (suffix, type, title, content = "", category = "other") => ({
    id: `${prefix}${suffix}`, type, title, content, category,
    metadata: type === "section" ? { level: 2 } : {}
  });
  const additions = [
    block("section", "section", "Un casino prêt à accueillir plus de joueurs"),
    block("performance", "change", "Moins de travail inutile, plus de place pour jouer", "Un travail de fond a été réalisé sur le serveur et les échanges avec le site. Les informations sont davantage réutilisées, les sauvegardes ciblent les données réellement modifiées et les mises à jour des tables n'envoient plus inutilement toute la liste des salons.\n\nLes connexions, les historiques, les statistiques et le chat profitent de ces changements. L'objectif est de garder un casino réactif lorsque plusieurs tables jouent en même temps, sans changer vos règles, vos jetons, vos succès ou votre progression.", "feature"),
    block("capacity", "change", "Une première estimation de la capacité", "Le dernier palier validé est de **500 joueurs simulés simultanément**, pendant un scénario de **90 secondes**, sur une instance de test isolée hébergée sur le serveur actuel. Ce scénario a fait jouer les **15 jeux**, avec des actions, des consultations, des messages et des reconnexions, sans erreur inattendue.\n\nC'est un **premier repère**, pas une promesse de 500 joueurs sans ralentissement dans toutes les situations. Le test n'est pas encore une mesure d'endurance et ne couvre pas tout le trajet HTTPS public.\n\n**1 000 joueurs actifs restent un objectif à valider**, pas une capacité annoncée comme acquise. Les prochaines mesures serviront à vérifier le comportement sur des sessions plus longues et avec davantage de données.", "other"),
    block("services", "change", "Des traitements mieux répartis", "Les lectures d'historique, de transactions et de statistiques disposent maintenant d'un traitement séparé et partagé, avec des files limitées. Les calculs sensibles de gains, de récompenses et de classement conservent une seule autorité pour éviter les doubles attributions.\n\nCette organisation prépare les prochaines optimisations sans multiplier inutilement les processus ni exposer les données personnelles des joueurs.", "tool"),
    block("supervision", "change", "Mesurer avant d'agrandir", "La supervision distingue désormais les services applicatifs, leurs temps de traitement, leurs attentes et leurs éventuelles erreurs. Des relevés techniques **anonymes** sont conservés pendant **30 jours** pour comparer les évolutions, y compris après un redémarrage.\n\nCes informations restent réservées à l'administration. L'[état des services](/status) reste disponible publiquement et le [suivi des bugs](/bugs) permet toujours de remonter les problèmes rencontrés.", "tool")
  ];
  const preserved = note.blocks.filter((entry) => !entry.id.startsWith(prefix));
  const intro = preserved[0]?.type === "paragraph" ? preserved.slice(0, 1) : [];
  const rest = preserved.slice(intro.length);
  return { title: "Un casino mieux préparé, le classé entre en jeu", status: "published", publishedAt,
    summary: "Un serveur optimisé et mieux supervisé, avec un premier palier testé à 500 joueurs simulés. Le classé arrive sur sept jeux, les maîtrises prolongent la progression et les tables gagnent en confort. Cette version prépare la bêta sans annoncer une capacité encore non validée.",
    blocks: [...intro, ...additions, ...rest] };
}

async function main() {
  const argument = (name) => process.argv[process.argv.indexOf(name) + 1];
  assert.ok(process.argv.includes("--database"), "Specify --database explicitly.");
  const filename = path.resolve(argument("--database"));
  assert.ok(fs.existsSync(filename), "Patchnote database does not exist.");
  const store = createPatchnoteStore({ filename });
  try {
    const existing = store.get("0.2.1", { includeDrafts: true });
    assert.ok(existing, "Version 0.2.1 not found.");
    const plan = completePatchnote021(existing);
    assert.ok(plan.blocks.length <= 100);
    for (const row of plan.blocks) assert.ok(row.content.length <= (row.type === "list" ? 5000 : 4000), `Block would be truncated: ${row.id}`);
    if (!process.argv.includes("--publish")) {
      console.log(JSON.stringify({ version: existing.version, previousStatus: existing.status, plannedStatus: plan.status, date: plan.publishedAt, blocks: plan.blocks.length, additions: 5 }));
      return;
    }
    assert.equal(existing.status, "draft", "Refusing to republish an already published version.");
    assert.ok(process.argv.includes("--backup"), "Specify --backup explicitly.");
    const backup = path.resolve(argument("--backup"));
    assert.ok(!fs.existsSync(backup), "Backup already exists.");
    const before = new DatabaseSync(filename, { readOnly: true });
    try { before.prepare("VACUUM INTO ?").run(backup); } finally { before.close(); }
    assert.equal(store.get(existing.id, { includeDrafts: true }).updatedAt, existing.updatedAt, "Draft changed during preparation.");
    const updated = store.update(existing.id, plan);
    const preserved = existing.blocks.filter((entry) => !entry.id.startsWith(prefix));
    assert.deepEqual(updated.blocks.filter((entry) => !entry.id.startsWith(prefix)), preserved);
    store.setCurrentVersion(existing.version);
    console.log(JSON.stringify({ version: updated.version, status: updated.status, publishedAt: updated.publishedAt, blocks: updated.blocks.length, preservedBlocks: preserved.length, currentVersion: store.currentVersion }));
  } finally { store.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
