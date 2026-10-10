import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArchiveX, CheckCircle2, ExternalLink, Pencil, RefreshCw } from "lucide-react";
import { api } from "../../api.js";
import { Dialog } from "../common/Dialog.jsx";
import { Pagination } from "../feedback/Feedback.jsx";
import { MarkdownContent } from "../patchnotes/MarkdownContent.jsx";
import { formatDate } from "../../utils/presentation.jsx";
import "./detected-incidents.css";

const stateLabels = { open: "À examiner", in_progress: "En investigation", closed: "Clôturé", dismissed: "Classé sans suite" };
const filterLabels = { pending: "À traiter", open: "À examiner", in_progress: "En investigation", closed: "Clôturés", dismissed: "Classés sans suite", all: "Tous les suivis" };

function ReasonFields({ draft, setDraft, presets }) {
  const [preset, setPreset] = useState("");
  return <div className="status-detection-reason">
    <label>Justificatif prédéfini<select value={preset} onChange={(event) => {
      setPreset(event.target.value);
      const entry = presets.find((item) => item.id === event.target.value);
      if (entry) setDraft({ ...draft, dismissal_reason: entry.text });
    }}><option value="">Justificatif personnalisé</option>{presets.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label>
    <label>Justificatif du classement sans suite<textarea rows={4} maxLength={4000} required value={draft.dismissal_reason} onChange={(event) => { setPreset(""); setDraft({ ...draft, dismissal_reason: event.target.value }); }} /></label>
    <small>Privé. Un clic sur la barre publique remettra le suivi en investigation, sans révéler ce justificatif.</small>
  </div>;
}

export function DetectedIncidents({ components, onPublish }) {
  const [filter, setFilter] = useState("pending");
  const [component, setComponent] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [data, setData] = useState(null);
  const [selection, setSelection] = useState([]);
  const [editing, setEditing] = useState(null);
  const [batchEditing, setBatchEditing] = useState(null);
  const [draft, setDraft] = useState(null);
  const [history, setHistory] = useState(null);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const requestSequence = useRef(0);
  const selectPageRef = useRef(null);
  const dialogOpen = useRef(false);
  dialogOpen.current = Boolean(editing || batchEditing);
  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    try {
      const query = new URLSearchParams({ state: filter, component, severity, page: String(page), pageSize: String(pageSize) });
      const next = await api(`/api/admin/status/detections?${query}`);
      if (sequence !== requestSequence.current) return;
      setData(next);
      setSelection((ids) => ids.filter((id) => next.rows.some((row) => row.id === id)));
      setLoadError("");
    } catch (failure) { if (sequence === requestSequence.current) setLoadError(failure.message); }
    finally { if (sequence === requestSequence.current) setLoading(false); }
  }, [filter, component, severity, page, pageSize]);
  useEffect(() => {
    setSelection([]);
    setData(null);
    load();
    const timer = setInterval(() => { if (document.visibilityState === "visible" && !dialogOpen.current) load(); }, 60000);
    return () => { clearInterval(timer); requestSequence.current++; };
  }, [load]);
  useEffect(() => {
    if (selectPageRef.current) selectPageRef.current.indeterminate = selection.length > 0 && selection.length < (data?.rows.length ?? 0);
  }, [selection, data]);
  useEffect(() => {
    if (!editing) return;
    let active = true;
    setHistory(null);
    api(`/api/admin/status/detections/${editing.id}/history`).then((result) => { if (active) setHistory(result.actions); }).catch(() => { if (active) setHistory([]); });
    return () => { active = false; };
  }, [editing]);
  function edit(row) {
    setEditing(row);
    setDraft({ title: row.title, state: row.state, notes: row.notes, dismissal_reason: row.dismissal_reason ?? "" });
    setError("");
  }
  function editBatch(state = "") {
    setBatchEditing(data.rows.filter((row) => selection.includes(row.id)));
    setDraft({ state, notes: "", notesMode: "append", dismissal_reason: "" });
    setError("");
  }
  async function save(event) {
    event.preventDefault();
    setBusy(true);
    try {
      if (batchEditing) {
        const changes = {};
        if (draft.state) changes.state = draft.state;
        if (draft.notes.trim() || draft.notesMode === "replace") { changes.notes = draft.notes; changes.notesMode = draft.notesMode; }
        if (draft.state === "dismissed") changes.dismissal_reason = draft.dismissal_reason;
        const result = await api("/api/admin/status/detections/batch", { method: "POST", body: JSON.stringify({ ids: batchEditing.map((row) => row.id), changes }) });
        setNotice(`${result.updated} incident(s) modifié(s).`);
        setSelection([]);
      } else {
        await api(`/api/admin/status/detections/${editing.id}`, { method: "PATCH", body: JSON.stringify(draft) });
        setNotice("Suivi enregistré.");
      }
      setEditing(null);
      setBatchEditing(null);
      await load();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  const presets = data?.dismissalPresets ?? [];
  const totalCount = Object.values(data?.counts ?? {}).reduce((sum, count) => sum + count, 0);
  return <section className="status-detection-section" aria-labelledby="status-detection-title">
    <div className="admin-form-heading"><div><h3 id="status-detection-title">Incidents détectés</h3><p>Relevés automatiques privés, à compléter et à clôturer. Le rétablissement du service ne clôture pas le suivi.</p></div><button type="button" className="secondary icon-toggle" title="Actualiser les incidents détectés" aria-label="Actualiser les incidents détectés" disabled={loading || busy} onClick={load}><RefreshCw size={17} /></button></div>
    <nav className="segmented-tabs status-detection-types" role="tablist" aria-label="Types de services">{[{ id: "all", name: "Tous les services" }, ...components].map((entry) => <button type="button" role="tab" aria-selected={component === entry.id} key={entry.id} disabled={busy} className={component === entry.id ? "active" : ""} onClick={() => { setComponent(entry.id); setPage(1); }}>{entry.name}<span>{entry.id === "all" ? totalCount : data?.counts?.[entry.id] ?? 0}</span></button>)}</nav>
    <div className="status-detection-filters"><label>État du suivi<select aria-label="État du suivi" value={filter} disabled={busy} onChange={(event) => { setFilter(event.target.value); setPage(1); }}>{Object.entries(filterLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><div className="status-detection-kind"><span>Type d’anomalie</span><nav className="segmented-tabs" role="tablist" aria-label="Types d’anomalies">{[["all", "Toutes"], ["outage", "Indisponibilités"], ["degraded", "Dégradations"]].map(([value, label]) => <button type="button" role="tab" aria-selected={severity === value} key={value} className={severity === value ? "active" : ""} disabled={busy} onClick={() => { setSeverity(value); setPage(1); }}>{label}</button>)}</nav></div></div>
    {loadError && <p className="error" role="alert">{loadError}</p>}
    {notice && <p className="status-detection-notice" role="status">{notice}</p>}
    {!data ? <p role="status">Chargement des relevés…</p> : <>
      <div className="status-detection-selection"><label><input ref={selectPageRef} type="checkbox" checked={data.rows.length > 0 && selection.length === data.rows.length} disabled={!data.rows.length || busy} onChange={(event) => setSelection(event.target.checked ? data.rows.map((row) => row.id) : [])} />Sélectionner cette page</label><span>{selection.length} sélectionné(s)</span><div className="actions"><button type="button" className="secondary" disabled={!selection.length || busy} onClick={() => editBatch()}><Pencil size={16} />Modifier en série</button><button type="button" className="secondary" disabled={!selection.length || busy} onClick={() => editBatch("dismissed")}><ArchiveX size={16} />Classer sans suite</button></div></div>
      <div className="status-detection-list">{data.rows.map((row) => <article key={row.id} className={`status-detection-row${selection.includes(row.id) ? " is-selected" : ""}`}>
        <header><label className="status-detection-pick"><input type="checkbox" checked={selection.includes(row.id)} disabled={busy} aria-label={`Sélectionner ${row.title}`} onChange={(event) => setSelection((ids) => event.target.checked ? [...ids, row.id] : ids.filter((id) => id !== row.id))} /></label><div className="status-detection-row-title"><span className={`status-detection-severity severity-${row.severity}`}><AlertTriangle size={14} />{row.severity === "outage" ? "Indisponibilité" : "Dégradation"} · {components.find((entry) => entry.id === row.component_id)?.name ?? row.component_id}</span><h4>{row.title}</h4></div><span className={`status-detection-state${row.recovered_at ? " is-recovered" : ""}`}>{row.recovered_at ? "Service rétabli · " : ""}{stateLabels[row.state]}</span></header>
        <dl><div><dt>Détecté</dt><dd>{formatDate(row.first_at)}</dd></div><div><dt>Dernier relevé anormal</dt><dd>{formatDate(row.last_at)}</dd></div><div><dt>Sonde</dt><dd>{row.recovered_at ? `Rétablie le ${formatDate(row.recovered_at)}` : "Anomalie non rétablie"}</dd></div></dl>
        <p className="status-detection-description">{row.description}</p>
        {row.diagnostic && <p className="status-detection-diagnostic">{row.diagnostic}</p>}
        {row.notes && <MarkdownContent>{row.notes}</MarkdownContent>}
        {row.dismissal_reason && <div className="status-detection-reason-summary"><strong>Justificatif privé du classement sans suite</strong><MarkdownContent>{row.dismissal_reason}</MarkdownContent>{row.dismissed_at && <small>{formatDate(row.dismissed_at)}</small>}</div>}
        {row.public_reopened_at && <p className="status-detection-notice">Suivi rouvert depuis la page publique le {formatDate(row.public_reopened_at)}.</p>}
        <div className="actions"><button type="button" className="secondary" onClick={() => edit(row)}><Pencil size={15} />{["closed", "dismissed"].includes(row.state) ? "Consulter / modifier" : "Compléter / clôturer"}</button><button type="button" className="secondary" onClick={() => onPublish(row)}><ExternalLink size={15} />Préparer un incident public</button>{row.closed_at && <small>Clôturé le {formatDate(row.closed_at)}</small>}</div>
      </article>)}</div>
      {!data.rows.length && <p className="empty-state">Aucun incident dans cette liste.</p>}
      <Pagination {...data} onPage={setPage} onPageSize={(size) => { setPageSize(size); setPage(1); }} label="Pages des incidents détectés" />
    </>}
    {(editing || batchEditing) && <Dialog title={batchEditing ? `Modifier ${batchEditing.length} incident(s)` : "Suivi de l’incident détecté"} onClose={() => { setEditing(null); setBatchEditing(null); }} dismissible={!busy} className="status-detection-dialog"><form onSubmit={save}>
      {!batchEditing && <><label>Titre<input value={draft.title} required maxLength={160} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label><div className="status-detection-observation"><strong>Description automatique</strong><p>{editing.description}</p>{editing.diagnostic && <code>{editing.diagnostic}</code>}</div></>}
      {batchEditing && <ul className="status-detection-batch-list">{batchEditing.map((row) => <li key={row.id}>{row.title}</li>)}</ul>}
      <label>État du suivi<select value={draft.state} onChange={(event) => setDraft({ ...draft, state: event.target.value })}>{batchEditing && <option value="">Conserver l’état de chaque dossier</option>}{Object.entries(stateLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {draft.state === "dismissed" && <ReasonFields draft={draft} setDraft={setDraft} presets={presets} />}
      {batchEditing && <label>Gestion des notes<select value={draft.notesMode} onChange={(event) => setDraft({ ...draft, notesMode: event.target.value })}><option value="append">Ajouter aux notes existantes</option><option value="replace">Remplacer les notes existantes</option></select></label>}
      <label>Analyse, actions et conclusion<textarea rows={batchEditing ? 4 : 7} maxLength={8000} required={draft.state === "closed" && (!batchEditing || draft.notesMode === "replace")} value={draft.notes} placeholder="Cause confirmée ou incertaine, vérifications effectuées, mesures prises…" onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
      {draft.notes && <MarkdownContent>{draft.notes}</MarkdownContent>}
      {batchEditing && draft.notesMode === "replace" && <p className="status-detection-warning"><AlertTriangle size={16} />Les notes des dossiers sélectionnés seront remplacées. Les versions précédentes restent dans leur historique.</p>}
      <small>Ces informations restent privées. La publication est une action distincte.</small>
      {draft.state === "closed" && (batchEditing || !editing.recovered_at) && <p className="status-detection-warning"><AlertTriangle size={16} />Clôturer le suivi ne modifiera pas l’état mesuré du service.</p>}
      {editing && history?.length > 0 && <details className="status-detection-history"><summary>Historique des modifications</summary><ol>{history.map((entry) => <li key={entry.id}><strong>{stateLabels[entry.previous_state]} → {stateLabels[entry.state]}</strong><small>{formatDate(entry.created_at)}{entry.created_by === "public-status" ? " · Clic sur la barre publique" : " · Administration"}</small>{entry.dismissal_reason && <MarkdownContent>{entry.dismissal_reason}</MarkdownContent>}{entry.notes && <MarkdownContent>{entry.notes}</MarkdownContent>}</li>)}</ol></details>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions"><button type="button" className="secondary" disabled={busy} onClick={() => { setEditing(null); setBatchEditing(null); }}>Annuler</button><button type="submit" disabled={busy}><CheckCircle2 size={16} />{busy ? "Enregistrement…" : draft.state === "dismissed" ? "Confirmer le classement sans suite" : draft.state === "closed" ? "Clôturer le suivi" : "Enregistrer"}</button></div>
    </form></Dialog>}
  </section>;
}
