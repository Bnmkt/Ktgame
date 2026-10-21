import { useCallback, useEffect, useState } from "react";
import { LockKeyhole, Radio, RefreshCw, Search, X } from "lucide-react";
import { api } from "../../api.js";
import { useLocale } from "../../locales/LocaleProvider.jsx";
import { ConfirmActionButton } from "../common/ConfirmAction.jsx";
import { usePagination } from "../common/usePagination.js";
import { Pagination } from "../feedback/Feedback.jsx";
import "./rooms-admin.css";

const statusLabels = { waiting: "En attente", playing: "En cours", finished: "Terminée" };

export function RoomsAdmin({ games, reportError, notifySuccess }) {
  const { t } = useLocale();
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [visibility, setVisibility] = useState("all");
  const [status, setStatus] = useState("all");
  const [closing, setClosing] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try { setRooms(await api("/api/admin/rooms")); }
    catch (error) { reportError(error.message); }
    finally { setLoading(false); }
  }, [reportError]);
  useEffect(() => { load(); }, [load]);
  const query = search.trim().toLocaleLowerCase();
  const filtered = rooms.filter((room) => (visibility === "all" || room.isPublic === (visibility === "public"))
    && (status === "all" || room.status === status)
    && (!query || [room.name, room.code, room.ownerName, games.find((game) => game.id === room.gameId)?.name, ...room.players.map((player) => player.pseudo)].some((value) => String(value ?? "").toLocaleLowerCase().includes(query))));
  const pagination = usePagination(filtered, `${search}:${visibility}:${status}`);
  async function close(room) {
    setClosing(room.id);
    try {
      await api(`/api/admin/rooms/${encodeURIComponent(room.code)}`, { method: "DELETE" });
      setRooms((current) => current.filter((entry) => entry.id !== room.id));
      notifySuccess(t("Table fermée."));
    } finally { setClosing(""); }
  }
  return <div className="room-management" ref={pagination.anchor}>
    <header className="admin-section-heading"><div><span className="eyebrow">{t("Supervision")}</span><h2>{t("Toutes les tables")}</h2><p>{t("Tables publiques et privées, y compris les parties en cours.")}</p></div><button type="button" className="secondary" onClick={load} disabled={loading}><RefreshCw size={17} className={loading ? "spinning" : ""}/>{t("Actualiser")}</button></header>
    <div className="room-management-filters">
      <label className="room-management-search"><Search size={17}/><input aria-label={t("Rechercher une table")} placeholder={t("Table, code ou joueur…")} value={search} onChange={(event) => setSearch(event.target.value)}/></label>
      <label>{t("Visibilité")}<select aria-label={t("Visibilité")} value={visibility} onChange={(event) => setVisibility(event.target.value)}><option value="all">{t("Toutes")}</option><option value="public">{t("Publiques")}</option><option value="private">{t("Privées")}</option></select></label>
      <label>{t("Statut")}<select aria-label={t("Statut")} value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">{t("Tous")}</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label>
    </div>
    {loading && <p role="status">{t("Chargement…")}</p>}
    <div className="room-management-list">{pagination.rows.map((room) => <article key={room.id}>
      <div className="room-management-details"><div className="room-management-title"><h3>{room.name}</h3><span className="status-badge">{t(statusLabels[room.status])}</span></div><p>{games.find((game) => game.id === room.gameId)?.name ?? room.gameId} · <strong>{room.code}</strong> · {room.ownerName}</p><div className="room-management-tags"><span>{room.isPublic ? <Radio size={14}/> : <LockKeyhole size={14}/>} {t(room.isPublic ? "Publique" : "Privée")}</span>{room.protected && <span>{t("Mot de passe")}</span>}<span>{t(room.ranked ? "Classé" : "Classique")}</span><span>{room.players.length} {t("joueur(s)")}</span></div><p className="room-management-players">{room.players.map((player) => `${player.pseudo}${player.isBot ? " (IA)" : ""}`).join(" · ")}</p></div>
      <ConfirmActionButton className="danger-button" disabled={Boolean(closing)} dialogTitle={t("Fermer la table")} message={t("Fermer « {name} » ? Tous les participants seront déconnectés de cette table.", { name: room.name }) + (room.ranked && room.status === "playing" ? ` ${t("La partie classée sera annulée sans modifier les classements.")}` : "")} confirmLabel={t("Fermer la table")} danger onConfirm={() => close(room)}><X size={17}/>{t("Fermer")}</ConfirmActionButton>
    </article>)}</div>
    {!loading && !filtered.length && <div className="empty-state">{t("Aucune table à afficher.")}</div>}
    <Pagination {...pagination}/>
  </div>;
}
