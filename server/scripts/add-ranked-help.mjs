import "dotenv/config";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createHelpStore } from "../src/services/help-content.js";
import { withProgressionHelp } from "../src/content/help-ranked.js";

const filename = process.env.HELP_DB_PATH ? path.resolve(process.env.HELP_DB_PATH) : `${path.resolve(process.env.SQLITE_PATH || "data/ktga.sqlite")}.help.sqlite`;
const store = createHelpStore({ filename, uploadDirectory: path.join(path.dirname(filename), "help-images") });
try {
  const previous = store.read();
  const plan = withProgressionHelp(previous);
  const added = plan.entries.filter((entry) => !previous.entries.some((old) => old.id === entry.id));
  console.log(JSON.stringify({ added: added.map((entry) => ({ id: entry.id, kind: entry.kind, title: entry.title })), total: plan.entries.length }));
  if (process.argv.includes("--apply") && added.length) {
    const directory = path.join(path.dirname(filename), "backups");
    fs.mkdirSync(directory, { recursive: true });
    const backup = path.join(directory, `help-before-ranked-${Date.now()}.sqlite`);
    const snapshot = new DatabaseSync(filename, { readOnly: true });
    try { snapshot.prepare("VACUUM INTO ?").run(backup); } finally { snapshot.close(); }
    assert.equal(store.read().revision, previous.revision, "L'aide a changé depuis la préparation.");
    const saved = store.save(plan);
    const withoutPosition = ({ position, ...entry }) => entry;
    for (const entry of previous.entries) assert.deepEqual(withoutPosition(saved.entries.find((row) => row.id === entry.id)), withoutPosition(entry));
    assert.equal(saved.launchedAt, previous.launchedAt);
    assert.equal(saved.welcomeEnabled, previous.welcomeEnabled);
    console.log(JSON.stringify({ saved: true, faqAdded: added.filter((entry) => entry.kind === "faq").length, guideAdded: added.filter((entry) => entry.kind === "guide").length, revision: saved.revision, existingContentPreserved: true, backup }));
  }
} finally { store.close(); }
