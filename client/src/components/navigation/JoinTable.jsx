import { useEffect, useState } from "react";
import { DoorOpen, RefreshCw } from "lucide-react";
import { api } from "../../api.js";

export function JoinTable({ code, user, onJoined, onBack }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    let cancelled = false;
    async function join() {
      try {
        let room = await api(`/api/rooms/${encodeURIComponent(code)}`);
        if (!room.players?.some((player) => player.id === user.id)) room = await api(`/api/rooms/${encodeURIComponent(code)}/join`, { method: "POST" });
        if (!cancelled) onJoined(room.code, room.spectator);
      } catch (err) { if (!cancelled) { setError(err.message); setBusy(false); } }
    }
    join();
    return () => { cancelled = true; };
  }, [code, user.id, onJoined]);
  async function retry(event) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const room = await api(`/api/rooms/${encodeURIComponent(code)}/join`, { method: "POST", body: JSON.stringify({ password }) });
      onJoined(room.code, room.spectator);
    } catch (err) { setError(err.message); setBusy(false); }
  }
  return <main className="app-shell"><section className="join-table-panel"><h1>Table {code}</h1>{busy ? <p role="status"><RefreshCw size={18} className="spinning" /> Connexion à la table…</p> : <form onSubmit={retry}>{error && <p role="alert" className="error">{error}</p>}<label>Mot de passe de la table<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="off" placeholder="Si la table est protégée" /></label><div className="actions"><button type="submit"><DoorOpen size={18} /> Rejoindre</button><button type="button" className="secondary" onClick={onBack}>Retour au casino</button></div></form>}</section></main>;
}
