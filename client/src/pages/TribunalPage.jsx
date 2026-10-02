import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, ChevronRight, Clock3, Coins, FileCheck2, Gavel, Landmark, Scale, ShieldCheck } from "lucide-react";
import { api } from "../api.js";
import { Dialog } from "../components/common/Dialog.jsx";
import { CompactNumber } from "../utils/presentation.jsx";

const voteLabels = {
  1: ["Coupable", "Les éléments établissent clairement les faits."],
  2: ["Probablement coupable", "Les faits sont plus vraisemblables que leur contraire."],
  3: ["Doute raisonnable", "Les éléments ne permettent pas de trancher."],
  4: ["Probablement non coupable", "Les éléments disculpent plutôt le joueur."],
  5: ["Non coupable", "Les faits ne sont pas établis."]
};

const formatDate = (value) => value ? new Intl.DateTimeFormat("fr-BE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "";

export function TribunalPage() {
  const [data, setData] = useState(null);
  const [selectedId, setSelectedId] = useState("");
  const [score, setScore] = useState(0);
  const [rationale, setRationale] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const result = await api("/api/tribunal");
      setData(result);
      setSelectedId((current) => result.cases.some((entry) => entry.id === current) ? current : result.cases.find((entry) => entry.status === "voting" && !entry.vote)?.id ?? result.cases[0]?.id ?? "");
    } catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  const selected = useMemo(() => data?.cases.find((entry) => entry.id === selectedId), [data, selectedId]);

  async function submitVote() {
    setSending(true);
    setError("");
    try {
      await api(`/api/tribunal/cases/${selected.id}/vote`, { method: "POST", body: JSON.stringify({ score, rationale }) });
      setConfirming(false);
      setScore(0);
      setRationale("");
      await load();
    } catch (failure) { setError(failure.message); setConfirming(false); }
    finally { setSending(false); }
  }

  if (loading && !data) return <main className="app-shell tribunal-page"><section className="tribunal-loading"><Scale /><strong>Ouverture du greffe…</strong></section></main>;
  return <main className="app-shell tribunal-page">
    <header className="tribunal-masthead">
      <div className="tribunal-seal"><Scale size={32} /></div>
      <div><span className="eyebrow">Justice communautaire</span><h1>Le tribunal des joueurs</h1><p>Examine les faits, évalue les preuves et rends un vote indépendant.</p></div>
      <div className="tribunal-session"><span>Session ouverte</span><strong>{data?.stats.pending ?? 0} dossier(s) à juger</strong></div>
    </header>
    {error && <div className="error tribunal-feedback"><AlertTriangle size={18} />{error}</div>}
    {!data?.eligibility.eligible ? <section className="tribunal-ineligible"><Landmark size={40} /><span className="eyebrow">Accès au jury</span><h2>Tu ne peux pas encore siéger</h2><p>{data?.eligibility.reason}</p>{data?.eligibility.gamesPlayed !== undefined && <small>{data.eligibility.gamesPlayed} partie(s) comptabilisée(s)</small>}</section> : <>
      <section className="tribunal-stats" aria-label="Résumé du tribunal"><article><FileCheck2 /><span>À examiner</span><strong>{data.stats.pending}</strong></article><article><Gavel /><span>Votes rendus</span><strong>{data.stats.voted}</strong></article><article><ShieldCheck /><span>Comportement</span><strong>{data.stats.behaviorScore}/100</strong></article><article><Coins /><span>Prime maximale</span><strong><CompactNumber value={data.settings.maximumReward} /></strong></article></section>
      <div className="tribunal-workspace">
        <aside className="tribunal-docket"><div><span className="eyebrow">Rôle d’audience</span><h2>Dossiers disponibles</h2></div>{data.cases.length ? data.cases.map((entry, index) => <button type="button" key={entry.id} className={`${selectedId === entry.id ? "active" : ""} ${entry.vote ? "judged" : ""}`} onClick={() => { setSelectedId(entry.id); setScore(0); setRationale(""); }}><span>Dossier {String(index + 1).padStart(2, "0")}</span><strong>{entry.title}</strong><small>{entry.vote ? `Vote rendu : ${entry.vote.score}/5` : `Clôture ${formatDate(entry.endsAt)}`}</small><ChevronRight size={18} /></button>) : <div className="tribunal-empty"><Check size={28} /><strong>Aucun dossier en attente</strong><span>Aucun dossier sans lien avec ton compte n’est actuellement soumis au jury.</span></div>}</aside>
        {selected && <article className="tribunal-case-file">
          <header><div><span className="tribunal-case-code">{selected.code}</span><h2>{selected.title}</h2>{selected.accused && <p>Joueur mis en cause : <strong>{selected.accused}</strong></p>}</div><div className="tribunal-deadline"><Clock3 size={18} /><span>Délibération jusqu’au</span><strong>{formatDate(selected.endsAt)}</strong></div></header>
          <section className="tribunal-facts"><div className="tribunal-section-title"><span>I</span><div><small>Exposé</small><h3>Faits soumis au jury</h3></div></div><p>{selected.summary}</p><small>{selected.reportCount} signalement(s) vérifié(s) regroupé(s) dans ce dossier.</small></section>
          <section className="tribunal-evidence"><div className="tribunal-section-title"><span>II</span><div><small>Pièces</small><h3>Éléments versés au dossier</h3></div></div>{selected.evidence.length ? <ol>{selected.evidence.map((item, index) => <li key={`${item.label}-${index}`}><b>Pièce {index + 1}</b><div><strong>{item.label}</strong><p>{item.value}</p>{item.occurredAt && <time>{formatDate(item.occurredAt)}</time>}</div></li>)}</ol> : <div className="tribunal-no-evidence">Aucune pièce technique supplémentaire. Le vote doit se limiter à l’exposé vérifié.</div>}</section>
          {selected.vote ? <section className="tribunal-vote-receipt"><ShieldCheck size={28} /><div><span>Vote scellé</span><strong>{selected.vote.score}/5 · {voteLabels[selected.vote.score][0]}</strong><p>Ton vote ne peut plus être modifié. La récompense sera calculée à la clôture.</p></div></section> : <section className="tribunal-ballot"><div className="tribunal-section-title"><span>III</span><div><small>Délibération</small><h3>Rendre ton verdict</h3></div></div><p className="tribunal-instruction">Évalue uniquement les faits présentés. 1 signifie coupable, 5 signifie non coupable.</p><div className="tribunal-scale" role="radiogroup" aria-label="Verdict de 1 à 5">{Object.entries(voteLabels).map(([value, [label, detail]]) => <button type="button" role="radio" aria-checked={score === Number(value)} className={score === Number(value) ? "selected" : ""} key={value} onClick={() => setScore(Number(value))}><b>{value}</b><span>{label}</span><small>{detail}</small></button>)}</div><label>Motivation facultative<textarea maxLength={500} value={rationale} onChange={(event) => setRationale(event.target.value)} placeholder="Explique brièvement les éléments qui ont guidé ton vote." /></label><button type="button" className="tribunal-submit" disabled={!score} onClick={() => setConfirming(true)}><Gavel size={19} /> Sceller mon vote</button></section>}
        </article>}
      </div>
      <section className="tribunal-principles"><Scale /><div><strong>Indépendance et confidentialité</strong><p>Les identités des auteurs de signalement restent masquées. Ne vote pas selon une réputation ou une relation personnelle, uniquement selon les éléments du dossier.</p></div><div><strong>Récompense de précision</strong><p>Après le verdict, la proximité entre ton vote et le score final détermine une prime pouvant atteindre {data.settings.maximumReward.toLocaleString("fr-BE")} jetons.</p></div></section>
    </>}
    {confirming && <Dialog title="Sceller ce verdict ?" className="tribunal-confirm-dialog" onClose={() => setConfirming(false)} dismissible={!sending}><div className="tribunal-confirm-score"><Scale /><span>Ton vote</span><strong>{score}/5</strong><b>{voteLabels[score]?.[0]}</b></div><p>Une fois déposé, ce vote est définitif et ne pourra plus être modifié.</p><div className="actions"><button type="button" disabled={sending} onClick={submitVote}><Gavel size={18} />{sending ? "Dépôt…" : "Confirmer le verdict"}</button><button type="button" className="secondary" disabled={sending} onClick={() => setConfirming(false)}>Revenir au dossier</button></div></Dialog>}
  </main>;
}
