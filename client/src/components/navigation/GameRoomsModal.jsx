import { useId, useState } from "react";
import { DoorOpen, Eye, EyeOff, HelpCircle, LockKeyhole, Plus, Users } from "lucide-react";
import { Dialog } from "../common/Dialog.jsx";
import { PasswordField } from "../common/PasswordField.jsx";
import { StepperBet } from "../game/GameSupport.jsx";
import { JoinRoomDialog } from "./JoinRoomDialog.jsx";
import { CompactNumber } from "../../utils/presentation.jsx";
import { defaultPublicSettings } from "../../config/site.js";
import "./game-rooms.css";

export function GameRoomsModal({ game, rooms, user, initialTab = "create", stake, setStake, isPublic, setIsPublic, roomName, setRoomName, roomPassword, setRoomPassword, onCreate, onOpenRoom, onEnterRoom, onRules, onClose, canJoin = true, settings = defaultPublicSettings, error = "", busy = false }) {
  const [tab, setTab] = useState(canJoin ? initialTab : "create");
  const [joinCode, setJoinCode] = useState(null);
  const [protectedTable, setProtectedTable] = useState(false);
  const [titleEditable, setTitleEditable] = useState(false);
  const [codeEditable, setCodeEditable] = useState(false);
  const id = useId().replaceAll(":", "");
  const minimumStake = Math.max(game.id === "texas-holdem" ? settings.minPokerBuyIn : settings.minRoomStake, Number(game.entryPot) || 0);
  const actualStake = Math.max(stake, minimumStake);
  const filteredRooms = rooms.filter((room) => room.gameId === game.id && room.isPublic !== false && !room.finished);
  const displayName = user.profile?.displayName || user.pseudo;
  const defaultName = displayName.includes("@") ? game.name : `${game.name} de ${displayName}`;
  const insufficientTokens = actualStake > (Number(user.tokens) || 0);
  return <Dialog title={game.name} className="game-table-dialog" onClose={onClose} dismissible={!busy}>
    <div className="game-table-toolbar">
      <div className="game-table-tabs" role="tablist" aria-label="Accéder à une table">
        {canJoin && <button type="button" role="tab" disabled={busy} id={`${id}-browse-tab`} aria-selected={tab === "browse"} aria-controls={`${id}-browse`} className={tab === "browse" ? "active" : ""} onClick={() => setTab("browse")}><DoorOpen size={18} />Tables publiques <span>{filteredRooms.length}</span></button>}
        <button type="button" role="tab" data-request-feedback="state" disabled={busy} id={`${id}-create-tab`} aria-selected={tab === "create"} aria-controls={`${id}-create`} className={tab === "create" ? "active" : ""} onClick={() => setTab("create")}><Plus size={18} />Créer une table</button>
      </div>
      {canJoin && <button type="button" disabled={busy} className="secondary game-table-code" onClick={() => setJoinCode("")}><DoorOpen size={16} />J’ai un code</button>}
    </div>
    {tab === "browse" && <section className="game-table-body" id={`${id}-browse`} role="tabpanel" aria-labelledby={`${id}-browse-tab`}>
      <div className="game-table-section-title"><h3>Rejoindre une table publique</h3><span>{filteredRooms.length} disponible{filteredRooms.length !== 1 ? "s" : ""}</span></div>
      {filteredRooms.length ? <div className="game-table-list">{filteredRooms.map((room) => {
        const full = !room.inProgress && room.players.length >= game.maxPlayers;
        const seated = room.players.some((player) => player.id === user.id);
        return <article className="game-table-entry" key={room.id}>
          <div className="game-table-entry-title"><strong>{room.name}</strong><small>{room.inProgress ? "En cours" : "En attente"} · Code {room.code}{room.hasPassword && <><LockKeyhole size={13} />Protégée</>}</small></div>
          <span className="game-table-occupancy"><Users size={16} />{room.players.length}/{game.maxPlayers}</span>
          <span className="game-table-stake"><CompactNumber value={room.stake} suffix=" jetons" label="Mise exacte" /></span>
          <button type="button" disabled={full && !seated} onClick={() => onEnterRoom(room.code)}>{room.inProgress ? <Eye size={17} /> : <DoorOpen size={17} />}{seated ? "Retrouver ma table" : full ? "Complète" : "Rejoindre"}</button>
        </article>;
      })}</div> : <div className="game-table-empty"><Users size={30} /><h3>Aucune table publique pour le moment</h3><button type="button" onClick={() => setTab("create")}><Plus size={17} />Créer une table</button></div>}
    </section>}
    {tab === "create" && <form className="game-table-form" autoComplete="off" onSubmit={(event) => { event.preventDefault(); onCreate(game.id); }}>
      <section className="game-table-body" id={`${id}-create`} role="tabpanel" aria-labelledby={`${id}-create-tab`}>
        <h3>Nouvelle table</h3>
        <div className="game-table-settings">
          <fieldset disabled={busy}><legend>Accès à la table</legend><div className="game-table-access" role="group" aria-label="Visibilité de la table"><button type="button" aria-pressed={isPublic} className={isPublic ? "active" : "secondary"} onClick={() => setIsPublic(true)}><Eye size={17} />Publique</button><button type="button" aria-pressed={!isPublic} className={!isPublic ? "active" : "secondary"} onClick={() => setIsPublic(false)}><EyeOff size={17} />Privée</button></div></fieldset>
          <fieldset disabled={busy}><legend>{game.id === "texas-holdem" ? "Cave" : "Mise"}</legend><StepperBet value={actualStake} onChange={setStake} min={minimumStake} max={Math.max(minimumStake, Number(user.tokens) || 0)} label={game.id === "texas-holdem" ? "Cave par joueur" : "Mise par joueur"} /></fieldset>
          <label htmlFor={`${id}-title`}>Nom public (facultatif)<input id={`${id}-title`} name="table-title" autoComplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" spellCheck={false} maxLength={80} minLength={3} disabled={busy} readOnly={!titleEditable} onPointerDown={() => setTitleEditable(true)} onKeyDown={(event) => { if (event.key !== "Tab") setTitleEditable(true); }} value={roomName} onChange={(event) => setRoomName(event.target.value)} placeholder={defaultName} /></label>
          <label className="game-table-protection"><input type="checkbox" disabled={busy} checked={protectedTable} onChange={(event) => { setProtectedTable(event.target.checked); setRoomPassword(""); setCodeEditable(false); }} /><LockKeyhole size={17} />Protéger par un code d’accès</label>
          {protectedTable && <PasswordField label="Code d’accès de la table" name="table-access-code" required minLength={4} maxLength={128} disabled={busy} autoComplete="new-password" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" readOnly={!codeEditable} onPointerDown={() => setCodeEditable(true)} onKeyDown={(event) => { if (event.key !== "Tab") setCodeEditable(true); }} value={roomPassword} onChange={(event) => setRoomPassword(event.target.value)} />}
        </div>
      </section>
      <footer className="game-table-create-footer"><div><strong>{roomName.trim() || defaultName}</strong><small>{isPublic ? "Publique" : "Privée"}{protectedTable ? " · Protégée" : ""} · <CompactNumber value={actualStake} suffix=" jetons / joueur" /></small></div>
        {error && <p className="error" role="alert">{error}</p>}
        {insufficientTokens && <p className="error" role="alert">Solde insuffisant pour cette mise.</p>}
        <button type="submit" data-request-feedback="state" disabled={busy || insufficientTokens || (protectedTable && roomPassword.length < 4)}><Plus size={18} />{busy ? "Création…" : "Créer la table"}</button>
      </footer>
    </form>}
    <div className="game-table-bottom"><button type="button" className="secondary" onClick={() => onRules(game.id)}><HelpCircle size={16} />Règles du jeu</button></div>
    {joinCode !== null && <JoinRoomDialog initialCode={joinCode} userId={user.id} onJoined={onOpenRoom} onClose={() => setJoinCode(null)} />}
  </Dialog>;
}
