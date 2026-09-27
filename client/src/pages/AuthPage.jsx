import { useEffect, useState } from "react";
import { AlertTriangle, DoorOpen, Landmark, Link, LogIn, UserPlus } from "lucide-react";
import { api, setToken } from "../api.js";
import { CosmeticIcon } from "../components/cosmetics/Cosmetics.jsx";
import { defaultPublicSettings } from "../config/site.js";
import { EnrollmentFields } from "../privacy/EnrollmentFields.jsx";
import { PRIVACY_VERSION } from "../privacy/consent.js";

export function Auth({ onAuth, pendingRoomCode, settings = defaultPublicSettings }) {
  const [mode, setMode] = useState("login");
  const [login, setLogin] = useState({ pseudo: "", password: "" });
  const [register, setRegister] = useState({ pseudo: "", password: "", passwordConfirm: "" });
  const [guest, setGuest] = useState("");
  const [serverStatus, setServerStatus] = useState("checking");
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/health").then(() => setServerStatus("ok")).catch(() => setServerStatus("down"));
  }, []);
  useEffect(() => {
    if (mode === "register" && !settings.registrationsEnabled) setMode("login");
    if (mode === "guest" && !settings.guestAccessEnabled) setMode("login");
  }, [mode, settings.registrationsEnabled, settings.guestAccessEnabled]);

  async function submit(nextMode) {
    setError("");
    if (nextMode === "register" && register.password !== register.passwordConfirm) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    try {
      const payload = nextMode === "register" ? { pseudo: register.pseudo, password: register.password, ageBand: register.ageBand, parentalCode: register.parentalCode, termsVersion: register.termsAccepted ? PRIVACY_VERSION : "" } : nextMode === "guest" ? { pseudo: guest } : login;
      const data = await api(nextMode === "guest" ? "/api/auth/guest" : `/api/auth/${nextMode}`, { method: "POST", body: JSON.stringify(payload) });
      setToken(data.token);
      onAuth(data.user);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="auth-screen">
      <div className="auth-panel">
        <div><h1 className="auth-brand"><CosmeticIcon value="site" source={settings.siteIcon} /><span>{settings.siteName}</span></h1><p>{settings.siteSubtitle}</p></div>
        {serverStatus === "checking" && <div className="invite-banner"><Landmark size={18} /> Vérification de la disponibilité du casino...</div>}
        {serverStatus === "down" && <div className="error">Le casino est actuellement indisponible. Le serveur de jeu ne répond pas.</div>}
        {serverStatus === "ok" && <>
          {pendingRoomCode && <div className="invite-banner"><Link size={18} /> Invitation à la table {pendingRoomCode} : connecte-toi ou utilise le mode invité pour la rejoindre.</div>}
        <div className="tabs segmented-tabs">
          <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}><LogIn size={18} /> Connexion</button>
          {settings.registrationsEnabled && <button className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}><UserPlus size={18} /> Inscription</button>}
          {settings.guestAccessEnabled && <button className={mode === "guest" ? "active" : ""} onClick={() => setMode("guest")}><DoorOpen size={18} /> Invité</button>}
        </div>
        {mode === "register" && <EnrollmentFields value={register} onChange={setRegister} />}
        {mode === "login" && <form className="form-stack" onSubmit={(event) => { event.preventDefault(); submit("login"); }}><label>Pseudo<input autoComplete="username" value={login.pseudo} onChange={(e) => setLogin({ ...login, pseudo: e.target.value })} placeholder="Votre pseudo" /></label><label>Mot de passe<input autoComplete="current-password" value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} placeholder="Votre mot de passe" type="password" /></label><button type="submit">Se connecter</button></form>}
        {mode === "register" && <form className="form-stack" onSubmit={(event) => { event.preventDefault(); submit("register"); }}><label>Pseudo<input autoComplete="username" value={register.pseudo} onChange={(e) => setRegister({ ...register, pseudo: e.target.value })} placeholder="3 caractères minimum" /></label><label>Mot de passe<input autoComplete="new-password" value={register.password} onChange={(e) => setRegister({ ...register, password: e.target.value })} placeholder="4 caractères minimum" type="password" /></label><label>Confirmer le mot de passe<input autoComplete="new-password" value={register.passwordConfirm} onChange={(e) => setRegister({ ...register, passwordConfirm: e.target.value })} placeholder="Saisissez à nouveau le mot de passe" type="password" /></label><button type="submit">Créer le compte</button></form>}
        {mode === "guest" && <form className="form-stack" onSubmit={(event) => { event.preventDefault(); submit("guest"); }}><label>Pseudo temporaire<input value={guest} onChange={(e) => setGuest(e.target.value)} placeholder="Nom affiché aux tables" /></label><button type="submit">Entrer en invité</button></form>}
        {(!settings.registrationsEnabled || !settings.guestAccessEnabled) && <div className="auth-availability-note"><AlertTriangle size={16} /><span>{!settings.registrationsEnabled && !settings.guestAccessEnabled ? "Les inscriptions et l’accès invité sont actuellement fermés." : !settings.registrationsEnabled ? "Les nouvelles inscriptions sont actuellement fermées." : "L’accès invité est actuellement fermé."}</span></div>}
        {error && <div className="error">{error}</div>}
        </>}
      </div>
    </main>
  );
}
