import { useEffect, useRef, useState } from "react";
import { Download, Languages, Plus, RotateCcw, Save, Search, Upload } from "lucide-react";
import { api } from "../../api.js";
import { languages, placeholders } from "../../locales/catalog.js";
import { useLocale } from "../../locales/LocaleProvider.jsx";
import { usePagination } from "../common/usePagination.js";
import { Pagination } from "../feedback/Feedback.jsx";
import { ConfirmActionButton } from "../common/ConfirmAction.jsx";

export function LocaleAdmin() {
  const { t } = useLocale();
  const [language, setLanguage] = useState("en");
  const [document, setDocument] = useState(null);
  const [changes, setChanges] = useState({});
  const [search, setSearch] = useState("");
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [newSource, setNewSource] = useState("");
  const input = useRef(null);
  async function load(code = language) {
    setBusy(true); setError("");
    try { const data = await api(`/api/admin/locales/${code}`); setDocument(data); setChanges({}); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }
  useEffect(() => { let cancelled = false; setBusy(true); setDocument(null); setChanges({}); setError(""); setNotice("");
    api(`/api/admin/locales/${language}`).then((data) => { if (!cancelled) setDocument(data); }).catch((requestError) => { if (!cancelled) setError(requestError.message); }).finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [language]);
  const messages = Object.assign(Object.create(null), document?.messages, changes);
  const sources = document?.sources ?? {};
  const keys = Object.keys(sources);
  const translated = keys.filter((key) => Boolean(messages[key])).length;
  const rows = keys.filter((key) => (!missing || !messages[key]) && `${key} ${messages[key] ?? ""}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const pages = usePagination(rows, `${language}:${missing}:${search}`);
  async function save() {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await api(`/api/admin/locales/${language}`, { method: "PATCH", body: JSON.stringify({ revision: document.revision, messages: changes, allowNew: true }) });
      setDocument(result); setChanges({}); setNotice(t("Traductions enregistrées."));
      window.dispatchEvent(new Event("ktga-locales-updated"));
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ locale: language, messages }, null, 2)], { type: "application/json" }));
    const link = window.document.createElement("a"); link.href = url; link.download = `ktga-${language}.json`; link.click(); URL.revokeObjectURL(url);
  }
  async function importFile(event) {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error(t("Le fichier dépasse 2 Mo."));
      const data = JSON.parse(await file.text());
      if (data.locale && data.locale !== language) throw new Error(t("La langue du fichier ne correspond pas à la langue sélectionnée."));
      const imported = data.messages ?? data;
      if (!imported || typeof imported !== "object" || Array.isArray(imported)) throw new Error(t("Le fichier doit contenir un objet de traductions."));
      for (const [key, value] of Object.entries(imported)) {
        if (!key.trim() || key.length > 12000 || ["__proto__", "prototype", "constructor"].includes(key) || typeof value !== "string" || value.length > 12000 || value && placeholders(value).join() !== placeholders(sources[key] ?? key).join()) throw new Error(t("Texte inconnu ou variables invalides : {key}", { key }));
      }
      setDocument((current) => ({ ...current, sources: { ...current.sources, ...Object.fromEntries(Object.keys(imported).filter((key) => !Object.hasOwn(sources, key)).map((key) => [key, key])) } }));
      setChanges((current) => ({ ...current, ...imported })); setError(""); setNotice(t("Fichier chargé. Enregistre pour appliquer les traductions."));
    } catch (requestError) { setError(requestError.message); }
  }
  const dirty = Boolean(Object.keys(changes).length);
  return <section className="admin-list locale-admin">
    <div className="section-title"><div><span className="eyebrow">{t("Interface du site")}</span><h2><Languages size={22} />{t("Langues et traductions")}</h2></div><button type="button" data-request-feedback="state" aria-busy={busy} disabled={busy || !dirty || !document} onClick={save}><Save size={17}/>{t("Enregistrer")}</button></div>
    {error && <p role="alert" className="error">{t(error)}</p>}{notice && <p role="status" className="success">{notice}</p>}
    <div className="locale-admin-toolbar">
      <label>{t("Langue")}<select disabled={busy || dirty} value={language} onChange={(event) => setLanguage(event.target.value)}>{languages.map((entry) => <option value={entry.code} key={entry.code}>{entry.name}</option>)}</select></label>
      <label><Search size={16}/>{t("Rechercher un texte")}<input type="search" value={search} onChange={(event) => setSearch(event.target.value)}/></label>
      <label><input type="checkbox" checked={missing} onChange={(event) => setMissing(event.target.checked)}/>{t("Traductions manquantes")}</label>
      <button type="button" className="secondary" disabled={!document || busy} onClick={download}><Download size={16}/>{t("Exporter JSON")}</button>
      <button type="button" className="secondary" disabled={!document || busy} onClick={() => input.current.click()}><Upload size={16}/>{t("Importer JSON")}</button>
      <input ref={input} type="file" accept="application/json,.json" hidden onChange={importFile}/>
      <ConfirmActionButton className="secondary" disabled={!dirty || busy} dialogTitle={t("Annuler les modifications ?")} message={t("Les traductions non enregistrées seront perdues.")} confirmLabel={t("Annuler les modifications")} onConfirm={() => load()}><RotateCcw size={16}/>{t("Annuler")}</ConfirmActionButton>
    </div>
    <p className="locale-admin-summary">{t("{translated} / {total} textes traduits", { translated, total: keys.length })} · {t("Une traduction vide utilise le français. Les variables entre accolades doivent être conservées.")}</p>
    <div className="locale-admin-toolbar"><label>{t("Ajouter un texte français")}<input maxLength={12000} value={newSource} onChange={(event) => setNewSource(event.target.value)} /></label><button type="button" className="secondary" disabled={busy || !document || !newSource.trim()} onClick={() => {
      const key = newSource.trim(); if (["__proto__", "constructor", "prototype"].includes(key)) return;
      setDocument((current) => ({ ...current, sources: { ...current.sources, [key]: key } }));
      setChanges((current) => ({ ...current, [key]: current[key] ?? document.messages[key] ?? "" })); setSearch(key); setMissing(false); setNewSource("");
    }}><Plus size={16}/>{t("Ajouter")}</button></div>
    <div className="locale-admin-list" ref={pages.anchor}>{pages.rows.map((key) => <div key={key} className="locale-admin-entry"><p>{sources[key]}</p><label>{t("Traduction")}<textarea disabled={busy} rows={sources[key].length > 150 ? 5 : 2} value={messages[key] ?? ""} placeholder={sources[key]} onChange={(event) => { setChanges((current) => ({ ...current, [key]: event.target.value })); setNotice(""); }}/>{placeholders(sources[key]).length > 0 && <small>{placeholders(sources[key]).join(" · ")}</small>}</label></div>)}</div>
    {!rows.length && !busy && <p className="empty-state">{t("Aucun résultat")}</p>}
    {busy && !document && <p role="status">{t("Chargement…")}</p>}
    <Pagination {...pages} label={t("Pages des traductions")}/>
  </section>;
}
