import { useEffect, useId, useState } from "react";
import { Archive, Check, Copy, ImageOff, ImagePlus, ListChecks, Save, Search, Tags, X } from "lucide-react";
import { api, API_URL } from "../../api.js";
import { useLocale } from "../../locales/LocaleProvider.jsx";
import { Dialog } from "../common/Dialog.jsx";
import { ConfirmActionButton } from "../common/ConfirmAction.jsx";
import { Pagination } from "../feedback/Feedback.jsx";
import { usePagination } from "../common/usePagination.js";
import { copyText } from "../../utils/presentation.jsx";
import "./media-library.css";

const parseTags = value => value.split(/[,;]/).map(tag => tag.trim()).filter(Boolean);
function MediaThumbnail({ row }) {
  const { t } = useLocale();
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [row.image]);
  return <span className="media-checker media-thumbnail">{failed ? <span className="media-thumbnail-missing" role="img" aria-label={t("Image indisponible")}><ImageOff size={26}/></span> : <img src={`${API_URL}${row.image}`} width={row.width} height={row.height} alt={row.alt || row.name} loading="lazy" decoding="async" onError={() => setFailed(true)}/>}</span>;
}

export function MediaLibrary({ onSelect, admin = false, onImport, refresh = 0 }) {
  const { t } = useLocale();
  const [rows, setRows] = useState([]), [search, setSearch] = useState(""), [selected, setSelected] = useState(null), [error, setError] = useState(""), [notice, setNotice] = useState(""), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [tagFilter, setTagFilter] = useState("all"), [tagInput, setTagInput] = useState("");
  const [selectionMode, setSelectionMode] = useState(false), [checked, setChecked] = useState([]), [bulkInput, setBulkInput] = useState(""), [bulkOperation, setBulkOperation] = useState("add");
  const tagListId = `media-tags-${useId()}`;
  async function load() { setLoading(true); try { const next = await api("/api/admin/media"); setRows(next); setChecked(current => current.filter(id => next.some(row => row.id === id))); setError(""); } catch (failure) { setError(failure.message); } finally { setLoading(false); } }
  useEffect(() => { load(); }, [refresh]);
  useEffect(() => { if (tagFilter.startsWith("tag:") && !rows.some(row => row.tags?.includes(tagFilter.slice(4)))) setTagFilter("all"); }, [rows, tagFilter]);
  const tagCounts = new Map();
  for (const row of rows) for (const tag of row.tags ?? []) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  const tags = [...tagCounts.keys()].sort((a, b) => a.localeCompare(b, "fr"));
  const matches = rows.filter(row => `${row.name} ${row.alt} ${(row.tags ?? []).join(" ")}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()) && (tagFilter === "all" || tagFilter === "none" && !row.tags?.length || tagFilter.startsWith("tag:") && row.tags?.includes(tagFilter.slice(4))));
  const pages = usePagination(matches, JSON.stringify([search, tagFilter]));
  const pageSelected = pages.rows.length > 0 && pages.rows.every(row => checked.includes(row.id));
  function select(row) { setSelected(row); setTagInput((row.tags ?? []).join(", ")); setNotice(""); }
  function toggleChecked(id) { setChecked(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id].slice(0, 200)); }
  async function save(input) {
    setBusy(true); setError("");
    try {
      const next = await api(`/api/admin/media/${selected.id}`, { method: "PATCH", body: JSON.stringify(input) });
      setRows(current => current.map(row => row.id === next.id ? next : row).filter(row => !row.archived));
      if (next.archived) { setSelected(null); setChecked(current => current.filter(id => id !== next.id)); } else select(next);
      setNotice(t("Enregistré"));
    } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  async function updateTags() {
    setBusy(true); setError("");
    try {
      const { updated } = await api("/api/admin/media/tags", { method: "PATCH", body: JSON.stringify({ ids: checked, tags: parseTags(bulkInput), operation: bulkOperation }) });
      const byId = new Map(updated.map(row => [row.id, row]));
      setRows(current => current.map(row => byId.get(row.id) ?? row));
      if (selected && byId.has(selected.id)) { const next = byId.get(selected.id); setSelected(current => ({ ...current, tags: next.tags })); setTagInput(next.tags.join(", ")); }
      setNotice(t("Tags mis à jour sur {value0} image(s).", { value0: updated.length }));
    } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  async function copy(value) { try { await copyText(value); setNotice(t("Copié !")); } catch (failure) { setError(failure.message); } }
  return <section className="media-library card admin-list">
    <header className="admin-section-heading"><div><span className="eyebrow">{t("Contenu")}</span><h2>{t("Médiathèque")}</h2><small>{t("Images publiques réutilisables. Ne joins aucune donnée privée.")}</small></div><div className="media-library-actions"><button type="button" className={selectionMode ? "active" : "secondary"} disabled={busy} aria-pressed={selectionMode} onClick={() => { setSelectionMode(value => !value); setChecked([]); }}><ListChecks size={18}/>{t("Sélectionner")}</button>{onImport && <button type="button" onClick={onImport}><ImagePlus size={18}/>{t("Importer une image")}</button>}</div></header>
    <div className="media-library-toolbar"><label className="media-search"><Search size={17}/><input aria-label={t("Rechercher une image")} placeholder={t("Rechercher une image")} value={search} onChange={event => setSearch(event.target.value)}/></label><label className="media-tag-filter"><Tags size={17}/><select aria-label={t("Filtrer par tag")} value={tagFilter} onChange={event => setTagFilter(event.target.value)}><option value="all">{t("Tous les tags")}</option><option value="none">{t("Sans tag")}</option>{tags.map(tag => <option key={tag} value={`tag:${tag}`}>{tag} ({tagCounts.get(tag)})</option>)}</select></label></div>
    <datalist id={tagListId}>{tags.map(tag => <option key={tag} value={tag}/>)}</datalist>
    {selectionMode && <div className="media-tag-bulk"><div className="media-tag-selection"><label><input type="checkbox" disabled={busy || !pages.rows.length} checked={pageSelected} onChange={() => setChecked(current => pageSelected ? current.filter(id => !pages.rows.some(row => row.id === id)) : [...new Set([...current, ...pages.rows.map(row => row.id)])].slice(0, 200))}/>{t("Sélectionner cette page")}</label><strong>{t("{value0} sélectionnée(s)", { value0: checked.length })}</strong><button type="button" className="secondary icon-toggle" disabled={busy || !checked.length} title={t("Vider la sélection")} aria-label={t("Vider la sélection")} onClick={() => setChecked([])}><X size={17}/></button></div><div className="media-tag-bulk-fields"><label>{t("Action sur les tags")}<select disabled={busy} value={bulkOperation} onChange={event => setBulkOperation(event.target.value)}><option value="add">{t("Ajouter")}</option><option value="remove">{t("Retirer")}</option></select></label><label>{t("Tags à appliquer")}<input value={bulkInput} disabled={busy} list={tagListId} maxLength={820} onChange={event => setBulkInput(event.target.value)}/></label><button type="button" disabled={busy || !checked.length || !parseTags(bulkInput).length} onClick={updateTags}><Tags size={17}/>{t("Appliquer les tags")}</button></div></div>}
    {error && <p className="error" role="alert">{t(error)}</p>}{notice && <p role="status">{notice}</p>}
    <div className="media-library-layout"><div>
      {loading ? <p>{t("Chargement…")}</p> : <div className="media-library-grid">{pages.rows.map(row => <article className={`media-library-item ${selected?.id === row.id ? "active" : ""}`} key={row.id}><button type="button" className="media-library-open" aria-pressed={selected?.id === row.id} onClick={() => select(row)}><MediaThumbnail row={row}/><strong title={row.name}>{row.name}</strong><small>{row.width} × {row.height} · {row.mime.replace("image/", "").toUpperCase()}</small><span className="media-item-tags">{(row.tags ?? []).slice(0, 2).map(tag => <span key={tag} title={tag}>{tag}</span>)}{row.tags?.length > 2 && <span title={row.tags.slice(2).join(", ")}>+{row.tags.length - 2}</span>}</span></button>{selectionMode && <label className="media-item-select"><input type="checkbox" disabled={busy || checked.length >= 200 && !checked.includes(row.id)} aria-label={t("Sélectionner {value0}", { value0: row.name })} checked={checked.includes(row.id)} onChange={() => toggleChecked(row.id)}/></label>}</article>)}</div>}
      {!loading && !matches.length && <p>{t("Aucune image.")}</p>}<Pagination {...pages}/>
    </div>{selected && <aside className="media-library-details"><button type="button" className="secondary icon-toggle" title={t("Fermer les détails")} aria-label={t("Fermer les détails")} onClick={() => setSelected(null)}><X size={16}/></button><MediaThumbnail row={selected}/><label>{t("Nom")}<input maxLength={120} value={selected.name} onChange={event => setSelected({ ...selected, name: event.target.value })}/></label><label>{t("Description de l’image")}<textarea maxLength={300} value={selected.alt} onChange={event => setSelected({ ...selected, alt: event.target.value })}/></label><label>{t("Tags séparés par des virgules")}<input value={tagInput} list={tagListId} maxLength={820} onChange={event => setTagInput(event.target.value)}/></label><div className="media-library-actions"><button type="button" disabled={busy} onClick={() => save({ name: selected.name, alt: selected.alt, tags: parseTags(tagInput) })}><Save size={16}/>{t("Enregistrer")}</button>{onSelect && <button type="button" onClick={() => onSelect(selected)}><Check size={16}/>{t("Choisir")}</button>}<button type="button" className="secondary" onClick={() => copy(selected.image)}><Copy size={16}/>{t("Copier le lien")}</button></div><label>{t("Placement Markdown")}<select value={selected.placement || "normal"} onChange={event => setSelected({ ...selected, placement: event.target.value })}><option value="normal">{t("Normal")}</option><option value="left">{t("À gauche du texte")}</option><option value="right">{t("À droite du texte")}</option></select></label><button type="button" className="secondary" onClick={() => copy(`![${(selected.alt || selected.name).replace(/[\[\]\r\n]/g, " ")}](${selected.image}${selected.placement && selected.placement !== "normal" ? ` "float:${selected.placement} width:40%"` : ""})`)}><Copy size={16}/>{t("Copier le Markdown")}</button>{admin && <ConfirmActionButton className="secondary danger-icon" disabled={busy} dialogTitle={t("Archiver cette image ?")} message={t("Elle ne sera plus proposée dans la médiathèque. Les liens déjà publiés restent valides.")} confirmLabel={t("Archiver")} onConfirm={() => save({ archived: true })}><Archive size={16}/>{t("Archiver")}</ConfirmActionButton>}</aside>}</div>
  </section>;
}

export function MediaPicker({ onSelect, onClose }) {
  const { t } = useLocale();
  return <Dialog title={t("Choisir dans la médiathèque")} className="media-picker-dialog" layerClassName="media-picker-layer" onClose={onClose}><MediaLibrary onSelect={onSelect}/></Dialog>;
}
