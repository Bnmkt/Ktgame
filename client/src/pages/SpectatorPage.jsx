import { useCallback, useEffect, useState } from "react";
import { io } from "socket.io-client";
import { DoorOpen, Eye, HelpCircle, LockKeyhole, RefreshCw, Trophy } from "lucide-react";
import { api, getToken, SOCKET_PATH, SOCKET_URL } from "../api.js";
import { SpectatorBoard } from "../components/game/SpectatorBoard.jsx";
import { RulesModal } from "../components/game/GameSupport.jsx";
import { bugDiagnostics } from "../features/bugs/diagnostics.js";
import { useBugGameContext } from "../features/bugs/BugReportProvider.jsx";
import { DisplayName } from "../components/cosmetics/Cosmetics.jsx";
import { gameTitle } from "../features/games/config.js";
import "./spectator.css";

export function SpectatorPage({ code, user, onBack, onJoin }) {
  const [room, setRoom] = useState(null);
  useBugGameContext("spectator", code, room?.gameId, room?.activityMatchId);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [closed, setClosed] = useState(false);
  const [rules, setRules] = useState(false);
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
    const socket = io(SOCKET_URL, { path: SOCKET_PATH, withCredentials: true });
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
  return <main className="app-shell spectator-page"><header className="page-heading"><div><span className="eyebrow"><Eye size={16} /> Spectateur · {connected ? "En direct" : room ? "Connexion interrompue" : code}</span><h1>{room?.name ?? `Observer la table ${code}`}</h1></div></header><div className="room-table-tools"><button className="secondary" onClick={onBack}><DoorOpen size={18} />Quitter la vue</button>{room && <button className="secondary" onClick={() => setRules(true)}><HelpCircle size={18} />Règles</button>}{room && !room.state && !closed && <button onClick={onJoin}><DoorOpen size={18} />Rejoindre la table</button>}</div>
    {error && <p className="error" role="alert">{error}</p>}
    {!room && (busy ? <p role="status"><RefreshCw size={18} />Connexion…</p> : <form className="spectator-access" onSubmit={unlock}><label><LockKeyhole size={16} />Mot de passe de la table<input type="password" autoComplete="off" value={password} onChange={(event) => setPassword(event.target.value)} /></label><button disabled={busy}><DoorOpen size={18} />Rejoindre</button></form>)}
    {closed ? <h2>Cette table a été fermée.</h2> : room && <>{!room.state ? <section className="spectator-waiting"><h2>En salle d'attente</h2><div className="players">{room.players.map((player) => <DisplayName key={player.id} user={player} />)}</div></section> : <><section className="board"><div className="board-felt"><h2>{gameTitle(room.gameId)}</h2><div className="turn-line">{room.state.finished ? "Partie terminée" : room.state.players[room.state.currentPlayerIndex] ? <>Tour de <DisplayName user={room.state.players[room.state.currentPlayerIndex]} /></> : "Partie en cours"}</div>{room.state.finished && <div className="board-result"><Trophy size={20} /><span>Vainqueur : {room.state.winners.map((id) => room.state.players.find((player) => player.id === id)?.pseudo).filter(Boolean).join(", ") || "Aucun"}</span></div>}<SpectatorBoard state={room.state} user={user} /></div></section></>}</>}
    {rules && room && <RulesModal gameId={room.gameId} onClose={() => setRules(false)} />}
  </main>;
}
