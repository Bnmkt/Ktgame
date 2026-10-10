import { ModalBackdrop } from "../components/common/ModalBackdrop.jsx";
import { ConfirmDialog } from "../components/common/ConfirmAction.jsx";
import "../features/games/ranked.css";
import { RankedResult, RankedTurnTimer } from "../features/games/RankedPlay.jsx";
import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { appPath } from "../navigation/routes.js";
import { AlertTriangle, BadgeCheck, Bot, CheckCircle2, Clock3, Coins, Copy, DoorOpen, Eye, FastForward, HelpCircle, LogOut, Maximize2, Minimize2, Play, Save, Settings, ShieldCheck, Swords, Trophy, X } from "lucide-react";
import { SOCKET_PATH, SOCKET_URL, api, getToken } from "../api.js";
import { DiceSelectionMode, DiceThrowTray, Die, PlayingCard } from "../components/game/GamePieces.jsx";
import { DisplayName } from "../components/cosmetics/Cosmetics.jsx";
import { AnimatedDealerHand, RulesModal, StepperBet, accordionPlayable, blackjackDealerDisplay, blackjackTotal, canPlayPresidentSet, cardIdentity, golfPlayable, groupedHand, yahtzeePotentialScore } from "../components/game/GameSupport.jsx";
import { BattleBoard, FarkleBoard, LiarsDiceBoard, MidnightDiceBoard, ShutTheBoxBoard, VelvetRuseBoard } from "../components/game/GameBoards.jsx";
import { BeloteBoard } from "../components/game/BeloteBoard.jsx";
import { BeloteTeams } from "../components/room/BeloteTeams.jsx";
import { BattleModifiersPanel, BlackjackScoresTable, FinishedLeaderboard, GameModifiersPanel, OtherPlayerRolls, RoomStatusPanel, ScorePanel, WagerPanel } from "../components/room/RoomPanels.jsx";
import { bugDiagnostics } from "../features/bugs/diagnostics.js";
import { useBugGameContext } from "../features/bugs/BugReportProvider.jsx";
import { defaultBattleModifiers, defaultGameModifiers, gameTitle, playerName, scoreCategories, suits } from "../features/games/config.js";
import { CompactNumber, copyText } from "../utils/presentation.jsx";
import { hasPlayablePresidentSet } from "../features/games/president.js";
import { usePresidentAutoPass } from "../components/game/usePresidentAutoPass.js";
import { useTurnSound } from "../components/game/useTurnSound.js";
import { PokerAllInNotice } from "../components/game/PokerAllInNotice.jsx";
import { playerActionExpected, turnSoundKey } from "../features/games/turn-notice.js";

const pokerHandNames = ["Carte haute", "Paire", "Deux paires", "Brelan", "Suite", "Couleur", "Full", "Carré", "Quinte flush"];
const betPresets = [
  ["beginner", "Débutant", 50, 100],
  ["intermediate", "Intermédiaire", 5000, 10000],
  ["advanced", "Avancé", 25000, 50000]
];

function useClock(active, intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [active, intervalMs]);
  return now;
}

function BattleCountdown({ endsAt }) {
  const now = useClock(Boolean(endsAt));
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

function PokerTurnTimer({ deadline }) {
  const now = useClock(Boolean(deadline));
  if (!deadline) return null;
  const remaining = Math.max(0, deadline - now);
  return <strong className={remaining < 60000 ? "turn-timer urgent" : "turn-timer"}>{Math.floor(remaining / 60000)}:{String(Math.floor(remaining / 1000) % 60).padStart(2, "0")}</strong>;
}

function PokerResolutionTimer({ nextHandAt, resolutionStartedAt, showdown }) {
  const now = useClock(Boolean(nextHandAt));
  if (!nextHandAt) return null;
  const remaining = Math.max(0, nextHandAt - now);
  const duration = Math.max(1, nextHandAt - (resolutionStartedAt ?? nextHandAt - 7000));
  return <section className="poker-resolution-timer" aria-live="polite"><div><span>{showdown ? "Résolution de l’abattage" : "Pot attribué"}</span><strong>{Math.ceil(remaining / 1000)} s</strong></div><div className="poker-resolution-track"><i style={{ width: `${Math.min(100, Math.max(0, remaining / duration * 100))}%` }} /></div><small>Les cartes et les gains restent affichés avant la prochaine main.</small></section>;
}

function PokerAutoAction({ enabled, isMyTurn, turnStartedAt, enabledAt, onToggle }) {
  const now = useClock(enabled && isMyTurn);
  const seconds = enabled && isMyTurn ? Math.max(0, Math.ceil((Math.max(turnStartedAt ?? now, enabledAt ?? 0) + 10000 - now) / 1000)) : null;
  return <button className={`secondary poker-auto-action ${enabled ? "active" : ""}`} title="Après 10 secondes : Parole si aucune mise n’est à suivre, sinon Se coucher." onClick={onToggle}><ShieldCheck size={17} /><span><strong>Parole / se coucher auto · {enabled ? "ON" : "OFF"}</strong><small>{enabled ? seconds !== null ? `Action dans ${seconds} s : Parole si possible, sinon Se coucher` : "Armé pour ton prochain tour" : "Attend 10 secondes avant l’action automatique"}</small></span></button>;
}

function PacingCountdown({ endsAt }) {
  const now = useClock(Boolean(endsAt), 250);
  return Math.max(0, Math.ceil((Number(endsAt) - now) / 1000));
}

function TurnPacingBanner({ pacing, players, canSkip, onSkip }) {
  if (!["bot-thinking", "turn-end"].includes(pacing?.kind)) return null;
  const actor = players.find((player) => player.id === pacing.actorId);
  const thinking = pacing.kind === "bot-thinking";
  const botTurn = Boolean(pacing.actorIsBot);
  return <section className={`room-pacing-banner ${thinking ? "thinking" : "turn-ended"}`} aria-live="polite"><div className="room-pacing-icon">{botTurn ? <Bot size={20} /> : <Clock3 size={20} />}</div><div><small>{thinking ? "Réflexion de l’IA" : botTurn ? "Tour de l’IA terminé" : "Tour terminé"}</small><strong>{actor ? <DisplayName user={actor} /> : pacing.actorName ?? (botTurn ? "L’IA" : "Le joueur")} {thinking ? "prépare son coup" : "laisse la table visible"}</strong></div><span className="room-pacing-countdown"><Clock3 size={16} /><PacingCountdown endsAt={pacing.endsAt} /> s</span>{canSkip && <button type="button" className="secondary" onClick={onSkip}><FastForward size={17} /> Passer l’attente</button>}</section>;
}

function RoundResultsOverlay({ pacing, players, canSkip, isOwner, onSkip, onDismiss, ranked }) {
  if (pacing?.kind !== "round-results") return null;
  return <div className="modal-backdrop round-results-layer" role="presentation">
    <section className="modal round-results-modal" role="dialog" aria-modal="true" aria-labelledby="round-results-title">
      <header><div className="round-results-emblem"><Trophy size={25}/></div><div><span className="eyebrow">{pacing.final ? "Partie terminée" : `Manche ${pacing.round}`}</span><h2 id="round-results-title">{pacing.final ? "Résultats finaux" : "Résultats de la manche"}</h2></div><button type="button" className="secondary icon-toggle" aria-label={canSkip ? "Fermer les résultats et continuer" : "Masquer les résultats"} title={canSkip ? "Continuer la partie" : "Masquer pour moi"} onClick={canSkip ? onSkip : onDismiss}><X size={18}/></button></header>
      <div className="round-results-timer"><span>{pacing.final ? "Fin de l’affichage" : "Reprise automatique"}</span><strong><PacingCountdown endsAt={pacing.endsAt}/> secondes</strong><i><b style={{ animationDuration: `${Math.max(1, pacing.endsAt - pacing.startedAt)}ms`, animationDelay: `${Math.min(0, pacing.startedAt - Date.now())}ms` }}/></i></div>
      {pacing.final && <RankedResult autoScroll={false} result={ranked?.results?.find((row)=>row.delta!==undefined)}/>}
      <ol className="round-results-list">{(pacing.results ?? []).map((result) => {
        const player=players.find((entry)=>entry.id===result.id) ?? result;
        return <li className={result.winner ? "winner" : ""} key={result.id}><span>{result.rank}</span><DisplayName user={player}/><strong>{result.scoreLabel ?? <CompactNumber value={result.score} label={`Score exact de ${result.pseudo}`}/>}</strong>{result.winner && <Trophy size={17}/>}</li>;
      })}</ol>
      <footer><small>Le plateau reste figé pour laisser le temps de lire les résultats.</small>{canSkip && <button type="button" onClick={onSkip}><FastForward size={18}/> {pacing.final ? "Fermer les résultats" : isOwner ? "Continuer maintenant" : "Passer les résultats"}</button>}</footer>
    </section>
  </div>;
}

function BetLimitsEditor({ minimum, maximum, maxAllowed = 100000000, disabled, onChange, poker = false }) {
  const detectedPreset = betPresets.find(([, , min, max]) => min === minimum && max === maximum)?.[0] ?? "custom";
  const [selectedPreset, setSelectedPreset] = useState(detectedPreset);
  const locked = disabled || selectedPreset !== "custom";
  const updateValue = (key, rawValue) => {
    if (locked) return;
    let value = Math.max(key === "minimum" && poker ? 2 : 1, Math.min(maxAllowed, Math.floor(Number(rawValue) || 0)));
    if (key === "minimum" && poker && value % 2) value += 1;
    if (key === "minimum") onChange({ minimum: value, maximum: Math.max(maximum, value) });
    else onChange({ minimum, maximum: Math.max(minimum, value) });
  };
  const renderField = (key, label, value, min, max) => <fieldset className="bet-limit-field"><legend>{label}</legend><div className="bet-limit-adjust"><button type="button" disabled={locked} onClick={() => updateValue(key, value - 100)}>−100</button><button type="button" disabled={locked} onClick={() => updateValue(key, value - 10)}>−10</button><output><CompactNumber value={value} label={`${label} exacte`} /></output><button type="button" disabled={locked} onClick={() => updateValue(key, value + 10)}>+10</button><button type="button" disabled={locked} onClick={() => updateValue(key, value + 100)}>+100</button></div><input type="range" min={min} max={max} step={key === "minimum" && poker ? 2 : 1} disabled={locked} value={Math.min(max, Math.max(min, value))} onChange={(event) => updateValue(key, event.target.value)} />{selectedPreset !== "custom" && <small className="bet-limit-lock"><ShieldCheck size={14} /> Valeur verrouillée par le preset</small>}</fieldset>;
  const applyPreset = (id, min, max) => {
    if (disabled) return;
    setSelectedPreset(id);
    if (id !== "custom") onChange({ minimum: min, maximum: max });
  };
  return <section className={`bet-limits-editor ${disabled ? "read-only" : ""}`}>
    <div className="panel-heading"><span>Limites de mise</span><small>{poker ? "La mise minimale définit la grosse blinde; la petite vaut toujours sa moitié." : "Encadre la mise initiale de chaque main."}</small></div>
    <div className="bet-limit-presets">{betPresets.map(([id, label, min, max]) => <button type="button" key={id} className={selectedPreset === id ? "active" : ""} disabled={disabled} onClick={() => applyPreset(id, min, max)}><strong>{label}</strong><small><CompactNumber value={min} /> / <CompactNumber value={max} /></small></button>)}<button type="button" className={selectedPreset === "custom" ? "active" : ""} disabled={disabled} onClick={() => applyPreset("custom")}><strong>Personnalisé</strong><small>Valeurs libres</small></button></div>
    <div className="bet-limit-fields">{renderField("minimum", "Mise minimale", minimum, poker ? 2 : 1, Math.max(poker ? 2 : 1, Math.min(maximum, maxAllowed)))}{renderField("maximum", "Mise maximale", maximum, minimum, maxAllowed)}</div>
  </section>;
}

export function Room({ code, user, setUser, onBack, onAchievements, onExcluded }) {
  const [room, setRoom] = useState(null);
  useBugGameContext("room", code, room?.gameId, room?.activityMatchId);
  const [error, setError] = useState("");
  const [rankedLeave,setRankedLeave]=useState(false);
  const [bet, setBet] = useState(10);
  const [pokerRaise, setPokerRaise] = useState(40);
  const [pokerBlinds, setPokerBlinds] = useState({ bigBlind: 20 });
  const [battleModifiers, setBattleModifiers] = useState(defaultBattleModifiers);
  const [gameModifiers, setGameModifiers] = useState({});
  const [levelLimits, setLevelLimits] = useState({ minLevel: 1, maxLevel: "" });
  const [selectedDice, setSelectedDice] = useState([]);
  const [selectDiceToKeep, setSelectDiceToKeep] = useState(() => window.localStorage.getItem("ktga-dice-selection-mode") === "keep");
  const [scoreConfirmation, setScoreConfirmation] = useState(null);
  const [accordionFrom, setAccordionFrom] = useState(null);
  const [selectedPresidentCards, setSelectedPresidentCards] = useState([]);
  const [presidentActionBusy, setPresidentActionBusy] = useState(false);
  const presidentActionPending = useRef(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [roomSettingsOpen, setRoomSettingsOpen] = useState(false);
  const [tableFullscreen, setTableFullscreen] = useState(false);
  const [friendsData, setFriendsData] = useState({ friends: [] });
  const [inviteMessage, setInviteMessage] = useState("");
  const [inviteCopied, setInviteCopied] = useState(false);
  const [blackjackRevealDone, setBlackjackRevealDone] = useState(false);
  const [dismissedPacingId, setDismissedPacingId] = useState("");
  const [diceRollLocked, setDiceRollLocked] = useState(false);
  const diceRollRequestPending = useRef(false);
  const roomShellRef = useRef(null);
  const roomSnapshotRef = useRef("");
  const isOwner = room?.ownerId === user.id;

  const commitRoom = useCallback((nextRoom) => {
    if (!nextRoom) return;
    const { achievementUnlocks: _achievementUnlocks, ...payload } = nextRoom;
    const snapshot = JSON.stringify(payload);
    if (snapshot === roomSnapshotRef.current) return;
    roomSnapshotRef.current = snapshot;
    setRoom(payload);
  }, []);

  const syncUserFromRoom = useCallback((nextRoom) => {
    const player = nextRoom?.players?.find((entry) => entry.id === user.id);
    if (!player) return;
    setUser((currentUser) => {
      if (!currentUser || Number(currentUser.tokens) === Number(player.tokens)) return currentUser;
      return { ...currentUser, tokens: Number(player.tokens) || 0 };
    });
  }, [setUser, user.id]);

  useEffect(() => { window.localStorage.setItem("ktga-dice-selection-mode", selectDiceToKeep ? "keep" : "reroll"); }, [selectDiceToKeep]);
  useEffect(() => {
    const syncFullscreen = () => setTableFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  async function toggleTableFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (roomShellRef.current?.requestFullscreen) await roomShellRef.current.requestFullscreen();
      else setTableFullscreen((value) => !value);
    } catch {
      setTableFullscreen((value) => !value);
    }
  }

  useEffect(() => { api(`/api/rooms/${code}`).then(commitRoom).catch((err) => setError(err.message)); }, [code, commitRoom]);
  useEffect(() => {
    if (!room?.finished) return;
    let active = true;
    api("/api/me", { background: true }).then((updated) => { if (active) setUser((current) => current?.id === updated.id ? updated : current); }).catch(() => {});
    return () => { active = false; };
  }, [code, room?.finished, setUser]);
  useEffect(() => {
    if (user.guest) return undefined;
    api("/api/friends").then(setFriendsData).catch(() => {});
    return undefined;
  }, [user.guest]);
  useEffect(() => {
    if (!room?.id) return undefined;
    const socket = io(SOCKET_URL, { path: SOCKET_PATH, withCredentials: true, auth: { stream: "table" } });
    const disposeDiagnostics = bugDiagnostics.registerSocket(socket);
    const watch = () => socket.emit("watch-room", { roomId: room.id, token: getToken() });
    socket.on("connect", watch);
    socket.on("room", (nextRoom) => {
      if (nextRoom.code !== code) return;
      commitRoom(nextRoom);
      if (!nextRoom.players?.some((p) => p.id === user.id)) onBack();
    });
    socket.on("room-closed", (payload) => {
      if (payload?.code === code) onBack();
    });
    socket.on("room-player-kicked", (payload) => {
      if (payload?.code === code && payload?.playerId === user.id) onExcluded(payload);
    });
    socket.on("room-error", (payload) => setError(payload?.error ?? "Connexion temps réel interrompue."));
    return () => { disposeDiagnostics(); socket.disconnect(); };
  }, [code, room?.id, user.id, onBack, onExcluded, commitRoom]);

  async function action(body, { background = false } = {}) {
    const isPresidentAction = room?.gameId === "president" && ["play", "pass"].includes(body.type);
    if (isPresidentAction) {
      if (presidentActionPending.current) return;
      presidentActionPending.current = true;
      setPresidentActionBusy(true);
      presidentAutoPass.cancel();
    }
    const isDiceRoll = body.type === "roll";
    if (isDiceRoll) {
      if (diceRollRequestPending.current) return;
      diceRollRequestPending.current = true;
      setDiceRollLocked(true);
    }
    setError("");
    try {
      const result = await api(`/api/rooms/${code}/action`, { method: "POST", background, body: JSON.stringify(body) });
      commitRoom(result);
      syncUserFromRoom(result);
      onAchievements?.(result.achievementUnlocks ?? []);
      if (body.type === "roll" && ["yahtzee", "421", "cul-de-chouette"].includes(result.state?.gameId) && selectDiceToKeep) setSelectedDice(result.state?.kept ?? []);
      else setSelectedDice([]);
      if (body.type === "move") setAccordionFrom(null);
      if (result.state?.gameId === "president" && ["play", "pass"].includes(body.type)) setSelectedPresidentCards([]);
      return result;
    } catch (err) {
      setError(err.message);
    } finally {
      if (isPresidentAction) {
        presidentActionPending.current = false;
        setPresidentActionBusy(false);
      }
      if (isDiceRoll) {
        diceRollRequestPending.current = false;
        setDiceRollLocked(false);
      }
    }
  }

  async function changeBeloteTeam(playerId, team) {
    setError("");
    try { commitRoom(await api(`/api/rooms/${code}/belote-team`, { method: "POST", body: JSON.stringify({ playerId, team }) })); }
    catch (err) { setError(err.message); }
  }

  async function roomPost(path) {
    setError("");
    try {
      const result = await api(`/api/rooms/${code}/${path}`, { method: "POST" });
      commitRoom(result);
      syncUserFromRoom(result);
      onAchievements?.(result.achievementUnlocks ?? []);
    } catch (err) {
      setError(err.message);
    }
  }

  async function skipPacing() {
    if (!room?.pacing) return;
    setError("");
    try {
      const result = await api(`/api/rooms/${code}/pacing/skip`, { method: "POST", body: JSON.stringify({ pacingId: room.pacing.id }) });
      commitRoom(result);
      syncUserFromRoom(result);
    } catch (err) {
      setError(err.message);
    }
  }

  async function closeRoom() {
    setError("");
    try {
      await api(`/api/rooms/${code}`, { method: "DELETE" });
      onBack();
    } catch (err) {
      setError(err.message);
    }
  }

  async function kickPlayer(playerId) {
    setError("");
    commitRoom(await api(`/api/rooms/${code}/kick`, { method: "POST", body: JSON.stringify({ playerId }) }));
  }

  async function copyInviteLink() {
    const url = `${window.location.origin}${appPath("room", room.code)}`;
    try {
      await copyText(url);
      setError("");
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 1800);
    } catch {
      setError(url);
    }
  }

  async function inviteFriend(friendId) {
    setError("");
    setInviteMessage("");
    try {
      await api(`/api/rooms/${code}/invite`, { method: "POST", body: JSON.stringify({ friendId }) });
      setInviteMessage("Invitation envoyée.");
    } catch (err) {
      setError(err.message);
    }
  }

  const state = room?.state;
  const pacing = room?.pacing;
  const pacingActive = Boolean(pacing);
  const isSeatedPlayer = room?.players?.some((player) => player.id === user.id && !player.isBot) && !room?.spectator;
  const current = state?.players?.[state.currentPlayerIndex];
  const myHand = state?.hands?.[user.id] ?? [];
  const hasBlackjackBet = Boolean(state?.bets?.[user.id]);
  const blackjackHandDone = state?.completedPlayerIds?.includes(user.id);
  const blackjackHandShown = state?.shownPlayerIds?.includes(user.id);
  const blackjackMinimumBet = Math.max(1, Number(state?.modifiers?.minimumBet) || 50);
  const blackjackMaximumBet = Math.max(blackjackMinimumBet, Number(state?.modifiers?.maximumBet) || 100);
  const canDoubleBlackjack = hasBlackjackBet && myHand.length === 2 && blackjackTotal(myHand) !== 21 && Number(user.tokens) >= Number(state?.bets?.[user.id] ?? 0);
  const paid421Used = Number(state?.paidRerollsUsed?.[user.id]) || 0;
  const paid421Price = Math.max(1, Number(state?.modifiers?.paidRerollPrice) || 25) * (2 ** paid421Used);
  const pokerToCall = room?.gameId === "texas-holdem" && state ? Math.max(0, state.currentBet - (state.streetBets?.[user.id] ?? 0)) : 0;
  const pokerMinimumRaise = room?.gameId === "texas-holdem" && state ? state.currentBet + state.minRaise : 0;
  const pokerMaximumRaise = room?.gameId === "texas-holdem" && state ? Math.min(state.maximumBet ?? Number.MAX_SAFE_INTEGER, (state.streetBets?.[user.id] ?? 0) + (state.stacks?.[user.id] ?? 0)) : 0;
  const allBlackjackBetsPlaced = room?.gameId === "blackjack" && state ? Object.keys(state.bets ?? {}).length >= state.players.filter((p) => !p.isBot).length : false;
  const isMyTurn = current?.id === user.id && !pacingActive;
  const pokerAutoEnabled = Boolean(state?.autoCheckFoldPlayerIds?.includes(user.id));
  const isPlayerActionExpected = playerActionExpected(room, user.id);
  const yahtzeeCompletedTurns = room?.gameId === "yahtzee" ? Object.values(state?.scores ?? {}).reduce((sum, scores) => sum + Object.keys(scores).length, 0) : 0;
  const yahtzeeRound = room?.gameId === "yahtzee" ? Math.min(13, Math.floor(yahtzeeCompletedTurns / Math.max(1, state?.players?.length ?? 1)) + 1) : 0;
  const diceSkin = user.cosmetics?.equipped?.diceSkin ?? "default";
  const activeDiceSkin = current?.cosmetics?.equipped?.diceSkin ?? diceSkin;
  const cardSkin = user.cosmetics?.equipped?.cardSkin ?? "default";
  const presidentHand = groupedHand(myHand).flatMap(([, cards]) => cards);
  const selectedPresidentHand = presidentHand.filter((card) => selectedPresidentCards.includes(cardIdentity(card)));
  const presidentRequiredCount = state?.gameId === "president" ? state.currentSet?.count ?? null : null;
  const presidentSelectionPlayable = state?.gameId === "president" && selectedPresidentHand.length > 0 && (!presidentRequiredCount || selectedPresidentHand.length === presidentRequiredCount) && canPlayPresidentSet(state, selectedPresidentHand[0].rank, selectedPresidentHand.length);
  const presidentAutoPass = usePresidentAutoPass({
    enabled: state?.gameId === "president" && isPlayerActionExpected && Boolean(state.currentSet) && myHand.length > 0 && !hasPlayablePresidentSet(state, myHand),
    turnKey: `${code}:${current?.id}:${state?.currentSet?.playerId}:${state?.currentSet?.rank}:${state?.currentSet?.count}:${state?.revolution}:${myHand.map(cardIdentity).join(",")}`,
    onPass: () => action({ type: "pass" }, { background: true })
  });
  useTurnSound(isPlayerActionExpected, `${code}:${user.id}`, turnSoundKey(state));
  const winnerNames = state?.winners?.length ? state.winners.map((id) => playerName(state.players, id)).join(", ") : "Dealer / aucun gagnant";
  const invitableFriends = (friendsData.friends ?? []).filter((friend) => !room?.players?.some((player) => player.id === friend.id));
  const showFinishedResult = room?.gameId !== "blackjack" || blackjackRevealDone;
  const keepIndexesForDice = (dice = []) => {
    if (!selectDiceToKeep && selectedDice.length === 0) return [];
    return dice.map((value, index) => value && (selectDiceToKeep ? selectedDice.includes(index) : !selectedDice.includes(index)) ? index : -1).filter((index) => index >= 0);
  };
  const changeDiceSelectionMode = (nextSelectToKeep) => {
    const dice = state?.dice ?? [];
    setSelectedDice((selection) => dice.map((value, index) => value && !selection.includes(index) ? index : -1).filter((index) => index >= 0));
    setSelectDiceToKeep(nextSelectToKeep);
  };
  const renderYahtzeeCategory = ([key, label]) => {
    const potential = yahtzeePotentialScore(state?.dice ?? [], key);
    const scoreOwnerId = current?.id ?? user.id;
    const used = (state?.scores?.[scoreOwnerId] ?? {})[key] !== undefined;
    return <button disabled={!isMyTurn || used || potential === null} className={`${used ? "used" : ""} ${!used && potential === 0 ? "zero-score" : ""}`} key={key} onClick={() => setScoreConfirmation({ category: key, label, points: potential })}><span>{label}</span><small className={potential === null ? "score-placeholder" : ""}>{potential === 0 ? "⚠ 0 point" : potential !== null ? `+${potential}` : "+00"}</small></button>;
  };

  useEffect(() => {
    if (room?.gameId === "blackjack" && !state?.finished) setBlackjackRevealDone(false);
  }, [room?.gameId, state?.finished]);
  useEffect(() => {
    if (pacing?.id !== dismissedPacingId) setDismissedPacingId("");
  }, [pacing?.id, dismissedPacingId]);
  useEffect(() => {
    if (room?.pokerBlinds) setPokerBlinds({ bigBlind: room.pokerBlinds.bigBlind, maximumBet: room.pokerBlinds.maximumBet ?? room.stake });
  }, [room?.pokerBlinds?.bigBlind, room?.pokerBlinds?.maximumBet, room?.stake]);
  const roomHasStarted = Boolean(room?.state);
  const battleModifierSignature = JSON.stringify(room?.battleModifiers ?? {});
  useEffect(() => {
    if (!roomHasStarted && room?.battleModifiers) setBattleModifiers({ ...defaultBattleModifiers, ...room.battleModifiers });
  }, [roomHasStarted, battleModifierSignature]);
  const gameModifierSignature = JSON.stringify(room?.gameModifiers ?? {});
  useEffect(() => {
    if (room?.gameId && !roomHasStarted) setGameModifiers({ ...defaultGameModifiers(room.gameId), ...(room.gameModifiers ?? {}) });
  }, [room?.gameId, roomHasStarted, gameModifierSignature]);
  useEffect(() => { setScoreConfirmation(null); }, [state?.currentPlayerIndex, state?.finished]);
  useEffect(() => { setSelectedPresidentCards([]); }, [state?.currentPlayerIndex, state?.finished, myHand.length]);

  async function leaveTable(confirmed=false) {
    if (room?.ranked && state && !state.finished && confirmed!==true) {setRankedLeave(true);return;}
    if ((room?.gameId === "texas-holdem" || room?.ranked) && state && !state.finished) {
      try { await api(`/api/rooms/${code}/leave`, { method: "POST" }); } catch (error) {
        if (room?.ranked) throw error;
      }
    }
    onBack();
  }

  function resetRoomSettingDrafts() {
    setLevelLimits({ minLevel: room?.minLevel ?? 1, maxLevel: room?.maxLevel ?? "" });
    setPokerBlinds({ bigBlind: room?.pokerBlinds?.bigBlind ?? 20, maximumBet: room?.pokerBlinds?.maximumBet ?? room?.stake ?? 1000 });
    setBattleModifiers({ ...defaultBattleModifiers, ...(room?.battleModifiers ?? {}) });
    setGameModifiers({ ...defaultGameModifiers(room?.gameId), ...(room?.gameModifiers ?? {}) });
  }

  function openRoomSettings() {
    resetRoomSettingDrafts();
    setRoomSettingsOpen(true);
  }

  function cancelRoomSettings() {
    resetRoomSettingDrafts();
    setRoomSettingsOpen(false);
  }

  async function applyRoomSettings() {
    if (!isOwner) {
      setRoomSettingsOpen(false);
      return;
    }
    const bigBlind = Math.floor(Number(pokerBlinds.bigBlind));
    const maximumBet = Math.floor(Number(pokerBlinds.maximumBet));
    if (room.gameId === "texas-holdem" && (!Number.isFinite(bigBlind) || bigBlind < 2 || bigBlind % 2)) {
      setError("La grosse blinde doit être un nombre pair d’au moins 2 jetons.");
      return;
    }
    if (room.gameId === "texas-holdem" && (!Number.isFinite(maximumBet) || maximumBet < bigBlind)) {
      setError("La mise maximale doit être supérieure ou égale à la grosse blinde.");
      return;
    }
    try {
      if (Number(levelLimits.minLevel) !== (room.minLevel ?? 1) || (levelLimits.maxLevel === "" ? null : Number(levelLimits.maxLevel)) !== (room.maxLevel ?? null)) commitRoom(await api(`/api/rooms/${code}/level-settings`, { method: "POST", body: JSON.stringify({ minLevel: Number(levelLimits.minLevel), maxLevel: levelLimits.maxLevel === "" ? null : Number(levelLimits.maxLevel) }) }));
      const [path, body] = room.gameId === "texas-holdem"
        ? ["poker-settings", { bigBlind, maximumBet }]
        : room.gameId === "bataille"
          ? ["battle-settings", battleModifiers]
          : ["game-settings", gameModifiers];
      commitRoom(await api(`/api/rooms/${code}/${path}`, { method: "POST", body: JSON.stringify(body) }));
      setError("");
      setRoomSettingsOpen(false);
    } catch (err) { setError(err.message); }
  }

  if (!room) return <main className="app-shell"><button onClick={onBack}>Retour</button><div className="error">{error || "Chargement..."}</div></main>;

  return (
    <main ref={roomShellRef} className={`app-shell room-app-shell room-render-budget ${tableFullscreen ? "table-fullscreen" : ""}`}>
      <div className="page-heading room-heading"><div><span className="eyebrow">{gameTitle(room.gameId)}</span><h1>{room.name}</h1></div></div>
      <div className="room-table-tools" role="toolbar" aria-label="Commandes de la table"><button className="secondary" onClick={toggleTableFullscreen}>{tableFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />} {tableFullscreen ? "Réduire" : "Plein écran"}</button><button className="secondary" onClick={() => setRulesOpen(true)}><HelpCircle size={18} /> Règles</button><button className="secondary" onClick={leaveTable}><DoorOpen size={18} /> Quitter la table</button>{isOwner && <button className="danger-button room-close-action" onClick={closeRoom}><X size={18} /> Fermer la table</button>}</div>
      {error && <div className="error">{error}</div>}
      <div className="layout">
        {tableFullscreen && state && <aside className="fullscreen-player-rail" aria-label="Joueurs de la table"><div><span className="eyebrow">Table</span><h2>Joueurs</h2><small>{state.players.length} participant{state.players.length > 1 ? "s" : ""}</small></div><div className="fullscreen-player-list">{state.players.map((player, index) => { const active = room.gameId === "blackjack" ? !state.completedPlayerIds?.includes(player.id) : room.gameId === "bataille" ? !state.submittedPlayerIds?.includes(player.id) : index === state.currentPlayerIndex; return <article className={`${active && !state.finished ? "active" : ""} ${player.id === user.id ? "self" : ""}`} key={player.id}><i aria-hidden="true" /><DisplayName user={player} />{player.isBot && <small>IA</small>}{player.id === room.ownerId && <small>Maître</small>}</article>; })}</div></aside>}
        <section>
          <RoomStatusPanel room={room} state={state} current={current} userId={user.id} isOwner={isOwner} onAddBot={() => roomPost("bot")} onStart={() => roomPost("start")} onReady={() => roomPost("ready")} onKick={kickPlayer} onSettings={openRoomSettings} />
          {room.ranked && <><section className="ranked-match-heading"><Swords size={18}/><strong>Partie classée</strong>{room.ranked.cancelled ? <span>Annulée : {room.ranked.cancelled.reason}</span> : !state?.finished && <RankedTurnTimer turn={room.ranked.turn} paused={Boolean(room.pacing || state?.nextHandAt)}/>}</section><RankedResult result={room.ranked.results?.find((row)=>row.userId===user.id && row.delta!==undefined)}/></>}
          {rankedLeave && <ConfirmDialog title="Abandonner la partie classée ?" message={room.ranked.config.abandonPolicy==="cancel" ? "Un abandon annule l’attribution Elo de cette partie pour tous les joueurs." : `Un abandon entraîne le classement en dernière position${room.ranked.config.abandonPolicy==="rank" ? "." : ` et une pénalité supplémentaire pouvant atteindre ${room.ranked.config.abandonPenalty} Elo, selon les limites de la partie.`}`} danger confirmLabel="Abandonner" onConfirm={()=>leaveTable(true)} onClose={()=>setRankedLeave(false)}/>}
          {!state && room.gameId === "belote" && <BeloteTeams room={room} userId={user.id} onChange={changeBeloteTeam} />}
          {showFinishedResult && <FinishedLeaderboard room={room} state={state} />}
          <TurnPacingBanner pacing={pacing} players={room.players} canSkip={isSeatedPlayer} onSkip={skipPacing} />

          {state && <section className={`board board-${room.gameId} ${state.finished ? "finished-board" : ""} ${isPlayerActionExpected ? "your-active-turn" : ""} ${pacingActive ? "pacing-locked" : ""}`}>
            <div className="board-felt">
              <div className="board-heading"><h2>{gameTitle(room.gameId)}</h2>{room.gameId === "yahtzee" && <div className="round-counter"><span>Manche</span><strong>{yahtzeeRound} / 13</strong><small>{Math.max(0, 13 - yahtzeeRound)} restante{13 - yahtzeeRound > 1 ? "s" : ""}</small></div>}{["421", "cul-de-chouette"].includes(room.gameId) && <div className="round-counter"><span>Manche</span><strong>{state.round} / {state.maxRounds}</strong><small>{Math.max(0, state.maxRounds - state.round)} restante{state.maxRounds - state.round > 1 ? "s" : ""}</small></div>}</div>
              <div className={`turn-line ${room.gameId === "yahtzee" && !state.finished ? `yahtzee-turn-focus ${isMyTurn ? "your-turn" : "opponent-turn"}` : ""} ${room.gameId === "bataille" && !state.finished ? "battle-simultaneous-turn" : ""}`}>{state.finished ? (showFinishedResult ? "Partie terminée" : "Le dealer termine sa main…") : room.gameId === "blackjack" && allBlackjackBetsPlaced ? `${(state.players.filter((player) => !player.isBot).length - (state.completedPlayerIds?.length ?? 0))} main(s) encore en jeu avant le dealer` : room.gameId === "bataille" ? <><span className="turn-status-icon"><Swords size={22} /></span><span className="turn-copy"><small>{state.resolutionEndsAt ? "Confrontation" : "Actions simultanées"} · manche {state.round}</small><strong>{state.resolutionEndsAt ? <>Résultat affiché encore <BattleCountdown endsAt={state.resolutionEndsAt} /> seconde(s)</> : state.submittedPlayerIds?.includes(user.id) ? "Placement enregistré — l’adversaire joue" : state.drawnCards?.[user.id] ? `Ta carte est prête — choisis ${state.battleLanes?.length === 1 ? "la pile centrale" : "la pile A ou B"}` : "À toi de piocher ta carte"}</strong></span></> : room.gameId === "yahtzee" ? <><span className="turn-status-icon"><Play size={22} /></span><span className="turn-copy"><small>{isMyTurn ? "Ton tour" : "Tour en cours"}</small><strong>{isMyTurn ? "À toi de jouer" : <><DisplayName user={current} /> joue maintenant</>}</strong></span></> : <>À <DisplayName user={current} /> de jouer</>}</div>
              {state.finished && showFinishedResult && <div className="board-result">
                <div><Trophy size={22} /><span>Vainqueur</span><strong>{winnerNames}</strong></div>
                <div className="actions final-actions">{isOwner && room.gameId === "blackjack" && <button className="instant-replay-button" onClick={() => roomPost("replay-now")}><Play size={18} /> Rejouer maintenant</button>}{isOwner && room.gameId !== "texas-holdem" && <button className="secondary" onClick={() => roomPost("replay")}>{room.gameId === "blackjack" ? "Retour à la salle d'attente" : <><Play size={18} /> Rejouer</>}</button>}<button className="secondary" onClick={leaveTable}><DoorOpen size={18} /> Quitter</button></div>
              </div>}
              {state.lastDiceByPlayer && <OtherPlayerRolls state={state} userId={user.id} />}
              {room.gameId === "belote" && <BeloteBoard state={state} user={user} onAction={action} />}

              {!state.finished && room.gameId === "yahtzee" && <div className={isMyTurn ? "yahtzee-controls" : "yahtzee-controls spectator-turn"}>
                <DiceSelectionMode selectToKeep={selectDiceToKeep} onChange={changeDiceSelectionMode} />
                <div className="yahtzee-roll-row"><DiceThrowTray label="Piste de Yahtzee" caption={isMyTurn ? "Tes dés" : `Lancer de ${current?.pseudo ?? "la table"}`}>{[0, 1, 2, 3, 4].map((i) => { const selected = isMyTurn ? selectedDice.includes(i) : state.kept?.includes(i); const keepIndexes = isMyTurn ? keepIndexesForDice(state.dice) : state.kept ?? []; return <Die key={`${i}-${state.rollsLeft}-${state.dice[i] ?? "empty"}`} value={state.dice[i]} kept={selected} selectionLabel={isMyTurn ? (selectDiceToKeep ? "Gardé" : "À relancer") : "Gardé"} animate={!state.dice[i] || !keepIndexes.includes(i)} skin={activeDiceSkin} onClick={isMyTurn ? () => setSelectedDice((list) => list.includes(i) ? list.filter((x) => x !== i) : [...list, i]) : undefined} />; })}</DiceThrowTray>{isMyTurn && <button data-request-feedback="state" aria-busy={diceRollLocked} className={`yahtzee-roll-button ${diceRollLocked ? "roll-cooldown" : ""}`} disabled={diceRollLocked || state.rollsLeft <= 0 || (state.dice.length > 0 && keepIndexesForDice(state.dice).length >= state.dice.length)} onClick={() => action({ type: "roll", keepIndexes: keepIndexesForDice(state.dice) })}>Lancer <small>{state.rollsLeft}/{state.modifiers?.rollsPerTurn ?? 3}</small></button>}</div>
                <div className={isMyTurn ? "category-context" : "category-context spectator-context"}><span>{isMyTurn ? "Ta feuille de score" : "Feuille observée"}</span><strong><DisplayName user={current} /></strong>{!isMyTurn && <small>Les choix sont synchronisés avec ce joueur.</small>}</div>
                <div className={`yahtzee-category-groups ${!isMyTurn ? "spectator-categories" : ""}`}>{[["Valeurs supérieures", scoreCategories.slice(0, 6)], ["Combinaisons inférieures", scoreCategories.slice(6, 12)], ["Chance", scoreCategories.slice(12)]].map(([groupLabel, categories]) => <section className="yahtzee-category-row" key={groupLabel}><strong>{groupLabel}</strong><div className="category-grid">{categories.map(renderYahtzeeCategory)}</div></section>)}</div>
              </div>}

              {!state.finished && room.gameId === "421" && <>
                <DiceSelectionMode selectToKeep={selectDiceToKeep} onChange={changeDiceSelectionMode} />
                <DiceThrowTray label="Piste du 421" caption={isMyTurn ? "Construis ta combinaison" : `Lancer de ${current?.pseudo ?? "la table"}`}>{[0, 1, 2].map((i) => <Die key={`${i}-${state.rollsLeft}-${state.dice[i] ?? "empty"}`} value={state.dice[i]} kept={isMyTurn ? selectedDice.includes(i) : state.kept?.includes(i)} selectionLabel={isMyTurn ? (selectDiceToKeep ? "Gardé" : "À relancer") : "Gardé"} animate={!state.dice[i] || !(isMyTurn ? keepIndexesForDice(state.dice) : state.kept ?? []).includes(i)} skin={activeDiceSkin} onClick={isMyTurn ? () => setSelectedDice((list) => list.includes(i) ? list.filter((x) => x !== i) : [...list, i]) : undefined} />)}</DiceThrowTray>
                <section className="four-twenty-one-combo" aria-live="polite"><span>Combinaison en cours</span><strong>{state.currentCombination?.label ?? "Lance les dés"}</strong><small>{state.dice?.length === 3 ? [...state.dice].sort((a, b) => b - a).join(" · ") : "Les combinaisons fortes sont prioritaires sur les points."}</small></section>
                <div className="actions four-twenty-one-actions"><button data-request-feedback="state" aria-busy={diceRollLocked} className={diceRollLocked ? "roll-cooldown" : ""} disabled={diceRollLocked || !isMyTurn || state.rollsLeft <= 0 || (state.dice.length > 0 && keepIndexesForDice(state.dice).length >= state.dice.length)} onClick={() => action({ type: "roll", keepIndexes: keepIndexesForDice(state.dice) })}>Lancer ({state.rollsLeft}/{state.modifiers?.rollsPerTurn ?? 3})</button>{isMyTurn && state.dice.length === 3 && state.rollsLeft === 0 && state.modifiers?.paidRerollsEnabled && paid421Used < (state.modifiers?.paidRerollsPerTurn ?? 2) && <button className="secondary paid-reroll-button" disabled={Number(user.tokens) < paid421Price} onClick={() => action({ type: "buy-reroll" })}><Coins size={17} /> Acheter une relance · <CompactNumber value={paid421Price} label="Prix exact" /></button>}<button disabled={!isMyTurn || state.dice.length !== 3} onClick={() => action({ type: "bank" })}>Valider</button></div>
              </>}

              {!state.finished && room.gameId === "cul-de-chouette" && <div className={isMyTurn ? "cul-controls" : "cul-controls inactive-turn"}>
                <DiceSelectionMode selectToKeep={selectDiceToKeep} onChange={changeDiceSelectionMode} />
                <DiceThrowTray label="Piste du Cul de Chouette" caption={isMyTurn ? "Compose ta figure" : `Lancer de ${current?.pseudo ?? "la table"}`}>{(state.dice?.length ? state.dice : [null, null, null]).map((d, i) => <Die key={`${i}-${state.rollsLeft ?? state.modifiers?.rollsPerTurn ?? 3}-${d ?? "empty"}`} value={d} kept={isMyTurn ? selectedDice.includes(i) : state.kept?.includes(i)} selectionLabel={isMyTurn ? (selectDiceToKeep ? "Gardé" : "À relancer") : "Gardé"} animate={!d || !(isMyTurn ? keepIndexesForDice(state.dice) : state.kept ?? []).includes(i)} skin={activeDiceSkin} onClick={isMyTurn && (state.rollsLeft ?? state.modifiers?.rollsPerTurn ?? 3) > 0 && d ? () => setSelectedDice((list) => list.includes(i) ? list.filter((index) => index !== i) : [...list, i]) : undefined} />)}</DiceThrowTray>
                <p className="dice-selection-help">{selectDiceToKeep ? "Les dés sélectionnés restent en place; les autres seront relancés." : "Les dés sélectionnés seront relancés; les autres restent en place."}</p>
                <div className="actions"><button data-request-feedback="state" aria-busy={diceRollLocked} className={diceRollLocked ? "roll-cooldown" : ""} disabled={diceRollLocked || !isMyTurn || (state.rollsLeft ?? state.modifiers?.rollsPerTurn ?? 3) <= 0 || (state.dice.length > 0 && keepIndexesForDice(state.dice).length >= state.dice.length)} onClick={() => action({ type: "roll", keepIndexes: keepIndexesForDice(state.dice) })}>Lancer <small>{state.rollsLeft ?? state.modifiers?.rollsPerTurn ?? 3}/{state.modifiers?.rollsPerTurn ?? 3}</small></button><button disabled={!isMyTurn || state.dice?.length !== 3} onClick={() => action({ type: "bank" })}>Valider la combinaison</button></div>
                {state.lastRoll && <p className="result-line">{playerName(state.players, state.lastRoll.playerId)}: {state.lastRoll.label} · {state.lastRoll.pending ? "aperçu" : `+${state.lastRoll.points}`}</p>}
              </div>}

              {!state.finished && room.gameId === "farkle" && <FarkleBoard state={state} user={user} onAction={action} rollLocked={diceRollLocked} />}

              {!state.finished && room.gameId === "liars-dice" && <LiarsDiceBoard state={state} user={user} onAction={action} />}

              {!state.finished && room.gameId === "shut-the-box" && <ShutTheBoxBoard state={state} user={user} onAction={action} rollLocked={diceRollLocked} />}

              {!state.finished && room.gameId === "midnight-dice" && <MidnightDiceBoard state={state} user={user} onAction={action} />}

              {!state.finished && room.gameId === "velvet-ruse" && <VelvetRuseBoard state={state} user={user} onAction={action} />}

              {room.gameId === "blackjack" && <>
        <div className="blackjack-layout card-game-arena blackjack-arena">
                  <div className="side-score blackjack-score-dock"><span className="eyebrow">Tableau</span><h3>Scores des mains</h3><BlackjackScoresTable state={state} userId={user.id} /></div>
                  <div className="blackjack-table">
                    <div className="dealer-zone card-game-seat opponent-seat"><header><span>Croupier</span><strong>{state.dealer?.length ? `${blackjackDealerDisplay(state).score} point${blackjackDealerDisplay(state).score > 1 ? "s" : ""}` : "Attend les mises"}</strong></header><AnimatedDealerHand state={state} skin={cardSkin} onRevealComplete={() => setBlackjackRevealDone(true)} /></div>
                    <div className="blackjack-table-axis"><span>TABLE</span><i /><strong>21</strong><i /></div>
                    <div className={`hand-zone card-game-seat self-seat ${hasBlackjackBet && !blackjackHandDone ? "active" : ""}`}><header><span>Ta main</span><strong>{myHand.length ? `${blackjackTotal(myHand)} points` : "Place ta mise"}</strong></header><div className="card-row">{myHand.map((card, i) => <PlayingCard key={i} card={card} skin={cardSkin} />)}</div></div>
                    <div className="other-blackjack-hands">{state.players.filter((player) => player.id !== user.id && !player.isBot && state.hands[player.id]).map((player) => { const shown = state.shownPlayerIds?.includes(player.id); return <section key={player.id}><h4><DisplayName user={player} /> {state.foldedPlayerIds?.includes(player.id) ? "· Couché" : ""}</h4><div className="card-row">{state.hands[player.id].map((card, index) => <PlayingCard key={index} card={shown ? card : null} hidden={!shown} skin={player.cosmetics?.equipped?.cardSkin ?? cardSkin} />)}</div></section>; })}</div>
                    {!state.finished && <div className="blackjack-actions">{!hasBlackjackBet ? <StepperBet value={bet} onChange={setBet} min={blackjackMinimumBet} max={Math.min(blackjackMaximumBet, Math.max(blackjackMinimumBet, Number(user.tokens) || 0))} label="Mise Blackjack" /> : <p className="result-line">Mise placée : <CompactNumber value={state.bets[user.id]} suffix=" jetons" label="Mise exacte" /></p>}<div className="actions">{!hasBlackjackBet && <button disabled={Number(user.tokens) < blackjackMinimumBet} onClick={() => action({ type: "bet", amount: Math.min(blackjackMaximumBet, Math.max(bet, blackjackMinimumBet)) })}>Miser</button>}{hasBlackjackBet && allBlackjackBetsPlaced && !blackjackHandDone && <><button onClick={() => action({ type: "hit" })}>Piocher</button><button onClick={() => action({ type: "stand" })}>Rester</button>{myHand.length === 2 && blackjackTotal(myHand) !== 21 && <button className="secondary" disabled={!canDoubleBlackjack} title={canDoubleBlackjack ? "Une seule carte sera distribuée" : "Solde insuffisant pour doubler"} onClick={() => action({ type: "double" })}>Doubler · <CompactNumber value={state.bets[user.id]} label="Mise supplémentaire exacte" /></button>}<button className="danger-button" onClick={() => action({ type: "fold" })}>Se coucher</button></>}{hasBlackjackBet && !allBlackjackBetsPlaced && <span className="action-hint">En attente des autres mises.</span>}{blackjackHandDone && <span className="action-hint">Main terminée. En attente des autres joueurs.</span>}</div></div>}
                    {!state.finished && hasBlackjackBet && !blackjackHandShown && <button className="secondary show-hand-button" onClick={() => action({ type: "show" })}><Eye size={17} /> Montrer ma main</button>}
                  </div>
                </div>
              </>}

              {room.gameId === "texas-holdem" && <div className="poker-table card-game-arena poker-arena">
                <div className="poker-play-area">
                <div className="poker-pot"><span>{state.nextHandAt ? "Nouvelle main…" : ({ preflop: "Préflop", flop: "Flop", turn: "Turn", river: "River" })[state.street] ?? "Abattage"}</span><strong>Pot · <CompactNumber value={state.pot} label="Pot exact" /></strong><small>Blindes <CompactNumber value={state.smallBlind} />/<CompactNumber value={state.bigBlind} /> · plafond <CompactNumber value={state.maximumBet} /></small>{!room.ranked && <PokerTurnTimer deadline={state.turnDeadline}/>}</div>
                <PokerResolutionTimer nextHandAt={state.nextHandAt} resolutionStartedAt={state.resolutionStartedAt} showdown={state.showdown} />
                <section className="poker-center-stage"><span className="eyebrow">Cartes communes</span><div className="community-cards">{[0, 1, 2, 3, 4].map((index) => <PlayingCard key={`${index}-${state.community[index]?.rank ?? "empty"}`} card={state.community[index]} hidden={!state.community[index]} skin={cardSkin} />)}</div><div className="poker-table-mark"><i /> KTGA.ME <i /></div></section>
                {state.handPreview && <div className="poker-hand-potential" aria-live="polite"><span>Score potentiel</span><strong>{state.handPreview.label}</strong>{state.handPreview.draws?.length ? <small>{state.handPreview.draws.join(" · ")}</small> : <small>Meilleure combinaison actuelle</small>}</div>}
                <div className="poker-seats">{state.players.map((player, index) => { const isSelf = player.id === user.id; const shown = state.shownPlayerIds?.includes(player.id); const reveal = isSelf || shown; const rank = state.handRanks?.[player.id]; const winner = state.lastHandWinners?.includes(player.id) && Boolean(state.nextHandAt || state.finished); return <section className={`poker-seat ${index === state.currentPlayerIndex && !state.finished ? "active" : ""} ${state.foldedPlayerIds.includes(player.id) ? "folded" : ""} ${winner ? "winner" : ""}`} key={player.id}><header className="poker-seat-header"><h3>{index === state.dealerIndex ? <span className="dealer-button">D</span> : null}<DisplayName user={player} /></h3>{winner && <div className="poker-winner-badge"><Trophy size={16} /> Gagnant de la main</div>}</header><div className="card-row">{(state.hands[player.id] ?? []).map((card, cardIndex) => <PlayingCard key={cardIndex} card={reveal ? card : null} hidden={!reveal} skin={player.cosmetics?.equipped?.cardSkin ?? cardSkin} />)}</div><div className="poker-seat-details"><small><CompactNumber value={state.stacks[player.id] ?? 0} label="Tapis exact" /> · mise <CompactNumber value={state.streetBets[player.id] ?? 0} label="Mise exacte" />{state.allInPlayerIds.includes(player.id) ? " · TAPIS" : ""}</small>{rank && (isSelf || shown || state.nextHandAt) ? <strong>{isSelf && state.handPreview && !state.nextHandAt ? state.handPreview.label : state.handLabels?.[player.id] ?? pokerHandNames[rank[0]]}</strong> : null}</div></section>; })}</div>
                {(state.nextHandAt || state.showdown || state.finished) && (state.hands?.[user.id]?.length ?? 0) > 0 && !state.shownPlayerIds?.includes(user.id) && <button className="secondary poker-show-hand" onClick={() => action({ type: "show" })}><Eye size={17} /> Montrer ma main et mon score</button>}
                </div>
                <div className="poker-control-dock">
                {!state.finished && !state.nextHandAt && <PokerAutoAction enabled={pokerAutoEnabled} isMyTurn={isMyTurn} turnStartedAt={state.turnStartedAt} enabledAt={state.autoCheckFoldEnabledAt?.[user.id]} onToggle={() => action({ type: "auto-check-fold", enabled: !pokerAutoEnabled })} />}
                <PokerAllInNotice state={state} userId={user.id} expected={isPlayerActionExpected} onAction={action} />
                {!state.finished && isMyTurn && <div className="poker-actions"><div className="actions"><button onClick={() => action({ type: pokerToCall ? "call" : "check" })}>{pokerToCall ? <>Suivre <CompactNumber value={Math.min(pokerToCall, state.stacks[user.id])} label="Somme exacte à suivre" /></> : "Parole"}</button><button className="danger-button" onClick={() => action({ type: "fold" })}>Se coucher</button><button className="secondary" disabled={(state.streetBets?.[user.id] ?? 0) + (state.stacks?.[user.id] ?? 0) > state.maximumBet} title={(state.streetBets?.[user.id] ?? 0) + (state.stacks?.[user.id] ?? 0) > state.maximumBet ? "Le tapis dépasse la mise maximale de la table" : "Engager tout le tapis"} onClick={() => action({ type: "all-in" })}>Tapis <CompactNumber value={state.stacks[user.id]} label="Tapis exact" /></button></div><div className="poker-raise"><div className="poker-presets"><button className="secondary" disabled={pokerMaximumRaise < pokerMinimumRaise} onClick={() => setPokerRaise(Math.min(pokerMaximumRaise, state.currentBet + Math.max(state.minRaise, Math.floor(state.pot / 2))))}>½ pot</button><button className="secondary" disabled={pokerMaximumRaise < pokerMinimumRaise} onClick={() => setPokerRaise(Math.min(pokerMaximumRaise, state.currentBet + Math.max(state.minRaise, state.pot)))}>Pot</button></div>{pokerMaximumRaise >= pokerMinimumRaise ? <StepperBet value={pokerRaise} onChange={setPokerRaise} min={pokerMinimumRaise} max={pokerMaximumRaise} label="Relancer à" /> : <span className="action-hint">Ton tapis ne permet pas une relance complète.</span>}<button disabled={pokerMaximumRaise < pokerMinimumRaise || pokerRaise < pokerMinimumRaise || pokerRaise > pokerMaximumRaise} onClick={() => action({ type: "raise", amount: pokerRaise })}>Relancer</button></div></div>}
                </div>
              </div>}

              {!state.finished && room.gameId === "bataille" && <BattleBoard state={state} user={user} onDraw={() => action({ type: "draw" })} onPlace={(laneId) => action({ type: "place", laneId })} />}

              {!state.finished && room.gameId === "president" && <section className="card-game-arena president-table">
                <div className="president-opponents">{state.players.filter((player) => player.id !== user.id && !state.finishedOrder?.includes(player.id)).map((player) => { const count = state.hands[player.id]?.length ?? 0; return <article className={current?.id === player.id ? "active" : ""} key={player.id}><div><DisplayName user={player} /><small>{count} carte{count > 1 ? "s" : ""}</small></div><div className="opponent-card-fan">{Array.from({ length: Math.min(3, count) }, (_, index) => <PlayingCard key={index} hidden skin={player.cosmetics?.equipped?.cardSkin ?? cardSkin} />)}</div></article>; })}</div>
                <div className="president-center-line"><div className="president-deck-stack"><PlayingCard hidden skin={cardSkin} /><span>{myHand.length + state.players.filter((player) => player.id !== user.id).reduce((sum, player) => sum + (state.hands[player.id]?.length ?? 0), 0)} en jeu</span></div><div className={`president-pile ${state.revolution ? "revolution" : ""}`}><span className="eyebrow">{state.revolution ? "Révolution active" : state.currentSet ? "Pli en cours" : "Nouvelle ouverture"}</span><div className="card-row">{state.currentSet ? (state.pile.at(-1)?.cards ?? []).map((card, index) => <PlayingCard key={`${cardIdentity(card)}-${index}`} card={card} skin={cardSkin} />) : <div className="empty-card-slot">Pose libre</div>}</div><strong>{state.currentSet ? `${state.currentSet.count} × ${state.currentSet.rank}` : "Toute combinaison autorisée"}</strong></div><div className="president-direction"><span>{state.revolution ? "Valeur décroissante" : "Valeur croissante"}</span><b>{state.revolution ? "2 → 3" : "3 → 2"}</b></div></div>
                <div className={`president-self-zone ${isMyTurn ? "active" : ""}`}><header><div><span className="eyebrow">Ta main</span><h3>{isMyTurn ? "Choisis précisément les cartes à poser" : `Au tour de ${current?.pseudo ?? "l'adversaire"}`}</h3></div><div className="president-requirement"><small>Combinaison requise</small><strong>{state.currentSet ? `${state.currentSet.count} carte${state.currentSet.count > 1 ? "s" : ""} · ${state.revolution ? "en dessous de" : "au-dessus de"} ${state.currentSet.rank}` : "Libre"}</strong></div></header><div className="president-card-hand">{presidentHand.map((card, index) => { const key = cardIdentity(card); const selected = selectedPresidentCards.includes(key); const rankAllowed = canPlayPresidentSet(state, card.rank, state.currentSet?.count ?? 1); const blockedBySelection = selectedPresidentHand.length > 0 && selectedPresidentHand[0].rank !== card.rank; const selectionFull = Boolean(presidentRequiredCount && selectedPresidentHand.length >= presidentRequiredCount && !selected); return <button type="button" key={key} className={`${selected ? "selected" : ""} ${!rankAllowed ? "unplayable" : ""}`} style={{ "--hand-index": index }} disabled={!isMyTurn || presidentActionBusy || !rankAllowed || blockedBySelection || selectionFull} aria-pressed={selected} onClick={() => setSelectedPresidentCards((cards) => cards.includes(key) ? cards.filter((entry) => entry !== key) : [...cards, key])}><PlayingCard card={card} skin={cardSkin} /><span>{selected ? "Sélectionnée" : suits[card.suit]?.name}</span></button>; })}</div><footer><div className="president-selection-summary"><strong>{selectedPresidentHand.length ? `${selectedPresidentHand.length} × ${selectedPresidentHand[0].rank}` : "Aucune carte sélectionnée"}</strong><small>{selectedPresidentHand.length ? selectedPresidentHand.map((card) => `${card.rank}${suits[card.suit]?.symbol}`).join(" · ") : "Clique directement les cartes et leur couleur."}</small></div><div className="actions"><button disabled={!isMyTurn || presidentActionBusy || !presidentSelectionPlayable} onClick={() => action({ type: "play", cards: selectedPresidentHand.map(({ rank, suit }) => ({ rank, suit })) })}>Jouer la sélection</button><button className="secondary" disabled={!isMyTurn || presidentActionBusy || !state.currentSet} onClick={() => action({ type: "pass" })}>Passer{presidentAutoPass.deadline && <> · <PacingCountdown endsAt={presidentAutoPass.deadline} /> s</>}</button></div></footer></div>
              </section>}

              {!state.finished && room.gameId === "golf-solitaire" && <section className="solo-card-table golf-card-table">
                <header className="solo-card-heading"><div><span className="eyebrow">Solitaire Golf</span><h3>Sept fairways à dégager</h3></div><div className="solo-card-stats"><span><strong>{state.tableau.reduce((sum, column) => sum + column.length, 0)}</strong> au tableau</span><span><strong>{state.stock.length}</strong> en pioche</span></div></header>
                <div className="golf-tableau" aria-label="Tableau de sept colonnes">{state.tableau.map((column, columnIndex) => <article className="golf-fairway" key={columnIndex}><small>Colonne {columnIndex + 1}</small><div className="golf-card-stack">{column.map((card, cardIndex) => { const top = cardIndex === column.length - 1; const playable = top && golfPlayable(card, state.waste, state.modifiers); return <button key={`${card.suit}-${card.rank}-${cardIndex}`} className={playable ? "playable-card" : ""} disabled={!playable} aria-label={playable ? `Jouer la carte de la colonne ${columnIndex + 1}` : undefined} onClick={() => action({ type: "play", column: columnIndex })}><PlayingCard card={card} skin={cardSkin} /></button>; })}{!column.length && <div className="empty-card-slot">Libre</div>}</div></article>)}</div>
                <div className="golf-draw-zone"><div className="card-station"><span>Pioche</span><button className="deck-action" onClick={() => action({ type: "draw" })} disabled={!state.stock.length}><PlayingCard hidden={state.stock.length > 0} skin={cardSkin} /><b>{state.stock.length ? `Piocher · ${state.stock.length}` : "Vide"}</b></button></div><div className="golf-direction">± 1{state.modifiers?.wrapRanks ? <small>Roi ↔ As actif</small> : <small>sans boucle Roi–As</small>}</div><div className="card-station active-waste"><span>Carte active</span><PlayingCard card={state.waste} skin={cardSkin} /></div></div>
              </section>}

              {!state.finished && room.gameId === "accordion" && <section className="solo-card-table accordion-card-table">
                <header className="solo-card-heading"><div><span className="eyebrow">Patience Accordion</span><h3>Compresse le ruban de cartes</h3></div><div className="solo-card-stats"><span><strong>{state.piles.length}</strong> piles restantes</span></div></header>
                <div className="accordion-guide"><span className="guide-source">1. Choisis une pile</span><span>→</span><span className="guide-target">2. Choisis une cible éclairée</span></div>
                <div className="accordion-line">{state.piles.map((pile, index) => {
                  const selected = accordionFrom === index;
                  const playableTarget = accordionFrom !== null && accordionPlayable(state.piles, accordionFrom, index, state.modifiers);
                  return <button key={`${index}-${pile.length}`} className={`${selected ? "selected" : ""} ${playableTarget ? "target" : ""}`} onClick={() => {
                    if (accordionFrom !== null && accordionPlayable(state.piles, accordionFrom, index, state.modifiers)) action({ type: "move", from: accordionFrom, to: index });
                    else setAccordionFrom(index);
                  }}><span className="accordion-index">{index + 1}</span><PlayingCard card={pile.at(-1)} skin={cardSkin} /><small>{pile.length} carte{pile.length > 1 ? "s" : ""}</small></button>;
                })}</div>
                <p className="accordion-help">Déplace sur une carte de même rang ou de même couleur, {state.modifiers?.allowOneApart !== false && state.modifiers?.allowThreeApart !== false ? "une ou trois piles" : state.modifiers?.allowOneApart !== false ? "une pile" : "trois piles"} plus à gauche.</p>
              </section>}
            </div>
          </section>}
        </section>
        <aside>
          {!state && <section className="card invite-card"><div className="invite-card-heading"><div><span className="eyebrow">Invitation</span><h2>Inviter des joueurs</h2></div><div className="room-invite-code"><small>Code de la table</small><strong>{room.code}</strong></div></div><button className="secondary room-invite-copy" onClick={copyInviteLink}>{inviteCopied ? <BadgeCheck size={17} /> : <Copy size={17} />} {inviteCopied ? "Invitation copiée !" : "Copier le lien d'invitation"}</button>{inviteMessage && <div className="success compact-message">{inviteMessage}</div>}{!user.guest ? <div className="player-network-list compact">{invitableFriends.map((friend) => <article key={friend.id} className="player-network-row"><DisplayName user={friend} /><button onClick={() => inviteFriend(friend.id)}>Inviter</button></article>)}{!invitableFriends.length && <div className="empty-state">Aucun ami disponible à inviter.</div>}</div> : <p className="muted-line">Partage le lien ou le code pour inviter d'autres joueurs.</p>}</section>}
          <WagerPanel room={room} state={state} />
          {state?.gameId === "yahtzee" && <section className="card"><h2>Scores</h2><ScorePanel state={state} userId={user.id} /></section>}
          {state?.gameId !== "yahtzee" && <section className="card"><h2>{state?.gameId === "blackjack" ? "Scores des mains" : "Scores"}</h2><ScorePanel state={state} userId={user.id} /></section>}
        </aside>
      </div>
      {scoreConfirmation && <ModalBackdrop className="modal-backdrop score-confirm-layer" onClick={() => setScoreConfirmation(null)}><div className={`modal score-confirm-modal ${scoreConfirmation.points === 0 ? "zero-score-confirm" : ""}`} onClick={(event) => event.stopPropagation()}><div className="score-confirm-icon">{scoreConfirmation.points === 0 ? <AlertTriangle /> : <CheckCircle2 />}</div><span className="eyebrow">Feuille de score</span><h2>{scoreConfirmation.points === 0 ? "Attention : score nul" : "Valider ce score ?"}</h2><p>{scoreConfirmation.points === 0 ? <>La case <strong>{scoreConfirmation.label}</strong> sera définitivement utilisée pour <strong>0 point</strong>. Cette action ne peut pas être annulée.</> : <>Inscrire <strong>+{scoreConfirmation.points} points</strong> dans la case <strong>{scoreConfirmation.label}</strong> ?</>}</p><div className="actions"><button className={scoreConfirmation.points === 0 ? "danger-button" : ""} onClick={() => { const choice = scoreConfirmation; setScoreConfirmation(null); action({ type: "score", category: choice.category }); }}>{scoreConfirmation.points === 0 ? "Valider malgré tout" : `Valider +${scoreConfirmation.points}`}</button><button className="secondary" onClick={() => setScoreConfirmation(null)}>Annuler</button></div></div></ModalBackdrop>}
      {roomSettingsOpen && !state && <ModalBackdrop className="modal-backdrop" onClick={cancelRoomSettings}><div className="modal room-settings-modal" onClick={(event) => event.stopPropagation()}><div className="modal-title-row"><div><span className="eyebrow">Salle d’attente</span><h2><Settings size={22} /> Paramètres de la table</h2><p>{isOwner ? "Configure les variantes avant de lancer la partie." : "Réglages choisis par le maître de table."}</p></div><button className="secondary icon-toggle" onClick={cancelRoomSettings} aria-label="Fermer"><X size={18} /></button></div><div className="room-settings-modal-body">
        {room.gameId === "texas-holdem" && <section className="poker-settings game-modifiers-panel"><BetLimitsEditor poker disabled={!isOwner} minimum={Number(pokerBlinds.bigBlind) || 2} maximum={Number(pokerBlinds.maximumBet) || room.stake} onChange={({ minimum, maximum }) => isOwner && setPokerBlinds({ bigBlind: minimum, maximumBet: maximum })} /><div className="blind-ratio" aria-live="polite"><span>Petite blinde<strong>{Math.floor((Number(pokerBlinds.bigBlind) || 2) / 2)}</strong></span><b>½</b><span>Grosse blinde<strong>{Number(pokerBlinds.bigBlind) || 2}</strong></span><span>Plafond<strong>{Number(pokerBlinds.maximumBet) || room.stake}</strong></span></div></section>}
        {room.gameId === "blackjack" && <BetLimitsEditor disabled={!isOwner} minimum={Number(gameModifiers.minimumBet) || 50} maximum={Number(gameModifiers.maximumBet) || 100} onChange={({ minimum, maximum }) => isOwner && setGameModifiers({ ...gameModifiers, minimumBet: minimum, maximumBet: maximum })} />}
        {room.gameId === "bataille" && <BattleModifiersPanel value={battleModifiers} isOwner={isOwner} onChange={setBattleModifiers} showFooter={false} />}
        <section className="game-modifiers-panel"><h3>Niveaux admis dans {gameTitle(room.gameId)}</h3><div className="settings-field-grid"><label>Niveau minimum<input aria-label="Niveau minimum de la table" disabled={!isOwner} type="number" min={1} max={1000} value={levelLimits.minLevel} onChange={(event) => setLevelLimits({ ...levelLimits, minLevel: event.target.value })} /></label><label>Niveau maximum<input aria-label="Niveau maximum de la table" disabled={!isOwner} type="number" min={levelLimits.minLevel} max={1000} value={levelLimits.maxLevel} placeholder="Sans limite" onChange={(event) => setLevelLimits({ ...levelLimits, maxLevel: event.target.value })} /></label></div></section>
        <GameModifiersPanel gameId={room.gameId} value={gameModifiers} isOwner={isOwner} onChange={setGameModifiers} showFooter={false} />
      </div><div className="room-settings-modal-footer"><span><Swords size={16} /> Ces paramètres seront verrouillés au lancement.</span><div className="actions">{isOwner && <button onClick={applyRoomSettings}><Save size={17} /> Appliquer les paramètres</button>}<button className="secondary" onClick={cancelRoomSettings}>{isOwner ? "Annuler" : "Fermer"}</button></div></div></div></ModalBackdrop>}
      {rulesOpen && <RulesModal gameId={room.gameId} onClose={() => setRulesOpen(false)} />}
      {pacing?.kind === "round-results" && pacing.id !== dismissedPacingId && <RoundResultsOverlay pacing={pacing} players={room.players} ranked={room.ranked} canSkip={isSeatedPlayer} isOwner={isOwner} onSkip={skipPacing} onDismiss={() => setDismissedPacingId(pacing.id)} />}
    </main>
  );
}
