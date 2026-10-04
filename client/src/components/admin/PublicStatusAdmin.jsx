import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, ExternalLink, Pencil, Plus, RefreshCw, Save, SlidersHorizontal, Wrench, XCircle } from "lucide-react";
import { api } from "../../api.js";
import { appPath } from "../../navigation/routes.js";
import { ConfirmActionButton } from "../common/ConfirmAction.jsx";
import { Dialog } from "../common/Dialog.jsx";
import { DateTimeInput } from "../common/DateTimeInput.jsx";
import { browserTimeZone } from "../../utils/dates.js";
import { MarkdownContent } from "../patchnotes/MarkdownContent.jsx";

const statusLabels = { operational: "Opérationnel", degraded: "Dégradé", maintenance: "Maintenance", outage: "Indisponible", unknown: "Inconnu" };
const typeLabels = { maintenance: "Maintenance", warning: "Avertissement", outage: "Panne" };
const stateLabels = { scheduled: "Planifié", in_progress: "En cours", completed: "Terminé" };
const incidentStages = ["scheduled", "in_progress", "completed"];
const stageTabs = [{ id: "display", label: "Display" }, { id: "scheduled", label: "Scheduled" }, { id: "in_progress", label: "InProgress" }, { id: "completed", label: "Completed" }];
const stageUpdates = (incident = {}) => incidentStages.map((state) => {
  const existing = (incident.updates ?? []).filter((entry) => entry.state === state).at(-1);
  const fallback = state === "scheduled" ? incident.createdAt : state === "in_progress" ? incident.startedAt : incident.completedAt;
  return { id: existing?.id, state, createdAt: existing?.createdAt ?? fallback ?? new Date().toISOString(), message: existing?.message ?? "" };
});
const blankDraft = () => ({ title: "", message: "", type: "warning", state: "scheduled", components: [], scheduledAt: new Date().toISOString(), startedAt: "", completedAt: "", updates: stageUpdates() });

function IncidentEditor({ draft, setDraft, components, mode, busy, onClose, onSave }) {
  const editing = mode !== "new";
  const resolving = mode === "resolve";
  const [tab, setTab] = useState(resolving ? "completed" : "display");
  const stage = tab === "display" ? null : draft.updates.find((entry) => entry.state === tab);
  const toggle = (id) => setDraft((current) => ({ ...current, components: current.components.includes(id) ? current.components.filter((value) => value !== id) : [...current.components, id] }));
  const updateStage = (patch) => setDraft((current) => ({
    ...current,
    ...(tab === "in_progress" && patch.createdAt ? { startedAt: patch.createdAt } : {}),
    ...(tab === "completed" && patch.createdAt ? { completedAt: patch.createdAt } : {}),
    updates: current.updates.map((entry) => entry.state === tab ? { ...entry, ...patch } : entry)
  }));
  return <Dialog title={resolving ? "Résoudre l’incident" : editing ? "Modifier l’incident" : "Publier un incident"} className="public-status-editor" onClose={onClose} dismissible={!busy}>
    <form onSubmit={onSave}>
      <small>Heures locales · {browserTimeZone()}</small>
      <nav className="status-incident-tabs" aria-label="Étapes de l’incident">{stageTabs.map((entry) => <button type="button" key={entry.id} className={tab === entry.id ? "active" : ""} onClick={() => setTab(entry.id)}>{entry.label}</button>)}</nav>
      {tab === "display" ? <section className="status-incident-tab-panel"><div className="admin-field-grid status-incident-fields">
        <label>Type<select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value })}><option value="maintenance">Maintenance</option><option value="warning">Avertissement</option><option value="outage">Panne</option></select></label>
        {!editing && <label>État initial<select value={draft.state} onChange={(event) => { const state = event.target.value; setDraft({ ...draft, state, startedAt: state === "in_progress" ? draft.startedAt || new Date().toISOString() : "" }); }}><option value="scheduled">Planifié</option><option value="in_progress">En cours</option></select></label>}
        <label>Heure du relevé concerné<DateTimeInput required value={draft.scheduledAt} onValueChange={(value) => setDraft({ ...draft, scheduledAt: value })} /></label>
        <label className="status-incident-title">Titre<input value={draft.title} maxLength="120" required onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Maintenance du service de jeu" /></label>
      </div><label className="status-incident-message">Texte Markdown<textarea value={draft.message} maxLength="4000" required onChange={(event) => setDraft({ ...draft, message: event.target.value })} placeholder="Décris l’impact visible et les actions en cours." /></label>{draft.message && <MarkdownContent className="status-markdown-preview">{draft.message}</MarkdownContent>}</section>
        : <section className="status-incident-tab-panel"><div className="status-stage-heading"><div><strong>{stateLabels[tab]}</strong><small>Cette entrée apparaît dans la chronologie lorsque cette étape est atteinte.</small></div></div><label>Date et heure<DateTimeInput value={stage?.createdAt ?? ""} onValueChange={(value) => updateStage({ createdAt: value })} /></label><label className="status-incident-message">Texte Markdown<textarea value={stage?.message ?? ""} maxLength="4000" onChange={(event) => updateStage({ message: event.target.value })} placeholder={`Message pour l’étape « ${stateLabels[tab]} »`} /></label>{stage?.message && <MarkdownContent className="status-markdown-preview">{stage.message}</MarkdownContent>}</section>}
      <fieldset className="status-component-picker"><legend>Services concernés</legend>{components.map((component) => <label key={component.id} className={draft.components.includes(component.id) ? "selected" : ""}><input type="checkbox" checked={draft.components.includes(component.id)} onChange={() => toggle(component.id)} /><span><strong>{component.name}</strong><small>{statusLabels[component.status]}</small></span></label>)}</fieldset>
      <div className="actions"><button type="button" className="secondary" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" disabled={busy || !draft.components.length}>{busy ? "Enregistrement…" : resolving ? "Confirmer la résolution" : editing ? "Enregistrer" : draft.state === "scheduled" ? "Planifier" : "Publier"}</button></div>
    </form>
  </Dialog>;
}

export function PublicStatusAdmin({ reportError }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState(null);
  const [draft, setDraft] = useState(blankDraft);
  const [settingsDraft, setSettingsDraft] = useState({ historyDays: 90, displayIntervalMinutes: 360 });
  const settingsSegments = Math.ceil(settingsDraft.historyDays * 1440 / settingsDraft.displayIntervalMinutes);
  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try { const result = await api("/api/admin/status"); setData(result); setSettingsDraft(result.settings); reportError?.(""); }
    catch (error) { reportError?.(error.message); }
    finally { if (!quiet) setLoading(false); }
  }, [reportError]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") load({ quiet: true }); };
    const timer = setInterval(refresh, 60000);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [load]);

  function openNew(component) {
    const state = component && component.status !== "operational" ? "in_progress" : "scheduled";
    setEditor({ mode: "new" });
    const draft = blankDraft();
    setDraft({ ...draft, type: component?.status === "outage" ? "outage" : component?.status === "degraded" ? "warning" : "maintenance", state, startedAt: state === "in_progress" ? new Date().toISOString() : "", components: component ? [component.id] : [] });
  }
  function openEdit(incident) {
    setEditor({ mode: "edit", id: incident.id });
    setDraft({ title: incident.title, message: incident.message, type: incident.type, state: incident.state, components: incident.components, scheduledAt: incident.scheduledAt ?? "", startedAt: incident.startedAt ?? "", completedAt: incident.completedAt ?? "", updates: stageUpdates(incident) });
  }
  function openResolve(incident) {
    setEditor({ mode: "resolve", id: incident.id });
    const updates = stageUpdates(incident).map((entry) => entry.state === "completed" ? { ...entry, createdAt: new Date().toISOString(), message: entry.message || "L’incident est résolu." } : entry);
    setDraft({ title: incident.title, message: incident.message, type: incident.type, state: "completed", components: incident.components, scheduledAt: incident.scheduledAt ?? "", startedAt: incident.startedAt ?? "", completedAt: new Date().toISOString(), updates });
  }
  async function save(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const body = { ...draft };
      for (const field of ["scheduledAt", "startedAt", "completedAt"]) {
        if (body[field]) { if (!Number.isFinite(Date.parse(body[field]))) throw new Error("Date ou heure invalide."); }
        else delete body[field];
      }
      body.updates = draft.updates;
      const result = await api(editor.mode === "new" ? "/api/admin/status/incidents" : `/api/admin/status/incidents/${editor.id}`, { method: editor.mode === "new" ? "POST" : "PATCH", body: JSON.stringify(body) });
      setData(result.status); setEditor(null); reportError?.("");
    } catch (error) { reportError?.(error.message); }
    finally { setBusy(false); }
  }
  async function transition(incident, state) {
    const stage = (incident.updates ?? []).filter((entry) => entry.state === state).at(-1);
    const result = await api(`/api/admin/status/incidents/${incident.id}`, { method: "PATCH", body: JSON.stringify({ state, ...(state === "in_progress" && stage?.createdAt ? { startedAt: stage.createdAt } : {}) }) });
    setData(result.status);
  }
  async function saveSettings(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await api("/api/admin/status/settings", { method: "PUT", body: JSON.stringify(settingsDraft) });
      setData(result.status); setSettingsDraft(result.settings); reportError?.("");
    } catch (error) { reportError?.(error.message); }
    finally { setBusy(false); }
  }

  if (loading && !data) return <section className="card metrics-loading"><RefreshCw className="spinning" /><strong>Chargement du statut public…</strong></section>;
  if (!data) return null;
  const active = data.incidents ?? [];
  return <div className="public-status-admin">
    <header className="metrics-heading"><div><span className="eyebrow">Communication publique</span><h2>Service Status</h2><p>Les mesures sont consolidées par tranches de {data.slotMinutes} minutes et conservées pendant {data.settings.historyDays} jours.</p></div><div className="metrics-actions"><a className="status-public-link" href={appPath("status")} target="_blank" rel="noreferrer"><ExternalLink size={17} />Voir la page publique</a><button type="button" className="secondary icon-toggle" title="Actualiser" onClick={() => load()} disabled={loading}><RefreshCw size={17} className={loading ? "spinning" : ""} /></button><button type="button" onClick={() => openNew()}><Plus size={17} />Publier un incident</button></div></header>

    <form className="status-admin-settings" onSubmit={saveSettings}><div className="admin-form-heading"><div><h3><SlidersHorizontal size={18} />Historique public</h3><p>La page montre d’abord 7 jours, puis permet d’ouvrir cette période complète.</p></div></div><label>Durée maximale affichée<span><input type="number" min="7" max="365" value={settingsDraft.historyDays} onChange={(event) => setSettingsDraft({ ...settingsDraft, historyDays: Number(event.target.value) })} />jours</span></label><label>Intervalle d’un segment<select value={settingsDraft.displayIntervalMinutes} onChange={(event) => setSettingsDraft({ ...settingsDraft, displayIntervalMinutes: Number(event.target.value) })}>{[[15, "15 minutes"], [30, "30 minutes"], [60, "1 heure"], [180, "3 heures"], [360, "6 heures"], [720, "12 heures"], [1440, "1 jour"]].map(([value, label]) => <option key={value} value={value} disabled={settingsDraft.historyDays * 1440 / value > 10000}>{label}{settingsDraft.historyDays * 1440 / value > 10000 ? " · période trop dense" : ""}</option>)}</select></label><div><small className={settingsSegments > 10000 ? "error-text" : ""}>{settingsSegments.toLocaleString("fr-BE")} segments par service{settingsSegments > 10000 ? " · augmente l’intervalle" : ""}</small><button type="submit" disabled={busy || settingsSegments > 10000}><Save size={16} />Enregistrer</button></div></form>

    <section className="status-admin-services"><div className="admin-form-heading"><div><h3>État des services</h3><p>Une sonde automatique remonte les ralentissements et interruptions. Publie un incident pour informer les joueurs.</p></div></div><div>{data.components.map((component) => { const Icon = component.status === "operational" ? CheckCircle2 : component.status === "outage" ? XCircle : component.status === "degraded" ? AlertTriangle : Clock3; return <article key={component.id} className={`status-admin-service status-${component.status}`}><Icon size={21} /><div><strong>{component.name}</strong><span>{statusLabels[component.status]}</span><small>{component.message}</small></div>{["degraded", "outage"].includes(component.status) && <button type="button" className="secondary" onClick={() => openNew(component)}>Agir</button>}</article>; })}</div></section>

    <section className="status-admin-incidents"><div className="admin-form-heading"><div><h3>Incidents actifs et planifiés</h3><p>Chaque changement d’état est ajouté à la chronologie publique.</p></div></div>{active.length ? <div className="status-admin-incident-list">{active.map((incident) => <article key={incident.id} className={`incident-${incident.type}`}><header><div><span>{typeLabels[incident.type]} · {stateLabels[incident.state]}</span><h4>{incident.title}</h4></div><time>{new Date(incident.updatedAt).toLocaleString("fr-BE")}</time></header><MarkdownContent className="status-admin-markdown">{incident.message}</MarkdownContent><small>{incident.components.map((id) => data.components.find((component) => component.id === id)?.name ?? id).join(" · ")}{incident.scheduledAt ? ` · Relevé du ${new Date(incident.scheduledAt).toLocaleString("fr-BE")}` : ""}{incident.startedAt ? ` · Traitement commencé le ${new Date(incident.startedAt).toLocaleString("fr-BE")}` : ""}</small><div className="actions"><button type="button" className="secondary" onClick={() => openEdit(incident)}><Pencil size={15} />Modifier</button>{incident.state === "scheduled" && <ConfirmActionButton dialogTitle="Démarrer cet incident ?" message="Son état passera à En cours et sera mis en avant sur la page publique." confirmLabel="Démarrer" onConfirm={() => transition(incident, "in_progress")}><AlertTriangle size={15} />Démarrer</ConfirmActionButton>}{incident.state === "in_progress" && <button type="button" onClick={() => openResolve(incident)}><CheckCircle2 size={15} />Terminer</button>}</div></article>)}</div> : <div className="empty-state"><CheckCircle2 size={24} /><strong>Aucun incident actif</strong><span>Les services reposent uniquement sur leur état automatique.</span></div>}</section>

    <section className="status-admin-history"><div className="admin-form-heading"><div><h3>Incidents terminés</h3><p>Les 30 derniers incidents publics sont conservés dans cette vue.</p></div></div>{data.history?.length ? data.history.map((incident) => <article key={incident.id}><Wrench size={17} /><div><strong>{incident.title}</strong><small>{typeLabels[incident.type]} · relevé du {new Date(incident.scheduledAt).toLocaleString("fr-BE")} · résolu le {new Date(incident.completedAt ?? incident.updatedAt).toLocaleString("fr-BE")}</small></div><button type="button" className="secondary icon-toggle" title="Modifier les heures et la justification" aria-label={`Modifier ${incident.title}`} onClick={() => openEdit(incident)}><Pencil size={15} /></button></article>) : <p className="empty-state">Aucun incident archivé.</p>}</section>
    {editor && <IncidentEditor draft={draft} setDraft={setDraft} components={data.components} mode={editor.mode} busy={busy} onClose={() => setEditor(null)} onSave={save} />}
  </div>;
}
