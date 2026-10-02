import { useEffect, useMemo, useState } from "react";
import { Check, Clock3, MailCheck, RefreshCw, Save, ShieldCheck, UserCheck, X } from "lucide-react";
import { api } from "../../api.js";
import { ConfirmActionButton } from "../common/ConfirmAction.jsx";

const statusLabels = { email_pending: "Email du parent à valider", admin_pending: "Décision requise", approved: "Approuvé", rejected: "Refusé" };

export function ParentalApprovals({ onSettingsChange }) {
  const [data, setData] = useState({ requests: [], restrictions: [], restrictionOptions: [] });
  const [filter, setFilter] = useState("pending");
  const [reason, setReason] = useState({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const load = () => api("/api/admin/parental-approvals").then(setData).catch((requestError) => setError(requestError.message));
  useEffect(() => { load(); }, []);
  const rows = useMemo(() => data.requests.filter((row) => filter === "all" || (filter === "pending" ? ["email_pending", "admin_pending"].includes(row.status) : row.status === filter)), [data.requests, filter]);

  async function decide(row, approved) {
    setBusy(row.id); setError("");
    try {
      await api(`/api/admin/parental-approvals/${row.id}/${approved ? "approve" : "reject"}`, { method: "POST", body: JSON.stringify({ reason: reason[row.id] ?? "" }) });
      await load();
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(""); }
  }

  function toggleRestriction(id) {
    setData((current) => ({ ...current, restrictions: current.restrictions.includes(id) ? current.restrictions.filter((entry) => entry !== id) : [...current.restrictions, id] }));
  }

  async function saveRestrictions() {
    setBusy("restrictions"); setError("");
    try {
      const settings = await api("/api/admin/settings", { method: "PATCH", body: JSON.stringify({ minorRestrictions: data.restrictions }) });
      setData((current) => ({ ...current, restrictions: settings.minorRestrictions ?? [] }));
      onSettingsChange?.(settings);
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(""); }
  }

  return <div className="parental-admin-page">
    <header className="metrics-heading"><div><span className="eyebrow">Protection des mineurs</span><h2>Contrôle parental</h2><p>Examine les demandes, configure les limitations et conserve une décision traçable.</p></div><button type="button" className="secondary" onClick={load}><RefreshCw size={17} />Actualiser</button></header>
    {error && <div className="error">{error}</div>}
    <section className="settings-card parental-restrictions">
      <div className="account-section-heading"><span><ShieldCheck size={20} /></span><div><h3>Fonctionnalités limitées avant 13 ans</h3><p>Les contrôles sont appliqués par le serveur, y compris si l’interface est contournée.</p></div></div>
      <div className="parental-restriction-grid">{data.restrictionOptions.map((option) => { const checked = data.restrictions.includes(option.id); return <label key={option.id} className={checked ? "active" : ""}><span><strong>{option.label}</strong><small>{option.description}</small></span><input type="checkbox" checked={checked} onChange={() => toggleRestriction(option.id)} /><i /></label>; })}</div>
      <div className="settings-actions"><button type="button" disabled={busy === "restrictions"} onClick={saveRestrictions}><Save size={17} />{busy === "restrictions" ? "Enregistrement…" : "Enregistrer les restrictions"}</button></div>
    </section>
    <section className="settings-card parental-review-list">
      <div className="parental-review-heading"><div><span className="eyebrow">Dossiers parentaux</span><h3>Demandes d’inscription</h3></div><div className="segmented-tabs">{[["pending", "À traiter"], ["approved", "Approuvés"], ["rejected", "Refusés"], ["all", "Tous"]].map(([value, label]) => <button type="button" key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{label}</button>)}</div></div>
      <div className="parental-request-list">{rows.map((row) => <article key={row.id} className={`parental-request status-${row.status}`}>
        <div className="parental-request-status">{row.status === "admin_pending" ? <UserCheck /> : row.status === "email_pending" ? <MailCheck /> : row.status === "approved" ? <Check /> : <X />}<span><strong>{statusLabels[row.status]}</strong><small>{row.code}</small></span></div>
        <div className="parental-request-person"><strong>{row.childPseudo}</strong><small>{row.childEmail}</small><span>Naissance : {new Intl.DateTimeFormat("fr-BE").format(new Date(`${row.childBirthDate}T00:00:00`))}</span></div>
        <div className="parental-request-person"><strong>Responsable légal</strong><small>{row.parentEmail}</small><span>{row.parentVerifiedAt ? `Email validé le ${new Intl.DateTimeFormat("fr-BE", { dateStyle: "short", timeStyle: "short" }).format(new Date(row.parentVerifiedAt))}` : "Validation en attente"}</span></div>
        {row.status === "admin_pending" && <div className="parental-request-actions"><label>Note en cas de refus<textarea maxLength={300} value={reason[row.id] ?? ""} onChange={(event) => setReason((current) => ({ ...current, [row.id]: event.target.value }))} placeholder="Explique brièvement la décision au parent" /></label><div><button type="button" disabled={busy === row.id} onClick={() => decide(row, true)}><Check size={17} />Approuver le compte</button><ConfirmActionButton className="danger-button" disabled={busy === row.id} dialogTitle="Refuser cette inscription ?" message="Le parent sera informé et le compte ne sera pas créé." confirmLabel="Refuser la demande" danger onConfirm={() => decide(row, false)}><X size={17} />Refuser</ConfirmActionButton></div></div>}
        {row.status === "email_pending" && <div className="parental-request-wait"><Clock3 size={17} />Le parent doit encore ouvrir le lien reçu par email.</div>}
        {row.rejectionReason && <p className="parental-rejection-reason">Motif : {row.rejectionReason}</p>}
      </article>)}</div>
      {!rows.length && <div className="empty-state">Aucun dossier dans cette vue.</div>}
    </section>
  </div>;
}
