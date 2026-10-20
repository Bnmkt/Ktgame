import React from "react";
import { createRoot } from "react-dom/client";
import { LocaleProvider } from "../../src/locales/LocaleProvider.jsx";
import { CommunicationAdmin } from "../../src/components/admin/CommunicationAdmin.jsx";
import "../../src/styles.css";
import "../../src/features/theme/theme.css";
createRoot(document.getElementById("root")).render(<LocaleProvider><main className="app-shell"><CommunicationAdmin admin/></main></LocaleProvider>);
