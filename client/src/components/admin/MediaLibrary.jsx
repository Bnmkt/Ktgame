import { useEffect, useState } from "react";
import { Archive, Check, Copy, ImagePlus, Save, Search } from "lucide-react";
import { api, API_URL } from "../../api.js";
import { useLocale } from "../../locales/LocaleProvider.jsx";
import { Dialog } from "../common/Dialog.jsx";
import { ConfirmActionButton } from "../common/ConfirmAction.jsx";
import { Pagination } from "../feedback/Feedback.jsx";
import { usePagination } from "../common/usePagination.js";
import { copyText } from "../../utils/presentation.jsx";
import "./media-library.css";

export function MediaLibrary({ onSelect, admin = false, onImport, refresh = 0 }) {
  const { t } = useLocale();
  const [rows, setRows] = useState([]), [search, setSearch] = useState(""), [selected, setSelected] = useState(null), [error, setError] = useState(""), [notice, setNotice] = useState(""), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  async function load() { setLoading(true); try { setRows(await api("/api/admin/media")); setError(""); } catch (failure) { setError(failure.message); } finally { setLoading(false); } }
  useEffect(() => { load(); }, [refresh]);
  const matches = rows.filter(row => `${row.name} ${row.alt}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const pages = usePagination(matches, search);
  async function save(input) { setBusy(true); try { const next = await api(`/api/admin/media/${selected.id}`, { method: "PATCH", body: JSON.stringify(input) }); setRows(current => current.map(row => row.id === next.id ? next : row).filter(row => !row.archived)); setSelected(next.archived ? null : next); setNotice(t("Enregistré")); } catch (failure) { setError(failure.message); } finally { setBusy(false); } }
  async function copy(value) { try { await copyText(value); setNotice(t("Copié !")); } catch (failure) { setError(failure.message); } }
  return <section className="media-library card admin-list">
    <header className="admin-section-heading"><div><span className="eyebrow">{t("Contenu")}</span><h2>{t("Médiathèque")}</h2><small>{t("Images publiques réutilisables. Ne joins aucune donnée privée.")}</small></div>{onImport && <button type="button" onClick={onImport}><ImagePlus size={18}/>{t("Importer une image")}</button>}</header>
    <label className="media-search"><Search size={17}/><input aria-label={t("Rechercher une image")} placeholder={t("Rechercher une image")} value={search} onChange={event => setSearch(event.target.value)}/></label>
    {error && <p className="error" role="alert">{t(error)}</p>}{notice && <p role="status">{notice}</p>}
    <div className="media-library-layout"><div>
      {loading ? <p>{t("Chargement…")}</p> : <div className="media-library-grid">{pages.rows.map(row => <button type="button" className={`media-library-item secondary ${selected?.id === row.id ? "active" : ""}`} key={row.id} onClick={() => setSelected(row)}><span className="media-checker"><img src={`${API_URL}${row.image}`} alt={row.alt || row.name} loading="lazy"/></span><strong>{row.name}</strong><small>{row.width} × {row.height} · {row.mime.replace("image/", "").toUpperCase()}</small></button>)}</div>}
      {!loading && !matches.length && <p>{t("Aucune image.")}</p>}<Pagination {...pages}/>
    </div>{selected && <aside className="media-library-details"><div className="media-checker"><img src={`${API_URL}${selected.image}`} alt={selected.alt}/></div><label>{t("Nom")}<input maxLength={120} value={selected.name} onChange={event => setSelected({ ...selected, name: event.target.value })}/></label><label>{t("Description de l’image")}<textarea maxLength={300} value={selected.alt} onChange={event => setSelected({ ...selected, alt: event.target.value })}/></label><div className="media-library-actions"><button type="button" disabled={busy} onClick={() => save({ name: selected.name, alt: selected.alt })}><Save size={16}/>{t("Enregistrer")}</button>{onSelect && <button type="button" onClick={() => onSelect(selected)}><Check size={16}/>{t("Choisir")}</button>}<button type="button" className="secondary" onClick={() => copy(selected.image)}><Copy size={16}/>{t("Copier le lien")}</button></div><label>{t("Placement Markdown")}<select value={selected.placement || "normal"} onChange={event => setSelected({ ...selected, placement: event.target.value })}><option value="normal">{t("Normal")}</option><option value="left">{t("À gauche du texte")}</option><option value="right">{t("À droite du texte")}</option></select></label><button type="button" className="secondary" onClick={() => copy(`![${(selected.alt || selected.name).replace(/[\[\]\r\n]/g, " ")}](${selected.image}${selected.placement && selected.placement !== "normal" ? ` "float:${selected.placement} width:40%"` : ""})`)}><Copy size={16}/>{t("Copier le Markdown")}</button>{admin && <ConfirmActionButton className="secondary danger-icon" disabled={busy} dialogTitle={t("Archiver cette image ?")} message={t("Elle ne sera plus proposée dans la médiathèque. Les liens déjà publiés restent valides.")} confirmLabel={t("Archiver")} onConfirm={() => save({ archived: true })}><Archive size={16}/>{t("Archiver")}</ConfirmActionButton>}</aside>}</div>
  </section>;
}

export function MediaPicker({ onSelect, onClose }) {
  const { t } = useLocale();
  return <Dialog title={t("Choisir dans la médiathèque")} className="media-picker-dialog" layerClassName="media-picker-layer" onClose={onClose}><MediaLibrary onSelect={onSelect}/></Dialog>;
}
