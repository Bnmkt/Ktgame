import { useLocale } from "../locales/LocaleProvider.jsx";
import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { DoorOpen, Eye, HelpCircle, LockKeyhole, RefreshCw, Trophy } from "lucide-react";
import { api, getToken, SOCKET_PATH, SOCKET_URL } from "../api.js";
import { SpectatorBoard } from "../components/game/SpectatorBoard.jsx";
import { RulesModal } from "../components/game/GameSupport.jsx";
import { bugDiagnostics } from "../features/bugs/diagnostics.js";
import { useBugGameContext } from "../features/bugs/BugReportProvider.jsx";
import { DisplayName } from "../components/cosmetics/Cosmetics.jsx";
import { gameTitle } from "../features/games/config.js";
import { RankedTurnTimer } from "../features/games/RankedPlay.jsx";
import "./spectator.css";

export function SpectatorPage({ code, user, onBack, onJoin }) {
  const { t: localeText } = useLocale();
  const [room, setRoom] = useState(null);
  useBugGameContext("spectator", code, room?.gameId, room?.activityMatchId);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [closed, setClosed] = useState(false);
  const [rules, setRules] = useState(false);
  const [autoJoin, setAutoJoin] = useState(() => {
    try { return localStorage.getItem(`ktga-table-auto-entry:${user.id}`) !== "off"; } catch { return true; }
  });
  const joinAttempt = useRef("");
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const joinTable = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const next = await api(`/api/rooms/${encodeURIComponent(code)}/join`, { method: "POST", body: JSON.stringify({ password }) });
      if (mounted.current && !next.spectator) onJoin(next.code, false);
    } catch (err) { if (mounted.current) setError(err.message); }
    finally { if (mounted.current) setBusy(false); }
  }, [code, password, onJoin]);
  const canJoin = room && !room.ranked && (!room.state || room.finished && room.state.finished);
  useEffect(() => {
    if (!autoJoin || !canJoin || busy || closed || room.players.length >= room.maxPlayers) return;
    const key = `${code}:${room.activityMatchId ?? "waiting"}:${Boolean(room.state)}:${room.players.map(player => player.id).join(",")}`;
    if (joinAttempt.current === key) return;
    joinAttempt.current = key;
    joinTable();
  }, [autoJoin, canJoin, busy, closed, room, code, joinTable]);
  function changeAutoJoin(checked) {
    setAutoJoin(checked); joinAttempt.current = "";
    try { localStorage.setItem(`ktga-table-auto-entry:${user.id}`, checked ? "on" : "off"); } catch { /* Keep the choice for this visit. */ }
  }
  const accept = useCallback((next) => { if (next.code === code && next.spectator) setRoom(next); }, [code]);
  useEffect(() => {
    let cancelled = false;
    setRoom(null); setError(""); setPassword(""); setClosed(false); setConnected(false);
    setBusy(true);
    api(`/api/rooms/${encodeURIComponent(code)}/spectate`, { method: "POST", body: "{}" }).then((next) => { if (!cancelled) accept(next); }).catch((err) => { if (!cancelled) setError(err.message); }).finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [code, accept]);
  useEffect(() => {
    if (!room?.id) return undefined;
    const socket = io(SOCKET_URL, { path: SOCKET_PATH, withCredentials: true, auth: { stream: "table" } });
    const disposeDiagnostics = bugDiagnostics.registerSocket(socket);
    socket.on("connect", () => { socket.emit("watch-room", { roomId: room.id, token: getToken(), spectator: true }); setConnected(true); });
    socket.on("disconnect", () => setConnected(false));
    socket.on("room", accept);
    socket.on("room-closed", () => { setClosed(true); setConnected(false); });
    socket.on("room-error", (payload) => { setError(payload.error); setConnected(false); setRoom(null); });
    return () => { disposeDiagnostics(); socket.disconnect(); };
  }, [room?.id, accept]);
  async function unlock(event) {
    event.preventDefault(); setBusy(true); setError("");
    try { accept(await api(`/api/rooms/${encodeURIComponent(code)}/spectate`, { method: "POST", body: JSON.stringify({ password }) })); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <main className="app-shell spectator-page"><header className="page-heading"><div><span className="eyebrow"><Eye size={16} />{" " + localeText("Spectateur ·") + " "}{connected ? localeText("En direct") : room ? localeText("Connexion interrompue") : code}</span><h1>{room?.name ?? localeText("Observer la table {value0}", { value0: code })}</h1></div></header><div className="room-table-tools"><button className="secondary" onClick={onBack}><DoorOpen size={18} />{localeText("Quitter la vue")}</button>{room && <button className="secondary" onClick={() => setRules(true)}><HelpCircle size={18} />{localeText("Règles")}</button>}{room && !closed && <label className="spectator-auto-entry" title={room.ranked ? localeText("Les parties classées se rejoignent depuis la file d'attente.") : undefined}><input type="checkbox" checked={autoJoin} disabled={Boolean(room.ranked)} onChange={event => changeAutoJoin(event.target.checked)}/><span>{localeText("Rejoindre automatiquement à la fin")}</span></label>}{canJoin && !closed && <button disabled={busy} onClick={joinTable}><DoorOpen size={18} />{localeText(busy ? "Connexion…" : "Rejoindre la table")}</button>}</div>
    {error && <p className="error" role="alert">{localeText(error)}</p>}
    {room?.ranked && room.state && !room.state.finished && !closed && <div className="ranked-match-heading"><strong>{localeText("Partie classée")}</strong><RankedTurnTimer turn={room.ranked.turn} paused={Boolean(room.pacing || room.state.nextHandAt)}/></div>}
    {!room && (busy ? <p role="status"><RefreshCw size={18} />{localeText("Connexion…")}</p> : <form className="spectator-access" onSubmit={unlock}><label><LockKeyhole size={16} />{localeText("Mot de passe de la table")}<input type="password" autoComplete="off" value={password} onChange={(event) => setPassword(event.target.value)} /></label><button disabled={busy}><DoorOpen size={18} />{localeText("Rejoindre")}</button></form>)}
    {closed ? <h2>{localeText("Cette table a été fermée.")}</h2> : room && <>{!room.state ? <section className="spectator-waiting"><h2>{localeText("En salle d'attente")}</h2><div className="players">{room.players.map((player) => <DisplayName key={player.id} user={player} />)}</div></section> : <><section className="board"><div className="board-felt"><h2>{localeText(gameTitle(room.gameId))}</h2><div className="turn-line">{room.state.finished ? localeText("Partie terminée") : room.state.players[room.state.currentPlayerIndex] ? <>{localeText("Tour de") + " "}<DisplayName user={room.state.players[room.state.currentPlayerIndex]} /></> : localeText("Partie en cours")}</div>{room.state.finished && <div className="board-result"><Trophy size={20} /><span>{localeText("Vainqueur :") + " "}{room.state.winners.map((id) => room.state.players.find((player) => player.id === id)?.pseudo).filter(Boolean).join(", ") || localeText("Aucun")}</span></div>}<SpectatorBoard state={room.state} user={user} /></div></section></>}</>}
    {rules && room && <RulesModal gameId={room.gameId} onClose={() => setRules(false)} />}
  </main>;
}
