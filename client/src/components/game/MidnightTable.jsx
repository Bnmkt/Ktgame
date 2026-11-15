import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BookOpen, Check, Crown, Dices, Eye, RotateCcw, Trophy, ZoomIn } from "lucide-react";
import { useLocale } from "../../locales/LocaleProvider.jsx";
import { midnightCatalogFor, midnightContractTiers, midnightVictoryLabels, midnightRoundHistory, midnightRoundWinners } from "../../features/games/midnightDice/contracts.js";
import { DisplayName } from "../cosmetics/Cosmetics.jsx";
import { Dialog } from "../common/Dialog.jsx";
import { Die } from "./GamePieces.jsx";
import { MidnightContractCard } from "./MidnightContractCard.jsx";
import "./midnight-table.css";

export function MidnightVictory({ state }) {
  const { t } = useLocale();
  const criterion = state.resolvedOptions?.victory ?? (state.modifiers?.victory === "midnight" && !state.finished ? null : state.modifiers?.victory ?? "highest");
  return <div className="midnight-victory-rule" role="status"><Trophy size={15}/><span>{t("Victoire")} · <strong>{t(midnightVictoryLabels[criterion] ?? "Condition secrète · révélée en fin de partie")}</strong></span></div>;
}

function MidnightClock({ state }) {
  const { t } = useLocale();
  const maximum = state.modifiers?.rounds ?? 5;
  return <div className="midnight-round-clock" aria-label={t("Manche {round} sur {total}", { round: state.round, total: maximum })}><span aria-hidden="true" style={{ "--midnight-clock-turn": `${(state.round - 1) / maximum * 360}deg` }}>{Array.from({ length: maximum }, (_, i) => <i key={i} style={{ rotate: `${i * 360 / maximum}deg` }}/>)}</span><strong>{t("Manche")} {state.round} / {maximum}</strong></div>;
}

function MidnightPlayerZone({ player, state, userId, onInspect }) {
  const { t } = useLocale();
  const catalog = midnightCatalogFor(state), own = player.id === userId;
  const contract = own ? state.secretContracts?.[player.id] : null;
  const active = !state.finished && state.players[state.currentPlayerIndex]?.id === player.id;
  const leader = state.players[state.startingPlayerIndex]?.id === player.id;
  return <article className={`midnight-player-zone ${own ? "midnight-player-local" : ""} ${active ? "midnight-player-active" : ""}`} data-midnight-player={player.id} aria-current={active ? "true" : undefined}>
    <header><DisplayName user={player}/><strong>{state.scores?.[player.id] ?? 0} {t("pts")}</strong></header>
    <div className="midnight-player-marks">{own && <span>{t("Vous")}</span>}{leader && <span><Crown size={12}/>{t("Meneur")}</span>}{active && <strong>{t("À jouer")}</strong>}</div>
    <div className="midnight-player-resources"><div className="midnight-player-dice">{[0, 1, 2].map(index => <div data-midnight-die-slot={`${player.id}:${index}`} key={index}>{state.trays?.[player.id]?.[index] ? <Die value={state.trays[player.id][index]} skin={player.cosmetics?.equipped?.diceSkin ?? "default"} rollKey={`${state.round}:${player.id}:${index}`} animate={false} static3D/> : <span>{index + 1}</span>}</div>)}</div><span className="midnight-player-rerolls" title={t("Relances restantes pour toute la manche")}><RotateCcw size={12}/>{state.discardRemaining?.[player.id] ?? state.modifiers?.discardsPerRound ?? 0}</span></div>
    <footer><button type="button" className="midnight-personal-contract" disabled={!contract} onClick={() => onInspect(contract)} aria-label={own && contract ? t("Consulter mon mandat") : t("Mandat secret")}><MidnightContractCard definition={catalog[contract]} design={state.cardDesign} hidden={!contract}/></button><span>{contract ? catalog[contract]?.label : t("Mandat secret")}</span></footer>
  </article>;
}

// Visual motion follows authoritative snapshots; no timeout can delay an action.
function useMidnightMotion(root, state, matchKey, userId, dealKey) {
  const previous = useRef(null), animations = useRef(new Set());
  useLayoutEffect(() => {
    const surface = root.current;
    if (!surface) return;
    const read = selector => Object.fromEntries([...surface.querySelectorAll(selector)].map(node => [node.getAttribute("data-midnight-offer") ?? node.getAttribute("data-midnight-market-id"), node.getBoundingClientRect()]));
    const seats = Object.fromEntries([...surface.querySelectorAll("[data-midnight-player]")].map(node => [node.dataset.midnightPlayer, node.querySelector(".midnight-personal-contract").getBoundingClientRect()]));
    const current = { matchKey, round: state.round, offers: read("[data-midnight-offer]"), market: read("[data-midnight-market-id]"), seats, trays: structuredClone(state.trays ?? {}), contract: state.secretContracts?.[userId] };
    const before = previous.current; previous.current = current;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const play = (node, from, to, delay = 0, remove = false) => {
      if (!node || !from || !to || !from.width || !to.width) return;
      const animation = node.animate([{ transform: `translate(${from.x - to.x}px, ${from.y - to.y}px) rotate(${remove ? -9 : 0}deg) scale(.8)` }, { transform: "translate(0, 0) rotate(0deg) scale(1)" }], { duration: 400, delay, easing: "cubic-bezier(.2,.7,.3,1)", fill: "backwards" });
      const entry = { animation, node, remove }; animations.current.add(entry);
      animation.finished.catch(() => {}).finally(() => { animations.current.delete(entry); if (remove) node.remove(); });
    };
    const deck = surface.querySelector("[data-midnight-deck] .midnight-card");
    const flight = (from, target, delay = 0) => {
      if (!deck || !target || !from) return;
      const to = target.getBoundingClientRect(), node = deck.cloneNode(true);
      node.className = "midnight-card midnight-card-flight"; node.setAttribute("aria-hidden", "true");
      Object.assign(node.style, { position: "fixed", left: `${to.x}px`, top: `${to.y}px`, width: `${to.width}px`, height: `${to.height}px`, zIndex: 2000, pointerEvents: "none" });
      surface.append(node); play(node, from, to, delay, true);
    };
    const sameMatch = before?.matchKey === matchKey;
    let initial = false;
    if (dealKey) {
      try { const key = `ktga-midnight-dealt:${dealKey}`; initial = !sessionStorage.getItem(key); if (initial) sessionStorage.setItem(key, "1"); } catch { initial = !before; }
    }
    if (initial || sameMatch && before.round !== current.round) {
      [...surface.querySelectorAll("[data-midnight-offer]")].forEach((node, index) => {
        if (initial || !Object.hasOwn(before.offers, node.dataset.midnightOffer)) flight(deck?.getBoundingClientRect(), node, index * 65);
      });
      if (initial) [...surface.querySelectorAll(".midnight-personal-contract")].forEach((node, index) => flight(deck?.getBoundingClientRect(), node, index * 55));
    }
    if (sameMatch && !before.contract && current.contract) flight(before.offers[current.contract], surface.querySelector(`[data-midnight-player="${CSS.escape(userId)}"] .midnight-personal-contract`));
    if (sameMatch && before.round === current.round) {
      const removed = Object.keys(before.market).filter(id => !Object.hasOwn(current.market, id));
      let index = 0;
      for (const [playerId, dice] of Object.entries(state.trays ?? {})) for (let slot = before.trays[playerId]?.length ?? 0; slot < dice.length; slot++) {
        const target = surface.querySelector(`[data-midnight-die-slot="${CSS.escape(`${playerId}:${slot}`)}"] .die`);
        play(target, before.market[removed[index++]], target?.getBoundingClientRect());
      }
    }
    if (sameMatch && before.round !== current.round) {
      Object.values(before.seats).forEach((from, index) => flight(from, surface.querySelector("[data-midnight-discard]"), index * 35));
    }
  }, [state, matchKey, userId, dealKey]);
  useEffect(() => {
    const cancel = () => { for (const { animation, node, remove } of animations.current) { animation.cancel(); if (remove) node.remove(); } animations.current.clear(); };
    window.addEventListener("resize", cancel); document.addEventListener("fullscreenchange", cancel);
    return () => { cancel(); window.removeEventListener("resize", cancel); document.removeEventListener("fullscreenchange", cancel); };
  }, []);
}

export function MidnightRoundResults({ state, round = state.lastRound }) {
  const { t } = useLocale();
  const catalog = midnightCatalogFor(state);
  if (!round) return null;
  const winners = midnightRoundWinners(round);
  return <section className="midnight-round-results"><h3>{t("Résultat de la manche")} {round.round}</h3><div>{round.results.map(result => <article key={result.playerId} className={result.achieved ? "midnight-result-achieved" : "midnight-result-missed"}><header><DisplayName user={state.players.find(player => player.id === result.playerId) ?? { pseudo: result.playerName ?? result.playerId }}/>{winners.includes(result.playerId) && <Trophy size={16} aria-label={t("Victoire de manche")}/>}</header><MidnightContractCard definition={catalog[result.contract]} design={state.cardDesign}/><div className="midnight-result-dice">{result.dice.map((value, index) => <Die value={value} key={index} skin={state.players.find(player => player.id === result.playerId)?.cosmetics?.equipped?.diceSkin ?? "default"} animate={false} static3D/>)}</div><p>{result.dice.join(" + ")} = <strong>{result.base}</strong></p><p>{t(result.achieved ? "Mandat réussi" : "Mandat non réalisé")} · {t("Prime du mandat")} : <strong>+{result.bonus}</strong></p><strong>{t("Total de la manche")} : {result.points} {t("points")}</strong></article>)}</div></section>;
}

export function MidnightMatchHistory({ state }) {
  const { t } = useLocale();
  const rounds = midnightRoundHistory(state);
  if (!rounds.length) return null;
  return <details className="midnight-match-history"><summary>{t("Récapitulatif des manches")} ({rounds.length})</summary><div>{rounds.map(round => <details className="midnight-history-round" key={round.round}><summary><strong>{t("Manche")} {round.round}</strong><span>{round.results.map(result => `${state.players.find(player => player.id === result.playerId)?.pseudo ?? result.playerName ?? result.playerId} : ${result.points}`).join(" · ")}</span></summary><MidnightRoundResults state={state} round={round}/></details>)}</div></details>;
}

export function MidnightDiceBoard({ state, user, onAction, room, canAct, dealKey }) {
  const { t } = useLocale();
  const root = useRef(null), requestPending = useRef(false);
  const [chosenContract, setChosenContract] = useState(null), [selectedDie, setSelectedDie] = useState(null), [inspected, setInspected] = useState(null), [codex, setCodex] = useState(false), [results, setResults] = useState(false), [pending, setPending] = useState(false);
  const catalog = midnightCatalogFor(state), current = state.players[state.currentPlayerIndex];
  const isMyTurn = (canAct ?? current?.id === user.id) && !state.finished;
  const offers = (state.contractOffers ?? []).filter(id => catalog[id]);
  const ownContract = state.secretContracts?.[user.id], ownDice = state.trays?.[user.id] ?? [];
  const marketIds = state.marketIds?.length === state.market.length ? state.marketIds : state.market.map((_, index) => `${state.round}:${index}`);
  const selectedIndex = marketIds.indexOf(selectedDie), rolls = state.discardRemaining?.[user.id] ?? 0;
  const left = state.players.slice(0, Math.min(3, Math.ceil(state.players.length / 2))), right = state.players.slice(left.length, left.length + 3), extra = state.players.slice(left.length + right.length);
  const matchKey = `${room?.code ?? "table"}:${room?.activityMatchId ?? "game"}:${user.id}`;
  useMidnightMotion(root, state, matchKey, user.id, dealKey);
  useEffect(() => { setSelectedDie(null); setChosenContract(null); }, [state.currentPlayerIndex, state.round, matchKey]);
  async function send(action) {
    if (requestPending.current || !isMyTurn) return;
    requestPending.current = true; setPending(true);
    try { return await onAction(action); } finally { requestPending.current = false; setPending(false); }
  }
  const playerZone = player => <MidnightPlayerZone key={player.id} player={player} state={state} userId={user.id} onInspect={setInspected}/>;
  const selectedDefinition = catalog[inspected];
  const lastDiscard = state.revealedContracts?.at(-1)?.contract ?? state.lastRound?.results?.at(-1)?.contract;
  const maximumDice = state.players.length * 3 + (state.modifiers?.marketExtra ?? 2), columns = maximumDice > 16 ? 5 : 4, rows = Math.ceil(maximumDice / columns);
  return <section className={`midnight-board ${state.phase === "contract" && !ownContract ? "midnight-board-choosing" : ""}`} ref={root} aria-label={t("Plateau Midnight Dice")}>
    <header className="midnight-board-tools"><div><span className="midnight-wordmark">Midnight Dice</span><MidnightVictory state={state}/></div><div><button type="button" className="secondary" onClick={() => setCodex(true)}><BookOpen size={15}/>{t("Codex des mandats")}</button>{state.lastRound && <button type="button" className="secondary" onClick={() => setResults(true)}><Eye size={15}/>{t("Résultat de la manche")}</button>}</div></header>
    {extra.length > 0 && <div className="midnight-extra-seats">{extra.map(playerZone)}</div>}
    <div className="midnight-board-layout"><div className="midnight-side-seats">{left.map(playerZone)}</div>
      <section className="midnight-center-board"><header><MidnightClock state={state}/><span className={isMyTurn ? "midnight-own-turn" : ""}>{state.finished ? t("Partie terminée") : isMyTurn ? t("À toi de jouer") : t("{value0} joue", { value0: current?.pseudo ?? "—" })}</span></header>
        <div className="midnight-market-station"><section className="midnight-market"><h3>{t("Marché aux dés")} <small>{state.market.length}</small></h3><fieldset className="midnight-market-floor" disabled={!isMyTurn || pending || state.phase !== "draft"} style={{ "--midnight-market-rows": rows }}>
          {state.market.map((value, index) => { const id = marketIds[index], slot = Number(id.split(":").at(-1)) || 0, col = slot % columns, row = Math.floor(slot / columns); return <div className="midnight-market-piece" data-midnight-market-id={id} data-midnight-selected={selectedDie === id ? "true" : undefined} key={id} style={{ left: `${9 + col * 82 / Math.max(1, columns - 1) + (slot % 3 - 1) * 1.4}%`, top: `${11 + row * 76 / Math.max(1, rows - 1) + (slot % 2 ? 1.8 : -1.8)}%`, "--midnight-rest-rotation": `${[3, -7, 5, -2, 7, -4][slot % 6]}deg` }}><Die value={value} skin={state.players[state.startingPlayerIndex]?.cosmetics?.equipped?.diceSkin ?? "default"} kept={selectedDie === id} selectionLabel={t("Sélectionné")} rollKey={`${id}:${state.marketRollKeys?.[id] ?? 0}`} onClick={() => setSelectedDie(selectedDie === id ? null : id)}/></div>; })}
          {!state.market.length && <p className="midnight-market-waiting"><Dices size={35}/>{t(state.finished ? "La nuit est terminée" : "Le marché ouvre après le choix des mandats")}</p>}
        </fieldset></section><div className="midnight-card-stations"><div data-midnight-discard><MidnightContractCard definition={catalog[lastDiscard]} design={state.cardDesign} hidden={!lastDiscard}/><small>{t("Défausse")}</small></div><div data-midnight-deck><MidnightContractCard hidden design={state.cardDesign}/><small>{t("Pioche des mandats")}</small></div></div></div>
        <div className="midnight-player-console">{ownContract ? <button type="button" className="midnight-active-contract" onClick={() => setInspected(ownContract)}><MidnightContractCard definition={catalog[ownContract]} design={state.cardDesign}/><span><strong>{catalog[ownContract]?.label} · +{midnightContractTiers[catalog[ownContract]?.tier]?.bonus}</strong><small>{catalog[ownContract]?.hint}</small><ZoomIn size={15}/></span></button> : <p>{t(state.phase === "contract" ? "Choisis un mandat, puis confirme ton choix" : "Mandat secret")}</p>}
          <div className="midnight-primary-actions"><button type="button" disabled={!isMyTurn || pending || state.phase !== "draft" || selectedIndex < 0 || ownDice.length >= 3} onClick={() => send({ type: "draft", index: selectedIndex })}><Check size={20}/>{t("Jouer le dé")}</button><button type="button" disabled={!isMyTurn || pending || state.phase !== "draft" || selectedIndex < 0 || rolls <= 0} onClick={() => send({ type: "discard-market", index: selectedIndex })}><RotateCcw size={19}/>{t("Relancer")} ({rolls})</button></div>
        </div>
      </section><div className="midnight-side-seats">{right.map(playerZone)}</div></div>
    {state.phase === "contract" && !ownContract && offers.length > 0 && <section className="midnight-contract-hand" aria-label={t("Choisis ton mandat")}><header><h3>{t("Choisis ton mandat")}</h3><span>{t("Sélection secrète")}</span></header><div>{offers.map(id => <article key={id} data-midnight-offer={id} className={chosenContract === id ? "midnight-offer-selected" : ""}><button type="button" className="midnight-offer-face" aria-label={t("Sélectionner {name}", { name: catalog[id].label })} aria-pressed={chosenContract === id} disabled={!isMyTurn || pending} onClick={() => setChosenContract(chosenContract === id ? null : id)}><MidnightContractCard definition={catalog[id]} design={state.cardDesign}/></button><button type="button" className="secondary midnight-offer-inspect" aria-label={t("Agrandir {name}", { name: catalog[id].label })} onClick={() => setInspected(id)}><ZoomIn size={14}/>{t("Agrandir")}</button></article>)}</div><button type="button" className="midnight-confirm-contract" disabled={!isMyTurn || pending || !offers.includes(chosenContract)} onClick={() => send({ type: "choose-contract", contract: chosenContract })}><Check size={17}/>{t("Confirmer le mandat")}</button></section>}
    {selectedDefinition && <Dialog title={selectedDefinition.label} className="midnight-card-expanded" onClose={() => setInspected(null)}><MidnightContractCard definition={selectedDefinition} design={state.cardDesign}/><p>{selectedDefinition.hint}</p></Dialog>}
    {codex && <Dialog title={t("Codex des mandats")} className="midnight-codex-gallery" onClose={() => setCodex(false)}><div>{Object.values(catalog).map(definition => <button type="button" key={definition.id} onClick={() => { setCodex(false); setInspected(definition.id); }}><MidnightContractCard definition={definition} design={state.cardDesign}/></button>)}</div></Dialog>}
    {results && <Dialog title={t("Résultat de la manche")} className="midnight-results-dialog" onClose={() => setResults(false)}><MidnightRoundResults state={state}/></Dialog>}
  </section>;
}
