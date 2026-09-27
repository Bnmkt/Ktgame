import { BeloteBoard } from "./BeloteBoard.jsx";
import { Die, PlayingCard } from "./GamePieces.jsx";
import { DisplayName } from "../cosmetics/Cosmetics.jsx";
import { yahtzeeTotal } from "./GameSupport.jsx";
import { PublicDiceBoard, publicDiceGames } from "./PublicDiceBoard.jsx";

export function SpectatorBoard({ state, user }) {
  if (state.gameId === "belote") return <BeloteBoard state={state} user={user} spectator />;
  if (publicDiceGames.has(state.gameId)) return <PublicDiceBoard state={state} />;
  const skin = user.cosmetics?.equipped?.cardSkin ?? "default";
  const cards = (list = [], label = "Cartes publiques") => <div className="spectator-cards" aria-label={label}>{list.map((card, index) => <PlayingCard key={index} card={card?.hidden ? null : card} skin={skin} />)}</div>;
  const score = (player) => {
    if (state.gameId === "yahtzee") return yahtzeeTotal(state.scores?.[player.id] ?? {});
    return state.scores?.[player.id] ?? state.stacks?.[player.id] ?? state.prestige?.[player.id] ?? state.cardCounts?.[player.id] ?? state.diceCounts?.[player.id] ?? "-";
  };
  return <div className="spectator-board">
    <div className="spectator-players">{state.players.map((player, index) => <article key={player.id} className={index === state.currentPlayerIndex && !state.finished ? "active" : ""}><DisplayName user={player} /><strong>{score(player)}</strong>{state.hands?.[player.id]?.length > 0 && <small>{state.hands[player.id].length} {state.gameId === "liars-dice" ? "dés cachés" : "cartes en main"}</small>}{state.bets?.[player.id] !== undefined && <small>Mise : {state.bets[player.id]}</small>}</article>)}</div>
    {state.dice?.length > 0 && <div className="dice-row" aria-label="Dés publics">{state.dice.map((value, index) => <Die key={index} value={value} skin={state.players[state.currentPlayerIndex]?.cosmetics?.equipped?.diceSkin} />)}</div>}
    {state.rollsLeft !== undefined && <p>{state.rollsLeft} lancer(s) restant(s)</p>}
    {state.turnScore !== undefined && <p>Points du tour : {state.turnScore}</p>}
    {state.boxes && <div className="spectator-boxes">{Object.entries(state.boxes).map(([id, numbers]) => <section key={id}><DisplayName user={state.players.find((player) => player.id === id)} /><div>{numbers.map((number) => <span key={number}>{number}</span>)}</div></section>)}</div>}
    {state.gameId === "liars-dice" && <section><h3>Enchère</h3><p>{state.bid ? `${state.bid.quantity} dés de ${state.bid.face}` : "En attente"}</p>{state.lastReveal && <p>Dernière contestation : {state.lastReveal.actual} dés de {state.lastReveal.face}</p>}</section>}
    {state.gameId === "midnight-dice" && <><h3>Marché</h3><div className="dice-row">{(state.market ?? []).map((value, index) => <Die key={index} value={value} />)}</div>{Object.entries(state.trays ?? {}).map(([id, dice]) => <section key={id}><DisplayName user={state.players.find((player) => player.id === id)} /><div className="dice-row">{dice.map((value, index) => <Die key={index} value={value} />)}</div></section>)}</>}
    {state.gameId === "blackjack" && <><h3>Croupier</h3>{cards(state.dealer)}{state.players.filter((player) => state.shownPlayerIds?.includes(player.id)).map((player) => <section key={player.id}><DisplayName user={player} />{cards(state.hands[player.id])}</section>)}</>}
    {state.gameId === "texas-holdem" && <><h3>{state.street} · Pot : {state.pot}</h3>{cards(state.community)}{state.players.filter((player) => state.shownPlayerIds?.includes(player.id)).map((player) => <section key={player.id}><DisplayName user={player} />{cards(state.hands[player.id])}</section>)}</>}
    {state.gameId === "president" && <><h3>{state.currentSet ? `Combinaison : ${state.currentSet.count} × ${state.currentSet.rank}` : "Nouvelle ouverture"}{state.revolution ? " · Révolution" : ""}</h3>{cards(state.pile?.at(-1)?.cards)}<div>{(state.finishedOrder ?? []).map((id, index) => <p key={id}>{index + 1}. <DisplayName user={state.players.find((player) => player.id === id)} /></p>)}</div></>}
    {state.gameId === "bataille" && <div className="spectator-lanes">{(state.battleLanes ?? []).map((lane) => <section key={lane.id}><h3>Pile {lane.id}</h3>{cards(lane.cards)}</section>)}</div>}
    {state.gameId === "golf-solitaire" && <><h3>Tableau</h3><div className="spectator-columns">{state.tableau.map((column, index) => <section key={index}>{cards(column)}</section>)}</div><h3>Défausse · {state.stockCount} cartes en pioche</h3>{cards([state.waste])}</>}
    {state.gameId === "accordion" && <><h3>{state.piles.length} piles</h3>{cards(state.piles.map((pile) => pile.at(-1)))}</>}
    {state.gameId === "velvet-ruse" && <><h3>Influence</h3>{cards([state.edict])}<h3>Déclaration</h3>{state.pendingClaim ? cards([state.pendingClaim.claim]) : <p>Aucune déclaration en attente</p>}<h3>Dossier : {state.dossier.length}</h3>{cards(state.dossier.map((entry) => entry.claim))}</>}
  </div>;
}
