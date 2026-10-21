import { useEffect, useId, useRef, useState } from "react";
import { Check, Contrast, Copy, Download, Eclipse, Eye, ImagePlus, Layers, Palette, RotateCcw, Save, Square, Trash2, Type, Undo2, Upload } from "lucide-react";
import { api, API_URL } from "../../api.js";
import { DEFAULT_THEME, THEME_FIELDS, THEME_VERSION, contrastRatio, importTheme, normalizeTheme, themeVariables } from "../../features/theme/config.js";
import { useLocale } from "../../locales/LocaleProvider.jsx";
import { ConfirmActionButton } from "../common/ConfirmAction.jsx";
import { GameImageEditor } from "./GameImageEditor.jsx";
import "./theme-editor.css";

const previewEvent = theme => window.dispatchEvent(new CustomEvent("ktga-theme-preview", { detail: theme }));
const groupIcons = { Couleurs: Palette, Surfaces: Layers, Textes: Type, Composants: Square, "Image de fond": ImagePlus, Lisibilité: Contrast, "Ombre du contenu": Eclipse };

export function ThemeEditor({ onApplied, onDirtyChange }) {
  const { t } = useLocale();
  const [library, setLibrary] = useState(null), [selectedId, setSelectedId] = useState(DEFAULT_THEME.id);
  const [group, setGroup] = useState("Couleurs"), [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [globalPreview, setGlobalPreview] = useState(false), [imageOpen, setImageOpen] = useState(false);
  const original = useRef(""), importer = useRef(null);
  const [comparePublished, setComparePublished] = useState(false);
  const selected = selectedId === DEFAULT_THEME.id ? DEFAULT_THEME : library?.themes.find(row => row.id === selectedId) || DEFAULT_THEME;
  const builtIn = selected.id === DEFAULT_THEME.id;
  const dirty = library && JSON.stringify({ themes: library.themes, activeId: library.activeId }) !== original.current;
  useEffect(() => { onDirtyChange?.(Boolean(dirty)); }, [dirty, onDirtyChange]);
  const groups = [...new Set(THEME_FIELDS.map(field => field.group))];
  async function load() {
    setBusy(true);
    try { const next = await api("/api/admin/themes"); setLibrary(next); original.current = JSON.stringify({ themes: next.themes, activeId: next.activeId }); setSelectedId(next.activeId); setError(""); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  useEffect(() => { load(); return () => previewEvent(null); }, []);
  useEffect(() => { previewEvent(globalPreview ? selected : null); }, [globalPreview, selected]);
  useEffect(() => {
    if (!dirty) return;
    const warn = event => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function update(patch) { setLibrary(current => ({ ...current, themes: current.themes.map(row => row.id === selected.id ? { ...row, ...patch } : row) })); setNotice(""); }
  function add(theme = DEFAULT_THEME) {
    if (library.themes.length >= 20) { setError(t("La limite de 20 thèmes est atteinte.")); return; }
    const next = { ...normalizeTheme(theme), id: `theme-${crypto.randomUUID()}`, name: `${theme.name} - copie`.slice(0, 80) };
    setLibrary(current => ({ ...current, themes: [...current.themes, next] })); setSelectedId(next.id); setError(""); setNotice("");
  }
  async function save(apply = false) {
    setBusy(true); setError("");
    try {
      const next = await api("/api/admin/themes", { method: "PUT", body: JSON.stringify({ ...library, activeId: apply ? selected.id : library.activeId, apply }) });
      setLibrary(next); original.current = JSON.stringify({ themes: next.themes, activeId: next.activeId });
      setGlobalPreview(false); previewEvent(null); onApplied?.(next.appearance);
      setNotice(t(apply ? "Thème appliqué au site." : "Thèmes enregistrés sans modifier l'apparence publiée."));
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ version: THEME_VERSION, theme: selected }, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `${selected.id}.json`; link.click(); URL.revokeObjectURL(url);
  }
  async function upload(event) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    try { if (file.size > 50000) throw new Error("Fichier de thème trop volumineux."); add(importTheme(await file.text())); }
    catch (failure) { setError(failure.message); }
  }
  if (!library) return <section className="settings-group"><p role="status">{error || t("Chargement des thèmes...")}</p>{error && <button type="button" onClick={load}>{t("Réessayer")}</button>}</section>;
  const previewTheme = comparePublished ? normalizeTheme(library.appearance) : normalizeTheme(selected);
  const ratios = [["Texte principal", previewTheme.tokens.text, previewTheme.tokens.surface], ["Bouton", previewTheme.tokens.buttonText, previewTheme.tokens.buttonBottom], ["Champs", previewTheme.tokens.inputText, previewTheme.tokens.input]];
  const GroupIcon = groupIcons[group] || Palette;
  return <section className="theme-studio">
    <header className="theme-studio-heading"><div><h3><Palette size={20}/>{t("Thèmes du site")}</h3><span className="muted">{dirty ? t("Modifications non enregistrées") : t("Bibliothèque enregistrée")}</span></div><div className="theme-studio-actions"><ConfirmActionButton className="secondary icon-toggle" disabled={busy || !dirty} title={t("Annuler les modifications")} dialogTitle={t("Annuler les modifications ?")} message={t("Les thèmes enregistrés seront restaurés.")} confirmLabel={t("Annuler les modifications")} onConfirm={async () => { setGlobalPreview(false); await load(); }}><Undo2 size={17}/></ConfirmActionButton><button type="button" className="secondary" disabled={busy || !dirty} onClick={() => save(false)}><Save size={17}/>{t("Enregistrer")}</button><ConfirmActionButton disabled={busy} dialogTitle={t("Appliquer ce thème au site ?")} message={t("Tous les visiteurs verront cette apparence à leur prochain chargement. Le thème original reste disponible.")} confirmLabel={t("Appliquer")} onConfirm={() => save(true)}><Check size={17}/>{t("Appliquer au site")}</ConfirmActionButton></div></header>
    {error && <p className="error" role="alert">{t(error)}</p>}{notice && <p className="theme-studio-notice" role="status">{notice}</p>}
    <div className="theme-library-controls"><label>{t("Thème")}<select value={selected.id} disabled={busy} onChange={event => setSelectedId(event.target.value)}>{[DEFAULT_THEME, ...library.themes].map(row => <option key={row.id} value={row.id}>{row.name}{row.id === library.activeId ? ` (${t("en ligne")})` : ""}</option>)}</select></label><div className="theme-studio-actions"><button type="button" className="secondary" disabled={busy} onClick={() => add(selected)}><Copy size={16}/>{t("Dupliquer")}</button><button type="button" className="secondary icon-toggle" title={t("Exporter le thème")} aria-label={t("Exporter le thème")} onClick={download}><Download size={17}/></button><button type="button" className="secondary icon-toggle" title={t("Importer un thème")} aria-label={t("Importer un thème")} disabled={busy} onClick={() => importer.current?.click()}><Upload size={17}/></button><input hidden type="file" accept="application/json,.json" ref={importer} onChange={upload}/><ConfirmActionButton className="secondary icon-toggle danger-icon" disabled={builtIn || selected.id === library.activeId || busy} title={t("Supprimer ce thème")} dialogTitle={t("Supprimer ce thème ?")} message={selected.name} confirmLabel={t("Supprimer")} danger onConfirm={() => { setLibrary(current => ({ ...current, themes: current.themes.filter(row => row.id !== selected.id) })); setSelectedId(DEFAULT_THEME.id); }}><Trash2 size={17}/></ConfirmActionButton></div></div>
    <div className="theme-identity-row">{builtIn ? <p className="account-admin-notice">{t("Duplique le thème original pour le personnaliser.")}</p> : <label>{t("Nom du thème")}<input value={selected.name} maxLength={80} disabled={busy} onChange={event => update({ name: event.target.value })}/></label>}<span className={`theme-selection-state ${selected.id === library.activeId ? "is-current" : ""}`}>{selected.id === library.activeId ? <Check size={15}/> : <Palette size={15}/>}{t(selected.id === library.activeId ? "en ligne" : "Brouillon")}</span></div>
    <nav className="theme-studio-tabs" aria-label={t("Composants du thème")}>{groups.map(name => {
      const Icon = groupIcons[name] || Palette;
      return <button type="button" key={name} className={`secondary ${group === name ? "active" : ""}`} aria-pressed={group === name} onClick={() => setGroup(name)}><Icon size={18}/><span>{t(name)}</span></button>;
    })}</nav>
    <div className="theme-studio-layout"><div className="theme-studio-fields">
      <header className="theme-section-heading"><h4><GroupIcon size={20}/>{t(group)}</h4><button type="button" className="secondary icon-toggle" disabled={builtIn || busy} title={t("Rétablir cette rubrique")} aria-label={t("Rétablir cette rubrique")} onClick={() => update({ tokens: { ...selected.tokens, ...Object.fromEntries(THEME_FIELDS.filter(field => field.group === group).map(field => [field.key, field.value])) } })}><RotateCcw size={16}/></button></header>
      <fieldset disabled={builtIn || busy} className="theme-token-fields"><legend className="sr-only">{t(group)}</legend>{THEME_FIELDS.filter(field => field.group === group).map(field => {
        const value = selected.tokens[field.key] ?? field.value;
        return <ThemeToken key={field.key} field={field} value={value} onChange={next => update({ tokens: { ...selected.tokens, [field.key]: next } })}/>;
      })}</fieldset>
      {group === "Image de fond" && <div className="theme-background-controls">{selected.backgroundImage && <img src={`${API_URL}${selected.backgroundImage}`} alt=""/>}<div className="theme-studio-actions"><button type="button" className="secondary" disabled={builtIn || busy} onClick={() => setImageOpen(true)}><ImagePlus size={17}/>{t("Choisir une image")}</button><button type="button" className="secondary icon-toggle" disabled={builtIn || !selected.backgroundImage || busy} title={t("Retirer l'image")} aria-label={t("Retirer l'image")} onClick={() => update({ backgroundImage: "" })}><Trash2 size={17}/></button></div></div>}
      {!builtIn && <ConfirmActionButton className="secondary" disabled={busy} dialogTitle={t("Restaurer les valeurs d'origine ?")} message={t("Les couleurs, dimensions et l'image de ce thème seront réinitialisées. Son nom sera conservé.")} confirmLabel={t("Restaurer")} onConfirm={() => update({ tokens: { ...DEFAULT_THEME.tokens }, backgroundImage: "" })}><RotateCcw size={16}/>{t("Valeurs par défaut")}</ConfirmActionButton>}
    </div><aside className="theme-preview"><div className="theme-preview-modes" role="group" aria-label={t("Aperçu du thème")}><button type="button" className={`secondary ${comparePublished ? "active" : ""}`} aria-pressed={comparePublished} onClick={() => setComparePublished(true)}>{t("Version en ligne")}</button><button type="button" className={`secondary ${!comparePublished ? "active" : ""}`} aria-pressed={!comparePublished} onClick={() => setComparePublished(false)}>{t("Modifications")}</button></div><label className="theme-preview-toggle"><input type="checkbox" checked={globalPreview} onChange={event => setGlobalPreview(event.target.checked)}/><Eye size={17}/>{t("Aperçu sur cette page")}</label>
      <ThemeSample theme={previewTheme}/><div className="theme-contrast-list">{ratios.map(([name, foreground, background]) => { const ratio = contrastRatio(foreground, background); return <p key={name}><span>{t(name)}</span><strong className={ratio < 4.5 ? "theme-contrast-low" : ""}>{ratio.toFixed(1)}:1{ratio < 4.5 ? ` - ${t("contraste faible")}` : ""}</strong></p>; })}</div>
    </aside></div>
    {imageOpen && <GameImageEditor gameName={t("Thème du site")} field="coverImage" imageLabel={t("Image de fond")} uploadPath="/api/admin/media" selectableFormat value={selected.backgroundImage} onApply={image => { update({ backgroundImage: image }); setImageOpen(false); }} onClose={() => setImageOpen(false)}/>}
  </section>;
}

function ThemeToken({ field, value, onChange }) {
  const { t } = useLocale();
  const id = useId(), color = typeof field.value === "string";
  const scale = field.percent || field.key === "imageOpacity" ? 100 : 1;
  const display = color ? value.toUpperCase() : String(Math.round(value * scale * 100) / 100);
  const [draft, setDraft] = useState(display);
  useEffect(() => { setDraft(display); }, [display]);
  function edit(next) {
    setDraft(next);
    if (color) { if (/^#[a-f0-9]{6}$/i.test(next)) onChange(next.toLowerCase()); }
    else if (next.trim() && Number.isFinite(Number(next))) {
      const number = Number(next) / scale;
      if (number >= field.min && number <= field.max) onChange(Math.round(number * 100) / 100);
    }
  }
  return <div className="theme-token-field"><div className="theme-token-heading"><label htmlFor={id}>{t(field.label)}</label><button type="button" className="secondary icon-toggle" title={t("Rétablir : {value0}", { value0: t(field.label) })} aria-label={t("Rétablir : {value0}", { value0: t(field.label) })} disabled={value === field.value} onClick={() => onChange(field.value)}><RotateCcw size={14}/></button></div>{color ? <div className="theme-color-field"><input type="color" aria-label={t(field.label)} value={value} onChange={event => onChange(event.target.value)}/><input id={id} className="theme-color-code" value={draft} maxLength={7} spellCheck={false} autoComplete="off" onChange={event => edit(event.target.value)} onBlur={() => setDraft(display)}/></div> : <div className="theme-number-field"><input type="range" aria-label={t(field.label)} min={field.min} max={field.max} step={field.step || 1} value={value} onChange={event => onChange(Number(event.target.value))}/><div className="theme-number-value"><input id={id} type="number" value={draft} min={field.min * scale} max={field.max * scale} step={(field.step || 1) * scale} onChange={event => edit(event.target.value)} onBlur={() => setDraft(display)}/><span>{scale === 100 ? "%" : field.unit || ""}</span></div></div>}</div>;
}

export function ThemeSample({ theme }) {
  const { t } = useLocale();
  return <div className="theme-sample" style={themeVariables(theme, image => `${API_URL}${image}`)}><header><Palette size={19}/><strong>KTGA.ME</strong><span>12 450</span></header><div className="theme-sample-scene" data-theme-wallpaper={Boolean(theme.backgroundImage)}><div className="theme-sample-body"><h3>{t("À quelle table joues-tu ?")}</h3><p>{t("Tes jeux favoris")}</p><article><span className="theme-sample-category">{t("Jeu de dés")} · 2–6 {t("joueurs")}</span><h4>Yahtzee</h4><p>{t("Marque le plus de points après 13 catégories.")}</p><button type="button">{t("Créer une table")}</button><button type="button" className="secondary">{t("Rejoindre")}</button></article><label>{t("Code de la table")}<input readOnly value="KTGA42"/></label><a href="#theme-preview" onClick={event => event.preventDefault()}>{t("Voir les règles")}</a><div className="theme-sample-feedback"><span>{t("Opération réussie")}</span><span>{t("Action indisponible")}</span></div></div></div></div>;
}
