import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Bug, Check, Copy, FileImage, Heading2, ImagePlus, List, MessageSquareQuote, Newspaper, Plus, Save, Sparkles, Trash2, Type, Upload, Wrench } from "lucide-react";
import { API_URL, api, getToken } from "../../api.js";
import { Dialog } from "../common/Dialog.jsx";
import { ConfirmActionButton } from "../common/ConfirmAction.jsx";
import { PatchnoteContent, patchnoteCategories } from "../patchnotes/PatchnoteContent.jsx";
import { MarkdownContent } from "../patchnotes/MarkdownContent.jsx";
import { insertPatchnoteBlock } from "../../features/patchnotes/editor.js";
import "../../pages/patchnotes.css";
import "./patchnotes-admin.css";

const blockLabels = {
  section: "Section",
  paragraph: "Texte",
  change: "Mise à jour",
  list: "Liste",
  quote: "Citation",
  image: "Image"
};

const blockIcons = { section: Heading2, paragraph: Type, change: Sparkles, list: List, quote: MessageSquareQuote, image: FileImage };
const statusLabels = { draft: "Brouillon", published: "Publié", archived: "Archivé" };
const freshBlock = (type) => ({
  id: `draft-${crypto.randomUUID()}`,
  type,
  category: type === "change" ? "feature" : "other",
  title: type === "section" ? "Nouvelle section" : type === "change" ? "Nouvelle évolution" : "",
  content: type === "list" ? "Premier élément\nDeuxième élément" : "",
  metadata: type === "section" ? { level: 2 } : type === "quote" ? { attribution: "" } : {}
});

function suggestedGroup(version) {
  const match = String(version ?? "").trim().match(/^v?(\d+)\.(\d+)/i);
  return match ? `${match[1]}.${match[2]}` : String(version ?? "").split(/[._+-]/)[0];
}

function formattedDate(value) {
  return value ? new Intl.DateTimeFormat("fr-BE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Non publiée";
}

function BlockEditor({ block, index, count, selected, onSelect, update, move, remove, uploadImage, uploading }) {
  const Icon = blockIcons[block.type] ?? Wrench;
  const metadata = block.metadata ?? {};
  return <article className={`patchnote-block-editor ${selected ? "selected" : ""}`} onFocusCapture={onSelect} onClick={onSelect}>
    <header><span><Icon size={16} />{blockLabels[block.type]}</span><div><button type="button" className="secondary icon-toggle" disabled={index === 0} title="Monter" onClick={() => move(index, -1)}><ArrowUp size={15} /></button><button type="button" className="secondary icon-toggle" disabled={index === count - 1} title="Descendre" onClick={() => move(index, 1)}><ArrowDown size={15} /></button><button type="button" className="secondary icon-toggle danger-icon" title="Supprimer ce bloc" onClick={() => remove(index)}><Trash2 size={15} /></button></div></header>
    {block.type === "section" && <div className="patchnote-block-fields two"><label>Titre<input value={block.title} maxLength={120} onChange={(event) => update(index, { title: event.target.value })} /></label><label>Niveau<select value={metadata.level ?? 2} onChange={(event) => update(index, { metadata: { ...metadata, level: Number(event.target.value) } })}><option value="2">Section principale</option><option value="3">Sous-section</option></select></label></div>}
    {block.type === "paragraph" && <label>Texte Markdown<textarea rows="5" value={block.content} onChange={(event) => update(index, { content: event.target.value })} placeholder="Présente les changements avec un texte lisible…" /></label>}
    {block.type === "change" && <><div className="patchnote-block-fields two"><label>Catégorie<select value={block.category} onChange={(event) => update(index, { category: event.target.value })}>{Object.entries(patchnoteCategories).map(([value, category]) => <option key={value} value={value}>{category.label}</option>)}</select></label><label>Titre<input value={block.title} maxLength={120} onChange={(event) => update(index, { title: event.target.value })} /></label></div><label>Détail Markdown<textarea rows="4" value={block.content} onChange={(event) => update(index, { content: event.target.value })} placeholder="Décris ce qui change pour les joueurs…" /></label></>}
    {block.type === "list" && <label>Éléments de la liste<textarea rows="6" value={block.content} onChange={(event) => update(index, { content: event.target.value })} placeholder="Un élément par ligne" /><small>Un élément par ligne.</small></label>}
    {block.type === "quote" && <><label>Citation<textarea rows="4" value={block.content} onChange={(event) => update(index, { content: event.target.value })} /></label><label>Attribution<input value={metadata.attribution ?? ""} maxLength={120} onChange={(event) => update(index, { metadata: { ...metadata, attribution: event.target.value } })} placeholder="Nom ou source, facultatif" /></label></>}
    {block.type === "image" && <div className="patchnote-image-fields"><label className="patchnote-upload"><Upload size={18} /><span>{uploading ? "Téléversement…" : metadata.attachmentId ? "Remplacer l’image" : "Choisir une image"}</span><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={uploading} onChange={(event) => uploadImage(index, event.target.files?.[0])} /></label><label>Texte alternatif<input value={metadata.alt ?? ""} maxLength={180} onChange={(event) => update(index, { metadata: { ...metadata, alt: event.target.value } })} placeholder="Décris l’image pour l’accessibilité" /></label><label>Légende<input value={metadata.caption ?? ""} maxLength={300} onChange={(event) => update(index, { metadata: { ...metadata, caption: event.target.value } })} placeholder="Facultatif" /></label></div>}
  </article>;
}

export function PatchnotesAdmin({ reportError, notifySuccess }) {
  const [catalog, setCatalog] = useState({ currentVersion: "", notes: [] });
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState(null);
  const [creating, setCreating] = useState(null);
  const [duplicate, setDuplicate] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState("");
  const [versionDraft, setVersionDraft] = useState("");
  const [selectedBlockId, setSelectedBlockId] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  async function load() {
    setLoading(true);
    try { const result = await api("/api/admin/patchnotes"); setCatalog(result); setVersionDraft(result.currentVersion); }
    catch (error) { reportError(error.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const pageCount = Math.max(1, Math.ceil(catalog.notes.length / pageSize));
  const visibleNotes = useMemo(() => catalog.notes.slice((page - 1) * pageSize, page * pageSize), [catalog.notes, page]);

  async function openEditor(id) {
    try { const note = await api(`/api/admin/patchnotes/${id}`); setEditor(note); setSelectedBlockId(note.blocks[0]?.id ?? ""); }
    catch (error) { reportError(error.message); }
  }

  async function createNote(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const note = await api("/api/admin/patchnotes", { method: "POST", body: JSON.stringify(creating) });
      setCreating(null);
      setEditor(note);
      setSelectedBlockId(note.blocks[0]?.id ?? "");
      await load();
      notifySuccess("Patchnote créée en brouillon.");
    } catch (error) { reportError(error.message); }
    finally { setSaving(false); }
  }

  async function saveEditor(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const note = await api(`/api/admin/patchnotes/${editor.id}`, { method: "PATCH", body: JSON.stringify(editor) });
      setEditor(note);
      await load();
      notifySuccess(note.status === "published" ? "Patchnote publiée et enregistrée." : "Brouillon enregistré.");
    } catch (error) { reportError(error.message); }
    finally { setSaving(false); }
  }

  function updateBlock(index, patch) {
    setEditor((current) => ({ ...current, blocks: current.blocks.map((block, position) => position === index ? { ...block, ...patch } : block) }));
  }

  function moveBlock(index, direction) {
    setEditor((current) => {
      const blocks = [...current.blocks];
      const target = index + direction;
      if (target < 0 || target >= blocks.length) return current;
      [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
      return { ...current, blocks };
    });
  }

  function addBlock(type) {
    const block = freshBlock(type);
    setEditor((current) => {
      return { ...current, blocks: insertPatchnoteBlock(current.blocks, selectedBlockId, block) };
    });
    setSelectedBlockId(block.id);
  }

  async function saveCurrentVersion(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await api("/api/admin/patchnotes/settings", { method: "PUT", body: JSON.stringify({ currentVersion: versionDraft }) });
      setCatalog((current) => ({ ...current, currentVersion: result.currentVersion }));
      setVersionDraft(result.currentVersion);
      notifySuccess("Version courante mise à jour.");
    } catch (error) { reportError(error.message); }
    finally { setSaving(false); }
  }

  async function uploadImage(index, file) {
    if (!file) return;
    const blockId = editor.blocks[index].id;
    setUploading(blockId);
    try {
      const response = await fetch(`${API_URL}/api/admin/patchnotes/${editor.id}/images`, { method: "POST", headers: { "Content-Type": file.type, "X-File-Name": encodeURIComponent(file.name), ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) }, body: file });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Téléversement impossible.");
      setEditor((current) => ({ ...current, blocks: current.blocks.map((block) => block.id === blockId ? { ...block, metadata: { ...(block.metadata ?? {}), attachmentId: result.id } } : block) }));
    } catch (error) { reportError(error.message); }
    finally { setUploading(""); }
  }

  async function duplicateNote(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const note = await api(`/api/admin/patchnotes/${duplicate.id}/duplicate`, { method: "POST", body: JSON.stringify({ version: duplicate.version }) });
      setDuplicate(null);
      setEditor(note);
      setSelectedBlockId(note.blocks[0]?.id ?? "");
      await load();
      notifySuccess("La version a été dupliquée en brouillon.");
    } catch (error) { reportError(error.message); }
    finally { setSaving(false); }
  }

  async function removeNote(note) {
    await api(`/api/admin/patchnotes/${note.id}`, { method: "DELETE" });
    if (editor?.id === note.id) setEditor(null);
    await load();
    notifySuccess("Patchnote supprimée.");
  }

  return <section className="patchnotes-admin">
    <header className="admin-section-heading"><div><span className="eyebrow">Communication produit</span><h2>Patchnotes</h2><small>Versions, sommaires, médias et retours des joueurs réunis dans un seul outil.</small></div><button type="button" onClick={() => setCreating({ version: catalog.currentVersion, versionGroup: suggestedGroup(catalog.currentVersion), title: `Version ${catalog.currentVersion}`, summary: "" })}><Plus size={17} />Nouvelle version</button></header>
    <form className="patchnotes-admin-current" onSubmit={saveCurrentVersion}><Newspaper size={20} /><label>Version actuelle de l’application<input required value={versionDraft} onChange={(event) => setVersionDraft(event.target.value)} /></label><small>Cette version sera proposée automatiquement pour la prochaine patchnote.</small><button type="submit" className="secondary" disabled={saving || versionDraft === catalog.currentVersion}><Save size={15} />Mettre à jour</button></form>
    {loading ? <div className="admin-loading">Chargement des patchnotes…</div> : <div className="patchnotes-admin-list">
      {visibleNotes.map((note) => <article key={note.id}><div className="patchnote-admin-version"><strong>{note.version}</strong><span>{note.versionGroup}</span></div><div><strong>{note.title}</strong><small>{statusLabels[note.status]} · {formattedDate(note.publishedAt || note.updatedAt)}</small></div><div className="patchnote-admin-votes" title="Réactions visibles uniquement dans le back-office"><span><ArrowUp size={14} />{note.reactions?.up ?? 0}</span><span><ArrowDown size={14} />{note.reactions?.down ?? 0}</span><b>{(note.reactions?.score ?? 0) >= 0 ? "+" : ""}{note.reactions?.score ?? 0}</b></div><div className="admin-row-actions"><button type="button" className="secondary" onClick={() => openEditor(note.id)}>Modifier</button><button type="button" className="secondary icon-toggle" title="Dupliquer" onClick={() => setDuplicate({ id: note.id, title: note.title, version: `${note.version}a` })}><Copy size={15} /></button><ConfirmActionButton className="secondary icon-toggle danger-icon" title="Supprimer" dialogTitle="Supprimer cette patchnote ?" message={`La version « ${note.version} » et ses images seront définitivement supprimées.`} confirmLabel="Supprimer la patchnote" danger onConfirm={() => removeNote(note)}><Trash2 size={15} /></ConfirmActionButton></div></article>)}
      {!visibleNotes.length && <div className="empty-state">Aucune patchnote. Crée la première version pour préparer sa publication.</div>}
    </div>}
    {pageCount > 1 && <nav className="patchnotes-admin-pagination" aria-label="Pages des patchnotes"><button type="button" className="secondary" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Précédent</button><span>Page {page} / {pageCount}</span><button type="button" className="secondary" disabled={page === pageCount} onClick={() => setPage((value) => value + 1)}>Suivant</button></nav>}

    {creating && <Dialog title="Créer une patchnote" className="patchnote-create-dialog" onClose={() => setCreating(null)} dismissible={!saving}><form onSubmit={createNote} className="patchnote-create-form"><div className="patchnote-block-fields two"><label>Version<input required autoFocus value={creating.version} onChange={(event) => setCreating((current) => ({ ...current, version: event.target.value, versionGroup: suggestedGroup(event.target.value) }))} placeholder="1.1.1" /></label><label>Groupe de versions<input required value={creating.versionGroup} onChange={(event) => setCreating((current) => ({ ...current, versionGroup: event.target.value }))} placeholder="1.1" /><small>Exemple : 1.1 regroupe 1.1.1, 1.1.2 et 1.1.1a.</small></label></div><label>Titre<input required value={creating.title} onChange={(event) => setCreating((current) => ({ ...current, title: event.target.value }))} /></label><label>Résumé<textarea rows="4" value={creating.summary} onChange={(event) => setCreating((current) => ({ ...current, summary: event.target.value }))} placeholder="La synthèse affichée en haut de la page…" /></label><div className="actions"><button type="button" className="secondary" onClick={() => setCreating(null)}>Annuler</button><button type="submit" disabled={saving}><Plus size={17} />{saving ? "Création…" : "Créer le brouillon"}</button></div></form></Dialog>}

    {duplicate && <Dialog title="Dupliquer la version" className="patchnote-create-dialog" onClose={() => setDuplicate(null)} dismissible={!saving}><form onSubmit={duplicateNote} className="patchnote-create-form"><p>Une copie complète de « {duplicate.title} », images comprises, sera créée en brouillon.</p><label>Nouvelle version<input required autoFocus value={duplicate.version} onChange={(event) => setDuplicate((current) => ({ ...current, version: event.target.value }))} /></label><div className="actions"><button type="button" className="secondary" onClick={() => setDuplicate(null)}>Annuler</button><button type="submit" disabled={saving}><Copy size={17} />{saving ? "Duplication…" : "Confirmer la duplication"}</button></div></form></Dialog>}

    {editor && <Dialog title={`Patchnote · ${editor.version}`} className="patchnote-studio-dialog" layerClassName="patchnote-studio-layer" onClose={() => setEditor(null)} dismissible={!saving}><form className="patchnote-studio" onSubmit={saveEditor}>
      <section className="patchnote-studio-meta"><div className="patchnote-block-fields three"><label>Version<input required value={editor.version} onChange={(event) => setEditor((current) => ({ ...current, version: event.target.value }))} /></label><label>Groupe<input required value={editor.versionGroup} onChange={(event) => setEditor((current) => ({ ...current, versionGroup: event.target.value }))} /></label><label>État<select value={editor.status} onChange={(event) => setEditor((current) => ({ ...current, status: event.target.value }))}><option value="draft">Brouillon</option><option value="published">Publié</option><option value="archived">Archivé</option></select></label></div><label>Titre<input required maxLength={120} value={editor.title} onChange={(event) => setEditor((current) => ({ ...current, title: event.target.value }))} /></label><label>Résumé Markdown<textarea rows="3" maxLength={500} value={editor.summary} onChange={(event) => setEditor((current) => ({ ...current, summary: event.target.value }))} /></label></section>
      <div className="patchnote-studio-workspace"><section className="patchnote-builder"><header><div><span className="eyebrow">Contenu</span><h3>Construire la note</h3></div><div className="patchnote-block-palette">{Object.entries(blockLabels).map(([type, label]) => { const Icon = blockIcons[type]; return <button type="button" className="secondary" key={type} onClick={() => addBlock(type)}><Icon size={15} />{label}</button>; })}</div></header><div className="patchnote-editor-blocks">{editor.blocks.map((block, index) => <BlockEditor key={block.id} block={block} index={index} count={editor.blocks.length} selected={selectedBlockId === block.id} onSelect={() => setSelectedBlockId(block.id)} update={updateBlock} move={moveBlock} remove={(position) => { const removedId = editor.blocks[position]?.id; const nextSelection = editor.blocks[position + 1]?.id ?? editor.blocks[position - 1]?.id ?? ""; setEditor((current) => ({ ...current, blocks: current.blocks.filter((_, itemIndex) => itemIndex !== position) })); if (removedId === selectedBlockId) setSelectedBlockId(nextSelection); }} uploadImage={uploadImage} uploading={uploading === block.id} />)}{!editor.blocks.length && <button type="button" className="patchnote-builder-empty" onClick={() => { const section = freshBlock("section"); const change = freshBlock("change"); setEditor((current) => ({ ...current, blocks: [section, change] })); setSelectedBlockId(change.id); }}><Plus size={22} /><strong>Commencer avec une section</strong><span>Ajoute ensuite des évolutions, textes, images ou citations.</span></button>}</div></section>
        <aside className="patchnote-studio-preview"><span className="eyebrow">Aperçu public</span><h2>{editor.title || `Version ${editor.version}`}</h2>{editor.summary && <MarkdownContent className="patchnotes-summary">{editor.summary}</MarkdownContent>}<PatchnoteContent note={editor} compact /></aside></div>
      <footer className="patchnote-studio-actions"><span>{editor.status === "published" ? <><Check size={16} />Visible publiquement après enregistrement</> : "Cette version n’est pas visible publiquement."}</span><button type="button" className="secondary" onClick={() => setEditor(null)}>Fermer</button><button type="submit" disabled={saving || Boolean(uploading)}><Save size={17} />{saving ? "Enregistrement…" : "Enregistrer"}</button></footer>
    </form></Dialog>}
  </section>;
}
