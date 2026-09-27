import { useCallback, useEffect, useState } from "react";
import { Check, DoorOpen, Search, Send, UserPlus, Users, X } from "lucide-react";
import { api } from "../../api.js";
import { gameTitle } from "../../features/games/config.js";
import { DisplayName } from "../cosmetics/Cosmetics.jsx";
import { JoinRoomDialog } from "../navigation/JoinRoomDialog.jsx";
import { ConfirmActionButton } from "../common/ConfirmAction.jsx";
import { Dialog } from "../common/Dialog.jsx";

const emptyConnections = { friends: [], incoming: [], outgoing: [], roomInvites: [] };

export function FriendsModal({ user, roomCode, onClose, onOpenRoom }) {
  const [data, setData] = useState(emptyConnections);
  const [tab, setTab] = useState("friends");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [searchRevision, setSearchRevision] = useState(0);
  const [joinCode, setJoinCode] = useState("");

  const refresh = useCallback(async () => {
    if (user.guest) return;
    try {
      const payload = await api("/api/friends");
      setData(Object.fromEntries(Object.keys(emptyConnections).map((key) => [key, Array.isArray(payload[key]) ? payload[key].filter((row) => row?.id) : []])));
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [user.id, user.guest]);

  useEffect(() => {
    refresh();
    const onFocus = () => { if (document.visibilityState === "visible") refresh(); };
    const timer = setInterval(onFocus, 10000);
    window.addEventListener("focus", onFocus);
    window.addEventListener("ktga-connections-updated", refresh);
    return () => { clearInterval(timer); window.removeEventListener("focus", onFocus); window.removeEventListener("ktga-connections-updated", refresh); };
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    setResults([]);
    if (user.guest || search.trim().length < 2) return;
    const timer = setTimeout(async () => {
      try { const rows = await api(`/api/users/search?q=${encodeURIComponent(search.trim())}`); if (!cancelled) setResults(rows); }
      catch (err) { if (!cancelled) setError(err.message); }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [search, searchRevision, user.guest]);

  async function act(path, options = {}, success = "", openRoom = false) {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await api(path, options);
      await refresh();
      setSearchRevision((value) => value + 1);
      window.dispatchEvent(new Event("ktga-inbox-updated"));
      setMessage(success);
      if (openRoom) onOpenRoom(result.code, result.spectator);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  const friendAction = (id, action) => act(`/api/friends/${id}/${action}`, { method: "POST" });
  return <Dialog title="Amis" onClose={onClose} className="connections-modal">
    {user.guest ? <p>Connecte-toi avec un compte pour retrouver tes amis.</p> : <>
      <label className="connections-search"><Search size={18} /><span className="sr-only">Rechercher un joueur</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pseudo ou code ami" /></label>
      {error && <div className="error" role="alert">{error}</div>}{message && <div className="success" role="status">{message}</div>}
      {search.trim().length >= 2 ? <div className="player-network-list connections-results">{results.map((row) => <article className="player-network-row" key={row.id}><DisplayName user={row} /><div className="player-network-actions">{row.isFriend ? <span className="table-pill">Ami</span> : row.requested ? <span className="table-pill">En attente</span> : row.incoming ? <button disabled={busy} onClick={() => friendAction(row.id, "accept")}><Check size={16} /> Accepter</button> : <button disabled={busy} onClick={() => act("/api/friends/request", { method: "POST", body: JSON.stringify({ userId: row.id }) }, "Demande envoyée.")}><UserPlus size={16} /> Ajouter</button>}</div></article>)}{!results.length && <p className="empty-state">Aucun résultat pour cette recherche.</p>}</div> : <>
        <nav className="segmented-tabs connections-tabs" aria-label="Liste d’amis"><button className={tab === "friends" ? "active" : ""} onClick={() => setTab("friends")}><Users size={17} /> Amis <small>{data.friends.length}</small></button><button className={tab === "requests" ? "active" : ""} onClick={() => setTab("requests")}><UserPlus size={17} /> Demandes <small>{data.incoming.length}</small></button><button className={tab === "invites" ? "active" : ""} onClick={() => setTab("invites")}><DoorOpen size={17} /> Invitations <small>{data.roomInvites.length}</small></button></nav>
        <div className="connections-content">
          {loading ? <p role="status">Chargement…</p> : tab === "friends" ? <div className="player-network-list">{data.friends.map((friend) => <article className="player-network-row" key={friend.id}><DisplayName user={friend} /><div className="player-network-actions">{roomCode && <button disabled={busy} onClick={() => act(`/api/rooms/${roomCode}/invite`, { method: "POST", body: JSON.stringify({ friendId: friend.id }) }, "Invitation envoyée.")}><Send size={16} /> Inviter</button>}<button type="button" className={`secondary icon-toggle friend-join ${friend.activeRoom ? "available" : ""}`} title={friend.activeRoom ? `Rejoindre ${friend.pseudo} · ${friend.activeRoom.name}` : friend.inRoom ? "Table privée : invitation requise" : "Aucune table active"} aria-label={`Rejoindre ${friend.pseudo}`} disabled={busy || !friend.activeRoom} onClick={() => setJoinCode(friend.activeRoom.code)}><DoorOpen size={17} /></button><ConfirmActionButton className="danger-button icon-toggle" title="Retirer cet ami" aria-label={`Retirer ${friend.pseudo}`} disabled={busy} dialogTitle="Retirer cet ami ?" message={`Retirer ${friend.pseudo} de ta liste d’amis ?`} confirmLabel="Retirer" danger onConfirm={async () => { await api(`/api/friends/${friend.id}`, { method: "DELETE" }); await refresh(); window.dispatchEvent(new Event("ktga-inbox-updated")); }}><X size={16} /></ConfirmActionButton></div></article>)}{!data.friends.length && <p className="empty-state">Aucun ami pour le moment.</p>}</div> : tab === "requests" ? <>
            <h3>Demandes reçues</h3><div className="player-network-list">{data.incoming.map((friend) => <article className="player-network-row" key={friend.id}><DisplayName user={friend} /><div className="player-network-actions"><button disabled={busy} onClick={() => friendAction(friend.id, "accept")}><Check size={16} /> Accepter</button><button className="secondary" disabled={busy} onClick={() => friendAction(friend.id, "decline")}><X size={16} /> Refuser</button></div></article>)}{!data.incoming.length && <p className="empty-state">Aucune demande reçue.</p>}</div>
            {data.outgoing.length > 0 && <><h3>Demandes envoyées</h3><div className="player-network-list">{data.outgoing.map((friend) => <article className="player-network-row" key={friend.id}><DisplayName user={friend} /><span className="table-pill">En attente</span></article>)}</div></>}
          </> : <div className="player-network-list">{data.roomInvites.map((invite) => <article className="player-network-row" key={invite.id}><div><strong>{invite.roomName}</strong><small>{gameTitle(invite.gameId)} · {invite.code}</small></div><div className="player-network-actions"><button disabled={busy} onClick={() => act(`/api/room-invites/${invite.id}/accept`, { method: "POST" }, "", true)}><DoorOpen size={16} /> Rejoindre</button><button className="secondary" disabled={busy} onClick={() => act(`/api/room-invites/${invite.id}`, { method: "DELETE" })}><X size={16} /> Refuser</button></div></article>)}{!data.roomInvites.length && <p className="empty-state">Aucune invitation active.</p>}</div>}
        </div>
      </>}
    </>}
    {joinCode && <JoinRoomDialog initialCode={joinCode} userId={user.id} onJoined={onOpenRoom} onClose={() => setJoinCode("")} />}
  </Dialog>;
}
