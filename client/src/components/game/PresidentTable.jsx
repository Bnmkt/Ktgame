import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronsRight, Crown, Hand, Play, X } from "lucide-react";
import { useLocale } from "../../locales/LocaleProvider.jsx";
import { suits } from "../../features/games/config.js";
import { canPlayPresidentSet, movePresidentCard, presidentCardKey, presidentHandGeometry, presidentPlaceLabel } from "../../features/games/president.js";
import { DisplayName } from "../cosmetics/Cosmetics.jsx";
import { TableActionBar, TablePanel } from "../room/TableInterface.jsx";
import { PlayingCard } from "./GamePieces.jsx";
import { usePresidentHand } from "./usePresidentHand.js";
import { usePresidentDeal } from "./usePresidentDeal.js";
import "./president-table.css";

function seatPositions(count) {
  return ({ 1: [[50, 14]], 2: [[25, 15], [75, 15]], 3: [[16, 34], [50, 14], [84, 34]], 4: [[13, 38], [32, 14], [68, 14], [87, 38]], 5: [[13, 38], [24, 14], [50, 14], [76, 14], [87, 38]] })[count] ?? [];
}

function PresidentHand({ cards, selected, onSelect, onMove, canSelect, state }) {
  const { t } = useLocale();
  const handRef = useRef(null), gesture = useRef(null), suppressClick = useRef(0);
  const [width, setWidth] = useState(600), [drag, setDrag] = useState(null);
  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(handRef.current); return () => observer.disconnect();
  }, []);
  const keys = cards.map(presidentCardKey);
  const { cardWidth, step, start } = presidentHandGeometry(width, cards.length, width >= 1100 ? 116 : 98);
  const preview = drag ? movePresidentCard(keys, drag.key, drag.to) : keys;
  useEffect(() => {
    if (gesture.current && !keys.includes(gesture.current.key)) { gesture.current = null; setDrag(null); }
  }, [keys.join(",")]);
  const finishGesture = (event, commit) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (current.moved) {
      suppressClick.current = Date.now() + 350;
      if (commit) onMove(current.key, current.to);
    }
    gesture.current = null; setDrag(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <div className="president-card-hand" ref={handRef} style={{ "--president-card-width": `${cardWidth}px`, "--president-card-height": `${cardWidth * 118 / 82}px`, "--president-corner-font": `${Math.max(9, Math.min(27, (cards.length > 1 ? step : cardWidth) * .68))}px` }} aria-label={t("Ta main")}>
    {cards.map((card) => {
      const key = presidentCardKey(card), index = preview.indexOf(key), originalIndex = keys.indexOf(key);
      const chosen = selected.includes(key), allowed = canPlayPresidentSet(state, card.rank, state.currentSet?.count ?? 1);
      const isDragged = drag?.key === key;
      return <button type="button" className={`president-hand-card ${chosen ? "selected" : ""} ${!allowed ? "president-card-restricted" : ""} ${isDragged ? "president-card-dragged" : ""}`} key={key}
        data-president-card={key} data-president-deal-slot={`${card.ownerId}:${originalIndex}`} aria-pressed={chosen} aria-disabled={!canSelect || !allowed}
        aria-label={t("{value0} de {value1}", { value0: card.rank, value1: suits[card.suit]?.name })}
        title={t("Glisser pour déplacer · Alt + flèche pour réordonner")}
        style={{ left: `${start + index * step}px`, "--president-card-index": index, ...(isDragged ? { translate: `${drag.offset + (originalIndex - index) * step}px -14px` } : {}) }}
        onPointerDown={(event) => {
          if (event.button !== 0 || !event.isPrimary) return;
          gesture.current = { key, pointerId: event.pointerId, x: event.clientX, y: event.clientY, from: originalIndex, to: originalIndex, moved: false };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const current = gesture.current;
          if (!current || current.pointerId !== event.pointerId) return;
          const offset = event.clientX - current.x;
          if (!current.moved && Math.abs(offset) < 7) return;
          current.moved = true;
          current.to = Math.max(0, Math.min(cards.length - 1, Math.round(current.from + offset / Math.max(1, step))));
          setDrag({ key, to: current.to, offset: Math.max(-start - current.from * step, Math.min(width - cardWidth - start - current.from * step, offset)) });
        }}
        onPointerUp={(event) => finishGesture(event, true)} onPointerCancel={(event) => finishGesture(event, false)} onLostPointerCapture={(event) => finishGesture(event, false)}
        onKeyDown={(event) => {
          if (!event.altKey || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
          event.preventDefault(); onMove(key, originalIndex + (event.key === "ArrowLeft" ? -1 : 1));
        }}
        onClick={() => { if (Date.now() > suppressClick.current && canSelect && allowed) onSelect(key, card); }}>
        <PlayingCard card={card} skin={card.skin} animate={false}/>{chosen && <i className="president-card-check" aria-hidden="true"><Check size={13}/></i>}
      </button>;
    })}
  </div>;
}

export function PresidentTable({ room, state, user, onAction, canAct, busy, selected, onSelectionChange, autoPassDeadline, countdown, dealKey }) {
  const { t } = useLocale();
  const root = useRef(null);
  const matchKey = `${room.code}:${room.activityMatchId ?? "current"}:${user.id}`;
  const [hand, moveCard] = usePresidentHand(state.hands[user.id] ?? [], matchKey);
  const localSkin = user.cosmetics?.equipped?.cardSkin ?? "default";
  const chosen = hand.filter((card) => selected.includes(presidentCardKey(card)));
  const required = state.currentSet?.count;
  const playable = chosen.length > 0 && chosen.every((card) => card.rank === chosen[0].rank) && chosen.length <= 4 && (!required || chosen.length === required) && canPlayPresidentSet(state, chosen[0].rank, chosen.length);
  const opponents = state.players.filter((player) => player.id !== user.id);
  const positions = seatPositions(opponents.length);
  const current = state.players[state.currentPlayerIndex];
  const deal = usePresidentDeal(root, state, dealKey);
  const selectCard = (key, card) => {
    if (selected.includes(key)) return onSelectionChange(selected.filter((entry) => entry !== key));
    if (chosen.length && chosen[0].rank !== card.rank || chosen.length >= (required ?? 4)) return;
    onSelectionChange([...selected, key]);
  };
  return <section className="president-stage" ref={root} aria-label={t("Plateau de Président")} data-president-dealing={deal.dealing ? "true" : undefined}>
    <div className="president-playfield">
      <div className="president-felt-insignia" aria-hidden="true"><Crown/><span>KT GAME</span></div>
      {opponents.map((player, seat) => {
        const count = state.hands[player.id]?.length ?? 0;
        const place = state.finishedOrder.indexOf(player.id), active = current?.id === player.id && !state.finished;
        const [x, y] = positions[seat];
        return <article className={`president-seat ${active ? "president-seat-current" : ""} ${place >= 0 ? "president-seat-finished" : ""}`} key={player.id} data-card-owner={player.id} style={{ "--president-seat-x": `${x}%`, "--president-seat-y": `${y}%`, "--president-opponent-count": Math.max(1, count) }}>
          <header><DisplayName user={player}/><span>{count} {t("cartes")}</span>{active && <Play size={12} fill="currentColor"/>}</header>
          <small>{t(place >= 0 ? presidentPlaceLabel(place, state.players.length) : active ? "À jouer" : state.passes?.includes(player.id) ? "A passé" : "En jeu")}</small>
          <div className="president-opponent-hand" aria-label={t("{value0} cartes cachées", { value0: count })}>{Array.from({ length: count }, (_, index) => <span key={index} data-president-deal-slot={`${player.id}:${index}`}><PlayingCard hidden animate={false} skin={player.cosmetics?.equipped?.cardSkin ?? "default"}/></span>)}</div>
        </article>;
      })}
      <div className="president-center">
        <div className="president-deal-origin" aria-hidden={!deal.dealing}><PlayingCard hidden animate={false} skin={localSkin}/></div>
        <div className="president-current-pile" data-card-arrival="played" data-card-owner={state.currentSet?.playerId}>
          <div className="president-played-cards">{state.currentSet ? (state.pile.at(-1)?.cards ?? []).map((card) => <PlayingCard key={presidentCardKey(card)} card={card} animate={false} skin={state.players.find((player) => player.id === state.currentSet.playerId)?.cosmetics?.equipped?.cardSkin ?? localSkin}/>) : <span className="president-free-lead"><Crown size={30}/>{t(state.finished ? "Partie terminée" : "Nouvelle ouverture")}</span>}</div>
          {state.currentSet && <strong>{`${state.currentSet.count} × ${state.currentSet.rank}`}</strong>}
          {state.currentSet && <small>{state.players.find((player) => player.id === state.currentSet.playerId)?.pseudo}</small>}
        </div>
        {deal.dealing && <div className="president-deal-controls" role="group" aria-label={t("Distribution")}><span>{t("Distribution")}</span><button className="secondary" onClick={deal.accelerate}><ChevronsRight size={15}/>{t("Accélérer")}</button><button className="secondary" onClick={deal.skip}>{t("Passer l’animation")}</button></div>}
      </div>
      <div className={`president-self-zone ${canAct ? "active" : ""}`} data-card-owner={user.id}>
        <PresidentHand cards={hand.map((card) => ({ ...card, ownerId: user.id, skin: localSkin }))} state={state} selected={selected} onSelect={selectCard} onMove={moveCard} canSelect={canAct && !busy && !state.finished}/>
        <div className="president-local-identity"><DisplayName user={user}/><span>{hand.length} {t("cartes")}</span><strong>{t(state.finishedOrder.includes(user.id) ? presidentPlaceLabel(state.finishedOrder.indexOf(user.id), state.players.length) : canAct ? "À toi de jouer" : "En attente du joueur actif")}</strong></div>
      </div>
    </div>
    <div className="president-command-dock">
      <div className="president-selection-summary" aria-live="polite"><strong>{t("{value0} carte(s) sélectionnée(s)", { value0: chosen.length })}</strong><button className="secondary" disabled={!selected.length} onClick={() => onSelectionChange([])}><X size={13}/>{t("Tout désélectionner")}</button></div>
      <TableActionBar><button className="secondary" disabled={!canAct || busy || !state.currentSet || state.finished} onClick={() => onAction({ type: "pass" })}><Hand size={22}/>{t("Passer")}{autoPassDeadline && <> · {countdown}</>}</button><button className="table-command-gold" disabled={!canAct || busy || !playable || state.finished} onClick={() => onAction({ type: "play", cards: chosen.map(({ rank, suit }) => ({ rank, suit })) })}><Play size={22}/>{t("Jouer la sélection")}</button></TableActionBar>
      <div className="president-order-hint"><div className="president-requirement" role="status">{t(state.revolution ? "Révolution active" : "Ordre classique")}<strong>{state.currentSet ? t("{value0} carte{value1} · {value2} {value3}", { value0: state.currentSet.count, value1: state.currentSet.count > 1 ? "s" : "", value2: state.revolution ? "en dessous de" : "au-dessus de", value3: state.currentSet.rank }) : t("Pose libre")}</strong></div><small>{t("Glisser pour déplacer · Alt + flèche pour réordonner")}</small></div>
    </div>
  </section>;
}

export function PresidentPanels({ state }) {
  const { t } = useLocale();
  const rows = [...state.players].sort((a, b) => {
    const left = state.finishedOrder.indexOf(a.id), right = state.finishedOrder.indexOf(b.id);
    return (left < 0 ? state.players.length : left) - (right < 0 ? state.players.length : right);
  });
  return <><TablePanel title={t("Ordre et rangs")} open><ol className="president-rank-list">{rows.map((player) => {
    const place = state.finishedOrder.indexOf(player.id), active = state.players[state.currentPlayerIndex]?.id === player.id && !state.finished;
    return <li key={player.id} className={active ? "president-rank-current" : ""}><span>{place < 0 ? "—" : place + 1}</span><div><DisplayName user={player}/><small>{t(presidentPlaceLabel(place, state.players.length))}</small></div><strong>{state.hands[player.id]?.length ?? 0} {t("cartes")}</strong></li>;
  })}</ol></TablePanel><TablePanel title={t("Derniers tours")} open><ol className="president-recent-turns">{(state.logs ?? []).slice(-8).reverse().map((entry) => <li key={entry.id}><strong>{entry.actor}</strong><span>{entry.text}</span></li>)}{!state.logs?.length && <li>{t("Nouvelle ouverture")}</li>}</ol></TablePanel><TablePanel title={t("Règles principales")}><ul className="president-rules"><li>{t("Se débarrasser de toutes ses cartes en premier.")}</li><li>{t("Les cartes d’une combinaison doivent avoir la même valeur.")}</li><li>{t("Répondre avec le même nombre de cartes et une valeur supérieure.")}</li>{state.modifiers?.revolutionEnabled !== false && <li>{t("Un carré inverse l’ordre des cartes et libère le pli.")}</li>}</ul></TablePanel></>;
}
