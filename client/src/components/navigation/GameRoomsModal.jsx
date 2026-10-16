import { useLocale } from "../../locales/LocaleProvider.jsx";
import { softBanLimited } from "../../features/accounts/softban.js";
import { useId, useState } from "react";
import { DoorOpen, Eye, EyeOff, HelpCircle, LockKeyhole, Plus, Users } from "lucide-react";
import { Dialog } from "../common/Dialog.jsx";
import { PasswordField } from "../common/PasswordField.jsx";
import { StepperBet } from "../game/GameSupport.jsx";
import { JoinRoomDialog } from "./JoinRoomDialog.jsx";
import { CompactNumber } from "../../utils/presentation.jsx";
import { defaultPublicSettings } from "../../config/site.js";
import "./game-rooms.css";
import { RankBadge, RankedQueue, rankedGames } from "../../features/games/RankedPlay.jsx";

export function GameRoomsModal({ game, rooms, user, initialTab = "create", initialMode = "classic", stake, setStake, isPublic, setIsPublic, roomName, setRoomName, roomPassword, setRoomPassword, onCreate, onOpenRoom, onEnterRoom, onRules, onClose, canJoin = true, settings = defaultPublicSettings, error = "", busy = false }) {
  const { t: localeText } = useLocale();
  const allowCreate = !(user.minor?.restrictions ?? []).includes("rooms") && !softBanLimited(user, "rooms:create");
  const allowObserve = !(user.minor?.restrictions ?? []).includes("rooms") && !softBanLimited(user, "rooms:spectate");
  const allowRanked = canJoin && !softBanLimited(user, "ranked");
  const [tab, setTab] = useState(allowCreate && (!canJoin && !allowObserve || initialTab === "create") ? "create" : "browse");
  const [mode,setMode]=useState(rankedGames.includes(game.id) && allowRanked ? initialMode : "classic");
  const [joinCode, setJoinCode] = useState(null);
  const [protectedTable, setProtectedTable] = useState(false);
  const [titleEditable, setTitleEditable] = useState(false);
  const [codeEditable, setCodeEditable] = useState(false);
  const [minLevel, setMinLevel] = useState(1), [maxLevel, setMaxLevel] = useState("");
  const playerLevel = user.gameProgression?.find((row) => row.gameId === game.id)?.level ?? 1;
  const invalidLevels = minLevel < 1 || maxLevel !== "" && (Number(maxLevel) < minLevel || Number(maxLevel) > 1000) || playerLevel < minLevel || maxLevel !== "" && playerLevel > Number(maxLevel);
  const id = useId().replaceAll(":", "");
  const minimumStake = Math.max(game.id === "texas-holdem" ? settings.minPokerBuyIn : settings.minRoomStake, Number(game.entryPot) || 0);
  const actualStake = Math.max(stake, minimumStake);
  const filteredRooms = rooms.filter((room) => room.gameId === game.id && room.isPublic !== false && !room.finished && !room.ranked && (room.inProgress ? allowObserve : canJoin));
  const displayName = user.profile?.displayName || user.pseudo;
  const defaultName = displayName.includes("@") ? game.name : `${game.name} de ${displayName}`;
  const insufficientTokens = actualStake > (Number(user.tokens) || 0);
  return <Dialog title={localeText(game.name)} hideTitle={mode==="ranked"} className="game-table-dialog" onClose={onClose} dismissible={!busy}>
    {rankedGames.includes(game.id) && <div className="ranked-mode-tabs" role="group" aria-label={localeText("Mode de jeu")}><button type="button" className={mode==="classic"?"active":"secondary"} aria-pressed={mode==="classic"} onClick={()=>setMode("classic")}>{localeText("Classique")}</button><button type="button" className={mode==="ranked"?"active":"secondary"} aria-pressed={mode==="ranked"} disabled={!allowRanked} onClick={()=>setMode("ranked")}>{localeText("Classé")}</button></div>}
    {mode==="ranked" ? <RankedQueue game={game} user={user} onQueued={onClose}/> : <>
    <div className="game-table-toolbar">
      <div className="game-table-tabs" role="tablist" aria-label={localeText("Accéder à une table")}>
        {(canJoin || allowObserve) && <button type="button" role="tab" disabled={busy} id={`${id}-browse-tab`} aria-selected={tab === "browse"} aria-controls={`${id}-browse`} className={tab === "browse" ? "active" : ""} onClick={() => setTab("browse")}><DoorOpen size={18} />{localeText("Tables publiques") + " "}<span>{filteredRooms.length}</span></button>}
        <button type="button" role="tab" data-request-feedback="state" disabled={busy || !allowCreate} id={`${id}-create-tab`} aria-selected={tab === "create"} aria-controls={`${id}-create`} className={tab === "create" ? "active" : ""} onClick={() => setTab("create")}><Plus size={18} />{localeText("Créer une table")}</button>
      </div>
      {(canJoin || allowObserve) && <button type="button" disabled={busy} className="secondary game-table-code" onClick={() => setJoinCode("")}><DoorOpen size={16} />{localeText("J’ai un code")}</button>}
    </div>
    {tab === "browse" && <section className="game-table-body" id={`${id}-browse`} role="tabpanel" aria-labelledby={`${id}-browse-tab`}>
      <div className="game-table-section-title"><h3>{localeText("Rejoindre une table publique")}</h3><span>{filteredRooms.length}{" " + localeText("disponible")}{filteredRooms.length !== 1 ? localeText("s") : ""}</span></div>
      {filteredRooms.length ? <div className="game-table-list">{filteredRooms.map((room) => {
        const full = !room.inProgress && room.players.length >= game.maxPlayers;
        const seated = room.players.some((player) => player.id === user.id);
        const outsideLevels = !room.inProgress && !seated && (playerLevel < (room.minLevel ?? 1) || room.maxLevel != null && playerLevel > room.maxLevel);
        return <article className="game-table-entry" key={room.id}>
          <div className="game-table-entry-title"><strong>{room.name}</strong><small>{room.inProgress ? localeText("En cours") : localeText("En attente")}{" " + localeText("· Code") + " "}{room.code}{" " + localeText("· Niv.") + " "}{room.minLevel ?? 1}{room.maxLevel ? localeText(" à {value0}", { value0: room.maxLevel }) : "+"}{room.hasPassword && <><LockKeyhole size={13} />{localeText("Protégée")}</>}</small></div>
          <span className="game-table-occupancy"><Users size={16} />{room.players.length}/{game.maxPlayers}</span>
          <span className="game-table-stake">{room.ranked && room.gameId!=="texas-holdem" ? <RankBadge rank={room.ranked.roster?.find((player)=>player.rank)?.rank}/> : <CompactNumber value={room.stake} suffix={localeText(" jetons")} label={localeText("Mise exacte")} />}</span>
          <button type="button" title={outsideLevels ? localeText("Ton niveau dans ce jeu : {value0}", { value0: playerLevel }) : undefined} disabled={full && !seated || outsideLevels} onClick={() => onEnterRoom(room.code)}>{room.inProgress ? <Eye size={17} /> : <DoorOpen size={17} />}{seated ? localeText("Retrouver ma table") : outsideLevels ? localeText("Niveau requis") : full ? localeText("Complète") : localeText("Rejoindre")}</button>
        </article>;
      })}</div> : <div className="game-table-empty"><Users size={30} /><h3>{localeText("Aucune table publique pour le moment")}</h3><button type="button" disabled={!allowCreate} onClick={() => setTab("create")}><Plus size={17} />{localeText("Créer une table")}</button></div>}
    </section>}
    {tab === "create" && <form className="game-table-form" autoComplete="off" onSubmit={(event) => { event.preventDefault(); if (allowCreate && !invalidLevels) onCreate(game.id, { minLevel, maxLevel: maxLevel === "" ? null : Number(maxLevel) }); }}>
      <section className="game-table-body" id={`${id}-create`} role="tabpanel" aria-labelledby={`${id}-create-tab`}>
        <h3>{localeText("Nouvelle table")}</h3>
        <div className="game-table-settings">
          <fieldset disabled={busy}><legend>{localeText("Accès à la table")}</legend><div className="game-table-access" role="group" aria-label={localeText("Visibilité de la table")}><button type="button" aria-pressed={isPublic} className={isPublic ? "active" : "secondary"} onClick={() => setIsPublic(true)}><Eye size={17} />{localeText("Publique")}</button><button type="button" aria-pressed={!isPublic} className={!isPublic ? "active" : "secondary"} onClick={() => setIsPublic(false)}><EyeOff size={17} />{localeText("Privée")}</button></div></fieldset>
          <fieldset disabled={busy}><legend>{game.id === "texas-holdem" ? localeText("Cave") : localeText("Mise")}</legend><StepperBet value={actualStake} onChange={setStake} min={minimumStake} max={Math.max(minimumStake, Number(user.tokens) || 0)} label={game.id === "texas-holdem" ? localeText("Cave par joueur") : localeText("Mise par joueur")} /></fieldset>
          <fieldset disabled={busy}><legend>{localeText("Niveaux dans") + " "}{localeText(game.name)}{" " + localeText("· ton niveau :") + " "}{playerLevel}</legend><div className="settings-field-grid"><label>{localeText("Niveau minimum")}<input aria-label={localeText("Niveau minimum de la table")} type="number" min={1} max={1000} value={minLevel} onChange={(event) => setMinLevel(Number(event.target.value))} autoComplete="off" /></label><label>{localeText("Niveau maximum")}<input aria-label={localeText("Niveau maximum de la table")} type="number" min={minLevel} max={1000} value={maxLevel} onChange={(event) => setMaxLevel(event.target.value)} placeholder={localeText("Sans limite")} autoComplete="off" /></label></div></fieldset>
          <label htmlFor={`${id}-title`}>{localeText("Nom public (facultatif)")}<input id={`${id}-title`} name="table-title" autoComplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" spellCheck={false} maxLength={80} minLength={3} disabled={busy} readOnly={!titleEditable} onPointerDown={() => setTitleEditable(true)} onKeyDown={(event) => { if (event.key !== "Tab") setTitleEditable(true); }} value={roomName} onChange={(event) => setRoomName(event.target.value)} placeholder={defaultName} /></label>
          <label className="game-table-protection"><input type="checkbox" disabled={busy} checked={protectedTable} onChange={(event) => { setProtectedTable(event.target.checked); setRoomPassword(""); setCodeEditable(false); }} /><LockKeyhole size={17} />{localeText("Protéger par un code d’accès")}</label>
          {protectedTable && <PasswordField label={localeText("Code d’accès de la table")} name="table-access-code" required minLength={4} maxLength={128} disabled={busy} autoComplete="new-password" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" readOnly={!codeEditable} onPointerDown={() => setCodeEditable(true)} onKeyDown={(event) => { if (event.key !== "Tab") setCodeEditable(true); }} value={roomPassword} onChange={(event) => setRoomPassword(event.target.value)} />}
        </div>
      </section>
      <footer className="game-table-create-footer"><div><strong>{roomName.trim() || defaultName}</strong><small>{isPublic ? localeText("Publique") : localeText("Privée")}{protectedTable ? localeText(" · Protégée") : ""} · <CompactNumber value={actualStake} suffix={localeText(" jetons / joueur")} /></small></div>
        {error && <p className="error" role="alert">{localeText(error)}</p>}
        {insufficientTokens && <p className="error" role="alert">{localeText("Solde insuffisant pour cette mise.")}</p>}
        {invalidLevels && <p className="error" role="alert">{localeText("Choisis une plage valide qui inclut ton propre niveau (")}{playerLevel}).</p>}
        <button type="submit" data-request-feedback="state" disabled={!allowCreate || busy || insufficientTokens || invalidLevels || (protectedTable && roomPassword.length < 4)}><Plus size={18} />{busy ? localeText("Création…") : localeText("Créer la table")}</button>
      </footer>
    </form>}
    </>}
    <div className="game-table-bottom"><button type="button" className="secondary" onClick={() => onRules(game.id)}><HelpCircle size={16} />{localeText("Règles du jeu")}</button></div>
    {joinCode !== null && <JoinRoomDialog initialCode={joinCode} userId={user.id} onJoined={onOpenRoom} onClose={() => setJoinCode(null)} />}
  </Dialog>;
}
