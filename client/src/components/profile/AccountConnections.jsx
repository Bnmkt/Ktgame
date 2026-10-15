import { useEffect, useState } from "react";
import { Download, HelpCircle, Link2, LogIn, Monitor, Unlink } from "lucide-react";
import { api, BASE_PATH } from "../../api.js";
import { useLocale } from "../../locales/LocaleProvider.jsx";
import { PasswordField } from "../common/PasswordField.jsx";
import { Dialog } from "../common/Dialog.jsx";
import "./account-connections.css";

export function AccountConnections({ user, onUser, onError, onMessage }) {
  const { t } = useLocale();
  const [connection, setConnection] = useState(null);
  const [presence, setPresence] = useState(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [pair, setPair] = useState(null);
  const [remember, setRemember] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
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
  async function changePresence(changes = { enabled: !presence.enabled }) {
    setBusy(true); onError("");
    try {
      const result = await api("/api/me/discord/presence", { method: "PATCH", body: JSON.stringify(changes) });
      setPresence((current) => ({ ...current, ...result })); if (Object.hasOwn(changes, "enabled")) setPair(null);
    } catch (error) { onError(error.message); }
    finally { setBusy(false); }
  }
  async function pairCompanion() {
    setBusy(true); onError("");
    try { setPair(await api("/api/me/discord/presence/pair", { method: "POST", body: JSON.stringify({ remember }) })); }
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
    <div className="account-link-presence"><h4><Monitor size={17}/> {t("Présence de jeu sur Discord")}</h4><p>{t("Le compagnon optionnel affiche le jeu, ses images, le mode, les joueurs et la manche sur Discord. Tes cartes, tes messages et ton classement privé ne sont jamais partagés.")}</p>
      <div className="account-link-actions"><a className="button secondary" href={`${BASE_PATH}/downloads/ktga-discord-companion.zip`} download="ktga-discord-companion.zip"><Download size={17}/>{t("Télécharger le compagnon")}</a><button type="button" className="secondary" onClick={() => setHelpOpen(true)}><HelpCircle size={17}/>{t("Installation et démarrage")}</button></div>
      <small>{t("Windows et Linux · Node.js 22+ et Discord sur le PC nécessaires.")}</small>
      {presence?.available && <label className="account-link-switch"><span>{t("Autoriser le compagnon à afficher mon activité")}</span><input type="checkbox" checked={presence.enabled} disabled={busy} onChange={() => changePresence()}/></label>}
      {presence?.available && presence.enabled && <label className="account-link-switch"><span>{t("Partager le lien de mes salles d’attente publiques sur Discord")}</span><input type="checkbox" checked={Boolean(presence.joinEnabled)} disabled={busy} onChange={() => changePresence({ joinEnabled: !presence.joinEnabled })}/></label>}
      {presence?.enabled && <><label className="account-link-switch"><span>{t("Mémoriser ce compagnon pendant 30 jours")}</span><input type="checkbox" checked={remember} disabled={busy} onChange={(event) => setRemember(event.target.checked)}/></label><button type="button" className="secondary" disabled={busy} onClick={pairCompanion}><Link2 size={16}/> {t("Connecter le compagnon")}</button>{pair && <p><strong>{pair.code}</strong><br/><small>{t("Code privé à saisir dans le compagnon. Valable 5 minutes, utilisable une seule fois.")}</small></p>}</>}
    </div>
    {helpOpen && <Dialog labelledBy="account-companion-help" onClose={() => setHelpOpen(false)}><h2 id="account-companion-help">{t("Le compagnon Discord")}</h2><p>{t("Extrais le ZIP téléchargé et installe Node.js 22 ou plus récent si nécessaire.")} <a href="https://nodejs.org/" target="_blank" rel="noopener noreferrer">Node.js</a></p><ol className="account-link-instructions"><li>{t("Ouvre Discord sur ton PC et autorise la présence dans ton profil KTGA.")}</li><li>{t("Pour le démarrage automatique, coche la mémorisation de 30 jours avant de générer ton code.")}</li><li>{t("Sous Windows, ouvre lancer.cmd pour une session manuelle, ou activer-demarrage.cmd pour le démarrage automatique.")}</li><li>{t("Saisis le code privé lorsque le compagnon le demande.")}</li></ol><p>{t("Sous Linux :")}</p><pre className="account-link-command">node discord-presence.mjs --enable-startup</pre><p>{t("Le démarrage se fait à l’ouverture de ta session, sans ouvrir Discord ni ton navigateur. Le compagnon attend leur disponibilité.")}</p><p>{t("Pour désactiver le lancement : desactiver-demarrage.cmd sous Windows, ou --disable-startup sous Linux. Désactiver la présence dans le profil révoque son accès.")}</p><p>{t("L’accès mémorisé expire après 30 jours. Sans mémorisation, il expire après 12 heures.")}</p><button type="button" onClick={() => setHelpOpen(false)}>{t("Fermer")}</button></Dialog>}
  </section>;
}
