import React from "react";
import { createRoot } from "react-dom/client";
import { LocaleProvider } from "../../src/locales/LocaleProvider.jsx";
import { CustomPagesAdmin } from "../../src/components/admin/CustomPagesAdmin.jsx";
import { CustomPage } from "../../src/pages/CustomPage.jsx";
import { CustomPageLinks } from "../../src/components/navigation/CustomPageLinks.jsx";
import "../../src/features/theme/theme.css";
import "../../src/styles.css";
import "../../src/navigation/casino.css";

const slug = new URLSearchParams(location.search).get("slug");
createRoot(document.getElementById("root")).render(<LocaleProvider>{slug ? <CustomPage slug={slug}/> : <main className="app-shell admin-shell"><CustomPagesAdmin admin/></main>}<footer className="legal-footer"><CustomPageLinks/></footer></LocaleProvider>);
