import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink, Globe, Plus, RefreshCw, Save, Search, Trash2, X } from "lucide-react";
import { api } from "../../api.js";
import { useLocale } from "../../locales/LocaleProvider.jsx";
import { Dialog } from "../common/Dialog.jsx";
import { ConfirmActionButton, ConfirmDialog } from "../common/ConfirmAction.jsx";

const root = "/api/admin/communication/platforms";
const pathKey = path => JSON.stringify(path);
const format = value => value === null || value === undefined ? "-" : typeof value === "number" ? new Intl.NumberFormat().format(value) : String(value);

export function PlatformsAdmin({ admin }) {
  const { t } = useLocale();
  const [rows, setRows] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [draft, setDraft] = useState(null), [baseline, setBaseline] = useState(""), [busy, setBusy] = useState(false), [search, setSearch] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const mounted = useRef(true);
  const dirty = draft && JSON.stringify(draft) !== baseline;
  const merge = value => setRows(current => current.map(row => row.id === value.id ? value : row));
  async function refresh(row) {
    const next = await api(`${root}/${row.id}/refresh`, { method: "POST", background: true, body: "{}" });
    if (mounted.current) merge(next);
    return next;
  }
  useEffect(() => {
    mounted.current = true;
    let active = false;
    async function load() {
      if (active) return;
      active = true;
      try {
        const data = await api(root);
        if (!mounted.current) return;
        setRows(data); setLoading(false);
        // Fill cards progressively without sending a burst of external requests.
        for (const row of data.filter(row => row.apiUrl)) {
          if (!mounted.current) break;
          try { await refresh(row); } catch (failure) { if (mounted.current) setError(failure.message); }
        }
      } catch (failure) { if (mounted.current) { setError(failure.message); setLoading(false); } }
      finally { active = false; }
    }
    load();
    const timer = setInterval(load, 15 * 60 * 1000);
    return () => { mounted.current = false; clearInterval(timer); };
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const protect = event => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirty]);
  async function run(action) {
    setBusy(true); setError("");
    try { await action(); } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  function open(row) { setDraft(structuredClone(row)); setBaseline(JSON.stringify(row)); setError(""); }
  function create() { open({ name: "", url: "", description: "", apiUrl: "", metrics: [], position: rows.length }); }
  function close() { if (dirty) setConfirmClose(true); else setDraft(null); }
  async function save() {
    await run(async () => {
      let next = await api(`${root}${draft.id ? `/${draft.id}` : ""}`, { method: draft.id ? "PUT" : "POST", body: JSON.stringify(draft) });
      setRows(current => current.some(row => row.id === next.id) ? current.map(row => row.id === next.id ? next : row) : [...current, next]);
      open(next);
      if (next.apiUrl) { next = await refresh(next); open(next); }
    });
  }
  async function move(row, direction) {
    await run(async () => {
      const next = [...rows], index = next.findIndex(item => item.id === row.id);
      [next[index], next[index + direction]] = [next[index + direction], next[index]];
      setRows(await api(`${root}/order`, { method: "POST", body: JSON.stringify({ items: next.map(({ id, revision }) => ({ id, revision })) }) }));
    });
  }
  async function remove(row) {
    await api(`${root}/${row.id}`, { method: "DELETE", body: JSON.stringify({ revision: row.revision }) });
    setRows(current => current.filter(item => item.id !== row.id));
  }
  const update = patch => setDraft(current => ({ ...current, ...patch }));
  const leaves = draft?.cache?.leaves ?? [];
  return <section className="comms-platforms">
    <header className="admin-section-heading"><h3>{t("Plateformes externes")}</h3><button type="button" disabled={busy} onClick={create}><Plus size={17}/>{t("Ajouter une plateforme")}</button></header>
    <label className="comms-search"><Search size={17}/><input type="search" value={search} placeholder={t("Rechercher une plateforme")} aria-label={t("Rechercher une plateforme")} onChange={event => setSearch(event.target.value)}/></label>
    {error && <p className="error" role="alert">{t(error)}</p>}
    {loading && <p role="status">{t("Chargement…")}</p>}
    {rows.filter(row => `${row.name} ${row.description}`.toLowerCase().includes(search.toLowerCase())).map(row => <article className="comms-platform-row" key={row.id}>
      <header>
        <div><h3><Globe size={19}/>{row.name}</h3><a href={row.url} target="_blank" rel="noopener noreferrer">{new URL(row.url).hostname}<ExternalLink size={14}/></a></div>
        <div className="comms-export-actions">
          <button type="button" className="secondary icon-toggle" disabled={busy || rows[0]?.id === row.id} title={t("Monter")} aria-label={t("Monter")} onClick={() => move(row, -1)}><ArrowUp size={17}/></button>
          <button type="button" className="secondary icon-toggle" disabled={busy || rows.at(-1)?.id === row.id} title={t("Descendre")} aria-label={t("Descendre")} onClick={() => move(row, 1)}><ArrowDown size={17}/></button>
          <button type="button" className="secondary" disabled={busy} onClick={() => open(row)}>{t("Modifier")}</button>
          {row.apiUrl && <button type="button" className="secondary icon-toggle" disabled={busy} title={t("Actualiser les statistiques")} aria-label={t("Actualiser les statistiques")} onClick={() => run(() => refresh(row))}><RefreshCw size={17}/></button>}
          {admin && <ConfirmActionButton className="secondary icon-toggle danger-icon" title={t("Supprimer")} aria-label={t("Supprimer")} dialogTitle={t("Supprimer cette plateforme ?")} message={row.name} confirmLabel={t("Supprimer")} danger onConfirm={() => remove(row)}><Trash2 size={17}/></ConfirmActionButton>}
        </div>
      </header>
      {row.description && <p>{row.description}</p>}
      <div className="comms-metric-grid">{row.metrics.map(metric => <div key={pathKey(metric.path)}><span>{metric.label}</span><strong>{format(row.cache?.leaves.find(leaf => pathKey(leaf.path) === pathKey(metric.path))?.value)}</strong></div>)}</div>
      {row.apiUrl && <small>{t("Dernière actualisation")} : {row.cache?.fetchedAt ? new Date(row.cache.fetchedAt).toLocaleString() : "-"}{row.cache?.nextAttempt ? ` · ${t("Prochaine actualisation")} : ${new Date(row.cache.nextAttempt).toLocaleTimeString()}` : ""}</small>}
      {row.cache?.error && <p className="error" role="status">{t(row.cache.error)} {row.cache.fetchedAt && t("Les dernières données valides sont conservées.")}</p>}
    </article>)}
    {!loading && !rows.length && <p className="muted">{t("Aucune plateforme enregistrée.")}</p>}
    {draft && <Dialog title={draft.id ? t("Modifier la plateforme") : t("Ajouter une plateforme")} className="comms-platform-dialog" dismissible={!busy} onClose={close}>
      <div className="comms-document-actions"><button type="button" disabled={busy || !dirty} onClick={save}><Save size={17}/>{t("Enregistrer")}</button><button type="button" className="secondary" disabled={busy} onClick={close}><X size={17}/>{t("Fermer")}</button></div>
      {error && <p className="error" role="alert">{t(error)}</p>}
      <div className="comms-platform-editor">
        <fieldset disabled={busy}>
          <label>{t("Nom de la plateforme")}<input maxLength={100} value={draft.name} onChange={event => update({ name: event.target.value })}/></label>
          <label>{t("URL de la plateforme")}<input type="url" maxLength={1500} value={draft.url} placeholder="https://" onChange={event => update({ url: event.target.value })}/></label>
          <label>{t("Description")}<textarea rows={4} maxLength={2000} value={draft.description} onChange={event => update({ description: event.target.value })}/></label>
          <label>{t("URL JSON / API")}<input type="url" maxLength={1500} value={draft.apiUrl} placeholder="https://" onChange={event => update({ apiUrl: event.target.value, cache: null })}/></label>
          <h3>{t("Métriques sélectionnées")}</h3>
          {draft.metrics.map((metric, index) => <div className="comms-metric-field" key={pathKey(metric.path)}>
            <label><code>{metric.path.join(" / ")}</code><input aria-label={t("Nom de la métrique")} maxLength={80} value={metric.label} onChange={event => update({ metrics: draft.metrics.map((row, n) => n === index ? { ...row, label: event.target.value } : row) })}/></label>
            <button type="button" className="secondary icon-toggle" aria-label={t("Retirer la métrique")} title={t("Retirer la métrique")} onClick={() => update({ metrics: draft.metrics.filter((_, n) => n !== index) })}><X size={17}/></button>
          </div>)}
        </fieldset>
        <section className="comms-json-explorer">
          <header><h3>{t("Réponse JSON")}</h3>{draft.id && <button type="button" className="secondary icon-toggle" disabled={busy || dirty || !draft.apiUrl} title={t("Actualiser les statistiques")} aria-label={t("Actualiser les statistiques")} onClick={() => run(async () => open(await refresh(draft)))}><RefreshCw size={17}/></button>}</header>
          {draft.cache?.error && <p className="error">{t(draft.cache.error)}</p>}
          <div>{leaves.map(leaf => {
            const selected = draft.metrics.some(metric => pathKey(metric.path) === pathKey(leaf.path));
            return <label key={pathKey(leaf.path)}><input type="checkbox" checked={selected} disabled={busy || !selected && draft.metrics.length >= 12} onChange={() => update({ metrics: selected ? draft.metrics.filter(metric => pathKey(metric.path) !== pathKey(leaf.path)) : [...draft.metrics, { path: leaf.path, label: leaf.path.at(-1) || t("Valeur") }] })}/><span><code>{leaf.path.join(" / ")}</code><small>{format(leaf.value)}</small></span></label>;
          })}{!leaves.length && <p className="muted">{t("Aucune donnée disponible.")}</p>}</div>
        </section>
      </div>
    </Dialog>}
    {confirmClose && <ConfirmDialog title={t("Abandonner les modifications ?")} message={t("Les modifications non enregistrées seront perdues.")} confirmLabel={t("Abandonner")} onConfirm={() => setDraft(null)} onClose={() => setConfirmClose(false)}/>}
  </section>;
}
