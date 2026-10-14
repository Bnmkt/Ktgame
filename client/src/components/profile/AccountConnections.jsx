import { useEffect, useState } from "react";
import { Link2, LogIn, Monitor, Unlink } from "lucide-react";
import { api } from "../../api.js";
import { useLocale } from "../../locales/LocaleProvider.jsx";
import { PasswordField } from "../common/PasswordField.jsx";
import "./account-connections.css";

export function AccountConnections({ user, onUser, onError, onMessage }) {
  const { t } = useLocale();
  const [connection, setConnection] = useState(null);
  const [presence, setPresence] = useState(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [pair, setPair] = useState(null);
  useEffect(() => {
    let active = true;
    api("/api/me/discord").then((value) => { if (active) setConnection(value); }).catch((error) => { if (active) onError(error.message); });
    api("/api/me/discord/presence").then((value) => { if (active) setPresence(value); }).catch((error) => { if (active) onError(error.message); });
    return () => { active = false; };
  }, [user.id]);
  async function changeLink(event) {
    event.preventDefault(); setBusy(true); onError("");
    try {
      const result = await api(connection.linked ? "/api/me/discord" : "/api/me/discord/link", { method: connection.linked ? "DELETE" : "POST", body: JSON.stringify({ password }) });
      setPassword("");
      if (result.url) {
        const url = new URL(result.url);
        if (url.origin !== "https://discord.com" || url.pathname !== "/oauth2/authorize") throw new Error("Adresse de connexion Discord invalide.");
        window.location.assign(url.href);
      } else {
        setConnection((current) => ({ ...current, linked: false, username: "" }));
        if (result.user) onUser(result.user);
        onMessage("Compte Discord dissocié.");
      }
    } catch (error) { onError(error.message); }
    finally { setBusy(false); }
  }
  async function changePresence() {
    setBusy(true); onError("");
    try {
      const result = await api("/api/me/discord/presence", { method: "PATCH", body: JSON.stringify({ enabled: !presence.enabled }) });
      setPresence((current) => ({ ...current, ...result })); setPair(null);
    } catch (error) { onError(error.message); }
    finally { setBusy(false); }
  }
  async function pairCompanion() {
    setBusy(true); onError("");
    try { setPair(await api("/api/me/discord/presence/pair", { method: "POST", body: "{}" })); }
    catch (error) { onError(error.message); }
    finally { setBusy(false); }
  }
  return <section className="account-workspace-section account-link-panel">
    <header><Link2 size={19}/><h3>Discord</h3></header>
    {!connection ? <p role="status">{t("Chargement…")}</p> : <>
      <p>{connection.linked ? t("Compte associé : {value0}", { value0: connection.username }) : t("Associe ton compte Discord pour te connecter sans saisir ton mot de passe. La double authentification reste active.")}</p>
      {(connection.available || connection.linked) && <form onSubmit={changeLink} className="account-workspace-password"><PasswordField label={t("Mot de passe actuel")} required autoComplete="current-password" maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)}/><button type="submit" className="secondary" disabled={busy || !password}>{connection.linked ? <Unlink size={17}/> : <LogIn size={17}/>} {t(connection.linked ? "Dissocier Discord" : "Associer Discord")}</button></form>}
      {!connection.available && !connection.linked && <small>{t(!connection.ageAllowed ? "Disponible à partir de 13 ans, avec une date de naissance renseignée." : "La connexion Discord n’est pas encore activée.")}</small>}
    </>}
    <div className="account-link-presence"><h4><Monitor size={17}/> {t("Présence de jeu sur Discord")}</h4><p>{t("Le navigateur seul ne peut pas publier ta présence Discord. Un compagnon local optionnel est prévu pour partager uniquement le jeu et son état, jamais tes cartes, tes messages ou le code de ta table.")}</p>
      {presence?.available && <label className="account-link-switch"><span>{t("Autoriser le compagnon à afficher mon activité")}</span><input type="checkbox" checked={presence.enabled} disabled={busy} onChange={changePresence}/></label>}
      {presence?.enabled && <><button type="button" className="secondary" disabled={busy} onClick={pairCompanion}><Link2 size={16}/> {t("Connecter le compagnon")}</button>{pair && <p><strong>{pair.code}</strong><br/><small>{t("Code privé à saisir dans le compagnon. Valable 5 minutes, utilisable une seule fois.")}</small></p>}</>}
    </div>
  </section>;
}
