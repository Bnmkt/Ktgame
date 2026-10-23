import { useLocale } from "../../locales/LocaleProvider.jsx";
import { DiceThrowTray, Die } from "./GamePieces.jsx";
import { DiceScoreStrip } from "./DiceScoreStrip.jsx";
import { yahtzeePotentialScore } from "./GameSupport.jsx";
import { OtherPlayerRolls, ScorePanel } from "../room/RoomPanels.jsx";
import { gameTitle, scoreCategories } from "../../features/games/config.js";
import { ScoreDisclosure } from "../room/ScoreDisclosure.jsx";
import "../room/mobile-room.css";
import { farkleSuggestions, shutTileCombinations } from "../../features/games/farkle/model.js";

export const publicDiceGames = new Set(["yahtzee", "421", "cul-de-chouette", "farkle", "shut-the-box"]);

export function PublicDiceBoard({ state }) {
  const { t: localeText } = useLocale();
  const current = state.players[state.currentPlayerIndex];
  const dice = state.dice ?? [];
  const count = state.gameId === "yahtzee" ? 5 : state.gameId === "farkle" ? state.remainingDice || 6 : state.gameId === "shut-the-box" ? 2 : 3;
  const choices = state.finished ? [] : state.gameId === "yahtzee"
    ? scoreCategories.filter(([key]) => state.scores[current?.id]?.[key] === undefined).map(([key, label]) => ({ label, value: dice.length === 5 ? `${yahtzeePotentialScore(dice, key)} pts` : "-" }))
    : state.gameId === "farkle" ? farkleSuggestions(dice).map((row) => ({ label: row.label, value: `${row.values.join(" · ")} : ${row.points} pts` }))
    : state.gameId === "shut-the-box" ? shutTileCombinations(state.boxes[current?.id], state.lastTotal).map((values) => ({ label: values.join(" + "), value: String(state.lastTotal) })) : [];
  const combination = state.gameId === "421" ? state.currentCombination : state.gameId === "cul-de-chouette" && state.lastRoll?.playerId === current?.id && state.lastRoll.pending ? state.lastRoll : null;
  return <div className="public-dice-board">
    <DiceScoreStrip state={state} />
    {!state.finished && <>
      <DiceThrowTray label={localeText("Piste de {value0}", { value0: gameTitle(state.gameId) })} caption={current?.pseudo ?? localeText("Lancer en cours")}>
        {(dice.length ? dice : Array(count).fill(null)).map((value, index) => <Die key={`${index}-${value}-${state.rollsLeft}`} value={value} kept={state.kept?.includes(index)} animate={!state.kept?.includes(index)} skin={current?.cosmetics?.equipped?.diceSkin} />)}
      </DiceThrowTray>
      {state.rollsLeft !== undefined && <p>{state.rollsLeft}{" " + localeText("lancer(s) restant(s)")}</p>}
      {state.turnScore !== undefined && <p>{localeText("Points du tour :") + " "}{state.turnScore}</p>}
      {combination && <section className="four-twenty-one-combo"><span>{localeText("Combinaison en cours")}</span><strong>{localeText(combination.label)}</strong>{combination.points !== undefined && <small>{combination.points}{" " + localeText("points")}</small>}</section>}
      {choices.length > 0 && <section className="public-dice-choices"><h3>{localeText("Combinaisons disponibles")}</h3><dl>{choices.map(({ label, value }) => <div key={label}><dt>{localeText(label)}</dt><dd>{value}</dd></div>)}</dl></section>}
      {state.bust && <p>{localeText("Aucune combinaison possible")}</p>}
    </>}
    <OtherPlayerRolls state={state} userId="" />
    <ScoreDisclosure className="public-dice-scores"><ScorePanel state={state} userId="" /></ScoreDisclosure>
  </div>;
}
