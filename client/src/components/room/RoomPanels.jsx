import { useLocale } from "../../locales/LocaleProvider.jsx";
import { Mascot, gameMascot } from "../mascots/Mascot.jsx";
import { ConfirmActionButton } from "../common/ConfirmAction.jsx";
import React, { useState } from "react";
import { BadgeCheck, Bot, Crown, Eye, EyeOff, HelpCircle, Play, ReceiptText, Save, Settings, Swords, UserMinus, X } from "lucide-react";
import { Die } from "../game/GamePieces.jsx";
import { DisplayName } from "../cosmetics/Cosmetics.jsx";
import { blackjackDealerDisplay, blackjackTotal, yahtzeeTotal, yahtzeeUpperTotal } from "../game/GameSupport.jsx";
import { gameModifierDefinitions, gameTitle, payoutRatesForPlayerCount, scoreCategories, yahtzeeFixedScores, yahtzeeScoreHelp } from "../../features/games/config.js";
import { midnightContractInfo, midnightContractLabel, midnightContractTiers } from "../../features/games/midnightDice/model.js";
import { CompactNumber, formatTime } from "../../utils/presentation.jsx";
import { RankBadge } from "../../features/games/RankedPlay.jsx";
import { isFundedPlayer } from "../../features/games/token-economy.js";

function MidnightContractBadge({ contract }) {
  const { t: localeText } = useLocale();
  const info = midnightContractInfo[contract];
  const tier = midnightContractTiers[info?.tier];
  return <span className="midnight-score-contract" style={{ "--contract-accent": tier?.accent ?? "#c7d0d8" }}><i />{midnightContractLabel(contract)}<small>{localeText(tier?.label)}</small></span>;
}

export function ScorePanel({ state, userId }) {
  const { t: localeText } = useLocale();
  if (state?.gameId === "belote") return <table className="score-table"><thead><tr><th>{localeText("Équipe")}</th><th>{localeText("Points")}</th><th>{localeText("Plis")}</th></tr></thead><tbody>{[0, 1].map((team) => <tr key={team}><td>{state.players.filter((_, index) => index % 2 === team).map((player) => <div key={player.id}><DisplayName user={player} /></div>)}</td><td>{state.teamScores[team]} / {state.targetScore}</td><td>{state.trickCounts[team]}</td></tr>)}</tbody></table>;
  if (!state) return null;
  if (state.gameId === "yahtzee") {
    return (
      <div className="yahtzee-score-panel">
        <div className="score-seat-legend">{state.players.map((player, index) => <span key={player.id}><b>{localeText("J")}{index + 1}</b><DisplayName user={player} /></span>)}</div>
        <div className="score-scroll">
        <table className="score-table">
          <thead><tr><th>{localeText("Case")}</th>{state.players.map((p, index) => <th className={p.id === userId ? "own-player-column" : ""} key={p.id} title={p.pseudo}>{localeText("J")}{index + 1}</th>)}</tr></thead>
          <tbody>
            <tr className="total-row yahtzee-total-row"><td>{localeText("Score total")}</td>{state.players.map((p) => <td className={p.id === userId ? "own-player-column" : ""} key={p.id}>{yahtzeeTotal(state.scores[p.id])}</td>)}</tr>
            {scoreCategories.map(([key, label], index) => <React.Fragment key={key}><tr><td><span>{localeText(label)}</span>{yahtzeeFixedScores[key] ? <small>{yahtzeeFixedScores[key]}{" " + localeText("pts")}</small> : <small className="score-help" title={yahtzeeScoreHelp[key]}><HelpCircle size={12} />{" " + localeText("Calcul du score")}</small>}</td>{state.players.map((p) => <td className={p.id === userId ? "own-player-column" : ""} key={p.id}>{state.scores[p.id]?.[key] ?? "-"}</td>)}</tr>{index === 5 && <tr className="upper-bonus-row"><td><span>{localeText("Bonus supérieur")}</span><small title={localeText("35 points lorsque les cases As à Six totalisent au moins 63 points")}><HelpCircle size={12} />{" " + localeText("Seuil: 63 · bonus: 35 pts")}</small></td>{state.players.map((p) => { const upper = yahtzeeUpperTotal(state.scores[p.id]); const acquired = upper >= 63; return <td className={`${acquired ? "bonus-acquired" : "bonus-pending"} ${p.id === userId ? "own-player-column" : ""}`} key={p.id}><strong>{acquired ? "+35" : localeText("Non acquis")}</strong><small>{upper}/63</small></td>; })}</tr>}</React.Fragment>)}
          </tbody>
        </table>
        </div>
      </div>
    );
  }
  if (state.gameId === "cul-de-chouette") return <table className="score-table"><thead><tr><th>{localeText("Joueur")}</th><th>{localeText("Cumul")}</th></tr></thead><tbody>{state.players.map((p) => <tr key={p.id}><td><DisplayName user={p} /></td><td><CompactNumber value={state.scores[p.id] ?? 0} label={localeText("Score cumulé exact")} /></td></tr>)}</tbody></table>;
  if (state.gameId === "421") return <table className="score-table"><thead><tr><th>{localeText("Joueur")}</th><th>{localeText("Manche")}</th><th>{localeText("Cumul")}</th></tr></thead><tbody>{state.players.map((p) => { const r = (state.results ?? []).find((row) => row.playerId === p.id); return <tr key={p.id}><td><DisplayName user={p} /></td><td>{r ? `${r.dice.join(" ")} · ${r.label ?? "Score"}` : localeText("En attente")}</td><td><CompactNumber value={state.scores?.[p.id] ?? 0} label={localeText("Score cumulé exact")} /></td></tr>; })}</tbody></table>;
  if (state.gameId === "blackjack") return <BlackjackScoresTable state={state} userId={userId} />;
  if (state.gameId === "texas-holdem") return <table className="score-table"><thead><tr><th>{localeText("Joueur")}</th><th>{localeText("Tapis / récupéré")}</th><th>{localeText("Engagé")}</th><th>{localeText("Statut")}</th></tr></thead><tbody>{state.players.map((p, index) => { const departed = state.departedPayouts?.[p.id] !== undefined; return <tr key={p.id}><td><DisplayName user={p} />{index === state.dealerIndex ? <small>{" " + localeText("Donneur")}</small> : null}</td><td><CompactNumber value={departed ? state.departedPayouts[p.id] : state.stacks[p.id] ?? 0} label={localeText("Tapis exact")} /></td><td><CompactNumber value={state.contributions[p.id] ?? 0} label={localeText("Somme engagée exacte")} /></td><td>{departed ? localeText("Parti · récupéré") : state.foldedPlayerIds.includes(p.id) ? localeText("Couché") : state.allInPlayerIds.includes(p.id) ? localeText("Tapis") : state.finished ? (state.winners.includes(p.id) ? localeText("Gagnant") : localeText("Terminé")) : index === state.currentPlayerIndex ? localeText("À jouer") : localeText("En jeu")}</td></tr>; })}</tbody></table>;
  if (state.gameId === "bataille") return <table className="score-table"><thead><tr><th>{localeText("Joueur")}</th><th>{localeText("Cartes")}</th><th>{localeText("Action")}</th></tr></thead><tbody>{state.players.map((p) => { const thinking = state.botThinking?.[p.id]?.phase; const status = state.resolutionEndsAt ? "Résolution…" : state.submittedPlayerIds?.includes(p.id) ? "Placement validé" : thinking === "draw" ? "Réfléchit…" : thinking === "place" ? "Observe sa carte…" : state.drawnCards?.[p.id] ? "Carte piochée" : "À piocher"; return <tr key={p.id}><td><DisplayName user={p} /></td><td>{state.cardCounts?.[p.id] ?? state.piles[p.id]?.length ?? 0}</td><td>{status}</td></tr>; })}</tbody></table>;
  if (state.gameId === "farkle") return <table className="score-table"><thead><tr><th>{localeText("Joueur")}</th><th>{localeText("Total")}</th></tr></thead><tbody>{state.players.map((p) => <tr key={p.id}><td><DisplayName user={p} /></td><td><CompactNumber value={state.scores[p.id] ?? 0} label={localeText("Score exact")} /></td></tr>)}</tbody></table>;
  if (state.gameId === "liars-dice") return <table className="score-table"><thead><tr><th>{localeText("Joueur")}</th><th>{localeText("Dés")}</th></tr></thead><tbody>{state.players.map((p) => <tr key={p.id}><td><DisplayName user={p} /></td><td>{state.diceCounts[p.id] ?? 0}</td></tr>)}</tbody></table>;
  if (state.gameId === "shut-the-box") return <table className="score-table"><thead><tr><th>{localeText("Joueur")}</th><th>{localeText("Score")}</th><th>{localeText("Ouvertes")}</th></tr></thead><tbody>{state.players.map((p) => <tr key={p.id}><td><DisplayName user={p} /></td><td>{state.scores[p.id] ?? "-"}</td><td>{state.boxes[p.id]?.join(" ") || "-"}</td></tr>)}</tbody></table>;
  if (state.gameId === "golf-solitaire") return <table className="score-table"><tbody><tr><td>{localeText("Cartes tableau")}</td><td>{state.tableau.reduce((sum, column) => sum + column.length, 0)}</td></tr><tr><td>{localeText("Pioche")}</td><td>{state.stock.length}</td></tr><tr><td>{localeText("Score")}</td><td>{state.score ?? "-"}</td></tr></tbody></table>;
  if (state.gameId === "accordion") return <table className="score-table"><tbody><tr><td>{localeText("Piles restantes")}</td><td>{state.piles.length}</td></tr><tr><td>{localeText("Score")}</td><td>{state.score ?? "-"}</td></tr></tbody></table>;
  if (state.gameId === "midnight-dice") return <table className="score-table"><thead><tr><th>{localeText("Joueur")}</th><th>{localeText("Mandat")}</th><th>{localeText("Score")}</th></tr></thead><tbody>{state.players.map((p) => <tr key={p.id}><td><DisplayName user={p} /></td><td>{state.secretContracts?.[p.id] ? <MidnightContractBadge contract={state.secretContracts[p.id]} /> : state.phase === "contract" ? localeText("À choisir") : localeText("Secret")}</td><td>{state.scores?.[p.id] ?? 0}</td></tr>)}</tbody></table>;
  if (state.gameId === "velvet-ruse") return <table className="score-table"><thead><tr><th>{localeText("Joueur")}</th><th>{localeText("Cartes")}</th><th>{localeText("Prestige")}</th></tr></thead><tbody>{state.players.map((p) => <tr key={p.id}><td><DisplayName user={p} /></td><td>{state.hands?.[p.id]?.length ?? 0}</td><td>{state.prestige?.[p.id] ?? 0} / {state.modifiers?.targetPrestige ?? 20}</td></tr>)}</tbody></table>;
  return <table className="score-table"><thead><tr><th>{localeText("Joueur")}</th><th>{localeText("Cartes")}</th><th>{localeText("Statut")}</th></tr></thead><tbody>{state.players.map((p) => <tr key={p.id}><td><DisplayName user={p} /></td><td>{state.hands?.[p.id]?.length ?? 0}</td><td>{state.finishedOrder?.includes(p.id) ? localeText("Sorti #{value0}", { value0: state.finishedOrder.indexOf(p.id) + 1 }) : localeText("En jeu")}</td></tr>)}</tbody></table>;
}

export function WagerPanel({ room, state }) {
  const { t: localeText } = useLocale();
  if (!state) return null;
  if (room.ranked && room.gameId !== "texas-holdem") return <section className="card"><h2>{localeText("Rangs de la table")}</h2><table className="score-table"><thead><tr><th>{localeText("Joueur")}</th><th>{localeText("Rang")}</th></tr></thead><tbody>{room.ranked.roster.map((player)=><tr key={player.id}><td><DisplayName user={room.players.find((row)=>row.id===player.id) ?? player}/></td><td><RankBadge rank={room.ranked.results?.find((row)=>row.userId===player.id)?.afterRank ?? player.rank}/></td></tr>)}</tbody></table></section>;
  if (state.gameId === "texas-holdem") return <section className="card"><h2>{localeText("Caves et pot")}</h2><p>{localeText("La cave de") + " "}<strong><CompactNumber value={state.buyIn ?? room.stake} label={localeText("Cave exacte")} /></strong>{" " + localeText("jetons est ton tapis de départ. Tout solde restant est recrédité à la fin.")}</p><div className="payout-split"><span>{localeText("Pot actuel") + " "}<strong><CompactNumber value={state.pot} label={localeText("Pot exact")} /></strong></span><span>{localeText("Petite blinde") + " "}<strong><CompactNumber value={state.smallBlind} /></strong></span><span>{localeText("Grosse blinde") + " "}<strong><CompactNumber value={state.bigBlind} /></strong></span><span>{localeText("Mise max.") + " "}<strong><CompactNumber value={state.maximumBet} /></strong></span></div></section>;
  const hasRoomStake = Number(room.stake) > 0;
  const isBlackjack = state.gameId === "blackjack";
  if (!hasRoomStake && !isBlackjack) return null;
  const paidPlayers = room.players.filter(isFundedPlayer);
  const pot = Number(room.stake) * paidPlayers.length;
  const projectedRanks = state.gameId === "yahtzee" ? [...paidPlayers].sort((a, b) => yahtzeeTotal(state.scores?.[b.id]) - yahtzeeTotal(state.scores?.[a.id])).slice(0, 3) : paidPlayers.slice(0, 3);
  const payoutRates = payoutRatesForPlayerCount(paidPlayers.length);
  return (
    <section className="card">
      <h2>{localeText("Mises")}</h2>
      {hasRoomStake && <p>{localeText("Pot du salon :") + " "}<strong><CompactNumber value={pot} label={localeText("Pot exact")} /></strong>{" " + localeText("jetons · distribution") + " "}<strong>{payoutRates.join(" / ")}</strong></p>}
      {hasRoomStake && <div className="payout-split">{payoutRates.map((rate, index) => <span key={rate}>{index + 1}{localeText("e") + " "}<strong><CompactNumber value={Math.floor(pot * (rate / 100))} label={localeText("Gain exact de la place {value0}", { value0: index + 1 })} /></strong></span>)}</div>}
      <table className="score-table">
        <thead><tr><th>{localeText("Joueur")}</th><th>{localeText("Mise")}</th><th>{localeText("Gain possible")}</th></tr></thead>
        <tbody>
          {state.players.filter((p) => !p.isBot).map((p) => {
            const funded = isFundedPlayer(p);
            const blackjackBet = state.bets?.[p.id] ?? 0;
            const rankIndex = projectedRanks.findIndex((player) => player.id === p.id);
            const projectedRoomGain = rankIndex >= 0 ? Math.floor(pot * ((payoutRates[rankIndex] ?? 0) / 100)) : 0;
            const actualRoomGain = state.roomPayouts?.[p.id] ?? 0;
            const possible = funded ? (state.finished ? actualRoomGain : projectedRoomGain) + (isBlackjack && blackjackBet ? blackjackBet * 2 : 0) : 0;
            return <tr key={p.id}><td><DisplayName user={p} /></td><td>{funded ? <CompactNumber value={Number(room.stake) + blackjackBet} label={localeText("Mise exacte")} /> : localeText("Démonstration")}</td><td>{possible ? <CompactNumber value={possible} label={localeText("Gain possible exact")} /> : "-"}</td></tr>;
          })}
        </tbody>
      </table>
    </section>
  );
}

export function FinishedLeaderboard({ room, state }) {
  const { t: localeText } = useLocale();
  if (!state?.finished) return null;
  const participants=room.ranked ? room.ranked.roster.map((player)=>({...player,...state.players.find((row)=>row.id===player.id)})).sort((a,b)=>(room.ranked.results?.find((row)=>row.userId===a.id)?.position ?? 99)-(room.ranked.results?.find((row)=>row.userId===b.id)?.position ?? 99)) : state.ranking?.length ? state.ranking : state.players;
  const rows = participants.map((p) => {
    const yahtzee = state.gameId === "yahtzee" ? yahtzeeTotal(state.scores[p.id]) : null;
    const fourTwentyOne = state.gameId === "421" ? state.scores?.[p.id] ?? 0 : null;
    const cul = state.gameId === "cul-de-chouette" ? state.scores[p.id] ?? 0 : null;
    const cards = state.gameId === "bataille" ? state.cardCounts?.[p.id] ?? state.piles[p.id]?.length ?? 0 : null;
    const handScore = state.gameId === "blackjack" ? blackjackTotal(state.hands[p.id] ?? []) : null;
    const pokerStack = state.gameId === "texas-holdem" ? state.stacks[p.id] ?? 0 : null;
    const farkle = state.gameId === "farkle" ? state.scores[p.id] ?? 0 : null;
    const shut = state.gameId === "shut-the-box" ? state.scores[p.id] ?? state.boxes[p.id]?.reduce((sum, value) => sum + value, 0) ?? 0 : null;
    const golf = state.gameId === "golf-solitaire" ? state.score ?? 0 : null;
    const accordion = state.gameId === "accordion" ? state.score ?? state.piles.length : null;
    const liar = state.gameId === "liars-dice" ? state.diceCounts[p.id] ?? 0 : null;
    const midnight = state.gameId === "midnight-dice" ? state.scores?.[p.id] ?? 0 : null;
    const velvet = state.gameId === "velvet-ruse" ? state.prestige?.[p.id] ?? 0 : null;
    const payout = state.gameId === "texas-holdem" ? (state.departedPayouts?.[p.id] ?? state.roomPayouts?.[p.id] ?? 0) : (state.payouts?.[p.id] ?? 0) + (state.roomPayouts?.[p.id] ?? 0);
    const score = p.score ?? yahtzee ?? fourTwentyOne ?? cul ?? cards ?? handScore ?? pokerStack ?? farkle ?? shut ?? golf ?? accordion ?? liar ?? midnight ?? velvet ?? (state.winners.includes(p.id) ? 1 : 0);
    return { ...p, score, payout, winner: state.winners.includes(p.id) };
  });
  return (
    <section className={`card leaderboard ${room.ranked ? "ranked-final-scores" : ""}`}>
      <h2>{localeText("Leaderboard final")}</h2>
      <table className="score-table">
        <thead><tr><th>#</th><th>{localeText("Joueur")}</th><th>{localeText("Score")}</th><th>{room.ranked?localeText("Évolution classée"):localeText("Gain")}</th></tr></thead>
        <tbody>{rows.map((row, index) => {const result=room.ranked?.results?.find((entry)=>entry.userId===row.id);return <tr key={row.id} className={row.winner ? "winner-row" : ""}><td>{result?.position ?? index + 1}</td><td><DisplayName user={row} /></td><td><CompactNumber value={row.score} label={localeText("Score exact")} /></td><td>{room.ranked ? result ? <div className="ranked-final-evolution"><RankBadge rank={result.beforeRank}/><span>→</span><RankBadge rank={result.afterRank}/>{result.placement ? <small>{result.placement.completed ? localeText("{value0} Elo", { value0: result.after }) : localeText("{value0} / {value1} placements", { value0: result.placement.games, value1: result.placement.required })}</small> : result.delta!==undefined && <strong className={result.delta<0?"ranked-loss":"ranked-gain"}>{result.delta>0?"+":""}{Number(result.delta.toFixed(2))}{" " + localeText("Elo")}<small>{result.before} → {result.after}</small></strong>}</div> : "—" : row.payout ? <CompactNumber value={row.payout} label={localeText("Gain exact")} /> : "-"}</td></tr>;})}</tbody>
      </table>
    </section>
  );
}

export function BlackjackScoresTable({ state, userId }) {
  const { t: localeText } = useLocale();
  const dealer = blackjackDealerDisplay(state);
  return (
    <table className="score-table">
      <thead><tr><th>{localeText("Main")}</th><th>{localeText("Score")}</th><th>{localeText("Mise")}</th></tr></thead>
      <tbody>
        <tr><td>{localeText("Dealer")}</td><td>{dealer.score}{!state.finished && state.dealer?.length > 1 ? " + ?" : ""}</td><td>-</td></tr>
        {state.players.filter((p) => !p.isBot).map((p) => { const visible = p.id === userId || state.shownPlayerIds?.includes(p.id); const folded = state.foldedPlayerIds?.includes(p.id); return (
          <tr key={p.id}><td><DisplayName user={p} />{folded ? <small>{" " + localeText("Couché")}</small> : null}</td><td>{visible && state.hands[p.id]?.length ? blackjackTotal(state.hands[p.id]) : state.hands[p.id]?.length ? localeText("Caché") : "-"}</td><td>{state.bets[p.id] ? <CompactNumber value={state.bets[p.id]} label={localeText("Mise exacte")} /> : "-"}</td></tr>
        ); })}
      </tbody>
    </table>
  );
}

export function ActionLog({ logs = [] }) {
  const { t: localeText } = useLocale();
  const [open, setOpen] = useState(false);
  const rows = [...logs].slice(-30).reverse();
  return (
    <div className="game-log-center">
      <button className="secondary game-log-button" onClick={() => setOpen((value) => !value)}><ReceiptText size={18} />{" " + localeText("Journal")}{rows.length ? <span>{rows.length}</span> : null}</button>
      {open && <section className="card action-log">
      <div className="modal-title-row"><h2>{localeText("Journal de la partie")}</h2><button className="secondary icon-toggle" onClick={() => setOpen(false)}><X size={16} /></button></div>
      {rows.length === 0 && <div className="empty-state">{localeText("Les actions de la partie apparaîtront ici.")}</div>}
      <div className="log-list">
        {rows.map((entry) => (
          <div className={`log-row log-${entry.type ?? "action"}`} key={entry.id}>
            <time>{formatTime(entry.at)}</time>
            <strong>{entry.actor}</strong>
            <span>{entry.text}</span>
          </div>
        ))}
      </div>
      </section>}
    </div>
  );
}

export function RoomStatusPanel({ room, state, current, userId, isOwner, onAddBot, onStart, onReady, onKick, onSettings, settingsSummary }) {
  const { t: localeText } = useLocale();
  const owner = room.players.find((p) => p.id === room.ownerId);
  const battleDrawnCount = Object.keys(state?.drawnCards ?? {}).length;
  const battlePlacedCount = state?.submittedPlayerIds?.length ?? 0;
  const humanCount = room.players.filter((player) => !player.isBot).length;
  const automaticBots = Math.max(0, (room.minPlayers ?? 1) - room.players.length);
  const waitingOtherHumans = room.players.filter((player) => !player.isBot && player.id !== room.ownerId && !(room.readyPlayerIds ?? []).includes(player.id));
  const canOwnerStart = isOwner && waitingOtherHumans.length === 0;
  return (
    <section className="card table-status-card">
      <div className="table-status-head">
        <div className="mascot-waiting-pair">
          {!state && <Mascot {...gameMascot(room.gameId)} flip tilt={-3} docked/>}
          <div>
          <span className="eyebrow">{localeText("Table")}</span>
          <h2>{state ? (state.finished ? localeText("Manche terminée") : localeText("Manche en cours")) : localeText("En attente")}</h2>
          </div>
        </div>
        {owner && <div className="room-master"><Crown size={16} /><span>{localeText("Maître")}</span><DisplayName user={owner} /></div>}
      </div>
      <div className="status-strip">
        <div>
          <span>{localeText("Jeu")}</span>
          <strong>{localeText(gameTitle(room.gameId))}</strong>
        </div>
        <div>
          <span>{["bataille", "blackjack"].includes(state?.gameId) ? localeText("Actions simultanées") : localeText("Joueur actif")}</span>
          <strong>{state?.finished ? "-" : state?.gameId === "bataille" ? localeText("{value0} piochée(s) · {value1}/{value2} placée(s)", { value0: battleDrawnCount, value1: battlePlacedCount, value2: state.players.length }) : state?.gameId === "blackjack" ? localeText("{value0} main(s) active(s)", { value0: Math.max(0, state.players.filter((player) => !player.isBot).length - (state.completedPlayerIds?.length ?? 0)) }) : current?.pseudo ?? "-"}</strong>
        </div>
        <div>
          <span>{localeText("Joueurs")}</span>
          <strong>{room.gameId === "texas-holdem" ? room.players.filter((player) => !player.isBot).length : room.players.length}</strong>
        </div>
        <div className="stake-status-item">
          <span>{room.gameId === "texas-holdem" ? localeText("Cave par joueur") : room.ranked ? localeText("Ton rang") : localeText("Mise par joueur")}</span>
          <strong>{room.ranked && room.gameId!=="texas-holdem" ? <RankBadge rank={room.ranked.roster.find((player)=>player.id===userId)?.rank}/> : <CompactNumber value={room.stake} suffix={localeText(" jetons")} label={localeText("Mise exacte")} />}</strong>
        </div>
      </div>
      <div className="players table-seats">{room.players.map((p) => { const readyClass = !state && !p.isBot ? (room.readyPlayerIds?.includes(p.id) ? "ready-player" : "not-ready-player") : ""; return <span key={p.id} className={`player-seat ${state?.gameId !== "bataille" && current?.id === p.id && !state?.finished ? "active-player" : ""} ${readyClass}`}><DisplayName user={p} />{room.ranked && <RankBadge rank={room.ranked.roster.find((player)=>player.id===p.id)?.rank}/>} {p.id === room.ownerId ? <small>{localeText("Maître")}</small> : null}{p.isBot ? <small>{localeText("IA")}</small> : !state ? <small>{room.readyPlayerIds?.includes(p.id) ? localeText("Prêt") : localeText("Pas prêt")}</small> : null}{isOwner && p.id !== userId && <ConfirmActionButton className="kick-button" title={localeText("Exclure ce joueur")} dialogTitle={localeText("Exclure ce joueur ?")} message={localeText("{value0} sera retiré de la table.{value1}", { value0: p.pseudo, value1: state && !state.finished ? " La manche est en cours : il ne pourra plus y participer." : "" })} confirmLabel={localeText("Exclure")} danger onConfirm={() => onKick(p.id)}><UserMinus size={14} /></ConfirmActionButton>}</span>; })}</div>
      {settingsSummary}
      {!state && humanCount === 1 && <div className="solo-start-notice"><Bot size={20} /><div><strong>{automaticBots ? localeText("{value0} IA {value1} au lancement", { value0: automaticBots, value1: automaticBots > 1 ? "seront ajoutées" : "sera ajoutée" }) : localeText("Démarrage solo prêt")}</strong><small>{automaticBots ? localeText("Ce jeu demande au moins {value0} participants. Tu es automatiquement prêt; la table complétera les places manquantes.", { value0: room.minPlayers }) : localeText("Tu es automatiquement prêt tant qu'aucun autre joueur réel ne rejoint la table.")}</small></div></div>}
      {!state && <div className="waiting-room-actions"><div className="actions"><button className={room.readyPlayerIds?.includes(userId) ? "secondary" : ""} onClick={onReady}><BadgeCheck size={18} /> {room.readyPlayerIds?.includes(userId) ? localeText("Annuler prêt") : localeText("Je suis prêt")}</button><button className="secondary room-settings-trigger" onClick={onSettings}><Settings size={18} />{" " + localeText("Paramètres de la table")}</button>{isOwner && <button className="secondary" onClick={onAddBot}><Bot size={18} />{" " + localeText("Ajouter une IA")}</button>}</div>{isOwner && <div className={`table-launch-zone ${canOwnerStart ? "launch-ready" : "launch-blocked"}`}><div><strong>{canOwnerStart ? localeText("La table peut démarrer") : localeText("Des joueurs ne sont pas prêts")}</strong><small>{canOwnerStart ? (room.readyPlayerIds?.includes(userId) ? localeText("Tous les joueurs sont prêts.") : localeText("En lançant, tu seras considéré comme prêt automatiquement.")) : localeText("En attente de {value0}.", { value0: waitingOtherHumans.map((player) => player.pseudo).join(", ") })}</small></div><button className="launch-game-button" disabled={!canOwnerStart} onClick={onStart}><Play size={19} />{" " + localeText("Démarrer la partie")}</button></div>}</div>}
      {!state && !isOwner && <p className="muted-line">{localeText("En attente du maître de table.")}</p>}
    </section>
  );
}

export function OtherPlayerRolls({ state, userId }) {
  const { t: localeText } = useLocale();
  const rolls = state.players.filter((player) => player.id !== userId && state.lastDiceByPlayer?.[player.id]?.length);
  if (!rolls.length) return null;
  return <section className="other-player-rolls" aria-label={localeText("Derniers lancers des autres joueurs")}>
    <h3>{localeText("Derniers lancers")}</h3>
    <div className="other-roll-list">{rolls.map((player) => <div className="other-roll" key={player.id}>
      <DisplayName user={player} />
      <div className="dice-row compact-dice-row">{state.lastDiceByPlayer[player.id].map((value, index) => <Die key={`${player.id}-${index}-${value}`} value={value} kept={false} skin={player.cosmetics?.equipped?.diceSkin ?? "default"} />)}</div>
    </div>)}</div>
  </section>;
}

export function BattleModifiersPanel({ value, isOwner, onChange, onSave, showFooter = true }) {
  const { t: localeText } = useLocale();
  const select = (key, nextValue) => isOwner && onChange({ ...value, [key]: nextValue });
  return <section className="card battle-modifiers-panel">
    <div className="panel-heading"><span>{localeText("Modificateurs de Bataille")}</span><small>{isOwner ? localeText("Configure la table avant le lancement.") : localeText("Paramètres définis par le maître de table.")}</small></div>
    <div className="battle-modifier-grid">
      <fieldset><legend>{localeText("Plateau")}</legend><div className="battle-option-row">{[["single", "Pile simple", "Une zone centrale"], ["double", "Pile double", "Deux choix tactiques"]].map(([id, label, help]) => <button type="button" className={value.pileMode === id ? "active" : ""} disabled={!isOwner} aria-pressed={value.pileMode === id} key={id} onClick={() => select("pileMode", id)}><strong>{localeText(label)}</strong><small>{help}</small></button>)}</div></fieldset>
      <fieldset><legend>{localeText("Calcul de la confrontation")}</legend><div className="battle-option-row scoring-options">{[["high-card", "Hauteur de carte", "La dernière carte décide"], ["pile-sum", "Addition des piles", "Les 2 cartes du dessus"], ["poker-combo", "Combo Poker", "Paire, Couleur et Suite sur les 2 cartes"]].map(([id, label, help]) => <button type="button" className={value.scoringMode === id ? "active" : ""} disabled={!isOwner} aria-pressed={value.scoringMode === id} key={id} onClick={() => select("scoringMode", id)}><strong>{localeText(label)}</strong><small>{help}</small></button>)}</div></fieldset>
      <fieldset><legend>{localeText("Retour des cartes isolées")}</legend><label className="battle-round-limit"><span><strong>{value.returnAfterRounds}{" " + localeText("manches")}</strong><small>{localeText("Sans confrontation avant le retour dans la pioche")}</small></span><input type="range" min="3" max="20" step="1" value={value.returnAfterRounds} disabled={!isOwner} onChange={(event) => select("returnAfterRounds", Number(event.target.value))} /><div><b>3</b><b>20</b></div></label></fieldset>
      <fieldset><legend>{localeText("Consultation de la pioche")}</legend><button type="button" className={`battle-visibility-toggle ${value.hiddenDeck ? "hidden-mode" : "active"}`} disabled={!isOwner} aria-pressed={value.hiddenDeck} onClick={() => select("hiddenDeck", !value.hiddenDeck)}>{value.hiddenDeck ? <EyeOff size={19} /> : <Eye size={19} />}<span><strong>{localeText("Pioche") + " "}{value.hiddenDeck ? localeText("cachée") : localeText("visible")}</strong><small>{value.hiddenDeck ? localeText("Estimation désactivée") : localeText("Probabilités selon les informations connues")}</small></span><b>{value.hiddenDeck ? localeText("ON") : localeText("OFF")}</b></button></fieldset>
    </div>
    {showFooter && isOwner && <div className="battle-modifier-footer"><span><Swords size={16} />{" " + localeText("Ces réglages seront verrouillés au lancement.")}</span><button type="button" className="secondary settings-save-button" onClick={onSave}><Save size={17} />{" " + localeText("Appliquer les modificateurs")}</button></div>}
  </section>;
}

export function GameModifiersPanel({ gameId, value, isOwner, onChange, onSave, showFooter = true }) {
  const { t: localeText } = useLocale();
  const fields = (gameModifierDefinitions[gameId] ?? []).filter((field) => gameId !== "blackjack" || !["minimumBet", "maximumBet"].includes(field.key));
  if (!fields.length || ["bataille", "texas-holdem"].includes(gameId)) return null;
  const change = (key, nextValue) => isOwner && onChange({ ...value, [key]: nextValue });
  return <section className="card game-modifiers-panel">
    <div className="panel-heading"><span><Settings size={18} />{" " + localeText("Variantes de la table")}</span><small>{isOwner ? localeText("Personnalise cette manche avant le lancement.") : localeText("Réglages choisis par le maître de table.")}</small></div>
    <div className="game-modifier-grid">{fields.map((field) => {
      const currentValue = value[field.key] ?? field.defaultValue;
      return <fieldset className={`game-modifier-control modifier-${field.type}`} key={field.key}>
        <legend>{localeText(field.label)}</legend>
        {field.type === "range" && <label className="modifier-range-card"><span><output>{Number(currentValue).toLocaleString("fr-FR")}</output><small>{field.help}</small></span><input type="range" min={field.min} max={field.max} step={field.step ?? 1} value={currentValue} disabled={!isOwner} onChange={(event) => change(field.key, Number(event.target.value))} /><div><b>{Number(field.min).toLocaleString("fr-FR")}</b><b>{Number(field.max).toLocaleString("fr-FR")}</b></div></label>}
        {field.type === "select" && <><p className="modifier-field-help">{field.help}</p><div className={`modifier-option-row options-${field.options.length}`}>{field.options.map(([id, label, help]) => <button type="button" className={currentValue === id ? "active" : ""} disabled={!isOwner} aria-pressed={currentValue === id} key={id} onClick={() => change(field.key, id)}><span className="modifier-radio-mark" /><span><strong>{localeText(label)}</strong>{help && <small>{help}</small>}</span></button>)}</div></>}
        {field.type === "toggle" && <button type="button" className={`modifier-toggle-card ${currentValue ? "active" : ""}`} disabled={!isOwner} aria-pressed={Boolean(currentValue)} onClick={() => change(field.key, !currentValue)}><span className="modifier-switch"><i /></span><span><strong>{currentValue ? field.enabledLabel ?? localeText("{value0} activé", { value0: field.label }) : field.disabledLabel ?? localeText("{value0} désactivé", { value0: field.label })}</strong><small>{field.help}</small></span><b>{currentValue ? localeText("ON") : localeText("OFF")}</b></button>}
      </fieldset>;
    })}</div>
    {showFooter && isOwner && <div className="game-modifier-footer"><span>{localeText("Les variantes seront verrouillées au lancement.")}</span><button type="button" className="secondary settings-save-button" onClick={onSave}><Save size={17} />{" " + localeText("Appliquer les variantes")}</button></div>}
  </section>;
}
