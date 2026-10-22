import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { LocaleProvider } from "../../src/locales/LocaleProvider.jsx";
import { AdminOverview } from "../../src/components/admin/AdminOverview.jsx";
import { overviewData } from "./admin-overview-data.js";
import "../../src/styles.css";
import "../../src/features/theme/theme.css";

const initial = overviewData();
function Fixture() {
  const [tab, setTab] = useState("");
  return <main className="app-shell admin-shell"><section className="admin-content"><div role="status">{tab}</div><AdminOverview overview={initial} settings={{}} onNavigate={setTab}/></section></main>;
}
createRoot(document.getElementById("root")).render(<LocaleProvider><Fixture/></LocaleProvider>);
