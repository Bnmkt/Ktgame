import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, Pencil, RefreshCw } from "lucide-react";
import { api } from "../../api.js";
import { Dialog } from "../common/Dialog.jsx";
import { Pagination } from "../feedback/Feedback.jsx";
import { MarkdownContent } from "../patchnotes/MarkdownContent.jsx";
import { formatDate } from "../../utils/presentation.jsx";
import "./detected-incidents.css";

const stateLabels = { open: "À examiner", in_progress: "En cours", closed: "Clôturé" };

export function DetectedIncidents({ components, onPublish }) {
  const [filter, setFilter] = useState("pending");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ state: filter, page: String(page), pageSize: String(pageSize) });
      setData(await api(`/api/admin/status/detections?${query}`));
      setError("");
    } catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }, [filter, page, pageSize]);
  useEffect(() => {
    load();
    const timer = setInterval(() => { if (document.visibilityState === "visible") load(); }, 60000);
    return () => clearInterval(timer);
  }, [load]);
  function edit(row) {
    setEditing(row);
    setDraft({ title: row.title, state: row.state, notes: row.notes });
    setError("");
  }
  async function save(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await api(`/api/admin/status/detections/${editing.id}`, { method: "PATCH", body: JSON.stringify(draft) });
      setEditing(null);
      await load();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <section className="status-detection-section" aria-labelledby="status-detection-title">
    <div className="admin-form-heading"><div><h3 id="status-detection-title">Incidents détectés</h3><p>Relevés automatiques privés, à compléter et à clôturer. Le rétablissement du service ne clôture pas le suivi.</p></div><button type="button" className="secondary icon-toggle" title="Actualiser les incidents détectés" aria-label="Actualiser les incidents détectés" disabled={loading} onClick={load}><RefreshCw size={17} /></button></div>
    <nav className="segmented-tabs" aria-label="Filtrer les incidents détectés">{[["pending", "À traiter"], ["closed", "Clôturés"], ["all", "Tous"]].map(([value, label]) => <button type="button" key={value} className={filter === value ? "active" : ""} onClick={() => { setFilter(value); setPage(1); }}>{label}</button>)}</nav>
    {error && !editing && <p className="error" role="alert">{error}</p>}
    {!data ? <p role="status">Chargement des relevés…</p> : <>
      <div className="status-detection-list">{data.rows.map((row) => <article key={row.id} className="status-detection-row">
        <header><div><span className={`status-detection-severity severity-${row.severity}`}><AlertTriangle size={14} />{row.severity === "outage" ? "Indisponibilité" : "Dégradation"} · {components.find((entry) => entry.id === row.component_id)?.name ?? row.component_id}</span><h4>{row.title}</h4></div><span className="status-detection-state">{stateLabels[row.state]}</span></header>
        <dl><div><dt>Détecté</dt><dd>{formatDate(row.first_at)}</dd></div><div><dt>Dernier relevé anormal</dt><dd>{formatDate(row.last_at)}</dd></div><div><dt>Sonde</dt><dd>{row.recovered_at ? `Rétablie le ${formatDate(row.recovered_at)}` : "Anomalie non rétablie"}</dd></div></dl>
        <p className="status-detection-description">{row.description}</p>
        {row.diagnostic && <p className="status-detection-diagnostic">{row.diagnostic}</p>}
        {row.notes && <MarkdownContent>{row.notes}</MarkdownContent>}
        <div className="actions"><button type="button" className="secondary" onClick={() => edit(row)}><Pencil size={15} />{row.state === "closed" ? "Consulter / modifier" : "Compléter / clôturer"}</button><button type="button" className="secondary" onClick={() => onPublish(row)}><ExternalLink size={15} />Préparer un incident public</button>{row.closed_at && <small>Clôturé le {formatDate(row.closed_at)}</small>}</div>
      </article>)}</div>
      {!data.rows.length && <p className="empty-state">Aucun incident dans cette liste.</p>}
      <Pagination {...data} onPage={setPage} onPageSize={(size) => { setPageSize(size); setPage(1); }} label="Pages des incidents détectés" />
    </>}
    {editing && <Dialog title="Suivi de l’incident détecté" onClose={() => setEditing(null)} dismissible={!busy} className="status-detection-dialog"><form onSubmit={save}>
      <label>Titre<input value={draft.title} required maxLength={160} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
      <div className="status-detection-observation"><strong>Description automatique</strong><p>{editing.description}</p>{editing.diagnostic && <code>{editing.diagnostic}</code>}</div>
      <label>État du suivi<select value={draft.state} onChange={(event) => setDraft({ ...draft, state: event.target.value })}>{Object.entries(stateLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Analyse, actions et conclusion<textarea rows={7} maxLength={8000} required={draft.state === "closed"} value={draft.notes} placeholder="Cause confirmée ou incertaine, vérifications effectuées, mesures prises…" onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
      {draft.notes && <MarkdownContent>{draft.notes}</MarkdownContent>}
      <small>Ces informations restent privées. La publication est une action distincte.</small>
      {draft.state === "closed" && !editing.recovered_at && <p className="status-detection-warning"><AlertTriangle size={16} />La sonde n’a pas encore confirmé le rétablissement. Clôturer le suivi ne modifiera pas l’état du service.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions"><button type="button" className="secondary" disabled={busy} onClick={() => setEditing(null)}>Annuler</button><button type="submit" disabled={busy}><CheckCircle2 size={16} />{busy ? "Enregistrement…" : draft.state === "closed" ? "Clôturer le suivi" : "Enregistrer"}</button></div>
    </form></Dialog>}
  </section>;
}
