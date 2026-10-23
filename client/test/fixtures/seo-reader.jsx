import React from "react";
import { createRoot } from "react-dom/client";
import { LocaleProvider } from "../../src/locales/LocaleProvider.jsx";
import { PatchnotesPage } from "../../src/pages/PatchnotesPage.jsx";
import { PublicCasinoInfo } from "../../src/components/navigation/PublicCasinoInfo.jsx";
import "../../src/styles.css";
import "../../src/features/theme/theme.css";

const notes = [
  { id: "one", version: "0.2.1", versionGroup: "0.2", title: "Les nouveautes du casino", summary: "Les parties classees et les niveaux.", status: "published", publishedAt: "2026-10-08T14:00:00Z" },
  { id: "two", version: "0.2.0", versionGroup: "0.2", title: "La progression des joueurs", summary: "Des **profils** personnalises.", status: "published", publishedAt: "2026-10-01T14:00:00Z" }
];
createRoot(document.getElementById("root")).render(<LocaleProvider><PublicCasinoInfo games={[{ id: "yahtzee", name: "Yahtzee", type: "dice" }, { id: "belote", name: "Belote", type: "cards" }, { id: "hidden", name: "Hidden", type: "dice", enabled: false }]}/><PatchnotesPage siteName="KTGA.ME" user={{ id: "editor", editor: true }} initialCatalog={{ currentVersion: "0.2.1", notes }}/></LocaleProvider>);
