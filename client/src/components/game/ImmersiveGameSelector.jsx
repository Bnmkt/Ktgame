import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Dice5, DoorOpen, HelpCircle, Plus, Shuffle, Spade, Swords, Users } from "lucide-react";
import { useLocale } from "../../locales/LocaleProvider.jsx";
import { gameRules } from "../../config/site.js";
import { circularDistance, circularIndex, orbitDestination, publicGameTableCount, randomAvailableGame, selectedGameArtwork } from "../../features/games/selector.js";
import { rankedGames, RankBadge } from "../../features/games/RankedPlay.jsx";
import { Mascot, gameMascot } from "../mascots/Mascot.jsx";
import { GameArtwork } from "./GameArtwork.jsx";
import { useOrbitMotion } from "./useOrbitMotion.js";
import "./immersive-game-selector.css";

export function ImmersiveGameSelector({ games, rooms, activeId, onSelect, mode, rankedStatus, canCreate, canEnter, canRanked, onTables, onRules }) {
  const { t } = useLocale();
  const surface = useRef(null), gesture = useRef(null), ignoreClickUntil = useRef(0);
  const index = Math.max(0, games.findIndex(game => game.id === activeId));
  const game = games[index], count = games.length, step = 360 / Math.max(1, count);
  const [turn, setTurn] = useState(index * step), [spinning, setSpinning] = useState(false);
  const motion = useOrbitMotion(surface, turn, () => setSpinning(false));
  const signature = games.map(entry => entry.id).join(",");
  useEffect(() => {
    // Filters change the seat spacing, while a compatible active game survives.
    motion.scrub(index * step); setTurn(index * step); setSpinning(false);
    if (game && game.id !== activeId) onSelect(game.id);
  }, [signature]);
  const choose = (nextIndex, direction = 0, revolutions = 0) => {
    const next = games[circularIndex(nextIndex, count)];
    if (!next) return;
    setSpinning(Boolean(revolutions));
    setTurn(orbitDestination(turn, games.indexOf(next), count, direction, revolutions));
    onSelect(next.id);
    surface.current?.focus({ preventScroll: true });
  };
  const navigate = delta => choose(index + delta, Math.sign(delta));
  const navigation = useRef(navigate); navigation.current = navigate;
  useEffect(() => {
    const node = surface.current;
    if (!node || count < 2) return;
    let accumulated = 0, last = 0;
    const wheel = event => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      if (!delta) return;
      event.preventDefault();
      const now = performance.now();
      if (now - last < 160) return;
      accumulated += delta * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? node.clientHeight : 1);
      if (Math.abs(accumulated) < 28) return;
      navigation.current(Math.sign(accumulated)); accumulated = 0; last = now;
    };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => node.removeEventListener("wheel", wheel);
  }, [count]);
  const eligible = entry => mode !== "ranked" || rankedStatus?.games?.find(row => row.id === entry.id)?.enabled !== false;
  const random = () => {
    const next = randomAvailableGame(games, eligible);
    if (next) choose(games.indexOf(next), 1, count > 1 ? 2 : 0);
  };
  const endGesture = (event, commit) => {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    gesture.current = null;
    if (current.dragged) {
      ignoreClickUntil.current = Date.now() + 400;
      const offset = event.clientX - current.x;
      const movement = Math.max(-3, Math.min(3, Math.round(-offset / 85)));
      if (commit && movement) navigate(movement);
      else { motion.scrub(turn); setSpinning(false); }
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  if (!game) return null;
  const ranked = mode === "ranked", entry = rankedStatus?.games?.find(row => row.id === game.id);
  const tables = publicGameTableCount(rooms, game.id);
  return <section className="game-orbit" ref={surface} tabIndex={0} role="region" aria-roledescription={t("carrousel")} aria-label={t("Sélecteur circulaire des jeux")} aria-describedby="game-orbit-instructions"
    style={{ "--orbit-mobile-factor": count / Math.min(7, count) }} data-orbit-active={game.id} data-orbit-spinning={spinning ? "true" : undefined}
    onKeyDown={event => {
      if (event.target !== event.currentTarget && !event.target.closest(".game-orbit-seat")) return;
      if (["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        if (event.key === "Home") choose(0); else if (event.key === "End") choose(count - 1);
        else navigate(["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1);
      }
    }}>
    <p className="sr-only" id="game-orbit-instructions">{t("Utilise les flèches du clavier, la molette ou un glissement horizontal pour choisir un jeu.")}</p>
    <div className="game-orbit-viewport"
      onPointerDown={event => {
        if (event.pointerType === "mouse" || !event.isPrimary || count < 2 || event.target.closest("button:not(.game-orbit-seat), a, input")) return;
        gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, base: motion.position(), dragged: false };
      }}
      onPointerMove={event => {
        const current = gesture.current;
        if (!current || current.id !== event.pointerId) return;
        const dx = event.clientX - current.x, dy = event.clientY - current.y;
        if (!current.dragged && Math.abs(dy) > Math.abs(dx) + 8) { gesture.current = null; return; }
        if (!current.dragged && Math.abs(dx) < 10) return;
        current.dragged = true; event.currentTarget.setPointerCapture(event.pointerId);
        motion.scrub(current.base - dx * step / 85);
      }}
      onPointerUp={event => endGesture(event, true)} onPointerCancel={event => endGesture(event, false)}
      onClickCapture={event => { if (Date.now() < ignoreClickUntil.current) { event.preventDefault(); event.stopPropagation(); } }}>
      <div className="game-orbit-table" aria-hidden="true"><span>KT GAME</span></div>
      <div className="game-orbit-host" aria-hidden="true"><Mascot character="lucky" pose="point" size="large" priority/><span className="game-orbit-host-copy">{count === 1 ? t("À toi de jouer !") : t("{value0} jeux, un seul casino.", { value0: count })}</span></div>
      <div className="game-orbit-seats">{games.map((item, seat) => {
        const distance = circularDistance(seat, index, count), active = seat === index;
        return <button type="button" className={`game-orbit-seat ${active ? "game-orbit-seat-current" : ""}`} key={item.id} tabIndex={-1} aria-label={t("Choisir {value0}", { value0: t(item.name) })} aria-current={active ? "true" : undefined}
          data-orbit-game={item.id} data-orbit-near={Math.abs(distance) <= 3 ? "true" : "false"}
          style={{ "--orbit-seat-angle": `${seat * step}deg`, "--orbit-mobile-angle": `${turn + distance * step}deg` }} onClick={() => choose(seat)}>
          <GameArtwork source={item.coverImage} eager fallback={<Mascot {...gameMascot(item.id, item.type)} docked/>}/><strong>{t(item.name)}</strong>
        </button>;
      })}</div>
      <article className="game-orbit-focus" key={game.id} aria-label={t(game.name)}>
        <GameArtwork source={selectedGameArtwork(game)} eager fallback={<Mascot {...gameMascot(game.id, game.type)} docked size="large" priority/>}/>
        <div className="game-orbit-box">
        <header><span>{ranked ? <Swords size={15}/> : game.type === "dice" ? <Dice5 size={15}/> : <Spade size={15}/>}</span><h2>{t(game.name)}</h2></header>
        <p>{t(game.description || gameRules[game.id]?.goal)}</p>
        <div className="game-orbit-facts"><span>{t(game.type === "dice" ? "Dés" : "Cartes")}</span><span><Users size={13}/>{ranked ? entry?.players ?? "…" : game.minPlayers === game.maxPlayers ? game.minPlayers : `${game.minPlayers}–${game.maxPlayers}`}</span><span>{t(mode === "ranked" ? "Classé" : "Classique")}</span>{!ranked && rankedGames.includes(game.id) && <span>{t("Classé disponible")}</span>}</div>
        {ranked ? <RankBadge rank={entry?.rank}/> : <small className="game-orbit-tables">{t(tables === 1 ? "{value0} table publique" : "{value0} tables publiques", { value0: tables })}</small>}
        <div className="game-orbit-actions">{ranked ? <button type="button" disabled={!canEnter || !canRanked || !eligible(game) || game.enabled === false} onClick={() => onTables(game, "browse")}><Swords size={17}/>{t("Rejoindre le classé")}</button> : <><button type="button" disabled={!canCreate || game.enabled === false} onClick={() => onTables(game, "create")}><Plus size={17}/>{t("Créer une table")}</button>{canEnter && <button className="secondary" type="button" disabled={game.enabled === false} onClick={() => onTables(game, "browse")}><DoorOpen size={16}/>{t("Rejoindre")}{` (${tables})`}</button>}</>}</div>
        <button className="secondary game-orbit-rules" type="button" onClick={() => onRules(game.id)}><HelpCircle size={14}/>{t("Règles du jeu")}</button>
        </div>
      </article>
      <button className="secondary game-orbit-arrow game-orbit-previous" type="button" disabled={count < 2} aria-label={t("Jeu précédent")} onClick={() => navigate(-1)}><ArrowLeft/></button>
      <button className="secondary game-orbit-arrow game-orbit-next" type="button" disabled={count < 2} aria-label={t("Jeu suivant")} onClick={() => navigate(1)}><ArrowRight/></button>
    </div>
    <footer className="game-orbit-controls"><span aria-live="polite" aria-atomic="true">{index + 1} / {count} · {t(game.name)}</span><button type="button" className="secondary" aria-busy={spinning} disabled={!games.some(item => item.enabled !== false && eligible(item))} onClick={random}><Shuffle size={17}/>{t("Jeu aléatoire")}</button><small>{t("Molette · flèches · glisser")}</small></footer>
  </section>;
}
