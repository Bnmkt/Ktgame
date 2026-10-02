import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, CalendarDays, CheckCircle2, RefreshCw } from "lucide-react";
import { api } from "../api.js";
import { PatchnoteContent } from "../components/patchnotes/PatchnoteContent.jsx";
import { MarkdownContent } from "../components/patchnotes/MarkdownContent.jsx";
import "./patchnotes.css";

const formatDate = (value) => value ? new Intl.DateTimeFormat("fr-BE", { dateStyle: "long" }).format(new Date(value)) : "Date non définie";

export function PatchnotesPage({ siteName, user, onBack }) {
  const [catalog, setCatalog] = useState(null);
  const [selectedVersion, setSelectedVersion] = useState(() => new URLSearchParams(location.search).get("version") || "");
  const [note, setNote] = useState(null);
  const [reaction, setReaction] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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
    let cancelled = false;
    setLoading(true);
    api("/api/patchnotes").then((result) => {
      if (cancelled) return;
      setCatalog(result);
      setSelectedVersion((current) => current && result.notes.some((entry) => entry.version === current) ? current : result.notes[0]?.version ?? "");
      setError("");
    }).catch((failure) => { if (!cancelled) setError(failure.message); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedVersion) { setNote(null); return; }
    let cancelled = false;
    setLoading(true);
    api(`/api/patchnotes/${encodeURIComponent(selectedVersion)}`).then((result) => { if (!cancelled) { setNote(result); setError(""); } }).catch((failure) => { if (!cancelled) setError(failure.message); }).finally(() => { if (!cancelled) setLoading(false); });
    const query = new URLSearchParams(location.search);
    query.set("version", selectedVersion);
    history.replaceState(null, "", `${location.pathname}?${query}`);
    return () => { cancelled = true; };
  }, [selectedVersion]);

  useEffect(() => {
    if (!note?.id || !user?.id || user.guest) { setReaction(0); return; }
    let cancelled = false;
    api(`/api/patchnotes/${note.id}/reaction`).then((result) => { if (!cancelled) setReaction(result.value); }).catch(() => {});
    return () => { cancelled = true; };
  }, [note?.id, user?.id, user?.guest]);

  async function vote(value) {
    if (!user?.id || user.guest) { setError("Connecte-toi avec un compte pour réagir à cette patchnote."); return; }
    const next = reaction === value ? 0 : value;
    try { const result = await api(`/api/patchnotes/${note.id}/reaction`, { method: "POST", body: JSON.stringify({ value: next }) }); setReaction(result.value); setError(""); }
    catch (failure) { setError(failure.message); }
  }

  return <main className="app-shell patchnotes-page">
    <header className="patchnotes-site-header"><button type="button" className="secondary" onClick={onBack}><ArrowLeft size={17} />Retour au casino</button><div><span>{siteName}</span><strong>Patchnotes</strong></div><span className="patchnotes-current">Version courante · {catalog?.currentVersion ?? "…"}</span></header>
    {error && <div className="error patchnotes-feedback" role="alert">{error}<button className="secondary" type="button" onClick={() => location.reload()}><RefreshCw size={15} />Réessayer</button></div>}
    <section className="patchnotes-page-panel">{!catalog?.notes.length && !loading ? <div className="patchnotes-empty"><CheckCircle2 size={30} /><h1>Aucune patchnote publiée</h1><p>Les prochaines évolutions du casino apparaîtront ici.</p></div> : <div className="patchnotes-layout">
      <aside className="patchnotes-version-nav"><span className="eyebrow">Historique</span><h1>Versions</h1>{groups.map(([group, notes]) => <section key={group}><h2>{group}</h2>{notes.map((entry) => <button type="button" key={entry.id} className={selectedVersion === entry.version ? "active" : ""} onClick={() => setSelectedVersion(entry.version)}><span>{entry.version}</span><small>{formatDate(entry.publishedAt)}</small></button>)}</section>)}</aside>
      <article className="patchnotes-release">{loading && !note ? <div className="patchnotes-loading"><RefreshCw className="spinning" />Chargement de la version…</div> : note && <><header><span className="patchnotes-version">Version {note.version}</span><h1>{note.title}</h1><MarkdownContent className="patchnotes-summary">{note.summary}</MarkdownContent><small><CalendarDays size={14} />Publiée le {formatDate(note.publishedAt)}</small></header><PatchnoteContent note={note} /><footer className="patchnote-reactions"><div><strong>Cette mise à jour t’a-t-elle été utile ?</strong><span>Les résultats sont transmis à l’équipe éditoriale.</span></div><button type="button" className={reaction === 1 ? "active" : "secondary"} aria-pressed={reaction === 1} title="Réaction positive" onClick={() => vote(1)}><ArrowUp size={19} /><span className="sr-only">Réaction positive</span></button><button type="button" className={reaction === -1 ? "active negative" : "secondary"} aria-pressed={reaction === -1} title="Réaction négative" onClick={() => vote(-1)}><ArrowDown size={19} /><span className="sr-only">Réaction négative</span></button></footer></>}</article>
    </div>}</section>
  </main>;
}
