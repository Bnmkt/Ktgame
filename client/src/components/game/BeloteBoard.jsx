import { useRef, useState } from "react";
import { ArrowRight, Club, Diamond, Heart, SkipForward, Spade } from "lucide-react";
import { PlayingCard } from "./GamePieces.jsx";
import { DisplayName } from "../cosmetics/Cosmetics.jsx";
import { suits } from "../../features/games/config.js";
import "./belote.css";

const suitIcons = { S: Spade, H: Heart, D: Diamond, C: Club };
const positions = ["south", "west", "north", "east"];
const ranks = ["7", "8", "9", "10", "J", "Q", "K", "A"];
const keyFor = (card) => `${card.rank}-${card.suit}`;
const teamName = (team) => team === 0 ? "Bleue" : "Rouge";

export function BeloteBoard({ state, user, onAction, spectator = false }) {
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const myTurn = !spectator && !state.finished && state.players[state.currentPlayerIndex]?.id === user.id;
  const selfIndex = spectator ? 0 : Math.max(0, state.players.findIndex((player) => player.id === user.id));
  const positionFor = (id) => positions[(state.players.findIndex((player) => player.id === id) - selfIndex + 4) % 4];
  const hand = spectator ? [] : [...(state.hands[user.id] ?? [])].filter(Boolean).sort((a, b) => a.suit.localeCompare(b.suit) || ranks.indexOf(a.rank) - ranks.indexOf(b.rank));
  const legal = new Set((state.legalCards ?? []).map(keyFor));
  const bidding = ["bid", "forced-bid"].includes(state.phase);
  const skin = user.cosmetics?.equipped?.cardSkin ?? "default";
  const shownTrick = state.trick.length ? state.trick : state.lastTrick?.plays ?? [];
  async function act(action) {
    if (pending.current || !myTurn) return;
    pending.current = true; setBusy(true);
    try { await onAction(action); } finally { pending.current = false; setBusy(false); }
  }
  return <div className="belote-board">
    <header className="belote-summary"><span>Donne {state.round} · {state.modifiers.frenchRules ? "Française" : "Belge"}</span><strong>{state.trump ? <>Atout {suits[state.trump].symbol} {suits[state.trump].name}</> : "Prise d'atout"}</strong><span>{bidding ? state.phase === "forced-bid" ? "Prise forcée" : `Tour ${state.bidRound} / 2` : `Pli ${state.trickNumber} / 8`}</span></header>
    <div className="belote-score-strip">{[0, 1].map((team) => <div className={`team-${team}`} key={team}><span><i />{teamName(team)}</span><strong>{state.teamScores[team]} <small>/ {state.targetScore}</small></strong><span>{state.cardPoints[team]} pts sur la donne</span><span>{state.trickCounts[team]} plis</span></div>)}</div>
    <section className="belote-table" aria-label="Table de belote deux contre deux">
      <div className="belote-table-felt" aria-hidden="true" />
      {state.players.map((player, index) => {
        const position = positionFor(player.id), team = index % 2;
        const count = state.hands[player.id]?.length ?? 0;
        const active = !state.finished && state.currentPlayerIndex === index;
        return <section key={player.id} className={`belote-seat seat-${position} team-${team} ${active ? "active" : ""}`} aria-label={`${player.pseudo}, équipe ${teamName(team)}`}>
          <div className="belote-seat-name"><i /><DisplayName user={player} /></div>
          <small>{!spectator && player.id === user.id ? "Vous" : team === selfIndex % 2 && !spectator ? "Partenaire" : teamName(team)}{player.isBot ? " · IA" : ""}{state.takerId === player.id ? " · Preneur" : ""}</small>
          <div className="belote-card-fan" aria-label={`${count} cartes cachées`}>{Array.from({ length: Math.min(3, count) }, (_, i) => <PlayingCard key={i} hidden animate={false} skin={player.cosmetics?.equipped?.cardSkin ?? "default"} />)}</div>
          <span className="belote-seat-count">{count} cartes</span>
        </section>;
      })}
      <div className={`belote-table-center ${!shownTrick.length && !bidding ? "empty-trick" : ""}`}>
        {bidding ? <div className="belote-upcard"><span>Retournée</span><PlayingCard card={state.turnedCard} skin={skin} /><strong>{state.phase === "forced-bid" ? "Prise forcée" : `Tour ${state.bidRound}`}</strong></div> : <>
          <span className="belote-trick-label">{state.trick.length ? "Pli en cours" : state.lastTrick ? "Dernier pli" : "Entame"}</span>
          <div className={`belote-trick-grid ${!state.trick.length ? "previous-trick" : ""}`} aria-label="Cartes du pli">{shownTrick.map((play) => <div key={play.playerId} className={`belote-trick-card played-${positionFor(play.playerId)}`} title={state.players.find((player) => player.id === play.playerId)?.pseudo}><PlayingCard card={play.card} skin={state.players.find((player) => player.id === play.playerId)?.cosmetics?.equipped?.cardSkin ?? "default"} /></div>)}</div>
          {!state.trick.length && state.lastTrick && <small className="belote-trick-winner">{state.players.find((player) => player.id === state.lastTrick.winnerId)?.pseudo} · +{state.lastTrick.points}</small>}
        </>}
      </div>
    </section>
    {bidding && !spectator && <div className="belote-bidding"><div className="belote-bid-actions">{Object.entries(suits).filter(([suit]) => state.phase === "forced-bid" || (state.bidRound === 1 ? suit === state.turnedCard.suit : suit !== state.turnedCard.suit)).map(([suit, info]) => { const Icon = suitIcons[suit]; return <button key={suit} disabled={!myTurn || busy} onClick={() => act({ type: "take", suit })}><Icon size={18} />Prendre {info.name}</button>; })}{state.phase !== "forced-bid" && <button className="secondary" disabled={!myTurn || busy} onClick={() => act({ type: "pass" })}><SkipForward size={18} />Passer</button>}</div></div>}
    {state.lastRound && <section className="belote-round-score"><strong>Donne {state.lastRound.round} · {({ reussi: "contrat réussi", chute: "chute", capot: "capot", litige: "litige" })[state.lastRound.result]}</strong><span>Bleue : +{state.lastRound.awarded[0]} · Rouge : +{state.lastRound.awarded[1]}{state.pendingPoints ? ` · ${state.pendingPoints} en réserve` : ""}</span>{state.phase === "round-end" && !spectator && <button disabled={!myTurn || busy} onClick={() => act({ type: "next-deal" })}><ArrowRight size={18} />Donne suivante</button>}</section>}
    {!state.finished && hand.length > 0 && <section className={`belote-hand-zone team-${selfIndex % 2}`}><h3><i />Ta main</h3><div className="belote-hand">{hand.map((card) => <button key={keyFor(card)} type="button" className={myTurn && legal.has(keyFor(card)) ? "belote-playable" : ""} disabled={!myTurn || busy || !legal.has(keyFor(card))} aria-label={`Jouer ${card.rank} de ${suits[card.suit].name}`} onClick={() => act({ type: "play", card })}><PlayingCard card={card} skin={skin} animate={false} /></button>)}</div></section>}
    {Object.values(state.announcements ?? {}).some((entries) => entries.length) && <section className="belote-announcements"><h3>{state.announcementsRevealed ? "Annonces révélées" : "Tes annonces"}</h3>{Object.entries(state.announcements).filter(([, entries]) => entries.length).map(([id, entries]) => <div key={id}><DisplayName user={state.players.find((player) => player.id === id)} /><span>{entries.map((entry) => `${entry.label} (${entry.valid === false ? "annulée" : entry.points})`).join(" · ")}</span></div>)}</section>}
  </div>;
}
