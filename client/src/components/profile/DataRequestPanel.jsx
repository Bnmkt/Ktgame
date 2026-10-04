import { useCallback, useEffect, useState } from "react";
import { Check, Clock3, FileArchive, RefreshCw, Send } from "lucide-react";
import { api } from "../../api.js";
import { Dialog } from "../common/Dialog.jsx";
import { ConfirmActionButton } from "../common/ConfirmAction.jsx";
import { PasswordField } from "../common/PasswordField.jsx";
import "./data-request.css";

const labels = { pending: "Approbation en attente", processing: "Préparation et envoi", sent: "Archive envoyée", failed: "Envoi à reprendre" };
const date = (value) => value ? new Intl.DateTimeFormat("fr-BE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";

export function DataRequestPanel({ userId, admin = false, disabled = false, initialRequests = [], onChange }) {
  const endpoint = admin ? `/api/admin/users/${userId}/data-requests` : "/api/me/data-requests";
  const [data, setData] = useState({ requests: initialRequests });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [dialog, setDialog] = useState(null);
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { const next = await api(endpoint); setData(next); setLoaded(true); setError(""); return next; }
    catch (err) { setError(err.message); }
  }, [endpoint]);
  useEffect(() => { let active = true; api(endpoint).then((next) => { if (active) { setData(next); setLoaded(true); } }).catch((err) => { if (active) setError(err.message); }); return () => { active = false; }; }, [endpoint]);
  const processing = data.requests.some((row) => row.status === "processing");
  useEffect(() => {
    if (!processing) return;
    const timer = setInterval(() => { if (document.visibilityState === "visible") load(); }, 3000);
    return () => clearInterval(timer);
  }, [processing, load]);
  const open = data.requests.some((row) => row.status !== "sent");
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      await api(dialog === "request" ? endpoint : `${endpoint}/${dialog.id}/extend`, { method: "POST", body: JSON.stringify(dialog === "request" ? { password } : { reason }) });
      setDialog(null); setPassword(""); setReason("");
      setMessage(dialog === "request" ? "Demande enregistrée. Aucune archive ne sera envoyée avant l’approbation administrative." : "Prolongation annoncée par email et enregistrée.");
      const next = await load(); onChange?.(next?.requests ?? []);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function approve(row) {
    await api(`${endpoint}/${row.id}/approve`, { method: "POST" });
    const next = await load(); onChange?.(next?.requests ?? []);
  }
  return <section className="rights-request-panel" aria-label="Demandes de données personnelles">
    <header><FileArchive size={20} /><div><h3>{admin ? "Demandes de données personnelles" : "Une copie de mes données"}</h3><p>{admin ? "La génération et l’envoi nécessitent ton approbation explicite." : "Reçois les données personnelles conservées par le site dans une archive ZIP envoyée à ton adresse vérifiée."}</p></div><button type="button" title="Actualiser les demandes" aria-label="Actualiser les demandes" className="secondary icon-toggle" disabled={busy} onClick={load}><RefreshCw size={16} /></button></header>
    <p className="rights-request-deadline"><Clock3 size={16} />Réponse sans retard injustifié, au plus tard sous un mois calendaire. Une prolongation motivée peut porter ce délai à trois mois ; elle doit être annoncée dans le premier mois.</p>
    {!admin && <div className="rights-request-command"><button type="button" disabled={!loaded || busy || open || !data.emailReady} onClick={() => { setError(""); setDialog("request"); }}><FileArchive size={17} />{open ? "Une demande est déjà en cours" : "Demander mes données"}</button>{loaded && !data.emailReady && <p>Vérifie ton email dans « Connexion et sécurité » avant l’envoi.</p>}<small>Tu peux aussi écrire à <a href={`mailto:${data.contactEmail || "contact@netdis.org"}`}>{data.contactEmail || "contact@netdis.org"}</a>, notamment si tu n’as plus accès au compte. Aucun mot de passe ou secret de connexion n’est inclus dans l’archive.</small></div>}
    {admin && disabled && <p>Enregistre ou annule les modifications de la fiche avant de traiter une demande.</p>}
    {admin && loaded && !data.emailAvailable && <p className="error">Le service email est indisponible. Les demandes restent enregistrées et leur échéance continue de courir.</p>}
    {message && <p role="status" className="rights-request-message">{message}</p>}
    {error && !dialog && <p role="alert" className="error">{error}</p>}
    <div className="rights-request-list">{data.requests.map((row) => <article key={row.id}>
      <header><strong>{labels[row.status] ?? row.status}</strong><small>Réf. {row.id}</small></header>
      <dl><div><dt>Reçue</dt><dd>{date(row.requested_at)}</dd></div><div><dt>{row.sent_at ? "Envoyée" : "Échéance"}</dt><dd className={!row.sent_at && Date.parse(row.due_at) < Date.now() ? "rights-overdue" : ""}>{date(row.sent_at || row.due_at)}</dd></div>{admin && <div><dt>Destinataire</dt><dd>{row.email}</dd></div>}</dl>
      {row.extension_reason && <p>Prolongation : {row.extension_reason}</p>}{admin && row.error && <p className="error">{row.error}</p>}
      {admin && ["pending", "failed"].includes(row.status) && <div className="rights-request-actions"><ConfirmActionButton disabled={disabled || busy || !data.emailAvailable} dialogTitle="Approuver et envoyer les données ?" message={`L’archive complète sera créée puis envoyée uniquement à ${row.email}. Vérifie l’identité du demandeur. En cas de reprise d’un envoi interrompu, vérifie aussi si le courrier a déjà été reçu.`} confirmLabel="Approuver et envoyer" onConfirm={() => approve(row)}><Check size={16} />{row.status === "failed" ? "Approuver un nouvel essai" : "Approuver et envoyer"}</ConfirmActionButton>{!row.extended_at && Date.now() <= Date.parse(row.due_at) && <button type="button" className="secondary" disabled={disabled || busy || !data.emailAvailable} onClick={() => { setError(""); setReason(""); setDialog(row); }}><Clock3 size={16} />Prolonger avec un motif</button>}</div>}
    </article>)}</div>
    {loaded && !data.requests.length && <p>Aucune demande enregistrée.</p>}
    {dialog && <Dialog title={dialog === "request" ? "Demander mes données personnelles" : "Prolonger le traitement"} onClose={() => { setDialog(null); setPassword(""); }} dismissible={!busy}><form className="form-stack rights-request-dialog" onSubmit={submit}>{dialog === "request" ? <><p>Confirme avec ton mot de passe actuel. L’administration examinera ta demande avant tout envoi à ton adresse vérifiée.</p><PasswordField required label="Mot de passe actuel" autoComplete="current-password" maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} /></> : <><p>Réservé aux demandes complexes ou nombreuses. Le joueur sera averti par email avant le changement d’échéance.</p><label>Motif de prolongation<textarea required minLength={10} maxLength={1000} rows={5} value={reason} onChange={(event) => setReason(event.target.value)} /></label></>}{error && <p role="alert" className="error">{error}</p>}<button type="submit" disabled={busy}><Send size={17} />{busy ? "Traitement…" : dialog === "request" ? "Confirmer la demande" : "Notifier et prolonger"}</button></form></Dialog>}
  </section>;
}
