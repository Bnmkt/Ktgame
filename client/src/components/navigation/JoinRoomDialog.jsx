import { useState } from "react";
import { DoorOpen, LockKeyhole } from "lucide-react";
import { api } from "../../api.js";
import { Dialog } from "../common/Dialog.jsx";

export function JoinRoomDialog({ initialCode = "", userId, onJoined, onClose }) {
  const [code, setCode] = useState(initialCode);
  const [password, setPassword] = useState("");
  const [protectedRoom, setProtectedRoom] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function join(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      const normalized = code.trim().toUpperCase();
      const room = await api(`/api/rooms/${encodeURIComponent(normalized)}`);
      const alreadySeated = room.players?.some((player) => player.id === userId);
      setProtectedRoom(Boolean(room.hasPassword && !alreadySeated));
      if (room.hasPassword && !alreadySeated && !password) return;
      const joined = alreadySeated ? room : await api(`/api/rooms/${encodeURIComponent(normalized)}/join`, { method: "POST", body: JSON.stringify({ password }) });
      onJoined(joined.code, joined.spectator);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <Dialog title="Rejoindre avec un code" className="join-code-modal" dismissible={!busy} onClose={onClose}>
    <form onSubmit={join} autoComplete="off">
      <label>Code de la table<input name="table-reference" required autoComplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" maxLength={16} value={code} disabled={busy} placeholder="Ex. A1B2C3" onChange={(event) => { setCode(event.target.value.toUpperCase()); setPassword(""); setProtectedRoom(false); setError(""); }} /></label>
      {protectedRoom && <label><span><LockKeyhole size={16} /> Mot de passe de la table</span><input name="table-entry-code" autoFocus required type="password" autoComplete="new-password" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" value={password} disabled={busy} onChange={(event) => setPassword(event.target.value)} /></label>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions"><button type="button" className="secondary" disabled={busy} onClick={onClose}>Annuler</button><button type="submit" disabled={busy || !code.trim()}><DoorOpen size={17} />{busy ? "Connexion…" : "Rejoindre"}</button></div>
    </form>
  </Dialog>;
}
