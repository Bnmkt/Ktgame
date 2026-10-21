import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { LocaleProvider } from "../../src/locales/LocaleProvider.jsx";
import { Auth } from "../../src/pages/AuthPage.jsx";
import { AccountSecurity } from "../../src/components/profile/AccountSecurity.jsx";
import { setToken } from "../../src/api.js";
import "../../src/styles.css";
import "../../src/features/theme/theme.css";
import "../../src/privacy/privacy.css";
import "../../src/navigation/casino.css";

const initial = new URL(location.href).searchParams.has("account");
setToken(initial ? "fixture" : "");
function Fixture() {
  const [user, setUser] = useState(initial ? { id: "player", pseudo: "Alice", email: "alice@example.test" } : null);
  const [error, setError] = useState(""), [message, setMessage] = useState("");
  return user ? <main className="app-shell"><section className="panel"><h1>Sécurité du compte</h1>{error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}<AccountSecurity user={user} onUser={setUser} onError={setError} onMessage={setMessage}/></section></main> : <Auth onAuth={setUser}/>;
}
createRoot(document.getElementById("root")).render(<LocaleProvider><Fixture/></LocaleProvider>);
