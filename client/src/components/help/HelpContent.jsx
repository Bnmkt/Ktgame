import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, HelpCircle, Search } from "lucide-react";
import { api, API_URL, BASE_PATH } from "../../api.js";
import { Dialog } from "../common/Dialog.jsx";
import { MarkdownContent } from "../patchnotes/MarkdownContent.jsx";
import { appPath } from "../../navigation/routes.js";
import { groupHelpEntries } from "../../features/help/content.js";
import { GuideChallenge } from "./GuideChallenge.jsx";
import "./help.css";

export function helpImageUrl(image) {
  if (!image) return "";
  if (image.startsWith("/api/help/images/")) return `${API_URL}${image}`;
  if (/^\/guides\/[a-zA-Z0-9_/-]+\.(?:png|jpg|jpeg|webp|gif)$/.test(image) && !image.includes("..")) return `${BASE_PATH}${image}`;
  return "";
}

export function HelpArticle({ entry, interactive = false }) {
  const image = helpImageUrl(entry.image);
  return <>{entry.lead && <p className="player-help-lead">{entry.lead}</p>}<MarkdownContent inlineImages={false}>{entry.body}</MarkdownContent>{image && <figure className="player-help-figure"><a href={image} target="_blank" rel="noopener noreferrer" aria-label={`Agrandir : ${entry.imageAlt || entry.title}`}><img src={image} alt={entry.imageAlt || entry.title} loading="lazy" /></a>{entry.imageAlt && <figcaption>{entry.imageAlt}</figcaption>}</figure>}{interactive && entry.challenge && <GuideChallenge key={`${entry.id}:${JSON.stringify(entry.challenge)}`} challenge={entry.challenge} />}</>;
}

export function WelcomeGuide({ document, onClose }) {
  const steps = document.entries.filter((entry) => entry.kind === "guide");
  const [index, setIndex] = useState(0);
  const [visited, setVisited] = useState(() => new Set(steps[0] ? [steps[0].id] : []));
  const current = steps[Math.min(index, steps.length - 1)];
  function choose(position) {
    setIndex(position);
    setVisited((previous) => new Set([...previous, steps[position].id]));
  }
  if (!current) return null;
  return <Dialog title={document.title} className="player-help-welcome" onClose={onClose}>
    <div className="player-help-step-head"><span>{current.category}</span><strong>{index + 1} / {steps.length}</strong></div>
    <progress value={visited.size} max={steps.length} aria-label="Étapes explorées" />
    <div className="player-help-step-body" key={current.id}><h3>{current.title}</h3><HelpArticle entry={current} interactive /></div>
    <nav className="player-help-step-dots" aria-label="Étapes du guide">{steps.map((entry, position) => <button type="button" key={entry.id} className={position === index ? "active" : visited.has(entry.id) ? "is-visited" : ""} onClick={() => choose(position)} title={entry.title} aria-label={`Étape ${position + 1} : ${entry.title}`} aria-current={position === index ? "step" : undefined}>{visited.has(entry.id) && position !== index ? <Check size={14} /> : position + 1}</button>)}</nav>
    <div className="player-help-step-controls"><button type="button" className="secondary" onClick={onClose}>Plus tard</button><div><button type="button" className="secondary" disabled={index === 0} onClick={() => choose(index - 1)} aria-label="Étape précédente" title="Étape précédente"><ArrowLeft size={18} /></button><button type="button" onClick={index === steps.length - 1 ? onClose : () => choose(index + 1)}>{index === steps.length - 1 ? <Check size={18} /> : <ArrowRight size={18} />}{index === steps.length - 1 ? "Terminer la visite" : "On continue ?"}</button></div></div>
  </Dialog>;
}


export function HelpPage({ mode = "faq", siteName, onBack, initialDocument = null }) {
  const [document, setDocument] = useState(initialDocument);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [welcome, setWelcome] = useState(false);
  const [active, setActive] = useState("");
  const [completed, setCompleted] = useState(new Set());
  useEffect(() => {
    let cancelled = false;
    api("/api/help").then((content) => { if (!cancelled) setDocument(content); }).catch((failure) => { if (!cancelled) setError(failure.message); });
    return () => { cancelled = true; };
  }, []);
  const entries = document?.entries.filter((entry) => entry.kind === mode) ?? [];
  const categories = [...new Set(entries.map((entry) => entry.category))];
  const filtered = entries.filter((entry) => (category === "all" || category === entry.category) && `${entry.title} ${entry.body}`.toLocaleLowerCase("fr").includes(query.trim().toLocaleLowerCase("fr")));
  const key = filtered.map((entry) => entry.id).join(":");
  const groups = groupHelpEntries(filtered);
  const completedCount = entries.filter((entry) => completed.has(entry.id)).length;
  useEffect(() => {
    if (mode !== "guide") return;
    const observer = new IntersectionObserver((records) => {
      const visible = records.filter((record) => record.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (visible) setActive(visible.target.dataset.helpEntry);
    }, { rootMargin: "-10% 0px -55% 0px" });
    document && window.document.querySelectorAll("[data-help-entry]").forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [mode, key, document]);
  return <main className="app-shell player-help-page">
    <header className="page-heading"><div><span className="eyebrow">{siteName} · Aide aux joueurs</span><h1>{mode === "faq" ? "Questions fréquentes" : "Guide du joueur"}</h1></div><button type="button" className="secondary" onClick={onBack}><ArrowLeft size={17} />Casino</button></header>
    <section className="player-help-surface">
      <nav className="player-help-navigation" aria-label="Aide"><a href={appPath("faq")} className={mode === "faq" ? "active" : ""}><HelpCircle size={18} />FAQ</a><a href={appPath("guide")} className={mode === "guide" ? "active" : ""}><BookOpen size={18} />Tutos et guide</a>{entries.length > 0 && mode === "guide" && <button type="button" className="secondary" onClick={() => setWelcome(true)}><BookOpen size={17} />Ouvrir le guide d’accueil</button>}</nav>
      {error && <p className="error" role="alert">{error}</p>}
      {!document && !error && <p role="status">Chargement de l’aide…</p>}
      {document && <><div className="player-help-filters"><label><span className="sr-only">Rechercher dans l’aide</span><span><Search size={18} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher une question ou un sujet" /></span></label><label><span className="sr-only">Rubrique</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">Toutes les rubriques</option>{categories.map((value) => <option key={value}>{value}</option>)}</select></label></div>
        {mode === "guide" && <div className="player-help-guide-intro">{document.intro && <p className="player-help-intro">{document.intro}</p>}<div className="player-help-reading-progress"><span><strong>{completedCount}</strong> / {entries.length} étapes parcourues</span><progress value={completedCount} max={Math.max(1, entries.length)} aria-label="Étapes parcourues" /></div></div>}
        <div className={mode === "guide" ? "player-help-guide-layout" : "player-help-questions"}>
          {mode === "guide" && <aside className="player-help-contents"><h2>Ta visite, à la carte</h2><nav>{filtered.map((entry, position) => <a key={entry.id} className={active === entry.id ? "active" : ""} href={`#help-${entry.id}`} onClick={() => setActive(entry.id)}><span>{completed.has(entry.id) ? <Check size={15} /> : String(position + 1).padStart(2, "0")}</span>{entry.title}</a>)}</nav></aside>}
          <div>{mode === "faq" ? groups.map((group, index) => <section className="player-help-topic" key={group.category} aria-labelledby={`help-topic-${index}`}><header><h2 id={`help-topic-${index}`}>{group.category}</h2><span>{group.entries.length} question{group.entries.length > 1 ? "s" : ""}</span></header>{group.entries.map((entry) => <details className="player-help-question" key={entry.id}><summary><strong>{entry.title}</strong><ChevronDown size={19} /></summary><div><HelpArticle entry={entry} /></div></details>)}</section>) : filtered.map((entry, position) => <section key={entry.id} id={`help-${entry.id}`} data-help-entry={entry.id} className="player-help-chapter"><header><span>{String(position + 1).padStart(2, "0")} · {entry.category}</span><h2>{entry.title}</h2></header><HelpArticle entry={entry} interactive /><label className="player-help-read-check"><input type="checkbox" checked={completed.has(entry.id)} onChange={(event) => { const checked = event.target.checked; setCompleted((previous) => { const next = new Set(previous); if (checked) next.add(entry.id); else next.delete(entry.id); return next; }); }} />{completed.has(entry.id) ? "J’ai mes repères !" : "Marquer cette étape comme parcourue"}</label></section>)}{!filtered.length && <p className="empty-state">Aucune rubrique ne correspond à cette recherche.</p>}</div>
        </div></>}
    </section>
    {welcome && <WelcomeGuide document={document} onClose={() => setWelcome(false)} />}
  </main>;
}
