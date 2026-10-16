import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, DatabaseBackup, RefreshCw, RotateCcw } from "lucide-react";
import { api } from "../../api.js";
import { Dialog } from "../common/Dialog.jsx";
import { PasswordField } from "../common/PasswordField.jsx";
import { useLocale } from "../../locales/LocaleProvider.jsx";
import "./gameplay-reset.css";

export function GameplayReset() {
  const { t } = useLocale();
  const [data, setData] = useState(null), [error, setError] = useState("");
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [queued, setQueued] = useState(false);
  const [phrase, setPhrase] = useState(""), [acknowledge, setAcknowledge] = useState(false);
  const [method, setMethod] = useState("password"), [credential, setCredential] = useState("");
  const load = useCallback(async () => {
    setError("");
    try { const next = await api("/api/admin/gameplay-reset"); setData(next); setMethod(next.methods[0] ?? "password"); }
    catch (err) { setError(err.message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  function close() { if (!busy) { setOpen(false); setCredential(""); setPhrase(""); setAcknowledge(false); } }
  async function submit(event) {
    event.preventDefault(); event.stopPropagation();
    if (busy || !acknowledge || phrase !== data?.confirmation || !credential) return;
    setBusy(true); setError("");
    try {
      await api("/api/admin/gameplay-reset", { method: "POST", body: JSON.stringify({ token: data.token, confirmation: phrase, acknowledge, method, credential }) });
      setQueued(true); setOpen(false); setCredential("");
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <section className="casino-settings-panel settings-group reset-workspace">
    <header className="settings-group-heading"><DatabaseBackup/><div><h3>{t("Réinitialisation globale du casino")}</h3><p>{t("Les comptes sont conservés. Leurs données de jeu repartent de zéro.")}</p></div></header>
    <div className="reset-scope"><div><h4>{t("Remis à zéro")}</h4><p>{t("Parties et historiques, participations aux événements, transactions, XP, maîtrises, classements, placements, succès, récompenses, inventaires et bonus quotidiens.")}</p></div><div><h4>{t("Conservés")}</h4><p>{t("Comptes, emails, mots de passe, double authentification, rôles, profils, amis, conversations privées, contrôles parentaux, sanctions et contenu du site.")}</p></div></div>
    <p>{t("Les événements configurés reviennent en brouillon. Les jetons sont remis au solde d’inscription actuel. Tous les joueurs devront se reconnecter.")}</p>
    {data && <dl className="reset-summary">{[["accounts", "Comptes conservés"], ["rooms", "Tables supprimées"], ["history", "Parties archivées"], ["participants", "Participations supprimées"], ["transactions", "Transactions remplacées"], ["signupTokens", "Jetons par compte"]].map(([key, label]) => <div key={key}><dt>{t(label)}</dt><dd>{Number(data.summary[key]).toLocaleString()}</dd></div>)}</dl>}
    <p className="reset-warning"><AlertTriangle size={19}/><span>{t("Cette opération est irréversible depuis le site. Une sauvegarde privée est créée et vérifiée avant toute suppression. Le reset s’exécute pendant un redémarrage du serveur.")}</span></p>
    {data?.summary.lastReset && <p>{t("Dernière réinitialisation")}{" : "}{new Date(data.summary.lastReset.completedAt).toLocaleString()}</p>}
    {error && !open && <p role="alert" className="error">{t(error)}</p>}
    {queued ? <p role="status">{t("Réinitialisation programmée. Le serveur redémarre ; reconnecte-toi dans quelques instants.")}</p> : <div className="actions"><button type="button" className="secondary" disabled={busy} onClick={load}><RefreshCw size={17}/>{t("Actualiser le récapitulatif")}</button><button type="button" className="danger-button" disabled={!data || data.pending || !data.methods.length || busy} onClick={() => { setOpen(true); setError(""); }}><RotateCcw size={17}/>{t("Préparer la réinitialisation")}</button></div>}
    {data && !data.methods.length && <p>{t("Configure un mot de passe ou une application TOTP sur ton compte administrateur pour autoriser cette action.")}</p>}
    {open && <Dialog title={t("Confirmer le reset global")} onClose={close} dismissible={!busy} className="reset-confirmation"><form className="form-stack" onSubmit={submit}>
      <div className="actions"><button type="button" className="secondary" disabled={busy} onClick={close}>{t("Annuler")}</button><button type="submit" className="danger-button" disabled={busy || phrase !== data.confirmation || !acknowledge || !credential}>{t(busy ? "Programmation…" : "Réinitialiser et redémarrer")}</button></div>
      <p>{t("Toutes les parties en cours seront interrompues. Les données de jeu de tous les comptes, administrateurs compris, seront réinitialisées.")}</p>
      <label>{t("Recopie la phrase de confirmation")}<strong>{data.confirmation}</strong><input autoComplete="off" spellCheck={false} required value={phrase} onChange={event => setPhrase(event.target.value)}/></label>
      <label>{t("Vérification administrateur")}<select aria-label={t("Vérification administrateur")} disabled={busy} value={method} onChange={event => { setMethod(event.target.value); setCredential(""); }}>{data.methods.map(value => <option key={value} value={value}>{t(value === "password" ? "Mot de passe actuel" : "Code TOTP")}</option>)}</select></label>
      {method === "password" ? <PasswordField label={t("Mot de passe actuel")} autoComplete="current-password" required maxLength={128} value={credential} onChange={event => setCredential(event.target.value)}/> : <label>{t("Code TOTP")}<input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={credential} onChange={event => setCredential(event.target.value)}/></label>}
      <label className="reset-acknowledgement"><input type="checkbox" checked={acknowledge} onChange={event => setAcknowledge(event.target.checked)}/><span>{t("Je comprends que ces données seront effacées et que tous les joueurs seront déconnectés.")}</span></label>
      {error && <p role="alert" className="error">{t(error)}</p>}
    </form></Dialog>}
  </section>;
}
