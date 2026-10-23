import { Play, Trophy } from "lucide-react";
import { useLocale } from "../../locales/LocaleProvider.jsx";
import { CompactNumber } from "../../utils/presentation.jsx";
import { diceScoreRows } from "../../features/games/dice-scoreboard.js";
import { yahtzeeTotal } from "./GameSupport.jsx";
import "./dice-scores.css";

export function DiceScoreStrip({ state, userId }) {
  const { t } = useLocale();
  const rows = diceScoreRows(state, userId, state.gameId === "yahtzee" ? yahtzeeTotal : undefined);
  if (!rows.length) return null;
  return <section className="dice-scoreboard" aria-label={t("Scores des joueurs")}>
    <header><h3><Trophy size={15} />{t("Scores")}</h3><small>{state.target ? t("Objectif : {value0} pts", { value0: state.target }) : t("Points cumulés")}</small></header>
    <ol>{rows.map(({ player, score, pending, current, self }) => <li key={player.id} className={`${self ? "dice-score-self" : ""} ${current ? "dice-score-current" : ""}`} aria-current={current ? "true" : undefined}>
      <span className="dice-score-player" title={player.pseudo}>{current && <Play size={11} fill="currentColor" aria-hidden="true" />}<span>{player.pseudo}</span>{self && <small>{t("Toi")}</small>}</span>
      <strong><CompactNumber value={score} label={t("Score cumulé exact")} /><small>{t("pts")}</small></strong>
      {pending > 0 && <span className="dice-score-pending" title={t("Points non encore validés")}><CompactNumber value={pending} prefix="+" /> {t("en jeu")}</span>}
    </li>)}</ol>
  </section>;
}
