import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Download, ExternalLink, FileArchive, ImagePlus, Link2, Megaphone, Plus, QrCode, RefreshCw, Rss, Save, Search, SearchCheck, Trash2, Undo2, X } from "lucide-react";
import { api, API_URL, getToken } from "../../api.js";
import { useLocale } from "../../locales/LocaleProvider.jsx";
import { campaignUrl, suggestedKit } from "../../features/communication/config.js";
import { copyText } from "../../utils/presentation.jsx";
import { MediaPicker } from "./MediaLibrary.jsx";
import { ConfirmActionButton, ConfirmDialog } from "../common/ConfirmAction.jsx";
import { Pagination } from "../feedback/Feedback.jsx";
import { usePagination } from "../common/usePagination.js";
import { PlatformsAdmin } from "./PlatformsAdmin.jsx";
import { IndexNowPanel } from "./IndexNowPanel.jsx";
import { SeoPageStatus } from "./SeoPageStatus.jsx";
import "./communication-admin.css";

const endpoint = "/api/admin/communication";
const saveFile = (blob, name) => {
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const csv = rows => rows.map(row => row.map(value => `"${String(value ?? "").replace(/^\\s*[=+@-]/, "'$&").replaceAll('"', '""')}"`).join(",")).join("\r\n");

export function CommunicationAdmin({ admin = false }) {
  const { t } = useLocale();
  const [data, setData] = useState(null), [tab, setTab] = useState("kits"), [search, setSearch] = useState("");
  const [kit, setKit] = useState(null), [kitBase, setKitBase] = useState("");
  const [campaign, setCampaign] = useState(null), [campaignBase, setCampaignBase] = useState("");
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [media, setMedia] = useState(false);
  const [seo, setSeo] = useState(null), [filter, setFilter] = useState("all"), [qr, setQr] = useState(null), [confirm, setConfirm] = useState(null);
  const syncIndexNow = useCallback(status => {
    if (status.urls) setSeo(current => current ? { ...current, pages: current.pages.map(row => ({ ...row, indexNow: row.indexable ? status.urls[row.url] ?? { state: "pending" } : { state: "excluded" } })) } : current);
  }, []);
  const kitDirty = Boolean(kit && JSON.stringify(kit) !== kitBase), campaignDirty = Boolean(campaign && JSON.stringify(campaign) !== campaignBase);
  const dirty = kitDirty || campaignDirty;
  const collection = tab === "kits" ? data?.kits ?? [] : data?.campaigns ?? [];
  const matching = collection.filter(row => `${row.name} ${row.locale ?? ""} ${row.source ?? ""} ${row.campaign ?? ""}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const pagination = usePagination(matching, `${tab}:${search}`, 20);
  const seoRows = usePagination((seo?.pages ?? []).filter(row => `${row.title} ${row.path}`.toLowerCase().includes(search.toLowerCase()) && (filter === "all" || filter === "suggestions" && row.suggestions.length || filter === "indexable" && row.indexable)), `${search}:${filter}`, 20);
  async function load() {
    const next = await api(endpoint); setData(next); return next;
  }
  useEffect(() => { let active = true; api(endpoint).then(value => { if (active) setData(value); }).catch(failure => { if (active) setError(failure.message); }); return () => { active = false; }; }, []);
  useEffect(() => {
    if (!dirty) return;
    const protect = event => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", protect); return () => window.removeEventListener("beforeunload", protect);
  }, [dirty]);
  useEffect(() => {
    setQr(null);
    if (!campaign || !data) return;
    const controller = new AbortController();
    const timer = setTimeout(() => api(`${endpoint}/qr`, { method: "POST", background: true, signal: controller.signal, body: JSON.stringify({ ...campaign, format: "svg" }) }).then(value => { if (!controller.signal.aborted) setQr(value); }).catch(failure => { if (!controller.signal.aborted) setQr({ error: failure.message }); }), 650);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [campaign, data?.site.website]);
  async function run(action) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  function protect(action, changed = dirty) { if (changed) setConfirm(() => action); else action(); }
  function acceptKit(value) { setKit(value); setKitBase(JSON.stringify(value)); }
  function acceptCampaign(value) { setCampaign(value); setCampaignBase(JSON.stringify(value)); }
  function create() {
    if (tab === "kits") { setKit(suggestedKit(data.site)); setKitBase(""); }
    else { setCampaign({ name: "", destination: data.destinations[0]?.url || data.site.website, source: "", medium: "qr", campaign: "", content: "", notes: "", color: "#102820" }); setCampaignBase(""); }
    setError(""); setNotice("");
  }
  async function open(row) {
    await run(async () => { const value = await api(`${endpoint}/${tab}/${row.id}`); if (tab === "kits") acceptKit(value); else acceptCampaign(value); });
  }
  async function save() {
    await run(async () => {
      const value = tab === "kits" ? kit : campaign;
      const saved = await api(`${endpoint}/${tab}${value.id ? `/${value.id}` : ""}`, { method: value.id ? "PUT" : "POST", body: JSON.stringify(value) });
      if (tab === "kits") acceptKit(saved); else acceptCampaign(saved);
      await load(); setNotice(t("Document enregistré."));
    });
  }
  async function remove() {
    const value = tab === "kits" ? kit : campaign;
    await api(`${endpoint}/${tab}/${value.id}`, { method: "DELETE", body: JSON.stringify({ revision: value.revision }) });
    if (tab === "kits") { setKit(null); setKitBase(""); } else { setCampaign(null); setCampaignBase(""); }
    await load(); setNotice(t("Document supprimé."));
  }
  async function copy(value) { try { await copyText(value); setNotice(t("Copié !")); } catch (failure) { setError(failure.message); } }
  async function exportKit() {
    await run(async () => {
      const response = await fetch(`${API_URL}${endpoint}/kits/${kit.id}/export`, { credentials: "include", headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {} });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || t("Export impossible."));
      saveFile(await response.blob(), `ktga-kit-${kit.locale}.zip`);
      setNotice(t("Kit presse téléchargé."));
    });
  }
  async function exportQr(format) {
    await run(async () => {
      const result = await api(`${endpoint}/qr`, { method: "POST", body: JSON.stringify({ ...campaign, format }) });
      saveFile(format === "svg" ? new Blob([result.content], { type: "image/svg+xml" }) : new Blob([Uint8Array.from(atob(result.content), c => c.charCodeAt(0))], { type: "image/png" }), `ktga-qr.${format}`);
    });
  }
  async function audit() { await run(async () => setSeo(await api(`${endpoint}/seo`))); }
  async function inspectGoogle(row) {
    await run(async () => {
      const result = await api(`${endpoint}/google/inspect`, { method: "POST", body: JSON.stringify({ url: row.url }) });
      setSeo(current => ({ ...current, pages: current.pages.map(page => page.url === row.url ? { ...page, google: result.google } : page) }));
    });
  }
  function switchTab(next) { setTab(next); setSearch(""); setError(""); setNotice(""); if (next === "seo" && !seo) audit(); }
  const value = tab === "kits" ? kit : campaign, changed = tab === "kits" ? kitDirty : campaignDirty;
  let link = "";
  try { if (campaign && data) link = campaignUrl(campaign, data.site.website); } catch { /* The QR preview displays the validation error. */ }
  const updateKit = patch => setKit(current => ({ ...current, ...patch }));
  const updateCampaign = patch => setCampaign(current => ({ ...current, ...patch }));
  const field = (label, key, max, multiline = false) => <label>{t(label)}{multiline ? <textarea rows={key === "longDescription" ? 9 : 4} maxLength={max} value={kit[key]} disabled={busy} onChange={event => updateKit({ [key]: event.target.value })}/> : <input type={key === "contactEmail" ? "email" : "text"} maxLength={max} value={kit[key]} disabled={busy} onChange={event => updateKit({ [key]: event.target.value })}/>}</label>;
  if (!data) return <section className="card comms-studio"><p role={error ? "alert" : "status"}>{error || t("Chargement…")}</p>{error && <button type="button" onClick={() => run(load)}><RefreshCw size={17}/>{t("Réessayer")}</button>}</section>;
  return <section className="card comms-studio">
    <header className="admin-section-heading"><div><span className="eyebrow">{t("Communication")}</span><h2>{t("Faire connaître KTGA")}</h2></div>{["kits", "campaigns"].includes(tab) && <button type="button" disabled={busy} onClick={() => protect(create, changed)}><Plus size={17}/>{t(tab === "kits" ? "Nouveau kit" : "Nouveau lien")}</button>}</header>
    <nav className="comms-tabs" aria-label={t("Outils de communication")}>{[["kits", "Kits presse", FileArchive], ["campaigns", "Liens et QR codes", QrCode], ["platforms", "Plateformes", ExternalLink], ["seo", "Référencement", SearchCheck]].map(([id, label, Icon]) => <button type="button" className={tab === id ? "active" : "secondary"} aria-pressed={tab === id} disabled={busy} key={id} onClick={() => switchTab(id)}><Icon size={18}/>{t(label)}</button>)}</nav>
    {error && <p className="error" role="alert">{t(error)}</p>}{notice && <p className="success" role="status">{notice}</p>}
    {tab === "platforms" ? <PlatformsAdmin admin={admin}/> : tab !== "seo" ? <div className="comms-workspace">
      <aside className="comms-library"><label className="comms-search"><Search size={17}/><input type="search" aria-label={t("Rechercher un document")} placeholder={t("Rechercher")} value={search} onChange={event => setSearch(event.target.value)}/></label><div className="comms-records">{pagination.rows.map(row => <button type="button" key={row.id} className={value?.id === row.id ? "active" : "secondary"} disabled={busy} onClick={() => protect(() => open(row), changed)}><span>{row.name}</span><small>{tab === "kits" ? `${row.locale.toUpperCase()} · ${row.assetCount} ${t("visuels")}` : `${row.source || "KTGA"} · ${row.medium || "direct"}`}</small></button>)}</div>{!matching.length && <p className="muted">{t(tab === "kits" ? "Aucun kit presse." : "Aucun lien de campagne.")}</p>}{pagination.totalPages > 1 && <Pagination {...pagination}/>}</aside>
      {value ? <div className="comms-document"><div className="comms-document-actions"><div><strong>{value.name || t("Nouveau document")}</strong><small>{t(changed ? "Modifications non enregistrées" : "Enregistré")}</small></div><button type="button" disabled={busy || !changed} onClick={save}><Save size={17}/>{t("Enregistrer")}</button><button type="button" className="secondary icon-toggle" disabled={busy || !changed} title={t("Annuler les modifications")} aria-label={t("Annuler les modifications")} onClick={() => protect(() => { if (tab === "kits") { setKit(kitBase ? JSON.parse(kitBase) : null); } else setCampaign(campaignBase ? JSON.parse(campaignBase) : null); }, changed)}><Undo2 size={17}/></button>{admin && value.id && <ConfirmActionButton className="secondary icon-toggle danger-icon" disabled={busy} title={t("Supprimer")} aria-label={t("Supprimer")} dialogTitle={t("Supprimer ce document ?")} message={value.name} confirmLabel={t("Supprimer")} danger onConfirm={remove}><Trash2 size={17}/></ConfirmActionButton>}</div>
        {tab === "kits" ? <div className="comms-compose"><div className="comms-fields">
          <div className="comms-field-pair">{field("Nom du kit", "name", 100)}<label>{t("Langue du kit")}<select value={kit.locale} disabled={busy} onChange={event => updateKit({ locale: event.target.value })}><option value="fr">Français</option><option value="en">English</option></select></label></div>
          {field("Titre public", "title", 120)}{field("Accroche", "tagline", 180)}{field("Présentation courte", "shortDescription", 500, true)}{field("Présentation détaillée", "longDescription", 16000, true)}{field("Points clés", "highlights", 3000, true)}
          <div className="comms-field-pair">{field("Contact presse", "contactName", 120)}{field("Email de contact", "contactEmail", 254)}</div>{field("Crédits et conditions de réutilisation", "usageRights", 3000, true)}
          <section className="comms-assets"><header><h3>{t("Visuels du kit")}</h3><button type="button" className="secondary" disabled={busy || kit.assets.length >= 12} onClick={() => setMedia(true)}><ImagePlus size={17}/>{t("Ajouter un visuel")}</button></header>{kit.assets.map((asset, index) => { const row = data.media?.[asset.id]; return <article key={asset.id}>{row && <img src={`${API_URL}${row.image}`} alt={asset.caption || row.name}/>}<div><label>{t("Légende")}<input maxLength={200} value={asset.caption} onChange={event => updateKit({ assets: kit.assets.map((entry, n) => n === index ? { ...entry, caption: event.target.value } : entry) })}/></label><label>{t("Crédit du visuel")}<input maxLength={200} value={asset.credit} onChange={event => updateKit({ assets: kit.assets.map((entry, n) => n === index ? { ...entry, credit: event.target.value } : entry) })}/></label></div><button type="button" className="secondary icon-toggle" title={t("Retirer le visuel")} aria-label={t("Retirer le visuel")} onClick={() => updateKit({ assets: kit.assets.filter(entry => entry.id !== asset.id) })}><X size={17}/></button></article>; })}</section>
        </div><aside className="comms-preview"><span className="eyebrow">{t("Aperçu du kit")}</span><h3>{kit.title}</h3><p>{kit.tagline}</p><strong>{kit.shortDescription}</strong><p className="comms-prose">{kit.longDescription}</p><ul>{kit.highlights.split("\n").filter(Boolean).map((line, index) => <li key={index}>{line}</li>)}</ul><p>{kit.contactName}<br/>{kit.contactEmail}</p><a href={data.site.website} target="_blank" rel="noopener noreferrer">{data.site.siteName}</a><div className="comms-export-actions"><button type="button" disabled={busy || !kit.id || kitDirty} onClick={exportKit}><Download size={17}/>{t("Télécharger le kit ZIP")}</button><button type="button" className="secondary" onClick={() => copy([kit.title, kit.tagline, kit.shortDescription, kit.longDescription, kit.highlights, kit.contactName, kit.contactEmail, data.site.website].filter(Boolean).join("\n\n"))}><Copy size={17}/>{t("Copier les textes")}</button></div></aside></div>
        : <div className="comms-compose"><div className="comms-fields"><label>{t("Nom du lien")}<input maxLength={100} value={campaign.name} onChange={event => updateCampaign({ name: event.target.value })}/></label><label>{t("Page de destination")}<select value={campaign.destination} onChange={event => updateCampaign({ destination: event.target.value })}>{data.destinations.map(page => <option key={page.url} value={page.url}>{page.title}</option>)}</select></label><label>{t("Support")}<select value={campaign.medium} onChange={event => updateCampaign({ medium: event.target.value })}>{["qr", "email", "partner", "print", "referral", "other"].map(medium => <option key={medium} value={medium}>{t(({ qr: "QR code", email: "Email", partner: "Partenaire", print: "Imprimé", referral: "Recommandation", other: "Autre" })[medium])}</option>)}</select></label>{[["source", "Source"], ["campaign", "Campagne"], ["content", "Variante"]].map(([key, label]) => <label key={key}>{t(label)}<input value={campaign[key]} maxLength={80} placeholder={key === "source" ? "club-de-jeux" : key === "campaign" ? "beta-2026" : "affiche-a"} onChange={event => updateCampaign({ [key]: event.target.value })}/></label>)}<label>{t("Couleur du QR code")}<input type="color" value={campaign.color} onChange={event => updateCampaign({ color: event.target.value })}/></label><label>{t("Notes internes")}<textarea rows={4} maxLength={1500} value={campaign.notes} onChange={event => updateCampaign({ notes: event.target.value })}/></label><label>{t("Lien généré")}<textarea aria-label={t("Lien généré")} rows={4} readOnly value={link}/></label><button type="button" className="secondary" disabled={!link} onClick={() => copy(link)}><Copy size={17}/>{t("Copier le lien")}</button></div><aside className="comms-preview comms-qr-preview"><span className="eyebrow">{t("Aperçu du QR code")}</span>{qr?.content ? <img src={`data:image/svg+xml,${encodeURIComponent(qr.content)}`} width="280" height="280" alt={t("QR code de la campagne")}/> : <div className="comms-qr-placeholder"><QrCode size={64}/></div>}{qr?.error && <p className="error" role="alert">{t(qr.error)}</p>}<strong>{campaign.name}</strong><a href={link || undefined} target="_blank" rel="noopener noreferrer">{t("Ouvrir la destination")}<ExternalLink size={15}/></a><div className="comms-export-actions"><button type="button" disabled={busy || !qr?.content} onClick={() => exportQr("png")}><Download size={17}/>PNG · HD</button><button type="button" className="secondary" disabled={busy || !qr?.content} onClick={() => exportQr("svg")}><Download size={17}/>SVG</button></div></aside></div>}
      </div> : <div className="comms-empty"><Megaphone size={42}/><h3>{t(tab === "kits" ? "Ton prochain kit presse" : "Un lien pour chaque support")}</h3><button type="button" onClick={create}><Plus size={17}/>{t(tab === "kits" ? "Créer un kit presse" : "Créer un lien")}</button></div>}
    </div> : <div className="comms-seo"><div className="comms-resource-links">{[["Sitemap", seo?.sitemap], ["Robots.txt", seo?.robots], ["Flux RSS", new URL("rss.xml", data.site.website.replace(/\/?$/, "/")).href]].map(([label, url]) => <article key={label}><span>{label === "Flux RSS" ? <Rss size={20}/> : <Link2 size={20}/>}<strong>{t(label)}</strong></span><a href={url} target="_blank" rel="noopener noreferrer">{url}<ExternalLink size={15}/></a><button type="button" className="secondary icon-toggle" disabled={!url} title={t("Copier le lien")} aria-label={t("Copier le lien")} onClick={() => copy(url)}><Copy size={16}/></button></article>)}</div>
      <IndexNowPanel admin={admin} onStatus={syncIndexNow}/><div className="comms-seo-heading"><h3>{t("Pages publiques")}</h3><div className="comms-export-actions"><button type="button" className="secondary" disabled={busy} onClick={audit}><RefreshCw size={17}/>{t("Actualiser le bilan")}</button><button type="button" className="secondary" disabled={!seo} onClick={() => saveFile(new Blob(["\ufeff" + csv([["URL", "Titre", "Description", "Indexation", "Suggestions"], ...seo.pages.map(row => [row.url, row.title, row.description, row.robots, row.suggestions.join(" | ")])])], { type: "text/csv;charset=utf-8" }), "ktga-referencement.csv")}><Download size={17}/>CSV</button></div></div>
      <div className="comms-seo-filters"><label className="comms-search"><Search size={17}/><input type="search" aria-label={t("Rechercher une page")} value={search} onChange={event => setSearch(event.target.value)}/></label><label>{t("Afficher")}<select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">{t("Toutes les pages")}</option><option value="suggestions">{t("Avec des suggestions")}</option><option value="indexable">{t("Indexables")}</option></select></label></div>
      {seo && <><div className="comms-seo-list">{seoRows.rows.map(row => <article key={row.url}><div className="comms-seo-result"><a href={row.url} target="_blank" rel="noopener noreferrer">{row.url}</a><SeoPageStatus indexNow={row.indexNow} google={row.google} googleConsoleUrl={seo.google?.consoleUrl} canInspectGoogle={seo.google?.configured} busy={busy} onInspectGoogle={() => inspectGoogle(row)}/><h4>{row.title}</h4><p>{row.description}</p></div><div><span className="status-badge">{t(row.indexable ? "Indexable" : "Non indexable")}</span><ul>{row.suggestions.map(note => <li key={note}>{t(note)}</li>)}</ul>{!row.suggestions.length && <span className="comms-check"><Check size={16}/>{t("Aucune suggestion")}</span>}</div><button type="button" className="secondary icon-toggle" title={t("Copier la fiche")} aria-label={t("Copier la fiche")} onClick={() => copy(`${row.url}\n${row.title}\n${row.description}`)}><Copy size={17}/></button></article>)}</div><Pagination {...seoRows}/></>}
      <div className="comms-service-links"><a href="https://search.google.com/search-console" target="_blank" rel="noopener noreferrer">Google Search Console<ExternalLink size={16}/></a><a href="https://www.bing.com/webmasters/" target="_blank" rel="noopener noreferrer">Bing Webmaster Tools<ExternalLink size={16}/></a></div>
    </div>}
    {media && <MediaPicker onClose={() => setMedia(false)} onSelect={row => { setMedia(false); setData(current => ({ ...current, media: { ...current.media, [row.id]: row } })); updateKit({ assets: kit.assets.some(asset => asset.id === row.id) ? kit.assets : [...kit.assets, { id: row.id, caption: row.alt || row.name, credit: "" }] }); }}/>}
    {confirm && <ConfirmDialog title={t("Annuler les modifications ?")} message={t("Les modifications non enregistrées de ce document seront perdues.")} confirmLabel={t("Continuer")} onConfirm={confirm} onClose={() => setConfirm(null)}/>}
  </section>;
}
