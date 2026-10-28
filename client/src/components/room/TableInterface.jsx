import { ChevronDown, Crown, Dices, Layers3, Play, Spade, Trophy } from "lucide-react";
import { useLocale } from "../../locales/LocaleProvider.jsx";
import { DisplayName } from "../cosmetics/Cosmetics.jsx";
import { CompactNumber } from "../../utils/presentation.jsx";
import { gameTitle, scoreCategories, yahtzeeScoreHelp } from "../../features/games/config.js";
import { gameRules } from "../../config/site.js";
import { diceScoreRows } from "../../features/games/dice-scoreboard.js";
import { yahtzeePotentialScore, yahtzeeTotal, yahtzeeUpperTotal } from "../game/GameSupport.jsx";
import { tableRoundInfo } from "../../features/games/table-interface.js";
import "./table-interface.css";
import "./table-stage.css";

// Presentation only. Actions and room synchronization remain owned by Room.
export function TableHud({ room, state, userId }) {
  const { t } = useLocale();
  const current = state.players[state.currentPlayerIndex];
  const poker = state.gameId === "texas-holdem";
  const blackjack = state.gameId === "blackjack";
  const president = state.gameId === "president";
  const round = tableRoundInfo(state);
  const scores = diceScoreRows(state, userId, state.gameId === "yahtzee" ? yahtzeeTotal : undefined);
  return <section className="table-hud" aria-label={t("Informations de la table")}>
    <div className="table-hud-top"><header className="table-board-heading"><h2>{president ? <Crown size={25}/> : poker || blackjack ? <Spade size={25}/> : <Dices size={25}/>} {t(gameTitle(room.gameId))}</h2></header><dl className="table-hud-facts">
      <div><dt>{t(round.label)}</dt><dd>{t(round.value)}</dd></div>
      <div><dt>{t(blackjack ? "Actions simultanées" : "Joueur actif")}</dt><dd>{state.finished ? t("Partie terminée") : blackjack ? t("Contre le croupier") : current?.pseudo ?? "—"}</dd></div>
      <div><dt>{t("Joueurs")}</dt><dd>{state.players.length}{poker && room.maxPlayers ? ` / ${room.maxPlayers}` : ""}</dd></div>
      <div><dt>{t(poker ? "Blindes" : blackjack ? "Limites de mise" : room.ranked ? "Partie classée" : "Mise par joueur")}</dt><dd>{poker ? `${state.smallBlind} / ${state.bigBlind}` : blackjack ? `${state.modifiers?.minimumBet ?? 50} – ${state.modifiers?.maximumBet ?? 100}` : room.ranked ? <><Trophy size={15}/>{t("Classé")}</> : <CompactNumber value={room.stake} suffix={t(" jetons")}/>}</dd></div>
    </dl></div>
    {!poker && !president && <div className="table-hud-players">{state.players.map((player, index) => {
      const active = !state.finished && (blackjack ? !player.isBot && !state.completedPlayerIds?.includes(player.id) : index === state.currentPlayerIndex);
      const score = scores.find((row) => row.player.id === player.id);
      return <article className={`table-hud-player ${active ? "table-player-current" : ""}`} key={player.id} aria-current={active ? "true" : undefined}>
        {player.id === room.ownerId && <Crown className="table-player-crown" size={18} aria-label={t("Maître")}/>}
        <DisplayName user={player}/>{player.isBot && <small className="table-player-kind">{t("IA")}</small>}
        {(score || blackjack) && <strong className="table-player-points"><CompactNumber value={blackjack ? player.tokens ?? 0 : score.score}/><small>{t(blackjack ? "jetons" : "pts")}</small></strong>}
        {active && <span className="table-player-turn"><Play size={10} fill="currentColor"/>{t(player.id === userId && !room.pacing ? "À toi de jouer" : "Tour en cours")}</span>}
      </article>;
    })}</div>}
  </section>;
}

export function TableBoardHeading({ state }) {
  const { t } = useLocale();
  const round = tableRoundInfo(state);
  return <header className="table-board-heading"><h2>{state.gameId === "texas-holdem" ? <Spade size={26}/> : <Dices size={28}/>} {t(gameTitle(state.gameId))}</h2><div className="table-round"><Layers3 size={17}/><span><small>{t(state.finished ? "Partie terminée" : round.label)}</small><strong>{round.value}</strong></span></div></header>;
}

export function TableTurnFocus({ state, userId, pacing }) {
  const { t } = useLocale();
  const current = state.players[state.currentPlayerIndex];
  const mine = current?.id === userId && !pacing && !state.finished;
  const hint = state.bust ? "Les points accumulés ce tour sont perdus. Confirme le score nul pour passer la main."
    : state.gameId === "yahtzee" ? "Lance les dés, puis choisis une case dans la feuille de score."
    : state.gameId === "farkle" ? "Sélectionne uniquement les dés qui forment une combinaison, puis encaisse ou relance les autres."
    : "Les dés sélectionnés suivent ton mode de sélection. Valide ta figure pour terminer le tour.";
  return <section className={`table-turn-focus ${mine ? "table-turn-self" : ""}`} role="status" aria-live="polite">
    <Play size={16} fill={mine ? "currentColor" : "none"}/><div><strong>{t(state.finished ? "Partie terminée" : pacing ? "Tour en cours" : mine ? "À toi de jouer" : "En attente du joueur actif")}</strong>{!state.finished && <small>{t(hint)}</small>}</div>
  </section>;
}

export function TableStats({ items }) {
  const { t } = useLocale();
  return <dl className="table-stats">{items.map(({ label, value, accent }) => <div key={label}><dt>{t(label)}</dt><dd className={accent ? "table-stat-accent" : undefined}>{value}</dd></div>)}</dl>;
}

export function TableActionBar({ children, className = "" }) {
  const { t } = useLocale();
  return <div className={`table-action-bar ${className}`} role="group" aria-label={t("Actions de jeu")}>{children}</div>;
}

export function TablePanel({ title, children, open = false, className = "" }) {
  return <details className={`table-panel ${className}`} open={open}><summary><span>{title}</span><ChevronDown size={17}/></summary><div className="table-panel-content">{children}</div></details>;
}

export function TableFigureGuide({ gameId }) {
  const { t } = useLocale();
  // Reuse the existing rules, including their real point formulas.
  const figures = gameRules[gameId]?.sections.find((section) => section.title === "Combinaisons")?.items ?? [];
  return <ul className="table-figure-guide">{figures.map((text) => {
    const translated = t(text);
    const separator = translated.indexOf(":");
    return <li key={text}><strong>{translated.slice(0, separator)}</strong><span>{translated.slice(separator + 1).trim()}</span></li>;
  })}</ul>;
}

export function TableYahtzeeSheet({ state, canAct, onChoose }) {
  const { t } = useLocale();
  const current = state.players[state.currentPlayerIndex];
  const scores = state.scores[current?.id] ?? {};
  const upper = yahtzeeUpperTotal(scores);
  return <section className="table-score-sheet" aria-label={t("Feuille de score")}>
    <header><h2>{t("Feuille de score")}</h2><small>{current?.pseudo}</small></header>
    <div className="table-sheet-columns"><span>{t("Catégorie")}</span><span>{t("Score")}</span><span>{t("Possible")}</span></div>
    <div className="table-sheet-rows">{scoreCategories.map(([key, label], index) => {
      const used = scores[key] !== undefined;
      const potential = yahtzeePotentialScore(state.dice ?? [], key);
      return <div key={key}>
        {index === 6 && <div className="table-sheet-subtotal"><span>{t("Bonus supérieur")}</span><strong>{upper >= 63 ? "+35" : `${upper} / 63`}</strong></div>}
        <button type="button" className={`table-sheet-choice ${used ? "table-sheet-used" : ""} ${!used && potential === 0 ? "table-sheet-zero" : ""}`} title={t(yahtzeeScoreHelp[key])} disabled={!canAct || used || potential === null} onClick={() => onChoose({ category: key, label, points: potential })}>
          <span>{used && <span className="table-sheet-check" aria-hidden="true">✓</span>}{t(label)}</span><strong>{scores[key] ?? "—"}</strong><span>{used ? "✓" : potential === null ? "—" : `+${potential}`}</span>
        </button>
      </div>;
    })}</div>
    <footer><span>{t("Score total")}</span><strong>{yahtzeeTotal(scores)}</strong></footer>
  </section>;
}
