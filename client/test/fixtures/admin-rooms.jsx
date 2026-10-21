import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { LocaleProvider } from "../../src/locales/LocaleProvider.jsx";
import { RoomsAdmin } from "../../src/components/admin/RoomsAdmin.jsx";
import "../../src/styles.css";
import "../../src/features/theme/theme.css";

function Fixture() {
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  return <main className="app-shell admin-shell"><section className="admin-content">{error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}<RoomsAdmin games={[{ id: "yahtzee", name: "Yahtzee" }]} reportError={setError} notifySuccess={setMessage}/></section></main>;
}
createRoot(document.getElementById("root")).render(<LocaleProvider><Fixture/></LocaleProvider>);
