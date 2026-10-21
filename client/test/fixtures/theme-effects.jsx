import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { LocaleProvider } from "../../src/locales/LocaleProvider.jsx";
import { ThemeEditor } from "../../src/components/admin/ThemeEditor.jsx";
import { DEFAULT_THEME } from "../../src/features/theme/config.js";
import { useSiteTheme } from "../../src/features/theme/useSiteTheme.js";
import "../../src/features/theme/theme.css";
import "../../src/styles.css";
import "../../src/privacy/privacy.css";
import "../../src/navigation/casino.css";
import "../../src/features/theme/readability.css";

function Fixture() {
  const [active, setActive] = useState({ ...DEFAULT_THEME, backgroundImage: `/api/media/${"a".repeat(64)}.png` });
  useSiteTheme(active);
  return <main className="app-shell"><ThemeEditor onApplied={setActive}/></main>;
}
createRoot(document.getElementById("root")).render(<LocaleProvider><Fixture/></LocaleProvider>);
