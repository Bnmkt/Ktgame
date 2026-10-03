import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, BookOpen, Check, Eye, FileText, HelpCircle, ImagePlus, Plus, Save, Trash2 } from "lucide-react";
import { api } from "../../api.js";
import { ConfirmActionButton } from "../common/ConfirmAction.jsx";
import { HelpArticle } from "../help/HelpContent.jsx";

export function HelpAdmin({ reportError, notifySuccess }) {
  const [document, setDocument] = useState(null);
  const [kind, setKind] = useState("faq");
  const [selectedId, setSelectedId] = useState("");
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState("");
  useEffect(() => {
    let cancelled = false;
    api("/api/admin/help").then((data) => { if (!cancelled) { setDocument(data); setSelectedId(data.entries.find((entry) => entry.kind === "faq")?.id ?? ""); } }).catch((error) => reportError(error.message));
    return () => { cancelled = true; };
  }, [reportError]);
  const entries = document?.entries.filter((entry) => entry.kind === kind) ?? [];
  const selected = entries.find((entry) => entry.id === selectedId) ?? entries[0];
  const update = (fields, id = selected?.id) => setDocument((current) => ({ ...current, entries: current.entries.map((entry) => entry.id === id ? { ...entry, ...fields } : entry) }));
  function changeKind(value) { setKind(value); setSelectedId(document.entries.find((entry) => entry.kind === value)?.id ?? ""); }
  function add() {
    const entry = { id: crypto.randomUUID(), kind, category: "Général", title: kind === "faq" ? "Nouvelle question" : "Nouvelle étape", body: "À compléter.", image: "", imageAlt: "", published: false };
    setDocument((current) => {
      const all = [...current.entries];
      const index = all.findIndex((row) => row.id === selected?.id);
      all.splice(index < 0 ? all.length : index + 1, 0, entry);
      return { ...current, entries: all };
    });
    setSelectedId(entry.id); setPreview(false);
  }
  function move(delta) {
    const next = entries[entries.findIndex((entry) => entry.id === selected.id) + delta];
    if (!next) return;
    setDocument((current) => {
      const all = [...current.entries];
      const a = all.findIndex((entry) => entry.id === selected.id), b = all.findIndex((entry) => entry.id === next.id);
      [all[a], all[b]] = [all[b], all[a]];
      return { ...current, entries: all };
    });
  }
  async function save() {
    if (busy) return;
    setBusy("save"); reportError("");
    try {
      setDocument(await api("/api/admin/help", { method: "PUT", body: JSON.stringify(document) }));
      notifySuccess("FAQ et guide enregistrés.");
    } catch (error) { reportError(error.message); }
    finally { setBusy(""); }
  }
  async function upload(event) {
    const file = event.target.files?.[0], id = selected?.id;
    if (!file || !id) return;
    if (file.size > 3 * 1024 * 1024) { reportError("L’image ne peut pas dépasser 3 Mo."); event.target.value = ""; return; }
    setBusy("image"); reportError("");
    try {
      const result = await api("/api/admin/help/images", { method: "POST", headers: { "Content-Type": file.type }, body: file });
      update({ image: result.image, imageAlt: file.name.replace(/\.[^.]+$/, "") }, id);
    } catch (error) { reportError(error.message); }
    finally { setBusy(""); event.target.value = ""; }
  }
  if (!document) return <p role="status">Chargement de l’éditeur d’aide…</p>;
  return <section className="player-help-editor">
    <header className="player-help-editor-toolbar"><div><span className="eyebrow">Contenu public</span><h2>FAQ et guide du joueur</h2></div><button type="button" disabled={Boolean(busy)} onClick={save}><Save size={18} />{busy === "save" ? "Enregistrement…" : "Enregistrer"}</button></header>
    <fieldset className="player-help-control-scope" disabled={Boolean(busy)}>
    <div className="segmented-tabs"><button type="button" className={kind === "faq" ? "active" : ""} onClick={() => changeKind("faq")}><HelpCircle size={17} />Questions fréquentes</button><button type="button" className={kind === "guide" ? "active" : ""} onClick={() => changeKind("guide")}><BookOpen size={17} />Tutos et accueil</button></div>
    {kind === "guide" && <div className="player-help-editor-fields player-help-editor-settings"><label>Titre du guide d’accueil<input value={document.title} maxLength={100} onChange={(event) => setDocument({ ...document, title: event.target.value })} /></label><label>Introduction<textarea className="player-help-intro-input" value={document.intro} maxLength={1000} onChange={(event) => setDocument({ ...document, intro: event.target.value })} /></label><label className="player-help-publish"><input type="checkbox" checked={document.welcomeEnabled} onChange={(event) => setDocument({ ...document, welcomeEnabled: event.target.checked })} />Afficher le guide après une nouvelle inscription</label></div>}
    <div className="player-help-editor-toolbar"><span>{entries.length} rubrique{entries.length !== 1 ? "s" : ""}</span><button type="button" className="secondary" disabled={Boolean(busy) || document.entries.length >= 100} onClick={add}><Plus size={17} />{kind === "faq" ? "Ajouter une question" : "Ajouter une étape"}</button></div>
    <div className="player-help-editor-layout"><nav className="player-help-editor-list" aria-label="Rubriques à modifier">{entries.map((entry, index) => <button type="button" key={entry.id} className={entry.id === selected?.id ? "active" : ""} onClick={() => { setSelectedId(entry.id); setPreview(false); }}><strong>{index + 1}. {entry.title}</strong><small>{entry.category} · {entry.published ? "Publié" : "Brouillon"}</small></button>)}</nav>
      {selected ? <div className="player-help-editor-fields"><label>{kind === "faq" ? "Question" : "Titre de l’étape"}<input value={selected.title} maxLength={160} onChange={(event) => update({ title: event.target.value })} /></label><div className="player-help-editor-row"><label>Rubrique<input value={selected.category} maxLength={60} onChange={(event) => update({ category: event.target.value })} /></label><label className="player-help-publish"><input type="checkbox" checked={selected.published} onChange={(event) => update({ published: event.target.checked })} /><Check size={16} />Publié</label></div>
        <div className="segmented-tabs"><button type="button" className={!preview ? "active" : ""} onClick={() => setPreview(false)}><FileText size={16} />Texte Markdown</button><button type="button" className={preview ? "active" : ""} onClick={() => setPreview(true)}><Eye size={16} />Aperçu</button></div>
        {preview ? <div className="player-help-editor-preview"><h3>{selected.title}</h3><HelpArticle entry={selected} /></div> : <label>{kind === "faq" ? "Réponse" : "Contenu"}<textarea aria-label={kind === "faq" ? "Réponse" : "Contenu"} value={selected.body} maxLength={12000} onChange={(event) => update({ body: event.target.value })} /></label>}
        <label><span><ImagePlus size={16} />Image du site</span><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={Boolean(busy)} onChange={upload} /></label>
        {selected.image && <><label>Description de l’image<input value={selected.imageAlt} maxLength={200} onChange={(event) => update({ imageAlt: event.target.value })} /></label><button type="button" className="secondary" onClick={() => update({ image: "", imageAlt: "" })}>Retirer l’image</button></>}
        <div className="player-help-editor-controls"><button type="button" className="secondary icon-toggle" title="Monter la rubrique" aria-label="Monter la rubrique" disabled={selected.id === entries[0]?.id} onClick={() => move(-1)}><ArrowUp size={17} /></button><button type="button" className="secondary icon-toggle" title="Descendre la rubrique" aria-label="Descendre la rubrique" disabled={selected.id === entries.at(-1)?.id} onClick={() => move(1)}><ArrowDown size={17} /></button><ConfirmActionButton className="danger-button" dialogTitle="Supprimer cette rubrique ?" message={`« ${selected.title} » sera retirée lors du prochain enregistrement.`} confirmLabel="Supprimer" danger onConfirm={() => setDocument((current) => ({ ...current, entries: current.entries.filter((entry) => entry.id !== selected.id) }))}><Trash2 size={17} />Supprimer</ConfirmActionButton></div>
      </div> : <p>Aucune rubrique. Ajoute une question ou une étape pour commencer.</p>}
    </div>
    </fieldset>
  </section>;
}
