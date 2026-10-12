import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUp, ChevronsRight, RotateCcw, Sparkles, Trophy } from "lucide-react";
import { Dialog } from "../../components/common/Dialog.jsx";
import { useLocale } from "../../locales/LocaleProvider.jsx";
import { gameTitle } from "./config.js";
import { RankInsignia } from "./RankInsignia.jsx";
import { rankedCompletion } from "./ranked-completion.js";
import "./ranked-completion.css";

const headings = { promotion: "Promotion !", demotion: "Relégation", reveal: "Ton rang est révélé", placement: "Partie de placement terminée", gain: "Tu progresses", loss: "La prochaine sera la bonne", unchanged: "Partie terminée" };
function wasDismissed(key) { try { return sessionStorage.getItem(key) === "closed"; } catch { return false; } }

export function RankedCompletion({ result, matchId, userId, gameId }) {
  const { t, region } = useLocale();
  const key = `ktga-ranked-recap:${userId}:${matchId}`;
  const [closed, setClosed] = useState(() => wasDismissed(key));
  const [stage, setStage] = useState("intro");
  const [rating, setRating] = useState(result?.before ?? 0);
  const timers = useRef([]);
  const animation = rankedCompletion(result);
  useEffect(() => {
    if (!animation || closed) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setStage(reduced ? "settled" : "intro");
    setRating(reduced ? result.after : result.before);
    if (reduced) return;
    timers.current = [setTimeout(() => setStage("travel"), 300), setTimeout(() => setStage("transform"), 1700), setTimeout(() => setStage("settled"), animation.changed ? 3400 : 2100)];
    return () => timers.current.forEach(clearTimeout);
  }, [matchId, closed, animation?.direction]);
  useEffect(() => {
    if (!animation?.ranked || closed) return;
    if (stage === "settled") { setRating(result.after); return; }
    if (stage === "intro") return;
    const started = performance.now(), start = result.before;
    let frame;
    const update = (now) => {
      const fraction = Math.min(1, (now - started) / 1600);
      setRating(start + (result.after - start) * (1 - (1 - fraction) ** 3));
      if (fraction < 1) frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [stage === "intro", stage === "settled", matchId, closed]);
  if (!animation || result.userId !== userId) return null;
  const dismiss = () => { setClosed(true); try { sessionStorage.setItem(key, "closed"); } catch { /* A session without storage still dismisses locally. */ } };
  if (closed) return <button type="button" className="secondary ranked-recap-replay" onClick={() => { setClosed(false); setStage("intro"); }}><RotateCcw size={16}/>{t("Revoir ma progression")}</button>;
  const revealed = ["transform", "settled"].includes(stage);
  const rank = animation.changed && !revealed ? result.beforeRank : result.afterRank;
  const label = (value) => value?.name ? `${t(`rank::${value.name}`)}${value.division ? ` ${value.division}` : ""}` : t(value?.label ?? "Non classé");
  const percent = stage === "intro" ? animation.start : animation.changed && stage === "travel" ? animation.boundary : animation.end;
  const Icon = animation.direction === "demotion" ? ArrowDown : animation.changed ? Sparkles : animation.direction === "loss" ? ArrowDown : ArrowUp;
  return <Dialog title={t("Ta progression classée")} hideTitle className={`ranked-recap-modal recap-${animation.direction} recap-${stage}`} layerClassName="ranked-recap-layer" onClose={dismiss}>
    <header className="ranked-recap-heading"><span>{t(gameTitle(gameId))} · {t("Classé")}</span><h2>{t(headings[animation.direction])}</h2></header>
    <div className="ranked-recap-stage" aria-hidden="true">
      {animation.changed && <><RankInsignia rank={result.afterRank} className="ranked-recap-preload"/><div className="ranked-recap-rays">{Array.from({ length: 12 }, (_, index) => <i key={index} style={{ "--ray": `${index * 30}deg`, "--delay": `${index % 3 * 70}ms` }}/>)}</div></>}
      <div className="ranked-recap-emblem" key={`${rank?.id}:${rank?.division}:${revealed}`}><RankInsignia rank={rank}/></div>
      {animation.changed && <span className="ranked-recap-change"><Icon size={24}/></span>}
    </div>
    <h3 className="ranked-recap-name">{label(rank)}</h3>
    {animation.changed && <p className="ranked-recap-transition"><span>{label(result.beforeRank)}</span><ArrowRight size={16}/><strong>{label(result.afterRank)}</strong></p>}
    <div className="ranked-recap-progress" role="progressbar" aria-label={t("Ta progression classée")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}><i key={revealed ? "after" : "before"} style={{ width: `${percent}%` }}/></div>
    {animation.ranked ? <div className="ranked-recap-rating"><span>{t("Ton Elo")}<strong>{Number(rating.toFixed(2)).toLocaleString(region)}</strong></span><b className={result.delta < 0 ? "ranked-loss" : "ranked-gain"}>{result.delta > 0 ? "+" : ""}{Number(result.delta.toFixed(2)).toLocaleString(region)} {t("Elo")}</b></div> : result.placement && <p className="ranked-recap-placement"><Trophy size={18}/>{t("{done} / {total} placements", { done: result.placement.games, total: result.placement.required })}</p>}
    <footer>{stage !== "settled" && <button type="button" className="secondary" onClick={() => { timers.current.forEach(clearTimeout); setStage("settled"); }}><ChevronsRight size={18}/>{t("Afficher le résultat")}</button>}<button type="button" onClick={dismiss}>{t("Continuer")}<ArrowRight size={17}/></button></footer>
  </Dialog>;
}
