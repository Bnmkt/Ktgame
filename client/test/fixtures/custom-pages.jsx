import React from "react";
import { createRoot } from "react-dom/client";
import { LocaleProvider, LanguagePicker } from "../../src/locales/LocaleProvider.jsx";
import { CustomPagesAdmin } from "../../src/components/admin/CustomPagesAdmin.jsx";
import { CustomPage } from "../../src/pages/CustomPage.jsx";
import { CustomPageLinks } from "../../src/components/navigation/CustomPageLinks.jsx";
import "../../src/features/theme/theme.css";
import "../../src/styles.css";
import "../../src/navigation/casino.css";

const slug = new URLSearchParams(location.search).get("slug");
const systemRoute = new URLSearchParams(location.search).get("path");
createRoot(document.getElementById("root")).render(<LocaleProvider>{systemRoute && <LanguagePicker/>}{slug || systemRoute ? <CustomPage slug={slug} systemRoute={systemRoute || ""} games={[{id:"yahtzee",name:"Yahtzee",type:"dice",minPlayers:1,maxPlayers:6}]}/> : <main className="app-shell admin-shell"><CustomPagesAdmin admin/></main>}<footer className="legal-footer"><CustomPageLinks/></footer></LocaleProvider>);
