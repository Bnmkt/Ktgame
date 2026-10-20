import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { LocaleProvider } from "../../src/locales/LocaleProvider.jsx";
import { CasinoSettings } from "../../src/components/admin/CasinoSettings.jsx";
import { SETTINGS_SECTIONS } from "../../src/components/admin/settings-navigation.js";
import { CosmeticIcon, setCosmeticCatalogItems } from "../../src/components/cosmetics/Cosmetics.jsx";
import { defaultPublicSettings } from "../../src/config/site.js";
import "../../src/features/theme/theme.css";
import "../../src/styles.css";
import "../../src/navigation/casino.css";

SETTINGS_SECTIONS.push({ id: "future-fixture", group: "Site", title: "Future rubrique", detail: "Icône de repli" });
setCosmeticCatalogItems([{ type: "icons", value: "fixture-plain", icon: "crown", iconFramed: false }]);
function Fixture() {
  const [draft, setDraft] = useState(defaultPublicSettings);
  return <main className="app-shell"><section aria-label="Icônes"><CosmeticIcon value="crown"/><CosmeticIcon value="fixture-plain"/><CosmeticIcon value="site" source="/favicon.svg" framed={false}/></section><CasinoSettings draft={draft} setDraft={setDraft} users={[]} onSubmit={event => { event.preventDefault(); window.savedSettings = draft; }}/></main>;
}
createRoot(document.getElementById("root")).render(<LocaleProvider><Fixture/></LocaleProvider>);
