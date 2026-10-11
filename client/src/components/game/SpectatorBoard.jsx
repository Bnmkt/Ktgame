import { useLocale } from "../../locales/LocaleProvider.jsx";
import { BeloteBoard } from "./BeloteBoard.jsx";
import { Die, PlayingCard } from "./GamePieces.jsx";
import { DisplayName } from "../cosmetics/Cosmetics.jsx";
import { yahtzeeTotal } from "./GameSupport.jsx";
import { PublicDiceBoard, publicDiceGames } from "./PublicDiceBoard.jsx";

export function SpectatorBoard({ state, user }) {
  const { t: localeText } = useLocale();
  if (state.gameId === "belote") return <BeloteBoard state={state} user={user} spectator />;
  if (publicDiceGames.has(state.gameId)) return <PublicDiceBoard state={state} />;
  const skin = user.cosmetics?.equipped?.cardSkin ?? "default";
  const cards = (list = [], label = "Cartes publiques") => <div className="spectator-cards" aria-label={localeText(label)}>{list.map((card, index) => <PlayingCard key={index} card={card?.hidden ? null : card} skin={skin} />)}</div>;
  const score = (player) => {
    if (state.gameId === "yahtzee") return yahtzeeTotal(state.scores?.[player.id] ?? {});
    return state.scores?.[player.id] ?? state.stacks?.[player.id] ?? state.prestige?.[player.id] ?? state.cardCounts?.[player.id] ?? state.diceCounts?.[player.id] ?? "-";
  };
  return <div className="spectator-board">
    <div className="spectator-players">{state.players.map((player, index) => <article key={player.id} className={index === state.currentPlayerIndex && !state.finished ? "active" : ""}><DisplayName user={player} /><strong>{score(player)}</strong>{state.hands?.[player.id]?.length > 0 && <small>{state.hands[player.id].length} {state.gameId === "liars-dice" ? localeText("dés cachés") : localeText("cartes en main")}</small>}{state.bets?.[player.id] !== undefined && <small>{localeText("Mise :") + " "}{state.bets[player.id]}</small>}</article>)}</div>
    {state.dice?.length > 0 && <div className="dice-row" aria-label={localeText("Dés publics")}>{state.dice.map((value, index) => <Die key={index} value={value} skin={state.players[state.currentPlayerIndex]?.cosmetics?.equipped?.diceSkin} />)}</div>}
    {state.rollsLeft !== undefined && <p>{state.rollsLeft}{" " + localeText("lancer(s) restant(s)")}</p>}
    {state.turnScore !== undefined && <p>{localeText("Points du tour :") + " "}{state.turnScore}</p>}
    {state.boxes && <div className="spectator-boxes">{Object.entries(state.boxes).map(([id, numbers]) => <section key={id}><DisplayName user={state.players.find((player) => player.id === id)} /><div>{numbers.map((number) => <span key={number}>{number}</span>)}</div></section>)}</div>}
    {state.gameId === "liars-dice" && <section><h3>{localeText("Enchère")}</h3><p>{state.bid ? localeText("{value0} dés de {value1}", { value0: state.bid.quantity, value1: state.bid.face }) : localeText("En attente")}</p>{state.lastReveal && <p>{localeText("Dernière contestation :") + " "}{state.lastReveal.actual}{" " + localeText("dés de") + " "}{state.lastReveal.face}</p>}</section>}
    {state.gameId === "midnight-dice" && <><h3>{localeText("Marché")}</h3><div className="dice-row">{(state.market ?? []).map((value, index) => <Die key={index} value={value} />)}</div>{Object.entries(state.trays ?? {}).map(([id, dice]) => <section key={id}><DisplayName user={state.players.find((player) => player.id === id)} /><div className="dice-row">{dice.map((value, index) => <Die key={index} value={value} />)}</div></section>)}</>}
    {state.gameId === "blackjack" && <><h3>{localeText("Croupier")}</h3>{cards(state.dealer)}{state.players.filter((player) => state.shownPlayerIds?.includes(player.id)).map((player) => <section key={player.id}><DisplayName user={player} />{cards(state.hands[player.id])}</section>)}</>}
    {state.gameId === "texas-holdem" && <><h3>{state.street}{" " + localeText("· Pot :") + " "}{state.pot}</h3>{cards(state.community)}{state.players.filter((player) => state.shownPlayerIds?.includes(player.id)).map((player) => <section key={player.id}><DisplayName user={player} />{cards(state.hands[player.id])}</section>)}</>}
    {state.gameId === "president" && <><h3>{state.currentSet ? localeText("Combinaison : {value0} × {value1}", { value0: state.currentSet.count, value1: state.currentSet.rank }) : localeText("Nouvelle ouverture")}{state.revolution ? localeText(" · Révolution") : ""}</h3>{cards(state.pile?.at(-1)?.cards)}<div>{(state.finishedOrder ?? []).map((id, index) => <p key={id}>{index + 1}. <DisplayName user={state.players.find((player) => player.id === id)} /></p>)}</div></>}
    {state.gameId === "bataille" && <div className="spectator-lanes">{(state.battleLanes ?? []).map((lane) => <section key={lane.id}><h3>{localeText("Pile") + " "}{lane.id}</h3>{cards(lane.cards)}</section>)}</div>}
    {state.gameId === "golf-solitaire" && <><h3>{localeText("Tableau")}</h3><div className="spectator-columns">{state.tableau.map((column, index) => <section key={index}>{cards(column)}</section>)}</div><h3>{localeText("Défausse ·") + " "}{state.stockCount}{" " + localeText("cartes en pioche")}</h3>{cards([state.waste])}</>}
    {state.gameId === "accordion" && <><h3>{state.piles.length}{" " + localeText("piles")}</h3>{cards(state.piles.map((pile) => pile.at(-1)))}</>}
    {state.gameId === "velvet-ruse" && <><h3>{localeText("Influence")}</h3>{cards([state.edict])}<h3>{localeText("Déclaration")}</h3>{state.pendingClaim ? cards([state.pendingClaim.claim]) : <p>{localeText("Aucune déclaration en attente")}</p>}<h3>{localeText("Dossier :") + " "}{state.dossier.length}</h3>{cards(state.dossier.map((entry) => entry.claim))}</>}
  </div>;
}
