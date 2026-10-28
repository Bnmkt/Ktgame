import { useLocale } from "../../locales/LocaleProvider.jsx";
import { ModalBackdrop } from "../common/ModalBackdrop.jsx";
import { useEffect, useState } from "react";
import { AlertTriangle, Banknote, BookOpen, CheckCircle2, CircleDot, Dices, Eye, EyeOff, HelpCircle, ShieldCheck, Swords, Trophy, X } from "lucide-react";
import { Die, DiceThrowTray, PlayingCard } from "./GamePieces.jsx";
import { DisplayName } from "../cosmetics/Cosmetics.jsx";
import { battleScoringLabels, playerName, suits } from "../../features/games/config.js";
import { midnightContractEvaluation, midnightContractInfo, midnightContractLabel, midnightContractTiers, midnightScorePreview } from "../../features/games/midnightDice/model.js";
import { velvetClaimAllowed } from "../../features/games/velvetRuse/model.js";
import { farkleCombos, farkleSelectionScore, farkleSuggestions, shutTileCombinations } from "../../features/games/farkle/model.js";
import { CompactNumber, formatExactNumber } from "../../utils/presentation.jsx";
import { Dialog } from "../common/Dialog.jsx";
import { useCompactLayout } from "../common/useCompactLayout.js";
import { TableActionBar } from "../room/TableInterface.jsx";

export function FarkleBoard({ state, user, onAction, rollLocked = false, showGuide = true }) {
  const { t: localeText } = useLocale();
  const [selected, setSelected] = useState([]);
  const current = state.players[state.currentPlayerIndex];
  const isMyTurn = current?.id === user.id;
  const selectedDice = selected.map((index) => state.dice[index]).filter(Boolean);
  const preview = farkleSelectionScore(selectedDice);
  const banked = state.scores?.[current?.id] ?? 0;
  const entryScore = state.modifiers?.entryScore ?? 0;
  const entryMissing = banked === 0 && state.turnScore < entryScore;
  const suggestions = farkleSuggestions(state.dice);

  useEffect(() => { setSelected([]); }, [state.currentPlayerIndex, state.dice.join("-"), state.turnScore]);

  return <section className={`farkle-table ${isMyTurn ? "active" : "spectating"}`}>

    <div className="farkle-dashboard">
      <section className="farkle-play-zone">
        <div className="farkle-score-strip"><span><small>{localeText("Score sécurisé")}</small><strong><CompactNumber value={banked} label={localeText("Score exact")} /></strong></span><span className="turn-bank"><small>{localeText("En jeu ce tour")}</small><strong><CompactNumber value={state.turnScore} prefix="+" label={localeText("Score exact du tour")} /></strong></span><span><small>{localeText("Dés à relancer")}</small><strong>{state.remainingDice || 6}</strong></span><span><small>{localeText("Objectif")}</small><strong><CompactNumber value={state.target} suffix={localeText(" pts")}/></strong></span></div>
        <div className={`farkle-dice-stage ${state.bust ? "bust" : ""}`}>
          <DiceThrowTray label={localeText("Piste de risque")} caption={localeText("{value0} dé{value1} disponibles", { value0: state.remainingDice || 6, value1: (state.remainingDice || 6) > 1 ? "s" : "" })}>{(state.dice.length ? state.dice : Array(state.remainingDice || 6).fill(null)).map((die, index) => <Die key={`${index}-${die ?? "empty"}-${state.turnScore}`} value={die} kept={selected.includes(index)} selectionLabel={localeText("À marquer")} skin={current?.cosmetics?.equipped?.diceSkin ?? user.cosmetics?.equipped?.diceSkin ?? "default"} onClick={isMyTurn && !state.bust ? () => setSelected((values) => values.includes(index) ? values.filter((value) => value !== index) : [...values, index]) : undefined} />)}</DiceThrowTray>
          {state.bust ? <div className="farkle-bust"><AlertTriangle /><div><strong>{localeText("Aucune combinaison possible")}</strong><span>{localeText("Les points accumulés ce tour sont perdus. Confirme le score nul pour passer la main.")}</span></div></div> : state.dice.length ? <div className={`farkle-selection-readout ${selected.length && !preview.valid ? "invalid" : preview.valid ? "valid" : ""}`}><CircleDot /><span><small>{localeText("Sélection actuelle")}</small><strong>{localeText(preview.label)}</strong></span><b>{preview.valid ? `+${preview.points}` : "—"}</b></div> : <div className="farkle-decision-tip"><ShieldCheck /><span><strong>{state.turnScore ? localeText("Encaisser ou prendre le risque ?") : localeText("Lance les six dés")}</strong><small>{state.turnScore ? localeText("Encaisser sécurise le tour. Relancer peut tout faire perdre.") : localeText("Premier encaissement requis : {value0} points.", { value0: entryScore })}</small></span></div>}
        </div>
        <TableActionBar className="farkle-actions">
          {state.bust ? <button className="danger-button" disabled={!isMyTurn} onClick={() => onAction({ type: "forfeit" })}><AlertTriangle size={18} />{" " + localeText("Terminer le tour · 0 point")}</button> : <>
            <button data-request-feedback="state" aria-busy={rollLocked} className={`table-command-gold ${rollLocked ? "roll-cooldown" : ""}`} disabled={!isMyTurn || state.dice.length > 0 || rollLocked} onClick={() => onAction({ type: "roll" })}><Dices size={18} />{" " + localeText("Lancer") + " "}{state.remainingDice || 6}{" " + localeText("dé")}{(state.remainingDice || 6) > 1 ? localeText("s") : ""}</button>
            <button className={preview.valid ? "table-command-main" : "secondary"} disabled={!isMyTurn || !state.dice.length || !preview.valid} onClick={() => onAction({ type: "select", indexes: selected })}>{localeText("Marquer la sélection") + " "}{preview.valid ? `· +${preview.points}` : ""}</button>
            <button className="table-command-gold" disabled={!isMyTurn || !state.turnScore || state.dice.length > 0 || entryMissing} title={entryMissing ? localeText("Atteins {value0} points pour entrer dans la partie", { value0: formatExactNumber(entryScore) }) : localeText("Sécuriser exactement {value0} points", { value0: formatExactNumber(state.turnScore) })} onClick={() => onAction({ type: "bank" })}><Banknote size={18} />{" " + localeText("Encaisser") + " "}<CompactNumber value={state.turnScore} /></button>
          </>}
        </TableActionBar>
        {!state.bust && state.dice.length > 0 && suggestions.length > 0 && <div className="farkle-suggestions"><span>{localeText("Combinaisons détectées")}</span>{suggestions.map((suggestion) => <button type="button" className={suggestion.indexes.every((index) => selected.includes(index)) && selected.length === suggestion.indexes.length ? "active" : "secondary"} disabled={!isMyTurn} onClick={() => setSelected(suggestion.indexes)} key={`${suggestion.values.join("-")}-${suggestion.points}`}><strong>{localeText(suggestion.label)}</strong><small>{suggestion.values.join(" · ")} · +{suggestion.points}</small></button>)}</div>}
        {entryMissing && state.turnScore > 0 && <p className="farkle-entry-warning"><AlertTriangle size={16} />{" " + localeText("Encore") + " "}{Math.max(0, entryScore - state.turnScore)}{" " + localeText("points avant de pouvoir entrer au score.")}</p>}
      </section>
      {showGuide && <FarkleGuide/>}
    </div>
  </section>;
}

export function FarkleGuide({ expanded = false }) {
  const { t: localeText } = useLocale();
  const compact = useCompactLayout();
  return <details className="farkle-combo-guide" open={expanded || !compact}><summary>{localeText("Combinaisons possibles")}</summary><small>{localeText("Les combinaisons à six dés déclenchent les « dés chauds » : tu relances les six.")}</small><div className="farkle-combo-grid">{farkleCombos.map((combo) => <article key={combo.id}><div className="farkle-mini-dice">{combo.dice.map((die, index) => <Die value={die} kept={false} animate={false} skin="default" key={`${combo.id}-${index}`} />)}</div><span><strong>{localeText(combo.label)}</strong><small>{combo.points}</small></span></article>)}</div></details>;
}

export function LiarsDiceBoard({ state, user, onAction }) {
  const { t: localeText } = useLocale();
  const current = state.players[state.currentPlayerIndex];
  const isMyTurn = current?.id === user.id;
  const totalDice = Object.values(state.diceCounts ?? {}).reduce((sum, count) => sum + count, 0);
  const minimumBid = state.bid ? (state.bid.face < 6 ? { quantity: state.bid.quantity, face: state.bid.face + 1 } : { quantity: state.bid.quantity + 1, face: 1 }) : { quantity: 1, face: 1 };
  const [bid, setBid] = useState(minimumBid);
  const ownHand = state.hands?.[user.id] ?? [];
  const ownMatches = ownHand.filter((die) => die === bid.face).length;
  const hiddenDice = Math.max(0, totalDice - ownHand.length);
  const expected = ownMatches + hiddenDice / 6;
  const bidValid = !state.bid || bid.quantity > state.bid.quantity || (bid.quantity === state.bid.quantity && bid.face > state.bid.face);

  useEffect(() => { setBid(minimumBid); }, [state.bid?.quantity, state.bid?.face, state.round]);

  return <section className="liar-arena">
    <header className="liar-heading"><div><span className="eyebrow">{localeText("Duel de bluff · Manche") + " "}{state.round}</span><h2>{isMyTurn ? localeText("À toi de prendre l’ascendant") : localeText("{value0} doit répondre", { value0: current?.pseudo ?? "Un joueur" })}</h2><p>{localeText("Monte l’enchère ou accuse le dernier joueur de mentir. Les dés adverses restent secrets jusqu’à la contestation.")}</p></div><div className="liar-pool"><strong>{totalDice}</strong><span>{localeText("dés encore en jeu")}</span></div></header>
    <div className="liar-opponents">{state.players.filter((player) => player.id !== user.id).map((player) => <article className={player.id === current?.id ? "active" : ""} key={player.id}><header><DisplayName user={player} /><span>{player.id === state.lastBidderId ? localeText("Dernière annonce") : player.id === current?.id ? localeText("Doit répondre") : localeText("Observe")}</span></header><div className="liar-cup"><EyeOff size={24} /><strong>{state.diceCounts[player.id]}</strong><small>{localeText("dés cachés")}</small></div></article>)}</div>
    <div className="liar-confrontation">
      <section className="liar-own-hand"><div className="panel-heading"><span>{localeText("Ta main secrète")}</span><small>{ownHand.length}{" " + localeText("dé")}{ownHand.length > 1 ? localeText("s") : ""}{" " + localeText("· visible uniquement par toi")}</small></div><DiceThrowTray compact label={localeText("Sous ton gobelet")} caption={localeText("Lancer privé")}>{ownHand.map((die, index) => <Die key={`${index}-${die}-${state.round}`} value={die} kept={die === bid.face} selectionLabel={localeText("Correspond")} skin={user.cosmetics?.equipped?.diceSkin ?? "default"} />)}</DiceThrowTray><div className="liar-read"><Eye size={17} /><span>{localeText("Pour l’annonce préparée :") + " "}<strong>{ownMatches}</strong>{" " + localeText("correspondance")}{ownMatches > 1 ? localeText("s") : ""}{" " + localeText("certaine")}{ownMatches > 1 ? localeText("s") : ""}{localeText(", estimation globale") + " "}<strong>≈ {expected.toFixed(1)}</strong>.</span></div></section>
      <section className="liar-bid-stage"><span className="eyebrow">{localeText("Enchère sur la table")}</span>{state.bid ? <><div className="liar-current-bid"><strong>{state.bid.quantity}</strong><span>{localeText("dé")}{state.bid.quantity > 1 ? localeText("s") : ""}{" " + localeText("montrant")}</span><Die value={state.bid.face} kept={false} animate={false} skin={state.players.find((player) => player.id === state.lastBidderId)?.cosmetics?.equipped?.diceSkin ?? "default"} /></div><small>{localeText("annoncée par") + " "}{state.players.find((player) => player.id === state.lastBidderId)?.pseudo ?? localeText("un joueur")}</small></> : <div className="liar-empty-bid"><Dices /><strong>{localeText("Ouvre les enchères")}</strong></div>}<div className="liar-versus"><i /><Swords /><i /></div></section>
      <section className={`liar-command ${isMyTurn ? "active" : ""}`}><div className="panel-heading"><span>{localeText("Ta réponse")}</span><small>{isMyTurn ? localeText("Augmente la quantité ou la face") : localeText("En attente du joueur actif")}</small></div><label className="liar-quantity">{localeText("Quantité")}<div><button className="secondary" type="button" disabled={!isMyTurn || bid.quantity <= 1} onClick={() => setBid({ ...bid, quantity: bid.quantity - 1 })}>−</button><strong>{bid.quantity}</strong><button className="secondary" type="button" disabled={!isMyTurn || bid.quantity >= totalDice} onClick={() => setBid({ ...bid, quantity: bid.quantity + 1 })}>+</button></div></label><fieldset><legend>{localeText("Face annoncée")}</legend><div className="liar-face-grid">{[1, 2, 3, 4, 5, 6].map((face) => <button type="button" className={bid.face === face ? "active" : ""} disabled={!isMyTurn} onClick={() => setBid({ ...bid, face })} key={face}><Die value={face} kept={false} animate={false} skin="default" /></button>)}</div></fieldset><div className="actions"><button disabled={!isMyTurn || !bidValid || bid.quantity > totalDice} onClick={() => onAction({ type: "bid", ...bid })}>{localeText("Annoncer") + " "}{bid.quantity} × {bid.face}</button><button className="danger-button" disabled={!isMyTurn || !state.bid} onClick={() => onAction({ type: "challenge" })}><Swords size={17} />{" " + localeText("Menteur !")}</button></div>{!bidValid && <small className="invalid-bid">{localeText("L’enchère doit dépasser") + " "}{state.bid.quantity} × {state.bid.face}.</small>}</section>
    </div>
    {state.lastReveal && <section className="liar-reveal"><div><span className="eyebrow">{localeText("Dernière confrontation")}</span><h3>{state.lastReveal.actual}{" " + localeText("dé")}{state.lastReveal.actual > 1 ? localeText("s") : ""}{" " + localeText("de") + " "}{state.lastReveal.face}{" " + localeText("révélé")}{state.lastReveal.actual > 1 ? localeText("s") : ""}</h3><p>{state.players.find((player) => player.id === state.lastReveal.loserId)?.pseudo ?? localeText("Le joueur éliminé")}{" " + localeText("perd un dé.")}</p></div><div>{Object.entries(state.lastReveal.hands ?? {}).map(([playerId, hand]) => <article key={playerId}><strong>{state.players.find((player) => player.id === playerId)?.pseudo ?? localeText("Joueur")}</strong><div className="liar-reveal-dice">{hand.map((die, index) => <Die value={die} kept={die === state.lastReveal.face} selectionLabel={localeText("Compté")} animate={false} skin={state.players.find((player) => player.id === playerId)?.cosmetics?.equipped?.diceSkin ?? "default"} key={`${playerId}-${index}`} />)}</div></article>)}</div></section>}
  </section>;
}

export function ShutTheBoxBoard({ state, user, onAction, rollLocked = false }) {
  const { t: localeText } = useLocale();
  const [selected, setSelected] = useState([]);
  const current = state.players[state.currentPlayerIndex];
  const isMyTurn = current?.id === user.id;
  const open = state.boxes?.[current?.id] ?? [];
  const combinations = shutTileCombinations(open, state.lastTotal);
  const selectedTotal = selected.reduce((sum, value) => sum + value, 0);
  const exact = Boolean(state.lastTotal && selectedTotal === state.lastTotal);
  const remainingScore = open.reduce((sum, value) => sum + value, 0);
  const maxTile = state.modifiers?.maxTile ?? 9;

  useEffect(() => { setSelected([]); }, [state.currentPlayerIndex, state.lastTotal, open.join("-")]);

  return <section className={`shut-table ${isMyTurn ? "active" : "spectating"}`}>
    <header className="shut-heading"><div><span className="eyebrow">{localeText("Boîte de") + " "}{current?.pseudo ?? localeText("jeu")}</span><h2>{isMyTurn ? localeText("Ferme exactement le total") : localeText("Observe le tour de {value0}", { value0: current?.pseudo ?? "l’adversaire" })}</h2><p>{localeText("Choisis une ou plusieurs tuiles ouvertes dont la somme correspond au lancer.")}</p></div><div className="shut-score"><small>{localeText("Valeur encore ouverte")}</small><strong>{remainingScore}</strong><span>{localeText("Le score le plus bas gagne")}</span></div></header>
    <div className="shut-player-strip">{state.players.map((player) => { const done = state.scores[player.id] !== undefined; const openScore = (state.boxes[player.id] ?? []).reduce((sum, value) => sum + value, 0); return <article className={`${player.id === current?.id ? "active" : ""} ${done ? "done" : ""}`} key={player.id}><DisplayName user={player} /><span>{done ? localeText("{value0} pts", { value0: state.scores[player.id] }) : localeText("{value0} ouverts", { value0: openScore })}</span></article>; })}</div>
    <div className="shut-cabinet"><div className="shut-hinge left" /><div className="shut-hinge right" /><div className="shut-tiles">{Array.from({ length: maxTile }, (_, index) => index + 1).map((tile) => { const available = open.includes(tile); const chosen = selected.includes(tile); const appearsInCombo = combinations.some((combo) => combo.includes(tile)); return <button type="button" key={tile} className={`${available ? "open" : "closed"} ${chosen ? "selected" : ""} ${state.lastTotal && appearsInCombo ? "playable" : ""}`} disabled={!isMyTurn || !state.lastTotal || !available} onClick={() => setSelected((values) => values.includes(tile) ? values.filter((value) => value !== tile) : [...values, tile])}><span>{tile}</span><small>{available ? chosen ? localeText("Choisie") : localeText("Ouverte") : localeText("Fermée")}</small></button>; })}</div></div>
    <div className="shut-console"><section className="shut-roll"><DiceThrowTray compact label={localeText("Piste de la boîte")} caption={localeText("Lancer de deux dés")}>{(state.dice.length ? state.dice : [null, null]).map((die, index) => <Die key={`${index}-${die ?? "empty"}-${state.lastTotal ?? 0}`} value={die} kept={false} skin={current?.cosmetics?.equipped?.diceSkin ?? "default"} />)}</DiceThrowTray><div className="shut-total"><small>{localeText("Total à fermer")}</small><strong>{state.lastTotal ?? "—"}</strong></div></section><section className="shut-choice"><div><small>{localeText("Somme sélectionnée")}</small><strong className={selectedTotal > (state.lastTotal ?? Infinity) ? "over" : exact ? "exact" : ""}>{selected.length ? `${selected.join(" + ")} = ${selectedTotal}` : localeText("Choisis des tuiles")}</strong></div>{state.lastTotal && combinations.length > 0 && <div className="shut-suggestions"><span>{localeText("Coups possibles")}</span>{combinations.slice(0, 6).map((combo) => <button type="button" className="secondary" disabled={!isMyTurn} onClick={() => setSelected(combo)} key={combo.join("-")}>{combo.join(" + ")}</button>)}</div>}<div className="actions"><button data-request-feedback="state" aria-busy={rollLocked} className={rollLocked ? "roll-cooldown" : ""} disabled={!isMyTurn || Boolean(state.lastTotal) || rollLocked} onClick={() => onAction({ type: "roll" })}><Dices size={18} />{" " + localeText("Lancer")}</button><button disabled={!isMyTurn || !exact} onClick={() => onAction({ type: "shut", numbers: selected })}><CheckCircle2 size={18} />{" " + localeText("Fermer la sélection")}</button></div></section></div>
  </section>;
}

function BattleResolutionTimer({ endsAt, duration = 10000 }) {
  const { t: localeText } = useLocale();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!endsAt) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [endsAt]);
  const remaining = Math.max(0, endsAt - now);
  const progress = Math.max(0, Math.min(100, remaining / duration * 100));
  return <section className="battle-resolution-timer" aria-live="polite"><div><span>{localeText("Prochaine manche")}</span><strong>{Math.ceil(remaining / 1000)}{" " + localeText("s")}</strong></div><div className="battle-timer-track"><i style={{ width: `${progress}%` }} /></div></section>;
}

export function BattleBoard({ state, user, onDraw, onPlace }) {
  const { t: localeText } = useLocale();
  const [deckOpen, setDeckOpen] = useState(false);
  const self = state.players.find((player) => player.id === user.id) ?? user;
  const opponent = state.players.find((player) => player.id !== user.id);
  const submitted = state.submittedPlayerIds?.includes(user.id);
  const drawnCard = state.drawnCards?.[user.id];
  const resolving = Boolean(state.resolutionEndsAt);
  const forcedLane = state.battleLanes?.find((lane) => lane.tie)?.id ?? null;
  const laneLabel = (laneId) => laneId === "center" ? "Pile centrale" : laneId === "left" ? "Pile A" : "Pile B";
  const laneMarker = (laneId) => laneId === "center" ? "◆" : laneId === "left" ? "A" : "B";
  const latestEvents = state.lastResolution?.events ?? [];
  useEffect(() => { if (state.modifiers?.hiddenDeck) setDeckOpen(false); }, [state.modifiers?.hiddenDeck]);
  const playerStatus = (player) => {
    if (resolving) return "Confrontation en cours";
    if (state.submittedPlayerIds?.includes(player.id)) return "Placement verrouillé";
    const thinking = state.botThinking?.[player.id]?.phase;
    if (thinking === "draw") return "Réfléchit avant de piocher…";
    if (thinking === "place") return "Observe sa carte…";
    if (state.drawnCards?.[player.id]) return player.id === user.id ? "Carte en main" : "Carte piochée";
    return "Prêt à piocher";
  };
  const renderPlayerSide = (player, isSelf) => {
    if (!player) return null;
    const playerDrawnCard = state.drawnCards?.[player.id];
    const playerSubmitted = state.submittedPlayerIds?.includes(player.id);
    const skin = player.cosmetics?.equipped?.cardSkin ?? "default";
    const canInspectDeck = isSelf && !state.modifiers?.hiddenDeck && Boolean(state.deckOverview);
    return <section className={`battle-player-side ${isSelf ? "battle-self" : "battle-opponent"}`} key={player.id} data-card-owner={player.id}>
      <div className="battle-player-heading"><div><small>{isSelf ? localeText("Ton camp") : localeText("Adversaire")}</small><strong><DisplayName user={player} /></strong></div><span className={state.botThinking?.[player.id] ? "thinking" : playerSubmitted ? "submitted" : ""}>{playerStatus(player)}</span></div>
      <div className="battle-player-layout">
        <div className="battle-deck-station">
          <div className={`battle-deck-stack ${canInspectDeck ? "inspectable" : ""}`} role={canInspectDeck ? "button" : undefined} tabIndex={canInspectDeck ? 0 : -1} title={canInspectDeck ? localeText("Consulter l’estimation de ta pioche") : state.modifiers?.hiddenDeck && isSelf ? localeText("Pioche cachée par les modificateurs") : undefined} onClick={() => canInspectDeck && setDeckOpen(true)} onKeyDown={(event) => { if (canInspectDeck && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); setDeckOpen(true); } }}><PlayingCard hidden skin={skin} /><b>{state.piles?.[player.id]?.length ?? 0}</b><small>{canInspectDeck ? localeText("Estimer la pioche") : localeText("Pioche")}</small></div>
          <div className={`battle-drawn-station ${playerDrawnCard ? "has-card" : ""} ${playerSubmitted ? "submitted-card" : ""}`}>
            {playerDrawnCard ? <PlayingCard key={`drawn-${state.round}-${player.id}`} card={isSelf && !playerDrawnCard.hidden ? playerDrawnCard : null} hidden={!isSelf || Boolean(playerDrawnCard.hidden)} skin={skin}  motionKey={`battle:${player.id}:${state.round}`}/> : playerSubmitted ? <PlayingCard key={`locked-${state.round}-${player.id}`} hidden skin={skin} /> : <div className="battle-empty-card"><small>{localeText("Carte piochée")}</small></div>}
            <small>{playerSubmitted ? localeText("Choix secret") : playerDrawnCard ? (isSelf ? localeText("Ta carte") : localeText("Carte en main")) : localeText("En attente")}</small>
          </div>
          {isSelf && !playerDrawnCard && !playerSubmitted && !resolving && <button type="button" className="battle-draw-button" disabled={!(state.piles?.[player.id]?.length ?? 0)} onClick={onDraw}>{localeText("Piocher une carte")}</button>}
        </div>
        <div data-card-arrival="played" className={`battle-player-field ${state.battleLanes?.length === 1 ? "single-lane" : ""}`}>{(state.battleLanes ?? []).map((lane) => {
          const playerCards = lane.cards.filter((entry) => entry.ownerId === player.id);
          const card = playerCards.at(-1);
          const resolutionEvent = resolving ? latestEvents.find((event) => event.laneId === lane.id) : null;
          const calculation = resolutionEvent?.calculations?.[player.id];
          const cardsToShow = lane.resolving || lane.tie ? playerCards : card ? [card] : [];
          const placementDisabled = resolving || !isSelf || !drawnCard || submitted || Boolean(forcedLane && forcedLane !== lane.id);
          const showPlacementAction = isSelf && drawnCard && !submitted && !resolving;
          return <div className={`battle-placement-slot ${lane.tie ? "war-active" : ""} ${lane.resolving ? "resolving" : ""}`} key={`${player.id}-${lane.id}`}><span className="battle-lane-marker">{laneMarker(lane.id)}</span>{cardsToShow.length ? <div className="battle-card-stack">{cardsToShow.map((visibleCard, index) => <PlayingCard key={`${player.id}-${lane.id}-${visibleCard.placedRound}-${index}`} card={visibleCard.hidden ? null : visibleCard} hidden={Boolean(visibleCard.hidden)} skin={skin} style={{ "--battle-card-index": index }}  motionKey={`battle:${player.id}:${visibleCard.placedRound}`}/>)}</div> : <div className="battle-empty-card"><small>{laneLabel(lane.id)}</small></div>}<small>{playerCards.length ? localeText("{value0} carte{value1} engagée{value2}", { value0: playerCards.length, value1: playerCards.length > 1 ? "s" : "", value2: playerCards.length > 1 ? "s" : "" }) : localeText("Libre")}</small>{calculation && <div className="battle-score-calculation"><strong>{calculation.total}{" " + localeText("pts")}</strong><span>{localeText(calculation.label)}</span>{calculation.combos?.length ? <small>{calculation.combos.join(" + ")}</small> : null}</div>}{isSelf && <button type="button" className={showPlacementAction ? "" : "battle-placement-placeholder"} disabled={!showPlacementAction || placementDisabled} tabIndex={showPlacementAction ? 0 : -1} aria-hidden={!showPlacementAction} onClick={() => onPlace(lane.id)}>{lane.tie ? localeText("Défendre {value0}", { value0: laneLabel(lane.id) }) : localeText("Placer sur {value0}", { value0: laneLabel(lane.id) })}</button>}</div>;
        })}</div>
      </div>
    </section>;
  };
  return (
    <div className="strategic-battle">
      <div className="battle-round-heading"><div><span>{localeText("Manche") + " "}{state.round} · {battleScoringLabels[state.modifiers?.scoringMode] ?? battleScoringLabels["high-card"]}</span><strong>{resolving ? localeText("Résolution de la confrontation") : submitted ? localeText("Placement verrouillé") : drawnCard ? (forcedLane ? localeText("Défends {value0}", { value0: laneLabel(forcedLane) }) : state.battleLanes?.length === 1 ? localeText("Place ta carte sur la pile centrale") : localeText("Choisis la pile A ou B")) : localeText("Pioche ta carte")}</strong></div><small>{resolving ? localeText("Les cartes restent sur le tapis jusqu’à la fin du décompte.") : submitted ? localeText("Ta carte et sa pile restent secrètes jusqu’à la résolution.") : drawnCard ? localeText("Tu connais ta carte; ton adversaire n’en voit que le dos.") : localeText("La pioche est une action visible, mais sa valeur reste privée.")}</small></div>
      {resolving && <BattleResolutionTimer endsAt={state.resolutionEndsAt} duration={state.resolutionDurationMs} />}
      <div className="battle-mode-strip"><span><strong>{state.battleLanes?.length === 1 ? localeText("Pile simple") : localeText("Pile double")}</strong>{battleScoringLabels[state.modifiers?.scoringMode]}</span><span>{localeText("Retour après") + " "}{state.modifiers?.returnAfterRounds ?? 3}{" " + localeText("manches")}</span><span>{state.modifiers?.hiddenDeck ? <EyeOff size={15} /> : <Eye size={15} />}{" " + localeText("Pioche") + " "}{state.modifiers?.hiddenDeck ? localeText("cachée") : localeText("visible")}</span></div>
      <div className="battle-table-faceoff">
        {renderPlayerSide(opponent, false)}
        <div className={`battle-confrontation-axis ${state.battleLanes?.length === 1 ? "single-lane" : ""}`}>{(state.battleLanes ?? []).map((lane) => { const event = resolving ? latestEvents.find((entry) => entry.laneId === lane.id) : null; return <div className={lane.tie ? "war-active" : lane.resolving ? "resolving" : ""} key={lane.id}><Swords size={18} /><strong>{laneLabel(lane.id)}</strong><small>{event?.type === "battle" ? localeText("{value0} pts gagnants", { value0: event.calculations?.[event.winnerId]?.total ?? "—" }) : event?.type === "tie" ? localeText("Égalité · Bataille") : event?.type === "return" ? localeText("Retour à la pioche") : lane.tie ? localeText("Bataille en cours") : lane.cards.length ? localeText("{value0}/{value1} sans duel", { value0: lane.idleRounds, value1: state.modifiers?.returnAfterRounds ?? 3 }) : localeText("Zone de confrontation")}</small></div>; })}</div>
        {renderPlayerSide(self, true)}
      </div>
      {latestEvents.length > 0 && <section className="battle-resolution"><div className="panel-heading"><span>{localeText("Résolution de la manche") + " "}{state.lastResolution.round}</span><small>{latestEvents.length}{" " + localeText("événement")}{latestEvents.length > 1 ? localeText("s") : ""}</small></div>{latestEvents.map((event, index) => <article className={`battle-event event-${event.type}`} key={`${state.lastResolution.round}-${event.laneId}-${event.type}-${index}`}><div><strong>{laneLabel(event.laneId)}</strong><span>{event.type === "battle" ? <><DisplayName user={state.players.find((player) => player.id === event.winnerId)} />{" " + localeText("remporte") + " "}{event.wonCards}{" " + localeText("carte(s) ·") + " "}{localeText(event.calculations?.[event.winnerId]?.label)}{event.unseenWonCards ? localeText(" · {value0} obtenue(s) non identifiée(s)", { value0: event.unseenWonCards }) : ""}</> : event.type === "tie" ? localeText("Égalité à {value0} points : {value1} carte(s) restent en jeu", { value0: Object.values(event.calculations ?? {})[0]?.total ?? "—", value1: event.stake }) : event.reason === "timeout" ? localeText("{value0} carte(s) retournent face cachée dans la pioche après {value1} manches", { value0: event.count, value1: state.modifiers?.returnAfterRounds ?? 3 }) : localeText("Les cartes bloquées retournent dans les pioches")}</span></div>{resolving && event.cards && <div className="battle-revealed-cards">{state.players.map((player) => event.cards[player.id] ? <div key={player.id}><div className="battle-event-card-row">{(Array.isArray(event.cards[player.id]) ? event.cards[player.id] : [event.cards[player.id]]).map((card, cardIndex) => <PlayingCard key={`${card.rank}-${card.suit}-${cardIndex}`} card={card} skin={player.cosmetics?.equipped?.cardSkin ?? "default"} />)}</div><small>{player.pseudo}</small></div> : null)}</div>}</article>)}</section>}
      {deckOpen && state.deckOverview && <ModalBackdrop className="modal-backdrop battle-deck-modal-layer" onClick={() => setDeckOpen(false)}><div className="modal battle-deck-modal" onClick={(event) => event.stopPropagation()}><div className="modal-title-row"><div><span className="eyebrow">{localeText("Estimation de la pioche")}</span><h2>{state.deckOverview.total}{" " + localeText("cartes dans ton paquet")}</h2></div><button className="secondary icon-toggle" onClick={() => setDeckOpen(false)}><X size={18} /></button></div><p>{localeText("Cette vue respecte les informations que tu as réellement obtenues. Une carte absente de la liste est connue comme impossible dans ta pioche.")}</p><div className="battle-deck-knowledge-summary"><span className="certain"><CheckCircle2 size={18} /><strong>{state.deckOverview.certainCount}</strong><small>{localeText("Présence certaine · 100 %")}</small></span><span className="possible"><HelpCircle size={18} /><strong>{state.deckOverview.possibleCount}</strong><small>{localeText("Présence possible")}</small></span><span className="impossible"><X size={18} /><small>{localeText("0 % · non affichée")}</small></span></div>{state.deckOverview.unseenAcquiredCount > 0 && <div className="battle-acquired-note"><Trophy size={17} /><span><strong>{state.deckOverview.unseenAcquiredCount}{" " + localeText("carte")}{state.deckOverview.unseenAcquiredCount > 1 ? localeText("s") : ""}{" " + localeText("obtenue")}{state.deckOverview.unseenAcquiredCount > 1 ? localeText("s") : ""}</strong>{" " + localeText("lors d'une victoire, valeur encore inconnue.")}</span></div>}<div className="battle-deck-card-grid">{state.deckOverview.cards.map((card) => <div className={`battle-deck-probability ${card.status}`} key={`${card.rank}-${card.suit}`}><PlayingCard card={card} skin={self.cosmetics?.equipped?.cardSkin ?? "default"} /><span title={card.status === "certain" ? localeText("Présence certaine") : localeText("Présence possible")}>{card.status === "certain" ? <CheckCircle2 size={15} /> : "?"}</span></div>)}</div></div></ModalBackdrop>}
    </div>
  );
}

function MidnightContractCatalog({ state, contracts, tierEntries, usedContracts, selecting, onAction }) {
  const { t: localeText } = useLocale();
  const visibleEntries=Object.entries(midnightContractInfo).filter(([id])=>!selecting || contracts.some(([offered])=>offered===id) && !usedContracts.includes(id));
  const visibleTiers=tierEntries.filter(([tierId])=>visibleEntries.some(([,info])=>info.tier===tierId));
  return <section className={`midnight-codex-panel ${selecting ? "midnight-selection" : ""}`} aria-label={selecting ? localeText("Choisir un mandat") : localeText("Codex des mandats")}>
    <header className="midnight-codex-heading"><div><span className="eyebrow">{selecting ? localeText("Sélection secrète") : localeText("Archives de la table")}</span><p>{localeText("Chaque lancer rapporte sa somme. Réussir le mandat ajoute la prime de son palier.")}</p></div></header>
    {!selecting && <div className="midnight-tier-legend">{visibleTiers.map(([id, tier]) => <span className={`tier-${id}`} style={{ "--contract-accent": tier.accent }} key={id}><i /><strong>{localeText(tier.label)}</strong><small>+{tier.bonus}{" " + localeText("pts")}</small></span>)}</div>}
    <div className="midnight-codex-groups">{visibleTiers.map(([tierId, tier]) => {
      const entries = visibleEntries.filter(([, info]) => info.tier === tierId);
      if (!entries.length) return null;
      return <section style={{ "--contract-accent": tier.accent }} key={tierId}><header><span className="midnight-tier-badge">{localeText(tier.label)}</span><strong>{localeText("Prime +")}{tier.bonus}</strong><small>{entries.length}{" " + localeText("mandat")}{entries.length > 1 ? localeText("s") : ""}</small></header><div>{entries.map(([id, info]) => {
        const example = midnightContractEvaluation(id, info.example);
        const offered = contracts.some(([contractId]) => contractId === id);
        const used = usedContracts.includes(id);
        const unavailable = used;
        const selectable = selecting && offered && !unavailable;
        return <article className={`${offered ? "offered" : ""} ${unavailable ? "used" : ""}`} style={{"--contract-accent":tier.accent}} key={id}><div>{selecting && <span className="midnight-tier-badge">{localeText(tier.label)}</span>}<strong>{localeText(info.label)}</strong><small>{info.hint}</small></div><div className="midnight-codex-example">{info.example.map((value, index) => <Die value={value} kept={false} animate={false} skin="default" key={`${id}-${index}`} />)}</div><footer><span>{offered ? unavailable ? localeText("Rotation actuelle · utilisé") : localeText("Disponible maintenant") : localeText("Hors rotation")}</span><b>{example.base} + {tier.bonus} = {example.points}{" " + localeText("pts")}</b>{selectable && <button type="button" onClick={() => onAction({ type: "choose-contract", contract: id })}>{localeText("Choisir")}</button>}</footer></article>;
      })}</div></section>;
    })}</div>
  </section>;
}

export function MidnightDiceBoard({ state, user, onAction }) {
  const { t: localeText } = useLocale();
  const [codexOpen, setCodexOpen] = useState(false);
  const current = state.players[state.currentPlayerIndex];
  const isMyTurn = current?.id === user.id;
  const ownContract = state.secretContracts?.[user.id];
  const usedContracts = state.usedContracts?.[user.id] ?? [];
  const marketSkin = current?.cosmetics?.equipped?.diceSkin ?? user.cosmetics?.equipped?.diceSkin ?? "default";
  const contracts = (state.contractOffers ?? Object.keys(midnightContractInfo).slice(0, 4)).map((id) => [id, midnightContractInfo[id]]).filter(([, info]) => info);
  const currentContract = midnightContractInfo[ownContract];
  const currentTier = midnightContractTiers[currentContract?.tier] ?? midnightContractTiers.bronze;
  const ownDice = state.trays?.[user.id] ?? [];
  const currentEvaluation = midnightContractEvaluation(ownContract, ownDice);
  const tierEntries = Object.entries(midnightContractTiers).sort(([, left], [, right]) => left.order - right.order);
  const selectingContract = state.phase === "contract" && isMyTurn;
  const showCodex = selectingContract || codexOpen;
  return <section className="midnight-table">
    <header className="midnight-heading"><div><span className="eyebrow">{localeText("Salle des mandats")}</span><h2>{localeText("Dés de Minuit")}</h2><p>{localeText("Manche") + " "}{state.round} / {state.modifiers.rounds}</p></div><div className="midnight-heading-actions"><button type="button" className="secondary midnight-codex-button" disabled={selectingContract} aria-expanded={showCodex} onClick={() => setCodexOpen((open) => !open)}><BookOpen size={17} /> {selectingContract ? localeText("Mandats affichés") : showCodex ? localeText("Masquer les mandats") : localeText("Voir les 12 mandats")}</button><div className={`midnight-phase phase-${state.phase}`}><small>{state.phase === "contract" ? localeText("Mandat secret") : localeText("Marché ouvert")}</small><strong>{isMyTurn ? localeText("À toi de décider") : localeText("{value0} réfléchit", { value0: current?.pseudo ?? "Le croupier" })}</strong></div></div></header>
    <div className="midnight-player-trays">{state.players.map((player) => { const dice = state.trays?.[player.id] ?? []; const isSelf = player.id === user.id; return <article className={`${player.id === current?.id ? "active" : ""} ${isSelf ? "self" : ""}`} key={player.id}><header><DisplayName user={player} /><strong>{state.scores?.[player.id] ?? 0}{" " + localeText("pts")}</strong></header><div className="midnight-tray-dice">{[0, 1, 2].map((index) => <div className="midnight-die-slot" key={index}>{dice[index] ? <Die value={dice[index]} kept={false} skin={player.cosmetics?.equipped?.diceSkin ?? "default"} /> : <span>{index + 1}</span>}</div>)}</div><footer><span>{isSelf && ownContract ? midnightContractLabel(ownContract) : state.phase === "contract" ? localeText("Choix en cours") : localeText("Mandat masqué")}</span>{isSelf && ownContract && <b>{localeText("Projection") + " "}{midnightScorePreview(ownContract, dice)}{" " + localeText("pts")}</b>}</footer></article>; })}</div>
    {currentContract && <aside className="midnight-current-contract" style={{ "--contract-accent": currentTier.accent }}><div><EyeOff size={22} /><span><small>{localeText("Ton mandat en cours")}</small><strong>{localeText(currentContract.label)}</strong></span><b className="midnight-tier-badge">{localeText(currentTier.label)}</b></div><p>{currentContract.hint}</p><div><span>{ownDice.length}{" " + localeText("/ 3 dés · base") + " "}{currentEvaluation.base}</span><b>{ownDice.length === 3 ? currentEvaluation.achieved ? localeText("{value0} + {value1} = {value2} points", { value0: currentEvaluation.base, value1: currentEvaluation.bonus, value2: currentEvaluation.points }) : localeText("{value0} points · mandat manqué", { value0: currentEvaluation.points }) : localeText("Prime de réussite +{value0}", { value0: currentTier.bonus })}</b></div></aside>}
    {state.phase === "contract" && <div className={`midnight-contract-room midnight-contract-prompt ${isMyTurn ? "active" : "waiting"}`}><div><span className="eyebrow">{localeText("Mandat secret")}</span><strong>{isMyTurn ? localeText("Choisis ton objectif pour cette manche") : localeText("{value0} choisit son mandat", { value0: current?.pseudo ?? "Un joueur" })}</strong><small>{isMyTurn ? localeText("Les mandats disponibles sont affichés directement ci-dessous.") : localeText("Les quatre propositions restent secrètes jusqu’à la résolution.")}</small></div><div className="midnight-offer-preview" aria-label={localeText("Paliers proposés")}>{contracts.map(([id, info]) => { const tier = midnightContractTiers[info.tier]; return <span style={{ "--contract-accent": tier.accent }} title={`${tier.label} · ${midnightContractLabel(id)}`} key={id}><i />{localeText(tier.label)}</span>; })}</div></div>}
    {state.phase === "draft" && <div className="midnight-market"><div className="midnight-market-head"><div><span className="eyebrow">{localeText("Marché commun")}</span><h3>{state.market.length}{" " + localeText("dés disponibles")}</h3></div><div><strong>{state.discardRemaining?.[user.id] ?? 0}</strong><small>{localeText("défausse(s) restante(s)")}</small></div></div><div className="midnight-market-throw"><span className="midnight-market-table-label">{localeText("Piste commune · dés lancés pour la manche")}</span><div className="midnight-market-grid">{state.market.map((die, index) => <article key={`${state.round}-${index}-${die}`} style={{ "--market-die-rotation": `${[-3, 5, -6, 3, 7, -4][index % 6]}deg` }}><Die value={die} kept={false} skin={marketSkin} /><div>{isMyTurn ? <><button onClick={() => onAction({ type: "draft", index })}>{localeText("Prendre")}</button><button className="secondary" disabled={(state.discardRemaining?.[user.id] ?? 0) <= 0} onClick={() => onAction({ type: "discard-market", index })}>{localeText("Écarter")}</button></> : <span>{localeText("Disponible")}</span>}</div></article>)}</div></div>{state.discardTray?.length > 0 && <div className="midnight-discard-strip"><span>{localeText("Derniers dés écartés")}</span>{state.discardTray.slice(-6).map((entry, index) => <b key={`${entry.playerId}-${index}`}>{entry.die} → {entry.replacement}</b>)}</div>}</div>}
    {state.lastRound && <div className="midnight-reveal"><div className="panel-heading"><span>{localeText("Résultat de la manche") + " "}{state.lastRound.round}</span><small>{localeText("Les mandats sont désormais publics.")}</small></div><div>{state.lastRound.results.map((result) => { const info = midnightContractInfo[result.contract]; const evaluation = result.achieved === undefined ? midnightContractEvaluation(result.contract, result.dice) : result; const tier = midnightContractTiers[evaluation.tier ?? info?.tier] ?? midnightContractTiers.bronze; return <article className={evaluation.achieved ? "achieved" : "missed"} style={{ "--contract-accent": tier.accent }} key={result.playerId}><DisplayName user={state.players.find((player) => player.id === result.playerId)} /><span><b>{localeText(tier.label)}</b> · {midnightContractLabel(result.contract)} · {result.dice.join("–")} · {evaluation.achieved ? localeText("base {value0} + prime {value1}", { value0: evaluation.base, value1: evaluation.bonus }) : localeText("mandat manqué")}</span><strong>+{evaluation.points}</strong></article>; })}</div></div>}
    {showCodex && <Dialog title={selectingContract ? localeText("Choisis ton mandat") : localeText("Codex des mandats")} className="midnight-contract-dialog" layerClassName="midnight-contract-dialog-layer" dismissible={!selectingContract} onClose={() => setCodexOpen(false)}><MidnightContractCatalog state={state} contracts={contracts} tierEntries={tierEntries} usedContracts={usedContracts} selecting={selectingContract} onAction={onAction} /></Dialog>}
  </section>;
}

export function VelvetRuseBoard({ state, user, onAction }) {
  const { t: localeText } = useLocale();
  const [selectedCard, setSelectedCard] = useState(null);
  const [claim, setClaim] = useState({ rank: state.edict?.rank ?? "A", suit: state.edict?.suit ?? "S" });
  const current = state.players[state.currentPlayerIndex];
  const isMyTurn = current?.id === user.id;
  const hand = state.hands?.[user.id] ?? [];
  const cardSkin = user.cosmetics?.equipped?.cardSkin ?? "default";
  const ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  const claimAllowed = velvetClaimAllowed(claim, state.edict, state.modifiers?.claimRule);
  useEffect(() => {
    setSelectedCard(null);
    setClaim({ rank: state.edict?.rank ?? "A", suit: state.edict?.suit ?? "S" });
  }, [state.currentPlayerIndex, state.phase, state.edict?.rank, state.edict?.suit]);
  const phaseLabel = state.phase === "decision" ? "Verdict" : state.phase === "draw" ? "Pioche" : "Déclaration";
  return <section className="velvet-table card-game-arena">
    <header className="velvet-heading"><div><span className="eyebrow">{localeText("Salon confidentiel")}</span><h2>{localeText("Velours Noir")}</h2></div><div className={`velvet-turn phase-${state.phase}`}><small>{phaseLabel}</small><strong>{isMyTurn ? localeText("Ta décision") : localeText("{value0} joue", { value0: current?.pseudo ?? "Un joueur" })}</strong></div></header>
    <div className="velvet-opponents">{state.players.filter((player) => player.id !== user.id).map((player) => <article className={player.id === current?.id ? "active" : ""} key={player.id} data-card-owner={player.id}><DisplayName user={player} /><div className="velvet-opponent-hand">{Array.from({ length: Math.min(4, state.hands?.[player.id]?.length ?? 0) }, (_, index) => <PlayingCard hidden key={index} skin={player.cosmetics?.equipped?.cardSkin ?? "default"} />)}</div><small>{state.hands?.[player.id]?.length ?? 0}{" " + localeText("cartes ·") + " "}<b>{state.prestige?.[player.id] ?? 0}</b>{" " + localeText("prestige")}</small></article>)}</div>
    <div className="velvet-center"><div className="velvet-card-station"><span>{localeText("Pioche")}</span><button type="button" disabled={!isMyTurn || state.phase !== "draw" || !state.deck.length} onClick={() => onAction({ type: "draw", source: "deck" })}><PlayingCard hidden skin={cardSkin} /><b>{state.deck.length}</b></button></div><div className="velvet-edict"><span>{localeText("Carte d'influence")}</span><PlayingCard card={state.edict} skin={cardSkin} /><strong>{state.modifiers?.claimRule === "suit-only" ? localeText("Annonce {value0}", { value0: suits[state.edict?.suit]?.name }) : state.modifiers?.claimRule === "rank-only" ? localeText("Annonce un {value0}", { value0: state.edict?.rank }) : localeText("Même rang ou {value0}", { value0: suits[state.edict?.suit]?.name })}</strong></div><div className="velvet-dossier" data-card-arrival="played"><span>{localeText("Dossier sous scellés")}</span><div>{Array.from({ length: state.modifiers?.dossierSize ?? 6 }, (_, index) => { const entry = state.dossier?.[index]; return <div className={entry ? "filled" : ""} key={index}>{entry ? <><PlayingCard hidden skin={state.players.find((player) => player.id === entry.playerId)?.cosmetics?.equipped?.cardSkin ?? cardSkin}  playerId={entry.playerId}/><small>{entry.claim.rank}{suits[entry.claim.suit]?.symbol}</small></> : <b>{index + 1}</b>}</div>; })}</div><strong>{state.dossier?.length ?? 0} / {state.modifiers?.dossierSize ?? 6}{" " + localeText("avant audit")}</strong></div><div className="velvet-card-station discard" data-card-arrival="played"><span>{localeText("Défausse")}</span><button type="button" disabled={!isMyTurn || state.phase !== "draw" || !state.modifiers?.openDiscardDraw || !state.discard?.length} onClick={() => onAction({ type: "draw", source: "discard" })}><PlayingCard card={state.discard?.at(-1)} hidden={!state.discard?.length} skin={cardSkin} /><b>{state.modifiers?.openDiscardDraw ? localeText("Récupérer") : localeText("Fermée")}</b></button></div></div>
    {state.pendingClaim && <div className="velvet-pending"><div><EyeOff size={22} /><span><small>{playerName(state.players, state.pendingClaim.playerId)}{" " + localeText("annonce")}</small><strong>{state.pendingClaim.claim.rank}{suits[state.pendingClaim.claim.suit]?.symbol} · {suits[state.pendingClaim.claim.suit]?.name}</strong></span></div>{isMyTurn && state.phase === "decision" ? <div className="actions"><button onClick={() => onAction({ type: "trust" })}>{localeText("Faire confiance")}</button><button className="danger-button" onClick={() => onAction({ type: "challenge" })}>{localeText("Contester")}</button></div> : <span>{localeText("Décision en attente")}</span>}</div>}
    <div className={`velvet-self ${isMyTurn ? "active" : ""}`} data-card-owner={user.id}><header><div><span className="eyebrow">{localeText("Ta main")}</span><h3>{state.prestige?.[user.id] ?? 0} / {state.modifiers?.targetPrestige ?? 20}{" " + localeText("prestige")}</h3></div><small>{state.phase === "play" && isMyTurn ? localeText("Choisis une carte, puis défausse-la ou annonce-la.") : state.phase === "draw" && isMyTurn ? localeText("Choisis ta source de pioche.") : state.phase === "decision" && isMyTurn ? localeText("Lis la déclaration avant de décider.") : localeText("Observe le tour en cours.")}</small></header><div className="velvet-hand">{hand.map((card, index) => <button type="button" className={selectedCard === index ? "selected" : ""} disabled={!isMyTurn || state.phase !== "play"} onClick={() => setSelectedCard(index)} key={`${card?.deckId ?? 0}-${card?.rank}-${card?.suit}-${index}`}><PlayingCard card={card} skin={cardSkin} /><span>{selectedCard === index ? localeText("Sélectionnée") : localeText("Choisir")}</span></button>)}</div>{isMyTurn && state.phase === "play" && <div className="velvet-play-console"><div className="velvet-claim-fields"><label>{localeText("Rang annoncé")}<select value={claim.rank} onChange={(event) => setClaim({ ...claim, rank: event.target.value })}>{ranks.map((rank) => <option key={rank}>{rank}</option>)}</select></label><label>{localeText("Enseigne annoncée")}<select value={claim.suit} onChange={(event) => setClaim({ ...claim, suit: event.target.value })}>{Object.entries(suits).map(([id, suit]) => <option value={id} key={id}>{suit.symbol} {suit.name}</option>)}</select></label><span className={claimAllowed ? "valid" : "invalid"}>{claimAllowed ? localeText("Annonce conforme") : localeText("Ne respecte pas l'influence")}</span></div><div className="actions"><button disabled={selectedCard === null || !claimAllowed} onClick={() => onAction({ type: "declare", cardIndex: selectedCard, claimRank: claim.rank, claimSuit: claim.suit })}>{localeText("Glisser face cachée")}</button><button className="secondary" disabled={selectedCard === null} onClick={() => onAction({ type: "discard", cardIndex: selectedCard })}>{localeText("Défausser face visible")}</button></div></div>}</div>
    {state.lastChallenge && <div className={`velvet-reveal ${state.lastChallenge.truthful ? "truth" : "lie"}`}><strong>{state.lastChallenge.truthful ? localeText("Déclaration exacte") : localeText("Bluff démasqué")}</strong><span>{state.lastChallenge.claim.rank}{suits[state.lastChallenge.claim.suit]?.symbol}{" " + localeText("annoncé ·") + " "}{state.lastChallenge.actual.rank}{suits[state.lastChallenge.actual.suit]?.symbol}{" " + localeText("révélé")}</span></div>}
    {state.lastAudit?.entries?.length > 0 && <div className="velvet-audit"><span>{localeText("Dernier audit")}</span><div>{state.lastAudit.entries.map((entry, index) => <article className={entry.truthful ? "truth" : "lie"} key={`${entry.playerId}-${index}`}><PlayingCard card={entry.actual} skin={state.players.find((player) => player.id === entry.playerId)?.cosmetics?.equipped?.cardSkin ?? cardSkin} /><small>{entry.truthful ? localeText("+1 exact") : localeText("−2 bluff")}</small></article>)}</div></div>}
  </section>;
}
