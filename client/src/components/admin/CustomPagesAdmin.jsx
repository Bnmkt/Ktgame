import { useEffect, useState } from "react";
import { ArrowLeft, Code2, ExternalLink, Eye, FilePlus2, FileText, ImagePlus, Save, Search, Send, Trash2, Undo2 } from "lucide-react";
import { api } from "../../api.js";
import { appPath } from "../../navigation/routes.js";
import { useLocale } from "../../locales/LocaleProvider.jsx";
import { CodeEditor } from "../common/CodeEditor.jsx";
import { ConfirmActionButton } from "../common/ConfirmAction.jsx";
import { MediaPicker } from "./MediaLibrary.jsx";
import { Pagination } from "../feedback/Feedback.jsx";
import { usePagination } from "../common/usePagination.js";
import { CustomPageContent } from "../../pages/CustomPage.jsx";
import "./custom-pages-admin.css";

const slugify = value => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80).replace(/-$/, "");
const attribute = value => String(value).replace(/[&<>"']/g, character => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[character]);

export function CustomPagesAdmin() {
  const { t } = useLocale();
  const [rows, setRows] = useState([]), [search, setSearch] = useState("");
  const [draft, setDraft] = useState(null), [baseline, setBaseline] = useState("");
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [tab, setTab] = useState("content"), [media, setMedia] = useState(false), [slugTouched, setSlugTouched] = useState(false);
  const [rendered, setRendered] = useState({ html:"", pending:false, error:"" });
  const dirty = Boolean(draft && JSON.stringify(draft) !== baseline);
  const matches = rows.filter(row => `${row.title} ${row.slug}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const pages = usePagination(matches, search, 12);
  async function load() {
    setLoading(true);
    try { setRows(await api("/api/admin/pages")); }
    catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!dirty) return;
    const protect = event => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirty]);
  useEffect(() => {
    if (draft?.format !== "html") { setRendered({ html:"", pending:false, error:"" }); return; }
    const controller = new AbortController();
    setRendered(previous => ({ ...previous, pending:true, error:"" }));
    const timer = setTimeout(() => api("/api/admin/pages/preview", { method:"POST", background:true, deduplicate:false, signal:controller.signal, body:JSON.stringify({ content:draft.content }) })
      .then(value => { if (!controller.signal.aborted) setRendered({ html:value.html, pending:false, error:"" }); })
      .catch(failure => { if (!controller.signal.aborted) setRendered({ html:"", pending:false, error:failure.message }); }), 400);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [draft?.format, draft?.content]);
  const update = (key, value) => setDraft(previous => ({ ...previous, [key]:value }));
  const changed = () => window.dispatchEvent(new Event("ktga-pages-updated"));
  function accept(value) { setDraft(value); setBaseline(JSON.stringify(value)); setSlugTouched(Boolean(value.id)); setError(""); }
  async function open(row) {
    setBusy(true); setNotice("");
    try { accept(await api(`/api/admin/pages/${row.id}`)); setTab("content"); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  function create() {
    let slug = "nouvelle-page", number = 2;
    while (rows.some(row => row.slug === slug || row.liveSlug === slug)) slug = `nouvelle-page-${number++}`;
    const value = { title:t("Nouvelle page"), slug, description:"", format:"markdown", content:`## ${t("Bienvenue")}\n\n`, showFooter:false, footerLabel:"", indexable:true, position:0 };
    setDraft(value); setBaseline(""); setSlugTouched(false); setTab("content"); setError(""); setNotice("");
  }
  async function save(publish) {
    setBusy(true); setError(""); setNotice("");
    try {
      const saved = await api(draft.id ? `/api/admin/pages/${draft.id}` : "/api/admin/pages", { method:draft.id ? "PUT" : "POST", body:JSON.stringify({ ...draft, publish }) });
      accept(saved); setNotice(t(publish ? "Page publiée." : "Brouillon enregistré.")); changed(); await load();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  async function unpublish() {
    setBusy(true); setError("");
    try { accept(await api(`/api/admin/pages/${draft.id}/unpublish`, { method:"POST", body:JSON.stringify({ revision:draft.revision }) })); setNotice(t("Page dépubliée.")); changed(); await load(); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setError("");
    try { await api(`/api/admin/pages/${draft.id}`, { method:"DELETE", body:JSON.stringify({ revision:draft.revision }) }); setDraft(null); setNotice(t("Page supprimée.")); changed(); await load(); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  function insertImage(image) {
    const text = draft.format === "html" ? `<img src="${attribute(image.image)}" alt="${attribute(image.alt || image.name)}">` : `![${(image.alt || image.name).replace(/[\[\]\r\n]/g," ")}](${image.image})`;
    update("content", `${draft.content}\n\n${text}\n`); setMedia(false);
  }
  const feedback = <>{error && <p className="error" role="alert">{t(error)}</p>}{notice && <p className="success" role="status">{notice}</p>}</>;
  if (!draft) return <section className="custom-pages-studio"><header className="admin-section-heading"><div><span className="eyebrow">{t("Contenu")}</span><h2>{t("Pages personnalisées")}</h2></div><button type="button" onClick={create} disabled={busy}><FilePlus2 size={18}/>{t("Nouvelle page")}</button></header>{feedback}<label className="custom-pages-search"><Search size={17}/><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={t("Rechercher une page")} aria-label={t("Rechercher une page")}/></label>{loading ? <p role="status">{t("Chargement…")}</p> : <div className="custom-pages-list">{pages.rows.map(row => <article key={row.id}><FileText size={21}/><div><h3>{row.title}</h3><small>{appPath("page", row.slug)} · {row.format === "html" ? "HTML" : "Markdown"}</small></div><span className={`status-badge ${row.status === "published" ? "status-active" : ""}`}>{t(row.status === "published" ? "Publié" : "Brouillon")}{row.hasChanges && ` · ${t("Modifications en attente")}`}</span><button type="button" className="secondary" disabled={busy} onClick={() => open(row)}>{t("Modifier")}</button></article>)}{!matches.length && <p>{t("Aucune page personnalisée.")}</p>}</div>}<Pagination {...pages} label={t("Pages")}/></section>;
  const preview = { ...draft, html:rendered.html };
  return <section className="custom-pages-studio"><header className="admin-section-heading"><div><span className="eyebrow">{t("Pages personnalisées")}</span><h2>{draft.title || t("Nouvelle page")}</h2></div><div className="custom-pages-actions"><button type="button" disabled={busy} className="secondary" onClick={() => save(false)}><Save size={17}/>{t("Enregistrer le brouillon")}</button><button type="button" disabled={busy} onClick={() => save(true)}><Send size={17}/>{t("Publier")}</button>{dirty ? <ConfirmActionButton className="secondary" disabled={busy} dialogTitle={t("Annuler les modifications ?")} message={t("Les modifications non enregistrées seront perdues.")} confirmLabel={t("Annuler les modifications")} onConfirm={() => setDraft(null)}><Undo2 size={17}/>{t("Annuler")}</ConfirmActionButton> : <button type="button" disabled={busy} className="secondary" onClick={() => setDraft(null)}><ArrowLeft size={17}/>{t("Retour")}</button>}</div></header>{feedback}<div className="custom-page-fields"><label>{t("Titre")}<input maxLength={120} value={draft.title} onChange={event => { const title = event.target.value; setDraft(previous => ({ ...previous, title, ...(!slugTouched ? { slug:slugify(title) } : {}) })); }}/></label><label>{t("URL de la page")}<span className="custom-page-slug"><span>/pages/</span><input maxLength={80} value={draft.slug} onChange={event => { setSlugTouched(true); update("slug",event.target.value); }}/></span></label></div><nav className="custom-pages-tabs" aria-label={t("Édition de la page")}>{[["content","Contenu",Code2],["settings","Réglages",FileText],["preview","Aperçu",Eye]].map(([key,label,Icon]) => <button key={key} type="button" className={tab === key ? "active" : "secondary"} aria-pressed={tab === key} onClick={() => setTab(key)}><Icon size={17}/>{t(label)}</button>)}{draft.id && <a href={`${appPath("page",draft.slug)}?preview=${encodeURIComponent(draft.id)}`} target="_blank" rel="noopener noreferrer"><Eye size={16}/>{t("Ouvrir le brouillon")}</a>}{draft.liveSlug && <a href={appPath("page",draft.liveSlug)} target="_blank" rel="noopener noreferrer"><ExternalLink size={16}/>{t("Voir en ligne")}</a>}</nav>
    <div className={`custom-pages-workspace ${tab === "preview" ? "custom-pages-preview-only" : ""}`}>
      {tab === "content" && <div className="custom-pages-editor"><div className="custom-pages-editor-tools"><div role="group" aria-label={t("Format")}><button type="button" className={draft.format === "markdown" ? "active" : "secondary"} aria-pressed={draft.format === "markdown"} onClick={() => update("format","markdown")}><FileText size={16}/>Markdown</button><button type="button" className={draft.format === "html" ? "active" : "secondary"} aria-pressed={draft.format === "html"} onClick={() => update("format","html")}><Code2 size={16}/>HTML</button></div><button type="button" className="secondary icon-toggle" title={t("Choisir dans la médiathèque")} aria-label={t("Choisir dans la médiathèque")} onClick={() => setMedia(true)}><ImagePlus size={18}/></button></div><CodeEditor language={draft.format} label={t("Contenu de la page")} value={draft.content} onChange={value => update("content",value)} maxLength={150000} height={520}/>{draft.format === "html" && <small className="custom-pages-html-note">{t("Les scripts, formulaires et contenus actifs sont retirés du HTML.")}</small>}</div>}
      {tab === "settings" && <div className="custom-page-options"><label>{t("Description")}<textarea rows={4} maxLength={280} value={draft.description} onChange={event => update("description",event.target.value)}/></label><label className="custom-page-check"><input type="checkbox" checked={draft.showFooter} onChange={event => update("showFooter",event.target.checked)}/>{t("Afficher un lien dans le footer")}</label>{draft.showFooter && <><label>{t("Texte du lien")}<input maxLength={60} value={draft.footerLabel} placeholder={draft.title} onChange={event => update("footerLabel",event.target.value)}/></label><label>{t("Ordre d’affichage")}<input type="number" min={0} max={999} value={draft.position} onChange={event => update("position",Number(event.target.value))}/></label></>}<label className="custom-page-check"><input type="checkbox" checked={draft.indexable} onChange={event => update("indexable",event.target.checked)}/>{t("Autoriser l’indexation par les moteurs de recherche")}</label>{draft.status === "published" && <ConfirmActionButton className="secondary" disabled={busy} dialogTitle={t("Dépublier cette page ?")} message={t("Elle ne sera plus accessible publiquement. Le brouillon sera conservé.")} confirmLabel={t("Dépublier")} onConfirm={unpublish}>{t("Dépublier")}</ConfirmActionButton>}{draft.id && <ConfirmActionButton className="danger-button" disabled={busy} dialogTitle={t("Supprimer cette page ?")} message={t("Le brouillon et la version publiée seront supprimés.")} confirmLabel={t("Supprimer")} danger onConfirm={remove}><Trash2 size={17}/>{t("Supprimer")}</ConfirmActionButton>}</div>}
      <aside className="custom-pages-preview" aria-label={t("Aperçu de la page")} aria-busy={rendered.pending}><span className="eyebrow"><Eye size={15}/>{t("Aperçu")}{rendered.pending && ` · ${t("Chargement…")}`}</span><h1>{draft.title}</h1>{rendered.error ? <p className="error">{rendered.error}</p> : <CustomPageContent page={preview}/>}</aside>
    </div>{media && <MediaPicker onSelect={insertImage} onClose={() => setMedia(false)}/>}</section>;
}
