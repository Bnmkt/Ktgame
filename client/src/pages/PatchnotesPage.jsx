import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, CalendarDays, CheckCircle2, Eye, RefreshCw } from "lucide-react";
import { api } from "../api.js";
import { PatchnoteContent } from "../components/patchnotes/PatchnoteContent.jsx";
import { MarkdownContent } from "../components/patchnotes/MarkdownContent.jsx";
import { applyPageMetadata, pageMetadata } from "../seo/metadata.js";
import { appPath } from "../navigation/routes.js";
import "./patchnotes.css";

const formatDate = (value, includeTime = false) => value ? new Intl.DateTimeFormat("fr-BE", { dateStyle: "long", ...(includeTime ? { timeStyle: "short" } : {}) }).format(new Date(value)) : "Date non définie";
const statusLabels = { draft: "Brouillon", published: "Publié", archived: "Archivé" };

export function PatchnotesPage({ siteName, user, onBack, initialCatalog = null, initialNote = null, initialVersion = "" }) {
  const canPreview = Boolean(user?.admin || user?.editor);
  const [previewEnabled, setPreviewEnabled] = useState(false);
  const preview = canPreview && previewEnabled;
  const scope = preview ? `editor:${user.id}` : "public";
  const [catalogState, setCatalogState] = useState(initialCatalog ? { scope: "public", data: initialCatalog } : null);
  const [selectedVersion, setSelectedVersion] = useState(() => initialVersion || (typeof location !== "undefined" ? new URLSearchParams(location.search).get("version") : "") || "");
  const [noteState, setNoteState] = useState(initialNote ? { scope: "public", version: initialNote.version, data: initialNote } : null);
  const [reaction, setReaction] = useState(0);
  const [catalogLoading, setCatalogLoading] = useState(!initialCatalog);
  const [noteLoading, setNoteLoading] = useState(false);
  const [error, setError] = useState("");
  const catalog = catalogState?.scope === scope ? catalogState.data : null;
  const selectedEntry = catalog?.notes.find((entry) => entry.version === selectedVersion);
  // A mode or identity change must immediately hide any previous private response.
  const note = selectedEntry && noteState?.scope === scope && noteState.version === selectedVersion ? noteState.data : null;
  const loading = catalogLoading || noteLoading;
  const groups = useMemo(() => {
    const grouped = new Map();
    for (const entry of catalog?.notes ?? []) {
      const notes = grouped.get(entry.versionGroup) ?? [];
      notes.push(entry);
      grouped.set(entry.versionGroup, notes);
    }
    return [...grouped.entries()];
  }, [catalog]);

  useEffect(() => {
    if (!canPreview) setPreviewEnabled(false);
  }, [canPreview, user?.id]);

  useEffect(() => {
    let cancelled = false;
    setCatalogLoading(true);
    setError("");
    api(preview ? "/api/admin/patchnotes" : "/api/patchnotes").then((result) => {
      if (cancelled) return;
      setCatalogState({ scope, data: result });
      setSelectedVersion((current) => current && result.notes.some((entry) => entry.version === current) ? current : result.notes[0]?.version ?? "");
    }).catch((failure) => { if (!cancelled) setError(failure.message); }).finally(() => { if (!cancelled) setCatalogLoading(false); });
    return () => { cancelled = true; };
  }, [scope]);

  useEffect(() => {
    if (!selectedEntry) { setNoteLoading(false); return undefined; }
    let cancelled = false;
    setNoteLoading(true);
    setError("");
    const endpoint = preview ? "/api/admin/patchnotes/" + encodeURIComponent(selectedEntry.id) : "/api/patchnotes/" + encodeURIComponent(selectedVersion);
    api(endpoint).then((result) => {
      if (!cancelled) setNoteState({ scope, version: selectedVersion, data: result });
    }).catch((failure) => { if (!cancelled) setError(failure.message); }).finally(() => { if (!cancelled) setNoteLoading(false); });
    const query = new URLSearchParams(location.search);
    query.set("version", selectedVersion);
    history.replaceState(null, "", appPath("patchnotes") + "?" + query);
    const meta = pageMetadata({ pathname: "/patchnotes", search: `?version=${encodeURIComponent(selectedVersion)}`, siteName, notes: catalog?.notes ?? [] });
    if (preview) { meta.indexable = false; meta.robots = "noindex, follow"; }
    applyPageMetadata(meta);
    return () => { cancelled = true; };
  }, [scope, selectedVersion, selectedEntry?.id]);

  useEffect(() => {
    setReaction(0);
    if (!note?.id || note.status !== "published" || !user?.id || user.guest) return undefined;
    let cancelled = false;
    api("/api/patchnotes/" + note.id + "/reaction").then((result) => { if (!cancelled) setReaction(result.value); }).catch(() => {});
    return () => { cancelled = true; };
  }, [note?.id, note?.status, user?.id, user?.guest]);

  async function vote(value) {
    if (note?.status !== "published") return;
    if (!user?.id || user.guest) { setError("Connecte-toi avec un compte pour réagir à cette patchnote."); return; }
    const next = reaction === value ? 0 : value;
    try { const result = await api("/api/patchnotes/" + note.id + "/reaction", { method: "POST", body: JSON.stringify({ value: next }) }); setReaction(result.value); setError(""); }
    catch (failure) { setError(failure.message); }
  }

  return <main className="app-shell patchnotes-page">
    <header className="patchnotes-site-header"><button type="button" className="secondary" onClick={onBack}><ArrowLeft size={17} />Retour au casino</button><div><span>{siteName}</span><strong>Patchnotes</strong></div><span className="patchnotes-current">Version courante · {catalog?.currentVersion ?? "…"}</span></header>
    {error && <div className="error patchnotes-feedback" role="alert">{error}<button className="secondary" type="button" onClick={() => location.reload()}><RefreshCw size={15} />Réessayer</button></div>}
    <section className="patchnotes-page-panel">
      {canPreview && <div className="patchnotes-reader-controls"><Eye size={18} /><label><span>Mode admin / éditeur</span><input type="checkbox" role="switch" checked={preview} onChange={(event) => setPreviewEnabled(event.target.checked)} /></label>{preview && <span className="patchnotes-reader-label">Prévisualisation privée</span>}</div>}
      {!catalog?.notes.length && !loading ? <div className="patchnotes-empty"><CheckCircle2 size={30} /><h1>{preview ? "Aucune patchnote" : "Aucune patchnote publiée"}</h1><p>{preview ? "Les brouillons apparaîtront ici après leur création." : "Les prochaines évolutions du casino apparaîtront ici."}</p></div> : <div className="patchnotes-layout">
        <aside className="patchnotes-version-nav"><span className="eyebrow">Historique</span><h1>Versions</h1>{groups.map(([group, notes]) => <section key={group}><h2>{group}</h2>{notes.map((entry) => <a key={entry.id} href={`${appPath("patchnotes")}?version=${encodeURIComponent(entry.version)}`} className={selectedVersion === entry.version ? "active" : ""} onClick={(event) => { if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); setSelectedVersion(entry.version); } }}><span>{entry.version}</span>{preview && <span className={"patchnotes-state state-" + entry.status}>{statusLabels[entry.status]}</span>}<small>{formatDate(entry.publishedAt)}</small></a>)}</section>)}</aside>
        <article className="patchnotes-release">{loading && !note ? <div className="patchnotes-loading"><RefreshCw className="spinning" />Chargement de la version…</div> : note && <>
          {note.status !== "published" && <div className="patchnotes-private-notice" role="status"><Eye size={18} /><strong>{statusLabels[note.status]} · visible uniquement par les admins et éditeurs</strong></div>}
          <header><span className="patchnotes-version">Version {note.version}</span><h1>{note.title}</h1><MarkdownContent className="patchnotes-summary">{note.summary}</MarkdownContent><small><CalendarDays size={14} />{note.status === "draft" ? "Date prévue" : "Publiée le"} {formatDate(note.publishedAt, true)}</small></header>
          <PatchnoteContent note={note} />
          {note.status === "published" && <footer className="patchnote-reactions"><div><strong>Cette mise à jour t’a-t-elle été utile ?</strong><span>Les résultats sont transmis à l’équipe éditoriale.</span></div><button type="button" className={reaction === 1 ? "active" : "secondary"} aria-pressed={reaction === 1} title="Réaction positive" onClick={() => vote(1)}><ArrowUp size={19} /><span className="sr-only">Réaction positive</span></button><button type="button" className={reaction === -1 ? "active negative" : "secondary"} aria-pressed={reaction === -1} title="Réaction négative" onClick={() => vote(-1)}><ArrowDown size={19} /><span className="sr-only">Réaction négative</span></button></footer>}
        </>}</article>
      </div>}
    </section>
  </main>;
}
