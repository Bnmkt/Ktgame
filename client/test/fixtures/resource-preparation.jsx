import React from "react";
import { createRoot } from "react-dom/client";
import { LocaleProvider } from "../../src/locales/LocaleProvider.jsx";
import { ResourcePreparation, useResourcePreparation } from "../../src/pwa/ResourcePreparation.jsx";
import "../../src/styles.css";
function Content() {
  const pending = useResourcePreparation();
  return <main className="app-shell"><h1>Casino</h1><output data-resources-pending={String(pending)}>{pending ? "Preparation" : "Bienvenue"}</output></main>;
}
createRoot(document.getElementById("root")).render(<LocaleProvider><ResourcePreparation enabled><Content/></ResourcePreparation></LocaleProvider>);
