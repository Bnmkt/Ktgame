import { DiceThrowTray, Die } from "./GamePieces.jsx";
import { yahtzeePotentialScore } from "./GameSupport.jsx";
import { OtherPlayerRolls, ScorePanel } from "../room/RoomPanels.jsx";
import { gameTitle, scoreCategories } from "../../features/games/config.js";
import { farkleSuggestions, shutTileCombinations } from "../../features/games/farkle/model.js";

export const publicDiceGames = new Set(["yahtzee", "421", "cul-de-chouette", "farkle", "shut-the-box"]);

export function PublicDiceBoard({ state }) {
  const current = state.players[state.currentPlayerIndex];
  const dice = state.dice ?? [];
  const count = state.gameId === "yahtzee" ? 5 : state.gameId === "farkle" ? state.remainingDice || 6 : state.gameId === "shut-the-box" ? 2 : 3;
  const choices = state.finished ? [] : state.gameId === "yahtzee"
    ? scoreCategories.filter(([key]) => state.scores[current?.id]?.[key] === undefined).map(([key, label]) => ({ label, value: dice.length === 5 ? `${yahtzeePotentialScore(dice, key)} pts` : "-" }))
    : state.gameId === "farkle" ? farkleSuggestions(dice).map((row) => ({ label: row.label, value: `${row.values.join(" · ")} : ${row.points} pts` }))
    : state.gameId === "shut-the-box" ? shutTileCombinations(state.boxes[current?.id], state.lastTotal).map((values) => ({ label: values.join(" + "), value: String(state.lastTotal) })) : [];
  const combination = state.gameId === "421" ? state.currentCombination : state.gameId === "cul-de-chouette" && state.lastRoll?.playerId === current?.id && state.lastRoll.pending ? state.lastRoll : null;
  return <div className="public-dice-board">
    {!state.finished && <>
      <DiceThrowTray label={`Piste de ${gameTitle(state.gameId)}`} caption={current?.pseudo ?? "Lancer en cours"}>
        {(dice.length ? dice : Array(count).fill(null)).map((value, index) => <Die key={`${index}-${value}-${state.rollsLeft}`} value={value} kept={state.kept?.includes(index)} animate={!state.kept?.includes(index)} skin={current?.cosmetics?.equipped?.diceSkin} />)}
      </DiceThrowTray>
      {state.rollsLeft !== undefined && <p>{state.rollsLeft} lancer(s) restant(s)</p>}
      {state.turnScore !== undefined && <p>Points du tour : {state.turnScore}</p>}
      {combination && <section className="four-twenty-one-combo"><span>Combinaison en cours</span><strong>{combination.label}</strong>{combination.points !== undefined && <small>{combination.points} points</small>}</section>}
      {choices.length > 0 && <section className="public-dice-choices"><h3>Combinaisons disponibles</h3><dl>{choices.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>}
      {state.bust && <p>Aucune combinaison possible</p>}
    </>}
    <OtherPlayerRolls state={state} userId="" />
    <section className="public-dice-scores"><h3>Scores</h3><ScorePanel state={state} userId="" /></section>
  </div>;
}
