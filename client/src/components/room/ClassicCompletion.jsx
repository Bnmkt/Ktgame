import { useEffect, useState } from "react";
import { ArrowRight, Coins, DoorOpen, Eye, Play, Sparkles, Trophy } from "lucide-react";
import { Dialog } from "../common/Dialog.jsx";
import { DisplayName } from "../cosmetics/Cosmetics.jsx";
import { CompactNumber } from "../../utils/presentation.jsx";
import { useLocale } from "../../locales/LocaleProvider.jsx";
import { gameTitle } from "../../features/games/config.js";
import { classicResults } from "../../features/games/classic-completion.js";
import "./classic-completion.css";
import { Mascot, gameMascot } from "../mascots/Mascot.jsx";

function signed(value, t) {
  return <>{value > 0 ? "+" : value < 0 ? "-" : ""}<CompactNumber value={Math.abs(value)} label={t("Bilan net de jetons")} /></>;
}

function RecapExpiry({ endsAt }) {
  const { t } = useLocale();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  return <small className="classic-completion-expiry">{t("Retour à la table dans {seconds} s", { seconds: Math.max(0, Math.ceil((endsAt - now) / 1000)) })}</small>;
}

function CompletionContent({ room, userId, actions, endsAt, dialog = false }) {
  const { t } = useLocale();
  const rows = classicResults(room), own = rows.find((row) => row.id === userId);
  const winners = rows.filter((row) => row.winner);
  const xp = room.completion?.xp;
  const outcome = !own ? "Résultats finaux" : own.push ? "Égalité avec le croupier" : own.winner ? winners.length > 1 && room.gameId !== "belote" ? "Victoire partagée !" : room.gameId === "belote" ? "Ton équipe remporte la partie !" : "Victoire !" : "Bien joué, à la prochaine !";
  const hasMoney = rows.some((row) => !row.isBot && (row.spent > 0 || row.recovered > 0));
  return <div className={`classic-completion-content ${own?.winner ? "completion-victory" : "completion-finished"}`}>
    <div className="classic-completion-body">
    <header className="classic-completion-heading"><span className="eyebrow">{t(gameTitle(room.gameId))} · {t("Partie terminée")}</span><div className="classic-completion-headline"><span className="classic-completion-emblem" aria-hidden="true"><Mascot character={own?.winner ? gameMascot(room.gameId).character : "milo"} pose={own?.winner ? "victory" : "welcome"}/></span><div><h2>{t(outcome)}</h2><p>{own ? t("Ta partie en un regard") : t("Résultats finaux")}</p></div></div></header>
    {own && <div className="classic-completion-metrics">
      <div><small>{t(room.gameId === "blackjack" ? "Ta main" : room.gameId === "belote" ? "Score de ton équipe" : own.unit === "Place" ? "Ta place" : "Ton score")}</small><strong><CompactNumber value={own.score}/></strong><span>{own.unit === "Place" ? t("sur {count} joueurs", { count: rows.length }) : t(own.unit)}</span></div>
      {rows.length > 1 && !["president", "blackjack", "belote"].includes(room.gameId) && <div><small>{t("Ta place")}</small><strong>#{own.rank}</strong><span>{t("sur {count} joueurs", { count: rows.length })}</span></div>}
      {!own.isBot && hasMoney && <div className={own.net === null ? "" : own.net < 0 ? "completion-loss" : "completion-gain"}><small>{t(own.net === null ? "Jetons récupérés" : "Bilan net de jetons")}</small><strong><Coins size={22}/>{own.net === null ? <CompactNumber value={own.recovered}/> : signed(own.net, t)}</strong><span>{t(own.net === null ? "Bilan indisponible" : "Mises déduites")}</span></div>}
    </div>}
    {xp && <section className="classic-completion-xp" aria-label={t("Ta progression")}><div className="classic-completion-xp-heading"><Sparkles size={19}/><strong>+{xp.amount} XP</strong><span>{t("Niveau {level}", { level: xp.level })}{xp.mastery > 0 ? ` · ${t("Maîtrise")} ${xp.masteryLabel}` : ""}</span></div>{xp.mastery > xp.previousMastery ? <p className="classic-completion-unlock">{t("Nouvelle maîtrise !")}</p> : xp.level > xp.previousLevel ? <p className="classic-completion-unlock">{t("Niveau {before} → {after}", { before: xp.previousLevel, after: xp.level })}</p> : null}<progress max={xp.nextXp || 1} value={xp.nextXp ? Math.min(xp.levelXp, xp.nextXp) : 1} aria-label={t("Progression vers le prochain niveau")}/><div className="classic-completion-xp-details"><span>{xp.title}</span><small>{xp.nextXp ? <><CompactNumber value={xp.levelXp}/> / <CompactNumber value={xp.nextXp}/> XP</> : t("Niveau maximum")}</small></div></section>}
    <section className="classic-completion-ranking" aria-label={t("Classement final")}><div className="classic-completion-ranking-heading"><h3>{t(room.gameId === "blackjack" ? "Résultats des joueurs" : "Classement final")}</h3><small>{t(rows[0]?.unit ?? "Score")}</small></div><ol>{rows.map((row) => <li key={row.id} className={`${row.winner ? "is-winner" : ""} ${row.id === userId ? "is-current" : ""}`}><span className="classic-completion-position">{row.winner ? <Trophy size={17}/> : room.gameId === "blackjack" ? "—" : row.rank}</span><div className="classic-completion-player"><DisplayName user={row}/><small>{row.id === userId ? t("Toi") : row.isBot ? t("IA") : ""}{room.gameId === "blackjack" ? ` · ${t(row.push ? "Égalité" : row.winner ? "Gagnant" : "Perdu")}` : ""}</small></div><strong>{row.unit === "Place" ? `#${row.score}` : <CompactNumber value={row.score}/>}</strong></li>)}</ol></section>
    {own && hasMoney && <details className="classic-completion-accounting"><summary>{t("Détail des jetons")}</summary><dl><div><dt>{t(own.net === null ? "Mise initiale" : "Jetons engagés")}</dt><dd><CompactNumber value={own.spent}/></dd></div><div><dt>{t("Jetons récupérés")}</dt><dd><CompactNumber value={own.recovered}/></dd></div>{own.net !== null && <div><dt>{t("Bilan net de jetons")}</dt><dd>{signed(own.net, t)}</dd></div>}</dl></details>}
    </div>
    <footer className="classic-completion-actions">{endsAt && <RecapExpiry endsAt={endsAt}/>}{actions}{!dialog && !actions && <small>{t("En attente du maître de table")}</small>}</footer>
  </div>;
}

export function ClassicCompletion({ room, userId, isOwner, pacing, canSkip, onSkip, onReplay, onInstantReplay, onLeave }) {
  const { t } = useLocale();
  const [dismissed, setDismissed] = useState(false);
  const [review, setReview] = useState(false);
  const automatic = pacing?.kind === "round-results" && pacing.final && !dismissed;
  const close = () => { setDismissed(true); setReview(false); };
  const actions = <>{isOwner && room.gameId === "blackjack" && <button type="button" onClick={onInstantReplay}><Play size={17}/>{t("Rejouer maintenant")}</button>}{isOwner && room.gameId !== "texas-holdem" && <button type="button" className={room.gameId === "blackjack" ? "secondary" : ""} onClick={onReplay}><Play size={17}/>{t("Retour à la salle d'attente")}</button>}{!isOwner && room.gameId !== "texas-holdem" && <small>{t("Le maître de table peut relancer une partie.")}</small>}<button type="button" className="secondary" onClick={onLeave}><DoorOpen size={17}/>{t("Quitter la table")}</button></>;
  return <section className="classic-completion" aria-label={t("Bilan de la partie")}>
    <CompletionContent room={room} userId={userId} actions={actions}/>
    <button type="button" className="secondary classic-completion-review" onClick={() => setReview(true)}><Eye size={16}/>{t("Revoir les résultats")}</button>
    {(automatic || review) && <Dialog title={t("Bilan de la partie")} hideTitle className="classic-completion-modal" layerClassName="classic-completion-layer" onClose={close}><CompletionContent room={room} userId={userId} dialog endsAt={automatic ? pacing.endsAt : null} actions={<button type="button" onClick={() => { close(); if (automatic && canSkip) onSkip(); }}>{t("Voir la table")}<ArrowRight size={17}/></button>}/></Dialog>}
  </section>;
}
